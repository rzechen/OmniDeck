<template>
  <tool-shell
    title="白板"
    desc="无限画布：空格/抓手拖拽平移，⌘+滚轮缩放"
    icon="board"
    color="#722ED1"
    back-path="/tools/text"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div class="tool-seg-item" :class="{ active: tool === 'pen' }" @click="tool = 'pen'">
          <svg-icon icon-class="edit" />
          画笔
        </div>
        <div class="tool-seg-item" :class="{ active: tool === 'eraser' }" @click="tool = 'eraser'">
          <svg-icon icon-class="umbrella" />
          橡皮
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: tool === 'hand' }"
          title="拖拽平移画布"
          @click="tool = 'hand'"
        >
          <svg-icon icon-class="thumb" />
          抓手
        </div>
      </div>
      <template v-if="tool !== 'hand'">
        <label class="cfg-inline">
          <span>粗细</span>
          <input v-model.number="lineWidth" type="range" min="1" max="30" />
          <b class="mono">{{ lineWidth }}</b>
        </label>
        <div class="wb-colors">
          <span
            v-for="c in colors"
            :key="c"
            class="wb-color"
            :class="{ active: color === c }"
            :style="{ background: c }"
            @click="color = c"
          ></span>
        </div>
        <input v-model="customColor" type="color" class="color-input" title="自定义颜色" />
      </template>
      <button class="tool-btn" :disabled="!strokes.length" @click="undo">
        <svg-icon icon-class="refresh-left" />
        撤销
      </button>
      <button class="tool-btn" :disabled="!redoStack.length" @click="redo">
        <svg-icon icon-class="refresh-right" />
        重做
      </button>
      <div class="tool-seg">
        <div class="tool-seg-item wb-zoom-btn" title="缩小" @click="zoomBy(1 / 1.25)">
          <svg-icon icon-class="zoom-out" />
        </div>
        <div class="tool-seg-item wb-zoom-label" title="重置为 100%" @click="resetZoom">
          {{ Math.round(zoom * 100) }}%
        </div>
        <div class="tool-seg-item wb-zoom-btn" title="放大" @click="zoomBy(1.25)">
          <svg-icon icon-class="zoom-in" />
        </div>
        <div class="tool-seg-item wb-zoom-btn" title="适应内容" @click="fitContent">
          <svg-icon icon-class="full-screen" />
        </div>
        <div class="tool-seg-item wb-zoom-btn" title="回到中心（重置视图）" @click="resetView">
          <svg-icon icon-class="aim" />
        </div>
      </div>
      <button class="tool-btn is-primary" @click="exportPng">
        <svg-icon icon-class="download" />
        导出 PNG
      </button>
      <button class="tool-btn is-danger" :disabled="!strokes.length" @click="clearBoard">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div ref="wrap" class="wb-body" @wheel.prevent="onWheel">
      <canvas
        ref="canvas"
        class="wb-canvas"
        :class="canvasCursor"
        @mousedown="onDown"
        @mousemove="onMove"
        @mouseup="onUp"
        @mouseleave="onUp"
      ></canvas>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ toolLabel }} · {{ strokes.length }} 笔</span>
      <span class="status-right">滚轮平移 · ⌘/Ctrl+滚轮缩放 · 空格拖拽</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'
import { useFeedback } from '@/composables/useFeedback'

const MIN_ZOOM = 0.15
const MAX_ZOOM = 5

defineOptions({ name: 'TextWhiteboard' })

const { message } = useFeedback()

const tool = ref('pen')
const lineWidth = ref(4)
const color = ref('#1D1D1F')
const customColor = ref('#3366FF')
const colors = ['#1D1D1F', '#F54A45', '#FA8C16', '#52C41A', '#3366FF', '#722ED1', '#EB2F96']
// 视口状态：zoom=缩放，panX/panY=世界原点在屏幕上的偏移
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
// 笔画数据（世界坐标），橡皮以 destination-out 方式重放
const strokes = ref([])
const redoStack = ref([])
const drawing = ref(false)
const panning = ref(false)
const spaceDown = ref(false)

// 非响应式：canvas 元素、视口尺寸与动画句柄
const canvas = ref(null)
const wrap = ref(null)
let viewW = 0
let viewH = 0
let dpr = 1
let panStart = null
let raf = null

const toolLabel = computed(() => ({ pen: '画笔', eraser: '橡皮', hand: '抓手' }[tool.value]))
const canvasCursor = computed(() => {
  if (panning.value) return 'is-grabbing'
  if (tool.value === 'hand' || spaceDown.value) return 'is-grab'
  return ''
})

watch(customColor, v => {
  color.value = v
})

onMounted(() => {
  resize()
  window.addEventListener('resize', resize)
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  if (raf) cancelAnimationFrame(raf)
})

