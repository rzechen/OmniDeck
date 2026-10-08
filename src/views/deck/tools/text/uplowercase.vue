<template>
  <tool-shell
    title="大小写转换"
    desc="英文大小写互转，多种风格实时预览"
    icon="case"
    color="#722ED1"
    back-path="/tools/text"
  >
    <template #toolbar>
      <button class="tool-btn is-primary" @click="copy(output)">
        <svg-icon icon-class="document-copy" />
        复制结果
      </button>
      <button class="tool-btn" :class="{ 'is-primary': historyVisible }" @click="historyVisible = !historyVisible">
        <svg-icon icon-class="time" />
        历史
      </button>
      <button class="tool-btn is-danger" @click="input = ''">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="split-pane is-vertical">
      <div class="pane" style="flex: 1">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">输入文本</span>
        </div>
        <div class="pane-body">
          <code-editor
            v-model="input"
            mode="text/plain"
            :fold="false"
            placeholder="输入英文文本…"
          />
        </div>
      </div>
      <div class="ul-results">
        <div
          v-for="r in results"
          :key="r.label"
          class="ul-item"
          @click="copy(r.value)"
          :title="r.value ? '点击复制' : ''"
        >
          <div class="ul-label">{{ r.label }}</div>
          <div class="ul-value mono">{{ r.value || '—' }}</div>
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
      <span>{{ input.length }} 字符 · 点击卡片复制</span>
      <span class="status-right">{{ wordCount }} 个单词</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/storage/tool-history'

const TOOL_PATH = '/tools/text/uplowercase'

export default {
  name: 'TextUplowercase',
  components: { ToolShell, CodeEditor, ToolHistoryPanel },
  data() {
    return {
      input: 'The quick brown fox jumps over the lazy dog',
      historyVisible: false,
      TOOL_PATH: TOOL_PATH
    }
  },
  computed: {
    wordCount() {
      return (this.input.trim().match(/\S+/g) || []).length
    },
    results() {
      const t = this.input
      const capitalize = s => s.replace(/\b\w/g, c => c.toUpperCase())
      return [
        { label: '全大写 UPPER', value: t.toUpperCase() },
        { label: '全小写 lower', value: t.toLowerCase() },
        { label: '首字母大写 Capitalize', value: capitalize(t.toLowerCase()) },
        { label: '句首大写 Sentence', value: t.toLowerCase().replace(/(^\s*\w|[.!?]\s+\w)/g, c => c.toUpperCase()) },
        { label: '反转大小写 sWAP', value: [...t].map(c => c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase()).join('') }
      ]
    }
  },
  methods: {
    copy(t) {
      if (!t) return
      navigator.clipboard.writeText(t).then(() => {
        this.$message({ message: '已复制', type: 'success', duration: 1200 })
      })
      record(TOOL_PATH, {
        input: this.input,
        output: t,
        options: { action: 'copy' }
      })
    },
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      this.input = full.input || ''
      this.$message.success('已从历史恢复')
    }
  }
}
</script>

<style lang="scss" scoped>
.ul-results {
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
  padding: 10px;
}

.ul-item {
  padding: 10px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);

    .ul-value {
      color: var(--primary-color);
    }
  }
}

.ul-label {
  font-size: 10.5px;
  color: var(--text-secondary);
  margin-bottom: 4px;
}

.ul-value {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.5;
  word-break: break-word;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  transition: color 0.15s ease;
}
</style>
