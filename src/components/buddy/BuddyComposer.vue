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
            <svg-icon icon-class="circle-plus-outline" />
          </button>
        </div>

        <!-- 发送 / 停止：同一位置，流式生成时切换为停止 -->
        <button
          v-if="!streaming"
          class="bc-send"
          :class="{ ready: canSend }"
          :title="canSend ? '发送（Enter）' : '输入内容后发送'"
          @click="onSend"
        >
          <svg-icon icon-class="top" />
        </button>
        <button
          v-else
          class="bc-send bc-stop"
          title="停止生成"
          @click="$emit('stop')"
        >
          <svg-icon icon-class="video-pause" />
        </button>
      </div>
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
      default: '有什么可以帮您？（Enter 发送，Shift+Enter 换行）'
    },
    // 流式生成中：发送按钮切换为停止按钮
    streaming: {
      type: Boolean,
      default: false
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
.bc-composer {
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
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
    border-color: rgba(var(--primary-color-rgb), 0.55);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.12), 0 4px 18px rgba(var(--primary-color-rgb), 0.1);
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

  .svg-icon {
    font-size: 16px;
  }

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.08);
    color: var(--primary-color);
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

  .svg-icon {
    font-size: 15px;
  }

  &.ready {
    background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
    color: #fff;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(var(--primary-color-rgb), 0.35);

    &:hover {
      filter: brightness(1.08);
      transform: translateY(-1px);
    }

    &:active {
      transform: scale(0.88);
    }
  }
}

/* 停止按钮：与发送按钮同位切换，激活渐变外观 */
.bc-stop {
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  color: #fff;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(var(--primary-color-rgb), 0.35);

  .svg-icon {
    font-size: 14px;
  }

  &:hover {
    filter: brightness(1.08);
  }

  &:active {
    transform: scale(0.88);
  }
}
</style>
