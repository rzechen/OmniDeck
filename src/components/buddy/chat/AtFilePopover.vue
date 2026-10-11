<template>
  <!-- # 引用工作空间条目浮层（被动展示型：输入焦点留在主输入框，
       搜索词由父层从文本中解析后传入；键盘事件由父层转发）。
       两阶段：root = #Folder / #File 入口（→ 或 Enter 展开），
       dir / file = 对应分类条目列表（打字过滤，Enter 确认插入 tag） -->
  <div v-if="visible" class="af-pop" @mousedown.prevent>
    <div class="af-list" ref="listEl">
      <!-- 阶段一：入口菜单（#Folder / #File） -->
      <template v-if="phase === 'root'">
        <div v-if="!rootEntries.length" class="af-tip">没有匹配的入口</div>
        <div
          v-for="(en, i) in rootEntries"
          :key="en.kind"
          class="af-item af-root"
          :class="{ active: i === activeIndex }"
          @click="$emit('expand', en.kind)"
          @mousemove="activeIndex = i"
        >
          <img class="af-icon" :src="en.kind === 'dir' ? folderIcon : fileIcon('doc.txt')" alt="" draggable="false" />
          <span class="af-token">#{{ en.kind === 'dir' ? 'Folder' : 'File' }}</span>
          <span class="af-root-desc">{{ en.kind === 'dir' ? '引用工作空间文件夹' : '引用工作空间文件' }}</span>
          <svg-icon icon-class="arrow-right" class="af-root-arrow" />
        </div>
      </template>

      <!-- 阶段二：分类条目列表 -->
      <template v-else>
        <div v-if="loading" class="af-tip"><i class="af-spin"></i>正在扫描工作空间…</div>
        <div v-else-if="error" class="af-tip af-err">{{ error }}</div>
        <div v-else-if="!filtered.length" class="af-tip">没有匹配的条目</div>
        <template v-else>
          <div
            v-for="(f, i) in filtered"
            :key="(f.isDir ? 'd:' : 'f:') + f.path"
            class="af-item"
            :class="{ active: i === activeIndex }"
            @click="pick(f)"
            @mousemove="activeIndex = i"
          >
            <img class="af-icon" :src="f.isDir ? folderIcon : iconOf(f.path)" alt="" draggable="false" />
            <span class="af-name" :title="f.path">{{ f.isDir ? (f.path ? baseName(f.path) : '整个工作空间') : baseName(f.path) }}</span>
            <span class="af-dir" :title="dirOf(f.path)">{{ f.isDir ? dirOf(f.path) || '根目录' : dirOf(f.path) }}</span>
            <span class="af-size">{{ f.isDir ? '' : formatSize(f.size) }}</span>
          </div>
          <div v-if="truncated" class="af-trunc">文件较多，仅索引前 2000 个</div>
        </template>
      </template>
    </div>
    <div class="af-foot">{{ phase === 'root' ? '↑↓ 选择 · → 或 Enter 展开 · Esc 关闭' : '↑↓ 选择 · Enter 确认 · ← 返回 · Esc 关闭' }}</div>
  </div>
</template>

<script setup>
// # 引用条目选择浮层（被动模式，两阶段菜单）：
// - phase='root'：#Folder / #File 两个入口，→ / Enter / 点击 展开（上抛 expand）
// - phase='dir' / 'file'：对应分类条目，Enter / 点击 确认（上抛 select）
// - 搜索词由父层从输入框文本解析传入；键盘 ↑↓/Enter/→/← 由父层经 ref 调用
// - 文件树按 workspaceDir 懒加载缓存一次，切空间自动失效重拉
import { ref, computed, watch, nextTick } from 'vue'
import { fileIcon, formatSize, FOLDER_ICON } from '@/utils/ui/file-meta'

defineOptions({ name: 'AtFilePopover' })

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  // 当前阶段：root（入口）/ dir（文件夹列表）/ file（文件列表）
  phase: {
    type: String,
    default: 'root'
  },
  // 工作空间根目录（绝对路径），空则提示先选空间
  workspaceDir: {
    type: String,
    default: ''
  },
  // 搜索词（#token 中冒号后已键入的字符，随输入实时变化；root 阶段为入口前缀）
  query: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['select', 'expand'])

const activeIndex = ref(0)
const loading = ref(false)
const error = ref('')
const files = ref([])
const dirs = ref([])
const truncated = ref(false)
const listEl = ref(null)
const folderIcon = FOLDER_ICON

// 阶段一入口（#Folder / #File），按已键入前缀过滤（子序列匹配，如 fo → Folder）
const rootEntries = computed(() => {
  const q = props.query.trim().toLowerCase()
  const all = [
    { kind: 'dir', label: 'folder' },
    { kind: 'file', label: 'file' }
  ]
  if (!q) return all
  return all.filter(en => matchSeq(en.label, q))
})

