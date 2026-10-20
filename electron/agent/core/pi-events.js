// OmniBuddy pi 事件管线：pi 运行事件（pi/session-events.js 归一化后的模型）
// 的主进程侧处理——转发渲染进程、持久化 JSONL、驱动用量记账 / 检查点 /
// 文件变更 / workflow 轮询、挂起 ask_user 与权限确认。
const sessions = require('../sessions/sessions')
const usage = require('../platform/usage')
const checkpoints = require('../sessions/checkpoints')
const fileChanges = require('../sessions/file-changes')
const exportsDiff = require('../sessions/exports-diff')
const workflows = require('../integrations/workflows')
const subagents = require('../integrations/subagents')
const notify = require('../integrations/notify')
const siteAuth = require('../integrations/site-auth')
const loginWizard = require('../integrations/login-wizard')
const piRuntime = require('../pi')
const { emit, running, runAnchors, pendingAsks, pendingPermissions,
  touchAutomationHeartbeat, automationTurnErrors,
  isHeadlessRun, recordDeniedOp } = require('./chat-state')
const { maybeAutoTitle, writeExitSummary, enqueueSummary, generateThinkingSummary } = require('./direct-llm')

// ===== 无头定时执行短路（headless：schedule 触发的运行） =====
// ask_user / permission_ask 的前端等待管线在无人值守时即永久挂起
// （AWAITING_USER 豁免看门狗），此处改为短路自动决策：提问返回"自行决策"
// 指令，权限按"只读放行 / 写拒绝并记录"分级（对齐业界 headless 权限模式）

// 无头 ask_user 的自动应答（也作为落盘 answer，事后审计可见）
const HEADLESS_ASK_ANSWER = '【无头定时执行环境】当前为无人值守的定时执行，无法向用户提问。' +
  '请依据任务指令与 skill 内置规则自行做出保守决策并继续完成后续步骤，不要再次调用 ask_user；' +
  '若确属无法安全决策的关键分叉，选择影响最小的方案继续，并在最终汇报中说明本项决策及理由。'

// 无头放行的只读命令白名单（首 token 判定；含采集所需的网络请求类）
const HEADLESS_READONLY_CMDS = new Set([
  'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'find', 'wc', 'file', 'stat', 'du', 'df', 'pwd',
  'which', 'whoami', 'uname', 'date', 'echo', 'printf', 'env', 'printenv', 'id', 'hostname',
  'curl', 'wget', 'ping', 'dig', 'nslookup', 'host', 'traceroute', 'sleep'
])
// git 只读子命令
const HEADLESS_GIT_READONLY = new Set(['status', 'log', 'diff', 'show', 'branch', 'remote', 'tag'])

// bash 命令无头只读判定（启发式，保守失败即拒）：
// 剔除引号内容后按 && || ; | 拆复合命令，每个子命令首 token 须命中白名单；
// 任何重定向写文件、curl/wget 落盘参数（-o/-O/--output）均拒绝
function isHeadlessReadonlyBash(command) {
  const cmd = String(command || '')
  const stripped = cmd.replace(/'(?:[^'\\]|\\.)*'/g, "''").replace(/"(?:[^"\\]|\\.)*"/g, '""')
  if (/>{1,2}\s*[^&|]/.test(stripped)) return false // 重定向（2>&1 除外）
  const parts = stripped.split(/&&|\|\||;|\|/g)
  for (let part of parts) {
    part = part.trim()
    if (!part) continue
    const tokens = part.split(/\s+/)
    let bin = (tokens[0] || '').split('/').pop()
    if (bin === 'sudo' || bin === 'env') bin = (tokens[1] || '').split('/').pop()
    if (bin === 'git') {
      const sub = (tokens.find(t => t && t[0] !== '-') || '')
      if (!HEADLESS_GIT_READONLY.has(sub)) return false
      continue
    }
    if (bin === 'curl' || bin === 'wget') {
      if (/(^|\s)(-o|--output|-O|--save)(\s|=)/.test(part)) return false
      continue
    }
    if (!HEADLESS_READONLY_CMDS.has(bin)) return false
  }
  return true
}

