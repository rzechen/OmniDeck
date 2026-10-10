<template>
  <!-- 单条翻译记录卡片：摘要（原文→译文）+ hover 操作（置顶/复制/删除 icon 组 + 分隔 + 分组下拉）+
       展开详情（完整原文/译文 + 底部元信息：语言对（中文）/引擎/来源链接/时间） -->
  <div class="tc-card" :class="{ open: expanded }" @click="$emit('toggle')">
    <div class="tc-main">
      <div class="tc-texts">
        <p class="tc-src" :title="item.text">{{ item.text }}</p>
        <p class="tc-dst" :title="item.trans">{{ item.trans }}</p>
      </div>
      <span class="tc-ops" @click.stop>
        <button class="tc-op" :class="{ on: item.pinned }" :title="item.pinned ? '取消置顶' : '置顶'" @click="$emit('pin')">
          <svg-icon icon-class="top" />
        </button>
        <button class="tc-op" title="复制译文" @click="$emit('copy', item.trans)">
          <svg-icon icon-class="copy" />
        </button>
        <button class="tc-op tc-op-danger" title="删除记录" @click="$emit('remove')">
          <svg-icon icon-class="delete" />
        </button>
        <!-- 分组移动：与 icon 操作组分隔；自定义下拉（主题色高亮，原生 select 的
             系统 option 高亮无法定制），弹层 teleport 至 body 避免被列表容器裁剪 -->
        <span class="tc-sep"></span>
        <div class="tc-drop-wrap">
          <button ref="folderBtn" class="tc-folder-btn" title="移动到分组" @click.stop="toggleDrop">
            <span class="tc-folder-btn-label">{{ currentFolderName }}</span>
            <svg-icon icon-class="arrow-down" class-name="tc-folder-caret" :class="{ open: dropOpen }" />
          </button>
          <teleport to="body">
            <div v-if="dropOpen" class="tc-drop" :style="dropStyle" @click.stop>
              <button
                v-for="opt in folderOptions"
                :key="opt.id || 'none'"
                class="tc-drop-item"
                :class="{ active: opt.id === (item.folderId || '') }"
                @click="pickFolder(opt.id)"
              >
                {{ opt.name }}
                <svg-icon v-if="opt.id === (item.folderId || '')" icon-class="check" class-name="tc-drop-check" />
              </button>
            </div>
          </teleport>
        </div>
      </span>
    </div>

    <!-- 展开详情 -->
    <div v-if="expanded" class="tc-detail" @click.stop>
      <div class="tc-block">
        <span class="tc-label">原文</span>
        <p class="tc-full">{{ item.text }}</p>
      </div>
      <div class="tc-block">
        <span class="tc-label">译文</span>
        <p class="tc-full">{{ item.trans }}</p>
      </div>
      <!-- 底部元信息：语言对（中文）/引擎/来源链接（a 标签跳转）/时间；空间不足自动换行 -->
      <div class="tc-meta">
        <span class="tc-meta-lang">{{ langPair }}</span>
        <span v-if="engineName">{{ engineName }}</span>
        <a
          v-if="item.url"
          class="tc-link"
          :href="item.url"
          :title="item.url"
          @click.prevent="$emit('navigate', item.url)"
        >{{ item.host || item.url }}</a>
        <span>{{ timeText }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 翻译记录卡片（划词翻译面板·历史列表子组件）
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { TRANS_LANGS } from './transHistory'

const props = defineProps({
  item: { type: Object, required: true },
  expanded: { type: Boolean, default: false },
  folders: { type: Array, default: () => [] }
})
const emit = defineEmits(['toggle', 'pin', 'remove', 'move', 'copy', 'navigate'])

// 语言对（全量中文表；auto 显示「自动检测」）
const langPair = computed(() => {
  const s = props.item.source === 'auto' ? '自动检测' : (TRANS_LANGS[props.item.source] || props.item.source)
  const t = TRANS_LANGS[props.item.target] || props.item.target
  return s + ' → ' + t
})
const engineName = computed(() => {
  const e = props.item.engine
  if (e === 'google') return 'Google 翻译'
  if (e === 'bing') return '必应翻译'
  if (e === 'llm') return '模型翻译'
  return ''
})
const timeText = computed(() => {
  const d = new Date(props.item.time || Date.now())
  const pad = n => String(n).padStart(2, '0')
  return (d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
})

// ===== 分组下拉（自定义弹层，fixed 定位随按钮坐标） =====
const dropOpen = ref(false)
const dropStyle = ref({})
const folderBtn = ref(null)

const folderOptions = computed(() =>
  [{ id: '', name: '未分组' }].concat(props.folders.map(f => ({ id: f.id, name: f.name }))))
const currentFolderName = computed(() => {
  const f = props.folders.find(x => x.id === props.item.folderId)
  return f ? f.name : '未分组'
})

function toggleDrop() {
  if (dropOpen.value) {
    dropOpen.value = false
    return
  }
  const el = folderBtn.value
  if (!el) return
  const r = el.getBoundingClientRect()
  // 预估高度：向下空间不足且上方更宽裕时向上展开
  const estH = Math.min(260, folderOptions.value.length * 28 + 12)
  const below = window.innerHeight - r.bottom
  const top = below < estH + 8 && r.top > estH + 8 ? Math.max(8, r.top - estH - 4) : r.bottom + 4
  dropStyle.value = { right: (window.innerWidth - r.right) + 'px', top: top + 'px' }
  dropOpen.value = true
}
function pickFolder(fid) {
  dropOpen.value = false
  if (fid !== (props.item.folderId || '')) emit('move', fid)
}
// 点击外部关闭（其他卡片的下拉由各自实例关闭，天然互斥）
function onDocClick(e) {
  if (!dropOpen.value) return
  const t = e.target
  if (t.closest && t.closest('.tc-drop')) return
  if (folderBtn.value && t.closest && t.closest('.tc-folder-btn') === folderBtn.value) return
  dropOpen.value = false
}
// 滚动/缩放时关闭（fixed 弹层不跟随滚动）；弹层自身滚动除外
function onScrollClose(e) {
  if (!dropOpen.value) return
  if (e.target && e.target.closest && e.target.closest('.tc-drop')) return
  dropOpen.value = false
}
onMounted(() => {
  document.addEventListener('click', onDocClick)
  window.addEventListener('scroll', onScrollClose, true)
  window.addEventListener('resize', onScrollClose)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', onScrollClose, true)
  window.removeEventListener('resize', onScrollClose)
})
</script>

<style lang="scss" scoped>
.tc-card {
  padding: 6px 6px;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: $search-bg;

    .tc-ops {
      opacity: 1;
    }
  }

  &.open {
    background: $search-bg;
  }
}

.tc-main {
  display: flex;
  align-items: flex-start;
  gap: 6px;
}

.tc-texts {
  flex: 1;
  min-width: 0;

  p {
    margin: 0;
    font-size: 12px;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tc-src {
    color: $text-secondary;
  }

  .tc-dst {
    color: $text-primary;
    font-weight: 500;
  }
}

/* hover 操作 */
.tc-ops {
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  transition: opacity 0.12s ease;
  flex-shrink: 0;
}

.tc-op {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover {
    background: $divider;
    color: $text-primary;
  }

  &.on {
    color: $primary-color;
  }

  &.tc-op-danger:hover {
    background: rgba(245, 63, 63, 0.1);
    color: #f53f3f;
  }
}

/* 分隔线：icon 操作组与分组下拉分隔 */
.tc-sep {
  width: 1px;
  height: 12px;
  margin: 0 3px;
  background: $divider;
  flex-shrink: 0;
}

/* 分组下拉触发按钮（比原生 select 更矮，与 icon 操作组视觉齐平） */
.tc-drop-wrap {
  display: inline-flex;
  flex-shrink: 0;
}

.tc-folder-btn {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  height: 20px;
  padding: 0 4px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  font-size: 10px;
  cursor: pointer;
  flex-shrink: 0;
  max-width: 72px;
  transition: all 0.12s ease;

  &:hover {
    background: $divider;
    color: $text-primary;
  }

  .tc-folder-btn-label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tc-folder-caret {
    flex-shrink: 0;
    font-size: 8px;
    transition: transform 0.15s ease;

    &.open {
      transform: rotate(180deg);
    }
  }
}

/* 分组下拉弹层（teleport 至 body，fixed 定位） */
.tc-drop {
  position: fixed;
  z-index: 3000;
  min-width: 128px;
  max-height: 260px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(20px) saturate(1.5);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
}

:global(html[data-theme='dark']) .tc-drop {
  background: rgba(46, 46, 52, 0.94);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24);
}

.tc-drop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 26px;
  padding: 0 8px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: $text-primary;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s ease, color 0.12s ease;

  /* 主题色高亮（hover / 选中项） */
  &:hover {
    color: $primary-color;
    background: rgba(51, 102, 255, 0.08);
  }

  &.active {
    color: $primary-color;
    font-weight: 500;
    background: rgba(51, 102, 255, 0.08);
  }

  .tc-drop-check {
    flex-shrink: 0;
    color: $primary-color;
  }
}

/* 展开详情 */
.tc-detail {
  margin-top: 6px;
  padding: 8px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tc-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.tc-label {
  font-size: 10px;
  font-weight: 600;
  color: $text-secondary;
  letter-spacing: 0.5px;
}

.tc-full {
  margin: 0;
  font-size: 12px;
  line-height: 1.6;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 96px;
  overflow-y: auto;
}

/* 底部元信息行：语言对/引擎/来源链接/时间/复制 icon；空间不足自动换行 */
.tc-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  font-size: 10px;
  color: $text-secondary;

  .tc-meta-lang {
    color: $text-primary;
    font-weight: 500;
  }
}

/* 来源链接（a 标签，点击在浏览器页导航跳转） */
.tc-link {
  color: $primary-color;
  text-decoration: none;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}
</style>
