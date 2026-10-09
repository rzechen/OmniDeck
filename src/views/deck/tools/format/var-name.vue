<template>
  <tool-shell
    title="变量名格式化"
    desc="驼峰、帕斯卡、下划线、中横线等多规范一键互转"
    icon="code"
    color="#3366FF"
    back-path="/tools/format"
  >
    <template #toolbar>
      <button class="tool-btn is-primary" @click="copyAll">
        <svg-icon icon-class="document-copy" />
        复制全部
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
      <div class="pane input-pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">输入变量名（每行一个，实时转换）</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="rawInput"
            mode="text/plain"
            :fold="false"
            placeholder="例如：userName / user_name / user-name / UserName"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">转换结果</span>
          <span>点击单元格复制</span>
        </div>
        <div class="pane-body result-scroll">
          <div v-if="rows.length" class="result-table">
            <div class="result-row result-head">
              <div class="result-cell">原始</div>
              <div class="result-cell">camelCase</div>
              <div class="result-cell">PascalCase</div>
              <div class="result-cell">snake_case</div>
              <div class="result-cell">CONSTANT_CASE</div>
              <div class="result-cell">kebab-case</div>
            </div>
            <div v-for="(row, i) in rows" :key="i" class="result-row">
              <div
                v-for="col in cols"
                :key="col"
                class="result-cell"
                :class="{ 'is-origin': col === 'original' }"
                :title="row[col]"
                @click="copyCell(row[col])"
              >
                {{ row[col] }}
              </div>
            </div>
          </div>
          <div v-else class="result-empty">
            <svg-icon icon-class="magic-stick" />
            <p>输入变量名后自动转换</p>
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
      <span class="status-dot"></span>
      <span>{{ rows.length }} 个变量</span>
      <span class="status-right">{{ lineCount }} 行输入</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/storage/tool-history'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'FormatVarName' })

const { message } = useFeedback()

const TOOL_PATH = '/tools/format/var-name'

const rawInput = ref('user name\nno time out\nHTTP response code')
const cols = ['original', 'camelCase', 'PascalCase', 'snake_case', 'SNAKE_CASE', 'kebab_case']
const historyVisible = ref(false)
const inputEditor = ref(null)

const lineCount = computed(() =>
  rawInput.value ? rawInput.value.split('\n').filter(l => l.trim()).length : 0
)
const rows = computed(() =>
  rawInput.value
    .split(/[\n,]+/)
    .map(v => v.trim())
    .filter(Boolean)
    .map(v => {
      const words = splitWords(v)
      return {
        original: v,
        camelCase: toCamelCase(words),
        PascalCase: toPascalCase(words),
        snake_case: toSnakeCase(words),
        SNAKE_CASE: toSnakeCase(words).toUpperCase(),
        kebab_case: toKebabCase(words)
      }
    })
)

// 拆分单词：先按分隔符，再拆连续驼峰（userName → user name）
function splitWords(str) {
  let words = str.split(/[_\-\s]+/).filter(Boolean)
  if (words.length === 1) {
    const s = words[0]
    words = s.match(/[A-Z]?[a-z]+|[A-Z]+(?![a-z])/g) || [s]
  }
  return words.map(w => w.toLowerCase())
}

function toCamelCase(words) {
  return words.map((w, i) => (i === 0 ? w : w.charAt(0).toUpperCase() + w.slice(1))).join('')
}

function toPascalCase(words) {
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('')
}

function toSnakeCase(words) {
  return words.join('_')
}

function toKebabCase(words) {
  return words.join('-')
}

function copyCell(text) {
  if (!text) return
  navigator.clipboard.writeText(text).then(() => {
    message({ message: `已复制：${text}`, type: 'success', duration: 1200 })
  })
}

function copyAll() {
  if (!rows.value.length) {
    message.warning('没有可复制的内容')
    return
  }
  const header = ['原始', 'camelCase', 'PascalCase', 'snake_case', 'CONSTANT_CASE', 'kebab-case'].join('\t')
  const lines = rows.value.map(r =>
    [r.original, r.camelCase, r.PascalCase, r.snake_case, r.SNAKE_CASE, r.kebab_case].join('\t')
  )
  navigator.clipboard.writeText([header, ...lines].join('\n')).then(() => {
    message.success('已复制全部结果')
  })
  record(TOOL_PATH, {
    input: rawInput.value,
    output: [header, ...lines].join('\n'),
    options: { action: 'copy-all', count: rows.value.length }
  })
}

async function restoreFromHistory(item) {
  const full = await getHistory(item.id)
  if (!full) {
    message.warning('该记录已被删除')
    return
  }
  rawInput.value = full.input || ''
  await nextTick()
  inputEditor.value && inputEditor.value.focus()
  message.success('已从历史恢复')
}

function clearAll() {
  rawInput.value = ''
  inputEditor.value.focus()
}
</script>

<style lang="scss" scoped>
.input-pane {
  flex: 0 0 34%;
}

.result-scroll {
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

/* ============ 转换结果表：Mac 简约网格 ============ */
.result-table {
  min-width: 720px;
  font-size: 12.5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

.result-row {
  display: grid;
  grid-template-columns: 1.3fr repeat(5, 1fr);

  &:hover .result-cell {
    background: rgba(var(--primary-color-rgb), 0.03);
  }
}

.result-head {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--card-bg);

  .result-cell {
    font-weight: 600;
    color: var(--text-secondary);
    background: var(--search-bg);
    font-family: inherit;
  }
}

.result-cell {
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  transition: color 0.14s ease;

  &:not(:last-child) {
    border-right: 1px solid var(--border-color);
  }

  &:hover {
    color: var(--primary-color);
  }

  &.is-origin {
    color: var(--text-secondary);
  }
}

.result-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);

  i {
    font-size: 30px;
    margin-bottom: 10px;
    opacity: 0.45;
  }

  p {
    font-size: 13px;
  }
}
</style>