/* ---------- 视口 ---------- */
function resize() {
  if (!canvas.value || !wrap.value) return
  viewW = wrap.value.clientWidth
  viewH = wrap.value.clientHeight
  dpr = window.devicePixelRatio || 1
  canvas.value.width = Math.round(viewW * dpr)
  canvas.value.height = Math.round(viewH * dpr)
  redraw()
}

function pointer(e) {
  const rect = wrap.value.getBoundingClientRect()
  return { x: e.clientX - rect.left, y: e.clientY - rect.top }
}

function toWorld(p) {
  return { x: (p.x - panX.value) / zoom.value, y: (p.y - panY.value) / zoom.value }
}

function onWheel(e) {
  if (e.ctrlKey || e.metaKey) {
    // 触控板捏合 / ⌘+滚轮：以指针为中心缩放
    zoomAt(pointer(e), Math.exp(-e.deltaY * 0.01))
  } else {
    panX.value -= e.deltaX
    panY.value -= e.deltaY
    scheduleRedraw()
  }
}

function zoomAt(p, factor) {
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom.value * factor))
  const k = z / zoom.value
  panX.value = p.x - (p.x - panX.value) * k
  panY.value = p.y - (p.y - panY.value) * k
  zoom.value = z
  scheduleRedraw()
}

function zoomBy(f) {
  zoomAt({ x: viewW / 2, y: viewH / 2 }, f)
}

function resetZoom() {
  zoomAt({ x: viewW / 2, y: viewH / 2 }, 1 / zoom.value)
}

// 回到中心：重置缩放与平移，世界原点对齐画布中心
function resetView() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
  redraw()
}

function fitContent() {
  if (!strokes.value.length) {
    zoom.value = 1
    panX.value = 0
    panY.value = 0
    redraw()
    return
  }
  const b = bbox()
  const pad = 40
  const w = b.maxX - b.minX + pad * 2
  const h = b.maxY - b.minY + pad * 2
  const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(viewW / w, viewH / h)))
  zoom.value = z
  panX.value = viewW / 2 - ((b.minX + b.maxX) / 2) * z
  panY.value = viewH / 2 - ((b.minY + b.maxY) / 2) * z
  redraw()
}

/* ---------- 绘制交互 ---------- */
function onKeyDown(e) {
  if (e.code !== 'Space') return
  const tag = (e.target.tagName || '').toLowerCase()
  if (tag === 'input' || tag === 'textarea') return
  e.preventDefault()
  spaceDown.value = true
}

function onKeyUp(e) {
  if (e.code === 'Space') spaceDown.value = false
}

function onDown(e) {
  // 中键 / 空格 / 抓手：平移画布
  if (e.button === 1 || spaceDown.value || tool.value === 'hand') {
    panning.value = true
    panStart = pointer(e)
    return
  }
  if (e.button !== 0) return
  const p = toWorld(pointer(e))
  strokes.value.push({
    points: [[p.x, p.y]],
    color: color.value,
    width: lineWidth.value,
    erase: tool.value === 'eraser'
  })
  redoStack.value = []
  drawing.value = true
}

function onMove(e) {
  const p = pointer(e)
  if (panning.value) {
    panX.value += p.x - panStart.x
    panY.value += p.y - panStart.y
    panStart = p
    scheduleRedraw()
    return
  }
  if (!drawing.value) return
  const w = toWorld(p)
  const s = strokes.value[strokes.value.length - 1]
  s.points.push([w.x, w.y])
  drawSegment(s)
}

function onUp() {
  if (panning.value) {
    panning.value = false
    return
  }
  if (drawing.value) {
    drawing.value = false
    redraw()
  }
}

/* ---------- 渲染 ---------- */
function scheduleRedraw() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = null
    redraw()
  })
}

function setWorldTransform(ctx) {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.translate(panX.value, panY.value)
  ctx.scale(zoom.value, zoom.value)
}

// 点状网格：随平移缩放移动，营造无限画布空间感
function drawGrid(ctx) {
  let step = 24
  while (step * zoom.value < 24) step *= 2
  const wx0 = -panX.value / zoom.value
  const wy0 = -panY.value / zoom.value
  const x0 = Math.floor(wx0 / step) * step
  const y0 = Math.floor(wy0 / step) * step
  const x1 = wx0 + viewW / zoom.value + step
  const y1 = wy0 + viewH / zoom.value + step
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.fillStyle = 'rgba(29, 29, 31, 0.16)'
  for (let x = x0; x <= x1; x += step) {
    const sx = x * zoom.value + panX.value
    for (let y = y0; y <= y1; y += step) {
      ctx.fillRect(sx - 1, y * zoom.value + panY.value - 1, 2, 2)
    }
  }
}

