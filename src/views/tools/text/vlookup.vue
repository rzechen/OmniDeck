<template>
  <tool-shell
    title="VLookup"
    desc="Excel 多表关联匹配，Map 索引十万级性能"
    icon="table-search"
    color="#722ED1"
    back-path="/tools/text"
  >
    <template #toolbar>
      <button class="tool-btn" @click="pickMain">
        <i class="el-icon-upload2"></i>
        主表
      </button>
      <button class="tool-btn" @click="pickSub">
        <i class="el-icon-upload2"></i>
        从表
      </button>
      <button class="tool-btn is-primary" :disabled="!canRun" @click="runMatch">
        <i class="el-icon-search"></i>
        执行匹配
      </button>
      <button class="tool-btn" :disabled="!matchedRows" @click="exportXlsx">
        <i class="el-icon-download"></i>
        导出结果
      </button>
      <button class="tool-btn is-danger" @click="reset">
        <i class="el-icon-delete"></i>
        清空
      </button>
    </template>

    <div class="vl-body">
      <!-- 文件与规则区 -->
      <div class="vl-config">
        <div class="vl-file" :class="{ loaded: mainBook }" @click="pickMain">
          <i :class="mainBook ? 'el-icon-document' : 'el-icon-upload'"></i>
          <div class="vl-file-info">
            <b>{{ mainName || '上传主表（待填充）' }}</b>
            <span v-if="mainBook">{{ mainSheets.length }} 个 Sheet · {{ mainSheetRows.length }} 行</span>
          </div>
        </div>

        <div v-if="mainBook" class="vl-field-row">
          <span class="vl-label">主表 Sheet</span>
          <select v-model="mainSheet" class="vl-select">
            <option v-for="s in mainSheets" :key="s" :value="s">{{ s }}</option>
          </select>
          <span class="vl-label">关联列</span>
          <select v-model="mainKeyCol" class="vl-select">
            <option v-for="c in mainCols" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div class="vl-file" :class="{ loaded: subBook }" @click="pickSub">
          <i :class="subBook ? 'el-icon-document' : 'el-icon-upload'"></i>
          <div class="vl-file-info">
            <b>{{ subName || '上传从表（数据源）' }}</b>
            <span v-if="subBook">{{ subSheets.length }} 个 Sheet</span>
          </div>
        </div>

        <div v-if="subBook" class="vl-field-row">
          <span class="vl-label">从表 Sheet</span>
          <select v-model="subSheet" class="vl-select">
            <option v-for="s in subSheets" :key="s" :value="s">{{ s }}</option>
          </select>
        </div>

        <div v-if="subSheetRows.length" class="vl-field-row">
          <span class="vl-label">关联列</span>
          <select v-model="subKeyCol" class="vl-select">
            <option v-for="c in subCols" :key="c" :value="c">{{ c }}</option>
          </select>
          <span class="vl-label">取值列</span>
          <select v-model="subValCol" class="vl-select">
            <option v-for="c in subCols" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div v-if="mainCols.length" class="vl-field-row">
          <span class="vl-label">写入主表列</span>
          <input v-model="targetCol" class="vl-input" placeholder="如：部门名称" />
        </div>
      </div>

      <!-- 结果预览 -->
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">匹配结果</span>
          <span v-if="matchedRows !== null">命中 {{ hitCount }} / {{ matchedRows.length }} 行</span>
        </div>
        <div class="pane-body vl-preview">
          <table v-if="matchedRows" class="excel-table">
            <thead>
              <tr>
                <th v-for="c in previewCols" :key="c" :class="{ 'is-new': c === targetCol }">{{ c }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(row, i) in matchedRows.slice(0, 100)" :key="i">
                <td v-for="c in previewCols" :key="c" :class="{ 'is-new': c === targetCol, 'is-miss': row[c + '__miss'] }">
                  {{ row[c] ?? '' }}
                </td>
              </tr>
            </tbody>
          </table>
          <div v-else class="vl-empty">
            <i class="el-icon-data-analysis"></i>
            <p>上传两表并配置规则后执行匹配</p>
          </div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>{{ statusText }}</span>
      <span class="status-right">本地处理，数据不出设备</span>
    </template>
  </tool-shell>
</template>

<script>
import * as XLSX from 'xlsx'
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'TextVlookup',
  components: { ToolShell },
  data() {
    return {
      mainBook: null,
      mainName: '',
      mainSheet: '',
      subBook: null,
      subName: '',
      subSheet: '',
      mainKeyCol: '',
      subKeyCol: '',
      subValCol: '',
      targetCol: '',
      matchedRows: null,
      errorMsg: ''
    }
  },
  computed: {
    mainSheets() {
      return this.mainBook ? this.mainBook.SheetNames : []
    },
    subSheets() {
      return this.subBook ? this.subBook.SheetNames : []
    },
    mainSheetRows() {
      if (!this.mainBook || !this.mainSheet) return []
      return XLSX.utils.sheet_to_json(this.mainBook.Sheets[this.mainSheet], { defval: '' })
    },
    subSheetRows() {
      if (!this.subBook || !this.subSheet) return []
      return XLSX.utils.sheet_to_json(this.subBook.Sheets[this.subSheet], { defval: '' })
    },
    mainCols() {
      return this.mainSheetRows.length ? Object.keys(this.mainSheetRows[0]) : []
    },
    subCols() {
      return this.subSheetRows.length ? Object.keys(this.subSheetRows[0]) : []
    },
    canRun() {
      return (
        this.mainSheetRows.length &&
        this.subSheetRows.length &&
        this.mainKeyCol &&
        this.subKeyCol &&
        this.subValCol &&
        this.targetCol.trim()
      )
    },
    previewCols() {
      if (!this.matchedRows || !this.matchedRows.length) return []
      const keys = Object.keys(this.matchedRows[0]).filter(k => !k.endsWith('__miss'))
      return keys.slice(0, 8)
    },
    hitCount() {
      if (!this.matchedRows) return 0
      return this.matchedRows.filter(r => !r[this.targetCol + '__miss']).length
    },
    statusText() {
      if (this.matchedRows) return `完成：${this.hitCount} 命中`
      if (this.canRun) return '规则就绪，点击执行匹配'
      return '等待配置'
    }
  },
  watch: {
    mainSheet() {
      this.mainKeyCol = ''
      this.matchedRows = null
    },
    subSheet() {
      this.subKeyCol = ''
      this.subValCol = ''
      this.matchedRows = null
    }
  },
  methods: {
    pickMain() {
      this.pickFile('.xls,.xlsx,.csv', f => {
        this.mainName = f.name
        this.mainBook = XLSX.read(new Uint8Array(f._arrayBuffer), { type: 'array' })
        this.mainSheet = this.mainBook.SheetNames[0] || ''
        this.matchedRows = null
      })
    },
    pickSub() {
      this.pickFile('.xls,.xlsx,.csv', f => {
        this.subName = f.name
        this.subBook = XLSX.read(new Uint8Array(f._arrayBuffer), { type: 'array' })
        this.subSheet = this.subBook.SheetNames[0] || ''
        this.matchedRows = null
      })
    },
    pickFile(accept, cb) {
      this.errorMsg = ''
      const input = document.createElement('input')
      input.type = 'file'
      input.accept = accept
      input.onchange = async () => {
        const f = input.files[0]
        if (!f) return
        try {
          f._arrayBuffer = await f.arrayBuffer()
          cb(f)
        } catch (e) {
          this.errorMsg = '文件读取失败：' + e.message
        }
      }
      input.click()
    },
    runMatch() {
      this.errorMsg = ''
      try {
        // 从表建索引：key -> value
        const index = new Map()
        this.subSheetRows.forEach(r => {
          const k = String(r[this.subKeyCol] ?? '').trim()
          if (k !== '') index.set(k, r[this.subValCol] ?? '')
        })
        const target = this.targetCol.trim()
        const out = this.mainSheetRows.map(r => {
          const row = { ...r }
          const k = String(r[this.mainKeyCol] ?? '').trim()
          if (k !== '' && index.has(k)) {
            row[target] = index.get(k)
          } else {
            row[target] = ''
            row[target + '__miss'] = true
          }
          return row
        })
        this.matchedRows = out
        this.$message.success(`匹配完成：${this.hitCount} / ${out.length} 行命中`)
      } catch (e) {
        this.errorMsg = e.message
      }
    },
    exportXlsx() {
      if (!this.matchedRows) return
      const clean = this.matchedRows.map(r => {
        const row = {}
        Object.entries(r).forEach(([k, v]) => {
          if (!k.endsWith('__miss')) row[k] = v
        })
        return row
      })
      const ws = XLSX.utils.json_to_sheet(clean)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, '匹配结果')
      XLSX.writeFile(wb, `vlookup_${Date.now()}.xlsx`)
    },
    reset() {
      this.mainBook = null
      this.subBook = null
      this.mainName = ''
      this.subName = ''
      this.mainSheet = ''
      this.subSheet = ''
      this.mainKeyCol = ''
      this.subKeyCol = ''
      this.subValCol = ''
      this.targetCol = ''
      this.matchedRows = null
      this.errorMsg = ''
    }
  }
}
</script>

