// 共享 Markdown 渲染器：对话气泡 / 工具页复用同一实例与配置
import MarkdownIt from 'markdown-it'
import { buddyApiSection } from '@/utils/buddy/buddy-api'
import { bus } from '@/utils/ui/bus'

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

// ===== 图片渲染：本地路径改走 dataURL 水合，杜绝裂图 =====
// 背景：agent（generate_image 工具 / 思考中引用产物路径）会写出
// ![alt](/Users/.../exports/xxx.png) 这类裸本地路径；dev 下页面 origin 为
// http://localhost:5173，src 被拼成 dev server 的 404 URL，必裂图。
// 方案：渲染期识别本地路径，不输出注定 404 的 <img>，改输出占位 span
// （带 data-ob-img 属性），由下方 MutationObserver 异步水合——
// 经 files.readImage IPC 读取 base64 dataURL 成功则替换为真图，
// 失败（不在工作区 / 文件不存在 / 超 8MB）降级为可点击的文件路径 chip，
// 点击唤起右栏产物预览（能看到失败的具体原因），而不是浏览器原生破图。
// 远程 http(s) 图片保持默认 <img> 直出，加载失败由 hydrate 阶段兜底降级 chip。

// 判定本地路径：Unix 绝对路径 / Windows 盘符路径 / file:// 协议
// （markdown-it 会对 src 做百分号编码：中文 / 空格 / 反斜杠会变成 %XX，
//  判定与归一化前先解码还原磁盘真实路径）
function isLocalPath(src) {
  let s = String(src || '')
  try { s = decodeURIComponent(s) } catch (e) { /* 保留原样 */ }
  return /^file:\/\//i.test(s) ||
    s.charAt(0) === '/' ||
    /^[a-zA-Z]:[\\/]/.test(s)
}

