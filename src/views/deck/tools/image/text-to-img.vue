<template>
  <tool-shell
    title="文字转图片"
    desc="文字渲染为图片，自定义画布与字体"
    icon="text-image"
    color="#EB2F96"
    back-path="/tools/image"
  >
    <template #toolbar>
      <label class="cfg-inline">
        <span>字号</span>
        <input v-model.number="fontSize" type="range" min="14" max="120" />
        <b class="mono">{{ fontSize }}px</b>
      </label>
      <label class="cfg-inline">
        <span>宽度</span>
        <input v-model.number="canvasWidth" type="range" min="300" max="1200" step="50" />
        <b class="mono">{{ canvasWidth }}px</b>
      </label>
      <label class="cfg-inline">
        <span>行距</span>
        <input v-model.number="lineHeight" type="range" min="12" max="30" />
        <b class="mono">{{ lineHeight / 10 }}</b>
      </label>
      <div class="tool-seg">
        <div
          v-for="b in bgOptions"
          :key="b.value"
          class="tool-seg-item"
          :class="{ active: bgMode === b.value }"
          @click="bgMode = b.value"
        >
          {{ b.label }}
        </div>
      </div>
      <button class="tool-btn is-primary" :disabled="!text.trim()" @click="exportImage">
        <svg-icon icon-class="download" />
        导出 PNG
      </button>
    </template>

    <div class="t2i-body split-pane">
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">文字内容</span>
        </div>
        <div class="pane-body">
          <textarea
            v-model="text"
            class="t2i-textarea"
            placeholder="输入要渲染为图片的文字，自动换行…"
            @input="render"
          ></textarea>
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">预览</span>
        </div>
        <div class="pane-body t2i-preview">
          <canvas ref="canvas" class="t2i-canvas"></canvas>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ text.length }} 字符</span>
      <span class="status-right">DPR 高清渲染</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'

defineOptions({ name: 'ImageTextToImg' })

const text = ref('OmniDeck\n让工具触手可及')
const fontSize = ref(32)
const canvasWidth = ref(600)
const lineHeight = ref(16)
const bgMode = ref('light')
const bgOptions = [
  { label: '白底黑字', value: 'light' },
  { label: '黑底白字', value: 'dark' },
  { label: '透明底', value: 'transparent' }
]
const canvas = ref(null)

watch(fontSize, () => render())
watch(canvasWidth, () => render())
watch(lineHeight, () => render())
watch(bgMode, () => render())

onMounted(() => {
  render()
})

function render() {
  const c = canvas.value
  if (!c) return
  const dpr = window.devicePixelRatio || 1
  const W = canvasWidth.value
  const pad = 40
  const font = `600 ${fontSize.value}px -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif`
  // 先测量换行
  const measure = c.getContext('2d')
  measure.font = font
  const lines = []
  text.value.split('\n').forEach(par => {
    if (!par) {
      lines.push('')
      return
    }
    let cur = ''
    for (const ch of par) {
      if (measure.measureText(cur + ch).width > W - pad * 2) {
        lines.push(cur)
        cur = ch
      } else {
        cur += ch
      }
    }
    lines.push(cur)
  })
  const lineH = fontSize.value * (lineHeight.value / 10)
  const H = Math.max(lines.length * lineH + pad * 2, 100)
  c.width = W * dpr
  c.height = H * dpr
  c.style.width = W + 'px'
  c.style.height = H + 'px'
  const ctx = c.getContext('2d')
  ctx.scale(dpr, dpr)
  if (bgMode.value !== 'transparent') {
    ctx.fillStyle = bgMode.value === 'light' ? '#FFFFFF' : '#1D1D1F'
    ctx.fillRect(0, 0, W, H)
  }
  ctx.fillStyle = bgMode.value === 'light' ? '#1D1D1F' : '#F5F5F7'
  ctx.font = font
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => {
    ctx.fillText(line, pad, pad + i * lineH)
  })
}

function exportImage() {
  if (!canvas.value) return
  const a = document.createElement('a')
  a.href = canvas.value.toDataURL('image/png')
  a.download = 'text-image.png'
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
    min-width: 52px;
    color: var(--primary-color);
    text-align: right;
  }

  input[type='range'] {
    width: 70px;
    accent-color: var(--primary-color);
  }
}

.t2i-textarea {
  // 横向占满面板并留出边距，配合圆角呈现独立输入区
  width: calc(100% - 20px);
  height: calc(100% - 20px);
  margin: 10px;
  padding: 14px;
  border: none;
  outline: none;
  resize: none;
  border-radius: 10px;
  background: var(--search-bg);
  font-size: 13px;
  line-height: 1.8;
  color: var(--text-primary);
  transition: box-shadow 0.16s ease;

  &:focus {
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.12);
  }

  &::placeholder {
    color: var(--text-secondary);
  }
}

.t2i-preview {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  overflow: auto;
  padding: 16px;
  background: var(--search-bg);
}

.t2i-canvas {
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
  max-width: 100%;
}
</style>
