<template>
  <div class="bc-composer">
    <!-- 输入容器：豆包风格大圆角气泡 -->
    <div class="bc-box" :class="{ focus: isFocus }">
      <!-- 多行输入：自动增高 -->
      <textarea
        ref="ta"
        class="bc-textarea"
        :value="value"
        :placeholder="placeholder"
        rows="1"
        @input="onInput"
        @focus="isFocus = true"
        @blur="isFocus = false"
        @keydown.enter.exact.prevent="onSend"
      ></textarea>

      <!-- 底部工具栏：左扩展（工作空间/模型选择等经插槽注入） + 右发送 -->
      <div class="bc-toolbar">
        <div class="bc-tools">
          <slot name="tools"></slot>
          <button class="bc-tool-btn" title="附件（规划中）" @click="todoHint">
            <i class="el-icon-circle-plus-outline"></i>
          </button>
        </div>

        <button
          class="bc-send"
          :class="{ ready: canSend }"
          :title="canSend ? '发送（Enter）' : '输入内容后发送'"
          @click="onSend"
        >
          <i class="el-icon-top"></i>
        </button>
      </div>
    </div>

    <!-- 提示行 -->
    <div class="bc-hint">
      <span class="bc-hint-keys"><kbd>Enter</kbd> 发送 <kbd>Shift+Enter</kbd> 换行</span>
      <span class="bc-hint-privacy"><i class="el-icon-lock"></i>内容仅保存在本机</span>
    </div>
  </div>
</template>

<script>
// OmniBuddy 对话输入框：豆包风格（大圆角气泡 + 左工具 + 右下圆形发送）
export default {
  name: 'BuddyComposer',
  props: {
    value: {
      type: String,
      default: ''
    },
    placeholder: {
      type: String,
      default: '有什么可以帮您？'
    }
  },
  data() {
    return {
      isFocus: false
    }
  },
  computed: {
    canSend() {
      return !!this.value.trim()
    }
  },
  watch: {
    // 内容变化后自适应高度
    value() {
      this.$nextTick(this.autoResize)
    }
  },
  mounted() {
    this.autoResize()
  },
  methods: {
    onInput(e) {
      this.$emit('input', e.target.value)
    },
    onSend() {
      if (!this.canSend) return
      this.$emit('send', this.value)
    },
    // 高度自适应：清零后按 scrollHeight 恢复，封顶 220px
    autoResize() {
      const ta = this.$refs.ta
      if (!ta) return
      ta.style.height = 'auto'
      ta.style.height = Math.max(68, Math.min(ta.scrollHeight, 220)) + 'px'
    },
    todoHint() {
      this.$message.info('该能力规划中，敬请期待')
    }
  }
}
</script>

<style lang="scss" scoped>
$ob-accent: #722ED1;

.bc-composer {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 输入容器：悬浮卡片式大圆角气泡 */
.bc-box {
  border-radius: 22px;
  border: 1px solid var(--border-color);
  background: var(--card-bg, #fff);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  padding: 12px 12px 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;

  &.focus {
    border-color: rgba(114, 46, 209, 0.55);
    box-shadow: 0 0 0 3px rgba(114, 46, 209, 0.12), 0 4px 18px rgba(114, 46, 209, 0.1);
  }
}

.bc-textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-primary);
  font-family: inherit;
  min-height: 22px;
  max-height: 160px;
  overflow-y: auto;

  &::placeholder {
    color: var(--text-secondary);
  }

  &::-webkit-scrollbar {
    width: 4px;
  }
}

/* 底部工具栏 */
.bc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bc-tools {
  display: flex;
  align-items: center;
  gap: 2px;
}

.bc-tool-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  i {
    font-size: 16px;
  }

  &:hover {
    background: rgba(114, 46, 209, 0.08);
    color: $ob-accent;
  }

  &:active {
    transform: scale(0.9);
  }
}

/* 发送按钮：圆形，激活渐变 */
.bc-send {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: var(--border-color, #e5e5e5);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);

  i {
    font-size: 15px;
    font-weight: 700;
  }

  &.ready {
    background: linear-gradient(135deg, #9254DE, $ob-accent);
    color: #fff;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(114, 46, 209, 0.35);

    &:hover {
      filter: brightness(1.08);
      transform: translateY(-1px);
    }

    &:active {
      transform: scale(0.88);
    }
  }
}

/* 提示行 */
.bc-hint {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 6px;

  kbd {
    font-family: 'SF Mono', Menlo, monospace;
    font-size: 10px;
    color: var(--text-secondary);
    background: var(--search-bg);
    border: 1px solid var(--border-color);
    border-radius: 4px;
    padding: 0 4px;
    line-height: 1.5;
  }
}

.bc-hint-keys {
  font-size: 11px;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.bc-hint-privacy {
  font-size: 11px;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  gap: 4px;

  i {
    font-size: 12px;
  }
}
</style>
