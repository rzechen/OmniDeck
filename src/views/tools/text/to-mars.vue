<template>
  <tool-shell
    title="火星文转换"
    desc="简体 ↔ 繁体 ↔ 火星文互转"
    icon="sparkle"
    color="#722ED1"
    back-path="/tools/text"
  >
    <template #toolbar>
      <button class="tool-btn" @click="convert('s2t')">
        简体 → 繁体
      </button>
      <button class="tool-btn" @click="convert('s2m')">
        简体 → 火星文
      </button>
      <button class="tool-btn" @click="convert('t2s')">
        繁体 → 简体
      </button>
      <button class="tool-btn is-primary" :disabled="!output" @click="copyOutput">
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
            v-model="input"
            mode="text/plain"
            :fold="false"
            placeholder="输入简体或繁体中文…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">输出</span>
        </div>
        <div class="pane-body">
          <code-editor :value="output" mode="text/plain" :fold="false" read-only />
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ input.length }} 字符输入</span>
      <span class="status-right">映射表：繁体 3815 字 · 火星文 3805 字</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import { simplifiedToTraditionalMap, simplifiedToMarsMap } from '@/utils/mars-maps'

// 繁→简反向映射（首次惰性构建）
let traditionalToSimplifiedMap = null

export default {
  name: 'TextToMars',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      input: '今天天气真不错，我们一起去公园玩吧',
      output: ''
    }
  },
  methods: {
    convert(direction) {
      if (!this.input) {
        this.$message.warning('请输入内容')
        return
      }
      if (direction === 's2t') {
        this.output = [...this.input].map(c => simplifiedToTraditionalMap[c] || c).join('')
      } else if (direction === 's2m') {
        this.output = [...this.input].map(c => simplifiedToMarsMap[c] || c).join('')
      } else {
        if (!traditionalToSimplifiedMap) {
          traditionalToSimplifiedMap = {}
          Object.entries(simplifiedToTraditionalMap).forEach(([s, t]) => {
            if (!(t in traditionalToSimplifiedMap)) traditionalToSimplifiedMap[t] = s
          })
        }
        this.output = [...this.input].map(c => traditionalToSimplifiedMap[c] || c).join('')
      }
    },
    copyOutput() {
      if (!this.output) return
      navigator.clipboard.writeText(this.output).then(() => {
        this.$message.success('复制成功')
      })
    },
    clearAll() {
      this.input = ''
      this.output = ''
      this.$refs.inputEditor.focus()
    }
  }
}
</script>
