<template>
  <!-- 用户 / 助手消息（豆包风格：无头像，用户右侧气泡，助手左侧纯内容） -->
  <div class="ob-msg" :class="message.role">
    <div class="ob-msg-bubble" :class="{ editing: message.role === 'user' && editing }">
      <!-- 助手：上下文压缩摘要分界（自动压缩产物，正文即早期对话的总结） -->
      <div v-if="message.compaction" class="ob-compaction">
        <div class="ob-compaction-line">
          <svg-icon icon-class="clock" class="ob-compaction-ico" />
          <span>已自动整理早期对话（上下文压缩）</span>
        </div>
        <div v-if="compactionText" class="ob-compaction-meta">{{ compactionText }}</div>
      </div>

      <!-- 助手：深度思考区（思考过程 + Skill + 工具/MCP + ask_user 提问） -->
      <thinking-section
        v-if="hasSection"
        :items="message.items || []"
        :is-thinking="!!message.isThinking"
        :is-streaming="!!message.streaming"
        @ask-answer="(msg, value) => $emit('ask-answer', msg, value)"
      />

      <!-- 助手：模型/供应商调用错误（原封不动展示，便于排查） -->
      <div v-if="message.role === 'assistant' && message.error" class="ob-msg-error">
        <svg-icon icon-class="warning-outline" class="ob-msg-error-ico" />
        <div class="ob-msg-error-text">{{ message.error }}</div>
      </div>

      <!-- 助手：等待首个内容块的思考占位（转圈 + 秒计时；ask_user 待回答期间持续显示） -->
      <div v-if="showThinkingPlaceholder" class="ob-thinking">
        <svg-icon icon-class="loading" class="ob-think-spin" />
        <span>思考中</span><span class="ob-thinking-sec">{{ message.seconds }}s</span>
      </div>
      <!-- 助手：正文 Markdown（click 委托承接代码块复制按钮） -->
      <div
        v-else-if="message.role === 'assistant' && message.content"
        class="ob-md"
        v-html="rendered"
        @click="onMdClick"
      ></div>
      <!-- 用户：图片附件缩略图（截图提问；编辑态隐藏 —— 编辑重问仅发送文本） -->
      <div v-if="message.role === 'user' && !editing && message.images && message.images.length" class="ob-msg-images">
        <img
          v-for="img in message.images"
          :key="img.id"
          class="ob-msg-img"
          :src="img.thumb"
          :title="img.width + '×' + img.height"
          alt="截图"
          draggable="false"
        />
      </div>
      <!-- 用户：文件附件卡片（文本/PDF 与文件导入图片，P1-7；编辑态隐藏） -->
      <div v-if="!editing && fileAttachmentList.length" class="ob-msg-files">
        <div v-for="f in fileAttachmentList" :key="f.id" class="ob-msg-file">
          <img v-if="f.kind === 'image' && f.thumb" class="ob-msg-file-thumb" :src="f.thumb" alt="" draggable="false" />
          <svg-icon v-else :icon-class="f.kind === 'pdf' ? 'doc' : 'document'" class="ob-msg-file-ico" />
          <div class="ob-msg-file-info">
            <div class="ob-msg-file-name" :title="f.name">{{ f.name }}</div>
            <div class="ob-msg-file-meta">{{ fileKindLabel(f.kind) + ' · ' + formatSize(f.size) }}</div>
          </div>
        </div>
      </div>
      <!-- 用户：编辑重问（会话内分支）—— 替换正文为编辑框（按钮嵌在框内底栏），回车或按钮提交；
           焦点移出编辑框（点击其它区域）自动退出编辑恢复原样式 -->
      <div v-if="message.role === 'user' && editing" class="ob-edit-area" @focusout="onEditFocusout">
        <textarea
          ref="editBox"
          v-model="editText"
          class="ob-edit-input"
          rows="3"
          placeholder="修改后重新提问，将创建新分支"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
          @keydown.enter.exact.prevent="onEnterEdit"
          @keydown.esc="editing = false"
        ></textarea>
        <div class="ob-edit-btns">
          <!-- mousedown.prevent：阻止点击按钮时 textarea 先失焦导致编辑区被移除、click 落空 -->
          <span class="ob-edit-btn cancel" @mousedown.prevent @click="editing = false">取消</span>
          <span class="ob-edit-btn go" @mousedown.prevent @click="submitEdit">重新提问</span>
        </div>
      </div>
      <template v-else-if="message.role === 'user'">{{ message.content }}</template>

      <!-- 用户：分支切换器（该问题存在多个分支变体时常驻显示，点击切换线路）
           居中胶囊分页器 ‹ 1/2 ›，仅多分支时出现 -->
      <div v-if="message.role === 'user' && !editing && branchInfo" class="ob-branch-switch">
        <span
          class="ob-branch-arrow"
          title="上一条分支"
          @click="$emit('switch-branch', { headId: branchInfo.headId, dir: -1 })"
        >
          <svg-icon icon-class="arrow-right" class="ob-flip" />
        </span>
        <span class="ob-branch-count" :title="'共 ' + branchInfo.total + ' 条分支，点击箭头切换'">{{ branchInfo.index }} / {{ branchInfo.total }}</span>
        <span
          class="ob-branch-arrow"
          title="下一条分支"
          @click="$emit('switch-branch', { headId: branchInfo.headId, dir: 1 })"
        >
          <svg-icon icon-class="arrow-right" />
        </span>
      </div>
      <span v-if="showCursor" class="ob-cursor"></span>

      <!-- 助手 meta 行（回答完成后呈现：复制 / 点赞 / 点踩 / 分支 / 导出 / token 用量 / 时间，定高不抖动） -->
      <div v-if="message.role === 'assistant' && !message.streaming" class="ob-msg-meta">
        <span class="ob-meta-copy" title="复制全文" @click="copyContent">
          <svg-icon icon-class="copy" />
        </span>
        <span
          class="ob-meta-act"
          :class="{ on: message.feedback === 'like' }"
          :title="message.feedback === 'like' ? '取消点赞' : '点赞'"
          @click="setFeedback('like')"
        >
          <svg-icon :icon-class="message.feedback === 'like' ? 'like-fill' : 'like'" />
        </span>
        <span
          class="ob-meta-act"
          :class="{ on: message.feedback === 'dislike' }"
          :title="message.feedback === 'dislike' ? '取消点踩' : '点踩'"
          @click="setFeedback('dislike')"
        >
          <svg-icon :icon-class="message.feedback === 'dislike' ? 'notlike-fill' : 'notlike'" />
        </span>
        <span v-if="message.id" class="ob-meta-act" title="以此为分叉点复制完整上下文，创建新会话（当前会话保留）" @click="$emit('branch')">
          <svg-icon icon-class="fork" />
        </span>
        <span class="ob-meta-act" title="导出本条回答为 Markdown" @click="exportContent">
          <svg-icon icon-class="export" />
        </span>
        <span v-if="tokensText" class="ob-meta-text">{{ tokensText }}</span>
        <span v-if="contextText" class="ob-meta-ctx" :title="'上下文占用 ' + contextPercent + '%（接近上限将自动整理早期对话）'">
          <span class="ob-ctx-bar"><span class="ob-ctx-fill" :class="ctxLevel" :style="{ width: contextPercent + '%' }"></span></span>
          <span class="ob-meta-text">{{ contextText }}</span>
        </span>
        <span v-if="timeText" class="ob-meta-text">{{ timeText }}</span>
      </div>

      <!-- 用户消息 hover：时间 / 复制 / 编辑重问（分支）（绝对定位，不占文档流）
           复制与时间无需消息 id（实时消息即有）；编辑重问依赖落盘 id -->
      <div v-if="message.role === 'user' && !streaming" class="ob-msg-actions">
        <span class="ob-msg-time">{{ timeText }}</span>
        <span class="ob-user-copy" title="复制" @click="copyContent">
          <svg-icon icon-class="copy" />
        </span>
        <span v-if="message.id && !editing" class="ob-user-copy" title="编辑并重新提问（创建分支）" @click="startEdit">
          <svg-icon icon-class="edit" />
        </span>
      </div>
    </div>
  </div>
