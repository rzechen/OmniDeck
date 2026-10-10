<template>
  <!-- 地址栏下书签栏（Chrome 风格）：文件夹下拉 + 顶层书签直达；
       溢出项收纳进右侧「更多」下拉（无横向滚动）。
       弹层为 wrap 内 absolute（z-index 覆盖 webview；teleport 至 body 会被
       原生子视图遮挡，同地址栏历史下拉方案） -->
  <div class="bmb-wrap">
    <div ref="barRef" class="bmb-bar">
    <template v-if="hasAny">
      <template v-for="(it, i) in allItems" :key="it.id">
        <!-- 文件夹：点击弹出下拉列表 -->
        <div
          v-if="it.kind === 'folder'"
          v-show="i < visibleCount"
          :ref="el => setGroupBtn(it.id, el)"
          class="bmb-item"
          :class="{ open: openId === it.id }"
          :title="it.name"
          @click.stop="toggleGroup(it.id)"
        >
          <svg-icon icon-class="folder" class-name="bmb-ico" />
          <span class="bmb-name">{{ it.name }}</span>
          <svg-icon icon-class="arrow-down" class-name="bmb-caret" :class="{ open: openId === it.id }" />
        </div>
        <!-- 顶层书签：点击直达 -->
        <button
          v-else
          v-show="i < visibleCount"
          class="bmb-item"
          :title="it.url"
          @click="$emit('navigate', it.url)"
        >
          <svg-icon icon-class="website" class-name="bmb-ico page" />
          <span class="bmb-name">{{ it.name }}</span>
        </button>
      </template>

      <!-- 更多：收纳放不下的书签/文件夹 -->
      <div
        v-if="visibleCount < allItems.length"
        class="bmb-item bmb-more"
        title="更多书签"
        @click.stop="toggleMore"
      >
        <span>更多</span>
        <svg-icon icon-class="arrow-down" class-name="bmb-caret" :class="{ open: moreOpen }" />
      </div>
    </template>
    <span v-else class="bmb-empty">暂无书签：点击地址栏右侧星标收藏，或在侧栏「书签」中导入</span>
    </div>

    <!-- 可见文件夹下拉（wrap 内 absolute，左对齐触发按钮；在 bar 外避免被裁剪） -->
    <div v-if="openId" class="bmb-drop" :style="{ left: dropLeft + 'px' }" @click.stop>
      <button
        v-for="p in openPages"
        :key="p.id"
        class="bmb-drop-item"
        :title="p.url"
        @click="onNav(p.url)"
      >
        <svg-icon icon-class="website" class-name="bmb-drop-ico" />
        <span class="bmb-drop-name">{{ p.name }}</span>
      </button>
      <div v-if="!openPages.length" class="bmb-drop-none">文件夹内暂无书签</div>
    </div>

    <!-- 更多下拉（溢出列表 / 文件夹二级视图，右对齐） -->
    <div v-if="moreOpen" class="bmb-drop bmb-drop-more" @click.stop>
      <template v-if="moreView.type === 'folder'">
        <button class="bmb-drop-item bmb-drop-back" @click="moreView = { type: 'list' }">
          <svg-icon icon-class="back" class-name="bmb-drop-ico" />
          <span class="bmb-drop-name">{{ moreView.name }}</span>
        </button>
        <button
          v-for="p in moreFolderPages"
          :key="p.id"
          class="bmb-drop-item indent"
          :title="p.url"
          @click="onNav(p.url)"
        >
          <svg-icon icon-class="website" class-name="bmb-drop-ico" />
          <span class="bmb-drop-name">{{ p.name }}</span>
        </button>
        <div v-if="!moreFolderPages.length" class="bmb-drop-none">文件夹内暂无书签</div>
      </template>
      <template v-else>
        <template v-for="it in overflowItems" :key="it.id">
          <button
            v-if="it.kind === 'folder'"
            class="bmb-drop-item"
            :title="it.name"
            @click="moreView = { type: 'folder', id: it.id, name: it.name }"
          >
            <svg-icon icon-class="folder" class-name="bmb-drop-ico folder" />
            <span class="bmb-drop-name">{{ it.name }}</span>
            <svg-icon icon-class="right" class-name="bmb-drop-arrow" />
          </button>
          <button
            v-else
            class="bmb-drop-item"
            :title="it.url"
            @click="onNav(it.url)"
          >
            <svg-icon icon-class="website" class-name="bmb-drop-ico" />
            <span class="bmb-drop-name">{{ it.name }}</span>
          </button>
        </template>
      </template>
    </div>
  </div>
