// OmniBuddy 手机远程任务：内网穿透场景下的极简遥控入口。
// 形态：agent 进程内起一个 Node http 服务（默认仅 127.0.0.1，由飞鸽 / frp /
// Tailscale 等隧道转发到公网），托管一个自包含移动端页面——发任务、
// 实时看执行进度（SSE）。每次任务创建一个系统会话（meta.remote 标记），
// 复用 pi 会话工厂与 handlePiEvent 事件链（与定时任务 manual 触发同模式）；
// 权限确认 / ask_user 沿现有前端管线（PC 端确认，手机端仅展示等待提示）。
// 事件分流：chat-state.emit 的同进程订阅（addEmitListener）→ 按白名单
// 瘦身 → SSE 广播；结果推送不做（用户要求，实时进度已覆盖）。
// 配置：<baseDir>/remote.json { enabled, port, host, token, publicUrl, workspaceId }
const { ipcMain } = require('electron')
const http = require('http')
const os = require('os')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const sessions = require('../sessions/sessions')
const workspaces = require('../workspace/workspaces')
const scheduler = require('../platform/scheduler')
const permissions = require('../platform/permissions')
const sandbox = require('../platform/sandbox')
const piRuntime = require('../pi')
const { emit, running, automationTurnErrors, addEmitListener, pendingPermissions, pendingAsks } = require('../core/chat-state')
const { writeExitSummary } = require('../core/direct-llm')
const { deleteSessionFast } = require('../core/pi-events')

const DEFAULT_PORT = 7360

// ===== 远程页面（Vue 独立构建：vite.remote.config.js → dist/remote.html 单文件内联） =====
// 开发态在项目根 dist/，打包后在 asar 根 dist/（与渲染产物同目录）。
// mtime 热载：build:remote 重跑后无需重启应用，页面即时换新（文件未变则走缓存）
const REMOTE_PAGE_FILE = path.join(__dirname, '..', '..', '..', 'dist', 'remote.html')
let pageHtmlCache = ''
let pageMtimeMs = 0

function loadPage() {
  try {
    const st = fs.statSync(REMOTE_PAGE_FILE)
    if (pageHtmlCache && st.mtimeMs === pageMtimeMs) return pageHtmlCache
    pageHtmlCache = fs.readFileSync(REMOTE_PAGE_FILE, 'utf-8')
    pageMtimeMs = st.mtimeMs
    return pageHtmlCache
  } catch (e) {
    console.warn('[omnibuddy:remote] 远程页面未构建（dist/remote.html 缺失），请执行 npm run build:remote')
    return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1"></head>' +
      '<body style="font:15px/1.6 -apple-system,sans-serif;padding:32px;color:#666">' +
      '远程页面未构建：请先在 PC 端执行 <b>npm run build:remote</b></body></html>'
  }
}

// ===== 运行态 =====
let cfgFile = ''
let cfg = null
let server = null
let getWindow = null
let handlePiEvent = null
// 当前运行中的远程会话 id（空 = 空闲；单并发，新任务在运行中会被拒绝）
let currentRemote = ''
// SSE 客户端：Set<ServerResponse>
const sseClients = new Set()
let sseHeartbeat = null

// ===== 配置读写 =====
function defaultConfig() {
  return {
    enabled: false,
    port: DEFAULT_PORT,
    // 默认仅回环：由隧道客户端（飞鸽 / frp 等）转发，不直接暴露局域网；改 0.0.0.0 可局域网直连
    host: '127.0.0.1',
    token: crypto.randomBytes(16).toString('hex')
  }
}

function readConfig() {
  const def = defaultConfig()
  try {
    const saved = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'))
    if (!saved || typeof saved !== 'object') return def
    return {
      enabled: saved.enabled === true,
      port: Number(saved.port) > 0 ? Math.floor(Number(saved.port)) : def.port,
      host: saved.host === '0.0.0.0' ? '0.0.0.0' : '127.0.0.1',
      token: typeof saved.token === 'string' && saved.token.length >= 16 ? saved.token : def.token
    }
  } catch (e) {
    return def
  }
}

function persistConfig() {
  try {
    fs.mkdirSync(path.dirname(cfgFile), { recursive: true })
    fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2))
  } catch (e) {
    console.warn('[omnibuddy:remote] 配置写入失败：', e && e.message)
  }
}

// 局域网 IPv4 清单（访问地址展示 / 二维码用）
function lanIps() {
  const out = []
  const ifs = os.networkInterfaces()
  for (const name of Object.keys(ifs)) {
    for (const it of ifs[name] || []) {
      if (it.family === 'IPv4' && !it.internal) out.push(it.address)
    }
  }
  return out
}