// 无头权限分级判定：返回 verdict（'allow' / 'deny_headless'）
// - bash：只读白名单命令放行，其余拒绝
// - 采集/只读类工具（联网、读文件、浏览器）放行——任务指令明确鼓励只读收集
// - network 面（沙箱网络审批）：读网络放行
// - 其余（edit/write/apply/mcp__*/codemode/subagent 等写副作用面）：默认拒绝并记录，
//   需要无头放行的面可在权限管理中配置 allow（allow 不会进 ask 链路，不受此拦截）
function headlessPermissionVerdict(e) {
  const tool = String(e.toolName || e.surface || '')
  if (tool === 'bash') {
    return isHeadlessReadonlyBash(e.command || e.value) ? 'allow' : 'deny_headless'
  }
  if (/^(web_search|web_fetch|web_enable|open_url|browser|read|glob|grep|ls|find)$/.test(tool)) {
    return 'allow'
  }
  if (tool === 'network') return 'allow'
  return 'deny_headless'
}

// 删除会话（快速路径）：中止运行中回合 → 快照消息 → 销毁运行时会话与磁盘记录，立即完成；
// 记忆摘要 fire-and-forget 后台补写（自持消息快照，不依赖已删会话，LLM 耗时不阻塞删除交互）。
// 原生 reload 摘要依赖存活的运行时会话，随销毁放弃，留档由兜底链路覆盖
async function deleteSessionFast(id) {
  if (running.has(id)) {
    const r = running.get(id)
    try { r.abort() } catch (err) { /* 忽略 */ }
    running.delete(id)
  }
  // 深度研究：清理该会话的 workflow 轮询；子代理后台 run 同步清理注册表与轮询
  workflows.unwatchChat(id)
  subagents.clearChat(id)
  // 先快照消息：下方删除后 JSONL 即清除，后台摘要需自持数据
  const msgs = sessions.getMessages(id)
  // 连带清理 pi 落盘转录（原生 resume 语义下文件存在即视为上下文有效）
  await piRuntime.invalidateSessionFiles(id)
  sessions.deleteSession(id)
  // 入队而非直接执行：批量删除（解绑工作空间）时逐个串行写 daily 文件，防覆盖丢条目
  enqueueSummary(() => writeExitSummary(id, msgs))
}

