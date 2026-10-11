// OmniBuddy 空间文件管理（网盘风格）：目录浏览 + 常规文件/文件夹操作
// 安全约束：所有路径操作限定在已登记的工作空间目录（含内部默认目录）内，
// 防止渲染进程经 IPC 越权访问任意本地路径。
const path = require('path')
const fs = require('fs')
const { dialog, shell } = require('electron')
const workspaces = require('./workspaces')

// 文本预览上限：超过则提示用系统应用打开
const MAX_READ_SIZE = 512 * 1024

let baseDir = ''
let defaultDir = '' // 兼容字段（历史引用）：不作为可访问根目录
let getWindow = null

// ===== 初始化与路径安全 =====
function init(dir, getWin) {
  baseDir = dir
  defaultDir = ''
  getWindow = getWin
}

// 允许访问的根目录集合（仅已登记工作空间；默认工作空间已移除）
function allowedRoots() {
  return workspaces.list().map(w => w.path)
}

// 校验并归一化路径：必须位于某个允许的根目录之下
function safePath(p) {
  const abs = path.resolve(String(p || ''))
  const ok = allowedRoots().some(r => abs === r || abs.startsWith(r + path.sep))
  return ok ? abs : null
}

// 合法名称：非空且不含路径分隔符与特殊目录
function validName(name) {
  const n = String(name || '').trim()
  if (!n || n === '.' || n === '..' || /[\\/]/.test(n)) return null
  return n
}

// 同名冲突时自动追加序号（导入文件用）
function uniquePath(dir, name) {
  let target = path.join(dir, name)
  if (!fs.existsSync(target)) return target
  const ext = path.extname(name)
  const base = path.basename(name, ext)
  for (let i = 2; ; i++) {
    target = path.join(dir, base + ' ' + i + ext)
    if (!fs.existsSync(target)) return target
  }
}

// ===== 目录浏览 =====
// 目录列表：返回全部条目（含隐藏），隐藏与否由前端按开关键控
function list(dir) {
  const abs = safePath(dir)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  let names
  try {
    names = fs.readdirSync(abs, { withFileTypes: true })
  } catch (e) {
    return { ok: false, error: '读取目录失败：' + e.message }
  }
  const entries = []
  for (const d of names) {
    const full = path.join(abs, d.name)
    let stat = null
    try {
      stat = fs.statSync(full)
    } catch (e) {
      continue // 无权限或已消失的条目跳过
    }
    entries.push({
      name: d.name,
      isDir: stat.isDirectory(),
      size: stat.isFile() ? stat.size : 0,
      mtime: stat.mtimeMs,
      hidden: d.name.startsWith('.') || d.name.startsWith('$')
    })
  }
  // 文件夹在前，名称本地化排序（数字感知）
  entries.sort((a, b) => (b.isDir - a.isDir) || a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true }))
  return { ok: true, entries }
}

// ===== 新建与重命名 =====
function mkdir(dir, name) {
  const abs = safePath(dir)
  const n = validName(name)
  if (!abs || !n) return { ok: false, error: '名称不合法' }
  const target = path.join(abs, n)
  if (fs.existsSync(target)) return { ok: false, error: '同名项目已存在' }
  try {
    fs.mkdirSync(target)
  } catch (e) {
    return { ok: false, error: '创建失败：' + e.message }
  }
  return { ok: true }
}

function createFile(dir, name) {
  const abs = safePath(dir)
  const n = validName(name)
  if (!abs || !n) return { ok: false, error: '名称不合法' }
  const target = path.join(abs, n)
  if (fs.existsSync(target)) return { ok: false, error: '同名项目已存在' }
  try {
    fs.writeFileSync(target, '', { flag: 'wx' })
  } catch (e) {
    return { ok: false, error: '创建失败：' + e.message }
  }
  return { ok: true }
}

function rename(oldPath, newName) {
  const abs = safePath(oldPath)
  const n = validName(newName)
  if (!abs || !n) return { ok: false, error: '名称不合法' }
  if (!fs.existsSync(abs)) return { ok: false, error: '原路径不存在' }
  const target = path.join(path.dirname(abs), n)
  if (target !== abs && fs.existsSync(target)) return { ok: false, error: '同名项目已存在' }
  try {
    fs.renameSync(abs, target)
  } catch (e) {
    return { ok: false, error: '重命名失败：' + e.message }
  }
  return { ok: true }
}

