// OmniBuddy 凭证管理（safeStorage 加密存储）
// MCP 服务 / Skills 等外部扩展的鉴权信息（header / env 键值对）统一收纳，
// secret 经 Electron safeStorage（系统钥匙串）加密后落盘，明文仅主进程内解密使用。
// 存储结构：<baseDir>/credentials.json —— [{ id, name, type, description, baseUrl,
//   command, skillNames, secretEnc, createdAt, updatedAt }]
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { safeStorage } = require('electron')

let storeFile = ''

// ===== 初始化 =====
function init(baseDir) {
  storeFile = path.join(baseDir, 'credentials.json')
}

// 生成短 id：时间戳 + 随机后缀
function newId() {
  return 'cred-' + Date.now().toString(36) + '-' + crypto.randomBytes(2).toString('hex')
}

// ===== 存取 =====
function readAll() {
  try {
    const arr = JSON.parse(fs.readFileSync(storeFile, 'utf-8'))
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

function writeAll(items) {
  fs.writeFileSync(storeFile, JSON.stringify(items, null, 2))
  // 敏感凭证文件，收紧权限（加密内容 + 文件权限双重防护）
  try { fs.chmodSync(storeFile, 0o600) } catch (e) { /* chmod 失败不影响功能 */ }
}

// ===== 加密 / 解密 =====
// secret 明文结构：{ headers: {}, env: {} }
// safeStorage 可用时用系统钥匙串加密（'enc:' 前缀）；
// 不可用时（如 Linux 缺少 libsecret 的桌面环境）回退 base64（'b64:' 前缀），
// 至少避免明文直接落盘，但安全性依赖本机文件权限。
//
// utilityProcess 桥接模式（shim 提供 safeStorage.__bridged）下 encryptString /
// decryptString 是跨进程异步调用，而凭据取用方（mcp resolve / 技能 env 注入）是
// 同步签名 —— 因此用「启动预热缓存」策略：decCache 以 secretEnc 为键保存明文，
// prewarm() 在子进程启动时把所有 enc: 条目解密入缓存，运行期解密走同步查表；
// create / update 时明文在手直接填缓存，杜绝运行期未命中。
const bridged = () => !!(safeStorage && safeStorage.__bridged)
const decCache = new Map() // secretEnc -> { headers, env }

async function encryptSecret(obj) {
  const str = JSON.stringify(obj || {})
  if (safeStorage.isEncryptionAvailable()) {
    // 主进程模式 encryptString 同步返回 Buffer，桥接模式返回 Promise —— await 双兼容
    const buf = await safeStorage.encryptString(str)
    return 'enc:' + buf.toString('base64')
  }
  return 'b64:' + Buffer.from(str).toString('base64')
}

function parseSecret(str) {
  const obj = JSON.parse(str)
  return { headers: (obj && obj.headers) || {}, env: (obj && obj.env) || {} }
}

// 按前缀分发解密（异步版，供 prewarm / create / update 使用）；
// 失败返回空对象并告警（如系统凭据变更导致解密失败）
async function decryptSecret(secretEnc) {
  try {
    if (typeof secretEnc !== 'string' || !secretEnc) return { headers: {}, env: {} }
    if (secretEnc.startsWith('enc:')) {
      const str = await safeStorage.decryptString(Buffer.from(secretEnc.slice(4), 'base64'))
      const secret = parseSecret(str)
      decCache.set(secretEnc, secret)
      return secret
    }
    if (secretEnc.startsWith('b64:')) {
      return parseSecret(Buffer.from(secretEnc.slice(4), 'base64').toString('utf-8'))
    }
    return { headers: {}, env: {} }
  } catch (e) {
    console.warn('[omnibuddy:credentials] 凭证解密失败：', e.message)
    return { headers: {}, env: {} }
  }
}

// 同步解密：缓存命中 / b64 直解 / 主进程模式真同步解密；
// 桥接模式下 enc: 未命中（预热失败或新写入未被缓存）返回空并告警
function decryptSecretSync(secretEnc) {
  const hit = decCache.get(secretEnc)
  if (hit) return hit
  try {
    if (typeof secretEnc !== 'string' || !secretEnc) return { headers: {}, env: {} }
    if (secretEnc.startsWith('b64:')) {
      return parseSecret(Buffer.from(secretEnc.slice(4), 'base64').toString('utf-8'))
    }
    if (secretEnc.startsWith('enc:')) {
      if (bridged()) {
        console.warn('[omnibuddy:credentials] 桥接模式缓存未命中，返回空凭据：', secretEnc.slice(0, 16))
        return { headers: {}, env: {} }
      }
      return parseSecret(safeStorage.decryptString(Buffer.from(secretEnc.slice(4), 'base64')))
    }
    return { headers: {}, env: {} }
  } catch (e) {
    console.warn('[omnibuddy:credentials] 凭证解密失败：', e.message)
    return { headers: {}, env: {} }
  }
}

// 启动预热：把磁盘上所有 enc: 条目解密入缓存（agent-host 启动时调用，失败不阻断）
async function prewarm() {
  if (!bridged()) return
  for (const c of readAll()) {
    if (typeof c.secretEnc === 'string' && c.secretEnc.startsWith('enc:')) {
      await decryptSecret(c.secretEnc)
    }
  }
}

// 脱敏预览：取首个非空值前 2 后 2 字符（'AB***YZ' 风格）
function maskSecret(secret) {
  const values = Object.values(secret.headers || {}).concat(Object.values(secret.env || {}))
  const first = values.find(v => v !== undefined && v !== null && String(v) !== '')
  if (first === undefined) return ''
  const s = String(first)
  if (s.length <= 4) return s.charAt(0) + '***'
  return s.slice(0, 2) + '***' + s.slice(-2)
}

// ===== 凭证 CRUD =====
// 脱敏视图：键名列表 + 掩码预览，不含任何 secret 明文
function maskedView(c) {
  const secret = decryptSecretSync(c.secretEnc)
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    description: c.description || '',
    baseUrl: c.baseUrl || '',
    command: c.command || '',
    skillNames: c.skillNames || [],
    headerKeys: Object.keys(secret.headers || {}),
    envKeys: Object.keys(secret.env || {}),
    masked: maskSecret(secret),
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  }
}

function list() {
  return readAll().map(maskedView)
}

async function create(c) {
  try {
    c = c || {}
    const name = String(c.name || '').trim()
    const type = String(c.type || '').trim()
    if (!name) return { ok: false, error: '凭证名称不能为空' }
    if (!type) return { ok: false, error: '凭证类型不能为空' }
    const now = Date.now()
    const plain = {
      headers: (c.headers && typeof c.headers === 'object' && !Array.isArray(c.headers)) ? c.headers : {},
      env: (c.env && typeof c.env === 'object' && !Array.isArray(c.env)) ? c.env : {}
    }
    const record = {
      id: newId(),
      name,
      type,
      description: String(c.description || '').trim(),
      baseUrl: String(c.baseUrl || '').trim(),
      command: String(c.command || '').trim(),
      skillNames: Array.isArray(c.skillNames) ? c.skillNames : [],
      secretEnc: await encryptSecret(plain),
      createdAt: now,
      updatedAt: now
    }
    // 明文在手直填缓存：create 后立即被 mcp resolve / 技能 env 注入同步消费
    decCache.set(record.secretEnc, plain)
    const items = readAll()
    items.push(record)
    writeAll(items)
    return { ok: true, credential: maskedView(record) }
  } catch (e) {
    return { ok: false, error: '创建凭证失败：' + e.message }
  }
}

async function update(c) {
  try {
    c = c || {}
    const items = readAll()
    const hit = items.find(x => x.id === c.id)
    if (!hit) return { ok: false, error: '凭证不存在' }
    if (c.name !== undefined) hit.name = String(c.name).trim()
    if (c.type !== undefined) hit.type = String(c.type).trim()
    if (c.description !== undefined) hit.description = String(c.description || '').trim()
    if (c.baseUrl !== undefined) hit.baseUrl = String(c.baseUrl || '').trim()
    if (c.command !== undefined) hit.command = String(c.command || '').trim()
    if (c.skillNames !== undefined) hit.skillNames = Array.isArray(c.skillNames) ? c.skillNames : []
    // headers / env 分别独立判断：未传（null/undefined）保持原值，传了则整体替换重加密
    const secret = decryptSecretSync(hit.secretEnc)
    const headers = (c.headers === null || c.headers === undefined)
      ? secret.headers
      : (typeof c.headers === 'object' && !Array.isArray(c.headers)) ? c.headers : {}
    const env = (c.env === null || c.env === undefined)
      ? secret.env
      : (typeof c.env === 'object' && !Array.isArray(c.env)) ? c.env : {}
    const plain = { headers, env }
    const oldEnc = hit.secretEnc
    hit.secretEnc = await encryptSecret(plain)
    hit.updatedAt = Date.now()
    // 重加密后明文在手直填缓存（同时清掉旧密文的缓存项）
    decCache.delete(oldEnc)
    decCache.set(hit.secretEnc, plain)
    writeAll(items)
    return { ok: true, credential: maskedView(hit) }
  } catch (e) {
    return { ok: false, error: '更新凭证失败：' + e.message }
  }
}

function remove(id) {
  try {
    const items = readAll()
    const next = items.filter(x => x.id !== id)
    if (next.length === items.length) return { ok: false, error: '凭证不存在' }
    // 清掉被删条目的明文缓存
    for (const x of items) {
      if (!next.includes(x)) decCache.delete(x.secretEnc)
    }
    writeAll(next)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: '删除凭证失败：' + e.message }
  }
}

