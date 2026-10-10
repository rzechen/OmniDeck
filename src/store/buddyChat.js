// OmniBuddy 会话状态池：对话状态提升到 store，组件实例（页签缓存/重建）只是视图层
// - 主进程流式事件全局单点订阅，按 sessionId 定向写入对应会话：
//   切菜单 / 返回 deck / 关闭页签 / 组件重建期间事件不丢，回到会话即从池内恢复
// - '' 为新对话暂存位，send() 创建会话后整体迁移至正式 id（配合 tagsView REBIND 保 uid，实例不重建）
// - $message / $root 广播等 UI 副作用经 notice 队列中转，由组件层认领消费（store 不碰 UI）

// 乐观消息本地 id 生成器：占位消息在 assistant_end 回填服务端 messageId 之前，
// 用 _localId 作为列表 key 的稳定来源（回填 id 后 key 不突变，避免整树重建吞掉点击/展开状态）
let _localSeq = 0
export function genLocalId() {
  return '_l' + Date.now().toString(36) + (_localSeq++).toString(36)
}

// 单个会话的初始状态
function blankSession() {
  return {
    messages: [],          // 消息列表（一次问答聚合为一条助手消息；含分支变体全量，
                           // 显示时按分支视图过滤 —— 见 utils/branchView.js）
    streaming: false,      // 本会话是否有流式轮次进行中
    turnMsg: null,         // 本轮助手消息（跨工具调用持续复用同一条）
    cycleBase: '',         // 本轮正文基线（工具调用后模型续写需拼接在前段之后）
    thinkingItem: null,    // 当前累积中的思考内容块
    thinkTicking: false,   // 思考秒计时开关（全局 tick 按开关递增 seconds，切走期间照常累计）
    permQueue: [],         // 待确认权限队列（浮动条数据源）
    draft: '',             // 输入框草稿
    fileAttachments: [],   // 待发送文件附件
    quote: '',             // 划选追问引用原文（输入框顶部引用条数据源）
    workspaceLink: { dir: '', name: '', workspaceId: '' }, // 关联磁盘路径三元组
    workspaceLocked: false, // 会话已绑定空间（锁定切换器）
    branchActive: {},      // 会话内分支切换状态：组头id -> 激活变体id（缺省取组内最新）
    turnAnchors: [],       // 当前流式轮次的分支线路（ask_user 等实时消息归属标记）
    atBottom: true,        // 滚动位置标记（在底部时新消息自动跟滚）
    loaded: false,         // 历史已拉取标记（防止重复 IPC）
    doneTimer: null,       // done 收尾防抖定时器（续跑回合毫秒级跟进时避免 meta 行闪现）
    lastFinishedMsg: null, // 刚被中断的本轮消息（供中断后迟到的 assistant_end 回填 id/用量）
    bgRuns: []             // 活跃子代理后台 run（runId/agent/task/snapshot；任务列表 running 态判据）
  }
}

// mutation 内部工具：确保会话池存在并返回（幂等）
function ensure(state, id) {
  if (!state.sessions[id]) state.sessions[id] = blankSession()
  return state.sessions[id]
}

// 分支线路一致性判定：两条消息的 anchors 相同才允许归并到同一轮助手消息
// （不同线路的消息交错落在 JSONL 中，不能跨线合并）
function sameAnchors(a, b) {
  return (Array.isArray(a) ? a.join('\u0000') : '') === (Array.isArray(b) ? b.join('\u0000') : '')
}

