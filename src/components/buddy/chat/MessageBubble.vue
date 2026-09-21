<template>
  <!-- 用户 / 助手消息（豆包风格：无头像，用户右侧气泡，助手左侧纯内容） -->
  <div class="ob-msg" :class="message.role">
    <div class="ob-msg-bubble">
      <!-- 助手：上下文压缩摘要分界（自动压缩产物，正文即早期对话的总结） -->
      <div v-if="message.compaction" class="ob-compaction">
        <div class="ob-compaction-line">
          <svg-icon icon-class="clock" class="ob-compaction-ico" />
          <span>已自动整理早期对话（上下文压缩）</span>
        </div>
        <div v-if="compactionText" class="ob-compaction-meta">{{ compactionText }}</div>
      </div>

      <!-- 助手：深度思考区（思考过程 + Skill + 工具/MCP） -->
      <thinking-section
        v-if="hasSection"
        :items="message.items || []"
        :is-thinking="!!message.isThinking"
        :is-streaming="!!message.streaming"
      />

      <!-- 助手：模型/供应商调用错误（原封不动展示，便于排查） -->
      <div v-if="message.role === 'assistant' && message.error" class="ob-msg-error">
        <svg-icon icon-class="warning-outline" class="ob-msg-error-ico" />
        <div class="ob-msg-error-text">{{ message.error }}</div>
      </div>

      <!-- 助手：等待首个内容块的思考占位（静态星形图标 + 秒计时） -->
      <div v-if="showThinkingPlaceholder" class="ob-thinking">
        <svg-icon icon-class="sparkle" class="ob-think-hico" />
        <span>思考中</span><span class="ob-thinking-sec">{{ message.seconds }}s</span>
      </div>
      <!-- 助手：正文 Markdown -->
      <div
        v-else-if="message.role === 'assistant' && message.content"
        class="ob-md"
        v-html="rendered"
      ></div>
      <!-- 用户：图片附件缩略图（截图提问） -->
      <div v-if="message.role === 'user' && message.images && message.images.length" class="ob-msg-images">
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
      <!-- 用户：文件附件卡片（文本/PDF 与文件导入图片，P1-7） -->
      <div v-if="fileAttachmentList.length" class="ob-msg-files">
        <div v-for="f in fileAttachmentList" :key="f.id" class="ob-msg-file">
          <img v-if="f.kind === 'image' && f.thumb" class="ob-msg-file-thumb" :src="f.thumb" alt="" draggable="false" />
          <svg-icon v-else :icon-class="f.kind === 'pdf' ? 'doc' : 'document'" class="ob-msg-file-ico" />
          <div class="ob-msg-file-info">
            <div class="ob-msg-file-name" :title="f.name">{{ f.name }}</div>
            <div class="ob-msg-file-meta">{{ fileKindLabel(f.kind) + ' · ' + formatSize(f.size) }}</div>
          </div>
        </div>
      </div>
      <template v-if="message.role === 'user'">{{ message.content }}</template>
      <span v-if="showCursor" class="ob-cursor"></span>

      <!-- 助手 meta 行（回答完成后呈现：复制 / token 用量 / 时间，定高不抖动） -->
      <div v-if="message.role === 'assistant' && !message.streaming" class="ob-msg-meta">
        <span class="ob-meta-copy" title="复制全文" @click="copyContent">
          <svg-icon icon-class="copy" />
        </span>
        <span v-if="tokensText" class="ob-meta-text">{{ tokensText }}</span>
        <span v-if="contextText" class="ob-meta-ctx" :title="'上下文占用 ' + contextPercent + '%（接近上限将自动整理早期对话）'">
          <span class="ob-ctx-bar"><span class="ob-ctx-fill" :class="ctxLevel" :style="{ width: contextPercent + '%' }"></span></span>
          <span class="ob-meta-text">{{ contextText }}</span>
        </span>
        <span v-if="timeText" class="ob-meta-text">{{ timeText }}</span>
      </div>

      <!-- 用户消息 hover：复制 / 时间 / 回退重发 / 创建分支（绝对定位，不占文档流）
           复制与时间无需消息 id（实时消息即有）；回退/分支依赖落盘 id -->
      <div v-if="message.role === 'user' && !streaming" class="ob-msg-actions">
        <span class="ob-user-copy" title="复制" @click="copyContent">
          <svg-icon icon-class="copy" />
        </span>
        <span class="ob-msg-time">{{ timeText }}</span>
        <span v-if="message.id" class="ob-msg-action" title="丢弃此消息及之后的记录，重新提问" @click="$emit('truncate')">
          <svg-icon icon-class="refresh-left" /> 重新提问
        </span>
        <span v-if="message.id" class="ob-msg-action" title="以此为分叉点创建分支会话（当前会话保留）" @click="$emit('branch')">
          <svg-icon icon-class="share" /> 创建分支
        </span>
      </div>
    </div>
  </div>
</template>

<script>
// OmniBuddy 对话消息气泡（用户纯文本 / 助手 Markdown + 深度思考区 + 流式光标 + meta 行）
import { renderMarkdown } from '@/utils/markdown'
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
  computed: {
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
    // 消息时间（今天 HH:mm，更早 MM-dd HH:mm）
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
      const now = new Date()
      const pad = x => String(x).padStart(2, '0')
      const hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
      if (d.toDateString() === now.toDateString()) return hm
      return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + hm
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
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
  user-select: text;
}

/* 用户消息图片附件缩略图（气泡内文字上方） */
.ob-msg-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;

  &:empty { margin-bottom: 0; }
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

  /* 与深度思考区头部一致的星形图标（静态） */
  .ob-think-hico {
    font-size: 12px;
    margin-right: 3px;
    color: var(--primary-color);
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

/* 用户消息 hover 操作：绝对定位在气泡外下方，不占文档流（避免气泡多余空行） */
.ob-msg-actions {
  position: absolute;
  top: calc(100% + 3px);
  right: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0;
  pointer-events: none;
  z-index: 2;
  transition: opacity 0.15s ease;
}

/* 用户消息时间（hover 与操作一起浮现） */
.ob-msg-time {
  font-size: 11px;
  color: var(--text-secondary);
  user-select: none;
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

.ob-meta-copy {
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

.ob-msg.user:hover .ob-msg-actions {
  opacity: 1;
  pointer-events: auto;
}

.ob-msg.user .ob-msg-action {
  color: rgba(255, 255, 255, 0.72);

  &:hover {
    color: #fff;
  }
}

.ob-msg-action {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;

  .svg-icon {
    font-size: 12px;
  }

  &:hover {
    color: var(--primary-color);
  }
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
