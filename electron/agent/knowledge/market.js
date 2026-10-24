// 资源市场：GitCode 仓库做索引源，零自建后端
// - 索引：omnibuddy-market 仓库 index.json，经 GitCode OpenAPI raw 端点匿名拉取（主进程 net）
//   （raw.gitcode.com 域名对个人仓库返回「暂不支持预览」，统一走 api.gitcode.com）
// - 安装：下载 zip → 按索引 type 分流：
//     skill → skills.importZip 落 <agentDir>/skills/<name>/
//     agent → agents.importAgentZip 落 <agentDir>/agents/<itemId>/（专家集合包）
//     team  → teams.importTeamZip 团落 <agentDir>/teams/<itemId>.json，
//             成员专家落 <agentDir>/agents/teams-<itemId>/（专家团包）
//   两类管线均含 frontmatter / zip-slip 安全校验
// - 记录：market-installed.json 存已装项来源与版本，供「已安装」状态与更新对比
// - 429 防护：索引内存缓存（TTL）+ install 优先复用缓存，减少 raw 请求；限流时错误明确提示
const path = require('path')
const fs = require('fs')
const electron = require('electron')
const { ipcMain, net, shell } = electron
const skills = require('./skills')
const agents = require('./agents')
const teams = require('./teams')
const remote = require('../../../src/config/remote.cjs')

// ===== 初始化 =====
// 索引源（GitCode API raw 端点，匿名可读；仓库/分支维护于 src/config/remote.cjs）
const INDEX_URL = remote.rawUrl('market', 'index.json')

// 索引内存缓存（10 分钟 TTL：会话内重复打开市场 / install 二次取索引均复用）
const INDEX_TTL = 10 * 60 * 1000
let indexCache = null // { items, categories, at }

let baseDir = ''
let installedFile = ''

function init(dir) {
  baseDir = dir
  installedFile = path.join(dir, 'market-installed.json')
}

// ---------- 已装记录读写 ----------
function readInstalled() {
  try {
    const raw = fs.readFileSync(installedFile, 'utf-8')
    const data = JSON.parse(raw)
    return Array.isArray(data) ? data : []
  } catch (e) {
    return []
  }
}

function writeInstalled(list) {
  fs.mkdirSync(path.dirname(installedFile), { recursive: true })
  fs.writeFileSync(installedFile, JSON.stringify(list, null, 2), 'utf-8')
}

function readInstalledRec(id) {
  return readInstalled().find(r => r.id === id) || {}
}

// ---------- 通用下载（Buffer，供索引与 zip 共用） ----------
// 双模式分发：主进程内直接走 net（Chromium 网络栈 + 系统代理）；
// utilityProcess 桥接模式经 shim.__host.fetchBuffer 转发到主进程 net（错误文案一致）
// 429/5xx 抛出明确错误文案；调用方按需重试
function downloadBuffer(url, opts) {
  if (net) return downloadBufferViaNet(url, opts)
  return electron.__host.fetchBuffer(url, opts)
}

function downloadBufferViaNet(url, { timeout = 30000, maxSize = 50 * 1024 * 1024 } = {}) {
  return new Promise(resolve => {
    let settled = false
    const finish = data => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(data)
    }
    const req = net.request({ url, redirect: 'follow' })
    req.setHeader('User-Agent', 'OmniDeck-Market')
    const timer = setTimeout(() => {
      req.abort()
      finish({ ok: false, error: '下载超时' })
    }, timeout)

    let chunks = []
    let size = 0
    req.on('response', res => {
      if (res.statusCode === 429) {
        req.abort()
        finish({ ok: false, error: '触发 GitCode 访问限流（429），请稍后再试' })
        return
      }
      if (res.statusCode !== 200) {
        req.abort()
        finish({ ok: false, error: `下载失败（HTTP ${res.statusCode}）` })
        return
      }
      res.on('data', chunk => {
        chunks.push(chunk)
        size += chunk.length
        if (size > maxSize) {
          req.abort()
          finish({ ok: false, error: '文件超出大小限制' })
        }
      })
      res.on('end', () => finish({ ok: true, data: Buffer.concat(chunks) }))
      res.on('error', () => finish({ ok: false, error: '网络响应中断' }))
    })
    req.on('error', () => finish({ ok: false, error: '网络请求失败（检查网络/代理）' }))
    req.end()
  })
}