</template>

<script>
// OmniBuddy 对话消息气泡（用户纯文本 / 助手 Markdown + 深度思考区 + 流式光标 + meta 行）
import { renderMarkdown, handleCodeCopy } from '@/utils/markdown'
import ThinkingSection from './ThinkingSection.vue'

export default {
  name: 'MessageBubble',
  components: { ThinkingSection },
  props: {
    message: {
      type: Object,
      required: true
    },
    // 会话是否正在流式生成（控制光标与 hover 操作）
    streaming: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      // 编辑重问（会话内分支）：编辑态与草稿
      editing: false,
      editText: '',
      // 中文输入法组合中（组合态回车 = 确认候选词，不触发提交）
      isComposing: false
    }
  },
  watch: {
    // 切换分支变体 / 消息变化时退出编辑态
    'message.id'() {
      this.editing = false
    }
  },
  computed: {
    // 分支信息（仅用户消息的组头位置携带：{ headId, total, index }，多分支才显示切换器）
    branchInfo() {
      const b = this.message._branch
      return (b && b.total > 1) ? b : null
    },
    rendered() {
      return renderMarkdown(this.message.content)
    },
    // 是否展示深度思考区（已有内容块）
    hasSection() {
      return this.message.role === 'assistant' &&
        !!(this.message.items && this.message.items.length > 0)
    },
    // 尚无任何内容块时，退回「思考中 Ns」占位
    showThinkingPlaceholder() {
      return this.message.role === 'assistant' &&
        !!this.message.thinking && !this.message.content && !this.hasSection
    },
    // 正文流式光标（思考中由深度思考区自己渲染）
    showCursor() {
      return this.message.role === 'assistant' &&
        !!this.message.streaming && !!this.message.content && !this.message.isThinking
    },
    // token 用量（直接文字展示：输入 / 输出，单位 tokens；万位以上缩写为 k）
    tokensText() {
      const u = this.message.usage
      if (!u || (!u.input && !u.output)) return ''
      return '输入 ' + this.formatTokens(u.input) + ' tokens · 输出 ' + this.formatTokens(u.output) + ' tokens'
    },
    // 上下文占用文字（tokens / 窗口，P1-9）
    contextText() {
      const u = this.message.usage
      if (!u || !u.contextTokens || !u.contextWindow) return ''
      return '上下文 ' + this.formatTokens(u.contextTokens) + ' / ' + this.formatTokens(u.contextWindow)
    },
    // 上下文占用百分比（0-100，钳制；无数据时 0）
    contextPercent() {
      const u = this.message.usage
      if (!u || !u.contextTokens || !u.contextWindow) return 0
      return Math.min(100, Math.max(0, Math.round((u.contextTokens / u.contextWindow) * 100)))
    },
    // 用量条颜色档位（<60% 正常 / <85% 警示 / 高危）
    ctxLevel() {
      const p = this.contextPercent
      if (p >= 85) return 'danger'
      if (p >= 60) return 'warn'
      return 'ok'
    },
    // 压缩摘要 meta（token 前后对比）
    compactionText() {
      const c = this.message.compaction
      if (!c || (!c.tokensBefore && !c.tokensAfter)) return ''
      return '上下文 ' + this.formatTokens(c.tokensBefore) + ' → ' + this.formatTokens(c.tokensAfter) + ' tokens'
    },
    // 消息时间（统一 mm-dd HH:mm:ss）
    timeText() {
      return this.formatTime(this.message.createdAt)
    },
    // 文件附件列表（仅用户消息有，P1-7）
    fileAttachmentList() {
      if (this.message.role !== 'user' || !Array.isArray(this.message.fileAttachments)) return []
      return this.message.fileAttachments
    }
  },
  methods: {
    // Markdown 区点击委托：代码块复制按钮（v-html 内容不归 Vue 管，走事件委托）
    onMdClick(e) {
      handleCodeCopy(e).then(ok => {
        if (ok) this.$message.success('已复制')
      })
    },
    // ===== 编辑重问（会话内分支）=====
    // 进入编辑态：预填当前问题文本并聚焦
    startEdit() {
      this.editText = this.message.content || ''
      this.editing = true
      this.$nextTick(() => {
        const box = this.$refs.editBox
        if (box) {
          box.focus()
          // 光标置于末尾
          const len = box.value.length
          try { box.setSelectionRange(len, len) } catch (e) { /* 忽略 */ }
        }
      })
    },
    // 焦点移出编辑区：退出编辑恢复原气泡（点击输入框外任意区域即取消）。
    // relatedTarget 仍在编辑区内（textarea ↔ 按钮间切换）不取消；
    // 点击不可聚焦区域（空白处/图标）时 relatedTarget 为 null → 取消
    onEditFocusout(e) {
      const to = e.relatedTarget
      if (to && e.currentTarget.contains(to)) return
      this.editing = false
    },
    // 回车提交编辑：输入法组合中（确认候选词）不提交
    onEnterEdit(e) {
      if (this.isComposing || e.isComposing) return
      this.submitEdit()
    },
    // 提交编辑：上抛页面层（创建分支变体并重新提问）
    submitEdit() {
      const text = String(this.editText || '').trim()
      if (!text) {
        this.$message.warning('内容不能为空')
        return
      }
      this.editing = false
      this.$emit('edit-resend', { message: this.message, text })
    },
    formatTokens(n) {
      const v = Number(n) || 0
      return v >= 10000 ? (v / 1000).toFixed(1) + 'k' : String(v)
    },
    // 文件大小人性化（B/KB/MB）
    formatSize(n) {
      const v = Number(n) || 0
      if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB'
      if (v >= 1024) return (v / 1024).toFixed(1) + ' KB'
      return v + ' B'
    },
    fileKindLabel(kind) {
      if (kind === 'pdf') return 'PDF'
      if (kind === 'image') return '图片'
      return '文本'
    },
    formatTime(ts) {
      if (!ts) return ''
      const d = new Date(ts)
      const pad = x => String(x).padStart(2, '0')
      return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
        pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
    },
    // 复制助手正文
    copyContent() {
      const text = this.message.content || ''
      if (!text) return
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => this.$message.success('已复制'),
          () => this.$message.error('复制失败')
        )
      } else {
        this.$message.error('当前环境不支持复制')
      }
    },
    // 点赞 / 点踩（互斥切换，再次点击取消）：本地即时生效并提示，
    // 有落盘 id 时上抛页面层持久化到主进程（重开会话仍保留）
    setFeedback(v) {
      const next = this.message.feedback === v ? '' : v
      this.$set(this.message, 'feedback', next)
      this.$message.success(next === 'like' ? '已点赞' : next === 'dislike' ? '已点踩，感谢反馈' : '已取消')
      if (this.message.id) this.$emit('feedback', { message: this.message, value: next })
    },
    // 导出本条回答为 Markdown 文件（渲染层 Blob 下载）
    exportContent() {
      const text = this.message.content || ''
      if (!text) return
      const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'OmniBuddy-' + this.formatTime(this.message.createdAt).replace(/[: ]/g, '-') + '.md'
      a.click()
      URL.revokeObjectURL(url)
      this.$message.success('已导出')
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-msg {
  display: flex;

  &.user {
    justify-content: flex-end;

    .ob-msg-bubble {
      max-width: 85%;
      background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
      color: #fff;
      border: none;
      border-radius: 14px;
      padding: 10px 14px;
    }
  }
}

.ob-msg-bubble {
  max-width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  /* 问答内容统一字号（用户消息文本与助手 Markdown 正文均继承） */
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
  user-select: text;
  /* hover 操作条（absolute）的定位基准：缺失时会相对 .buddy-right 定位而被裁剪，完全不可见 */
  position: relative;
}

/* 用户消息图片附件缩略图（气泡内文字上方） */
.ob-msg-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;

  &:empty { margin-bottom: 0; }
}