<style lang="scss" scoped>
.vl-body {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}

.vl-config {
  flex: 0 0 340px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.vl-file {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border: 1.5px dashed var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.16s ease;

  i {
    font-size: 22px;
  }

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    color: var(--primary-color);
  }

  &.loaded {
    border-style: solid;
    border-color: rgba(var(--primary-color-rgb), 0.35);
    background: rgba(var(--primary-color-rgb), 0.04);
    color: var(--primary-color);
  }
}

.vl-file-info {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;

  b {
    font-size: 12.5px;
    color: var(--text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  span {
    font-size: 10.5px;
    color: var(--text-secondary);
  }
}

.vl-field-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  flex-wrap: wrap;
}

.vl-label {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.vl-select {
  flex: 1;
  min-width: 80px;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--search-bg);
  font-size: 11.5px;
  color: var(--text-primary);
  outline: none;
}

.vl-input {
  flex: 1;
  min-width: 80px;
  height: 26px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  background: var(--search-bg);
  font-size: 11.5px;
  color: var(--text-primary);
  outline: none;

  &:focus {
    border-color: rgba(var(--primary-color-rgb), 0.5);
  }
}

.vl-preview {
  overflow: auto;
  -webkit-app-region: no-drag;
}

.excel-table {
  min-width: 100%;
  font-size: 12px;
  border-collapse: collapse;

  th, td {
    padding: 6px 12px;
    border: 1px solid var(--border-color);
    text-align: left;
    white-space: nowrap;
    max-width: 200px;
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

    &.is-new {
      color: var(--primary-color);
    }
  }

  td.is-new {
    color: var(--primary-color);
    font-weight: 600;

    &.is-miss {
      color: #F54A45;
      opacity: 0.6;
    }
  }
}

.vl-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);

  i {
    font-size: 30px;
    opacity: 0.4;
  }

  p {
    font-size: 12.5px;
  }
}
</style>
