// 资源市场：GitCode 仓库做索引源，零自建后端
// - 索引：omnibuddy-market 仓库 index.json，经 GitCode OpenAPI raw 端点匿名拉取（主进程 net）
//   （raw.gitcode.com 域名对个人仓库返回「暂不支持预览」，统一走 api.gitcode.com）
// - 安装：下载 zip → 复用 skills.js 的 importZip 安全校验管线 → 落 <agentDir>/skills/
// - 记录：market-installed.json 存已装项来源与版本，供「已安装」状态与更新对比
// - 429 防护：索引内存缓存（TTL）+ install 优先复用缓存，减少 raw 请求；限流时错误明确提示
const path = require('path')
const fs = require('fs')
const { ipcMain, net, shell } = require('electron')
const skills = require('./skills')
const remote = require('../../src/config/remote.cjs')

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

// ---------- 通用 net 下载（Buffer，供索引与 zip 共用） ----------
// 429/5xx 抛出明确错误文案；调用方按需重试
function downloadBuffer(url, { timeout = 30000, maxSize = 50 * 1024 * 1024 } = {}) {
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
        tags: Array.isArray(it.tags) ? it.tags : [],
        homepage: it.homepage || '',
        updatedAt: it.updatedAt || '',
        url: it.url, // zip 直链（GitCode raw API）
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

// ---------- 安装 / 更新（缓存索引取 url → 下载 zip → importZip 覆盖安装） ----------
async function install(itemId) {
  const res = await fetchIndex(true)
  if (!res.ok) return { ok: false, error: res.error }
  const item = res.items.find(it => it.id === itemId)
  if (!item) return { ok: false, error: '市场项不存在或已下架' }

  const dl = await downloadBuffer(item.url)
  if (!dl.ok) return { ok: false, error: dl.error }

  // 复用 skills.js 既有安装管线（frontmatter/zip-slip 校验全都有）
  // 市场语义：安装/更新/重新安装一律覆盖（已存在不算错误）
  const installed = await skills.importZip(dl.data, true)
  if (!installed.ok) return installed

  // 写入/刷新已装记录
  const list = readInstalled().filter(r => r.id !== itemId)
  list.push({
    id: item.id,
    name: item.name,
    type: item.type,
    version: item.version,
    skillDir: installed.skill && installed.skill.name,
    installedAt: readInstalledRec(itemId).installedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  })
  writeInstalled(list)
  return { ok: true, skill: installed.skill }
}

// ---------- 卸载：删除 skill 目录 + 移除记录 ----------
function uninstall(itemId) {
  const rec = readInstalledRec(itemId)
  if (!rec.id) return { ok: false, error: '未安装该资源' }
  if (rec.skillDir) {
    const del = skills.deleteSkill(rec.skillDir)
    if (!del.ok) return del
  }
  writeInstalled(readInstalled().filter(r => r.id !== itemId))
  return { ok: true }
}

// ---------- 已装列表（合并本地 skill 目录实时状态） ----------
function listInstalled() {
  const list = readInstalled()
  const localSkills = skills.listSkills().map(s => s.dir)
  return {
    ok: true,
    items: list.map(rec => Object.assign({}, rec, {
      // skill 目录已被手动删除时标记丢失
      missing: !!(rec.skillDir && !localSkills.includes(rec.skillDir))
    }))
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

module.exports = { init, registerIpc, fetchIndex }
