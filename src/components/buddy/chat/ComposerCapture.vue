<template>
  <div class="cc-capture">
    <!-- 截屏 icon 钮：点按=选区截屏；旁附下拉箭头展开全屏/选区菜单 -->
    <button
      class="cc-btn"
      :title="capturing ? '正在截屏…' : '截取屏幕画面提问（点击框选区域）'"
      :disabled="capturing || disabled"
      @click="capture('area')"
    >
      <svg-icon :icon-class="capturing ? 'loading' : 'capture'" :class="{ rotating: capturing }" />
    </button>

    <button
      class="cc-arrow"
      title="选择截屏方式"
      :disabled="capturing || disabled"
      @click.stop="toggleMenu"
    >
      <svg-icon icon-class="arrow-down" />
    </button>

    <!-- 截屏方式菜单（点外部收起由父级 onDocMouseDown .ob-select 逻辑类比，这里自监听） -->
    <transition name="cc-menu">
      <div v-if="menuVisible" class="cc-menu">
        <button class="cc-menu-item" @click="pick('area')">
          <svg-icon icon-class="crop" />
          <span>选区截屏</span>
          <span class="cc-menu-desc">框选任意区域</span>
        </button>
        <button class="cc-menu-item" @click="pick('full')">
          <svg-icon icon-class="monitor" />
          <span>全屏截屏</span>
          <span class="cc-menu-desc">当前光标所在屏</span>
        </button>
      </div>
    </transition>
  </div>
</template>

<script>
// 截屏按钮（P0-M3/M4）：点按默认选区截屏（覆盖窗框选），
// 下拉箭头可切换全屏；权限缺失时引导用户去系统设置。
export default {
  name: 'ComposerCapture',
  props: {
    // 流式生成中禁用
    disabled: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      capturing: false,
      menuVisible: false
    }
  },
  mounted() {
    document.addEventListener('mousedown', this.onDocMouseDown)
  },
  beforeDestroy() {
    document.removeEventListener('mousedown', this.onDocMouseDown)
  },
  methods: {
    toggleMenu() {
      this.menuVisible = !this.menuVisible
    },
    onDocMouseDown(e) {
      if (!this.menuVisible) return
      if (e.target.closest('.cc-capture')) return
      this.menuVisible = false
    },
    pick(mode) {
      this.menuVisible = false
      this.capture(mode)
    },
    async capture(mode) {
      if (this.capturing || this.disabled) return
      const cap = window.electronAPI && window.electronAPI.capture
      if (!cap) {
        this.$message.info('截屏能力需要 OmniDeck 桌面端')
        return
      }
      // macOS 屏幕录制权限：未授权先引导（授权后需重启应用生效，提前说明）
      try {
        const st = await cap.status()
        if (!st.granted) {
          this.$confirm(
            'OmniDeck 需要「屏幕录制」权限才能截屏。前往系统设置开启后，需重启 OmniDeck 生效。',
            '屏幕权限未开启',
            { confirmButtonText: '去系统设置', cancelButtonText: '取消', type: 'warning' }
          ).then(() => cap.openPermissionSettings()).catch(() => {})
          return
        }
      } catch (e) { /* 状态查询失败按可尝试继续 */ }

      this.capturing = true
      try {
        const opts = { hideSelf: true }
        const res = mode === 'full'
          ? await cap.screen(opts)
          : await cap.area(opts)
        // 选区被取消不提示（正常交互）
        if (res.ok) {
          this.$emit('captured', res.image)
          return
        }
        if (res.reason === 'cancelled') return
        if (res.reason === 'permission') {
          this.$message.warning('屏幕权限未开启：请到系统设置 → 隐私与安全性 → 屏幕录制中授权')
        } else {
          this.$message.error(res.error || '截屏失败')
        }
      } finally {
        this.capturing = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
@keyframes cc-rotate {
  to { transform: rotate(360deg); }
}

.cc-capture {
  display: inline-flex;
  align-items: center;
  position: relative;
}

.rotating {
  animation: cc-rotate 1s linear infinite;
}

/* 与 BuddyComposer 工具栏按钮（.bc-tool-btn）同款风格：透明底幽灵钮 */
.cc-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 9px 0 0 9px;
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

  &:hover:not(:disabled) {
    background: rgba(var(--primary-color-rgb), 0.08);
    color: var(--primary-color);
  }

  &:active:not(:disabled) {
    transform: scale(0.9);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
}

/* 下拉箭头：拼在主钮右侧 */
.cc-arrow {
  width: 14px;
  height: 28px;
  border: none;
  border-radius: 0 9px 9px 0;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 10px;
  }

  &:hover:not(:disabled) {
    background: rgba(var(--primary-color-rgb), 0.08);
    color: var(--primary-color);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }
}

/* 方式菜单：向上弹出（工具栏在输入框下方） */
.cc-menu {
  position: absolute;
  bottom: calc(100% + 6px);
  left: 0;
  min-width: 190px;
  padding: 4px;
  border-radius: 12px;
  background: var(--bg-primary, #fff);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.14);
  z-index: 30;
}

.cc-menu-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 12.5px;
  font-family: inherit;
  text-align: left;
  cursor: pointer;

  .svg-icon {
    font-size: 14px;
    color: var(--text-secondary);
  }

  .cc-menu-desc {
    margin-left: auto;
    font-size: 11px;
    color: var(--text-secondary);
    opacity: 0.8;
  }

  &:hover {
    background: var(--search-bg, rgba(0, 0, 0, 0.05));
  }
}

.cc-menu-enter-active,
.cc-menu-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.cc-menu-enter,
.cc-menu-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
</style>
