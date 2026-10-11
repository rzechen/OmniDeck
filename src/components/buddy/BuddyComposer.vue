<template>
  <div class="bc-composer">
    <!-- 输入容器：豆包风格大圆角气泡（拖入文件时高亮提示） -->
    <div
      class="bc-box"
      :class="{ focus: isFocus, drag: isDrag }"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <!-- 划选追问引用条（消息区划选后点「追问」：引用原文置顶展示，可关闭） -->
      <div v-if="quote" class="bc-quote">
        <div class="bc-quote-body">
          <div class="bc-quote-label">引用</div>
          <div class="bc-quote-text" :title="quote">{{ quote }}</div>
        </div>
        <button class="bc-quote-close" title="移除引用" @click="emit('remove-quote')">
          <svg-icon icon-class="close" />
        </button>
      </div>

      <!-- 待发送文件附件条（"+"选择/拖拽/粘贴导入：图片与文件统一卡片样式，
           图标按后缀映射，与工作空间文件列表一致；文件名下显示大小与解析态）
           # 引用不在此渲染——以内联 tag 呈现在下方输入框正文中 -->
      <div v-if="fileCards.length" class="bc-attachments">
        <div v-for="c in fileCards" :key="c.f.id || c.i" class="bc-attachment" :class="{ failed: c.f.parseStatus === 'failed' }">
          <img v-if="c.f.kind === 'image' && c.f.thumb" class="bc-attachment-thumb" :src="c.f.thumb" alt="" draggable="false" />
          <img v-else class="bc-attachment-thumb" :src="fileIcon(c.f.name)" alt="" draggable="false" />
          <span class="bc-file-info">
            <span class="bc-file-name" :title="c.f.name">{{ c.f.name }}</span>
            <span class="bc-file-meta">
              <template v-if="c.f.parseStatus === 'parsing'"><i class="bc-spin"></i>解析中…</template>
              <template v-else-if="c.f.parseStatus === 'failed'">解析失败，发送时重试</template>
              <template v-else-if="c.f.parseStatus === 'ready'">
                <svg class="bc-ok" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ formatSize(c.f.size) }} · 已解析<template v-if="c.f.chars">约{{ formatChars(c.f.chars) }}字</template>
              </template>
              <template v-else>{{ formatSize(c.f.size) }}</template>
            </span>
          </span>
          <button class="bc-attachment-remove" title="移除" @click="emit('remove-file', c.i)">
            <svg-icon icon-class="close" />
          </button>
        </div>
      </div>

      <!-- # 引用工作空间条目浮层（被动展示：焦点留在输入框，键盘事件经 onKeydown 转发；
           两阶段：root = #Folder/#File 入口，dir/file = 分类条目列表） -->
      <at-file-popover
        ref="atPop"
        :visible="atOpen"
        :phase="atPhase"
        :workspace-dir="atWorkspaceDir"
        :query="atQuery"
        @expand="onAtExpand"
        @select="onAtSelect"
      />

      <!-- 富文本输入区：contenteditable（# 引用 tag 以不可编辑原子节点内联，
           与文字自然穿插、Backspace 整体删除）；序列化文本随 v-model 落草稿；
           流式生成中置 contenteditable=false 锁定输入；
           composition 事件跟踪中文输入法组合态（组合中回车 = 确认候选词，不发送） -->
      <div
        ref="edit"
        class="bc-edit"
        :contenteditable="!streaming"
        :data-ph="actualPlaceholder"
        spellcheck="false"
        @input="onInput"
        @focus="isFocus = true"
        @blur="onBlur"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
        @keydown="onKeydown"
        @paste="onPaste"
      ></div>

      <!-- 底部工具栏：左扩展（工作空间/模型选择等经插槽注入） + 右发送 -->
      <div class="bc-toolbar">
        <div class="bc-tools">
          <slot name="tools"></slot>
          <button
            v-if="attachEnabled"
            class="bc-tool-btn"
            title="添加附件（图片 / 文本 / PDF，支持拖入）"
            @click="emit('pick')"
          >
            <svg-icon icon-class="circle-plus-outline" />
          </button>
        </div>

        <!-- 发送 / 停止：同一位置，流式生成时切换为停止 -->
        <button
          v-if="!streaming"
          class="bc-send"
          :class="{ ready: canSend }"
          :title="canSend ? '发送（Enter）' : '输入内容后发送'"
          @click="onSend"
        >
          <svg-icon icon-class="top" />
        </button>
        <button
          v-else
          class="bc-send bc-stop"
          title="停止生成"
          @click="emit('stop')"
        >
          <svg-icon icon-class="stop" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// OmniBuddy 对话输入框：豆包风格（大圆角气泡 + 左工具 + 右下圆形发送）
