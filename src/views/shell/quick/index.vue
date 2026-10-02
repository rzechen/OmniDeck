<template>
  <div class="quick-panel">
    <!-- 头部：品牌标识 + 当前工作空间 + 新话题 / 关闭 -->
    <div class="qp-head">
      <div class="qp-head-left">
        <img
          class="qp-logo"
          src="@/assets/logo.png"
          alt="OmniDeck"
        />
        <span class="qp-title" :title="workspaceTitle">{{ workspaceLabel }}</span>
      </div>
      <div class="qp-head-actions">
        <span class="qp-new" title="开启新会话" @click="newTopic">
          <svg-icon icon-class="plus" />
          <span>新话题</span>
        </span>
        <span class="qp-close" title="关闭面板（Esc）" @click="hidePanel">
          <svg-icon icon-class="close" />
        </span>
      </div>
    </div>

    <!-- 消息区 -->
    <div ref="body" class="qp-body">
      <!-- 空会话欢迎占位 -->
      <div v-if="!sessionId || !messages.length" class="qp-empty">
        <div class="qp-empty-mark">
          <svg-icon icon-class="sparkle" />
        </div>
        <div class="qp-empty-title">随时唤起，即刻提问</div>
        <div class="qp-empty-desc">会话归入「快捷面板」分组 · 主窗口可继续查看</div>
      </div>

      <!-- 消息列表（复用主窗口对话组件：Markdown / 思考区 / 工具块 / 反问卡） -->
      <template v-else>
        <template v-for="(m, i) in messages" :key="i">
          <message-bubble
            v-if="m.role === 'user' || m.role === 'assistant'"
            :message="m"
            :streaming="streaming"
          />
          <ask-user-card
            v-else-if="m.role === 'ask_user'"
            :message="m"
            @answer="answerAsk"
          />
        </template>
      </template>
    </div>

    <!-- 输入区：截图 / 工作空间 / 模型选择内嵌工具栏（与主窗口同构） -->
    <div class="qp-composer">
      <buddy-composer
        v-model="draft"
        :streaming="streaming"
        :files="fileAttachments"
        :extra-sendable="fileAttachments.length > 0"
        placeholder="有什么可以帮您？（Enter 发送 / Shift+Enter 换行 / Esc 隐藏）"
        @send="send"
        @stop="interrupt"
        @remove-file="removeFileAttachment"
        @pick="pickAttachments"
        @import-file="importFile"
      >
        <template #tools>
          <composer-picker
            picker-key="workspace"
            :active-key="openSelect"
            :model-value="workspaceId"
            trigger-icon="folder"
            :trigger-label="workspaceLabel"
            :trigger-title="workspaceTitle"
            :warn="!workspaceId"
            panel-title="工作空间"
            :items="workspaceItems"
            empty-title="暂无可用工作空间"
            empty-desc="请先在主窗口对话中关联磁盘路径"
            @toggle="toggleSelect('workspace')"
            @select="onSelectWorkspace"
          />

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
            empty-desc="请先在模型管理中添加模型"
            @toggle="toggleSelect('provider')"
            @select="onSelectProvider"
          />
        </template>
      </buddy-composer>
    </div>
  </div>
</template>

<script>
// 快捷面板（P0-M2）：Spotlight 式独立对话面板
// - 固定「快捷面板」会话：唤起自动恢复最近一条，跨唤起延续上下文；新话题另起
// - 复用主窗口对话组件（MessageBubble / AskUserCard / BuddyComposer / ComposerPicker）
//   与 omnibuddy IPC（sendMessage / replyAskUser / interrupt）
// - 锁联动：App.vue 全局挂载的 AppLock 组件在本窗口同样生效
// - Esc 隐藏面板（失焦不隐藏，仅失焦降层级；关闭走头部关闭按钮 / Esc / 快捷键 / 托盘）
import BuddyComposer from '@/components/buddy/BuddyComposer.vue'
import MessageBubble from '@/components/buddy/chat/MessageBubble.vue'
import AskUserCard from '@/components/buddy/chat/AskUserCard.vue'
import ComposerPicker from '@/components/buddy/chat/ComposerPicker.vue'
import { getItem, setItem } from '@/utils/db'

// 面板会话固定展示名：主窗口侧栏按此分组
const QUICK_DISPLAY_NAME = '快捷面板'

