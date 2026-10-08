// OmniDeck 截图原生插件与坐标助手：macOS 窗口枚举原生插件加载（NAPI +
// CGWindowList，hover 拾取窗口用）、窗口列表 → 屏内相对坐标换算、
// overlay 所在屏反查与 CSS → 物理像素矩形换算。
const path = require('path')
const { screen } = require('electron')

// ---------- macOS 窗口枚举原生插件（hover 拾取窗口用，NAPI + CGWindowList） ----------
// 返回 z 序（前→后）可见普通窗口，排除本进程（Overlay 自身不可被拾取）。
// 坐标为全局 DIP（与 screen API 同系）。加载失败（非 mac / 未编译）时返回 null，
// Overlay 渲染层降级为纯拖拽框选，不影响既有功能。
let nativeWinMod = null
let nativeWinTried = false
function nativeWindows() {
  if (nativeWinTried) return nativeWinMod
  nativeWinTried = true
  if (process.platform !== 'darwin') return null
  try {
    // dev：dist-electron/windows/capture/ → ../../../native/；打包后经 asarUnpack 自动重定向到 app.asar.unpacked
    nativeWinMod = require(path.join(__dirname, '../../../native/build/Release/windows.node'))
  } catch (e) {
    console.warn('[capture] 窗口枚举插件未加载（hover 拾取不可用，仅拖拽框选）：', e.message)
  }
  return nativeWinMod
}

// 窗口列表 → 指定屏内相对坐标（跨屏窗口裁剪为本屏可见部分，z 序保持）
function toDisplayWindows(list, display) {
  const db = display.bounds
  const items = []
  for (const w of list) {
    const l = Math.max(w.x, db.x)
    const t = Math.max(w.y, db.y)
    const r = Math.min(w.x + w.width, db.x + db.width)
    const b = Math.min(w.y + w.height, db.y + db.height)
    if (r - l < 40 || b - t < 40) continue // 与本屏无有效相交
    items.push({
      windowNumber: w.windowNumber,
      pid: w.pid,
      owner: w.owner,
      title: w.title,
      x: l - db.x,
      y: t - db.y,
      width: r - l,
      height: b - t
    })
  }
  return items
}

// overlay 所在屏反查（覆盖窗边界即屏幕边界）
function displayOfWindow(win) {
  const bounds = win.getBounds()
  return screen.getAllDisplays().find(d => d.bounds.x === bounds.x && d.bounds.y === bounds.y) ||
    screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
}

// 选区 CSS 坐标 → 物理像素矩形（crop 用；越界钳制到屏内）
function physRectOf(display, rect) {
  const factor = display.scaleFactor || 1
  const phys = {
    width: Math.round(display.bounds.width * factor),
    height: Math.round(display.bounds.height * factor)
  }
  const x = Math.max(0, Math.min(phys.width - 1, Math.round(rect.x * factor)))
  const y = Math.max(0, Math.min(phys.height - 1, Math.round(rect.y * factor)))
  return {
    x, y,
    width: Math.max(1, Math.min(phys.width - x, Math.round(rect.width * factor))),
    height: Math.max(1, Math.min(phys.height - y, Math.round(rect.height * factor)))
  }
}

module.exports = {
  // 原生窗口枚举插件（非 mac / 未编译返回 null，渲染层降级拖拽框选）
  nativeWindows,
  // 窗口列表 → 指定屏内相对坐标（跨屏裁剪，z 序保持）
  toDisplayWindows,
  // overlay 所在屏反查（覆盖窗边界即屏幕边界）
  displayOfWindow,
  // 选区 CSS 坐标 → 物理像素矩形（crop 用）
  physRectOf
}