// ===== 删除 =====
// 删除：移入系统废纸篓（可恢复，不直接物理删除）
async function trash(p) {
  const abs = safePath(p)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  try {
    await shell.trashItem(abs)
  } catch (e) {
    return { ok: false, error: '删除失败：' + e.message }
  }
  return { ok: true }
}

// 批量删除：逐个移入废纸篓（多选删除），单项失败不中断整体，返回成功数
async function trashBatch(paths) {
  const list = Array.isArray(paths) ? paths.filter(Boolean) : []
  if (!list.length) return { ok: false, error: '未指定要删除的项目' }
  let count = 0
  let firstError = ''
  for (const p of list) {
    const abs = safePath(p)
    if (!abs) {
      if (!firstError) firstError = '路径不在已关联的空间目录内'
      continue
    }
    try {
      await shell.trashItem(abs)
      count++
    } catch (e) {
      if (!firstError) firstError = e.message
    }
  }
  if (!count) return { ok: false, error: '删除失败：' + (firstError || '未知错误') }
  return { ok: true, count, error: count < list.length ? '部分项目删除失败：' + firstError : '' }
}

// 清空空间：仅允许清空工作空间根目录（防误清子目录），全部内容移入废纸篓
async function empty(dir) {
  const abs = safePath(dir)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  // 限定根目录：清空动作只针对空间本身，避免在深层子目录误触清空
  if (!allowedRoots().some(r => abs === r)) {
    return { ok: false, error: '仅支持清空工作空间根目录' }
  }
  let names
  try {
    names = fs.readdirSync(abs)
  } catch (e) {
    return { ok: false, error: '读取目录失败：' + e.message }
  }
  let count = 0
  let firstError = ''
  for (const name of names) {
    try {
      await shell.trashItem(path.join(abs, name))
      count++
    } catch (e) {
      if (!firstError) firstError = e.message
    }
  }
  if (!count && names.length) return { ok: false, error: '清空失败：' + firstError }
  return { ok: true, count, error: count < names.length ? '部分项目删除失败：' + firstError : '' }
}

// ===== 内容读写 =====
// 读取文本内容（小文件 + 简单二进制嗅探）
function read(p) {
  const abs = safePath(p)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  let stat
  try {
    stat = fs.statSync(abs)
  } catch (e) {
    return { ok: false, error: '文件不存在' }
  }
  if (stat.isDirectory()) return { ok: false, error: '不支持预览文件夹' }
  if (stat.size > MAX_READ_SIZE) return { ok: false, tooLarge: true, error: '文件超过 512KB，请使用系统应用打开' }
  let buf
  try {
    buf = fs.readFileSync(abs)
  } catch (e) {
    return { ok: false, error: '读取失败：' + e.message }
  }
  for (let i = 0; i < Math.min(buf.length, 1024); i++) {
    if (buf[i] === 0) return { ok: false, binary: true, error: '二进制文件，请使用系统应用打开' }
  }
  return { ok: true, content: buf.toString('utf-8'), size: stat.size, mtime: stat.mtimeMs }
}

// 读取图片为 base64 dataURL（右栏产物预览用）：文本读取 read 的二进制嗅探会拒绝
// 图片，故单独走本通道（按扩展名白名单 + 8MB 上限）
const MAX_IMAGE_SIZE = 8 * 1024 * 1024
const IMAGE_MIME = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml'
}

function readImage(p) {
  const abs = safePath(p)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  let stat
  try {
    stat = fs.statSync(abs)
  } catch (e) {
    return { ok: false, error: '文件不存在' }
  }
  if (stat.isDirectory()) return { ok: false, error: '不支持预览文件夹' }
  const mime = IMAGE_MIME[path.extname(abs).toLowerCase()]
  if (!mime) return { ok: false, error: '不支持的图片格式' }
  if (stat.size > MAX_IMAGE_SIZE) return { ok: false, tooLarge: true, error: '图片超过 8MB，请使用系统应用打开' }
  let buf
  try {
    buf = fs.readFileSync(abs)
  } catch (e) {
    return { ok: false, error: '读取失败：' + e.message }
  }
  return { ok: true, src: 'data:' + mime + ';base64,' + buf.toString('base64'), size: stat.size }
}

