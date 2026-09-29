// OmniBuddy Agent IPC：会话管理 + 流式对话
// 渲染进程通过 preload 暴露的 window.omnibuddy 调用；流式事件经 'omnibuddy:event' 推送。
// M2：优先走 pi Agent 循环（工具调用 / ask-user / todo / 社区扩展）；
//      pi 加载失败时回退到 llm.js 纯对话（OpenAI 兼容流式）。
const fs = require('fs')
const path = require('path')
const { ipcMain, app, dialog, BrowserWindow, Notification } = require('electron')
const sessions = require('./sessions')
const { streamChat } = require('./llm')
const piRuntime = require('./pi')
const sandbox = require('./sandbox')
const permissions = require('./permissions')
const capabilities = require('./capabilities')
const skills = require('./skills')
const workspaces = require('./workspaces')
const files = require('./files')
const mcp = require('./mcp')
const credentials = require('./credentials')
const webSearch = require('./web-search')
const rules = require('./rules')
const profile = require('./profile')
const memory = require('./memory')
const attachments = require('./attachments')
const market = require('./market')
const connectors = require('./connectors')
const usage = require('./usage')
const exportSession = require('./export')
const docExport = require('./doc-export')
const checkpoints = require('./checkpoints')
const fileChanges = require('./file-changes')
const branchView = require('./branchView')
const scheduler = require('./scheduler')
const workflows = require('./workflows')

