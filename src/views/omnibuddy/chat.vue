<template>
  <div class="ob-chat" :class="{ 'with-panel': wsPanelOpen }">
    <!-- 对话列（主体 + 输入区），与工作区面板横向并排 -->
    <div class="ob-main-col">
    <!-- 对话主体 -->
    <div ref="body" class="ob-body">
      <!-- 空会话欢迎占位 -->
      <div v-if="!sessionId || !messages.length" class="ob-placeholder">
        <div class="ob-icon">
          <svg-icon icon-class="buddy" class="ob-svg" />
        </div>
        <div class="ob-hi">有什么可以帮您？</div>
        <div class="ob-desc">{{ welcomeDesc }}</div>
      </div>

      <!-- 消息列表 -->
      <div v-else class="ob-messages">
        <template v-for="(m, i) in messages">
          <!-- 用户 / 助手消息 -->
          <div
            v-if="m.role === 'user' || m.role === 'assistant'"
            :key="(m.id || i) + '-msg'"
            class="ob-msg"
            :class="m.role"
          >
            <div class="ob-msg-avatar">
              <svg-icon v-if="m.role === 'assistant'" icon-class="buddy" class="ob-msg-svg" />
              <i v-else class="el-icon-user-solid"></i>
            </div>
            <div class="ob-msg-bubble">
              <div
                v-if="m.role === 'assistant'"
                class="ob-md"
                v-html="renderMarkdown(m.content)"
              ></div>
              <template v-else>{{ m.content }}</template>
              <span v-if="streaming && m.role === 'assistant' && m.streaming" class="ob-cursor"></span>
              <!-- 用户消息 hover：回退重发 / 创建分支 -->
              <div v-if="m.role === 'user' && !streaming && m.id" class="ob-msg-actions">
                <span class="ob-msg-action" title="丢弃此消息及之后的记录，重新提问" @click="truncateAt(m)">
                  <i class="el-icon-refresh-left"></i> 重新提问
                </span>
                <span class="ob-msg-action" title="以此为分叉点创建分支会话（当前会话保留）" @click="branchAt(m)">
                  <i class="el-icon-share"></i> 创建分支
                </span>
              </div>
            </div>
          </div>

          <!-- 工具调用卡片 -->
          <div v-else-if="m.role === 'tool'" :key="(m.id || i) + '-tool'" class="ob-tool-card" :class="{ error: m.isError }">
            <div class="ob-tool-head" @click="m._open = !m._open">
              <i :class="m.status === 'running' ? 'el-icon-loading' : (m.isError ? 'el-icon-warning-outline' : 'el-icon-s-tools')"></i>
              <span class="ob-tool-name">{{ m.toolName }}</span>
              <span v-if="m.status === 'running'" class="ob-tool-status running">执行中…</span>
              <i class="el-icon-arrow-down ob-tool-arrow" :class="{ open: m._open }"></i>
            </div>
            <div v-if="m._open" class="ob-tool-detail">
              <div v-if="m.args" class="ob-tool-block">
                <div class="ob-tool-label">参数</div>
                <pre class="ob-tool-pre">{{ formatJson(m.args) }}</pre>
              </div>
              <div v-if="m.result" class="ob-tool-block">
                <div class="ob-tool-label">{{ m.isError ? '错误' : '结果' }}</div>
                <pre class="ob-tool-pre">{{ m.result }}</pre>
              </div>
            </div>
          </div>

          <!-- ask_user 提问表单 -->
          <div v-else-if="m.role === 'ask_user'" :key="(m.id || i) + '-ask'" class="ob-ask-card">
            <div class="ob-ask-question">
              <svg-icon icon-class="buddy" class="ob-ask-icon" />
              <span>{{ m.question }}</span>
            </div>
            <div v-if="m.answered || m.answer" class="ob-ask-answer">
              <i class="el-icon-user-solid"></i>
              {{ m.answer || '（未作答）' }}
            </div>
            <div v-else class="ob-ask-form">
              <el-button
                v-for="opt in m.options"
                :key="opt"
                size="mini"
                round
                @click="answerAsk(m, opt)"
              >{{ opt }}</el-button>
              <el-input
                v-model="m._input"
                size="mini"
                class="ob-ask-input"
                placeholder="或输入回答…"
                @keyup.enter.native="answerAsk(m, m._input)"
              >
                <el-button slot="append" icon="el-icon-position" @click="answerAsk(m, m._input)"></el-button>
              </el-input>
            </div>
          </div>

          <!-- todo 任务清单卡片 -->
          <div v-else-if="m.role === 'todo'" :key="(m.id || i) + '-todo'" class="ob-todo-card">
            <div class="ob-todo-title"><i class="el-icon-finished"></i> 任务清单</div>
            <div
              v-for="(t, ti) in m.todos"
              :key="ti"
              class="ob-todo-item"
              :class="t.status"
            >
              <i :class="todoIcon(t.status)"></i>
              <span class="ob-todo-text">{{ t.content }}</span>
              <span v-if="t.status === 'in_progress'" class="ob-todo-tag">进行中</span>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 底部：输入框（工作空间/模型选择内嵌于对话框工具栏） -->
    <div class="ob-composer">
      <div class="ob-composer-inner">
        <buddy-composer v-model="draft" @send="send">
          <template slot="tools">
            <!-- 工作空间选择（发送前必须选定） -->
            <el-dropdown trigger="click" @command="onSelectWorkspace">
              <span class="ob-inline-chip" :class="{ warn: !currentWorkspaceId }" :title="currentWorkspace ? currentWorkspace.path : ''">
                <i class="el-icon-folder-opened"></i>
                {{ currentWorkspace ? currentWorkspace.name : '选择工作空间' }}
                <i class="el-icon-arrow-down"></i>
              </span>
              <el-dropdown-menu slot="dropdown">
                <el-dropdown-item
                  v-for="w in workspaces"
                  :key="w.id"
                  :command="w.id"
                >
                  {{ w.name }}
                  <i v-if="currentWorkspaceId === w.id" class="el-icon-check ob-provider-check"></i>
                </el-dropdown-item>
                <el-dropdown-item command="__add" divided icon="el-icon-plus">添加本地目录…</el-dropdown-item>
                <el-dropdown-item
                  v-if="currentWorkspace && !currentWorkspace.isDefault"
                  command="__remove"
                  icon="el-icon-delete"
                >移除当前工作空间</el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>

            <!-- 模型选择 -->
            <el-dropdown trigger="click" @command="onSelectProvider">
              <span class="ob-inline-chip">
                <i class="el-icon-cpu"></i>
                {{ currentProvider ? currentProvider.model : '未配置模型' }}
                <i class="el-icon-arrow-down"></i>
              </span>
              <el-dropdown-menu slot="dropdown">
                <el-dropdown-item
                  v-for="p in providers"
                  :key="p.id"
                  :command="p.id"
                >
                  {{ p.name }} · {{ p.model }}
                  <i v-if="currentProviderId === p.id" class="el-icon-check ob-provider-check"></i>
                </el-dropdown-item>
                <el-dropdown-item command="__settings" divided icon="el-icon-setting">管理供应商</el-dropdown-item>
              </el-dropdown-menu>
            </el-dropdown>

            <button
              v-if="streaming"
              class="ob-stop-btn"
              title="停止生成"
              @click="interrupt"
            >
              <i class="el-icon-video-pause"></i>
              停止生成
            </button>
          </template>
        </buddy-composer>
      </div>
    </div>
    </div>
  </div>
