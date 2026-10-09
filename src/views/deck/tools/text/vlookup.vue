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
        <svg-icon icon-class="upload2" />
        主表
      </button>
      <button class="tool-btn" @click="pickSub">
        <svg-icon icon-class="upload2" />
        从表
      </button>
      <button class="tool-btn is-primary" :disabled="!canRun" @click="runMatch">
        <svg-icon icon-class="search" />
        执行匹配
      </button>
      <button class="tool-btn" :disabled="!matchedRows" @click="exportXlsx">
        <svg-icon icon-class="download" />
        导出结果
      </button>
      <button class="tool-btn is-danger" @click="reset">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="vl-body">
      <!-- 文件与规则区 -->
      <div class="vl-config">
        <div class="vl-file" :class="{ loaded: mainBook }" @click="pickMain">
          <svg-icon :icon-class="(mainBook ? 'document' : 'upload')" />
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
          <svg-icon :icon-class="(subBook ? 'document' : 'upload')" />
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
            <svg-icon icon-class="data-analysis" />
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

<script setup>
import { ref, computed, watch } from 'vue'
import * as XLSX from 'xlsx'
import ToolShell from '@/components/tool/ToolShell.vue'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'TextVlookup' })

const { message } = useFeedback()

const mainBook = ref(null)
const mainName = ref('')
const mainSheet = ref('')
const subBook = ref(null)
const subName = ref('')
const subSheet = ref('')
const mainKeyCol = ref('')
const subKeyCol = ref('')
const subValCol = ref('')
const targetCol = ref('')
const matchedRows = ref(null)
const errorMsg = ref('')

const mainSheets = computed(() => (mainBook.value ? mainBook.value.SheetNames : []))
const subSheets = computed(() => (subBook.value ? subBook.value.SheetNames : []))
const mainSheetRows = computed(() => {
  if (!mainBook.value || !mainSheet.value) return []
  return XLSX.utils.sheet_to_json(mainBook.value.Sheets[mainSheet.value], { defval: '' })
})
const subSheetRows = computed(() => {
  if (!subBook.value || !subSheet.value) return []
  return XLSX.utils.sheet_to_json(subBook.value.Sheets[subSheet.value], { defval: '' })
})
const mainCols = computed(() => (mainSheetRows.value.length ? Object.keys(mainSheetRows.value[0]) : []))
const subCols = computed(() => (subSheetRows.value.length ? Object.keys(subSheetRows.value[0]) : []))
const canRun = computed(() =>
  mainSheetRows.value.length &&
  subSheetRows.value.length &&
  mainKeyCol.value &&
  subKeyCol.value &&
  subValCol.value &&
  targetCol.value.trim()
)
const previewCols = computed(() => {
  if (!matchedRows.value || !matchedRows.value.length) return []
  const keys = Object.keys(matchedRows.value[0]).filter(k => !k.endsWith('__miss'))
  return keys.slice(0, 8)
})
const hitCount = computed(() => {
  if (!matchedRows.value) return 0
  return matchedRows.value.filter(r => !r[targetCol.value + '__miss']).length
})
const statusText = computed(() => {
  if (matchedRows.value) return `完成：${hitCount.value} 命中`
  if (canRun.value) return '规则就绪，点击执行匹配'
  return '等待配置'
})

watch(mainSheet, () => {
  mainKeyCol.value = ''
  matchedRows.value = null
})
watch(subSheet, () => {
  subKeyCol.value = ''
  subValCol.value = ''
  matchedRows.value = null
})

function pickMain() {
  pickFile('.xls,.xlsx,.csv', f => {
    mainName.value = f.name
    mainBook.value = XLSX.read(new Uint8Array(f._arrayBuffer), { type: 'array' })
    mainSheet.value = mainBook.value.SheetNames[0] || ''
    matchedRows.value = null
  })
}

function pickSub() {
  pickFile('.xls,.xlsx,.csv', f => {
    subName.value = f.name
    subBook.value = XLSX.read(new Uint8Array(f._arrayBuffer), { type: 'array' })
    subSheet.value = subBook.value.SheetNames[0] || ''
    matchedRows.value = null
  })
}

function pickFile(accept, cb) {
  errorMsg.value = ''
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
      errorMsg.value = '文件读取失败：' + e.message
    }
  }
  input.click()
}

function runMatch() {
  errorMsg.value = ''
  try {
    // 从表建索引：key -> value
    const index = new Map()
    subSheetRows.value.forEach(r => {
      const k = String(r[subKeyCol.value] ?? '').trim()
      if (k !== '') index.set(k, r[subValCol.value] ?? '')
    })
    const target = targetCol.value.trim()
    const out = mainSheetRows.value.map(r => {
      const row = { ...r }
      const k = String(r[mainKeyCol.value] ?? '').trim()
      if (k !== '' && index.has(k)) {
        row[target] = index.get(k)
      } else {
        row[target] = ''
        row[target + '__miss'] = true
      }
      return row
    })
    matchedRows.value = out
    message.success(`匹配完成：${hitCount.value} / ${out.length} 行命中`)
  } catch (e) {
    errorMsg.value = e.message
  }
}

function exportXlsx() {
  if (!matchedRows.value) return
  const clean = matchedRows.value.map(r => {
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
}

function reset() {
  mainBook.value = null
  subBook.value = null
  mainName.value = ''
  subName.value = ''
  mainSheet.value = ''
  subSheet.value = ''
  mainKeyCol.value = ''
  subKeyCol.value = ''
  subValCol.value = ''
  targetCol.value = ''
  matchedRows.value = null
  errorMsg.value = ''
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
      color: var(--danger-color);
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
