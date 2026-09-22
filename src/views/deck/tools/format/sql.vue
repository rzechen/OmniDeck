<template>
  <tool-shell
    title="SQL 格式化"
    desc="多种 SQL 方言的格式化与压缩"
    icon="database"
    color="#3366FF"
    back-path="/tools/format"
  >
    <template #toolbar>
      <el-select
        v-model="dialect"
        class="tool-select"
        size="small"
        style="width: 128px"
        @change="formatContent"
      >
        <el-option
          v-for="d in dialects"
          :key="d.value"
          :label="d.label"
          :value="d.value"
        />
      </el-select>
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
          <span class="pane-title">输入 SQL</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="rawInput"
            mode="sql"
            placeholder="输入 SQL 语句…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">输出结果</span>
        </div>
        <div class="pane-body">
          <code-editor :value="formattedOutput" mode="sql" read-only />
        </div>
      </div>
    </div>

    <template #status>
      <template v-if="rawInput.trim()">
        <span class="status-dot"></span>
        <span>{{ dialectLabel }} · 已格式化</span>
      </template>
      <template v-else>
        <span>等待输入</span>
      </template>
      <span class="status-right">{{ lineCount }} 行 · {{ rawInput.length }} 字符</span>
    </template>
  </tool-shell>
</template>

<script>
import { format as formatSql } from 'sql-formatter'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import { downloadText } from '@/utils/download'

const EXAMPLE = `SELECT d.deptno, d.dname, d.loc, COUNT(e.empno) AS mycount, NVL(AVG(e.sal), 0) AS myavg FROM dept d, emp e WHERE d.deptno = e.deptno(+) GROUP BY d.deptno, d.dname, d.loc HAVING AVG(sal) > 2000`

export default {
  name: 'FormatSql',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      rawInput: EXAMPLE,
      formattedOutput: '',
      dialect: 'sql',
      dialects: [
        { label: '标准 SQL', value: 'sql' },
        { label: 'MySQL', value: 'mysql' },
        { label: 'PostgreSQL', value: 'postgresql' },
        { label: 'SQLite', value: 'sqlite' },
        { label: 'MariaDB', value: 'mariadb' },
        { label: 'Oracle PL/SQL', value: 'plsql' },
        { label: 'SQL Server', value: 'transactsql' },
        { label: 'Spark', value: 'spark' },
        { label: 'Hive', value: 'hive' },
        { label: 'BigQuery', value: 'bigquery' },
        { label: 'Snowflake', value: 'snowflake' },
        { label: 'Trino', value: 'trino' }
      ]
    }
  },
  computed: {
    lineCount() {
      return this.rawInput ? this.rawInput.split('\n').length : 0
    },
    dialectLabel() {
      const d = this.dialects.find(x => x.value === this.dialect)
      return d ? d.label : '标准 SQL'
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
        this.formattedOutput = formatSql(this.rawInput, {
          language: this.dialect,
          tabWidth: 2
        })
      } catch (e) {
        this.formattedOutput = this.rawInput
        this.$message.error('格式化失败：' + e.message)
      }
    },
    minifyContent() {
      if (!this.rawInput.trim()) return
      this.formattedOutput = this.rawInput
        .replace(/\s+/g, ' ')
        .replace(/\s*,\s*/g, ', ')
        .replace(/\s*\(\s*/g, ' (')
        .replace(/\s*\)\s*/g, ') ')
        .replace(/\s+/g, ' ')
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
      downloadText('export.sql', this.formattedOutput, 'text/plain;charset=utf-8')
    },
    clearAll() {
      this.rawInput = ''
      this.formattedOutput = ''
      this.$refs.inputEditor.focus()
    }
  }
}
</script>
