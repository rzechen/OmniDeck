<template>
  <aside class="sidebar" :class="{ collapsed }">
    <!-- macOS 交通灯按钮独占行 -->
    <div class="sidebar-topbar"></div>

    <!-- Logo 区域 -->
    <div class="sidebar-logo">
      <div class="logo-icon">
        <img src="@/assets/logo.png" alt="OmniDeck" class="logo-img" />
      </div>
      <span v-show="!collapsed" class="logo-text">OmniDeck</span>
    </div>

    <!-- 导航菜单 -->
    <nav class="sidebar-nav" ref="nav">
      <!-- 滑动指示器：跟随当前激活项平滑滑动（主题色竖条） -->
      <span
        class="nav-indicator"
        :class="{ 'is-ready': indicatorReady }"
        :style="indicatorStyle"
      ></span>
      <!-- 首页（固定，不可拖拽） -->
      <div
        class="nav-item"
        :class="{ active: isActive(home) }"
        @click="navigate(home)"
        :title="collapsed ? home.title : ''"
      >
        <span class="nav-icon-wrap">
          <svg-icon :icon-class="home.iconSvg" class="nav-svg" />
        </span>
        <span v-show="!collapsed" class="nav-label">{{ home.title }}</span>
      </div>

      <!-- 我的收藏（固定，不可拖拽） -->
      <div
        class="nav-item"
        :class="{ active: isActive(favorite) }"
        @click="navigate(favorite)"
        :title="collapsed ? favorite.title : ''"
      >
        <span class="nav-icon-wrap">
          <svg-icon :icon-class="favorite.iconSvg" class="nav-svg" />
        </span>
        <span v-show="!collapsed" class="nav-label">{{ favorite.title }}</span>
      </div>

      <!-- 我的代办（固定，不可拖拽） -->
      <div
        class="nav-item"
        :class="{ active: isActive(todo) }"
        @click="navigate(todo)"
        :title="collapsed ? todo.title : ''"
      >
        <span class="nav-icon-wrap">
          <svg-icon :icon-class="todo.iconSvg" class="nav-svg" />
        </span>
        <span v-show="!collapsed" class="nav-label">{{ todo.title }}</span>
      </div>

      <!-- 复制历史（固定，不可拖拽：剪贴板记录 + 截图记录管理页） -->
      <div
        class="nav-item"
        :class="{ active: isActive(clipboard) }"
        @click="navigate(clipboard)"
        :title="collapsed ? clipboard.title : ''"
      >
        <span class="nav-icon-wrap">
          <svg-icon :icon-class="clipboard.iconSvg" class="nav-svg" />
        </span>
        <span v-show="!collapsed" class="nav-label">{{ clipboard.title }}</span>
      </div>

      <div class="nav-divider" v-if="!collapsed"></div>

      <!-- 组列表（可拖拽排序） -->
      <draggable
        v-model="groups"
        :disabled="collapsed"
        handle=".nav-group-header"
        animation="200"
        ghost-class="drag-ghost"
        item-key="key"
        @end="saveGroupOrder"
      >
        <template #item="{ element: group }">
        <div class="nav-group">
          <!-- 组头（拖拽把手 + 展开收起） -->
          <div
            class="nav-group-header"
            :class="{ active: isGroupActive(group) }"
            @click="onToggleGroup(group)"
            :title="collapsed ? group.title : ''"
          >
            <span class="nav-icon-wrap">
              <svg-icon :icon-class="group.iconSvg" class="nav-svg" />
            </span>
            <span v-show="!collapsed" class="nav-label">{{ group.title }}</span>
            <i
              v-show="!collapsed"
              class="el-icon-arrow-right nav-arrow"
              :class="{ expanded: isGroupExpanded(group) }"
            ></i>
          </div>

          <!-- 组内二级菜单（可拖拽排序） -->
          <draggable
            v-show="!collapsed && isGroupExpanded(group)"
            v-model="group.children"
            :disabled="collapsed"
            animation="200"
            ghost-class="drag-ghost"
            item-key="path"
            class="nav-group-children"
            @end="saveGroupOrder"
          >
            <template #item="{ element: item }">
            <div
              class="nav-item nav-sub-item"
              :class="{ active: isActive(item) }"
              @click="navigate(item)"
            >
              <span class="nav-icon-wrap">
                <svg-icon :icon-class="item.iconSvg" class="nav-svg" />
              </span>
              <span class="nav-label">{{ item.title }}</span>
              <!-- 规划中占位模块徽标 -->
              <span v-if="item.todo" class="nav-todo-badge">TODO</span>
            </div>
            </template>
          </draggable>
        </div>
        </template>
      </draggable>
    </nav>

    <!-- 底部固定操作区 -->
    <div class="sidebar-footer-area">
      <!-- OmniBuddy 入口：操作按钮区上方，醒目渐变胶囊 -->
      <div
        v-if="!collapsed"
        class="buddy-entry"
        @click="goBuddy"
        :title="'OmniBuddy ' + buddyShortcutText"
      >
        <span class="buddy-entry-icon">
          <img src="@/assets/logo.png" alt="OmniBuddy" class="buddy-entry-img" />
        </span>
        <span class="buddy-entry-text">OmniBuddy</span>
        <span class="buddy-entry-arrow">
          <i class="el-icon-arrow-right"></i>
        </span>
      </div>
      <div
        v-else
        class="buddy-entry-collapsed"
        @click="goBuddy"
        :title="'OmniBuddy ' + buddyShortcutText"
      >
        <span class="buddy-entry-icon">
          <img src="@/assets/logo.png" alt="OmniBuddy" class="buddy-entry-img" />
        </span>
      </div>
    </div>
  </aside>
