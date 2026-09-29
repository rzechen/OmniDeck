<template>
  <tool-shell
    title="SM4 加解密"
    desc="国密 SM4/ECB/PKCS7，SHA1PRNG 种子派生密钥"
    icon="lock"
    color="#FA8C16"
    back-path="/tools/encrypt"
  >
    <template #toolbar>
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
      <button class="tool-btn" :class="{ 'is-primary': historyVisible }" @click="historyVisible = !historyVisible">
        <i class="el-icon-time"></i>
        历史
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
          <span>SHA1PRNG 种子派生</span>
        </div>
        <div class="key-body">
          <div class="key-field is-grow">
            <span class="key-label">种子</span>
            <input
              v-model="seed"
              class="key-input mono"
              placeholder="密钥种子"
              spellcheck="false"
            />
          </div>
          <div class="key-field">
            <span class="key-label">密钥</span>
            <span class="key-hex mono" :title="derivedKeyHex">{{ derivedKeyHex }}</span>
          </div>
        </div>
      </div>

      <div class="split-pane" style="flex: 1">
        <div class="pane">
          <div class="pane-header">
            <span class="pane-dot is-input"></span>
            <span class="pane-title">输入</span>
            <div class="seg-control" title="批量模式：每行 key=value，仅对等号后的值加解密">
              <button :class="{ 'is-active': mode === 'text' }" @click="mode = 'text'">整段</button>
              <button :class="{ 'is-active': mode === 'batch' }" @click="mode = 'batch'">逐行 k=v</button>
            </div>
          </div>
          <div class="pane-body">
            <code-editor
              ref="inputEditor"
              v-model="inputText"
              mode="text/plain"
              :fold="false"
              :placeholder="inputPlaceholder"
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
      <span v-else>SM4 · ECB · Pkcs7 · {{ mode === 'batch' ? '逐行 k=v' : '整段' }}</span>
      <span class="status-right">{{ inputText.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/tool-history'
import { sm4EcbEncrypt, sm4EcbDecrypt, deriveSm4KeyFromSeed } from '@/utils/sm4'

const TOOL_PATH = '/tools/encrypt/sm4'

// 字节数组 → Hex 字符串
function bytesToHex(bytes) {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

// Hex 字符串 → 字节数组
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16)
  }
  return out
}

// 字节数组 → Base64（分块避免 apply 栈溢出）
function bytesToBase64(bytes) {
  let bin = ''
  const CHUNK = 0x8000
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK))
  }
  return btoa(bin)
}

// Base64 → 字节数组
function base64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

