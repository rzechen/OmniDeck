// OmniBuddy 轻量直调链路：不走 pi Agent 循环、按 provider 配置直连端点的
// 辅助 LLM 调用（自动生成会话标题 / 会话记忆摘要）与纯对话兜底系统提示词。
// 失败一律静默降级（保留原标题 / 跳过摘要），不影响主对话。
const fs = require('fs')
const path = require('path')
const sessions = require('../sessions/sessions')
const piRuntime = require('../pi')
const { emit } = require('./chat-state')

// ===== 请求构造（按 apiFormat 适配 openai / openai-responses / anthropic） =====
// 按 provider 的 apiFormat 组装端点 / 请求头 / 请求体与响应解析；
// 仅支持 openai / openai-responses（Responses 的 output_text 提取），
// anthropic 走 x-api-key 头 + /v1/messages。失败由调用方静默降级。
// prompt 兼容两种形态：字符串（单 user 消息）与消息数组（system/user/assistant
// 多轮，公共形态——翻译引擎等复用本构造器）；anthropic 的 system 消息提为顶层字段
function buildDirectRequest(info, prompt, maxTokens) {
  const baseUrl = String(info.baseUrl).replace(/\/+$/, '')
  const msgs = Array.isArray(prompt)
    ? prompt
    : [{ role: 'user', content: prompt }]
  const systemText = msgs
    .filter(m => m && m.role === 'system')
    .map(m => String(m.content || ''))
    .join('\n')
  const chatMsgs = msgs.filter(m => m && m.role !== 'system')
  if (info.apiFormat === 'anthropic') {
    const body = {
      model: info.model,
      messages: chatMsgs.map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '')
      })),
      max_tokens: maxTokens,
      stream: false
    }
    if (systemText) body.system = systemText
    return {
      url: baseUrl + (baseUrl.endsWith('/v1') ? '/messages' : '/v1/messages'),
      init: {
        method: 'POST',
        headers: Object.assign(
          { 'content-type': 'application/json' },
          info.apiKey
            ? { 'x-api-key': info.apiKey, 'anthropic-version': '2023-06-01' }
            : { 'anthropic-version': '2023-06-01' }
        ),
        body: JSON.stringify(body)
      },
      parse: data => String(
        (Array.isArray(data.content) &&
          data.content.filter(b => b && b.type === 'text' && typeof b.text === 'string')
            .map(b => b.text).join('')) ||
        (data.content && data.content[0] && data.content[0].type === 'text' && data.content[0].text) ||
        ''
      ),
      finishKey: data => (data.stop_reason || '')
    }
  }
  if (info.apiFormat === 'openai-responses') {
    return {
      url: baseUrl + '/responses',
      init: {
        method: 'POST',
        headers: Object.assign(
          { 'content-type': 'application/json' },
          info.apiKey ? { authorization: 'Bearer ' + info.apiKey } : {}
        ),
        body: JSON.stringify({
          model: info.model,
          // 消息数组直接作为 input（Responses API 原生支持）；system 语义同样生效
          input: chatMsgs.map(m => ({
            role: m.role === 'assistant' ? 'assistant' : (m.role === 'system' ? 'system' : 'user'),
            content: String(m.content || '')
          })).concat(systemText ? [{ role: 'system', content: systemText }] : []),
          max_output_tokens: maxTokens,
          stream: false
        })
      },
      // output 数组中取全部 text 块拼接（reasoning 块跳过）
      parse: data => String(
        (Array.isArray(data.output) &&
          data.output.filter(b => b.type === 'text').map(b => b.text).join('')) || ''
      ),
      finishKey: data => (data.status || '')
    }
  }
  // 默认 OpenAI Chat Completions
  return {
    url: baseUrl + '/chat/completions',
    init: {
      method: 'POST',
      headers: Object.assign(
        { 'content-type': 'application/json' },
        info.apiKey ? { authorization: 'Bearer ' + info.apiKey } : {}
      ),
      body: JSON.stringify({
        model: info.model,
        messages: msgs.map(m => ({
          role: m.role || 'user',
          content: String(m.content || '')
        })),
        // 思考型模型的 reasoning 过程也计入 max_tokens，过小会导致正文为空
        max_tokens: maxTokens,
        temperature: 0.3,
        stream: false
      })
    },
    parse: data => String(
      (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || ''
    ),
    finishKey: data => ((data.choices && data.choices[0] && data.choices[0].finish_reason) || '')
  }
}

// ===== 兜底系统提示词（pi 不可用时的纯对话路径） =====
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

