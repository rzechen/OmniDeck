<template>
  <div class="ob-chat">
    <!-- 对话列（主体 + 输入区） -->
    <div class="ob-main-col">
      <!-- 对话主体 -->
      <div ref="body" class="ob-body">
        <!-- 空会话欢迎占位 -->
        <chat-placeholder v-if="!sessionId || !messages.length" />

        <!-- 消息列表（气泡分发在 ChatMessageList 内完成） -->
        <chat-message-list
          v-else
          :messages="messages"
          :streaming="streaming"
          @truncate="truncateAt"
          @branch="branchAt"
          @answer="answerAsk"
        />
      </div>

      <!-- 底部：输入框（磁盘路径/模型选择内嵌于对话框工具栏） -->
      <div class="ob-composer">
        <div class="ob-composer-inner">
          <buddy-composer
            v-model="draft"
            :streaming="streaming"
            :files="fileAttachments"
            :extra-sendable="fileAttachments.length > 0"
            @send="send"
            @stop="interrupt"
            @remove-file="removeFileAttachment"
            @pick="pickAttachments"
            @import-file="importFile"
          >
            <template slot="tools">
              <!-- 工作空间（必填，未关联无法发送；上拉切换已登记空间 / 关联新路径） -->
              <composer-picker
                picker-key="workspace"
                :active-key="openSelect"
                :model-value="workspaceLink.workspaceId"
                trigger-icon="folder"
                :trigger-label="workspaceLabel"
                :trigger-title="workspaceLink.dir || '选择工作空间（必填）'"
                panel-title="工作空间"
                :items="workspaceItems"
                empty-title="暂无可用工作空间"
                empty-desc="点击下方「关联新路径」登记本地目录"
                @toggle="toggleSelect('workspace')"
                @select="onSelectWorkspace"
              >
                <template slot="footer">
                  <div class="ob-ws-add" @click="linkNewWorkspace">
                    <svg-icon icon-class="folder-add" class="ob-ws-add-ico" />
                    <span>关联新路径</span>
                  </div>
                </template>
              </composer-picker>

              <!-- 模型选择（与快捷面板同款 llm 图标） -->
              <composer-picker
                picker-key="provider"
                :active-key="openSelect"
                :model-value="currentProviderId"
                trigger-icon="llm"
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

              <!-- 检查点（N4）：写操作前自动快照，抽屉查看时间线并回滚 -->
              <div
                class="ob-cp-entry"
                :class="{ disabled: !sessionId }"
                :title="sessionId ? '检查点（写操作自动快照，可回滚）' : '发送首条消息后可用'"
                @click="openCheckpoints"
              >
                <svg-icon icon-class="refresh-left" />
              </div>
            </template>
          </buddy-composer>
        </div>
      </div>
    </div>

    <!-- 检查点抽屉（N4）：写操作前自动快照，时间线倒序 + 一键回滚（自治组件，内部加载与回滚） -->
    <checkpoint-drawer
      ref="cp"
      :visible.sync="cpDrawer"
      :session-id="sessionId"
      @rolled-back="onCheckpointRolledBack"
    />
  </div>
</template>

<script>
import BuddyComposer from '@/components/buddy/BuddyComposer.vue'
import ChatPlaceholder from '@/components/buddy/chat/ChatPlaceholder.vue'
import ComposerPicker from '@/components/buddy/chat/ComposerPicker.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import CheckpointDrawer from './components/CheckpointDrawer.vue'
import { getItem, setItem } from '@/utils/db'

