<template>
  <tool-shell
    title="图片压缩"
    desc="质量压缩与尺寸缩放，实时预览压缩率"
    icon="compress"
    color="#EB2F96"
    back-path="/tools/image"
  >
    <template #toolbar>
      <label class="cfg-inline">
        <span>质量</span>
        <input v-model.number="quality" type="range" min="10" max="95" />
        <b class="mono">{{ quality }}%</b>
      </label>
      <label class="cfg-inline">
        <span>缩放</span>
        <input v-model.number="scale" type="range" min="10" max="100" step="5" />
        <b class="mono">{{ scale }}%</b>
      </label>
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
      <button class="tool-btn is-primary" :disabled="!items.length" @click="compressAll">
        <svg-icon icon-class="refresh" />
        压缩
      </button>
      <button class="tool-btn" :disabled="!doneItems.length" @click="downloadAll">
        <svg-icon icon-class="download" />
        下载全部
      </button>
      <button class="tool-btn is-danger" :disabled="!items.length" @click="items = []">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="split-pane">
      <!-- 左：图片列表 -->
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">图片列表（{{ items.length }}）</span>
        </div>
        <div class="cp-list-body">
          <image-drop compact multiple compact-label="添加图片" @change="onFiles" />
          <div v-for="(item, i) in items" :key="i" class="cp-item">
            <div class="cp-thumb">
              <img :src="item.url" alt="" />
              <span v-if="item.out" class="cp-done"><svg-icon icon-class="check" /></span>
            </div>
            <div class="cp-info">
              <span class="cp-name">{{ item.name }}</span>
              <span class="cp-size">{{ formatSize(item.size) }}</span>
            </div>
            <button class="cp-remove" title="移除" @click="removeItem(i)">
              <svg-icon icon-class="close" />
            </button>
          </div>
        </div>
      </div>
      <!-- 右：压缩结果 -->
      <div class="pane cp-right">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">压缩结果（{{ doneItems.length }}）</span>
        </div>
        <div class="cp-result-body">
          <div v-for="item in doneItems" :key="item.name" class="cp-result">
            <img class="cp-result-thumb" :src="item.out" alt="" />
            <div class="cp-result-info">
              <span class="cp-name">{{ item.name }}</span>
              <span class="cp-size">
                {{ formatSize(item.size) }} → <b>{{ formatSize(item.outSize) }}</b>
              </span>
            </div>
            <span class="cp-ratio" :class="{ good: item.saved > 0 }">
              {{ item.saved > 0 ? '-' : '+' }}{{ Math.abs(item.saved).toFixed(0) }}%
            </span>
            <button class="cp-dl" title="下载" @click="downloadOne(item)">
              <svg-icon icon-class="download" />
            </button>
          </div>
          <div v-if="!doneItems.length" class="cp-empty">
            <svg-icon icon-class="picture-outline" />
            <p>{{ items.length ? '点击顶部「压缩」按钮开始处理' : '先从左侧添加图片' }}</p>
          </div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ items.length }} 张 · {{ doneItems.length }} 已压缩</span>
      <span v-if="doneItems.length" class="status-right" :class="{ 'is-bad': totalSaved < 0 }">
        {{ totalSaved >= 0 ? '共节省 ' + formatSize(totalSaved) : '总体积增大 ' + formatSize(-totalSaved) }}
      </span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import ImageDrop from '@/components/tool/ImageDrop.vue'
import { formatSize, loadImage, drawToCanvas, dataUrlToBlob, downloadDataUrl, baseName } from '@/utils/ui/image'

