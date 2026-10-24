// OmniBuddy 专家团管理
// 专家团 = 多个专家（agents/**/*.md）的组合体，存 <agentDir>/teams/<id>.json：
//   { id, name, description, members: [agents 内相对路径], collection?, createdAt, updatedAt }
// - 本地创建：members 引用既有专家文件；删除团不删除成员专家
// - 市场安装：ZIP（team.json + 专家 .md 集合）→ 专家落 agents/teams-<itemId>/，
//   团 json 记 collection 字段（卸载/删除团时连带删除成员集合目录）
// teams/ 独立于 agents/：团不是专家（无系统提示词），pi-subagents 不装载；
// @Team:<id> 引用经系统提示词的「专家团清单」向模型说明团组成
const path = require('path')
const fs = require('fs')
const AdmZip = require('adm-zip')
const agents = require('./agents')

let baseDir = ''

// ===== 基础目录 =====
function teamsDir() {
  return path.join(baseDir, 'teams')
}

function init(dir) {
  baseDir = dir
  fs.mkdirSync(teamsDir(), { recursive: true })
}

// id 仅允许字母数字连字符下划线（文件名安全，防穿越，与专家名同规则）
function validId(id) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(id)
}

function teamFile(id) {
  const i = String(id || '').trim()
  if (!validId(i)) return null
  return path.join(teamsDir(), i + '.json')
}

// 团 json 归一（members 过滤为 agents 内 .md 相对路径，统一 / 分隔）
function normalizeTeam(t) {
  const members = Array.isArray(t.members)
    ? t.members.map(s => String(s).replace(/\\/g, '/')).filter(s => /\.md$/i.test(s) && !s.includes('..'))
    : []
  return {
    id: String(t.id || ''),
    name: String(t.name || '').trim() || t.id,
    description: String(t.description || '').trim(),
    members,
    // 市场安装的团记录成员集合目录（agents/ 下），删除团时连带清理
    collection: String(t.collection || ''),
    createdAt: t.createdAt || '',
    updatedAt: t.updatedAt || ''
  }
}

// ===== 团 CRUD =====
function listTeams() {
  let entries = []
  try {
    entries = fs.readdirSync(teamsDir(), { withFileTypes: true })
  } catch (e) {
    return []
  }
  const out = []
  for (const entry of entries) {
    if (!entry.isFile() || !/\.json$/i.test(entry.name)) continue
    try {
      const team = JSON.parse(fs.readFileSync(path.join(teamsDir(), entry.name), 'utf-8'))
      if (team && team.id) out.push(normalizeTeam(team))
    } catch (e) { /* 跳过损坏文件 */ }
  }
  return out.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
}

function readTeam(id) {
  const abs = teamFile(id)
  if (!abs || !fs.existsSync(abs)) return null
  try {
    return normalizeTeam(JSON.parse(fs.readFileSync(abs, 'utf-8')))
  } catch (e) {
    return null
  }
}

function getTeam(id) {
  const team = readTeam(id)
  if (!team) return { ok: false, error: '专家团不存在' }
  return { ok: true, team }
}

// id 生成：优先取名称中的合法字符，冲突追加序号，中文名等无合法字符时用时间戳兜底
function genId(name) {
  let base = String(name || '')
    .trim()
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
  if (!base) base = 'team-' + Date.now().toString(36)
  let id = base
  let n = 2
  while (fs.existsSync(path.join(teamsDir(), id + '.json'))) {
    id = base + '-' + n
    n++
    if (n > 200) {
      id = base + '-' + Date.now().toString(36)
      break
    }
  }
  return id
}

// 表单校验（名称/描述/成员均必填，成员至少 1 位）
function validateForm({ name, description, members } = {}) {
  const n = String(name || '').trim()
  const d = String(description || '').trim()
  const m = Array.isArray(members)
    ? members.map(s => String(s).replace(/\\/g, '/')).filter(s => /\.md$/i.test(s) && !s.includes('..'))
    : []
  if (!n) return { ok: false, error: '团名称不能为空' }
  if (n.length > 50) return { ok: false, error: '团名称不能超过 50 字' }
  if (!d) return { ok: false, error: '团描述不能为空' }
  if (!m.length) return { ok: false, error: '团组成不能为空，请至少选择 1 位专家' }
  return { ok: true, form: { name: n, description: d, members: [...new Set(m)] } }
}