</template>

<script>
import draggable from 'vuedraggable'
import {
  homeItem,
  favoriteItem,
  todoItem,
  clipboardItem,
  menuGroups
} from '@/config/tools'
import { getMenuOrder, saveMenuOrder } from '@/utils/menu-order'
import { getShortcut, formatAccelerator, onShortcutsChanged } from '@/utils/shortcuts'

export default {
  name: 'Sidebar',
  components: { draggable },
  props: {
    collapsed: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      home: homeItem,
      favorite: favoriteItem,
      todo: todoItem,
      clipboard: clipboardItem,
      groups: [],
      expandedMap: { tools: true },
      // 滑动指示器位置（相对 nav 内容坐标）
      indicator: { top: 0, height: 18, opacity: 0 },
      // 首次定位完成后再启用过渡，避免指示器从顶部滑入
      indicatorReady: false,
      // 快捷键版本号（设置页改键后 bump，刷新提示文案）
      shortcutVersion: 0
    }
  },
  computed: {
    // OmniBuddy 唤起快捷键提示（⌘OJ / Ctrl+O+J，随设置实时变化）
    buddyShortcutText() {
      // 依赖版本号：改键后重新计算
      void this.shortcutVersion
      return formatAccelerator(getShortcut('buddy'))
    },
    toolsExpanded() {
      return this.expandedMap.tools !== false
    },
    indicatorStyle() {
      return {
        top: this.indicator.top + 'px',
        height: this.indicator.height + 'px',
        opacity: this.indicator.opacity
      }
    }
  },
  watch: {
    // 路由变化 → 指示器滑动到新的激活项
    $route() {
      this.$nextTick(this.updateIndicator)
    },
    // 展开/收起侧边栏：条目位置变化
    collapsed() {
      this.$nextTick(this.updateIndicator)
    },
    // 分组展开/收起：二级菜单位置变化
    expandedMap: {
      deep: true,
      handler() {
        this.$nextTick(this.updateIndicator)
      }
    }
  },
  created() {
    // 深拷贝组结构（children 引用配置数组，保证拖拽变更同步到配置单例）
    this.groups = menuGroups.map(g => ({ ...g }))
    // 恢复持久化的排序
    this.restoreOrder()
    // 按设置的默认状态初始化分组展开/收起（'collapse' 时全部收起）
    if (this.$store.state.sidebarGroupsDefault === 'collapse') {
      const map = {}
      this.groups.forEach(g => {
        map[g.key] = false
      })
      this.expandedMap = map
    }
    // 设置页「还原排序」动作广播：重建菜单
    this.$bus.on('menu-order-reset', this.onOrderReset)
  },
  beforeUnmount() {
    this.$bus.off('menu-order-reset', this.onOrderReset)
    if (this.offShortcutsChanged) this.offShortcutsChanged()
  },
  mounted() {
    this.updateIndicator()
    // 设置页改键后刷新快捷键提示文案
    this.offShortcutsChanged = onShortcutsChanged(() => { this.shortcutVersion++ })
    this.$nextTick(() => {
      this.indicatorReady = true
    })
  },
  methods: {
    // 计算指示器位置：优先取可见的激活菜单项（二级菜单收起时回退到激活的组头）
    updateIndicator() {
      const nav = this.$refs.nav
      if (!nav) return
      const candidates = nav.querySelectorAll('.nav-item.active, .nav-group-header.active')
      let el = null
      for (let i = 0; i < candidates.length; i++) {
        // offsetParent 为 null 说明元素（或其祖先）display:none，不可见
        if (candidates[i].offsetParent !== null) {
          el = candidates[i]
          break
        }
      }
      if (!el) {
        this.indicator.opacity = 0
        return
      }
      const h = el.offsetHeight
      const barH = Math.min(18, Math.max(12, h - 8))
      this.indicator = {
        top: el.offsetTop + (h - barH) / 2,
        height: barH,
        opacity: 1
      }
    },
    // 按给定顺序原地重排（splice 保证 Vue 2 响应式）
    sortByNames(list, keyField, names) {
      if (!names || !names.length) return
      names.forEach((name, idx) => {
        const i = list.findIndex(item => item[keyField] === name)
        if (i > -1 && i !== idx) {
          const [moved] = list.splice(i, 1)
          list.splice(idx, 0, moved)
        }
      })
    },
    // 重建菜单结构并应用持久化排序
    restoreOrder() {
      this.groups = menuGroups.map(g => ({ ...g, children: [...g.children] }))
      const order = getMenuOrder()
      if (order) {
        this.sortByNames(this.groups, 'key', order.groupKeys)
        this.groups.forEach(g => {
          if (order.children[g.key]) {
            this.sortByNames(g.children, 'name', order.children[g.key])
          }
        })
      }
    },
    // 设置页「还原排序」：持久化已被清除，直接重建为初始顺序
    onOrderReset() {
      this.restoreOrder()
      this.expandedMap = { tools: true }
      this.$nextTick(this.updateIndicator)
    },
    // 选中判断：路径匹配（当前路径等于菜单项路径，或以其为前缀）
    // 工具详情页（如 /tools/format/json）保持对应分类菜单（/tools/format）高亮
    isActive(item) {
      const path = this.$route.path
      return path === item.path || path.startsWith(item.path + '/')
    },
    isGroupActive(group) {
      return group.children.some(item => this.isActive(item))
    },
    isSettingsActive() {
      return this.$route.name === this.settings.name
    },
    isVersionActive() {
      return this.$route.name === this.version.name
    },
    isGroupExpanded(group) {
      return this.expandedMap[group.key] !== false
    },
    navigate(item) {
      if (this.$route.name !== item.name) {
        this.$router.push(item.path)
      }
    },
    goBuddy() {
      // 恢复 buddy 侧最后所在页面（无记录时回新任务页）
      const target = this.$router.lastBuddyPath || '/omnibuddy'
      if (this.$route.fullPath !== target) {
        this.$router.push(target).catch(() => {})
      }
    },
    onToggleGroup(group) {
      if (this.collapsed) {
        // 折叠状态下点击组图标，展开侧边栏
        this.$store.commit('TOGGLE_SIDEBAR')
      } else {
        this.$set(this.expandedMap, group.key, !this.isGroupExpanded(group))
      }
    },
    // 拖拽结束：持久化组顺序 + 每组内二级菜单顺序
    saveGroupOrder() {
      saveMenuOrder({
        groupKeys: this.groups.map(g => g.key),
        children: this.groups.reduce((acc, g) => {
          acc[g.key] = g.children.map(c => c.name)
          return acc
        }, {})
      })
      this.$nextTick(this.updateIndicator)
    }
  }
}
</script>

