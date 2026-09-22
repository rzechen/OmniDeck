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
        <i class="el-icon-top-right"></i>
        编码
      </button>
      <button class="tool-btn" @click="decode">
        <i class="el-icon-bottom-left"></i>
        解码
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
          <code-editor :value="outputText" mode="text/plain" :fold="false" read-only />
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>{{ baseType === 'base64' ? 'Base64' : 'Base32' }} · UTF-8 中文兼容</span>
      <span class="status-right">{{ inputText.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import Base32 from 'hi-base32'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'

export default {
  name: 'EncryptBase',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      baseType: 'base64',
      inputText: 'Hello OmniDeck 你好，世界',
      outputText: '',
      errorMsg: ''
    }
  },
  methods: {
    encode() {
      this.errorMsg = ''
      if (!this.inputText) return
      if (this.baseType === 'base64') {
        // encodeURIComponent → unescape 兼容中文到 Latin1 范围
        this.outputText = btoa(unescape(encodeURIComponent(this.inputText)))
      } else {
        this.outputText = Base32.encode(new TextEncoder().encode(this.inputText))
      }
    },
    decode() {
      this.errorMsg = ''
      if (!this.inputText) return
      try {
        if (this.baseType === 'base64') {
          this.outputText = decodeURIComponent(escape(atob(this.inputText.trim())))
        } else {
          const bytes = Base32.decode.asBytes(this.inputText.trim())
          this.outputText = new TextDecoder().decode(new Uint8Array(bytes))
        }
      } catch (e) {
        this.errorMsg = `解码失败：不是合法的 ${this.baseType.toUpperCase()} 字符串`
        this.outputText = ''
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
      this.$refs.inputEditor.focus()
    }
  }
}
</script>