function createTeam(payload = {}) {
  const checked = validateForm(payload)
  if (!checked.ok) return checked
  try {
    fs.mkdirSync(teamsDir(), { recursive: true })
    const now = new Date().toISOString()
    const team = {
      id: genId(checked.form.name),
      ...checked.form,
      collection: '',
      createdAt: now,
      updatedAt: now
    }
    fs.writeFileSync(path.join(teamsDir(), team.id + '.json'), JSON.stringify(team, null, 2), 'utf-8')
    return { ok: true, team }
  } catch (e) {
    return { ok: false, error: '创建专家团失败：' + e.message }
  }
}

// 更新团（id 定位，名称/描述/成员可改；collection 与 createdAt 保留）
function updateTeam(payload = {}) {
  const old = readTeam(payload.id)
  if (!old) return { ok: false, error: '专家团不存在' }
  const checked = validateForm(payload)
  if (!checked.ok) return checked
  try {
    const team = {
      id: old.id,
      ...checked.form,
      collection: old.collection,
      createdAt: old.createdAt,
      updatedAt: new Date().toISOString()
    }
    fs.writeFileSync(path.join(teamsDir(), team.id + '.json'), JSON.stringify(team, null, 2), 'utf-8')
    return { ok: true, team }
  } catch (e) {
    return { ok: false, error: '更新专家团失败：' + e.message }
  }
}

// 删除团：本地团仅删 json；市场安装的团（带 collection）连带删除成员集合目录
function removeTeam(id) {
  const team = readTeam(id)
  if (!team) return { ok: false, error: '专家团不存在' }
  if (team.collection) {
    const del = agents.deleteCollection(team.collection)
    if (!del.ok) return del
  }
  try {
    fs.rmSync(path.join(teamsDir(), team.id + '.json'), { force: true })
    return { ok: true, removedMembers: !!team.collection }
  } catch (e) {
    return { ok: false, error: '删除专家团失败：' + e.message }
  }
}

