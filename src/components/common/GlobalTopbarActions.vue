<template>
  <!-- 全局设置入口：两视图顶栏右上角同位复用（no-drag，顶栏其余区域可拖动窗口） -->
  <div
    class="global-topbar-actions"
    :class="{ active: isActive }"
    title="设置"
    @click="goSettings"
  >
    <svg-icon icon-class="settings" class="gta-icon" />
  </div>
</template>

<script>
export default {
  name: 'GlobalTopbarActions',
  computed: {
    // 当前处于 Buddy 视图时，设置页也走 Buddy 布局（保持视图上下文）
    isBuddy() {
      return this.$route.path.startsWith('/omnibuddy')
    },
    isActive() {
      return this.$route.name === 'Settings' || this.$route.name === 'OmniBuddySettings'
    }
  },
  methods: {
    goSettings() {
      const name = this.isBuddy ? 'OmniBuddySettings' : 'Settings'
      if (this.$route.name !== name) {
        this.$router.push({ name }).catch(() => {})
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.global-topbar-actions {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: $radius-base;
  color: var(--text-secondary, #666);
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: background-color 0.15s ease, color 0.15s ease;

  .gta-icon {
    width: 16px;
    height: 16px;
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
</style>