// 访问地址清单（含 token）：本机回环 / 局域网 IP（0.0.0.0 时），
// 公网可达性由用户自备的隧道（飞鸽等）转发本机端口实现
function accessUrls() {
  const q = '/?token=' + cfg.token
  if (cfg.host === '0.0.0.0') {
    const urls = lanIps().map(ip => ({ label: '局域网', url: 'http://' + ip + ':' + cfg.port + q }))
    urls.push({ label: '本机', url: 'http://127.0.0.1:' + cfg.port + q })
    return urls
  }
  return [{ label: '本机', url: 'http://127.0.0.1:' + cfg.port + q }]
}

// ===== SSE =====
function sseWrite(res, event) {
  try {
    res.write('data: ' + JSON.stringify(event) + '\n\n')
  } catch (e) { /* 客户端已断开 */ }
}

function broadcastSse(event) {
  for (const res of Array.from(sseClients)) sseWrite(res, event)
}

// 事件瘦身：白名单类型 + 字段裁剪（公网链路只传移动端渲染所需的最小载荷）
const SLIM_TYPES = new Set([
  'user_message', 'assistant_start', 'delta', 'thinking', 'assistant_end',
  'tool_start', 'tool_end', 'todo_update', 'permission_ask', 'permission_done', 'ask_user', 'ask_done',
  'chat_deleted',
  'done', 'error', 'interrupted', 'pi_unavailable'
])
// 各字段保留长度（默认 300；正文类放宽）
const SLIM_LENGTH = { text: 12000, content: 12000, thinking: 4000, result: 2000, question: 1000 }

function clip(v, max) {
  const s = String(v == null ? '' : v)
  return s.length > max ? s.slice(0, max) + '…' : s
}

// 工具参数摘要：常见键直取，其余整体 JSON 截断（工具条一行展示用）
function briefArgs(args) {
  if (!args || typeof args !== 'object') return ''
  const keys = ['command', 'url', 'path', 'pattern', 'query', 'file_path', 'filePath', 'expr', 'script', 'content']
  for (const k of keys) {
    if (args[k]) return clip(args[k], 200)
  }
  try { return clip(JSON.stringify(args), 200) } catch (e) { return '' }
}

// 内部机制类工具不进移动端过程流（框架自身的检索/延迟加载与第三方 MCP
// 接入细节，对用户是噪音；内置业务工具照常展示）
const HIDDEN_TOOLS = /^(mcp__|tool_search$)/

function slimEvent(data) {
  if (!data || !SLIM_TYPES.has(data.type)) return null
  const t = data.type
  if ((t === 'tool_start' || t === 'tool_end') && HIDDEN_TOOLS.test(String(data.toolName || ''))) return null
  const out = { type: t, sessionId: data.sessionId }
  if (t === 'user_message') {
    out.message = { id: data.message && data.message.id, role: 'user', content: clip(data.message && data.message.content, 12000) }
  } else if (t === 'delta' || t === 'thinking') {
    out.text = clip(data.text, SLIM_LENGTH.text)
  } else if (t === 'assistant_end') {
    out.content = clip(data.content, SLIM_LENGTH.content)
    out.thinking = clip(data.thinking, SLIM_LENGTH.thinking)
    out.usage = data.usage || null
  } else if (t === 'tool_start') {
    out.toolCallId = data.toolCallId
    out.toolName = data.toolName
    out.brief = briefArgs(data.args)
  } else if (t === 'tool_end') {
    out.toolCallId = data.toolCallId
    out.toolName = data.toolName
    out.isError = !!data.isError
    out.result = clip(data.result, SLIM_LENGTH.result)
    out.artifacts = Array.isArray(data.artifacts)
      ? data.artifacts.slice(0, 5).map(a => ({ name: a && (a.name || a.path || '') })).filter(a => a.name)
      : undefined
  } else if (t === 'todo_update') {
    out.todos = Array.isArray(data.todos) ? data.todos.slice(0, 30) : []
  } else if (t === 'permission_ask') {
    out.askId = data.askId
    out.surface = data.surface || data.toolName || ''
    out.toolName = data.toolName || ''
    out.brief = briefArgs({ command: data.command, url: data.url, path: data.value || data.path })
  } else if (t === 'permission_done') {
    // 审批已决（任一端：PC / 手机）：移动端移除待审批条
    out.askId = data.askId
  } else if (t === 'ask_user') {
    out.callId = data.callId
    out.question = clip(data.question, 1000)
    out.options = Array.isArray(data.options) ? data.options.slice(0, 8) : []
    out.multiSelect = !!data.multiSelect
  } else if (t === 'ask_done') {
    // 问答已答（任一端：PC / 手机）：移动端移除待回答条
    out.callId = data.callId
  } else if (t === 'chat_deleted') {
    // 任务被删除（任一端发起）：移动端正查看该详情则退回列表（sessionId 已统一携带）
  } else if (t === 'error') {
    out.error = clip(data.error, 1000)
  }
  return out
}

