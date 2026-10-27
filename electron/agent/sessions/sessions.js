// OmniBuddy 会话持久化：不可变追加日志（JSONL）+ 会话元数据（JSON）
// 存储结构：userData/omnibuddy/sessions/<sessionId>/{meta.json, messages.jsonl}
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

// ===== 初始化与基础 =====
let sessionsRoot = null

// 初始化存储根目录（app ready 后调用）
function initSessions(root) {
  sessionsRoot = root
  fs.mkdirSync(sessionsRoot, { recursive: true })
}

function sessionDir(id) {
  return path.join(sessionsRoot, id)
}

// 生成短 id：时间戳 + 随机后缀，避免目录名过长
function newId() {
  return Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex')
}

// ===== 元数据 =====
function readMeta(id) {
  const file = path.join(sessionDir(id), 'meta.json')
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) {
    return null
  }
}

function writeMeta(id, meta) {
  fs.mkdirSync(sessionDir(id), { recursive: true })
  fs.writeFileSync(path.join(sessionDir(id), 'meta.json'), JSON.stringify(meta, null, 2))
}

// ===== 消息（JSONL 追加） =====
function appendMessage(id, msg) {
  fs.mkdirSync(sessionDir(id), { recursive: true })
  fs.appendFileSync(path.join(sessionDir(id), 'messages.jsonl'), JSON.stringify(msg) + '\n')
}

function readMessages(id) {
  const file = path.join(sessionDir(id), 'messages.jsonl')
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf-8').split('\n')
  const out = []
  for (const line of lines) {
    const t = line.trim()
    if (!t) continue
    try {
      out.push(JSON.parse(t))
    } catch (e) {
      /* 容错：跳过损坏行（如进程中断导致的半行） */
    }
  }
  return out
}

// ===== 会话 CRUD =====
// automation（定时任务）：任务生成的系统会话标记（taskId/taskName），
// 侧栏据此归入「⏰ 自动化」分组；autoTitle=false 保留固定标题不被 LLM 重命名
function createSession({ spaceId, title, workspaceId, workspaceDir, displayName, autoTitle, automation } = {}) {
  const id = newId()
  const now = Date.now()
  const meta = {
    id,
    title: title || '新对话',
    spaceId: spaceId || '',
    // 会话绑定的工作空间（发送前必须选定）
    workspaceId: workspaceId || null,
    // 会话工作空间的本地磁盘路径（创建时快照，供列表分组展示）
    workspaceDir: workspaceDir || '',
    // 工作空间展示名（未填写时按磁盘路径呈现）
    displayName: displayName || '',
    createdAt: now,
    updatedAt: now
  }
  if (autoTitle === false) meta.autoTitle = false
  if (automation && typeof automation === 'object') meta.automation = automation
  writeMeta(id, meta)
  return meta
}

// 更新会话绑定的工作空间与展示信息（发送时以用户当前选择为准）
function setWorkspace(id, workspaceId, workspaceDir, displayName) {
  const meta = readMeta(id)
  if (!meta) return null
  meta.workspaceId = workspaceId || null
  if (workspaceDir !== undefined) meta.workspaceDir = workspaceDir || ''
  if (displayName !== undefined) meta.displayName = displayName || ''
  writeMeta(id, meta)
  return meta
}

// 列出全部会话（按更新时间倒序）
function listSessions() {
  if (!fs.existsSync(sessionsRoot)) return []
  const out = []
  for (const name of fs.readdirSync(sessionsRoot)) {
    const meta = readMeta(name)
    if (meta && meta.id) out.push(meta)
  }
  out.sort((a, b) => b.updatedAt - a.updatedAt)
  return out
}

function getMessages(id) {
  return readMessages(id)
}