function write(p, content) {
  const abs = safePath(p)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  try {
    fs.writeFileSync(abs, String(content == null ? '' : content), 'utf-8')
  } catch (e) {
    return { ok: false, error: '保存失败：' + e.message }
  }
  return { ok: true }
}

// ===== 交付物预览（阶段二：docx / pdf 站内预览通道）=====
// docx → HTML：mammoth 半语义转换（标题/列表/表格/加粗斜体，图片转 dataURL），
// 右栏预览 iframe 只读渲染；30MB 上限防内存失控
const MAX_DOCX_SIZE = 30 * 1024 * 1024
async function readDocx(p) {
  const abs = safePath(p)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  let stat
  try {
    stat = fs.statSync(abs)
  } catch (e) {
    return { ok: false, error: '文件不存在' }
  }
  if (stat.isDirectory()) return { ok: false, error: '不支持预览文件夹' }
  if (path.extname(abs).toLowerCase() !== '.docx') return { ok: false, error: '仅支持 .docx 预览' }
  if (stat.size > MAX_DOCX_SIZE) return { ok: false, tooLarge: true, error: '文档超过 30MB，请使用系统应用打开' }
  let mammoth
  try {
    mammoth = require('mammoth')
  } catch (e) {
    return { ok: false, error: '预览组件未安装' }
  }
  try {
    const buf = fs.readFileSync(abs)
    // styleMap：p[style-name='Heading 1'] → h1 等（pandoc 导出的 docx 样式名兼容）
    const r = await mammoth.convertToHtml({ buffer: buf }, {
      styleMap: [
        "p[style-name='Title'] => h1:fresh",
        "p[style-name='Subtitle'] => h2:fresh",
        "p[style-name='Heading 1'] => h1:fresh",
        "p[style-name='Heading 2'] => h2:fresh",
        "p[style-name='Heading 3'] => h3:fresh",
        "p[style-name='Heading 4'] => h4:fresh",
        "b[style-name='Strong'] => strong"
      ],
      convertImage: mammoth.images.imgElement(async image => {
        const b = await image.readAsBase64String()
        return { src: 'data:' + image.contentType + ';base64,' + b }
      })
    })
    const messages = (r.messages || []).filter(m => m.type === 'error').length
    return { ok: true, html: r.value, size: stat.size, warnings: messages }
  } catch (e) {
    return { ok: false, error: '文档解析失败：' + e.message }
  }
}

// pdf → base64 dataURL（右栏 <embed> 原生 PDF 查看器渲染）：
// 50MB 上限（base64 膨胀 1.33 倍，防 IPC 与内存压力）
const MAX_PDF_SIZE = 50 * 1024 * 1024
function readPdf(p) {
  const abs = safePath(p)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  let stat
  try {
    stat = fs.statSync(abs)
  } catch (e) {
    return { ok: false, error: '文件不存在' }
  }
  if (stat.isDirectory()) return { ok: false, error: '不支持预览文件夹' }
  if (path.extname(abs).toLowerCase() !== '.pdf') return { ok: false, error: '仅支持 .pdf 预览' }
  if (stat.size > MAX_PDF_SIZE) return { ok: false, tooLarge: true, error: 'PDF 超过 50MB，请使用系统应用打开' }
  try {
    const buf = fs.readFileSync(abs)
    return { ok: true, src: 'data:application/pdf;base64,' + buf.toString('base64'), size: stat.size }
  } catch (e) {
    return { ok: false, error: '读取失败：' + e.message }
  }
}

// ===== 系统打开 =====
// 在 Finder / 资源管理器中显示
function reveal(p) {
  const abs = safePath(p)
  if (!abs || !fs.existsSync(abs)) return { ok: false, error: '路径不存在' }
  shell.showItemInFolder(abs)
  return { ok: true }
}

// 使用系统默认应用打开
async function open(p) {
  const abs = safePath(p)
  if (!abs || !fs.existsSync(abs)) return { ok: false, error: '路径不存在' }
  const err = await shell.openPath(abs)
  if (err) return { ok: false, error: err }
  return { ok: true }
}

// ===== 导入 =====
// 导入：系统文件选择框（多选）→ 拷贝进目标目录（同名自动加序号）
async function importDialog(dir) {
  const abs = safePath(dir)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  const win = getWindow ? getWindow() : null
  const result = await dialog.showOpenDialog(win, {
    title: '导入文件到空间',
    properties: ['openFile', 'multiSelections']
  })
  if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true }
  return importPaths(dir, result.filePaths)
}