export default {
  name: 'QuickPanel',
  components: { BuddyComposer, MessageBubble, AskUserCard, ComposerPicker },
  data() {
    return {
      // 模型与工作空间
      providers: [],
      currentProviderId: '',
      workspaces: [],
      workspaceId: '',
      openSelect: '',
      // 待发送文件附件（[{id,name,size,kind,thumb,path}]，P1-7）
      fileAttachments: [],
      // 会话与消息
      sessionId: '',
      messages: [],
      draft: '',
      streaming: false,
      // 本轮助手消息（跨工具调用持续复用同一条）
      turnMsg: null,
      cycleBase: '',
      thinkingItem: null,
      thinkTimer: null,
      offEvent: null
    }
  },
  computed: {
    currentProvider() {
      return this.providers.find(p => p.id === this.currentProviderId) || null
    },
    // 深度研究（P3）：三档模型映射（与 buddy chat 页同源，providers 页配置）
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
    workspaceLabel() {
      const ws = this.currentWorkspace
      if (!ws) return '工作空间'
      return ws.name || String(ws.path || '').split('/').pop() || '工作空间'
    },
    workspaceTitle() {
      return this.currentWorkspace ? this.currentWorkspace.path : ''
    },
    providerItems() {
      return this.providers.map(p => ({
        value: p.id,
        label: p.name + ' · ' + (p.displayName || p.model),
        svg: 'llm'
      }))
    },
    workspaceItems() {
      return this.workspaces.map(w => ({
        value: w.id,
        label: w.name || w.path,
        svg: 'folder'
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
  mounted() {
    window.addEventListener('keydown', this.onKeydown)
    document.addEventListener('mousedown', this.onDocMouseDown)

    this.loadProviders()
    this.loadWorkspaces()
    this.resumeSession()

    const api = window.electronAPI && window.electronAPI.omnibuddy
    if (api) {
      this.offEvent = api.onEvent(e => this.onAgentEvent(e))
    }
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeydown)
    document.removeEventListener('mousedown', this.onDocMouseDown)
    this.stopThinkTimer()
    if (this.offEvent) this.offEvent()
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
        replyAskUser: async () => ({ ok: false }),
        listWorkspaces: async () => [],
        pickAttachments: async () => ({ ok: false, error: '附件需要 OmniDeck 桌面端' }),
        importAttachment: async () => ({ ok: false, error: '附件需要 OmniDeck 桌面端' })
      }
    },
    // Esc 隐藏面板
    onKeydown(e) {
      if (e.key === 'Escape') {
        const quick = window.electronAPI && window.electronAPI.quick
        if (quick) quick.hide()
      }
    },
    // 关闭按钮：隐藏面板（与 Esc 同路径）
    hidePanel() {
      const quick = window.electronAPI && window.electronAPI.quick
      if (quick) quick.hide()
    },
    // ===== 模型 / 工作空间 =====
    loadProviders() {
      const list = getItem('aiProviderList', [])
      // 仅列文本生成模型（图像模型专用生图，不参与对话）
      this.providers = (Array.isArray(list) ? list : []).filter(p => p && p.type !== 'image')
      const saved = getItem('quick:providerId', '')
      const def = this.providers.find(p => p.id === saved) ||
        this.providers.find(p => p.isDefault) ||
        this.providers[0]
      this.currentProviderId = def ? def.id : ''
    },
    onSelectProvider(id) {
      this.openSelect = ''
      this.currentProviderId = id
      setItem('quick:providerId', id)
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
    onSelectWorkspace(id) {
      this.openSelect = ''
      this.workspaceId = id
      setItem('quick:workspaceId', id)
    },
    toggleSelect(key) {
      this.openSelect = this.openSelect === key ? '' : key
    },
    // 点击面板内其它地方：收起展开的上拉选择器（与主窗口 chat.vue 同款）
    onDocMouseDown(e) {
      if (!this.openSelect) return
      if (e.target.closest('.ob-select')) return
      this.openSelect = ''
    },
    // ===== 会话 =====
    // 恢复最近一条快捷面板会话（跨唤起延续上下文）
    async resumeSession() {
      if (this.sessionId) return
      const list = await this.api().listSessions()
      const hit = (list || []).find(s => (s.displayName || '') === QUICK_DISPLAY_NAME)
      if (hit) this.sessionId = hit.id
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
    // 历史归一化为「助手消息内嵌内容块」：tool 记录归并进相邻助手消息
    // （与主窗口 chat.vue 同构；用户消息去除落盘 id——面板不支持回退/分支操作）
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
            if (m.usage) {
              last.usage = last.usage || { input: 0, output: 0 }
              last.usage.input += m.usage.input || 0
              last.usage.output += m.usage.output || 0
            }
            if (m.error) last.error = m.error
            continue
          }
          const msg = Object.assign({}, m, { items: [] })
          if (m.thinking) msg.items.push({ type: 'thinking', content: m.thinking })
          out.push(msg)
          continue
        }
        const copy = Object.assign({}, m)
        if (copy.role === 'user') delete copy.id
        out.push(copy)
      }
      return out
    },
    newTopic() {
      if (this.streaming) {
        this.$message.info('当前回复结束后再开启新话题')
        return
      }
      this.sessionId = ''
      this.messages = []
      this.fileAttachments = []
    },
    // ===== 文件附件（P1-7）=====
    async pickAttachments() {
      if (this.streaming) return
      const res = await this.api().pickAttachments()
      if (!res || !res.ok) {
        if (res && res.error) this.$message.warning(res.error)
        return
      }
      for (const a of res.attachments) this.fileAttachments.push(a)
    },
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
      this.fileAttachments = []

      let sessionId = this.sessionId
      if (!sessionId) {
        const session = await this.api().createSession({
          workspaceId: ws.id,
          workspaceDir: ws.path,
          displayName: QUICK_DISPLAY_NAME
        })
        sessionId = session.id
        this.sessionId = sessionId
      }

      this.messages.push({
        role: 'user',
        content: text,
        fileAttachments: files.length ? files : undefined,
        createdAt: Date.now()
      })
      // 立即显示「思考中」占位（秒计时）；内容块到达后转为深度思考区
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
        attachments: files.length ? files : undefined,
        // provider 浅拷贝附加档位映射（不污染本地供应商存储）
        provider: Object.assign({}, this.currentProvider, { tiers: this.tierMapping }),
        workspaceId: ws.id,
        displayName: QUICK_DISPLAY_NAME
      })
      if (!res.ok) {
        this.streaming = false
        this.finishTurn()
        this.$message.error(res.error || '发送失败')
      }
    },
    interrupt() {
      if (this.sessionId && this.streaming) this.api().interrupt(this.sessionId)
    },
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
    // ===== 本轮助手消息 =====
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
    finishTurn() {
      this.stopThinkTimer()
      const msg = this.turnMsg
      if (msg) {
        msg.streaming = false
        msg.isThinking = false
      }
      this.turnMsg = null
      this.thinkingItem = null
    },
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
    scrollToBottom() {
      this.$nextTick(() => {
        const el = this.$refs.body
        if (el) el.scrollTop = el.scrollHeight
      })
    },
    // ===== 主进程流式事件（与主窗口 chat.vue 同构，精简面板版） =====
    onAgentEvent(e) {
      if (e.sessionId !== this.sessionId) return
      switch (e.type) {
        case 'assistant_start': {
          const msg = this.ensureTurnMessage()
          this.thinkingItem = null
          this.cycleBase = msg.content || ''
          break
        }
        case 'thinking': {
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
          this.scrollToBottom()
          break
        }
        case 'assistant_end': {
          const msg = this.ensureTurnMessage()
          msg.isThinking = false
          msg.content = this.cycleBase + (e.content || '')
          delete msg.thinking
          if (e.usage && (e.usage.input || e.usage.output)) {
            const prev = msg.usage || { input: 0, output: 0 }
            msg.usage = {
              input: prev.input + (e.usage.input || 0),
              output: prev.output + (e.usage.output || 0)
            }
          }
          this.stopThinkTimer()
          break
        }
        case 'skill': {
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
          this.scrollToBottom()
          break
        case 'todo_update':
          // 面板空间有限：不渲染 todo 卡片（主窗口完整呈现）
          break
        case 'permission_ask':
          // 面板空间有限不承载确认条；同一事件已广播至主窗口（确认条 + 布局层
          // 通知引导），此处仅提示。绝不代答 deny：自动拒绝会与主窗口确认条
          // 竞争应答，造成「弹窗还在等待、日志已被拒」的错乱（权限语义为
          // 一直等待用户决策，无人应答的挂起由主进程看门狗兜底）
          this.$message.info('有操作等待授权，请在主窗口对话页确认')
          break
        case 'sandbox_status':
          if (e.status && e.status.enabled) {
            this.$message.success('沙箱已启用：命令将在受限环境中执行')
          }
          break
        case 'truncated':
          this.streaming = false
          this.loadMessages()
          break
        case 'pi_unavailable':
          this.$message.warning('Agent 模式不可用，已回退纯对话：' + (e.error || ''))
          break
        case 'done':
          this.streaming = false
          this.finishTurn()
          break
        case 'interrupted': {
          const msg = this.turnMsg
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
          const errTurn = this.turnMsg || this.ensureTurnMessage()
          errTurn.error = e.error || '生成失败'
          this.finishTurn()
          break
        }
        default:
          break
      }
    },
    findToolItem(toolCallId) {
      const msg = this.turnMsg
      if (!msg) return null
      return (msg.items || []).find(it => it.type === 'tool' && it.toolCallId === toolCallId)
    }
  }
}
</script>

