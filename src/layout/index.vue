<template>
  <div class="layout-container">
    <!-- 侧边栏 -->
    <Sidebar :collapsed="collapsed" />

    <!-- 右侧主区域 -->
    <div class="layout-main">
      <!-- 顶部页签行（参考 Buddy：移除搜索顶栏，页签直接置顶；
           页签本体/设置钮可点，空白处可拖动窗口） -->
      <div class="layout-tags-row">
        <TagsBar side="deck" class="layout-tags-row-bar" />
        <div class="layout-tags-row-actions">
          <global-topbar-actions />
        </div>
      </div>

      <!-- 内容区：路由切换淡入 + 上浮过渡 -->
      <div class="layout-content">
        <transition name="page" mode="out-in">
          <keep-alive>
            <router-view :key="deckTabKey" />
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
import TagsBar from '@/components/common/TagsBar.vue'
import GlobalTopbarActions from '@/components/common/GlobalTopbarActions.vue'
import { getShortcut, matchesShortcut } from '@/utils/shortcuts'

export default {
  name: 'Layout',
  components: { Sidebar, TagsBar, GlobalTopbarActions },
  computed: {
    collapsed() {
      return this.$store.state.sidebarCollapsed
    },
    toggleLeft() {
      return this.collapsed ? '46px' : '200px'
    },
    // 页签缓存 key：keep-alive 以 vnode.key 缓存，每个页签独立一份组件实例
    // （同组件多实例并存，如同时打开两只基金详情页签）
    deckTabKey() {
      return this.$store.getters['tagsView/keyOf']('deck', this.$route.fullPath)
    }
  },
  mounted() {
    // Deck 视图全局搜索快捷键：打开「快捷搜索」页签并唤起搜索面板
    document.addEventListener('keydown', this.handleKeydown)
  },
  beforeDestroy() {
    document.removeEventListener('keydown', this.handleKeydown)
  },
  methods: {
    toggleSidebar() {
      this.$store.commit('TOGGLE_SIDEBAR')
    },
    // ⌘OK / Ctrl+O+K（可在设置页改键）：跳转搜索页签（首次由页面 mounted 自动弹面板），
    // 已在页签时通过事件让缓存的页面实例重新唤起
    handleKeydown(e) {
      if (matchesShortcut(e, getShortcut('search'))) {
        e.preventDefault()
        if (this.$route.path !== '/search') {
          this.$router.push('/search').catch(() => {})
        }
        this.$root.$emit('deck:search-open')
      }
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

/* ===== 主区顶部页签行（参考 Buddy：移除搜索顶栏，页签置顶） =====
   页签本体/设置钮可点（no-drag），空白处可拖动窗口 */
.layout-tags-row {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

/* 页签栏占满行内剩余宽度 */
.layout-tags-row-bar {
  flex: 1;
  min-width: 0;
}

/* 右侧：齿轮 + Windows 窗口控制贴窗口右缘，与 Buddy 页签行同位 */
.layout-tags-row-actions {
  display: flex;
  align-items: center;
  padding: 0 10px 0 2px;
  background: $content-bg;
  border-bottom: 1px solid $border-color;
  -webkit-app-region: no-drag;
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