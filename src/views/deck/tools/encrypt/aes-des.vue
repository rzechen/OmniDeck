<template>
  <tool-shell
    title="AES / DES 加解密"
    desc="AES、DES、TripleDES 对称加解密（ECB / CBC）"
    icon="lock"
    color="#FA8C16"
    back-path="/tools/encrypt"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          v-for="a in algos"
          :key="a"
          class="tool-seg-item"
          :class="{ active: algorithm === a }"
          @click="algorithm = a"
        >
          {{ a }}
        </div>
      </div>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: mode === 'CBC' }"
          @click="mode = 'CBC'"
        >
          CBC
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: mode === 'ECB' }"
          @click="mode = 'ECB'"
        >
          ECB
        </div>
      </div>
      <button class="tool-btn" @click="doEncrypt">
        <svg-icon icon-class="lock" />
        加密
      </button>
      <button class="tool-btn" @click="doDecrypt">
        <svg-icon icon-class="unlock" />
        解密
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

    <div class="split-pane is-vertical">
      <div class="pane key-pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">密钥配置</span>
          <span>{{ keyHint }}</span>
        </div>
        <div class="key-body">
          <div class="key-field">
            <span class="key-label">密钥</span>
            <input v-model="key" class="key-input mono" :placeholder="`需要 ${keyLength} 位`" spellcheck="false" />
          </div>
          <div v-if="mode === 'CBC'" class="key-field">
            <span class="key-label">IV</span>
            <input v-model="iv" class="key-input mono" :placeholder="`需要 ${keyLength } 位`" spellcheck="false" />
          </div>
        </div>
      </div>

      <div class="split-pane" style="flex: 1">
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
              placeholder="输入明文或密文…"
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
      <span v-else>{{ algorithm }} · {{ mode }} · Pkcs7</span>
      <span class="status-right">{{ inputText.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import CryptoJS from 'crypto-js'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'EncryptAesDes' })

const { message } = useFeedback()

const TOOL_PATH = '/tools/encrypt/aes-des'

const algorithm = ref('AES')
const algos = ['AES', 'DES', 'TripleDES']
const mode = ref('CBC')
const key = ref('')
const iv = ref('')
const inputText = ref('Hello OmniDeck')
const outputText = ref('')
const errorMsg = ref('')
const historyVisible = ref(false)
const inputEditor = ref(null)

// CryptoJS 要求：AES 16/24/32 位，DES 8 位，TripleDES 24 位
const keyLength = computed(() =>
  algorithm.value === 'AES' ? 16 : algorithm.value === 'DES' ? 8 : 24
)
const keyHint = computed(
  () => `${algorithm.value} 密钥固定 ${keyLength.value} 位（超出截断，不足补 0）`
)

// 密钥规范化：不足补 0、超出截断
function normalizeKey(s) {
  return s.length >= keyLength.value
    ? s.slice(0, keyLength.value)
    : s + '0'.repeat(keyLength.value - s.length)
}

function validate() {
  errorMsg.value = ''
  if (!inputText.value) {
    errorMsg.value = '请输入内容'
    return false
  }
  if (!key.value) {
    errorMsg.value = '请输入密钥'
    return false
  }
  if (mode.value === 'CBC' && !iv.value) {
    errorMsg.value = 'CBC 模式需要输入 IV'
    return false
  }
  return true
}

function buildCfg() {
  const cfg = {
    mode: CryptoJS.mode[mode.value],
    padding: CryptoJS.pad.Pkcs7
  }
  if (mode.value === 'CBC') {
    cfg.iv = CryptoJS.enc.Utf8.parse(normalizeKey(iv.value))
  }
  return cfg
}

function doEncrypt() {
  if (!validate()) return
  const before = inputText.value
  try {
    const keyParsed = CryptoJS.enc.Utf8.parse(normalizeKey(key.value))
    const cipher = CryptoJS[algorithm.value].encrypt(before, keyParsed, buildCfg())
    outputText.value = cipher.toString() // Base64
    record(TOOL_PATH, {
      input: before,
      output: outputText.value,
      options: { action: 'encrypt', algorithm: algorithm.value, mode: mode.value, key: key.value, iv: iv.value }
    })
  } catch (e) {
    errorMsg.value = '加密失败：' + e.message
  }
}

function doDecrypt() {
  if (!validate()) return
  const before = inputText.value
  try {
    const keyParsed = CryptoJS.enc.Utf8.parse(normalizeKey(key.value))
    const input = before.trim()
    // 密文支持 Hex 或 Base64
    let ciphertextWA
    if (/^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0 && input.length > 16) {
      ciphertextWA = CryptoJS.enc.Hex.parse(input)
    } else {
      ciphertextWA = CryptoJS.enc.Base64.parse(input)
    }
    const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertextWA })
    const decrypted = CryptoJS[algorithm.value].decrypt(cipherParams, keyParsed, buildCfg())
    const text = decrypted.toString(CryptoJS.enc.Utf8)
    if (!text) throw new Error('解密结果为空，请检查密钥 / IV / 密文格式')
    outputText.value = text
    record(TOOL_PATH, {
      input: before,
      output: outputText.value,
      options: { action: 'decrypt', algorithm: algorithm.value, mode: mode.value, key: key.value, iv: iv.value }
    })
  } catch (e) {
    errorMsg.value = '解密失败：' + (e.message || '密钥错误或密文无效')
  }
}

function copyOutput() {
  if (!outputText.value) {
    message.warning('没有可复制的内容')
    return
  }
  navigator.clipboard.writeText(outputText.value).then(() => {
    message.success('复制成功')
  })
}

// 从历史恢复：回填输入输出与算法/模式/密钥/IV
async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
  inputText.value = full.input || ''
  outputText.value = full.output || ''
  if (full.options) {
    if (full.options.algorithm) algorithm.value = full.options.algorithm
    if (full.options.mode) mode.value = full.options.mode
    if (full.options.key) key.value = full.options.key
    if (full.options.iv) iv.value = full.options.iv
  }
  errorMsg.value = ''
  await nextTick()
  inputEditor.value && inputEditor.value.focus()
  message.success('已从历史恢复')
}

function clearAll() {
  inputText.value = ''
  outputText.value = ''
  errorMsg.value = ''
  inputEditor.value.focus()
}
</script>

<style lang="scss" scoped>
.key-pane {
  flex: 0 0 auto;
}

.key-body {
  display: flex;
  gap: 14px;
  padding: 12px 14px;
}

.key-field {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.key-label {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.key-input {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  background: var(--search-bg);
  font-size: 12px;
  color: var(--text-primary);
  transition: all 0.16s ease;

  &:focus {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    background: var(--card-bg);
  }

  &::placeholder {
    color: var(--text-secondary);
  }
}
</style>
