// OmniBuddy 会话状态池：对话状态提升到 store，组件实例（页签缓存/重建）只是视图层
// - 主进程流式事件全局单点订阅，按 sessionId 定向写入对应会话：
//   切菜单 / 返回 deck / 关闭页签 / 组件重建期间事件不丢，回到会话即从池内恢复
// - '' 为新对话暂存位，send() 创建会话后整体迁移至正式 id（配合 tagsView REBIND 保 uid，实例不重建）
// - $message / $root 广播等 UI 副作用经 notice 队列中转，由组件层认领消费（store 不碰 UI）
import Vue from 'vue'

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
    workspaceLink: { dir: '', name: '', workspaceId: '' }, // 关联磁盘路径三元组
    workspaceLocked: false, // 会话已绑定空间（锁定切换器）
    branchActive: {},      // 会话内分支切换状态：组头id -> 激活变体id（缺省取组内最新）
    turnAnchors: [],       // 当前流式轮次的分支线路（ask_user 等实时消息归属标记）
    atBottom: true,        // 滚动位置标记（在底部时新消息自动跟滚）
    loaded: false,         // 历史已拉取标记（防止重复 IPC）
    lastFinishedMsg: null  // 刚被中断的本轮消息（供中断后迟到的 assistant_end 回填 id/用量）
  }
}

// mutation 内部工具：确保会话池存在并返回（幂等）
function ensure(state, id) {
  if (!state.sessions[id]) Vue.set(state.sessions, id, blankSession())
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
          fileChange: m.fileChange || null
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
        if (m.content) lastAssistant.content = lastAssistant.content ? lastAssistant.content + '\n\n' + m.content : m.content
        if (m.thinking) lastAssistant.items.push({ type: 'thinking', content: m.thinking })
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
  const msg = s.turnMsg
  if (msg) {
    Vue.delete(msg, 'streaming')
    Vue.delete(msg, 'thinking')
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
      Vue.set(state.sessions, to, s)
      Vue.delete(state.sessions, from)
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
      Object.assign(s, patch)
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
      Vue.delete(state.sessions, id)
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
      const s = state.sessions[e.sessionId]
      if (!s) return
      // 中断后迟到的 assistant_end：pi 中止后仍会送达本轮落盘回执（含消息 id、
      // 上下文快照等）——回填到刚被中断的消息（restore id/用量，不新建气泡）
      if (!s.streaming && e.type === 'assistant_end' && s.lastFinishedMsg) {
        const m = s.lastFinishedMsg
        s.lastFinishedMsg = null
        if (s.messages.indexOf(m) >= 0) {
          if (!m.id && e.messageId) Vue.set(m, 'id', e.messageId)
          if (e.usage && (e.usage.input || e.usage.output || e.usage.contextTokens)) {
            const prev = m.usage || { input: 0, output: 0 }
            Vue.set(m, 'usage', {
              input: prev.input + (e.usage.input || 0),
              output: prev.output + (e.usage.output || 0),
              contextTokens: e.usage.contextTokens,
              contextWindow: e.usage.contextWindow
            })
          }
        }
        return
      }
      // 迟到的轮次内事件防护：中断（interrupted）/错误已结束流式态后，
      // 主进程仍可能送达迟到的 assistant_start / tool_end 等（时序错位）。
      // 此时 ensureTurnMessage 会凭空新建一条空助手消息（表现为中断后
      // 出现两行 meta 操作行），一律忽略
      if (!s.streaming && TURN_EVENTS.indexOf(e.type) >= 0) return
      switch (e.type) {
        // 用户消息落盘回执：回填 id 到前端乐观消息（发送时无 id，
        // 编辑重问 / 分支切换按钮依赖 id 判定可用）
        case 'user_message': {
          const rec = e.message || {}
          if (!rec.id) break
          for (let i = s.messages.length - 1; i >= 0; i--) {
            const m = s.messages[i]
            if (m.role === 'user' && !m.id && m.content === rec.content) {
              Vue.set(m, 'id', rec.id)
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
          Vue.delete(msg, 'thinking')
          // 回填本轮首条落盘记录 id（仅首次）：实时聚合消息与重开归并消息
          // 指向同一条记录，点赞/点踩持久化与分支据此定位
          if (!msg.id && e.messageId) Vue.set(msg, 'id', e.messageId)
          // token 用量：工具循环中多次模型调用，逐次累加；上下文占用取最新快照
          if (e.usage && (e.usage.input || e.usage.output || e.usage.contextTokens)) {
            const prev = msg.usage || { input: 0, output: 0 }
            Vue.set(msg, 'usage', {
              input: prev.input + (e.usage.input || 0),
              output: prev.output + (e.usage.output || 0),
              contextTokens: e.usage.contextTokens,
              contextWindow: e.usage.contextWindow
            })
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
                Vue.set(tool, 'ask', it)
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
              Vue.set(it, 'ask', ask)
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
          // 正常完成：上一轮残留的中断回填标记失效（若有）
          s.lastFinishedMsg = null
          finishTurn(s)
          commit('NOTICE', { sessionId: e.sessionId, kind: 'sessions-changed' })
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
          Vue.set(errTurn, 'error', e.error || '生成失败')
          finishTurn(s)
          break
        }
        default:
          break
      }
    }
  }
}
