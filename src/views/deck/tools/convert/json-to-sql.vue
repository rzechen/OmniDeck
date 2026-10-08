<template>
  <tool-shell
    title="JSON 转 SQL"
    desc="生成 CREATE TABLE 与 INSERT 语句"
    icon="database"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: mode === 'create' }"
          @click="mode = 'create'"
        >
          CREATE TABLE
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: mode === 'insert' }"
          @click="mode = 'insert'"
        >
          INSERT
        </div>
      </div>
      <input v-model="tableName" class="table-name-input" placeholder="表名" spellcheck="false" />
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
          <span class="pane-title">输入 JSON</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="jsonInput"
            mode="application/json"
            placeholder="输入 JSON 对象或数组…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">SQL 输出</span>
        </div>
        <div class="pane-body">
          <code-editor :model-value="sqlOutput" mode="sql" read-only />
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
      <span v-else>{{ mode === 'create' ? '建表语句' : '插入语句' }} · {{ table || 'your_table' }}</span>
      <span class="status-right">{{ jsonInput.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { downloadText } from '@/utils/ui/download'
import { record, get as getHistory } from '@/utils/storage/tool-history'

const TOOL_PATH = '/tools/convert/json-to-sql'

const EXAMPLE = `[
  { "id": 1, "name": "OmniDeck", "version": "1.0.0", "stars": 128, "open_source": true },
  { "id": 2, "name": "wisfire", "version": "0.9.5", "stars": 96, "open_source": false }
]`

export default {
  name: 'ConvertJsonToSql',
  components: { ToolShell, CodeEditor, ToolHistoryPanel },
  data() {
    return {
      jsonInput: EXAMPLE,
      mode: 'insert',
      tableName: '',
      sqlOutput: '',
      errorMsg: '',
      historyVisible: false,
      // 模板/实例可访问的工具 path（历史面板与 record 用）
      TOOL_PATH: TOOL_PATH
    }
  },
  computed: {
    table() {
      return this.tableName.trim() || 'your_table'
    }
  },
  watch: {
    jsonInput() {
      clearTimeout(this._timer)
      this._timer = setTimeout(() => this.convert(), 250)
    },
    mode() {
      this.convert()
    },
    tableName() {
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
    convert() {
      this.errorMsg = ''
      if (!this.jsonInput.trim()) {
        this.sqlOutput = ''
        return
      }
      let json
      try {
        json = JSON.parse(this.jsonInput)
      } catch (e) {
        this.errorMsg = 'JSON 解析失败：' + e.message
        this.sqlOutput = ''
        return
      }
      try {
        this.sqlOutput =
          this.mode === 'create' ? this.generateCreateTable(json) : this.generateInsert(json)
      } catch (e) {
        this.errorMsg = e.message
      }
    },
    // 由值推断 SQL 列类型（数组取首元素）
    sqlType(v) {
      if (typeof v === 'number') return Number.isInteger(v) ? 'INT' : 'FLOAT'
      if (typeof v === 'boolean') return 'BOOLEAN'
      if (typeof v === 'object' && v !== null) return 'JSON'
      return 'TEXT'
    },
    generateCreateTable(json) {
      const row = Array.isArray(json) ? json[0] : json
      if (typeof row !== 'object' || row === null || Array.isArray(row)) {
        throw new Error('需要 JSON 对象（或对象数组）来推断表结构')
      }
      const cols = Object.entries(row).map(
        ([k, v]) => `  \`${k}\` ${this.sqlType(v)}`
      )
      return `CREATE TABLE \`${this.table}\` (\n${cols.join(',\n')}\n);`
    },
    generateInsert(json) {
      const rows = Array.isArray(json) ? json : [json]
      if (!rows.length || typeof rows[0] !== 'object' || rows[0] === null) {
        throw new Error('需要 JSON 对象或对象数组')
      }
      return rows.map(r => this.rowToInsert(r)).join('\n\n')
    },
    rowToInsert(obj) {
      const keys = Object.keys(obj).map(k => `\`${k}\``).join(', ')
      const values = Object.values(obj)
        .map(v => {
          if (v === null || v === undefined) return 'NULL'
          if (typeof v === 'string') return `'${v.replace(/'/g, "''")}'`
          if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
          if (typeof v === 'object') return `'${JSON.stringify(v).replace(/'/g, "''")}'`
          return String(v)
        })
        .join(', ')
      return `INSERT INTO \`${this.table}\` (${keys}) VALUES (${values});`
    },
    copyOutput() {
      if (!this.sqlOutput) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(this.sqlOutput).then(() => {
        this.$message.success('已复制 SQL')
        // 仅按钮触发记录（防抖自动转换不记录）
        record(TOOL_PATH, {
          input: this.jsonInput,
          output: this.sqlOutput,
          options: { action: 'copy', mode: this.mode, table: this.table }
        })
      })
    },
    downloadOutput() {
      if (!this.sqlOutput) {
        this.$message.warning('没有可下载的内容')
        return
      }
      downloadText(`${this.table}.sql`, this.sqlOutput)
      record(TOOL_PATH, {
        input: this.jsonInput,
        output: this.sqlOutput,
        options: { action: 'download', mode: this.mode, table: this.table }
      })
    },
    // 从历史恢复：回填输入（含模式与表名）并触发转换
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      if (full.options) {
        if (full.options.mode) this.mode = full.options.mode
        if (full.options.table && full.options.table !== 'your_table') this.tableName = full.options.table
      }
      this.jsonInput = full.input || ''
      this.$nextTick(() => {
        this.convert()
        this.$refs.inputEditor && this.$refs.inputEditor.focus()
      })
      this.$message.success('已从历史恢复')
    },
    clearAll() {
      this.jsonInput = ''
      this.sqlOutput = ''
      this.$refs.inputEditor.focus()
    }
  }
}
</script>

<style lang="scss" scoped>
.table-name-input {
  width: 130px;
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
