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
        @contextmenu.prevent="openCtx($event, tab)"
        @mouseenter="onTabEnter"
        @mouseleave="onTabLeave"
      >
        <svg-icon v-if="iconFor(tab)" :icon-class="iconFor(tab)" class="tags-ico" />
        <span class="tags-label"><span class="tags-label-inner">{{ tab.title }}</span></span>
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
      <template #dropdown>
        <el-dropdown-menu>
          <el-dropdown-item command="others">关闭其它页签</el-dropdown-item>
          <el-dropdown-item command="all" divided>关闭全部页签</el-dropdown-item>
        </el-dropdown-menu>
      </template>
    </el-dropdown>

    <!-- 页签右键菜单（mac 风浮层，与空间页右键菜单同款样式） -->
    <transition name="tags-ctx">
      <div
        v-if="ctx.visible"
        class="tags-ctx"
        :style="{ left: ctx.x + 'px', top: ctx.y + 'px' }"
      >
        <div class="tags-ctx-item" @click="ctxAction('close', ctx.tab)">
          <svg-icon icon-class="close" class="tags-ctx-ico" /> 关闭
        </div>
        <template v-if="tabs.length > 1">
          <div class="tags-ctx-sep"></div>
          <div class="tags-ctx-item" @click="ctxAction('others', ctx.tab)">关闭其它页签</div>
          <div v-if="ctx.idx > 0" class="tags-ctx-item" @click="ctxAction('left', ctx.tab)">关闭左侧页签</div>
          <div v-if="ctx.idx < tabs.length - 1" class="tags-ctx-item" @click="ctxAction('right', ctx.tab)">关闭右侧页签</div>
          <div class="tags-ctx-item" @click="ctxAction('all', ctx.tab)">关闭全部页签</div>
        </template>
      </div>
    </transition>
  </div>
</template>

<script>
import {
  homeItem,
  favoriteItem,
  todoItem,
  clipboardItem,
  browserItem,
  settingsItem,
  versionItem,
  feedbackItem,
  menuGroups
} from '@/config/tools'

