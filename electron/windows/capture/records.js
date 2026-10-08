// OmniDeck 截图记录池：全屏 / 选区 / 长截图产物的内存原图存储（id ->
// NativeImage 记录），入库（addRecord：原分辨率保存 + 缩略图 + 同步进统一
// 复制历史 + IndexedDB 持久化）、淘汰（KEEP_COUNT 上限最旧淘汰）、删除与
// 恢复（capture:restore：渲染端 IndexedDB 全量回传重建）。
const { ipcMain, nativeImage } = require('electron')
const { pushSync } = require('./persist')
const { jpegDataURL } = require('./utils')
const { addClipImage, dropLinkedClip, dropAllCaptureClips } = require('./clips')

// 内存记录池：id -> { id, image(NativeImage), width, height, createdAt, mime, thumb }
const records = new Map()
// 保留条数上限（超出最旧淘汰）
const KEEP_COUNT = 50
let serial = 0

// 渲染端恢复回传：[{ id, meta, png(ArrayBuffer) }] → 重建内存池
ipcMain.handle('capture:restore', (event, items) => {
  if (!Array.isArray(items)) return { ok: false, error: 'invalid' }
  const restored = []
  for (const it of items) {
    if (!it || !it.id || !it.png || records.has(it.id)) continue
    try {
      const image = nativeImage.createFromBuffer(Buffer.from(it.png))
      if (image.isEmpty()) continue
      records.set(it.id, {
        id: it.id,
        image,
        width: it.meta ? it.meta.width : image.getSize().width,
        height: it.meta ? it.meta.height : image.getSize().height,
        createdAt: it.meta ? it.meta.createdAt : Date.now(),
        mime: it.meta && it.meta.mime ? it.meta.mime : 'image/png',
        thumb: it.meta ? it.meta.thumb : '',
        kind: it.meta ? it.meta.kind : undefined
      })
      restored.push(it.id)
    } catch (e) { /* 单条损坏跳过 */ }
  }
  // 恢复后按上限淘汰；返回当前全部 id，渲染端据此对齐 IndexedDB（删多余条目）
  evict()
  return { ok: true, count: restored.length, ids: Array.from(records.keys()) }
})

// 超额淘汰：超过上限时按插入序删除最旧记录；返回被淘汰的 id 列表
// （同步清理对应的历史条目，保持两池一致）
function evict() {
  const evicted = []
  while (records.size > KEEP_COUNT) {
    const oldest = records.keys().next().value
    records.delete(oldest)
    dropLinkedClip(oldest)
    evicted.push(oldest)
  }
  return evicted
}

// 入库 + meta：全屏 / 选区 / 长截图共用（原分辨率保存，不缩放）；
// 截图同时作为一条剪贴板图片记录（source:'capture'）进入统一复制历史
function addRecord(image, extra) {
  const id = Date.now().toString(36) + '-' + (serial++).toString(36) +
    '-' + Math.random().toString(36).slice(2, 6)
  const size = image.getSize()
  const rec = Object.assign({
    id,
    image,
    width: size.width,
    height: size.height,
    createdAt: Date.now(),
    mime: 'image/png',
    thumb: jpegDataURL(image, 360, 72)
  }, extra || {})
  records.set(id, rec)
  const evicted = evict()
  // 持久化：新纪录 upsert；被淘汰的同步删 IndexedDB
  pushSync({ op: 'upsert', store: 'captures', id, meta: metaOf(rec), png: rec.image.toPNG() })
  for (const id2 of evicted) pushSync({ op: 'remove', store: 'captures', id: id2 })
  // 同步进统一复制历史（仅内存引用 + 淘汰联动，PNG 不双份存盘：
  // 历史条目的原图按 id 回 captures 池拉取）
  addClipImage(image, { source: 'capture', refId: id, kind: rec.kind })
  // 出参不含 image 原图（大对象不进 IPC）
  const meta = { id, width: rec.width, height: rec.height, createdAt: rec.createdAt, mime: rec.mime, thumb: rec.thumb }
  if (rec.kind) meta.kind = rec.kind
  return meta
}

// 记录出参（无原图）
function metaOf(rec) {
  const meta = { id: rec.id, width: rec.width, height: rec.height, createdAt: rec.createdAt, mime: rec.mime, thumb: rec.thumb }
  if (rec.kind) meta.kind = rec.kind
  return meta
}

// 按 id 删除记录（联动清理其历史条目 + IndexedDB）
function deleteRecord(id) {
  if (!records.has(id)) return { ok: false, reason: 'notfound' }
  records.delete(id)
  dropLinkedClip(id)
  pushSync({ op: 'remove', store: 'captures', id })
  return { ok: true }
}

// 清空全部记录（联动清理截图来源历史条目 + IndexedDB）
function clearRecords() {
  records.clear()
  dropAllCaptureClips()
  pushSync({ op: 'clear', store: 'captures' })
  return { ok: true }
}

module.exports = {
  // 截图入库（原分辨率保存 + 缩略图 + 同步统一历史 + 持久化；返回 meta）
  addRecord,
  // 按 id 删除记录（联动历史条目与 IndexedDB）
  deleteRecord,
  // 清空全部记录
  clearRecords,
  // 按 id 取记录（收藏防万一回拉原图用）
  getCaptureRecord(id) { return records.get(id) }
}