// emit 分流 → SSE：推全部会话事件（PC 端 + 手机端发起），
// 页面按 viewId 自行过滤；token 鉴权下仅用户自己可达
function onEmit(data) {
  const slim = slimEvent(data)
  if (slim) broadcastSse(slim)
}

// ===== 远程任务执行体（仿 automation manual 触发的简化版：单次执行、无重试） =====
// workspaceId 可选：手机端选定的工作空间；缺省回落列表第一个
// providerId 可选：手机端指定的模型；缺省按 最近对话快照 → 默认模型 回落
// 返回 { ok, sessionId } / { ok: false, error }
async function runRemoteTask(text, workspaceId, providerId) {
  if (currentRemote) return { ok: false, error: '已有远程任务在运行中，请等待完成或先停止' }

  // 模型：指定 → 最近对话快照 → 默认模型（resolveProvider 公共回落）
  const provider = resolveProvider(providerId)
  if (provider.error) return provider

  // 工作空间：手机端选定 → 校验存在；缺省回落列表第一个
  // displayName 取该空间名——PC 侧栏按 displayName 分组，远程任务与 PC 端
  // 同空间的会话归入同一分组，不产生独立的「手机任务」组
  let wsId = typeof workspaceId === 'string' && workspaceId ? workspaceId : ''
  let wsDir = wsId ? workspaces.resolve(wsId) : ''
  let wsName = ''
  const resolveName = (id) => {
    const hit = workspaces.list().find(w => w.id === id)
    return hit ? (hit.name || hit.path || '') : ''
  }
  if (wsId && !wsDir) return { ok: false, error: '所选工作空间不存在，请重新选择' }
  if (!wsDir) {
    const list = workspaces.list()
    if (!list.length) return { ok: false, error: '未配置工作空间：请先在 PC 端添加' }
    wsId = list[0].id
    wsDir = workspaces.resolve(wsId)
    if (!wsDir) return { ok: false, error: '工作空间不可用' }
  }
  wsName = resolveName(wsId)

  const body = String(text || '').trim().slice(0, 8000)
  if (!body) return { ok: false, error: '任务内容为空' }

  // 会话与 PC 端发起的会话完全同构：不传标题（'新对话' 起步，addMessage
  // 取首条消息前 24 字，首轮回答后由 LLM 生成正式标题）、不区分来源
  const meta = sessions.createSession({
    workspaceId: wsId,
    workspaceDir: wsDir,
    displayName: wsName
  })
  const chatId = meta.id
  currentRemote = chatId

  // 用户消息即原文（与 PC 端发送一致，不加任何远程前缀话术）
  const { record } = sessions.addMessage(chatId, { role: 'user', content: body })
  emit(getWindow, chatId, { type: 'user_message', message: record })

  // 回合后台执行：HTTP 即时返回 sessionId（新建后立即跳详情页），过程/终态走 SSE
  executeTurn(chatId, provider.value, wsDir, body).catch(e => {
    console.warn('[omnibuddy:remote] 回合执行异常：', e && e.message)
  })
  return { ok: true, sessionId: chatId }
}

// 会话追问（手机详情页继续对话）：原文注入既有会话，不加强制前缀
async function runRemoteFollowup(sessionId, text, providerId) {
  if (!sessionId) return { ok: false, error: '会话不存在' }
  if (running.has(sessionId)) return { ok: false, error: '当前任务正在执行中，请等待完成' }
  const meta = sessions.readMeta(sessionId)
  if (!meta) return { ok: false, error: '会话不存在' }

  const provider = resolveProvider(providerId)
  if (provider.error) return provider
  const wsDir = meta.workspaceId ? workspaces.resolve(meta.workspaceId) : ''
  if (!wsDir) return { ok: false, error: '会话工作空间不可用' }

  const body = String(text || '').trim().slice(0, 8000)
  if (!body) return { ok: false, error: '内容为空' }

  const { record } = sessions.addMessage(sessionId, { role: 'user', content: body })
  emit(getWindow, sessionId, { type: 'user_message', message: record })

  // 回合后台执行：即时返回，追问气泡与回答由事件流渲染
  executeTurn(sessionId, provider.value, wsDir, body).catch(e => {
    console.warn('[omnibuddy:remote] 回合执行异常：', e && e.message)
  })
  return { ok: true, sessionId }
}