// # 引用：输入 # 上拉两阶段菜单（#Folder / #File → 条目列表），
// 选中后以内联 tag（不可编辑原子节点）插入正文，与文字穿插呈现；
// 序列化为 #Folder:相对路径 / #File:相对路径 token 随草稿落盘，可完整往返
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { fileIcon, formatSize, FOLDER_ICON } from '@/utils/ui/file-meta'
import AtFilePopover from '@/components/buddy/chat/AtFilePopover.vue'

defineOptions({ name: 'BuddyComposer' })

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '有问题尽管问（# 可引用工作空间文件 / 文件夹）'
  },
  // 流式生成中：发送按钮切换为停止按钮
  streaming: {
    type: Boolean,
    default: false
  },
  // 附加可发送条件（如已有粘贴/拖拽附件时无文本也允许发送）
  extraSendable: {
    type: Boolean,
    default: false
  },
  // 待发送文件附件（[{id,name,size,kind,thumb}]）：图片缩略图 + 文本/PDF 文件胶囊
  files: {
    type: Array,
    default: null
  },
  // 是否展示"+"附件按钮（快捷面板等场景可关闭）
  attachEnabled: {
    type: Boolean,
    default: true
  },
  // 划选追问引用的原文（非空时在输入框顶部展示引用条，随消息一并发送）
  quote: {
    type: String,
    default: ''
  },
  // # 引用：工作空间根目录（空则浮层提示先选空间）
  atWorkspaceDir: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'send', 'stop', 'pick', 'import-file', 'remove-quote', 'remove-file'])

const isFocus = ref(false)
const isDrag = ref(false)
// 中文输入法组合中（组合态回车 = 确认候选词，不触发发送）
const isComposing = ref(false)
const edit = ref(null)

// 附件卡（粘贴/拖拽/“+”导入）；# 引用不再是附件——内联在输入框正文中
const fileCards = computed(() => {
  if (!Array.isArray(props.files)) return []
  return props.files.map((f, i) => ({ f, i }))
})

// ===== # 引用内联 tag（contenteditable 不可编辑原子节点） =====
// token 契约：#Folder:相对路径（根目录存 /） / #File:相对路径
// —— chip 只显示末级名称 + 类型图标（可见文本与 token 不同长，
//    光标偏移由 getCaretOffset/setCaretOffset 按 token 长度显式换算）
const TOKEN_RE = /#(Folder|File):([^\s#]+)/g

function chipToken(kind, path) {
  return '#' + (kind === 'dir' ? 'Folder' : 'File') + ':' + path
}

// 生成内联 tag 节点（data-* 随节点留存：发送时收集 atRefs）
function makeChip(kind, rel, abs) {
  const path = rel === '' ? '/' : rel
  // 根目录（rel 归一为 '/'）显示「整个工作空间」，避免 split 得空名
  const name = (rel === '' || rel === '/') ? '整个工作空间' : rel.split('/').pop()
  const el = document.createElement('span')
  el.className = 'bc-chip' + (kind === 'dir' ? ' dir' : '')
  el.contentEditable = 'false'
  el.dataset.kind = kind
  el.dataset.path = path
  el.dataset.abs = abs || ''
  el.dataset.name = name
  const icon = document.createElement('img')
  icon.className = 'bc-chip-ico'
  icon.src = kind === 'dir' ? FOLDER_ICON : fileIcon(name)
  icon.alt = ''
  icon.draggable = false
  el.appendChild(icon)
  const label = document.createElement('span')
  label.className = 'bc-chip-name'
  label.textContent = name
  el.appendChild(label)
  return el
}

