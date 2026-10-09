<template>
  <tool-shell
    title="SQL 转 JSON"
    desc="INSERT 语句解析为结构化 JSON"
    icon="json"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
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
          <span class="pane-title">输入 SQL（INSERT）</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="sqlInput"
            mode="sql"
            placeholder="INSERT INTO `table` (`a`, `b`) VALUES (1, 'x');"
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
      <span v-else>{{ rowCount }} 行数据</span>
      <span class="status-right">{{ sqlInput.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { downloadText } from '@/utils/ui/download'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'ConvertSqlToJson' })

const { message } = useFeedback()

const TOOL_PATH = '/tools/convert/sql-to-json'

const EXAMPLE = `INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`age\`, \`active\`) VALUES (1, 'OmniDeck', 'support@omnideck.app', 1, TRUE);
INSERT INTO \`user\` (\`id\`, \`name\`, \`email\`, \`age\`, \`active\`) VALUES (2, 'wisfire', 'dev@example.com', 3, FALSE);`

const sqlInput = ref(EXAMPLE)
const jsonOutput = ref('')
const errorMsg = ref('')
const rowCount = ref(0)
const historyVisible = ref(false)
const inputEditor = ref(null)

// 防抖定时器（非响应式）
let timer = null

function convert() {
  errorMsg.value = ''
  jsonOutput.value = ''
  rowCount.value = 0
  if (!sqlInput.value.trim()) return
  try {
    // 逐条解析 INSERT 语句（支持多条）
    const rows = []
    const stmtRe = /INSERT\s+INTO\s+[`"[]?(\w+)[`"\]]?\s*\(([^)]+)\)\s*VALUES\s*/gis
    let m
    let lastFields = null
    while ((m = stmtRe.exec(sqlInput.value))) {
      const fields = m[2].split(',').map(f => f.trim().replace(/[`"[\]]/g, ''))
      lastFields = fields
      // 从 VALUES 后扫描所有 (...) 值组（支持一条语句多组）
      const groups = readValueGroups(sqlInput.value, stmtRe.lastIndex)
      if (!groups.length) throw new Error('VALUES 括号不匹配')
      groups.forEach(g => {
        const vals = splitValues(g)
        const obj = {}
        fields.forEach((k, i) => {
          obj[k] = parseValue(vals[i])
        })
        rows.push(obj)
      })
    }
    if (!rows.length) throw new Error('未找到有效的 INSERT 语句')
    rowCount.value = rows.length
    // 单行输出对象，多行输出数组
    jsonOutput.value = JSON.stringify(
      rowCount.value === 1 && lastFields ? rows[0] : rows,
      null,
      2
    )
  } catch (e) {
    errorMsg.value = e.message
  }
}

// 从 pos 开始读取所有连续的 (...) 值组，返回各组内容（不含外层括号）
function readValueGroups(s, pos) {
  const groups = []
  let i = pos
  while (i < s.length) {
    const c = s[i]
    if (c === '(') {
      // 读取一个平衡括号块（引号感知，支持 '' 转义）
      let depth = 0
      let inStr = false
      let quote = ''
      let j = i
      for (; j < s.length; j++) {
        const cj = s[j]
        if (inStr) {
          if (cj === quote) {
            if (quote === "'" && s[j + 1] === "'") {
              j++
              continue
            }
            inStr = false
          }
        } else if (cj === "'" || cj === '"') {
          inStr = true
          quote = cj
        } else if (cj === '(') {
          depth++
        } else if (cj === ')') {
          depth--
          if (depth === 0) break
        }
      }
      if (j >= s.length) throw new Error('VALUES 括号不匹配')
      groups.push(s.slice(i + 1, j))
      i = j + 1
    } else if (c === ',' || c === ';' || /\s/.test(c)) {
      i++
    } else {
      break
    }
  }
  return groups
}

// 顶层按逗号切分值（引号感知）
function splitValues(str) {
  const out = []
  let cur = ''
  let inStr = false
  for (let i = 0; i < str.length; i++) {
    const c = str[i]
    if (inStr) {
      if (c === "'") {
        // '' 转义处理
        if (str[i + 1] === "'") {
          cur += "''"
          i++
          continue
        }
        inStr = false
      }
      cur += c
    } else if (c === "'") {
      inStr = true
      cur += c
    } else if (c === ',') {
      out.push(cur.trim())
      cur = ''
    } else {
      cur += c
    }
  }
  if (cur.trim()) out.push(cur.trim())
  return out
}

function parseValue(v) {
  if (v === undefined || v === '') return null
  if (/^'.*'$/.test(v)) return v.slice(1, -1).replace(/''/g, "'")
  if (/^(true|false)$/i.test(v)) return v.toLowerCase() === 'true'
  if (v.toLowerCase() === 'null') return null
  if (!isNaN(Number(v))) return Number(v)
  return v
}

function copyOutput() {
  if (!jsonOutput.value) {
    message.warning('没有可复制的内容')
    return
  }
  navigator.clipboard.writeText(jsonOutput.value).then(() => {
    message.success('已复制 JSON')
    // 仅按钮触发记录（防抖自动转换不记录）
    record(TOOL_PATH, {
      input: sqlInput.value,
      output: jsonOutput.value,
      options: { action: 'copy' }
    })
  })
}

function downloadOutput() {
  if (!jsonOutput.value) {
    message.warning('没有可下载的内容')
    return
  }
  downloadText('export.json', jsonOutput.value)
  record(TOOL_PATH, {
    input: sqlInput.value,
    output: jsonOutput.value,
    options: { action: 'download' }
  })
}

// 从历史恢复：回填输入并触发转换
async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
  sqlInput.value = full.input || ''
  await nextTick()
  convert()
  inputEditor.value && inputEditor.value.focus()
  message.success('已从历史恢复')
}

function clearAll() {
  sqlInput.value = ''
  jsonOutput.value = ''
  inputEditor.value.focus()
}

watch(sqlInput, () => {
  clearTimeout(timer)
  timer = setTimeout(() => convert(), 250)
})

onMounted(() => {
  convert()
})

onBeforeUnmount(() => {
  clearTimeout(timer)
})
</script>
