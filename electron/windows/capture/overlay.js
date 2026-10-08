// OmniDeck 选区截屏（overlay 单窗口全流程，iShot 体验）：
// 透明 overlay 直接覆盖真实屏幕：hover 拾取窗口 / 拖选 → 选定后 overlay 内
// 调 capture-overlay:freeze 抓整屏帧（SCK 排除自身，overlay 不关窗不入镜；
// 非 SCK 兜底时主进程临时隐藏 overlay 抓完恢复，渲染端无感）→ overlay 原地
// 切换编辑态（定格帧背景 + Canvas 标注 + 微调手柄）→ 确认/贴屏/取消经
// capture-overlay:done 回传。全程单窗口，零切换零闪烁。
const path = require('path')
const { ipcMain, BrowserWindow, screen, nativeImage, clipboard } = require('electron')
const { displayOfWindow, physRectOf, nativeWindows, toDisplayWindows } = require('./native')
const { status, grabDisplay } = require('./screen')
const { addRecord } = require('./records')
const { pinImage } = require('./pin')

let overlayWins = []
let selecting = false
let pendingResolve = null

// 流程：发起窗先隐藏 → 每屏铺一透明覆盖窗（#/capture-overlay?d=<displayId>）→
// 用户框选（覆盖窗内 JS 拖拽矩形，Esc/右键取消）→ 覆盖窗经 capture-overlay:done
// 回传选区（该屏 CSS 坐标）→ 主进程隐藏覆盖窗 → 整屏截取 → crop 物理像素 → 入库
function closeOverlays() {
  for (const w of overlayWins) {
    try { if (!w.isDestroyed()) w.destroy() } catch (e) { /* 忽略 */ }
  }
  overlayWins = []
  selecting = false
}

// overlay 选区/编辑完成由渲染页回调（单窗口全流程）：
// - picking 阶段：rect 为该屏 CSS 坐标 → 主进程抓帧（freeze）交回 overlay 编辑
// - editing 阶段：result = { action: 'confirm'|'pin'|'cancel', data: PNG dataURL }
//   或 rect（重新选区）→ 结束本次截图
function onOverlayDone(display, payload) {
  if (!pendingResolve) return
  // 编辑结果回传（编辑器已并入 overlay）
  if (payload && typeof payload === 'object' && payload.action) {
    const resolve = pendingResolve
    pendingResolve = null
    closeOverlays()
    resolve({ ok: true, display, edited: payload })
    return
  }
  const rect = payload
  const resolve = pendingResolve
  pendingResolve = null
  if (!rect || rect.width < 3 || rect.height < 3) {
    closeOverlays()
    resolve({ ok: false, reason: 'cancelled' })
    return
  }
  resolve({ ok: true, display, rect })
}

function waitSelection() {
  return new Promise(resolve => {
    const finish = v => {
      clearTimeout(timer)
      resolve(v)
    }
    // 覆盖窗意外全灭（如系统切屏）兜底释放等待方，避免永久挂起
    const timer = setTimeout(() => {
      if (pendingResolve === finish) {
        pendingResolve = null
        closeOverlays()
        resolve({ ok: false, reason: 'cancelled' })
      }
    }, 10 * 60 * 1000)
    pendingResolve = finish
  })
}