// DOM → 序列化文本（chip → token，文本节点原样）
function serializeDom(el) {
  let out = ''
  el.childNodes.forEach(n => {
    if (n.nodeType === Node.TEXT_NODE) out += n.data
    else if (n.classList && n.classList.contains('bc-chip')) out += chipToken(n.dataset.kind, n.dataset.path)
    else out += n.textContent
  })
  return out
}

// 序列化文本 → DOM（token → chip；用于挂载初始渲染、外部赋值回填与文本级编辑重建）
// chip 的绝对路径由 工作空间根目录 + 相对路径 恢复（token 只含 rel，
// 全量重建不能丢 abs —— 发送时 collectAtRefs 依赖它，气泡预览反查同源）
function renderFromText(el, text, root) {
  const frag = document.createDocumentFragment()
  const wsRoot = String(root || '')
  TOKEN_RE.lastIndex = 0
  let last = 0
  let m
  const src = String(text || '')
  while ((m = TOKEN_RE.exec(src))) {
    if (m.index > last) frag.appendChild(document.createTextNode(src.slice(last, m.index)))
    const rel = m[2]
    const abs = wsRoot ? (rel === '/' ? wsRoot : wsRoot + '/' + rel) : ''
    frag.appendChild(makeChip(m[1] === 'Folder' ? 'dir' : 'file', rel, abs))
    last = TOKEN_RE.lastIndex
  }
  if (last < src.length) frag.appendChild(document.createTextNode(src.slice(last)))
  el.innerHTML = ''
  el.appendChild(frag)
}

// 光标在序列化文本上的偏移。chip 只显示末级名称（可见文本与 token 不同长），
// 不能再用 Range.toString() 直测——先序遍历显式换算：
// 正文文本节点计 data 长度，chip 原子计 token 长度（chip 内文本不计）
function getCaretOffset(el) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const r = sel.getRangeAt(0)
  if (!el.contains(r.endContainer)) return null
  let out = 0
  const walk = (parent) => {
    const len = parent.childNodes.length
    for (let i = 0; i <= len; i++) {
      // 光标终点停在该子节点之前（含末尾）——累计到此为止
      if (r.endContainer === parent && r.endOffset === i) return true
      if (i === len) break
      const n = parent.childNodes[i]
      if (n.nodeType === Node.TEXT_NODE) {
        if (r.endContainer === n) { out += Math.min(r.endOffset, n.data.length); return true }
        out += n.data.length
      } else if (n.nodeType === Node.ELEMENT_NODE && n.classList && n.classList.contains('bc-chip')) {
        out += chipToken(n.dataset.kind, n.dataset.path).length
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        if (walk(n)) return true
      }
    }
    return false
  }
  walk(el)
  return out
}

// 光标落到序列化偏移处（同一坐标系换算：落点在 chip 占位内时移到 chip
// 之后——chip 不可编辑，光标不能停留在其内部）
function setCaretOffset(el, offset) {
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  let remaining = offset
  let placed = false
  const walk = (parent) => {
    for (let i = 0; i < parent.childNodes.length; i++) {
      const n = parent.childNodes[i]
      if (n.nodeType === Node.TEXT_NODE) {
        if (remaining <= n.data.length) { range.setStart(n, remaining); range.collapse(true); return true }
        remaining -= n.data.length
      } else if (n.nodeType === Node.ELEMENT_NODE && n.classList && n.classList.contains('bc-chip')) {
        const len = chipToken(n.dataset.kind, n.dataset.path).length
        if (remaining <= len) { range.setStartAfter(n); range.collapse(true); return true }
        remaining -= len
      } else if (n.nodeType === Node.ELEMENT_NODE) {
        if (walk(n)) return true
      }
    }
    return false
  }
  placed = walk(el)
  if (!placed) {
    range.selectNodeContents(el)
    range.collapse(false)
  }
  sel.removeAllRanges()
  sel.addRange(range)
}