// ===== 自动生成会话标题 =====
// 每轮回答完成后，用 provider 端点直调、基于整个会话内容
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
      const req = buildDirectRequest(info, prompt, 1024)
      const res = await fetch(req.url, {
        ...req.init,
        signal: AbortSignal.timeout(15000)
      })
      if (!res.ok) {
        console.warn('[omnibuddy:title] HTTP', res.status, '—保留原标题')
        return
      }
      const data = await res.json()
      const raw = req.parse(data)
      const firstLine = raw.split('\n').map(t => t.trim()).filter(Boolean)[0] || ''
      const title = firstLine
        .replace(/^["'“”「『【(<（]+/, '')
        .replace(/["'“”」』】>)）.。]+$/, '')
        .slice(0, 30)
      if (!title) {
        // 诊断：finish_reason=length 说明 token 仍被思考耗尽；reasoning 模型可换非思考模型
        console.warn('[omnibuddy:title] 空响应，保留原标题（finish=' +
          req.finishKey(data) + ', completion=' + ((data.usage && data.usage.completion_tokens) || 0) + '）')
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

// 摘要落盘目录按会话记忆策略解析：clean 跳过（不落任何记忆）；isolate 落该空间
// 独立目录；global（含无运行时会话的兜底）落全局 agentDir/memory。
// pi-memory 目录由模块加载时 env 定死，pi-memory 扩展在会话创建时按 PI_MEMORY_DIR
// 写自己的 daily —— 本兜底必须与之一致，否则同会话摘要分裂在两个目录。
function dailyLogPathFor(chatId) {
  let info = null
  try { info = piRuntime.getSessionMemoryInfo(chatId) } catch (e) { /* pi 未初始化 */ }
  if (info && info.policy === 'clean') return null
  if (info && info.policy === 'isolate' && info.dir) {
    return path.join(info.dir, 'daily')
  }
  return path.join(piRuntime.agentDir, 'memory', 'daily')
}

function dailyLogPath(chatId) {
  const d = new Date()
  const pad = x => String(x).padStart(2, '0')
  const date = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate())
  const dir = dailyLogPathFor(chatId)
  return dir ? path.join(dir, date + '.md') : null
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

// presetMsgs 可选：外部预取的消息快照（会话已删除场景自持数据，无法再从 sessions 读）
async function writeExitSummary(chatId, presetMsgs) {
  try {
    if (summaryInflight.has(chatId)) return
    summaryInflight.add(chatId)
    try {
      const info = piRuntime.getProviderInfo()
      if (!info || !info.baseUrl || !info.model) return
      const msgs = (Array.isArray(presetMsgs) ? presetMsgs : sessions.getMessages(chatId))
        .filter(m => m.role === 'user' || m.role === 'assistant')
      if (msgs.length < SUMMARY_MIN_MESSAGES) return
      // clean 记忆策略：完全不落记忆摘要（dailyLogPath 返回 null）
      const file = dailyLogPath(chatId)
      if (!file) return
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
      const req = buildDirectRequest(info, prompt, 2048)
      const res = await fetch(req.url, {
        ...req.init,
        signal: AbortSignal.timeout(20000)
      })
      if (!res.ok) {
        console.warn('[omnibuddy:memory] 摘要 HTTP', res.status, '—跳过', chatId)
        return
      }
      const data = await res.json()
      const summary = req.parse(data).trim()
      if (!summary) {
        console.warn('[omnibuddy:memory] 摘要空响应（finish=' +
          req.finishKey(data) + ', completion=' + ((data.usage && data.usage.completion_tokens) || 0) + '）')
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

// 摘要写盘串行队列：daily 文件为读-改-写，并发 upsert 会互相覆盖丢条目
let summaryQueue = Promise.resolve()
function enqueueSummary(task) {
  summaryQueue = summaryQueue
    .then(task)
    .catch(e => console.warn('[omnibuddy:memory] 摘要任务异常:', (e && e.message) || e))
  return summaryQueue
}

// ===== 思考段摘要（分段思考 UI 的折叠头标题） =====
// 每段思考结束时，用 provider 端点直调把该段思考全文浓缩为一句短语（≤16 字），
// 供前端「思考过程 N · <摘要>」折叠头展示。fire-and-forget：失败静默，
// 前端无摘要时退回首行截断兜底，不影响对话
async function generateThinkingSummary(getWindow, chatId, messageId, thinkingText) {
  try {
    const text = String(thinkingText || '').trim()
    if (text.length < 40) return // 太短的思考不值得调一次模型，前端截断兜底
    const info = piRuntime.getProviderInfo()
    if (!info || !info.baseUrl || !info.model) return
    const prompt = [
      '用一句不超过 16 个字的中文短语概括下面这段 AI 思考过程正在做什么（如「分析需求 · 检索文件」）。',
      '要求：只输出短语本身，不要引号、句号或任何解释；用「·」分隔并列要点，最多两个要点。',
      '',
      '<thinking>',
      text.slice(0, 6000),
      '</thinking>'
    ].join('\n')
    const req = buildDirectRequest(info, prompt, 512)
    const res = await fetch(req.url, {
      ...req.init,
      signal: AbortSignal.timeout(15000)
    })
    if (!res.ok) {
      console.warn('[omnibuddy:think-sum] HTTP', res.status, '—跳过')
      return
    }
    const data = await res.json()
    const raw = req.parse(data)
    const firstLine = raw.split('\n').map(t => t.trim()).filter(Boolean)[0] || ''
    const summary = firstLine
      .replace(/^["'“”「『【(<（]+/, '')
      .replace(/["'“”」』】>)）.。]+$/, '')
    if (!summary) return
    // 落盘（重开会话可回放）+ 实时广播（前端刷新折叠头标题）
    sessions.updateMessageField(chatId, messageId, 'thinkingSummary', summary)
    emit(getWindow, chatId, { type: 'thinking_summary', messageId, summary })
  } catch (e) {
    /* 失败静默：前端保留首行截断兜底 */
  }
}

module.exports = {
  // 按 apiFormat 组装直调请求（端点 / 请求头 / 请求体 / 响应解析）
  buildDirectRequest,
  // 兜底系统提示词（pi 不可用时的纯对话路径，运行环境实时生成）
  buildFallbackSystemPrompt,
  // 自动生成会话标题（每轮回答完成后后台刷新，失败静默保留原标题）
  maybeAutoTitle,
  // 会话记忆摘要（写入 pi-memory daily 文件，同会话条目整体替换）
  writeExitSummary,
  // 思考段摘要（分段思考 UI 折叠头标题，fire-and-forget）
  generateThinkingSummary,
  // 摘要写盘串行队列（防并发 upsert 覆盖丢条目）
  enqueueSummary
}
