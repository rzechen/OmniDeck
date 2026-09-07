<template>
  <div class="layout-container">
    <!-- 侧边栏 -->
    <Sidebar :collapsed="collapsed" />

    <!-- 右侧主区域 -->
    <div class="layout-main">
      <!-- 顶部栏 -->
      <Topbar />

      <!-- 内容区：路由切换淡入 + 上浮过渡 -->
      <div class="layout-content">
        <transition name="page" mode="out-in">
          <keep-alive>
            <router-view />
          </keep-alive>
        </transition>
      </div>
    </div>

    <!-- 侧边栏收起/展开按钮：展开态显示「«」提示收起，收起态显示「»」提示展开 -->
    <div
      class="sidebar-toggle"
      :class="{ 'is-collapsed': collapsed }"
      :style="{ left: toggleLeft }"
      @click="toggleSidebar"
      title="切换侧边栏"
    >
      <svg-icon :icon-class="collapsed ? 'expand' : 'fold'" class="toggle-icon" />
    </div>
  </div>
</template>

<script>
import Sidebar from './components/Sidebar.vue'
import Topbar from './components/Topbar.vue'

export default {
  name: 'Layout',
  components: { Sidebar, Topbar },
  computed: {
    collapsed() {
      return this.$store.state.sidebarCollapsed
    },
    toggleLeft() {
      return this.collapsed ? '46px' : '200px'
    }
  },
  methods: {
    toggleSidebar() {
      this.$store.commit('TOGGLE_SIDEBAR')
    }
  }
}
</script>

<style lang="scss" scoped>
.layout-container {
  display: flex;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.layout-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

// 侧边栏折叠按钮（优化视觉与微交互）
.sidebar-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
  width: 16px;
  height: 48px;
  border-radius: 0 8px 8px 0;
  
  /* 现代毛玻璃与软阴影效果 */
  background: var(--toggle-bg, rgba(255, 255, 255, 0.88));
  backdrop-filter: blur(8px);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06), 1px 0 0 rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-left: none;
  
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: no-drag;

  .toggle-icon {
    width: 12px;
    height: 12px;
    transition: opacity 0.2s ease;
    opacity: 0.45;
  }

  /* Hover 悬停精致化 */
  &:hover {
    width: 20px; /* 悬停时稍微展开，增强点击欲望 */
    background: var(--card-bg, #ffffff);
    box-shadow: 3px 0 12px rgba(0, 0, 0, 0.1), 1px 0 0 rgba(0, 0, 0, 0.08);

    .toggle-icon {
      opacity: 0.85;
      transform: scale(1.1);
    }
  }

  /* Active 点击反馈 */
  &:active {
    transform: translateY(-50%) scale(0.92);
    background: $search-bg-hover;
  }
}

.layout-content {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  background: $content-bg;
  position: relative;
  // 内容区不可拖动窗口（拖动请用顶栏/侧边栏空白），也不可划选文本
  -webkit-app-region: no-drag;
  user-select: none;

  // 输入框、代码块保留文本选择（scoped 样式无法穿透子组件，需 ::v-deep）
  ::v-deep input,
  ::v-deep textarea,
  ::v-deep [contenteditable],
  ::v-deep pre,
  ::v-deep code {
    -webkit-user-select: text;
    user-select: text;
  }
}
</style>