// 阶段二：对应分类条目（目录命中/文件名命中/路径命中分级，字符顺序子序列）
const filtered = computed(() => {
  const q = props.query.trim().toLowerCase()
  if (props.phase === 'dir') {
    const list = dirs.value
    if (!q) return list.slice(0, 50)
    return list.filter(d => matchSeq(d.path.toLowerCase(), q)).slice(0, 50)
  }
  if (props.phase === 'file') {
    if (!q) return files.value.slice(0, 50)
    const nameHits = []
    const pathHits = []
    for (const f of files.value) {
      if (nameHits.length + pathHits.length >= 50) break
      const name = baseName(f.path).toLowerCase()
      if (matchSeq(name, q)) nameHits.push(f)
      else if (matchSeq(f.path.toLowerCase(), q)) pathHits.push(f)
    }
    return nameHits.concat(pathHits)
  }
  return []
})

function matchSeq(text, q) {
  if (!q) return true
  let i = 0
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) i++
  }
  return i === q.length
}

// 打开或进入列表阶段时懒加载文件树；搜索词/阶段变化重置选中项
watch(() => props.visible, v => {
  if (v && props.phase !== 'root') loadTree()
})
watch(() => [props.query, props.phase], () => {
  activeIndex.value = 0
  if (props.visible && props.phase !== 'root') loadTree()
})

// 切换工作空间：缓存失效
watch(() => props.workspaceDir, () => {
  files.value = []
  dirs.value = []
  truncated.value = false
})

let treePromise = null

async function loadTree() {
  const api = window.electronAPI && window.electronAPI.omnibuddy
  const filesApi = api && api.files
  if (!filesApi || !filesApi.listTree) {
    error.value = '需要 OmniDeck 桌面端'
    return
  }
  if (!props.workspaceDir) {
    error.value = '请先选择工作空间'
    return
  }
  if (files.value.length || dirs.value.length) return
  if (treePromise) return treePromise
  loading.value = true
  error.value = ''
  treePromise = filesApi.listTree(props.workspaceDir).then(res => {
    treePromise = null
    loading.value = false
    if (!res || !res.ok) {
      error.value = (res && res.error) || '读取文件列表失败'
      return
    }
    files.value = (res.files || []).map(f => Object.assign({ isDir: false }, f))
    dirs.value = (res.dirs || []).map(d => Object.assign({ isDir: true, count: 0 }, d))
    truncated.value = !!res.truncated
  }).catch(() => {
    treePromise = null
    loading.value = false
    error.value = '读取文件列表失败'
  })
  return treePromise
}

// 父层转发的键盘操作（↑↓ 移动）
function move(delta) {
  const list = props.phase === 'root' ? rootEntries.value : filtered.value
  const n = list.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  nextTick(() => {
    if (!listEl.value) return
    const el = listEl.value.querySelector('.af-item.active')
    if (el) el.scrollIntoView({ block: 'nearest' })
  })
}

// Enter 确认：root 阶段 = 展开高亮入口；列表阶段 = 选中条目
function confirm() {
  if (props.phase === 'root') {
    const en = rootEntries.value[activeIndex.value]
    if (en) emit('expand', en.kind)
    return
  }
  const f = filtered.value[activeIndex.value]
  if (f) pick(f)
}

function pick(f) {
  const root = props.workspaceDir.replace(/\/+$/, '')
  const abs = f.path ? root + '/' + f.path : root
  emit('select', { path: f.path, abs, isDir: !!f.isDir })
}

// 文件名/目录拆分展示
function baseName(p) {
  const i = p.lastIndexOf('/')
  return i < 0 ? p : p.slice(i + 1)
}
function dirOf(p) {
  const i = p.lastIndexOf('/')
  return i < 0 ? '' : p.slice(0, i)
}
function iconOf(p) {
  return fileIcon(baseName(p))
}

defineExpose({ move, confirm })
</script>

<style lang="scss" scoped>
.af-pop {
  position: absolute;
  left: 0;
  right: 0;
  bottom: calc(100% + 8px);
  z-index: 30;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color);
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.14);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.af-list {
  max-height: 262px;
  overflow-y: auto;
  padding: 6px;

  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.15);
    border-radius: 3px;
  }
}

.af-tip {
  padding: 22px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.af-err {
  color: #e25252;
}

.af-spin {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1.5px solid rgba(var(--primary-color-rgb), 0.25);
  border-top-color: var(--primary-color);
  animation: af-rotate 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes af-rotate {
  to {
    transform: rotate(360deg);
  }
}

.af-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 10px;
  border-radius: 9px;
  cursor: pointer;

  &:hover,
  &.active {
    background: rgba(var(--primary-color-rgb), 0.08);
  }
}

/* 阶段一入口：#Folder / #File（token 主色强调 + 说明 + 右箭头） */
.af-root {
  .af-token {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-color);
  }

  .af-root-desc {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .af-root-arrow {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.af-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.af-name {
  flex-shrink: 1;
  min-width: 40px;
  font-size: 12.5px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}

.af-dir {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  direction: rtl; // 长路径从尾部截断（保留最近的目录名）
  text-align: left;
}

.af-size {
  flex-shrink: 0;
  font-size: 10.5px;
  color: var(--text-secondary);
}

.af-trunc {
  padding: 8px 0 4px;
  text-align: center;
  font-size: 11px;
  color: var(--text-secondary);
}

.af-foot {
  padding: 7px 14px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-secondary);
  user-select: none;
}
</style>
