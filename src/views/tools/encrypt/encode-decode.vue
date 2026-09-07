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
          <code-editor :value="outputText" mode="text/plain" :fold="false" read-only />
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>就绪</span>
      <span class="status-right">{{ inputText.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'

export default {
  name: 'EncryptUrlCodec',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      inputText: 'https://omnideck.app/search?q=格式化 工具&lang=zh',
      outputText: '',
      errorMsg: ''
    }
  },
  methods: {
    encode() {
      this.errorMsg = ''
      if (!this.inputText) return
      this.outputText = encodeURIComponent(this.inputText)
    },
    decode() {
      this.errorMsg = ''
      if (!this.inputText) return
      try {
        this.outputText = decodeURIComponent(this.inputText)
      } catch (e) {
        this.errorMsg = '解码失败：不是合法的 URL 编码'
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