/* ===== 编辑重问（会话内分支）：卡片式输入框，操作按钮嵌在框内底栏 ===== */
/* 编辑态：去除用户气泡的渐变背景，仅呈现编辑框卡片本身 */
.ob-msg.user .ob-msg-bubble.editing {
  background: transparent;
  border: none;
  color: var(--text-primary);
}

.ob-edit-area {
  width: 100%;
  min-width: 300px;
  border: 1.5px solid rgba(var(--primary-color-rgb), 0.55);
  border-radius: 14px;
  background: var(--card-bg, #fff);
  box-shadow: 0 2px 12px rgba(var(--primary-color-rgb), 0.1);
  overflow: hidden;
}

.ob-edit-input {
  display: block;
  width: 100%;
  min-height: 64px;
  max-height: 240px;
  overflow-y: auto;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
  line-height: 1.6;
  padding: 10px 13px 4px;

  &::placeholder {
    color: var(--text-secondary);
  }
}

/* 框内底栏：右侧纯文字按钮（取消 / 重新提问） */
.ob-edit-btns {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 8px;
  user-select: none;
}

.ob-edit-btn {
  cursor: pointer;
  font-size: 12.5px;
  padding: 3px 10px;
  border-radius: 7px;
  transition: all 0.12s ease;
  user-select: none;

  &.cancel {
    color: var(--text-secondary);

    &:hover {
      color: var(--text-primary);
    }
  }

  &.go {
    color: var(--primary-color);
    font-weight: 600;

    &:hover {
      background: rgba(var(--primary-color-rgb), 0.09);
    }
  }

  &:active {
    transform: scale(0.95);
  }
}

/* ===== 分支切换器（用户气泡内、多分支时常驻显示）：居中胶囊分页器 ===== */
.ob-branch-switch {
  display: flex;
  align-items: center;
  gap: 1px;
  width: fit-content;
  margin: 9px auto 0;
  padding: 2px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(4px);
  user-select: none;
}

.ob-branch-count {
  min-width: 34px;
  text-align: center;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
  color: rgba(255, 255, 255, 0.92);
}

.ob-branch-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
  transition: all 0.12s ease;

  .svg-icon {
    font-size: 12px;
  }

  /* 左箭头 = 右箭头水平翻转（图标库未提供 arrow-left） */
  .ob-flip {
    transform: rotate(180deg);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.26);
    color: #fff;
  }

  &:active {
    transform: scale(0.88);
  }
}