// 更新某条消息的点赞/点踩标记（'like' | 'dislike' | '' 取消）：
// JSONL 追加式存储，更新即读全量 → 改目标行 → 整文件重写
function setFeedback(id, messageId, feedback) {
  const file = path.join(sessionDir(id), 'messages.jsonl')
  if (!fs.existsSync(file)) return { ok: false, error: '会话不存在' }
  const list = readMessages(id)
  const hit = list.find(m => m.id === messageId)
  if (!hit) return { ok: false, error: '消息不存在' }
  if (feedback === 'like' || feedback === 'dislike') hit.feedback = feedback
  else delete hit.feedback
  fs.writeFileSync(file, list.map(m => JSON.stringify(m)).join('\n') + '\n')
  return { ok: true }
}

// 更新某条消息的附加字段（thinkingSummary 等异步补写）：读全量 → 改目标行 → 整文件重写。
// 读改写为同步连续执行（单线程事件循环内原子），与流式期间的 append 不会交错
function updateMessageField(id, messageId, key, value) {
  const file = path.join(sessionDir(id), 'messages.jsonl')
  if (!fs.existsSync(file)) return { ok: false }
  const list = readMessages(id)
  const hit = list.find(m => m.id === messageId)
  if (!hit) return { ok: false }
  hit[key] = value
  fs.writeFileSync(file, list.map(m => JSON.stringify(m)).join('\n') + '\n')
  return { ok: true }
}

function touch(id) {
  const meta = readMeta(id)
  if (meta) {
    meta.updatedAt = Date.now()
    writeMeta(id, meta)
  }
}

// ===== pi 会话条目映射 =====
// 自有消息 id → pi 会话树 entry id 的映射（<sessionId>/pi-map.json 独立小文件），
// 供分支线路切换时原生 branch() 定位锚点；映射缺失时发送链路自动兜底回放重建
function piMapFile(id) {
  return path.join(sessionDir(id), 'pi-map.json')
}

function getPiEntryMap(id) {
  try {
    return JSON.parse(fs.readFileSync(piMapFile(id), 'utf-8')) || {}
  } catch (e) {
    return {}
  }
}

// 合并式写入（单条/批量增量：正常回合后的映射回填）
function setPiEntry(id, messageId, entryId) {
  if (!messageId || !entryId) return
  const map = getPiEntryMap(id)
  map[messageId] = entryId
  try {
    fs.mkdirSync(sessionDir(id), { recursive: true })
    fs.writeFileSync(piMapFile(id), JSON.stringify(map))
  } catch (e) { /* 写失败：后续 branch 兜底回放，不影响对话 */ }
}

// 全量替换（回放重建后：pi 树整体重建，旧映射全部作废）
// entries: [{ mid, entryId }]
function replacePiEntries(id, entries) {
  const map = {}
  for (const e of (entries || [])) {
    if (e && e.mid && e.entryId) map[e.mid] = e.entryId
  }
  try {
    fs.mkdirSync(sessionDir(id), { recursive: true })
    fs.writeFileSync(piMapFile(id), JSON.stringify(map))
  } catch (e) { /* 写失败：后续 branch 兜底回放，不影响对话 */ }
}

// 追加消息并同步元数据（首条用户消息自动作为标题）
// 支持附加字段：toolName/args/result/isError（工具调用）、question/options/answer（ask_user）
function addMessage(id, msg) {
  const meta = readMeta(id)
  if (!meta) throw new Error('会话不存在: ' + id)
  const record = {
    id: newId(),
    role: msg.role,
    content: msg.content || '',
    createdAt: Date.now()
  }
  // 附加字段白名单（工具调用 / 回问记录 / 思考过程 / 供应商错误 / token 用量 / 图片附件 / 上下文压缩摘要 / 文件附件 / 模型名 / 文件变更 diff / 会话内分支 / 导出产物清单 / @ 引用路径 / 中途正文标记 / 联网引文来源 / 本轮耗时）
  const extras = ['toolName', 'args', 'result', 'isError', 'fileChange', 'artifacts', 'question', 'options', 'answer', 'todos', 'thinking', 'error', 'usage', 'images', 'compaction', 'fileAttachments', 'model', 'editOf', 'anchors', 'atRefs', 'mid', 'sources', 'seconds']
  for (const key of extras) {
    if (msg[key] !== undefined) record[key] = msg[key]
  }
  appendMessage(id, record)
  // 标题 = 第一个问题的前 24 字；此后不再变动（旧版 LLM 总结遗留的占位名一并修复）
  if (msg.role === 'user' && ['新对话', '未命名的对话', ''].includes(meta.title || '')) {
    meta.title = (msg.content || '').trim().slice(0, 24) || '新对话'
    // 标记为自动截断标题：首轮回答完成后由 LLM 生成正式标题替换；
    // 手动重命名时置 false，自动标题不再覆盖
    meta.autoTitle = true
  }
  meta.updatedAt = Date.now()
  writeMeta(id, meta)
  return { meta, record }
}