// 兜底路径的系统提示词（结构参考 pi 的 buildAutonomousSystemPrompt：
// 角色定位 + 回答原则 + 输出格式 + 动态运行环境；每次请求实时生成）
function buildFallbackSystemPrompt(workspaceDir) {
  const osName = { darwin: 'macOS', win32: 'Windows', linux: 'Linux' }[process.platform] || process.platform
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  const now = new Date()
  const pad = n => String(n).padStart(2, '0')
  const datetime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ` +
    `${pad(now.getHours())}:${pad(now.getMinutes())}（周${'日一二三四五六'[now.getDay()]}）`
  return [
    '你是 OmniBuddy —— 运行在 OmniDeck 桌面应用中的智能工作助手，帮助用户解答问题、编写与分析代码、处理日常事务。',
    '',
    '## 回答原则',
    '1. 回答简洁、准确、友好；先给结论，再给必要的解释。',
    '2. 始终使用用户提问时的语言回答。',
    '3. 代码、命令与技术内容使用 Markdown 输出，代码块标注语言并附关键注释。',
    '4. 涉及时间、路径、系统信息时，以下方「运行环境」为准，不要臆测。',
    '5. 不确定时明确说明假设；需求有歧义时先向用户确认再继续。',
    '6. 涉及破坏性操作（删除、覆盖等）时提醒风险并请用户确认。',
    '',
    '## 输出格式',
    '- 结构化内容用标题与列表组织，避免大段堆砌。',
    '- 给出修改建议时指明涉及的文件路径与位置。',
    '',
    '## 运行环境',
    `- 当前时间：${datetime}（${tz}）`,
    `- 操作系统：${osName}（${process.arch}）`,
    `- 工作目录：${workspaceDir || '未指定'}`
  ].join('\n')
}

// 运行中的请求：sessionId -> { abort, mode, model, anchors }
const running = new Map()
// 各会话上次发送的分支线路（anchors key）：切换线路时 pi 会话须丢弃重建
// （pi 上下文与 JSONL 分支视图保持一致）
const sessionAnchorKeys = new Map()
// 待回答的 ask_user：callId -> resolve
const pendingAsks = new Map()
// 待回答的权限确认：askId -> { resolve, chatId, info, anchors }
// 无超时：一直等用户决策；仅 interrupt / reply 终结（可见性由前端"等待授权"徽标保证）
const pendingPermissions = new Map()

// 当前轮次的分支线路（落盘 assistant/tool 等记录时写入 anchors，渲染层按线路过滤）
function runAnchors(chatId) {
  const a = (running.get(chatId) || {}).anchors
  return Array.isArray(a) && a.length ? a.slice() : null
}

function emit(getWindow, chatId, payload) {
  // 广播至所有窗口（主窗口 + 快捷面板等）：各窗口按 sessionId 自行过滤
  const data = Object.assign({ sessionId: chatId }, payload)
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('omnibuddy:event', data)
      }
    } catch (e) { /* 窗口销毁竞态忽略 */ }
  }
}

// ===== 自动生成会话标题 =====
// 每轮回答完成后，用 provider 的 OpenAI 兼容端点直调、基于整个会话内容
// 重新生成简短标题（会话主题可能随后续问答演进）。仅当未被手动重命名
// （meta.autoTitle=true）时写入；inflight 防并发（生成中的下一轮直接跳过，
// 再下一轮问答结束会再次触发）；失败静默保留原标题，不影响对话
const titleInflight = new Set()
async function maybeAutoTitle(getWindow, chatId, assistantText) {
  try {
    const meta = sessions.readMeta(chatId)
    if (!meta || !meta.autoTitle) return
    if (titleInflight.has(chatId)) return
    titleInflight.add(chatId)
    try {
      const info = piRuntime.getProviderInfo()
      if (!info || !info.baseUrl || !info.model) return
      // 全会话摘要：首条提问（主题锚点）+ 最近若干轮 user/assistant 交替，
      // 每条截断控制总长；取自 JSONL（assistant_end 先落盘再 emit，已含本轮回答）
      const msgs = sessions.getMessages(chatId).filter(m => m.role === 'user' || m.role === 'assistant')
      if (!msgs.length) return
      const recent = msgs.slice(-9)
      if (msgs.length > 9 && msgs[0].role === 'user') recent.unshift(msgs[0])
      const lines = []
      for (const m of recent) {
        const tag = m.role === 'user' ? '用户' : '助手'
        const text = String(m.content || '').replace(/\s+/g, ' ').trim()
        if (text) lines.push(tag + '：' + text.slice(0, m.role === 'user' ? 300 : 200))
      }
      if (!lines.length) return
      const prompt = [
        '根据下面的完整对话历史生成一个简短的中文标题，概括整个会话的核心主题。',
        '要求：不超过 12 个字；只输出标题文本本身，不要引号、句号或任何解释。',
        '',
        '当前标题（供参考，可推翻）：' + (meta.title || '（无）'),
        '',
        '对话历史：',
        lines.join('\n')
      ].join('\n')
      const res = await fetch(String(info.baseUrl).replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: Object.assign(
          { 'content-type': 'application/json' },
          info.apiKey ? { authorization: 'Bearer ' + info.apiKey } : {}
        ),
        body: JSON.stringify({
          model: info.model,
          messages: [{ role: 'user', content: prompt }],
          // 思考型模型的 reasoning 过程也计入 max_tokens，过小会导致正文为空
          max_tokens: 1024,
          temperature: 0.3,
          stream: false
        }),
        signal: AbortSignal.timeout(15000)
      })
      if (!res.ok) {
        console.warn('[omnibuddy:title] HTTP', res.status, '—保留原标题')
        return
      }
      const data = await res.json()
      const choice = data.choices && data.choices[0]
      const raw = String((choice && choice.message && choice.message.content) || '')
      const firstLine = raw.split('\n').map(t => t.trim()).filter(Boolean)[0] || ''
      const title = firstLine
        .replace(/^["'“”「『【(<（]+/, '')
        .replace(/["'“”」』】>)）.。]+$/, '')
        .slice(0, 30)
      if (!title) {
        // 诊断：finish_reason=length 说明 token 仍被思考耗尽；reasoning 模型可换非思考模型
        console.warn('[omnibuddy:title] 空响应，保留原标题（finish_reason=' +
          ((choice && choice.finish_reason) || '?') + ', completion=' + ((data.usage && data.usage.completion_tokens) || 0) + '）')
        return
      }
      // 与原标题相同则不写盘不广播（避免每轮无谓刷新侧栏/页签）
      if (title === meta.title) return
      const updated = sessions.applyAutoTitle(chatId, title)
      if (updated) {
        console.log('[omnibuddy:title]', chatId, '→', updated.title)
        emit(getWindow, chatId, { type: 'title', title: updated.title })
      }
    } finally {
      titleInflight.delete(chatId)
    }
  } catch (e) {
    console.warn('[omnibuddy:title] 生成失败（不影响对话）:', (e && e.message) || e)
  }
}

// ===== 会话记忆摘要（每轮对话结束后沉淀） =====
// pi-memory 的 session_shutdown 摘要走 SDK 内部 LLM 链路（modelRegistry 取 key +
// pi-ai complete），在自定义 provider 运行时下存在多个静默失败点（失败不落盘、
// 无日志）。此处用已验证可用的 provider 直调（与自动标题同链路）生成同格式
// Session Summary，写入 pi-memory 的 memory/daily/<本地日期>.md —— 其
// before_agent_start 注入逻辑按文件读取，不关心写入者，记忆照常生效。
// 触发时机：每轮回答完成（done）即刷新本会话摘要（同会话旧条目整体替换，
// 上下文随对话演进）；退出前再兜底跑一次（内容未变则跳过）。
// 门槛与去重：≥4 条消息；全 None. 空摘要丢弃（与 pi-memory 同策略）
const SUMMARY_MIN_MESSAGES = 4
const summaryInflight = new Set()

function dailyLogPath() {
  const d = new Date()
  const pad = x => String(x).padStart(2, '0')
  const date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  return path.join(piRuntime.agentDir, 'memory', 'daily', date + '.md')
}

function isSummaryEmpty(text) {
  const lines = String(text || '').split('\n').map(t => t.trim())
    .filter(t => t && !t.startsWith('#'))
  if (!lines.length) return true
  return lines.every(t => /^none\.?$/i.test(t.replace(/^[-*+]\s*/, '')))
}

// 同会话旧 Session Summary 块整体替换；无旧块则追加（块 = <!-- … [sid] --> 注释行至下一块前）
function upsertSummaryEntry(existing, sid8, entry) {
  const lines = existing ? existing.split('\n') : []
  let start = -1
  let end = lines.length
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('<!-- ') === 0 && lines[i].indexOf('[' + sid8 + ']') >= 0) {
      start = i
      break
    }
  }
  if (start >= 0) {
    for (let j = start + 1; j < lines.length; j++) {
      if (lines[j].indexOf('<!-- ') === 0) { end = j; break }
    }
    const next = lines.slice(0, start).concat(entry.split('\n'), lines.slice(end))
    return { text: next.join('\n'), replaced: true }
  }
  return { text: existing && existing.trim() ? existing.replace(/\n*$/, '\n\n') + entry : entry, replaced: false }
}

async function writeExitSummary(chatId) {
  try {
    if (summaryInflight.has(chatId)) return
    summaryInflight.add(chatId)
    try {
      const info = piRuntime.getProviderInfo()
      if (!info || !info.baseUrl || !info.model) return
      const msgs = sessions.getMessages(chatId).filter(m => m.role === 'user' || m.role === 'assistant')
      if (msgs.length < SUMMARY_MIN_MESSAGES) return
      const file = dailyLogPath()
      const existing = fs.existsSync(file) ? fs.readFileSync(file, 'utf-8') : ''
      // 对话序列化（user/assistant 交替，限总长防超上下文）
      const lines = []
      let total = 0
      for (const m of msgs) {
        const tag = m.role === 'user' ? '用户' : '助手'
        const text = String(m.content || '').replace(/\s+/g, ' ').trim()
        if (!text) continue
        const piece = tag + '：' + text.slice(0, 600)
        if (total + piece.length > 24000) break
        lines.push(piece)
        total += piece.length
      }
      if (lines.length < 2) return
      const prompt = [
        'Review the conversation and extract important decisions, lessons learned, notes, and follow-ups for a daily log.',
        'Return markdown only with these exact headings:',
        '### Decisions',
        '### Lessons Learned',
        '### Notes',
        '### Follow-ups',
        'Use bullet points under each heading. If there is nothing, write "None.". Use the same language as the conversation.',
        '',
        '<conversation>',
        lines.join('\n'),
        '</conversation>'
      ].join('\n')
      const res = await fetch(String(info.baseUrl).replace(/\/+$/, '') + '/chat/completions', {
        method: 'POST',
        headers: Object.assign(
          { 'content-type': 'application/json' },
          info.apiKey ? { authorization: 'Bearer ' + info.apiKey } : {}
        ),
        body: JSON.stringify({
          model: info.model,
          messages: [{ role: 'user', content: prompt }],
          // 思考型模型的 reasoning 过程也计入 max_tokens，过小会导致正文为空
          max_tokens: 2048,
          temperature: 0.2,
          stream: false
        }),
        signal: AbortSignal.timeout(20000)
      })
      if (!res.ok) {
        console.warn('[omnibuddy:memory] 摘要 HTTP', res.status, '—跳过', chatId)
        return
      }
      const data = await res.json()
      const choice = data.choices && data.choices[0]
      const summary = String((choice && choice.message && choice.message.content) || '').trim()
      if (!summary) {
        console.warn('[omnibuddy:memory] 摘要空响应（finish_reason=' +
          ((choice && choice.finish_reason) || '?') + ', completion=' + ((data.usage && data.usage.completion_tokens) || 0) + '）')
        return
      }
      if (isSummaryEmpty(summary)) return
      const ts = new Date().toISOString().slice(0, 19).replace('T', ' ')
      const sid8 = chatId.slice(0, 8)
      const entry = [
        '<!-- ' + ts + ' [' + sid8 + '] -->',
        '## Session Summary (auto, exit: session-end)',
        '',
        summary
      ].join('\n')
      const next = upsertSummaryEntry(existing, sid8, entry)
      if (next.text === existing) return
      fs.mkdirSync(path.dirname(file), { recursive: true })
      fs.writeFileSync(file, next.text, 'utf-8')
      console.log('[omnibuddy:memory] 会话摘要已' + (next.replaced ? '刷新' : '写入'), path.basename(file), '<-', sid8)
    } finally {
      summaryInflight.delete(chatId)
    }
  } catch (e) {
    console.warn('[omnibuddy:memory] 摘要生成失败（不影响对话）:', (e && e.message) || e)
  }
}

// 工具结果规整为字符串：pi 的部分工具返回结构化对象（content 块数组 / output 等），
// 提取文本内容；无文本字段时 JSON 序列化兜底（前端字符串渲染不出现 [object Object]）
function normalizeToolResult(v) {
  if (v == null) return ''
  if (typeof v === 'string') return v
  if (typeof v === 'object') {
    const texts = []
    if (Array.isArray(v.content)) {
      for (const c of v.content) {
        if (c && c.type === 'text' && typeof c.text === 'string') texts.push(c.text)
      }
    }
    for (const k of ['output', 'text', 'stdout', 'stderr']) {
      if (typeof v[k] === 'string' && v[k]) texts.push(v[k])
    }
    if (texts.length) return texts.join('\n')
    try { return JSON.stringify(v, null, 2) } catch (err) { return String(v) }
  }
  return String(v)
}

// pi 运行事件：转发渲染进程 + 持久化到 JSONL
function handlePiEvent(getWindow, e) {
  const { kind, chatId } = e
  switch (kind) {
    case 'assistant_start':
      emit(getWindow, chatId, { type: 'assistant_start' })
      break
    case 'delta':
      emit(getWindow, chatId, { type: 'delta', text: e.text })
      break
    case 'thinking':
      // 思考过程：仅实时下发，不落盘（属临时推理内容）
      emit(getWindow, chatId, { type: 'thinking', text: e.text })
      break
    case 'skill':
      // skill 激活（模型读取 SKILL.md）：实时下发
      emit(getWindow, chatId, { type: 'skill', skillName: e.skillName, toolCallId: e.toolCallId })
      break
    case 'assistant_end':
      // 回复日志：若供应商返回“积分不足”类文案，会在此原样呈现
      // 临时诊断（mid 拆分问题定位）：mid、running 表状态、chatId 全打印后移除
      console.log('[omnibuddy][diag] assistant_end mid=', !!e.mid,
        'running=', running.has(chatId), 'chatId=', chatId,
        'content=', JSON.stringify(String(e.content || '').slice(0, 80)))
      // model 记入消息（用量看板按模型聚合）；usage 复制一份避免同引用；
      // mid（中途正文：本轮流式以工具调用收尾）随记录落盘，重开会话按过程说明归位
      const runModel = (running.get(chatId) || {}).model || ''
      const turnAnchors = runAnchors(chatId)
      const assistantRecord = { role: 'assistant', content: e.content, thinking: e.thinking, usage: e.usage, model: runModel }
      if (e.mid) assistantRecord.mid = true
      const saved = sessions.addMessage(chatId, Object.assign(
        assistantRecord,
        turnAnchors ? { anchors: turnAnchors } : {}
      ))
      // 用量独立账本：与消息落盘同点记一笔（删除会话/解绑空间不影响历史用量）；
      // 标题快照随流水落账（会话删除后 TOP5 仍能显示任务名）
      usage.record(chatId, runModel, e.usage, saved.meta && saved.meta.title)
      // messageId：本轮首条落盘记录 id（前端回填到聚合消息，点赞/分支据此定位）
      emit(getWindow, chatId, { type: 'assistant_end', content: e.content, thinking: e.thinking, mid: !!e.mid, usage: e.usage, messageId: saved.record.id })
      // 自发回合（P3 深度研究）：后台 workflow 结果回注触发的回合无 session:send
      // 流程（不在 running 表），回合收尾（非工具循环）时补发 done 释放前端流式态
      if (!e.mid && !running.has(chatId)) {
        console.log('[omnibuddy][diag] done 补发（P3 幽灵回合）chatId=', chatId) // 临时诊断
        emit(getWindow, chatId, { type: 'done' })
      }
      // 首轮回答完成：后台生成会话标题（是否生成由 meta.autoTitle 判定，手动改名后跳过）
      maybeAutoTitle(getWindow, chatId, e.content)
      break
    case 'turn_error':
      // pi 吞掉的模型请求错误（如供应商 400）：原样透传前端 + 落盘（重开会话仍可见）
      console.log('[omnibuddy] turn_error <-', e.error)
      {
        const errAnchors = runAnchors(chatId)
        sessions.addMessage(chatId, Object.assign(
          { role: 'assistant', content: '', error: e.error },
          errAnchors ? { anchors: errAnchors } : {}
        ))
      }
      emit(getWindow, chatId, { type: 'error', error: e.error })
      break
    case 'tool_start':
      // 检查点（N4 §18.3）：写操作工具执行前快照工作空间（skipped 静默；失败不阻断执行）
      // 文件变更记录（P2）：写工具执行前采集旧内容（供 tool_end 计算 diff）
      if (checkpoints.WRITE_TOOLS.has(e.toolName) || fileChanges.CHANGE_TOOLS.has(e.toolName)) {
        try {
          const meta = sessions.readMeta(chatId)
          const offset = sessions.getMessages(chatId).length
          if (checkpoints.WRITE_TOOLS.has(e.toolName)) {
            checkpoints.snapshotBeforeTool(chatId, meta && meta.workspaceDir, e.toolName, offset)
          }
          fileChanges.beforeTool(e.toolCallId, e.toolName, e.args, meta && meta.workspaceDir)
        } catch (err) { /* 快照/采集失败不阻断工具执行 */ }
      }
      emit(getWindow, chatId, {
        type: 'tool_start',
        toolCallId: e.toolCallId,
        toolName: e.toolName,
        args: e.args
      })
      break
    case 'tool_update':
      emit(getWindow, chatId, { type: 'tool_update', toolCallId: e.toolCallId, partial: e.partial })
      break
    case 'tool_end': {
      // 文件变更记录（P2）：写工具执行后对比新旧内容算 diff（失败调用不产生变更）
      let fileChange = null
      try {
        fileChange = fileChanges.afterTool(e.toolCallId, e.isError)
      } catch (err) { /* diff 失败不影响主流程 */ }
      // 结果规整为字符串：pi 的部分工具返回结构化对象（如 { content: [...] }），
      // 原样透传会被前端渲染成 [object Object]
      const result = normalizeToolResult(e.result)
      const toolAnchors = runAnchors(chatId)
      sessions.addMessage(chatId, Object.assign({
        role: 'tool',
        toolName: e.toolName,
        args: e.args,
        result,
        isError: e.isError,
        fileChange: fileChange || undefined,
        artifacts: e.artifacts || undefined,
        workflow: e.workflow || undefined
      }, toolAnchors ? { anchors: toolAnchors } : {}))
      emit(getWindow, chatId, {
        type: 'tool_end',
        toolCallId: e.toolCallId,
        toolName: e.toolName,
        result,
        isError: e.isError,
        fileChange: fileChange || undefined,
        artifacts: e.artifacts || undefined,
        workflow: e.workflow || undefined
      })
      // 深度研究（P3）：后台 workflow 启动即返回 runId → 轮询落盘状态驱动前端进度卡片
      if (e.workflow && e.workflow.runId && e.workflow.background) {
        try {
          const wfMeta = sessions.readMeta(chatId)
          const wfCwd = wfMeta && wfMeta.workspaceDir
          if (wfCwd) {
            workflows.watchRun(e.workflow.runId, chatId, wfCwd, snap => {
              emit(getWindow, chatId, { type: 'workflow_progress', workflow: snap })
            })
          }
        } catch (err) { /* 轮询启动失败不影响工具事件 */ }
      }
      break
    }
    case 'ask_user': {
      const callId = 'ask-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6)
      const askAnchors = runAnchors(chatId) || []
      // 等待前端回答或中断
      const answerPromise = new Promise((resolve) => {
        pendingAsks.set(callId, { resolve, chatId, question: e.question, options: e.options, multiSelect: !!e.multiSelect, anchors: askAnchors })
        // 中断时以「用户取消了回答」结束
        if (e.signal) {
          e.signal.addEventListener('abort', () => {
            const p = pendingAsks.get(callId)
            if (p) {
              pendingAsks.delete(callId)
              resolve('（用户中断了回答）')
            }
          }, { once: true })
        }
      })
      emit(getWindow, chatId, { type: 'ask_user', callId, question: e.question, options: e.options, multiSelect: !!e.multiSelect })
      return answerPromise
    }
    case 'permission_ask': {
      // 权限系统 ask：转发前端确认卡片（允许 / 本会话内允许 / 拒绝）
      const askId = e.askId
      const info = { surface: e.surface, value: e.value, toolName: e.toolName, command: e.command, path: e.path, preview: e.preview }
      // ui.select 兜底路径（'ui-' 前缀）：等待方是 pi 的 pendingUiAsks，应答走
      // replyUiAsk。绝不能注册进 pendingPermissions —— 否则 reply 先命中此处，
      // resolve 的 verdictPromise 无人消费，真正的 select 永远挂起（点击被吞）
      if (typeof askId === 'string' && askId.indexOf('ui-') === 0) {
        emit(getWindow, chatId, Object.assign({ type: 'permission_ask', askId }, info))
        return null
      }
      const permAnchors = runAnchors(chatId) || []
      // 无超时：确认语义即"一直等用户决策"；可见性由前端保证
      // （工具卡片"等待授权"徽标 + 确认条 + 布局层通知三重提示）
      const verdictPromise = new Promise((resolve) => {
        pendingPermissions.set(askId, { resolve, chatId, info, anchors: permAnchors })
      })
      emit(getWindow, chatId, Object.assign({ type: 'permission_ask', askId }, info))
      return verdictPromise
    }
    case 'permission_decision':
      // 决策广播：仅日志（工具卡片已呈现执行结果/拒绝原因）
      console.log('[omnibuddy] permission', e.result, '/', e.resolution, e.surface, e.value)
      break
    case 'todo_update':
      emit(getWindow, chatId, { type: 'todo_update', todos: e.todos })
      break
    case 'sandbox_status':
      emit(getWindow, chatId, { type: 'sandbox_status', status: e.status })
      break
    case 'compaction_start':
      // 上下文压缩开始：前端展示「整理记忆中…」提示
      emit(getWindow, chatId, { type: 'compaction_start', reason: e.reason })
      break
    case 'compaction_end':
      // 压缩完成：摘要落盘（重开会话可见压缩分界）+ 转发前端
      if (e.summary && !e.aborted && !e.errorMessage) {
        const compactAnchors = runAnchors(chatId)
        sessions.addMessage(chatId, Object.assign({
          role: 'assistant',
          content: e.summary,
          compaction: {
            tokensBefore: e.tokensBefore || 0,
            tokensAfter: e.tokensAfter || 0
          }
        }, compactAnchors ? { anchors: compactAnchors } : {}))
      }
      emit(getWindow, chatId, {
        type: 'compaction_end',
        reason: e.reason,
        aborted: e.aborted,
        willRetry: e.willRetry,
        errorMessage: e.errorMessage,
        tokensBefore: e.tokensBefore,
        tokensAfter: e.tokensAfter
      })
      break
    default:
      break
  }
  return null
}

// 会话标题：首问前 24 字截断（sessions.addMessage）为初始标题；
// 每轮回答完成后由 maybeAutoTitle 以全会话内容重新生成（未被手动重命名时）

function registerOmnibuddyIpc(getWindow, userDataPath) {
  const baseDir = userDataPath || path.join(app.getPath('userData'), 'omnibuddy')
  sessions.initSessions(path.join(baseDir, 'sessions'))
  piRuntime.init(path.join(baseDir, 'pi-agent'))
  sandbox.init(path.join(baseDir, 'pi-agent'))
  skills.init(path.join(baseDir, 'pi-agent'))
  workspaces.init(baseDir)
  files.init(baseDir, getWindow)
  mcp.init(path.join(baseDir, 'pi-agent'))
  credentials.init(baseDir)
  rules.init(path.join(baseDir, 'pi-agent'))
  profile.init(baseDir)
  memory.init(path.join(baseDir, 'pi-agent'))
  workflows.init(path.join(baseDir, 'pi-agent'))
  attachments.init(baseDir)
  market.init(baseDir)
  market.registerIpc()
  checkpoints.init(path.join(baseDir, 'sessions'))
  // 用量独立账本（先于使用：含存量会话 usage 的一次性迁移）
  usage.init(baseDir)

  // ===== 定时任务（P2 自动化） =====
  // 调度器只管「何时跑」；执行体在此注入（无头会话 + pi 运行 + 结果落系统会话）
  scheduler.init(baseDir)
  scheduler.setRunner(runAutomationTask)
  // macOS dock 角标：任务完成且窗口未聚焦时点亮，任意窗口聚焦即清除
  if (process.platform === 'darwin' && app.dock) {
    app.on('browser-window-focus', () => {
      try { app.dock.setBadge('') } catch (e) { /* 忽略 */ }
    })
  }

  // ===== 退出前记忆落盘（自动记忆链路） =====
  // 双路：① 每会话 reload() 触发 pi-memory 原生 session_shutdown 摘要（含 qmd 索引）；
  // ② 自有兜底 writeExitSummary（provider 直调，pi-memory 内部链路静默失败时保底，
  //    按 sid 查重防双写）。逐会话串行（daily 文件追加避免并发写竞态）。
  // 总兜底超时防 provider 挂起导致无法退出（强杀只丢当次摘要）；
  // quitFinalized 防 app.exit() 再次触发 before-quit 造成的递归拦截
  let quitFinalized = false
  app.on('before-quit', (event) => {
    if (quitFinalized) return
    quitFinalized = true
    event.preventDefault()
    const ids = piRuntime.listSessionIds()
    console.log('[omnibuddy] 退出前触发会话记忆摘要（' + ids.length + ' 个活跃会话）…')
    if (!ids.length) {
      app.exit(0)
      return
    }
    const forceExit = setTimeout(() => {
      console.warn('[omnibuddy] 记忆摘要总超时，强制退出')
      app.exit(0)
    }, 20000)
    ;(async () => {
      for (const id of ids) {
        try {
          await piRuntime.finalizeSession(id)
        } catch (e) { /* 原生链路失败不阻断兜底 */ }
        try {
          await writeExitSummary(id)
        } catch (e) { /* 兜底失败不阻断退出 */ }
      }
    })()
      .catch(() => {})
      .finally(() => {
        clearTimeout(forceExit)
        app.exit(0)
      })
  })

  // ===== 定时任务：无头执行体（P2 自动化） =====
  // 每次运行创建一个系统会话（meta.automation 标记，侧栏归「定时任务」分组），
  // 复用 pi 会话工厂与 handlePiEvent 事件链——前端打开该会话即可看到完整执行过程；
  // 权限确认沿现有 permission_ask 链路（前端确认卡 + 布局层通知），
  // 无人应答时由整体超时兜底中断（中断记录落盘，重开会话可见）
  const AUTOMATION_RUN_TIMEOUT_MS = 15 * 60 * 1000

  async function runAutomationTask(task, reason) {
    // 模型配置：最近一次对话所用的 provider 快照（渲染进程 IndexedDB 主进程不可读）
    const snap = scheduler.getProviderSnapshot()
    if (!snap || !snap.baseUrl || !snap.model) {
      return { ok: false, error: '尚未初始化模型配置：请先在任意对话中成功发送一条消息' }
    }
    const workspaceDir = workspaces.resolve(task.workspaceId)
    if (!workspaceDir) {
      return { ok: false, error: '任务关联的工作空间已不存在，请编辑任务重新选择' }
    }
    const pad = n => String(n).padStart(2, '0')
    const d = new Date()
    const stamp = pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    // 系统会话：固定标题（autoTitle=false 不被 LLM 重命名）+ 自动化标记
    const meta = sessions.createSession({
      title: task.name + ' · ' + stamp,
      workspaceId: task.workspaceId,
      workspaceDir,
      displayName: '定时任务',
      autoTitle: false,
      automation: { taskId: task.id, taskName: task.name }
    })
    const chatId = meta.id
    const promptText = [
      '这是定时任务「' + task.name + '」的自动执行请求（' + (reason === 'manual' ? '手动触发' : '按计划触发') + '，执行时间 ' + stamp + '）。',
      '',
      task.prompt,
      '',
      '请自动完成上述任务：优先使用联网搜索等只读工具收集信息，独立完成全部步骤，最终以回复正文交付完整结果；' +
        '写入文件等操作需要授权且可能无人及时应答，请仅在必要时使用。'
    ].join('\n')

    // 落盘用户消息（重开会话可见完整请求）+ 广播任务开始
    const { record } = sessions.addMessage(chatId, { role: 'user', content: promptText })
    emit(getWindow, chatId, { type: 'user_message', message: record })
    emit(getWindow, chatId, { type: 'automation:run', taskId: task.id, taskName: task.name })

    const entry = { abort: null, mode: 'pi', model: snap.model, anchors: [] }
    running.set(chatId, entry)
    // 整体超时：无人值守时防止权限挂起 / 模型空转导致任务永久卡住
    const timeout = setTimeout(() => {
      try { piRuntime.interruptSession(chatId) } catch (e) { /* 忽略 */ }
    }, AUTOMATION_RUN_TIMEOUT_MS)
    let result
    try {
      const session = await piRuntime.getOrCreateSession(chatId, snap, [], e => handlePiEvent(getWindow, e), workspaceDir)
      entry.abort = () => { piRuntime.interruptSession(chatId) }
      await session.prompt(promptText)
      // 回合完成释放前端流式态：定时任务不走 session:send（无 done 发射点），
      // P3 的幽灵回合补发又被 running 表挡住，须在此显式发送（done 幂等）
      emit(getWindow, chatId, { type: 'done' })
      sessions.touch(chatId)
      // 会话记忆摘要（消息数不足门槛时自动跳过）
      writeExitSummary(chatId)
      result = { ok: true, sessionId: chatId }
    } catch (err) {
      const aborted = err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')))
      const reason2 = aborted ? '执行被中断' : ((err && err.message) || '未知错误')
      // 失败/中断落盘（无头运行无人盯屏，重开会话可见）
      try {
        sessions.addMessage(chatId, { role: 'assistant', content: '（任务' + (aborted ? '执行被中断' : '执行失败：' + reason2) + '）', error: reason2 })
      } catch (e) { /* 会话已删除等忽略 */ }
      // 失败/中断同样须释放前端流式态（interrupted 清理运行中工具图标，error 展示原因；
      // 两者均幂等：streaming 已结束则跳过）
      emit(getWindow, chatId, aborted
        ? { type: 'interrupted' }
        : { type: 'error', error: reason2 })
      result = { ok: false, sessionId: chatId, error: reason2 }
    } finally {
      clearTimeout(timeout)
      running.delete(chatId)
    }

    // 结束广播（自动化页/侧栏刷新）+ 原生通知 + dock 角标
    emit(getWindow, chatId, {
      type: 'automation:done',
      taskId: task.id,
      taskName: task.name,
      ok: result.ok,
      error: result.error || '',
      sessionId: chatId
    })
    if (task.notify !== false) {
      try {
        if (Notification.isSupported()) {
          const n = new Notification({
            title: result.ok ? '定时任务已完成' : '定时任务失败',
            body: result.ok
              ? '「' + task.name + '」执行完成，点击查看结果'
              : '「' + task.name + '」执行失败：' + (result.error || '未知错误')
          })
          n.on('click', () => {
            // 复用 quick-panel 的 nav:goto 机制（App.vue 监听跳转）：聚焦 + 直达会话
            const win = getWindow()
            if (win && !win.isDestroyed()) {
              win.show()
              win.focus()
              win.webContents.send('nav:goto', '/omnibuddy?s=' + chatId)
            }
          })
          n.show()
        }
      } catch (e) { /* 通知失败不影响任务 */ }
    }
    if (process.platform === 'darwin' && app.dock) {
      try {
        const win = getWindow()
        if (!win || win.isDestroyed() || !win.isFocused()) app.dock.setBadge('•')
      } catch (e) { /* 忽略 */ }
    }
    return result
  }

  // 定时任务管理 IPC（定时任务页）
  ipcMain.handle('omnibuddy:automation:list', () => ({
    ok: true,
    tasks: scheduler.listTasks().map(t => Object.assign({}, t, { running: scheduler.isTaskRunning(t.id) }))
  }))

  ipcMain.handle('omnibuddy:automation:create', (_e, payload) => scheduler.createTask(payload || {}))

  ipcMain.handle('omnibuddy:automation:update', (_e, { id, patch }) => scheduler.updateTask(id, patch || {}))

  ipcMain.handle('omnibuddy:automation:delete', (_e, id) => scheduler.deleteTask(id))

  // 立即运行（手动触发；不等执行完成即返回，结果经 automation:done 广播）
  ipcMain.handle('omnibuddy:automation:run-now', (_e, id) => {
    if (!id) return { ok: false, error: '参数缺失' }
    scheduler.runNow(id).catch(e =>
      console.warn('[omnibuddy:automation] 手动运行异常：', (e && e.message) || e))
    return { ok: true }
  })

  // 深度研究（P3）：历史会话打开时按 runId 拉取运行最终状态（进度卡片回放）；
  // 若 run 仍在运行（如应用重启后内存轮询已丢），重新挂上轮询继续驱动前端卡片
  ipcMain.handle('omnibuddy:workflow:status', (_e, { runId, chatId }) => {
    let cwd = ''
    try {
      const meta = sessions.readMeta(chatId)
      cwd = meta && meta.workspaceDir
    } catch (e) { /* 无 meta 按无状态处理 */ }
    if (!runId || !cwd) return { ok: false, error: '参数缺失' }
    const workflow = workflows.statusOf(runId, cwd)
    if (!workflow) return { ok: false, error: '运行记录不存在' }
    if (workflow.status === 'running' || workflow.status === 'waiting' || workflow.status === 'paused') {
      try {
        workflows.watchRun(runId, chatId, cwd, snap => {
          emit(getWindow, chatId, { type: 'workflow_progress', workflow: snap })
        })
      } catch (e) { /* 重新挂轮询失败不影响本次状态返回 */ }
    }
    return { ok: true, workflow }
  })

  // ===== 会话资产化（N4） =====
  // 导出：MD / 自包含 HTML（保存对话框 → 写文件 → 可打开所在目录）
  ipcMain.handle('omnibuddy:session:export', async (_e, { id, format }) => exportSession.exportSession(id, format))

  // 打开导出文件所在目录
  ipcMain.handle('omnibuddy:session:export-reveal', (_e, filePath) => exportSession.revealFile(filePath))

  // 单条消息导出（P1 文档导出）：markdown → PDF / Word / HTML（pandoc 管线，
  // 与 doc_export 工具共用 convertMarkdown；保存对话框由用户选择落点）
  ipcMain.handle('omnibuddy:message:export', async (_e, { content, format, filename }) => {
    const md = String(content || '')
    if (!md.trim()) return { ok: false, error: '内容为空，无可导出内容' }
    const fmt = ['pdf', 'docx', 'html'].indexOf(format) >= 0 ? format : 'docx'
    const ext = fmt === 'docx' ? 'docx' : fmt
    const label = { pdf: 'PDF 文档', docx: 'Word 文档', html: '网页' }[fmt]
    const safe = String(filename || 'OmniBuddy-回答').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40)
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), safe + '.' + ext),
      filters: [{ name: label, extensions: [ext] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    const r = docExport.convertMarkdown(md, { format: fmt, outPath: filePath, title: safe })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, filePath: r.filePath }
  })

  // 用量看板：30 天窗口聚合（日/会话TOP5/模型分布）
  ipcMain.handle('omnibuddy:usage:summarize', () => usage.summarize({ days: 30 }))

  // 用量明细导出 CSV
  ipcMain.handle('omnibuddy:usage:export-csv', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), `OmniDeck-用量明细-${Date.now()}.csv`),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    const fs = require('fs')
    fs.writeFileSync(filePath, '\uFEFF' + usage.exportCsv(), 'utf-8')
    return { ok: true, filePath }
  })

  // 检查点：时间线 / 回滚（回滚 = 文件恢复 + 消息截断 + dispose 重建，前端刷新）
  ipcMain.handle('omnibuddy:session:checkpoints', (_e, id) => checkpoints.listCheckpoints(id))

  ipcMain.handle('omnibuddy:session:rollback', async (_e, { id, n }) => {
    if (running.has(id)) {
      return { ok: false, error: '会话回复中，请先停止再回滚' }
    }
    const meta = sessions.readMeta(id)
    const res = checkpoints.rollback(id, n, meta && meta.workspaceDir)
    if (res.ok) {
      await piRuntime.disposeSession(id)
      emit(getWindow, id, { type: 'rolled_back' })
    }
    return res
  })

  // ===== 会话管理 =====
  ipcMain.handle('omnibuddy:sessions:list', () => sessions.listSessions())

  ipcMain.handle('omnibuddy:sessions:search', (_e, q) => sessions.searchSessions(q))

  ipcMain.handle('omnibuddy:session:create', (_e, opts) => sessions.createSession(opts || {}))

  ipcMain.handle('omnibuddy:session:messages', (_e, id) => sessions.getMessages(id))

  // 点赞/点踩持久化（'like' | 'dislike' | '' 取消），写入消息 JSONL 记录
  ipcMain.handle('omnibuddy:session:feedback', (_e, { id, messageId, feedback }) =>
    sessions.setFeedback(id, messageId, feedback))

  ipcMain.handle('omnibuddy:session:rename', (_e, { id, title }) => sessions.renameSession(id, title))

  // 置顶/取消置顶（任务列表置顶 hover 按钮）
  ipcMain.handle('omnibuddy:session:pin', (_e, { id, pinned }) => sessions.setPinned(id, !!pinned))

  ipcMain.handle('omnibuddy:session:delete', async (_e, id) => {
    if (running.has(id)) {
      const r = running.get(id)
      try { r.abort() } catch (err) { /* 忽略 */ }
      running.delete(id)
    }
    // 深度研究（P3）：清理该会话的 workflow 轮询
    workflows.unwatchChat(id)
    // 销毁前触发会话记忆摘要（删除即会话终结，摘要留档）：原生 reload + 自有兜底
    await piRuntime.finalizeSession(id)
    await writeExitSummary(id)
    await piRuntime.disposeSession(id)
    sessions.deleteSession(id)
    return true
  })

  // ===== 流式对话 =====
  // workspaceId 必填：发送前必须选定工作空间（Agent 的文件操作目录）
  // attachments 可选：文件附件 meta（P1-7 “+”选择/拖拽导入，attachments.js），
  //   图片并入 image 块、文本/PDF 抽取全文拼入 prompt；随消息落盘回放
  // anchors 可选：会话内分支线路（渲染层当前显示线的锚点数组）；
  //   上下文按该线路过滤（与前端显示一致），线路变化时 pi 会话丢弃重建
  // userMessageId 可选：编辑重问（分支变体）场景，用户消息已先行落盘
  //   （omnibuddy:session:variant），此处仅触发回答、不重复落盘
  ipcMain.handle('omnibuddy:session:send', async (_e, { id, text, provider, workspaceId, displayName, attachments: fileAttachments, anchors, userMessageId }) => {
    if (running.has(id)) {
      return { ok: false, error: '当前会话正在回复中' }
    }
    if (!provider || !provider.baseUrl || !provider.model) {
      return { ok: false, error: '未配置模型供应商，请先在设置页新建供应商' }
    }
    if (!workspaceId) {
      return { ok: false, error: '请先选择工作空间' }
    }
    // 模型配置快照（P2 定时任务）：任务无头运行使用「最近一次对话的模型」
    scheduler.updateProviderSnapshot(provider)
    const anchorsArr = (Array.isArray(anchors) ? anchors : []).filter(x => typeof x === 'string')
    // 绑定/更新会话工作空间，并解析为目录
    sessions.setWorkspace(id, workspaceId, workspaces.resolve(workspaceId), displayName)
    const workspaceDir = workspaces.resolve(workspaceId)

    // 图片附件：文件附件（attachments）统一为 pi image 块
    const imageBlocks = []
    const imageMeta = []
    for (const a of (Array.isArray(fileAttachments) ? fileAttachments : [])) {
      if (a && a.kind === 'image') {
        const data = attachments.readBase64(a)
        if (!data) continue
        imageBlocks.push({ type: 'image', data, mimeType: a.mime || 'image/png' })
        imageMeta.push({ id: a.id, name: a.name, kind: 'image', thumb: a.thumb || '', path: a.path || '', mime: a.mime || 'image/png' })
      }
    }

    // 文本/PDF 附件：抽取全文拼入 prompt（<attachment> 引用块）
    let promptText = String(text || '')
    const textBlock = await attachments.buildTextBlock(fileAttachments)
    if (textBlock) {
      promptText = promptText + '\n\n' + textBlock
    }

    // 发送日志：定位实际使用的模型/接口（apiKey 脱敏），在主进程终端查看
    const maskedKey = provider.apiKey
      ? provider.apiKey.slice(0, 6) + '***' + provider.apiKey.slice(-4)
      : '(空)'
    console.log('[omnibuddy] send ->', JSON.stringify({
      sessionId: id,
      text: String(text || '').slice(0, 100),
      provider: {
        name: provider.name,
        baseUrl: provider.baseUrl,
        model: provider.model,
        apiKey: maskedKey
      },
      workspaceId,
      workspaceDir
    }))

    // 记录用户消息（首条用户消息自动生成标题；图片附件 meta 随消息落盘；
    // 文本/PDF 附件 meta 记入 fileAttachments，正文保持用户原文；
    // anchors 记录分支线路，渲染层按线路过滤显示）
    // 编辑重问（分支变体）：消息已由 session:variant 落盘，此处直接复用
    let record = null
    if (userMessageId) {
      record = sessions.getMessages(id).find(m => m.id === userMessageId) || null
      if (!record) return { ok: false, error: '原消息不存在，请重试' }
    } else {
      const extras = anchorsArr.length ? { anchors: anchorsArr } : {}
      if (imageMeta.length) extras.images = imageMeta
      if (Array.isArray(fileAttachments) && fileAttachments.length) {
        // path/mime 一并落盘：回放时图片读 base64、文本/PDF 抽取全文均依赖
        extras.fileAttachments = fileAttachments.map(a => ({
          id: a.id, name: a.name, size: a.size, kind: a.kind, thumb: a.thumb || '',
          path: a.path || '', mime: a.mime || ''
        }))
      }
      ;({ record } = sessions.addMessage(id, Object.assign({
        role: 'user',
        content: String(text || '')
      }, extras)))
      emit(getWindow, id, { type: 'user_message', message: record })
    }

    const entry = { abort: null, mode: 'pi', model: provider.model, anchors: anchorsArr }
    running.set(id, entry)

    // 历史回放（pi 会话重建时）：排除刚落盘的本条消息（它经 prompt 发送，
    // 回放会导致重复），并装载图片 base64（pi.js 拼成 image 块）：
    // 文件附件中的图片走 attachments；
    // 文本/PDF 附件回放时同样抽取全文拼入正文（与首发一致，上下文不丢失）；
    // 分支线路过滤：仅回放当前线路上的消息（与渲染层显示一致，
    // 变体消息按组头位置参与上下文，其他线路不回放）
    const allMessages = sessions.getMessages(id)
    const branchActive = branchView.resolveActiveByAnchors(allMessages, anchorsArr)
    const viewList = branchView.computeBranchView(allMessages, branchActive).list
    const history = await Promise.all(viewList
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.id !== record.id)
      .map(async m => {
        const item = { role: m.role, content: m.content }
        const replayText = await attachments.buildTextBlock(m.fileAttachments)
        if (replayText) item.content = String(m.content || '') + '\n\n' + replayText
        const imgs = (m.images || [])
          .map(im => {
            if (im.kind === 'image') {
              const data = attachments.readBase64(im)
              return data ? { data, mimeType: im.mime || 'image/png' } : null
            }
            return null
          })
          .filter(Boolean)
        if (imgs.length) item.images = imgs
        return item
      }))

    try {
      // 分支线路变化：丢弃旧 pi 会话（其上下文对应旧线路），按过滤后的历史重建
      const anchorKey = anchorsArr.join('\u0000')
      if (sessionAnchorKeys.get(id) !== anchorKey) {
        await piRuntime.disposeSession(id)
        sessionAnchorKeys.set(id, anchorKey)
      }

      // 优先 pi Agent 循环；加载失败回退纯对话
      let session = null
      try {
        session = await piRuntime.getOrCreateSession(id, provider, history, (e) => handlePiEvent(getWindow, e), workspaceDir)
      } catch (err) {
        entry.mode = 'fallback'
        emit(getWindow, id, { type: 'pi_unavailable', error: err.message })
      }

      if (session) {
        entry.abort = () => { piRuntime.interruptSession(id) }
        await session.prompt(promptText, imageBlocks.length ? { images: imageBlocks } : undefined)
        const meta = sessions.touch(id)
        console.log('[omnibuddy][diag] done session:send 完成 id=', id) // 临时诊断
        emit(getWindow, id, { type: 'done', title: meta && meta.title })
        // 每轮对话结束即沉淀会话记忆摘要（异步，不阻塞返回；同会话条目覆盖式刷新）
        writeExitSummary(id)
        return { ok: true }
      }

      // ===== 兜底：OpenAI 兼容流式纯对话 =====
      const messages = [{ role: 'system', content: buildFallbackSystemPrompt(workspaceDir) }]
        .concat(history.map(m => ({ role: m.role, content: m.content })))
      const ctrl = new AbortController()
      entry.abort = () => ctrl.abort()
      const full = await streamChat({
        baseUrl: provider.baseUrl,
        apiKey: provider.apiKey,
        model: provider.model,
        messages,
        signal: ctrl.signal,
        onDelta: (_chunk, total) => emit(getWindow, id, { type: 'delta', text: total })
      })
      const { meta } = sessions.addMessage(id, Object.assign(
        { role: 'assistant', content: full },
        anchorsArr.length ? { anchors: anchorsArr } : {}
      ))
      console.log('[omnibuddy][diag] done session:send 完成(2) id=', id) // 临时诊断
      emit(getWindow, id, { type: 'done', title: meta.title })
      // 纯对话兜底路径同样沉淀会话记忆摘要
      writeExitSummary(id)
      return { ok: true }
    } catch (err) {
      // 用户中断（interrupted 事件已先行通知并结束流式态）：
      // abort 异常是停止的正常产物，不重复报错、不落错误气泡
      const aborted = err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')))
      if (aborted) {
        return { ok: true, aborted: true }
      }
      emit(getWindow, id, { type: 'error', error: err.message })
      return { ok: false, error: err.message }
    } finally {
      running.delete(id)
    }
  })

  // 中断当前回复
  ipcMain.handle('omnibuddy:session:interrupt', async (_e, id) => {
    const r = running.get(id)
    if (r && r.abort) {
      try { r.abort() } catch (err) { /* 忽略 */ }
      emit(getWindow, id, { type: 'interrupted' })
    }
    // 中断时拒绝该会话未决的权限确认（authorizer 的 Promise 须终结，否则工具门悬挂）
    for (const [askId, p] of Array.from(pendingPermissions.entries())) {
      if (p.chatId === id) {
        pendingPermissions.delete(askId)
        p.resolve('deny')
      }
    }
    // 同样拒绝 ui.select 兜底路径的未决确认
    piRuntime.rejectUiAsks(id)
    return true
  })

  // ===== 附件导入（P1-7）=====
  // “+”按钮：系统文件选择框（图片 / 文本类 / PDF）
  ipcMain.handle('omnibuddy:attachments:pick', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '支持的附件（图片/文本/PDF）', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'pdf',
          'txt', 'md', 'markdown', 'json', 'csv', 'log', 'yml', 'yaml', 'xml', 'html', 'htm',
          'js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go',
          'rs', 'rb', 'php', 'sh', 'bash', 'zsh', 'sql', 'css', 'scss', 'less', 'ini', 'conf', 'toml', 'env'] }
      ]
    })
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true }
    const { nativeImage } = require('electron')
    const list = []
    for (const p of result.filePaths) {
      const r = attachments.importFile(p, nativeImage)
      if (r.ok) list.push(r.attachment)
    }
    return { ok: true, attachments: list }
  })

  // 拖拽导入：渲染端 webUtils.getPathForFile 取真实路径后调用
  ipcMain.handle('omnibuddy:attachments:import', (_e, filePath) => {
    const { nativeImage } = require('electron')
    return attachments.importFile(String(filePath || ''), nativeImage)
  })

  // ===== ask_user 回答 =====
  ipcMain.handle('omnibuddy:ask-user:reply', (_e, { sessionId, callId, value }) => {
    const p = pendingAsks.get(callId)
    if (!p || p.chatId !== sessionId) return { ok: false }
    pendingAsks.delete(callId)
    p.resolve(String(value || ''))
    // 持久化问答记录
    sessions.addMessage(sessionId, Object.assign({
      role: 'ask_user',
      question: p.question,
      options: p.options,
      multiSelect: p.multiSelect || undefined,
      answer: String(value || '')
    }, p.anchors && p.anchors.length ? { anchors: p.anchors } : {}))
    return { ok: true }
  })

  // ===== 权限确认回答（仅本次 / 本会话内 / 始终允许 / 拒绝） =====
  // 双路分发：chain link（omnibuddy-ui 桥接）优先，未命中走 ui.select 兜底权威
  ipcMain.handle('omnibuddy:permission:reply', (_e, { sessionId, askId, action }) => {
    const act = ['allow', 'allow_session', 'allow_always', 'deny'].indexOf(action) >= 0 ? action : 'deny'
    const p = pendingPermissions.get(askId)
    if (p && p.chatId === sessionId) {
      pendingPermissions.delete(askId)
      // 始终允许：把该面 ask 规则升级为 allow 写入策略（跨会话生效；本会话由授权缓存放行）。
      // 网络面（沙箱动态审批）例外：域名写沙箱配置，走权限系统的 persistAlwaysAllow
      // 会把扩展不认识的 network surface 写进 config.json 导致整个权限配置失效
      if (act === 'allow_always') {
        if (p.info.surface === 'network') sandbox.persistNetworkAllow(p.info.value)
        else permissions.persistAlwaysAllow(piRuntime.agentDir, p.info.surface)
      }
      p.resolve(act)
      // 持久化确认记录（重开会话可见历史确认）
      sessions.addMessage(sessionId, Object.assign({ role: 'permission' }, p.info, {
        decided: act
      }, p.anchors && p.anchors.length ? { anchors: p.anchors } : {}))
      return { ok: true }
    }
    // ui.select 兜底路径（hasUI 权威）：映射回 select 选项并终结等待；
    // 返回 info 供补写确认记录（保持与 chain 路径的落盘一致性）
    const uiInfo = piRuntime.replyUiAsk(askId, act)
    if (uiInfo) {
      sessions.addMessage(sessionId, Object.assign({ role: 'permission' }, uiInfo, { decided: act }))
      return { ok: true }
    }
    return { ok: false }
  })

  // 未决权限查询：渲染层重载（HMR/刷新）会丢失一次性推送的 permission_ask 事件，
  // 前端就绪后主动拉取恢复确认条，避免"主进程挂起等待、前端一无所知"的隐形卡死
  // （chain 路径 + ui.select 兜底路径一并返回，均为 permission_ask 形态）
  ipcMain.handle('omnibuddy:permission:pending', () => {
    const chainPending = Array.from(pendingPermissions.entries()).map(([askId, p]) => Object.assign(
      { askId, sessionId: p.chatId },
      p.info
    ))
    return chainPending.concat(piRuntime.getPendingUiAsks())
  })

  // ===== 能力中心（可用工具分类清单 + 权限策略可选对象） =====
  ipcMain.handle('omnibuddy:capability:list', () => {
    return { ok: true, groups: capabilities.listCapabilities(), specialSurfaces: capabilities.SPECIAL_SURFACES }
  })

  // ===== 权限模式（输入框常驻选择器，即时生效） =====
  ipcMain.handle('omnibuddy:permission:get-mode', () => ({ ok: true, mode: permissions.getMode() }))
  ipcMain.handle('omnibuddy:permission:set-mode', (_e, mode) => {
    const ok = permissions.setMode(String(mode || ''))
    return { ok }
  })

  // ===== 权限策略编辑（设置页读写 config.json） =====
  // 附带默认策略快照：前端「平衡」预设直接取用，与主进程共用同一份默认定义。
  // 下发前剥离应用托管 pattern（agentDir / baseDir 系统放行）：配置页只呈现
  // 用户自建规则，避免误删/误改系统路径与预设整组覆盖造成的丢失。
  // 下发的剥离快照留存一份（permissionPageSnapshot）：保存时作为三方合并
  // 基线，识别「下发后由『始终允许』等旁路追加的键」不被页面旧数据冲掉
  let permissionPageSnapshot = null
  ipcMain.handle('omnibuddy:permission:config', () => {
    const stripped = permissions.stripManagedRules(piRuntime.agentDir, permissions.readConfig(piRuntime.agentDir))
    permissionPageSnapshot = stripped
    return {
      ok: true,
      config: stripped,
      defaultPermission: permissions.stripManagedRules(piRuntime.agentDir, permissions.defaultConfig(piRuntime.agentDir)).permission
    }
  })
  ipcMain.handle('omnibuddy:permission:save-config', (_e, config) => {
    try {
      // 服务端三方合并：回传值 ≠ 快照值 → 用户编辑，以回传为准；否则盘上值
      // ≠ 快照值 → 「始终允许」等旁路修改，以盘上为准；托管 pattern 以运行时
      // 计算为准回填（预设覆盖 / 误删 / 绕过前端直调 IPC 均无法破坏系统放行）
      permissions.writeConfig(piRuntime.agentDir, permissions.mergeManagedRules(piRuntime.agentDir, config, permissionPageSnapshot))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // ===== 回退与分支（M4） =====
  // 回退到某条消息：丢弃该消息及之后的记录（用于"从此处重新提问"），
  // 旧 pi 会话必须丢弃（否则 pi 上下文与 JSONL 不一致）
  ipcMain.handle('omnibuddy:session:truncate', async (_e, { id, messageId }) => {
    if (running.has(id)) {
      return { ok: false, error: '当前会话正在回复中，请先停止' }
    }
    await piRuntime.disposeSession(id)
    const messages = sessions.truncateFrom(id, messageId)
    emit(getWindow, id, { type: 'truncated', messages })
    return { ok: true, messages }
  })

  // 以某条消息为分叉点创建分支会话（源会话不动），返回新会话
  ipcMain.handle('omnibuddy:session:branch', async (_e, { id, messageId }) => {
    if (running.has(id)) {
      return { ok: false, error: '当前会话正在回复中，请先停止' }
    }
    const meta = sessions.branchFrom(id, messageId)
    if (!meta) return { ok: false, error: '消息不存在或创建失败' }
    return { ok: true, session: meta }
  })

  // ===== 会话内分支（branch）：编辑问题重新提问 =====
  // 以既有用户问题为锚点创建新「变体」消息（editOf 指向组头、anchors 继承组头路径），
  // 落盘后返回记录；随后前端经 session:send（userMessageId）触发回答，
  // 回答及其后续消息的 anchors = 组头路径 + [变体id]，即新分支线路
  ipcMain.handle('omnibuddy:session:variant', (_e, { id, messageId, text }) => {
    if (running.has(id)) {
      return { ok: false, error: '当前会话正在回复中，请先停止' }
    }
    const content = String(text || '').trim()
    if (!content) return { ok: false, error: '内容不能为空' }
    const msgs = sessions.getMessages(id)
    const target = msgs.find(m => m.id === messageId)
    if (!target || target.role !== 'user') return { ok: false, error: '原问题不存在' }
    // 组头 = 最初的问题消息（messageId 可能已是变体，editOf 归一）
    const headId = target.editOf || target.id
    const head = headId === target.id ? target : msgs.find(m => m.id === headId)
    const headAnchors = Array.isArray(head && head.anchors) ? head.anchors : []
    const { record } = sessions.addMessage(id, {
      role: 'user',
      content,
      editOf: headId,
      anchors: headAnchors.slice()
    })
    return { ok: true, message: record }
  })

  // ===== MCP 服务管理（pi-mcp-adapter 读取 <agentDir>/mcp.json 装载） =====
  ipcMain.handle('omnibuddy:mcp:list', () => mcp.list())

  ipcMain.handle('omnibuddy:mcp:save', (_e, servers) => mcp.save(servers))

  ipcMain.handle('omnibuddy:mcp:adapter-installed', () => mcp.adapterInstalled())

  // 确保 pi-mcp-adapter 已安装（未安装则装，并销毁全部会话使新会话装载扩展）
  ipcMain.handle('omnibuddy:mcp:ensure-adapter', async () => mcp.ensureAdapter())

  // ===== 生态连接器（官方 MCP Server 目录，一键接入） =====
  // 目录合并 mcp.list() 实时连接状态
  ipcMain.handle('omnibuddy:connectors:list', () => connectors.listConnectors(mcp.list()))

  // 一键接入（credentialId 可选，经凭证库注入鉴权）
  ipcMain.handle('omnibuddy:connectors:connect', (_e, id, opts) => connectors.connect(id, opts || {}))

  // 断开（从 mcp.json 移除 server 条目）
  ipcMain.handle('omnibuddy:connectors:disconnect', (_e, id) => connectors.disconnect(id))

  // 凭证引导信息（弹窗展示用，不含 secret）
  ipcMain.handle('omnibuddy:connectors:credential-spec', (_e, id) => connectors.credentialSpec(id))

  // 打开接入说明（系统浏览器）
  ipcMain.handle('omnibuddy:connectors:open-doc', (_e, url) => {
    if (!/^https?:\/\//.test(String(url || ''))) return { ok: false }
    require('electron').shell.openExternal(url)
    return { ok: true }
  })

  // ===== 凭证管理（safeStorage 加密存储，list 仅脱敏视图；resolve 明文仅用于编辑回显） =====
  ipcMain.handle('omnibuddy:credentials:list', () => credentials.list())

  // 明文解析：编辑凭据弹窗回显 env（渲染进程按需单条获取，不做全量明文列表）
  ipcMain.handle('omnibuddy:credentials:resolve', (_e, id) => {
    const secret = credentials.resolve(id)
    return { ok: true, secret }
  })

  ipcMain.handle('omnibuddy:credentials:create', (_e, c) => credentials.create(c))

  ipcMain.handle('omnibuddy:credentials:update', (_e, c) => credentials.update(c))

  ipcMain.handle('omnibuddy:credentials:delete', (_e, id) => credentials.remove(id))

  // ===== 凭据保存后销毁 pi 会话（AI 凭据清单注入发生在会话创建时） =====
  ipcMain.handle('omnibuddy:credentials:dispose-sessions', async () => {
    await piRuntime.disposeAllSessions()
    return { ok: true }
  })

  // 联网搜索（pi-web-access 内置扩展，免配置即用）：总开关（输入框联网按钮）
  ipcMain.handle('omnibuddy:web-search:get', () => ({ enabled: webSearch.enabled() }))
  ipcMain.handle('omnibuddy:web-search:set-enabled', (_e, enabled) => webSearch.setEnabled(!!enabled))

  // ===== 沙箱执行（M3） =====
  ipcMain.handle('omnibuddy:sandbox:get', () => sandbox.getSandboxConfig())

  ipcMain.handle('omnibuddy:sandbox:set-enabled', (_e, enabled) => {
    // 开关落盘，新会话生效（运行中会话不热切换，避免沙箱状态不一致）
    sandbox.setSandboxEnabled(!!enabled)
    return sandbox.getSandboxConfig()
  })

  // ===== Skills 管理（M3） =====
  ipcMain.handle('omnibuddy:skills:list', () => skills.listSkills())

  ipcMain.handle('omnibuddy:skills:create', (_e, skill) => skills.createSkill(skill || {}))

  ipcMain.handle('omnibuddy:skills:delete', (_e, dir) => skills.deleteSkill(dir))

  // ZIP 导入：data 为前端 File 转来的 Uint8Array（结构化克隆传输）
  ipcMain.handle('omnibuddy:skills:validate-zip', (_e, data) => skills.validateZip(data))

  ipcMain.handle('omnibuddy:skills:import-zip', (_e, payload) =>
    skills.importZip(payload.data, !!payload.overwrite))

  ipcMain.handle('omnibuddy:skills:get', (_e, dir) => skills.getSkill(dir))

  ipcMain.handle('omnibuddy:skills:update', (_e, payload) => skills.updateSkill(payload))

  // 导出 Skill 为 ZIP（返回 Buffer，前端触发下载）
  ipcMain.handle('omnibuddy:skills:export-zip', (_e, dir) => skills.exportZip(dir))

  // ===== 工作空间管理（多工作空间，发送前必须选定） =====
  ipcMain.handle('omnibuddy:workspaces:list', () => workspaces.list())

  // 添加本地目录为工作空间（弹出系统目录选择框）
  ipcMain.handle('omnibuddy:workspaces:add', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true }
    return workspaces.add(result.filePaths[0])
  })

  // 解绑工作空间：解除登记 + 删除该空间下全部会话（复用单会话删除的完整清理链，
  // 记忆摘要照常留档、不清除记忆）；返回被删会话 id 供前端清理页签与会话池
  ipcMain.handle('omnibuddy:workspaces:remove', async (_e, id) => {
    const removed = sessions.listSessions()
      .filter(s => s.workspaceId === id)
      .map(s => s.id)
    for (const sid of removed) {
      if (running.has(sid)) {
        const r = running.get(sid)
        try { r.abort() } catch (err) { /* 忽略 */ }
        running.delete(sid)
      }
      // 销毁前触发会话记忆摘要（删除即会话终结，摘要留档）：原生 reload + 自有兜底
      await piRuntime.finalizeSession(sid)
      await writeExitSummary(sid)
      await piRuntime.disposeSession(sid)
      sessions.deleteSession(sid)
    }
    const r = workspaces.remove(id)
    if (!r.ok) return r
    return { ok: true, removedSessions: removed }
  })

  // 更新工作空间展示名（任务列表分组与关联弹窗回显以此为准）
  ipcMain.handle('omnibuddy:workspaces:rename', (_e, payload) => workspaces.rename(payload.id, payload.name))

  // ===== 空间文件管理（网盘风格）=====
  ipcMain.handle('omnibuddy:files:list', (_e, dir) => files.list(dir))
  ipcMain.handle('omnibuddy:files:mkdir', (_e, payload) => files.mkdir(payload.dir, payload.name))
  ipcMain.handle('omnibuddy:files:create', (_e, payload) => files.createFile(payload.dir, payload.name))
  ipcMain.handle('omnibuddy:files:rename', (_e, payload) => files.rename(payload.path, payload.name))
  ipcMain.handle('omnibuddy:files:trash', (_e, p) => files.trash(p))
  ipcMain.handle('omnibuddy:files:read', (_e, p) => files.read(p))
  ipcMain.handle('omnibuddy:files:write', (_e, payload) => files.write(payload.path, payload.content))
  ipcMain.handle('omnibuddy:files:reveal', (_e, p) => files.reveal(p))
  ipcMain.handle('omnibuddy:files:open', (_e, p) => files.open(p))
  ipcMain.handle('omnibuddy:files:import-dialog', (_e, dir) => files.importDialog(dir))
  ipcMain.handle('omnibuddy:files:import-paths', (_e, payload) => files.importPaths(payload.dir, payload.paths))

  // ===== 项目规则（P1-10）：全局 / 工作空间 AGENTS.md 读写，pi SDK 原生装载 =====
  // 保存后销毁全部 pi 会话：规则注入发生在会话创建时，新会话才能装载新规则
  ipcMain.handle('omnibuddy:rules:targets', () => rules.targets())

  ipcMain.handle('omnibuddy:rules:get', (_e, key) => rules.getRule(key))

  ipcMain.handle('omnibuddy:rules:save', async (_e, { key, content }) => {
    const r = rules.saveRule(key, content)
    if (r.ok) await piRuntime.disposeAllSessions()
    return r
  })

  // ===== 我的资料（B 方案）：结构化个人背景，systemPrompt 确定性注入 =====
  // 保存后销毁全部 pi 会话（同规则页语义：注入发生在会话创建时）
  ipcMain.handle('omnibuddy:profile:get', () => profile.get())

  ipcMain.handle('omnibuddy:profile:save', async (_e, cfg) => {
    const data = profile.save(cfg)
    await piRuntime.disposeAllSessions()
    return { ok: true, data }
  })

  // ===== 记忆管理（P1-8 增强）：pi-memory 记忆文件读写 + qmd 就绪状态 =====
  // 保存后销毁全部 pi 会话：pi-memory 的上下文注入按快照机制在会话边界刷新
  //（与规则页同模式），保证下一次对话装载最新记忆
  ipcMain.handle('omnibuddy:memory:list', () => memory.list())

  ipcMain.handle('omnibuddy:memory:read', (_e, rel) => memory.read(rel))

  ipcMain.handle('omnibuddy:memory:write', async (_e, payload) => {
    const r = memory.write(payload.path, payload.content)
    if (r.ok) await piRuntime.disposeAllSessions()
    return r
  })

  // 单条删除长期记忆（分型条目按 id 定位，重写 MEMORY.md）
  ipcMain.handle('omnibuddy:memory:remove-entry', async (_e, entryId) => {
    const r = memory.removeEntry(entryId)
    if (r.ok) await piRuntime.disposeAllSessions()
    return r
  })

  ipcMain.handle('omnibuddy:memory:status', () => memory.status())

  // 导出记忆（Markdown 汇总保存对话框；与 export.js 会话导出同模式）
  ipcMain.handle('omnibuddy:memory:export', () => memory.exportMemory())

  // 单个会话 meta（前端恢复会话绑定的工作空间）
  ipcMain.handle('omnibuddy:session:meta', (_e, id) => sessions.readMeta(id))
}

module.exports = { registerOmnibuddyIpc }