// 历史记录归一化为「助手消息内嵌内容块」，与实时聚合模型保持一致：
// 1) role:'tool' 记录归并进本轮助手消息的 items
// 2) 被工具调用/权限确认（permission 历史行）隔开的连续助手记录合并为一条
//    （两轮问答之间必有 user 记录，遇到 user 即开启新一轮归并）
function normalizeHistory(list) {
  const out = []
  // 当前轮次的助手消息（归并目标）：permission / ask_user / todo 等展示行不打断归并
  let lastAssistant = null
  // 暂存的 ask_user 问答（其落盘早于 tool(ask_user) 记录，等 tool 记录到达时挂接）
  let pendingAsk = null
  // 把暂存的问答挂到本轮「询问用户」工具条目上；无工具条目时追加独立条目
  const attachAsk = () => {
    if (!pendingAsk) return
    if (lastAssistant) {
      const items = lastAssistant.items || (lastAssistant.items = [])
      let attached = false
      for (let i = items.length - 1; i >= 0; i--) {
        if (items[i].type === 'tool' && items[i].toolName === 'ask_user' && !items[i].ask) {
          items[i].ask = pendingAsk
          attached = true
          break
        }
      }
      if (!attached) items.push(pendingAsk)
    }
    pendingAsk = null
  }
  for (const m of list) {
    if (m.role === 'tool') {
      if (lastAssistant && sameAnchors(m.anchors, lastAssistant.anchors)) {
        const item = {
          type: 'tool',
          toolCallId: '',
          toolName: m.toolName,
          args: m.args,
          status: 'done',
          result: m.result || '',
          isError: !!m.isError,
          fileChange: m.fileChange || null,
          artifacts: m.artifacts || null,
          // 深度研究：workflow 运行标识（后台 runId；前台含最终快照）
          workflow: m.workflow || null
        }
        lastAssistant.items.push(item)
        // ask_user 工具记录到达：挂接暂存的问答（落盘顺序问答在前、工具在后）
        if (m.toolName === 'ask_user' && pendingAsk) {
          item.ask = pendingAsk
          pendingAsk = null
        }
      }
      continue
    }
    // ask_user 问答记录：暂存，待本轮 tool(ask_user) 记录到达时挂接（与实时路径一致）
    if (m.role === 'ask_user') {
      pendingAsk = {
        type: 'ask',
        callId: '',
        question: m.question || '',
        options: m.options || [],
        multiSelect: !!m.multiSelect,
        answered: true,
        answer: m.answer || '',
        _input: ''
      }
      continue
    }
    if (m.role === 'assistant') {
      // 压缩摘要（compaction 分界）独立成条，且不作为后续助手记录的归并目标
      if (m.compaction) {
        attachAsk()
        lastAssistant = null
        out.push(Object.assign({}, m, { items: [] }))
        continue
      }
      if (lastAssistant && sameAnchors(m.anchors, lastAssistant.anchors)) {
        // 中途旁白记录（mid：该轮流式以工具调用收尾）：思考与过程说明按原顺序
        // 归位思考区，正文不并入（与实时渲染语义一致）
        if (m.mid) {
          if (m.thinking) lastAssistant.items.push({ type: 'thinking', content: m.thinking })
          if (m.content) lastAssistant.items.push({ type: 'narration', content: m.content })
        } else {
          if (m.content) lastAssistant.content = lastAssistant.content ? lastAssistant.content + '\n\n' + m.content : m.content
          if (m.thinking) lastAssistant.items.push({ type: 'thinking', content: m.thinking })
        }
        // token 用量累加（工具循环中被归并的多条助手记录）
        if (m.usage) {
          lastAssistant.usage = lastAssistant.usage || { input: 0, output: 0 }
          lastAssistant.usage.input += m.usage.input || 0
          lastAssistant.usage.output += m.usage.output || 0
          // 上下文占用取最新值（快照，不累加）
          if (m.usage.contextTokens != null) {
            lastAssistant.usage.contextTokens = m.usage.contextTokens
            lastAssistant.usage.contextWindow = m.usage.contextWindow
          }
        }
        // 供应商错误记录：归并后仍保留展示
        if (m.error) lastAssistant.error = m.error
        continue
      }
      const msg = Object.assign({}, m, { items: [] })
      if (m.thinking) msg.items.push({ type: 'thinking', content: m.thinking })
      // 首条即为中途旁白（本轮开场即工具调用）：正文归位思考区
      if (m.mid && m.content) {
        msg.items.push({ type: 'narration', content: m.content })
        msg.content = ''
      }
      out.push(msg)
      lastAssistant = msg
      continue
    }
    // 用户消息开启新一轮问答，重置归并目标（先挂接上一轮暂存的问答）
    if (m.role === 'user') {
      attachAsk()
      lastAssistant = null
    }
    out.push(Object.assign({}, m))
  }
  // 末轮问答无后续 user：挂接残留
  attachAsk()
  return out
}

// 本轮助手消息（跨工具调用持续复用同一条）
function ensureTurnMessage(s) {
  if (s.turnMsg && s.messages.indexOf(s.turnMsg) >= 0) return s.turnMsg
  const msg = {
    role: 'assistant',
    content: '',
    streaming: true,
    isThinking: false,
    seconds: 0,
    createdAt: Date.now(),
    _localId: genLocalId(),
    items: []
  }
  // 兜底创建时带上本轮分支线路（正常流程占位消息由页面层先行 push）
  if (s.turnAnchors && s.turnAnchors.length) msg.anchors = s.turnAnchors.slice()
  s.messages.push(msg)
  s.turnMsg = msg
  s.cycleBase = ''
  s.thinkingItem = null
  return msg
}