<style lang="scss" scoped>
.sidebar {
  width: $sidebar-width;
  height: 100%;
  background: $sidebar-bg;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: drag;
  user-select: none;
  overflow: hidden;

  &.collapsed {
    width: $sidebar-collapsed-width;

    .nav-item,
    .nav-group-header {
      justify-content: center;
      padding: 8px 0;
    }

    .sidebar-logo {
      padding: 0 0 14px;
      justify-content: center;
    }

    // 收起时底部操作区改为竖向排列，避免图标横向挤压
    .sidebar-footer-area {
      padding: 4px 8px 8px;
    }
  }
}

// macOS 交通灯按钮让位行：与右侧页签行同高（36px），红绿灯垂直居中于本行
.sidebar-topbar {
  height: 36px;
  flex-shrink: 0;
}

.sidebar-logo {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 16px;
  flex-shrink: 0;
  height: 46px;

  .logo-icon {
    width: 38px;
    height: 38px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    // 图形为宽扁异形（非圆角方块 App 图标），contain 原比例呈现，不加圆角裁切
    .logo-img {
      width: 38px;
      height: 38px;
      object-fit: contain;
    }
  }

  // 主流 lockup 比例：图标可视高度约为字高 1.6~1.8 倍；semibold + 微负字距更精致
  .logo-text {
    font-size: 16px;
    font-weight: 600;
    color: $text-primary;
    letter-spacing: -0.2px;
    line-height: 1;
    white-space: nowrap;
  }
}

