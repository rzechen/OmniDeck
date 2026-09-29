<template>
  <div ref="host" class="code-editor"></div>
</template>

<script>
// CodeMirror 5 封装：Mac 风格主题（cm-s-omni，明暗自适应）
// 统一加载格式化工具所需的全部 mode 与折叠插件
import CodeMirror from 'codemirror'
import 'codemirror/lib/codemirror.css'
// modes
import 'codemirror/mode/javascript/javascript'
import 'codemirror/mode/css/css'
import 'codemirror/mode/xml/xml'
import 'codemirror/mode/yaml/yaml'
import 'codemirror/mode/sql/sql'
import 'codemirror/mode/markdown/markdown'
// addons：代码折叠 + 占位符 + 当前行高亮 + 括号匹配
import 'codemirror/addon/fold/foldcode'
import 'codemirror/addon/fold/foldgutter'
import 'codemirror/addon/fold/brace-fold'
import 'codemirror/addon/fold/xml-fold'
import 'codemirror/addon/fold/indent-fold'
import 'codemirror/addon/fold/comment-fold'
import 'codemirror/addon/fold/foldgutter.css'
import 'codemirror/addon/display/placeholder'
import 'codemirror/addon/selection/active-line'
import 'codemirror/addon/edit/matchbrackets'

export default {
  name: 'CodeEditor',
  // 声明自定义事件，阻止监听器 fallthrough 到根元素（CodeMirror 内部 textarea 的原生 change 会冒泡）
  emits: ['update:modelValue', 'change', 'cursor', 'scroll'],
  props: {
    modelValue: { type: String, default: '' },
    mode: { type: String, default: 'text/plain' },
    readOnly: { type: Boolean, default: false },
    placeholder: { type: String, default: '' },
    // 是否启用折叠槽（JSON/YAML/XML/CSS/SQL 需要，纯文本不需要）
    fold: { type: Boolean, default: true },
    lineWrapping: { type: Boolean, default: true }
  },
  watch: {
    // 外部赋值：保留滚动位置与光标
    modelValue(val) {
      if (!this.cm || val === this.cm.getValue()) return
      const scroll = this.cm.getScrollInfo()
      const cursor = this.cm.getCursor()
      this.cm.setValue(val)
      this.cm.scrollTo(scroll.left, scroll.top)
      this.cm.setCursor(cursor)
    },
    mode(m) {
      if (this.cm) this.cm.setOption('mode', m)
    },
    readOnly(ro) {
      if (this.cm) this.cm.setOption('readOnly', ro)
    }
  },
  mounted() {
    const gutters = ['CodeMirror-linenumbers']
    if (this.fold) gutters.push('CodeMirror-foldgutter')
    this.cm = CodeMirror(this.$refs.host, {
      value: this.modelValue,
      mode: this.mode,
      theme: 'omni',
      readOnly: this.readOnly,
      lineNumbers: true,
      lineWrapping: this.lineWrapping,
      foldGutter: this.fold,
      gutters,
      matchBrackets: true,
      styleActiveLine: true,
      placeholder: this.placeholder,
      indentUnit: 2,
      tabSize: 2,
      extraKeys: { Tab: cm => cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection('  ') }
    })
    this.cm.on('change', () => {
      this.$emit('update:modelValue', this.cm.getValue())
      this.$emit('change', this.cm.getValue())
    })
    this.cm.on('cursorActivity', () => {
      const c = this.cm.getCursor()
      this.$emit('cursor', { line: c.line + 1, ch: c.ch + 1 })
    })
    this.cm.on('scroll', () => {
      const info = this.cm.getScrollInfo()
      // 滚动进度 0~1：供 Markdown 双向同步滚动使用
      const max = info.height - info.clientHeight
      this.$emit('scroll', max > 0 ? info.top / max : 0)
    })
  },
  beforeUnmount() {
    this.cm = null
  },
  methods: {
    // 折叠全部（不可折叠的行自动跳过）
    foldAll() {
      if (!this.cm) return
      this.cm.operation(() => {
        for (let i = this.cm.firstLine(); i <= this.cm.lastLine(); i++) {
          this.cm.foldCode(i, null, 'fold')
        }
      })
    },
    // 展开全部
    unfoldAll() {
      if (!this.cm) return
      this.cm.operation(() => {
        for (let i = this.cm.firstLine(); i <= this.cm.lastLine(); i++) {
          this.cm.foldCode(i, null, 'unfold')
        }
      })
    },
    refresh() {
      this.cm && this.cm.refresh()
    },
    focus() {
      this.cm && this.cm.focus()
    }
  }
}
</script>

<style lang="scss">
.code-editor {
  position: relative;
  height: 100%;
  overflow: hidden;

  .CodeMirror {
    height: 100%;
  }
}

