// OmniBuddy 文档导出：pandoc 转换引擎封装 + doc_export 工具注册
// - 引擎：内置 pandoc（runtime/<plat>/pandoc/bin，provision 装配）→ 系统 PATH 回退
// - docx / html：pandoc 直转（docx 支持 --reference-doc 参考模板沿用公司样式）
// - pdf：pandoc → HTML → chrome-headless-shell --print-to-pdf（无 LaTeX 依赖，
//   中文按系统字体渲染；chrome-headless-shell 复用 playwright 装配）
// - pptx：pptxgenjs 进程内生成（标题分页 + 表格分页，不依赖 pandoc）
// - xlsx：exceljs 进程内生成（Markdown 表格逐个落工作表，不依赖 pandoc）
// - 产物落 <当前目录>/exports/（重名自动加序号防覆盖），details.artifacts
//   结构化清单供前端产物卡片（打开 / 所在文件夹）
// 消息导出（MessageBubble hover → PDF/Word/HTML）与工具导出共用 convertMarkdown。
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawnSync } = require('child_process')
const runtime = require('../platform/runtime')

// ===== 转换引擎封装 =====
// pandoc 命令（内置优先，系统回退；未装配返回 '' 表示不可用）
function pandocCmd() {
  return runtime.pandocBin() || (runtime.probePandoc().source === 'system' ? 'pandoc' : '')
}

const PANDOC_TIMEOUT_MS = 30000
const CHROME_TIMEOUT_MS = 60000

// PDF 版式 CSS（A4 + 中文字体 + 基础排版；chrome --print-to-pdf 消费）
const PDF_CSS = `
@page { size: A4; margin: 18mm 16mm; }
body { font-family: -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif;
  font-size: 11pt; line-height: 1.7; color: #1d1d1f; }
h1 { font-size: 20pt; margin: 0 0 12pt; }
h2 { font-size: 15pt; margin: 16pt 0 8pt; }
h3 { font-size: 12.5pt; margin: 12pt 0 6pt; }
pre { background: #f5f5f7; border-radius: 6pt; padding: 8pt 10pt; font-size: 9.5pt;
  font-family: 'SF Mono', Menlo, Consolas, monospace; white-space: pre-wrap; word-break: break-all; }
code { font-family: 'SF Mono', Menlo, Consolas, monospace; font-size: 9.5pt;
  background: #f5f5f7; border-radius: 3pt; padding: 0 3pt; }
pre code { background: none; padding: 0; }
table { border-collapse: collapse; width: 100%; font-size: 10pt; }
th, td { border: 0.5pt solid #d2d2d7; padding: 5pt 8pt; text-align: left; }
th { background: #f5f5f7; }
blockquote { border-left: 2.5pt solid #0071e3; margin: 8pt 0; padding: 2pt 12pt; color: #6e6e73; }
img { max-width: 100%; }
a { color: #0066cc; }
`

// 执行 pandoc：input 经 stdin 传入（避免临时文件与引号转义问题）
// → { ok, stderr }（ok=false 时 stderr 为错误说明）
function runPandoc(args, input, timeoutMs) {
  const cmd = pandocCmd()
  if (!cmd) return { ok: false, stderr: 'pandoc 不可用（内置运行时未装配且系统 PATH 上无 pandoc）' }
  try {
    const r = spawnSync(cmd, args, {
      input: input || '',
      encoding: null, // Buffer 原始输出（'buffer' 非法 encoding 值会抛 Unknown encoding）
      timeout: timeoutMs || PANDOC_TIMEOUT_MS
    })
    if (r.status === 0) return { ok: true }
    const err = (r.stderr ? r.stderr.toString('utf-8') : '') || (r.stdout ? r.stdout.toString('utf-8') : '')
    return { ok: false, stderr: ('pandoc 退出码 ' + r.status + '：' + err).slice(0, 600) }
  } catch (e) {
    return { ok: false, stderr: 'pandoc 启动失败：' + e.message }
  }
}

