// OmniDeck 整屏截取与权限：macOS 屏幕录制权限状态查询 / 系统设置跳转 /
// 主动触发系统登记，以及整屏截取原语（grabDisplay）与全屏截图入口
// （captureScreen）。
const { desktopCapturer, screen, systemPreferences, shell, clipboard, nativeImage } = require('electron')
const { nativeWindows } = require('./native')
const { sleep } = require('./utils')
const { addRecord } = require('./records')

// macOS 屏幕录制权限状态（Windows / Linux 恒为已授权）
function status() {
  if (process.platform !== 'darwin') return { granted: true, raw: 'granted' }
  let raw = 'granted'
  try {
    raw = systemPreferences.getMediaAccessStatus('screen')
  } catch (e) { /* 老系统无此 API：按已授权处理 */ }
  return { granted: raw === 'granted', raw }
}

function openPermissionSettings() {
  if (process.platform === 'darwin') {
    shell.openExternal(
      'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'
    )
  }
}

// 未授权时主动触发系统登记：真实调用一次屏幕捕获 API（1×1 缩略图，开销极小）。
// macOS 机制：只有应用真正调过捕获 API，TCC 才会把它登记进「屏幕录制」列表
// （10.15–14 静默登记；15 Sequoia 直接弹系统授权弹窗）。
// 否则死循环：代码等授权才截图 → 系统等截图才登记 → 列表里永远不出现本应用
async function requestScreenPermission() {
  if (process.platform !== 'darwin') return { granted: true, raw: 'granted' }
  try {
    await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1, height: 1 } })
  } catch (e) { /* 调用本身失败不影响状态查询 */ }
  return status()
}

// ---------- 整屏截取原语 ----------
// 优先 ScreenCaptureKit（NAPI 插件，macOS 14+）：排除自身进程全部窗口——
// Overlay/主窗开着也不入镜，无需隐藏窗口、无需定格、无需等待。
// 回退 desktopCapturer（旧系统 / 插件缺失 / SCK 失败）：调用方需自行确保
// 画面中无本应用窗口（overlay 先关闭后再调用）。
async function grabDisplay(display, { windowsToHide = [], restore = true } = {}) {
  const mod = nativeWindows()
  if (mod && typeof mod.captureDisplay === 'function') {
    try {
      const png = mod.captureDisplay(display.id)
      const image = nativeImage.createFromBuffer(png)
      if (!image.isEmpty()) return { ok: true, image }
    } catch (e) { /* SCK 不可用/失败：回退 desktopCapturer */ }
  }

  const hidden = []
  for (const w of windowsToHide) {
    try {
      if (w && !w.isDestroyed() && w.isVisible()) {
        w.hide()
        hidden.push(w)
      }
    } catch (e) { /* 窗口竞态忽略 */ }
  }
  if (hidden.length) await sleep(220)

  try {
    const factor = display.scaleFactor || 1
    const phys = {
      width: Math.round(display.bounds.width * factor),
      height: Math.round(display.bounds.height * factor)
    }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: phys })
    const src = sources.find(s => s.display_id === String(display.id)) || sources[0]
    if (!src) return { ok: false, error: '未找到可用的屏幕源' }
    return { ok: true, image: src.thumbnail }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  } finally {
    if (restore) {
      for (const w of hidden) {
        try { if (!w.isDestroyed()) w.show() } catch (e) { /* 忽略 */ }
      }
    }
  }
}

// 全屏截图：光标所在显示器整屏定格（不隐藏窗口），入库并复制到剪贴板
async function captureScreen({ copy = true } = {}) {
  const st = status()
  if (!st.granted) return { ok: false, reason: 'permission' }
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const res = await grabDisplay(display)
    if (!res.ok) return res
    if (copy) { try { clipboard.writeImage(res.image) } catch (e) { /* 忽略 */ } }
    return { ok: true, image: addRecord(res.image) }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  }
}

module.exports = {
  // macOS 屏幕录制权限状态（其余平台恒为已授权）
  status,
  // 跳转系统设置的屏幕录制授权页（仅 mac）
  openPermissionSettings,
  // 主动触发系统 TCC 登记（调一次捕获 API）并返回最新状态
  requestScreenPermission,
  // 整屏截取原语（SCK 优先排除自身窗口；回退 desktopCapturer 可选隐藏窗口）
  grabDisplay,
  // 全屏截图：光标所在屏整屏定格 → 入库 → 复制剪贴板
  captureScreen
}
