<template>
  <tool-shell
    title="二维码生成"
    desc="自定义颜色、尺寸与容错等级"
    icon="qrcode"
    color="#EB2F96"
    back-path="/tools/image"
  >
    <template #toolbar>
      <label class="cfg-inline">
        <span>尺寸</span>
        <input v-model.number="size" type="range" min="128" max="640" step="32" />
        <b class="mono">{{ size }}px</b>
      </label>
      <label class="cfg-inline">
        <span>边距</span>
        <input v-model.number="margin" type="range" min="0" max="8" />
        <b class="mono">{{ margin }}</b>
      </label>
      <label class="cfg-inline">
        <span>容错</span>
        <select v-model="ecl" class="t2i-select">
          <option value="L">L 7%</option>
          <option value="M">M 15%</option>
          <option value="Q">Q 25%</option>
          <option value="H">H 30%</option>
        </select>
      </label>
      <label class="cfg-inline">
        <span>前景</span>
        <input v-model="dark" type="color" class="color-input" />
      </label>
      <label class="cfg-inline">
        <span>背景</span>
        <input v-model="light" type="color" class="color-input" />
      </label>
      <button class="tool-btn is-primary" :disabled="!text.trim() || qrError" @click="download">
        <svg-icon icon-class="download" />
        下载 PNG
      </button>
    </template>

    <div class="split-pane">
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">内容</span>
        </div>
        <div class="pane-body">
          <code-editor
            v-model="text"
            mode="text/plain"
            :fold="false"
            placeholder="输入 URL 或任意文本…"
          />
        </div>
      </div>
      <div class="pane qr-pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">二维码预览</span>
        </div>
        <div class="qr-body">
          <img v-if="dataUrl && !qrError" :src="dataUrl" alt="二维码" class="qr-img" />
          <div v-else-if="qrError" class="qr-hint is-err">{{ qrError }}</div>
          <div v-else class="qr-hint">输入内容后实时生成</div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!qrError }"></span>
      <span v-if="qrError" class="status-err">{{ qrError }}</span>
      <span v-else>{{ text.length }} 字符 · 容错 {{ ecl }}</span>
      <span class="status-right">高容错可支持 Logo 遮挡</span>
    </template>
  </tool-shell>
</template>

<script>
import QRCode from 'qrcode'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'

export default {
  name: 'ImageQrcode',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      text: 'https://omnideck.app',
      size: 320,
      margin: 2,
      ecl: 'M',
      dark: '#1D1D1F',
      light: '#FFFFFF',
      dataUrl: '',
      qrError: ''
    }
  },
  watch: {
    text() { this.render() },
    size() { this.render() },
    margin() { this.render() },
    ecl() { this.render() },
    dark() { this.render() },
    light() { this.render() }
  },
  mounted() {
    this.render()
  },
  methods: {
    async render() {
      this.qrError = ''
      if (!this.text.trim()) {
        this.dataUrl = ''
        return
      }
      try {
        this.dataUrl = await QRCode.toDataURL(this.text, {
          width: this.size,
          margin: this.margin,
          errorCorrectionLevel: this.ecl,
          color: { dark: this.dark, light: this.light }
        })
      } catch (e) {
        this.qrError = '生成失败：' + e.message
        this.dataUrl = ''
      }
    },
    download() {
      if (!this.dataUrl) return
      const a = document.createElement('a')
      a.href = this.dataUrl
      a.download = 'qrcode.png'
      a.click()
    }
  }
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
    min-width: 44px;
    color: var(--primary-color);
    text-align: right;
  }

  input[type='range'] {
    width: 70px;
    accent-color: var(--primary-color);
  }
}

.t2i-select {
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--card-bg);
  font-size: 11.5px;
  color: var(--text-primary);
  outline: none;
}

.color-input {
  width: 26px;
  height: 26px;
  padding: 2px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--card-bg);
  cursor: pointer;
}

.qr-pane {
  flex: 0 0 46%;
}

.qr-body {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.qr-img {
  max-width: 100%;
  max-height: 100%;
  border-radius: 10px;
  box-shadow: var(--shadow-sm);
}

.qr-hint {
  font-size: 12.5px;
  color: var(--text-secondary);

  &.is-err {
    color: var(--danger-color);
  }
}
</style>