// 模型解析（新建 / 追问共用）：指定 → 最近对话快照 → 默认模型；
// 返回 { value: provider } 或 { error }
function resolveProvider(providerId) {
  const providers = scheduler.getProviders()
  if (providerId) {
    const hit = providers.find(x => x.id === providerId) || null
    if (!hit) return { error: '所选模型不存在，请重新选择' }
    return { value: hit }
  }
  const snap = scheduler.getProviderSnapshot()
  let provider = null
  if (snap && snap.baseUrl && snap.model) {
    provider = providers.find(x => x.id === snap.id) || snap
  }
  if (!provider || !provider.baseUrl || !provider.model) {
    provider = providers.find(x => x.isDefault) || providers[0] || null
  }
  if (!provider || !provider.baseUrl || !provider.model) {
    return { error: '未配置模型：请先在 PC 端「模型管理」添加模型' }
  }
  return { value: provider }
}

// 回合执行核心（新建 / 追问共用）：running 注册 → pi 会话 prompt → 终态广播
async function executeTurn(chatId, provider, wsDir, promptText) {
  currentRemote = chatId
  const entry = { abort: null, mode: 'pi', model: provider.model, anchors: [] }
  running.set(chatId, entry)
  // 运行态广播：已连接的移动端即时更新 runningId（输入框禁用 / 列表运行徽标）；
  // 终态由 done/error/interrupted 事件清除
  try { broadcastSse({ type: 'remote_state', current: { sessionId: chatId } }) } catch (e) { /* 忽略 */ }
  let interruptedBy = '' // '' 无 / 'manual' 用户停止
  entry.abort = () => { interruptedBy = 'manual'; piRuntime.interruptSession(chatId) }
  let result = { ok: true, sessionId: chatId }
  let failError = ''
  let failFromEvent = false // turn_error 事件路径（错误已落盘并广播，勿重复）
  automationTurnErrors.delete(chatId)

  try {
    // 复用 pi 会话工厂与事件链：PC 端打开该会话即可看到与手机一致的执行过程
    const session = await piRuntime.getOrCreateSession(chatId, provider, [], e => {
      return handlePiEvent(getWindow, e)
    }, wsDir)
    await session.prompt(promptText, { streamingBehavior: 'followUp' })
    if (interruptedBy === 'manual') {
      failError = '执行被中断'
    } else {
      failError = automationTurnErrors.get(chatId) || ''
      failFromEvent = !!failError
    }
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')))
    failError = interruptedBy || aborted ? '执行被中断' : ((err && err.message) || '未知错误')
  } finally {
    running.delete(chatId)
    currentRemote = ''
  }

  if (!failError) {
    // 完成：显式释放流式态（远程任务不走 session:send，无 done 发射点；幂等）
    emit(getWindow, chatId, { type: 'done' })
    sessions.touch(chatId)
    try { writeExitSummary(chatId) } catch (e) { /* 摘要失败不影响结果 */ }
  } else {
    if (!failFromEvent) {
      try {
        sessions.addMessage(chatId, {
          role: 'assistant',
          content: '（任务' + (failError === '执行被中断' ? '中断：' : '执行失败：') + failError + '）',
          error: failError
        })
      } catch (e) { /* 会话已删除等忽略 */ }
      emit(getWindow, chatId, failError === '执行被中断'
        ? { type: 'interrupted' }
        : { type: 'error', error: failError })
    }
    result = { ok: false, sessionId: chatId, error: failError }
  }
  return result
}

// ===== 会话数据（恢复 / 回放） =====
// JSONL 记录 → 移动端时间线项（瘦身：只保留页面渲染所需字段）
function sessionView(id) {
  let msgs = []
  try { msgs = sessions.getMessages(id) } catch (e) { return null }
  const items = []
  for (const m of msgs) {
    if (!m || !m.role) continue
    if (m.role === 'user') {
      items.push({ kind: 'user', text: clip(m.content, 12000) })
    } else if (m.role === 'assistant') {
      // thinking / mid / usage 随行带出：回放侧按「思考进过程组、中途正文归
      // 过程说明、最终回答连续合并」重建，与 PC 端回合语义一致（usage 供
      // 回答下方的 token 用量展示）
      items.push({
        kind: 'assistant',
        text: clip(m.content, 12000),
        thinking: m.thinking ? clip(m.thinking, 6000) : '',
        mid: !!m.mid,
        error: m.error ? clip(m.error, 1000) : '',
        usage: m.usage || null
      })
    } else if (m.role === 'tool') {
      // 内部机制类工具与实时流同口径过滤
      if (HIDDEN_TOOLS.test(String(m.toolName || ''))) continue
      items.push({ kind: 'tool', toolName: m.toolName || '', brief: briefArgs(m.args), isError: !!m.isError })
    } else if (m.role === 'permission') {
      items.push({ kind: 'permission', surface: m.surface || m.toolName || '', decided: m.decided || '' })
    } else if (m.role === 'ask_user') {
      items.push({ kind: 'ask', question: clip(m.question, 1000), answer: clip(m.answer, 1000) })
    }
  }
  return items
}

