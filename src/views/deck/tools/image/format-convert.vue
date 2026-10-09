<template>
  <tool-shell
    title="图片格式转换"
    desc="批量转换 PNG / JPEG / WEBP 格式"
    icon="arrows"
    color="#EB2F96"
    back-path="/tools/image"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          v-for="f in formats"
          :key="f.value"
          class="tool-seg-item"
          :class="{ active: target === f.value }"
          @click="target = f.value"
        >
          {{ f.label }}
        </div>
      </div>
      <button class="tool-btn is-primary" :disabled="!items.length" @click="convertAll">
        <svg-icon icon-class="refresh" />
        转换
      </button>
      <button class="tool-btn" :disabled="!items.filter(i => i.out).length" @click="downloadAll">
        <svg-icon icon-class="download" />
        下载全部
      </button>
      <button class="tool-btn is-danger" :disabled="!items.length" @click="items = []">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="fc-body">
      <image-drop compact multiple @change="onFiles" />
      <div v-for="(item, i) in items" :key="i" class="fc-item">
        <img :src="item.url" alt="" />
        <div class="fc-info">
          <span class="fc-name">{{ item.name }}</span>
          <span class="fc-size">
            {{ formatSize(item.size) }}
            <template v-if="item.out"> → {{ formatSize(item.outSize) }}</template>
          </span>
          <span v-if="item.error" class="fc-err">{{ item.error }}</span>
        </div>
        <button v-if="item.out" class="tool-btn" @click="downloadOne(item)">
          <svg-icon icon-class="download" />
          {{ item.outExt }}
        </button>
        <button class="fc-remove" @click="removeItem(i)">
          <svg-icon icon-class="close" />
        </button>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ items.length }} 张图片 · 目标 {{ target.toUpperCase() }}</span>
      <span class="status-right" v-if="doneCount">{{ doneCount }}/{{ items.length }} 已转换</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'
import ImageDrop from '@/components/tool/ImageDrop.vue'
import { formatSize, loadImage, drawToCanvas, downloadDataUrl, baseName } from '@/utils/ui/image'

defineOptions({ name: 'ImageFormatConvert' })

const target = ref('png')
const formats = [
  { label: 'PNG', value: 'png' },
  { label: 'JPEG', value: 'jpeg' },
  { label: 'WEBP', value: 'webp' }
]
const items = ref([])

const doneCount = computed(() => items.value.filter(i => i.out).length)

function onFiles(files) {
  files.forEach(f => {
    items.value.push({
      file: f,
      name: f.name,
      size: f.size,
      url: URL.createObjectURL(f),
      out: '',
      outSize: 0,
      outExt: '',
      error: ''
    })
  })
}

async function convertAll() {
  for (const item of items.value) {
    if (item.out) continue
    try {
      const { img, url } = await loadImage(item.file)
      const canvas = drawToCanvas(img)
      const mime = 'image/' + target.value
      // JPEG 需要白底（透明通道会变黑）
      if (target.value === 'jpeg') {
        const c2 = document.createElement('canvas')
        c2.width = canvas.width
        c2.height = canvas.height
        const ctx = c2.getContext('2d')
        ctx.fillStyle = '#fff'
        ctx.fillRect(0, 0, c2.width, c2.height)
        ctx.drawImage(canvas, 0, 0)
        canvas.width = c2.width
        canvas.getContext('2d').drawImage(c2, 0, 0)
      }
      item.out = canvas.toDataURL(mime, 0.92)
      item.outSize = Math.round(item.out.length * 0.75)
      item.outExt = '.' + target.value
      URL.revokeObjectURL(url)
    } catch (e) {
      item.error = e.message
    }
  }
}

function downloadOne(item) {
  downloadDataUrl(baseName(item.name) + '.' + target.value, item.out)
}

function downloadAll() {
  items.value.filter(i => i.out).forEach((item, i) => {
    setTimeout(() => downloadOne(item), i * 250)
  })
}

function removeItem(i) {
  URL.revokeObjectURL(items.value[i].url)
  items.value.splice(i, 1)
}
</script>

<style lang="scss" scoped>
.fc-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-content: flex-start;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.fc-item {
  position: relative;
  width: 200px;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.16s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.35);

    .fc-remove {
      opacity: 1;
    }
  }

  img {
    width: 100%;
    height: 130px;
    object-fit: cover;
    background: var(--search-bg);
  }
}

.fc-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  font-size: 12px;
  color: var(--text-primary);
  flex: 1;
}

.fc-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

.fc-size {
  font-size: 11px;
  color: var(--text-secondary);
}

.fc-err {
  font-size: 11px;
  color: var(--danger-color);
}

.fc-item .tool-btn {
  margin: 0 10px 10px;
  justify-content: center;
}

.fc-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: opacity 0.15s ease;

  &:hover {
    background: rgba(var(--danger-color-rgb),  0.85);
  }
}
</style>
