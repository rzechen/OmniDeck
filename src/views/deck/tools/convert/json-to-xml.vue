<template>
  <tool-shell
    title="JSON ⇄ XML"
    desc="JSON 与 XML 双向互转"
    icon="xml"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: direction === 'j2x' }"
          @click="direction = 'j2x'"
        >
          JSON → XML
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: direction === 'x2j' }"
          @click="direction = 'x2j'"
        >
          XML → JSON
        </div>
      </div>
      <input v-model="rootName" class="root-name-input" placeholder="根节点名" spellcheck="false" />
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
          <span class="pane-title">{{ direction === 'j2x' ? '输入 JSON' : '输入 XML' }}</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="rawInput"
            :mode="direction === 'j2x' ? 'application/json' : 'xml'"
            :placeholder="direction === 'j2x' ? '输入 JSON…' : '输入 XML…'"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">{{ direction === 'j2x' ? 'XML 输出' : 'JSON 输出' }}</span>
        </div>
        <div class="pane-body">
          <code-editor :value="output" :mode="direction === 'j2x' ? 'xml' : 'application/json'" read-only />
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>语法有效</span>
      <span class="status-right">{{ rawInput.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import { html as beautifyHtml } from 'js-beautify'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import { downloadText } from '@/utils/download'

const JSON_EXAMPLE = `{
  "name": "OmniDeck",
  "version": "1.0.0",
  "openSource": true,
  "features": ["格式化", "转换", "加密"],
  "author": { "name": "ranze", "city": "Shanghai" }
}`

const XML_EXAMPLE = `<root>
  <name>OmniDeck</name>
  <version>1.0.0</version>
  <openSource>true</openSource>
  <features>格式化</features>
  <features>转换</features>
  <features>加密</features>
  <author>
    <name>ranze</name>
    <city>Shanghai</city>
  </author>
</root>`

// XML 标签名合法字符校验
function validTag(name) {
  return /^[A-Za-z_][\w.-]*$/.test(name)
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export default {
  name: 'ConvertJsonXml',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      direction: 'j2x',
      rawInput: JSON_EXAMPLE,
      rootName: 'root',
      output: '',
      errorMsg: ''
    }
  },
  watch: {
    rawInput() {
      clearTimeout(this._timer)
      this._timer = setTimeout(() => this.convert(), 250)
    },
    direction() {
      if (this.output && !this.errorMsg) {
        this.rawInput = this.output
      } else {
        this.rawInput = this.direction === 'j2x' ? JSON_EXAMPLE : XML_EXAMPLE
      }
      this.convert()
    },
    rootName() {
      if (this.direction === 'j2x') this.convert()
    }
  },
  mounted() {
    this.convert()
  },
  beforeDestroy() {
    clearTimeout(this._timer)
  },
  methods: {
    convert() {
      this.errorMsg = ''
      this.output = ''
      if (!this.rawInput.trim()) return
      try {
        if (this.direction === 'j2x') {
          const obj = JSON.parse(this.rawInput)
          if (typeof obj !== 'object' || obj === null) {
            throw new Error('请输入 JSON 对象或数组')
          }
          const root = (this.rootName.trim() || 'root')
          if (!validTag(root)) throw new Error(`根节点名「${root}」不是合法的 XML 标签名`)
          this.output = beautifyHtml(this.jsonToXml(obj, root), {
            indent_size: 2,
            preserve_newlines: false,
            wrap_line_length: 0
          })
        } else {
          const doc = new DOMParser().parseFromString(this.rawInput, 'application/xml')
          if (doc.querySelector('parsererror')) {
            throw new Error('XML 语法错误：' + doc.querySelector('parsererror').textContent.slice(0, 80))
          }
          this.output = JSON.stringify(this.xmlToJson(doc.documentElement), null, 2)
        }
      } catch (e) {
        this.errorMsg = e.message
      }
    },
    // JSON → XML：数组同标签重复、嵌套对象递归
    jsonToXml(value, tag, indent) {
      if (Array.isArray(value)) {
        return value.map(v => this.jsonToXml(v, tag, indent)).join('\n')
      }
      const pad = ' '.repeat(indent)
      if (typeof value === 'object' && value !== null) {
        const inner = Object.entries(value)
          .map(([k, v]) => {
            if (!validTag(k)) throw new Error(`字段名「${k}」不能作为 XML 标签，请修改字段名`)
            return this.jsonToXml(v, k, indent + 2)
          })
          .join('\n')
        return `${pad}<${tag}>\n${inner}\n${pad}</${tag}>`
      }
      return `${pad}<${tag}>${escapeXml(value)}</${tag}>`
    },
    // XML → JSON：同名兄弟标签合并为数组；文本节点转 number/boolean
    xmlToJson(el) {
      const children = [...el.children]
      if (!children.length) {
        const text = (el.textContent || '').trim()
        if (text === '') return null
        if (text === 'true') return true
        if (text === 'false') return false
        if (!isNaN(Number(text))) return Number(text)
        return text
      }
      const obj = {}
      children.forEach(c => {
        const v = this.xmlToJson(c)
        if (obj[c.tagName] === undefined) {
          obj[c.tagName] = v
        } else if (Array.isArray(obj[c.tagName])) {
          obj[c.tagName].push(v)
        } else {
          obj[c.tagName] = [obj[c.tagName], v]
        }
      })
      return obj
    },
    copyOutput() {
      if (!this.output) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(this.output).then(() => {
        this.$message.success('复制成功')
      })
    },
    downloadOutput() {
      if (!this.output) {
        this.$message.warning('没有可下载的内容')
        return
      }
      downloadText(this.direction === 'j2x' ? 'export.xml' : 'export.json', this.output)
    },
    clearAll() {
      this.rawInput = ''
      this.output = ''
      this.$refs.inputEditor.focus()
    }
  }
}
</script>

<style lang="scss" scoped>
.root-name-input {
  width: 110px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  outline: none;
  background: var(--card-bg);
  font-size: 12px;
  font-family: 'SF Mono', Menlo, monospace;
  color: var(--text-primary);
  transition: all 0.16s ease;

  &:focus {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
  }

  &::placeholder {
    color: var(--text-secondary);
  }
}
</style>
