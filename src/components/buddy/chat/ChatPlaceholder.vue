<template>
  <!-- 空会话欢迎占位（垂直水平居中）：模式切换大胶囊 + slogan -->
  <div class="ob-placeholder">
    <div class="ob-icon">
      <svg-icon icon-class="buddy" class="ob-svg" />
    </div>
    <div class="ob-hi">{{ mode === 'coding' ? '编程助手已就绪' : '有什么可以帮您？' }}</div>

    <!-- 模式切换大胶囊（滑块式分段控件） -->
    <div class="ob-mode-pill">
      <div class="ob-mode-slider" :style="{ transform: 'translateX(' + (mode === 'coding' ? '100%' : '0') + ')' }"></div>
      <button type="button" class="ob-mode-btn" :class="{ active: mode !== 'coding' }" @click="selectMode('work')">
        工作
      </button>
      <button type="button" class="ob-mode-btn" :class="{ active: mode === 'coding' }" @click="selectMode('coding')">
        Coding
      </button>
    </div>

    <!-- 模式 slogan -->
    <div class="ob-desc">{{ modeDesc }}</div>
  </div>
</template>

<script>
// OmniBuddy 对话空态欢迎占位：模式切换 + 模式 slogan
// 模式切换对齐参考项目 HomePage 的胶囊分段控件（滑块动画）

// 模式 slogan（随模式切换）
const MODE_DESC = {
  work: '智能工作助手，随时为您答疑解惑',
  coding: '智能编程助手，助您高效完成开发任务'
}

export default {
  name: 'ChatPlaceholder',
  props: {
    // 对话模式（'work' 工作模式 / 'coding' Coding 模式）
    mode: {
      type: String,
      default: 'work'
    }
  },
  computed: {
    // 模式 slogan
    modeDesc() {
      return MODE_DESC[this.mode] || MODE_DESC.work
    }
  },
  methods: {
    selectMode(m) {
      if (this.mode !== m) this.$emit('set-mode', m)
    }
  }
}
</script>

<style lang="scss" scoped>
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
  background: linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.16), rgba(var(--primary-color-rgb), 0.05));
  border: 1px solid rgba(var(--primary-color-rgb), 0.3);
  display: flex;
  align-items: center;
  justify-content: center;

  .ob-svg {
    width: 32px;
    height: 32px;
    color: var(--primary-color);
  }
}

.ob-hi {
  margin-top: 4px;
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary);
}

/* ===== 模式切换大胶囊（滑块式分段控件） ===== */
.ob-mode-pill {
  position: relative;
  margin-top: 6px;
  height: 46px;
  padding: 4px;
  border-radius: 100px;
  background: var(--search-bg, rgba(0, 0, 0, 0.05));
  display: inline-flex;
  align-items: stretch;
  user-select: none;
}

/* 滑块：绝对定位，Coding 态右移 100% */
.ob-mode-slider {
  position: absolute;
  left: 4px;
  top: 4px;
  width: calc(50% - 4px);
  height: calc(100% - 8px);
  border-radius: 100px;
  background: var(--card-bg, #fff);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04);
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 0;
}

.ob-mode-btn {
  position: relative;
  z-index: 1;
  min-width: 140px;
  padding: 0 32px;
  border: none;
  outline: none;
  background: transparent;
  border-radius: 100px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  transition: color 0.2s ease;

  &:hover:not(.active) {
    color: var(--text-primary);
  }

  &.active {
    color: var(--text-primary);
    font-weight: 600;
  }
}

/* 模式 slogan */
.ob-desc {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