</template>

<script setup>
// 书签栏（Chrome 风格）：数据共享自 bookmarks.js 单例（星标/书签面板/导入实时同步）；
// 溢出收纳：容器宽度不足以平铺全部项时，截断可见项并收纳进右侧「更多」下拉；
// navigate 事件转发至浏览器页 webview 导航
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { bookmarkState, loadBookmarks } from './bookmarks'

defineOptions({ name: 'BookmarkBar' })
const emit = defineEmits(['navigate'])

loadBookmarks()

const folders = computed(() => bookmarkState.list.filter(b => b.type === 'folder'))
const rootPages = computed(() => bookmarkState.list.filter(b => b.type === 'page' && !b.folderId))
const hasAny = computed(() => folders.value.length > 0 || rootPages.value.length > 0)

// 平铺项：文件夹在前、顶层书签在后（与视觉顺序一致，溢出按此顺序截断）
const allItems = computed(() => [
  ...folders.value.map(f => ({ kind: 'folder', id: f.id, name: f.name })),
  ...rootPages.value.map(p => ({ kind: 'page', id: p.id, name: p.name, url: p.url }))
])
const overflowItems = computed(() => allItems.value.slice(visibleCount.value))

function pagesOf(fid) {
  return bookmarkState.list.filter(b => b.type === 'page' && b.folderId === fid)
}

// ===== 溢出收纳（无横向滚动）：先全量渲染测量，再截断 =====
const barRef = ref(null)
const visibleCount = ref(9999)
const GAP = 2
const MORE_W = 58 // 「更多」按钮预留宽（按钮 + 间距）

function recompute() {
  // 先全量显示再测量（display:none 的项无法测量）
  visibleCount.value = allItems.value.length
  nextTick(() => {
    const bar = barRef.value
    if (!bar) return
    const nodes = Array.from(bar.querySelectorAll('.bmb-item:not(.bmb-more)'))
    if (!nodes.length) return
    const avail = bar.clientWidth - 16 // 两侧 padding 8px
    let total = 0
    let fit = 0
    let acc = 0
    nodes.forEach(n => {
      const w = n.getBoundingClientRect().width + GAP
      total += w
      acc += w
      if (acc <= avail) fit++
    })
    if (total - GAP <= avail) return // 全部放得下
    // 需要更多按钮：按预留后的可用宽重算截断位
    const limit = avail - MORE_W
    acc = 0
    let k = 0
    for (const n of nodes) {
      const w = n.getBoundingClientRect().width + GAP
      if (acc + w > limit) break
      acc += w
      k++
    }
    visibleCount.value = Math.max(0, k)
  })
}

let barObserver = null
watch(() => allItems.value.map(i => i.id).join(','), () => recompute())
onMounted(() => {
  recompute()
  if (barRef.value && typeof ResizeObserver !== 'undefined') {
    barObserver = new ResizeObserver(() => recompute())
    barObserver.observe(barRef.value)
  }
})
onBeforeUnmount(() => {
  if (barObserver) barObserver.disconnect()
})

// ===== 可见文件夹下拉（互斥单开，wrap 内 absolute 左对齐触发按钮） =====
const openId = ref('')
const dropLeft = ref(0)
const groupBtns = new Map()

function setGroupBtn(id, el) {
  if (el) groupBtns.set(id, el)
  else groupBtns.delete(id)
}

const openPages = computed(() => (openId.value ? pagesOf(openId.value) : []))