function renameSession(id, title) {
  const meta = readMeta(id)
  if (!meta) return null
  meta.title = String(title || '').trim().slice(0, 60) || meta.title
  // 用户手动重命名：自动标题让位，后续不再覆盖
  meta.autoTitle = false
  meta.updatedAt = Date.now()
  writeMeta(id, meta)
  return meta
}

// 置顶/取消置顶：pinned=true 时记 pinnedAt（多任务置顶按置顶时间倒序）。
// 不改 updatedAt —— 置顶是展示偏好，不应扰动列表的时间序语义
function setPinned(id, pinned) {
  const meta = readMeta(id)
  if (!meta) return null
  if (pinned) {
    meta.pinned = true
    meta.pinnedAt = Date.now()
  } else {
    delete meta.pinned
    delete meta.pinnedAt
  }
  writeMeta(id, meta)
  return meta
}

// 自动标题落盘：仅当未被手动重命名（autoTitle=true）时写入。
// autoTitle 保持 true 不清除 —— 每轮问答结束后都基于全会话内容重新生成、
// 持续刷新标题；只有用户手动重命名（renameSession 置 false）后才永久让位
function applyAutoTitle(id, title) {
  const meta = readMeta(id)
  if (!meta || !meta.autoTitle) return null
  const t = String(title || '').trim().slice(0, 30)
  if (!t) return null
  meta.title = t
  meta.updatedAt = Date.now()
  writeMeta(id, meta)
  return meta
}

// 产出计数累计（阶段三交付物闭环）：tool_end 带产物时累加 meta.artifactCount，
// 会话列表据此渲染「产出 N 个文件」徽标。不改 updatedAt ——
// 产物落地已由消息追加驱动更新时间，此处只维护计数
function bumpArtifactCount(id, count) {
  const n = Number(count) || 0
  if (n <= 0) return null
  const meta = readMeta(id)
  if (!meta) return null
  meta.artifactCount = (Number(meta.artifactCount) || 0) + n
  writeMeta(id, meta)
  return meta
}

function deleteSession(id) {
  fs.rmSync(sessionDir(id), { recursive: true, force: true })
  // 联动标记定时任务运行历史（防 lastRun/runs 指向已删会话的幽灵引用）。
  // 函数内延迟 require：sessions 为纯存储模块，避免顶层耦合；
  // scheduler 不依赖本模块，无循环引用风险
  try {
    require('../platform/scheduler').markSessionDeleted(id)
  } catch (e) { /* scheduler 未初始化等场景忽略 */ }
}

// 跨会话搜索：标题 + 消息内容，返回带片段的命中列表
// ===== 回退与分支（基于 JSONL 事件溯源） =====
// 元数据 branch：{ of: 源会话id, from: 分支点消息id }；无 branch 字段即主干。

// 回退：丢弃某条消息及其之后的所有记录（用于"从此处重新提问"）
// 返回新的消息列表
function truncateFrom(id, messageId) {
  const msgs = readMessages(id)
  const idx = msgs.findIndex(m => m.id === messageId)
  if (idx < 0) return msgs
  const kept = msgs.slice(0, idx)
  fs.writeFileSync(
    path.join(sessionDir(id), 'messages.jsonl'),
    kept.map(m => JSON.stringify(m)).join('\n') + (kept.length ? '\n' : '')
  )
  touch(id)
  return kept
}

