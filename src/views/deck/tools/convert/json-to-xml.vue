<template>
  <tool-shell
    title="JSON ⇄ XML"
    desc="JSON 与 XML 双向互转"
    icon="xml"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: direction === 'j2x' }"
          @click="direction = 'j2x'"
        >
          JSON → XML
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: direction === 'x2j' }"
          @click="direction = 'x2j'"
        >
          XML → JSON
        </div>
      </div>
      <input v-model="rootName" class="root-name-input" placeholder="根节点名" spellcheck="false" />
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
          <span class="pane-title">{{ direction === 'j2x' ? '输入 JSON' : '输入 XML' }}</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="rawInput"
            :mode="direction === 'j2x' ? 'application/json' : 'xml'"
            :placeholder="direction === 'j2x' ? '输入 JSON…' : '输入 XML…'"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">{{ direction === 'j2x' ? 'XML 输出' : 'JSON 输出' }}</span>
        </div>
        <div class="pane-body">
          <code-editor :model-value="output" :mode="direction === 'j2x' ? 'xml' : 'application/json'" read-only />
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
      <span v-else>语法有效</span>
      <span class="status-right">{{ rawInput.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { html as beautifyHtml } from 'js-beautify'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { downloadText } from '@/utils/ui/download'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'ConvertJsonXml' })

const { message } = useFeedback()

const TOOL_PATH = '/tools/convert/json-to-xml'

const JSON_EXAMPLE = `{
  "name": "OmniDeck",
  "version": "1.0.0",
  "openSource": true,
  "features": ["格式化", "转换", "加密"],
  "author": { "name": "ranze", "city": "Shanghai" }
}`

const XML_EXAMPLE = `<root>
  <name>OmniDeck</name>
  <version>1.0.0</version>
  <openSource>true</openSource>
  <features>格式化</features>
  <features>转换</features>
  <features>加密</features>
  <author>
    <name>ranze</name>
    <city>Shanghai</city>
  </author>
</root>`

// XML 标签名合法字符校验
function validTag(name) {
  return /^[A-Za-z_][\w.-]*$/.test(name)
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

const direction = ref('j2x')
const rawInput = ref(JSON_EXAMPLE)
const rootName = ref('root')
const output = ref('')
const errorMsg = ref('')
const historyVisible = ref(false)
const inputEditor = ref(null)

// 防抖定时器（非响应式）
let timer = null

function convert() {
  errorMsg.value = ''
  output.value = ''
  if (!rawInput.value.trim()) return
  try {
    if (direction.value === 'j2x') {
      const obj = JSON.parse(rawInput.value)
      if (typeof obj !== 'object' || obj === null) {
        throw new Error('请输入 JSON 对象或数组')
      }
      const root = (rootName.value.trim() || 'root')
      if (!validTag(root)) throw new Error(`根节点名「${root}」不是合法的 XML 标签名`)
      output.value = beautifyHtml(jsonToXml(obj, root, 0), {
        indent_size: 2,
        preserve_newlines: false,
        wrap_line_length: 0
      })
    } else {
      const doc = new DOMParser().parseFromString(rawInput.value, 'application/xml')
      if (doc.querySelector('parsererror')) {
        throw new Error('XML 语法错误：' + doc.querySelector('parsererror').textContent.slice(0, 80))
      }
      output.value = JSON.stringify(xmlToJson(doc.documentElement), null, 2)
    }
  } catch (e) {
    errorMsg.value = e.message
  }
}

// JSON → XML：数组同标签重复、嵌套对象递归
function jsonToXml(value, tag, indent) {
  if (Array.isArray(value)) {
    return value.map(v => jsonToXml(v, tag, indent)).join('\n')
  }
  const pad = ' '.repeat(indent)
  if (typeof value === 'object' && value !== null) {
    const inner = Object.entries(value)
      .map(([k, v]) => {
        if (!validTag(k)) throw new Error(`字段名「${k}」不能作为 XML 标签，请修改字段名`)
        return jsonToXml(v, k, indent + 2)
      })
      .join('\n')
    return `${pad}<${tag}>\n${inner}\n${pad}</${tag}>`
  }
  return `${pad}<${tag}>${escapeXml(value)}</${tag}>`
}

// XML → JSON：同名兄弟标签合并为数组；文本节点转 number/boolean
function xmlToJson(el) {
  const children = [...el.children]
  if (!children.length) {
    const text = (el.textContent || '').trim()
    if (text === '') return null
    if (text === 'true') return true
    if (text === 'false') return false
    if (!isNaN(Number(text))) return Number(text)
    return text
  }
  const obj = {}
  children.forEach(c => {
    const v = xmlToJson(c)
    if (obj[c.tagName] === undefined) {
      obj[c.tagName] = v
    } else if (Array.isArray(obj[c.tagName])) {
      obj[c.tagName].push(v)
    } else {
      obj[c.tagName] = [obj[c.tagName], v]
    }
  })
  return obj
}

function copyOutput() {
  if (!output.value) {
    message.warning('没有可复制的内容')
    return
  }
  navigator.clipboard.writeText(output.value).then(() => {
    message.success('复制成功')
    // 仅按钮触发记录（防抖自动转换不记录）
    record(TOOL_PATH, {
      input: rawInput.value,
      output: output.value,
      options: { action: 'copy', direction: direction.value, rootName: rootName.value }
    })
  })
}

function downloadOutput() {
  if (!output.value) {
    message.warning('没有可下载的内容')
    return
  }
  downloadText(direction.value === 'j2x' ? 'export.xml' : 'export.json', output.value)
  record(TOOL_PATH, {
    input: rawInput.value,
    output: output.value,
    options: { action: 'download', direction: direction.value, rootName: rootName.value }
  })
}

// 从历史恢复：回填输入（含方向与根节点名）并触发转换
async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
  if (full.options && full.options.direction) direction.value = full.options.direction
  if (full.options && full.options.rootName) rootName.value = full.options.rootName
  rawInput.value = full.input || ''
  await nextTick()
  convert()
  inputEditor.value && inputEditor.value.focus()
  message.success('已从历史恢复')
}

function clearAll() {
  rawInput.value = ''
  output.value = ''
  inputEditor.value.focus()
}

watch(rawInput, () => {
  clearTimeout(timer)
  timer = setTimeout(() => convert(), 250)
})
watch(direction, () => {
  if (output.value && !errorMsg.value) {
    rawInput.value = output.value
  } else {
    rawInput.value = direction.value === 'j2x' ? JSON_EXAMPLE : XML_EXAMPLE
  }
  convert()
})
watch(rootName, () => {
  if (direction.value === 'j2x') convert()
})

onMounted(() => {
  convert()
})

onBeforeUnmount(() => {
  clearTimeout(timer)
})
</script>

<style lang="scss" scoped>
.root-name-input {
  width: 110px;
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
