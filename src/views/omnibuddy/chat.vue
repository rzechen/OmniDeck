<template>
  <div class="ob-chat">
    <!-- 对话列（主体 + 输入区） -->
    <div class="ob-main-col">
      <!-- 对话主体 -->
      <div ref="body" class="ob-body">
        <!-- 空会话欢迎占位 -->
        <chat-placeholder v-if="!sessionId || !messages.length" :mode="mode" @set-mode="setMode" />

        <!-- 消息列表 -->
        <div v-else class="ob-messages">
          <template v-for="(m, i) in messages">
            <message-bubble
              v-if="m.role === 'user' || m.role === 'assistant'"
              :key="(m.id || i) + '-msg'"
              :message="m"
              :streaming="streaming"
              @truncate="truncateAt(m)"
              @branch="branchAt(m)"
            />

            <ask-user-card
              v-else-if="m.role === 'ask_user'"
              :key="(m.id || i) + '-ask'"
              :message="m"
              @answer="answerAsk"
            />

            <todo-card
              v-else-if="m.role === 'todo'"
              :key="(m.id || i) + '-todo'"
              :todos="m.todos"
            />
          </template>
        </div>
      </div>

      <!-- 底部：输入框（空间/模型选择内嵌于对话框工具栏） -->
      <div class="ob-composer">
        <div class="ob-composer-inner">
          <buddy-composer v-model="draft" :streaming="streaming" @send="send" @stop="interrupt">
            <template slot="tools">
              <!-- 对话模式标识（对话开始后锁定显示；空会话时由欢迎页大胶囊切换） -->
              <div v-if="!canSwitchMode" class="ob-mode-pill locked">
                <button
                  type="button"
                  :class="{ active: mode === 'work' }"
                  :disabled="true"
                  :title="mode === 'coding' ? 'Coding 模式（对话开始后锁定）' : '工作模式（对话开始后锁定）'"
                >{{ mode === 'coding' ? 'Coding' : '工作' }}</button>
              </div>

              <!-- 空间选择（空间需已关联本地目录） -->
              <composer-picker
                picker-key="space"
                :active-key="openSelect"
                :model-value="currentSpaceId"
                trigger-icon="folder"
                :trigger-label="currentSpace ? currentSpace.name : '选择空间'"
                :trigger-title="currentSpace ? currentSpace.dir : ''"
                :warn="!currentSpaceId"
                panel-title="空间"
                :items="spaceItems"
                empty-title="暂无空间"
                empty-desc="请在左侧新建空间并关联本地目录"
                @toggle="toggleSelect('space')"
                @select="onSelectSpace"
              >
                <template v-if="currentSpace && !currentSpace.dir" slot="footer">
                  <div class="ob-pop-item ob-pop-footer-item" @click="onSelectSpace('__edit')">
                    <span class="ob-pop-ico"><svg-icon icon-class="folder-add" /></span>
                    <span class="ob-pop-text">关联本地目录…</span>
                  </div>
                </template>
              </composer-picker>

              <!-- 模型选择 -->
              <composer-picker
                picker-key="provider"
                :active-key="openSelect"
                :model-value="currentProviderId"
                trigger-icon="cpu"
                :trigger-label="currentProvider ? currentProvider.model : '选择模型'"
                :trigger-title="currentProvider ? currentProvider.name : ''"
                :warn="!currentProviderId"
                panel-title="模型"
                :items="providerItems"
                empty-title="暂无可用模型"
                empty-desc="请先在设置中添加模型供应商"
                @toggle="toggleSelect('provider')"
                @select="onSelectProvider"
              />
            </template>
          </buddy-composer>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import BuddyComposer from '@/components/buddy/BuddyComposer.vue'
import ChatPlaceholder from '@/components/buddy/chat/ChatPlaceholder.vue'
import MessageBubble from '@/components/buddy/chat/MessageBubble.vue'
import AskUserCard from '@/components/buddy/chat/AskUserCard.vue'
import TodoCard from '@/components/buddy/chat/TodoCard.vue'
import ComposerPicker from '@/components/buddy/chat/ComposerPicker.vue'
import { getItem, setItem } from '@/utils/db'
import { getBuddySpaces, saveBuddySpaces } from '@/utils/buddy-space'

