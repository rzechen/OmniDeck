<template>
  <div
    class="capture-editor"
    :style="bgStyle"
    @contextmenu.prevent="cancel"
  >
    <!-- 加载定格帧中 -->
    <div v-if="!ready" class="ce-loading"><i class="el-icon-loading"></i></div>

    <template v-if="ready">
      <!-- 全屏定格帧背景（选区画布用超大 box-shadow 挖空压暗，视觉"冻结"屏幕） -->
      <div class="ce-bg" :style="{ backgroundImage: `url(${frame})` }"></div>

      <!-- 选区画布（物理分辨率绘制，CSS 缩放到选区显示大小） -->
      <canvas
        ref="canvas"
        class="ce-canvas"
        :width="sel.width"
        :height="sel.height"
        :style="canvasStyle"
        @mousedown="onMouseDown"
        @mousemove="onMouseMove"
        @mouseup="onMouseUp"
        @dblclick="confirm"
      ></canvas>

      <!-- 工具栏（贴选区上方或屏幕顶部） -->
      <div class="ce-bar" :style="barStyle">
        <!-- 形状工具 -->
        <button
          v-for="t in tools"
          :key="t.id"
          class="ce-btn"
          :class="{ active: tool === t.id }"
          :title="t.title"
          @click="tool = t.id"
        >
          <svg viewBox="0 0 24 24" class="ce-ico"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" v-html="t.path"></g></svg>
        </button>

        <div class="ce-div"></div>

        <!-- 颜色 -->
        <button
          v-for="c in colors"
          :key="c"
          class="ce-color"
          :class="{ active: color === c }"
          :style="{ background: c }"
          @click="color = c"
        ></button>

        <div class="ce-div"></div>

        <!-- 粗细 -->
        <div class="ce-widths">
          <button
            v-for="w in widths"
            :key="w"
            class="ce-wbtn"
            :class="{ active: width === w }"
            @click="width = w"
          >
            <span :style="{ width: w + 2 + 'px', height: w + 2 + 'px' }"></span>
          </button>
        </div>

        <div class="ce-div"></div>

        <button class="ce-btn" title="撤销 (⌘Z)" @click="undo"><i class="el-icon-refresh-left"></i></button>

        <div class="ce-div"></div>

        <button class="ce-btn ce-ok" title="确认 (Enter / 双击)" @click="confirm">
          <i class="el-icon-check"></i><span>确认</span>
        </button>
        <button class="ce-btn ce-pin" title="贴屏" @click="pin">
          <i class="el-icon-pushpin"></i><span>贴屏</span>
        </button>
        <button class="ce-btn ce-no" title="取消 (Esc)" @click="cancel">
          <i class="el-icon-close"></i>
        </button>
      </div>

      <!-- 尺寸角标 -->
      <div class="ce-size" :style="sizeTagStyle">{{ sel.width }} × {{ sel.height }}</div>
    </template>
  </div>
</template>

