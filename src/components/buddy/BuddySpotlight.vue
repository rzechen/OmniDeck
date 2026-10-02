<template>
  <transition name="buddy-spot">
    <div v-if="visible" class="buddy-overlay" @click.self="close">
      <div class="buddy-card">
        <!-- 头部：标识 + esc 键帽 -->
        <div class="buddy-head">
          <span class="buddy-logo">
            <img src="@/assets/logo.png" alt="OmniBuddy" class="buddy-logo-img" />
          </span>
          <span class="buddy-name">OmniBuddy</span>
          <span class="buddy-kbd">esc</span>
        </div>

        <!-- 消息流：复用 chat 页消息列表（轻量子集：不支持附件 / 引用 / 分支） -->
        <div v-if="messages.length" ref="body" class="buddy-body" @scroll="onMsgScroll">
          <chat-message-list
            :messages="messages"
            :streaming="streaming"
            :session-id="sessionId"
            @answer="answerAsk"
            @feedback="onFeedback"
            @edit-resend="onEditResend"
            @content-resize="onContentResize"
          />
        </div>

        <!-- 输入区：流式中发送键变停止键 -->
        <div class="buddy-input-wrap">
          <svg-icon icon-class="chat-dot-round" class="buddy-input-icon" />
          <input
            ref="buddyInput"
            v-model="draft"
            class="buddy-input"
            placeholder="有什么可以帮您？"
            @keydown.enter.prevent="send"
            @keydown.esc.stop="close"
          />
          <button v-if="streaming" class="buddy-send stop" title="停止生成" @click="interrupt">
            <svg-icon icon-class="stop" />
          </button>
          <button v-else class="buddy-send" :class="{ ready: !!draft.trim() }" @click="send">
            <svg-icon icon-class="promotion" />
          </button>
        </div>

        <!-- 底部：当前上下文摘要 + 模型管理入口 -->
        <div class="buddy-foot">
          <span class="buddy-hint" :title="metaTitle">
            <svg-icon icon-class="llm" />{{ metaText }}
          </span>
          <span class="buddy-link" @click="openBuddySettings">配置模型 ›</span>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
// OmniBuddy 快速唤起浮窗（可配置快捷键，默认 ⌘⌥J / Ctrl+Alt+J）
// 真实对话（P2-3）：与快捷面板（quick 窗口）共用「快捷面板」会话，跨入口延续上下文；
// 会话状态托管在 buddyChat store（主窗口单点订阅流式事件，浮窗收起期间照常累积）；
// 轻量形态：不支持附件 / 划选引用 / 分支重发，权限确认自动拒绝（与快捷面板同策略）
import ChatMessageList from '@/views/buddy/chat/components/ChatMessageList.vue'
import { getItem } from '@/utils/db'
import { getShortcut, matchesShortcut } from '@/utils/shortcuts'

// 浮窗会话固定展示名：与快捷面板共用同一条会话
const SPOT_NAME = '快捷面板'

