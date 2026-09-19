// 共享 Markdown 渲染器：对话气泡 / 工具页复用同一实例与配置
import MarkdownIt from 'markdown-it'

export const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

export function renderMarkdown(text) {
  try {
    return md.render(text || '')
  } catch (e) {
    return ''
  }
}
