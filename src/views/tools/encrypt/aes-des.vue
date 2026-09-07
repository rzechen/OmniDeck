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
        <i class="el-icon-lock"></i>
        加密
      </button>
      <button class="tool-btn" @click="doDecrypt">
        <i class="el-icon-unlock"></i>
        解密
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
            <code-editor :value="outputText" mode="text/plain" :fold="false" read-only />
          </div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>{{ algorithm }} · {{ mode }} · Pkcs7</span>
      <span class="status-right">{{ inputText.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import CryptoJS from 'crypto-js'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'

export default {
  name: 'EncryptAesDes',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      algorithm: 'AES',
      algos: ['AES', 'DES', 'TripleDES'],
      mode: 'CBC',
      key: '',
      iv: '',
      inputText: 'Hello OmniDeck',
      outputText: '',
      errorMsg: ''
    }
  },
  computed: {
    keyLength() {
      // CryptoJS 要求：AES 16/24/32 位，DES 8 位，TripleDES 24 位
      return this.algorithm === 'AES' ? 16 : this.algorithm === 'DES' ? 8 : 24
    },
    keyHint() {
      return `${this.algorithm} 密钥固定 ${this.keyLength} 位（超出截断，不足补 0）`
    }
  },
  methods: {
    // 密钥规范化：不足补 0、超出截断
    normalizeKey(s) {
      return s.length >= this.keyLength
        ? s.slice(0, this.keyLength)
        : s + '0'.repeat(this.keyLength - s.length)
    },
    validate() {
      this.errorMsg = ''
      if (!this.inputText) {
        this.errorMsg = '请输入内容'
        return false
      }
      if (!this.key) {
        this.errorMsg = '请输入密钥'
        return false
      }
      if (this.mode === 'CBC' && !this.iv) {
        this.errorMsg = 'CBC 模式需要输入 IV'
        return false
      }
      return true
    },
    buildCfg() {
      const cfg = {
        mode: CryptoJS.mode[this.mode],
        padding: CryptoJS.pad.Pkcs7
      }
      if (this.mode === 'CBC') {
        cfg.iv = CryptoJS.enc.Utf8.parse(this.normalizeKey(this.iv))
      }
      return cfg
    },
    doEncrypt() {
      if (!this.validate()) return
      try {
        const key = CryptoJS.enc.Utf8.parse(this.normalizeKey(this.key))
        const cipher = CryptoJS[this.algorithm].encrypt(this.inputText, key, this.buildCfg())
        this.outputText = cipher.toString() // Base64
      } catch (e) {
        this.errorMsg = '加密失败：' + e.message
      }
    },
    doDecrypt() {
      if (!this.validate()) return
      try {
        const key = CryptoJS.enc.Utf8.parse(this.normalizeKey(this.key))
        const input = this.inputText.trim()
        // 密文支持 Hex 或 Base64
        let ciphertextWA
        if (/^[0-9a-fA-F]+$/.test(input) && input.length % 2 === 0 && input.length > 16) {
          ciphertextWA = CryptoJS.enc.Hex.parse(input)
        } else {
          ciphertextWA = CryptoJS.enc.Base64.parse(input)
        }
        const cipherParams = CryptoJS.lib.CipherParams.create({ ciphertext: ciphertextWA })
        const decrypted = CryptoJS[this.algorithm].decrypt(cipherParams, key, this.buildCfg())
        const text = decrypted.toString(CryptoJS.enc.Utf8)
        if (!text) throw new Error('解密结果为空，请检查密钥 / IV / 密文格式')
        this.outputText = text
      } catch (e) {
        this.errorMsg = '解密失败：' + (e.message || '密钥错误或密文无效')
      }
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
