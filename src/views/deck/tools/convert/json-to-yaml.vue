<template>
  <tool-shell
    title="JSON ⇄ YAML"
    desc="JSON 与 YAML 双向互转"
    icon="doc"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: direction === 'j2y' }"
          @click="direction = 'j2y'"
        >
          JSON → YAML
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: direction === 'y2j' }"
          @click="direction = 'y2j'"
        >
          YAML → JSON
        </div>
      </div>
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
          <span class="pane-title">{{ direction === 'j2y' ? '输入 JSON' : '输入 YAML' }}</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="rawInput"
            :mode="direction === 'j2y' ? 'application/json' : 'yaml'"
            :placeholder="direction === 'j2y' ? '输入 JSON…' : '输入 YAML…'"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">{{ direction === 'j2y' ? 'YAML 输出' : 'JSON 输出' }}</span>
        </div>
        <div class="pane-body">
          <code-editor :value="output" :mode="direction === 'j2y' ? 'yaml' : 'application/json'" read-only />
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
import yaml from 'js-yaml'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import { downloadText } from '@/utils/download'

const JSON_EXAMPLE = `{
  "name": "OmniDeck",
  "version": "1.0.0",
  "features": ["格式化", "转换", "加密"],
  "server": { "port": 8080, "host": "0.0.0.0" }
}`

const YAML_EXAMPLE = `name: OmniDeck
version: 1.0.0
features:
  - 格式化
  - 转换
  - 加密
server:
  port: 8080
  host: 0.0.0.0`

export default {
  name: 'ConvertJsonYaml',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      direction: 'j2y',
      rawInput: JSON_EXAMPLE,
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
      // 切换方向：输出内容反填为输入，便于来回转换
      if (this.output && !this.errorMsg) {
        this.rawInput = this.output
      } else {
        this.rawInput = this.direction === 'j2y' ? JSON_EXAMPLE : YAML_EXAMPLE
      }
      this.convert()
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
        if (this.direction === 'j2y') {
          this.output = yaml.dump(JSON.parse(this.rawInput), { indent: 2, lineWidth: 120 })
        } else {
          this.output = JSON.stringify(yaml.load(this.rawInput), null, 2)
        }
      } catch (e) {
        this.errorMsg = e.message
      }
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
      downloadText(this.direction === 'j2y' ? 'export.yaml' : 'export.json', this.output)
    },
    clearAll() {
      this.rawInput = ''
      this.output = ''
      this.$refs.inputEditor.focus()
    }
  }
}
</script>
