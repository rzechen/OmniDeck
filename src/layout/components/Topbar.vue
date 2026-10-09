<template>
  <header class="topbar">
    <!-- 毛玻璃背景层：backdrop-filter 会吞掉同元素的 app-region 拖拽区，独立成层规避 -->
    <div class="topbar-glass"></div>

    <!-- 左侧留白（给交界处收起按钮腾出空间） -->
    <div class="topbar-left"></div>

    <!-- 中间：搜索框（顶栏其余空白区域可拖动窗口） -->
    <div class="topbar-center">
      <div class="search-box" @click="showSearch = true">
        <svg-icon icon-class="search" class-name="search-icon" />
        <span class="search-placeholder">搜索工具...</span>
        <span class="search-shortcut">{{ searchShortcutText }}</span>
      </div>
    </div>

    <!-- 右侧：全局设置入口 + Windows 窗口控制按钮（mac用系统红绿灯） -->
    <div class="topbar-right">
      <!-- 全局设置（两视图顶栏同位） -->
      <global-topbar-actions />
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

    <!-- 搜索弹窗（Spotlight 风格命令面板） -->
    <el-dialog
      v-model="showSearch"
      :show-close="false"
      :modal="true"
      append-to-body
      class="search-dialog"
      width="680px"
      top="12vh"
    >
      <div class="palette-input-wrap">
        <svg-icon icon-class="search" />
        <input
          ref="searchInput"
          v-model="searchQuery"
          class="palette-input"
          placeholder="搜索工具、页面..."
          @keydown.enter.prevent="selectActive"
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.esc="showSearch = false"
        />
        <span class="palette-kbd">esc</span>
      </div>

      <div class="palette-results" ref="resultsWrap" v-if="filteredItems.length">
        <div
          v-for="(item, i) in filteredItems"
          :key="item.path"
          class="palette-item"
          :class="{ 'is-active': i === activeIndex }"
          :data-index="i"
          @mouseenter="activeIndex = i"
          @click="goTo(item)"
        >
          <svg-icon :icon-class="item.iconSvg" class="item-icon" />
          <span class="item-label">{{ item.title }}</span>
          <svg-icon v-if="i === activeIndex" icon-class="right" class-name="item-enter" />
        </div>
      </div>
      <div class="palette-empty" v-else-if="searchQuery">
        <svg-icon icon-class="search" />
        <span>未找到「{{ searchQuery }}」相关内容</span>
      </div>

      <div class="palette-footer">
        <span class="hint"><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
        <span class="hint"><kbd>↵</kbd> 打开</span>
        <span class="hint"><kbd>esc</kbd> 关闭</span>
      </div>
    </el-dialog>
  </header>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { searchItems, toolCategories } from '@/config/tools'
import { getShortcut, matchesShortcut, formatAccelerator, onShortcutsChanged } from '@/utils/ui/shortcuts'
import GlobalTopbarActions from '@/components/common/GlobalTopbarActions.vue'

defineOptions({ name: 'Topbar' })

const router = useRouter()

const showSearch = ref(false)
const searchQuery = ref('')
const activeIndex = ref(0)
const allItems = searchItems
// Windows 无边框窗口控制
const isWindows = !!(window.electronAPI && window.electronAPI.platform === 'win32')
const winMaximized = ref(false)
// 快捷键版本号（设置页改键后 bump，刷新提示文案）
const shortcutVersion = ref(0)

const searchInput = ref(null)
const resultsWrap = ref(null)
let offMaximized = null
let offShortcutsChanged = null

// 搜索快捷键提示（⌘OK / Ctrl+O+K，随设置实时变化）
const searchShortcutText = computed(() => {
  // 依赖版本号：改键后重新计算
  void shortcutVersion.value
  return formatAccelerator(getShortcut('search'))
})

// 所有分类下的具体工具（展平，用于搜索命中）
const toolItems = computed(() => {
  const out = []
  toolCategories.forEach(cat => {
    cat.children.forEach(t => {
      out.push({ path: t.path, title: t.name, iconSvg: t.icon })
    })
  })
  return out
})

const filteredItems = computed(() => {
  if (!searchQuery.value) return allItems
  const q = searchQuery.value.toLowerCase()
  // 命中的分组在前，具体工具在后
  const groups = allItems.filter(item =>
    item.title.toLowerCase().includes(q)
  )
  const tools = toolItems.value.filter(item =>
    item.title.toLowerCase().includes(q)
  )
  return [...groups, ...tools]
})

watch(showSearch, val => {
  if (val) {
    activeIndex.value = 0
    nextTick(() => {
      if (searchInput.value) {
        searchInput.value.focus()
      }
    })
  } else {
    searchQuery.value = ''
  }
})

// 输入变化后选中项回到第一个
watch(searchQuery, () => {
  activeIndex.value = 0
})

// Windows 窗口控制
function winMinimize() {
  window.electronAPI.winControl.minimize()
}
function winToggleMax() {
  window.electronAPI.winControl.toggleMaximize()
}
function winClose() {
  window.electronAPI.winControl.close()
}

function handleKeydown(e) {
  // 全局搜索快捷键：可配置（默认 ⌘⌥K / Ctrl+Alt+K），设置页可改键
  if (matchesShortcut(e, getShortcut('search'))) {
    e.preventDefault()
    showSearch.value = !showSearch.value
  }
}

// 键盘上下移动选中项（首尾循环）
function move(dir) {
  const len = filteredItems.value.length
  if (!len) return
  activeIndex.value = (activeIndex.value + dir + len) % len
  scrollToActive()
}

function selectActive() {
  if (filteredItems.value.length) {
    goTo(filteredItems.value[activeIndex.value])
  }
}

