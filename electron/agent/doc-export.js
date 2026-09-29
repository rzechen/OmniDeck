// OmniBuddy 文档导出（P1）：pandoc 转换引擎封装 + doc_export 工具注册
// - 引擎：内置 pandoc（runtime/<plat>/pandoc/bin，provision 装配）→ 系统 PATH 回退
// - docx / html：pandoc 直转（docx 支持 --reference-doc 参考模板沿用公司样式）
// - pdf：pandoc → HTML → chrome-headless-shell --print-to-pdf（无 LaTeX 依赖，
//   中文按系统字体渲染；chrome-headless-shell 复用 playwright 装配）
// - 产物落 <当前目录>/exports/（重名自动加序号防覆盖），details.artifacts
//   结构化清单供前端产物卡片（打开 / 所在文件夹）
// 消息导出（MessageBubble hover → PDF/Word/HTML）与工具导出共用 convertMarkdown。
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawnSync } = require('child_process')
const runtime = require('./runtime')

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

// 公共转换入口（doc_export 工具与消息导出 IPC 共用）
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
      description: '把 Markdown 内容导出为正式文档（Word / PDF / HTML）。生成报告、方案、纪要、信函等交付文档时使用：先组织好完整 Markdown，再调用本工具产出文件，用户可直接打开或转发。',
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
            enum: ['docx', 'pdf', 'html'],
            description: '输出格式，默认 docx（Word）'
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
        const format = ['docx', 'pdf', 'html'].indexOf(p.format) >= 0 ? p.format : 'docx'
        // 文件名清洗（去扩展名 + 非法字符替换）
        const rawName = String(p.filename || '').trim()
        const stem = (rawName ? rawName.replace(/\.(docx|pdf|html|md)$/i, '') : defaultStem())
          .replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60) || defaultStem()
        const exportsDir = path.join(cwdState.dir, 'exports')
        fs.mkdirSync(exportsDir, { recursive: true })
        // 参考模板（相对路径解析）
        let refDoc = ''
        if (p.reference_doc && format === 'docx') {
          refDoc = path.isAbsolute(p.reference_doc) ? p.reference_doc : path.join(cwdState.dir, p.reference_doc)
        }
        const r = convertMarkdown(markdown, {
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

module.exports = { createDocExportExtension, convertMarkdown, pandocCmd, fmtSize }