// 发送时从 DOM 收集 # 引用清单（按绝对路径去重；rel 供气泡 token 反查）
function collectAtRefs(el) {
  const seen = Object.create(null)
  const out = []
  el.querySelectorAll('.bc-chip').forEach(c => {
    const abs = c.dataset.abs || ''
    if (abs && seen[abs]) return
    if (abs) seen[abs] = 1
    out.push({
      name: c.dataset.name || '',
      kind: c.dataset.kind === 'dir' ? 'dir' : 'file',
      path: abs, // 真实绝对路径（主进程拼路径块，模型按需用工具读取）
      rel: c.dataset.path || '' // 与 token 中的相对路径一致（根目录为 /）
    })
  })
  return out
}

// ===== # 触发检测（两阶段状态机，由「光标前的文本」解析，无内部输入状态） =====
// root：# 后未跟 Folder:/File: 前缀（入口菜单，打字过滤入口）
// dir / file：#Folder: / #File: 后（条目列表，打字过滤）
const atOpen = ref(false)
const atPhase = ref('root') // root | dir | file
const atQuery = ref('')
const atStart = ref(-1) // 触发 # 在序列化文本中的下标
const atPop = ref(null)

function syncHash(text, caret) {
  if (typeof caret !== 'number' || caret <= 0) {
    atOpen.value = false
    return
  }
  const before = text.slice(0, caret)
  // # 前须行首/空白（防误触），# 与光标之间无空白/#
  const m = before.match(/(?:^|\s)#((?:Folder|File):)?([^\s#]*)$/)
  if (!m) {
    atOpen.value = false
    return
  }
  atStart.value = caret - m[0].length + (m[0].startsWith('#') ? 0 : 1)
  atQuery.value = m[2]
  atPhase.value = m[1] === 'Folder:' ? 'dir' : (m[1] === 'File:' ? 'file' : 'root')
  atOpen.value = true
}

// 文本级编辑后整体重渲染（chip 与文本的映射是纯字符串级的，
// 序列化文本即唯一事实源；重渲染 + 光标复位，简单且确定）
function applyText(nextText, caretOffset) {
  const el = edit.value
  renderFromText(el, nextText, props.atWorkspaceDir)
  setCaretOffset(el, caretOffset)
  emit('update:modelValue', nextText)
  nextTick(autoResize)
}

// 阶段一 → 阶段二：把触发片段替换为 #Folder: / #File: 前缀（浮层保持打开）
function onAtExpand(kind) {
  const el = edit.value
  const text = serializeDom(el)
  const caret = getCaretOffset(el)
  const end = typeof caret === 'number' ? caret : atStart.value + 1
  const insert = '#' + (kind === 'dir' ? 'Folder' : 'File') + ':'
  applyText(text.slice(0, atStart.value) + insert + text.slice(end), atStart.value + insert.length)
  atPhase.value = kind === 'dir' ? 'dir' : 'file'
  atQuery.value = ''
  atOpen.value = true
}

// 阶段二选中条目：触发片段替换为内联 tag（前后补空格防 token 与文字粘连）
function onAtSelect(f) {
  const el = edit.value
  const text = serializeDom(el)
  const caret = getCaretOffset(el)
  const end = typeof caret === 'number' ? caret : atStart.value + 1
  const rel = f.path === '' ? '/' : f.path
  const kind = f.isDir ? 'dir' : 'file'
  const token = chipToken(kind, rel)
  const before = text.slice(0, atStart.value)
  const after = text.slice(end)
  const padL = before && !/\s$/.test(before) ? ' ' : ''
  // chip 后总是补一个空格：光标落空格后，直接打字不会拼进 token 呼出引用浮层
  const padR = !after || !/^\s/.test(after) ? ' ' : ''
  applyText(before + padL + token + padR + after, atStart.value + padL.length + token.length + padR.length)
  atOpen.value = false
}

// 阶段二 ← 回退：触发片段缩回 #（回入口菜单）
function onAtBack() {
  const el = edit.value
  const text = serializeDom(el)
  const caret = getCaretOffset(el)
  const end = typeof caret === 'number' ? caret : atStart.value + 1
  applyText(text.slice(0, atStart.value) + '#' + text.slice(end), atStart.value + 1)
  atPhase.value = 'root'
  atQuery.value = ''
  atOpen.value = true
}

// ===== 输入 / 键盘 =====
function onInput() {
  const el = edit.value
  if (!el) return
  let text = serializeDom(el)
  // 空态清理：Chromium 删空 contenteditable 可能残留 <br>（placeholder 依赖 :empty）
  if (!text && el.innerHTML !== '') el.innerHTML = ''
  emit('update:modelValue', text)
  syncHash(text, getCaretOffset(el))
  nextTick(autoResize)
}

// 统一键盘入口：# 浮层打开时接管 ↑↓/Enter/Esc/→/←，否则回车发送
function onKeydown(e) {
  if (atOpen.value && atPop.value) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      atPop.value.move(e.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (e.key === 'Enter') {
      // 输入法组合中的回车不确认（确认候选词）
      if (isComposing.value || e.isComposing) return
      e.preventDefault()
      atPop.value.confirm()
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      atOpen.value = false
      return
    }
    // →：root 阶段展开高亮入口（列表阶段放行移动光标）
    if (e.key === 'ArrowRight' && atPhase.value === 'root') {
      e.preventDefault()
      atPop.value.confirm()
      return
    }
    // ←：列表阶段且光标在触发片段末尾时回入口菜单（否则放行移动光标）
    if (e.key === 'ArrowLeft' && atPhase.value !== 'root') {
      const el = edit.value
      const caret = getCaretOffset(el)
      const text = serializeDom(el)
      if (typeof caret === 'number' && !/\s#$/.test(text.slice(0, caret)) && /^[^\s#]/.test(text.slice(caret))) return
      e.preventDefault()
      onAtBack()
      return
    }
    return
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault()
    onEnter(e)
  }
}
// 失焦收起浮层：点浮层条目本身不触发（其 mousedown 已 preventDefault 阻断失焦）
function onBlur() {
  isFocus.value = false
  atOpen.value = false
}
// 回车发送：输入法组合中（确认候选词的回车）不发送。
// Chrome 下确认候选词时 keydown 先于 compositionend 触发且 isComposing 仍为 true，
// 自维护标志与事件原生 isComposing 双重判定兜底（Safari 时序差异）
function onEnter(e) {
  if (isComposing.value || e.isComposing) return
  onSend()
}
// 粘贴：含文件时拦截转附件；纯文本以 insertText 插入（避免富文本 HTML 进输入区）
function onPaste(e) {
  const items = e.clipboardData && e.clipboardData.items
  if (!items) return
  const files = []
  for (const it of items) {
    if (it.kind !== 'file') continue
    const f = it.getAsFile()
    if (f) files.push(f)
  }
  if (files.length) {
    e.preventDefault()
    for (const f of files) emit('import-file', f)
    return
  }
  const text = e.clipboardData && e.clipboardData.getData('text/plain')
  if (text) {
    e.preventDefault()
    document.execCommand('insertText', false, text)
  }
}
// ===== 拖拽导入：File 对象直接上抛（父层统一导入：有磁盘路径按路径、
// 无路径读内容走 Buffer 管道），stopPropagation 避免与页面级拖放区重复处理 =====
function onDragOver(e) {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return
  isDrag.value = true
}
function onDragLeave() {
  isDrag.value = false
}
function onDrop(e) {
  e.stopPropagation()
  isDrag.value = false
  const files = e.dataTransfer && e.dataTransfer.files
  if (!files || !files.length) return
  for (const f of files) emit('import-file', f)
}

// 可发送：剥离 # token 后仍有文字，或存在粘贴/拖拽附件（纯引用不可发，防空消息）
const plainDraft = computed(() => (props.modelValue || '').replace(TOKEN_RE, ' ').trim())
const canSend = computed(() => !!plainDraft.value || props.extraSendable)

// 流式生成中锁定输入（placeholder 同步提示，避免误以为可继续提问）
const actualPlaceholder = computed(() => props.streaming ? '回答生成中，可点击右下角停止…' : props.placeholder)

// 发送：正文 = 序列化文本（含 # token，气泡按 token 渲染内联 tag），
// 引用 = DOM 收集的 atRefs（主进程拼路径块，正文保持用户原文视角）
function onSend() {
  if (!canSend.value) return
  emit('send', props.modelValue, collectAtRefs(edit.value))
}

// 外部赋值回填（如发送后清空草稿 / 切页签恢复草稿）：
// 与 DOM 当前序列化不一致时重渲染（一致则不动 DOM，防光标跳动）
watch(() => props.modelValue, val => {
  const el = edit.value
  if (!el) return
  if (serializeDom(el) !== String(val || '')) {
    renderFromText(el, val || '', props.atWorkspaceDir)
    nextTick(autoResize)
  }
})

onMounted(() => {
  const el = edit.value
  if (!el) return
  renderFromText(el, props.modelValue, props.atWorkspaceDir)
  nextTick(autoResize)
})

// 解析字符数（中文场景直接按字符计）：过万缩为「x.x万」
function formatChars(n) {
  if (!n) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}
// 聚焦输入框（划选追问引用后调用，光标落末尾直接续问）
function focus() {
  const el = edit.value
  if (!el) return
  el.focus()
  setCaretOffset(el, Infinity)
}
// 高度自适应：清零后按 scrollHeight 恢复，下限 68px（与旧版一致），封顶 220px
function autoResize() {
  const el = edit.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.max(68, Math.min(el.scrollHeight, 220)) + 'px'
}

// 父层经 ref 调用 focus 聚焦输入框
defineExpose({ focus })
</script>

<style lang="scss" scoped>
.bc-composer {
  width: 100%;
  max-width: 768px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

/* 输入容器：悬浮卡片式大圆角气泡（1px 细边框 + 轻阴影；hover 边框清晰浮现） */
.bc-box {
  position: relative; /* # 引用浮层锚定 */
  border: 1px solid var(--border-color);
  border-radius: 22px;
  background: var(--card-bg, #fff);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  padding: 12px 12px 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.35);
  }

  &.focus {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.12), 0 4px 18px rgba(var(--primary-color-rgb), 0.1);
  }
}

/* ===== 划选追问引用条（气泡顶部：竖线标 + 引用原文摘要 + 关闭） ===== */
.bc-quote {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 4px 7px 12px;
  border-left: 3px solid rgba(var(--primary-color-rgb), 0.5);
  border-radius: 4px 10px 10px 4px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
}

.bc-quote-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bc-quote-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  user-select: none;
}

.bc-quote-text {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  user-select: text;
}

.bc-quote-close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.12s ease;

  .svg-icon {
    font-size: 11px;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.06);
    color: var(--text-primary);
  }
}

