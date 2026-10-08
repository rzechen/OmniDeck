// OmniDeck 截图 IndexedDB 持久化桥：主进程无法直接访问 IndexedDB（渲染端按
// origin 隔离），变更经 main:capture-sync 事件推给主窗渲染端（capture-store.js
// 监听并写 IndexedDB）；渲染端未就绪时变更入 pending 队列，就绪信号
// （capture:sync-ready）后重放。持久化默认开启，无开关。
// - 变更推送：记录池 upsert/remove/clear 时经 pushSync 下发
// - 启动恢复：渲染端就绪后从 IndexedDB 全量读出，经 capture:restore /
//   capture:clips-restore 回传主进程重建内存池
const { ipcMain } = require('electron')

let persistSink = null // 主窗 webContents（注入：init({ sink })）
const PENDING_MAX = 200 // 渲染端未就绪期间最多暂存变更（超出丢最旧，防膨胀）
const pendingSync = []

// 渲染端就绪信号：主窗加载完成后主动上报（触发 pending 重放 + restore 回传）
// 仅主窗可作为 sink（辅助窗 quick/覆盖窗/编辑窗/pin 窗加载同一 SPA，需排除）
let getMainWindow = () => null
ipcMain.handle('capture:sync-ready', async (event) => {
  const main = getMainWindow()
  if (main && !main.isDestroyed() && event.sender !== main.webContents) {
    return { ok: false, reason: 'not-main' }
  }
  setPersistSink(event.sender)
  return { ok: true }
})

function pushSync(op) {
  if (persistSink) {
    try {
      persistSink.send('main:capture-sync', op)
      return
    } catch (e) { /* sink 失效：走 pending */ }
  }
  pendingSync.push(op)
  if (pendingSync.length > PENDING_MAX) pendingSync.shift()
}

function setPersistSink(wc) {
  persistSink = wc
  // 渲染端就绪：重放暂存变更
  if (wc && pendingSync.length) {
    for (const op of pendingSync) {
      try { wc.send('main:capture-sync', op) } catch (e) { /* 忽略 */ }
    }
    pendingSync.length = 0
  }
}

module.exports = {
  // 变更推送（渲染端未就绪时暂存 pending，就绪后重放）
  pushSync,
  // 设置持久化 sink（渲染端就绪时注入其 webContents）
  setPersistSink,
  // 注入主窗获取器（sync-ready 校验仅认主窗；init({ getSink }) 时设置）
  setMainWindow(fn) { if (typeof fn === 'function') getMainWindow = fn }
}
