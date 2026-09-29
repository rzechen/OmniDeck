// OmniBuddy 会话持久化：不可变追加日志（JSONL）+ 会话元数据（JSON）
// 存储结构：userData/omnibuddy/sessions/<sessionId>/{meta.json, messages.jsonl}
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

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
// automation（P2 定时任务）：任务生成的系统会话标记（taskId/taskName），
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

function touch(id) {
  const meta = readMeta(id)
  if (meta) {
    meta.updatedAt = Date.now()
    writeMeta(id, meta)
  }
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
  // 附加字段白名单（工具调用 / 回问记录 / 思考过程 / 供应商错误 / token 用量 / 图片附件 / 上下文压缩摘要 / 文件附件 / 模型名 / 文件变更 diff / 会话内分支 / 导出产物清单）
  const extras = ['toolName', 'args', 'result', 'isError', 'fileChange', 'artifacts', 'question', 'options', 'answer', 'todos', 'thinking', 'error', 'usage', 'images', 'compaction', 'fileAttachments', 'model', 'editOf', 'anchors']
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

function deleteSession(id) {
  fs.rmSync(sessionDir(id), { recursive: true, force: true })
}

// 跨会话搜索：标题 + 消息内容，返回带片段的命中列表
// ===== 回退与分支（M4，基于 JSONL 事件溯源） =====
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
  initSessions,
  createSession,
  listSessions,
  getMessages,
  setFeedback,
  addMessage,
  renameSession,
  applyAutoTitle,
  setPinned,
  deleteSession,
  searchSessions,
  touch,
  truncateFrom,
  branchFrom,
  setWorkspace,
  readMeta
}
