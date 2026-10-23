<template>
  <!-- @ 引用技能 / 专家 / 连接器浮层（被动展示型：与 # 文件浮层同构，
       输入焦点留在主输入框，搜索词由父层从文本中解析后传入；
       键盘事件由父层转发）。两阶段：root = @Skill / @Expert / @Connector
       入口（→ 或 Enter 展开），skill / expert / connector = 对应分类条目
       列表（打字过滤，Enter 确认插入内联 tag） -->
  <div v-if="visible" class="am-pop" @mousedown.prevent>
    <div class="am-list" ref="listEl">
      <!-- 阶段一：入口菜单（@Skill / @Expert / @Connector） -->
      <template v-if="phase === 'root'">
        <div v-if="!rootEntries.length" class="am-tip">没有匹配的入口</div>
        <div
          v-for="(en, i) in rootEntries"
          :key="en.kind"
          class="am-item am-root"
          :class="{ active: i === activeIndex }"
          @click="$emit('expand', en.kind)"
          @mousemove="activeIndex = i"
        >
          <svg class="am-icon" aria-hidden="true"><use :xlink:href="'#icon-' + en.icon" /></svg>
          <span class="am-token">@{{ en.word }}</span>
          <span class="am-root-desc">{{ en.desc }}</span>
          <svg-icon icon-class="arrow-right" class="am-root-arrow" />
        </div>
      </template>

      <!-- 阶段二：分类条目列表 -->
      <template v-else>
        <div v-if="loading" class="am-tip"><i class="am-spin"></i>正在加载…</div>
        <div v-else-if="error" class="am-tip am-err">{{ error }}</div>
        <template v-else>
          <div v-if="!filtered.length" class="am-tip">{{ emptyTip }}</div>
          <template v-else>
            <div
              v-for="(it, i) in filtered"
              :key="phase + ':' + it.id"
              class="am-item"
              :class="{ active: i === activeIndex }"
              @click="pick(it)"
              @mousemove="activeIndex = i"
            >
              <svg class="am-icon" aria-hidden="true"><use :xlink:href="'#icon-' + iconOf" /></svg>
              <span class="am-name" :title="it.id">{{ it.name }}</span>
              <span v-if="it.builtin" class="am-sys-tag">系统</span>
              <span class="am-desc" :title="it.desc">{{ it.desc }}</span>
            </div>
          </template>
        </template>
      </template>
    </div>
    <div class="am-foot">{{ phase === 'root' ? '↑↓ 选择 · → 或 Enter 展开 · Esc 关闭' : '↑↓ 选择 · Enter 确认 · ← 返回 · Esc 关闭' }}</div>
  </div>
</template>

<script setup>
// @ 引用条目选择浮层（被动模式，两阶段菜单，与 AtFilePopover 同构）：
// - phase='root'：@Skill / @Expert / @Connector 三个入口，→ / Enter / 点击 展开（上抛 expand）
// - phase='skill' / 'expert' / 'connector'：对应分类条目，Enter / 点击 确认（上抛 select）
// - 呈现「我的」已装/已接入数据 + 系统内置资源（builtin 标识 → 条目带「系统」tag）：
//   技能（本地 skills 目录，包成员折叠）、专家（本地 agents 目录）、
//   连接器（mcp.json 已注册 + 内置常开连接器）
// - 数据经 IPC 拉取：listSkills / agents.list / connectors.list，
//   每次浮层呼起重拉一次（本地扫描轻量，保证新增条目即时可见），呼出期间缓存
import { ref, computed, watch, nextTick } from 'vue'

defineOptions({ name: 'AtMentionPopover' })

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  // 当前阶段：root（入口）/ skill（技能）/ expert（专家）/ connector（连接器）
  phase: {
    type: String,
    default: 'root'
  },
  // 搜索词（@token 中冒号后已键入的字符，随输入实时变化；root 阶段为入口前缀）
  query: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['select', 'expand'])

const activeIndex = ref(0)
const loading = ref(false)
const error = ref('')
const items = ref([])
const listEl = ref(null)

// 阶段元数据：入口词（token 前缀）/ sprite 图标 / 说明
const KINDS = [
  { kind: 'skill', word: 'Skill', icon: 'skill', desc: '引用技能' },
  { kind: 'expert', word: 'Expert', icon: 'user', desc: '引用专家（子代理）' },
  { kind: 'connector', word: 'Connector', icon: 'connection', desc: '引用连接器（MCP 服务）' }
]

const iconOf = computed(() => {
  const k = KINDS.find(x => x.kind === props.phase)
  return k ? k.icon : 'skill'
})

// 阶段一入口，按已键入前缀过滤（子序列匹配，如 sk → Skill）
const rootEntries = computed(() => {
  const q = String(props.query || '').trim().toLowerCase()
  if (!q) return KINDS
  return KINDS.filter(en => matchSeq(en.word.toLowerCase(), q))
})

// 阶段二：条目过滤（名称命中优先 / 描述命中次之，字符顺序子序列，上限 50）
const filtered = computed(() => {
  const q = String(props.query || '').trim().toLowerCase()
  if (!q) return items.value.slice(0, 50)
  const nameHits = []
  const descHits = []
  for (const it of items.value) {
    if (nameHits.length + descHits.length >= 50) break
    if (matchSeq(String(it.name || '').toLowerCase(), q)) nameHits.push(it)
    else if (matchSeq(String(it.desc || '').toLowerCase(), q)) descHits.push(it)
  }
  return nameHits.concat(descHits)
})

