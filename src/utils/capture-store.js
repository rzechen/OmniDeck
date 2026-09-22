// 截图记录 / 剪贴板历史 持久化桥（渲染端侧，仅主窗运行）
// 主进程无法直接访问 IndexedDB，故由主窗渲染端代劳：
// - 写：监听 main:capture-sync（{ op: upsert|remove|clear, store, id, meta, png }）
//   落 IndexedDB（storePut / storeDelete / storeClear，见 utils/db.js v2 扩展）
// - 恢复：启动时 storeGetAll 全量读出，回传主进程重建内存池
//   （capture:restore / capture:clips-restore），再上报就绪（capture:sync-ready）；
//   主进程按返回 ids 对齐删除 IndexedDB 中多余条目
// 辅助窗（quick / capture-overlay / capture-editor / capture-pin /
// capture-scroll-ctrl）加载同一 SPA：按 hash 路由跳过（主进程另有 sink 校验双保险）
import { storePut, storeDelete, storeClear, storeGetAll } from './db'

const AUX_ROUTES = ['/quick', '/capture-overlay', '/capture-editor', '/capture-pin', '/capture-scroll-ctrl']

function isAuxWindow() {
  const h = window.location.hash || ''
  return AUX_ROUTES.some(r => h.startsWith('#' + r))
}

let started = false

// 主进程变更推送 → IndexedDB
function applyOp(op) {
  if (!op || !op.store) return Promise.resolve()
  try {
    if (op.op === 'upsert') {
      const value = { meta: op.meta || {} }
      if (op.png) value.png = op.png // Uint8Array（结构化克隆直存）
      return storePut(op.store, op.id, value)
    }
    if (op.op === 'remove') return storeDelete(op.store, op.id)
    if (op.op === 'clear') return storeClear(op.store)
  } catch (e) { /* 持久化失败静默：不影响截图功能 */ }
  return Promise.resolve()
}

// 恢复：IndexedDB 全量 → 回传主进程；ids 之外的对齐删除
async function restoreStore(storeName, invokeRestore) {
  const items = await storeGetAll(storeName)
  if (!items.length) return
  const payload = items
    .filter(it => it.value && it.value.meta)
    .map(it => ({
      id: it.key,
      meta: it.value.meta,
      png: it.value.png || null
    }))
  let ids = null
  try {
    const res = await invokeRestore(payload)
    if (res && Array.isArray(res.ids)) ids = res.ids
  } catch (e) { /* 主进程不可达：放弃恢复 */ }
  // 主进程淘汰后多余条目：IndexedDB 侧删除对齐
  if (ids) {
    const keep = new Set(ids)
    for (const it of items) {
      if (!keep.has(it.key)) storeDelete(storeName, it.key)
    }
  }
}

export async function initCaptureStore() {
  if (started) return
  started = true
  const api = window.electronAPI
  if (!api || !api.captureSync || isAuxWindow()) return

  // 1. 监听后续变更（须先挂监听再恢复，避免恢复期间丢推送）
  api.captureSync.onSync(op => { applyOp(op) })

  // 2. 恢复：截图池 + 剪贴板历史
  try {
    await restoreStore('captures', payload => api.captureSync.restore(payload))
    await restoreStore('clips', payload => api.captureSync.clipsRestore(payload))
  } catch (e) { /* 恢复失败不阻塞启动 */ }

  // 3. 上报就绪：主进程重放 pending 变更
  try { await api.captureSync.syncReady() } catch (e) { /* 忽略 */ }
}