.sidebar-nav {
  flex: 1;
  overflow-y: auto;
  // overflow-y 非 visible 时 overflow_x 会计算为 auto，
  // 展开分组瞬间内容横向溢出会闪现横向滚动条，这里显式禁掉
  overflow-x: hidden;
  padding: 4px 8px;
  -webkit-app-region: no-drag;
  // 滑动指示器的定位基准
  position: relative;

  &::-webkit-scrollbar {
    width: 0;
  }
}

// 滑动指示器：主题色竖条，跟随激活项平滑滑动
.nav-indicator {
  position: absolute;
  left: 4px;
  width: 3px;
  border-radius: 0 3px 3px 0;
  background: $primary-color;
  opacity: 0;
  pointer-events: none;
  z-index: 1;

  // 首次定位完成后才启用滑动过渡（避免初始从顶部飞入）
  &.is-ready {
    transition: top 0.28s cubic-bezier(0.4, 0, 0.2, 1),
      height 0.28s cubic-bezier(0.4, 0, 0.2, 1),
      opacity 0.18s ease;
  }
}

// 底部区域容器：OmniBuddy 入口 + 操作按钮区
.sidebar-footer-area {
  flex-shrink: 0;
  -webkit-app-region: no-drag;
}

// OmniBuddy 入口：操作按钮区上方，紫色渐变胶囊（底部间距与 Buddy 返回胶囊一致）
.buddy-entry {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0 12px 18px;
  padding: 7px 11px;
  border-radius: $radius-base;
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.3);
  cursor: pointer;
  transition: all 0.15s ease;
  overflow: hidden;

  &:hover {
    filter: brightness(1.08);
    box-shadow: 0 3px 12px rgba(var(--primary-color-rgb), 0.42);

    .buddy-entry-arrow {
      transform: translateX(2px);
    }
  }

  &:active {
    transform: scale(0.97);
  }
}

