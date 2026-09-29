// OmniDeck 快捷入口（P0-M1）：托盘常驻 + 全局快捷键 + Spotlight 式快捷面板壳
// - 托盘：应用 logo 彩色图标；菜单按 Deck / Buddy 分组直达 + 快捷截图 / 快捷面板，
//   全局项（检查更新 / 退出应用）独立呈现——托盘常驻后真正退出的唯一入口
// - 全局快捷键：CmdOrCtrl+Shift+O 唤起/隐藏面板（系统级，应用未聚焦也生效）；
//   注册失败（冲突）以系统通知降级提示，仍可经托盘菜单唤起
// - 面板窗：无边框、不进任务栏、置顶；失焦不隐藏（降为普通层级，重新聚焦恢复置顶）；
//   Esc / 头部关闭按钮由渲染页经 quick:hide 触发
// - 锁联动：面板加载同一 Vue 应用，全局挂载的 AppLock 组件天然覆盖锁屏；
//   本模块仅需把系统锁屏事件转发给面板窗（与 main.js 对主窗口的转发同模式）
const { app, BrowserWindow, Tray, Menu, globalShortcut, nativeImage, Notification, screen, powerMonitor, ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
// 截图模块（同目录独立构建产物，运行时 require）：托盘「快捷截图」项复用其隐藏窗口截图管线
const capture = require('./capture')

let tray = null
let panel = null
let getWindow = null // 主窗口 getter（main.js 注入）
const trayItemAccels = new Map() // 菜单项自定义快捷键 → 已注册标记

// 快捷键等主进程可读配置（渲染端 localStorage 主进程读不到，故独立存此文件）
// 默认键含 O（OmniDeck 品牌首字母），降低与其他产品常见快捷键的冲突
// trayMenuVer：托盘菜单默认配置版本——旧配置文件缺此标记时自动升级到新默认
const DEFAULT_SETTINGS = {
  panelShortcut: 'CommandOrControl+Shift+O',
  trayMenuVer: 2,
  // 托盘菜单自定义项（按 Deck / Buddy 分组；group: 'deck' | 'buddy'）
  // accelerator：系统级快捷键默认值（⌘⌥ 系列，避开面板 ⌘⇧O 与截图 ⌘⇧S / ⌥⇧S / ⌥⇧3）
  trayMenu: [
    { id: 'deck-home', group: 'deck', label: '打开 Deck 首页', route: '/home', accelerator: 'CommandOrControl+Alt+D' },
    { id: 'deck-favorites', group: 'deck', label: '打开我的收藏', route: '/favorites', accelerator: 'CommandOrControl+Alt+F' },
    { id: 'buddy-chat', group: 'buddy', label: '打开 Buddy 对话', route: '/omnibuddy', accelerator: 'CommandOrControl+Alt+B' },
    { id: 'buddy-workspace', group: 'buddy', label: '打开 Buddy 工作空间', route: '/omnibuddy/workspace', accelerator: 'CommandOrControl+Alt+W' }
  ]
}
let settings = { ...DEFAULT_SETTINGS }

const settingsFile = () => path.join(app.getPath('userData'), 'quick-settings.json')

function loadSettings() {
  try {
    const s = JSON.parse(fs.readFileSync(settingsFile(), 'utf-8'))
    settings = { ...DEFAULT_SETTINGS, ...s }
    // 托盘菜单默认项升级：旧配置（无版本标记）重置为新默认（Deck 仅留首页 + 项级默认快捷键）
    if (s.trayMenuVer !== DEFAULT_SETTINGS.trayMenuVer) {
      settings.trayMenu = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.trayMenu))
      settings.trayMenuVer = DEFAULT_SETTINGS.trayMenuVer
      saveSettings()
    }
  } catch (e) { /* 首次不存在：走默认值 */ }
}

// ---------- 托盘图标（M5）：
// - mac：Template 模板图（trayTemplate.png + @2x/@4x 多分辨率），声明 setTemplateImage
//   后由系统接管渲染——浅色菜单栏黑色 / 深色菜单栏白色，自动适配外观
// - Windows / Linux：彩色 tray-win.png（16/32px 惯例彩色图标）
// - 路径：打包后从 resources/tray/ 读；dev 回退仓库 build/ 源文件 ----------
function trayResourceDir() {
  const candidates = [
    path.join(process.resourcesPath, 'tray'),
    path.join(__dirname, '../../build')
  ]
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p } catch (e) { /* 忽略 */ }
  }
  return ''
}