// 铺覆盖窗（选区 UI）：每屏一窗；mode=scroll 时选完直接回传（无编辑态）
function openOverlays(mode) {
  const displays = screen.getAllDisplays()
  for (const d of displays) {
    const win = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      show: false,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: true,
      alwaysOnTop: true,
      // 覆盖窗为半透明遮罩层：不可透明点击（需接收鼠标事件）
      transparent: true,
      hasShadow: false,
      webPreferences: {
        preload: path.join(__dirname, '../../preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    overlayWins.push(win)

    const qs = 'd=' + d.id + (mode === 'scroll' ? '&m=scroll' : '')
    const load = process.env.ELECTRON_RENDERER_URL
      ? win.loadURL(process.env.ELECTRON_RENDERER_URL + '#/capture-overlay?' + qs)
      : win.loadFile(path.join(__dirname, '../../../dist/index.html'), { hash: '/capture-overlay?' + qs })

    // 首窗 show 聚焦，其余跟随显示（避免逐个抢焦点）
    load.then(() => {
      if (!win.isDestroyed()) win.show()
    }).catch(() => {})
  }
}

// 覆盖窗关闭中（渲染端 Esc / 右键取消也会走 capture-overlay:done 传空），
// 渲染端直接关窗的场景兜底：监测 overlayWins 全灭即取消
function onOverlayWindowClosed() {
  if (!pendingResolve) return
  const alive = overlayWins.some(w => {
    try { return !w.isDestroyed() } catch (e) { return false }
  })
  if (!alive) {
    const resolve = pendingResolve
    pendingResolve = null
    selecting = false
    overlayWins = []
    resolve({ ok: false, reason: 'cancelled' })
  }
}

// 覆盖窗全灭兜底（渲染端直接关窗而非经 capture-overlay:done 回传时）：取消等待
function bindOverlayGuards() {
  for (const w of overlayWins) {
    w.on('closed', onOverlayWindowClosed)
  }
}

// 铺 overlay 并等待全流程（选区 + 编辑）回传：{ display, rect } / { display,
// edited } 或取消。选定选区后 overlay 不关窗，改调 freeze 抓帧原地编辑。
async function waitPick(mode) {
  selecting = true
  try {
    openOverlays(mode || 'area')
    bindOverlayGuards()
    return await waitSelection()
  } finally {
    closeOverlays()
  }
}

// 选区截屏入口（overlay 单窗口全流程）：
// overlay 内完成选区 + 标注编辑，edited.action = confirm（入库+复制）/
// pin（贴屏）/ cancel；rect 模式（无编辑器环境）直接 crop 入库
async function captureArea({ copy = true, annotate = true } = {}) {
  const st = status()
  if (!st.granted) return { ok: false, reason: 'permission' }
  if (selecting) return { ok: false, reason: 'busy' }

  try {
    const picked = await waitPick('area')
    if (!picked || !picked.ok) return { ok: false, reason: 'cancelled' }
    const { display } = picked

    // 编辑结果（overlay 内已完成标注）
    if (picked.edited) {
      const edited = picked.edited
      if (edited.action === 'cancel' || !edited.data) return { ok: false, reason: 'cancelled' }
      const image = nativeImage.createFromDataURL(edited.data)
      if (image.isEmpty()) return { ok: false, error: '结果图像解析失败' }
      if (edited.action === 'pin') {
        const r = edited.rect || { x: 0, y: 0, width: image.getSize().width, height: image.getSize().height }
        pinImage(image, display, r)
        return { ok: true, pinned: true }
      }
      if (copy !== false) { try { clipboard.writeImage(image) } catch (e) { /* 忽略 */ } }
      return { ok: true, image: addRecord(image) }
    }

    // 仅选区 rect（编辑器不可用降级）：直接抓帧 crop 入库
    const res = await grabDisplay(display)
    if (!res.ok) return res
    const phys = physRectOf(display, picked.rect)
    const cropped = res.image.crop(phys)
    if (copy) { try { clipboard.writeImage(cropped) } catch (e) { /* 忽略 */ } }
    return { ok: true, image: addRecord(cropped) }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  } finally {
    closeOverlays()
  }
}

// ---------- 选区定格帧抓取（freeze：overlay 单窗口编辑用） ----------
// overlay 选定选区后调用：抓本屏整屏帧（物理分辨率）返回 dataURL，overlay
// 原地切换编辑态。SCK 排除自身（overlay 开着不入镜）；desktopCapturer 兜底
// 时临时隐藏全部 overlay 抓完恢复（渲染端无感，代价是一次 ~120ms 闪烁）。
// 同时销毁其他屏 overlay（进入编辑态后禁止跨屏再选，防竞态）。
ipcMain.handle('capture-overlay:freeze', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false }
  const display = displayOfWindow(win)

  // 其他屏 overlay 退场（本窗保留进编辑态）
  for (const w of overlayWins) {
    if (w === win) continue
    try { if (!w.isDestroyed()) w.destroy() } catch (e) { /* 忽略 */ }
  }
  overlayWins = [win]

  const mod = nativeWindows()
  const useSck = mod && typeof mod.captureDisplay === 'function'
  const res = await grabDisplay(display, {
    windowsToHide: useSck ? [] : [win],
    restore: true
  })
  if (!res.ok) return { ok: false, error: res.error }
  return {
    ok: true,
    frame: res.image.toDataURL(),
    factor: display.scaleFactor || 1
  }
})

// 覆盖窗拉取交互上下文（实时）：本屏窗口列表（z 序前→后，hover 拾取用）
// + 光标位置（本屏相对，渲染层据此默认选中光标下窗口）
function overlayContext(event) {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false }
  const display = displayOfWindow(win)
  const mod = nativeWindows()
  let items = []
  if (mod) {
    try { items = toDisplayWindows(mod.getWindows(), display) } catch (e) { /* 降级无窗口拾取 */ }
  }
  const c = screen.getCursorScreenPoint()
  return {
    ok: true,
    windows: items,
    cursor: { x: c.x - display.bounds.x, y: c.y - display.bounds.y }
  }
}

// 窗口枚举（实时，供调试/其他调用；overlay 交互用 capture-overlay:context）
function listWindowsForSender(event) {
  const mod = nativeWindows()
  if (!mod) return { ok: false, reason: 'native' }
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win) return { ok: false, reason: 'nowin' }
  try {
    return { ok: true, items: toDisplayWindows(mod.getWindows(), displayOfWindow(win)) }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

module.exports = {
  // 选区截屏入口（overlay 选区 + 标注编辑 + 贴屏/入库/复制）
  captureArea,
  // overlay 选区/编辑完成回传处理（IPC 层转发用）
  onOverlayDone,
  // 铺 overlay 并等待全流程回传（选区 rect 或编辑结果；长截图选区复用）
  waitPick,
  // 是否有选区流程进行中（busy 判定）
  isSelecting() { return selecting },
  // 关闭全部覆盖窗并复位选区状态
  closeOverlays,
  // overlay 交互上下文（本屏窗口列表 + 光标位置；IPC 层转发用）
  overlayContext,
  // 实时窗口枚举（调试/其他调用）
  listWindowsForSender
}
