// OmniBuddy 流式对话 IPC：session:send（主对话入口，pi Agent 循环优先、
// 纯对话兜底）、steer（运行中插话）、interrupt（中断）、ask-user:reply
// （ask_user 工具应答）。
const { ipcMain } = require('electron')
const sessions = require('../sessions/sessions')
const scheduler = require('../platform/scheduler')
const workspaces = require('../workspace/workspaces')
const attachments = require('../workspace/attachments')
const branchView = require('../sessions/branchView')
const { streamChat } = require('../core/llm')
const piRuntime = require('../pi')
const { emit, running, sessionAnchorKeys, pendingAsks, pendingPermissions } = require('../core/chat-state')
const { handlePiEvent, syncPiEntryMapAfterTurn } = require('../core/pi-events')
const { buildFallbackSystemPrompt, writeExitSummary } = require('../core/direct-llm')

// ===== # 引用 token 处理（send / steer / 回放三处共用） =====
// 正则与前端 BuddyComposer.vue / MessageBubble.vue 的 TOKEN_RE 契约一致
const TOKEN_RE = /#(Folder|File):([^\s#]+)/g

// 拼路径块：把 atRefs 清单渲染成注入 prompt 的引导文本（无有效路径返回 ''）
function buildRefsBlock(atRefs) {
  if (!Array.isArray(atRefs) || !atRefs.length) return ''
  const lines = atRefs
    .filter(r => r && typeof r.path === 'string' && r.path)
    .map(r => '- ' + r.path + (r.kind === 'dir' ? '（目录）' : ''))
  if (!lines.length) return ''
  return '我引用了以下工作空间路径：\n' + lines.join('\n') + '\n（请按需用工具读取上述路径）\n\n'
}

// 清洗正文中的裸 token：#File:滴滴电子发票.pdf → 滴滴电子发票.pdf
// （信息由路径块承载，裸 token 是 UI 序列化产物，不该进模型上下文——
//   无契约解释时模型会把它当"未知物"向用户讲解内部协议）
function stripRefTokens(text) {
  return String(text || '').replace(TOKEN_RE, (_m, _kind, name) => name)
}

// 回放重建：按消息落盘的 atRefs 重建路径块（与首发时注入的上下文对齐，
// 分支切换/会话重建后裸 token 才有对应路径可读）
function rebuildRefsForReplay(msg) {
  const content = String((msg && msg.content) || '')
  // 兼容旧 steer 消息：其落盘 content 已内嵌路径块，不重复前置，仅清洗 token
  if (content.indexOf('我引用了以下工作空间路径：') === 0) return stripRefTokens(content)
  return buildRefsBlock(msg && msg.atRefs) + stripRefTokens(content)
}