// OmniBuddy 对话主区：pi Agent 流式对话
// 一次问答聚合为一条助手消息：正文 + 内嵌内容块（思考过程 / Skill / 工具含 MCP）
export default {
  name: 'OmniBuddyChat',
  components: { BuddyComposer, ChatPlaceholder, ComposerPicker, ChatMessageList, CheckpointDrawer },
  data() {
    return {
      draft: '',
      messages: [],
      streaming: false,
      providers: [],
      currentProviderId: '',
      // 待发送文件附件（[{id,name,size,kind,thumb,path}]，P1-7）
      fileAttachments: [],
      // ===== 关联的本地磁盘路径（必填，未关联无法发送；dir/name/workspaceId） =====
      workspaceLink: { dir: '', name: '', workspaceId: '' },
      // 已登记工作空间列表（上拉选择器数据源）
      workspaces: [],
      // 当前展开的选择面板（'workspace' | 'provider' | ''）
      openSelect: '',
      // 思考计时器（发送后到首个 delta 之间）
      thinkTimer: null,
      // 本轮问答对应的助手消息（一次问答聚合为一条，跨工具调用持续复用）
      turnMsg: null,
      // 本轮已累积正文的基线（工具调用后模型续写，正文需拼接在前一段之后）
      cycleBase: '',
      // 当前正在累积的思考内容块（思考文本按轮次独立成块）
      thinkingItem: null,
      // ===== 检查点（N4）：抽屉开关（列表加载与回滚在 CheckpointDrawer 内自治） =====
      cpDrawer: false,
      unsubscribe: null
    }
  },
  computed: {
    sessionId() {
      return this.$route.query.s || ''
    },
    currentProvider() {
      return this.providers.find(p => p.id === this.currentProviderId) || null
    },
    // 模型选择器选项
    providerItems() {
      return this.providers.map(p => ({
        value: p.id,
        label: p.name + ' · ' + (p.displayName || p.model),
        svg: 'llm'
      }))
    },
    // 工作空间触发 chip 文案：展示名 → 末级目录名 → 占位
    workspaceLabel() {
      const link = this.workspaceLink
      if (!link.dir) return '选择工作空间'
      if (link.name) return link.name
      return String(link.dir).replace(/\/+$/, '').split(/[\\/]/).pop() || link.dir
    },
    // 工作空间选择器选项（仅保留目录仍存在的项）
    workspaceItems() {
      return this.workspaces.map(w => ({
        value: w.id,
        label: w.name || String(w.path || '').replace(/\/+$/, '').split(/[\\/]/).pop() || w.path,
        svg: 'folder'
      }))
    }
  },
  watch: {
    sessionId: {
      immediate: true,
      handler() {
        this.loadMessages()
        // 切换会话/页签：恢复该会话关联的磁盘路径与展示名（新会话用上次关联）
        this.restoreWorkspaceLink()
      }
    }
  },
  created() {
    this.loadProviders()
    this.loadWorkspaces()
    this.restoreWorkspaceLink()
    this.unsubscribe = this.api().onEvent(this.onAgentEvent)
    // 点击面板外关闭
    document.addEventListener('mousedown', this.onDocMouseDown)
  },
  beforeDestroy() {
    this.stopThinkTimer()
    if (this.unsubscribe) this.unsubscribe()
    document.removeEventListener('mousedown', this.onDocMouseDown)
    if (this.streaming && this.sessionId) this.api().interrupt(this.sessionId)
  },
  activated() {
    // keep-alive 页签切回：模型/工作空间可能在其他页签（模型管理、工作空间）有增删，
    // 重新加载列表（loadProviders 内部会保留当前选中，不会打断已选模型）
    this.loadProviders()
    this.loadWorkspaces()
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
        renameWorkspace: async () => ({ ok: false }),
        sessionMeta: async () => null,
        pickAttachments: async () => ({ ok: false, error: '附件需要 OmniDeck 桌面端' }),
        importAttachment: async () => ({ ok: false, error: '附件需要 OmniDeck 桌面端' }),
        listCheckpoints: async () => ({ ok: true, items: [] }),
        rollbackCheckpoint: async () => ({ ok: false, error: '检查点需要 OmniDeck 桌面端' }),
        exportSession: async () => ({ ok: false, error: '导出需要 OmniDeck 桌面端' })
      }
    },
    loadProviders() {
      const list = getItem('aiProviderList', [])
      this.providers = Array.isArray(list) ? list : []
      // 优先保留当前选中（切回页签刷新列表时不打断已选模型）；
      // 否则恢复上次持久化的选择；都无效则回落默认模型
      const savedId = getItem('omnibuddy:providerId', '')
      const keep = this.providers.find(p => p.id === (this.currentProviderId || savedId))
      if (keep) {
        this.currentProviderId = keep.id
        return
      }
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
          // 压缩摘要（compaction 分界）独立成条，不与相邻助手消息归并
          if (m.compaction) {
            out.push(Object.assign({}, m, { items: [] }))
            continue
          }
          const last = out[out.length - 1]
          if (last && last.role === 'assistant') {
            if (m.content) last.content = last.content ? last.content + '\n\n' + m.content : m.content
            if (m.thinking) last.items.push({ type: 'thinking', content: m.thinking })
            // token 用量累加（工具循环中被归并的多条助手记录）
            if (m.usage) {
              last.usage = last.usage || { input: 0, output: 0 }
              last.usage.input += m.usage.input || 0
              last.usage.output += m.usage.output || 0
              // 上下文占用取最新值（快照，不累加）
              if (m.usage.contextTokens != null) {
                last.usage.contextTokens = m.usage.contextTokens
                last.usage.contextWindow = m.usage.contextWindow
              }
            }
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
    // ===== 文件附件（P1-7）=====
    // “+”按钮：系统文件选择框（多选）
    async pickAttachments() {
      if (this.streaming) return
      const res = await this.api().pickAttachments()
      if (!res || !res.ok) {
        if (res && res.error) this.$message.warning(res.error)
        return
      }
      for (const a of res.attachments) this.fileAttachments.push(a)
    },
    // 拖拽/粘贴导入：主进程落盘后入待发送列表
    async importFile(filePath) {
      if (this.streaming) return
      const res = await this.api().importAttachment(filePath)
      if (!res || !res.ok) {
        this.$message.warning((res && res.error) || '附件导入失败')
        return
      }
      this.fileAttachments.push(res.attachment)
    },
    removeFileAttachment(i) {
      this.fileAttachments.splice(i, 1)
    },
    async send() {
      const text = this.draft.trim()
      const files = this.fileAttachments.slice()
      if ((!text && !files.length) || this.streaming) return
      if (!window.electronAPI || !window.electronAPI.omnibuddy) {
        this.$message.info('对话能力需要 OmniDeck 桌面端')
        this.draft = ''
        return
      }
      // 发送前必须选定工作空间（必填）：未选定时展开上拉选择器
      if (!this.workspaceLink.dir || !this.workspaceLink.workspaceId) {
        this.$message.warning('请先选择工作空间后再发送')
        this.openSelect = 'workspace'
        return
      }
      this.draft = ''
      this.fileAttachments = []

      let sessionId = this.sessionId
      if (!sessionId) {
        // 创建会话：快照当前关联的磁盘路径与展示名（左侧列表按展示名分组）
        const session = await this.api().createSession({
          workspaceId: this.workspaceLink.workspaceId,
          workspaceDir: this.workspaceLink.dir,
          displayName: this.workspaceLink.name
        })
        sessionId = session.id
        this.$router.replace({ query: { s: sessionId } })
        // 会话创建后移除空白「新对话」页签（由 ?s= 会话页签接管）
        this.$store.commit('tagsView/DEL_TAB', { side: 'buddy', fullPath: '/omnibuddy' })
        this.$root.$emit('omnibuddy:sessions-changed')
      }

      this.messages.push({
        role: 'user',
        content: text,
        fileAttachments: files.length ? files : undefined,
        createdAt: Date.now()
      })
      // 立即显示「思考中」占位（光标闪烁 + 秒计时）；内容块到达后转为深度思考区
      const placeholder = {
        role: 'assistant',
        content: '',
        streaming: true,
        isThinking: false,
        thinking: true,
        seconds: 0,
        createdAt: Date.now(),
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
        attachments: files,
        provider: this.currentProvider,
        workspaceId: this.workspaceLink.workspaceId,
        displayName: this.workspaceLink.name
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
        createdAt: Date.now(),
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
          // token 用量：工具循环中多次模型调用，逐次累加；上下文占用取最新快照
          if (e.usage && (e.usage.input || e.usage.output || e.usage.contextTokens)) {
            const prev = msg.usage || { input: 0, output: 0 }
            this.$set(msg, 'usage', {
              input: prev.input + (e.usage.input || 0),
              output: prev.output + (e.usage.output || 0),
              contextTokens: e.usage.contextTokens,
              contextWindow: e.usage.contextWindow
            })
          }
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
        case 'compaction_start':
          // 上下文压缩开始：提示条（不中断流式状态）
          this.$message.info('对话较长，正在自动整理早期记录…')
          break
        case 'compaction_end': {
          // 压缩完成：摘要已落盘，插入分界气泡（历史重开会话亦可见）
          if (e.errorMessage) {
            this.$message.warning('上下文整理失败：' + e.errorMessage)
            break
          }
          if (e.aborted || e.willRetry) break
          this.messages.push({
            role: 'assistant',
            content: '',
            createdAt: Date.now(),
            compaction: {
              tokensBefore: e.tokensBefore || 0,
              tokensAfter: e.tokensAfter || 0
            }
          })
          break
        }
        case 'truncated':
          // 其他窗口/入口触发了回退，重新加载消息
          this.streaming = false
          this.loadMessages()
          break
        case 'rolled_back':
          // 检查点回滚完成（可能由其他入口触发）：刷新消息与检查点列表
          this.streaming = false
          this.finishTurn()
          this.loadMessages()
          this.$root.$emit('omnibuddy:sessions-changed')
          this.$message.success('已回滚到检查点')
          if (this.cpDrawer && this.$refs.cp) this.$refs.cp.loadCheckpoints()
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
    // ===== 关联本地磁盘路径（必填；选路径的同时登记为工作空间） =====
    // 恢复上次关联（新会话页）：返回 Buddy 不丢失；已有会话按会话快照恢复
    async restoreWorkspaceLink() {
      if (this.sessionId) {
        const meta = await this.api().sessionMeta(this.sessionId)
        if (meta && meta.workspaceDir) {
          // 会话已关联：回显该会话快照的路径与展示名
          this.workspaceLink = {
            dir: meta.workspaceDir,
            name: meta.displayName || '',
            workspaceId: meta.workspaceId || ''
          }
          return
        }
      }
      const saved = getItem('omnibuddy:workspace-link', null)
      if (saved && saved.dir) this.workspaceLink = saved
    },
    // 加载已登记工作空间（仅保留目录仍存在的项）
    async loadWorkspaces() {
      const list = await this.api().listWorkspaces()
      this.workspaces = (list || []).filter(w => w.available)
    },
    // 上拉选择已登记工作空间：同步关联三元组并持久化
    onSelectWorkspace(id) {
      const ws = this.workspaces.find(w => w.id === id)
      if (!ws) return
      this.openSelect = ''
      this.workspaceLink = { dir: ws.path, name: ws.name || '', workspaceId: ws.id }
      setItem('omnibuddy:workspace-link', this.workspaceLink)
    },
    // 浮层底部「关联新路径」：系统目录选择框 → 登记并直接选中（展示名默认末级目录名）
    async linkNewWorkspace() {
      this.openSelect = ''
      const res = await this.api().addWorkspace()
      if (res && res.ok && res.workspace) {
        // 展示名缺省截取末级目录名（与关联弹窗行为一致，便于会话列表分组）
        const ws = res.workspace
        if (!ws.name) {
          const lastSeg = String(ws.path || '').replace(/\/+$/, '').split(/[\\/]/).pop()
          if (lastSeg) {
            ws.name = lastSeg
            this.api().renameWorkspace({ id: ws.id, name: lastSeg })
          }
        }
        await this.loadWorkspaces()
        this.workspaceLink = { dir: ws.path, name: ws.name || '', workspaceId: ws.id }
        setItem('omnibuddy:workspace-link', this.workspaceLink)
        this.$root.$emit('omnibuddy:workspaces-changed')
        this.$message.success('已关联：' + ws.path)
      } else if (res && !res.canceled && res.error) {
        this.$message.error(res.error)
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
    // ===== 检查点 / 回滚（N4）：列表加载与回滚在 CheckpointDrawer 内自治 =====
    openCheckpoints() {
      if (!this.sessionId) return
      // 抽屉监听 visible 变化自动加载检查点列表
      this.cpDrawer = true
    },
    // 抽屉内回滚成功：兜底刷新消息（主进程亦会广播 rolled_back 统一处理）
    onCheckpointRolledBack() {
      this.loadMessages()
      this.$root.$emit('omnibuddy:sessions-changed')
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

/* ===== 工作空间浮层底部「关联新路径」入口 ===== */
.ob-ws-add {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 32px;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 12px;
  color: $text-secondary;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;

  .ob-ws-add-ico {
    font-size: 14px;
    flex-shrink: 0;
  }

  &:hover {
    background: var(--search-bg-hover);
    color: var(--text-primary);

    .ob-ws-add-ico {
      color: var(--primary-color);
    }
  }
}

/* ===== 检查点入口（composer 工具区） ===== */
.ob-cp-entry {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;

  .svg-icon {
    width: 15px;
    height: 15px;
  }

  &:hover {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.1);
  }

  &.disabled {
    opacity: 0.4;
    cursor: not-allowed;

    &:hover {
      color: $text-secondary;
      background: transparent;
    }
  }
}
</style>