function loadTemplateImage(dir) {
  // 基础 1x 表示；@2x/@4x 经 addRepresentation 附加（Electron 无 createFromImages API）
  // 全部缺失时回退 null（调用方再退彩色 logo）
  const base = path.join(dir, 'trayTemplate.png')
  if (!fs.existsSync(base)) return null
  const image = nativeImage.createFromPath(base)
  const reps = [
    { p: path.join(dir, 'trayTemplate@2x.png'), s: 2 },
    { p: path.join(dir, 'trayTemplate@4x.png'), s: 4 }
  ].filter(r => fs.existsSync(r.p))
  for (const r of reps) {
    try {
      image.addRepresentation({ scaleFactor: r.s, buffer: fs.readFileSync(r.p) })
    } catch (e) { /* 附加失败退化为 1x 模糊：可接受 */ }
  }
  image.setTemplateImage(true)
  return image
}

function createTray() {
  const dir = trayResourceDir()
  let image = nativeImage.createEmpty()
  if (dir) {
    if (process.platform === 'darwin') {
      image = loadTemplateImage(dir) || image
    } else {
      const p = path.join(dir, 'tray-win.png')
      if (fs.existsSync(p)) image = nativeImage.createFromPath(p)
    }
    // 兜底：专用图标缺失时退回彩色 logo（mac resize 到 18px 保证清晰）
    if (image.isEmpty() && fs.existsSync(path.join(dir, 'logo.png'))) {
      image = nativeImage.createFromPath(path.join(dir, 'logo.png'))
        .resize({ width: process.platform === 'darwin' ? 18 : 16 })
    }
  }
  tray = new Tray(image)
  tray.setToolTip('OmniDeck')
  rebuildTrayMenu()
}

// 主窗口聚焦并跳转指定路由（渲染侧 App.vue 监听 nav:goto 跳转）
function gotoRoute(p) {
  const win = getWindow && getWindow()
  if (win && !win.isDestroyed()) {
    win.show()
    win.focus()
    win.webContents.send('nav:goto', p)
  }
}

// 托盘菜单数据校验：清洗用户配置，非法项丢弃
// invalid（可选数组）：收集被丢弃的项及原因，供渲染端逐项提示用户（而非静默消失）
function sanitizeTrayMenu(items, invalid) {
  if (!Array.isArray(items)) {
    if (invalid) invalid.push({ id: '', label: '', route: '', reason: '菜单数据格式错误' })
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS.trayMenu))
  }
  const out = []
  for (const it of items) {
    if (!it || typeof it !== 'object') {
      if (invalid) invalid.push({ id: '', label: '', route: '', reason: '菜单项格式错误' })
      continue
    }
    const id = typeof it.id === 'string' ? it.id : ''
    const label = typeof it.label === 'string' ? it.label.trim() : ''
    const route = typeof it.route === 'string' ? it.route.trim() : ''
    if (!label) {
      if (invalid) invalid.push({ id, label: '', route, reason: '菜单名称为空' })
      continue
    }
    if (!route.startsWith('/')) {
      if (invalid) invalid.push({ id, label, route, reason: route ? '路由需以 / 开头' : '路由为空' })
      continue
    }
    const accelerator = typeof it.accelerator === 'string' && it.accelerator ? it.accelerator : ''
    out.push({ id: id || 'custom-' + Date.now() + '-' + out.length, group: it.group === 'buddy' ? 'buddy' : 'deck', label, route, accelerator })
  }
  // id 去重（重复时追加序号，保证菜单项 key 唯一）
  const seen = new Set()
  out.forEach((it, i) => {
    while (seen.has(it.id)) it.id = it.id + '-' + i
    seen.add(it.id)
  })
  return out
}