// 总览（移动端列表页数据源）：按工作空间分组的任务清单——该空间下
// 的全部会话（PC 端发起 + 手机远程下发），与 PC 侧栏分组口径一致。
// 空间组全部呈现（无任务的组显示空态）；未绑定/空间已删的会话归
// 「其他」兜底组（无内容不返回）。每组只带首页任务（分页拉取 /api/tasks）
const PAGE_SIZE = 10 // 每页条数（列表首页 & 加载更多共用）

// 任务条目映射（stateView 首页 / /api/tasks 分页共用）；
// running 直查运行注册表（PC 会话与远程任务同样判定）
function taskItem(m) {
  return {
    id: m.id,
    title: m.title || '未命名任务',
    updatedAt: m.updatedAt || 0,
    running: running.has(m.id)
  }
}

// 按空间归组——与 PC 侧栏（BuddyTaskList）完全同规则：
// 分组键 = displayName || workspaceDir || '未关联目录'（定时任务会话
// displayName 固定为「定时任务」，自然成组）；组顺序按组内最新会话出现序
// （listSessions 按 updatedAt 倒序遍历，插入序即最新组在前）
function groupSessions() {
  const map = new Map()
  const groups = []
  const groupKeyOf = (m) => {
    const n = m.displayName && String(m.displayName).trim()
    return n || m.workspaceDir || '未关联目录'
  }
  for (const m of sessions.listSessions()) {
    if (!m.id) continue
    const key = groupKeyOf(m)
    let g = map.get(key)
    if (!g) {
      g = { id: key, name: key, wsId: '', tasks: [] }
      map.set(key, g)
      groups.push(g)
    }
    if (!g.wsId && m.workspaceId) g.wsId = m.workspaceId
    g.tasks.push(m)
  }
  return { groups }
}

function stateView() {
  const { groups } = groupSessions()
  const paginate = (g) => {
    g.total = g.tasks.length
    g.tasks = g.tasks.slice(0, PAGE_SIZE).map(m => taskItem(m))
    g.hasMore = g.total > g.tasks.length
    return g
  }
  return {
    ok: true,
    // 当前正在运行的远程任务（空 = 空闲）
    current: (currentRemote && running.has(currentRemote)) ? { sessionId: currentRemote } : null,
    // 分组仅从会话派生（与 PC 一致：空工作空间不显示组）
    groups: groups.map(paginate)
  }
}

// ===== HTTP 服务 =====
function tokenFromReq(req, urlObj, body) {
  const q = urlObj.searchParams.get('token') || ''
  const auth = req.headers.authorization || ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const b = body && typeof body === 'object' ? String(body.token || '') : ''
  return q || bearer || b
}

function authorized(req, urlObj, body) {
  return tokenFromReq(req, urlObj, body) === cfg.token
}

function json(res, code, data) {
  const buf = Buffer.from(JSON.stringify(data))
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store' })
  res.end(buf)
}

function readBody(req) {
  return new Promise(resolve => {
    let raw = ''
    req.on('data', c => {
      raw += c
      if (raw.length > 64 * 1024) req.destroy() // 超限断开
    })
    req.on('end', () => {
      try { resolve(JSON.parse(raw || '{}')) } catch (e) { resolve({}) }
    })
    req.on('error', () => resolve({}))
  })
}

