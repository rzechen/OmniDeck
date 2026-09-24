<template>
  <div class="ob-chat">
    <!-- 对话列（主体 + 输入区） -->
    <div class="ob-main-col">
      <!-- 对话主体（滚动位置写入会话池 atBottom，决定新消息是否自动跟滚） -->
      <div ref="body" class="ob-body" @scroll="onBodyScroll">
        <!-- 历史加载骨架（会话存在但历史未拉完，避免闪现欢迎占位再跳变） -->
        <div v-if="historyLoading" class="ob-history-skel">
          <buddy-skeleton type="chat" :count="6" />
        </div>

        <!-- 空会话欢迎占位 -->
        <chat-placeholder v-else-if="!sessionId || !messages.length" />

        <!-- 消息列表（气泡分发在 ChatMessageList 内完成；分支过滤见 branchView computed） -->
        <chat-message-list
          v-else
          :messages="messages"
          :streaming="streaming"
          :perm-pending="pendingPerm"
          @branch="branchAt"
          @feedback="onFeedback"
          @answer="answerAsk"
          @edit-resend="editResend"
          @switch-branch="switchBranch"
        />

        <!-- 回到底部悬浮按钮：用户上滚离开底部后出现，点击平滑滚回并恢复自动跟滚 -->
        <transition name="ob-scroll-btn">
          <div v-if="showBackToBottom" class="ob-back-to-bottom" @click="backToBottom">
            <svg-icon icon-class="top" class="ob-btb-ico" />
            <span v-if="streaming" class="ob-btb-dot"></span>
          </div>
        </transition>
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
              >
                <template slot="footer">
                  <!-- 关系说明收进 hover 提示：默认只占一行 tips 入口，不铺文案 -->
                  <div class="ob-perm-mode-note">
                    <el-tooltip placement="top" popper-class="ob-perm-mode-tip" :open-delay="150">
                      <div slot="content">
                        <p><b>权限策略</b>：决定每个工具 / 路径是「允许 / 需确认 / 拒绝」。允许与拒绝的规则直接执行，不经过权限模式。</p>
                        <p><b>权限模式（此处）</b>：只裁决「需确认」的操作——每次确认：弹卡询问；自动：直接放行；只读：直接拒绝。</p>
                      </div>
                      <span class="ob-perm-mode-note-trigger">
                        <svg-icon icon-class="tips" class="ob-perm-mode-note-ico" />
                        <span>模式与策略的关系</span>
                      </span>
                    </el-tooltip>
                  </div>
                </template>
              </composer-picker>

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
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
import ChatPlaceholder from '@/components/buddy/chat/ChatPlaceholder.vue'
import ComposerPicker from '@/components/buddy/chat/ComposerPicker.vue'
import ChatMessageList from './components/ChatMessageList.vue'
import CheckpointDrawer from './components/CheckpointDrawer.vue'
import { getItem, setItem } from '@/utils/db'
import { computeBranchView } from '@/utils/branchView'

