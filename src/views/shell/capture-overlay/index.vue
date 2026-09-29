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
    <div v-if="phase === 'freezing'" class="co-freezing"><i class="el-icon-loading"></i></div>

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

        <button class="co-btn" title="撤销 (⌘Z)" @click="undo"><i class="el-icon-refresh-left"></i></button>
        <button class="co-btn" title="重做 (⌘⇧Z)" @click="redo"><i class="el-icon-refresh-right"></i></button>
        <button class="co-btn" title="重选区域 (R)" @click="restartPick">
          <svg viewBox="0 0 24 24" class="co-ico"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8"/><path d="M3 3v5h5"/></g></svg>
        </button>

        <div class="co-div"></div>

        <button class="co-btn co-ok" title="确认 (Enter / 双击)" @click="confirm">
          <i class="el-icon-check"></i><span>确认</span>
        </button>
        <button class="co-btn co-pin" title="贴屏" @click="pin">
          <i class="el-icon-pushpin"></i><span>贴屏</span>
        </button>
        <button class="co-btn co-no" title="取消 (Esc)" @click="cancel">
          <i class="el-icon-close"></i>
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

<script>
// 选区截屏覆盖窗（overlay 单窗口全流程，iShot 体验）：
// phase 状态机：
// - picking：透明层直接覆盖真实屏幕，hover 拾取窗口（z 序命中）/ 拖选；
//   空格锁定、Enter/单击截取、Esc/右键取消；窗口列表 400ms 轮询
// - freezing：选定后调 freeze IPC 抓整屏帧（SCK 排除自身，本窗不入镜）
// - editing：定格帧背景 + 选区 Canvas 标注（矩形/椭圆/直线/箭头/画笔/高亮/
//   序号/马赛克/文字，颜色/粗细/字号，撤销重做）+ 8 手柄微调 + 边界环移动；
//   Enter/双击确认、贴屏、R 重选（回 picking 重新框选）、Esc 取消
// 全程同一窗口零切换；确认/贴屏/取消经 capture-overlay:done 回传主进程
export default {
  name: 'CaptureOverlay',
  data() {
    return {
      phase: 'picking', // picking | freezing | editing
      scrollMode: false, // m=scroll：选完直接回传（无编辑态）
      // ---- picking：窗口拾取 ----
      windows: [], // 本屏窗口列表（z 序前→后，屏内相对坐标）
      hoverWin: null,
      pinnedWin: null,
      winTimer: null,
      lastHoverAt: 0,
      dragging: false,
      start: null,
      downPos: null,
      rect: null, // 拖拽选区（CSS 坐标）
      // ---- editing：定格帧 + 标注 ----
      frame: '', // 整屏定格 dataURL
      imgEl: null,
      ready: false,
      sel: { x: 0, y: 0, width: 0, height: 0 }, // 物理像素
      factor: 1,
      tool: 'rect',
      tools: [
        { id: 'rect', title: '矩形', path: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>' },
        { id: 'ellipse', title: '椭圆', path: '<ellipse cx="12" cy="12" rx="8" ry="6"/>' },
        { id: 'line', title: '直线', path: '<path d="M5 19L19 5"/>' },
        { id: 'arrow', title: '箭头', path: '<path d="M5 19L17 7M17 7h-6M17 7v6"/>' },
        { id: 'pen', title: '画笔', path: '<path d="M4 20l1.2-4.2L16.8 4.2a1.5 1.5 0 0 1 2.1 0l.9.9a1.5 1.5 0 0 1 0 2.1L8.2 18.8 4 20z"/>' },
        { id: 'highlight', title: '高亮', path: '<path d="M9 12l5-5 5 5-5 5z"/><path d="M4 20h16"/>' },
        { id: 'number', title: '序号标记', path: '<circle cx="12" cy="12" r="8.5"/><path d="M10.5 15.5v-7l3.5 7"/>' },
        { id: 'mosaic', title: '马赛克（粗细控制强度）', path: '<rect x="5" y="5" width="4" height="4"/><rect x="11" y="5" width="4" height="4"/><rect x="17" y="5" width="3" height="4"/><rect x="5" y="11" width="4" height="4"/><rect x="11" y="11" width="4" height="4"/><rect x="17" y="11" width="3" height="4"/><rect x="5" y="17" width="4" height="3"/><rect x="11" y="17" width="4" height="3"/><rect x="17" y="17" width="3" height="3"/>' },
        { id: 'text', title: '文字', path: '<path d="M5 6V4h14v2M12 4v16m-3 0h6"/>' }
      ],
      colors: ['#FF4D4F', '#FAAD14', '#52C41A', '#1890FF', '#722ED1', '#FFFFFF', '#000000'],
      color: '#FF4D4F',
      widths: [2, 4, 8],
      width: 4,
      fontSizes: [14, 20, 28],
      fontSize: 20,
      shapes: [],
      redoStack: [],
      drawing: null,
      textEdit: null,
      done: false,
      selMode: null, // 'move' | 'nw'|...（手柄/边界环，与标注互斥）
      selGrab: null,
      frameSize: { w: 0, h: 0 }
    }
  },
  computed: {
    api() {
      return window.electronAPI && window.electronAPI.captureOverlay
    },
    // ---------- picking ----------
    hoverRect() {
      if (this.hoverWin == null) return null
      const w = this.windows.find(x => x.windowNumber === this.hoverWin)
      if (!w) return null
      return { x: w.x, y: w.y, width: w.width, height: w.height, owner: w.owner, title: w.title }
    },
    pinnedRect() {
      if (this.pinnedWin == null) return null
      const w = this.windows.find(x => x.windowNumber === this.pinnedWin)
      if (!w) return null
      return { x: w.x, y: w.y, width: w.width, height: w.height, owner: w.owner, title: w.title }
    },
    displayRect() {
      return this.rect || this.pinnedRect || this.hoverRect
    },
    isWinPick() {
      return !this.rect && !!(this.pinnedRect || this.hoverRect)
    },
    sizeLabel() {
      const r = this.displayRect
      if (!r) return ''
      const size = Math.round(r.width) + ' × ' + Math.round(r.height)
      if (!this.isWinPick) return size
      const name = r.title ? r.owner + ' — ' + r.title : r.owner
      return name + ' · ' + size
    },
    hint() {
      if (this.dragging) return { title: '', sub: '松开完成框选' }
      if (this.rect) return { title: '', sub: '' }
      if (this.pinnedRect) {
        return {
          title: '已选中 ' + (this.pinnedRect.title || this.pinnedRect.owner),
          sub: '单击或 Enter 截取 · 拖拽自定义选区 · Esc 取消'
        }
      }
      if (this.hoverRect) return { title: '单击截取此窗口 · 拖拽自定义选区', sub: '' }
      return { title: '拖拽框选要截取的区域', sub: '移动鼠标自动识别窗口 · Esc / 右键取消' }
    },
    maskStyle() {
      const r = this.displayRect
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
    },
    rectStyle() {
      const r = this.displayRect
      if (!r) return {}
      return { left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' }
    },
    sizeStyle() {
      const r = this.displayRect
      if (!r) return {}
      const w = Math.min(r.x + r.width / 2, window.innerWidth - 150)
      return {
        left: Math.max(8, w) + 'px',
        top: Math.max(0, r.y - 26) + 'px',
        transform: 'translateX(-50%)'
      }
    },
    // ---------- editing ----------
    canvasStyle() {
      return {
        position: 'absolute',
        left: this.sel.x / this.factor + 'px',
        top: this.sel.y / this.factor + 'px',
        width: this.sel.width / this.factor + 'px',
        height: this.sel.height / this.factor + 'px',
        cursor: this.tool === 'text' ? 'text' : 'crosshair'
      }
    },
    barStyle() {
      const left = Math.max(0, Math.min(this.sel.x / this.factor, window.innerWidth - 700))
      const top = this.sel.y / this.factor
      return top >= 56
        ? { left: left + 'px', top: Math.max(0, top - 50) + 'px' }
        : { left: left + 'px', top: top + this.sel.height / this.factor + 10 + 'px' }
    },
    sizeTagStyle() {
      return {
        left: this.sel.x / this.factor + 'px',
        top: Math.max(0, this.sel.y / this.factor - 26) + 'px'
      }
    },
    selHandles() {
      if (!this.ready) return []
      const f = this.factor
      const s = this.sel
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
    },
    textEditStyle() {
      const t = this.textEdit
      if (!t) return {}
      return {
        left: t.x / this.factor + 'px',
        top: t.y / this.factor + 'px',
        color: this.color,
        fontSize: this.fontSize + 'px',
        lineHeight: 1.3,
        minHeight: Math.round(this.fontSize * 1.3) + 'px'
      }
    }
  },
  async mounted() {
    // m=scroll：选完直接回传，不进编辑态
    this.scrollMode = new URLSearchParams(location.hash.split('?')[1] || '').get('m') === 'scroll'
    window.addEventListener('keydown', this.onKeydown)
    window.addEventListener('mousemove', this.onGlobalMouseMove)
    window.addEventListener('mouseup', this.onGlobalMouseUp)
    // picking 首拉上下文：窗口列表 + 光标 → 默认选中光标下窗口
    await this.pullContext(true)
    this.winTimer = setInterval(() => {
      if (this.phase === 'picking') this.pullContext(false)
    }, 400)
  },
  beforeUnmount() {
    window.removeEventListener('keydown', this.onKeydown)
    window.removeEventListener('mousemove', this.onGlobalMouseMove)
    window.removeEventListener('mouseup', this.onGlobalMouseUp)
    if (this.winTimer) {
      clearInterval(this.winTimer)
      this.winTimer = null
    }
  },
  watch: {
    sel: {
      deep: true,
      handler() {
        if (this.phase === 'editing' && this.ready) this.$nextTick(this.render)
      }
    }
  },
  methods: {
    // ---------- picking：窗口拾取 ----------
    async pullContext(first) {
      const api = this.api
      if (!api || !api.context) return
      try {
        const res = await api.context()
        if (res && res.ok && Array.isArray(res.windows)) this.windows = res.windows
        if (first && res && res.ok && res.cursor) {
          const hit = this.hitTest(res.cursor.x, res.cursor.y)
          if (hit) this.pinnedWin = hit.windowNumber
        }
      } catch (e) { /* 插件不可用：降级纯框选 */ }
    },
    hitTest(x, y) {
      for (const w of this.windows) {
        if (x >= w.x && x <= w.x + w.width && y >= w.y && y <= w.y + w.height) return w
      }
      return null
    },
    onRootMouseDown(e) {
      if (e.button !== 0 || this.phase !== 'picking') return
      this.downPos = { x: e.clientX, y: e.clientY }
      this.dragging = true
      this.start = { x: e.clientX, y: e.clientY }
      this.rect = { x: e.clientX, y: e.clientY, width: 0, height: 0 }
    },
    onGlobalMouseMove(e) {
      if (this.phase === 'editing') {
        this.onSelMove(e)
        return
      }
      if (this.phase !== 'picking') return
      if (this.dragging) {
        const s = this.start
        this.rect = {
          x: Math.min(s.x, e.clientX),
          y: Math.min(s.y, e.clientY),
          width: Math.abs(e.clientX - s.x),
          height: Math.abs(e.clientY - s.y)
        }
        return
      }
      if (this.pinnedWin != null) return
      const now = performance.now()
      if (now - this.lastHoverAt < 30) return
      this.lastHoverAt = now
      const hit = this.hitTest(e.clientX, e.clientY)
      const id = hit ? hit.windowNumber : null
      if (this.hoverWin !== id) this.hoverWin = id
    },
    onGlobalMouseUp(e) {
      if (this.phase === 'editing') {
        this.onSelUp()
        return
      }
      if (this.phase !== 'picking' || !this.dragging) return
      this.dragging = false
      const r = this.rect
      const moved = this.downPos
        ? Math.abs(e.clientX - this.downPos.x) + Math.abs(e.clientY - this.downPos.y)
        : 999
      if (!r || r.width < 3 || r.height < 3) {
        // 单击：选中锁定/hover 窗口直接截取
        const wr = this.pinnedRect || this.hoverRect
        if (moved < 6 && wr) {
          this.pickRect(this.pickRectOf(wr))
          return
        }
        this.rect = null
        return
      }
      this.pickRect(r)
    },
    pickRectOf(r) {
      return { x: r.x, y: r.y, width: r.width, height: r.height }
    },
    // 选区确定：scroll 模式直接回传；否则 freeze 抓帧进编辑态
    async pickRect(rect) {
      if (this.done) return
      if (this.scrollMode) {
        this.finish(null, rect)
        return
      }
      this.phase = 'freezing'
      try {
        const res = await this.api.freeze()
        if (!res || !res.ok) {
          // 抓帧失败：降级直接回传选区（主进程兜底 crop）
          this.finish(null, rect)
          return
        }
        this.factor = res.factor || 1
        this.sel = {
          x: Math.round(rect.x * this.factor),
          y: Math.round(rect.y * this.factor),
          width: Math.round(rect.width * this.factor),
          height: Math.round(rect.height * this.factor)
        }
        this.frame = res.frame
        const img = new Image()
        img.onload = () => {
          this.imgEl = img
          this.frameSize = { w: img.naturalWidth, h: img.naturalHeight }
          this.phase = 'editing'
          this.ready = true
          this.$nextTick(this.render)
        }
        img.src = res.frame
      } catch (err) {
        this.finish(null, rect)
      }
    },
    // ---------- editing：选区微调（手柄缩放 + 边界环移动） ----------
    framePoint(e) {
      return { x: e.clientX * this.factor, y: e.clientY * this.factor }
    },
    onSelMove(e) {
      if (!this.selMode) return
      const p = this.framePoint(e)
      if (this.selMode === 'move') {
        const fw = this.frameSize.w || 1
        const fh = this.frameSize.h || 1
        const nx = Math.max(0, Math.min(this.selGrab.x + p.x - this.selGrab.px, fw - this.sel.width))
        const ny = Math.max(0, Math.min(this.selGrab.y + p.y - this.selGrab.py, fh - this.sel.height))
        this.sel = Object.assign({}, this.sel, { x: nx, y: ny })
      } else {
        this.applySelResize(this.selMode, p.x, p.y)
      }
    },
    onSelUp() {
      if (!this.selMode) return
      this.selMode = null
      this.selGrab = null
    },
    applySelResize(dir, cx, cy) {
      const min = 10
      const fw = this.frameSize.w || 1
      const fh = this.frameSize.h || 1
      const s = Object.assign({}, this.sel)
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
      this.sel = s
    },
    // ---------- editing：标注绘制 ----------
    render() {
      const canvas = this.$refs.canvas
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const s = this.sel
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(this.imgEl, s.x, s.y, s.width, s.height, 0, 0, s.width, s.height)
      for (const sh of this.shapes) this.drawShape(ctx, sh)
      if (this.drawing) this.drawShape(ctx, this.drawing)
    },
    drawShape(ctx, sh) {
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
        this.mosaicRegion(ctx, x, y, w, h, Math.max(6, sh.width * 3))
      } else if (sh.type === 'number') {
        const r = 11 * this.factor
        ctx.beginPath()
        ctx.arc(sh.x1, sh.y1, r, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = sh.color.toUpperCase() === '#FFFFFF' ? '#111' : '#fff'
        ctx.font = '600 ' + Math.round(13 * this.factor) + 'px sans-serif'
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
    },
    mosaicRegion(ctx, x, y, w, h, size = 12) {
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
    },
    canvasPos(e) {
      const rect = this.$refs.canvas.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left) * this.factor,
        y: (e.clientY - rect.top) * this.factor
      }
    },
    onCanvasMouseDown(e) {
      if (e.button !== 0 || this.done) return
      if (this.textEdit) {
        this.commitText()
        return
      }
      const p = this.canvasPos(e)
      if (this.tool === 'text') {
        this.startText(p)
        return
      }
      if (this.tool === 'number') {
        this.addShape({ type: 'number', x1: p.x, y1: p.y, n: this.nextNumber(), color: this.color, width: this.width })
        this.render()
        return
      }
      if (this.tool === 'pen') {
        this.drawing = { type: 'pen', points: [{ x: p.x, y: p.y }], color: this.color, width: this.width }
        return
      }
      this.drawing = { type: this.tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: this.color, width: this.width }
    },
    onCanvasMouseMove(e) {
      if (!this.drawing) return
      const p = this.canvasPos(e)
      if (this.drawing.type === 'pen') this.drawing.points.push({ x: p.x, y: p.y })
      else {
        this.drawing.x2 = p.x
        this.drawing.y2 = p.y
      }
      this.render()
    },
    onCanvasMouseUp() {
      if (!this.drawing) return
      const d = this.drawing
      this.drawing = null
      if (d.type === 'pen') {
        const xs = d.points.map(o => o.x)
        const ys = d.points.map(o => o.y)
        if (Math.max.apply(null, xs) - Math.min.apply(null, xs) < 2 && Math.max.apply(null, ys) - Math.min.apply(null, ys) < 2) return
      } else if (Math.abs(d.x2 - d.x1) < 2 && Math.abs(d.y2 - d.y1) < 2) {
        return
      }
      this.addShape(d)
      this.render()
    },
    addShape(sh) {
      this.shapes.push(sh)
      this.redoStack = []
    },
    nextNumber() {
      const used = new Set(this.shapes.filter(s => s.type === 'number').map(s => s.n))
      let i = 1
      while (used.has(i)) i++
      return i
    },
    startText(p) {
      this.textEdit = { x: p.x, y: p.y, value: '' }
      const self = this
      this.$nextTick(() => {
        if (self.$refs.textInput) self.$refs.textInput.focus()
      })
    },
    commitText() {
      const t = this.textEdit
      this.textEdit = null
      const value = (t.value || '').trim()
      if (!value) return
      this.addShape({ type: 'text', x1: t.x, y1: t.y, value: value, color: this.color, fontSize: this.fontSize * this.factor, width: this.width })
      this.render()
    },
    cancelText() {
      this.textEdit = null
    },
    undo() {
      const s = this.shapes.pop()
      if (s) {
        this.redoStack.push(s)
        this.render()
      }
    },
    redo() {
      const s = this.redoStack.pop()
      if (s) {
        this.shapes.push(s)
        this.render()
      }
    },
    // editing 态根 mousedown：手柄缩放 / 边界环移动
    onRootMouseDown2(e) {
      if (e.button !== 0 || this.done || !this.ready) return
      if (e.target.closest && e.target.closest('.co-bar, .co-text-input')) return
      const handle = e.target.dataset && e.target.dataset.handle
      if (handle) {
        this.selMode = handle
        return
      }
      if (e.target === this.$refs.canvas) return
      const r = this.$refs.canvas.getBoundingClientRect()
      const pad = 10
      const inCanvas = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
      const inRing = e.clientX >= r.left - pad && e.clientX <= r.right + pad &&
        e.clientY >= r.top - pad && e.clientY <= r.bottom + pad
      if (!inCanvas && inRing) {
        const p = this.framePoint(e)
        this.selMode = 'move'
        this.selGrab = { px: p.x, py: p.y, x: this.sel.x, y: this.sel.y }
      }
    },
    // ---------- 结果回传 ----------
    resultDataUrl() {
      return this.$refs.canvas.toDataURL('image/png')
    },
    // 回传主进程：result = { action, data, rect } 编辑结果；rect 选区
    finish(result, rect) {
      if (this.done) return
      this.done = true
      if (this.api) this.api.done(result || (rect ? rect : null))
    },
    confirm() {
      if (this.done || !this.ready) return
      this.finish({
        action: 'confirm',
        data: this.resultDataUrl(),
        rect: { x: this.sel.x / this.factor, y: this.sel.y / this.factor, width: this.sel.width / this.factor, height: this.sel.height / this.factor }
      })
    },
    pin() {
      if (this.done || !this.ready) return
      this.finish({
        action: 'pin',
        data: this.resultDataUrl(),
        rect: { x: this.sel.x / this.factor, y: this.sel.y / this.factor, width: this.sel.width / this.factor, height: this.sel.height / this.factor }
      })
    },
    // R / 工具栏按钮：回 picking 重新框选（保留本窗，定格帧丢弃）
    restartPick() {
      if (this.done) return
      this.phase = 'picking'
      this.ready = false
      this.frame = ''
      this.imgEl = null
      this.shapes = []
      this.redoStack = []
      this.drawing = null
      this.textEdit = null
      this.selMode = null
      this.rect = null
      this.hoverWin = null
      this.pinnedWin = null
      this.pullContext(true)
    },
    cancel() {
      this.finish(null)
    },
    onContextMenu() {
      // editing 态右键不取消（防误触），picking 态右键取消
      if (this.phase === 'picking') this.cancel()
    },
    onKeydown(e) {
      if (this.done) return
      if (this.textEdit) return
      if (this.phase === 'picking') {
        if (e.key === 'Escape') {
          this.cancel()
          return
        }
        if (e.code === 'Space') {
          e.preventDefault()
          if (this.rect) return
          if (this.pinnedWin != null) this.pinnedWin = null
          else if (this.hoverWin != null) {
            this.pinnedWin = this.hoverWin
            this.hoverWin = null
          }
          return
        }
        if (e.key === 'Enter') {
          if (this.rect) this.pickRect(this.rect)
          else if (this.pinnedRect) this.pickRect(this.pickRectOf(this.pinnedRect))
        }
        return
      }
      if (this.phase === 'editing') {
        if (e.key === 'Escape') this.cancel()
        else if (e.key === 'Enter') this.confirm()
        else if (e.key.toLowerCase() === 'r' && !e.metaKey && !e.ctrlKey) this.restartPick()
        else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'z') {
          e.preventDefault()
          this.redo()
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
          e.preventDefault()
          this.undo()
        } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'y') {
          e.preventDefault()
          this.redo()
        }
      }
    }
  }
}
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
