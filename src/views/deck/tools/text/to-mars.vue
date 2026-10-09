<template>
  <tool-shell
    title="火星文转换"
    desc="简体 ↔ 繁体 ↔ 火星文互转"
    icon="sparkle"
    color="#722ED1"
    back-path="/tools/text"
  >
    <template #toolbar>
      <button class="tool-btn" @click="convert('s2t')">
        简体 → 繁体
      </button>
      <button class="tool-btn" @click="convert('s2m')">
        简体 → 火星文
      </button>
      <button class="tool-btn" @click="convert('t2s')">
        繁体 → 简体
      </button>
      <button class="tool-btn is-primary" :disabled="!output" @click="copyOutput">
        <svg-icon icon-class="document-copy" />
        复制
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
          <span class="pane-title">输入</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="input"
            mode="text/plain"
            :fold="false"
            placeholder="输入简体或繁体中文…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">输出</span>
        </div>
        <div class="pane-body">
          <code-editor :model-value="output" mode="text/plain" :fold="false" read-only />
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
      <span class="status-dot"></span>
      <span>{{ input.length }} 字符输入</span>
      <span class="status-right">映射表：繁体 3815 字 · 火星文 3805 字</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { simplifiedToTraditionalMap, simplifiedToMarsMap } from '@/utils/data/mars-maps'
import { useFeedback } from '@/composables/useFeedback'

// 繁→简反向映射（首次惰性构建）
let traditionalToSimplifiedMap = null

const TOOL_PATH = '/tools/text/to-mars'

defineOptions({ name: 'TextToMars' })

const { message } = useFeedback()

const input = ref('今天天气真不错，我们一起去公园玩吧')
const output = ref('')
const historyVisible = ref(false)
const inputEditor = ref(null)

function convert(direction) {
  if (!input.value) {
    message.warning('请输入内容')
    return
  }
  if (direction === 's2t') {
    output.value = [...input.value].map(c => simplifiedToTraditionalMap[c] || c).join('')
  } else if (direction === 's2m') {
    output.value = [...input.value].map(c => simplifiedToMarsMap[c] || c).join('')
  } else {
    if (!traditionalToSimplifiedMap) {
      traditionalToSimplifiedMap = {}
      Object.entries(simplifiedToTraditionalMap).forEach(([s, t]) => {
        if (!(t in traditionalToSimplifiedMap)) traditionalToSimplifiedMap[t] = s
      })
    }
    output.value = [...input.value].map(c => traditionalToSimplifiedMap[c] || c).join('')
  }
  record(TOOL_PATH, {
    input: input.value,
    output: output.value,
    options: { action: 'convert', direction: direction }
  })
}

async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
  input.value = full.input || ''
  output.value = full.output || ''
  nextTick(() => {
    inputEditor.value && inputEditor.value.focus()
  })
  message.success('已从历史恢复')
}

function copyOutput() {
  if (!output.value) return
  navigator.clipboard.writeText(output.value).then(() => {
    message.success('复制成功')
  })
}

function clearAll() {
  input.value = ''
  output.value = ''
  inputEditor.value.focus()
}
</script>