/* ============ cm-s-omni 主题：由 CSS 变量驱动，明暗自适应 ============ */
.cm-s-omni.CodeMirror {
  font-family: 'SF Mono', Menlo, Consolas, 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.65;
  color: var(--text-primary);
  background: transparent;
}

.cm-s-omni .CodeMirror-gutters {
  background: transparent;
  border-right: 1px solid var(--border-color);
}

.cm-s-omni .CodeMirror-linenumber {
  color: var(--text-secondary);
  opacity: 0.65;
  font-size: 11px;
  padding: 0 8px 0 10px;
}

.cm-s-omni .CodeMirror-cursor {
  border-left: 2px solid var(--primary-color);
}

.cm-s-omni .CodeMirror-selected,
.cm-s-omni.CodeMirror-focused .CodeMirror-selected {
  background: rgba(var(--primary-color-rgb), 0.16);
}

.cm-s-omni .CodeMirror-activeline-background {
  background: var(--search-bg);
}

.cm-s-omni .CodeMirror-matchingbracket {
  color: var(--primary-color) !important;
  font-weight: 700;
  border-bottom: 1px solid var(--primary-color);
}

.cm-s-omni .CodeMirror-placeholder {
  color: var(--text-secondary);
}

.cm-s-omni .CodeMirror-foldmarker {
  color: var(--primary-color);
  text-shadow: none;
  font-family: inherit;
  margin: 0 2px;
}

.cm-s-omni .CodeMirror-foldgutter-open:after {
  content: '▾';
  color: var(--text-secondary);
  font-size: 11px;
}

.cm-s-omni .CodeMirror-foldgutter-folded:after {
  content: '▸';
  color: var(--primary-color);
  font-size: 11px;
}

.cm-s-omni .CodeMirror-scrollbar-filler,
.cm-s-omni .CodeMirror-gutter-filler {
  background: transparent;
}

/* ---- 语法配色（浅色：Xcode 风格） ---- */
.cm-s-omni .cm-keyword { color: #9B2393; }
.cm-s-omni .cm-atom { color: #AA0D91; }
.cm-s-omni .cm-number { color: #1C00CF; }
.cm-s-omni .cm-def { color: #326D74; }
.cm-s-omni .cm-variable { color: var(--text-primary); }
.cm-s-omni .cm-variable-2 { color: #384F60; }
.cm-s-omni .cm-variable-3 { color: #416D8E; }
.cm-s-omni .cm-property { color: #31595D; }
.cm-s-omni .cm-operator { color: var(--text-primary); }
.cm-s-omni .cm-comment { color: #8A8A93; font-style: italic; }
.cm-s-omni .cm-string { color: #C41A16; }
.cm-s-omni .cm-string-2 { color: #1C00CF; }
.cm-s-omni .cm-meta { color: #787880; }
.cm-s-omni .cm-qualifier { color: #6F42C1; }
.cm-s-omni .cm-builtin { color: #31595D; }
.cm-s-omni .cm-bracket { color: var(--text-primary); }
.cm-s-omni .cm-tag { color: #2F6F9F; }
.cm-s-omni .cm-attribute { color: #4F9FCF; }
.cm-s-omni .cm-hr { color: var(--text-secondary); }
.cm-s-omni .cm-link { color: #1C00CF; }

/* ---- 语法配色（深色：One Dark 风格） ---- */
html[data-theme='dark'] .cm-s-omni .cm-keyword { color: #C678DD; }
html[data-theme='dark'] .cm-s-omni .cm-atom { color: #D19A66; }
html[data-theme='dark'] .cm-s-omni .cm-number { color: #D19A66; }
html[data-theme='dark'] .cm-s-omni .cm-def { color: #E5C07B; }
html[data-theme='dark'] .cm-s-omni .cm-variable-2 { color: #E06C75; }
html[data-theme='dark'] .cm-s-omni .cm-variable-3 { color: #56B6C2; }
html[data-theme='dark'] .cm-s-omni .cm-property { color: #61AFEF; }
html[data-theme='dark'] .cm-s-omni .cm-comment { color: #7F848E; }
html[data-theme='dark'] .cm-s-omni .cm-string { color: #98C379; }
html[data-theme='dark'] .cm-s-omni .cm-string-2 { color: #56B6C2; }
html[data-theme='dark'] .cm-s-omni .cm-meta { color: #61AFEF; }
html[data-theme='dark'] .cm-s-omni .cm-qualifier { color: #C678DD; }
html[data-theme='dark'] .cm-s-omni .cm-builtin { color: #56B6C2; }
html[data-theme='dark'] .cm-s-omni .cm-tag { color: #E06C75; }
html[data-theme='dark'] .cm-s-omni .cm-attribute { color: #D19A66; }
html[data-theme='dark'] .cm-s-omni .cm-link { color: #61AFEF; }
</style>
