<template>
  <tool-shell
    title="CSV 转 JSON"
    desc="自动识别分隔符，支持类型推断"
    icon="csv"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: outputMode === 'array' }"
          @click="outputMode = 'array'"
        >
          对象数组
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: outputMode === 'map' }"
          @click="outputMode = 'map'"
        >
          键值对象
        </div>
      </div>
      <label class="tool-btn">
        <input v-model="autoType" type="checkbox" class="hidden-cb" />
        {{ autoType ? '类型推断：开' : '类型推断：关' }}
      </label>
      <button class="tool-btn is-primary" @click="copyOutput">
        <svg-icon icon-class="document-copy" />
        复制
      </button>
      <button class="tool-btn" @click="downloadOutput">
        <svg-icon icon-class="download" />
        下载
      </button>
      <button class="tool-btn" :class="{ 'is-primary': historyVisible }" @click="historyVisible = !historyVisible">
        <svg-icon icon-class="time" />
        历史
      </button>
      <button class="tool-btn is-danger" @click="clearAll">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="split-pane">
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">输入 CSV</span>
          <select v-model="separator" class="sep-select" @change="convert">
            <option value="auto">自动分隔</option>
            <option value=",">逗号</option>
            <option value="\t">制表符</option>
            <option value=";">分号</option>
            <option value="|">竖线</option>
          </select>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="csvInput"
            mode="text/plain"
            :fold="false"
            placeholder="粘贴 CSV 数据，首行为表头…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">JSON 输出</span>
        </div>
        <div class="pane-body">
          <code-editor :model-value="jsonOutput" mode="application/json" read-only />
        </div>
      </div>
    </div>

    <!-- 执行历史面板（与分栏并排，右侧抽屉） -->
    <tool-history-panel
      :visible="historyVisible"
      :tool="TOOL_PATH"
      @close="historyVisible = false"
      @restore="restoreFromHistory"
    />

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>{{ rowCount }} 行 · {{ colCount }} 列</span>
      <span class="status-right">{{ csvInput.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { downloadText } from '@/utils/download'
import { record, get as getHistory } from '@/utils/tool-history'

const TOOL_PATH = '/tools/convert/csv-to-json'

const EXAMPLE = `name,category,version,downloads
OmniDeck,desktop,1.0.0,12800
wisfire,web,0.9.5,9600`

export default {
  name: 'ConvertCsvToJson',
  components: { ToolShell, CodeEditor, ToolHistoryPanel },
  data() {
    return {
      csvInput: EXAMPLE,
      outputMode: 'array',
      autoType: true,
      separator: 'auto',
      jsonOutput: '',
      errorMsg: '',
      rowCount: 0,
      colCount: 0,
      historyVisible: false,
      // 模板/实例可访问的工具 path（历史面板与 record 用）
      TOOL_PATH: TOOL_PATH
    }
  },
  watch: {
    csvInput() {
      clearTimeout(this._timer)
      this._timer = setTimeout(() => this.convert(), 250)
    },
    outputMode() {
      this.convert()
    },
    autoType() {
      this.convert()
    }
  },
  mounted() {
    this.convert()
  },
  beforeUnmount() {
    clearTimeout(this._timer)
  },
  methods: {
    // 解析一行 CSV（引号感知：a,"b,c","d""e" → ['a','b,c','d"e']）
    parseLine(line, sep) {
      const out = []
      let cur = ''
      let inStr = false
      for (let i = 0; i < line.length; i++) {
        const c = line[i]
        if (inStr) {
          if (c === '"') {
            if (line[i + 1] === '"') {
              cur += '"'
              i++
            } else {
              inStr = false
            }
          } else {
            cur += c
          }
        } else if (c === '"') {
          inStr = true
        } else if (c === sep) {
          out.push(cur)
          cur = ''
        } else {
          cur += c
        }
      }
      out.push(cur)
      return out.map(s => s.trim())
    },
    autoConvert(v) {
      if (!this.autoType) return v
      if (v === 'true') return true
      if (v === 'false') return false
      if (v !== '' && !isNaN(Number(v))) return Number(v)
      return v
    },
    convert() {
      this.errorMsg = ''
      this.jsonOutput = ''
      if (!this.csvInput.trim()) {
        this.rowCount = 0
        this.colCount = 0
        return
      }
      try {
        const lines = this.csvInput.trim().split(/\r?\n/)
        let sep = this.separator
        if (sep === 'auto') {
          const head = lines[0]
          const counts = [
            [',', (head.match(/,/g) || []).length],
            ['\t', (head.match(/\t/g) || []).length],
            [';', (head.match(/;/g) || []).length],
            ['|', (head.match(/\|/g) || []).length]
          ]
          counts.sort((a, b) => b[1] - a[1])
          sep = counts[0][1] > 0 ? counts[0][0] : ','
        }
        if (sep === '\\t') sep = '\t'

        const headers = this.parseLine(lines[0], sep)
        this.colCount = headers.length
        const dataLines = lines.slice(1)
        this.rowCount = dataLines.length

        let result
        if (this.outputMode === 'array') {
          result = dataLines.map(line => {
            const values = this.parseLine(line, sep)
            const obj = {}
            headers.forEach((h, i) => {
              obj[h] = this.autoConvert(values[i] ?? '')
            })
            return obj
          })
        } else {
          // 键值对象：首列为 key，次列为 value
          result = {}
          dataLines.forEach(line => {
            const values = this.parseLine(line, sep)
            result[values[0]] = this.autoConvert(values[1] ?? '')
          })
        }
        this.jsonOutput = JSON.stringify(result, null, 2)
      } catch (e) {
        this.errorMsg = e.message
      }
    },
    copyOutput() {
      if (!this.jsonOutput) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(this.jsonOutput).then(() => {
        this.$message.success('已复制 JSON')
        // 仅按钮触发记录（防抖自动转换不记录）
        record(TOOL_PATH, {
          input: this.csvInput,
          output: this.jsonOutput,
          options: { action: 'copy', mode: this.outputMode, autoType: this.autoType, separator: this.separator }
        })
      })
    },
    downloadOutput() {
      if (!this.jsonOutput) {
        this.$message.warning('没有可下载的内容')
        return
      }
      downloadText('export.json', this.jsonOutput, 'application/json')
      record(TOOL_PATH, {
        input: this.csvInput,
        output: this.jsonOutput,
        options: { action: 'download', mode: this.outputMode, autoType: this.autoType, separator: this.separator }
      })
    },
    // 从历史恢复：回填输入（含选项）并触发转换
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      if (full.options) {
        if (full.options.mode) this.outputMode = full.options.mode
        if (typeof full.options.autoType === 'boolean') this.autoType = full.options.autoType
        if (full.options.separator) this.separator = full.options.separator
      }
      this.csvInput = full.input || ''
      this.$nextTick(() => {
        this.convert()
        this.$refs.inputEditor && this.$refs.inputEditor.focus()
      })
      this.$message.success('已从历史恢复')
    },
    clearAll() {
      this.csvInput = ''
      this.jsonOutput = ''
      this.$refs.inputEditor.focus()
    }
  }
}
</script>

<style lang="scss" scoped>
.sep-select {
  height: 22px;
  padding: 0 6px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  font-size: 11px;
  color: var(--text-primary);
  outline: none;
  cursor: pointer;
}

.hidden-cb {
  display: none;
}
</style>