// 创建分叉：以某条消息为分叉点，拷贝到该消息为止（含分叉点本身）的记录到新会话（源会话不动）
// 分叉会话继承源会话的工作空间绑定（列表按源工作空间分组、打开即锁定空间）
// 返回新会话 meta（branch 标记来源与分叉点，列表页可显示分支标识）
function branchFrom(id, messageId, { spaceId } = {}) {
  const src = readMeta(id)
  if (!src) return null
  const msgs = readMessages(id)
  const idx = msgs.findIndex(m => m.id === messageId)
  if (idx < 0) return null
  // 含分叉点消息本身（分叉语义 = 复制到当前节点的完整上下文）；
  // 一轮回答在 JSONL 中为多条记录（首条 assistant → tool → 后续 assistant…），
  // fork 按钮携带的是本轮首条记录 id，须向后扩展到本轮全部记录（遇下一条 user 停止），
  // 否则分叉会话只剩"深度思考"而丢失正文
  let end = idx + 1
  while (end < msgs.length && msgs[end].role !== 'user') end++
  const kept = msgs.slice(0, end)
  const created = createSession({
    spaceId: spaceId || src.spaceId,
    title: (src.title || '分支') + ' · 分支',
    workspaceId: src.workspaceId,
    workspaceDir: src.workspaceDir,
    displayName: src.displayName
  })
  // 逐条浅拷贝追加（保留 id / anchors / editOf 等，重开会话按分支视图渲染）
  for (const m of kept) appendMessage(created.id, Object.assign({}, m))
  const meta = readMeta(created.id) || created
  meta.branch = { of: id, from: messageId }
  writeMeta(created.id, meta)
  return meta
}

// ===== 跨会话搜索 =====
function searchSessions(q) {
  const query = String(q || '').trim().toLowerCase()
  if (!query) return []
  const out = []
  for (const s of listSessions()) {
    if ((s.title || '').toLowerCase().includes(query)) {
      out.push({ id: s.id, name: s.title, snippet: '' })
      continue
    }
    for (const m of readMessages(s.id)) {
      if ((m.content || '').toLowerCase().includes(query)) {
        const idx = m.content.toLowerCase().indexOf(query)
        const start = Math.max(0, idx - 20)
        out.push({
          id: s.id,
          name: s.title,
          snippet: '…' + m.content.slice(start, start + 60).replace(/\n/g, ' ') + '…'
        })
        break
      }
    }
  }
  return out.slice(0, 20)
}

module.exports = {
  // 初始化存储根目录
  initSessions,
  // 创建新会话（含工作空间绑定与自动化标记）
  createSession,
  // 列出全部会话（按更新时间倒序）
  listSessions,
  // 读取会话全部消息
  getMessages,
  // 更新消息点赞/点踩标记
  setFeedback,
  // 更新消息附加字段（异步补写，如 thinkingSummary）
  updateMessageField,
  // 追加消息并同步元数据
  addMessage,
  // 手动重命名（停用自动标题）
  renameSession,
  // 写入 LLM 自动标题
  applyAutoTitle,
  // 产出计数累计（会话列表「产出 N 个文件」徽标数据源）
  bumpArtifactCount,
  // 置顶/取消置顶
  setPinned,
  // 删除会话目录
  deleteSession,
  // 跨会话搜索（标题+内容）
  searchSessions,
  // 刷新会话更新时间
  touch,
  // 回退：丢弃指定消息及其后记录
  truncateFrom,
  // 分叉：从指定消息创建分支会话
  branchFrom,
  // 更新工作空间绑定
  setWorkspace,
  // 读取会话元数据
  readMeta,
  // pi 会话条目映射：自有消息 id → pi entry id
  getPiEntryMap,
  // 合并写入单条 pi 映射
  setPiEntry,
  // 全量替换 pi 映射
  replacePiEntries
}
