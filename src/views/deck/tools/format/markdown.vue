<template>
  <tool-shell
    title="Markdown 格式化"
    desc="实时预览，支持代码高亮与 LaTeX 公式"
    icon="markdown"
    color="#3366FF"
    back-path="/tools/format"
  >
    <template #toolbar>
      <button class="tool-btn" @click="copyMarkdown">
        <i class="el-icon-document-copy"></i>
        复制 Markdown
      </button>
      <button class="tool-btn" @click="copyHtml">
        <i class="el-icon-document-copy"></i>
        复制 HTML
      </button>
      <button class="tool-btn is-primary" @click="exportHtml">
        <i class="el-icon-download"></i>
        导出 HTML
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
          <span class="pane-title">Markdown 编辑</span>
        </div>
        <div class="pane-body">
          <code-editor
            ref="mdEditor"
            v-model="text"
            mode="markdown"
            :fold="false"
            placeholder="输入 Markdown 内容…"
            @scroll="onEditorScroll"
          />
        </div>
      </div>
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">实时预览</span>
        </div>
        <div ref="preview" class="pane-body md-preview-body">
          <div class="md-preview" v-html="renderedHtml"></div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>Markdown</span>
      <span class="status-right">{{ lineCount }} 行 · {{ text.length }} 字符 · {{ wordCount }} 词</span>
    </template>
  </tool-shell>
</template>

<script>
import MarkdownIt from 'markdown-it'
import hljs from 'highlight.js/lib/common'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'
import { downloadText } from '@/utils/download'

const EXAMPLE = `# OmniDeck Markdown

**所见即所得**的 Markdown 编辑器，支持 \`代码高亮\` 与 LaTeX 公式。

## 代码高亮

\`\`\`javascript
const greet = (name) => {
  console.log(\`Hello, \${name}!\`)
}
greet('OmniDeck')
\`\`\`

## LaTeX 公式

质能方程 $E = mc^2$，以及欧拉公式：

$$e^{i\\pi} + 1 = 0$$

## 列表与引用

- 快捷键 \u2318 + C 复制
- 点击代码块右上角按钮可快速复制

> 简约大气，Mac 风格。

| 工具 | 说明 |
| ---- | ---- |
| JSON | 校验与格式化 |
| SQL | 多方言美化 |
`

// markdown-it 实例：highlight.js 代码高亮
const md = new MarkdownIt({
  html: true,
  linkify: true,
  breaks: false,
  highlight(str, lang) {
    if (lang && hljs.getLanguage(lang)) {
      try {
        return (
          '<pre class="hljs"><code>' +
          hljs.highlight(str, { language: lang, ignoreIllegals: true }).value +
          '</code></pre>'
        )
      } catch (e) {
        // fallthrough
      }
    }
    return ''
  }
})

