<template>
  <tool-shell
    title="JSON 转 Excel"
    desc="JSON 数组导出为 Excel 可打开的表格（带 BOM UTF-8 CSV）"
    icon="excel"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <button class="tool-btn is-primary" @click="exportCsv">
        <i class="el-icon-download"></i>
        导出 CSV
      </button>
      <button class="tool-btn" :class="{ 'is-primary': historyVisible }" @click="historyVisible = !historyVisible">
        <i class="el-icon-time"></i>
        历史
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
          <span class="pane-title">输入 JSON（对象数组）</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="jsonInput"
            mode="application/json"
            placeholder='[{"列1": "值1", "列2": 2}, …]'
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">表格预览</span>
          <span>扁平化嵌套对象</span>
        </div>
        <div class="pane-body preview-scroll">
          <table v-if="columns.length" class="excel-table">
            <thead>
              <tr>
                <th v-for="c in columns" :key="c">{{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in rows" :key="i">
                <td v-for="c in columns" :key="c">{{ cellText(row[c]) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-else class="preview-empty">
            <i class="el-icon-document"></i>
            <p>输入 JSON 对象数组后预览表格</p>
          </div>
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
      <span v-else>{{ rows.length }} 行 · {{ columns.length }} 列</span>
      <span class="status-right">{{ jsonInput.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { downloadText } from '@/utils/download'
import { record, get as getHistory } from '@/utils/tool-history'

const TOOL_PATH = '/tools/convert/json-to-excel'

const EXAMPLE = `[
  { "姓名": "张三", "部门": "研发部", "薪资": 25000, "在职": true },
  { "姓名": "李四", "部门": "产品部", "薪资": 21000, "在职": false },
  { "姓名": "王五", "部门": "研发部", "薪资": 28000, "在职": true, "技能": { "主语言": "Go", "年限": 5 } }
]`

// 深层对象扁平化：{a:{b:1}} → {'a.b': 1}
function flatten(obj, prefix = '') {
  const out = {}
  Object.entries(obj).forEach(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(out, flatten(v, key))
    } else if (Array.isArray(v)) {
      out[key] = v.join('|')
    } else {
      out[key] = v
    }
  })
  return out
}

// CSV 单元格转义：含逗号/引号/换行时用双引号包裹
function csvCell(v) {
  if (v === null || v === undefined) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"'
  }
  return s
}

export default {
  name: 'ConvertJsonToExcel',
  components: { ToolShell, CodeEditor, ToolHistoryPanel },
  data() {
    return {
      jsonInput: EXAMPLE,
      columns: [],
      rows: [],
      errorMsg: '',
      historyVisible: false,
      TOOL_PATH: TOOL_PATH
    }
  },
  watch: {
    jsonInput() {
      clearTimeout(this._timer)
      this._timer = setTimeout(() => this.parse(), 250)
    }
  },
  mounted() {
    this.parse()
  },
  beforeDestroy() {
    clearTimeout(this._timer)
  },
  methods: {
    parse() {
      this.errorMsg = ''
      this.columns = []
      this.rows = []
      if (!this.jsonInput.trim()) return
      try {
        let json = JSON.parse(this.jsonInput)
        if (!Array.isArray(json)) json = [json]
        // 扁平化所有行，收集列（保持出现顺序）
        const flatRows = json.map(r => {
          if (typeof r !== 'object' || r === null) throw new Error('数组元素必须是对象')
          return flatten(r)
        })
        const colSet = new Set()
        flatRows.forEach(r => Object.keys(r).forEach(k => colSet.add(k)))
        this.columns = [...colSet]
        this.rows = flatRows
      } catch (e) {
        this.errorMsg = e.message
      }
    },
    cellText(v) {
      if (v === null || v === undefined) return ''
      if (typeof v === 'boolean') return v ? '是' : '否'
      if (typeof v === 'object') return JSON.stringify(v)
      return String(v)
    },
    exportCsv() {
      if (!this.rows.length) {
        this.$message.warning('没有可导出的数据')
        return
      }
      const csv = [
        this.columns.map(csvCell).join(','),
        ...this.rows.map(r => this.columns.map(c => csvCell(r[c])).join(','))
      ].join('\r\n')
      // BOM 头保证 Excel 正确识别 UTF-8 中文
      downloadText('export.csv', '\uFEFF' + csv, 'text/csv;charset=utf-8')
      record(TOOL_PATH, {
        input: this.jsonInput,
        output: csv,
        options: { action: 'export', filename: 'export.csv', rows: this.rows.length, columns: this.columns.length }
      })
    },
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      this.jsonInput = full.input || ''
      this.$nextTick(() => {
        this.$refs.inputEditor && this.$refs.inputEditor.focus()
      })
      this.$message.success('已从历史恢复')
    },
    clearAll() {
      this.jsonInput = ''
      this.columns = []
      this.rows = []
      this.$refs.inputEditor.focus()
    }
  }
}
</script>

<style lang="scss" scoped>
.preview-scroll {
  overflow: auto;
  -webkit-app-region: no-drag;
}

.excel-table {
  min-width: 100%;
  font-size: 12.5px;
  border-collapse: collapse;

  th, td {
    padding: 7px 14px;
    border: 1px solid var(--border-color);
    text-align: left;
    white-space: nowrap;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  th {
    background-color: var(--card-bg);
    background-image: linear-gradient(var(--search-bg), var(--search-bg));
    font-weight: 600;
    color: var(--text-secondary);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  tbody tr:hover td {
    background: rgba(var(--primary-color-rgb), 0.04);
  }

  td {
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }
}

.preview-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);

  i {
    font-size: 30px;
    margin-bottom: 10px;
    opacity: 0.45;
  }
}
</style>
