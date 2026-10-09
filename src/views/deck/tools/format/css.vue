<template>
  <tool-shell
    title="CSS 格式化"
    desc="CSS 代码自动美化与压缩"
    icon="palette"
    color="#3366FF"
    back-path="/tools/format"
  >
    <template #toolbar>
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
          <span class="pane-title">输入 CSS</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="rawInput"
            mode="css"
            placeholder="输入 CSS 样式代码…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">输出结果</span>
        </div>
        <div class="pane-body">
          <code-editor :model-value="formattedOutput" mode="css" read-only />
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
        <span>已处理 · {{ ruleCount }} 条规则</span>
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
import { css as beautifyCss } from 'js-beautify'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { downloadText } from '@/utils/ui/download'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'FormatCss' })

const { message } = useFeedback()

const TOOL_PATH = '/tools/format/css'

const EXAMPLE = `.card{display:flex;align-items:center;gap:10px;padding:12px 16px;border-radius:12px;background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.06)}.card:hover{transform:translateY(-2px);transition:all .2s ease}`

const rawInput = ref(EXAMPLE)
const formattedOutput = ref('')
const historyVisible = ref(false)
const inputEditor = ref(null)

// 防抖定时器 / 手动格式化标记（非响应式）
let timer = null
let manual = false

const lineCount = computed(() => (rawInput.value ? rawInput.value.split('\n').length : 0))
const ruleCount = computed(() => {
  const m = rawInput.value.match(/\{/g)
  return m ? m.length : 0
})

function formatContent() {
  if (!rawInput.value.trim()) {
    formattedOutput.value = ''
    return
  }
  try {
    formattedOutput.value = beautifyCss(rawInput.value, { indent_size: 2 })
    // 仅按钮触发记录（防抖自动格式化不记录）
    if (manual) {
      manual = false
      record(TOOL_PATH, {
        input: rawInput.value,
        output: formattedOutput.value,
        options: { action: 'format' }
      })
    }
  } catch (e) {
    message.error('格式化失败：' + e.message)
  }
}

function minifyContent() {
  if (!rawInput.value.trim()) return
  // 去注释 → 合并空白 → 压缩花括号/分号/冒号周围空格
  formattedOutput.value = rawInput.value
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\{\s*/g, '{')
    .replace(/\s*\}\s*/g, '}')
    .replace(/\s*;\s*/g, ';')
    .replace(/\s*:\s*/g, ':')
    .replace(/;\}/g, '}')
    .replace(/\s*,\s*/g, ',')
    .trim()
  record(TOOL_PATH, {
    input: rawInput.value,
    output: formattedOutput.value,
    options: { action: 'minify' }
  })
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
      options: { action: 'copy' }
    })
  })
}

// 手动点击「格式化」按钮（区别于防抖自动触发）
function onFormatClick() {
  manual = true
  formatContent()
}

// 从历史恢复：回填输入并触发格式化
async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
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
  downloadText('export.css', formattedOutput.value, 'text/css;charset=utf-8')
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
