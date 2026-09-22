<template>
  <tool-shell
    title="YAML 格式化"
    desc="YAML 与 XML 的美化、压缩与语法校验"
    icon="doc"
    color="#3366FF"
    back-path="/tools/format"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: formatType === 'yaml' }"
          @click="setType('yaml')"
        >
          YAML
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: formatType === 'xml' }"
          @click="setType('xml')"
        >
          XML
        </div>
      </div>
      <button class="tool-btn" @click="formatContent">
        <i class="el-icon-magic-stick"></i>
        格式化
      </button>
      <button class="tool-btn" @click="minifyContent">
        <i class="el-icon-c-scale-to-original"></i>
        压缩
      </button>
      <button class="tool-btn is-primary" @click="copyOutput">
        <i class="el-icon-document-copy"></i>
        复制
      </button>
      <button class="tool-btn" @click="exportOutput">
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
          <span class="pane-title">输入 {{ formatType.toUpperCase() }}</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="rawInput"
            :mode="formatType === 'yaml' ? 'yaml' : 'xml'"
            :placeholder="formatType === 'yaml' ? '输入 YAML 内容…' : '输入 XML 内容…'"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">输出结果</span>
        </div>
        <div class="pane-body">
          <code-editor
            :value="formattedOutput"
            :mode="formatType === 'yaml' ? 'yaml' : 'xml'"
            read-only
          />
        </div>
      </div>
    </div>

    <template #status>
      <template v-if="rawInput.trim()">
        <span class="status-dot" :class="{ 'is-bad': !valid }"></span>
        <span v-if="valid">{{ formatType.toUpperCase() }} 语法有效</span>
        <span v-else class="status-err" :title="errMsg">{{ errBrief }}</span>
      </template>
      <template v-else>
        <span>等待输入</span>
      </template>
      <span class="status-right">{{ lineCount }} 行 · {{ rawInput.length }} 字符</span>
    </template>
  </tool-shell>
</template>

<script>
import yaml from 'js-yaml'
import { html as beautifyHtml } from 'js-beautify'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import { downloadText } from '@/utils/download'

const YAML_EXAMPLE = `server:
  port: 8080
  host: 0.0.0.0
database:
  url: mysql://localhost:3306/omnideck
  pool: { min: 2, max: 10 }`

const XML_EXAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<config><server port="8080" host="0.0.0.0"/><database url="mysql://localhost:3306/omnideck"><pool min="2" max="10"/></database></config>`

// XML 校验：DOMParser 解析无 parsererror 即有效
function validateXml(str) {
  const doc = new DOMParser().parseFromString(str, 'application/xml')
  return !doc.querySelector('parsererror')
}

export default {
  name: 'FormatYaml',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      formatType: 'yaml',
      rawInput: YAML_EXAMPLE,
      formattedOutput: '',
      valid: true,
      errMsg: ''
    }
  },
  computed: {
    lineCount() {
      return this.rawInput ? this.rawInput.split('\n').length : 0
    },
    errBrief() {
      return this.errMsg.length > 80 ? this.errMsg.slice(0, 80) + '…' : this.errMsg
    }
  },
  watch: {
    rawInput() {
      clearTimeout(this._timer)
      this._timer = setTimeout(() => this.formatContent(), 250)
    }
  },
  mounted() {
    this.formatContent()
  },
  beforeDestroy() {
    clearTimeout(this._timer)
  },
  methods: {
    setType(t) {
      if (this.formatType === t) return
      this.formatType = t
      // 切换格式：内容为空或仍为内置示例时替换为对应示例
      if (!this.rawInput.trim()) {
        this.rawInput = t === 'yaml' ? YAML_EXAMPLE : XML_EXAMPLE
      }
      this.formatContent()
    },
    formatContent() {
      if (!this.rawInput.trim()) {
        this.formattedOutput = ''
        this.valid = true
        this.errMsg = ''
        return
      }
      try {
        if (this.formatType === 'yaml') {
          const parsed = yaml.load(this.rawInput)
          this.formattedOutput = yaml.dump(parsed, { indent: 2, lineWidth: 120 })
          this.valid = true
          this.errMsg = ''
        } else {
          if (!validateXml(this.rawInput)) {
            throw new Error('XML 语法错误，标签未闭合或格式不正确')
          }
          this.formattedOutput = beautifyHtml(this.rawInput, {
            indent_size: 2,
            preserve_newlines: false,
            wrap_line_length: 0,
            end_with_newline: false
          })
          this.valid = true
          this.errMsg = ''
        }
      } catch (e) {
        this.valid = false
        this.errMsg = e.message
        this.formattedOutput = this.rawInput
      }
    },
    minifyContent() {
      if (!this.rawInput.trim()) return
      try {
        if (this.formatType === 'yaml') {
          const parsed = yaml.load(this.rawInput)
          this.formattedOutput = yaml.dump(parsed, { indent: 0, flowLevel: 0, lineWidth: -1 })
          this.valid = true
        } else {
          if (!validateXml(this.rawInput)) {
            throw new Error('XML 语法错误')
          }
          this.formattedOutput = this.rawInput
            .replace(/>\s+</g, '><')
            .replace(/\s{2,}/g, ' ')
            .trim()
          this.valid = true
        }
        this.errMsg = ''
      } catch (e) {
        this.valid = false
        this.errMsg = e.message
        this.$message.error('压缩失败：' + e.message)
      }
    },
    copyOutput() {
      if (!this.formattedOutput.trim()) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(this.formattedOutput).then(() => {
        this.$message.success('复制成功')
      })
    },
    exportOutput() {
      if (!this.formattedOutput.trim()) {
        this.$message.warning('没有可下载的内容')
        return
      }
      downloadText(`export.${this.formatType}`, this.formattedOutput)
    },
    clearAll() {
      this.rawInput = ''
      this.formattedOutput = ''
      this.$refs.inputEditor.focus()
    }
  }
}
</script>
