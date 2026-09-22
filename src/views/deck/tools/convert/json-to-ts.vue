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
        <i class="el-icon-document-copy"></i>
        复制
      </button>
      <button class="tool-btn" @click="downloadOutput">
        <i class="el-icon-download"></i>
        下载
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
          <code-editor :value="output" mode="javascript" read-only />
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>含 {{ classCount }} 组 interface/class</span>
      <span class="status-right">{{ jsonInput.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import { jsonToCodeMixin } from './code-gen-mixin'

export default {
  name: 'ConvertJsonToTs',
  components: { ToolShell, CodeEditor },
  mixins: [jsonToCodeMixin],
  data() {
    return {
      example: `{
  "name": "OmniDeck",
  "version": "1.0.0",
  "openSource": true,
  "stars": 128,
  "author": { "name": "ranze", "city": "Shanghai" },
  "tags": ["electron", "vue", "tools"]
}`,
      ext: 'ts'
    }
  },
  methods: {
    generate(obj, className) {
      const map = new Map() // name -> { kind: 'interface'|'class', code }
      this.genTs(obj, className, map)
      this.classCount = map.size / 2
      // 先全部 interface，再全部 class
      const interfaces = []
      const classes = []
      for (const v of map.values()) {
        if (v.kind === 'interface') interfaces.push(v.code)
        else classes.push(v.code)
      }
      return [...interfaces, ...classes].join('\n\n')
    },
    genTs(obj, className, map) {
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
          this.genTs(value, nested, map)
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
  }
}
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