// ---------- 索引解析（v2 对象格式 { categories, items } + v1 数组格式兼容） ----------
// v2 条目字段：category（主题分类）、updatedAt、details、changelog
function parseIndex(rawText) {
  let data
  try {
    data = JSON.parse(rawText)
  } catch (e) {
    return { ok: false, error: '索引解析失败（index.json 格式错误）' }
  }

  let categories = []
  let list = data
  if (!Array.isArray(data)) {
    if (Array.isArray(data.categories)) {
      categories = data.categories.filter(c => c && c.value)
    }
    list = Array.isArray(data.items) ? data.items : null
  }
  if (!list) return { ok: false, error: '索引格式错误（应为数组或 { categories, items }）' }
  return { ok: true, categories, list }
}

// ---------- 索引拉取 + 已装状态合并（TTL 缓存） ----------
async function fetchIndex(useCache = true) {
  if (useCache && indexCache && Date.now() - indexCache.at < INDEX_TTL) {
    return decorate({ items: indexCache.items, categories: indexCache.categories })
  }
  const res = await downloadBuffer(INDEX_URL)
  if (!res.ok) return { ok: false, error: res.error }
  const parsed = parseIndex(res.data.toString('utf-8'))
  if (!parsed.ok) return { ok: false, error: parsed.error }
  const { categories, list } = parsed

  // 规范化后缓存
  const items = list.filter(it => it && it.id && it.name && it.url)
  indexCache = { items, categories, at: Date.now() }
  return decorate({ items, categories })
}

// 合并已装状态与更新标记（缓存命中与新鲜拉取共用）
// v4 索引新增运营字段全量透传：图标 base64 / 下载·收藏·评论统计 / AI 评分五维 / 认证与作者标识
function decorate({ items, categories }) {
  const installed = readInstalled()
  return {
    ok: true,
    categories,
    items: items.map(it => {
      const rec = installed.find(r => r.id === it.id)
      return {
        id: it.id,
        name: it.name,
        type: it.type || 'skill',
        category: it.category || '',
        version: it.version || '1.0.0',
        description: it.description || '',
        details: it.details || '',
        changelog: Array.isArray(it.changelog) ? it.changelog : [],
        author: it.author || '',
        authorHandle: it.authorHandle || '',
        namespace: it.namespace || '',
        tags: Array.isArray(it.tags) ? it.tags : [],
        homepage: it.homepage || '',
        updatedAt: it.updatedAt || '',
        url: it.url, // zip 直链（GitCode raw API）
        downloads: Number(it.downloads) || 0,
        favorites: Number(it.favorites) || 0,
        comments: Number(it.comments) || 0,
        aiScore: Number(it.aiScore) || 0,
        aiDimensions: it.aiDimensions && typeof it.aiDimensions === 'object' ? it.aiDimensions : null,
        trendingScore: Number(it.trendingScore) || 0,
        verified: !!it.verified,
        requiresApiKey: !!it.requiresApiKey,
        iconMime: it.iconMime || '',
        iconBase64: it.iconBase64 || '',
        iconSource: it.iconSource || '',
        installed: !!rec,
        installedVersion: rec ? rec.version : '',
        // 更新可用：索引版本 > 已装版本（零依赖字符串比对）
        hasUpdate: !!rec && compareVersions(it.version, rec.version) > 0
      }
    }),
    fetchedAt: Date.now()
  }
}

