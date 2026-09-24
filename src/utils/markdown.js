// 共享 Markdown 渲染器：对话气泡 / 工具页复用同一实例与配置
import MarkdownIt from 'markdown-it'

export const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// 代码块（fence）自定义渲染：带工具条（语言标记 + 复制按钮）的容器结构。
// 复制按钮为纯 span（v-html 内容不归 Vue 管理），点击由容器的
// 事件委托捕获（见 handleCodeCopy），渲染层与交互层解耦
md.renderer.rules.fence = (tokens, idx) => {
  const token = tokens[idx]
  const info = token.info ? token.info.trim() : ''
  const lang = info ? info.split(/\s+/)[0] : ''
  const esc = md.utils.escapeHtml
  const langAttr = lang ? ' class="language-' + esc(lang) + '"' : ''
  return '<div class="ob-code">' +
    '<div class="ob-code-head">' +
    '<span class="ob-code-lang">' + esc(lang || 'text') + '</span>' +
    '<span class="ob-code-copy" role="button" title="复制代码">复制</span>' +
    '</div>' +
    '<pre><code' + langAttr + '>' + esc(token.content) + '</code></pre>' +
    '</div>'
}

export function renderMarkdown(text) {
  try {
    return md.render(text || '')
  } catch (e) {
    return ''
  }
}

// 代码块复制按钮的事件委托处理：挂在 markdown 渲染容器的 click 上。
// 命中 .ob-code-copy 时取同块 pre>code 的纯文本写入剪贴板；
// 返回 Promise（true = 复制成功，false = 未命中按钮 / 复制失败），
// 提示（$message）由组件层按返回值弹出
export function handleCodeCopy(e) {
  const t = e.target
  if (!t || !t.closest) return Promise.resolve(false)
  const btn = t.closest('.ob-code-copy')
  if (!btn) return Promise.resolve(false)
  const box = btn.closest('.ob-code')
  const code = box && box.querySelector('pre code')
  const text = code ? code.textContent : ''
  if (!text || !navigator.clipboard || !navigator.clipboard.writeText) {
    return Promise.resolve(false)
  }
  return navigator.clipboard.writeText(text).then(() => true).catch(() => false)
}
