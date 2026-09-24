<template>
  <div v-if="tabs.length" class="tags-bar">
    <div class="tags-scroll">
      <div
        v-for="tab in tabs"
        :key="tab.uid"
        class="tags-item"
        :class="{ active: tab.fullPath === $route.fullPath }"
        :title="tab.title"
        @click="go(tab)"
        @auxclick="onAuxClick($event, tab)"
      >
        <svg-icon v-if="iconFor(tab)" :icon-class="iconFor(tab)" class="tags-ico" />
        <span class="tags-label">{{ tab.title }}</span>
        <span
          v-if="tabs.length > 1"
          class="tags-close"
          title="关闭页签"
          @click.stop="close(tab)"
        >
          <svg-icon icon-class="close" class="tags-close-ico" />
        </span>
      </div>
    </div>

    <!-- 更多操作：关闭其它 / 关闭全部（单页签时无意义，隐藏） -->
    <el-dropdown
      v-if="tabs.length > 1"
      trigger="click"
      placement="bottom-end"
      @command="onMoreCommand"
    >
      <span class="tags-more-btn" title="更多操作">
        <svg-icon icon-class="more" class="tags-more-ico" />
      </span>
      <el-dropdown-menu slot="dropdown">
        <el-dropdown-item command="others">关闭其它页签</el-dropdown-item>
        <el-dropdown-item command="all" divided>关闭全部页签</el-dropdown-item>
      </el-dropdown-menu>
    </el-dropdown>
  </div>
</template>

<script>
import {
  homeItem,
  favoriteItem,
  todoItem,
  clipboardItem,
  settingsItem,
  versionItem,
  feedbackItem,
  menuGroups
} from '@/config/tools'

// deck 侧路径 → 图标映射（来自菜单配置 @/config/tools，单一事实源：
// 固定入口 + 分组页 + 各工具页；/search 为快捷搜索页签补充项）
const deckIconMap = (() => {
  const map = { '/search': 'search' }
  ;[homeItem, favoriteItem, todoItem, clipboardItem, settingsItem, versionItem, feedbackItem].forEach(it => {
    if (it && it.path) map[it.path] = it.iconSvg
  })
  menuGroups.forEach(g => {
    if (g.path) map[g.path] = g.iconSvg
    ;(g.children || []).forEach(c => {
      if (c.path) map[c.path] = c.iconSvg || c.icon
    })
  })
  return map
})()

// buddy 侧路径 → 图标（与 BuddyLayout 菜单一致）
const buddyIconMap = {
  '/omnibuddy': 'chat-dot-round',
  '/omnibuddy/market': 'market',
  '/omnibuddy/skills': 'skill',
  '/omnibuddy/mcp': 'mcp',
  '/omnibuddy/rules': 'rules',
  '/omnibuddy/capabilities': 'tool',
  '/omnibuddy/permissions': 'key',
  '/omnibuddy/workspace': 'folder',
  '/omnibuddy/providers': 'llm',
  '/omnibuddy/usage': 'tickets',
  '/omnibuddy/settings': 'settings'
}

