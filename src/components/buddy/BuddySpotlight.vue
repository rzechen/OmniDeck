<template>
  <transition name="buddy-spot">
    <div v-if="visible" class="buddy-overlay" @click.self="close">
      <div class="buddy-card">
        <!-- 头部：标识 + TODO 徽标 -->
        <div class="buddy-head">
          <span class="buddy-logo">
            <img src="@/assets/logo.png" alt="OmniBuddy" class="buddy-logo-img" />
          </span>
          <span class="buddy-name">OmniBuddy</span>
          <span class="buddy-todo">TODO</span>
          <span class="buddy-kbd">esc</span>
        </div>

        <!-- 输入区（占位骨架：可输入，发送提示规划中） -->
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
          <button class="buddy-send" :class="{ ready: !!draft.trim() }" @click="send">
            <svg-icon icon-class="promotion" />
          </button>
        </div>

        <!-- 底部提示 -->
        <div class="buddy-foot">
          <span class="buddy-hint"><svg-icon icon-class="clock" />对话能力规划中，敬请期待</span>
          <span class="buddy-link" @click="openBuddySettings">配置模型 ›</span>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
// OmniBuddy 快速唤起浮窗（可配置快捷键，默认 ⌘⌥J / Ctrl+Alt+J）
// 占位骨架：输入与快捷键链路先立起来，对话能力接入后填充流式渲染
import { getShortcut, matchesShortcut } from '@/utils/shortcuts'

export default {
  name: 'BuddySpotlight',
  data() {
    return {
      visible: false,
      draft: ''
    }
  },
  mounted() {
    document.addEventListener('keydown', this.handleKeydown)
  },
  beforeDestroy() {
    document.removeEventListener('keydown', this.handleKeydown)
  },
  methods: {
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
    open() {
      this.visible = true
      this.draft = ''
      this.$nextTick(() => {
        if (this.$refs.buddyInput) this.$refs.buddyInput.focus()
      })
    },
    close() {
      this.visible = false
    },
    send() {
      if (!this.draft.trim()) return
      this.draft = ''
      this.$message.info('OmniBuddy 对话能力规划中，敬请期待')
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

.buddy-todo {
  font-size: 8.5px;
  font-weight: 800;
  letter-spacing: 0.5px;
  color: #D46B08;
  background: rgba(250, 173, 20, 0.15);
  border: 1px solid rgba(250, 173, 20, 0.4);
  padding: 1px 6px;
  border-radius: 999px;
  line-height: 1.4;
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

/* 输入区 */
.buddy-input-wrap {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 14px 12px;
  padding: 9px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: var(--search-bg, rgba(0, 0, 0, 0.04));
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

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
}

/* 底部 */
.buddy-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 16px 12px;
}

.buddy-hint {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-secondary);

  .svg-icon {
    font-size: 12px;
  }
}

.buddy-link {
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