async function handleApi(req, res, urlObj) {
  const p = urlObj.pathname
  // 健康探测（无 token，无敏感信息）
  if (p === '/api/health') return json(res, 200, { ok: true, name: 'OmniDeck Remote' })

  const body = (req.method === 'POST') ? await readBody(req) : {}
  if (!authorized(req, urlObj, body)) return json(res, 401, { ok: false, error: 'unauthorized' })

  if (p === '/api/state' && req.method === 'GET') {
    return json(res, 200, stateView())
  }

  if (p === '/api/session' && req.method === 'GET') {
    const id = String(urlObj.searchParams.get('id') || '')
    // 会话存在即可查（PC 端 + 手机端发起的任务统一开放）
    const meta = sessions.readMeta(id)
    if (!id || !meta) return json(res, 404, { ok: false, error: 'session not found' })
    const items = sessionView(id)
    if (!items) return json(res, 404, { ok: false, error: 'session not found' })
    // 空间名（详情页输入框锁定展示；定时任务等无空间会话回退 displayName）
    const wsHit = meta.workspaceId ? workspaces.list().find(w => w.id === meta.workspaceId) : null
    const wsName = wsHit ? (wsHit.name || wsHit.path || '') : (meta.displayName || '')
    // 运行态（PC 会话与远程任务同判定）：进页恢复，执行中禁用追问输入框
    return json(res, 200, { ok: true, items, workspaceName: clip(wsName, 200), running: running.has(id) })
  }

  if (p === '/api/workspaces' && req.method === 'GET') {
    // 工作空间清单（手机端任务发起前选择）
    return json(res, 200, { ok: true, workspaces: workspaces.list().map(w => ({ id: w.id, name: w.name })) })
  }

  // 组内任务分页：group = 分组键（displayName || workspaceDir || 未关联目录，
  // 与 /api.state 的 groups[].id 同源）；按 updatedAt 倒序，offset/limit 分页
  if (p === '/api/tasks' && req.method === 'GET') {
    const qGroup = String(urlObj.searchParams.get('group') || '')
    if (!qGroup) return json(res, 400, { ok: false, error: 'group required' })
    const offset = Math.max(0, Math.floor(Number(urlObj.searchParams.get('offset')) || 0))
    const limit = Math.min(50, Math.max(1, Math.floor(Number(urlObj.searchParams.get('limit')) || PAGE_SIZE)))
    const { groups } = groupSessions()
    const bucket = groups.find(x => x.id === qGroup) || null
    if (!bucket) return json(res, 404, { ok: false, error: 'group not found' })
    const total = bucket.tasks.length
    const tasks = bucket.tasks.slice(offset, offset + limit).map(m => taskItem(m))
    return json(res, 200, { ok: true, tasks, total, hasMore: offset + tasks.length < total })
  }

  // 模型清单（新建任务页选择）：镜像列表（不含 apiKey），defaultId 为默认选中
  // （最近对话快照 → 默认模型，与任务执行的回落一致）
  if (p === '/api/providers' && req.method === 'GET') {
    const providers = scheduler.getProviders()
    const snap = scheduler.getProviderSnapshot()
    let defaultId = (snap && snap.baseUrl && snap.model && providers.some(x => x.id === snap.id)) ? snap.id : ''
    if (!defaultId) {
      const def = providers.find(x => x.isDefault) || providers[0]
      defaultId = def ? def.id : ''
    }
    return json(res, 200, {
      ok: true,
      defaultId,
      providers: providers.map(x => ({ id: x.id, name: x.name || '', model: x.model || '', isDefault: !!x.isDefault }))
    })
  }

  if (p === '/api/task' && req.method === 'POST') {
    const text = String(body.text || '')
    if (!text.trim()) return json(res, 400, { ok: false, error: '任务内容为空' })
    // sessionId 有值 = 详情页追问（既有会话继续对话）；否则新建远程任务
    const sid = String(body.sessionId || '')
    const r = sid
      ? await runRemoteFollowup(sid, text, body.providerId)
      : await runRemoteTask(text, body.workspaceId, body.providerId)
    // 事件流（user_message 等）已由 emit 分流先行推送；此处仅回执行结果
    return json(res, r.ok ? 200 : 409, r)
  }

  // 删除任务（移动端发起）：与 PC 端 omnibuddy:session:delete 同一快速通道
  // （deleteSessionFast：中止运行中回合 → 清运行时与磁盘记录 → 后台摘要留档）。
  // 顺带清该会话的审批/问答挂起与远程任务引用；广播 remote_state（列表刷新）
  // + chat_deleted（PC 侧栏移除 / 移动端详情页退回），双端同步
  if (p === '/api/task/delete' && req.method === 'POST') {
    const sid = String(body.sessionId || '')
    if (!sid) return json(res, 400, { ok: false, error: '缺少 sessionId' })
    try { await deleteSessionFast(sid) } catch (e) {
      return json(res, 500, { ok: false, error: '删除失败：' + (e && e.message || e) })
    }
    if (currentRemote === sid) currentRemote = ''
    for (const [askId, e] of pendingPermissions) { if (e.chatId === sid) pendingPermissions.delete(askId) }
    for (const [callId, e] of pendingAsks) { if (e.chatId === sid) pendingAsks.delete(callId) }
    broadcastSse({ type: 'remote_state', current: stateView().current })
    broadcastSse({ type: 'chat_deleted', sessionId: sid })
    emit(getWindow, sid, { type: 'chat_deleted', sessionId: sid })
    return json(res, 200, { ok: true })
  }

  if (p === '/api/interrupt' && req.method === 'POST') {
    // sessionId 有值可停任意运行中会话（PC 会话 + 远程任务统一 abort 协议）；
    // 缺省停当前远程任务。中断后 interrupted 事件 → 终态 → 各端恢复空闲
    const sid = String(body.sessionId || currentRemote || '')
    const entry = sid ? running.get(sid) : null
    if (!entry) return json(res, 200, { ok: true, idle: true })
    try { entry.abort && entry.abort() } catch (e) { /* 忽略 */ }
    return json(res, 200, { ok: true })
  }

  // ===== 人工审批（移动端命令审批） =====
  // 未决审批清单：pendingPermissions 快照（chain 路径）+ ui.select 兜底路径的
  // pendingUiAsks（ui- 前缀，replyUiAsk 应答）。详情页按 sessionId 过滤
  if (p === '/api/permission/pending' && req.method === 'GET') {
    const asks = []
    for (const [askId, entry] of pendingPermissions) {
      asks.push({
        askId,
        sessionId: entry.chatId,
        surface: entry.info.surface || entry.info.toolName || '',
        toolName: entry.info.toolName || '',
        brief: briefArgs({ command: entry.info.command, url: entry.info.url, path: entry.info.value || entry.info.path })
      })
    }
    for (const u of (piRuntime.getPendingUiAsks() || [])) {
      asks.push({
        askId: u.askId,
        sessionId: u.sessionId,
        surface: u.surface || u.toolName || '',
        toolName: u.toolName || '',
        brief: briefArgs({ command: u.command, url: u.url, path: u.value || u.path })
      })
    }
    return json(res, 200, { ok: true, asks })
  }

  // 审批决策：与 PC 端 omnibuddy:permission:reply 同一 resolve 通道
  // （pendingPermissions → verdictPromise），action 白名单一致；
  // ui- 前缀走 replyUiAsk（select 兜底路径）；广播 permission_done
  // 让 PC 确认卡与移动端待审批条同步移除
  if (p === '/api/permission' && req.method === 'POST') {
    const askId = String(body.askId || '')
    const sid = String(body.sessionId || '')
    const act = ['allow', 'allow_session', 'allow_always', 'deny'].indexOf(body.action) >= 0 ? body.action : 'deny'
    // select 兜底路径：先校验归属再应答（replyUiAsk 先删后 resolve，无法回退）
    if (askId.startsWith('ui-')) {
      const u = (piRuntime.getPendingUiAsks() || []).find(x => x.askId === askId)
      if (!u || u.sessionId !== sid) return json(res, 404, { ok: false, error: '审批请求不存在或已处理' })
      piRuntime.replyUiAsk(askId, act)
      emit(getWindow, sid, { type: 'permission_done', askId })
      return json(res, 200, { ok: true })
    }
    const entry = pendingPermissions.get(askId)
    if (!entry || entry.chatId !== sid) return json(res, 404, { ok: false, error: '审批请求不存在或已处理' })
    pendingPermissions.delete(askId)
    if (act === 'allow_always') {
      // 始终允许：策略持久化与 PC 端同源（网络面写沙箱配置，其余写权限 config）
      if (entry.info.surface === 'network') sandbox.persistNetworkAllow(entry.info.value)
      else permissions.persistAlwaysAllow(piRuntime.agentDir, entry.info.surface)
    }
    emit(getWindow, entry.chatId, { type: 'permission_done', askId })
    entry.resolve(act)
    return json(res, 200, { ok: true })
  }

  // ===== ask_user 问答（移动端回答 Agent 中途提问） =====
  // 未决问答清单：pendingAsks 快照，详情页按 sessionId 过滤
  if (p === '/api/ask/pending' && req.method === 'GET') {
    const asks = []
    for (const [callId, entry] of pendingAsks) {
      asks.push({
        callId,
        sessionId: entry.chatId,
        question: clip(entry.question, 1000),
        options: Array.isArray(entry.options) ? entry.options.slice(0, 8) : [],
        multiSelect: !!entry.multiSelect
      })
    }
    return json(res, 200, { ok: true, asks })
  }

  // 问答应答：与 PC 端 omnibuddy:ask-user:reply 同一 resolve 通道 + 落盘
  // role:'ask_user' 记录（回放一致）；广播 ask_done 让 PC 卡片与移动端
  // 待回答条同步移除
  if (p === '/api/ask' && req.method === 'POST') {
    const callId = String(body.callId || '')
    const sid = String(body.sessionId || '')
    const value = String(body.value == null ? '' : body.value)
    const entry = pendingAsks.get(callId)
    if (!entry || entry.chatId !== sid) return json(res, 404, { ok: false, error: '问答请求不存在或已回答' })
    pendingAsks.delete(callId)
    entry.resolve(value)
    sessions.addMessage(sid, Object.assign({
      role: 'ask_user',
      question: entry.question,
      options: entry.options,
      multiSelect: entry.multiSelect || undefined,
      answer: value
    }, entry.anchors && entry.anchors.length ? { anchors: entry.anchors } : {}))
    emit(getWindow, sid, { type: 'ask_done', callId })
    return json(res, 200, { ok: true })
  }

  return json(res, 404, { ok: false, error: 'not found' })
}

