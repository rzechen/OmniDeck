<template>
  <tool-shell
    title="Base 编解码"
    desc="Base64 / Base32 编码与解码（中文兼容）"
    icon="arrows"
    color="#FA8C16"
    back-path="/tools/encrypt"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: baseType === 'base64' }"
          @click="baseType = 'base64'"
        >
          Base64
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: baseType === 'base32' }"
          @click="baseType = 'base32'"
        >
          Base32
        </div>
      </div>
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
            :placeholder="baseType === 'base64' ? '输入文本或 Base64…' : '输入文本或 Base32…'"
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
      <span v-else>{{ baseType === 'base64' ? 'Base64' : 'Base32' }} · UTF-8 中文兼容</span>
      <span class="status-right">{{ inputText.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import Base32 from 'hi-base32'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'EncryptBase' })

const { message } = useFeedback()

const TOOL_PATH = '/tools/encrypt/base'

const baseType = ref('base64')
const inputText = ref('Hello OmniDeck 你好，世界')
const outputText = ref('')
const errorMsg = ref('')
const historyVisible = ref(false)
const inputEditor = ref(null)

function encode() {
  errorMsg.value = ''
  if (!inputText.value) return
  const before = inputText.value
  if (baseType.value === 'base64') {
    // encodeURIComponent → unescape 兼容中文到 Latin1 范围
    outputText.value = btoa(unescape(encodeURIComponent(inputText.value)))
  } else {
    outputText.value = Base32.encode(new TextEncoder().encode(inputText.value))
  }
  record(TOOL_PATH, {
    input: before,
    output: outputText.value,
    options: { action: 'encode', base: baseType.value }
  })
}

function decode() {
  errorMsg.value = ''
  if (!inputText.value) return
  const before = inputText.value
  try {
    if (baseType.value === 'base64') {
      outputText.value = decodeURIComponent(escape(atob(inputText.value.trim())))
    } else {
      const bytes = Base32.decode.asBytes(inputText.value.trim())
      outputText.value = new TextDecoder().decode(new Uint8Array(bytes))
    }
    record(TOOL_PATH, {
      input: before,
      output: outputText.value,
      options: { action: 'decode', base: baseType.value }
    })
  } catch (e) {
    errorMsg.value = `解码失败：不是合法的 ${baseType.value.toUpperCase()} 字符串`
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
      options: { action: 'copy', base: baseType.value }
    })
  })
}

// 从历史恢复：回填输入（含编码类型）
async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
  if (full.options && full.options.base) baseType.value = full.options.base
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