export default {
  name: 'EncryptSm4',
  components: { ToolShell, CodeEditor, ToolHistoryPanel },
  data() {
    return {
      seed: 'risenhzsjds00000', // 默认种子：与 Java demo（risen.解密.utils.SM4EcbUtils）一致
      mode: 'text', // text：整段单一文本；batch：逐行 key=value 仅处理值
      inputText: '',
      outputText: '',
      errorMsg: '',
      historyVisible: false,
      // 模板/实例可访问的工具 path（历史面板与 record 用）
      TOOL_PATH: TOOL_PATH
    }
  },
  computed: {
    // 由种子实时派生的 128 位密钥（Hex 展示便于核对）
    derivedKey() {
      return deriveSm4KeyFromSeed(this.seed)
    },
    derivedKeyHex() {
      return bytesToHex(this.derivedKey)
    },
    inputPlaceholder() {
      return this.mode === 'batch'
        ? '每行 key=value，仅对等号后的值加解密；无等号的行（注释/空行）原样保留…'
        : '加密输入明文；解密输入 Base64 或 Hex 密文…'
    }
  },
  methods: {
    validate() {
      this.errorMsg = ''
      if (!this.inputText) {
        this.errorMsg = '请输入内容'
        return false
      }
      if (!this.seed) {
        this.errorMsg = '请输入密钥种子'
        return false
      }
      return true
    },
    // 单值加密：UTF-8 文本 → Base64
    encryptValue(text) {
      const plain = new TextEncoder().encode(text)
      return bytesToBase64(sm4EcbEncrypt(this.derivedKey, plain))
    },
    // 单值解密：Hex / Base64（自动识别）→ UTF-8 文本
    decryptValue(text) {
      const input = text.replace(/\s+/g, '')
      const isHex = /^[0-9a-fA-F]+$/.test(input) &&
        input.length % 32 === 0 && input.length >= 32
      const cipher = isHex ? hexToBytes(input) : base64ToBytes(input)
      return new TextDecoder().decode(sm4EcbDecrypt(this.derivedKey, cipher))
    },
    // 逐行 key=value 批量处理：仅处理第一个 = 之后的值，返回失败行数
    processLines(isEncrypt) {
      const lines = this.inputText.split(/\r?\n/)
      let fail = 0
      const out = lines.map(line => {
        const eq = line.indexOf('=')
        // 空行 / 注释 / 无等号 / 等号后为空：原样保留
        if (eq < 0) return line
        const head = line.slice(0, eq + 1)
        const val = line.slice(eq + 1).trim()
        if (!val) return line
        try {
          return head + (isEncrypt ? this.encryptValue(val) : this.decryptValue(val))
        } catch (e) {
          fail++
          return line // 失败行原样保留，便于定位
        }
      })
      this.outputText = out.join('\n')
      return fail
    },
    doEncrypt() {
      if (!this.validate()) return
      const before = this.inputText
      try {
        if (this.mode === 'batch') {
          const fail = this.processLines(true)
          if (fail) this.$message.warning(`${fail} 行处理失败，已原样保留`)
        } else {
          this.outputText = this.encryptValue(before)
        }
        record(TOOL_PATH, {
          input: before,
          output: this.outputText,
          options: { action: 'encrypt', mode: this.mode, seed: this.seed }
        })
      } catch (e) {
        this.errorMsg = '加密失败：' + e.message
      }
    },
    doDecrypt() {
      if (!this.validate()) return
      const before = this.inputText
      try {
        if (this.mode === 'batch') {
          const fail = this.processLines(false)
          if (fail) this.$message.warning(`${fail} 行解密失败，已原样保留`)
        } else {
          this.outputText = this.decryptValue(before)
        }
        record(TOOL_PATH, {
          input: before,
          output: this.outputText,
          options: { action: 'decrypt', mode: this.mode, seed: this.seed }
        })
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
    // 从历史恢复：回填输入输出与种子/模式
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      this.inputText = full.input || ''
      this.outputText = full.output || ''
      if (full.options) {
        if (full.options.seed) this.seed = full.options.seed
        if (full.options.mode) this.mode = full.options.mode
      }
      this.errorMsg = ''
      this.$nextTick(() => this.$refs.inputEditor && this.$refs.inputEditor.focus())
      this.$message.success('已从历史恢复')
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
  align-items: center;
  gap: 14px;
  padding: 12px 14px;
}

.key-field {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;

  &.is-grow {
    flex: 1;
  }
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

/* 派生密钥只读展示 */
.key-hex {
  flex-shrink: 0;
  font-size: 12px;
  letter-spacing: 0.3px;
  color: var(--text-secondary);
  padding: 0 2px;
  user-select: all;
}

/* 模式切换（整段 / 逐行 k=v） */
.seg-control {
  margin-left: auto;
  display: inline-flex;
  border: 1px solid var(--border-color);
  border-radius: 7px;
  overflow: hidden;

  button {
    border: none;
    background: transparent;
    padding: 2px 10px;
    font-size: 11px;
    line-height: 18px;
    color: var(--text-secondary);
    cursor: pointer;
    transition: all 0.15s ease;

    &.is-active {
      background: rgba(var(--primary-color-rgb), 0.12);
      color: var(--primary-color);
      font-weight: 600;
    }

    &:not(.is-active):hover {
      color: var(--text-primary);
    }
  }
}
</style>
