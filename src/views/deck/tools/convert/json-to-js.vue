<template>
  <tool-shell
    title="JSON 转 JavaScript"
    desc="生成 ES6 Class：构造函数赋值、getter/setter"
    icon="javascript"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <input v-model="className" class="name-input mono" placeholder="类名" spellcheck="false" />
      <button class="tool-btn is-primary" @click="copyOutput">
        <i class="el-icon-document-copy"></i>
        复制
      </button>
      <button class="tool-btn" @click="downloadOutput">
        <i class="el-icon-download"></i>
        下载
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
          <span class="pane-title">JavaScript 代码</span>
        </div>
        <div class="pane-body">
          <code-editor :value="output" mode="javascript" read-only />
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
      <span v-else>含 {{ classCount }} 个类</span>
      <span class="status-right">{{ jsonInput.length }} 字符输入</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { jsonToCodeMixin } from './code-gen-mixin'

export default {
  name: 'ConvertJsonToJs',
  // 执行历史 toolPath（mixin 的 recordHistory 读取）
  toolPath: '/tools/convert/json-to-js',
  components: { ToolShell, CodeEditor, ToolHistoryPanel },
  mixins: [jsonToCodeMixin],
  data() {
    return {
      // 面板可访问的工具 path
      HISTORY_TOOL: '/tools/convert/json-to-js',
      example: `{
  "name": "OmniDeck",
  "version": "1.0.0",
  "openSource": true,
  "stars": 128,
  "author": { "name": "ranze", "city": "Shanghai" },
  "tags": ["electron", "vue", "tools"]
}`,
      ext: 'js'
    }
  },
  methods: {
    generate(obj, className) {
      const classMap = new Map()
      this.genClass(obj, className, classMap)
      this.classCount = classMap.size
      return [...classMap.values()].join('\n\n')
    },
    genClass(obj, className, classMap) {
      const toCamel = s => s.replace(/_([a-z])/g, (m, p1) => p1.toUpperCase())
      const toPascal = s => {
        const c = toCamel(s)
        return c.charAt(0).toUpperCase() + c.slice(1)
      }
      const jsType = (value, key) => {
        if (value === null) return 'null'
        if (Array.isArray(value)) {
          if (!value.length) return 'Array'
          return `${jsType(value[0], key)}[]`
        }
        if (typeof value === 'string') return 'string'
        if (typeof value === 'boolean') return 'boolean'
        if (typeof value === 'number') return 'number'
        if (typeof value === 'object') {
          const nested = toPascal(key)
          this.genClass(value, nested, classMap)
          return nested
        }
        return 'any'
      }
      const ctorLines = []
      const getters = []
      Object.entries(obj).forEach(([key, val]) => {
        const fn = toCamel(key)
        const t = jsType(val, key)
        // 嵌套对象用 new、对象数组用 map，其余直接 JSON 字面量
        let init
        if (val && typeof val === 'object' && !Array.isArray(val)) {
          init = `new ${t}(${JSON.stringify(val)})`
        } else if (Array.isArray(val) && val.length && typeof val[0] === 'object' && val[0] !== null) {
          const elemType = t.replace(/\[\]$/, '')
          init = `[${val.map(it => `new ${elemType}(${JSON.stringify(it)})`).join(', ')}]`
        } else {
          init = JSON.stringify(val)
        }
        ctorLines.push(`    /** ${key} (${t}) */\n    this.${fn} = ${init};`)
        getters.push(`  get ${fn}() {\n    return this.${fn};\n  }`)
      })
      classMap.set(
        className,
        `class ${className} {\n  constructor(data) {\n${ctorLines.join('\n')}\n  }\n\n${getters.join('\n\n')}\n}`
      )
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