export default {
  name: 'ImageCompress',
  components: { ToolShell, ImageDrop },
  data() {
    return {
      quality: 70,
      scale: 100,
      target: 'jpeg',
      formats: [
        { label: 'JPEG', value: 'jpeg' },
        { label: 'WEBP', value: 'webp' },
        { label: 'PNG', value: 'png' }
      ],
      items: []
    }
  },
  computed: {
    doneItems() {
      return this.items.filter(i => i.out)
    },
    totalSaved() {
      return this.doneItems.reduce((s, i) => s + (i.size - i.outSize), 0)
    }
  },
  methods: {
    formatSize,
    onFiles(files) {
      files.forEach(f => {
        this.items.push({
          file: f,
          name: f.name,
          size: f.size,
          url: URL.createObjectURL(f),
          out: '',
          outSize: 0,
          saved: 0
        })
      })
    },
    async compressAll() {
      for (const item of this.items) {
        try {
          const { img } = await loadImage(item.file)
          const w = Math.round(img.naturalWidth * this.scale / 100)
          const h = Math.round(img.naturalHeight * this.scale / 100)
          const canvas = drawToCanvas(img, w, h)
          if (this.target === 'jpeg') {
            // 透明填白
            const ctx = canvas.getContext('2d')
            ctx.globalCompositeOperation = 'destination-over'
            ctx.fillStyle = '#fff'
            ctx.fillRect(0, 0, w, h)
          }
          const mime = this.target === 'png' ? 'image/png' : 'image/' + this.target
          const dataUrl = canvas.toDataURL(mime, this.quality / 100)
          item.out = dataUrl
          item.outSize = dataUrlToBlob(dataUrl).size
          item.saved = ((item.size - item.outSize) / item.size) * 100
        } catch (e) {
          this.$message.error(`${item.name}：${e.message}`)
        }
      }
    },
    downloadOne(item) {
      downloadDataUrl(baseName(item.name) + '_min.' + this.target, item.out)
    },
    downloadAll() {
      this.doneItems.forEach((item, i) => {
        setTimeout(() => this.downloadOne(item), i * 250)
      })
    },
    removeItem(i) {
      URL.revokeObjectURL(this.items[i].url)
      this.items.splice(i, 1)
    }
  }
}
</script>

<style lang="scss" scoped>
.cfg-inline {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);

  b {
    width: 36px;
    color: var(--primary-color);
    text-align: right;
  }

  input[type='range'] {
    width: 80px;
    accent-color: var(--primary-color);
  }
}

.cp-list-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-content: flex-start;
  overflow-y: auto;
  padding: 12px;
  -webkit-app-region: no-drag;

  // 上传区与图片卡片同尺寸，形成整齐的网格
  .image-drop.is-compact {
    width: 148px;
    height: 148px;
    flex-direction: column;
    gap: 8px;
    border-radius: 12px;
    background: var(--card-bg);

    i {
      font-size: 24px;
      opacity: 0.7;
    }
  }
}

.status-right.is-bad {
  color: var(--danger-color);
}

.cp-item {
  position: relative;
  width: 148px;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  transition: all 0.16s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.35);

    .cp-remove {
      opacity: 1;
    }
  }
}

.cp-thumb {
  position: relative;
  height: 104px;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--search-bg);
  }
}

// 已压缩勾选徽标
.cp-done {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 18px;
  height: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 11px;
  background: rgba(var(--success-color-rgb),  0.9);
  color: #fff;
}

.cp-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 10px;
  flex: 1;
  min-width: 0;
}

.cp-name {
  font-size: 12px;
  font-weight: 500;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cp-size {
  font-size: 11px;
  color: var(--text-secondary);

  b {
    color: var(--primary-color);
  }
}

.cp-remove {
  position: absolute;
  top: 6px;
  left: 6px;
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

/* ============ 右侧：压缩结果 ============ */
.cp-right {
  flex: 0 0 40%;
}

.cp-result-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  -webkit-app-region: no-drag;
}

.cp-result {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.35);
  }
}

.cp-result-thumb {
  width: 44px;
  height: 44px;
  border-radius: 8px;
  object-fit: cover;
  background: var(--search-bg);
  flex-shrink: 0;
}

.cp-result-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cp-ratio {
  padding: 1px 7px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 700;
  background: rgba(var(--danger-color-rgb),  0.85);
  color: #fff;
  flex-shrink: 0;

  &.good {
    background: rgba(var(--success-color-rgb),  0.9);
  }
}

.cp-dl {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 8px;
  background: var(--search-bg);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  flex-shrink: 0;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.12);
    color: var(--primary-color);
  }
}

.cp-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  border: 1.5px dashed var(--border-color);
  border-radius: 12px;

  i {
    font-size: 28px;
    opacity: 0.4;
  }

  p {
    font-size: 12.5px;
  }
}
</style>
