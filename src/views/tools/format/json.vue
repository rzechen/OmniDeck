<template>
  <tool-shell
    title="JSON 格式化"
    desc="校验、美化与压缩 JSON，支持转义处理与代码折叠"
    icon="json"
    color="#3366FF"
    back-path="/tools/format"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: !compressed }"
          @click="setCompressed(false)"
        >
          <i class="el-icon-s-operation"></i>
          格式化
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: compressed }"
          @click="setCompressed(true)"
        >
          <i class="el-icon-c-scale-to-original"></i>
          压缩
        </div>
      </div>
      <button class="tool-btn" @click="escapeJson">
        <i class="el-icon-connection"></i>
        转义
      </button>
      <button class="tool-btn" @click="unescapeJson">
        <i class="el-icon-scissors"></i>
        去转义
      </button>
      <button class="tool-btn" @click="toggleFold">
        <svg-icon icon-class="expand-fold" class="fold-icon" :class="{ 'is-folded': folded }" />
        {{ folded ? '展开全部' : '折叠全部' }}
      </button>
      <button class="tool-btn is-primary" @click="copyOutput">
        <i class="el-icon-document-copy"></i>
        复制
      </button>
      <button class="tool-btn" @click="downloadOutput">
        <i class="el-icon-download"></i>
        下载
      </button>
      <button class="tool-btn is-danger" @click="clearAll">
        <i class="el-icon-delete"></i>
        清空
      </button>
    </template>

    <div class="split-pane">
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">输入 JSON</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="jsonInput"
            mode="application/json"
            placeholder="粘贴或输入 JSON，支持单引号自动修正…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">输出结果</span>
          <span>{{ compressed ? '压缩' : '美化' }}后内容</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="outputEditor"
            :value="formattedJson"
            mode="application/json"
            read-only
          />
        </div>
      </div>
    </div>

    <template #status>
      <template v-if="jsonInput.trim()">
        <span class="status-dot" :class="{ 'is-bad': !valid }"></span>
        <span v-if="valid">JSON 有效</span>
        <span v-else class="status-err" :title="errMsg">
          {{ errBrief }}
        </span>
      </template>
      <template v-else>
        <span>等待输入</span>
      </template>
      <span class="status-right">
        {{ lineCount }} 行 · {{ jsonInput.length }} 字符
      </span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import { downloadText } from '@/utils/download'

const EXAMPLE = `{
  "name": "OmniDeck",
  "version": "1.0.0",
  "features": ["格式化", "转换", "加密"],
  "config": { "theme": "light", "autoUpdate": true }
}`

// 单引号 → 双引号修正（宽松解析）
function normalizeJsonLike(str) {
  const s = str.trim()
  try {
    JSON.parse(s)
    return s
  } catch (e) {
    // fallthrough
  }
  return s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, v) => `"${v.replace(/"/g, '\\"')}"`)
}

// 从 JSON.parse 报错中提取行列位置（"position N"）
function locateError(input, err) {
  const m = /position (\d+)/.exec(err.message)
  if (!m) return null
  const pos = Math.min(+m[1], input.length)
  const before = input.slice(0, pos)
  const line = before.split('\n').length
  const col = pos - before.lastIndexOf('\n')
  return { line, col }
}

export default {
  name: 'FormatJson',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      jsonInput: EXAMPLE,
      formattedJson: '',
      compressed: false,
      folded: false,
      valid: true,
      errMsg: '',
      errPos: null
    }
  },
  computed: {
    lineCount() {
      return this.jsonInput ? this.jsonInput.split('\n').length : 0
    },
    errBrief() {
      if (!this.errMsg) return 'JSON 无效'
      let brief = this.errMsg.replace(/^JSON\.parse:\s*/, '')
      if (this.errPos) {
        brief += `（第 ${this.errPos.line} 行，第 ${this.errPos.col} 列附近）`
      }
      return brief
    }
  },
  watch: {
    // 输入防抖自动格式化
    jsonInput() {
      clearTimeout(this._timer)
      this._timer = setTimeout(() => this.updateFormatted(), 250)
    }
  },
  mounted() {
    this.updateFormatted()
  },
  beforeDestroy() {
    clearTimeout(this._timer)
  },
  methods: {
    parseInput() {
      try {
        const obj = JSON.parse(normalizeJsonLike(this.jsonInput))
        this.valid = true
        this.errMsg = ''
        this.errPos = null
        return obj
      } catch (e) {
        this.valid = false
        this.errMsg = e.message
        this.errPos = locateError(this.jsonInput, e)
        return undefined
      }
    },
    updateFormatted() {
      if (!this.jsonInput.trim()) {
        this.formattedJson = ''
        this.valid = true
        this.errMsg = ''
        this.errPos = null
        return
      }
      const obj = this.parseInput()
      if (obj === undefined) {
        // 无效时原样透出到右侧，方便对照
        this.formattedJson = this.jsonInput
        return
      }
      this.formattedJson = this.compressed
        ? JSON.stringify(obj)
        : JSON.stringify(obj, null, 2)
    },
    setCompressed(c) {
      if (this.compressed === c) return
      this.compressed = c
      if (this.valid) this.updateFormatted()
    },
    toggleFold() {
      if (!this.formattedJson.trim()) return
      this.folded = !this.folded
      this.folded
        ? this.$refs.outputEditor.foldAll()
        : this.$refs.outputEditor.unfoldAll()
    },
    // 转义：JSON → 带引号的转义字符串字面量
    escapeJson() {
      const obj = this.parseInput()
      if (obj === undefined) {
        this.$message.error('JSON 不合法，无法转义')
        return
      }
      this.jsonInput = JSON.stringify(JSON.stringify(obj))
    },
    // 去转义：转义字符串 → 格式化 JSON
    unescapeJson() {
      try {
        const parsed = JSON.parse(this.jsonInput.trim())
        if (typeof parsed !== 'string') {
          this.$message.warning('当前内容已是合法 JSON，无需去除转义')
          return
        }
        const finalParsed = JSON.parse(parsed)
        if (typeof finalParsed !== 'object' || finalParsed === null) {
          this.$message.warning('去除转义后不是 JSON 对象')
          return
        }
        this.jsonInput = JSON.stringify(finalParsed, null, 2)
      } catch (e) {
        this.$message.error('内容不是合法的转义 JSON 字符串')
      }
    },
    copyOutput() {
      if (!this.formattedJson.trim()) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(this.formattedJson).then(() => {
        this.$message.success('复制成功')
      })
    },
    downloadOutput() {
      if (!this.formattedJson.trim()) {
        this.$message.warning('没有可下载的内容')
        return
      }
      downloadText('formatted.json', this.formattedJson, 'application/json')
    },
    clearAll() {
      this.jsonInput = ''
      this.formattedJson = ''
      this.folded = false
      this.$refs.inputEditor.focus()
    }
  }
}
</script>

<style lang="scss" scoped>
/* 折叠按钮箭头：展开态向下 ▾，折叠态向右 ▸，旋转过渡 */
.fold-icon {
  width: 12px;
  height: 12px;
  transform: rotate(90deg);
  transition: transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);

  &.is-folded {
    transform: rotate(0deg);
  }
}
</style>