// 解密返回完整 { headers, env }（仅主进程内部使用，不暴露 IPC）
function resolve(id) {
  const hit = readAll().find(x => x.id === id)
  if (!hit) return { headers: {}, env: {} }
  return decryptSecretSync(hit.secretEnc)
}

// ===== AI 对话按需取用 =====
// 配置即生效：不做条目级开关，取用权限统一由权限策略（credential_get）管控。
// 技能绑定（skillNames）与 AI 取用天然并存（一条凭据两种用途）。

// AI 可用凭据目录（脱敏视图 + id）：注入 systemPrompt 供模型按名索引
function aiList() {
  return readAll().map(c => {
      const secret = decryptSecretSync(c.secretEnc)
      return {
        id: c.id,
        name: c.name,
        description: c.description || '',
        envKeys: Object.keys(secret.env || {}),
        headerKeys: Object.keys(secret.headers || {})
      }
    })
}

// AI 取用清单注入块（存在可取用条目时输出；权限策略默认允许，逐次取用不留痕记录）
function aiPromptBlock() {
  const items = aiList()
  if (!items.length) return ''
  const rows = items.map(c => {
    const keys = c.envKeys.concat(c.headerKeys)
    return '- ' + c.name + (c.description ? '：' + c.description : '')
      + (keys.length ? '（含字段：' + keys.join('、') + '）' : '')
  })
  return [
    '## 可用凭据（经 credential_get 工具按名取用）',
    ...rows,
    '取用内容仅用于本次任务，不要在回复中明文展示密钥。'
  ].join('\n')
}

