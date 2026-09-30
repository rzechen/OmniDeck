<template>
  <tool-shell
    title="图片水印"
    desc="文字水印：位置、角度、透明度可调"
    icon="watermark"
    color="#EB2F96"
    back-path="/tools/image"
  >
    <template #toolbar>
      <input v-model="text" class="wm-text-input" placeholder="水印文字" maxlength="30" />
      <label class="cfg-inline">
        <span>大小</span>
        <input v-model.number="fontSize" type="range" min="12" max="72" />
        <b class="mono">{{ fontSize }}</b>
      </label>
      <label class="cfg-inline">
        <span>透明度</span>
        <input v-model.number="opacity" type="range" min="5" max="100" />
        <b class="mono">{{ opacity }}%</b>
      </label>
      <label class="cfg-inline">
        <span>角度</span>
        <input v-model.number="rotate" type="range" min="-90" max="90" step="5" />
        <b class="mono">{{ rotate }}°</b>
      </label>
      <div class="tool-seg">
        <div
          v-for="p in positions"
          :key="p.value"
          class="tool-seg-item"
          :class="{ active: position === p.value }"
          @click="position = p.value"
        >
          {{ p.label }}
        </div>
      </div>
      <button class="tool-btn is-primary" :disabled="!file || !text.trim()" @click="exportImage">
        <svg-icon icon-class="download" />
        导出 PNG
      </button>
      <button class="tool-btn is-danger" :disabled="!file" @click="reset">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="wm-body">
      <image-drop v-if="!file" @change="onFile" />
      <div v-else class="wm-canvas-wrap">
        <canvas ref="canvas" class="wm-canvas"></canvas>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ file ? '实时预览' : '等待上传' }}</span>
      <span class="status-right">水印色 {{ color }}</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import ImageDrop from '@/components/tool/ImageDrop.vue'
import { loadImage } from '@/utils/image'

export default {
  name: 'ImageWatermark',
  components: { ToolShell, ImageDrop },
  data() {
    return {
      file: null,
      text: 'OmniDeck',
      fontSize: 28,
      opacity: 35,
      rotate: -30,
      position: 'center',
      color: '#FFFFFF',
      positions: [
        { label: '左上', value: 'tl' },
        { label: '居中', value: 'center' },
        { label: '右下', value: 'br' }
      ]
    }
  },
  watch: {
    text() { this.render() },
    fontSize() { this.render() },
    opacity() { this.render() },
    rotate() { this.render() },
    position() { this.render() }
  },
  methods: {
    async onFile(file) {
      this.file = file
      const { img } = await loadImage(file)
      this._img = img
      this.$nextTick(() => this.render())
    },
    render() {
      const img = this._img
      const canvas = this.$refs.canvas
      if (!img || !canvas) return
      const scale = Math.min(1, 900 / Math.max(img.naturalWidth, img.naturalHeight))
      canvas.width = img.naturalWidth * scale
      canvas.height = img.naturalHeight * scale
      const ctx = canvas.getContext('2d')
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      const t = this.text.trim()
      if (!t) return
      ctx.save()
      ctx.globalAlpha = this.opacity / 100
      ctx.fillStyle = this.color
      ctx.font = `600 ${this.fontSize}px -apple-system, 'PingFang SC', sans-serif`
      const m = ctx.measureText(t)
      const pad = 20
      let x
      let y
      if (this.position === 'tl') {
        x = pad
        y = pad + this.fontSize
        ctx.textAlign = 'left'
      } else if (this.position === 'br') {
        x = canvas.width - pad
        y = canvas.height - pad
        ctx.textAlign = 'right'
      } else {
        x = canvas.width / 2
        y = canvas.height / 2
        ctx.textAlign = 'center'
      }
      ctx.translate(x, y)
      ctx.rotate((this.rotate * Math.PI) / 180)
      // 描边增强可读性
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'
      ctx.lineWidth = 1
      ctx.strokeText(t, 0, 0)
      ctx.fillText(t, 0, 0)
      ctx.restore()
    },
    exportImage() {
      if (!this.$refs.canvas) return
      const a = document.createElement('a')
      a.href = this.$refs.canvas.toDataURL('image/png')
      a.download = 'watermarked.png'
      a.click()
    },
    reset() {
      this.file = null
      this._img = null
    }
  }
}
</script>

<style lang="scss" scoped>
.wm-text-input {
  width: 150px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  outline: none;
  background: var(--card-bg);
  font-size: 12px;
  color: var(--text-primary);

  &:focus {
    border-color: rgba(var(--primary-color-rgb), 0.5);
  }
}

.cfg-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);

  b {
    min-width: 36px;
    color: var(--primary-color);
    text-align: right;
  }

  input[type='range'] {
    width: 70px;
    accent-color: var(--primary-color);
  }
}

.wm-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.wm-canvas-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  overflow: hidden;
}

.wm-canvas {
  max-width: 100%;
  max-height: 100%;
  border-radius: 6px;
  box-shadow: var(--shadow-sm);
}
</style>
