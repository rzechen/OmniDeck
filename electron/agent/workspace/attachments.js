// OmniBuddy 附件管理（多模态输入）
// 职责：
// - “+”选择 / 拖拽 / 粘贴文件 → 主进程落盘 <baseDir>/attachments/<id>.<ext>
//   （图片不复制，仍走 captures 截图管道：nativeImage 复用与 base64 读回）
// - 文本类（txt/md/code/json/csv/log…）直读；PDF / Office（docx/pptx/xlsx/
//   odt/odp/ods/odg/rtf/epub/tex/html）经 officeparser 抽取全文，
//   导入后异步预解析并缓存（豆包式“解析中”态：发送时直接复用缓存）
// - meta {id,name,size,kind} 随消息落盘：kind=image|text|pdf|office，
//   image 时附 thumb（360px JPEG dataURL，渲染端零请求直显）
// - 抽取文本上限 200K 字符（防上下文爆炸），超出截断并提示
const path = require('path')
const fs = require('fs')

// officeparser v8：parseOffice(buffer, config?) -> Promise<AST>，
// ast.to('text') -> Promise<{value}>；纯文本类（md/csv/txt/json）不经它
let parseOffice = null
function loadParseOffice() {
  if (parseOffice !== null) return parseOffice
  try {
    const op = require('officeparser')
    parseOffice = op.parseOffice || (op.OfficeParser && op.OfficeParser.parseOffice) || false
  } catch (e) {
    parseOffice = false
  }
  return parseOffice
}

// ===== 初始化与类型判定 =====
let attachmentsDir = ''

function init(baseDir) {
  attachmentsDir = path.join(baseDir, 'attachments')
  fs.mkdirSync(attachmentsDir, { recursive: true })
}

// 文件类型判定
const IMAGE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp']
const TEXT_EXTS = ['.txt', '.md', '.markdown', '.json', '.csv', '.log', '.yml', '.yaml',
  '.xml', '.html', '.htm', '.js', '.ts', '.jsx', '.tsx', '.vue', '.py', '.java', '.c',
  '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php', '.sh', '.bash', '.zsh',
  '.sql', '.css', '.scss', '.less', '.ini', '.conf', '.toml', '.env']
// officeparser 支持的结构化文档：路径扩展名 → fileType 提示（v8 从 buffer
// 解析 docx/pptx/xlsx 等 zip 类无需提示，rtf/epub/tex 按扩展名给 hint 更稳）
const OFFICE_EXTS = ['.docx', '.pptx', '.xlsx', '.odt', '.odp', '.ods', '.odg',
  '.pdf', '.rtf', '.epub', '.tex']
const OFFICE_HINT = {
  '.docx': 'docx', '.pptx': 'pptx', '.xlsx': 'xlsx',
  '.odt': 'odt', '.odp': 'odp', '.ods': 'ods', '.odg': 'odg',
  '.pdf': 'pdf', '.rtf': 'rtf', '.epub': 'epub', '.tex': 'tex'
}
const MAX_TEXT_CHARS = 200000
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50MB

function kindOf(name) {
  const ext = path.extname(String(name || '')).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (OFFICE_EXTS.includes(ext)) return 'office'
  if (TEXT_EXTS.includes(ext)) return 'text'
  return ''
}

function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