// 导入：指定绝对路径列表（拖拽导入用，来源不限，目标受限）
function importPaths(dir, filePaths) {
  const abs = safePath(dir)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  const list = Array.isArray(filePaths) ? filePaths.filter(Boolean) : []
  if (!list.length) return { ok: false, canceled: true }
  let count = 0
  try {
    for (const src of list) {
      if (!fs.existsSync(src)) continue
      const dest = uniquePath(abs, path.basename(src))
      fs.copyFileSync(src, dest)
      count++
    }
  } catch (e) {
    return { ok: false, error: '导入失败：' + e.message }
  }
  return { ok: true, count }
}

// ===== @ 引用：递归文件树 =====
// 供对话输入框 @ 提及选择文件/文件夹：递归收集全部条目（文件含 size，
// 目录条目单独返回供浮层选择），隐藏目录（.git 等）与超大文件跳过；
// 条目数封顶 2000 防极端空间拖垮
function listTree(dir) {
  const abs = safePath(dir)
  if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
  const files = []
  const dirs = [{ path: '', size: 0 }] // 根目录自身可被 @（引用整个空间）
  let truncated = false
  const skipDirs = new Set(['node_modules', '.git', 'dist', 'build', '__pycache__', '.venv'])
  // BFS 逐层扫描，容量上限兜底
  const queue = [{ abs, rel: '' }]
  while (queue.length) {
    if (files.length >= 2000) { truncated = true; break }
    const cur = queue.shift()
    let names
    try {
      names = fs.readdirSync(cur.abs, { withFileTypes: true })
    } catch (e) {
      continue // 无权限目录跳过
    }
    for (const d of names) {
      if (files.length >= 2000) { truncated = true; break }
      if (d.name.startsWith('.') || d.name.startsWith('$')) continue
      const full = path.join(cur.abs, d.name)
      const rel = cur.rel ? cur.rel + '/' + d.name : d.name
      if (d.isDirectory()) {
        if (skipDirs.has(d.name)) continue
        // 深度封顶 8 层
        if (rel.split('/').length >= 8) continue
        dirs.push({ path: rel, size: 0 })
        queue.push({ abs: full, rel })
        continue
      }
      if (!d.isFile()) continue
      let size = 0
      try {
        size = fs.statSync(full).size
      } catch (e) { /* 条目消失则按 0 计 */ }
      // 超过 50MB 的文件不适合作为对话附件，跳过
      if (size > 50 * 1024 * 1024) continue
      files.push({ path: rel, size })
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  dirs.sort((a, b) => a.path.localeCompare(b.path))
  return { ok: true, files, dirs, truncated }
}

// ===== @ 引用条目：仅做存在性校验 =====
// @ 引用不复制、不抽取——只是把真实路径告诉模型，读不读、读多少
// 由模型自行用 read/bash 等工具决定（轻量语义）
function statRef(refPath) {
  try {
    const abs = safePath(refPath)
    if (!abs) return { ok: false, error: '路径不在已关联的空间目录内' }
    const st = fs.statSync(abs)
    return { ok: true, isDir: st.isDirectory(), name: path.basename(abs) || 'workspace' }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

module.exports = {
  // 初始化基目录与窗口获取器
  init,
  // 目录列表（含隐藏标记）
  list,
  // 递归文件树（@ 引用选择用）
  listTree,
  // @ 引用条目存在性校验（文件/目录通用，不做内容抽取）
  statRef,
  // 新建文件夹
  mkdir,
  // 新建空文件
  createFile,
  // 重命名
  rename,
  // 移入废纸篓
  trash,
  // 批量移入废纸篓
  trashBatch,
  // 清空空间根目录
  empty,
  // 读取文本（含二进制嗅探）
  read,
  // 读取图片为 dataURL
  readImage,
  // 读取 docx 转内联 HTML（mammoth）
  readDocx,
  // 读取 pdf 为 dataURL（<embed> 原生查看器）
  readPdf,
  // 写入文本
  write,
  // 文件管理器中显示
  reveal,
  // 系统默认应用打开
  open,
  // 对话框选择文件导入
  importDialog,
  // 按路径列表导入
  importPaths
}
