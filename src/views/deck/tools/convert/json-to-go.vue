<template>
  <tool-shell
    title="JSON 转 Go"
    desc="生成 Go 结构体：JSON tag、嵌套 struct"
    icon="go"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <input v-model="className" class="name-input mono" placeholder="结构体名" spellcheck="false" />
      <input v-model="packageName" class="name-input mono" placeholder="包名（可选）" spellcheck="false" />
      <button class="tool-btn is-primary" @click="copyOutput">
        <svg-icon icon-class="document-copy" />
        复制
      </button>
      <button class="tool-btn" @click="downloadOutput">
        <svg-icon icon-class="download" />
        下载
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

    <div class="split-pane">
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">输入 JSON</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="inputEditor"
            v-model="jsonInput"
            mode="application/json"
            placeholder="输入 JSON 对象…"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">Go 代码</span>
        </div>
        <div class="pane-body">
          <code-editor :model-value="output" mode="text/x-go" read-only />
        </div>
      </div>
    </div>

    <!-- 执行历史面板（与分栏并排，右侧抽屉） -->
    <tool-history-panel
      :visible="historyVisible"
      :tool="HISTORY_TOOL"
      @close="historyVisible = false"
      @restore="restoreFromHistory"
    />

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>含 {{ classCount }} 个结构体</span>
      <span class="status-right">{{ jsonInput.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { useCodeGen } from './useCodeGen'

defineOptions({ name: 'ConvertJsonToGo' })

// 执行历史 toolPath（useCodeGen 的 recordHistory 读取）
const TOOL_PATH = '/tools/convert/json-to-go'
// 面板可访问的工具 path
const HISTORY_TOOL = TOOL_PATH

const EXAMPLE = `{
  "name": "OmniDeck",
  "version": "1.0.0",
  "openSource": true,
  "stars": 128,
  "author": { "name": "ranze", "city": "Shanghai" },
  "tags": ["electron", "vue", "tools"]
}`

function genStruct(obj, structName, structMap) {
  const toCamel = s => s.replace(/_([a-z])/g, (m, p1) => p1.toUpperCase())
  const toPascal = s => {
    const c = toCamel(s)
    return c.charAt(0).toUpperCase() + c.slice(1)
  }
  const goType = (value, key) => {
    if (value === null) return 'interface{}'
    if (Array.isArray(value)) {
      if (!value.length) return '[]interface{}'
      return `[]${goType(value[0], key)}`
    }
    if (typeof value === 'string') return 'string'
    if (typeof value === 'boolean') return 'bool'
    if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'float64'
    if (typeof value === 'object') {
      const nested = toPascal(key)
      genStruct(value, nested, structMap)
      return nested
    }
    return 'interface{}'
  }
  const fields = Object.entries(obj).map(([key, val]) => {
    const fn = toPascal(key)
    const t = goType(val, key)
    return `    ${fn} ${t} \`json:"${key}"\``
  })
  structMap.set(structName, `type ${structName} struct {\n${fields.join('\n')}\n}\n`)
}

const {
  jsonInput,
  className,
  packageName,
  output,
  errorMsg,
  classCount,
  historyVisible,
  inputEditor,
  copyOutput,
  downloadOutput,
  restoreFromHistory,
  clearAll
} = useCodeGen({
  toolPath: TOOL_PATH,
  example: EXAMPLE,
  ext: 'go',
  generate(obj, structName) {
    const structMap = new Map()
    genStruct(obj, structName, structMap)
    classCount.value = structMap.size
    const header = packageName.value.trim() ? `package ${packageName.value.trim()}\n\n` : ''
    return header + [...structMap.values()].join('\n')
  }
})
</script>

<style lang="scss" scoped>
.name-input {
  width: 130px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  outline: none;
  background: var(--card-bg);
  font-size: 12px;
  color: var(--text-primary);
  transition: all 0.16s ease;

  &.mono {
    font-family: 'SF Mono', Menlo, monospace;
  }

  &:focus {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
  }

  &::placeholder {
    color: var(--text-secondary);
  }
}
</style>
