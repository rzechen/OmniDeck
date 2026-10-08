<template>
  <tool-shell
    title="图片旋转"
    desc="任意角度旋转与水平垂直翻转"
    icon="rotate"
    color="#EB2F96"
    back-path="/tools/image"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div class="tool-seg-item" @click="rotate(-90)">
          <svg-icon icon-class="refresh-left" />
          左转 90°
        </div>
        <div class="tool-seg-item" @click="rotate(90)">
          <svg-icon icon-class="refresh-right" />
          右转 90°
        </div>
        <div class="tool-seg-item" @click="angle = 0">复位</div>
      </div>
      <div class="tool-seg">
        <div class="tool-seg-item" :class="{ active: flipH }" @click="flipH = !flipH">水平翻转</div>
        <div class="tool-seg-item" :class="{ active: flipV }" @click="flipV = !flipV">垂直翻转</div>
      </div>
      <div class="angle-field">
        <span>角度</span>
        <input v-model.number="angle" type="number" step="15" />
      </div>
      <button class="tool-btn is-primary" :disabled="!file" @click="exportImage">
        <svg-icon icon-class="download" />
        导出 PNG
      </button>
      <button class="tool-btn is-danger" :disabled="!file" @click="reset">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="flip-body">
      <image-drop v-if="!file" @change="onFile" />
      <div v-else class="flip-canvas-wrap">
        <canvas ref="canvas" class="flip-canvas"></canvas>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span v-if="file">{{ info }}</span>
      <span v-else>等待上传</span>
      <span class="status-right">角度 {{ angle }}° · {{ flipH ? '水平翻转 ' : '' }}{{ flipV ? '垂直翻转' : '' }}</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import ImageDrop from '@/components/tool/ImageDrop.vue'
import { loadImage, formatSize } from '@/utils/ui/image'

export default {
  name: 'ImageFlip',
  components: { ToolShell, ImageDrop },
  data() {
    return {
      file: null,
      angle: 0,
      flipH: false,
      flipV: false,
      info: ''
    }
  },
  watch: {
    angle() {
      this.render()
    },
    flipH() {
      this.render()
    },
    flipV() {
      this.render()
    }
  },
  methods: {
    formatSize,
    async onFile(file) {
      this.file = file
      const { img } = await loadImage(file)
      this._img = img
      this.info = `${img.naturalWidth} × ${img.naturalHeight} · ${formatSize(file.size)}`
      this.$nextTick(() => this.render())
    },
    rotate(delta) {
      this.angle = (this.angle + delta + 360) % 360
    },
    render() {
      if (!this._img) return
      const img = this._img
      const canvas = this.$refs.canvas
      if (!canvas) return
      const rad = (this.angle * Math.PI) / 180
      const cos = Math.abs(Math.cos(rad))
      const sin = Math.abs(Math.sin(rad))
      // 旋转后外接矩形尺寸
      const w = img.naturalWidth * cos + img.naturalHeight * sin
      const h = img.naturalWidth * sin + img.naturalHeight * cos
      // 限制预览尺寸
      const scale = Math.min(1, 900 / Math.max(w, h))
      canvas.width = w * scale
      canvas.height = h * scale
      const ctx = canvas.getContext('2d')
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.save()
      ctx.translate(canvas.width / 2, canvas.height / 2)
      ctx.rotate(rad)
      ctx.scale(this.flipH ? -1 : 1, this.flipV ? -1 : 1)
      ctx.drawImage(img, -img.naturalWidth * scale / 2, -img.naturalHeight * scale / 2, img.naturalWidth * scale, img.naturalHeight * scale)
      ctx.restore()
    },
    exportImage() {
      if (!this.$refs.canvas) return
      const a = document.createElement('a')
      a.href = this.$refs.canvas.toDataURL('image/png')
      a.download = 'rotated.png'
      a.click()
    },
    reset() {
      this.file = null
      this._img = null
      this.angle = 0
      this.flipH = false
      this.flipV = false
    }
  }
}
</script>

<style lang="scss" scoped>
.flip-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.flip-canvas-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  padding: 16px;
}

.flip-canvas {
  max-width: 100%;
  max-height: 100%;
  border-radius: 6px;
  box-shadow: var(--shadow-sm);
}

.angle-field {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);

  input {
    width: 64px;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--border-color);
    border-radius: 14px;
    outline: none;
    background: var(--card-bg);
    font-size: 12px;
    color: var(--text-primary);
    text-align: center;

    &:focus {
      border-color: rgba(var(--primary-color-rgb), 0.5);
    }
  }
}
</style>