// 结束本轮：清理流式/思考态，释放引用
function finishTurn(s) {
  // 收尾即取消未决的 done 防抖（interrupted/error 等先行收尾时清掉残留定时器）
  if (s.doneTimer) { clearTimeout(s.doneTimer); s.doneTimer = null }
  const msg = s.turnMsg
  if (msg) {
    // 兜底收尾仍标记 running 的工具条：done / error 结束路径可能没有 tool_end
    // （回合中止、pi 侧事件丢失、bash 命令仍在后台执行而模型请求已报错），
    // 不收尾会永久转圈——如实标注结果未被采用（interrupted 分支已先行
    // 收尾并写"已停止生成"，此处扫描天然跳过，幂等）
    if (msg.items) {
      for (const it of msg.items) {
        if (it.type === 'tool' && it.status === 'running') {
          it.status = 'done'
          if (!it.result) it.result = '回合已结束，工具未返回结果（命令可能仍在后台执行，输出未被采用）'
        }
      }
    }
    delete msg.streaming
    delete msg.thinking
    msg.isThinking = false
  }
  s.turnMsg = null
  s.thinkingItem = null
  s.cycleBase = ''
  s.thinkTicking = false
}

// 按 toolCallId 定位本轮工具内容块
function findToolItem(s, toolCallId) {
  const msg = s.turnMsg
  if (!msg || !msg.items) return null
  for (let i = msg.items.length - 1; i >= 0; i--) {
    const it = msg.items[i]
    if (it.type === 'tool' && it.toolCallId === toolCallId) return it
  }
  return null
}

// 倒序找最近的 report_site_auth 工具条目（site_auth 事件缺 toolCallId 时的关联兜底）
function findLatestSiteAuthItem(s) {
  const msg = s.turnMsg
  if (!msg || !msg.items) return null
  for (let i = msg.items.length - 1; i >= 0; i--) {
    const it = msg.items[i]
    if (it.type === 'tool' && it.toolName === 'report_site_auth') return it
  }
  return null
}

// 流式轮次内事件集合：仅在 streaming=true 时有效（结束后到达即视为迟到丢弃）
const TURN_EVENTS = [
  'assistant_start', 'delta', 'thinking', 'skill',
  'tool_start', 'tool_update', 'tool_end', 'assistant_end'
]