// chrome-headless-shell 打印 PDF（html 文件 → pdf 文件）
function printPdf(htmlFile, outPath) {
  const chrome = runtime.chromeHeadlessBin()
  if (!chrome) return { ok: false, error: 'PDF 渲染引擎不可用（chrome-headless-shell 未装配）' }
  try {
    const r = spawnSync(chrome, [
      '--headless', '--disable-gpu', '--no-first-run',
      '--print-to-pdf=' + outPath,
      'file://' + htmlFile
    ], { timeout: CHROME_TIMEOUT_MS })
    if (r.status === 0 && fs.existsSync(outPath)) return { ok: true }
    const err = (r.stderr ? r.stderr.toString('utf-8') : '') || ''
    return { ok: false, error: ('PDF 渲染失败（退出码 ' + r.status + '）：' + err).slice(0, 600) }
  } catch (e) {
    return { ok: false, error: 'PDF 渲染引擎启动失败：' + e.message }
  }
}

// 重名防覆盖：存在则 <name>-1.<ext>、<name>-2.<ext> 递增
function uniquePath(p) {
  if (!fs.existsSync(p)) return p
  const dir = path.dirname(p)
  const ext = path.extname(p)
  const stem = path.basename(p, ext)
  for (let i = 1; i < 1000; i++) {
    const next = path.join(dir, stem + '-' + i + ext)
    if (!fs.existsSync(next)) return next
  }
  return p
}

