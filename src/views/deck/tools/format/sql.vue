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
      <button class="tool-btn" @click="onFormatClick">
        <svg-icon icon-class="magic-stick" />
        格式化
      </button>
      <button class="tool-btn" @click="minifyContent">
        <svg-icon icon-class="c-scale-to-original" />
        压缩
      </button>
      <button class="tool-btn is-primary" @click="copyOutput">
        <svg-icon icon-class="document-copy" />
        复制
      </button>
      <button class="tool-btn" @click="exportOutput">
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
          <code-editor :model-value="formattedOutput" mode="sql" read-only />
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
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { downloadText } from '@/utils/download'
import { record, get as getHistory } from '@/utils/tool-history'

const TOOL_PATH = '/tools/format/sql'

const EXAMPLE = `SELECT d.deptno, d.dname, d.loc, COUNT(e.empno) AS mycount, NVL(AVG(e.sal), 0) AS myavg FROM dept d, emp e WHERE d.deptno = e.deptno(+) GROUP BY d.deptno, d.dname, d.loc HAVING AVG(sal) > 2000`

export default {
  name: 'FormatSql',
  components: { ToolShell, CodeEditor, ToolHistoryPanel },
  data() {
    return {
      rawInput: EXAMPLE,
      formattedOutput: '',
      historyVisible: false,
      // 模板/实例可访问的工具 path（历史面板与 record 用）
      TOOL_PATH: TOOL_PATH,
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
  beforeUnmount() {
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
        // 仅按钮触发记录（防抖自动格式化与方言切换不记录）
        if (this._manual) {
          this._manual = false
          record(TOOL_PATH, {
            input: this.rawInput,
            output: this.formattedOutput,
            options: { action: 'format', dialect: this.dialect }
          })
        }
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
      record(TOOL_PATH, {
        input: this.rawInput,
        output: this.formattedOutput,
        options: { action: 'minify', dialect: this.dialect }
      })
    },
    copyOutput() {
      if (!this.formattedOutput.trim()) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(this.formattedOutput).then(() => {
        this.$message.success('复制成功')
        record(TOOL_PATH, {
          input: this.rawInput,
          output: this.formattedOutput,
          options: { action: 'copy', dialect: this.dialect }
        })
      })
    },
    // 手动点击「格式化」按钮（区别于防抖自动触发）
    onFormatClick() {
      this._manual = true
      this.formatContent()
    },
    // 从历史恢复：回填输入并触发格式化
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      this.rawInput = full.input || ''
      if (full.options && full.options.dialect) this.dialect = full.options.dialect
      this.$nextTick(() => {
        this.formatContent()
        this.$refs.inputEditor && this.$refs.inputEditor.focus()
      })
      this.$message.success('已从历史恢复')
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