<script>
// 标注编辑窗（iShot 风格）：选区定格帧 + Canvas 标注。
// 流程：主进程截图定格 → 本窗加载后经 capture-editor:frame 拉取整屏帧与
// 选区物理坐标 → 画布按选区 crop 绘制 → 用户标注（矩形/椭圆/直线/箭头/
// 马赛克/文本，可选颜色与粗细，可撤销）→ 确认（crop+标注合成 PNG dataURL
// 经 capture-editor:done 回传）/ 贴屏（pin，同确认但贴到置顶小窗）/ 取消。
export default {
  name: 'CaptureEditor',
  data() {
    return {
      ready: false,
      frame: '', // 整屏定格 dataURL
      imgEl: null,
      sel: { x: 0, y: 0, width: 0, height: 0 }, // 物理像素
      factor: 1,
      // 工具
      tool: 'rect',
      tools: [
        { id: 'rect', title: '矩形', path: '<rect x="4" y="6" width="16" height="12" rx="1.5"/>' },
        { id: 'ellipse', title: '椭圆', path: '<ellipse cx="12" cy="12" rx="8" ry="6"/>' },
        { id: 'line', title: '直线', path: '<path d="M5 19L19 5"/>' },
        { id: 'arrow', title: '箭头', path: '<path d="M5 19L17 7M17 7h-6M17 7v6"/>' },
        { id: 'mosaic', title: '马赛克', path: '<rect x="5" y="5" width="4" height="4"/><rect x="11" y="5" width="4" height="4"/><rect x="17" y="5" width="3" height="4"/><rect x="5" y="11" width="4" height="4"/><rect x="11" y="11" width="4" height="4"/><rect x="17" y="11" width="3" height="4"/><rect x="5" y="17" width="4" height="3"/><rect x="11" y="17" width="4" height="3"/><rect x="17" y="17" width="3" height="3"/>' },
        { id: 'text', title: '文字', path: '<path d="M5 6V4h14v2M12 4v16m-3 0h6"/>' }
      ],
      colors: ['#FF4D4F', '#FAAD14', '#52C41A', '#1890FF', '#722ED1', '#FFFFFF', '#000000'],
      color: '#FF4D4F',
      widths: [2, 4, 8],
      width: 4,
      // 标注栈
      shapes: [],
      drawing: null, // 当前绘制中形状
      textEdit: null, // { x, y, value } 文字输入中
      done: false
    }
  },
  computed: {
    api() {
      return window.electronAPI && window.electronAPI.captureEditor
    },
    // 选区在窗口内的 CSS 位置（窗口铺满屏，选区即原选区 CSS 位置）
    selCss() {
      return {
        left: this.sel.x / this.factor + 'px',
        top: this.sel.y / this.factor + 'px',
        width: this.sel.width / this.factor + 'px',
        height: this.sel.height / this.factor + 'px'
      }
    },
    bgStyle() {
      if (!this.ready || !this.imgEl) return {}
      // 背景：整屏定格帧铺满窗口（CSS 尺寸），选区外压暗
      return {}
    },
    canvasStyle() {
      // 画布贴齐选区：物理分辨率绘制，CSS 缩放到选区显示大小
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
      // 工具栏贴选区上方（不够则下方）
      const top = this.sel.y / this.factor
      return top >= 56
        ? { left: this.sel.x / this.factor + 'px', top: Math.max(0, top - 50) + 'px' }
        : { left: this.sel.x / this.factor + 'px', top: this.sel.y / this.factor + this.sel.height / this.factor + 10 + 'px' }
    },
    sizeTagStyle() {
      return {
        left: this.sel.x / this.factor + 'px',
        top: Math.max(0, this.sel.y / this.factor - 26) + 'px'
      }
    }
  },
  async mounted() {
    window.addEventListener('keydown', this.onKeydown)
    const res = await this.api.frame()
    if (!res || !res.ok) { this.cancel(); return }
    this.factor = res.factor || 1
    this.sel = res.sel
    this.frame = res.frame // 背景（定格帧 dataURL）
    // 加载定格帧图片元素（画布绘制源）
    const img = new Image()
    img.onload = () => {
      this.imgEl = img
      this.ready = true
      this.$nextTick(this.render)
    }
    img.src = res.frame
  },
  beforeDestroy() {
    window.removeEventListener('keydown', this.onKeydown)
  },
  methods: {
    // ---------- 渲染 ----------
    render() {
      const canvas = this.$refs.canvas
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      const s = this.sel
      // 1. 底图：整屏帧 crop 选区
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(this.imgEl, s.x, s.y, s.width, s.height, 0, 0, s.width, s.height)
      // 2. 已完成形状
      for (const sh of this.shapes) this.drawShape(ctx, sh)
      // 3. 绘制中形状
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
        // 箭头头部：方向向量 + 固定角度
        const ang = Math.atan2(sh.y2 - sh.y1, sh.x2 - sh.x1)
        const len = Math.max(12, sh.width * 3)
        ctx.beginPath()
        ctx.moveTo(sh.x2, sh.y2)
        ctx.lineTo(sh.x2 - len * Math.cos(ang - Math.PI / 6), sh.y2 - len * Math.sin(ang - Math.PI / 6))
        ctx.moveTo(sh.x2, sh.y2)
        ctx.lineTo(sh.x2 - len * Math.cos(ang + Math.PI / 6), sh.y2 - len * Math.sin(ang + Math.PI / 6))
        ctx.stroke()
      } else if (sh.type === 'mosaic') {
        // 马赛克：取区域像素放大马赛克化（对当前画布内容）
        this.mosaicRegion(ctx, x, y, w, h)
      } else if (sh.type === 'text') {
        ctx.font = `${sh.fontSize}px sans-serif`
        ctx.textBaseline = 'top'
        // 文字描边（白底黑字/黑底白字视颜色而定：细描边保证可读）
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'
        ctx.lineWidth = 3
        ctx.strokeText(sh.value, sh.x1, sh.y1)
        ctx.fillText(sh.value, sh.x1, sh.y1)
      }
      ctx.restore()
    },
    mosaicRegion(ctx, x, y, w, h) {
      if (w < 2 || h < 2) return
      const size = 12 // 马赛克粒度
      const sx = Math.max(0, Math.floor(x))
      const sy = Math.max(0, Math.floor(y))
      const sw = Math.min(ctx.canvas.width - sx, Math.ceil(w))
      const sh2 = Math.min(ctx.canvas.height - sy, Math.ceil(h))
      if (sw < 1 || sh2 < 1) return
      // 取区域 → 缩小 → 放大回贴
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
    // ---------- 事件 ----------
    pos(e) {
      // 事件 CSS 坐标 → 画布物理像素
      const rect = this.$refs.canvas.getBoundingClientRect()
      return {
        x: (e.clientX - rect.left) * this.factor,
        y: (e.clientY - rect.top) * this.factor
      }
    },
    onMouseDown(e) {
      if (e.button !== 0 || this.done) return
      const p = this.pos(e)
      if (this.tool === 'text') {
        this.startText(p)
        return
      }
      this.drawing = { type: this.tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y, color: this.color, width: this.width }
    },
    onMouseMove(e) {
      if (!this.drawing) return
      const p = this.pos(e)
      this.drawing.x2 = p.x
      this.drawing.y2 = p.y
      this.render()
    },
    onMouseUp() {
      if (!this.drawing) return
      const d = this.drawing
      this.drawing = null
      // 过小忽略
      if (Math.abs(d.x2 - d.x1) < 2 && Math.abs(d.y2 - d.y1) < 2) return
      this.shapes.push(d)
      this.render()
    },
    startText(p) {
      // 简化输入：用 window.prompt（独立输入框成本高，prompt 可靠且聚焦）
      const value = window.prompt('输入标注文字')
      if (!value) return
      this.shapes.push({ type: 'text', x1: p.x, y1: p.y, value, color: this.color, fontSize: 20 * this.factor, width: this.width })
      this.render()
    },
    undo() {
      this.shapes.pop()
      this.render()
    },
    onKeydown(e) {
      if (this.done) return
      if (e.key === 'Escape') this.cancel()
      else if (e.key === 'Enter') this.confirm()
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        this.undo()
      }
    },
    // ---------- 结果 ----------
    resultDataUrl() {
      // 画布已含底图 crop + 全部标注：直接 toDataURL
      return this.$refs.canvas.toDataURL('image/png')
    },
    async confirm() {
      if (this.done) return
      this.done = true
      await this.api.done({ action: 'confirm', data: this.resultDataUrl() })
    },
    async pin() {
      if (this.done) return
      this.done = true
      await this.api.done({ action: 'pin', data: this.resultDataUrl() })
    },
    cancel() {
      if (this.done) return
      this.done = true
      this.api.done({ action: 'cancel' })
    }
  }
}
</script>

