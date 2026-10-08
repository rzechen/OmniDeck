<template>
  <tool-shell
    title="GIF 制作"
    desc="多张图片合成 GIF 动图"
    icon="gif"
    color="#EB2F96"
    back-path="/tools/image"
  >
    <template #toolbar>
      <label class="cfg-inline">
        <span>帧间隔</span>
        <input v-model.number="delay" type="range" min="50" max="2000" step="50" />
        <b class="mono">{{ delay }}ms</b>
      </label>
      <label class="cfg-inline">
        <span>尺寸</span>
        <input v-model.number="gifWidth" type="range" min="120" max="640" step="40" />
        <b class="mono">{{ gifWidth }}px</b>
      </label>
      <button class="tool-btn is-primary" :disabled="items.length < 2 || rendering" @click="renderGif">
        <svg-icon :icon-class="(rendering ? 'loading' : 'video-play')" />
        {{ rendering ? '合成中…' : '生成 GIF' }}
      </button>
      <button class="tool-btn" :disabled="!gifUrl" @click="downloadGif">
        <svg-icon icon-class="download" />
        下载
      </button>
      <button class="tool-btn is-danger" :disabled="!items.length && !gifUrl" @click="resetAll">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="gif-body split-pane">
      <!-- 帧列表面板 -->
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">帧列表（{{ items.length }}）</span>
          <span class="gif-frame-hint">拖动排序</span>
        </div>
        <div class="gif-frames">
          <draggable v-model="items" class="gif-frames-inner" animation="150" item-key="id">
            <template #item="{ element: item, index: i }">
            <div class="gif-frame" title="拖动排序">
              <span class="gif-index">{{ i + 1 }}</span>
              <img :src="item.url" alt="" />
              <button class="fc-remove" @click="removeItem(i)">
                <svg-icon icon-class="close" />
              </button>
            </div>
            </template>
          </draggable>
          <image-drop compact multiple compact-label="添加帧" @change="onFiles" />
        </div>
      </div>
      <!-- 预览面板 -->
      <div class="gif-preview pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">预览</span>
          <span v-if="gifUrl">{{ gifSizeText }}</span>
        </div>
        <div class="gif-preview-body">
          <img v-if="gifUrl" :src="gifUrl" alt="GIF 预览" />
          <div v-else class="gif-empty">
            <svg-icon icon-class="video-camera" />
            <p>添加至少 2 张图片后生成</p>
          </div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>{{ items.length }} 帧 · 间隔 {{ delay }}ms</span>
      <span class="status-right">拖动帧卡片可调整顺序</span>
    </template>
  </tool-shell>
</template>

<script>
import draggable from 'vuedraggable'
import GIF from 'gif.js'
import ToolShell from '@/components/tool/ToolShell.vue'
import ImageDrop from '@/components/tool/ImageDrop.vue'
import { loadImage, formatSize } from '@/utils/ui/image'

let uid = 0

export default {
  name: 'ImageMakeGif',
  components: { ToolShell, ImageDrop, draggable },
  data() {
    return {
      items: [],
      delay: 500,
      gifWidth: 320,
      rendering: false,
      gifUrl: '',
      gifBlob: null,
      errorMsg: ''
    }
  },
  computed: {
    gifSizeText() {
      return this.gifBlob ? formatSize(this.gifBlob.size) : ''
    }
  },
  methods: {
    formatSize,
    onFiles(files) {
      files.forEach(f => {
        this.items.push({ id: ++uid, file: f, url: URL.createObjectURL(f) })
      })
    },
    removeItem(i) {
      URL.revokeObjectURL(this.items[i].url)
      this.items.splice(i, 1)
    },
    async renderGif() {
      this.errorMsg = ''
      this.rendering = true
      if (this.gifUrl) URL.revokeObjectURL(this.gifUrl)
      this.gifUrl = ''
      this.gifBlob = null
      try {
        // 统一缩放到目标宽度，保持比例
        const frames = []
        for (const item of this.items) {
          const { img } = await loadImage(item.file)
          const scale = this.gifWidth / img.naturalWidth
          const canvas = document.createElement('canvas')
          canvas.width = this.gifWidth
          canvas.height = Math.round(img.naturalHeight * scale)
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
          frames.push(canvas)
        }
        const gif = new GIF({
          workers: 2,
          quality: 10,
          workerScript: '/gif.worker.js',
          width: frames[0].width,
          height: frames[0].height
        })
        frames.forEach(f => gif.addFrame(f, { delay: this.delay, copy: true }))
        gif.on('finished', blob => {
          this.gifBlob = blob
          this.gifUrl = URL.createObjectURL(blob)
          this.rendering = false
        })
        gif.render()
      } catch (e) {
        this.errorMsg = e.message
        this.rendering = false
      }
    },
    downloadGif() {
      if (!this.gifBlob) return
      const a = document.createElement('a')
      a.href = this.gifUrl
      a.download = 'animation.gif'
      a.click()
    },
    resetAll() {
      this.items.forEach(i => URL.revokeObjectURL(i.url))
      this.items = []
      if (this.gifUrl) URL.revokeObjectURL(this.gifUrl)
      this.gifUrl = ''
      this.gifBlob = null
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
    min-width: 48px;
    color: var(--primary-color);
    text-align: right;
  }

  input[type='range'] {
    width: 80px;
    accent-color: var(--primary-color);
  }
}

.gif-body {
  flex: 1;
  min-height: 0;
}

.gif-frame-hint {
  font-size: 10.5px;
  color: var(--text-secondary);
  opacity: 0.8;
}

.gif-frames {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  -webkit-app-region: no-drag;

  .image-drop.is-compact {
    width: 110px;
    height: 110px;
    border-radius: 10px;
    flex-shrink: 0;

    i {
      font-size: 20px;
      opacity: 0.7;
    }
  }
}

.gif-frames-inner {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.gif-frame {
  position: relative;
  width: 110px;
  height: 110px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  cursor: grab;
  background: var(--card-bg);

  &:active {
    cursor: grabbing;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    background: var(--search-bg);
    pointer-events: none;
  }
}

.gif-index {
  position: absolute;
  bottom: 4px;
  left: 4px;
  min-width: 16px;
  height: 16px;
  line-height: 16px;
  text-align: center;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.5);
  color: #fff;
  font-size: 10px;
}

.fc-remove {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 18px;
  height: 18px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;

  &:hover {
    background: rgba(var(--danger-color-rgb),  0.85);
  }
}

.gif-preview {
  flex: 0 0 42%;
}

.gif-preview-body {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 14px;
  background: var(--search-bg);

  img {
    max-width: 100%;
    max-height: 100%;
    border-radius: 8px;
    box-shadow: var(--shadow-sm);
  }
}

.gif-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  color: var(--text-secondary);

  i {
    font-size: 28px;
    opacity: 0.4;
  }

  p {
    font-size: 12.5px;
  }
}
</style>
