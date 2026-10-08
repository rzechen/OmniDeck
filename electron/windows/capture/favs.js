// OmniDeck 剪贴板收藏（独立池，与历史池隔离）：收藏时完整复制内容（图片存
// 整份 PNG，截图来源也不依赖截图池）；删除历史/清空历史均不影响收藏；
// IndexedDB 持久化走 store: 'favClips'。
const { clipboard, nativeImage, ipcMain } = require('electron')
const { pushSync } = require('./persist')
const { jpegDataURL } = require('./utils')
const { getClipRecord, markClipboardWritten } = require('./clips')
const { getCaptureRecord } = require('./records')

const FAV_ID_PREFIX = 'favclip-'
const FAV_KEEP_MAX = 500 // 收藏上限（超出拒绝加入，前端提示）
let favRecords = new Map() // id -> { id, kind, text?, image?, width?, height?, thumb?, favedAt }
let favSerial = 0

function favMetaOf(rec) {
  const meta = { id: rec.id, kind: rec.kind, createdAt: rec.createdAt, favedAt: rec.favedAt }
  // 来源历史 id：用于剪贴板页回显「已收藏」星标（历史可能已被删除，仅作关联用）
  if (rec.histId) meta.histId = rec.histId
  if (rec.kind === 'text') {
    meta.text = rec.text
    meta.length = rec.length
  } else {
    meta.width = rec.width
    meta.height = rec.height
    meta.thumb = rec.thumb
  }
  return meta
}

// 收藏恢复（IndexedDB → 内存）
ipcMain.handle('capture:fav-restore', (_e, items) => {
  if (!Array.isArray(items)) return { ok: false }
  for (const it of items) {
    if (!it || !it.id || favRecords.has(it.id)) continue
    const meta = it.meta || {}
    try {
      if (meta.kind === 'text' && typeof meta.text === 'string') {
        favRecords.set(it.id, {
          id: it.id, kind: 'text', text: meta.text,
          length: meta.text.length,
          histId: meta.histId || null,
          createdAt: meta.createdAt || meta.favedAt || Date.now(),
          favedAt: meta.favedAt || Date.now()
        })
      } else if (it.png) {
        const image = nativeImage.createFromBuffer(Buffer.from(it.png))
        if (image.isEmpty()) continue
        const size = image.getSize()
        favRecords.set(it.id, {
          id: it.id, kind: 'image', image, histId: meta.histId || null,
          width: size.width, height: size.height,
          createdAt: meta.createdAt || meta.favedAt || Date.now(),
          favedAt: meta.favedAt || Date.now(),
          thumb: meta.thumb || jpegDataURL(image, 200, 70)
        })
      }
    } catch (e) { /* 单条损坏跳过 */ }
  }
  return { ok: true, count: favRecords.size, ids: Array.from(favRecords.keys()) }
})

// 收藏列表（按收藏时间倒序，条目结构与 history-list 一致，额外 favedAt）
function favList() {
  const items = Array.from(favRecords.values()).map(favMetaOf)
  items.sort((a, b) => b.favedAt - a.favedAt)
  return { ok: true, items }
}

// 已收藏映射（histId -> favId）：剪贴板页据此渲染实心星标/取消收藏（轻量，可高频拉取）
function favIds() {
  const map = {}
  favRecords.forEach(rec => {
    if (rec.histId) map[rec.histId] = rec.id
  })
  return { ok: true, map }
}

// 加入收藏：从历史条目完整复制一份（图片取整份 PNG；截图来源回截图池拉原图，
// 收藏后删除历史或截图池均不影响收藏）
function favAdd(histId) {
  const rec = getClipRecord(histId)
  if (!rec) return { ok: false, reason: 'notfound' }
  if (favRecords.size >= FAV_KEEP_MAX) {
    return { ok: false, reason: 'full', limit: FAV_KEEP_MAX }
  }
  const id = FAV_ID_PREFIX + Date.now().toString(36) + '-' + (favSerial++).toString(36)
  let fav
  if (rec.kind === 'text') {
    fav = {
      id, kind: 'text', text: rec.text, length: rec.length,
      histId,
      createdAt: rec.createdAt, favedAt: Date.now()
    }
  } else {
    // 截图来源的历史条目内存中持有 image；防万一为空时回截图池拉取
    let image = rec.image
    if ((!image || image.isEmpty()) && rec.refId) {
      const src = getCaptureRecord(rec.refId)
      if (src && src.image) image = src.image
    }
    if (!image || image.isEmpty()) return { ok: false, reason: 'noimage' }
    fav = {
      id, kind: 'image', image, histId,
      width: rec.width, height: rec.height,
      createdAt: rec.createdAt, favedAt: Date.now(),
      thumb: rec.thumb || jpegDataURL(image, 200, 70)
    }
  }
  favRecords.set(id, fav)
  pushSync({ op: 'upsert', store: 'favClips', id, meta: favMetaOf(fav), png: fav.kind === 'image' ? fav.image.toPNG() : undefined })
  return { ok: true, id }
}

// 收藏条目复制（同历史复制：写剪贴板 + 更新轮询基线防重复入库）
function favCopy(id) {
  const rec = favRecords.get(id)
  if (!rec) return { ok: false, reason: 'notfound' }
  try {
    if (rec.kind === 'text') {
      clipboard.writeText(rec.text)
    } else {
      clipboard.writeImage(rec.image)
    }
    markClipboardWritten(rec)
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
  return { ok: true }
}

// 删除收藏（仅收藏池，不触碰历史）
function favRemove(id) {
  if (!favRecords.delete(id)) return { ok: false, reason: 'notfound' }
  pushSync({ op: 'remove', store: 'favClips', id })
  return { ok: true }
}

// 清空收藏
function favClear() {
  favRecords.clear()
  pushSync({ op: 'clear', store: 'favClips' })
  return { ok: true }
}

// 收藏原图 dataURL（图片预览）
function favData(id) {
  const rec = favRecords.get(id)
  if (!rec || rec.kind !== 'image') return { ok: false, reason: 'notfound' }
  try {
    return { ok: true, data: rec.image.toDataURL() }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

// 收藏条目获取（另存为 IPC 用）
function getFavRecord(id) {
  return favRecords.get(id)
}

module.exports = {
  // 收藏列表（按收藏时间倒序）
  favList,
  // 已收藏映射（histId -> favId，星标渲染用）
  favIds,
  // 加入收藏（从历史条目完整复制一份）
  favAdd,
  // 收藏条目复制（写剪贴板 + 更新轮询基线）
  favCopy,
  // 删除收藏（仅收藏池）
  favRemove,
  // 清空收藏
  favClear,
  // 收藏原图 dataURL（图片预览）
  favData,
  // 按 id 取收藏条目（另存为用）
  getFavRecord
}