.buddy-entry-icon {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  // 实白 chip 衬底：logo 本身是蓝色渐变，与胶囊蓝色背景同色系，
  // 半透明白底会融为一体，实白底才能让 logo 清晰浮出
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;

  // 品牌 logo（宽扁异形，contain 原比例呈现）
  .buddy-entry-img {
    width: 16px;
    height: 16px;
    object-fit: contain;
  }
}

.buddy-entry-text {
  flex: 1;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: #fff;
  white-space: nowrap;
}

.buddy-entry-arrow {
  color: rgba(255, 255, 255, 0.85);
  display: inline-flex;
  align-items: center;
  transition: transform 0.15s ease;

  i {
    font-size: 12px;
  }
}

// 折叠态 OmniBuddy 入口：仅图标方块（底部间距与 Buddy 收起态返回胶囊一致）
.buddy-entry-collapsed {
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 8px 16px;
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.3);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    filter: brightness(1.08);
  }

  &:active {
    transform: scale(0.94);
  }

  .buddy-entry-icon {
    background: transparent;
  }
}

.nav-divider {
  height: 1px;
  background: $sidebar-divider;
  margin: 8px 12px;
}

// 图标容器：统一宽度对齐（SVG / PNG / 字体图标）
.nav-icon-wrap {
  width: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .nav-svg {
    width: 15px;
    height: 15px;
  }
}

// 通用导航项样式（首页/收藏 + 二级菜单共用）
.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 11px;
  border-radius: $radius-sm;
  cursor: pointer;
  color: $text-sidebar;
  font-size: 14px;
  font-weight: 500;
  margin-bottom: 1px;
  position: relative;
  transition: all 0.15s ease;

  &:hover {
    background: $sidebar-item-hover;
    color: $text-primary;
  }

  &.active {
    background: $sidebar-item-active;
    color: $text-sidebar-active;

    .nav-svg {
      color: $primary-color;
    }
  }

  .nav-label {
    white-space: nowrap;
  }
}

// 组容器
.nav-group {
  // 组头（拖拽把手）
  .nav-group-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 11px;
    border-radius: $radius-sm;
    cursor: grab;
    color: $text-sidebar;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 1px;
    position: relative;
    transition: all 0.15s ease;
    user-select: none;

    &:active {
      cursor: grabbing;
    }

    &:hover {
      background: $sidebar-item-hover;
      color: $text-primary;
    }

    &.active {
      color: $text-sidebar-active;

      .nav-svg {
        color: $primary-color;
      }
    }

    .nav-label {
      flex: 1;
      white-space: nowrap;
    }

    .nav-arrow {
      font-size: 12px;
      color: $text-secondary;
      transition: transform 0.2s ease;
      flex-shrink: 0;

      &.expanded {
        transform: rotate(90deg);
      }
    }
  }
}

// 拖拽占位样式
.drag-ghost {
  opacity: 0.4;
}

// 二级菜单
.nav-group-children {
  padding-left: 8px;

  .nav-sub-item {
    padding-left: 14px;
    font-size: 13px;
    color: $text-secondary;

    // 规划中占位模块徽标
    .nav-todo-badge {
      margin-left: auto;
      font-size: 8.5px;
      font-weight: 800;
      letter-spacing: 0.5px;
      color: #D46B08;
      background: rgba(var(--warning-color-rgb),  0.15);
      border: 1px solid rgba(var(--warning-color-rgb),  0.4);
      padding: 1px 6px;
      border-radius: 999px;
      line-height: 1.4;
      flex-shrink: 0;
    }
  }
}
</style>