// 菜单多页签栏：点击菜单/卡片打开的页面登记为页签（登记逻辑在 router.afterEach）
// 点击页签切换、×/中键关闭；关闭当前页签时跳相邻页签（优先右侧），
// 全部关完回本侧首页（首页会作为新页签重新登记）
export default {
  name: 'TagsBar',
  props: {
    // 页签归属侧：'deck'（Layout）/ 'buddy'（BuddyLayout）
    side: { type: String, required: true }
  },
  computed: {
    tabs() {
      return (this.$store.state.tagsView && this.$store.state.tagsView[this.side]) || []
    }
  },
  watch: {
    // 切换页签后把激活项滚动进可视区（页签过多溢出时）
    '$route.fullPath'() {
      this.$nextTick(this.scrollActiveIntoView)
    }
  },
  mounted() {
    this.scrollActiveIntoView()
  },
  methods: {
    // 页签图标：先精确匹配路径，带参路由（如 /finance/fund/:code）逐级回退父路径
    iconFor(tab) {
      const map = this.side === 'buddy' ? buddyIconMap : deckIconMap
      if (map[tab.path]) return map[tab.path]
      if (this.side === 'deck') {
        const segs = tab.path.split('/')
        for (let i = segs.length - 1; i > 1; i--) {
          const p = segs.slice(0, i).join('/')
          if (map[p]) return map[p]
        }
      }
      return ''
    },
    go(tab) {
      if (this.$route.fullPath !== tab.fullPath) {
        this.$router.push(tab.fullPath).catch(() => {})
      }
    },
    // 中键关闭页签（浏览器页签习惯）
    onAuxClick(e, tab) {
      if (e.button === 1) this.close(tab)
    },
    close(tab) {
      const tabs = this.tabs
      const idx = tabs.findIndex(t => t.fullPath === tab.fullPath)
      this.$store.commit('tagsView/DEL_TAB', { side: this.side, fullPath: tab.fullPath })
      // 关闭的是当前页签：跳相邻（优先右侧，其次左侧）；无剩余则回本侧首页
      if (this.$route.fullPath === tab.fullPath) {
        const next = tabs[idx + 1] || tabs[idx - 1]
        const home = this.side === 'buddy' ? '/omnibuddy' : '/home'
        this.$router.push(next ? next.fullPath : home).catch(() => {})
      }
    },
    // 更多操作：关闭其它（保留当前）/ 关闭全部（回本侧首页）
    onMoreCommand(cmd) {
      const home = this.side === 'buddy' ? '/omnibuddy' : '/home'
      if (cmd === 'others') {
        this.$store.commit('tagsView/CLOSE_OTHERS', { side: this.side, keepFullPath: this.$route.fullPath })
      } else if (cmd === 'all') {
        this.$store.commit('tagsView/CLOSE_ALL', { side: this.side })
        if (this.$route.fullPath !== home) {
          // 跳首页，由 afterEach 自动登记新页签
          this.$router.push(home).catch(() => {})
        } else {
          // 已在首页：导航去重不会触发 afterEach，手动补登记
          this.$store.commit('tagsView/ADD_TAB', {
            side: this.side,
            path: home,
            fullPath: home,
            title: this.side === 'buddy' ? '新对话' : '首页'
          })
        }
      }
    },
    scrollActiveIntoView() {
      // 根节点 v-if 为假时 $el 是注释节点（无 querySelector），需先判空
      if (!this.$el || !this.$el.querySelector) return
      const el = this.$el.querySelector('.tags-item.active')
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    }
  }
}
</script>

<style lang="scss" scoped>
.tags-bar {
  flex-shrink: 0;
  height: 36px;
  padding: 0 10px;
  display: flex;
  align-items: center;
  background: $content-bg;
  border-bottom: 1px solid $border-color;
  user-select: none;
}

.tags-scroll {
  display: flex;
  align-items: center;
  gap: 4px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;

  // 溢出横向滚动但隐藏滚动条（滚轮/拖拽仍可滚动）
  &::-webkit-scrollbar {
    height: 0;
  }
}

.tags-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  /* 等宽页签：固定宽度 + 标题溢出省略，视觉整齐 */
  width: 140px;
  height: 25px;
  padding: 0 8px;
  box-sizing: border-box;
  border-radius: $radius-sm;
  font-size: 12.5px;
  color: $text-secondary;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  /* 默认态即带浅底（主题感知），激活态换主题色底 */
  background: $sidebar-item-hover;
  transition: all 0.15s ease;
  // 仅页签本体可点击（宿主为窗口拖拽区时可点，空白条区仍可拖动窗口）
  -webkit-app-region: no-drag;

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.07);
    color: $text-primary;
  }

  &.active {
    background: rgba(var(--primary-color-rgb), 0.14);
    color: var(--primary-color);
    font-weight: 600;
  }
}

/* 页签图标：与菜单同源（deck 用 config/tools、buddy 用菜单配置） */
.tags-ico {
  width: 13px;
  height: 13px;
  flex-shrink: 0;
  color: $text-secondary;
  opacity: 0.75;

  .tags-item.active & {
    color: var(--primary-color);
    opacity: 1;
  }
}

.tags-label {
  flex: 1;
  min-width: 0;
  text-align: center;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tags-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  margin-right: -4px;
  border-radius: 4px;
  opacity: 0;
  transition: all 0.15s ease;
  flex-shrink: 0;

  .tags-close-ico {
    width: 10px;
    height: 10px;
  }

  // 悬停页签或激活页签上显示关闭钮
  .tags-item:hover &,
  .tags-item.active & {
    opacity: 0.75;
  }

  &:hover {
    opacity: 1;
    background: rgba(0, 0, 0, 0.1);
  }
}

/* 更多操作（关闭其它/全部）：条尾 ⋮ 钮 */
.tags-more-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  margin-left: 4px;
  border-radius: $radius-sm;
  color: $text-secondary;
  cursor: pointer;
  outline: none;
  flex-shrink: 0;
  transition: all 0.15s ease;
  // 宿主可能为窗口拖拽区，按钮本体需可点击
  -webkit-app-region: no-drag;

  .tags-more-ico {
    width: 14px;
    height: 14px;
  }

  &:hover {
    background: $sidebar-item-hover;
    color: $text-primary;
  }
}
</style>