// ===== 市场专家团 ZIP 导入（安装管线） =====
// ZIP 结构：team.json（团定义：name / description / members?）+ 专家 .md 集合（可嵌套目录）。
// 安装：成员 .md 逐个校验 frontmatter 后落 agents/teams-<itemId>/（zip-slip 防护），
// 团定义落 teams/<itemId>.json（members = 集合内相对路径）。
// 若 ZIP 不含 .md（纯引用型团），members 保留 team.json 原值（视为引用本地既有专家）
function importTeamZip(data, itemId) {
  const id = String(itemId || '').trim()
  if (!validId(id)) return { ok: false, error: '专家团标识无效：' + id }

  let zip
  try {
    zip = new AdmZip(Buffer.from(data))
  } catch (e) {
    return { ok: false, error: '无法解析 ZIP 文件：' + e.message }
  }
  const norm = zip.getEntries()
    .map(e => ({
      entry: e,
      name: String(e.entryName || '').replace(/\\/g, '/').replace(/^\.\//, '')
    }))
    .filter(x => x.name && !x.name.startsWith('__MACOSX/')
      && !/(^|\/)\.DS_Store$/.test(x.name))

  // team.json 定位：取路径最浅的一个（根级或唯一顶级目录下）
  const defs = norm
    .filter(x => !x.entry.isDirectory && /(^|\/)team\.json$/i.test(x.name))
    .sort((a, b) => a.name.split('/').length - b.name.split('/').length)
  if (!defs.length) return { ok: false, error: 'ZIP 内未找到 team.json（专家团定义文件）' }
  let def
  try {
    def = JSON.parse(defs[0].entry.getData().toString('utf-8'))
  } catch (e) {
    return { ok: false, error: 'team.json 解析失败：' + e.message }
  }
  const name = String(def.name || '').trim()
  const description = String(def.description || '').trim()
  if (!name || !description) return { ok: false, error: 'team.json 缺少 name 或 description' }

  // 专家 .md（剥掉 team.json 所在目录前缀，与专家包 ZIP 同语义）
  const prefix = defs[0].name.includes('/') ? defs[0].name.slice(0, defs[0].name.lastIndexOf('/') + 1) : ''
  const mdFiles = norm.filter(x => !x.entry.isDirectory
    && /\.md$/i.test(x.name) && x.name !== defs[0].name)
    .map(x => ({ entry: x.entry, rel: prefix && x.name.startsWith(prefix) ? x.name.slice(prefix.length) : x.name }))
    .filter(x => x.rel)

  // 逐个校验成员专家（frontmatter name/description 必填；路径段防穿越）
  const members = []
  for (const { entry, rel } of mdFiles) {
    const parts = rel.split('/').filter(Boolean)
    if (!parts.length || parts.some(p => !/^[A-Za-z0-9_-]+(\.md)?$/i.test(p))) {
      return { ok: false, error: '专家文件路径无效：' + rel }
    }
    const parsed = agents.parseAgentText(entry.getData().toString('utf-8'))
    if (!parsed.name || !parsed.description) {
      return { ok: false, error: `专家「${rel}」缺少 name 或 description，无法安装` }
    }
    members.push(rel)
  }
  if (!members.length && !Array.isArray(def.members)) {
    return { ok: false, error: '专家团至少需要 1 位成员专家' }
  }

  // 成员 .md 落 agents/teams-<itemId>/（目录整体覆盖，市场语义与专家集合一致）
  const collection = 'teams-' + id
  const targetDir = path.join(agents.agentsRoot(), collection)
  if (fs.existsSync(targetDir)) fs.rmSync(targetDir, { recursive: true, force: true })
  fs.mkdirSync(targetDir, { recursive: true })
  for (const { entry, rel } of mdFiles) {
    const dest = path.join(targetDir, rel)
    const resolved = path.resolve(dest)
    if (resolved !== targetDir && !resolved.startsWith(targetDir + path.sep)) continue
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, entry.getData())
  }

  const now = new Date().toISOString()
  const team = {
    id,
    name,
    description,
    // 引用型团（无内嵌 .md）保留 team.json 的 members 原值
    members: members.length ? members.map(rel => collection + '/' + rel) : def.members || [],
    collection: members.length ? collection : '',
    createdAt: now,
    updatedAt: now
  }
  fs.mkdirSync(teamsDir(), { recursive: true })
  fs.writeFileSync(path.join(teamsDir(), id + '.json'), JSON.stringify(team, null, 2), 'utf-8')
  return {
    ok: true,
    teamId: id,
    collection: team.collection,
    count: members.length,
    // 对齐既有安装管线返回形态（market.js 直接透传给前端）
    skill: { name, description: description + (members.length ? `（${members.length} 位专家）` : '') }
  }
}

// ===== 系统提示词块：专家团清单（@Team:<id> 引用闭环） =====
// 模型不感知 teams 目录，团组成（成员专家名）经此清单注入会话系统提示词；
// 团变更后新会话生效（与专家 .md 装载同语义）
function promptBlock() {
  const teams = listTeams()
  if (!teams.length) return ''
  const nameMap = {}
  try {
    agents.listAgents().forEach(a => { nameMap[a.file] = a.name })
  } catch (e) { /* 名称反查失败退化为文件名 */ }
  const memberName = m => nameMap[m] || m.split('/').pop().replace(/\.md$/i, '')
  const lines = [
    '消息中形如 @Team:标识 的标记是用户界面里"引用专家团"的序列化产物（一组专家的组合，用户看到的是团队卡片）。当前专家团清单（处理团队相关任务时，可按需把子任务委派给团内对应专家）：'
  ]
  for (const t of teams) {
    const members = t.members.length ? t.members.map(memberName).join('、') : '无'
    lines.push(`- ${t.id}：${t.name} — ${t.description}（成员：${members}）`)
  }
  return lines.join('\n')
}

// 团定义文件存在性检查（市场已装记录丢失检测用）
function teamExists(id) {
  const abs = teamFile(id)
  return !!abs && fs.existsSync(abs)
}

module.exports = {
  // 初始化 teams 根目录
  init,
  // 扫描专家团列表
  listTeams,
  // 读取单个专家团
  getTeam,
  // 本地新建专家团
  createTeam,
  // 更新专家团（名称/描述/成员）
  updateTeam,
  // 删除专家团（市场团连带删除成员集合）
  removeTeam,
  // 导入专家团 ZIP（市场安装管线）
  importTeamZip,
  // 团定义文件存在性检查（市场已装记录丢失检测用）
  teamExists,
  // 系统提示词注入块（专家团清单）
  promptBlock
}
