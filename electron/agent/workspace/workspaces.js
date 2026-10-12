// OmniBuddy 工作空间管理（多工作空间，发送前必须选定）
// 存储结构：<baseDir>/workspaces.json —— [{ id, name, path, memoryPolicy }]
// 工作空间全部由用户添加的本地目录组成，无默认项。
// memoryPolicy：记忆策略（缺省 global）——
//   global  继承全局记忆（agentDir/memory，行为与旧版一致）
//   isolate 本空间独立记忆（agentDir/memory-workspaces/<id>/，初始为空）
//   clean   干净启动：不装载 pi-memory 扩展、不读写不注入任何记忆
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const os = require('os')

let baseDir = ''
let defaultDir = '' // 兼容字段（历史引用）：不创建目录与登记

// 合法记忆策略集合（未知值回退 global）
const MEMORY_POLICIES = ['global', 'isolate', 'clean']

function normalizePolicy(v) {
  return MEMORY_POLICIES.indexOf(v) >= 0 ? v : 'global'
}

// ===== 初始化与存储 =====
function storeFile() {
  return path.join(baseDir, 'workspaces.json')
}

function init(dir) {
  baseDir = dir
  defaultDir = path.join(dir, 'workspace')
  // 无需创建默认工作空间目录：工作空间仅由用户在对话中关联磁盘路径时登记
  if (!fs.existsSync(storeFile())) {
    try {
      fs.writeFileSync(storeFile(), JSON.stringify([], null, 2))
    } catch (e) { /* 写入失败不阻塞启动，list() 会回退空列表 */ }
  }
  // 物理清理历史版本登记的默认工作空间（path 指向内部默认目录的条目）
  const cleaned = rawList()
  if (cleaned.length !== readRawSaved().length) save(cleaned)
}

// 读取存储文件原始内容（仅 init 清理时对比条目数用）
function readRawSaved() {
  try {
    const saved = JSON.parse(fs.readFileSync(storeFile(), 'utf-8'))
    if (Array.isArray(saved)) return saved.filter(w => w && w.id !== 'ws-default')
  } catch (e) { /* 损坏则回退空列表 */ }
  return []
}

// 原始列表（不含运行时派生字段，供内部读写存储使用）
function rawList() {
  // 过滤历史版本预置的默认工作区：旧 id「ws-default」与指向内部默认目录的登记项
  return readRawSaved().filter(w => !defaultDir || w.path !== defaultDir)
}

// ===== 列表与管理接口 =====
// 列表（每项附 available：目录当前是否仍存在且为文件夹，用于前端标记失效工作空间）
function list() {
  return rawList().map(w => {
    let available = false
    try {
      available = fs.existsSync(w.path) && fs.statSync(w.path).isDirectory()
    } catch (e) {
      available = false
    }
    return Object.assign({}, w, { available })
  })
}

function save(items) {
  try {
    fs.writeFileSync(storeFile(), JSON.stringify(items, null, 2))
  } catch (e) {
    return { ok: false, error: '保存工作空间失败：' + e.message }
  }
  return { ok: true }
}

// 敏感目录黑名单：禁止绑定为工作空间（Agent 将在该目录执行读写/命令）。
// 比较规则：路径分隔符归一为 '/'、统一小写后比对；
// 覆盖根目录（'/' 或 Windows 盘符 'c:'/'c:/'）、用户主目录本身及各系统目录。
function isSensitiveDir(dirPath) {
  const norm = String(dirPath || '')
    .replace(/\\/g, '/')
    .replace(/\/+$/, '')
    .toLowerCase()
  // 根目录：'/'（去尾斜杠后为空）或 Windows 盘符
  if (norm === '' || /^[a-z]:\/?$/.test(norm)) return true
  if (norm === os.homedir().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()) return true
  const blocked = [
    '/etc', '/usr', '/bin', '/sbin', '/var',
    '/system', '/private/etc',
    '/windows', '/program files', '/program files (x86)'
  ]
  return blocked.includes(norm)
}

// 添加本地目录为工作空间（name 缺省用目录名）
function add(dirPath, name) {
  const p = String(dirPath || '').trim()
  if (!p || !fs.existsSync(p) || !fs.statSync(p).isDirectory()) {
    return { ok: false, error: '目录不存在或不是文件夹' }
  }
  // 系统敏感目录拒绝绑定
  if (isSensitiveDir(p)) {
    return { ok: false, error: '不允许绑定系统敏感目录' }
  }
  const items = rawList()
  const existed = items.find(w => w.path === p)
  if (existed) {
    // 目录已登记：幂等返回已有工作空间（便于对话关联；created 标记供前端决定是否弹策略选择）
    return { ok: true, workspace: existed, created: false }
  }
  const item = {
    id: 'ws-' + Date.now().toString(36) + '-' + crypto.randomBytes(2).toString('hex'),
    // 展示名缺省为空：前端按磁盘路径呈现（用户可在关联弹窗填写）
    name: String(name || '').trim().slice(0, 30),
    path: p,
    memoryPolicy: 'global'
  }
  items.push(item)
  const r = save(items)
  if (!r.ok) return r
  return { ok: true, workspace: item, created: true }
}

// 更新记忆策略（global / isolate / clean；非法值回退 global）
function setMemoryPolicy(id, policy) {
  const items = rawList()
  const hit = items.find(w => w.id === id)
  if (!hit) return { ok: false, error: '工作空间不存在' }
  hit.memoryPolicy = normalizePolicy(policy)
  const r = save(items)
  if (!r.ok) return r
  return { ok: true, workspace: hit }
}

// 记忆策略 → 记忆目录映射（clean 返回 null：不装载记忆）
// isolate 目录：<baseDir>/memory-workspaces/<id>/（惰性创建，随 OmniBuddy 数据管理）
function memoryDirFor(id) {
  const hit = rawList().find(w => w.id === id)
  if (!hit) return { policy: 'global', dir: null }
  const policy = normalizePolicy(hit.memoryPolicy)
  if (policy === 'clean') return { policy, dir: null }
  if (policy === 'isolate') {
    const dir = path.join(baseDir, 'memory-workspaces', hit.id)
    try { fs.mkdirSync(dir, { recursive: true }) } catch (e) { /* 写失败时会话回退 global */ }
    return { policy, dir }
  }
  return { policy, dir: null }
}

// 更新展示名（空 = 清除，前端按磁盘路径呈现）
function rename(id, name) {
  const items = rawList()
  const hit = items.find(w => w.id === id)
  if (!hit) return { ok: false, error: '工作空间不存在' }
  hit.name = String(name || '').trim().slice(0, 30)
  return save(items)
}

// 移除（仅解除关联，不删磁盘文件）
function remove(id) {
  const items = rawList()
  const next = items.filter(w => w.id !== id)
  if (next.length === items.length) return { ok: false, error: '工作空间不存在' }
  return save(next)
}

// id → 目录（未命中回退内部目录，兼容历史会话）
// 通过 id 解析工作空间目录（未登记时返回空串：调用方需保证发送前必填校验）
function resolve(id) {
  const hit = rawList().find(w => w.id === id)
  return hit ? hit.path : ''
}

module.exports = {
  // 初始化存储目录
  init,
  // 工作空间列表（附 available）
  list,
  // 添加本地目录为工作空间
  add,
  // 更新记忆策略（global / isolate / clean）
  setMemoryPolicy,
  // 记忆策略 → { policy, dir }（clean 时 dir 为 null；isolate 时保证目录存在）
  memoryDirFor,
  // 更新展示名
  rename,
  // 移除工作空间（仅解除关联）
  remove,
  // id → 目录路径
  resolve
}
