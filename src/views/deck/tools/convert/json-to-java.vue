<template>
  <tool-shell
    title="JSON 转 Java"
    desc="生成 Java 类：字段、Getter/Setter、嵌套内部类"
    icon="java"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <input v-model="className" class="name-input mono" placeholder="类名" spellcheck="false" />
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
          <span class="pane-title">Java 代码</span>
        </div>
        <div class="pane-body">
          <code-editor :model-value="output" mode="text/x-java" read-only />
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
import { downloadText } from '@/utils/ui/download'
import { jsonToCodeMixin } from './code-gen-mixin'

export default {
  name: 'ConvertJsonToJava',
  // 执行历史 toolPath（mixin 的 recordHistory 读取）
  toolPath: '/tools/convert/json-to-java',
  components: { ToolShell, CodeEditor, ToolHistoryPanel },
  mixins: [jsonToCodeMixin],
  data() {
    return {
      // 面板可访问的工具 path
      HISTORY_TOOL: '/tools/convert/json-to-java',
      example: `{
  "name": "OmniDeck",
  "version": "1.0.0",
  "openSource": true,
  "stars": 128,
  "author": { "name": "ranze", "city": "Shanghai" },
  "tags": ["electron", "vue", "tools"]
}`,
      ext: 'java'
    }
  },
  methods: {
    generate(obj, className) {
      const classMap = new Map()
      this.genJavaClass(obj, className, classMap)
      let imports = ''
      for (const code of classMap.values()) {
        if (code.includes('List<')) {
          imports = 'import java.util.List;\n\n'
          break
        }
      }
      let main = ''
      // 主类在最前，嵌套类随后
      for (const [name, code] of classMap.entries()) {
        if (name === className) {
          main = code
          break
        }
      }
      const nested = [...classMap.entries()]
        .filter(([n]) => n !== className)
        .map(([, c]) => '\n' + c)
        .join('\n')
      this.classCount = classMap.size
      return (this.packageName.trim() ? `package ${this.packageName.trim()};\n\n` : '') + imports + main + nested
    },
    genJavaClass(obj, className, classMap) {
      const toCamel = s => s.replace(/_([a-z])/g, (m, p1) => p1.toUpperCase())
      const toPascal = s => {
        const c = toCamel(s)
        return c.charAt(0).toUpperCase() + c.slice(1)
      }
      const typeMap = (value, key) => {
        if (value === null) return 'Object'
        if (Array.isArray(value)) {
          if (!value.length) return 'List<Object>'
          return `List<${typeMap(value[0], key)}>`
        }
        if (typeof value === 'string') return 'String'
        if (typeof value === 'boolean') return 'boolean'
        if (typeof value === 'number') return Number.isInteger(value) ? 'int' : 'double'
        if (typeof value === 'object') {
          const nested = toPascal(key)
          this.genJavaClass(value, nested, classMap)
          return nested
        }
        return 'Object'
      }
      const fields = []
      const methods = []
      Object.entries(obj).forEach(([key, val]) => {
        const fn = toCamel(key)
        const type = typeMap(val, key)
        fields.push(`    /** ${key} */\n    private ${type} ${fn};`)
        const cap = fn.charAt(0).toUpperCase() + fn.slice(1)
        methods.push(
          `    public ${type} get${cap}() {\n        return ${fn};\n    }\n\n    public void set${cap}(${type} ${fn}) {\n        this.${fn} = ${fn};\n    }`
        )
      })
      classMap.set(
        className,
        `public class ${className} {\n\n${fields.join('\n\n')}\n\n${methods.join('\n\n')}\n}`
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