<style lang="scss" scoped>
// 毛玻璃透底：mac vibrancy 之上再叠半透明层
.quick-panel {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: rgba(246, 246, 248, 0.86);
  backdrop-filter: blur(36px) saturate(1.7);
  -webkit-user-select: none;
  user-select: none;
}

// ---------- 头部 ----------
.qp-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 20px 11px;
  flex-shrink: 0;
}

.qp-head-left {
  display: flex;
  align-items: center;
  gap: 9px;
}

.qp-logo {
  width: 32px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.qp-title {
  font-size: 13px;
  font-weight: 600;
  color: #1d1d1f;
  letter-spacing: 0.2px;
  max-width: 300px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qp-head-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.qp-new {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 13px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 500;
  color: #494950;
  background: rgba(120, 120, 128, 0.1);
  cursor: pointer;
  transition: background 0.16s ease;

  .svg-icon {
    width: 12px;
    height: 12px;
  }

  &:hover {
    background: rgba(120, 120, 128, 0.17);
  }
}

// 关闭按钮（隐藏面板）
.qp-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  color: #86868b;
  cursor: pointer;
  transition: background 0.16s ease, color 0.16s ease;

  .svg-icon {
    width: 14px;
    height: 14px;
  }

  &:hover {
    background: rgba(120, 120, 128, 0.16);
    color: #1d1d1f;
  }
}

// ---------- 消息区 ----------
.qp-body {
  flex: 1;
  overflow-y: auto;
  padding: 4px 26px 14px;

  &::-webkit-scrollbar {
    width: 6px;

    &-thumb {
      border-radius: 999px;
      background: rgba(120, 120, 128, 0.28);
    }
  }
}

// 空会话欢迎占位
.qp-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.qp-empty-mark {
  width: 44px;
  height: 44px;
  border-radius: 999px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--primary-color-rgb), 0.12);
  color: var(--primary-color);
  margin-bottom: 4px;

  .svg-icon {
    width: 22px;
    height: 22px;
  }
}

.qp-empty-title {
  font-size: 15px;
  font-weight: 600;
  color: #1d1d1f;
}

.qp-empty-desc {
  font-size: 12px;
  color: #86868b;
}

// ---------- 输入区 ----------
.qp-composer {
  flex-shrink: 0;
  padding: 8px 26px 18px;
}

// ---------- 暗色主题 ----------
html[data-theme='dark'] .quick-panel {
  background: rgba(28, 28, 32, 0.88);
}

html[data-theme='dark'] .qp-title {
  color: #f5f5f7;
}

html[data-theme='dark'] .qp-new {
  color: #c7c7cc;
  background: rgba(255, 255, 255, 0.08);

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }
}

html[data-theme='dark'] .qp-close {
  color: #98989d;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
    color: #f5f5f7;
  }
}

html[data-theme='dark'] .qp-body::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.2);
}

html[data-theme='dark'] .qp-empty-title {
  color: #f5f5f7;
}

html[data-theme='dark'] .qp-empty-desc {
  color: #98989d;
}
</style>