// 回合结束后同步 pi 树映射（pi-map）。
// 对齐规则（严格校验，失败整批跳过——后续分支切换自动兜底回放，不影响对话）：
// pi 新增 user 条目数 = 1（本条 prompt）且新增 assistant 条目数 = 本回合自有
// JSONL 落盘的 assistant 记录数（assistant_end 收集于 running.assistantIds，
// 含 mid 过程正文），按出现顺序一一配对写映射
function syncPiEntryMapAfterTurn(id, userRecordId, entry) {
  try {
    const added = piRuntime.collectNewMessages(id)
    if (!added || !added.length) return
    const users = added.filter(x => x.role === 'user')
    const assistants = added.filter(x => x.role === 'assistant')
    const localAssistants = (entry && entry.assistantIds) || []
    if (entry) entry.assistantIds = []
    if (users.length !== 1 || assistants.length !== localAssistants.length) return
    sessions.setPiEntry(id, userRecordId, users[0].entryId)
    localAssistants.forEach((mid, i) => sessions.setPiEntry(id, mid, assistants[i].entryId))
  } catch (e) { /* 映射同步失败不影响对话 */ }
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

// 清洗压缩摘要：摘要模型可能把压缩后注入的系统上下文块（如 <read-files>…</read-files>）
// 原样誊写进正文，落盘前剔除，避免用户在分界气泡正文里看到注入痕迹
function sanitizeCompactionSummary(text) {
  return String(text || '')
    .replace(/<read-files>[\s\S]*?<\/read-files>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// pi 运行事件：转发渲染进程 + 持久化到 JSONL
function handlePiEvent(getWindow, e) {
  const { kind, chatId } = e
  // 无头任务心跳：全部事件视为活跃信号（看门狗数据源；等待用户的豁免
  // 由 isAwaitingUser 在检查时判定，permission_ask 本身也刷新心跳）
  touchAutomationHeartbeat(e)
  switch (kind) {
    case 'assistant_start':
      // exports/ 产物捕获基线：turn 开始快照，后续 tool_end 据此 diff 新增文件
      try {
        const baseMeta = sessions.readMeta(chatId)
        exportsDiff.baseline(chatId, baseMeta && baseMeta.workspaceDir)
      } catch (err) { /* 快照失败不影响回合 */ }
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
      // 本回合 assistant 记录 id 收集（syncPiEntryMapAfterTurn 对齐用；
      // 幽灵回合（running 无条目）不收集，其映射缺失时分支切换走兜底回放）
      const runEntry = running.get(chatId)
      if (runEntry && Array.isArray(runEntry.assistantIds)) runEntry.assistantIds.push(saved.record.id)
      // 用量独立账本：与消息落盘同点记一笔（删除会话/解绑空间不影响历史用量）；
      // 标题快照随流水落账（会话删除后 TOP5 仍能显示任务名）
      usage.record(chatId, runModel, e.usage, saved.meta && saved.meta.title)
      // messageId：本轮首条落盘记录 id（前端回填到聚合消息，点赞/分支据此定位）
      emit(getWindow, chatId, { type: 'assistant_end', content: e.content, thinking: e.thinking, mid: !!e.mid, usage: e.usage, messageId: saved.record.id })
      // 自发回合（深度研究）：后台 workflow 结果回注触发的回合无 session:send
      // 流程（不在 running 表），回合收尾（非工具循环）时补发 done 释放前端流式态
      if (!e.mid && !running.has(chatId)) {
        console.log('[omnibuddy][diag] done 补发（幽灵回合）chatId=', chatId) // 临时诊断
        emit(getWindow, chatId, { type: 'done' })
      }
      // 首轮回答完成：后台生成会话标题（是否生成由 meta.autoTitle 判定，手动改名后跳过）
      maybeAutoTitle(getWindow, chatId, e.content)
      // 思考段摘要：有思考内容的落盘记录后台补一句短语（前端分段折叠头标题），
      // fire-and-forget（失败静默，前端退回首行截断兜底）
      if (e.thinking) generateThinkingSummary(getWindow, chatId, saved.record.id, e.thinking)
      break
    case 'turn_error':
      // pi 吞掉的模型请求错误（如供应商 400）：原样透传前端 + 落盘（重开会话仍可见）
      console.log('[omnibuddy] turn_error <-', e.error)
      // 定时任务执行体登记：prompt 不抛异常，须据此把空回合判为失败
      automationTurnErrors.set(chatId, e.error || '模型请求失败')
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
      // 文件变更记录：写工具执行前采集旧内容（供 tool_end 计算 diff）
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
      // 文件变更记录：写工具执行后对比新旧内容算 diff（失败调用不产生变更）
      let fileChange = null
      try {
        fileChange = fileChanges.afterTool(e.toolCallId, e.isError)
      } catch (err) { /* diff 失败不影响主流程 */ }
      // exports/ 产物捕获：任何工具执行后扫描新增交付文件合成 artifacts
      //（bash/node/python 等写的文件无自报通道；与工具自报的按路径去重）
      let artifacts = e.artifacts
      if (!e.isError) {
        try {
          const exportsMeta = sessions.readMeta(chatId)
          const fresh = exportsDiff.afterTool(chatId, exportsMeta && exportsMeta.workspaceDir, artifacts)
          if (fresh.length) {
            artifacts = (artifacts || []).concat(fresh)
          }
        } catch (err) { /* 扫描失败不影响工具事件 */ }
      }
      // 结果规整为字符串：pi 的部分工具返回结构化对象（如 { content: [...] }），
      // 原样透传会被前端渲染成 [object Object]
      const result = normalizeToolResult(e.result)
      // 产出计数累计（阶段三）：会话列表「产出 N 个文件」徽标数据源
      if (Array.isArray(artifacts) && artifacts.length) {
        try { sessions.bumpArtifactCount(chatId, artifacts.length) } catch (err) { /* 计数失败不影响主流程 */ }
      }
      const toolAnchors = runAnchors(chatId)
      sessions.addMessage(chatId, Object.assign({
        role: 'tool',
        toolName: e.toolName,
        args: e.args,
        result,
        isError: e.isError,
        fileChange: fileChange || undefined,
        artifacts: artifacts || undefined,
        workflow: e.workflow || undefined
      }, toolAnchors ? { anchors: toolAnchors } : {}))
      emit(getWindow, chatId, {
        type: 'tool_end',
        toolCallId: e.toolCallId,
        toolName: e.toolName,
        result,
        isError: e.isError,
        fileChange: fileChange || undefined,
        artifacts: artifacts || undefined,
        workflow: e.workflow || undefined,
        subagentRun: e.subagentRun || undefined
      })
      // 深度研究：后台 workflow 启动即返回 runId → 轮询落盘状态驱动前端进度卡片
      if (e.workflow && e.workflow.runId && e.workflow.background && e.workflow.kind !== 'subagent') {
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
      // 子代理后台 run：注册表登记 + status.json 轮询 → 前端进度卡片
      // （workflow_progress 复用深度研究管线，快照带 kind:'subagent'）。
      // 终态三路同步：卡片终态帧 + 任务列表（经进度事件）+ 系统通知；
      // 悬挂（长时间无推进，典型为等待权限确认）主动告警而非静默挂死
      if (e.subagentRun && e.subagentRun.runId) {
        try {
          const srMeta = sessions.readMeta(chatId)
          const srInfo = {
            chatId,
            toolCallId: e.toolCallId,
            agent: e.subagentRun.agent,
            task: e.subagentRun.task,
            cwd: (srMeta && srMeta.workspaceDir) || ''
          }
          subagents.registerRun(e.subagentRun.runId, srInfo)
          const focusChat = () => {
            const win = getWindow()
            if (win && !win.isDestroyed()) {
              win.show()
              win.focus()
              win.webContents.send('nav:goto', '/omnibuddy?s=' + chatId)
            }
          }
          subagents.watchRun(e.subagentRun.runId, chatId,
            snap => emit(getWindow, chatId, { type: 'workflow_progress', workflow: snap }),
            snap => {
              emit(getWindow, chatId, { type: 'workflow_progress', workflow: snap })
              const okDone = snap.status === 'completed'
              const label = snap.name || srInfo.agent || '专家'
              notify.dispatch(okDone ? 'subagent.completed' : 'subagent.failed', {
                title: okDone ? '专家任务完成' : '专家任务未完成',
                body: '「' + label + '」' + (okDone
                  ? '已在后台完成，点击查看结果'
                  : (snap.status === 'stopped' ? '已被停止' : ('已失败' + (snap.error ? '：' + String(snap.error).slice(0, 80) : ''))) + '，点击查看详情'),
                ok: okDone,
                click: focusChat
              })
            },
            snap => {
              emit(getWindow, chatId, { type: 'workflow_progress', workflow: snap })
              notify.dispatch('subagent.stale', {
                title: '专家任务疑似挂起',
                body: '「' + (snap.name || srInfo.agent || '专家') + '」超过 90 秒无进展（可能在等待授权），点击前往处理',
                ok: false,
                dedupeKey: 'subagent-stale:' + e.subagentRun.runId,
                click: focusChat
              })
            })
        } catch (err) { /* 注册/轮询启动失败不影响工具事件 */ }
      }
      break
    }
    case 'ask_user': {
      // 无头定时执行：不进前端等待管线（无人应答即永久挂起），返回自动决策
      // 指令让模型按 skill 内置规则继续；问答照常落盘，事后审计可见
      if (isHeadlessRun(chatId)) {
        try {
          sessions.addMessage(chatId, {
            role: 'ask_user',
            question: e.question,
            options: e.options,
            multiSelect: !!e.multiSelect || undefined,
            answer: HEADLESS_ASK_ANSWER,
            headless: true
          })
        } catch (err) { /* 会话已删除等忽略 */ }
        return Promise.resolve(HEADLESS_ASK_ANSWER)
      }
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
      // 无头定时执行：不进前端等待管线，按"只读放行 / 写拒绝并记录"分级
      // 自动决策；verdict 形态与 pendingPermissions resolve 值一致，
      // 'deny_headless' 由 permissions 桥接层给出无头专属拒绝文案
      if (isHeadlessRun(chatId)) {
        const verdict = headlessPermissionVerdict(e)
        if (verdict === 'deny_headless') recordDeniedOp(chatId, info.toolName || info.surface, info.command || info.value || info.path)
        try {
          sessions.addMessage(chatId, Object.assign({ role: 'permission' }, info, {
            decided: verdict === 'allow' ? 'allow' : 'deny',
            headless: true
          }))
        } catch (err) { /* 会话已删除等忽略 */ }
        return Promise.resolve(verdict)
      }
      // 通知中心投递（窗口未开/后台时用户仍可感知；同 askId 冷却去重，
      // ui.select 兜底路径与 chain 路径各自到达时不重复打扰）
      notify.dispatch('permission.ask', {
        title: '权限审批请求',
        body: '「' + (e.toolName || e.surface || '操作') + '」等待授权' +
          (e.value ? '：' + String(e.value).slice(0, 60) : ''),
        ok: true,
        dedupeKey: 'perm:' + askId,
        click: () => {
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.show()
            win.focus()
            win.webContents.send('nav:goto', '/omnibuddy?s=' + chatId)
          }
        }
      })
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
    case 'site_auth': {
      // 站点登录态上报（report_site_auth 工具）：登记表更新；状态翻转时
      // 广播前端 + login.required 通知（向导已由工具自动弹出，通知点击
      // 重新调出）。登录闭环内联在工具执行中（开向导 → 挂起等待用户 →
      // 结果回执工具），不依赖 LLM 上报 logged_in；logged_in 上报仅同步登记表
      const r = siteAuth.report(e.url, e.status, e.note)
      if (r.host) {
        // url + toolCallId 供前端工具卡片内嵌「打开登录向导」按钮（应用内一键入口）
        emit(getWindow, chatId, { type: 'site_auth', toolCallId: e.toolCallId, host: r.host, url: e.url, status: e.status })
        if (r.changed && e.status === 'login_required') {
          notify.dispatch('login.required', {
            title: '站点需要登录',
            body: '「' + r.host + '」访问遇到登录墙：登录窗口已自动打开，完成登录后自动保存登录态并继续任务（点击通知可重新调出窗口）',
            ok: false,
            dedupeKey: 'login:' + r.host,
            click: () => {
              loginWizard.open(r.host, e.url)
              emit(getWindow, chatId, { type: 'login_wizard', host: r.host, phase: 'open' })
            }
          })
        }
      }
      break
    }
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
          content: sanitizeCompactionSummary(e.summary),
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

module.exports = {
  // pi 运行事件统一处理（转发渲染层 + 落盘 + 记账 + 挂起询问；ask 类事件返回等待前端应答的 Promise）
  handlePiEvent,
  // 删除会话快速路径（中止回合 → 快照消息 → 销毁运行时与磁盘记录，摘要后台补写）
  deleteSessionFast,
  // 回合结束后同步 pi 树映射（严格对齐失败整批跳过，分支切换兜底回放）
  syncPiEntryMapAfterTurn
}
