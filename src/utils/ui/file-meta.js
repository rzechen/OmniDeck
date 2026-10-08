// 空间文件页共享的文件元信息：类型图标（PNG 素材）+ CodeMirror mode + 格式化工具
import imgFolder from '@/assets/icons/png/文件夹.png'
import imgWord from '@/assets/icons/png/word.png'
import imgExcel from '@/assets/icons/png/excel.png'
import imgPpt from '@/assets/icons/png/ppt.png'
import imgPdf from '@/assets/icons/png/pdf.png'
import imgTxt from '@/assets/icons/png/txt.png'
import imgImg from '@/assets/icons/png/img.png'
import imgVideo from '@/assets/icons/png/video.png'
import imgMusic from '@/assets/icons/png/muc.png'
import imgRar from '@/assets/icons/png/rar.png'
import imgOther from '@/assets/icons/png/other.png'

// 文件夹图标（面包屑等场景复用）
export const FOLDER_ICON = imgFolder

// 类型 → 图标
const KIND_ICON = {
  word: imgWord,
  excel: imgExcel,
  ppt: imgPpt,
  pdf: imgPdf,
  txt: imgTxt,
  img: imgImg,
  video: imgVideo,
  music: imgMusic,
  rar: imgRar,
  other: imgOther
}

// 扩展名 → { kind: 图标类型, mode: CodeMirror mode }
export const EXT_META = {
  // 文本 / 代码（可预览编辑）
  md: { kind: 'txt', mode: 'markdown' },
  markdown: { kind: 'txt', mode: 'markdown' },
  txt: { kind: 'txt', mode: 'text/plain' },
  log: { kind: 'txt', mode: 'text/plain' },
  json: { kind: 'txt', mode: 'application/json' },
  js: { kind: 'txt', mode: 'javascript' },
  mjs: { kind: 'txt', mode: 'javascript' },
  jsx: { kind: 'txt', mode: 'javascript' },
  ts: { kind: 'txt', mode: 'javascript' },
  tsx: { kind: 'txt', mode: 'javascript' },
  vue: { kind: 'txt', mode: 'javascript' },
  css: { kind: 'txt', mode: 'css' },
  scss: { kind: 'txt', mode: 'css' },
  less: { kind: 'txt', mode: 'css' },
  html: { kind: 'txt', mode: 'xml' },
  htm: { kind: 'txt', mode: 'xml' },
  xml: { kind: 'txt', mode: 'xml' },
  yml: { kind: 'txt', mode: 'yaml' },
  yaml: { kind: 'txt', mode: 'yaml' },
  sql: { kind: 'txt', mode: 'sql' },
  java: { kind: 'txt', mode: 'text/plain' },
  go: { kind: 'txt', mode: 'text/plain' },
  py: { kind: 'txt', mode: 'text/plain' },
  sh: { kind: 'txt', mode: 'text/plain' },
  c: { kind: 'txt', mode: 'text/plain' },
  cpp: { kind: 'txt', mode: 'text/plain' },
  rs: { kind: 'txt', mode: 'text/plain' },
  // 文档
  doc: { kind: 'word' },
  docx: { kind: 'word' },
  pdf: { kind: 'pdf' },
  ppt: { kind: 'ppt' },
  pptx: { kind: 'ppt' },
  // 表格
  xls: { kind: 'excel' },
  xlsx: { kind: 'excel' },
  csv: { kind: 'excel' },
  // 图片
  svg: { kind: 'img', mode: 'xml' },
  png: { kind: 'img' },
  jpg: { kind: 'img' },
  jpeg: { kind: 'img' },
  webp: { kind: 'img' },
  bmp: { kind: 'img' },
  ico: { kind: 'img' },
  gif: { kind: 'img' },
  // 音视频
  mp4: { kind: 'video' },
  mkv: { kind: 'video' },
  mov: { kind: 'video' },
  avi: { kind: 'video' },
  webm: { kind: 'video' },
  mp3: { kind: 'music' },
  wav: { kind: 'music' },
  flac: { kind: 'music' },
  aac: { kind: 'music' },
  m4a: { kind: 'music' },
  ogg: { kind: 'music' },
  // 压缩包
  zip: { kind: 'rar' },
  rar: { kind: 'rar' },
  '7z': { kind: 'rar' },
  tar: { kind: 'rar' },
  gz: { kind: 'rar' },
  bz2: { kind: 'rar' }
}

// 取扩展名（小写；点开头的隐藏文件无扩展名）
export function extOf(name) {
  const i = name.lastIndexOf('.')
  if (i <= 0) return ''
  return name.slice(i + 1).toLowerCase()
}

// 文件元信息（未知类型回退 other）
export function extMeta(name) {
  return EXT_META[extOf(name)] || { kind: 'other', mode: '' }
}

// 条目图标（文件夹 / 文件按类型）
export function iconOf(entry) {
  return entry.isDir ? FOLDER_ICON : fileIcon(entry.name)
}

// 文件名 → 类型图标
export function fileIcon(name) {
  return KIND_ICON[extMeta(name).kind] || imgOther
}

// 是否可预览的文本文件（已知文本类型，或无扩展名的小文件）
export function isTextEntry(entry) {
  if (entry.isDir) return false
  if (extMeta(entry.name).mode) return true
  return !entry.name.includes('.') && entry.size <= 512 * 1024
}

// CodeMirror mode（预览编辑用）
export function modeOf(name) {
  return extMeta(name).mode || 'text/plain'
}

// 体积可读化
export function formatSize(n) {
  if (!n) return '0 B'
  if (n < 1024) return n + ' B'
  if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
  if (n < 1024 * 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB'
  return (n / 1024 / 1024 / 1024).toFixed(2) + ' GB'
}

// 时间可读化（YYYY-MM-DD HH:mm）
export function formatTime(ms) {
  if (!ms) return '—'
  const d = new Date(ms)
  const p = v => String(v).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes())
}
