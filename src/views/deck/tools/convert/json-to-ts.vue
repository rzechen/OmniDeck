<template>
  <tool-shell
    title="JSON 转 TypeScript"
    desc="生成 TS interface 定义与带默认值的类"
    icon="typescript"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <input v-model="className" class="name-input mono" placeholder="接口名" spellcheck="false" />
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
          <span class="pane-title">TypeScript 代码</span>
        </div>
        <div class="pane-body">
          <code-editor :model-value="output" mode="javascript" read-only />
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
      <span v-else>含 {{ classCount }} 组 interface/class</span>
      <span class="status-right">{{ jsonInput.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { useCodeGen } from './useCodeGen'

defineOptions({ name: 'ConvertJsonToTs' })

// 执行历史 toolPath（useCodeGen 的 recordHistory 读取）
const TOOL_PATH = '/tools/convert/json-to-ts'
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

function genTs(obj, className, map) {
  const toCamel = s => s.replace(/_([a-z])/g, (m, p1) => p1.toUpperCase())
  const toPascal = s => {
    const c = toCamel(s)
    return c.charAt(0).toUpperCase() + c.slice(1)
  }
  const getType = (value, key) => {
    if (value === null) return 'null'
    if (Array.isArray(value)) {
      if (!value.length) return 'any[]'
      return `${getType(value[0], key)}[]`
    }
    if (typeof value === 'string') return 'string'
    if (typeof value === 'boolean') return 'boolean'
    if (typeof value === 'number') return 'number'
    if (typeof value === 'object') {
      const nested = toPascal(key)
      genTs(value, nested, map)
      return nested
    }
    return 'any'
  }
  const defaultOf = (type, val) => {
    if (val !== null && val !== undefined) {
      if (typeof val === 'string') return JSON.stringify(val)
      if (typeof val === 'boolean' || typeof val === 'number') return String(val)
      if (Array.isArray(val)) return JSON.stringify(val)
      return 'undefined'
    }
    if (type.includes('string')) return '""'
    if (type.includes('number')) return '0'
    if (type.includes('boolean')) return 'false'
    if (type.includes('[]')) return '[]'
    return 'undefined'
  }
  const ifLines = []
  const fields = []
  const params = []
  const body = []
  Object.entries(obj).forEach(([key, val]) => {
    const fn = toCamel(key)
    let t = getType(val, key)
    const nullable = val === null
    if (nullable) t = `${t} | null`
    const opt = nullable ? '?' : ''
    ifLines.push(`  /** ${key} (${t}) */\n  ${fn}${opt}: ${t};`)
    fields.push(`  ${fn}: ${t};`)
    const dv = defaultOf(t, val)
    params.push(nullable ? `${fn}?: ${t}` : `${fn}: ${t} = ${dv}`)
    body.push(`    this.${fn} = ${fn} !== undefined ? ${fn} : ${dv};`)
  })
  map.set(className, {
    kind: 'interface',
    code: `export interface I${className} {\n${ifLines.join('\n')}\n}`
  })
  map.set(className + ':c', {
    kind: 'class',
    code: `export class ${className} implements I${className} {\n${fields.join('\n')}\n\n  constructor(${params.join(', ')}) {\n${body.join('\n')}\n  }\n}`
  })
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
  ext: 'ts',
  generate(obj, className) {
    const map = new Map() // name -> { kind: 'interface'|'class', code }
    genTs(obj, className, map)
    classCount.value = map.size / 2
    // 先全部 interface，再全部 class
    const interfaces = []
    const classes = []
    for (const v of map.values()) {
      if (v.kind === 'interface') interfaces.push(v.code)
      else classes.push(v.code)
    }
    return [...interfaces, ...classes].join('\n\n')
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
