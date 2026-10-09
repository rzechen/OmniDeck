<template>
  <tool-shell
    title="URL 编解码"
    desc="encodeURIComponent / decodeURIComponent"
    icon="link"
    color="#FA8C16"
    back-path="/tools/encrypt"
  >
    <template #toolbar>
      <button class="tool-btn" @click="encode">
        <svg-icon icon-class="top-right" />
        编码
      </button>
      <button class="tool-btn" @click="decode">
        <svg-icon icon-class="bottom-left" />
        解码
      </button>
      <button class="tool-btn is-primary" @click="copyOutput">
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
            v-model="inputText"
            mode="text/plain"
            :fold="false"
            placeholder="输入待编码/解码的文本…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">输出</span>
        </div>
        <div class="pane-body">
          <code-editor :model-value="outputText" mode="text/plain" :fold="false" read-only />
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
      <span v-else>就绪</span>
      <span class="status-right">{{ inputText.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'EncryptUrlCodec' })

const { message } = useFeedback()

const TOOL_PATH = '/tools/encrypt/encode-decode'

const inputText = ref('https://omnideck.app/search?q=格式化 工具&lang=zh')
const outputText = ref('')
const errorMsg = ref('')
const historyVisible = ref(false)
const inputEditor = ref(null)

function encode() {
  errorMsg.value = ''
  if (!inputText.value) return
  const before = inputText.value
  outputText.value = encodeURIComponent(inputText.value)
  record(TOOL_PATH, { input: before, output: outputText.value, options: { action: 'encode' } })
}

function decode() {
  errorMsg.value = ''
  if (!inputText.value) return
  const before = inputText.value
  try {
    outputText.value = decodeURIComponent(inputText.value)
    record(TOOL_PATH, { input: before, output: outputText.value, options: { action: 'decode' } })
  } catch (e) {
    errorMsg.value = '解码失败：不是合法的 URL 编码'
    outputText.value = ''
  }
}

function copyOutput() {
  if (!outputText.value) {
    message.warning('没有可复制的内容')
    return
  }
  navigator.clipboard.writeText(outputText.value).then(() => {
    message.success('复制成功')
    record(TOOL_PATH, {
      input: inputText.value,
      output: outputText.value,
      options: { action: 'copy' }
    })
  })
}

// 从历史恢复：回填输入输出
async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
  inputText.value = full.input || ''
  outputText.value = full.output || ''
  errorMsg.value = ''
  await nextTick()
  inputEditor.value && inputEditor.value.focus()
  message.success('已从历史恢复')
}

function clearAll() {
  inputText.value = ''
  outputText.value = ''
  inputEditor.value.focus()
}
</script>