// OmniBuddy 对话主区：pi Agent 流式对话
// 一次问答聚合为一条助手消息：正文 + 内嵌内容块（思考过程 / Skill / 工具含 MCP）
export default {
  name: 'OmniBuddyChat',
  components: { BuddyComposer, BuddySkeleton, ChatPlaceholder, ComposerPicker, ChatMessageList, CheckpointDrawer },
  data() {
    return {
      // 实例绑定的会话 id：初始化时快照路由 query.s（keep-alive 一签一实例，
      // 不再 watch 全局路由 —— 切走页面时本值不变，会话状态池不被误清；
      // 放在 data 而非 created 赋值：notice watch immediate 早于 created 触发）
      sid: this.$route ? (this.$route.query.s || '') : '',
      // 以下均为「视图层/全局偏好」状态；会话态（消息/流式/权限队列/草稿/附件/
      // 空间绑定）在 store 的 buddyChat 会话池中，切页签/重建实例均可恢复
      providers: [],
      currentProviderId: '',
      // 已登记工作空间列表（上拉选择器数据源）
      workspaces: [],
      // 当前展开的选择面板（'workspace' | 'provider' | 'permission' | ''）
      openSelect: '',
      // ===== 权限模式（只读 / 自动 / 每次确认），主进程持久化 =====
      permissionMode: 'confirm',
      // ===== 检查点（N4）：抽屉开关（列表加载与回滚在 CheckpointDrawer 内自治） =====
      cpDrawer: false
    }
  },
  computed: {
    // 本实例的会话状态（store 会话池；模板/子组件经下方代理读取）
    sess() {
      return this.$store.getters['buddyChat/session'](this.sid)
    },
    // 历史加载中（会话已创建但历史未拉完）：显示对话骨架而非欢迎占位
    historyLoading() {
      return !!(this.sess && this.sid && !this.sess.loaded)
    },
    // 模板兼容：会话 id（实例绑定值，不随全局路由变化）
    sessionId() {
      return this.sid
    },
    // 全量消息（会话池：含各分支线路的全部记录，含实时乐观消息）
    rawMessages() {
      return (this.sess && this.sess.messages) || []
    },
    // 分支视图：按当前激活线路过滤显示（多分支时组头位置显示激活变体）；
    // anchors = 当前线路路径（发送新消息时作为线路标记传给主进程）
    branchView() {
      return computeBranchView(this.rawMessages, (this.sess && this.sess.branchActive) || {})
    },
    messages() {
      return this.branchView.list
    },
    streaming() {
      return !!(this.sess && this.sess.streaming)
    },
    // 离开底部（用户手动上滚）时显示「回到底部」悬浮按钮
    showBackToBottom() {
      return !!(this.sess && !this.sess.atBottom)
    },
    // 待发送文件附件（[{id,name,size,kind,thumb,path}]，P1-7）
    fileAttachments() {
      return (this.sess && this.sess.fileAttachments) || []
    },
    // 输入框草稿（v-model 双向代理到会话池，切页签/重开不丢）
    draft: {
      get() {
        return (this.sess && this.sess.draft) || ''
      },
      set(v) {
        this.commitPatch({ draft: v })
      }
    },
    // 关联的本地磁盘路径三元组（dir/name/workspaceId）
    workspaceLink() {
      return (this.sess && this.sess.workspaceLink) || { dir: '', name: '', workspaceId: '' }
    },
    // 会话已绑定工作空间：锁定输入框的空间切换器（pi 会话上下文与空间绑定，中途切换无效）
    workspaceLocked() {
      return !!(this.sess && this.sess.workspaceLocked)
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
    permQueue() {
      return (this.sess && this.sess.permQueue) || []
    },
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
    // 消息条数变化（用户消息/新占位/非流式新消息）：
    // 仅在「贴底」时自动跟滚 —— 用户手动上滚后（atBottom=false）以用户操作为最高优先级，
    // 不再强制滚到底，回看历史不被新内容打断
    'messages.length'() {
      if (this.sess && this.sess.atBottom) this.scrollToBottom()
    },
    // 本轮消息内容更新（delta 正文 / 思考块 / 工具块，均不改 messages.length）：
    // 同样只在贴底时跟滚，保证用户上滚后输出不打扰回看
    'sess.turnMsg': {
      deep: true,
      handler() {
        if (this.sess && this.sess.atBottom) this.scrollToBottom()
      }
    },
    // store 会话池的 UI 事件（$message / $root 广播 / 检查点刷新）：
    // 多个缓存实例同时 watch，经 claim 认领保证每条只被消费一次
    '$store.state.buddyChat.notice': {
      immediate: true,
      deep: true,
      handler(list) {
        this.consumeNotices(list)
      }
    }
  },
  created() {
    this.$store.dispatch('buddyChat/loadHistory', { id: this.sid })
    this.loadProviders()
    this.loadWorkspaces()
    this.restoreWorkspaceLink()
    this.loadPermissionMode()
  },
  beforeDestroy() {
    // 仅移除全局监听；不打断流式 —— 主进程继续执行并落盘，回来自会话池/历史恢复
    window.removeEventListener('keydown', this.onPermKeydown)
    document.removeEventListener('mousedown', this.onDocMouseDown)
  },
  mounted() {
    // 首次挂载：流式中或已在底部语义下滚到底（历史异步到达时由 watch 跟滚）
    if (this.streaming || (this.sess && this.sess.atBottom)) this.scrollToBottom()
  },
  activated() {
    // keep-alive 页签切回：模型/工作空间可能在其他页签（模型管理、工作空间）有增删，
    // 重新加载列表（loadProviders 内部会保留当前选中，不会打断已选模型）
    this.loadProviders()
    this.loadWorkspaces()
    // 会话池可能因删除会话被清理，补拉（loaded 命中时为空操作）
    this.$store.dispatch('buddyChat/loadHistory', { id: this.sid })
    // 切回补滚：流式中始终到底；池已加载时 length 不变需手动补
    if (this.streaming || (this.sess && this.sess.atBottom)) this.scrollToBottom()
    // 权限面板键盘 1-4 快捷应答（仅本页签激活时生效；同引用重复注册无害）
    window.addEventListener('keydown', this.onPermKeydown)
    document.addEventListener('mousedown', this.onDocMouseDown)
  },
  deactivated() {
    // keep-alive 页签切走：移除快捷键/面板外点击，避免在其他页签误触
    window.removeEventListener('keydown', this.onPermKeydown)
    document.removeEventListener('mousedown', this.onDocMouseDown)
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
        setFeedback: async () => ({ ok: false }),
        truncateSession: async () => ({ ok: false, error: '仅桌面端可用' }),
        branchSession: async () => ({ ok: false, error: '仅桌面端可用' }),
        createVariant: async () => ({ ok: false, error: '仅桌面端可用' }),
        listWorkspaces: async () => [],
        addWorkspace: async () => ({ ok: false, canceled: true }),
        removeWorkspace: async () => ({ ok: false }),
        renameWorkspace: async () => ({ ok: false }),
        sessionMeta: async () => null,
        pickAttachments: async () => ({ ok: false, error: '附件需要 OmniDeck 桌面端' }),
        importAttachment: async () => ({ ok: false, error: '附件需要 OmniDeck 桌面端' }),
        listCheckpoints: async () => ({ ok: true, items: [] }),
        rollbackCheckpoint: async () => ({ ok: false, error: '检查点需要 OmniDeck 桌面端' })
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
    onSelectProvider(id) {
      this.openSelect = ''
      this.currentProviderId = id
      // 持久化选中模型，切换页面后自动恢复
      setItem('omnibuddy:providerId', id)
    },
    // ===== 会话池写入助手（会话态都在 store，组件只做视图层调度） =====
    commitPatch(patch) {
      this.$store.commit('buddyChat/PATCH', { id: this.sid, patch })
    },
    // 认领并消费 store 转发的 UI 事件（claim 返回 Promise<布尔>，await 后
    // 多实例并发 watch 时保证每条只被消费一次）
    async consumeNotices(list) {
      for (const n of (list || []).slice()) {
        // perm-pending 由 BuddyLayout 消费（全局通知引导），此处跳过不认领
        if (n.kind === 'perm-pending') continue
        if (n.sessionId && n.sessionId !== this.sid) continue
        const ok = await this.$store.dispatch('buddyChat/claim', n.nid)
        if (!ok) continue
        if (n.kind === 'sessions-changed') {
          this.$root.$emit('omnibuddy:sessions-changed')
        } else if (n.kind === 'rolled_back') {
          this.$root.$emit('omnibuddy:sessions-changed')
          this.$message.success('已回滚到检查点')
          if (this.cpDrawer && this.$refs.cp) this.$refs.cp.loadCheckpoints()
        } else if (n.kind === 'success') {
          this.$message.success(n.text)
        } else if (n.kind === 'warning') {
          this.$message.warning(n.text)
        } else if (n.kind === 'info') {
          this.$message.info(n.text)
        }
      }
    },
    // 滚动位置写入会话池：距底 40px 内视为「在底部」（新消息自动跟滚）
    onBodyScroll() {
      const b = this.$refs.body
      if (!b) return
      const atBottom = b.scrollHeight - b.scrollTop - b.clientHeight < 40
      if ((this.sess && this.sess.atBottom) !== atBottom) this.commitPatch({ atBottom })
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
      for (const a of res.attachments) {
        this.$store.commit('buddyChat/ATTACH_PUSH', { id: this.sid, item: a })
      }
    },
    // 拖拽/粘贴导入：主进程落盘后入待发送列表
    async importFile(filePath) {
      if (this.streaming) return
      const res = await this.api().importAttachment(filePath)
      if (!res || !res.ok) {
        this.$message.warning((res && res.error) || '附件导入失败')
        return
      }
      this.$store.commit('buddyChat/ATTACH_PUSH', { id: this.sid, item: res.attachment })
    },
    removeFileAttachment(i) {
      this.$store.commit('buddyChat/ATTACH_REMOVE', { id: this.sid, index: i })
    },
    async send() {
      const text = this.draft.trim()
      const files = this.fileAttachments.slice()
      if ((!text && !files.length) || this.streaming) return
      if (!window.electronAPI || !window.electronAPI.omnibuddy) {
        this.$message.info('对话能力需要 OmniDeck 桌面端')
        this.commitPatch({ draft: '' })
        return
      }
      // 发送前必须选定工作空间（必填）：未选定时展开上拉选择器
      if (!this.workspaceLink.dir || !this.workspaceLink.workspaceId) {
        this.$message.warning('请先选择工作空间后再发送')
        this.openSelect = 'workspace'
        return
      }
      this.commitPatch({ draft: '', fileAttachments: [] })

      // 当前分支线路（消息全量按线路过滤显示，新消息归属当前显示线）
      const anchors = this.branchView.anchors.slice()
      this.commitPatch({ turnAnchors: anchors })

      let sid = this.sid
      if (!sid) {
        // 创建会话：快照当前关联的磁盘路径与展示名（左侧列表按展示名分组）
        const session = await this.api().createSession({
          workspaceId: this.workspaceLink.workspaceId,
          workspaceDir: this.workspaceLink.dir,
          displayName: this.workspaceLink.name
        })
        sid = session.id
        // 会话创建即绑定空间快照：锁定切换器（此后本会话不可换空间）
        this.commitPatch({ workspaceLocked: true })
        // 状态整体迁移到正式会话（消息/草稿/空间绑定全保留），
        // 实例原位改绑 sid —— 组件不重建，首轮流式不中断
        this.$store.dispatch('buddyChat/migrate', { from: '', to: sid })
        this.sid = sid
        // 页签原位重绑（保留 uid → keep-alive key 不变 → 实例不重建），
        // 再 replace 地址；afterEach 登记时查重命中，不会新增页签
        this.$store.commit('tagsView/REBIND_TAB', {
          side: 'buddy',
          from: '/omnibuddy',
          to: '/omnibuddy?s=' + sid
        })
        this.$router.replace({ query: { s: sid } })
        this.$root.$emit('omnibuddy:sessions-changed')
      }

      this.$store.commit('buddyChat/PUSH_MSG', {
        id: sid,
        msg: {
          role: 'user',
          content: text,
          fileAttachments: files.length ? files : undefined,
          anchors: anchors.length ? anchors : undefined,
          createdAt: Date.now()
        }
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
        items: [],
        anchors: anchors.length ? anchors : undefined
      }
      this.$store.commit('buddyChat/PUSH_MSG', { id: sid, msg: placeholder })
      this.$store.commit('buddyChat/PATCH', {
        id: sid,
        patch: { streaming: true, turnMsg: placeholder, cycleBase: '', thinkingItem: null, thinkTicking: true, atBottom: true }
      })
      this.scrollToBottom()

      const res = await this.api().sendMessage({
        id: sid,
        text,
        attachments: files,
        provider: this.currentProvider,
        workspaceId: this.workspaceLink.workspaceId,
        displayName: this.workspaceLink.name,
        anchors
      })
      if (!res.ok) {
        this.$store.commit('buddyChat/PATCH', { id: sid, patch: { streaming: false } })
        this.$store.dispatch('buddyChat/finishTurn', sid)
        this.$message.error(res.error || '发送失败')
      }
    },
    // 点赞/点踩持久化（MessageBubble 已本地生效并提示，此处写主进程消息记录）
    async onFeedback({ message, value }) {
      if (!this.sid || !message.id) return
      const res = await this.api().setFeedback({ id: this.sid, messageId: message.id, feedback: value })
      if (!res || !res.ok) this.$message.error((res && res.error) || '反馈保存失败')
    },
    // 回答 ask_user 表单
    async answerAsk(m, value) {
      const answer = String(value || '').trim()
      if (!answer) return
      m.answered = true
      m.answer = answer
      await this.api().replyAskUser({
        sessionId: this.sid,
        callId: m.callId,
        value: answer
      })
    },
    // 回答权限确认（浮动条）：仅本次 / 本会话内 / 始终允许 / 拒绝；处理后出队
    async answerPermission(m, action) {
      const idx = this.permQueue.indexOf(m)
      if (idx < 0) return
      this.$store.commit('buddyChat/PERM_REMOVE', { id: this.sid, index: idx })
      await this.api().replyPermission({
        sessionId: this.sid,
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
    // 停止生成（仅用户显式触发；切页签/返回 deck/关页签不再中断，主进程继续执行）
    interrupt() {
      if (this.sid) this.api().interrupt(this.sid)
    },
    // ===== 关联本地磁盘路径（必填；选路径的同时登记为工作空间） =====
    // 恢复上次关联（新会话页）：返回 Buddy 不丢失；已有会话按会话快照恢复
    async restoreWorkspaceLink() {
      if (this.sid) {
        const meta = await this.api().sessionMeta(this.sid)
        if (meta && meta.workspaceDir) {
          // 会话已关联：回显该会话快照的路径与展示名，并锁定空间切换
          this.commitPatch({
            workspaceLink: {
              dir: meta.workspaceDir,
              name: meta.displayName || '',
              workspaceId: meta.workspaceId || ''
            },
            workspaceLocked: true
          })
          return
        }
      }
      // 新会话（或未绑定空间的旧会话）：可自由选择
      this.commitPatch({ workspaceLocked: false })
      const saved = getItem('omnibuddy:workspace-link', null)
      if (saved && saved.dir) this.commitPatch({ workspaceLink: saved })
    },
    // 加载已登记工作空间（仅保留目录仍存在的项）
    async loadWorkspaces() {
      const list = await this.api().listWorkspaces()
      this.workspaces = (list || []).filter(w => w.available)
      this.validateWorkspaceLink()
    },
    // 空间被解绑后的回落：未锁定会话的关联三元组失效时清空（锁定会话存路径快照，不受影响）
    validateWorkspaceLink() {
      if (this.workspaceLocked) return
      const link = this.workspaceLink
      if (link.workspaceId && !this.workspaces.some(w => w.id === link.workspaceId)) {
        this.commitPatch({ workspaceLink: { dir: '', name: '', workspaceId: '' } })
        setItem('omnibuddy:workspace-link', this.workspaceLink)
      }
    },
    // 上拉选择已登记工作空间：同步关联三元组并持久化（会话已锁定时不可切换）
    onSelectWorkspace(id) {
      if (this.workspaceLocked) return
      const ws = this.workspaces.find(w => w.id === id)
      if (!ws) return
      this.openSelect = ''
      this.commitPatch({ workspaceLink: { dir: ws.path, name: ws.name || '', workspaceId: ws.id } })
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
        this.commitPatch({ workspaceLink: { dir: ws.path, name: ws.name || '', workspaceId: ws.id } })
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
    branchAt(m) {
      this.$confirm('将以此处为分叉点复制完整上下文创建新会话，当前会话保留。继续吗？', '创建分叉', {
        confirmButtonText: '创建分叉',
        cancelButtonText: '取消',
        type: 'info'
      }).then(async () => {
        const res = await this.api().branchSession({ id: this.sid, messageId: m.id })
        if (res && res.ok && res.session) {
          this.$message.success('分叉已创建，请在左侧列表打开')
          this.$root.$emit('omnibuddy:sessions-changed')
        } else {
          this.$message.error((res && res.error) || '创建失败')
        }
      }).catch(() => {})
    },
    // ===== 会话内分支（branch）=====
    // 分支切换：组内循环切换激活变体（缺省激活最新，切换后整线随之切换显示）
    // 流式回复进行中禁止切换（本轮输出归属发送时的线路，切换会导致输出不可见）
    switchBranch({ headId, dir }) {
      if (this.streaming) {
        this.$message.warning('回复完成后再切换分支')
        return
      }
      const g = this.branchView.groups[headId]
      if (!g || g.variants.length < 2) return
      const active = this.sess.branchActive || {}
      const cur = (active[headId] && g.variants.indexOf(active[headId]) >= 0)
        ? active[headId]
        : g.variants[g.variants.length - 1]
      const i = g.variants.indexOf(cur)
      const next = g.variants[(i + dir + g.variants.length) % g.variants.length]
      this.commitPatch({ branchActive: Object.assign({}, active, { [headId]: next }) })
      this.scrollToBottom()
    },
    // 编辑重问：以原问题为锚点创建新分支变体并重新发起提问（原分支保留）
    // 流程：createVariant 落盘变体（拿到真实 id）→ 激活新变体 → 触发回答（userMessageId 复用）
    async editResend({ message, text }) {
      if (this.streaming) {
        this.$message.warning('当前会话正在回复中，请稍候')
        return
      }
      if (!this.sid || !message.id) return
      if (!window.electronAPI || !window.electronAPI.omnibuddy) {
        this.$message.info('对话能力需要 OmniDeck 桌面端')
        return
      }
      if (!this.workspaceLink.dir || !this.workspaceLink.workspaceId) {
        this.$message.warning('请先选择工作空间后再发送')
        this.openSelect = 'workspace'
        return
      }
      if (!this.currentProvider) {
        this.$message.warning('请先选择模型')
        return
      }
      // 组头 = 最初的问题消息（message 可能已是激活变体，_branch.headId 为组头）
      const headId = (message._branch && message._branch.headId) || message.id
      const res = await this.api().createVariant({ id: this.sid, messageId: headId, text })
      if (!res || !res.ok || !res.message) {
        this.$message.error((res && res.error) || '创建分支失败')
        return
      }
      const variant = res.message
      // 激活新变体并注入全量列表（过滤视图会将其显示在组头位置）
      this.commitPatch({
        branchActive: Object.assign({}, this.sess.branchActive, { [headId]: variant.id })
      })
      this.$store.commit('buddyChat/PUSH_MSG', { id: this.sid, msg: variant })
      // 新分支线路 = 组头路径 + [变体id]，本轮回答与其后续消息都归属该线
      const anchors = (variant.anchors || []).concat([variant.id])
      const placeholder = {
        role: 'assistant',
        content: '',
        streaming: true,
        isThinking: false,
        thinking: true,
        seconds: 0,
        createdAt: Date.now(),
        items: [],
        anchors
      }
      this.$store.commit('buddyChat/PUSH_MSG', { id: this.sid, msg: placeholder })
      this.$store.commit('buddyChat/PATCH', {
        id: this.sid,
        patch: { streaming: true, turnMsg: placeholder, cycleBase: '', thinkingItem: null, thinkTicking: true, turnAnchors: anchors, atBottom: true }
      })
      this.scrollToBottom()

      const sendRes = await this.api().sendMessage({
        id: this.sid,
        text,
        provider: this.currentProvider,
        workspaceId: this.workspaceLink.workspaceId,
        displayName: this.workspaceLink.name,
        anchors,
        userMessageId: variant.id
      })
      if (!sendRes.ok) {
        this.$store.commit('buddyChat/PATCH', { id: this.sid, patch: { streaming: false } })
        this.$store.dispatch('buddyChat/finishTurn', this.sid)
        this.$message.error(sendRes.error || '发送失败')
      }
    },
    // ===== 检查点 / 回滚（N4）：入口暂移除（恢复时在 composer 工具区加回入口按钮）；
    // 抽屉与回滚广播处理保留，列表加载与回滚在 CheckpointDrawer 内自治 =====
    // 抽屉内回滚成功：兜底刷新消息（主进程亦会广播 rolled_back 统一处理）
    onCheckpointRolledBack() {
      this.$store.dispatch('buddyChat/loadHistory', { id: this.sid, force: true })
      this.$root.$emit('omnibuddy:sessions-changed')
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const body = this.$refs.body
        if (body) body.scrollTop = body.scrollHeight
      })
    },
    // 回到底部（悬浮按钮）：恢复贴底标记（此后新内容恢复自动跟滚）+ 平滑滚动
    backToBottom() {
      this.commitPatch({ atBottom: true })
      this.$nextTick(() => {
        const body = this.$refs.body
        if (body) body.scrollTo({ top: body.scrollHeight, behavior: 'smooth' })
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

/* ===== 回到底部悬浮按钮（用户上滚离开底部后出现） ===== */
.ob-back-to-bottom {
  position: sticky;
  bottom: 12px;
  margin-left: auto;
  margin-right: 20px;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--text-secondary);
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.14);
  z-index: 5;
  transition: color 0.15s ease, transform 0.15s ease;

  .ob-btb-ico {
    font-size: 16px;
  }

  &:hover {
    color: var(--primary-color);
    transform: translateY(-1px);
  }
}

/* 流式进行中：按钮右下角小圆点提示「有新输出」 */
.ob-btb-dot {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--primary-color);
  border: 2px solid var(--card-bg, #fff);
}

/* 悬浮按钮显隐过渡（Vue2 过渡类名） */
.ob-scroll-btn-enter-active,
.ob-scroll-btn-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.ob-scroll-btn-enter,
.ob-scroll-btn-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

/* 历史加载骨架：与消息列表同宽同 padding，占位形状贴合真实对话 */
.ob-history-skel {
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: 40px 28px 12px;
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

/* ===== 权限模式浮层底部：关系说明入口（hover 出提示） ===== */
.ob-perm-mode-note {
  padding: 5px 9px 3px;

  .ob-perm-mode-note-trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    line-height: 1.5;
    color: $text-secondary;
    border-radius: 6px;
    padding: 2px 4px;
    margin-left: -4px;
    cursor: help;
    user-select: none;
    transition: color 0.12s ease;

    &:hover {
      color: var(--text-primary);
    }
  }

  .ob-perm-mode-note-ico {
    font-size: 13px;
    flex-shrink: 0;
    color: var(--primary-color);
  }
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

<style lang="scss">
/* 权限模式 tips 提示（popper 挂 body，须全局）：限宽换行 + 段落间距 */
.ob-perm-mode-tip.el-tooltip__popper {
  max-width: 300px;
  white-space: normal;
  line-height: 1.7;
  font-size: 12px;

  p {
    margin: 0 0 6px;

    &:last-child {
      margin-bottom: 0;
    }
  }

  b {
    font-weight: 600;
  }
}
</style>
