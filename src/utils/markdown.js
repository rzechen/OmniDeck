// 共享 Markdown 渲染器：对话气泡 / 工具页复用同一实例与配置
import MarkdownIt from 'markdown-it'

export const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

// 链接降级为纯文本：<a> 渲染为无属性 <span>（保留链接文字、去掉 href）。
// 对话气泡 / 思考区 / 详情弹窗 / 规则预览共用本渲染器，统一不出现可点击
// 链接（应用内点击外链会拉起系统浏览器，且伪链接曾致窗口白屏）
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  const token = tokens[idx]
  token.tag = 'span'
  token.attrs = []
  return self.renderToken(tokens, idx, options)
}

md.renderer.rules.link_close = (tokens, idx, options, env, self) => {
  tokens[idx].tag = 'span'
  return self.renderToken(tokens, idx, options)
}

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
    '<span class="ob-code-zoom" role="button" title="在右侧面板放大查看"></span>' +
    '<span class="ob-code-copy" role="button" title="复制代码">复制</span>' +
    '</div>' +
    '<pre><code' + langAttr + '>' + esc(token.content) + '</code></pre>' +
    '</div>'
}

// 表格自定义渲染：与代码块同款工具条容器（表格无语言标记，固定标识「表格」）。
// 注意：覆盖 table_open / table_close 后须自行补回 <table> 开闭标签
// （默认规则输出 <table> / </table>，内部 thead/tbody/tr/td 仍走默认渲染）
md.renderer.rules.table_open = () =>
  '<div class="ob-table">' +
  '<div class="ob-code-head">' +
  '<span class="ob-code-lang">表格</span>' +
  '<span class="ob-table-csv" role="button" title="下载 CSV">CSV</span>' +
  '<span class="ob-code-copy" role="button" title="复制表格">复制</span>' +
  '</div>' +
  '<table>'

md.renderer.rules.table_close = () => '</table></div>'

export function renderMarkdown(text) {
  try {
    return md.render(text || '')
  } catch (e) {
    return ''
  }
}

// 代码块 / 表格复制按钮的事件委托处理：挂在 markdown 渲染容器的 click 上。
// 命中 .ob-code-copy 时按所属容器取文本——代码块取 pre>code 纯文本，
// 表格取各行单元格（tab 分隔、行间换行，可直接粘贴进 Excel / 飞书表格）；
// 返回 Promise（true = 复制成功，false = 未命中按钮 / 复制失败），
// 提示（$message）由组件层按返回值弹出
// 提取表格数据为二维数组（行 → 单元格文本，空白折叠为单个空格）
function tableToRows(box) {
  const table = box.querySelector('table')
  const rows = []
  if (!table) return rows
  table.querySelectorAll('tr').forEach(tr => {
    const cells = []
    tr.querySelectorAll('th, td').forEach(c => {
      cells.push(c.textContent.replace(/\s+/g, ' ').trim())
    })
    if (cells.length) rows.push(cells)
  })
  return rows
}

function tableToText(box) {
  return tableToRows(box).map(r => r.join('\t')).join('\n')
}

// CSV 字段转义：含逗号 / 引号 / 换行时双引号包裹，内部引号翻倍
function csvEscape(v) {
  const s = String(v == null ? '' : v)
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// 表格下载 CSV 按钮的事件委托处理（与 handleCodeCopy 同挂于 markdown 容器 click）。
// UTF-8 BOM 头保证 Excel 打开中文不乱码；返回 Promise（true = 已触发下载）
export function handleTableCsv(e) {
  const t = e.target
  if (!t || !t.closest) return Promise.resolve(false)
  const btn = t.closest('.ob-table-csv')
  if (!btn) return Promise.resolve(false)
  const box = btn.closest('.ob-table')
  const rows = box ? tableToRows(box) : []
  if (!rows.length) return Promise.resolve(false)
  const csv = '\ufeff' + rows.map(r => r.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const ts = new Date()
  const p = n => (n < 10 ? '0' + n : '' + n)
  a.href = url
  a.download = '表格-' + ts.getFullYear() + p(ts.getMonth() + 1) + p(ts.getDate()) +
    '-' + p(ts.getHours()) + p(ts.getMinutes()) + p(ts.getSeconds()) + '.csv'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
  return Promise.resolve(true)
}

export function handleCodeCopy(e) {
  const t = e.target
  if (!t || !t.closest) return Promise.resolve(false)
  const btn = t.closest('.ob-code-copy')
  if (!btn) return Promise.resolve(false)
  let text = ''
  const tableBox = btn.closest('.ob-table')
  if (tableBox) {
    text = tableToText(tableBox)
  } else {
    const box = btn.closest('.ob-code')
    const code = box && box.querySelector('pre code')
    text = code ? code.textContent : ''
  }
  if (!text || !navigator.clipboard || !navigator.clipboard.writeText) {
    return Promise.resolve(false)
  }
  return navigator.clipboard.writeText(text).then(() => true).catch(() => false)
}