/* 待发送附件条（内置于气泡顶部） */
.bc-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 4px 4px;
}

.bc-attachment {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 44px;
  min-width: 110px;
  max-width: 220px;
  padding: 0 24px 0 5px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
  overflow: hidden;

  /* 解析失败态：红色描边提示 */
  &.failed {
    border-color: rgba(226, 82, 82, 0.5);
  }
}

/* 左侧 30px 预览位：图片缩略图 / 按后缀映射的类型图标（与工作空间一致） */
.bc-attachment-thumb {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  object-fit: contain;
  display: block;
}

/* 文件名 + meta（大小/解析态）纵排 */
.bc-file-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.bc-file-name {
  font-size: 12px;
  line-height: 1.3;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bc-file-meta {
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* 解析中转圈 */
.bc-spin {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid rgba(var(--primary-color-rgb), 0.25);
  border-top-color: var(--primary-color);
  animation: bc-rotate 0.7s linear infinite;
  flex-shrink: 0;
}

/* 解析成功对勾（绿色，与 meta 行内联） */
.bc-ok {
  width: 11px;
  height: 11px;
  color: #22a55e;
  flex-shrink: 0;
}

@keyframes bc-rotate {
  to {
    transform: rotate(360deg);
  }
}

/* 拖拽悬停高亮 */
.bc-box.drag {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.18), 0 4px 18px rgba(var(--primary-color-rgb), 0.12);
}

.bc-attachment-remove {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transition: opacity 0.15s ease;

  .svg-icon {
    font-size: 10px;
  }
}

.bc-attachment:hover .bc-attachment-remove {
  opacity: 1;
}

/* ===== 富文本输入区（contenteditable：文字 + 内联 # 引用 tag） ===== */
.bc-edit {
  width: 100%;
  min-height: 22px;
  max-height: 160px;
  overflow-y: auto;
  outline: none;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-primary);
  font-family: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;

  /* placeholder（空态伪元素呈现） */
  &:empty::before {
    content: attr(data-ph);
    color: var(--text-secondary);
    pointer-events: none;
  }

  &::-webkit-scrollbar {
    width: 4px;
  }

  /* 流式生成中锁定（contenteditable=false）：文字弱化提示 */
  &[contenteditable='false'] {
    cursor: not-allowed;
    -webkit-text-fill-color: var(--text-secondary);
  }
}