</template>

<script>
import BuddyComposer from '@/components/buddy/BuddyComposer.vue'
import MarkdownIt from 'markdown-it'
import { getItem } from '@/utils/db'

const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// OmniBuddy 对话主区：pi Agent 流式对话（文本 + 工具调用 + ask-user + todo）
export default {
  name: 'OmniBuddyChat',
  components: { BuddyComposer },
  data() {
    return {
      draft: '',
      messages: [],
      streaming: false,
      providers: [],
      currentProviderId: '',
      // ===== 工作空间（发送前必须选定） =====
      workspaces: [],
      currentWorkspaceId: '',
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
    currentWorkspace() {
      return this.workspaces.find(w => w.id === this.currentWorkspaceId) || null
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
    this.loadWorkspaces()
    this.unsubscribe = this.api().onEvent(this.onAgentEvent)
  },
  beforeDestroy() {
    if (this.unsubscribe) this.unsubscribe()
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
    renderMarkdown(text) {
      try {
        return md.render(text || '')
      } catch (e) {
        return ''
      }
    },
    formatJson(v) {
      if (typeof v === 'string') return v
      try {
        return JSON.stringify(v, null, 2)
      } catch (e) {
        return String(v)
      }
    },
    todoIcon(status) {
      return {
        pending: 'el-icon-remove-outline',
        in_progress: 'el-icon-loading',
        completed: 'el-icon-success'
      }[status] || 'el-icon-remove-outline'
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
      this.messages = seenTodo
        ? list.filter(m => m.role !== 'todo' || m === [...list].reverse().find(x => x.role === 'todo'))
        : list
      this.scrollToBottom()
    },
    onSelectProvider(id) {
      if (id === '__settings') {
        this.$router.push('/omnibuddy/settings')
        return
      }
      this.currentProviderId = id
    },
    async send() {
      const text = this.draft.trim()
      if (!text || this.streaming) return
      if (!window.electronAPI || !window.electronAPI.omnibuddy) {
        this.$message.info('对话能力需要 OmniDeck 桌面端')
        this.draft = ''
        return
      }
      // 发送前必须选定工作空间
      if (!this.currentWorkspaceId) {
        this.$message.warning('请先在输入框左下角选择工作空间')
        return
      }
      this.draft = ''

      let sessionId = this.sessionId
      if (!sessionId) {
        const spaceId = getItem('buddyActiveSpaceId', 'sp-default')
        const session = await this.api().createSession({ spaceId, workspaceId: this.currentWorkspaceId })
        sessionId = session.id
        this.$router.replace({ query: { s: sessionId } })
        this.$root.$emit('omnibuddy:sessions-changed')
      }

      this.messages.push({ role: 'user', content: text, createdAt: Date.now() })
      this.streaming = true
      this.scrollToBottom()

      const res = await this.api().sendMessage({
        id: sessionId,
        text,
        provider: this.currentProvider,
        workspaceId: this.currentWorkspaceId
      })
      if (!res.ok) {
        this.streaming = false
        this.$message.error(res.error || '发送失败')
      }
    },
    // 主进程流式事件（pi Agent 循环 + 兜底纯对话）
    onAgentEvent(e) {
      if (e.sessionId !== this.sessionId) return
      switch (e.type) {
        case 'assistant_start':
          this.messages.push({ role: 'assistant', content: '', streaming: true })
          break
        case 'delta': {
          // 更新最后一个流式助手消息（兜底路径无 assistant_start，需兜底 push）
          let last = this.messages[this.messages.length - 1]
          if (!last || last.role !== 'assistant') {
            this.messages.push({ role: 'assistant', content: '', streaming: true })
            last = this.messages[this.messages.length - 1]
          }
          last.content = e.text
          break
        }
        case 'assistant_end': {
          const last = this.messages[this.messages.length - 1]
          if (last && last.role === 'assistant' && last.streaming) {
            last.content = e.content
            this.$delete(last, 'streaming')
          }
          break
        }
        case 'tool_start':
          this.messages.push({
            role: 'tool',
            toolName: e.toolName,
            args: e.args,
            status: 'running',
            _open: false
          })
          break
        case 'tool_update': {
          const t = this.messages.find(m => m.role === 'tool' && m.status === 'running' && m.toolName === e.toolName)
          if (t) t.partial = e.partial
          break
        }
        case 'tool_end': {
          // 匹配执行中的同名工具（toolCallId 不持久化，按名称匹配最后一个 running）
          const idx = [...this.messages]
            .map((m, i) => ({ m, i }))
            .reverse()
            .find(x => x.m.role === 'tool' && x.m.status === 'running' && x.m.toolName === e.toolName)
          if (idx) {
            const t = this.messages[idx.i]
            t.status = 'done'
            t.result = e.result
            t.isError = e.isError
            if (e.isError) t._open = true
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
          this.$root.$emit('omnibuddy:sessions-changed')
          break
        case 'interrupted': {
          const last = this.messages[this.messages.length - 1]
          if (last && last.role === 'assistant' && last.streaming) {
            if (!last.content) this.messages.pop()
            else this.$delete(last, 'streaming')
          }
          this.streaming = false
          break
        }
        case 'error':
          this.streaming = false
          this.$message.error(e.error || '生成失败')
          break
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
    // ===== 工作空间（发送前必须选定） =====
    async loadWorkspaces() {
      try {
        const list = await this.api().listWorkspaces()
        this.workspaces = Array.isArray(list) ? list : []
        if (this.workspaces.length && !this.currentWorkspaceId) {
          this.currentWorkspaceId = this.workspaces[0].id
        }
      } catch (e) {
        this.workspaces = []
      }
    },
    async onSelectWorkspace(command) {
      if (command === '__add') {
        const res = await this.api().addWorkspace()
        if (res && res.ok && res.workspace) {
          await this.loadWorkspaces()
          this.currentWorkspaceId = res.workspace.id
          this.$message.success('已添加工作空间：' + res.workspace.name)
        } else if (res && !res.canceled && res.error) {
          this.$message.error(res.error)
        }
        return
      }
      if (command === '__remove') {
        const target = this.currentWorkspace
        if (!target) return
        this.$confirm('移除工作空间「' + target.name + '」？（仅解除关联，不删除磁盘文件）', '移除工作空间', {
          confirmButtonText: '移除',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(async () => {
          const res = await this.api().removeWorkspace(target.id)
          if (res && res.ok) {
            await this.loadWorkspaces()
            this.currentWorkspaceId = this.workspaces.length ? this.workspaces[0].id : ''
          } else {
            this.$message.error((res && res.error) || '移除失败')
          }
        }).catch(() => {})
        return
      }
      this.currentWorkspaceId = command
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
$ob-accent: #722ED1;

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

/* ===== 对话框工具栏内嵌选择 chip（工作空间/模型） ===== */
.ob-inline-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 10px;
  border-radius: 13px;
  background: var(--search-bg);
  border: 1px solid var(--border-color);
  color: var(--text-primary);
  font-size: 11.5px;
  cursor: pointer;
  user-select: none;
  max-width: 200px;
  transition: all 0.15s ease;

  i {
    font-size: 12px;
    color: $ob-accent;

    &.el-icon-arrow-down {
      color: var(--text-secondary);
      font-size: 11px;
    }
  }

  > span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    border-color: rgba(114, 46, 209, 0.45);
  }

  &.warn {
    border-color: #e6a23c;
    color: #e6a23c;

    i {
      color: #e6a23c;
    }
  }
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

/* 空会话欢迎占位 */
.ob-placeholder {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 48px;
}

.ob-icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(114, 46, 209, 0.16), rgba(114, 46, 209, 0.05));
  border: 1px solid rgba(114, 46, 209, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;

  .ob-svg {
    width: 32px;
    height: 32px;
    color: $ob-accent;
  }
}

.ob-hi {
  margin-top: 4px;
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary);
}

.ob-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

/* ===== 消息列表 ===== */
.ob-messages {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  padding: 24px 18px 12px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.ob-msg {
  display: flex;
  gap: 10px;

  &.user {
    flex-direction: row-reverse;

    .ob-msg-bubble {
      background: linear-gradient(135deg, #9254DE, $ob-accent);
      color: #fff;
      border: none;
    }

    .ob-msg-avatar {
      background: var(--search-bg);
      color: var(--text-secondary);
    }
  }
}

.ob-msg-avatar {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(114, 46, 209, 0.1);

  .ob-msg-svg {
    width: 16px;
    height: 16px;
    color: $ob-accent;
  }

  i {
    font-size: 14px;
  }
}

.ob-msg-bubble {
  max-width: calc(100% - 56px);
  padding: 10px 14px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--card-bg, #fff);
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
  user-select: text;
}

/* 流式光标 */
.ob-cursor {
  display: inline-block;
  width: 7px;
  height: 15px;
  margin-left: 3px;
  vertical-align: -2px;
  border-radius: 2px;
  background: $ob-accent;
  animation: ob-blink 0.9s steps(2) infinite;
}

@keyframes ob-blink {
  50% { opacity: 0; }
}

/* 用户消息 hover 操作：回退重发 / 创建分支 */
.ob-msg-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.ob-msg.user:hover .ob-msg-actions {
  opacity: 1;
}

.ob-msg-action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;

  i {
    font-size: 12px;
  }

  &:hover {
    color: $ob-accent;
  }
}

/* ===== 工具调用卡片 ===== */
.ob-tool-card {
  margin-left: 40px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg, #fff);
  overflow: hidden;

  &.error {
    border-color: rgba(245, 34, 45, 0.4);
  }
}

.ob-tool-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;

  > i:first-child { font-size: 13px; }

  .ob-tool-name {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    color: $ob-accent;
    font-weight: 600;
  }

  .ob-tool-status.running { color: #E6A23C; }

  .ob-tool-arrow {
    margin-left: auto;
    transition: transform 0.15s ease;
    font-size: 11px;

    &.open { transform: rotate(180deg); }
  }
}

.ob-tool-detail {
  border-top: 1px solid var(--border-color);
  padding: 8px 12px;
}

.ob-tool-block {
  & + & { margin-top: 8px; }
}

.ob-tool-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.ob-tool-pre {
  margin: 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.05);
  font-size: 11.5px;
  line-height: 1.55;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 220px;
  overflow-y: auto;
  color: var(--text-primary);
}

/* ===== ask_user 表单卡片 ===== */
.ob-ask-card {
  margin-left: 40px;
  border: 1px solid rgba(114, 46, 209, 0.35);
  border-radius: 12px;
  background: rgba(114, 46, 209, 0.05);
  padding: 12px 14px;
}

.ob-ask-question {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;

  .ob-ask-icon {
    width: 16px;
    height: 16px;
    color: $ob-accent;
    flex-shrink: 0;
    margin-top: 2px;
  }
}

.ob-ask-form {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .el-button { margin: 0; }
}

.ob-ask-input {
  width: 260px;
}

.ob-ask-answer {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-secondary);
  word-break: break-word;

  i { color: $ob-accent; }
}

/* ===== todo 任务清单卡片 ===== */
.ob-todo-card {
  margin-left: 40px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg, #fff);
  padding: 10px 14px;
}

.ob-todo-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 8px;

  i { color: $ob-accent; }
}

.ob-todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12.5px;

  > i { font-size: 13px; }

  &.pending {
    color: var(--text-secondary);
    > i { color: var(--text-secondary); }
  }

  &.in_progress {
    color: $ob-accent;
    font-weight: 600;
    > i { color: $ob-accent; }
  }

  &.completed {
    color: var(--text-secondary);
    text-decoration: line-through;
    > i { color: #67C23A; }
  }
}

.ob-todo-text {
  flex: 1;
  min-width: 0;
}

.ob-todo-tag {
  font-size: 10.5px;
  color: $ob-accent;
  background: rgba(114, 46, 209, 0.1);
  border-radius: 999px;
  padding: 1px 8px;
}

/* ===== Markdown 渲染 ===== */
.ob-md {
  ::v-deep {
    p { margin: 0 0 8px; }
    p:last-child { margin-bottom: 0; }

    pre {
      background: rgba(0, 0, 0, 0.06);
      border-radius: 10px;
      padding: 10px 12px;
      overflow-x: auto;
      margin: 8px 0;
      font-size: 12.5px;
      line-height: 1.6;

      code {
        background: transparent;
        padding: 0;
        font-family: 'SF Mono', Menlo, Consolas, monospace;
      }
    }

    code {
      background: rgba(114, 46, 209, 0.09);
      color: $ob-accent;
      padding: 1px 5px;
      border-radius: 5px;
      font-size: 12.5px;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
    }

    ul, ol {
      padding-left: 20px;
      margin: 6px 0;
    }

    blockquote {
      margin: 8px 0;
      padding: 4px 12px;
      border-left: 3px solid rgba(114, 46, 209, 0.45);
      color: var(--text-secondary);
    }

    table {
      border-collapse: collapse;
      margin: 8px 0;

      th, td {
        border: 1px solid var(--border-color);
        padding: 5px 10px;
        font-size: 12.5px;
      }
    }

    a {
      color: $ob-accent;
    }

    h1, h2, h3, h4 {
      margin: 12px 0 6px;
      font-weight: 700;
    }
  }
}

/* ===== 输入区 ===== */
.ob-composer {
  flex-shrink: 0;
  padding: 10px 18px 14px;
}

.ob-composer-inner {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ob-provider-check {
  color: $ob-accent;
  margin-left: 6px;
  font-weight: 700;
}

.ob-stop-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: #fff;
  background: linear-gradient(135deg, #9254DE, $ob-accent);
  border: none;
  border-radius: 999px;
  padding: 3px 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  i { font-size: 11px; }

  &:hover { filter: brightness(1.08); }
  &:active { transform: scale(0.95); }
}
</style>