export default {
  namespaced: true,
  state: () => ({
    sessions: {}, // sessionId -> 会话状态（'' 为新对话暂存位）
    notice: [],   // UI 事件队列（$message / $root 广播由组件认领后执行）
    nseq: 0,      // notice 自增 id（认领去重用）
    _unsub: null, // onEvent 退订句柄（App 常驻，实际不退订）
    _tick: null   // 思考秒计时 interval
  }),
  getters: {
    // 会话状态（未初始化时为 null；写入一律经 mutations）
    session: state => id => state.sessions[id] || null
  },
  mutations: {
    // 确保会话池存在（幂等）
    ENSURE(state, id) {
      ensure(state, id)
    },
    // 新对话 '' → 正式会话 id：状态整体迁移（消息/草稿/附件/空间绑定全保留）
    MIGRATE(state, { from, to }) {
      const s = state.sessions[from] || blankSession()
      // 迁移后的状态即该会话的完整实时态：置 loaded，
      // 防止切走再回来时 loadHistory 拉取已落盘历史覆盖正在进行的流式轮次
      // （表现为 token 行提前出现、深度思考分块错乱、流不接着之前的内容）
      s.loaded = true
      state.sessions[to] = s
      delete state.sessions[from]
    },
    // 覆盖会话消息（历史拉取完成）
    SET_MESSAGES(state, { id, messages }) {
      const s = ensure(state, id)
      s.messages = messages
      s.loaded = true
    },
    // 局部更新会话字段（草稿/流式态/空间绑定等）
    PATCH(state, { id, patch }) {
      const s = ensure(state, id)
      // Vue.set 逐字段写入：patch 携带会话骨架未预定义的新字段时仍保持响应式
      // （Object.assign 新增属性不触发依赖更新）
      Object.keys(patch).forEach(k => { s[k] = patch[k] })
    },
    // 追加消息（用户消息 / 占位助手消息）
    PUSH_MSG(state, { id, msg }) {
      ensure(state, id).messages.push(msg)
    },
    // 附件入列 / 移除
    ATTACH_PUSH(state, { id, item }) {
      ensure(state, id).fileAttachments.push(item)
    },
    ATTACH_REMOVE(state, { id, index }) {
      ensure(state, id).fileAttachments.splice(index, 1)
    },
    // 权限确认出队（按索引）
    PERM_REMOVE(state, { id, index }) {
      ensure(state, id).permQueue.splice(index, 1)
    },
    // 删除会话时清理状态池
    DROP_SESSION(state, id) {
      delete state.sessions[id]
    },
    // UI 事件入队（限量 50，避免无组件消费时无限堆积）
    NOTICE(state, item) {
      state.notice.push(Object.assign({ nid: ++state.nseq, ts: Date.now() }, item))
      if (state.notice.length > 50) state.notice.splice(0, state.notice.length - 50)
    },
    // 认领移除（claim action 查到后才提交，保证只被消费一次）
    CLAIM(state, nid) {
      const i = state.notice.findIndex(n => n.nid === nid)
      if (i >= 0) state.notice.splice(i, 1)
    }
  },
  actions: {
    // 全局单点订阅主进程流式事件 + 启动思考秒计时（幂等，App 启动时调用一次）
    init({ state, dispatch, commit }) {
      if (state._unsub) return
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (api && api.onEvent) {
        state._unsub = api.onEvent(e => dispatch('handleEvent', e))
      }
      state._tick = setInterval(() => dispatch('tick'), 1000)
      // 恢复未决权限确认：渲染层重载（HMR/刷新）会丢失一次性推送的
      // permission_ask 事件，就绪后主动拉取重新入队（会话不在池中先建池）
      if (api && api.pendingPermissions) {
        api.pendingPermissions().then(list => {
          for (const e of (Array.isArray(list) ? list : [])) {
            if (!e || !e.askId || !e.sessionId) continue
            commit('ENSURE', e.sessionId)
            dispatch('handleEvent', { type: 'permission_ask', askId: e.askId, sessionId: e.sessionId, surface: e.surface, value: e.value, toolName: e.toolName, command: e.command, path: e.path, preview: e.preview })
          }
        }).catch(() => {})
      }
    },
    // 思考计时：为「计时中」的轮次每秒递增秒数（组件切走期间照常累计）
    tick({ state }) {
      for (const id in state.sessions) {
        const s = state.sessions[id]
        if (s.thinkTicking && s.turnMsg && s.turnMsg.thinking) s.turnMsg.seconds++
      }
    },
    // 拉取会话历史入池（已拉取过、或流式进行中时跳过 —— 重拉会覆盖实时聚合态；
    // force 用于回退/回滚等明确需要重载的场景，调用方已先行结束本轮）
    async loadHistory({ state, commit }, { id, force } = {}) {
      if (!id) {
        commit('ENSURE', id)
        return
      }
      const s = state.sessions[id]
      if (s && !force && (s.loaded || s.streaming)) return
      const api = (window.electronAPI && window.electronAPI.omnibuddy) || { getMessages: async () => [] }
      const list = await api.getMessages(id)
      // 历史记录：todo 只保留最新一条（避免回放堆积）
      const seenTodo = list.some(m => m.role === 'todo')
      const filtered = seenTodo
        ? list.filter(m => m.role !== 'todo' || m === [...list].reverse().find(x => x.role === 'todo'))
        : list
      commit('SET_MESSAGES', { id, messages: normalizeHistory(filtered) })
      // 切换到运行中会话的兜底恢复：定时任务可能在页面打开前已启动
      // （渲染层重载会错过一次性的 automation:run 推送），以主进程运行表为准。
      // 仅当末条是 user（尚无任何助手输出落盘）才建占位，避免在
      // 「done 已处理、running 表删除前的毫秒窗口」误挂永久转圈的占位
      if (typeof api.isRunning !== 'function') return
      let live = false
      try { live = await api.isRunning(id) } catch (e) { /* 非 Electron 环境忽略 */ }
      const cur = state.sessions[id]
      const last = cur && cur.messages[cur.messages.length - 1]
      if (live && cur && !cur.streaming && last && last.role === 'user') {
        cur.streaming = true
        cur.thinkTicking = true
        ensureTurnMessage(cur).thinking = true
      }
      // 子代理后台 run 恢复：主进程注册表为状态源（刷新/重开重建任务列表
      // running 态与卡片进度；仍在运行的 run 由主进程重挂轮询继续推送）
      if (typeof api.subagentActiveRuns === 'function') {
        try {
          const r = await api.subagentActiveRuns(id)
          if (r && r.ok && Array.isArray(r.runs)) {
            cur.bgRuns = r.runs.map(x => ({
              runId: x.runId,
              agent: x.agent || '',
              task: x.task || '',
              snapshot: x.snapshot || null
            }))
          }
        } catch (e) { /* 主进程旧版本无此 IPC 忽略 */ }
      }
    },
    // 新对话状态迁移到正式会话
    migrate({ commit }, { from, to }) {
      commit('MIGRATE', { from, to })
    },
    // 结束本轮（组件侧兜底场景，如发送失败）
    finishTurn({ state }, id) {
      const s = state.sessions[id]
      if (s) finishTurn(s)
    },
    // 认领 UI 事件（多个缓存实例同时 watch 时保证只被消费一次）
    claim({ state, commit }, nid) {
      if (state.notice.findIndex(n => n.nid === nid) < 0) return false
      commit('CLAIM', nid)
      return true
    },
    // 主进程流式事件：按 sessionId 定向写入会话池（组件在不在场都照常累积）
    // （自 chat 组件 onAgentEvent 迁入，行为保持一致；UI 提示改走 notice）
    handleEvent({ state, commit, dispatch }, e) {
      // 定时任务无头会话（自动化）：主进程先落盘用户消息（user_message）
      // 再广播 automation:run。普通对话的 user_message 是乐观消息的落盘回执、
      // 池必已存在；定时任务会话池尚不存在 —— 建池并把任务的问题入池，
      // 否则会话视图中缺失任务指令（只见异常气泡不见提问）
      if (e.type === 'user_message' && e.sessionId && e.message && e.message.id && !state.sessions[e.sessionId]) {
        commit('ENSURE', e.sessionId)
        state.sessions[e.sessionId].messages.push(normalizeHistory([e.message])[0])
      }
      // 定时任务启动（自动化）：会话可能从未在前端打开（如错过上面的
      // user_message），先建池再进入流式乐观占位 —— 否则事件在下方「会话不在池」
      // 守卫被丢，切到该对话要等 pi 冷启动 + LLM 首 token 后才见「思考中」
      if (e.type === 'automation:run' && e.sessionId) {
        if (!state.sessions[e.sessionId]) commit('ENSURE', e.sessionId)
        // 乐观流式态（含上方入池的用户消息）即该会话的完整实时态，直接置
        // loaded（与 MIGRATE 同理）：否则切到该会话时 loadHistory 被 streaming
        // 守卫拦截，loaded 恒为 false，页面将永久停在历史加载骨架屏
        state.sessions[e.sessionId].loaded = true
      }
      const s = state.sessions[e.sessionId]
      if (!s) return
      // 中断后迟到的 assistant_end：pi 中止后仍会送达本轮落盘回执（含消息 id、
      // 上下文快照等）——回填到刚被中断的消息（restore id/用量，不新建气泡）
      if (!s.streaming && e.type === 'assistant_end' && s.lastFinishedMsg) {
        const m = s.lastFinishedMsg
        s.lastFinishedMsg = null
        if (s.messages.indexOf(m) >= 0) {
          if (!m.id && e.messageId) m.id = e.messageId
          if (e.usage && (e.usage.input || e.usage.output || e.usage.contextTokens)) {
            const prev = m.usage || { input: 0, output: 0 }
            m.usage = {
              input: prev.input + (e.usage.input || 0),
              output: prev.output + (e.usage.output || 0),
              contextTokens: e.usage.contextTokens,
              contextWindow: e.usage.contextWindow
            }
          }
        }
        return
      }
      // 迟到的轮次内事件防护：中断（interrupted）/错误已结束流式态后，
      // 主进程仍可能送达迟到的 assistant_start / tool_end 等（时序错位）。
      // 此时 ensureTurnMessage 会凭空新建一条空助手消息（表现为中断后
      // 出现两行 meta 操作行），一律忽略
      //
      // 例外（深度研究）：自发回合 —— 后台 workflow 结果回注对话或自动化
      // 任务触发的回合没有用户发送动作（streaming=false），assistant_start
      // 即开启「幽灵回合」，让后续 delta / tool / assistant_end 正常渲染。
      // 中断后（lastFinishedMsg 残留）仍维持丢弃，避免被中止回合的迟到事件误触发
      //
      // 聚合（pi-subagents async 注入）：后台子代理的结果/监控事件会持续注入
      // 驱动多个自发回合（主 prompt 可能已提前返回并发 done），若每段都新建
      // 消息会出现「多个深度思考、仅首段有 meta 行」的碎片观感 —— 自发续跑
      // 本质是同一任务的延续，复用末条助手消息聚合展示（一个思考区、一个 meta）
      if (e.type === 'assistant_start' && !s.streaming && !s.lastFinishedMsg) {
        s.streaming = true
        s.lastFinishedMsg = null
        // 尾部一路找本任务的助手消息（越过 todo/permission 等展示行；遇 user
        // 或压缩分界停止 —— 压缩意味着上下文重置，续跑拼接旧正文会错位；
        // 其后的续跑不属于任何已有回合，走 ensureTurnMessage 新建）
        for (let i = s.messages.length - 1; i >= 0; i--) {
          const m = s.messages[i]
          if (m.role === 'user' || m.compaction) break
          if (m.role === 'assistant') {
            s.turnMsg = m
            m.streaming = true
            break
          }
        }
      }
      if (!s.streaming && TURN_EVENTS.indexOf(e.type) >= 0) {
        return
      }
      switch (e.type) {
        // 定时任务启动：立即进入流式态（乐观占位，与手动发送一致）。
        // 任务启动到模型首个事件之间隔着 pi 会话冷启动 + LLM 首 token 延迟，
        // 占位让「思考中」秒计时即刻可见，后续 thinking / delta 复用同一条自然续上
        case 'automation:run': {
          if (s.streaming) break
          s.streaming = true
          s.thinkTicking = true
          ensureTurnMessage(s).thinking = true
          break
        }
        // 用户消息落盘回执：回填 id 到前端乐观消息（发送时无 id，
        // 编辑重问 / 分支切换按钮依赖 id 判定可用）
        case 'user_message': {
          const rec = e.message || {}
          if (!rec.id) break
          for (let i = s.messages.length - 1; i >= 0; i--) {
            const m = s.messages[i]
            if (m.role === 'user' && !m.id && m.content === rec.content) {
              m.id = rec.id
              break
            }
          }
          break
        }
        case 'assistant_start': {
          // 助手消息开始（工具调用后模型会再次开始）：复用本轮消息，开启新的思考块
          const msg = ensureTurnMessage(s)
          s.thinkingItem = null
          s.cycleBase = msg.content || ''
          break
        }
        case 'thinking': {
          // 思考过程：按轮次累积为独立内容块（同轮内持续覆盖累积文本）
          const msg = ensureTurnMessage(s)
          if (!s.thinkingItem) {
            s.thinkingItem = { type: 'thinking', content: '' }
            msg.items.push(s.thinkingItem)
          }
          s.thinkingItem.content = e.text || ''
          msg.isThinking = true
          break
        }
        case 'delta': {
          const msg = ensureTurnMessage(s)
          if (msg.isThinking) msg.isThinking = false
          s.thinkTicking = false
          msg.content = s.cycleBase + (e.text || '')
          break
        }
        case 'assistant_end': {
          const msg = ensureTurnMessage(s)
          msg.isThinking = false
          msg.content = s.cycleBase + (e.content || '')
          // 中途正文（本轮流式以工具调用收尾，mid 由主进程按 stopReason 判定）：
          // 移入思考区作为「过程说明」，正文气泡仅为回合最终回复保留
          if (e.mid && (msg.content || '').trim()) {
            msg.items.push({ type: 'narration', content: msg.content })
            msg.content = ''
            s.cycleBase = ''
          }
          delete msg.thinking
          // 回填本轮首条落盘记录 id（仅首次）：实时聚合消息与重开归并消息
          // 指向同一条记录，点赞/点踩持久化与分支据此定位
          if (!msg.id && e.messageId) msg.id = e.messageId
          // token 用量：工具循环中多次模型调用，逐次累加；上下文占用取最新快照
          if (e.usage && (e.usage.input || e.usage.output || e.usage.contextTokens)) {
            const prev = msg.usage || { input: 0, output: 0 }
            msg.usage = {
              input: prev.input + (e.usage.input || 0),
              output: prev.output + (e.usage.output || 0),
              contextTokens: e.usage.contextTokens,
              contextWindow: e.usage.contextWindow
            }
          }
          s.thinkTicking = false
          break
        }
        case 'skill': {
          // Skill 激活（模型读取 SKILL.md）：作为内容块插入
          const msg = ensureTurnMessage(s)
          msg.items.push({
            type: 'skill',
            skillName: e.skillName,
            toolCallId: e.toolCallId
          })
          break
        }
        case 'tool_start': {
          const msg = ensureTurnMessage(s)
          // 兜底封存：assistant_end 未带 mid 标记时（供应商 stopReason 缺失等），
          // 工具开始执行即视为此前正文为中途旁白（正常路径已在 assistant_end 封存，
          // 此处 content 为空直接跳过，幂等）
          if ((msg.content || '').trim()) {
            msg.items.push({ type: 'narration', content: msg.content })
            msg.content = ''
            s.cycleBase = ''
          }
          const tool = {
            type: 'tool',
            toolCallId: e.toolCallId,
            toolName: e.toolName,
            args: e.args,
            status: 'running',
            partial: '',
            result: '',
            isError: false
          }
          msg.items.push(tool)
          // ask_user 卡片反向挂接：ask_user 事件先到时暂存的独立条目
          // （type:'ask'）归位到本工具条目上，消除错位
          if (e.toolName === 'ask_user') {
            for (let i = msg.items.length - 2; i >= 0; i--) {
              const it = msg.items[i]
              if (it.type === 'ask' && !it.answered) {
                tool.ask = it
                msg.items.splice(i, 1)
                break
              }
            }
          }
          break
        }
        case 'tool_update': {
          const t = findToolItem(s, e.toolCallId)
          if (t) t.partial = e.partial
          break
        }
        case 'tool_end': {
          const t = findToolItem(s, e.toolCallId)
          if (t) {
            t.status = 'done'
            t.result = e.result || ''
            t.isError = !!e.isError
            t.fileChange = e.fileChange || null
            t.artifacts = e.artifacts || null
            // 深度研究：workflow 工具返回 runId（后台）或最终快照（前台）
            if (e.workflow) {
              t.workflow = e.workflow
              if (!e.workflow.background && e.workflow.snapshot) {
                t.workflow.progress = e.workflow.snapshot
              }
            }
            // 子代理后台 run 启动回执：立即入 bgRuns（任务列表即时转 running，
            // 不等主进程轮询首帧）
            if (e.workflow && e.workflow.kind === 'subagent' && e.subagentRun) {
              s.bgRuns.push({
                runId: e.subagentRun.runId,
                agent: e.subagentRun.agent || '',
                task: e.subagentRun.task || '',
                snapshot: null
              })
            }
          }
          break
        }
        case 'site_auth': {
          // 撞登录墙上报：把站点信息附加到上报工具条目，思考区卡片内嵌
          // 「打开登录向导」一键按钮（应用内直达，不依赖系统通知）；
          // logged_in 广播（向导检测成功 / 补登成功）翻转同站点行为已登录终态
          if (!e.host) break
          if (e.status === 'logged_in') {
            // 全消息扫描按 host 匹配（登录可能发生在后续回合或手动补登后）；
            // 整体替换 siteLogin 对象保证 vue2 响应式（新增字段不触发更新）
            for (let i = s.messages.length - 1; i >= 0; i--) {
              const m = s.messages[i]
              if (!m.items) continue
              for (let j = m.items.length - 1; j >= 0; j--) {
                const it = m.items[j]
                if (it.type === 'tool' && it.siteLogin && it.siteLogin.host === e.host && !it.siteLogin.loggedIn) {
                  it.siteLogin = Object.assign({}, it.siteLogin, { loggedIn: true })
                }
              }
            }
            break
          }
          const target = (e.toolCallId && findToolItem(s, e.toolCallId)) || findLatestSiteAuthItem(s)
          if (target) {
            target.siteLogin = { host: e.host, url: e.url || undefined }
          }
          break
        }
        case 'workflow_progress': {
          // 深度研究：后台运行状态轮询推送（主进程 1s 轮询 run 落盘 head）
          // 目标工具条目可能在已结束的回合里（后台运行跨越回合），全消息扫描
          const wf = e.workflow || {}
          if (!wf.runId) break
          for (let i = s.messages.length - 1; i >= 0; i--) {
            const m = s.messages[i]
            if (!m.items) continue
            for (let j = m.items.length - 1; j >= 0; j--) {
              const it = m.items[j]
              if (it.type === 'tool' && it.workflow && it.workflow.runId === wf.runId) {
                it.workflow.progress = wf
                i = -1 // 双重跳出
                break
              }
            }
            if (i === -1) break
          }
          // 子代理后台 run：kind='subagent' 快照同步进 bgRuns（任务列表
          // running 态判据；终态帧自动移出，保证 run 生命周期在 UI 有确定归宿）
          if (wf.kind === 'subagent') {
            const running = wf.status === 'running' || wf.status === 'paused'
            const idx = s.bgRuns.findIndex(r => r.runId === wf.runId)
            if (running) {
              if (idx >= 0) {
                s.bgRuns.splice(idx, 1, Object.assign({}, s.bgRuns[idx], { snapshot: wf }))
              } else {
                s.bgRuns.push({ runId: wf.runId, agent: wf.name || '', task: '', snapshot: wf })
              }
            } else if (idx >= 0) {
              s.bgRuns.splice(idx, 1)
            }
          }
          break
        }
        case 'ask_user': {
          // 归位：挂接到思考区「询问用户」工具条目上（卡片与工具条目一体）；
          // tool_start 未到时暂存独立条目，由 tool_start 到达时反向挂接
          const ask = {
            type: 'ask',
            callId: e.callId,
            question: e.question,
            options: e.options || [],
            multiSelect: !!e.multiSelect,
            answered: false,
            _input: ''
          }
          const msg = ensureTurnMessage(s)
          const items = msg.items || (msg.items = [])
          let attached = false
          for (let i = items.length - 1; i >= 0; i--) {
            const it = items[i]
            if (it.type === 'tool' && it.toolName === 'ask_user' && !it.ask) {
              it.ask = ask
              attached = true
              break
            }
          }
          // tool_start 尚未到达（事件先于工具条目）：暂存独立条目，
          // tool_start 到达时反向挂接并移除
          if (!attached) items.push(ask)
          break
        }
        case 'permission_ask':
          // 确认模式：进入待确认队列（输入框上方浮动条逐条处理，不进消息流）
          s.permQueue.push({
            askId: e.askId,
            surface: e.surface,
            value: e.value,
            toolName: e.toolName,
            command: e.command,
            path: e.path,
            preview: e.preview
          })
          // 全局待确认通知：当前激活页签不是该会话时，浮动条不可见，
          // 由布局层弹持续引导（点击跳转），避免隐形挂起
          commit('NOTICE', { sessionId: e.sessionId, kind: 'perm-pending', surface: e.surface || '', value: e.command || e.path || e.value || '' })
          break
        case 'todo_update': {
          // 会话内只保留一张 todo 卡片（新事件替换旧卡片）
          s.messages = s.messages.filter(m => m.role !== 'todo')
          s.messages.push({ role: 'todo', todos: e.todos })
          break
        }
        case 'sandbox_status':
          if (e.status && e.status.enabled) {
            commit('NOTICE', { sessionId: e.sessionId, kind: 'success', text: '沙箱已启用：命令将在受限环境中执行' })
          } else if (e.status && e.status.reason) {
            commit('NOTICE', { sessionId: e.sessionId, kind: 'warning', text: '沙箱未生效：' + e.status.reason })
          }
          break
        case 'compaction_start':
          // 上下文压缩开始：提示条（不中断流式状态）
          commit('NOTICE', { sessionId: e.sessionId, kind: 'info', text: '对话较长，正在自动整理早期记录…' })
          break
        case 'compaction_end': {
          // 压缩完成：摘要已落盘，插入分界气泡（历史重开会话亦可见）
          if (e.errorMessage) {
            commit('NOTICE', { sessionId: e.sessionId, kind: 'warning', text: '上下文整理失败：' + e.errorMessage })
            break
          }
          if (e.aborted || e.willRetry) break
          s.messages.push({
            role: 'assistant',
            content: '',
            createdAt: Date.now(),
            compaction: {
              tokensBefore: e.tokensBefore || 0,
              tokensAfter: e.tokensAfter || 0
            },
            // 归属本轮分支线路（历史重开按线路过滤显示）
            anchors: (s.turnAnchors && s.turnAnchors.length) ? s.turnAnchors.slice() : undefined
          })
          break
        }
        case 'truncated':
          // 其他窗口/入口触发了回退，重新加载消息
          s.streaming = false
          dispatch('loadHistory', { id: e.sessionId, force: true })
          break
        case 'rolled_back':
          // 检查点回滚完成（可能由其他入口触发）：刷新消息，通知组件刷新检查点列表
          s.streaming = false
          finishTurn(s)
          dispatch('loadHistory', { id: e.sessionId, force: true })
          commit('NOTICE', { sessionId: e.sessionId, kind: 'rolled_back' })
          break
        case 'pi_unavailable':
          commit('NOTICE', { sessionId: e.sessionId, kind: 'warning', text: 'Agent 模式不可用，已回退纯对话：' + (e.error || '') })
          break
        case 'done':
          s.streaming = false
          // 收尾防抖（600ms）：后台子代理唤醒 / followUp 排队的续跑回合可能在
          // 毫秒级后开启（assistant_start 到达即置回 streaming）——立即 finishTurn
          // 会让 meta 操作行闪现又消失（"卡一下出现一列 icon"）。延迟收尾，
          // 期间无新回合才真正结束本轮；done 连发幂等（重复 done 重置定时器）
          if (s.doneTimer) clearTimeout(s.doneTimer)
          s.doneTimer = setTimeout(() => {
            s.doneTimer = null
            if (s.streaming) return // 防抖窗口内续跑已开启，本轮延续
            // 正常完成：上一轮残留的中断回填标记失效（若有）
            s.lastFinishedMsg = null
            finishTurn(s)
            commit('NOTICE', { sessionId: e.sessionId, kind: 'sessions-changed' })
          }, 600)
          break
        case 'interrupted': {
          const msg = s.turnMsg
          if (msg) {
            // 运行中的工具块标记为已中断（结束自旋图标，结果标注中文说明）
            if (msg.items) {
              for (const it of msg.items) {
                if (it.type === 'tool' && it.status === 'running') {
                  it.status = 'done'
                  if (!it.result) it.result = '已停止生成'
                }
                // 未回答的提问卡片标记中断（主进程已按取消应答，表单不再可交互）；
                // 兼容独立条目（type:'ask'）与挂接在工具条目上（it.ask）两种形态
                const ask = it.type === 'ask' ? it : it.ask
                if (ask && !ask.answered) {
                  ask.answered = true
                  ask.answer = '（已中断）'
                }
              }
            }
            // 空回复（无正文且无内容块）直接移除占位气泡
            if (!msg.content && (!msg.items || !msg.items.length)) {
              const idx = s.messages.indexOf(msg)
              if (idx >= 0) s.messages.splice(idx, 1)
            } else {
              // 记录被中断的消息：pi 中止后可能仍送达迟到的 assistant_end
              // 落盘回执（消息 id / 上下文快照），届时回填到这条消息上
              s.lastFinishedMsg = msg
            }
          }
          // 待确认队列随中断清空（主进程已按拒绝应答）
          s.permQueue = []
          finishTurn(s)
          s.streaming = false
          break
        }
        case 'error': {
          // 中断（interrupted）已先行结束流式态：迟到的 abort 类错误不再渲染，
          // 否则会新建一条独立错误气泡（如 "This operation was aborted"）
          if (!s.streaming) break
          s.streaming = false
          // 模型/供应商错误：原封不动写入本轮气泡展示（不弹易逝的 toast）
          const errTurn = s.turnMsg || ensureTurnMessage(s)
          errTurn.error = e.error || '生成失败'
          finishTurn(s)
          break
        }
        default:
          break
      }
    }
  }
}
