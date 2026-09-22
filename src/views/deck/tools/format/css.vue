<template>
  <tool-shell
    title="CSS 格式化"
    desc="CSS 代码自动美化与压缩"
    icon="palette"
    color="#3366FF"
    back-path="/tools/format"
  >
    <template #toolbar>
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
          <span class="pane-title">输入 CSS</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="rawInput"
            mode="css"
            placeholder="输入 CSS 样式代码…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">输出结果</span>
        </div>
        <div class="pane-body">
          <code-editor :value="formattedOutput" mode="css" read-only />
        </div>
      </div>
    </div>

    <template #status>
      <template v-if="rawInput.trim()">
        <span class="status-dot"></span>
        <span>已处理 · {{ ruleCount }} 条规则</span>
      </template>
      <template v-else>
        <span>等待输入</span>
      </template>
      <span class="status-right">{{ lineCount }} 行 · {{ rawInput.length }} 字符</span>
    </template>
  </tool-shell>
</template>

<script>
import { css as beautifyCss } from 'js-beautify'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import { downloadText } from '@/utils/download'

const EXAMPLE = `.card{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.06)}.card:hover{transform:translateY(-2px);transition:all .2s ease}`

export default {
  name: 'FormatCss',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      rawInput: EXAMPLE,
      formattedOutput: ''
    }
  },
  computed: {
    lineCount() {
      return this.rawInput ? this.rawInput.split('\n').length : 0
    },
    ruleCount() {
      const m = this.rawInput.match(/\{/g)
      return m ? m.length : 0
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
    formatContent() {
      if (!this.rawInput.trim()) {
        this.formattedOutput = ''
        return
      }
      try {
        this.formattedOutput = beautifyCss(this.rawInput, { indent_size: 2 })
      } catch (e) {
        this.$message.error('格式化失败：' + e.message)
      }
    },
    minifyContent() {
      if (!this.rawInput.trim()) return
      // 去注释 → 合并空白 → 压缩花括号/分号/冒号周围空格
      this.formattedOutput = this.rawInput
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\s+/g, ' ')
        .replace(/\s*\{\s*/g, '{')
        .replace(/\s*\}\s*/g, '}')
        .replace(/\s*;\s*/g, ';')
        .replace(/\s*:\s*/g, ':')
        .replace(/;\}/g, '}')
        .replace(/\s*,\s*/g, ',')
        .trim()
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
      downloadText('export.css', this.formattedOutput, 'text/css;charset=utf-8')
    },
    clearAll() {
      this.rawInput = ''
      this.formattedOutput = ''
      this.$refs.inputEditor.focus()
    }
  }
}
</script>