// ===== 导入与文本抽取 =====
// 导入文件（系统选择框/拖拽路径）：落盘 + 生成 meta
// 返回 { ok, attachment } 或 { ok:false, error }
// thumbFn(buffer) -> Promise<dataURL> 由调用方注入（index.js makeThumbFn）：
// utilityProcess 桥接模式下 nativeImage 缩略图须经主进程代生成（异步），主进程模式包 Promise 统一签名
async function importFile(filePath, thumbFn) {
  try {
    const abs = String(filePath || '')
    if (!abs) return { ok: false, error: '文件路径为空' }
    const name = path.basename(abs)
    const kind = kindOf(name)
    if (!kind) {
      return { ok: false, error: '不支持的文件类型：' + name + '（支持图片 / 文本 / PDF）' }
    }
    const st = fs.statSync(abs)
    if (!st.isFile()) return { ok: false, error: '不是文件：' + abs }
    if (st.size > MAX_FILE_BYTES) {
      return { ok: false, error: '文件过大（超过 50MB）：' + name }
    }
    const id = newId()
    const ext = path.extname(name).toLowerCase() || ''
    const dest = path.join(attachmentsDir, id + ext)
    fs.copyFileSync(abs, dest)

    const meta = { id, name, size: st.size, kind, path: dest }
    if (kind === 'image') {
      meta.mime = 'image/' + (ext === '.jpg' ? 'jpeg' : ext.slice(1))
      meta.thumb = thumbFn ? await thumbFn(fs.readFileSync(dest)) : ''
    }
    return { ok: true, attachment: meta }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

// MIME → 扩展名兜底（粘贴的剪贴板文件常无扩展名，如截图）
const MIME_EXTS = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'application/pdf': '.pdf',
  'text/plain': '.txt'
}

// 导入内存 Buffer（粘贴的截图/文件：无磁盘路径，渲染端读 File 内容传来）
// 返回 { ok, attachment } 或 { ok:false, error }；thumbFn 同 importFile
async function importBuffer(buffer, name, mime, thumbFn) {
  try {
    if (!buffer || !buffer.length) return { ok: false, error: '附件内容为空' }
    if (buffer.length > MAX_FILE_BYTES) {
      return { ok: false, error: '文件过大（超过 50MB）：' + (name || '剪贴板文件') }
    }
    let base = String(name || '').trim() || 'pasted-file'
    let ext = path.extname(base).toLowerCase()
    if (!ext) {
      // 无扩展名：按 MIME 兜底（截图名常为空或 image.png 之外的命名）
      ext = MIME_EXTS[String(mime || '').toLowerCase()] || ''
      base = base + ext
    }
    const kind = kindOf(base)
    if (!kind) {
      return { ok: false, error: '不支持的文件类型：' + base + '（支持图片 / 文本 / PDF）' }
    }
    const id = newId()
    const dest = path.join(attachmentsDir, id + ext)
    fs.writeFileSync(dest, buffer)

    const meta = { id, name: base, size: buffer.length, kind, path: dest }
    if (kind === 'image') {
      meta.mime = mime || 'image/' + (ext === '.jpg' ? 'jpeg' : ext.slice(1))
      meta.thumb = thumbFn ? await thumbFn(buffer) : ''
    } else if (kind === 'pdf') {
      meta.mime = 'application/pdf'
    }
    return { ok: true, attachment: meta }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

// ===== 解析缓存与预解析 =====
// id -> Promise<{text, chars}>：导入后渲染层立即触发 parseAttachment 预解析，
// 发送时 buildTextBlock 直接命中缓存（豆包式：解析耗时前置到导入阶段消化）
const parseCache = new Map()

// 抽取文本（text 直读 / pdf+office 用 officeparser）；
// 结果缓存（并发去重：同 id 只解析一次）
async function extractText(meta) {
  if (!meta || !meta.kind) return ''
  const key = meta.id || meta.path
  if (key && parseCache.has(key)) {
    const r = await parseCache.get(key)
    return r.text
  }
  const p = doExtract(meta)
  if (key) {
    parseCache.set(key, p)
    // 失败不缓存 Promise（允许发送时重试）；成功则永久缓存
    p.catch(() => { if (parseCache.get(key) === p) parseCache.delete(key) })
  }
  return (await p).text
}

async function doExtract(meta) {
  if (meta.kind === 'text') {
    return { text: fs.readFileSync(meta.path, 'utf-8') }
  }
  if (meta.kind === 'pdf' || meta.kind === 'office') {
    const parse = loadParseOffice()
    if (!parse) return { text: '' }
    const buf = fs.readFileSync(meta.path)
    const hint = OFFICE_HINT[path.extname(meta.path).toLowerCase()]
    const ast = await parse(buf, hint ? { fileType: hint } : undefined)
    const t = await ast.to('text')
    return { text: String((t && t.value) || '') }
  }
  return { text: '' }
}

// 预解析（渲染层导入附件后调用）：返回 {ok, chars} 供展示字符数；
// 解析失败返回 ok:false（前端标记失败态，发送时仍会重试一次）
async function parseAttachment(meta) {
  if (!meta || !meta.id || !meta.path) return { ok: false, error: '附件信息缺失' }
  try {
    const r = await extractText(meta)
    return { ok: !!r.trim(), chars: r.length }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

// 发送前把文本类附件拼成 prompt 引用块
async function buildTextBlock(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return ''
  const parts = []
  for (const a of attachments) {
    if (a.kind !== 'text' && a.kind !== 'pdf' && a.kind !== 'office') continue
    let text = await extractText(a)
    if (!text.trim()) {
      parts.push('[附件 ' + a.name + '：内容抽取失败或为空]')
      continue
    }
    let truncated = false
    if (text.length > MAX_TEXT_CHARS) {
      text = text.slice(0, MAX_TEXT_CHARS)
      truncated = true
    }
    const label = a.kind === 'pdf' ? 'PDF 文档' : a.kind === 'office' ? 'Office 文档' : '文本文件'
    parts.push(
      '<attachment name="' + a.name + '" type="' + label + '">\n' + text +
      '\n</attachment>' + (truncated ? '\n（注：' + a.name + ' 内容过长，已截断至前 200K 字符）' : '')
    )
  }
  return parts.join('\n\n')
}

// base64 读回（图片附件 pi image 块 / 回放用）：meta 带 path（导入时生成），
// 校验必须位于 attachmentsDir 内防路径穿越
function readBase64(meta) {
  if (!meta || !meta.path) return null
  const file = path.resolve(String(meta.path))
  if (!file.startsWith(attachmentsDir + path.sep)) return null
  try {
    if (!fs.existsSync(file)) return null
    return fs.readFileSync(file).toString('base64')
  } catch (e) {
    return null
  }
}

module.exports = {
  // 初始化附件目录
  init,
  // 导入文件并生成 meta
  importFile,
  // 导入内存 Buffer（粘贴）并生成 meta
  importBuffer,
  // 预解析附件文本（导入后调用，缓存结果供发送复用）
  parseAttachment,
  // 文本类附件拼 prompt 引用块
  buildTextBlock,
  // 附件 base64 读回
  readBase64,
  // 文件类型判定
  kindOf
}