export default {
  name: 'FormatMarkdown',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      text: EXAMPLE
    }
  },
  computed: {
    renderedHtml() {
      return this.renderMath(md.render(this.text))
    },
    lineCount() {
      return this.text ? this.text.split('\n').length : 0
    },
    wordCount() {
      const m = this.text.trim().match(/[\w\u4e00-\u9fa5]+/g)
      return m ? m.length : 0
    }
  },
  updated() {
    this.$nextTick(this.addCopyButtons)
  },
  methods: {
    // LaTeX 公式渲染：跳过 <pre> 代码块，处理 $$块级$$ 与 $行内$
    renderMath(html) {
      return html
        .split(/(<pre[\s\S]*?<\/pre>)/g)
        .map((part, i) => {
          if (i % 2 === 1) return part
          return part
            .replace(/\$\$([\s\S]+?)\$\$/g, (m, c) => {
              try {
                return katex.renderToString(c, { throwOnError: false, displayMode: true })
              } catch (e) {
                return m
              }
            })
            .replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (m, pre, c) => {
              try {
                return pre + katex.renderToString(c, { throwOnError: false, displayMode: false })
              } catch (e) {
                return m
              }
            })
        })
        .join('')
    },
    // 编辑器滚动 → 预览按比例同步
    onEditorScroll(ratio) {
      const el = this.$refs.preview
      if (!el) return
      el.scrollTop = (el.scrollHeight - el.clientHeight) * ratio
    },
    // 代码块右上角复制按钮（限定在预览容器内）
    addCopyButtons() {
      const root = this.$refs.preview
      if (!root) return
      root.querySelectorAll('pre').forEach(pre => {
        if (pre.querySelector('.code-copy-btn')) return
        const btn = document.createElement('div')
        btn.className = 'code-copy-btn'
        btn.textContent = '复制'
        btn.onclick = () => {
          const code = pre.querySelector('code')
          navigator.clipboard.writeText(code ? code.innerText : pre.innerText).then(() => {
            btn.textContent = '已复制'
            this.$message.success('代码已复制')
            setTimeout(() => {
              btn.textContent = '复制'
            }, 1500)
          })
        }
        pre.appendChild(btn)
      })
    },
    copyMarkdown() {
      if (!this.text.trim()) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(this.text).then(() => {
        this.$message.success('Markdown 已复制')
      })
    },
    copyHtml() {
      if (!this.text.trim()) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(this.renderedHtml).then(() => {
        this.$message.success('HTML 已复制')
      })
    },
    exportHtml() {
      if (!this.text.trim()) {
        this.$message.warning('没有可导出的内容')
        return
      }
      const doc = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Markdown 导出</title>
<style>
body{max-width:820px;margin:40px auto;padding:0 24px;font-family:-apple-system,BlinkMacSystemFont,'PingFang SC','Helvetica Neue',sans-serif;line-height:1.7;color:#1A1A1F}
h1,h2,h3{line-height:1.3}
a{color:#3366FF}
code{background:rgba(0,0,0,.05);padding:2px 5px;border-radius:4px;font-size:.9em;font-family:'SF Mono',Menlo,monospace}
pre{background:#F6F6F8;border:1px solid #E6E6EB;border-radius:8px;padding:14px;overflow:auto}
pre code{background:none;padding:0}
blockquote{margin:1em 0;padding:.4em 1em;border-left:4px solid #3366FF;background:rgba(51,102,255,.05);border-radius:0 6px 6px 0;color:#555}
table{border-collapse:collapse;margin:1em 0;width:100%}
th,td{border:1px solid #E6E6EB;padding:8px 12px;text-align:left}
th{background:#F6F6F8}
img{max-width:100%}
</style>
</head>
<body>
${this.renderedHtml}
</body>
</html>`
      downloadText('export.html', doc, 'text/html;charset=utf-8')
    },
    clearAll() {
      this.text = ''
      this.$refs.mdEditor.focus()
    }
  }
}
</script>

<style lang="scss" scoped>
.md-preview-body {
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

/* ============ Markdown 预览：GitHub 风格 + 主题变量适配 ============ */
.md-preview {
  padding: 18px 22px 28px;
  font-size: 14px;
  line-height: 1.75;
  color: var(--text-primary);
  word-break: break-word;

  ::v-deep {
    h1, h2, h3, h4, h5, h6 {
      margin: 1.15em 0 0.55em;
      font-weight: 700;
      line-height: 1.35;

      &:first-child {
        margin-top: 0.2em;
      }
    }

    h1 { font-size: 1.65em; padding-bottom: 0.35em; border-bottom: 1px solid var(--border-color); }
    h2 { font-size: 1.35em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border-color); }
    h3 { font-size: 1.18em; }
    h4 { font-size: 1.05em; }

    p { margin: 0.6em 0; }

    a {
      color: var(--primary-color);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    strong { font-weight: 700; }

    ul, ol {
      padding-left: 1.6em;
      margin: 0.5em 0;

      li { margin: 0.25em 0; }
      li::marker { color: var(--text-secondary); }
    }

    blockquote {
      margin: 0.9em 0;
      padding: 0.35em 1em;
      border-left: 3px solid var(--primary-color);
      background: rgba(var(--primary-color-rgb), 0.05);
      border-radius: 0 6px 6px 0;
      color: var(--text-secondary);

      p { margin: 0.35em 0; }
    }

    hr {
      border: none;
      border-top: 1px solid var(--border-color);
      margin: 1.6em 0;
    }

    code {
      background: var(--search-bg);
      padding: 2px 6px;
      border-radius: 5px;
      font-size: 0.88em;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      color: #C41A16;
    }

    pre {
      position: relative;
      margin: 0.9em 0;
      padding: 13px 15px;
      background: var(--search-bg);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      overflow: auto;

      code {
        display: block;
        background: none;
        padding: 0;
        border-radius: 0;
        color: var(--text-primary);
        font-size: 12.5px;
        line-height: 1.65;
        font-family: 'SF Mono', Menlo, Consolas, monospace;
      }
    }

    /* 代码块复制按钮 */
    .code-copy-btn {
      position: absolute;
      top: 7px;
      right: 7px;
      padding: 2px 9px;
      font-size: 11px;
      line-height: 1.5;
      color: var(--text-secondary);
      background: var(--card-bg);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      cursor: pointer;
      opacity: 0;
      transition: all 0.16s ease;
      user-select: none;

      &:hover {
        color: var(--primary-color);
        border-color: rgba(var(--primary-color-rgb), 0.5);
      }
    }

    pre:hover .code-copy-btn {
      opacity: 1;
    }

    table {
      border-collapse: collapse;
      margin: 1em 0;
      width: 100%;
      font-size: 13px;

      th, td {
        border: 1px solid var(--border-color);
        padding: 7px 12px;
        text-align: left;
      }

      th {
        background: var(--search-bg);
        font-weight: 600;
      }

      tr:hover td {
        background: rgba(var(--primary-color-rgb), 0.03);
      }
    }

    img { max-width: 100%; border-radius: 8px; }

    /* KaTeX 公式块滚动保护 */
    .katex-display {
      margin: 1em 0;
      overflow-x: auto;
      overflow-y: hidden;
      padding: 2px 0;
    }
  }
}

/* ---- 代码高亮配色（浅色） ---- */
.md-preview :deep(.hljs-keyword),
.md-preview :deep(.hljs-selector-tag),
.md-preview :deep(.hljs-meta-keyword){ color: #9B2393; }
.md-preview :deep(.hljs-string),
.md-preview :deep(.hljs-regexp){ color: #C41A16; }
.md-preview :deep(.hljs-number),
.md-preview :deep(.hljs-literal){ color: #1C00CF; }
.md-preview :deep(.hljs-comment){ color: #8A8A93; font-style: italic; }
.md-preview :deep(.hljs-title),
.md-preview :deep(.hljs-title.function_),
.md-preview :deep(.hljs-built_in){ color: #326D74; }
.md-preview :deep(.hljs-attr),
.md-preview :deep(.hljs-attribute),
.md-preview :deep(.hljs-variable),
.md-preview :deep(.hljs-template-variable){ color: #31595D; }
.md-preview :deep(.hljs-type),
.md-preview :deep(.hljs-class .hljs-title){ color: #6F42C1; }
.md-preview :deep(.hljs-tag){ color: #2F6F9F; }
.md-preview :deep(.hljs-name){ color: #2F6F9F; }

/* ---- 代码高亮配色（深色：One Dark） ---- */
html[data-theme='dark'] .md-preview :deep(.hljs-keyword),
html[data-theme='dark'] .md-preview :deep(.hljs-selector-tag),
html[data-theme='dark'] .md-preview :deep(.hljs-meta-keyword){ color: #C678DD; }
html[data-theme='dark'] .md-preview :deep(.hljs-string),
html[data-theme='dark'] .md-preview :deep(.hljs-regexp){ color: #98C379; }
html[data-theme='dark'] .md-preview :deep(.hljs-number),
html[data-theme='dark'] .md-preview :deep(.hljs-literal){ color: #D19A66; }
html[data-theme='dark'] .md-preview :deep(.hljs-comment){ color: #7F848E; }
html[data-theme='dark'] .md-preview :deep(.hljs-title),
html[data-theme='dark'] .md-preview :deep(.hljs-title.function_),
html[data-theme='dark'] .md-preview :deep(.hljs-built_in){ color: #61AFEF; }
html[data-theme='dark'] .md-preview :deep(.hljs-attr),
html[data-theme='dark'] .md-preview :deep(.hljs-attribute),
html[data-theme='dark'] .md-preview :deep(.hljs-variable),
html[data-theme='dark'] .md-preview :deep(.hljs-template-variable){ color: #E06C75; }
html[data-theme='dark'] .md-preview :deep(.hljs-type),
html[data-theme='dark'] .md-preview :deep(.hljs-class .hljs-title){ color: #E5C07B; }
html[data-theme='dark'] .md-preview :deep(.hljs-tag),
html[data-theme='dark'] .md-preview :deep(.hljs-name){ color: #E06C75; }
</style>
