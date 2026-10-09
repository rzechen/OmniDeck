<template>
  <tool-shell
    title="YAML 格式化"
    desc="YAML 与 XML 的美化、压缩与语法校验"
    icon="doc"
    color="#3366FF"
    back-path="/tools/format"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: formatType === 'yaml' }"
          @click="setType('yaml')"
        >
          YAML
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: formatType === 'xml' }"
          @click="setType('xml')"
        >
          XML
        </div>
      </div>
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
          <span class="pane-title">输入 {{ formatType.toUpperCase() }}</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="rawInput"
            :mode="formatType === 'yaml' ? 'yaml' : 'xml'"
            :placeholder="formatType === 'yaml' ? '输入 YAML 内容…' : '输入 XML 内容…'"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">输出结果</span>
        </div>
        <div class="pane-body">
          <code-editor
            :model-value="formattedOutput"
            :mode="formatType === 'yaml' ? 'yaml' : 'xml'"
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
      <template v-if="rawInput.trim()">
        <span class="status-dot" :class="{ 'is-bad': !valid }"></span>
        <span v-if="valid">{{ formatType.toUpperCase() }} 语法有效</span>
        <span v-else class="status-err" :title="errMsg">{{ errBrief }}</span>
      </template>
      <template v-else>
        <span>等待输入</span>
      </template>
      <span class="status-right">{{ lineCount }} 行 · {{ rawInput.length }} 字符</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import yaml from 'js-yaml'
import { html as beautifyHtml } from 'js-beautify'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { downloadText } from '@/utils/ui/download'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'FormatYaml' })

const { message } = useFeedback()

const TOOL_PATH = '/tools/format/yaml'

const YAML_EXAMPLE = `server:
  port: 8080
  host: 0.0.0.0
database:
  url: mysql://localhost:3306/omnideck
  pool: { min: 2, max: 10 }`

const XML_EXAMPLE = `<?xml version="1.0" encoding="UTF-8"?>
<config><server port="8080" host="0.0.0.0"/><database url="mysql://localhost:3306/omnideck"><pool min="2" max="10"/></database></config>`

// XML 校验：DOMParser 解析无 parsererror 即有效
function validateXml(str) {
  const doc = new DOMParser().parseFromString(str, 'application/xml')
  return !doc.querySelector('parsererror')
}

const formatType = ref('yaml')
const rawInput = ref(YAML_EXAMPLE)
const formattedOutput = ref('')
const valid = ref(true)
const errMsg = ref('')
const historyVisible = ref(false)
const inputEditor = ref(null)

// 防抖定时器 / 手动格式化标记（非响应式）
let timer = null
let manual = false

const lineCount = computed(() => (rawInput.value ? rawInput.value.split('\n').length : 0))
const errBrief = computed(() =>
  errMsg.value.length > 80 ? errMsg.value.slice(0, 80) + '…' : errMsg.value
)

function setType(t) {
  if (formatType.value === t) return
  formatType.value = t
  // 切换格式：内容为空或仍为内置示例时替换为对应示例
  if (!rawInput.value.trim()) {
    rawInput.value = t === 'yaml' ? YAML_EXAMPLE : XML_EXAMPLE
  }
  formatContent()
}

function formatContent() {
  if (!rawInput.value.trim()) {
    formattedOutput.value = ''
    valid.value = true
    errMsg.value = ''
    return
  }
  try {
    if (formatType.value === 'yaml') {
      const parsed = yaml.load(rawInput.value)
      formattedOutput.value = yaml.dump(parsed, { indent: 2, lineWidth: 120 })
      valid.value = true
      errMsg.value = ''
    } else {
      if (!validateXml(rawInput.value)) {
        throw new Error('XML 语法错误，标签未闭合或格式不正确')
      }
      formattedOutput.value = beautifyHtml(rawInput.value, {
        indent_size: 2,
        preserve_newlines: false,
        wrap_line_length: 0,
        end_with_newline: false
      })
      valid.value = true
      errMsg.value = ''
    }
    // 仅按钮触发记录（防抖自动格式化与切换类型不记录）
    if (manual) {
      manual = false
      record(TOOL_PATH, {
        input: rawInput.value,
        output: formattedOutput.value,
        options: { action: 'format', type: formatType.value }
      })
    }
  } catch (e) {
    valid.value = false
    errMsg.value = e.message
    formattedOutput.value = rawInput.value
  }
}

function minifyContent() {
  if (!rawInput.value.trim()) return
  try {
    if (formatType.value === 'yaml') {
      const parsed = yaml.load(rawInput.value)
      formattedOutput.value = yaml.dump(parsed, { indent: 0, flowLevel: 0, lineWidth: -1 })
      valid.value = true
    } else {
      if (!validateXml(rawInput.value)) {
        throw new Error('XML 语法错误')
      }
      formattedOutput.value = rawInput.value
        .replace(/>\s+</g, '><')
        .replace(/\s{2,}/g, ' ')
        .trim()
      valid.value = true
    }
    errMsg.value = ''
    record(TOOL_PATH, {
      input: rawInput.value,
      output: formattedOutput.value,
      options: { action: 'minify', type: formatType.value }
    })
  } catch (e) {
    valid.value = false
    errMsg.value = e.message
    message.error('压缩失败：' + e.message)
  }
}

function copyOutput() {
  if (!formattedOutput.value.trim()) {
    message.warning('没有可复制的内容')
    return
  }
  navigator.clipboard.writeText(formattedOutput.value).then(() => {
    message.success('复制成功')
    record(TOOL_PATH, {
      input: rawInput.value,
      output: formattedOutput.value,
      options: { action: 'copy', type: formatType.value }
    })
  })
}

// 手动点击「格式化」按钮（区别于防抖自动触发）
function onFormatClick() {
  manual = true
  formatContent()
}

// 从历史恢复：回填输入（含格式类型）并触发格式化
async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
  if (full.options && full.options.type) formatType.value = full.options.type
  rawInput.value = full.input || ''
  await nextTick()
  formatContent()
  inputEditor.value && inputEditor.value.focus()
  message.success('已从历史恢复')
}

function exportOutput() {
  if (!formattedOutput.value.trim()) {
    message.warning('没有可下载的内容')
    return
  }
  downloadText(`export.${formatType.value}`, formattedOutput.value)
}

function clearAll() {
  rawInput.value = ''
  formattedOutput.value = ''
  inputEditor.value.focus()
}

watch(rawInput, () => {
  clearTimeout(timer)
  timer = setTimeout(() => formatContent(), 250)
})

onMounted(() => {
  formatContent()
})

onBeforeUnmount(() => {
  clearTimeout(timer)
})
</script>
