// OmniDeck 截图全局快捷键（iShot 风格）：主进程 globalShortcut 注册（系统级，
// 应用未聚焦也能触发）；默认 ⇧⌘S 选区标注截图 / ⌥⇧3 全屏 / ⌥⇧S 长截图，
// 可在设置中修改（读-改-写持久化到 capture-settings.json）。
const { globalShortcut } = require('electron')
const { readCaptureSettings, updateCaptureSettings } = require('./settings')
const { status, captureScreen } = require('./screen')
const { captureArea } = require('./overlay')
const { captureScroll } = require('./scroll')

const SHORTCUT_KEYS = ['area', 'screen', 'scroll']
const DEFAULT_SHORTCUTS = {
  area: 'CommandOrControl+Shift+S', // 选区截图（进入标注编辑）
  screen: 'Alt+Shift+3', // 全屏截图
  scroll: 'Alt+Shift+S' // 滚动长截图
}
let shortcuts = { ...DEFAULT_SHORTCUTS }
// 快捷键变更回调（init 时注入：托盘菜单等展示键位处同步刷新）
let onShortcutsChanged = null

// 快捷键触发的截图：定格优先流程，不隐藏任何窗口（所见即所得，零闪烁）
async function shortcutCapture(kind) {
  const st = status()
  if (!st.granted) return
  if (kind === 'screen') await captureScreen({ copy: true })
  else if (kind === 'scroll') await captureScroll({})
  else await captureArea({ copy: true, annotate: true })
}

const shortcutHandlers = {
  area: () => shortcutCapture('area'),
  screen: () => shortcutCapture('screen'),
  scroll: () => shortcutCapture('scroll')
}

// 启动时从设置文件加载键位（init 调用；缺省走 DEFAULT_SHORTCUTS）
function loadShortcuts() {
  const s = readCaptureSettings()
  if (s.shortcuts) shortcuts = { ...DEFAULT_SHORTCUTS, ...s.shortcuts }
}

function registerShortcuts() {
  for (const key of SHORTCUT_KEYS) {
    try {
      const acc = shortcuts[key]
      if (!acc) continue
      const ok = globalShortcut.register(acc, shortcutHandlers[key])
      if (!ok) console.warn(`[capture] 快捷键 ${acc} 注册失败（可能被占用）`)
    } catch (e) {
      console.warn(`[capture] 快捷键 ${shortcuts[key]} 注册异常：`, e.message)
    }
  }
}

// 当前生效的快捷键（托盘菜单键位展示用）
function getShortcuts() {
  return { ...shortcuts }
}

// 修改单项快捷键：先试注册（占用则报错），成功后替换旧键并落盘，
// 通知外部（托盘菜单等展示键位处）同步刷新
function setShortcut(key, accelerator) {
  if (!SHORTCUT_KEYS.includes(key)) return { ok: false, error: '未知快捷键项' }
  if (!accelerator) return { ok: false, error: '快捷键不能为空' }
  const ok = globalShortcut.register(accelerator, shortcutHandlers[key])
  if (!ok) return { ok: false, error: `「${accelerator}」已被其它应用占用` }
  globalShortcut.unregister(shortcuts[key])
  shortcuts[key] = accelerator
  updateCaptureSettings({ shortcuts })
  if (typeof onShortcutsChanged === 'function') {
    try { onShortcutsChanged({ ...shortcuts }) } catch (e) { /* 忽略 */ }
  }
  return { ok: true, shortcuts: { ...shortcuts } }
}

// 试注册探测键位是否可用（注册成功即注销）
function testShortcut(accelerator) {
  const ok = globalShortcut.register(accelerator, () => {})
  if (ok) globalShortcut.unregister(accelerator)
  return { ok }
}

// 退出时注销全部快捷键（app will-quit 钩子用）
function unregisterAll() {
  globalShortcut.unregisterAll()
}

module.exports = {
  // 启动时从设置文件加载键位（init 调用）
  loadShortcuts,
  // 注册全部快捷键（registerIpc 时调用）
  registerShortcuts,
  // 当前生效的快捷键（托盘菜单键位展示用）
  getShortcuts,
  // 修改单项快捷键（试注册 → 替换旧键 → 落盘 → 通知回调）
  setShortcut,
  // 试注册探测键位可用性
  testShortcut,
  // 退出时注销全部快捷键
  unregisterAll,
  // 注入快捷键变更回调（托盘菜单刷新键位显示）
  setShortcutsChangedCallback(fn) { if (typeof fn === 'function') onShortcutsChanged = fn },
  // 快捷键触发的截图（定格优先，不隐藏窗口）
  shortcutCapture
}