// 空态提示：无搜索词 = 本类暂无数据（引导去创建/接入）；有搜索词 = 无匹配
const emptyTip = computed(() => {
  if (String(props.query || '').trim()) return '没有匹配的条目'
  if (props.phase === 'skill') return '暂无技能，可先在「技能」页创建或从市场安装'
  if (props.phase === 'expert') return '暂无专家，可先在「市场 · 专家」页创建或安装'
  if (props.phase === 'connector') return '暂无已连接的连接器，可先在「连接器」页接入'
  return '没有匹配的条目'
})

function matchSeq(text, q) {
  if (!q) return true
  let i = 0
  for (let j = 0; j < text.length && i < q.length; j++) {
    if (text[j] === q[i]) i++
  }
  return i === q.length
}

// 呼起重置缓存（重拉最新）；进入列表阶段懒加载；搜索词/阶段变化重置选中项
let cache = null
let inflight = null

watch(() => props.visible, v => {
  if (v) cache = {}
  if (v && props.phase !== 'root') loadList()
})
watch(() => [props.query, props.phase], () => {
  activeIndex.value = 0
  if (props.visible && props.phase !== 'root') loadList()
})

// 拉取当前分类条目并归一为 {id, name, desc, builtin}
// - skill：目录名作 id（token 契约值），包成员（packageOf 非空）折叠不列出；
//   系统内置技能带 builtin 标识（管理页不展示，仅 @ 引用可见）
// - expert：相对文件路径作 id（builtin/ 前缀 = 系统内置）
// - connector：已接入的（mcp.json 已注册）+ 内置常开连接器（builtin: true）
async function loadList() {
  const api = window.electronAPI && window.electronAPI.omnibuddy
  if (!api) {
    error.value = '需要 OmniDeck 桌面端'
    return
  }
  const kind = props.phase
  if (!cache) cache = {}
  if (cache[kind]) {
    items.value = cache[kind]
    return
  }
  if (inflight) return inflight
  loading.value = true
  error.value = ''
  inflight = (async () => {
    let list = []
    try {
      if (kind === 'skill') {
        const all = (await api.listSkills()) || []
        list = all
          .filter(s => !s.packageOf)
          .map(s => ({ id: s.dir, name: s.name || s.dir, desc: s.description || '', builtin: !!s.builtin }))
      } else if (kind === 'expert') {
        const all = (await api.agents.list()) || []
        list = all.map(a => ({ id: a.file, name: a.name, desc: a.description || '', builtin: !!a.builtin }))
      } else if (kind === 'connector') {
        const all = (await api.connectors.list()) || []
        list = all
          .filter(c => c.connected)
          .map(c => ({ id: c.id, name: c.name, desc: c.description || '', builtin: !!c.builtin }))
      }
    } catch (e) {
      list = []
    }
    cache[kind] = list
    loading.value = false
    inflight = null
    if (props.phase === kind) items.value = list
  })()
  return inflight
}

// 父层转发的键盘操作（↑↓ 移动）
function move(delta) {
  const list = props.phase === 'root' ? rootEntries.value : filtered.value
  const n = list.length
  if (!n) return
  activeIndex.value = (activeIndex.value + delta + n) % n
  nextTick(() => {
    if (!listEl.value) return
    const el = listEl.value.querySelector('.am-item.active')
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
  const it = filtered.value[activeIndex.value]
  if (it) pick(it)
}

function pick(it) {
  emit('select', { kind: props.phase, id: it.id, name: it.name })
}

defineExpose({ move, confirm })
</script>

<style lang="scss" scoped>
/* 与 # 文件浮层（AtFilePopover）同构的样式：同锚定、同圆角阴影、同条目节奏 */
.am-pop {
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

.am-list {
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

.am-tip {
  padding: 22px 0;
  text-align: center;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.am-err {
  color: #e25252;
}

.am-spin {
  width: 11px;
  height: 11px;
  border-radius: 50%;
  border: 1.5px solid rgba(var(--primary-color-rgb), 0.25);
  border-top-color: var(--primary-color);
  animation: am-rotate 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes am-rotate {
  to {
    transform: rotate(360deg);
  }
}

.am-item {
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

/* 阶段一入口：@Skill / @Expert / @Connector（token 主色强调 + 说明 + 右箭头） */
.am-root {
  .am-token {
    flex-shrink: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--primary-color);
  }

  .am-root-desc {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .am-root-arrow {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }
}

/* 分类图标（sprite 单色）：列表条目弱化、入口主色强调 */
.am-icon {
  flex-shrink: 0;
  width: 22px;
  height: 22px;
  fill: var(--text-secondary);
}

.am-root .am-icon {
  fill: var(--primary-color);
}

.am-name {
  flex-shrink: 1;
  min-width: 40px;
  font-size: 12.5px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 40%;
}

/* 系统内置标识（名称右侧）：随包分发、只读 */
.am-sys-tag {
  flex-shrink: 0;
  padding: 0 6px;
  font-size: 10px;
  font-weight: 600;
  line-height: 16px;
  border-radius: 4px;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  border: 1px solid rgba(var(--primary-color-rgb), 0.3);
}

.am-desc {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.am-foot {
  padding: 7px 14px;
  border-top: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-secondary);
  user-select: none;
}
</style>