// 本地路径归一化：解码 + 剥掉 file:// 协议头（readImage 按磁盘路径读取）
function normalizeLocalPath(src) {
  let s = String(src || '')
  try { s = decodeURIComponent(s) } catch (e) { /* 保留原样 */ }
  if (/^file:\/\/\//i.test(s)) s = s.slice(8)
  else if (/^file:\/\//i.test(s)) s = s.slice(7)
  return s
}

// 占位元素（渲染期同步产出，水合期异步替换）：data-p 带归一化路径，
// data-n 带文件名（降级 chip 展示用），title 提示加载中
md.renderer.rules.image = (tokens, idx) => {
  const token = tokens[idx]
  const src = (token.attrGet('src') || '').trim()
  const alt = token.content || ''
  const esc = md.utils.escapeHtml
  if (src && !isLocalPath(src)) {
    // 远程图：默认 <img> 直出（data-ob-img 供水合阶段挂 error 兜底）
    return '<img class="ob-img" src="' + esc(src) + '" alt="' + esc(alt) + '" data-ob-img="r" loading="lazy" draggable="false" />'
  }
  const p = normalizeLocalPath(src)
  const name = p ? p.replace(/[\\/]+$/, '').split(/[\\/]/).pop() : ''
  return '<span class="ob-img-pending" data-ob-img="l" data-p="' + esc(p) + '" data-n="' + esc(name || alt) + '" title="加载本地图片…">' + esc(alt) + '</span>'
}

// ---- 水合（v-html 内容不归 Vue 管，全局 MutationObserver 兜住所有挂载点） ----
// 双保险：a) 占位 span（本地路径）经 IPC 读图成功 → 原地替换为 <img>；
// b) 远程 <img> 触发 error（断网 / 404 / 防盗链）→ 降级为路径 chip。
// thinking 流式期间节点不断重建，Observer 持续接管新节点；已水合节点
// 带 data-done 标记，替换 / 重建前不重复处理
let imgObserver = null

// 读图结果缓存（path → Promise）：流式渲染每 tick 重建 HTML，同一路径
// 反复水合会重复发起 IPC 读 8MB 图片；成功结果缓存复用（FIFO 上限 12 张
// 防 dataURL 撑爆内存），失败不缓存（文件后续生成时可重试）
const imgCache = new Map()
function readImageCached(p) {
  if (imgCache.has(p)) return imgCache.get(p)
  const files = buddyApiSection('files')
  const task = (files && files.readImage)
    ? files.readImage(p).catch(() => ({ ok: false }))
    : Promise.resolve(null)
  task.then(res => {
    if (res && res.ok) {
      if (imgCache.size >= 12) imgCache.delete(imgCache.keys().next().value)
    } else {
      imgCache.delete(p)
    }
  }).catch(() => imgCache.delete(p))
  imgCache.set(p, task)
  return task
}

// 单节点水合（占位 span / 远程 img 二选一）
function hydrateOne(node) {
  // 远程 img：error 兜底（once）；已在文档中加载失败的（监听挂上前 error
  // 已触发）直接降级
  if (node.tagName === 'IMG' && node.hasAttribute('data-ob-img') && !node.getAttribute('data-done')) {
    node.setAttribute('data-done', '1')
    if (node.complete && node.naturalWidth === 0) {
      return degradeToChip(node, node.getAttribute('src') || '', false)
    }
    node.addEventListener('error', () => degradeToChip(node, node.getAttribute('src') || '', false), { once: true })
    return
  }
  if (node.tagName !== 'SPAN' || !node.classList.contains('ob-img-pending')) return
  if (node.getAttribute('data-done')) return
  node.setAttribute('data-done', '1')
  const p = node.getAttribute('data-p') || ''
  if (!p) return degradeToChip(node, '', false)
  readImageCached(p).then(res => {
    // 节点可能已被流式重渲染移除：挂在文档外则放弃（重建节点会重新水合）
    if (!node.parentNode) return
    if (!res || !res.ok) return degradeToChip(node, p, true)
    const img = document.createElement('img')
    img.className = 'ob-img'
    img.src = res.src
    img.alt = node.textContent || ''
    img.draggable = false
    // dataURL 读取成功后文件仍可能被删：error 时同样降级 chip
    img.addEventListener('error', () => degradeToChip(img, p, true), { once: true })
    node.replaceWith(img)
  })
}

// 变更节点水合：自身 + 子孙（v-html 整块插入时占位 span 嵌套在 p / li 内，
// Observer 只报顶层节点，须扫子树）
function hydrateNode(node) {
  if (!node || node.nodeType !== 1) return
  hydrateOne(node)
  if (node.querySelectorAll) {
    node.querySelectorAll('.ob-img-pending, img[data-ob-img]').forEach(hydrateOne)
  }
}

// 降级：裂图改为可点击的文件路径 chip（点击唤起右栏产物预览，
// title 带失败原因提示）；path 为空 / 非本地时退化为纯文本标记
function degradeToChip(el, path, isLocal) {
  if (!el || !el.parentNode) return
  const chip = document.createElement('span')
  chip.className = 'ob-img-chip' + (isLocal ? ' local' : '')
  chip.setAttribute('role', 'button')
  if (path) {
    chip.setAttribute('title', isLocal ? '图片未能内联显示，点击在右侧面板查看：' + path : path)
    chip.setAttribute('data-path', path)
    chip.textContent = (isLocal ? '图片 ' : '远程图 ') + String(path).split(/[\\/]/).pop()
  } else {
    chip.setAttribute('title', '图片地址为空')
    chip.textContent = '图片不可用'
  }
  chip.addEventListener('click', () => {
    if (!path || !isLocal) return
    bus.emit('chat:artifact-preview', { path: path, name: String(path).split(/[\\/]/).pop() })
  })
  el.replaceWith(chip)
}

// 惰性启动全局观察器：首个占位节点出现时挂载（卸载无必要——渲染器为全局单例）
function ensureImgObserver() {
  if (imgObserver || typeof MutationObserver === 'undefined') return
  imgObserver = new MutationObserver(muts => {
    for (const m of muts) {
      m.addedNodes.forEach(hydrateNode)
    }
  })
  imgObserver.observe(document.body, { childList: true, subtree: true })
}

export function renderMarkdown(text) {
  try {
    const html = md.render(text || '')
    if (html.indexOf('data-ob-img') >= 0) ensureImgObserver()
    return html
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