export default {
  name: 'BuddySpotlight',
  components: { ChatMessageList },
  data() {
    return {
      visible: false,
      draft: '',
      // 会话与模型 / 空间上下文
      sessionId: '',
      providers: [],
      currentProviderId: '',
      workspaces: [],
      workspaceId: ''
    }
  },
  computed: {
    // 会话态全在 store（浮窗收起不丢，切回来即从池内恢复）
    sess() {
      return this.$store.getters['buddyChat/session'](this.sessionId)
    },
    messages() {
      return (this.sess && this.sess.messages) || []
    },
    streaming() {
      return !!(this.sess && this.sess.streaming)
    },
    // 供 watch 的派生量（sess 可能为 null，computed 兜底避免路径求值报错）
    turnMsg() {
      return this.sess ? this.sess.turnMsg : null
    },
    permLen() {
      return this.sess && this.sess.permQueue ? this.sess.permQueue.length : 0
    },
    currentProvider() {
      return this.providers.find(p => p.id === this.currentProviderId) || null
    },
    // 深度研究三档模型映射（与 buddy chat / 快捷面板同源）
    tierMapping() {
      const map = {}
      this.providers.forEach(p => {
        if (p.tier && p.baseUrl && p.model) {
          map[p.tier] = { baseUrl: p.baseUrl, apiKey: p.apiKey || '', model: p.model }
        }
      })
      return map
    },
    currentWorkspace() {
      return this.workspaces.find(w => w.id === this.workspaceId) || null
    },
    // 底部上下文摘要：模型 · 空间（title 给全量详情）
    metaText() {
      const p = this.currentProvider
      const w = this.currentWorkspace
      const left = p ? (p.displayName || p.model || p.name) : '未配置模型'
      const right = w ? (w.name || String(w.path || '').split('/').pop()) : '未选择空间'
      return left + ' · ' + right
    },
    metaTitle() {
      const p = this.currentProvider
      const w = this.currentWorkspace
      return [
        p ? '模型：' + p.name + '（' + (p.displayName || p.model) + '）' : '',
        w ? '空间：' + w.path : ''
      ].filter(Boolean).join('\n')
    }
  },
  watch: {
    // 贴底跟滚：流式内容增量 / 新消息（atBottom 语义下才滚）
    turnMsg: {
      deep: true,
      handler() { this.followBottom() }
    },
    'messages.length'() { this.followBottom() },
    // 权限确认：浮窗无人值守场景一律自动拒绝，避免任务卡住
    permLen() { this.denyPendingPerm() },
    // store 转发的 UI 事件（claim 认领保证多实例只消费一次）
    '$store.state.buddyChat.notice': {
      immediate: true,
      handler(list) { this.consumeNotices(list) }
    }
  },
  mounted() {
    document.addEventListener('keydown', this.handleKeydown)
  },
  beforeUnmount() {
    document.removeEventListener('keydown', this.handleKeydown)
  },
  methods: {
    api() {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      return api || {
        listSessions: async () => [],
        getMessages: async () => [],
        createSession: async () => null,
        sendMessage: async () => ({ ok: false, error: '对话能力需要 OmniDeck 桌面端' }),
        interrupt: () => {},
        replyAskUser: async () => ({ ok: false }),
        replyPermission: async () => ({ ok: false }),
        setFeedback: async () => ({ ok: false }),
        listWorkspaces: async () => []
      }
    },
    handleKeydown(e) {
      // 唤起助手：可配置（默认 ⌘⌥J / Ctrl+Alt+J），设置页可改键
      if (matchesShortcut(e, getShortcut('buddy'))) {
        e.preventDefault()
        this.toggle()
      }
    },
    toggle() {
      this.visible ? this.close() : this.open()
    },
    async open() {
      this.visible = true
      this.draft = ''
      this.loadProviders()
      await Promise.all([this.loadWorkspaces(), this.resumeSession()])
      this.$nextTick(() => {
        if (this.$refs.buddyInput) this.$refs.buddyInput.focus()
        this.scrollToBottom()
      })
    },
    close() {
      this.visible = false
    },
    // ===== 模型 / 空间（与快捷面板共享选型存储）=====
    loadProviders() {
      const list = getItem('aiProviderList', [])
      // 仅列文本生成模型（图像模型专用生图，不参与对话）
      this.providers = (Array.isArray(list) ? list : []).filter(p => p && p.type !== 'image')
      const saved = getItem('quick:providerId', '')
      const pick = this.providers.find(p => p.id === saved) ||
        this.providers.find(p => p.isDefault) ||
        this.providers[0]
      this.currentProviderId = pick ? pick.id : ''
    },
    async loadWorkspaces() {
      const list = await this.api().listWorkspaces()
      // 仅保留目录仍存在的工作空间（失效项不可发送）
      this.workspaces = (list || []).filter(w => w.available)
      const saved = getItem('quick:workspaceId', '')
      this.workspaceId = this.workspaces.some(w => w.id === saved)
        ? saved
        : (this.workspaces[0] ? this.workspaces[0].id : '')
    },
    // ===== 会话 =====
    // 延续「快捷面板」会话：主进程落盘历史拉进 store 池（含快捷面板窗口产生的消息）
    async resumeSession() {
      const list = await this.api().listSessions()
      const hit = (list || []).find(s => (s.displayName || '') === SPOT_NAME)
      this.sessionId = hit ? hit.id : ''
      if (!this.sessionId) return
      // 流式中不重拉（防冲掉占位与流式态）；其余强制刷新，同步另一窗口的更新
      const force = !(this.sess && this.sess.streaming)
      await this.$store.dispatch('buddyChat/loadHistory', { id: this.sessionId, force })
    },
    async send() {
      const text = this.draft.trim()
      if (!text || this.streaming) return
      if (!window.electronAPI || !window.electronAPI.omnibuddy) {
        this.$message.info('对话能力需要 OmniDeck 桌面端')
        return
      }
      if (!this.currentProviderId) {
        this.$message.warning('请先在模型管理中添加模型')
        return
      }
      const ws = this.currentWorkspace
      if (!ws) {
        this.$message.warning('暂无可用工作空间，请先在主窗口关联磁盘路径')
        return
      }
      this.draft = ''

      let sid = this.sessionId
      if (!sid) {
        // 首轮创建会话并建池：快照空间路径与展示名（左侧列表按展示名分组）
        const session = await this.api().createSession({
          workspaceId: ws.id,
          workspaceDir: ws.path,
          displayName: SPOT_NAME
        })
        sid = session.id
        this.sessionId = sid
        this.$store.commit('buddyChat/ENSURE', sid)
        this.$bus.emit('omnibuddy:sessions-changed')
      }

      this.$store.commit('buddyChat/PUSH_MSG', {
        id: sid,
        msg: { role: 'user', content: text, createdAt: Date.now() }
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
      this.$store.commit('buddyChat/PUSH_MSG', { id: sid, msg: placeholder })
      this.$store.commit('buddyChat/PATCH', {
        id: sid,
        patch: { streaming: true, turnMsg: placeholder, cycleBase: '', thinkingItem: null, thinkTicking: true, atBottom: true }
      })
      this.scrollToBottom()

      const res = await this.api().sendMessage({
        id: sid,
        text,
        // provider 浅拷贝附加档位映射（不污染本地供应商存储）
        provider: Object.assign({}, this.currentProvider, { tiers: this.tierMapping }),
        workspaceId: ws.id,
        displayName: SPOT_NAME
      })
      if (!res.ok) {
        this.$store.commit('buddyChat/PATCH', { id: sid, patch: { streaming: false } })
        this.$store.dispatch('buddyChat/finishTurn', sid)
        this.$message.error(res.error || '发送失败')
      }
    },
    interrupt() {
      if (this.sessionId && this.streaming) this.api().interrupt(this.sessionId)
    },
    // ===== 消息交互（轻量子集）=====
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
    // 点赞 / 点踩持久化
    async onFeedback({ message, value }) {
      if (!this.sessionId || !message.id) return
      const res = await this.api().setFeedback({ id: this.sessionId, messageId: message.id, feedback: value })
      if (!res || !res.ok) this.$message.error((res && res.error) || '反馈保存失败')
    },
    // 编辑重发涉及消息截断 / 分支，浮窗不承载：引导到完整对话
    onEditResend() {
      this.$message.info('编辑重发请到完整对话中进行')
    },
    // 权限确认自动拒绝：出队并回传 deny（主进程按拒绝继续任务）
    denyPendingPerm() {
      const q = this.sess && this.sess.permQueue
      if (!q || !q.length || this.sessionId === '') return
      const head = q[0]
      this.$store.commit('buddyChat/PERM_REMOVE', { id: this.sessionId, index: 0 })
      this.api().replyPermission({ sessionId: this.sessionId, askId: head.askId, action: 'deny' })
      this.$message.info('浮窗已自动拒绝：' + (head.toolName || head.command || head.path || '权限请求'))
    },
    // ===== store notice 消费（照 chat 页语义精简）=====
    async consumeNotices(list) {
      for (const n of (list || []).slice()) {
        // perm-pending 由 BuddyLayout 全局消费（通知引导），此处跳过不认领
        if (n.kind === 'perm-pending') continue
        if (n.sessionId && n.sessionId !== this.sessionId) continue
        const ok = await this.$store.dispatch('buddyChat/claim', n.nid)
        if (!ok) continue
        if (n.kind === 'sessions-changed') {
          this.$bus.emit('omnibuddy:sessions-changed')
        } else if (n.kind === 'success') {
          this.$message.success(n.text)
        } else if (n.kind === 'warning') {
          this.$message.warning(n.text)
        } else if (n.kind === 'info') {
          this.$message.info(n.text)
        }
      }
    },
    // ===== 滚动 =====
    onMsgScroll() {
      const b = this.$refs.body
      if (!b || !this.sess) return
      // 距底 40px 内视为「在底部」（新消息自动跟滚）
      const atBottom = b.scrollHeight - b.scrollTop - b.clientHeight < 40
      if (this.sess.atBottom !== atBottom) {
        this.$store.commit('buddyChat/PATCH', { id: this.sessionId, patch: { atBottom } })
      }
    },
    // 内容块收起等尺寸变化：贴底语义下补偿滚动
    onContentResize() {
      this.followBottom()
    },
    followBottom() {
      if (this.sess && this.sess.atBottom) this.scrollToBottom()
    },
    scrollToBottom() {
      this.$nextTick(() => {
        const b = this.$refs.body
        if (b) b.scrollTop = b.scrollHeight
      })
    },
    // 跳转模型管理页（Buddy 视图内独立管理页）
    openBuddySettings() {
      this.close()
      if (this.$route.name !== 'OmniBuddyProviders') {
        this.$router.push('/omnibuddy/providers')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.buddy-overlay {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 18vh;
  -webkit-app-region: no-drag;
}

.buddy-card {
  width: 560px;
  max-width: calc(100vw - 48px);
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--bg-float, #fff);
  backdrop-filter: blur(24px) saturate(1.6);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

/* 头部 */
.buddy-head {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 13px 16px 10px;
  flex-shrink: 0;
}

.buddy-logo {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(var(--primary-color-rgb), 0.35);
  overflow: hidden;

  // 品牌 logo（宽扁异形，contain 原比例呈现）
  .buddy-logo-img {
    width: 19px;
    height: 19px;
    object-fit: contain;
  }
}

.buddy-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.buddy-kbd {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-secondary);
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 1px 7px;
  line-height: 1.5;
}

/* 消息流（有消息才出现） */
.buddy-body {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  border-top: 1px solid var(--border-color);
  border-bottom: 1px solid var(--border-color);

  // 复用的消息列表默认为全屏留白，浮窗内收紧
  :deep(.ob-messages) {
    max-width: none;
    padding: 16px 20px 8px;
  }
}

/* 输入区 */
.buddy-input-wrap {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 12px 14px;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--search-bg, rgba(0, 0, 0, 0.04));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
  flex-shrink: 0;

  &:focus-within {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.12);
  }
}

.buddy-input-icon {
  font-size: 15px;
  color: var(--primary-color);
  flex-shrink: 0;
}

.buddy-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13.5px;
  color: var(--text-primary);

  &::placeholder {
    color: var(--text-secondary);
  }
}

.buddy-send {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: none;
  background: var(--border-color, #e5e5e5);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 13px;
  }

  &.ready {
    background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
    color: #fff;
    cursor: pointer;
  }

  // 流式中：停止生成
  &.stop {
    background: rgba(var(--danger-color-rgb), 0.12);
    color: var(--danger-color);
    cursor: pointer;

    .svg-icon {
      font-size: 12px;
    }
  }
}

/* 底部 */
.buddy-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 16px 12px;
  flex-shrink: 0;
}

.buddy-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-secondary);
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: default;

  .svg-icon {
    font-size: 12px;
    flex-shrink: 0;
  }
}

.buddy-link {
  flex-shrink: 0;
  font-size: 11.5px;
  color: var(--primary-color);
  text-decoration: none;
  font-weight: 600;
  cursor: pointer;

  &:hover {
    opacity: 0.8;
  }
}

/* 呼出/收起过渡：缩放 + 淡入 */
.buddy-spot-enter-active {
  transition: opacity 0.18s ease;
  .buddy-card {
    transition: transform 0.24s cubic-bezier(0.2, 0.9, 0.3, 1.2);
  }
}

.buddy-spot-leave-active {
  transition: opacity 0.14s ease;
  .buddy-card {
    transition: transform 0.14s ease;
  }
}

.buddy-spot-enter,
.buddy-spot-leave-to {
  opacity: 0;
  .buddy-card {
    transform: scale(0.96) translateY(-8px);
  }
}
</style>