/* # 引用内联 tag：不可编辑原子节点（Backspace 整体删除），
   小圆角矩形（非全圆胶囊）；JS 动态创建的节点不带 scoped data-v
   属性，须 :deep 穿透（宿主 .bc-edit 带 data-v）才能命中样式 */
:deep(.bc-chip) {
  display: inline-flex;
  align-items: center;
  height: 22px;
  max-width: 220px;
  padding: 0 7px;
  margin: 0 1px;
  border-radius: 6px;
  border: 1px solid rgba(var(--primary-color-rgb), 0.5);
  background: rgba(var(--primary-color-rgb), 0.06);
  font-size: 12px;
  line-height: 1;
  vertical-align: baseline; /* inline-flex baseline 取内部文字基线，与正文基线对齐即视觉居中 */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: default;
  user-select: all; /* 整体选中，避免光标进入 */

  /* 类型图标：目录 / 文件（替代 #Folder: #File: 文本前缀） */
  .bc-chip-ico {
    flex-shrink: 0;
    width: 11px;
    height: 11px;
    margin-right: 4px;
    pointer-events: none; /* 不拦截点击/拖拽，chip 整体原子 */
  }

  /* 名称省略（title 已提示完整路径） */
  .bc-chip-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 目录引用：填充稍深以示区分 */
  &.dir {
    border-color: rgba(var(--primary-color-rgb), 0.65);
    background: rgba(var(--primary-color-rgb), 0.12);
  }
}

/* 底部工具栏 */
.bc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bc-tools {
  display: flex;
  align-items: center;
  gap: 2px;
}

.bc-tool-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 16px;
  }

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.08);
    color: var(--primary-color);
  }

  &:active {
    transform: scale(0.9);
  }
}

/* 发送按钮：圆形，激活渐变 */
.bc-send {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: var(--border-color, #e5e5e5);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);

  .svg-icon {
    font-size: 15px;
  }

  &.ready {
    background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
    color: #fff;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(var(--primary-color-rgb), 0.35);

    &:hover {
      filter: brightness(1.08);
      transform: translateY(-1px);
    }

    &:active {
      transform: scale(0.88);
    }
  }
}

/* 停止按钮：与发送按钮同位切换，激活渐变外观 */
.bc-stop {
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  color: #fff;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(var(--primary-color-rgb), 0.35);

  .svg-icon {
    font-size: 14px;
  }

  &:hover {
    filter: brightness(1.08);
  }

  &:active {
    transform: scale(0.88);
  }
}
</style>
