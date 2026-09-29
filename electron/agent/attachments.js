// OmniBuddy 附件管理（P1-7 多模态输入）
// 职责：
// - “+”选择 / 拖拽 / 粘贴文件 → 主进程落盘 <baseDir>/attachments/<id>.<ext>
//   （图片不复制，仍走 captures 截图管道：nativeImage 复用与 base64 读回）
// - 文本类（txt/md/code/json/csv/log…）与 PDF 抽取全文，发送时拼入 prompt
//   （pi prompt 仅支持 text + image 块，文本附件以引用块并入正文，回放自然一致）
// - meta {id,name,size,kind} 随消息落盘：kind=image|text|pdf，
//   image 时附 thumb（360px JPEG dataURL，渲染端零请求直显）
// - 抽取文本上限 200K 字符（防上下文爆炸），超出截断并提示
const path = require('path')
const fs = require('fs')

// pdf-parse 1.x 为 CJS，但入口有 debug 模式副作用（读 test 文件），
// 直接 require 其 lib 入口规避
let pdfParse = null
function loadPdfParse() {
  if (pdfParse !== null) return pdfParse
  try {
    // eslint-disable-next-line node/no-unpublished-require
    pdfParse = require('pdf-parse/lib/pdf-parse.js')
  } catch (e) {
    pdfParse = false
  }
  return pdfParse
}

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
const MAX_TEXT_CHARS = 200000
const MAX_FILE_BYTES = 50 * 1024 * 1024 // 50MB

function kindOf(name) {
  const ext = path.extname(String(name || '')).toLowerCase()
  if (ext === '.pdf') return 'pdf'
  if (IMAGE_EXTS.includes(ext)) return 'image'
  if (TEXT_EXTS.includes(ext)) return 'text'
  return ''
}

function newId() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
}

// 缩略图（图片附件用；nativeImage 由调用方 electron 传入，避免本模块依赖 electron）
function thumbOf(nativeImage, buffer) {
  try {
    const img = nativeImage.createFromBuffer(buffer)
    if (img.isEmpty()) return ''
    return img.resize({ width: 360 }).toJPEG(72).toDataURL()
  } catch (e) {
    return ''
  }
}

// 导入文件（系统选择框/拖拽路径）：落盘 + 生成 meta
// 返回 { ok, attachment } 或 { ok:false, error }
function importFile(filePath, nativeImage) {
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
      meta.thumb = nativeImage ? thumbOf(nativeImage, fs.readFileSync(dest), meta.mime) : ''
    }
    return { ok: true, attachment: meta }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

// 抽取文本（text 直读 / pdf 用 pdf-parse）
async function extractText(meta) {
  if (!meta || !meta.kind) return ''
  try {
    if (meta.kind === 'text') {
      return fs.readFileSync(meta.path, 'utf-8')
    }
    if (meta.kind === 'pdf') {
      const parse = loadPdfParse()
      if (!parse) return ''
      const buf = fs.readFileSync(meta.path)
      const r = await parse(buf)
      return String((r && r.text) || '')
    }
  } catch (e) {
    return ''
  }
  return ''
}

// 发送前把文本类附件拼成 prompt 引用块
async function buildTextBlock(attachments) {
  if (!Array.isArray(attachments) || !attachments.length) return ''
  const parts = []
  for (const a of attachments) {
    if (a.kind !== 'text' && a.kind !== 'pdf') continue
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
    const label = a.kind === 'pdf' ? 'PDF 文档' : '文本文件'
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

module.exports = { init, importFile, buildTextBlock, readBase64, kindOf }
