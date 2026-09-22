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
          <code-editor :value="sqlOutput" mode="sql" read-only />
        </div>
      </div>
    </div>

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
import { downloadText } from '@/utils/download'

const EXAMPLE = `[
  { "id": 1, "name": "OmniDeck", "version": "1.0.0", "stars": 128, "open_source": true },
  { "id": 2, "name": "wisfire", "version": "0.9.5", "stars": 96, "open_source": false }
]`

export default {
  name: 'ConvertJsonToSql',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      jsonInput: EXAMPLE,
      mode: 'insert',
      tableName: '',
      sqlOutput: '',
      errorMsg: ''
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
  beforeDestroy() {
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
      })
    },
    downloadOutput() {
      if (!this.sqlOutput) {
        this.$message.warning('没有可下载的内容')
        return
      }
      downloadText(`${this.table}.sql`, this.sqlOutput)
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