function startServer() {
  if (server) return
  server = http.createServer((req, res) => {
    const urlObj = new URL(req.url, 'http://localhost')
    // 移动端页面（Vue 单文件内联产物，同源部署零额外请求）
    if (req.method === 'GET' && (urlObj.pathname === '/' || urlObj.pathname === '/index.html')) {
      const buf = Buffer.from(loadPage())
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': buf.length, 'Cache-Control': 'no-store' })
      return res.end(buf)
    }
    // SSE：手机页实时进度流（token 走 query：EventSource 无法带 header）
    if (req.method === 'GET' && urlObj.pathname === '/api/events') {
      if (!authorized(req, urlObj, null)) return json(res, 401, { ok: false, error: 'unauthorized' })
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      })
      res.write(':connect\n\n')
      sseClients.add(res)
      // 立即补发当前状态（重连后页面据此恢复运行中标识）
      try { sseWrite(res, { type: 'remote_state', current: stateView().current }) } catch (e) { /* 忽略 */ }
      req.on('close', () => sseClients.delete(res))
      return
    }
    if (urlObj.pathname.startsWith('/api/')) {
      handleApi(req, res, urlObj).catch(err => {
        try { json(res, 500, { ok: false, error: (err && err.message) || 'server error' }) } catch (e) { /* 已响应忽略 */ }
      })
      return
    }
    json(res, 404, { ok: false, error: 'not found' })
  })
  server.on('error', err => {
    console.warn('[omnibuddy:remote] HTTP 服务异常：', err && err.message)
    server = null
  })
  server.listen(cfg.port, cfg.host, () => {
    console.log('[omnibuddy:remote] 远程任务服务已启动：' + cfg.host + ':' + cfg.port)
  })
}

