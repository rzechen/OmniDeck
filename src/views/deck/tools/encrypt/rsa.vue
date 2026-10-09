<template>
  <tool-shell
    title="RSA 加解密"
    desc="公钥加密、私钥解密、在线生成密钥对"
    icon="shield"
    color="#FA8C16"
    back-path="/tools/encrypt"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div
          class="tool-seg-item"
          :class="{ active: action === 'encrypt' }"
          @click="action = 'encrypt'"
        >
          加密
        </div>
        <div
          class="tool-seg-item"
          :class="{ active: action === 'decrypt' }"
          @click="action = 'decrypt'"
        >
          解密
        </div>
      </div>
      <button class="tool-btn" :disabled="generating" @click="generateKeyPair">
        <svg-icon :icon-class="(generating ? 'loading' : 'magic-stick')" />
        {{ generating ? '生成中…' : '生成密钥对' }}
      </button>
      <button class="tool-btn" @click="run">
        <svg-icon icon-class="video-play" />
        执行
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
      <div class="rsa-keys">
        <div class="key-box">
          <div class="key-box-title">
            公钥（加密用）
            <button class="key-copy" title="复制公钥" @click="copyKey('public')">
              <svg-icon icon-class="document-copy" />
            </button>
          </div>
          <textarea
            v-model="publicKey"
            class="key-textarea mono"
            placeholder="-----BEGIN PUBLIC KEY-----"
            spellcheck="false"
          ></textarea>
        </div>
        <div class="key-box">
          <div class="key-box-title">
            私钥（解密用）
            <button class="key-copy" title="复制私钥" @click="copyKey('private')">
              <svg-icon icon-class="document-copy" />
            </button>
          </div>
          <textarea
            v-model="privateKey"
            class="key-textarea mono"
            placeholder="-----BEGIN RSA PRIVATE KEY-----"
            spellcheck="false"
          ></textarea>
        </div>
      </div>

      <div class="split-pane" style="flex: 1">
        <div class="pane">
          <div class="pane-header">
            <span class="pane-dot is-input"></span>
            <span class="pane-title">{{ action === 'encrypt' ? '明文' : '密文' }}</span>
          </div>
          <div class="pane-body">
            <code-editor
              ref="inputEditor"
              v-model="inputText"
              mode="text/plain"
              :fold="false"
              :placeholder="action === 'encrypt' ? '输入明文（长度受密钥位数限制）…' : '输入 Base64 密文…'"
            />
          </div>
        </div>
        <div class="pane">
          <div class="pane-header">
            <span class="pane-dot is-output"></span>
            <span class="pane-title">{{ action === 'encrypt' ? '密文' : '明文' }}</span>
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
      <span v-else>{{ action === 'encrypt' ? '公钥加密' : '私钥解密' }} · 2048 位</span>
      <span class="status-right">{{ inputText.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import { JSEncrypt } from 'jsencrypt'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'EncryptRsa' })

const { message } = useFeedback()

const TOOL_PATH = '/tools/encrypt/rsa'

const action = ref('encrypt')
const publicKey = ref('')
const privateKey = ref('')
const inputText = ref('Hello OmniDeck')
const outputText = ref('')
const generating = ref(false)
const errorMsg = ref('')
const historyVisible = ref(false)
const inputEditor = ref(null)

function run() {
  errorMsg.value = ''
  if (!inputText.value) {
    errorMsg.value = '请输入内容'
    return
  }
  const enc = new JSEncrypt()
  try {
    if (action.value === 'encrypt') {
      if (!publicKey.value.trim()) {
        errorMsg.value = '请输入公钥（或先生成密钥对）'
        return
      }
      enc.setPublicKey(publicKey.value.trim())
      const r = enc.encrypt(inputText.value)
      if (!r) throw new Error('加密失败：明文过长或公钥格式错误')
      outputText.value = r
    } else {
      if (!privateKey.value.trim()) {
        errorMsg.value = '请输入私钥（或先生成密钥对）'
        return
      }
      enc.setPrivateKey(privateKey.value.trim())
      const r = enc.decrypt(inputText.value.trim())
      if (!r) throw new Error('解密失败：私钥或密文错误')
      outputText.value = r
    }
    // 仅记录加解密动作，不存储公私钥（敏感信息红线）
    record(TOOL_PATH, {
      input: inputText.value,
      output: outputText.value,
      options: { action: action.value, bits: 2048 }
    })
  } catch (e) {
    errorMsg.value = e.message
    outputText.value = ''
  }
}

async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
  if (full.options && full.options.action) action.value = full.options.action
  inputText.value = full.input || ''
  outputText.value = full.output || ''
  await nextTick()
  inputEditor.value && inputEditor.value.focus()
  message.success('已从历史恢复（密钥不存储，需重新填入）')
}

// node-forge 动态导入：仅在生成时加载
async function generateKeyPair() {
  generating.value = true
  try {
    const forge = await import('node-forge')
    const { pki } = forge
    const pair = await new Promise(resolve => {
      setTimeout(() => resolve(pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })), 50)
    })
    privateKey.value = pki.privateKeyToPem(pair.privateKey)
    publicKey.value = pki.publicKeyToPem(pair.publicKey)
    message.success('已生成 2048 位密钥对')
  } catch (e) {
    message.error('密钥生成失败：' + e.message)
  } finally {
    generating.value = false
  }
}

function copyKey(kind) {
  const t = kind === 'public' ? publicKey.value : privateKey.value
  if (!t.trim()) return
  navigator.clipboard.writeText(t).then(() => {
    message.success(kind === 'public' ? '公钥已复制' : '私钥已复制')
  })
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

function clearAll() {
  inputText.value = ''
  outputText.value = ''
  errorMsg.value = ''
  inputEditor.value.focus()
}
</script>

<style lang="scss" scoped>
.rsa-keys {
  flex: 0 0 auto;
  display: flex;
  gap: 10px;
}

.key-box {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.key-box-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
}

.key-copy {
  border: none;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  padding: 2px;

  &:hover {
    color: var(--primary-color);
  }
}

.key-textarea {
  flex: 1;
  height: 84px;
  padding: 8px 12px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-primary);

  &::placeholder {
    color: var(--text-secondary);
  }
}
</style>