// 选中项滚动到可视区
function scrollToActive() {
  nextTick(() => {
    const wrap = resultsWrap.value
    if (!wrap) return
    const el = wrap.querySelector(`[data-index="${activeIndex.value}"]`)
    if (el) el.scrollIntoView({ block: 'nearest' })
  })
}

function goTo(item) {
  showSearch.value = false
  router.push(item.path)
}

onMounted(() => {
  document.addEventListener('keydown', handleKeydown)
  // 设置页改键后刷新快捷键提示文案
  offShortcutsChanged = onShortcutsChanged(() => { shortcutVersion.value++ })
  // Windows：同步初始最大化状态 + 监听变化切换按钮图标
  if (isWindows && window.electronAPI.winControl) {
    window.electronAPI.winControl.isMaximized().then(v => {
      winMaximized.value = v
    })
    offMaximized = window.electronAPI.winControl.onMaximizedChanged(v => {
      winMaximized.value = v
    })
  }
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', handleKeydown)
  if (offMaximized) offMaximized()
  if (offShortcutsChanged) offShortcutsChanged()
})
</script>

<style lang="scss" scoped>
.topbar {
  position: relative;
  display: flex;
  align-items: center;
  height: $topbar-height;
  padding: 0 14px 0 38px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

/* 毛玻璃背景层：与拖拽区分层（backdrop-filter 元素自身会丢失 app-region 拖拽区） */
.topbar-glass {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: $topbar-bg;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid $border-color;
  pointer-events: none;
}

.topbar-left {
  position: relative;
  z-index: 1;
  width: 4px;
  flex-shrink: 0;
}

.topbar-right {
  position: relative;
  z-index: 1;
  -webkit-app-region: no-drag;
}

/* Windows 窗口控制按钮（无边框窗口自绘，macOS 风格细线图标） */
.win-controls {
  display: flex;
  align-items: stretch;
  height: $topbar-height;
  margin-right: -14px;
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
    background: var(--topbar-bg, transparent);
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

.topbar-center {
  // 必须置顶：否则会被 z-index:0 的毛玻璃层盖住（backdrop-filter 连带模糊），
  // 出现"看不见但能点"的遮挡
  position: relative;
  z-index: 1;
  flex: 1;
  display: flex;
  justify-content: center;
}

.search-box {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 320px;
  height: 28px;
  padding: 0 11px;
  background: $search-bg;
  border-radius: $radius-base;
  cursor: pointer;
  transition: all 0.15s ease;
  // 仅搜索框本身可点击（no-drag），顶栏其余空白均可拖动窗口
  -webkit-app-region: no-drag;

  &:hover {
    background: $search-bg-hover;
  }

  .search-icon {
    font-size: 13px;
    color: $text-secondary;
  }

  .search-placeholder {
    flex: 1;
    font-size: 12px;
    color: $text-secondary;
  }

  .search-shortcut {
    font-size: 11px;
    color: $text-secondary;
    background: $search-bg;
    padding: 1px 5px;
    border-radius: 4px;
    font-family: 'SF Mono', monospace;
  }
}
</style>

<style lang="scss">
// 搜索命令面板（Spotlight 风格，append-to-body 所以必须非 scoped）
.search-dialog {
  border-radius: 16px !important;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.24) !important;

  .el-dialog__header {
    display: none;
  }

  .el-dialog__body {
    padding: 0;
  }
}

// 打开时轻微缩放弹出（Mac 风格弹性曲线）
.dialog-fade-enter-active .search-dialog {
  transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease;
}

.dialog-fade-enter .search-dialog {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}

.dialog-fade-leave-active .search-dialog {
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.dialog-fade-leave-to .search-dialog {
  transform: scale(0.97);
  opacity: 0;
}

/* 输入区 */
.palette-input-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid $border-color;

  .search-ic {
    font-size: 20px;
    color: $text-secondary;
  }

  .palette-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 16px;
    font-weight: 500;
    background: transparent;
    color: $text-primary;

    &::placeholder {
      color: $text-secondary;
      font-weight: 400;
    }
  }

  .palette-kbd {
    font-size: 11px;
    color: $text-secondary;
    background: $search-bg;
    padding: 2px 7px;
    border-radius: 5px;
    border: 1px solid $border-color;
    font-family: 'SF Mono', Menlo, monospace;
  }
}

/* 结果列表 */
.palette-results {
  max-height: 464px;
  overflow-y: auto;
  padding: 8px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.12s ease;

  .item-icon {
    width: 18px;
    height: 18px;
    color: $text-secondary;
    flex-shrink: 0;
    transition: color 0.12s ease;
  }

  .item-label {
    font-size: 14px;
    font-weight: 500;
    color: $text-primary;
  }

  .item-enter {
    // 移除路径信息后由箭头占据右侧
    margin-left: auto;
    font-size: 13px;
    color: $primary-color;
  }

  &.is-active {
    background: rgba(var(--primary-color-rgb), 0.09);

    .item-icon {
      color: $primary-color;
    }

    .item-label {
      color: $primary-color;
      font-weight: 600;
    }
  }
}

/* 空结果 */
.palette-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 0 28px;
  color: $text-secondary;

  .search-ic {
    font-size: 28px;
    opacity: 0.4;
  }

  span {
    font-size: 13px;
  }
}

/* 底部快捷键提示栏 */
.palette-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 9px 16px;
  border-top: 1px solid $border-color;
  background: $search-bg;

  .hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: $text-secondary;

    kbd {
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 10px;
      color: $text-secondary;
      background: var(--card-bg);
      border: 1px solid $border-color;
      border-radius: 4px;
      padding: 1px 5px;
      line-height: 1.4;
    }
  }
}
</style>
