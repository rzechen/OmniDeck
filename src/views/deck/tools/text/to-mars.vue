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
          <code-editor :model-value="output" mode="text/plain" :fold="false" read-only />
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
      <span class="status-dot"></span>
      <span>{{ input.length }} 字符输入</span>
      <span class="status-right">映射表：繁体 3815 字 · 火星文 3805 字</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/tool-history'
import { simplifiedToTraditionalMap, simplifiedToMarsMap } from '@/utils/mars-maps'

// 繁→简反向映射（首次惰性构建）
let traditionalToSimplifiedMap = null

const TOOL_PATH = '/tools/text/to-mars'

export default {
  name: 'TextToMars',
  components: { ToolShell, CodeEditor, ToolHistoryPanel },
  data() {
    return {
      input: '今天天气真不错，我们一起去公园玩吧',
      output: '',
      historyVisible: false,
      TOOL_PATH: TOOL_PATH
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
      record(TOOL_PATH, {
        input: this.input,
        output: this.output,
        options: { action: 'convert', direction: direction }
      })
    },
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      this.input = full.input || ''
      this.output = full.output || ''
      this.$nextTick(() => {
        this.$refs.inputEditor && this.$refs.inputEditor.focus()
      })
      this.$message.success('已从历史恢复')
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
