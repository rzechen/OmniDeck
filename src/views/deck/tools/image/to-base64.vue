<template>
  <tool-shell
    title="图片转 Base64"
    desc="图片转 Data URL 编码，一键复制"
    icon="image"
    color="#EB2F96"
    back-path="/tools/image"
  >
    <template #toolbar>
      <button class="tool-btn is-primary" :disabled="!result" @click="copyResult">
        <svg-icon icon-class="document-copy" />
        复制结果
      </button>
      <button class="tool-btn is-danger" @click="reset">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="split-pane">
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">上传图片</span>
        </div>
        <div class="pane-body b64-left">
          <image-drop v-if="!file" @change="onFile" />
          <div v-else class="b64-preview">
            <img :src="objectUrl" alt="预览" />
            <div class="b64-meta">
              <span>{{ file.name }}</span>
              <span>{{ formatSize(file.size) }} · {{ imgInfo }}</span>
              <div class="b64-actions">
                <button class="tool-btn" @click="reset">重新选择</button>
                <button class="tool-btn" @click="downloadDataUrl(baseName(file.name) + '.txt', result)">
                  <svg-icon icon-class="download" />
                  下载 .txt
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">Base64 输出</span>
          <span v-if="result">{{ result.length }} 字符</span>
        </div>
        <div class="pane-body">
          <textarea v-model="result" class="b64-textarea mono" readonly placeholder="上传图片后自动生成 Data URL…"></textarea>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ result ? 'Base64 编码相比原文件约增大 33%' : '等待上传' }}</span>
      <span class="status-right">{{ result ? formatSize(result.length) : '' }}</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import ImageDrop from '@/components/tool/ImageDrop.vue'
import { formatSize, downloadDataUrl, baseName } from '@/utils/image'

export default {
  name: 'ImageToBase64',
  components: { ToolShell, ImageDrop },
  data() {
    return { file: null, objectUrl: '', result: '', imgInfo: '' }
  },
  methods: {
    formatSize,
    downloadDataUrl,
    baseName,
    onFile(file) {
      this.file = file
      this.objectUrl = URL.createObjectURL(file)
      const img = new Image()
      img.onload = () => {
        this.imgInfo = `${img.naturalWidth} × ${img.naturalHeight}`
      }
      img.src = this.objectUrl
      const reader = new FileReader()
      reader.onload = () => {
        this.result = reader.result
      }
      reader.readAsDataURL(file)
    },
    copyResult() {
      if (!this.result) return
      navigator.clipboard.writeText(this.result).then(() => {
        this.$message.success('Base64 已复制')
      })
    },
    reset() {
      if (this.objectUrl) URL.revokeObjectURL(this.objectUrl)
      this.file = null
      this.objectUrl = ''
      this.result = ''
      this.imgInfo = ''
    }
  }
}
</script>

<style lang="scss" scoped>
.b64-left {
  display: flex;
  padding: 12px;
}

.b64-preview {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-width: 0;

  img {
    flex: 1;
    min-height: 0;
    object-fit: contain;
    border-radius: 8px;
    background: var(--search-bg);
  }
}

.b64-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 12px;
  color: var(--text-primary);

  span:last-child {
    font-size: 11px;
    color: var(--text-secondary);
  }
}

.b64-actions {
  display: flex;
  gap: 8px;
  margin-top: 6px;
}

.b64-textarea {
  width: 100%;
  height: 100%;
  padding: 12px 14px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 11px;
  line-height: 1.6;
  color: var(--text-primary);
  word-break: break-all;
}
</style>