<style lang="scss" scoped>
.capture-editor {
  position: fixed;
  inset: 0;
  overflow: hidden;
  user-select: none;
}

/* 定格帧背景：铺满窗口，稍作压暗 */
.ce-bg {
  position: absolute;
  inset: 0;
  background-size: 100% 100%;
  background-position: center;
  filter: brightness(1);
}

/* 画布：选区细蓝框 + 超大 spread box-shadow 挖空压暗选区外区域 */
.ce-canvas {
  position: absolute;
  box-shadow:
    0 0 0 1.5px #4a9eff,
    0 0 0 9999px rgba(0, 0, 0, 0.45);
}

.ce-loading {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  font-size: 28px;
  color: #fff;
}

.ce-bar {
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

.ce-btn {
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

  .ce-ico {
    width: 16px;
    height: 16px;
  }

  i { font-size: 14px; }
  span { font-size: 12px; }
}

.ce-ok { color: #4ade80; }
.ce-pin { color: #7cc0ff; }
.ce-no { color: #ff7b72; }

.ce-div {
  width: 1px;
  height: 18px;
  background: rgba(255, 255, 255, 0.15);
}

.ce-color {
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

.ce-wbtn {
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

.ce-size {
  position: absolute;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 12px;
  pointer-events: none;
}
</style>