// 按配置重建托盘菜单 + 重注册菜单项系统级快捷键
function rebuildTrayMenu() {
  if (!tray) return
  const items = sanitizeTrayMenu(settings.trayMenu)
  settings.trayMenu = items

  // 菜单项快捷键：先注销旧的自定义项键位，再逐项注册（与 panel 快捷键互斥校验）
  const fixed = [settings.panelShortcut]
  unregisterTrayItemShortcuts()
  for (const it of items) {
    if (!it.accelerator) continue
    if (fixed.some(a => a && a.toLowerCase() === it.accelerator.toLowerCase())) continue // 与固定键冲突：跳过
    const ok = globalShortcut.register(it.accelerator, () => gotoRoute(it.route))
    if (ok) {
      trayItemAccels.set(it.accelerator, true)
    } else {
      it.accelerator = '' // 注册失败（被占用）：置空避免菜单显示无效键
    }
  }

  // buildGroup(key, label)：key 为数据分组（小写 deck/buddy，与 sanitizeTrayMenu 归一化一致）
  const group = name => items.filter(it => it.group === name)
  const buildGroup = (key, label) => {
    const list = group(key)
    if (!list.length) return { label, enabled: false }
    return {
      label,
      submenu: list.map(it => ({
        label: it.label,
        accelerator: it.accelerator || undefined,
        click: () => gotoRoute(it.route)
      }))
    }
  }

  const menu = Menu.buildFromTemplate([
    buildGroup('deck', 'Deck 视图'),
    buildGroup('buddy', 'Buddy 视图'),
    { type: 'separator' },
    {
      // 快捷截图：选区截图（进入标注编辑）；键位实时取截图设置，与全局快捷键同源
      label: '快捷截图',
      accelerator: capture.getShortcuts().area || undefined,
      click: () => {
        if (!capture.status().granted) {
          try {
            new Notification({
              title: 'OmniDeck 快捷截图',
              body: '尚未获得屏幕录制权限，请到 设置 → 截图 中授权后重试'
            }).show()
          } catch (e) { /* 通知失败忽略 */ }
          return
        }
        capture.shortcutCapture('area')
      }
    },
    {
      label: '快捷面板',
      accelerator: settings.panelShortcut,
      click: () => showPanel()
    },
    {
      // 检查更新（N1）：全局项，主窗口聚焦并跳版本页
      label: '检查更新',
      click: () => gotoRoute('/version')
    },
    {
      label: '退出应用',
      accelerator: 'CommandOrControl+Q',
      click: () => {
        // before-quit 会置 quitting 标记，主窗口 close 拦截据此放行（见 main.js）
        app.quit()
      }
    }
  ])
  tray.setContextMenu(menu)
}

// 注销全部菜单项自定义快捷键（panel 等固定键不受影响）
function unregisterTrayItemShortcuts() {
  for (const a of trayItemAccels.keys()) globalShortcut.unregister(a)
  trayItemAccels.clear()
}

// ---------- 快捷面板窗口 ----------
function createPanel() {
  const isMac = process.platform === 'darwin'
  panel = new BrowserWindow({
    width: 760,
    height: 520, // M2：消息区 + 输入区（壳阶段 320 → 对话需要更高）
    useContentSize: true,
    show: false,
    frame: false,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    ...(isMac
      ? {
          vibrancy: 'under-window',
          visualEffectState: 'active'
        }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // Spotlight 语义：唤起期间浮于所有应用之上
  panel.setAlwaysOnTop(true, 'floating')

  // 失焦不隐藏：降为普通层级（可被其他窗口遮挡），
  // 重新聚焦时恢复置顶；隐藏/关闭仍走关闭按钮 / Esc / 快捷键 / 托盘
  panel.on('blur', () => {
    if (panel && !panel.isDestroyed()) panel.setAlwaysOnTop(false)
  })

  panel.on('focus', () => {
    if (panel && !panel.isDestroyed()) panel.setAlwaysOnTop(true, 'floating')
  })

  panel.on('closed', () => {
    panel = null
  })

  // 与主窗口同构：dev 走 dev server，生产加载打包文件（hash 路由 /quick）
  if (process.env.ELECTRON_RENDERER_URL) {
    panel.loadURL(process.env.ELECTRON_RENDERER_URL + '#/quick')
  } else {
    panel.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/quick' })
  }
}

function showPanel() {
  if (!panel || panel.isDestroyed()) createPanel()

  // 定位：光标所在显示器水平居中、顶部约 22%（多显示器下跟随用户注意力）
  try {
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const area = display.workArea
    const [w, h] = panel.getSize()
    const x = Math.round(area.x + (area.width - w) / 2)
    const y = Math.round(area.y + area.height * 0.22)
    panel.setPosition(x, y, false)
  } catch (e) { /* 定位失败：走系统默认位置 */ }

  // 失焦期间再次唤起：恢复置顶悬浮层级
  panel.setAlwaysOnTop(true, 'floating')
  panel.show()
  panel.focus()
  // 通知面板页：唤起（M4 剪贴板图片感知等场景）
  sendToPanel('quick:visibility', true)
}

function hidePanel() {
  if (panel && !panel.isDestroyed()) {
    panel.hide()
    sendToPanel('quick:visibility', false)
  }
}

function togglePanel() {
  if (panel && !panel.isDestroyed() && panel.isVisible()) {
    panel.hide()
  } else {
    showPanel()
  }
}

// ---------- 全局快捷键 ----------
function registerShortcuts() {
  const ok = globalShortcut.register(settings.panelShortcut, togglePanel)
  if (!ok) {
    // 冲突降级：提示用户仍可经托盘菜单唤起（设置页可改键）
    try {
      new Notification({
        title: 'OmniDeck 快捷键注册失败',
        body: `「${settings.panelShortcut}」已被其它应用占用，可从托盘菜单唤起或到设置中改键`
      }).show()
    } catch (e) { /* 通知失败忽略 */ }
  }
}

// 改键：注销旧键 → 注册新键 → 持久化（注册失败回滚旧键并返回失败）
function setPanelShortcut(accelerator) {
  const prev = settings.panelShortcut
  globalShortcut.unregister(prev)
  const ok = globalShortcut.register(accelerator, togglePanel)
  if (!ok) {
    // 回滚：新键不可用，恢复旧键
    globalShortcut.unregister(accelerator)
    if (prev) globalShortcut.register(prev, togglePanel)
    return { ok: false, error: `「${accelerator}」注册失败：可能已被其它应用占用` }
  }
  settings.panelShortcut = accelerator
  saveSettings()
  rebuildTrayMenu() // 菜单中「快捷面板」项的键位显示同步刷新
  return { ok: true, accelerator }
}

function saveSettings() {
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2))
  } catch (e) { /* 写盘失败忽略（下次启动回退旧值） */ }
}