// credential_get 工具的执行体：按名（或 id）取凭据，返回明文键值对
function aiResolve(nameOrId) {
  const q = String(nameOrId || '').trim()
  if (!q) return { ok: false, error: '凭据名称不能为空' }
  const hit = readAll().find(c => c.name === q || c.id === q)
  if (!hit) {
    return { ok: false, error: '未找到名为「' + q + '」的凭据' }
  }
  const secret = decryptSecretSync(hit.secretEnc)
  return { ok: true, name: hit.name, values: secret.env, headers: secret.headers }
}

// 按激活技能聚合 env：所有 skillNames 命中任一激活技能的凭证，解密后合并 env
// （技能凭据注入 bash / python / node 执行环境的取数入口；后写入的凭证覆盖同名键）
function resolveEnvForSkills(skillNames) {
  const names = Array.isArray(skillNames) ? skillNames.filter(Boolean) : []
  if (!names.length) return {}
  const env = {}
  for (const c of readAll()) {
    const skills = Array.isArray(c.skillNames) ? c.skillNames : []
    if (!skills.some(n => names.indexOf(n) >= 0)) continue
    const secret = decryptSecretSync(c.secretEnc)
    Object.assign(env, secret.env || {})
  }
  return env
}

// 按技能安装目录聚合 env：凡 skillNames 指向 agentDir/skills/ 下真实存在目录的
// 凭证，全部解密合并 env——前台子代理凭据注入扩展（omnideck-child-creds.mjs）
// 的取数入口。与主会话 resolveEnvForSkills 的差别：无「本会话读过 SKILL.md」
// 激活门控（child 会话内无该状态），改以「技能已安装」为界——子代理本就是
// 协调者按 SKILL.md 规范委派的，技能在用即注入
function resolveEnvForInstalledSkills(skillsDir) {
  if (!skillsDir || typeof skillsDir !== 'string') return {}
  let installed = []
  try {
    installed = fs.readdirSync(skillsDir).filter(n => {
      try {
        return fs.statSync(path.join(skillsDir, n)).isDirectory()
      } catch (e) {
        return false
      }
    })
  } catch (e) {
    return {}
  }
  return resolveEnvForSkills(installed)
}

module.exports = {
  // 初始化存储文件路径
  init,
  // 脱敏凭证列表
  list,
  // 创建凭证
  create,
  // 更新凭证
  update,
  // 删除凭证
  remove,
  // 按 id 解密取完整凭据（仅主进程内部）
  resolve,
  // 按激活技能聚合 env
  resolveEnvForSkills,
  // 按技能安装目录聚合 env（前台子代理凭据注入用）
  resolveEnvForInstalledSkills,
  // AI 可用凭据目录
  aiList,
  // AI 取用清单注入块
  aiPromptBlock,
  // credential_get 工具执行体
  aiResolve,
  // 启动预热解密缓存
  prewarm
}