// 注册流式对话相关 IPC（getWindow 由 index.js 注入）
function registerChatIpc(getWindow) {
  // ===== 流式对话 =====
  // workspaceId 必填：发送前必须选定工作空间（Agent 的文件操作目录）
  // attachments 可选：文件附件 meta（“+”选择/拖拽导入，attachments.js），
  //   图片并入 image 块、文本/PDF 抽取全文拼入 prompt；随消息落盘回放
  // atRefs 可选：# 引用工作空间条目的路径清单（轻量：不复制不抽取），
  //   发送时拼路径块进 prompt（模型按需用工具读取），并随消息落盘回放
  // anchors 可选：会话内分支线路（渲染层当前显示线的锚点数组）；
  //   上下文按该线路过滤（与前端显示一致），线路变化时 pi 会话丢弃重建
  // userMessageId 可选：编辑重问（分支变体）场景，用户消息已先行落盘
  //   （omnibuddy:session:variant），此处仅触发回答、不重复落盘
  ipcMain.handle('omnibuddy:session:send', async (_e, { id, text, provider, workspaceId, displayName, attachments: fileAttachments, atRefs, anchors, userMessageId }) => {
    if (running.has(id)) {
      return { ok: false, error: '当前会话正在回复中' }
    }
    if (!provider || !provider.baseUrl || !provider.model) {
      return { ok: false, error: '未配置模型，请先在模型管理页添加模型' }
    }
    if (!workspaceId) {
      return { ok: false, error: '请先选择工作空间' }
    }
    // 模型配置快照（定时任务）：任务无头运行使用「最近一次对话的模型」
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

    // 文本/PDF 附件：抽取全文拼入 prompt（<attachment> 引用块）；
    // # 引用：拼路径块（不做内容抽取，模型按需用工具读取真实路径），
    // 并清洗正文中的裸 token（→ 纯文件名）；落盘 content 仍保留 token 供气泡渲染 chip
    let promptText = buildRefsBlock(atRefs) + stripRefTokens(text)
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
      // # 引用路径清单随消息落盘（气泡正文 token 反查绝对路径 + 历史回放）
      if (Array.isArray(atRefs) && atRefs.length) {
        extras.atRefs = atRefs.map(r => ({ name: r.name || '', kind: r.kind === 'dir' ? 'dir' : 'file', path: r.path || '', rel: r.rel || '' }))
      }
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

    const entry = { abort: null, mode: 'pi', model: provider.model, anchors: anchorsArr, assistantIds: [] }
    running.set(id, entry)

    // 历史回放（pi 会话重建时）：排除刚落盘的本条消息（它经 prompt 发送，
    // 回放会导致重复），并装载图片 base64（pi.js 拼成 image 块）：
    // 文件附件中的图片走 attachments；
    // 文本/PDF 附件回放时同样抽取全文拼入正文（与首发一致，上下文不丢失）；
    // 分支线路过滤：仅回放当前线路上的消息（与渲染层显示一致，
    // 变体消息按组头位置参与上下文，其他线路不回放）；
    // mid（自有消息 id）与 piEntryId（pi-map 映射）随行携带——
    // 前者供回放映射落盘，后者供分支切换时 branch 锚点定位
    const allMessages = sessions.getMessages(id)
    const branchActive = branchView.resolveActiveByAnchors(allMessages, anchorsArr)
    const viewList = branchView.computeBranchView(allMessages, branchActive).list
    const piEntryMap = sessions.getPiEntryMap(id)
    const history = await Promise.all(viewList
      .filter(m => (m.role === 'user' || m.role === 'assistant') && m.id !== record.id)
      .map(async m => {
        // 用户消息：按 atRefs 重建路径块 + 清洗裸 token（与首发时上下文一致）；
        // 助手消息原样回放
        const item = {
          role: m.role,
          content: m.role === 'user' ? rebuildRefsForReplay(m) : m.content,
          mid: m.id
        }
        if (piEntryMap[m.id]) item.piEntryId = piEntryMap[m.id]
        const replayText = await attachments.buildTextBlock(m.fileAttachments)
        if (replayText) item.content = String(item.content || '') + '\n\n' + replayText
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
      // 分支线路变化（优先原生 branch 同步，保留 pi 树完整上下文与
      // prompt cache 前缀）：锚点 = 过滤后线路末条消息的 piEntryId（变体重提
      // 指向组头前一条、线路切换指向该线路末条，同一规则），空线路 → resetLeaf。
      // 无映射（老消息/幽灵回合）或锚点失效 → invalidate 回放重建（与旧行为一致）
      const anchorKey = anchorsArr.join('\u0000')
      if (sessionAnchorKeys.get(id) !== anchorKey) {
        sessionAnchorKeys.set(id, anchorKey)
        const lastMsg = history[history.length - 1]
        let branch = null
        if (!lastMsg) {
          branch = await piRuntime.branchSessionTo(id, null)
        } else if (lastMsg.piEntryId) {
          branch = await piRuntime.branchSessionTo(id, lastMsg.piEntryId)
        }
        if (!branch || !branch.ok) {
          await piRuntime.invalidateSessionFiles(id)
        }
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
        // 中断即标记用户主动停止：session:interrupt / 删除会话都经此闭包，
        // session:send 的异常中止检测据此跳过报错（用户停止不算异常）
        entry.abort = () => { entry.userInterrupted = true; piRuntime.interruptSession(id) }
        // prompt 前打书签（回合结束后收集 pi 树新增条目做映射对齐）
        piRuntime.markSessionBookmark(id)
        // streamingBehavior=followUp：后台子代理唤醒等注入驱动的续跑回合可能
        // 仍在执行，直接 prompt 会抛 "Agent is already processing"——followUp
        // 排队等待，当前 run 结束后作为跟进回合送达（不打断进行中的输出）
        await session.prompt(promptText, Object.assign(
          { streamingBehavior: 'followUp' },
          imageBlocks.length ? { images: imageBlocks } : {}))
        // 先快照本回合产出（下方映射同步会清空 assistantIds）
        const turnOutputCount = (entry.assistantIds && entry.assistantIds.length) || 0
        const openTools = (entry.openToolCalls && entry.openToolCalls.length) || 0
        // 回合映射同步（pi 树新增 ↔ 自有 JSONL 新增，严格对齐失败则
        // 跳过本批，后续分支切换自动兜底回放）与回放重建映射的全量落盘
        syncPiEntryMapAfterTurn(id, record.id, entry)
        const replayMap = piRuntime.consumeReplayMap(id)
        if (replayMap && replayMap.length) sessions.replacePiEntries(id, replayMap)
        const meta = sessions.touch(id)
        // 异常中止检测：pi 的 abort 语义是 prompt() 正常 resolve 且不发
        // turn_error——异常中止（限流/网络闪断打断 LLM 请求或前台子代理）会被
        // 当成正常完成静默收尾，页面无任何报错。以两条信号判定并显式抛错：
        //   a) 回合结束时仍有未闭合工具调用（tool_start 无 tool_end）
        //   b) 完全空回合（无任何 assistant 内容落盘）
        // 用户主动停止（userInterrupted，经 entry.abort 设置）与模型报错
        // （turnError，turn_error 已落盘并 emit error）不在此列。
        if (!entry.userInterrupted && !entry.turnError && (openTools || !turnOutputCount)) {
          const errMsg = openTools
            ? '回合异常中止：工具执行被取消（模型服务无响应或请求被中断，如限流/网络闪断），本回合未能完成'
            : '回合异常中止：模型服务无响应或请求被取消，本回合无任何输出'
          console.warn('[omnibuddy] session:send 异常中止 id=', id, '| openTools=', openTools, '| output=', turnOutputCount)
          try {
            sessions.addMessage(id, { role: 'assistant', content: '', error: errMsg })
          } catch (err) { /* 会话已删除等忽略 */ }
          emit(getWindow, id, { type: 'error', error: errMsg })
          // 每轮对话结束即沉淀会话记忆摘要（异步，不阻塞返回；同会话条目覆盖式刷新）
          writeExitSummary(id)
          return { ok: false, error: errMsg }
        }
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

  // 运行中插话（pi steer）：排队转向消息，当前工具轮结束后、下次 LLM 调用前送达，
  // 不打断进行中的回答（区别于 interrupt）；消息照常落盘并归属当前分支线路
  ipcMain.handle('omnibuddy:session:steer', async (_e, { id, text, atRefs }) => {
    const r = running.get(id)
    if (!r) return { ok: false, error: '当前会话未在回复中' }
    if (r.mode !== 'pi') return { ok: false, error: '当前会话不支持插话' }
    const body = String(text || '').trim()
    if (!body) return { ok: false, error: '插话内容为空' }
    // # 引用与 sendMessage 同规则：路径块 + 清洗后的正文只拼给模型，
    // 落盘 content 保留原始 token（气泡渲染 chip、回放时按 atRefs 重建）
    const promptText = buildRefsBlock(atRefs) + stripRefTokens(body)
    const extras = (Array.isArray(r.anchors) && r.anchors.length) ? { anchors: r.anchors.slice() } : {}
    if (Array.isArray(atRefs) && atRefs.length) {
      extras.atRefs = atRefs.map(ref => ({ name: ref.name || '', kind: ref.kind === 'dir' ? 'dir' : 'file', path: ref.path || '', rel: ref.rel || '' }))
    }
    const { record } = sessions.addMessage(id, Object.assign({
      role: 'user',
      content: body,
      steered: true
    }, extras))
    emit(getWindow, id, { type: 'user_message', message: record })
    const ok = await piRuntime.steerSession(id, promptText)
    return ok ? { ok: true } : { ok: false, error: '插话失败（会话可能已结束，请稍后重发）' }
  })

  // 中断当前回复
  ipcMain.handle('omnibuddy:session:interrupt', async (_e, id) => {
    const r = running.get(id)
    if (r && r.abort) {
      try { r.abort() } catch (err) { /* 忽略 */ }
      emit(getWindow, id, { type: 'interrupted' })
    }
    // 中断时拒绝该会话未决的权限确认（authorizer 的 Promise 须终结，否则工具门悬挂）
    // 用专用值 deny_interrupt 与「用户点击拒绝」区分：authorizer 据此给出
    // 准确文案，避免中断后被日志/模型误读为用户主动拒绝
    for (const [askId, p] of Array.from(pendingPermissions.entries())) {
      if (p.chatId === id) {
        pendingPermissions.delete(askId)
        p.resolve('deny_interrupt')
      }
    }
    // 同样拒绝 ui.select 兜底路径的未决确认
    piRuntime.rejectUiAsks(id)
    return true
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
}

module.exports = {
  // 注册流式对话 IPC（send / steer / interrupt / ask-user:reply）
  registerChatIpc
}
