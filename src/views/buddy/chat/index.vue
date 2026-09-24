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
        <!-- 权限确认浮动条（confirm 模式下有待确认项时显示，不进消息流）：
             底部滑出面板，与输入框同宽（920px）：问题 + 授权内容 + 四档编号选项（支持键盘 1-4） -->
        <transition name="ob-perm-bar">
          <div v-if="pendingPerm" class="ob-perm-bar">
            <div class="ob-perm-bar-head">
              <div class="ob-perm-bar-ico">
                <svg-icon :icon-class="pendingPermIcon" />
              </div>
              <div class="ob-perm-bar-title">{{ permQuestion }}</div>
              <span class="ob-perm-bar-surface">{{ pendingPerm.surface }}</span>
              <span v-if="permQueueCount > 1" class="ob-perm-bar-queue">还有 {{ permQueueCount - 1 }} 项待确认</span>
            </div>

            <div class="ob-perm-bar-fields">
              <div v-if="pendingPerm.path" class="ob-perm-bar-field">
                <div class="ob-perm-bar-label">授权路径读写权限：</div>
                <pre class="ob-perm-bar-code">{{ pendingPerm.path }}</pre>
              </div>
              <div v-if="pendingPerm.command" class="ob-perm-bar-field">
                <div class="ob-perm-bar-label">待执行命令：</div>
                <pre class="ob-perm-bar-code">{{ pendingPerm.command }}</pre>
              </div>
              <div
                v-if="!pendingPerm.path && !pendingPerm.command && (pendingPerm.value || pendingPerm.preview)"
                class="ob-perm-bar-field"
              >
                <div class="ob-perm-bar-label">操作内容：</div>
                <pre class="ob-perm-bar-code">{{ pendingPerm.value || pendingPerm.preview }}</pre>
              </div>
            </div>

            <div class="ob-perm-bar-actions">
              <button class="ob-perm-btn once" @click="answerPermission(pendingPerm, 'allow')">
                <span class="ob-perm-btn-no">1</span>
                <span class="ob-perm-btn-label">仅本次运行</span>
                <span class="ob-perm-btn-desc">只执行这一次</span>
              </button>
              <button class="ob-perm-btn session" @click="answerPermission(pendingPerm, 'allow_session')">
                <span class="ob-perm-btn-no">2</span>
                <span class="ob-perm-btn-label">本次会话允许</span>
                <span class="ob-perm-btn-desc">当前会话内不再询问</span>
              </button>
              <button class="ob-perm-btn always" @click="answerPermission(pendingPerm, 'allow_always')">
                <span class="ob-perm-btn-no">3</span>
                <span class="ob-perm-btn-label">始终允许</span>
                <span class="ob-perm-btn-desc">写入权限策略，永久生效</span>
              </button>
              <button class="ob-perm-btn deny" @click="answerPermission(pendingPerm, 'deny')">
                <span class="ob-perm-btn-no">4</span>
                <span class="ob-perm-btn-label">拒绝执行</span>
                <span class="ob-perm-btn-desc">阻止本次操作</span>
              </button>
            </div>
          </div>
        </transition>
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
              <!-- 工作空间（必填，未关联无法发送；会话已绑定空间后锁定不可切换，新对话可选） -->
              <composer-picker
                picker-key="workspace"
                :active-key="openSelect"
                :model-value="workspaceLink.workspaceId"
                :disabled="workspaceLocked"
                trigger-icon="folder"
                :trigger-label="workspaceLabel"
                :trigger-title="workspaceLocked ? '会话已绑定此工作空间，新建对话可切换' : (workspaceLink.dir || '选择工作空间（必填）')"
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

              <!-- 权限模式（常驻选择器，仿 Trae/WorkBuddy：只读 / 自动 / 每次确认，即时生效） -->
              <composer-picker
                picker-key="permission"
                :active-key="openSelect"
                :model-value="permissionMode"
                trigger-icon="key"
                :trigger-label="permissionModeLabel"
                trigger-title="权限模式"
                panel-title="权限模式"
                :items="permissionModeItems"
                @toggle="toggleSelect('permission')"
                @select="onSelectPermissionMode"
              />

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
      // 会话已绑定工作空间：锁定输入框的空间切换器（pi 会话上下文与空间绑定，中途切换无效）
      workspaceLocked: false,
      // 已登记工作空间列表（上拉选择器数据源）
      workspaces: [],
      // 当前展开的选择面板（'workspace' | 'provider' | 'permission' | ''）
      openSelect: '',
      // ===== 权限模式（只读 / 自动 / 每次确认）与待确认队列（浮动条数据源） =====
      permissionMode: 'confirm',
      permQueue: [],
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
    // ===== 权限模式选择器 =====
    permissionModeLabel() {
      return { readonly: '只读', auto: '自动', confirm: '每次确认' }[this.permissionMode] || '权限模式'
    },
    permissionModeItems() {
      return [
        { value: 'readonly', label: '只读', svg: 'view', tag: '仅查看' },
        { value: 'auto', label: '自动', svg: 'magic-stick', tag: '自主执行' },
        { value: 'confirm', label: '每次确认', svg: 'key', tag: '推荐' }
      ]
    },
    // 待确认浮动条：展示队列首条
    pendingPerm() {
      return this.permQueue.length ? this.permQueue[0] : null
    },
    permQueueCount() {
      return this.permQueue.length
    },
    pendingPermIcon() {
      const s = (this.pendingPerm && this.pendingPerm.surface) || ''
      if (s === 'bash') return 'monitor'
      if (s === 'python') return 'code'
      if (s === 'curl') return 'link'
      if (['write', 'edit', 'multi_edit', 'append', 'mkdir'].indexOf(s) >= 0) return 'edit'
      return 'key'
    },
    // 权限确认问题文案（按工具面区分场景）
    permQuestion() {
      const s = (this.pendingPerm && this.pendingPerm.surface) || ''
      if (['bash', 'python', 'node', 'curl'].indexOf(s) >= 0) return '是否允许运行这个命令？'
      if (['write', 'edit', 'multi_edit', 'append', 'mkdir'].indexOf(s) >= 0) return '是否允许修改这个文件？'
      if (s === 'external_directory' || s === 'external_directory_read') return '是否允许访问工作空间外的路径？'
      return '是否允许执行此操作？'
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
    this.loadPermissionMode()
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
    // 权限面板键盘 1-4 快捷应答（仅本页签激活时生效；同引用重复注册无害）
    window.addEventListener('keydown', this.onPermKeydown)
  },
  deactivated() {
    // keep-alive 页签切走：移除快捷键，避免在其他页签误触应答
    window.removeEventListener('keydown', this.onPermKeydown)
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
        replyPermission: async () => ({ ok: false }),
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
    // 1) role:'tool' 记录归并进本轮助手消息的 items
    // 2) 被工具调用/权限确认（permission 历史行）隔开的连续助手记录合并为一条
    //    （两轮问答之间必有 user 记录，遇到 user 即开启新一轮归并）
    normalizeHistory(list) {
      const out = []
      // 当前轮次的助手消息（归并目标）：permission / ask_user / todo 等展示行不打断归并
      let lastAssistant = null
      for (const m of list) {
        if (m.role === 'tool') {
          if (lastAssistant) {
            lastAssistant.items.push({
              type: 'tool',
              toolCallId: '',
              toolName: m.toolName,
              args: m.args,
              status: 'done',
              result: m.result || '',
              isError: !!m.isError,
              fileChange: m.fileChange || null
            })
          }
          continue
        }
        if (m.role === 'assistant') {
          // 压缩摘要（compaction 分界）独立成条，且不作为后续助手记录的归并目标
          if (m.compaction) {
            lastAssistant = null
            out.push(Object.assign({}, m, { items: [] }))
            continue
          }
          if (lastAssistant) {
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
        // 用户消息开启新一轮问答，重置归并目标
        if (m.role === 'user') lastAssistant = null
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
        // 会话创建即绑定空间快照：锁定切换器（此后本会话不可换空间）
        this.workspaceLocked = true
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
            t.fileChange = e.fileChange || null
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
        case 'permission_ask':
          // 确认模式：进入待确认队列（输入框上方浮动条逐条处理，不进消息流）
          this.permQueue.push({
            askId: e.askId,
            surface: e.surface,
            value: e.value,
            toolName: e.toolName,
            command: e.command,
            path: e.path,
            preview: e.preview
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
          // 待确认队列随中断清空（主进程已按拒绝应答）
          this.permQueue = []
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
    // 回答权限确认（浮动条）：仅本次 / 本会话内 / 始终允许 / 拒绝；处理后出队
    async answerPermission(m, action) {
      const idx = this.permQueue.indexOf(m)
      if (idx < 0) return
      this.permQueue.splice(idx, 1)
      await this.api().replyPermission({
        sessionId: this.sessionId,
        askId: m.askId,
        action
      })
    },
    // 权限面板键盘快捷键：1 仅本次 / 2 本会话 / 3 始终 / 4 拒绝（可输入元素内不拦截）
    onPermKeydown(e) {
      if (!this.pendingPerm) return
      const map = { 1: 'allow', 2: 'allow_session', 3: 'allow_always', 4: 'deny' }
      const action = map[e.key]
      if (!action) return
      const tag = e.target && e.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      e.preventDefault()
      this.answerPermission(this.pendingPerm, action)
    },
    // 权限模式（只读 / 自动 / 每次确认）：切换即时生效，主进程持久化
    async loadPermissionMode() {
      const api = this.api()
      if (!api || !api.getPermissionMode) return
      const res = await api.getPermissionMode()
      if (res && res.ok && res.mode) this.permissionMode = res.mode
    },
    async onSelectPermissionMode(mode) {
      if (mode === this.permissionMode) return
      this.permissionMode = mode
      await this.api().setPermissionMode(mode)
      const name = { readonly: '只读', auto: '自动', confirm: '每次确认' }[mode] || mode
      this.$message.success('权限模式：' + name)
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
          // 会话已关联：回显该会话快照的路径与展示名，并锁定空间切换
          this.workspaceLink = {
            dir: meta.workspaceDir,
            name: meta.displayName || '',
            workspaceId: meta.workspaceId || ''
          }
          this.workspaceLocked = true
          return
        }
      }
      // 新会话（或未绑定空间的旧会话）：可自由选择
      this.workspaceLocked = false
      const saved = getItem('omnibuddy:workspace-link', null)
      if (saved && saved.dir) this.workspaceLink = saved
    },
    // 加载已登记工作空间（仅保留目录仍存在的项）
    async loadWorkspaces() {
      const list = await this.api().listWorkspaces()
      this.workspaces = (list || []).filter(w => w.available)
    },
    // 上拉选择已登记工作空间：同步关联三元组并持久化（会话已锁定时不可切换）
    onSelectWorkspace(id) {
      if (this.workspaceLocked) return
      const ws = this.workspaces.find(w => w.id === id)
      if (!ws) return
      this.openSelect = ''
      this.workspaceLink = { dir: ws.path, name: ws.name || '', workspaceId: ws.id }
      setItem('omnibuddy:workspace-link', this.workspaceLink)
    },
    // 浮层底部「关联新路径」：系统目录选择框 → 登记并直接选中（展示名默认末级目录名）
    async linkNewWorkspace() {
      if (this.workspaceLocked) return
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
    // ===== 检查点 / 回滚（N4）：入口暂移除（恢复时在 composer 工具区加回入口按钮）；
    // 抽屉与回滚广播处理保留，列表加载与回滚在 CheckpointDrawer 内自治 =====
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

  // 顶部渐隐遮罩：滚动时内容贴近顶部边缘淡出，与页签行保持呼吸间距
  //（纯 padding 会随内容滚走，渐隐是滚动间距的通行做法；
  //  首条消息因消息列表 40px 顶部留白位于渐隐区之外，静态展示不受影响）
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 36px);
  mask-image: linear-gradient(to bottom, transparent 0, #000 36px);

  &::-webkit-scrollbar {
    width: 5px;
  }
}

/* ===== 输入区 ===== */
.ob-composer {
  position: relative;
  flex-shrink: 0;
  padding: 10px 18px 14px;
}

/* ===== 权限确认面板（输入框上方底部滑出，与输入框/消息列同宽 920px） ===== */
.ob-perm-bar {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-width: 920px;
  margin: 0 auto 10px;
  padding: 14px 16px;
  border: 1px solid rgba(var(--warning-color-rgb, 230, 162, 60), 0.4);
  border-radius: 18px;
  background: var(--card-bg, #fff);
  box-shadow: 0 12px 36px rgba(0, 0, 0, 0.12);
  backdrop-filter: blur(18px) saturate(1.4);
  -webkit-app-region: no-drag;
}

/* 头部：图标 + 问题标题 + surface 徽标 + 队列计数 */
.ob-perm-bar-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.ob-perm-bar-ico {
  flex-shrink: 0;
  width: 36px;
  height: 36px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.12);
  border: 1px solid rgba(230, 162, 60, 0.25);

  .svg-icon {
    font-size: 17px;
  }
}

.ob-perm-bar-title {
  flex: 1;
  min-width: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-perm-bar-surface {
  flex-shrink: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 10.5px;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.04);
  padding: 0 8px;
  border-radius: 99px;
  line-height: 1.7;
}

.ob-perm-bar-queue {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  color: #e6a23c;
  background: rgba(230, 162, 60, 0.12);
  border: 1px solid rgba(230, 162, 60, 0.28);
  padding: 0 7px;
  border-radius: 99px;
  line-height: 1.6;
}

/* 授权内容区：字段标签 + 代码块（路径 / 命令 / 操作内容） */
.ob-perm-bar-fields {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ob-perm-bar-label {
  margin-bottom: 5px;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.ob-perm-bar-code {
  margin: 0;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: var(--text-primary);
  background: rgba(0, 0, 0, 0.04);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 8px 12px;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 120px;
  overflow-y: auto;
  user-select: text;

  &::-webkit-scrollbar {
    width: 4px;
  }
}

/* 操作区：四档编号选项一行一个（对应键盘 1-4） */
.ob-perm-bar-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ob-perm-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  min-height: 36px;
  padding: 0 12px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary, rgba(0, 0, 0, 0.02));
  cursor: pointer;
  font-family: inherit;
  text-align: left;
  transition: all 0.15s ease;

  .ob-perm-btn-no {
    flex-shrink: 0;
    width: 18px;
    height: 18px;
    border-radius: 6px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    color: var(--text-secondary);
    background: rgba(0, 0, 0, 0.06);
    transition: all 0.15s ease;
  }

  .ob-perm-btn-label {
    flex-shrink: 0;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-primary);
    transition: color 0.15s ease;
  }

  .ob-perm-btn-desc {
    margin-left: auto;
    font-size: 10.5px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:active {
    transform: scale(0.99);
  }

  &.once:hover,
  &.session:hover {
    border-color: rgba(var(--primary-color-rgb, 91, 124, 240), 0.5);
    background: rgba(var(--primary-color-rgb, 91, 124, 240), 0.07);

    .ob-perm-btn-no {
      color: #fff;
      background: var(--primary-color);
    }

    .ob-perm-btn-label { color: var(--primary-color); }
  }

  &.always:hover {
    border-color: rgba(82, 196, 26, 0.5);
    background: rgba(82, 196, 26, 0.08);

    .ob-perm-btn-no {
      color: #fff;
      background: #52C41A;
    }

    .ob-perm-btn-label { color: #38A10C; }
  }

  &.deny:hover {
    border-color: rgba(245, 34, 45, 0.4);
    background: rgba(245, 34, 45, 0.06);

    .ob-perm-btn-no {
      color: #fff;
      background: #F5222D;
    }

    .ob-perm-btn-label { color: #F5222D; }
  }
}

/* 底部滑出：面板自输入框方向整块滑入弹出（Vue2 过渡类名） */
.ob-perm-bar-enter-active {
  transition: opacity 0.25s ease, transform 0.28s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.ob-perm-bar-leave-active {
  transition: opacity 0.16s ease, transform 0.18s ease;
}

.ob-perm-bar-enter,
.ob-perm-bar-leave-to {
  opacity: 0;
  transform: translateY(100%);
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
</style>