// ---------- IPC（渲染页调用） ----------
function registerIpc() {
  ipcMain.handle('quick:show', () => showPanel())
  ipcMain.handle('quick:hide', () => hidePanel())
  // 快捷键设置（M4）：读取 / 修改面板唤起快捷键
  ipcMain.handle('quick:get-shortcut', () => ({ accelerator: settings.panelShortcut }))
  ipcMain.handle('quick:set-shortcut', (_e, accelerator) => setPanelShortcut(accelerator))
  // 托盘快捷菜单：读取 / 保存（保存即重建菜单并重注册快捷键）
  ipcMain.handle('quick:get-tray-menu', () => ({ items: settings.trayMenu }))
  ipcMain.handle('quick:set-tray-menu', (_e, items) => {
    const invalid = []
    const list = sanitizeTrayMenu(items, invalid)
    // 项间快捷键冲突检测（重复键位保留首个）
    const used = new Set([settings.panelShortcut.toLowerCase()])
    for (const it of list) {
      if (!it.accelerator) continue
      if (used.has(it.accelerator.toLowerCase())) {
        it.accelerator = ''
      } else {
        used.add(it.accelerator.toLowerCase())
      }
    }
    settings.trayMenu = list
    saveSettings()
    rebuildTrayMenu()
    return { ok: true, items: list, invalid }
  })
  // 恢复托盘快捷菜单默认配置
  ipcMain.handle('quick:reset-tray-menu', () => {
    settings.trayMenu = JSON.parse(JSON.stringify(DEFAULT_SETTINGS.trayMenu))
    saveSettings()
    rebuildTrayMenu()
    return { ok: true, items: settings.trayMenu }
  })
  // 改键注册试运行：不落盘，仅验证可注册性（录制器实时校验用）
  ipcMain.handle('quick:test-shortcut', (_e, accelerator) => {
    const ok = globalShortcut.register(accelerator, () => {})
    if (ok) globalShortcut.unregister(accelerator)
    return { ok }
  })
}

function sendToPanel(channel, payload) {
  if (panel && !panel.isDestroyed()) {
    try {
      panel.webContents.send(channel, payload)
    } catch (e) { /* webContents 未就绪忽略 */ }
  }
}

// ---------- 初始化 ----------
function init(opts) {
  getWindow = opts.getWindow

  loadSettings()
  createTray()
  registerShortcuts()
  registerIpc()

  // 系统锁屏 → 转发面板窗（面板页内全局 AppLock 据此重新锁定，
  // 与 main.js 对主窗口的 powerMonitor 转发同模式）
  powerMonitor.on('lock-screen', () => sendToPanel('app-lock:system-locked'))

  // 退出前清理全局快捷键（避免注销后仍占用系统键位）
  app.on('will-quit', () => globalShortcut.unregisterAll())
}

module.exports = { init, rebuildTrayMenu, getPanelWindow: () => panel }
