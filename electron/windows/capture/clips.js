// OmniDeck 全局剪贴板历史：主进程轮询系统剪贴板（Electron 无剪贴板变更事件，
// mac 轮询是通行做法），内容变化即入库（文本 ≤100KB、图片 PNG）；自己写入的
// 内容不重复记录；截图（records.addRecord）自动同步一条 source:'capture'
// 条目（仅内存，原图走截图池）；持久化走 IndexedDB 桥（store: 'clips'，
// capture 来源不双份存盘）。
const { ipcMain, clipboard, nativeImage } = require('electron')
const { readCaptureSettings, updateCaptureSettings } = require('./settings')
const { pushSync } = require('./persist')
const { jpegDataURL } = require('./utils')

const CLIP_TEXT_MAX = 100 * 1024 // 文本上限 100KB
const CLIP_KEEP_DEFAULT = 1000 // 剪贴板历史默认保留条数（设置页可改 50-2000）
let clipKeep = CLIP_KEEP_DEFAULT
let clipRecords = new Map() // id -> { id, kind: 'text'|'image', text?, thumb?, source?, refId? }
let clipWatcherOn = false
let clipTimer = null
let clipLastText = null
let clipLastImgHash = null
let clipSerial = 0

// 简单指纹：位图长度 + 首/中/尾采样字节。
// 用 getBitmap（原始像素拷贝，便宜）而非 toPNG（压缩编码，大图每秒一次开销大）
function imgHashOf(image) {
  const buf = image.getBitmap()
  const n = buf.length
  return n + ':' + buf[0] + ':' + buf[n >> 1] + ':' + buf[n - 1]
}

