<template>
  <!-- ask_user 提问卡片：选项 chips（单选即点即提交 / 多选勾选后统一提交）+ 「其它」自由输入 -->
  <div class="ob-ask-card">
    <div class="ob-ask-question">
      <img src="@/assets/logo.png" alt="OmniBuddy" class="ob-ask-logo" />
      <span>{{ message.question }}</span>
    </div>

    <!-- 已回答：展示答案 -->
    <div v-if="message.answered || message.answer" class="ob-ask-answer">
      <svg-icon icon-class="user-solid" />
      {{ message.answer || '（未作答）' }}
    </div>

    <!-- 待回答表单 -->
    <div v-else class="ob-ask-form">
      <!-- 选项 chips + 固定「其它」项 -->
      <div v-if="message.options && message.options.length" class="ob-ask-opts">
        <span
          v-for="opt in message.options"
          :key="opt"
          class="ob-ask-chip"
          :class="{ on: isPicked(opt) }"
          @click="toggleOpt(opt)"
        >{{ opt }}</span>
        <span class="ob-ask-chip other" :class="{ on: otherOpen }" @click="toggleOther">
          <svg-icon icon-class="edit" class="ob-ask-other-ico" />
          <span>其它</span>
        </span>
      </div>

      <!-- 「其它」输入行：点开「其它」才出现（无候选时默认展开），与选项选择互斥 -->
      <div v-if="otherOpen" class="ob-ask-other">
        <input
          ref="otherInput"
          v-model="message._input"
          class="ob-ask-input"
          type="text"
          placeholder="输入你的回答…"
          @keydown.enter.prevent="submitOther"
        />
        <button class="ob-ask-send" title="发送回答" @click="submitOther">
          <svg-icon icon-class="promotion" />
        </button>
      </div>

      <!-- 多选：勾选多项后统一提交 -->
      <div v-if="multiSelect" class="ob-ask-submit-row">
        <span class="ob-ask-multi-hint">可多选</span>
        <button class="ob-ask-submit" :disabled="!canSubmitMulti" @click="submitMulti">
          提交{{ pickedCount ? '（' + pickedCount + '）' : '' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script>
// OmniBuddy ask_user 提问卡片（Agent 中途向用户提问）
// 单选（默认）：点选项即提交，与「其它」输入互斥（点选项收起输入行）
// 多选（multiSelect）：chips 勾选 toggle + 「其它」文本并入，统一提交（选项以「；」连接）
// 交互临时态（_picked/_otherOpen/_input）挂在消息对象上：切页签/组件重建不丢
export default {
  name: 'AskUserCard',
  props: {
    message: {
      type: Object,
      required: true
    }
  },
  computed: {
    multiSelect() {
      return !!this.message.multiSelect
    },
    otherOpen() {
      return !!this.message._otherOpen
    },
    picked() {
      return this.message._picked || []
    },
    // 多选提交计数：已勾选项 + 其它输入文本（非空时）
    pickedCount() {
      let n = this.picked.length
      if (this.otherOpen && String(this.message._input || '').trim()) n++
      return n
    },
    canSubmitMulti() {
      return this.pickedCount > 0
    }
  },
  created() {
    // 交互临时态初始化：无候选选项时「其它」输入行默认展开
    if (!Array.isArray(this.message._picked)) this.$set(this.message, '_picked', [])
    if (typeof this.message._otherOpen !== 'boolean') {
      this.$set(this.message, '_otherOpen', !(this.message.options && this.message.options.length))
    }
  },
  methods: {
    isPicked(opt) {
      return this.picked.indexOf(opt) >= 0
    },
    // 点普通选项：单选直接提交（与「其它」互斥，收起输入行）；多选 toggle 勾选
    toggleOpt(opt) {
      if (this.multiSelect) {
        const i = this.picked.indexOf(opt)
        const next = this.picked.slice()
        if (i >= 0) next.splice(i, 1)
        else next.push(opt)
        this.message._picked = next
        return
      }
      this.message._otherOpen = false
      this.$emit('answer', this.message, opt)
    },
    // 点「其它」：展开/收起输入行（收起时清空草稿；与选项选择互斥）
    toggleOther() {
      const open = !this.otherOpen
      this.message._otherOpen = open
      if (open) {
        this.$nextTick(() => {
          const el = this.$refs.otherInput
          if (el) el.focus()
        })
      } else {
        this.message._input = ''
      }
    },
    // 「其它」输入提交：单选直接提交文本；多选并入已勾选项统一提交
    submitOther() {
      const text = String(this.message._input || '').trim()
      if (!text) return
      if (this.multiSelect) {
        this.$emit('answer', this.message, this.picked.concat([text]).join('；'))
      } else {
        this.$emit('answer', this.message, text)
      }
    },
    // 多选统一提交：勾选项 + 其它文本（以「；」连接）
    submitMulti() {
      if (!this.canSubmitMulti) return
      const parts = this.picked.slice()
      const text = String(this.message._input || '').trim()
      if (this.otherOpen && text) parts.push(text)
      this.$emit('answer', this.message, parts.join('；'))
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-ask-card {
  border: 1px solid rgba(var(--primary-color-rgb), 0.35);
  border-radius: 12px;
  background: rgba(var(--primary-color-rgb), 0.05);
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

  // 品牌 logo（宽扁异形，contain 原比例呈现）
  .ob-ask-logo {
    width: 16px;
    height: 16px;
    object-fit: contain;
    flex-shrink: 0;
    margin-top: 2px;
  }
}

.ob-ask-form {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 9px;
}

/* 选项 chips + 「其它」 */
.ob-ask-opts {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.ob-ask-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 13px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--card-bg, #fff);
  font-size: 12.5px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.13s ease;
  user-select: none;

  .ob-ask-other-ico {
    font-size: 11px;
    opacity: 0.7;
  }

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.05);
  }

  /* 勾选/激活态：主色底白字 */
  &.on {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: #fff;

    .ob-ask-other-ico {
      opacity: 0.9;
    }
  }

  &:active {
    transform: scale(0.96);
  }
}

/* 「其它」输入行（独立行） */
.ob-ask-other {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ob-ask-input {
  flex: 1;
  min-width: 0;
  height: 32px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: var(--card-bg, #fff);
  padding: 0 14px;
  font-size: 12.5px;
  color: var(--text-primary);
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &::placeholder {
    color: var(--text-secondary);
  }

  &:focus {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
  }
}

/* 圆形发送按钮：与对话输入框发送钮同款渐变（缩小版） */
.ob-ask-send {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: none;
  border-radius: 50%;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.35);
  cursor: pointer;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 13px;
  }

  &:hover {
    filter: brightness(1.08);
  }

  &:active {
    transform: scale(0.9);
  }
}

/* 多选提交行 */
.ob-ask-submit-row {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.ob-ask-multi-hint {
  font-size: 11px;
  color: var(--text-secondary);
}

.ob-ask-submit {
  border: none;
  border-radius: 999px;
  padding: 5px 16px;
  font-size: 12.5px;
  font-weight: 600;
  color: #fff;
  background: var(--primary-color);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    background: var(--primary-color-hover);
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

.ob-ask-answer {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-secondary);
  word-break: break-word;

  .svg-icon {
    color: var(--primary-color);
  }
}
</style>