// deck 侧路径 → 图标映射（来自菜单配置 @/config/tools，单一事实源：
// 固定入口 + 分组页 + 各工具页；/search 为快捷搜索页签补充项）
const deckIconMap = (() => {
  const map = { '/search': 'search' }
  ;[homeItem, favoriteItem, todoItem, clipboardItem, browserItem, settingsItem, versionItem, feedbackItem].forEach(it => {
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
  '/omnibuddy/profile': 'user',
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
  data() {
    return {
      // 右键菜单：visible/x/y 定位，tab/idx 为右键目标页签
      ctx: { visible: false, x: 0, y: 0, tab: null, idx: -1 }
    }
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
    // 全局点击 / Esc 关闭右键菜单
    document.addEventListener('mousedown', this.onDocMouseDown)
    document.addEventListener('keydown', this.onCtxKeydown)
  },
  beforeUnmount() {
    document.removeEventListener('mousedown', this.onDocMouseDown)
    document.removeEventListener('keydown', this.onCtxKeydown)
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
    // ===== 右键菜单 =====
    openCtx(e, tab) {
      // 视口边缘收敛（菜单宽约 170、高约 200）
      const x = Math.min(e.clientX, window.innerWidth - 185)
      const y = Math.min(e.clientY, window.innerHeight - 210)
      this.ctx = { visible: true, x, y, tab, idx: this.tabs.findIndex(t => t.fullPath === tab.fullPath) }
    },
    closeCtx() {
      this.ctx.visible = false
      this.ctx.tab = null
      this.ctx.idx = -1
    },
    onDocMouseDown(e) {
      if (this.ctx.visible && !e.target.closest('.tags-ctx')) this.closeCtx()
    },
    onCtxKeydown(e) {
      if (e.key === 'Escape' && this.ctx.visible) this.closeCtx()
    },
    // 右键菜单动作：close 单关 / others·left·right 批量关 / all 全关
    ctxAction(action, tab) {
      this.closeCtx()
      if (!tab) return
      const home = this.side === 'buddy' ? '/omnibuddy' : '/home'
      if (action === 'close') {
        this.close(tab)
        return
      }
      if (action === 'others' || action === 'left' || action === 'right') {
        // 关闭集之外的保留集：others 仅留目标；left 留目标及其右侧；right 留目标及其左侧
        const i = this.idxOf(tab)
        const keep = this.tabs
          .filter((t, j) => (action === 'others' ? j === i : action === 'left' ? j >= i : j <= i))
          .map(t => t.fullPath)
        const doClose = () => {
          if (action === 'others') {
            this.$store.commit('tagsView/CLOSE_OTHERS', { side: this.side, keepFullPath: tab.fullPath })
          } else {
            this.$store.commit('tagsView/CLOSE_SIDE', { side: this.side, fullPath: tab.fullPath, dir: action })
          }
        }
        // 当前路由不在保留集内：先导航到目标页签，完成后再批量关（与 close 同理，
        // 避免「已删但路由未变」的 keyOf 退化抖动）
        if (!keep.includes(this.$route.fullPath)) {
          this.$router.push(tab.fullPath).then(doClose).catch(doClose)
        } else {
          doClose()
        }
        return
      }
      if (action === 'all') {
        const doCloseAll = () => {
          this.$store.commit('tagsView/CLOSE_ALL', { side: this.side })
          // 导航去重（已在首页）时 afterEach 不触发，手动补登记
          if (this.$route.fullPath === home) {
            this.$store.commit('tagsView/ADD_TAB', {
              side: this.side,
              path: home,
              fullPath: home,
              title: this.side === 'buddy' ? '新任务' : '首页'
            })
          }
        }
        // 先回首页再清空，避免清空后当前路由无页签的 keyOf 退化抖动
        if (this.$route.fullPath !== home) {
          this.$router.push(home).then(doCloseAll).catch(doCloseAll)
        } else {
          doCloseAll()
        }
      }
    },
    idxOf(tab) {
      return this.tabs.findIndex(t => t.fullPath === tab.fullPath)
    },
    close(tab) {
      const tabs = this.tabs
      const idx = tabs.findIndex(t => t.fullPath === tab.fullPath)
      // 关闭非当前页签：无路由变化，直接删
      if (this.$route.fullPath !== tab.fullPath) {
        this.$store.commit('tagsView/DEL_TAB', { side: this.side, fullPath: tab.fullPath })
        return
      }
      // 关闭的是当前页签：先跳相邻（优先右侧，其次左侧），导航完成后再删。
      // 若先删后跳，中间态里当前路由已无页签，keyOf 会退化成 fullPath，
      // 造成 router-view 的 :key 抖动（瞬态卸载/重挂），快速连点时崩溃
      const next = tabs[idx + 1] || tabs[idx - 1]
      const home = this.side === 'buddy' ? '/omnibuddy' : '/home'
      const doDel = () => {
        this.$store.commit('tagsView/DEL_TAB', { side: this.side, fullPath: tab.fullPath })
      }
      this.$router.push(next ? next.fullPath : home).then(doDel).catch(doDel)
    },
    // 更多操作：关闭其它（保留当前）/ 关闭全部（回本侧首页）
    onMoreCommand(cmd) {
      const home = this.side === 'buddy' ? '/omnibuddy' : '/home'
      if (cmd === 'others') {
        this.$store.commit('tagsView/CLOSE_OTHERS', { side: this.side, keepFullPath: this.$route.fullPath })
      } else if (cmd === 'all') {
        // 先回首页再清空，避免清空后当前路由无页签的 keyOf 退化抖动（同 ctxAction('all')）
        const doCloseAll = () => {
          this.$store.commit('tagsView/CLOSE_ALL', { side: this.side })
          // 导航去重（已在首页）时 afterEach 不触发，手动补登记
          if (this.$route.fullPath === home) {
            this.$store.commit('tagsView/ADD_TAB', {
              side: this.side,
              path: home,
              fullPath: home,
              title: this.side === 'buddy' ? '新任务' : '首页'
            })
          }
        }
        if (this.$route.fullPath !== home) {
          this.$router.push(home).then(doCloseAll).catch(doCloseAll)
        } else {
          doCloseAll()
        }
      }
    },
    scrollActiveIntoView() {
      // 根节点 v-if 为假时 $el 是注释节点（无 querySelector），需先判空
      if (!this.$el || !this.$el.querySelector) return
      const el = this.$el.querySelector('.tags-item.active')
      if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    },
    // ===== 页签标题 hover 滚动（超长省略号时从右向左滚完展示，与侧栏任务列表同款） =====
    onTabEnter(e) {
      const wrap = e.currentTarget.querySelector('.tags-label')
      const inner = wrap && wrap.firstElementChild
      if (!wrap || !inner) return
      const diff = inner.scrollWidth - wrap.clientWidth
      wrap.classList.remove('scrolling')
      if (diff > 4) {
        // 宽度差写入 CSS 变量，重置动画后播放（从 0 滚到 -diff）
        wrap.style.setProperty('--scroll-x', -(diff + 4) + 'px')
        void wrap.offsetWidth // 强制 reflow 以重启动画
        wrap.classList.add('scrolling')
      }
    },
    onTabLeave(e) {
      const wrap = e.currentTarget.querySelector('.tags-label')
      if (wrap) wrap.classList.remove('scrolling')
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

  /* 内层承载文字：默认省略号截断，hover 超长时从右向左滚动展示 */
  .tags-label-inner {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    will-change: transform;
  }

  &.scrolling .tags-label-inner {
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    animation: tags-label-scroll 3.5s ease-in-out 0.35s forwards;
  }
}

/* 标题滚动动画（滚动量由 --scroll-x 变量按溢出宽度注入） */
@keyframes tags-label-scroll {
  to {
    transform: translateX(var(--scroll-x, 0));
  }
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

/* ===== 页签右键菜单（mac 风浮层，与空间页 sp-menu 同款） ===== */
.tags-ctx {
  position: fixed;
  z-index: 3200;
  min-width: 160px;
  padding: 5px;
  border-radius: 11px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.06);
  -webkit-app-region: no-drag;
}

html[data-theme='dark'] .tags-ctx {
  background: rgba(46, 46, 52, 0.94);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24);
}

.tags-ctx-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 30px;
  padding: 4px 9px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background 0.12s ease;

  .tags-ctx-ico {
    width: 13px;
    height: 13px;
    color: var(--text-secondary);
  }

  &:hover {
    background: var(--search-bg-hover);
  }
}

.tags-ctx-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--border-color);
}

/* 菜单弹出过渡（与 sp-menu 同款：轻缩放 + 淡入） */
.tags-ctx-enter-active {
  transition: opacity 0.14s ease, transform 0.14s cubic-bezier(0.34, 1.2, 0.64, 1);
}

.tags-ctx-leave-active {
  transition: opacity 0.1s ease;
}

.tags-ctx-enter,
.tags-ctx-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