.ob-msg-img {
  max-width: 220px;
  max-height: 140px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  display: block;
}

/* 用户消息文件附件卡片（P1-7）：图标/缩略图 + 文件名 + 类型/大小 */
.ob-msg-files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;

  &:empty { margin-bottom: 0; }
}

.ob-msg-file {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 7px 12px 7px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.12);
  max-width: 240px;
}

.ob-msg-file-thumb {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  object-fit: cover;
  flex-shrink: 0;
  display: block;
}

.ob-msg-file-ico {
  flex-shrink: 0;
  font-size: 20px;
  color: rgba(255, 255, 255, 0.9);
}

.ob-msg-file-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ob-msg-file-name {
  font-size: 12.5px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-msg-file-meta {
  font-size: 10.5px;
  opacity: 0.78;
  user-select: none;
}

/* 模型/供应商错误块：原始报错原样展示 */
.ob-msg-error {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 2px 0 6px;
  padding: 9px 11px;
  border: 1px solid rgba(230, 62, 62, 0.32);
  border-radius: 10px;
  background: rgba(230, 62, 62, 0.06);
}

.ob-msg-error-ico {
  flex-shrink: 0;
  font-size: 14px;
  margin-top: 2px;
  color: #e63e3e;
}

.ob-msg-error-text {
  font-size: 12px;
  line-height: 1.6;
  color: #c53030;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}

/* 思考中占位文案 */
.ob-thinking {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  color: var(--text-secondary);
  user-select: none;

  /* 主色转圈：等待模型首个内容块（含 ask_user 待回答期间） */
  .ob-think-spin {
    font-size: 13px;
    margin-right: 3px;
    color: var(--primary-color);
    animation: ob-think-rotate 0.9s linear infinite;
  }
}

@keyframes ob-think-rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.ob-thinking-sec {
  font-variant-numeric: tabular-nums;
  min-width: 24px;
}

/* 流式光标 */
.ob-cursor {
  display: inline-block;
  width: 7px;
  height: 15px;
  margin-left: 3px;
  vertical-align: -2px;
  border-radius: 2px;
  background: var(--primary-color);
  animation: ob-blink 0.9s steps(2) infinite;
}

@keyframes ob-blink {
  50% { opacity: 0; }
}

/* 用户消息 hover 操作：紧贴气泡下缘（padding 内置视觉间距，鼠标划过不丢 hover），
   绝对定位不占文档流（避免气泡多余空行）；nowrap 保证时间较长时不换行 */
.ob-msg-actions {
  position: absolute;
  top: 100%;
  right: 0;
  padding-top: 3px;
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  z-index: 2;
  transition: opacity 0.15s ease;
}

/* 用户消息时间（hover 与操作一起浮现，永不换行、允许向左溢出短气泡） */
.ob-msg-time {
  font-size: 11px;
  color: var(--text-secondary);
  user-select: none;
  white-space: nowrap;
}

/* 用户消息复制 icon（hover 与操作一起浮现） */
.ob-user-copy {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  color: var(--text-secondary);

  .svg-icon {
    font-size: 14px;
  }

  &:hover {
    color: var(--primary-color);
  }
}

/* ===== 助手 meta 行：固定常驻显示（复制 / token / 时间），定高保持布局稳定 ===== */
.ob-msg-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 20px;
  margin-top: 2px;
  user-select: none;
}

.ob-meta-copy,
.ob-meta-act {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  color: var(--text-secondary);

  .svg-icon {
    font-size: 14px;
  }

  &:hover {
    color: var(--primary-color);
  }
}

/* 点赞/点踩选中态：高亮当前项（两者互斥，未选中项保持灰色） */
.ob-meta-act.on {
  color: var(--primary-color);
}

.ob-meta-text {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ===== 上下文压缩摘要分界（P1-9）===== */
.ob-compaction {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 12px;
  margin-bottom: 10px;
  border-left: 2px solid var(--primary-color);
  border-radius: 6px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.03));
  font-size: 12px;
  color: var(--text-secondary);
  user-select: none;
}