function drawStroke(ctx, s) {
  if (!s.points.length) return
  ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
  ctx.strokeStyle = s.color
  ctx.fillStyle = s.color
  ctx.lineWidth = s.width
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  if (s.points.length === 1) {
    ctx.beginPath()
    ctx.arc(s.points[0][0], s.points[0][1], s.width / 2, 0, Math.PI * 2)
    ctx.fill()
    return
  }
  ctx.beginPath()
  ctx.moveTo(s.points[0][0], s.points[0][1])
  for (let i = 1; i < s.points.length; i++) {
    ctx.lineTo(s.points[i][0], s.points[i][1])
  }
  ctx.stroke()
}

// 绘画过程中的增量线段（不清屏，保证手写跟手）
function drawSegment(s) {
  if (!canvas.value || s.points.length < 1) return
  const ctx = canvas.value.getContext('2d')
  ctx.save()
  setWorldTransform(ctx)
  const pts = s.points
  if (pts.length === 1) {
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
    ctx.fillStyle = s.color
    ctx.beginPath()
    ctx.arc(pts[0][0], pts[0][1], s.width / 2, 0, Math.PI * 2)
    ctx.fill()
  } else {
    const a = pts[pts.length - 2]
    const b = pts[pts.length - 1]
    ctx.globalCompositeOperation = s.erase ? 'destination-out' : 'source-over'
    ctx.strokeStyle = s.color
    ctx.lineWidth = s.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.beginPath()
    ctx.moveTo(a[0], a[1])
    ctx.lineTo(b[0], b[1])
    ctx.stroke()
  }
  ctx.restore()
}

function redraw() {
  if (!canvas.value) return
  const ctx = canvas.value.getContext('2d')
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.clearRect(0, 0, canvas.value.width, canvas.value.height)
  drawGrid(ctx)
  setWorldTransform(ctx)
  strokes.value.forEach(s => drawStroke(ctx, s))
  ctx.setTransform(1, 0, 0, 1, 0, 0)
  ctx.globalCompositeOperation = 'source-over'
}

/* ---------- 数据操作 ---------- */
function bbox() {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  strokes.value.forEach(s => {
    const half = s.width / 2 + 2
    s.points.forEach(([x, y]) => {
      if (x - half < minX) minX = x - half
      if (y - half < minY) minY = y - half
      if (x + half > maxX) maxX = x + half
      if (y + half > maxY) maxY = y + half
    })
  })
  return { minX, minY, maxX, maxY }
}

function undo() {
  if (!strokes.value.length) return
  redoStack.value.push(strokes.value.pop())
  redraw()
}

function redo() {
  if (!redoStack.value.length) return
  strokes.value.push(redoStack.value.pop())
  redraw()
}

function clearBoard() {
  if (!strokes.value.length) return
  strokes.value = []
  redoStack.value = []
  redraw()
}

function exportPng() {
  if (!strokes.value.length) {
    message.warning('画布为空，先画点什么吧')
    return
  }
  const b = bbox()
  const pad = 24
  const w = Math.ceil(b.maxX - b.minX + pad * 2)
  const h = Math.ceil(b.maxY - b.minY + pad * 2)
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  const ctx = out.getContext('2d')
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, w, h)
  ctx.translate(pad - b.minX, pad - b.minY)
  strokes.value.forEach(s => drawStroke(ctx, s))
  const a = document.createElement('a')
  a.href = out.toDataURL('image/png')
  a.download = 'whiteboard.png'
  a.click()
}
</script>

<style lang="scss" scoped>
.cfg-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);

  b {
    min-width: 24px;
    color: var(--primary-color);
    text-align: right;
  }

  input[type='range'] {
    width: 70px;
    accent-color: var(--primary-color);
  }
}

.wb-colors {
  display: flex;
  gap: 5px;
  align-items: center;
}

.wb-color {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  cursor: pointer;
  border: 2px solid transparent;
  transition: all 0.15s ease;

  &:hover {
    transform: scale(1.15);
  }

  &.active {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.25);
  }
}

.color-input {
  width: 26px;
  height: 26px;
  padding: 2px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--card-bg);
  cursor: pointer;
}

.wb-zoom-btn {
  padding: 0 9px !important;

  i {
    font-size: 12px;
  }
}

.wb-zoom-label {
  min-width: 46px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}

.wb-body {
  flex: 1;
  min-height: 0;
  border-radius: 12px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  box-shadow: var(--shadow-sm);
  background: #fff;
  position: relative;
}

.wb-canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: crosshair;
  -webkit-app-region: no-drag;

  &.is-grab {
    cursor: grab;
  }

  &.is-grabbing {
    cursor: grabbing;
  }
}
</style>
