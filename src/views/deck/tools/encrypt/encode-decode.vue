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
      <button class="tool-btn" :class="{ 'is-primary': historyVisible }" @click="historyVisible = !historyVisible">
        <i class="el-icon-time"></i>
        历史
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

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/tool-history'

const TOOL_PATH = '/tools/encrypt/encode-decode'

export default {
  name: 'EncryptUrlCodec',
  components: { ToolShell, CodeEditor, ToolHistoryPanel },
  data() {
    return {
      inputText: 'https://omnideck.app/search?q=格式化 工具&lang=zh',
      outputText: '',
      errorMsg: '',
      historyVisible: false,
      // 模板/实例可访问的工具 path（历史面板与 record 用）
      TOOL_PATH: TOOL_PATH
    }
  },
  methods: {
    encode() {
      this.errorMsg = ''
      if (!this.inputText) return
      const before = this.inputText
      this.outputText = encodeURIComponent(this.inputText)
      record(TOOL_PATH, { input: before, output: this.outputText, options: { action: 'encode' } })
    },
    decode() {
      this.errorMsg = ''
      if (!this.inputText) return
      const before = this.inputText
      try {
        this.outputText = decodeURIComponent(this.inputText)
        record(TOOL_PATH, { input: before, output: this.outputText, options: { action: 'decode' } })
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
        record(TOOL_PATH, {
          input: this.inputText,
          output: this.outputText,
          options: { action: 'copy' }
        })
      })
    },
    // 从历史恢复：回填输入输出
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      this.inputText = full.input || ''
      this.outputText = full.output || ''
      this.errorMsg = ''
      this.$nextTick(() => this.$refs.inputEditor && this.$refs.inputEditor.focus())
      this.$message.success('已从历史恢复')
    },
    clearAll() {
      this.inputText = ''
      this.outputText = ''
      this.$refs.inputEditor.focus()
    }
  }
}
</script>
