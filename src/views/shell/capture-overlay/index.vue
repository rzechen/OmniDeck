<template>
  <!-- picking：透明层直接覆盖真实屏幕（实时交互）；editing：定格帧背景 -->
  <div
    class="capture-overlay"
    :class="{ editing: phase === 'editing' }"
    @mousedown="onRootMouseDown"
    @contextmenu.prevent="onContextMenu"
  >
    <!-- picking：提示文案 -->
    <div v-if="phase === 'picking' && hint && (hint.title || hint.sub)" class="co-hint">
      <div v-if="hint.title" class="co-hint-title">{{ hint.title }}</div>
      <div v-if="hint.sub" class="co-hint-sub">{{ hint.sub }}</div>
    </div>

    <!-- picking：高亮层（拖拽选区 > 锁定窗口 > hover 窗口，遮罩挖洞） -->
    <template v-if="phase === 'picking' && displayRect">
      <div class="co-mask" :style="maskStyle"></div>
      <div class="co-border" :style="rectStyle"></div>
      <div class="co-size" :style="sizeStyle">{{ sizeLabel }}</div>
    </template>

    <!-- editing：整屏定格帧背景 -->
    <div v-if="phase === 'editing'" class="co-frame" :style="{ backgroundImage: `url(${frame})` }"></div>
    <div v-if="phase === 'freezing'" class="co-freezing"><svg-icon icon-class="loading" /></div>

    <template v-if="phase === 'editing' && ready">
      <!-- 选区画布（物理分辨率绘制，CSS 缩放到选区显示大小） -->
      <canvas
        ref="canvas"
        class="co-canvas"
        :width="sel.width"
        :height="sel.height"
        :style="canvasStyle"
        @mousedown="onCanvasMouseDown"
        @mousemove="onCanvasMouseMove"
        @mouseup="onCanvasMouseUp"
        @dblclick="confirm"
      ></canvas>

      <!-- 选区微调手柄（8 控制点） -->
      <div
        v-for="h in selHandles"
        :key="h.id"
        class="co-handle"
        :data-handle="h.id"
        :style="{ left: h.x + 'px', top: h.y + 'px', cursor: h.cursor }"
      ></div>

      <!-- 工具栏（贴选区上方或下方） -->
      <div class="co-bar" :style="barStyle">
        <button
          v-for="t in tools"
          :key="t.id"
          class="co-btn"
          :class="{ active: tool === t.id }"
          :title="t.title"
          @click="tool = t.id"
        >
          <svg viewBox="0 0 24 24" class="co-ico"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="t.path"></g></svg>
        </button>

        <div class="co-div"></div>

        <button
          v-for="c in colors"
          :key="c"
          class="co-color"
          :class="{ active: color === c }"
          :style="{ background: c }"
          @click="color = c"
        ></button>

        <div class="co-div"></div>

        <div class="co-widths">
          <button
            v-for="w in widths"
            :key="w"
            class="co-wbtn"
            :class="{ active: width === w }"
            @click="width = w"
          >
            <span :style="{ width: w + 2 + 'px', height: w + 2 + 'px' }"></span>
          </button>
        </div>

        <div v-if="tool === 'text'" class="co-widths">
          <button
            v-for="f in fontSizes"
            :key="f"
            class="co-wbtn co-fbtn"
            :class="{ active: fontSize === f }"
            :title="'字号 ' + f"
            @click="fontSize = f"
          >{{ f }}</button>
        </div>

        <div class="co-div"></div>

        <button class="co-btn" title="撤销 (⌘Z)" @click="undo"><svg-icon icon-class="refresh-left" /></button>
        <button class="co-btn" title="重做 (⌘⇧Z)" @click="redo"><svg-icon icon-class="refresh-right" /></button>
        <button class="co-btn" title="重选区域 (R)" @click="restartPick">
          <svg viewBox="0 0 24 24" class="co-ico"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/></g></svg>
        </button>

        <div class="co-div"></div>

        <button class="co-btn co-ok" title="确认 (Enter / 双击)" @click="confirm">
          <svg-icon icon-class="check" /><span>确认</span>
        </button>
        <button class="co-btn co-pin" title="贴屏" @click="pin">
          <svg-icon icon-class="pushpin" /><span>贴屏</span>
        </button>
        <button class="co-btn co-no" title="取消 (Esc)" @click="cancel">
          <svg-icon icon-class="close" />
        </button>
      </div>

      <!-- 内联文字输入 -->
      <textarea
        v-if="textEdit"
        ref="textInput"
        v-model="textEdit.value"
        class="co-text-input"
        :style="textEditStyle"
        rows="1"
        @keydown.enter.exact.prevent="commitText"
        @keydown.esc.stop.prevent="cancelText"
        @mousedown.stop
      ></textarea>

      <!-- 尺寸角标 -->
      <div class="co-size" :style="sizeTagStyle">{{ Math.round(sel.width / factor) }} × {{ Math.round(sel.height / factor) }}</div>
    </template>
  </div>
