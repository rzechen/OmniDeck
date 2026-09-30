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

<script>
import ToolShell from '@/components/tool/ToolShell.vue'

const MIN_ZOOM = 0.15
const MAX_ZOOM = 5

export default {
  name: 'TextWhiteboard',
  components: { ToolShell },
  data() {
    return {
      tool: 'pen',
      lineWidth: 4,
      color: '#1D1D1F',
      customColor: '#3366FF',
      colors: ['#1D1D1F', '#F54A45', '#FA8C16', '#52C41A', '#3366FF', '#722ED1', '#EB2F96'],
      // 视口状态：zoom=缩放，panX/panY=世界原点在屏幕上的偏移
      zoom: 1,
      panX: 0,
      panY: 0,
      // 笔画数据（世界坐标），橡皮以 destination-out 方式重放
      strokes: [],
      redoStack: [],
      drawing: false,
      panning: false,
      spaceDown: false
    }
  },
  computed: {
    toolLabel() {
      return { pen: '画笔', eraser: '橡皮', hand: '抓手' }[this.tool]
    },
    canvasCursor() {
      if (this.panning) return 'is-grabbing'
      if (this.tool === 'hand' || this.spaceDown) return 'is-grab'
      return ''
    }
  },
  watch: {
    customColor(v) {
      this.color = v
    }
  },
  mounted() {
    this.resize()
    window.addEventListener('resize', this.resize)
    window.addEventListener('keydown', this.onKeyDown)
    window.addEventListener('keyup', this.onKeyUp)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.resize)
    window.removeEventListener('keydown', this.onKeyDown)
    window.removeEventListener('keyup', this.onKeyUp)
    if (this._raf) cancelAnimationFrame(this._raf)
  },
  methods: {
    /* ---------- 视口 ---------- */
    resize() {
      const canvas = this.$refs.canvas
      const wrap = this.$refs.wrap
      if (!canvas || !wrap) return
      this.viewW = wrap.clientWidth
      this.viewH = wrap.clientHeight
      this.dpr = window.devicePixelRatio || 1
      canvas.width = Math.round(this.viewW * this.dpr)
      canvas.height = Math.round(this.viewH * this.dpr)
      this.redraw()
    },
    pointer(e) {
      const rect = this.$refs.wrap.getBoundingClientRect()
      return { x: e.clientX - rect.left, y: e.clientY - rect.top }
    },
    toWorld(p) {
      return { x: (p.x - this.panX) / this.zoom, y: (p.y - this.panY) / this.zoom }
    },
    onWheel(e) {
      if (e.ctrlKey || e.metaKey) {
        // 触控板捏合 / ⌘+滚轮：以指针为中心缩放
        this.zoomAt(this.pointer(e), Math.exp(-e.deltaY * 0.01))
      } else {
        this.panX -= e.deltaX
        this.panY -= e.deltaY
        this.scheduleRedraw()
      }
    },
    zoomAt(p, factor) {
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, this.zoom * factor))
      const k = z / this.zoom
      this.panX = p.x - (p.x - this.panX) * k
      this.panY = p.y - (p.y - this.panY) * k
      this.zoom = z
      this.scheduleRedraw()
    },
    zoomBy(f) {
      this.zoomAt({ x: this.viewW / 2, y: this.viewH / 2 }, f)
    },
    resetZoom() {
      this.zoomAt({ x: this.viewW / 2, y: this.viewH / 2 }, 1 / this.zoom)
    },
    // 回到中心：重置缩放与平移，世界原点对齐画布中心
    resetView() {
      this.zoom = 1
      this.panX = 0
      this.panY = 0
      this.redraw()
    },
    fitContent() {
      if (!this.strokes.length) {
        this.zoom = 1
        this.panX = 0
        this.panY = 0
        this.redraw()
        return
      }
      const b = this.bbox()
      const pad = 40
      const w = b.maxX - b.minX + pad * 2
      const h = b.maxY - b.minY + pad * 2
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Math.min(this.viewW / w, this.viewH / h)))
      this.zoom = z
      this.panX = this.viewW / 2 - ((b.minX + b.maxX) / 2) * z
      this.panY = this.viewH / 2 - ((b.minY + b.maxY) / 2) * z
      this.redraw()
    },

    /* ---------- 绘制交互 ---------- */
    onKeyDown(e) {
      if (e.code !== 'Space') return
      const tag = (e.target.tagName || '').toLowerCase()
      if (tag === 'input' || tag === 'textarea') return
      e.preventDefault()
      this.spaceDown = true
    },
    onKeyUp(e) {
      if (e.code === 'Space') this.spaceDown = false
    },
    onDown(e) {
      // 中键 / 空格 / 抓手：平移画布
      if (e.button === 1 || this.spaceDown || this.tool === 'hand') {
        this.panning = true
        this._panStart = this.pointer(e)
        return
      }
      if (e.button !== 0) return
      const p = this.toWorld(this.pointer(e))
      this.strokes.push({
        points: [[p.x, p.y]],
        color: this.color,
        width: this.lineWidth,
        erase: this.tool === 'eraser'
      })
      this.redoStack = []
      this.drawing = true
    },
    onMove(e) {
      const p = this.pointer(e)
      if (this.panning) {
        this.panX += p.x - this._panStart.x
        this.panY += p.y - this._panStart.y
        this._panStart = p
        this.scheduleRedraw()
        return
      }
      if (!this.drawing) return
      const w = this.toWorld(p)
      const s = this.strokes[this.strokes.length - 1]
      s.points.push([w.x, w.y])
      this.drawSegment(s)
    },
    onUp() {
      if (this.panning) {
        this.panning = false
        return
      }
      if (this.drawing) {
        this.drawing = false
        this.redraw()
      }
    },

    /* ---------- 渲染 ---------- */
    scheduleRedraw() {
      if (this._raf) return
      this._raf = requestAnimationFrame(() => {
        this._raf = null
        this.redraw()
      })
    },
    setWorldTransform(ctx) {
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.translate(this.panX, this.panY)
      ctx.scale(this.zoom, this.zoom)
    },
    // 点状网格：随平移缩放移动，营造无限画布空间感
    drawGrid(ctx) {
      let step = 24
      while (step * this.zoom < 24) step *= 2
      const wx0 = -this.panX / this.zoom
      const wy0 = -this.panY / this.zoom
      const x0 = Math.floor(wx0 / step) * step
      const y0 = Math.floor(wy0 / step) * step
      const x1 = wx0 + this.viewW / this.zoom + step
      const y1 = wy0 + this.viewH / this.zoom + step
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0)
      ctx.fillStyle = 'rgba(29, 29, 31, 0.16)'
      for (let x = x0; x <= x1; x += step) {
        const sx = x * this.zoom + this.panX
        for (let y = y0; y <= y1; y += step) {
          ctx.fillRect(sx - 1, y * this.zoom + this.panY - 1, 2, 2)
        }
      }
    },
    drawStroke(ctx, s) {
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
    },
    // 绘画过程中的增量线段（不清屏，保证手写跟手）
    drawSegment(s) {
      const canvas = this.$refs.canvas
      if (!canvas || s.points.length < 1) return
      const ctx = canvas.getContext('2d')
      ctx.save()
      this.setWorldTransform(ctx)
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
    },
    redraw() {
      const canvas = this.$refs.canvas
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      this.drawGrid(ctx)
      this.setWorldTransform(ctx)
      this.strokes.forEach(s => this.drawStroke(ctx, s))
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalCompositeOperation = 'source-over'
    },

    /* ---------- 数据操作 ---------- */
    bbox() {
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity
      this.strokes.forEach(s => {
        const half = s.width / 2 + 2
        s.points.forEach(([x, y]) => {
          if (x - half < minX) minX = x - half
          if (y - half < minY) minY = y - half
          if (x + half > maxX) maxX = x + half
          if (y + half > maxY) maxY = y + half
        })
      })
      return { minX, minY, maxX, maxY }
    },
    undo() {
      if (!this.strokes.length) return
      this.redoStack.push(this.strokes.pop())
      this.redraw()
    },
    redo() {
      if (!this.redoStack.length) return
      this.strokes.push(this.redoStack.pop())
      this.redraw()
    },
    clearBoard() {
      if (!this.strokes.length) return
      this.strokes = []
      this.redoStack = []
      this.redraw()
    },
    exportPng() {
      if (!this.strokes.length) {
        this.$message.warning('画布为空，先画点什么吧')
        return
      }
      const b = this.bbox()
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
      this.strokes.forEach(s => this.drawStroke(ctx, s))
      const a = document.createElement('a')
      a.href = out.toDataURL('image/png')
      a.download = 'whiteboard.png'
      a.click()
    }
  }
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