// ---------- 零依赖版本比对（与 updater.js 同构） ----------
function compareVersions(a, b) {
  const parse = v => String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0]
    .split('.')
    .map(n => parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

// ---------- 安装 / 更新（缓存索引取 url → 下载 → 按类型与内容格式分流安装管线） ----------
// skill：复用 skills.importZip 校验管线落 skills/<name>/
// agent（zip 集合包）：agents.importAgentZip 落 agents/<itemId>/（集合目录整体覆盖）
// agent（裸 md 单专家）：agents.importAgentFile 落 agents/market/<slug>.md（raw md 直链下载，
//   按内容魔数 PK 头识别，不依赖 url 后缀）
// 市场语义：安装/更新/重新安装一律覆盖（已存在不算错误）
async function install(itemId) {
  const res = await fetchIndex(true)
  if (!res.ok) return { ok: false, error: res.error }
  const item = res.items.find(it => it.id === itemId)
  if (!item) return { ok: false, error: '市场项不存在或已下架' }

  const dl = await downloadBuffer(item.url)
  if (!dl.ok) return { ok: false, error: dl.error }

  // 已装记录公共段（类型无关）
  const rec = {
    id: item.id,
    name: item.name,
    type: item.type,
    version: item.version,
    installedAt: readInstalledRec(itemId).installedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  if (item.type === 'team') {
    // 专家团包：team.json（团定义）+ 专家 .md 集合 → 团落 teams/<itemId>.json，
    // 成员落 agents/teams-<itemId>/（teams 模块统一校验与落盘）
    const installed = await teams.importTeamZip(dl.data, item.id)
    if (!installed.ok) return installed
    Object.assign(rec, { teamId: installed.teamId, collection: installed.collection, agentCount: installed.count })
    const list = readInstalled().filter(r => r.id !== itemId)
    list.push(rec)
    writeInstalled(list)
    return { ok: true, skill: installed.skill }
  }

  if (item.type === 'agent') {
    // 按内容魔数分流（比 url 后缀可靠）：ZIP 以 "PK" 开头，否则按裸 md 单专家安装
    // agentFiles：安装落位的专家文件相对路径清单（专家团保存编排按此定位成员）
    const isZip = dl.data.length > 4 && dl.data[0] === 0x50 && dl.data[1] === 0x4b
    if (!isZip) {
      const installed = await agents.importAgentFile(dl.data, item.id)
      if (!installed.ok) return installed
      Object.assign(rec, { agentFile: installed.file })
      const list = readInstalled().filter(r => r.id !== itemId)
      list.push(rec)
      writeInstalled(list)
      return { ok: true, skill: installed.skill, agentFiles: [installed.file] }
    }
    // zip 集合包：落 agents/<itemId>/（集合目录幂等覆盖）
    const installed = await agents.importAgentZip(dl.data, item.id, true)
    if (!installed.ok) return installed
    Object.assign(rec, { collection: installed.collection, agentCount: installed.count })
    const list = readInstalled().filter(r => r.id !== itemId)
    list.push(rec)
    writeInstalled(list)
    const files = agents.listAgents().map(a => a.file)
      .filter(f => f.startsWith(installed.collection + '/'))
    return { ok: true, skill: installed.skill, agentFiles: files }
  }

  // 技能类型：复用 skills.js 既有安装管线（frontmatter/zip-slip 校验全都有）
  const installed = await skills.importZip(dl.data, true)
  if (!installed.ok) return installed
  Object.assign(rec, { skillDir: installed.skill && installed.skill.name })
  const list = readInstalled().filter(r => r.id !== itemId)
  list.push(rec)
  writeInstalled(list)
  return { ok: true, skill: installed.skill }
}

// ---------- 为专家团安装市场专家（成员专属管线） ----------
// 与 install() 同源的下载与校验，差异：
// - 落位 agents/teams/<teamId>/（团成员目录，「我的专家」列表不单独展示）
// - 不写 market-installed.json（成员随团 json 管理，删团时随目录清理）
// 返回 { ok, agentFiles }（安装落位的专家文件相对路径清单）
async function installForTeam(itemId, teamId) {
  const res = await fetchIndex(true)
  if (!res.ok) return { ok: false, error: res.error }
  const item = res.items.find(it => it.id === itemId)
  if (!item) return { ok: false, error: '市场项不存在或已下架：' + itemId }
  if (item.type !== 'agent') return { ok: false, error: '该市场项不是专家：' + item.name }

  const dl = await downloadBuffer(item.url)
  if (!dl.ok) return { ok: false, error: dl.error }
  const destDir = 'teams/' + teamId
  const isZip = dl.data.length > 4 && dl.data[0] === 0x50 && dl.data[1] === 0x4b
  if (!isZip) {
    const installed = await agents.importAgentFile(dl.data, item.id, destDir)
    if (!installed.ok) return installed
    return { ok: true, agentFiles: [installed.file] }
  }
  const installed = await agents.importAgentZip(dl.data, destDir, true)
  if (!installed.ok) return installed
  const files = agents.listAllAgents().map(a => a.file)
    .filter(f => f.startsWith(destDir + '/'))
  return { ok: true, agentFiles: files }
}

// 已装记录查询（专家团保存编排：已装市场项复用本地文件，不重复下载）
function getInstalledRec(id) {
  return readInstalledRec(id)
}

// 全部已装记录（专家团保存编排：识别本地自建成员用）
function listInstalledRecs() {
  return readInstalled()
}

// ---------- 卸载：按类型与形态删除对应文件/目录 + 移除记录 ----------
function uninstall(itemId) {
  const rec = readInstalledRec(itemId)
  if (!rec.id) return { ok: false, error: '未安装该资源' }
  if (rec.type === 'team') {
    // 专家团：删除团定义 json（teams.removeTeam 连带清理成员集合目录）
    if (rec.teamId) {
      const del = teams.removeTeam(rec.teamId)
      if (!del.ok) return del
    }
  } else if (rec.type === 'agent') {
    if (rec.agentFile) {
      const del = agents.deleteAgent(rec.agentFile)
      if (!del.ok) return del
    } else if (rec.collection) {
      const del = agents.deleteCollection(rec.collection)
      if (!del.ok) return del
    }
  } else if (rec.skillDir) {
    const del = skills.deleteSkill(rec.skillDir)
    if (!del.ok) return del
  }
  writeInstalled(readInstalled().filter(r => r.id !== itemId))
  return { ok: true }
}

// ---------- 已装列表（合并本地目录实时状态） ----------
function listInstalled() {
  const list = readInstalled()
  const localSkills = skills.listSkills().map(s => s.dir)
  const localCollections = fs.existsSync(agents.agentsRoot())
    ? fs.readdirSync(agents.agentsRoot(), { withFileTypes: true })
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .map(e => e.name)
    : []
  return {
    ok: true,
    items: list.map(rec => {
      let missing = false
      if (rec.type === 'team') {
        // 专家团：teamId 定位 teams/<id>.json（文件级丢失检测）
        missing = !rec.teamId || !teams.teamExists(rec.teamId)
      } else if (rec.type === 'agent') {
        if (rec.agentFile) {
          // 裸 md 单专家：文件级丢失检测（deleteAgent 同源的路径解析）
          try {
            const abs = path.join(agents.agentsRoot(), rec.agentFile)
            missing = !fs.existsSync(abs)
          } catch (e) { missing = true }
        } else if (rec.collection) {
          missing = !localCollections.includes(rec.collection)
        }
      } else if (rec.skillDir) {
        missing = !localSkills.includes(rec.skillDir)
      }
      return Object.assign({}, rec, { missing })
    })
  }
}

// ---------- IPC ----------
function registerIpc() {
  // 市场索引（含已装状态与更新标记；useCache=false 强制刷新）
  ipcMain.handle('omnibuddy:market:index', (_e, useCache) => fetchIndex(useCache !== false))

  // 安装 / 更新 / 重新安装（一律覆盖）
  ipcMain.handle('omnibuddy:market:install', (_e, itemId) => install(itemId))

  ipcMain.handle('omnibuddy:market:update', (_e, itemId) => install(itemId))

  // 卸载
  ipcMain.handle('omnibuddy:market:uninstall', (_e, itemId) => uninstall(itemId))

  // 已装列表
  ipcMain.handle('omnibuddy:market:installed', () => listInstalled())

  // 打开主页（README / 仓库）
  ipcMain.handle('omnibuddy:market:open-home', (_e, url) => {
    if (!/^https?:\/\//.test(String(url || ''))) return { ok: false }
    shell.openExternal(url)
    return { ok: true }
  })
}

module.exports = {
  // 初始化基目录与已装记录路径
  init,
  // 注册市场 IPC 通道
  registerIpc,
  // 拉取索引并合并已装状态（TTL 缓存）
  fetchIndex,
  // 为专家团安装市场专家（成员落 agents/teams/<teamId>/，不写已装记录）
  installForTeam,
  // 已装记录查询（专家团保存编排用）
  getInstalledRec,
  // 全部已装记录（专家团保存编排用）
  listInstalledRecs
}