// 读取剪贴板中的文件（mac：Finder 复制文件时写入 public.file-url，无文本/图片数据）
// 返回绝对路径数组（支持多文件），非文件复制返回 null：
// - NSFilenamesPboardType 兼容类型：新版 macOS 返回 XML plist（<array><string>…），
//   旧版为 \n 分隔纯文本，两种格式均解析
// - 均不可用时回退 readBuffer 读取单个 file:// URL
function readClipboardFilePaths() {
  if (process.platform !== 'darwin') return null
  try {
    if (!clipboard.has('public.file-url')) return null
    let paths = null
    try {
      const legacy = clipboard.read('NSFilenamesPboardType')
      if (legacy) {
        if (legacy.indexOf('<') >= 0) {
          // plist XML：<string>路径</string> 逐项提取（文件名可能含 XML 转义）
          const items = legacy.match(/<string>[\s\S]*?<\/string>/g) || []
          paths = items
            .map(s => s.replace(/^<string>|<\/string>$/g, '')
              .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim())
            .filter(Boolean)
        } else {
          paths = legacy.split('\n').map(s => s.trim()).filter(Boolean)
        }
      }
    } catch (e) { /* 旧类型不可用，回退单文件 */ }
    if (!paths || !paths.length) {
      const url = clipboard.readBuffer('public.file-url').toString('utf8').replace(/\0+$/, '')
      if (url) {
        try { paths = [decodeURIComponent(url.replace(/^file:\/\//, ''))] }
        catch (e) { paths = [url] }
      }
    }
    return paths && paths.length ? paths : null
  } catch (e) {
    return null
  }
}

function clipMetaOf(rec) {
  const meta = { id: rec.id, kind: rec.kind, createdAt: rec.createdAt }
  if (rec.kind === 'text') {
    meta.text = rec.text
    meta.length = rec.length
  } else {
    meta.width = rec.width
    meta.height = rec.height
    meta.thumb = rec.thumb
  }
  if (rec.source) meta.source = rec.source
  if (rec.refId) meta.refId = rec.refId
  return meta
}

function clipEvict() {
  while (clipRecords.size > clipKeep) {
    const oldest = clipRecords.keys().next().value
    clipRecords.delete(oldest)
    pushSync({ op: 'remove', store: 'clips', id: oldest })
  }
}

// 剪贴板恢复（IndexedDB → 内存，同截图池；capture 来源不持久化，
// 重启后由截图池恢复自然重建统一历史）
ipcMain.handle('capture:clips-restore', (_e, items) => {
  if (!Array.isArray(items)) return { ok: false }
  for (const it of items) {
    if (!it || !it.id || clipRecords.has(it.id)) continue
    const meta = it.meta || {}
    try {
      if (meta.kind === 'text' && typeof meta.text === 'string') {
        clipRecords.set(it.id, {
          id: it.id, kind: 'text', text: meta.text,
          length: meta.text.length, createdAt: meta.createdAt || Date.now()
        })
      } else if (it.png) {
        const image = nativeImage.createFromBuffer(Buffer.from(it.png))
        if (image.isEmpty()) continue
        const size = image.getSize()
        clipRecords.set(it.id, {
          id: it.id, kind: 'image', image,
          width: size.width, height: size.height,
          createdAt: meta.createdAt || Date.now(),
          thumb: meta.thumb || jpegDataURL(image, 200, 70)
        })
      }
    } catch (e) { /* 单条损坏跳过 */ }
  }
  clipEvict()
  return { ok: true, count: clipRecords.size, ids: Array.from(clipRecords.keys()) }
})

function addClipText(text) {
  const id = 'clip-' + Date.now().toString(36) + '-' + (clipSerial++).toString(36)
  const rec = { id, kind: 'text', text, length: text.length, createdAt: Date.now() }
  clipRecords.set(id, rec)
  clipEvict()
  pushSync({ op: 'upsert', store: 'clips', id, meta: clipMetaOf(rec) })
  return rec
}

// 图片入库；extra.source === 'capture' 表示来自本应用截图：
// - 同步更新轮询基线（截图已复制到剪贴板，避免下一 tick 重复记录）
// - 不写 IndexedDB（原图已在 captures store，避免双份占盘）
function addClipImage(image, extra) {
  const id = 'clip-' + Date.now().toString(36) + '-' + (clipSerial++).toString(36)
  const size = image.getSize()
  const rec = Object.assign({
    id, kind: 'image', image,
    width: size.width, height: size.height,
    createdAt: Date.now(),
    thumb: jpegDataURL(image, 200, 70)
  }, extra || {})
  clipRecords.set(id, rec)
  clipEvict()
  if (rec.source === 'capture') {
    clipLastImgHash = imgHashOf(image)
    try { clipLastText = clipboard.readText() || null } catch (e) { clipLastText = null }
  } else {
    pushSync({ op: 'upsert', store: 'clips', id, meta: clipMetaOf(rec), png: image.toPNG() })
  }
  return rec
}

// 截图池条目删除时联动清理其对应的历史条目（refId 反查，池小遍历即可）
function dropLinkedClip(refId) {
  for (const rec of clipRecords.values()) {
    if (rec.refId === refId) {
      clipRecords.delete(rec.id)
      return
    }
  }
}

// 清空历史时联动移除全部截图来源的历史条目（capture 原图随截图池清理）
function dropAllCaptureClips() {
  for (const rec of Array.from(clipRecords.values())) {
    if (rec.source === 'capture') clipRecords.delete(rec.id)
  }
}

// 轮询 tick：读取当前剪贴板，变化则入库
async function clipTick() {
  try {
    // 文件优先（Finder 复制文件时剪贴板仅含 file-url）：记录为绝对路径文本
    const filePaths = readClipboardFilePaths()
    if (filePaths) {
      const fileText = filePaths.join('\n')
      if (fileText !== clipLastText) {
        clipLastText = fileText
        clipLastImgHash = null // 文件覆盖后图片标记失效
        addClipText(fileText)
      }
      return
    }
    // 文本次之（同帧同时有文本与图片时按文本记录，符合复制直觉）
    const text = clipboard.readText()
    if (text && text.length <= CLIP_TEXT_MAX) {
      if (text !== clipLastText) {
        clipLastText = text
        clipLastImgHash = null // 文本覆盖后图片标记失效
        addClipText(text)
      }
      return
    }
    const img = clipboard.readImage()
    if (!img.isEmpty()) {
      const hash = imgHashOf(img)
      if (hash !== clipLastImgHash) {
        clipLastImgHash = hash
        clipLastText = clipboard.readText() || null
        addClipImage(img)
      }
    }
  } catch (e) { /* 轮询异常忽略 */ }
}

// 剪贴板监听恒开（复制历史默认记录，无开关）
function startClipWatcher() {
  if (clipWatcherOn) return
  clipWatcherOn = true
  clipTimer = setInterval(clipTick, 1000)
  // 初始化基线（避免启动时把当前剪贴板内容记为历史；文件剪贴板记路径文本）
  try {
    const filePaths = readClipboardFilePaths()
    clipLastText = filePaths ? filePaths.join('\n') : (clipboard.readText() || null)
    const img = clipboard.readImage()
    if (!img.isEmpty()) clipLastImgHash = imgHashOf(img)
  } catch (e) { /* 忽略 */ }
}

function stopClipWatcher() {
  if (!clipWatcherOn) return
  clipWatcherOn = false
  if (clipTimer) { clearInterval(clipTimer); clipTimer = null }
}

// ===== 上限设置（持久化于 capture-settings.json） =====
// 启动时从设置文件加载（init 调用）
function loadClipKeep() {
  const s = readCaptureSettings()
  if (Number.isInteger(s.clipKeep) && s.clipKeep >= 50 && s.clipKeep <= 2000) clipKeep = s.clipKeep
}

function getClipKeep() {
  return clipKeep
}

// 设置上限（50-2000 整数）：落盘并立即淘汰多余记录
function setClipKeep(val) {
  const n = Number(val)
  if (!Number.isInteger(n) || n < 50 || n > 2000) {
    return { ok: false, error: '上限需为 50-2000 的整数' }
  }
  clipKeep = n
  updateCaptureSettings({ clipKeep })
  clipEvict() // 改小立即淘汰多余记录
  return { ok: true, clipKeep }
}

// ===== IPC / 模块间访问 =====
// 历史条目列表（统一复制历史：截图 + 剪贴板合并时间线，最新在前）
function listClipMetas() {
  const items = Array.from(clipRecords.values()).map(clipMetaOf)
  items.sort((a, b) => b.createdAt - a.createdAt)
  return items
}

// 复制历史条目后的轮询基线更新（防下一 tick 重复入库；history-copy / fav-copy 共用）
function markClipboardWritten(rec) {
  try {
    if (rec.kind === 'text') {
      clipLastText = rec.text
    } else {
      clipLastImgHash = imgHashOf(rec.image)
      try { clipLastText = clipboard.readText() || null } catch (e) { clipLastText = null }
    }
  } catch (e) { /* 忽略 */ }
}

module.exports = {
  // 启动剪贴板轮询（恒开；初始化基线防启动误记）
  startClipWatcher,
  // 停止轮询（退出时）
  stopClipWatcher,
  // 从设置文件加载历史上限（init 调用）
  loadClipKeep,
  // 当前历史上限
  getClipKeep,
  // 设置历史上限（50-2000 整数；落盘并立即淘汰）
  setClipKeep,
  // 历史条目列表（最新在前，含截图来源条目）
  listClipMetas,
  // 按 id 取历史条目（内存池记录，含 image 原图）
  getClipRecord(id) { return clipRecords.get(id) },
  // 按 id 删除历史条目（仅删内存 + 不触发持久化，持久化由调用方按来源决定）
  deleteClipRecord(id) { return clipRecords.delete(id) },
  // 清空全部历史条目（仅内存；持久化 clear 由调用方推送）
  clearClips() { clipRecords.clear() },
  // 历史条目 meta 投影（IPC 出参）
  clipMetaOf,
  // 复制后更新轮询基线（防重复入库）
  markClipboardWritten,
  // 图片入库（source='capture' 为截图来源：不双份存盘）
  addClipImage,
  // 截图池条目删除时联动清理其历史条目
  dropLinkedClip,
  // 清空截图池时联动移除全部截图来源历史条目
  dropAllCaptureClips
}