function stopServer() {
  if (!server) return
  try { server.close() } catch (e) { /* 忽略 */ }
  server = null
  for (const res of Array.from(sseClients)) {
    try { res.end() } catch (e) { /* 忽略 */ }
  }
  sseClients.clear()
}

// ===== 设置页 IPC =====
function registerIpc() {
  ipcMain.handle('omnibuddy:remote:config', () => {
    return {
      ok: true,
      config: {
        enabled: cfg.enabled,
        port: cfg.port,
        host: cfg.host,
        token: cfg.token
      },
      urls: accessUrls(),
      running: !!currentRemote,
      listening: !!server
    }
  })

  // 保存配置（enabled / port / host 变化即时生效：需要时重启监听；
  // token 不经此通道，只能重置；工作空间由手机端发起任务时选择）
  ipcMain.handle('omnibuddy:remote:save', (_e, patch) => {
    const p = patch || {}
    let restart = false
    if (p.port !== undefined) {
      const port = Math.floor(Number(p.port))
      if (port > 0 && port < 65536 && port !== cfg.port) { cfg.port = port; restart = true }
    }
    if (p.host === '0.0.0.0' || p.host === '127.0.0.1') {
      if (cfg.host !== p.host) { cfg.host = p.host; restart = true }
    }
    if (p.enabled !== undefined) {
      const enabled = p.enabled === true
      if (cfg.enabled !== enabled) {
        cfg.enabled = enabled
        restart = true
      }
    }
    persistConfig()
    if (restart) {
      stopServer()
      if (cfg.enabled) startServer()
    }
    return { ok: true, urls: accessUrls(), listening: !!server }
  })

  // 重置配对 token（旧手机立即失效）
  ipcMain.handle('omnibuddy:remote:regen-token', () => {
    cfg.token = crypto.randomBytes(16).toString('hex')
    persistConfig()
    return { ok: true, token: cfg.token, urls: accessUrls() }
  })
}

// ===== 生命周期 =====
function init(baseDir, deps) {
  cfgFile = path.join(baseDir, 'remote.json')
  cfg = readConfig()
  getWindow = deps.getWindow
  handlePiEvent = deps.handlePiEvent
  addEmitListener(onEmit)
  // SSE 心跳：防隧道空闲断连（15s 注释行）
  sseHeartbeat = setInterval(() => {
    for (const res of Array.from(sseClients)) {
      try { res.write(':ping\n\n') } catch (e) { sseClients.delete(res) }
    }
  }, 15 * 1000)
  sseHeartbeat.unref && sseHeartbeat.unref()
  persistConfig() // 首次落盘（生成 token）
  if (cfg.enabled) startServer()
}

module.exports = {
  init,
  registerIpc,
  runRemoteTask
}
