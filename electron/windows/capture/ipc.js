// OmniDeck 截图工具 IPC 注册层：权限状态 / 快捷键 / 截图入口（全屏 / 选区 /
// 长截图）/ 覆盖窗交互 / 统一复制历史（截图 + 剪贴板合并时间线）/ 剪贴板收藏。
// 各子模块状态与原语经模块导入，本层只做 ipcMain 通道转发与跨池协调。
const path = require('path')
const { ipcMain, app, dialog, clipboard, BrowserWindow } = require('electron')
const { displayOfWindow } = require('./native')
const { pushSync } = require('./persist')
const { status, openPermissionSettings, requestScreenPermission, captureScreen } = require('./screen')
const { captureArea, onOverlayDone, overlayContext, listWindowsForSender } = require('./overlay')
const { captureScroll, scrollShot, scrollFinish, scrollCancel } = require('./scroll')
const { deleteRecord, clearRecords } = require('./records')
const clips = require('./clips')
const favs = require('./favs')
const shortcuts = require('./shortcuts')

// 注册截图工具全部 IPC（主窗就绪后调用一次）
function registerIpc() {
  ipcMain.handle('capture:status', () => status())

  // ---------- 全局快捷键（iShot 风格） ----------
  // 默认：⇧⌘S 选区标注截图 / ⌥⇧3 全屏 / ⌥⇧S 长截图（可在设置中修改）
  shortcuts.registerShortcuts()
  ipcMain.handle('capture:get-shortcuts', () => shortcuts.getShortcuts())
  ipcMain.handle('capture:set-shortcut', (_e, { key, accelerator } = {}) =>
    shortcuts.setShortcut(key, accelerator))
  ipcMain.handle('capture:test-shortcut', (_e, accelerator) => shortcuts.testShortcut(accelerator))

  // ---------- 剪贴板历史条数上限（设置页） ----------
  ipcMain.handle('capture:get-clip-keep', () => clips.getClipKeep())
  ipcMain.handle('capture:set-clip-keep', (_e, val) => clips.setClipKeep(val))

  // 渲染端发起（定格优先：不隐藏窗口；opts 保留兼容旧调用）
  ipcMain.handle('capture:screen', async (event, opts) => {
    const o = opts || {}
    return captureScreen({ copy: o.copy !== false })
  })

  // 选区截屏：定格选区 → crop 入库
  ipcMain.handle('capture:area', async (event, opts) => {
    const o = opts || {}
    return captureArea({ copy: o.copy !== false })
  })

  // 长截图：定格选区 → 连拍模式
  ipcMain.handle('capture:scroll', async () => captureScroll())
  ipcMain.handle('capture:scroll-shot', () => scrollShot())
  ipcMain.handle('capture:scroll-finish', () => scrollFinish())
  ipcMain.handle('capture:scroll-cancel', () => scrollCancel())

  // 覆盖窗选区完成回传（sender 所在屏即选区屏）
  ipcMain.handle('capture-overlay:done', (event, rect) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return
    onOverlayDone(displayOfWindow(win), rect)
  })

  // 覆盖窗拉取交互上下文（实时）：本屏窗口列表 + 光标位置
  ipcMain.handle('capture-overlay:context', (event) => overlayContext(event))

  // 窗口枚举（实时，供调试/其他调用；overlay 交互用 capture-overlay:context）
  ipcMain.handle('capture:windows', (event) => listWindowsForSender(event))

  // ---------- 统一复制历史（截图 + 剪贴板合并时间线） ----------
  // 条目：文本 / 图片（剪贴板来源）+ 图片（截图来源，refId 指向截图池）
  ipcMain.handle('capture:history-list', () => ({ ok: true, items: clips.listClipMetas() }))
  // 复制历史条目：文本写文本、图片写图片；同时更新轮询基线防下一 tick 重复入库
  ipcMain.handle('capture:history-copy', (_e, id) => {
    const rec = clips.getClipRecord(id)
    if (!rec) return { ok: false, reason: 'notfound' }
    try {
      if (rec.kind === 'text') {
        clipboard.writeText(rec.text)
      } else {
        clipboard.writeImage(rec.image)
      }
      clips.markClipboardWritten(rec)
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
    return { ok: true }
  })
  // 删除历史条目：截图来源的联动删截图池（原图随池删除）
  ipcMain.handle('capture:history-remove', (_e, id) => {
    const rec = clips.getClipRecord(id)
    if (!rec) return { ok: false, reason: 'notfound' }
    clips.deleteClipRecord(id)
    if (rec.source === 'capture' && rec.refId) deleteRecord(rec.refId)
    else pushSync({ op: 'remove', store: 'clips', id })
    return { ok: true }
  })
  // 清空全部历史（两池 + IndexedDB 两 store）
  ipcMain.handle('capture:history-clear', () => {
    clips.clearClips()
    clearRecords()
    pushSync({ op: 'clear', store: 'clips' })
    return { ok: true }
  })
  // 历史条目原图（截图来源回截图池拉取；剪贴板图片按需转 dataURL）
  ipcMain.handle('capture:history-data', (_e, id) => {
    const rec = clips.getClipRecord(id)
    if (!rec) return { ok: false, reason: 'notfound' }
    if (rec.kind === 'text') return { ok: false, reason: 'text' }
    try {
      return { ok: true, data: rec.image.toDataURL() }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
  })
  // 历史条目另存为 PNG（图片条目）
  ipcMain.handle('capture:history-save-as', async (_e, id) => {
    const rec = clips.getClipRecord(id)
    if (!rec || rec.kind !== 'image') return { ok: false, reason: 'notfound' }
    const stamp = new Date(rec.createdAt)
    const pad = n => String(n).padStart(2, '0')
    const name = rec.source === 'capture'
      ? `截图-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`
      : `剪贴板图片-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), name),
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    require('fs').writeFileSync(filePath, rec.image.toPNG())
    return { ok: true, filePath }
  })

  // ---------- 剪贴板收藏 ----------
  ipcMain.handle('capture:fav-list', () => favs.favList())
  ipcMain.handle('capture:fav-ids', () => favs.favIds())
  ipcMain.handle('capture:fav-add', (_e, histId) => favs.favAdd(histId))
  ipcMain.handle('capture:fav-copy', (_e, id) => favs.favCopy(id))
  ipcMain.handle('capture:fav-remove', (_e, id) => favs.favRemove(id))
  ipcMain.handle('capture:fav-clear', () => favs.favClear())
  ipcMain.handle('capture:fav-data', (_e, id) => favs.favData(id))
  // 收藏另存为 PNG
  ipcMain.handle('capture:fav-save-as', async (_e, id) => {
    const rec = favs.getFavRecord(id)
    if (!rec || rec.kind !== 'image') return { ok: false, reason: 'notfound' }
    const stamp = new Date(rec.createdAt)
    const pad = n => String(n).padStart(2, '0')
    const name = `收藏-${stamp.getFullYear()}${pad(stamp.getMonth() + 1)}${pad(stamp.getDate())}-${pad(stamp.getHours())}${pad(stamp.getMinutes())}${pad(stamp.getSeconds())}.png`
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), name),
      filters: [{ name: 'PNG 图片', extensions: ['png'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    require('fs').writeFileSync(filePath, rec.image.toPNG())
    return { ok: true, filePath }
  })

  ipcMain.handle('capture:open-permission-settings', () => openPermissionSettings())
  // 授权引导：先触发系统登记（调一次捕获 API），再返回最新状态；
  // 渲染端据此提示「已在系统设置中登记，请开启 Electron/OmniDeck 开关」
  ipcMain.handle('capture:request-permission', () => requestScreenPermission())
}

module.exports = {
  // 注册截图工具全部 IPC（主窗就绪后调用一次）
  registerIpc
}
