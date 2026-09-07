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
        <i :class="generating ? 'el-icon-loading' : 'el-icon-magic-stick'"></i>
        {{ generating ? '生成中…' : '生成密钥对' }}
      </button>
      <button class="tool-btn" @click="run">
        <i class="el-icon-video-play"></i>
        执行
      </button>
      <button class="tool-btn is-primary" @click="copyOutput">
        <i class="el-icon-document-copy"></i>
        复制
      </button>
      <button class="tool-btn is-danger" @click="clearAll">
        <i class="el-icon-delete"></i>
        清空
      </button>
    </template>

    <div class="split-pane is-vertical">
      <div class="rsa-keys">
        <div class="key-box">
          <div class="key-box-title">
            公钥（加密用）
            <button class="key-copy" title="复制公钥" @click="copyKey('public')">
              <i class="el-icon-document-copy"></i>
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
              <i class="el-icon-document-copy"></i>
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
            <code-editor :value="outputText" mode="text/plain" :fold="false" read-only />
          </div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>{{ action === 'encrypt' ? '公钥加密' : '私钥解密' }} · 2048 位</span>
      <span class="status-right">{{ inputText.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import { JSEncrypt } from 'jsencrypt'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'

export default {
  name: 'EncryptRsa',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      action: 'encrypt',
      publicKey: '',
      privateKey: '',
      inputText: 'Hello OmniDeck',
      outputText: '',
      generating: false,
      errorMsg: ''
    }
  },
  methods: {
    run() {
      this.errorMsg = ''
      if (!this.inputText) {
        this.errorMsg = '请输入内容'
        return
      }
      const enc = new JSEncrypt()
      try {
        if (this.action === 'encrypt') {
          if (!this.publicKey.trim()) {
            this.errorMsg = '请输入公钥（或先生成密钥对）'
            return
          }
          enc.setPublicKey(this.publicKey.trim())
          const r = enc.encrypt(this.inputText)
          if (!r) throw new Error('加密失败：明文过长或公钥格式错误')
          this.outputText = r
        } else {
          if (!this.privateKey.trim()) {
            this.errorMsg = '请输入私钥（或先生成密钥对）'
            return
          }
          enc.setPrivateKey(this.privateKey.trim())
          const r = enc.decrypt(this.inputText.trim())
          if (!r) throw new Error('解密失败：私钥或密文错误')
          this.outputText = r
        }
      } catch (e) {
        this.errorMsg = e.message
        this.outputText = ''
      }
    },
    // node-forge 动态导入：仅在生成时加载
    async generateKeyPair() {
      this.generating = true
      try {
        const forge = await import('node-forge')
        const { pki } = forge
        const pair = await new Promise(resolve => {
          setTimeout(() => resolve(pki.rsa.generateKeyPair({ bits: 2048, e: 0x10001 })), 50)
        })
        this.privateKey = pki.privateKeyToPem(pair.privateKey)
        this.publicKey = pki.publicKeyToPem(pair.publicKey)
        this.$message.success('已生成 2048 位密钥对')
      } catch (e) {
        this.$message.error('密钥生成失败：' + e.message)
      } finally {
        this.generating = false
      }
    },
    copyKey(kind) {
      const t = kind === 'public' ? this.publicKey : this.privateKey
      if (!t.trim()) return
      navigator.clipboard.writeText(t).then(() => {
        this.$message.success(kind === 'public' ? '公钥已复制' : '私钥已复制')
      })
    },
    copyOutput() {
      if (!this.outputText) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(this.outputText).then(() => {
        this.$message.success('复制成功')
      })
    },
    clearAll() {
      this.inputText = ''
      this.outputText = ''
      this.errorMsg = ''
      this.$refs.inputEditor.focus()
    }
  }
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