// OmniBuddy 对话主区：pi Agent 流式对话
// 一次问答聚合为一条助手消息：正文 + 内嵌内容块（思考过程 / Skill / 工具含 MCP）
export default {
  name: 'OmniBuddyChat',
  components: { BuddyComposer, ChatPlaceholder, MessageBubble, AskUserCard, TodoCard, ComposerPicker },
  data() {
    return {
      draft: '',
      messages: [],
      streaming: false,
      providers: [],
      currentProviderId: '',
      // ===== 对话模式（'work' 工作模式 / 'coding' Coding 模式；持久化恢复） =====
      mode: getItem('omnibuddy:mode', 'work'),
      // ===== 空间（左侧空间列表数据；选中后作为对话工作空间） =====
      spaces: [],
      currentSpaceId: '',
      // 工作空间列表（空间的关联目录登记于此，发送时主进程按 id 解析目录）
      workspaces: [],
      currentWorkspaceId: '',
      // 当前展开的选择面板（'space' | 'provider' | ''）
      openSelect: '',
      // 思考计时器（发送后到首个 delta 之间）
      thinkTimer: null,
      // 本轮问答对应的助手消息（一次问答聚合为一条，跨工具调用持续复用）
      turnMsg: null,
      // 本轮已累积正文的基线（工具调用后模型续写，正文需拼接在前一段之后）
      cycleBase: '',
      // 当前正在累积的思考内容块（思考文本按轮次独立成块）
      thinkingItem: null,
      unsubscribe: null
    }
  },
  computed: {
    sessionId() {
      return this.$route.query.s || ''
    },
    // 欢迎占位副文案（跟随当前选择的空间）
    // 是否可切换对话模式（仅空会话/新对话可切换，对话开始后锁定）
    canSwitchMode() {
      return !this.sessionId || !this.messages.length
    },
    currentProvider() {
      return this.providers.find(p => p.id === this.currentProviderId) || null
    },
    currentWorkspace() {
      return this.workspaces.find(w => w.id === this.currentWorkspaceId) || null
    },
    // 当前选中的空间（左侧空间列表数据）
    currentSpace() {
      return this.spaces.find(s => s.id === this.currentSpaceId) || null
    },
    // 空间选择器选项（未关联目录的空间：灰色文件夹图标 + 「未关联」弱化标签）
    spaceItems() {
      return this.spaces.map(sp => sp.dir
        ? { value: sp.id, label: sp.name, svg: sp.icon || 'star' }
        : { value: sp.id, label: sp.name, svg: 'folder', tag: '未关联' }
      )
    },
    // 模型选择器选项
    providerItems() {
      return this.providers.map(p => ({
        value: p.id,
        label: p.name + ' · ' + (p.displayName || p.model),
        svg: 'cpu'
      }))
    }
  },
  watch: {
    sessionId: {
      immediate: true,
      handler() {
        this.loadMessages()
      }
    }
  },
  created() {
    this.loadProviders()
    // 空间加载完成后恢复上次选中的空间
    this.loadSpaces().then(() => this.restoreSpaceSelection())
    this.loadWorkspaces()
    this.unsubscribe = this.api().onEvent(this.onAgentEvent)
    // 左侧空间增删改后同步刷新
    this.$root.$on('omnibuddy:spaces-changed', this.refreshSpaces)
    // 点击面板外关闭
    document.addEventListener('mousedown', this.onDocMouseDown)
  },
  beforeDestroy() {
    this.stopThinkTimer()
    if (this.unsubscribe) this.unsubscribe()
    this.$root.$off('omnibuddy:spaces-changed', this.refreshSpaces)
    document.removeEventListener('mousedown', this.onDocMouseDown)
    if (this.streaming && this.sessionId) this.api().interrupt(this.sessionId)
  },
  methods: {
    api() {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      return api || {
        onEvent: () => () => {},
        listSessions: async () => [],
        getMessages: async () => [],
        createSession: async () => null,
        sendMessage: async () => ({ ok: false, error: '对话能力需要 OmniDeck 桌面端' }),
        interrupt: () => {},
        renameSession: async () => null,
        replyAskUser: async () => ({ ok: false }),
        truncateSession: async () => ({ ok: false, error: '仅桌面端可用' }),
        branchSession: async () => ({ ok: false, error: '仅桌面端可用' }),
        listWorkspaces: async () => [],
        addWorkspace: async () => ({ ok: false, canceled: true }),
        removeWorkspace: async () => ({ ok: false }),
        sessionMeta: async () => null
      }
    },
    loadProviders() {
      const list = getItem('aiProviderList', [])
      this.providers = Array.isArray(list) ? list : []
      const def = this.providers.find(p => p.isDefault) || this.providers[0]
      this.currentProviderId = def ? def.id : ''
    },
    async loadMessages() {
      if (!this.sessionId) {
        this.messages = []
        return
      }
      const list = await this.api().getMessages(this.sessionId)
      // 历史记录：todo 只保留最新一条（避免回放堆积）
      const seenTodo = list.some(m => m.role === 'todo')
      const filtered = seenTodo
        ? list.filter(m => m.role !== 'todo' || m === [...list].reverse().find(x => x.role === 'todo'))
        : list
      this.messages = this.normalizeHistory(filtered)
      this.scrollToBottom()
    },
    // 历史记录归一化为「助手消息内嵌内容块」，与实时聚合模型保持一致：
    // 1) role:'tool' 记录归并进相邻助手消息的 items
    // 2) 被工具调用隔开的连续助手记录合并为一条（两轮问答之间必有 user 记录）
    normalizeHistory(list) {
      const out = []
      for (const m of list) {
        if (m.role === 'tool') {
          const last = out[out.length - 1]
          if (last && last.role === 'assistant') {
            last.items.push({
              type: 'tool',
              toolCallId: '',
              toolName: m.toolName,
              args: m.args,
              status: 'done',
              result: m.result || '',
              isError: !!m.isError
            })
          }
          continue
        }
        if (m.role === 'assistant') {
          const last = out[out.length - 1]
          if (last && last.role === 'assistant') {
            if (m.content) last.content = last.content ? last.content + '\n\n' + m.content : m.content
            if (m.thinking) last.items.push({ type: 'thinking', content: m.thinking })
            // 供应商错误记录：归并后仍保留展示
            if (m.error) last.error = m.error
            continue
          }
          const msg = Object.assign({}, m, { items: [] })
          if (m.thinking) msg.items.push({ type: 'thinking', content: m.thinking })
          out.push(msg)
          continue
        }
        out.push(Object.assign({}, m))
      }
      return out
    },
    onSelectProvider(id) {
      this.openSelect = ''
      this.currentProviderId = id
      // 持久化选中模型，切换页面后自动恢复
      setItem('omnibuddy:providerId', id)
    },
    // 切换对话模式（对话开始后锁定；选择持久化）
    setMode(m) {
      if (!this.canSwitchMode || this.mode === m) return
      this.mode = m
      setItem('omnibuddy:mode', m)
    },
    async send() {
      const text = this.draft.trim()
      if (!text || this.streaming) return
      if (!window.electronAPI || !window.electronAPI.omnibuddy) {
        this.$message.info('对话能力需要 OmniDeck 桌面端')
        this.draft = ''
        return
      }
      // 发送前必须选定空间（且空间已关联本地目录）
      if (!this.currentSpaceId) {
        this.$message.warning('请先选择空间')
        return
      }
      if (!this.currentWorkspaceId) {
        this.$message.warning('当前空间未关联本地目录，请先关联')
        return
      }
      this.draft = ''

      let sessionId = this.sessionId
      if (!sessionId) {
        // 会话归属当前选中的空间（底部选择器）
        const spaceId = this.currentSpaceId
        const session = await this.api().createSession({ spaceId, workspaceId: this.currentWorkspaceId, mode: this.mode })
        sessionId = session.id
        this.$router.replace({ query: { s: sessionId } })
        this.$root.$emit('omnibuddy:sessions-changed')
      }

      this.messages.push({ role: 'user', content: text, createdAt: Date.now() })
      // 立即显示「思考中」占位（光标闪烁 + 秒计时）；内容块到达后转为深度思考区
      const placeholder = {
        role: 'assistant',
        content: '',
        streaming: true,
        isThinking: false,
        thinking: true,
        seconds: 0,
        items: []
      }
      this.messages.push(placeholder)
      this.turnMsg = placeholder
      this.cycleBase = ''
      this.thinkingItem = null
      this.startThinkTimer()
      this.streaming = true
      this.scrollToBottom()

      const res = await this.api().sendMessage({
        id: sessionId,
        text,
        provider: this.currentProvider,
        workspaceId: this.currentWorkspaceId,
        mode: this.mode
      })
      if (!res.ok) {
        this.streaming = false
        this.finishTurn()
        this.$message.error(res.error || '发送失败')
      }
    },
    // ===== 本轮助手消息（跨工具调用持续复用同一条） =====
    ensureTurnMessage() {
      if (this.turnMsg && this.messages.indexOf(this.turnMsg) >= 0) return this.turnMsg
      const msg = {
        role: 'assistant',
        content: '',
        streaming: true,
        isThinking: false,
        seconds: 0,
        items: []
      }
      this.messages.push(msg)
      this.turnMsg = msg
      this.cycleBase = ''
      this.thinkingItem = null
      return msg
    },
    // 结束本轮：清理流式/思考态，释放引用
    finishTurn() {
      this.stopThinkTimer()
      const msg = this.turnMsg
      if (msg) {
        this.$delete(msg, 'streaming')
        this.$delete(msg, 'thinking')
        msg.isThinking = false
      }
      this.turnMsg = null
      this.thinkingItem = null
      this.cycleBase = ''
    },
    // 按 toolCallId 定位本轮工具内容块
    findToolItem(toolCallId) {
      const msg = this.turnMsg
      if (!msg || !msg.items) return null
      for (let i = msg.items.length - 1; i >= 0; i--) {
        const it = msg.items[i]
        if (it.type === 'tool' && it.toolCallId === toolCallId) return it
      }
      return null
    },
    // ===== 思考计时（占位消息 seconds 每秒 +1） =====
    startThinkTimer() {
      this.stopThinkTimer()
      this.thinkTimer = setInterval(() => {
        if (this.turnMsg && this.turnMsg.thinking) this.turnMsg.seconds++
      }, 1000)
    },
    stopThinkTimer() {
      if (this.thinkTimer) {
        clearInterval(this.thinkTimer)
        this.thinkTimer = null
      }
    },
    // 主进程流式事件（pi Agent 循环 + 兜底纯对话）
    onAgentEvent(e) {
      if (e.sessionId !== this.sessionId) return
      switch (e.type) {
        case 'assistant_start': {
          // 助手消息开始（工具调用后模型会再次开始）：复用本轮消息，开启新的思考块
          const msg = this.ensureTurnMessage()
          this.thinkingItem = null
          this.cycleBase = msg.content || ''
          break
        }
        case 'thinking': {
          // 思考过程：按轮次累积为独立内容块（同轮内持续覆盖累积文本）
          const msg = this.ensureTurnMessage()
          if (!this.thinkingItem) {
            this.thinkingItem = { type: 'thinking', content: '' }
            msg.items.push(this.thinkingItem)
          }
          this.thinkingItem.content = e.text || ''
          msg.isThinking = true
          break
        }
        case 'delta': {
          const msg = this.ensureTurnMessage()
          if (msg.isThinking) msg.isThinking = false
          this.stopThinkTimer()
          msg.content = this.cycleBase + (e.text || '')
          break
        }
        case 'assistant_end': {
          const msg = this.ensureTurnMessage()
          msg.isThinking = false
          msg.content = this.cycleBase + (e.content || '')
          this.$delete(msg, 'thinking')
          this.stopThinkTimer()
          break
        }
        case 'skill': {
          // Skill 激活（模型读取 SKILL.md）：作为内容块插入
          const msg = this.ensureTurnMessage()
          msg.items.push({
            type: 'skill',
            skillName: e.skillName,
            toolCallId: e.toolCallId
          })
          break
        }
        case 'tool_start': {
          const msg = this.ensureTurnMessage()
          msg.items.push({
            type: 'tool',
            toolCallId: e.toolCallId,
            toolName: e.toolName,
            args: e.args,
            status: 'running',
            partial: '',
            result: '',
            isError: false
          })
          break
        }
        case 'tool_update': {
          const t = this.findToolItem(e.toolCallId)
          if (t) t.partial = e.partial
          break
        }
        case 'tool_end': {
          const t = this.findToolItem(e.toolCallId)
          if (t) {
            t.status = 'done'
            t.result = e.result || ''
            t.isError = !!e.isError
          }
          break
        }
        case 'ask_user':
          this.messages.push({
            role: 'ask_user',
            callId: e.callId,
            question: e.question,
            options: e.options || [],
            answered: false,
            _input: ''
          })
          break
        case 'todo_update': {
          // 会话内只保留一张 todo 卡片（新事件替换旧卡片）
          this.messages = this.messages.filter(m => m.role !== 'todo')
          this.messages.push({ role: 'todo', todos: e.todos })
          break
        }
        case 'sandbox_status':
          if (e.status && e.status.enabled) {
            this.$message.success('沙箱已启用：命令将在受限环境中执行')
          } else if (e.status && e.status.reason) {
            this.$message.warning('沙箱未生效：' + e.status.reason)
          }
          break
        case 'truncated':
          // 其他窗口/入口触发了回退，重新加载消息
          this.streaming = false
          this.loadMessages()
          break
        case 'pi_unavailable':
          this.$message.warning('Agent 模式不可用，已回退纯对话：' + (e.error || ''))
          break
        case 'done':
          this.streaming = false
          this.finishTurn()
          this.$root.$emit('omnibuddy:sessions-changed')
          break
        case 'interrupted': {
          const msg = this.turnMsg
          // 空回复（无正文且无内容块）直接移除占位气泡
          if (msg && !msg.content && (!msg.items || !msg.items.length)) {
            const idx = this.messages.indexOf(msg)
            if (idx >= 0) this.messages.splice(idx, 1)
          }
          this.finishTurn()
          this.streaming = false
          break
        }
        case 'error': {
          this.streaming = false
          // 模型/供应商错误：原封不动写入本轮气泡展示（不弹易逝的 toast）
          const errTurn = this.turnMsg || this.ensureTurnMessage()
          this.$set(errTurn, 'error', e.error || '生成失败')
          this.finishTurn()
          break
        }
        default:
          break
      }
      this.scrollToBottom()
    },
    // 回答 ask_user 表单
    async answerAsk(m, value) {
      const answer = String(value || '').trim()
      if (!answer) return
      m.answered = true
      m.answer = answer
      await this.api().replyAskUser({
        sessionId: this.sessionId,
        callId: m.callId,
        value: answer
      })
    },
    interrupt() {
      if (this.sessionId) this.api().interrupt(this.sessionId)
    },
    // ===== 空间选择（左侧空间列表数据；选中即确定对话的工作空间） =====
    // 工作空间列表（主进程持久化；空间的关联目录登记于此）
    async loadWorkspaces() {
      try {
        const list = await this.api().listWorkspaces()
        this.workspaces = Array.isArray(list) ? list : []
      } catch (e) {
        this.workspaces = []
      }
    },
    async loadSpaces() {
      // 合并系统默认空间（运行时派生，不落盘）与用户空间
      this.spaces = await getBuddySpaces()
      // 选中空间被删除时清空选择
      if (!this.spaces.some(s => s.id === this.currentSpaceId)) {
        this.currentSpaceId = ''
        this.currentWorkspaceId = ''
      }
    },
    // 恢复上次选中的空间（返回 Deck 再进入不丢失）：校验空间仍存在且已关联目录
    async restoreSpaceSelection() {
      const savedId = getItem('omnibuddy:spaceId', '')
      if (!savedId || this.currentSpaceId) return
      const sp = this.spaces.find(s => s.id === savedId)
      if (!sp || !sp.dir) return
      // 等待工作空间列表就绪后映射为 workspaceId
      if (!this.workspaces.length) await this.loadWorkspaces()
      const ws = this.workspaces.find(w => w.path === sp.dir)
      if (!ws) return
      this.currentSpaceId = sp.id
      this.currentWorkspaceId = ws.id
    },
    // 左侧空间变化后刷新（保留仍存在且已关联目录的选择）
    async refreshSpaces() {
      const prev = this.currentSpace
      await this.loadSpaces()
      await this.loadWorkspaces()
      if (prev) {
        const sp = this.spaces.find(s => s.id === prev.id)
        if (sp) this.onSelectSpace(sp.id)
      }
    },
    // ===== 选择面板（打开状态集中管理，同时只展开一个） =====
    toggleSelect(key) {
      this.openSelect = this.openSelect === key ? '' : key
    },
    // 点击面板外关闭
    onDocMouseDown(e) {
      if (!this.openSelect) return
      if (e.target.closest('.ob-select')) return
      this.openSelect = ''
    },
    // 选择空间：校验是否已关联本地目录，再映射为对应工作空间
    async onSelectSpace(command) {
      this.openSelect = ''
      // 为未关联目录的当前空间补选目录
      if (command === '__edit') {
        await this.linkSpaceDir(this.currentSpace)
        return
      }
      const sp = this.spaces.find(s => s.id === command)
      if (!sp) return
      if (!sp.dir) {
        this.currentSpaceId = sp.id
        this.$message.warning('该空间未关联本地目录，请在左侧编辑空间或点击“关联本地目录…”选择目录')
        return
      }
      const ws = this.workspaces.find(w => w.path === sp.dir)
      if (!ws) {
        this.currentSpaceId = sp.id
        this.$message.warning('该空间关联的目录未登记为工作空间，请重新编辑空间选择目录')
        return
      }
      this.currentSpaceId = sp.id
      this.currentWorkspaceId = ws.id
      // 目录不可用（被移动/删除/磁盘未挂载）：仍允许选中但明确提示
      if (ws.available === false) {
        this.$message.warning('该空间关联的目录当前不可用（可能已被移动或磁盘未挂载）')
      }
      // 持久化选中空间，切换页面后自动恢复
      setItem('omnibuddy:spaceId', sp.id)
      // 同步左侧空间选中态（对话列表按该空间过滤）
      this.$root.$emit('omnibuddy:space-selected', sp.id)
    },
    // 为空间选择并关联本地目录（复用工作空间目录选择 IPC）
    async linkSpaceDir(sp) {
      if (!sp) return
      const res = await this.api().addWorkspace()
      if (res && res.ok && res.workspace) {
        sp.dir = res.workspace.path
        // 持久化用户空间（过滤系统默认空间）并通知左侧列表刷新
        saveBuddySpaces(this.spaces)
        this.$root.$emit('omnibuddy:spaces-changed')
        this.currentWorkspaceId = res.workspace.id
        setItem('omnibuddy:spaceId', sp.id)
        this.$message.success('已关联目录：' + res.workspace.path)
      } else if (res && !res.canceled && res.error) {
        this.$message.error(res.error)
      }
    },
    // ===== 回退与分支（M4） =====
    truncateAt(m) {
      this.$confirm('将丢弃该消息及之后的记录，可重新提问。继续吗？', '回退到此处', {
        confirmButtonText: '回退',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const draft = m.content
        const res = await this.api().truncateSession({ id: this.sessionId, messageId: m.id })
        if (res && res.ok) {
          await this.loadMessages()
          this.$message.success('已回退')
          // 预填被丢弃的问题，便于直接修改重发
          this.draft = draft
        } else {
          this.$message.error((res && res.error) || '回退失败')
        }
      }).catch(() => {})
    },
    branchAt(m) {
      this.$confirm('将以此处为分叉点创建分支会话，当前会话保留。继续吗？', '创建分支', {
        confirmButtonText: '创建分支',
        cancelButtonText: '取消',
        type: 'info'
      }).then(async () => {
        const res = await this.api().branchSession({ id: this.sessionId, messageId: m.id })
        if (res && res.ok && res.session) {
          this.$message.success('分支已创建，请在左侧列表打开')
          this.$root.$emit('omnibuddy:sessions-changed')
        } else {
          this.$message.error((res && res.error) || '创建失败')
        }
      }).catch(() => {})
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const body = this.$refs.body
        if (body) body.scrollTop = body.scrollHeight
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-chat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: row;
  -webkit-app-region: no-drag;
  overflow: hidden;
}

/* 对话列：主体 + 输入区 */
.ob-main-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* ===== 主体 ===== */
.ob-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;

  &::-webkit-scrollbar {
    width: 5px;
  }
}

/* ===== 消息列表 ===== */
.ob-messages {
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: 24px 28px 12px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== 输入区 ===== */
.ob-composer {
  flex-shrink: 0;
  padding: 10px 18px 14px;
}

.ob-composer-inner {
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 对话模式分段胶囊：豆包风格（圆角容器 + active 白底阴影滑块感） */
.ob-mode-pill {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-right: 6px;
  padding: 2px;
  border-radius: 100px;
  background: var(--search-bg, rgba(0, 0, 0, 0.05));
  flex-shrink: 0;

  button {
    border: none;
    outline: none;
    background: transparent;
    padding: 3px 10px;
    border-radius: 100px;
    font-size: 12px;
    line-height: 1.4;
    color: var(--text-secondary);
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s ease;

    &.active {
      background: var(--card-bg, #fff);
      color: var(--text-primary);
      font-weight: 500;
      box-shadow: 0 1px 4px rgba(0, 0, 0, 0.14);
    }
  }

  /* 会话已有消息时锁定：按钮禁用，整体弱化 */
  &.locked {
    opacity: 0.6;

    button {
      cursor: not-allowed;
    }
  }
}

/* 选择器底部操作项（关联目录）：与浮层内 item 结构对齐 */
.ob-pop-footer-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 32px;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;

  .ob-pop-ico {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    .svg-icon {
      font-size: 14px;
      color: var(--text-secondary);
    }
  }

  .ob-pop-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    background: var(--search-bg-hover);
    color: var(--text-primary);

    .ob-pop-ico .svg-icon {
      color: var(--primary-color);
    }
  }
}
</style>
