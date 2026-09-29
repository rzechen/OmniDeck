<template>
  <!-- 顶栏右上角通用操作：全局设置入口 + Windows 窗口控制按钮（macOS 用系统红绿灯，不渲染）。
       两视图（Deck/Buddy）页签行尾部同位复用 -->
  <div class="global-topbar-actions">
    <div
      class="gta-btn"
      title="刷新页面"
      @click="reloadPage"
    >
      <svg-icon icon-class="refresh-left" class="gta-icon" :class="{ spinning: reloading }" />
    </div>

    <div
      class="gta-btn"
      :class="{ active: isActive }"
      title="设置"
      @click="goSettings"
    >
      <svg-icon icon-class="settings" class="gta-icon" />
    </div>

    <!-- Windows 无边框窗口自绘控制（自 Deck Topbar 迁入） -->
    <div v-if="isWindows" class="win-controls">
      <button class="wc-btn" title="最小化" @click="winMinimize">
        <span class="wc-glyph wc-min"></span>
      </button>
      <button class="wc-btn" :title="winMaximized ? '还原' : '最大化'" @click="winToggleMax">
        <span class="wc-glyph" :class="winMaximized ? 'wc-restore' : 'wc-max'"></span>
      </button>
      <button class="wc-btn wc-close" title="关闭" @click="winClose">
        <span class="wc-glyph wc-x"></span>
      </button>
    </div>
  </div>
</template>

<script>
export default {
  name: 'GlobalTopbarActions',
  data() {
    return {
      // Windows 无边框窗口控制（macOS 走系统红绿灯）
      isWindows: !!(window.electronAPI && window.electronAPI.platform === 'win32'),
      winMaximized: false,
      // 刷新按钮旋转动画状态（重载前短暂旋转反馈）
      reloading: false
    }
  },
  computed: {
    // 当前处于 Buddy 视图时，设置页也走 Buddy 布局（保持视图上下文）
    isBuddy() {
      return this.$route.path.startsWith('/omnibuddy')
    },
    isActive() {
      return this.$route.name === 'Settings' || this.$route.name === 'OmniBuddySettings'
    }
  },
  mounted() {
    // Windows：同步初始最大化状态 + 监听变化切换按钮图标
    if (this.isWindows && window.electronAPI.winControl) {
      window.electronAPI.winControl.isMaximized().then(v => {
        this.winMaximized = v
      })
      this.offMaximized = window.electronAPI.winControl.onMaximizedChanged(v => {
        this.winMaximized = v
      })
    }
  },
  beforeUnmount() {
    if (this.offMaximized) this.offMaximized()
  },
  methods: {
    // 刷新当前页面（重载渲染进程，与设置页「重载界面」一致）
    reloadPage() {
      if (this.reloading) return
      this.reloading = true
      setTimeout(() => location.reload(), 200)
    },
    goSettings() {
      const name = this.isBuddy ? 'OmniBuddySettings' : 'Settings'
      if (this.$route.name !== name) {
        this.$router.push({ name }).catch(() => {})
      }
    },
    // ===== Windows 窗口控制 =====
    winMinimize() {
      window.electronAPI.winControl.minimize()
    },
    winToggleMax() {
      window.electronAPI.winControl.toggleMaximize()
    },
    winClose() {
      window.electronAPI.winControl.close()
    }
  }
}
</script>

<style lang="scss" scoped>
.global-topbar-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  -webkit-app-region: no-drag;
}

/* 图标按钮（刷新 / 设置）通用样式 */
.gta-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: $radius-base;
  color: var(--text-secondary, #666);
  cursor: pointer;
  transition: background-color 0.15s ease, color 0.15s ease;

  .gta-icon {
    width: 16px;
    height: 16px;
  }

  /* 刷新点击：旋转一圈反馈（重载即中断，动画仅作瞬时动效） */
  .gta-icon.spinning {
    animation: gta-spin 0.6s linear infinite;
  }

  &:hover {
    background: var(--nav-hover-bg, rgba(128, 128, 128, 0.12));
    color: var(--text-primary, #333);
  }

  &.active {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.12);
  }
}

@keyframes gta-spin {
  to {
    transform: rotate(360deg);
  }
}

/* Windows 窗口控制按钮（无边框窗口自绘，macOS 风格细线图标）：
   贴窗口右缘（外层 actions 区右内边距 10px，此处负 margin 抵消） */
.win-controls {
  display: flex;
  align-items: stretch;
  height: 36px;
  margin-right: -10px;
  margin-left: 6px;
}

.wc-btn {
  width: 44px;
  height: 100%;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease;

  &:hover {
    background: var(--search-bg-hover);
  }

  &:active {
    background: var(--search-bg);
  }
}

.wc-close:hover {
  background: #E5484D;

  .wc-glyph {
    background: #fff;
    border-color: #fff;
  }

  .wc-glyph::before,
  .wc-glyph::after {
    background: #fff;
  }
}

/* 细线字形：用 span + CSS 绘制，避免位图缩放模糊 */
.wc-glyph {
  position: relative;
  display: block;
}

.wc-min {
  width: 10px;
  height: 1px;
  background: var(--text-primary, #333);
}

.wc-max {
  width: 9px;
  height: 9px;
  border: 1px solid var(--text-primary, #333);
  border-top-width: 2.5px;
}

/* 还原：两个叠加的小方块 */
.wc-restore {
  width: 8px;
  height: 8px;
  border: 1px solid var(--text-primary, #333);

  &::before {
    content: '';
    position: absolute;
    left: 2.5px;
    top: 2.5px;
    width: 8px;
    height: 8px;
    border: 1px solid var(--text-primary, #333);
    border-top-width: 2.5px;
    background: var(--content-bg, #fff);
  }
}

/* 关闭 ×：两条旋转的细线 */
.wc-x {
  width: 11px;
  height: 11px;

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 5px;
    width: 11px;
    height: 1px;
    background: var(--text-primary, #333);
    transition: background 0.12s ease;
  }

  &::before {
    transform: rotate(45deg);
  }

  &::after {
    transform: rotate(-45deg);
  }
}
</style>
