// OmniDeck 屏幕截取（iShot 风格截图工具）门面：init 组合根 + 对外统一 API
// （外部 require('./windows/capture') 目录解析到本文件；子模块位于本目录，各头部有职责说明）：
// - 权限：macOS 需「屏幕录制」授权（systemPreferences.getMediaAccessStatus），
//   非 granted 时渲染端引导用户去系统设置；Windows 无系统级开关直接可用
// - 全屏：光标所在显示器整屏（物理分辨率 thumbnailSize，规避 DPI 缩放模糊），
//   发起窗口先隐藏再截（避免拍到自己），截完恢复
// - 选区：透明全屏覆盖窗（每屏一窗）框选 → 隐藏覆盖窗 → 整屏截图按物理
//   像素坐标 crop（覆盖窗 CSS 坐标 × scaleFactor），Esc / 右键取消
// - 长截图：选区确定后进入滚动连拍模式（覆盖窗选区 + 控制条小窗），
//   用户滚动内容逐帧整屏截取，结束后按像素相似度去重拼接
// - 统一复制历史：截图记录 + 全局剪贴板记录合并为单一时间线（history-list），
//   截图完成即自动复制到剪贴板并出现在历史顶部；记录默认本地持久化
//   （IndexedDB，captures / clips 两 store），内存池超量淘汰最旧（截图 50 / 剪贴板 100）
// - 缩略图 360px JPEG dataURL 随记录返回，渲染端零请求直显
//
// 子模块（各模块头部有职责说明）：
//   settings   设置持久化（capture-settings.json 读-改-写）
//   native     原生窗口枚举插件 + 坐标换算助手
//   utils      通用助手（sleep / JPEG 缩略图）
//   persist    IndexedDB 持久化桥（渲染端 sink + pending 重放）
//   records    截图记录池（入库 / 淘汰 / 恢复）
//   clips      全局剪贴板历史（轮询监听 + 上限设置）
//   screen     权限 + 整屏截取原语 + 全屏截图
//   overlay    选区覆盖窗全流程（选区 + 标注编辑 + 定格帧）
//   pin        贴屏小窗
//   scroll     滚动长截图（连拍 + 像素对齐拼接）
//   favs       剪贴板收藏（独立池）
//   shortcuts  全局快捷键（iShot 风格键位）
//   ipc        IPC 注册层（通道转发与跨池协调）
const { app } = require('electron')
const { setMainWindow } = require('./persist')
const clips = require('./clips')
const shortcuts = require('./shortcuts')
const { registerIpc: registerCaptureIpc } = require('./ipc')

// init：加载设置（快捷键 / 历史上限）+ 注入主窗与回调 + 启动剪贴板轮询（恒开）
// getWindows 由 main.js 注入：返回需随截图隐藏的 BrowserWindow 列表
//   （定格优先方案下截图不隐藏应用窗口，保留参数兼容 main.js，暂无调用方）
// getSink 由 main.js 注入：返回主窗（持久化 sink 校验用）
// onShortcutsChanged 由 main.js 注入：快捷键修改后回调（托盘菜单刷新键位显示）
let getAllWindowsToHide = () => [] // 兼容保留：定格优先方案下无调用方
function init({ getWindows, getSink, onShortcutsChanged: onChanged } = {}) {
  shortcuts.loadShortcuts()
  clips.loadClipKeep()
  if (typeof getWindows === 'function') getAllWindowsToHide = getWindows
  if (typeof getSink === 'function') setMainWindow(getSink)
  if (typeof onChanged === 'function') shortcuts.setShortcutsChangedCallback(onChanged)
  clips.startClipWatcher()
  app.on('will-quit', () => {
    shortcuts.unregisterAll()
    clips.stopClipWatcher()
  })
}

module.exports = {
  // 初始化：加载设置 + 注入回调 + 启动剪贴板轮询（主进程启动时调用一次）
  init,
  // macOS 屏幕录制权限状态（其余平台恒为已授权）
  status: require('./screen').status,
  // 全屏截图：光标所在屏整屏定格 → 入库 → 复制剪贴板
  captureScreen: require('./screen').captureScreen,
  // 选区截图：overlay 选区 + 标注编辑 → 入库 / 贴屏
  captureArea: require('./overlay').captureArea,
  // 滚动长截图：选区 → 连拍 → 像素对齐拼接
  captureScroll: require('./scroll').captureScroll,
  // 快捷截图入口（定格优先，不隐藏窗口）；kind: 'area' | 'screen' | 'scroll'
  shortcutCapture: shortcuts.shortcutCapture,
  // 当前生效的截图快捷键（托盘菜单键位展示用）
  getShortcuts: shortcuts.getShortcuts,
  // 注册截图工具全部 IPC（主窗就绪后调用一次）
  registerIpc: registerCaptureIpc
}