function toggleGroup(id) {
  if (openId.value === id) {
    openId.value = ''
    return
  }
  const el = groupBtns.get(id)
  const bar = barRef.value
  if (!el || !bar) return
  dropLeft.value = el.getBoundingClientRect().left - bar.getBoundingClientRect().left
  moreOpen.value = false
  openId.value = id
}

// ===== 更多下拉（溢出收纳；右对齐贴边，文件夹项进入二级视图） =====
const moreOpen = ref(false)
const moreView = ref({ type: 'list' })
const moreFolderPages = computed(() =>
  moreView.value.type === 'folder' ? pagesOf(moreView.value.id) : [])

function toggleMore() {
  if (moreOpen.value) {
    moreOpen.value = false
    return
  }
  moreView.value = { type: 'list' }
  openId.value = ''
  moreOpen.value = true
}

function onNav(url) {
  openId.value = ''
  moreOpen.value = false
  emit('navigate', url)
}

// 点击外部关闭两类弹层
function onDocClick() {
  openId.value = ''
  moreOpen.value = false
}
// 焦点离开渲染层（点击 webview 网页 / 切换应用）也关闭：webview 为原生元素，
// 其内部点击不会冒泡到 document，靠 window blur 兜底
onMounted(() => {
  document.addEventListener('click', onDocClick)
  window.addEventListener('blur', onDocClick)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('blur', onDocClick)
})
</script>

<style lang="scss" scoped>
.bmb-wrap {
  position: relative;
  flex-shrink: 0;
}

.bmb-bar {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 32px;
  padding: 0 8px;
  background: $card-bg;
  border-bottom: 1px solid $divider;
  overflow: hidden; /* 不横向滚动：溢出项由「更多」收纳 */
  flex-shrink: 0;
}

.bmb-item {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 24px;
  padding: 0 8px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-primary;
  font-size: 12px;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  transition: background 0.12s ease;

  &:hover,
  &.open {
    background: $search-bg;
  }

  .bmb-ico {
    font-size: 12px;
    color: $primary-color;

    &.page {
      color: $text-secondary;
    }
  }

  .bmb-name {
    max-width: 130px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bmb-caret {
    flex-shrink: 0;
    font-size: 8px;
    color: $text-secondary;
    transition: transform 0.15s ease;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.bmb-empty {
  font-size: 11px;
  color: $text-secondary;
  white-space: nowrap;
}

/* 下拉弹层（wrap 内 absolute，z-index 覆盖 webview；同地址栏历史下拉方案）；
   宽度随内容自适应（max-width 封顶） */
.bmb-drop {
  position: absolute;
  top: calc(100% + 4px);
  z-index: 40;
  width: max-content;
  min-width: 120px;
  max-width: min(260px, 60vw);
  max-height: min(320px, 60vh);
  overflow-y: auto;
  padding: 5px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(20px) saturate(1.5);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* 更多弹层：右对齐贴边（触发按钮在栏右端） */
.bmb-drop-more {
  right: 8px;
}

:global(html[data-theme='dark']) .bmb-drop {
  background: rgba(46, 46, 52, 0.94);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24);
}

.bmb-drop-item {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: $text-primary;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;

  .bmb-drop-ico {
    flex-shrink: 0;
    font-size: 12px;
    color: $text-secondary;

    &.folder {
      color: $primary-color;
    }
  }

  .bmb-drop-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .bmb-drop-arrow {
    flex-shrink: 0;
    font-size: 10px;
    color: $text-secondary;
  }

  &:hover {
    color: $primary-color;
    background: rgba(51, 102, 255, 0.08);
  }

  /* 更多二级视图：文件夹内书签缩进 */
  &.indent {
    padding-left: 20px;
  }

  /* 二级视图返回头 */
  &.bmb-drop-back {
    color: $text-secondary;
    border-bottom: 1px solid $divider;
    border-radius: 7px 7px 0 0;
    margin-bottom: 3px;

    .bmb-drop-name {
      font-weight: 500;
    }
  }
}

.bmb-drop-none {
  padding: 10px;
  font-size: 11px;
  color: $text-secondary;
  text-align: center;
}
</style>
