<template>
  <!-- 用户 / 助手消息（豆包风格：无头像，用户右侧气泡，助手左侧纯内容） -->
  <div class="ob-msg" :class="message.role">
    <div class="ob-msg-bubble">
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

      <!-- 助手：等待首个内容块的思考占位（秒计时） -->
      <div v-if="showThinkingPlaceholder" class="ob-thinking">
        思考中<span class="ob-thinking-sec">{{ message.seconds }}s</span>
      </div>
      <!-- 助手：正文 Markdown -->
      <div
        v-else-if="message.role === 'assistant' && message.content"
        class="ob-md"
        v-html="rendered"
      ></div>
      <template v-if="message.role === 'user'">{{ message.content }}</template>
      <span v-if="showCursor" class="ob-cursor"></span>
      <!-- 用户消息 hover：回退重发 / 创建分支 -->
      <div v-if="message.role === 'user' && !streaming && message.id" class="ob-msg-actions">
        <span class="ob-msg-action" title="丢弃此消息及之后的记录，重新提问" @click="$emit('truncate')">
          <svg-icon icon-class="refresh-left" /> 重新提问
        </span>
        <span class="ob-msg-action" title="以此为分叉点创建分支会话（当前会话保留）" @click="$emit('branch')">
          <svg-icon icon-class="share" /> 创建分支
        </span>
      </div>
    </div>
  </div>
</template>

<script>
// OmniBuddy 对话消息气泡（用户纯文本 / 助手 Markdown + 深度思考区 + 流式光标）
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
  gap: 10px;
  opacity: 0;
  pointer-events: none;
  z-index: 2;
  transition: opacity 0.15s ease;
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