// ===== pptx / xlsx 生成（pptxgenjs / exceljs，进程内，不依赖 pandoc）=====
// 轻量 Markdown 结构解析：标题层级 + 表格 + 列表 + 段落
// → [{ type:'h1'|'h2'|'h3', text } | { type:'table', rows: string[][] } | { type:'li', text } | { type:'p', text }]
function parseMdBlocks(md) {
  const lines = String(md || '').split(/\r?\n/)
  const blocks = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    const ht = line.match(/^(#{1,3})\s+(.*)$/)
    if (ht) {
      blocks.push({ type: 'h' + ht[1].length, text: ht[2].trim() })
      i++
      continue
    }
    // GFM 表格：| a | b | 后跟 |---|---|
    if (/^\s*\|.*\|\s*$/.test(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const rows = []
      const parseRow = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      rows.push(parseRow(line))
      i += 2
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        rows.push(parseRow(lines[i]))
        i++
      }
      blocks.push({ type: 'table', rows })
      continue
    }
    const li = line.match(/^\s*[-*+]\s+(.*)$/)
    if (li) {
      blocks.push({ type: 'li', text: li[1].trim() })
      i++
      continue
    }
    if (line.trim()) blocks.push({ type: 'p', text: line.trim() })
    i++
  }
  return blocks
}

// 去除行内 Markdown 标记（**加粗** / *斜体* / `code` / [链接](url)），供 PPT/Excel 单元格纯文本
function stripInline(s) {
  return String(s || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/`([^`]*)`/g, '$1')
    .trim()
}

// Markdown → pptx（pptxgenjs）：
// 首个 h1 = 封面标题；其后每个 h2 = 一页（正文要点/段落），h3 = 要点加粗行；
// 独立表格（不在 h2 小节内）单独成页；无 h2 时按 h3/段落聚合分页
async function convertToPptx(markdown, outPath, title) {
  let PptxGenJS
  try {
    PptxGenJS = require('pptxgenjs')
  } catch (e) {
    return { ok: false, error: 'pptxgenjs 不可用：' + e.message }
  }
  const blocks = parseMdBlocks(markdown)
  if (!blocks.length) return { ok: false, error: '内容为空，无法生成 PPT' }
  const pptx = new PptxGenJS()
  pptx.layout = 'LAYOUT_16x9'
  pptx.title = title || 'OmniDeck 文档'
  // 简洁商务主题色（与消息导出 PDF 版式同族）
  const C = { primary: '1F3864', accent: '2E75B6', text: '333333', muted: '666666', bg: 'FFFFFF' }

  const firstH1 = blocks.find(b => b.type === 'h1')
  const docTitle = stripInline(firstH1 ? firstH1.text : title || '文档')
  // 封面
  {
    const s = pptx.addSlide()
    s.background = { color: C.bg }
    s.addText(docTitle, { x: 0.5, y: 2.2, w: 9, h: 1.2, fontSize: 40, bold: true, color: C.primary, align: 'center' })
    const d = new Date()
    s.addText(`${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日`, { x: 0.5, y: 3.7, w: 9, h: 0.5, fontSize: 14, color: C.muted, align: 'center' })
    s.addShape('rect', { x: 4.1, y: 3.5, w: 1.8, h: 0.03, fill: { color: C.accent } })
  }

  // h2 分节成页；h2 前的散块（表格/列表/段落）各自成页归入"概述"
  const sections = [] // { title, items: [{type,text|rows}] }
  let cur = null
  const flush = () => { if (cur && cur.items.length) sections.push(cur); cur = null }
  for (const b of blocks) {
    if (b.type === 'h2') {
      flush()
      cur = { title: stripInline(b.text), items: [] }
    } else if (b.type === 'h1') {
      continue // 封面已用
    } else {
      if (!cur) cur = { title: '概述', items: [] }
      cur.items.push(b)
    }
  }
  flush()

  const addBulletsSlide = (pageTitle, items) => {
    const s = pptx.addSlide()
    s.addText(pageTitle, { x: 0.55, y: 0.35, w: 8.9, h: 0.6, fontSize: 26, bold: true, color: C.primary })
    s.addShape('rect', { x: 0.58, y: 1.05, w: 0.55, h: 0.035, fill: { color: C.accent } })
    const bullets = []
    for (const it of items) {
      if (it.type === 'table') {
        // 表格项单独成页处理（先排完列表再补）
        continue
      }
      const text = stripInline(it.text)
      if (!text) continue
      if (it.type === 'h3') bullets.push({ text, options: { bold: true, color: C.primary, fontSize: 15, breakLine: true } })
      else bullets.push({ text: it.type === 'li' ? '• ' + text : text, options: { fontSize: 13.5, color: C.text, breakLine: true } })
    }
    if (bullets.length) s.addText(bullets, { x: 0.7, y: 1.35, w: 8.6, h: 3.9, valign: 'top', lineSpacingMultiple: 1.35 })
    return s
  }

  const addTableSlide = (pageTitle, rows) => {
    const s = pptx.addSlide()
    s.addText(pageTitle, { x: 0.55, y: 0.35, w: 8.9, h: 0.6, fontSize: 26, bold: true, color: C.primary })
    s.addShape('rect', { x: 0.58, y: 1.05, w: 0.55, h: 0.035, fill: { color: C.accent } })
    const header = rows[0].map(c => stripInline(c))
    const body = rows.slice(1).map(r => r.map(c => stripInline(c)))
    // 超长表格分页（每页最多 11 行正文）
    const MAX_ROWS = 11
    const chunks = []
    for (let i = 0; i < Math.max(body.length, 1); i += MAX_ROWS) chunks.push(body.slice(i, i + MAX_ROWS))
    let first = true
    for (const chunk of chunks) {
      const slide = first ? s : pptx.addSlide()
      if (!first) {
        slide.addText(pageTitle, { x: 0.55, y: 0.35, w: 8.9, h: 0.6, fontSize: 26, bold: true, color: C.primary })
        slide.addShape('rect', { x: 0.58, y: 1.05, w: 0.55, h: 0.035, fill: { color: C.accent } })
      }
      const tableRows = [header.map(h => ({ text: h, options: { bold: true, color: 'FFFFFF', fill: { color: C.accent } } }))]
        .concat(chunk.map(r => r.map(c => ({ text: c, options: { color: C.text } }))))
      slide.addTable(tableRows,
        { x: 0.55, y: 1.3, w: 8.9, fontSize: 12, border: { pt: 0.5, color: 'D9D9D9' }, valign: 'middle' })
      first = false
    }
  }

  for (const sec of sections) {
    const tables = sec.items.filter(b => b.type === 'table')
    const others = sec.items.filter(b => b.type !== 'table')
    if (others.length || !tables.length) addBulletsSlide(sec.title, others)
    for (const t of tables) addTableSlide(sec.title, t.rows)
  }

  try {
    await pptx.writeFile({ fileName: outPath })
    return { ok: true, filePath: outPath }
  } catch (e) {
    return { ok: false, error: 'PPT 生成失败：' + e.message }
  }
}

// Markdown → xlsx（exceljs）：
// 每个 h2 小节 = 一个工作表（无 h2 时全部入"Sheet1"）；表格写入单元格（首行加粗表头），
// 列表/段落按行写入 A 列；多个表格顺序下移，表间空一行
async function convertToXlsx(markdown, outPath, title) {
  let ExcelJS
  try {
    ExcelJS = require('exceljs')
  } catch (e) {
    return { ok: false, error: 'exceljs 不可用：' + e.message }
  }
  const blocks = parseMdBlocks(markdown)
  if (!blocks.length) return { ok: false, error: '内容为空，无法生成 Excel' }
  const wb = new ExcelJS.Workbook()
  wb.creator = 'OmniDeck'
  wb.title = title || 'OmniDeck 文档'

  // 按 h2 切组（复用 convertToPptx 的语义）
  const sections = []
  let cur = null
  for (const b of blocks) {
    if (b.type === 'h2') {
      cur = { title: stripInline(b.text), items: [] }
      sections.push(cur)
    } else {
      if (!cur) { cur = { title: 'Sheet1', items: [] }; sections.push(cur) }
      cur.items.push(b)
    }
  }
  const used = new Set()
  for (const sec of sections) {
    // 工作表名唯一化（Excel 限制 31 字符 + 不允许 []:*?/\）
    let name = sec.title.replace(/[[\]:*?/\\]/g, '-').slice(0, 31) || 'Sheet'
    let n = 1
    while (used.has(name)) name = sec.title.replace(/[[\]:*?/\\]/g, '-').slice(0, 28) + '-' + (n++)
    used.add(name)
    const ws = wb.addWorksheet(name)
    let rowIdx = 1
    for (const b of sec.items) {
      if (b.type === 'h1') continue
      if (b.type === 'table') {
        for (let ri = 0; ri < b.rows.length; ri++) {
          const row = ws.getRow(rowIdx)
          b.rows[ri].forEach((cell, ci) => {
            const c = row.getCell(ci + 1)
            c.value = stripInline(cell)
            if (ri === 0) { c.font = { bold: true }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDEEBF7' } } }
          })
          rowIdx++
        }
        rowIdx++ // 表后空行
        continue
      }
      const text = stripInline(b.text)
      if (!text) continue
      const c = ws.getRow(rowIdx).getCell(1)
      if (b.type === 'h3') { c.value = text; c.font = { bold: true, size: 12 } }
      else if (b.type === 'li') c.value = '• ' + text
      else c.value = text
      rowIdx++
    }
    // 自适应列宽（按内容长度粗略估算，中文按 2 倍宽）
    const widths = []
    ws.eachRow(row => {
      row.eachCell({ includeEmpty: false }, (cell, col) => {
        const s = String(cell.value || '')
        const w = [...s].reduce((a, ch) => a + (/[\u4e00-\u9fa5]/.test(ch) ? 2 : 1), 0) + 2
        widths[col] = Math.min(Math.max(widths[col] || 8, w), 50)
      })
    })
    for (let ci = 1; ci < widths.length; ci++) {
      if (widths[ci]) ws.getColumn(ci).width = widths[ci]
    }
  }
  try {
    await wb.xlsx.writeFile(outPath)
    return { ok: true, filePath: outPath }
  } catch (e) {
    return { ok: false, error: 'Excel 生成失败：' + e.message }
  }
}

// 公共转换入口（doc_export 工具与消息导出 IPC 共用）：
// docx/pdf/html 走 pandoc（同步）；pptx/xlsx 走 pptxgenjs/exceljs（异步，不依赖 pandoc）
// opts: { format: 'docx'|'pdf'|'html'|'pptx'|'xlsx', outPath, referenceDoc, title }
// → { ok, filePath?, error?, note? }
async function convertDocument(markdown, opts) {
  const o = opts || {}
  if (o.format === 'pptx') {
    const out = uniquePath(o.outPath)
    return convertToPptx(markdown, out, o.title)
  }
  if (o.format === 'xlsx') {
    const out = uniquePath(o.outPath)
    return convertToXlsx(markdown, out, o.title)
  }
  return convertMarkdown(markdown, opts)
}

// pandoc 系（docx/pdf/html）公共转换入口
// opts: { format: 'docx'|'pdf'|'html', outPath, referenceDoc, title }
// → { ok, filePath?, error?, note? }
function convertMarkdown(markdown, opts) {
  const o = opts || {}
  const format = o.format === 'pdf' || o.format === 'html' ? o.format : 'docx'
  const outPath = uniquePath(o.outPath)
  if (!pandocCmd()) {
    return { ok: false, error: 'pandoc 不可用：内置运行时未装配（重新运行 scripts/provision-runtime.sh install 可补装配），系统 PATH 上也未检测到 pandoc' }
  }
  if (format === 'docx') {
    const args = ['-f', 'markdown', '-t', 'docx', '-o', outPath]
    // 参考模板：显式指定优先，否则自动查找当前目录下的 template.docx / 模板.docx
    const ref = o.referenceDoc && fs.existsSync(o.referenceDoc) ? o.referenceDoc : ''
    const autoRef = !ref ? ['template.docx', '模板.docx']
      .map(f => path.join(path.dirname(outPath), '..', f))
      .find(f => fs.existsSync(f)) || '' : ''
    if (ref || autoRef) args.push('--reference-doc=' + (ref || autoRef))
    const r = runPandoc(args, markdown)
    if (!r.ok) return { ok: false, error: r.stderr }
    return { ok: true, filePath: outPath, note: (ref || autoRef) ? '已沿用参考模板' : '' }
  }
  if (format === 'html') {
    const args = ['-f', 'markdown', '-t', 'html5', '-s',
      '--metadata', 'charset=utf-8',
      '--metadata', 'title=' + (o.title || 'OmniDeck 文档'),
      '--embed-resources', '-o', outPath]
    const r = runPandoc(args, markdown)
    if (!r.ok) return { ok: false, error: r.stderr }
    return { ok: true, filePath: outPath }
  }
  // pdf：pandoc → HTML（注入版式 CSS）→ chrome-headless-shell 打印
  let html = ''
  try {
    const r = spawnSync(pandocCmd(), ['-f', 'markdown', '-t', 'html5', '--metadata', 'charset=utf-8'], {
      input: markdown, encoding: 'utf-8', timeout: PANDOC_TIMEOUT_MS
    })
    if (r.status !== 0) return { ok: false, error: '内容转换失败：' + (r.stderr || '').slice(0, 400) }
    html = r.stdout || ''
  } catch (e) {
    return { ok: false, error: 'pandoc 启动失败：' + e.message }
  }
  const tmpHtml = path.join(os.tmpdir(), 'omnideck-export-' + Date.now() + '.html')
  fs.writeFileSync(tmpHtml, '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' + PDF_CSS + '</style></head><body>' + html + '</body></html>', 'utf-8')
  try {
    const r = printPdf(tmpHtml, outPath)
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, filePath: outPath }
  } finally {
    try { fs.unlinkSync(tmpHtml) } catch (e) { /* 临时文件清理失败无害 */ }
  }
}

// ===== 辅助函数 =====
// 默认输出名：文档-<yyyymmdd-HHmmss>
function defaultStem() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `文档-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
}

// 文件大小人性化
function fmtSize(n) {
  const v = Number(n) || 0
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB'
  if (v >= 1024) return (v / 1024).toFixed(1) + ' KB'
  return v + ' B'
}

// ===== doc_export 工具（pi 扩展工厂）=====
// cwdState：会话级当前目录（cd 可变；产物落 <cwd>/exports/）
function createDocExportExtension(cwdState) {
  return function docExportExtension(piApi) {
    piApi.registerTool({
      name: 'doc_export',
      label: '导出文档',
      description: '把 Markdown 内容导出为正式文档（Word / PDF / PPT / Excel / HTML）。生成报告、方案、纪要、信函、汇报演示、数据表格等交付文档时使用：先组织好完整 Markdown，再调用本工具产出文件，用户可直接打开或转发。PPT/Excel 由 Markdown 结构自动排版（h2 分页/分表、表格落页/落表）。',
      parameters: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            description: '要导出的 Markdown 全文（与 file_path 二选一，优先使用）'
          },
          file_path: {
            type: 'string',
            description: '已写好的 .md 文件路径（相对当前目录）；与 content 二选一'
          },
          format: {
            type: 'string',
            enum: ['docx', 'pdf', 'pptx', 'xlsx', 'html'],
            description: "输出格式，默认 docx（Word）；pptx=演示文稿（h2 小节自动分页、表格成页），xlsx=电子表格（h2 小节自动分工作表、表格落单元格）"
          },
          filename: {
            type: 'string',
            description: "输出文件名（不含扩展名，默认'文档-时间戳'）；文件输出到当前目录的 exports/ 下"
          },
          reference_doc: {
            type: 'string',
            description: 'docx 参考模板路径（沿用其样式与页面设置）；缺省时自动使用当前工作目录下的 template.docx / 模板.docx（若存在）'
          }
        }
      },
      execute: async (_id, params) => {
        const p = params || {}
        // 内容来源：content 直传 or file_path 读取（相对 cwdState.dir 解析）
        let markdown = typeof p.content === 'string' ? p.content : ''
        if (!markdown && p.file_path) {
          const src = path.isAbsolute(p.file_path) ? p.file_path : path.join(cwdState.dir, p.file_path)
          if (!fs.existsSync(src)) {
            return { content: [{ type: 'text', text: '导出失败：源文件不存在 ' + src }], details: { isError: true } }
          }
          markdown = fs.readFileSync(src, 'utf-8')
        }
        if (!markdown.trim()) {
          return { content: [{ type: 'text', text: '导出失败：内容为空（content 或 file_path 至少提供一项）' }], details: { isError: true } }
        }
        const format = ['docx', 'pdf', 'pptx', 'xlsx', 'html'].indexOf(p.format) >= 0 ? p.format : 'docx'
        // 文件名清洗（去扩展名 + 非法字符替换）
        const rawName = String(p.filename || '').trim()
        const stem = (rawName ? rawName.replace(/\.(docx|pdf|pptx|xlsx|html|md)$/i, '') : defaultStem())
          .replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || defaultStem()
        const exportsDir = path.join(cwdState.dir, 'exports')
        fs.mkdirSync(exportsDir, { recursive: true })
        // 参考模板（相对路径解析）
        let refDoc = ''
        if (p.reference_doc && format === 'docx') {
          refDoc = path.isAbsolute(p.reference_doc) ? p.reference_doc : path.join(cwdState.dir, p.reference_doc)
        }
        const r = await convertDocument(markdown, {
          format,
          outPath: path.join(exportsDir, stem + '.' + format),
          referenceDoc: refDoc,
          title: stem
        })
        if (!r.ok) {
          return { content: [{ type: 'text', text: '导出失败：' + r.error }], details: { isError: true } }
        }
        let size = 0
        try { size = fs.statSync(r.filePath).size } catch (e) { /* 读大小失败不阻断 */ }
        const artifact = { path: r.filePath, name: path.basename(r.filePath), format, size, sizeText: fmtSize(size) }
        const text = `已导出 ${format.toUpperCase()} 文档：${r.filePath}（${artifact.sizeText}${r.note ? '，' + r.note : ''}），可在会话产物卡片中打开或查看所在文件夹。`
        return {
          content: [{ type: 'text', text }],
          details: { artifacts: [artifact] }
        }
      }
    })
  }
}

module.exports = {
  // doc_export 工具扩展工厂（pi.js 注册用）
  createDocExportExtension,
  // Markdown → docx / pdf / pptx / xlsx / html 公共转换入口（工具与消息导出共用）
  convertDocument,
  // pandoc 系（docx/pdf/html）转换入口（消息导出 IPC 沿用）
  convertMarkdown,
  // 当前可用的 pandoc 命令（不可用返回 ''）
  pandocCmd,
  // 文件大小人性化（KB / MB）
  fmtSize
}