.ob-compaction-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.ob-compaction-ico {
  font-size: 13px;
  color: var(--primary-color);
}

.ob-compaction-meta {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

/* ===== 上下文用量迷你条（meta 行内，P1-9）===== */
.ob-meta-ctx {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ob-ctx-bar {
  width: 52px;
  height: 4px;
  border-radius: 99px;
  background: rgba(125, 125, 135, 0.18);
  overflow: hidden;
  flex-shrink: 0;
}

.ob-ctx-fill {
  display: block;
  height: 100%;
  border-radius: 99px;
  transition: width 0.3s ease;

  &.ok {
    background: var(--primary-color);
  }

  &.warn {
    background: #e6a23c;
  }

  &.danger {
    background: #d93025;
  }
}

/* 悬停显示：气泡 hover 或操作条自身 hover 均保持（鼠标从气泡移入按钮不中断） */
.ob-msg.user:hover .ob-msg-actions,
.ob-msg-actions:hover {
  opacity: 1;
  pointer-events: auto;
}

/* ===== Markdown 渲染 ===== */
.ob-md {
  ::v-deep {
    p { margin: 0 0 8px; }
    p:last-child { margin-bottom: 0; }

    /* 代码块容器内 pre 复位（工具条/边框/圆角由全局 .ob-code 承载；
       本组件旧 pre 样式特异性更高，需在此覆盖） */
    .ob-code pre {
      margin: 0;
      border-radius: 0;
      background: transparent;
    }

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
      background: rgba(var(--primary-color-rgb), 0.09);
      color: var(--primary-color);
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
      border-left: 3px solid rgba(var(--primary-color-rgb), 0.45);
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
      color: var(--primary-color);
    }

    h1, h2, h3, h4 {
      margin: 12px 0 6px;
      font-weight: 700;
    }
  }
}
</style>
