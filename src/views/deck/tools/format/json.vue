<template>
  <tool-shell
    title="JSON 格式化"
    desc="校验、美化与压缩 JSON，支持转义处理与代码折叠"
    icon="json"
    color="#3366FF"
    back-path="/tools/format"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: !compressed }"
          @click="setCompressed(false)"
        >
          <svg-icon icon-class="s-operation" />
          格式化
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: compressed }"
          @click="setCompressed(true)"
        >
          <svg-icon icon-class="c-scale-to-original" />
          压缩
        </div>
      </div>
      <button class="tool-btn" @click="escapeJson">
        <svg-icon icon-class="connection" />
        转义
      </button>
      <button class="tool-btn" @click="unescapeJson">
        <svg-icon icon-class="scissors" />
        去转义
      </button>
      <button class="tool-btn" @click="toggleFold">
        <svg-icon :icon-class="folded ? 'expand' : 'fold'" class="fold-icon" />
        {{ folded ? '展开全部' : '折叠全部' }}
      </button>
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
            placeholder="粘贴或输入 JSON，支持单引号自动修正…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">输出结果</span>
          <span>{{ compressed ? '压缩' : '美化' }}后内容</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="outputEditor"
            :model-value="formattedJson"
            mode="application/json"
            read-only
          />
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
      <template v-if="jsonInput.trim()">
        <span class="status-dot" :class="{ 'is-bad': !valid }"></span>
        <span v-if="valid">JSON 有效</span>
        <span v-else class="status-err" :title="errMsg">
          {{ errBrief }}
        </span>
      </template>
      <template v-else>
        <span>等待输入</span>
      </template>
      <span class="status-right">
        {{ lineCount }} 行 · {{ jsonInput.length }} 字符
      </span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { downloadText } from '@/utils/ui/download'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'FormatJson' })

const { message } = useFeedback()

const TOOL_PATH = '/tools/format/json'

const EXAMPLE = `{
  "name": "OmniDeck",
  "version": "1.0.0",
  "features": ["格式化", "转换", "加密"],
  "config": { "theme": "light", "autoUpdate": true }
}`

// 单引号 → 双引号修正（宽松解析）
function normalizeJsonLike(str) {
  const s = str.trim()
  try {
    JSON.parse(s)
    return s
  } catch (e) {
    // fallthrough
  }
  return s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_, v) => `"${v.replace(/"/g, '\\"')}"`)
}

// 从 JSON.parse 报错中提取行列位置（"position N"）
function locateError(input, err) {
  const m = /position (\d+)/.exec(err.message)
  if (!m) return null
  const pos = Math.min(+m[1], input.length)
  const before = input.slice(0, pos)
  const line = before.split('\n').length
  const col = pos - before.lastIndexOf('\n')
  return { line, col }
}

const jsonInput = ref(EXAMPLE)
const formattedJson = ref('')
const compressed = ref(false)
const folded = ref(false)
const valid = ref(true)
const errMsg = ref('')
const errPos = ref(null)
const historyVisible = ref(false)
const inputEditor = ref(null)
const outputEditor = ref(null)

// 防抖定时器（非响应式）
let timer = null

const lineCount = computed(() => (jsonInput.value ? jsonInput.value.split('\n').length : 0))
const errBrief = computed(() => {
  if (!errMsg.value) return 'JSON 无效'
  let brief = errMsg.value.replace(/^JSON\.parse:\s*/, '')
  if (errPos.value) {
    brief += `（第 ${errPos.value.line} 行，第 ${errPos.value.col} 列附近）`
  }
  return brief
})

function parseInput() {
  try {
    const obj = JSON.parse(normalizeJsonLike(jsonInput.value))
    valid.value = true
    errMsg.value = ''
    errPos.value = null
    return obj
  } catch (e) {
    valid.value = false
    errMsg.value = e.message
    errPos.value = locateError(jsonInput.value, e)
    return undefined
  }
}

function updateFormatted() {
  if (!jsonInput.value.trim()) {
    formattedJson.value = ''
    valid.value = true
    errMsg.value = ''
    errPos.value = null
    return
  }
  const obj = parseInput()
  if (obj === undefined) {
    // 无效时原样透出到右侧，方便对照
    formattedJson.value = jsonInput.value
    return
  }
  formattedJson.value = compressed.value
    ? JSON.stringify(obj)
    : JSON.stringify(obj, null, 2)
}

function setCompressed(c) {
  if (compressed.value === c) return
  compressed.value = c
  if (valid.value) updateFormatted()
}

function toggleFold() {
  if (!formattedJson.value.trim()) return
  folded.value = !folded.value
  folded.value
    ? outputEditor.value.foldAll()
    : outputEditor.value.unfoldAll()
}

// 转义：JSON → 带引号的转义字符串字面量
function escapeJson() {
  const obj = parseInput()
  if (obj === undefined) {
    message.error('JSON 不合法，无法转义')
    return
  }
  const before = jsonInput.value
  jsonInput.value = JSON.stringify(JSON.stringify(obj))
  record(TOOL_PATH, { input: before, output: jsonInput.value, options: { action: 'escape' } })
}

// 去转义：转义字符串 → 格式化 JSON
function unescapeJson() {
  try {
    const parsed = JSON.parse(jsonInput.value.trim())
    if (typeof parsed !== 'string') {
      message.warning('当前内容已是合法 JSON，无需去除转义')
      return
    }
    const finalParsed = JSON.parse(parsed)
    if (typeof finalParsed !== 'object' || finalParsed === null) {
      message.warning('去除转义后不是 JSON 对象')
      return
    }
    const before = jsonInput.value
    jsonInput.value = JSON.stringify(finalParsed, null, 2)
    record(TOOL_PATH, { input: before, output: jsonInput.value, options: { action: 'unescape' } })
  } catch (e) {
    message.error('内容不是合法的转义 JSON 字符串')
  }
}

function copyOutput() {
  if (!formattedJson.value.trim()) {
    message.warning('没有可复制的内容')
    return
  }
  navigator.clipboard.writeText(formattedJson.value).then(() => {
    message.success('复制成功')
    // 仅按钮触发记录（防抖自动格式化不记录）
    record(TOOL_PATH, {
      input: jsonInput.value,
      output: formattedJson.value,
      options: { action: 'copy', compressed: compressed.value }
    })
  })
}

// 从历史恢复：回填输入并触发格式化
async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
  jsonInput.value = full.input || ''
  await nextTick()
  inputEditor.value && inputEditor.value.focus()
  message.success('已从历史恢复')
}

function downloadOutput() {
  if (!formattedJson.value.trim()) {
    message.warning('没有可下载的内容')
    return
  }
  downloadText('formatted.json', formattedJson.value, 'application/json')
}

function clearAll() {
  jsonInput.value = ''
  formattedJson.value = ''
  folded.value = false
  inputEditor.value.focus()
}

// 输入防抖自动格式化
watch(jsonInput, () => {
  clearTimeout(timer)
  timer = setTimeout(() => updateFormatted(), 250)
})

onMounted(() => {
  updateFormatted()
})

onBeforeUnmount(() => {
  clearTimeout(timer)
})
</script>

<style lang="scss" scoped>
/* 折叠按钮箭头：未折叠显示双左箭头（折叠全部），已折叠显示双右箭头（展开全部） */
.fold-icon {
  width: 12px;
  height: 12px;
}
</style>