</template>

<script setup>
// 选区截屏覆盖窗（overlay 单窗口全流程，iShot 体验）：
// phase 状态机：
// - picking：透明层直接覆盖真实屏幕，hover 拾取窗口（z 序命中）/ 拖选；
//   空格锁定、Enter/单击截取、Esc/右键取消；窗口列表 400ms 轮询
// - freezing：选定后调 freeze IPC 抓整屏帧（SCK 排除自身，本窗不入镜）
// - editing：定格帧背景 + 选区 Canvas 标注（矩形/椭圆/直线/箭头/画笔/高亮/
//   序号/马赛克/文字，颜色/粗细/字号，撤销重做）+ 8 手柄微调 + 边界环移动；
//   Enter/双击确认、贴屏、R 重选（回 picking 重新框选）、Esc 取消
// 全程同一窗口零切换；确认/贴屏/取消经 capture-overlay:done 回传主进程
import { ref, reactive, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

defineOptions({ name: 'CaptureOverlay' })

const canvas = ref(null)
const textInput = ref(null)

const phase = ref('picking') // picking | freezing | editing
const scrollMode = ref(false) // m=scroll：选完直接回传（无编辑态）
// ---- picking：窗口拾取 ----
const windows = ref([]) // 本屏窗口列表（z 序前→后，屏内相对坐标）
const hoverWin = ref(null)
const pinnedWin = ref(null)
let winTimer = null
let lastHoverAt = 0
const dragging = ref(false)
let start = null
let downPos = null
const rect = ref(null) // 拖拽选区（CSS 坐标）
// ---- editing：定格帧 + 标注 ----
const frame = ref('') // 整屏定格 dataURL
let imgEl = null
const ready = ref(false)
const sel = ref({ x: 0, y: 0, width: 0, height: 0 }) // 物理像素
const factor = ref(1)
const tool = ref('rect')
const tools = [
  { id: 'rect', title: '矩形', path: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>' },
  { id: 'ellipse', title: '椭圆', path: '<ellipse cx="12" cy="12" rx="8" ry="6"/>' },
  { id: 'line', title: '直线', path: '<path d="M5 19L19 5"/>' },
  { id: 'arrow', title: '箭头', path: '<path d="M5 19L17 7M17 7h-6M17 7v6"/>' },
  { id: 'pen', title: '画笔', path: '<path d="M4 20l1.2-4.2L16.8 4.2a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1L8.2 18.8 4 20z"/>' },
  { id: 'highlight', title: '高亮', path: '<path d="M9 12l5-5 5 5-5 5z"/><path d="M4 20h16"/>' },
  { id: 'number', title: '序号标记', path: '<circle cx="12" cy="12" r="8.5"/><path d="M10.5 15.5v-7l3.5 7"/>' },
  { id: 'mosaic', title: '马赛克（粗细控制强度）', path: '<rect x="5" y="5" width="4" height="4"/><rect x="11" y="5" width="4" height="4"/><rect x="17" y="5" width="3" height="4"/><rect x="5" y="11" width="4" height="4"/><rect x="11" y="11" width="4" height="4"/><rect x="17" y="11" width="3" height="4"/><rect x="5" y="17" width="4" height="3"/><rect x="11" y="17" width="4" height="3"/><rect x="17" y="17" width="3" height="3"/>' },
  { id: 'text', title: '文字', path: '<path d="M5 6V4h14v2M12 4v16m-3 0h6"/>' }
]
const colors = ['#FF4D4F', '#FAAD14', '#52C41A', '#1890FF', '#722ED1', '#FFFFFF', '#000000']
const color = ref('#FF4D4F')
const widths = [2, 4, 8]
const width = ref(4)
const fontSizes = [14, 20, 28]
const fontSize = ref(20)
const shapes = ref([])
const redoStack = ref([])
const drawing = ref(null)
const textEdit = ref(null)
const done = ref(false)
const selMode = ref(null) // 'move' | 'nw'|...（手柄/边界环，与标注互斥）
const selGrab = ref(null)
const frameSize = reactive({ w: 0, h: 0 })

const api = computed(() => window.electronAPI && window.electronAPI.captureOverlay)

// ---------- picking ----------
const hoverRect = computed(() => {
  if (hoverWin.value == null) return null
  const w = windows.value.find(x => x.windowNumber === hoverWin.value)
  if (!w) return null
  return { x: w.x, y: w.y, width: w.width, height: w.height, owner: w.owner, title: w.title }
})

const pinnedRect = computed(() => {
  if (pinnedWin.value == null) return null
  const w = windows.value.find(x => x.windowNumber === pinnedWin.value)
  if (!w) return null
  return { x: w.x, y: w.y, width: w.width, height: w.height, owner: w.owner, title: w.title }
})

const displayRect = computed(() => rect.value || pinnedRect.value || hoverRect.value)

const isWinPick = computed(() => !rect.value && !!(pinnedRect.value || hoverRect.value))

const sizeLabel = computed(() => {
  const r = displayRect.value
  if (!r) return ''
  const size = Math.round(r.width) + ' × ' + Math.round(r.height)
  if (!isWinPick.value) return size
  const name = r.title ? r.owner + ' — ' + r.title : r.owner
  return name + ' · ' + size
})

const hint = computed(() => {
  if (dragging.value) return { title: '', sub: '松开完成框选' }
  if (rect.value) return { title: '', sub: '' }
  if (pinnedRect.value) {
    return {
      title: '已选中 ' + (pinnedRect.value.title || pinnedRect.value.owner),
      sub: '单击或 Enter 截取 · 拖拽自定义选区 · Esc 取消'
    }
  }
  if (hoverRect.value) return { title: '单击截取此窗口 · 拖拽自定义选区', sub: '' }
  return { title: '拖拽框选要截取的区域', sub: '移动鼠标自动识别窗口 · Esc / 右键取消' }
})

const maskStyle = computed(() => {
  const r = displayRect.value
  if (!r) return {}
  return {
    borderTop: r.y + 'px solid rgba(0,0,0,0.35)',
    borderBottom: (window.innerHeight - r.y - r.height) + 'px solid rgba(0,0,0,0.35)',
    borderLeft: r.x + 'px solid rgba(0,0,0,0.35)',
    borderRight: (window.innerWidth - r.x - r.width) + 'px solid rgba(0,0,0,0.35)',
    boxSizing: 'border-box',
    width: '100%',
    height: '100%',
    position: 'absolute',
    inset: 0,
    pointerEvents: 'none'
  }
})

const rectStyle = computed(() => {
  const r = displayRect.value
  if (!r) return {}
  return { left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' }
})

const sizeStyle = computed(() => {
  const r = displayRect.value
  if (!r) return {}
  const w = Math.min(r.x + r.width / 2, window.innerWidth - 150)
  return {
    left: Math.max(8, w) + 'px',
    top: Math.max(0, r.y - 26) + 'px',
    transform: 'translateX(-50%)'
  }
})

// ---------- editing ----------
const canvasStyle = computed(() => ({
  position: 'absolute',
  left: sel.value.x / factor.value + 'px',
  top: sel.value.y / factor.value + 'px',
  width: sel.value.width / factor.value + 'px',
  height: sel.value.height / factor.value + 'px',
  cursor: tool.value === 'text' ? 'text' : 'crosshair'
}))

const barStyle = computed(() => {
  const left = Math.max(0, Math.min(sel.value.x / factor.value, window.innerWidth - 700))
  const top = sel.value.y / factor.value
  return top >= 56
    ? { left: left + 'px', top: Math.max(0, top - 50) + 'px' }
    : { left: left + 'px', top: top + sel.value.height / factor.value + 10 + 'px' }
})

const sizeTagStyle = computed(() => ({
  left: sel.value.x / factor.value + 'px',
  top: Math.max(0, sel.value.y / factor.value - 26) + 'px'
}))

const selHandles = computed(() => {
  if (!ready.value) return []
  const f = factor.value
  const s = sel.value
  const defs = [
    { id: 'nw', x: s.x, y: s.y, cursor: 'nwse-resize' },
    { id: 'n', x: s.x + s.width / 2, y: s.y, cursor: 'ns-resize' },
    { id: 'ne', x: s.x + s.width, y: s.y, cursor: 'nesw-resize' },
    { id: 'e', x: s.x + s.width, y: s.y + s.height / 2, cursor: 'ew-resize' },
    { id: 'se', x: s.x + s.width, y: s.y + s.height, cursor: 'nwse-resize' },
    { id: 's', x: s.x + s.width / 2, y: s.y + s.height, cursor: 'ns-resize' },
    { id: 'sw', x: s.x, y: s.y + s.height, cursor: 'nesw-resize' },
    { id: 'w', x: s.x, y: s.y + s.height / 2, cursor: 'ew-resize' }
  ]
  return defs.map(h => Object.assign({}, h, { x: h.x / f - 4, y: h.y / f - 4 }))
})

const textEditStyle = computed(() => {
  const t = textEdit.value
  if (!t) return {}
  return {
    left: t.x / factor.value + 'px',
    top: t.y / factor.value + 'px',
    color: color.value,
    fontSize: fontSize.value + 'px',
    lineHeight: 1.3,
    minHeight: Math.round(fontSize.value * 1.3) + 'px'
  }
})

watch(sel, () => {
  if (phase.value === 'editing' && ready.value) nextTick(render)
}, { deep: true })

// ---------- picking：窗口拾取 ----------
async function pullContext(first) {
  const inst = api.value
  if (!inst || !inst.context) return
  try {
    const res = await inst.context()
    if (res && res.ok && Array.isArray(res.windows)) windows.value = res.windows
    if (first && res && res.ok && res.cursor) {
      const hit = hitTest(res.cursor.x, res.cursor.y)
      if (hit) pinnedWin.value = hit.windowNumber
    }
  } catch (e) { /* 插件不可用：降级纯框选 */ }
}

function hitTest(x, y) {
  for (const w of windows.value) {
    if (x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height) return w
  }
  return null
}

function onRootMouseDown(e) {
  if (e.button !== 0 || phase.value !== 'picking') return
  downPos = { x: e.clientX, y: e.clientY }
  dragging.value = true
  start = { x: e.clientX, y: e.clientY }
  rect.value = { x: e.clientX, y: e.clientY, width: 0, height: 0 }
}

function onGlobalMouseMove(e) {
  if (phase.value === 'editing') {
    onSelMove(e)
    return
  }
  if (phase.value !== 'picking') return
  if (dragging.value) {
    const s = start
    rect.value = {
      x: Math.min(s.x, e.clientX),
      y: Math.min(s.y, e.clientY),
      width: Math.abs(e.clientX - s.x),
      height: Math.abs(e.clientY - s.y)
    }
    return
  }
  if (pinnedWin.value != null) return
  const now = performance.now()
  if (now - lastHoverAt < 30) return
  lastHoverAt = now
  const hit = hitTest(e.clientX, e.clientY)
  const id = hit ? hit.windowNumber : null
  if (hoverWin.value !== id) hoverWin.value = id
}

function onGlobalMouseUp(e) {
  if (phase.value === 'editing') {
    onSelUp()
    return
  }
  if (phase.value !== 'picking' || !dragging.value) return
  dragging.value = false
  const r = rect.value
  const moved = downPos
    ? Math.abs(e.clientX - downPos.x) + Math.abs(e.clientY - downPos.y)
    : 999
  if (!r || r.width < 3 || r.height < 3) {
    // 单击：选中锁定/hover 窗口直接截取
    const wr = pinnedRect.value || hoverRect.value
    if (moved < 6 && wr) {
      pickRect(pickRectOf(wr))
      return
    }
    rect.value = null
    return
  }
  pickRect(r)
}

function pickRectOf(r) {
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

// 选区确定：scroll 模式直接回传；否则 freeze 抓帧进编辑态
async function pickRect(r) {
  if (done.value) return
  if (scrollMode.value) {
    finish(null, r)
    return
  }
  phase.value = 'freezing'
  try {
    const res = await api.value.freeze()
    if (!res || !res.ok) {
      // 抓帧失败：降级直接回传选区（主进程兜底 crop）
      finish(null, r)
      return
    }
    factor.value = res.factor || 1
    sel.value = {
      x: Math.round(r.x * factor.value),
      y: Math.round(r.y * factor.value),
      width: Math.round(r.width * factor.value),
      height: Math.round(r.height * factor.value)
    }
    frame.value = res.frame
    const img = new Image()
    img.onload = () => {
      imgEl = img
      frameSize.w = img.naturalWidth
      frameSize.h = img.naturalHeight
      phase.value = 'editing'
      ready.value = true
      nextTick(render)
    }
    img.src = res.frame
  } catch (err) {
    finish(null, r)
  }
}

// ---------- editing：选区微调（手柄缩放 + 边界环移动） ----------
function framePoint(e) {
  return { x: e.clientX * factor.value, y: e.clientY * factor.value }
}

function onSelMove(e) {
  if (!selMode.value) return
  const p = framePoint(e)
  if (selMode.value === 'move') {
    const fw = frameSize.w || 1
    const fh = frameSize.h || 1
    const nx = Math.max(0, Math.min(selGrab.value.x + p.x - selGrab.value.px, fw - sel.value.width))
    const ny = Math.max(0, Math.min(selGrab.value.y + p.y - selGrab.value.py, fh - sel.value.height))
    sel.value = Object.assign({}, sel.value, { x: nx, y: ny })
  } else {
    applySelResize(selMode.value, p.x, p.y)
  }
}

function onSelUp() {
  if (!selMode.value) return
  selMode.value = null
  selGrab.value = null
}

function applySelResize(dir, cx, cy) {
  const min = 10
  const fw = frameSize.w || 1
  const fh = frameSize.h || 1
  const s = Object.assign({}, sel.value)
  if (dir.indexOf('w') >= 0) {
    const x2 = s.x + s.width
    s.x = Math.max(0, Math.min(cx, x2 - min))
    s.width = x2 - s.x
  }
  if (dir.indexOf('e') >= 0) {
    s.width = Math.max(min, Math.min(cx - s.x, fw - s.x))
  }
  if (dir.indexOf('n') >= 0) {
    const y2 = s.y + s.height
    s.y = Math.max(0, Math.min(cy, y2 - min))
    s.height = y2 - s.y
  }
  if (dir.indexOf('s') >= 0) {
    s.height = Math.max(min, Math.min(cy - s.y, fh - s.y))
  }
  sel.value = s
}

// ---------- editing：标注绘制 ----------
function render() {
  const el = canvas.value
  if (!el) return
  const ctx = el.getContext('2d')
  const s = sel.value
  ctx.clearRect(0, 0, el.width, el.height)
  ctx.drawImage(imgEl, s.x, s.y, s.width, s.height, 0, 0, s.width, s.height)
  for (const sh of shapes.value) drawShape(ctx, sh)
  if (drawing.value) drawShape(ctx, drawing.value)
}

function drawShape(ctx, sh) {
  ctx.save()
  ctx.strokeStyle = sh.color
  ctx.fillStyle = sh.color
  ctx.lineWidth = sh.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  const x = Math.min(sh.x1, sh.x2)
  const y = Math.min(sh.y1, sh.y2)
  const w = Math.abs(sh.x2 - sh.x1)
  const h = Math.abs(sh.y2 - sh.y1)
  if (sh.type === 'rect') {
    ctx.strokeRect(x, y, w, h)
  } else if (sh.type === 'ellipse') {
    ctx.beginPath()
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    ctx.stroke()
  } else if (sh.type === 'line') {
    ctx.beginPath()
    ctx.moveTo(sh.x1, sh.y1)
    ctx.lineTo(sh.x2, sh.y2)
    ctx.stroke()
  } else if (sh.type === 'arrow') {
    ctx.beginPath()
    ctx.moveTo(sh.x1, sh.y1)
    ctx.lineTo(sh.x2, sh.y2)
    ctx.stroke()
    const ang = Math.atan2(sh.y2 - sh.y1, sh.x2 - sh.x1)
    const len = Math.max(12, sh.width * 3)
    ctx.beginPath()
    ctx.moveTo(sh.x2, sh.y2)
    ctx.lineTo(sh.x2 - len * Math.cos(ang - Math.PI / 6), sh.y2 - len * Math.sin(ang - Math.PI / 6))
    ctx.moveTo(sh.x2, sh.y2)
    ctx.lineTo(sh.x2 - len * Math.cos(ang + Math.PI / 6), sh.y2 - len * Math.sin(ang + Math.PI / 6))
    ctx.stroke()
  } else if (sh.type === 'pen') {
    ctx.beginPath()
    for (let i = 0; i < sh.points.length; i++) {
      const pt = sh.points[i]
      if (i === 0) ctx.moveTo(pt.x, pt.y)
      else ctx.lineTo(pt.x, pt.y)
    }
    ctx.stroke()
  } else if (sh.type === 'highlight') {
    ctx.globalAlpha = 0.35
    ctx.fillRect(x, y, w, h)
    ctx.globalAlpha = 1
  } else if (sh.type === 'mosaic') {
    mosaicRegion(ctx, x, y, w, h, Math.max(6, sh.width * 3))
  } else if (sh.type === 'number') {
    const r = 11 * factor.value
    ctx.beginPath()
    ctx.arc(sh.x1, sh.y1, r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = sh.color.toUpperCase() === '#FFFFFF' ? '#111' : '#fff'
    ctx.font = '600 ' + Math.round(13 * factor.value) + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(String(sh.n), sh.x1, sh.y1 + 1)
  } else if (sh.type === 'text') {
    ctx.font = sh.fontSize + 'px sans-serif'
    ctx.textBaseline = 'top'
    const lines = String(sh.value).split('\n')
    const lh = Math.round(sh.fontSize * 1.3)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'
    ctx.lineWidth = 3
    for (let i = 0; i < lines.length; i++) {
      ctx.strokeText(lines[i], sh.x1, sh.y1 + i * lh)
      ctx.fillText(lines[i], sh.x1, sh.y1 + i * lh)
    }
  }
  ctx.restore()
}

function mosaicRegion(ctx, x, y, w, h, size = 12) {
  if (w < 2 || h < 2) return
  const sx = Math.max(0, Math.floor(x))
  const sy = Math.max(0, Math.floor(y))
  const sw = Math.min(ctx.canvas.width - sx, Math.ceil(w))
  const sh2 = Math.min(ctx.canvas.height - sy, Math.ceil(h))
  if (sw < 1 || sh2 < 1) return
  const tmp = document.createElement('canvas')
  const small = Math.max(1, Math.round(sw / size))
  const smallH = Math.max(1, Math.round(sh2 / size))
  tmp.width = small
  tmp.height = smallH
  const tctx = tmp.getContext('2d')
  tctx.drawImage(ctx.canvas, sx, sy, sw, sh2, 0, 0, small, smallH)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(tmp, 0, 0, small, smallH, sx, sy, sw, sh2)
  ctx.imageSmoothingEnabled = true
}

function canvasPos(e) {
  const r = canvas.value.getBoundingClientRect()
  return {
    x: (e.clientX - r.left) * factor.value,
    y: (e.clientY - r.top) * factor.value
  }
}

function onCanvasMouseDown(e) {
  if (e.button !== 0 || done.value) return
  if (textEdit.value) {
    commitText()
    return
  }
  const p = canvasPos(e)
  if (tool.value === 'text') {
    startText(p)
    return
  }
  if (tool.value === 'number') {
    addShape({ type: 'number', x1: p.x, y1: p.y, n: nextNumber(), color: color.value, width: width.value })
    render()
    return
  }
  if (tool.value === 'pen') {
    drawing.value = { type: 'pen', points: [{ x: p.x, y: p.y }], color: color.value, width: width.value }
    return
  }
  drawing.value = { type: tool.value, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: color.value, width: width.value }
}

function onCanvasMouseMove(e) {
  if (!drawing.value) return
  const p = canvasPos(e)
  if (drawing.value.type === 'pen') drawing.value.points.push({ x: p.x, y: p.y })
  else {
    drawing.value.x2 = p.x
    drawing.value.y2 = p.y
  }
  render()
}

function onCanvasMouseUp() {
  if (!drawing.value) return
  const d = drawing.value
  drawing.value = null
  if (d.type === 'pen') {
    const xs = d.points.map(o => o.x)
    const ys = d.points.map(o => o.y)
    if (Math.max.apply(null, xs) - Math.min.apply(null, xs) < 2 && Math.max.apply(null, ys) - Math.min.apply(null, ys) < 2) return
  } else if (Math.abs(d.x2 - d.x1) < 2 && Math.abs(d.y2 - d.y1) < 2) {
    return
  }
  addShape(d)
  render()
}

function addShape(sh) {
  shapes.value.push(sh)
  redoStack.value = []
}

function nextNumber() {
  const used = new Set(shapes.value.filter(s => s.type === 'number').map(s => s.n))
  let i = 1
  while (used.has(i)) i++
  return i
}

function startText(p) {
  textEdit.value = { x: p.x, y: p.y, value: '' }
  nextTick(() => {
    if (textInput.value) textInput.value.focus()
  })
}

function commitText() {
  const t = textEdit.value
  textEdit.value = null
  const value = (t.value || '').trim()
  if (!value) return
  addShape({ type: 'text', x1: t.x, y1: t.y, value: value, color: color.value, fontSize: fontSize.value * factor.value, width: width.value })
  render()
}

function cancelText() {
  textEdit.value = null
}

function undo() {
  const s = shapes.value.pop()
  if (s) {
    redoStack.value.push(s)
    render()
  }
}

function redo() {
  const s = redoStack.value.pop()
  if (s) {
    shapes.value.push(s)
    render()
  }
}

// editing 态根 mousedown：手柄缩放 / 边界环移动
function onRootMouseDown2(e) {
  if (e.button !== 0 || done.value || !ready.value) return
  if (e.target.closest && e.target.closest('.co-bar, .co-text-input')) return
  const handle = e.target.dataset && e.target.dataset.handle
  if (handle) {
    selMode.value = handle
    return
  }
  if (e.target === canvas.value) return
  const r = canvas.value.getBoundingClientRect()
  const pad = 10
  const inCanvas = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
  const inRing = e.clientX >= r.left - pad && e.clientX <= r.right + pad &&
    e.clientY >= r.top - pad && e.clientY <= r.bottom + pad
  if (!inCanvas && inRing) {
    const p = framePoint(e)
    selMode.value = 'move'
    selGrab.value = { px: p.x, py: p.y, x: sel.value.x, y: sel.value.y }
  }
}

// ---------- 结果回传 ----------
function resultDataUrl() {
  return canvas.value.toDataURL('image/png')
}

// 回传主进程：result = { action, data, rect } 编辑结果；rect 选区
function finish(result, r) {
  if (done.value) return
  done.value = true
  if (api.value) api.value.done(result || (r ? r : null))
}

function confirm() {
  if (done.value || !ready.value) return
  finish({
    action: 'confirm',
    data: resultDataUrl(),
    rect: { x: sel.value.x / factor.value, y: sel.value.y / factor.value, width: sel.value.width / factor.value, height: sel.value.height / factor.value }
  })
}

function pin() {
  if (done.value || !ready.value) return
  finish({
    action: 'pin',
    data: resultDataUrl(),
    rect: { x: sel.value.x / factor.value, y: sel.value.y / factor.value, width: sel.value.width / factor.value, height: sel.value.height / factor.value }
  })
}

// R / 工具栏按钮：回 picking 重新框选（保留本窗，定格帧丢弃）
function restartPick() {
  if (done.value) return
  phase.value = 'picking'
  ready.value = false
  frame.value = ''
  imgEl = null
  shapes.value = []
  redoStack.value = []
  drawing.value = null
  textEdit.value = null
  selMode.value = null
  rect.value = null
  hoverWin.value = null
  pinnedWin.value = null
  pullContext(true)
}

function cancel() {
  finish(null)
}

function onContextMenu() {
  // editing 态右键不取消（防误触），picking 态右键取消
  if (phase.value === 'picking') cancel()
}

function onKeydown(e) {
  if (done.value) return
  if (textEdit.value) return
  if (phase.value === 'picking') {
    if (e.key === 'Escape') {
      cancel()
      return
    }
    if (e.code === 'Space') {
      e.preventDefault()
      if (rect.value) return
      if (pinnedWin.value != null) pinnedWin.value = null
      else if (hoverWin.value != null) {
        pinnedWin.value = hoverWin.value
        hoverWin.value = null
      }
      return
    }
    if (e.key === 'Enter') {
      if (rect.value) pickRect(rect.value)
      else if (pinnedRect.value) pickRect(pickRectOf(pinnedRect.value))
    }
    return
  }
  if (phase.value === 'editing') {
    if (e.key === 'Escape') cancel()
    else if (e.key === 'Enter') confirm()
    else if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) restartPick()
    else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      redo()
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault()
      undo()
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
      e.preventDefault()
      redo()
    }
  }
}

onMounted(async () => {
  // m=scroll：选完直接回传，不进编辑态
  scrollMode.value = new URLSearchParams(location.hash.split('?')[1] || '').get('m') === 'scroll'
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('mousemove', onGlobalMouseMove)
  window.addEventListener('mouseup', onGlobalMouseUp)
  // picking 首拉上下文：窗口列表 + 光标 → 默认选中光标下窗口
  await pullContext(true)
  winTimer = setInterval(() => {
    if (phase.value === 'picking') pullContext(false)
  }, 400)
})

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousemove', onGlobalMouseMove)
  window.removeEventListener('mouseup', onGlobalMouseUp)
  if (winTimer) {
    clearInterval(winTimer)
    winTimer = null
  }
})
</script>

<style lang="scss" scoped>
.capture-overlay {
  position: fixed;
  inset: 0;
  cursor: crosshair;
  background: transparent;
  overflow: hidden;
  user-select: none;

  &.editing {
    cursor: default;
  }
}

.co-hint {
  position: absolute;
  left: 50%;
  top: 18%;
  transform: translateX(-50%);
  text-align: center;
  color: #fff;
  pointer-events: none;
  z-index: 6;

  .co-hint-title {
    font-size: 15px;
    font-weight: 600;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  }

  .co-hint-sub {
    margin-top: 6px;
    font-size: 12px;
    opacity: 0.85;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  }
}

.co-mask {
  pointer-events: none;
}

.co-border {
  position: absolute;
  border: 1.5px solid #4a9eff;
  box-shadow: 0 0 0 1px rgba(74, 158, 255, 0.35);
  pointer-events: none;
}

.co-size {
  position: absolute;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
}

/* freezing：抓帧中转圈 */
.co-freezing {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 28px;
  color: #fff;
  z-index: 15;
}

/* editing：整屏定格帧背景 */
.co-frame {
  position: absolute;
  inset: 0;
  background-size: 100% 100%;
  background-position: center;
}

/* 画布：选区细蓝框 + 超大 spread box-shadow 挖空压暗选区外区域 */
.co-canvas {
  position: absolute;
  box-shadow:
    0 0 0 1.5px #4a9eff,
    0 0 0 9999px rgba(0, 0, 0, 0.45);
}

.co-bar {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 5px;
  height: 40px;
  padding: 0 10px;
  border-radius: 10px;
  background: rgba(28, 30, 34, 0.92);
  backdrop-filter: blur(10px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  z-index: 10;
  -webkit-app-region: no-drag;
}

.co-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  min-width: 28px;
  height: 28px;
  padding: 0 6px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #e8eaf0;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover { background: rgba(255, 255, 255, 0.12); }
  &.active { background: rgba(74, 158, 255, 0.3); color: #7cc0ff; }

  .co-ico {
    width: 16px;
    height: 16px;
  }

  i { font-size: 14px; }
  span { font-size: 12px; }
}

.co-ok { color: #4ade80; }
.co-pin { color: #7cc0ff; }
.co-no { color: #ff7b72; }

.co-div {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.15);
}

.co-color {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid transparent;
  cursor: pointer;
  padding: 0;
  transition: transform 0.12s ease;

  &:hover { transform: scale(1.15); }
  &.active { border-color: #fff; transform: scale(1.15); }
}

.co-wbtn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  cursor: pointer;

  span {
    border-radius: 50%;
    background: #e8eaf0;
    display: block;
  }

  &:hover { background: rgba(255, 255, 255, 0.12); }
  &.active { background: rgba(74, 158, 255, 0.3); }
}

/* 字号按钮：显示数字而非圆点 */
.co-fbtn {
  font-size: 12px;
  color: #e8eaf0;
}

/* 内联文字输入：透明底、与画布绘制同字号同行高（预览即所得） */
.co-text-input {
  position: absolute;
  z-index: 20;
  min-width: 80px;
  max-width: 90%;
  padding: 0;
  border: 1px dashed rgba(255, 255, 255, 0.75);
  outline: none;
  background: transparent;
  font-family: sans-serif;
  resize: none;
  overflow: hidden;
  white-space: pre;
  -webkit-app-region: no-drag;
  text-shadow: 0 0 3px rgba(255, 255, 255, 0.85);
}

/* 选区微调手柄 */
.co-handle {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 2px;
  background: #fff;
  border: 1px solid rgba(74, 158, 255, 0.9);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
  z-index: 8;
}
</style>
