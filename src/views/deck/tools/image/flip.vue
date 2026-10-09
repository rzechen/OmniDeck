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

<script setup>
import { ref, watch, nextTick } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'
import ImageDrop from '@/components/tool/ImageDrop.vue'
import { loadImage, formatSize } from '@/utils/ui/image'

defineOptions({ name: 'ImageFlip' })

const file = ref(null)
const angle = ref(0)
const flipH = ref(false)
const flipV = ref(false)
const info = ref('')
const canvas = ref(null)

// 加载后的图片对象（非响应式）
let img = null

watch(angle, () => render())
watch(flipH, () => render())
watch(flipV, () => render())

async function onFile(f) {
  file.value = f
  const { img: loaded } = await loadImage(f)
  img = loaded
  info.value = `${img.naturalWidth} × ${img.naturalHeight} · ${formatSize(f.size)}`
  nextTick(() => render())
}

function rotate(delta) {
  angle.value = (angle.value + delta + 360) % 360
}

function render() {
  if (!img) return
  const c = canvas.value
  if (!c) return
  const rad = (angle.value * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  // 旋转后外接矩形尺寸
  const w = img.naturalWidth * cos + img.naturalHeight * sin
  const h = img.naturalWidth * sin + img.naturalHeight * cos
  // 限制预览尺寸
  const scale = Math.min(1, 900 / Math.max(w, h))
  c.width = w * scale
  c.height = h * scale
  const ctx = c.getContext('2d')
  ctx.clearRect(0, 0, c.width, c.height)
  ctx.save()
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate(rad)
  ctx.scale(flipH.value ? -1 : 1, flipV.value ? -1 : 1)
  ctx.drawImage(img, -img.naturalWidth * scale / 2, -img.naturalHeight * scale / 2, img.naturalWidth * scale, img.naturalHeight * scale)
  ctx.restore()
}

function exportImage() {
  if (!canvas.value) return
  const a = document.createElement('a')
  a.href = canvas.value.toDataURL('image/png')
  a.download = 'rotated.png'
  a.click()
}

function reset() {
  file.value = null
  img = null
  angle.value = 0
  flipH.value = false
  flipV.value = false
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
