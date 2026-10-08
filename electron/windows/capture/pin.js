// OmniDeck 贴屏（Pin）：置顶无边框小窗显示截图，可拖动（渲染层
// -webkit-app-region: drag）、滚轮/按钮缩放（capture-pin:resize）、双击或叉
// 关闭；同屏可贴多张。帧缓存按 pin 窗 id 传递（capture-pin:frame 拉取）。
const path = require('path')
const { ipcMain, BrowserWindow } = require('electron')

const pinWins = []
let pinWinSeq = 0
const pinFrames = new Map()

// 贴屏：初始尺寸贴原选区位置（CSS 坐标），上限 60% 屏幕避免遮挡
function pinImage(image, display, rect) {
  const factor = display.scaleFactor || 1
  // 初始尺寸：贴在原选区位置（CSS 坐标），上限 60% 屏幕避免遮挡
  const cssW = Math.min(rect.width, display.bounds.width * 0.6)
  const cssH = Math.min(rect.height * (cssW / rect.width), display.bounds.height * 0.6)
  const win = new BrowserWindow({
    x: Math.round(display.bounds.x + rect.x + (rect.width - cssW) / 2),
    y: Math.round(display.bounds.y + rect.y + (rect.height - cssH) / 2),
    width: Math.round(cssW),
    height: Math.round(cssH),
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    hasShadow: true,
    transparent: true,
    webPreferences: {
      preload: path.join(__dirname, '../../preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.setAlwaysOnTop(true, 'floating')
  pinWins.push(win)
  const onGone = () => {
    const i = pinWins.indexOf(win)
    if (i >= 0) pinWins.splice(i, 1)
  }
  win.on('closed', onGone)
  const myId = pinWinSeq
  pinFrames.set(myId, image)
  pinWinSeq++
  const url = '#/capture-pin?id=' + myId
  const load = process.env.ELECTRON_RENDERER_URL
    ? win.loadURL(process.env.ELECTRON_RENDERER_URL + url)
    : win.loadFile(path.join(__dirname, '../../../dist/index.html'), { hash: url })
  load.then(() => { if (!win.isDestroyed()) win.show() }).catch(() => onGone())
  // 窗口关闭即清理对应帧（避免内存滞留）
  win.on('closed', () => pinFrames.delete(myId))
  return win
}

// pin 窗按 id 拉取自己的图（query id 传入）
ipcMain.handle('capture-pin:frame', (event, id) => {
  const img = pinFrames.get(id)
  return img ? { ok: true, data: img.toDataURL() } : { ok: false }
})

ipcMain.handle('capture-pin:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) win.close()
  // 清理对应 frame
  return { ok: true }
})

ipcMain.handle('capture-pin:resize', (event, { scale } = {}) => {
  // 滚轮缩放：按当前尺寸等比缩放（0.9 ~ 3.0 钳制）
  const win = BrowserWindow.fromWebContents(event.sender)
  if (!win || win.isDestroyed() || !scale) return { ok: false }
  const [w, h] = win.getContentSize()
  const nw = Math.max(120, Math.round(w * scale))
  const nh = Math.max(80, Math.round(h * scale))
  win.setContentSize(nw, nh)
  return { ok: true, width: nw, height: nh }
})

module.exports = {
  // 贴屏显示截图（置顶小窗，帧按 pin 窗 id 经 capture-pin:frame 拉取）
  pinImage
}
