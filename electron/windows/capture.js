// OmniDeck 屏幕截取（iShot 风格截图工具）：全屏 / 选区 / 滚动长截图 + 统一复制历史
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
const {
  app, ipcMain, desktopCapturer, screen, systemPreferences, shell, BrowserWindow,
  clipboard, dialog, globalShortcut, nativeImage
} = require('electron')
const path = require('path')

// 内存记录池：id -> { id, image(NativeImage), width, height, createdAt, mime, thumb }
const records = new Map()
// 保留条数上限（超出最旧淘汰）
const KEEP_COUNT = 50
let serial = 0

// ---------- 全局快捷键（iShot 风格） ----------
// 快捷键由主进程 globalShortcut 注册（系统级，应用未聚焦也能触发）；
// 触发时所有 OmniDeck 可见窗口（主窗/快捷面板等）先隐藏避免拍进画面
const SHORTCUT_KEYS = ['area', 'screen', 'scroll']
const DEFAULT_SHORTCUTS = {
  area: 'CommandOrControl+Shift+S', // 选区截图（进入标注编辑）
  screen: 'Alt+Shift+3', // 全屏截图
  scroll: 'Alt+Shift+S' // 滚动长截图
}
let shortcuts = { ...DEFAULT_SHORTCUTS }

const captureSettingsFile = () => path.join(app.getPath('userData'), 'capture-settings.json')

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
    // dev：dist-electron/windows/ → ../../native/；打包后经 asarUnpack 自动重定向到 app.asar.unpacked
    nativeWinMod = require(path.join(__dirname, '../../native/build/Release/windows.node'))
  } catch (e) {
    console.warn('[capture] 窗口枚举插件未加载（hover 拾取不可用，仅拖拽框选）：', e.message)
  }
  return nativeWinMod
}

function loadCaptureSettings() {
  try {
    const s = JSON.parse(require('fs').readFileSync(captureSettingsFile(), 'utf-8'))
    if (s.shortcuts) shortcuts = { ...DEFAULT_SHORTCUTS, ...s.shortcuts }
    if (Number.isInteger(s.clipKeep) && s.clipKeep >= 50 && s.clipKeep <= 2000) clipKeep = s.clipKeep
  } catch (e) { /* 首次不存在：走默认值 */ }
}

function saveCaptureSettings() {
  try {
    require('fs').writeFileSync(captureSettingsFile(), JSON.stringify({ shortcuts, clipKeep }, null, 2))
  } catch (e) { /* 写失败忽略 */ }
}

// 主窗回调（init 时注入：隐藏全部 OmniDeck 窗口，返回需要恢复的窗口列表）
// 注：定格优先方案下截图不再隐藏应用窗口（定格发生在 overlay 创建前），
// 保留注入兼容 main.js，暂无调用方
let getAllWindowsToHide = () => []
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

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// JPEG 缩略图 dataURL（toJPEG 返回 Buffer，需手工拼 base64 前缀）
const jpegDataURL = (image, width, quality) =>
  'data:image/jpeg;base64,' + image.resize({ width }).toJPEG(quality).toString('base64')

// 超额淘汰：超过上限时按插入序删除最旧记录；返回被淘汰的 id 列表
// （同步清理对应的历史条目，保持两池一致）
function evict() {
  const evicted = []
  while (records.size > KEEP_COUNT) {
    const oldest = records.keys().next().value
    records.delete(oldest)
    dropLinkedClip(oldest)
    evicted.push(oldest)
  }
  return evicted
}

// ---------- IndexedDB 持久化桥（渲染端主窗执行实际读写） ----------
// 主进程无法直接访问 IndexedDB（渲染端按 origin 隔离），故：
// - 变更推送：记录池 upsert/remove/clear 时经 main:capture-sync 事件推给
//   主窗渲染端（capture-store.js 监听并写 IndexedDB）；渲染端未就绪时
//   变更入 pending 队列，就绪信号（capture:sync-ready）后重放
// - 启动恢复：渲染端就绪后从 IndexedDB 全量读出，经 capture:restore
//   回传主进程重建 nativeImage 池（按 createdAt 合并，重复 id 丢弃）
// 持久化默认开启，无开关
let persistSink = null // 主窗 webContents（注入：init({ sink })）
const PENDING_MAX = 200 // 渲染端未就绪期间最多暂存变更（超出丢最旧，防膨胀）

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

const pendingSync = []

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

// 渲染端恢复回传：[{ id, meta, png(ArrayBuffer) }] → 重建内存池
ipcMain.handle('capture:restore', (event, items) => {
  if (!Array.isArray(items)) return { ok: false, error: 'invalid' }
  const restored = []
  for (const it of items) {
    if (!it || !it.id || !it.png || records.has(it.id)) continue
    try {
      const image = nativeImage.createFromBuffer(Buffer.from(it.png))
      if (image.isEmpty()) continue
      records.set(it.id, {
        id: it.id,
        image,
        width: it.meta ? it.meta.width : image.getSize().width,
        height: it.meta ? it.meta.height : image.getSize().height,
        createdAt: it.meta ? it.meta.createdAt : Date.now(),
        mime: it.meta && it.meta.mime ? it.meta.mime : 'image/png',
        thumb: it.meta ? it.meta.thumb : '',
        kind: it.meta ? it.meta.kind : undefined
      })
      restored.push(it.id)
    } catch (e) { /* 单条损坏跳过 */ }
  }
  // 恢复后按上限淘汰；返回当前全部 id，渲染端据此对齐 IndexedDB（删多余条目）
  evict()
  return { ok: true, count: restored.length, ids: Array.from(records.keys()) }
})

// 入库 + meta：全屏 / 选区 / 长截图共用（原分辨率保存，不缩放）；
// 截图同时作为一条剪贴板图片记录（source:'capture'）进入统一复制历史
function addRecord(image, extra) {
  const id = Date.now().toString(36) + '-' + (serial++).toString(36) +
    '-' + Math.random().toString(36).slice(2, 6)
  const size = image.getSize()
  const rec = Object.assign({
    id,
    image,
    width: size.width,
    height: size.height,
    createdAt: Date.now(),
    mime: 'image/png',
    thumb: jpegDataURL(image, 360, 72)
  }, extra || {})
  records.set(id, rec)
  const evicted = evict()
  // 持久化：新纪录 upsert；被淘汰的同步删 IndexedDB
  pushSync({ op: 'upsert', store: 'captures', id, meta: metaOf(rec), png: rec.image.toPNG() })
  for (const id2 of evicted) pushSync({ op: 'remove', store: 'captures', id: id2 })
  // 同步进统一复制历史（仅内存引用 + 淘汰联动，PNG 不双份存盘：
  // 历史条目的原图按 id 回 captures 池拉取）
  addClipImage(image, { source: 'capture', refId: id, kind: rec.kind })
  // 出参不含 image 原图（大对象不进 IPC）
  const meta = { id, width: rec.width, height: rec.height, createdAt: rec.createdAt, mime: rec.mime, thumb: rec.thumb }
  if (rec.kind) meta.kind = rec.kind
  return meta
}

// 记录出参（无原图）
function metaOf(rec) {
  const meta = { id: rec.id, width: rec.width, height: rec.height, createdAt: rec.createdAt, mime: rec.mime, thumb: rec.thumb }
  if (rec.kind) meta.kind = rec.kind
  return meta
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

// ---------- 选区截屏 ----------
// 流程：发起窗先隐藏 → 每屏铺一透明覆盖窗（#/capture-overlay?d=<displayId>）→
// 用户框选（覆盖窗内 JS 拖拽矩形，Esc/右键取消）→ 覆盖窗经 capture-overlay:done
// 回传选区（该屏 CSS 坐标）→ 主进程隐藏覆盖窗 → 整屏截取 → crop 物理像素 → 入库
let overlayWins = []
let selecting = false
let pendingResolve = null

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
        preload: path.join(__dirname, '../preload.js'),
        nodeIntegration: false,
        contextIsolation: true
      }
    })
    win.setAlwaysOnTop(true, 'screen-saver')
    overlayWins.push(win)

    const qs = 'd=' + d.id + (mode === 'scroll' ? '&m=scroll' : '')
    const load = process.env.ELECTRON_RENDERER_URL
      ? win.loadURL(process.env.ELECTRON_RENDERER_URL + '#/capture-overlay?' + qs)
      : win.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: '/capture-overlay?' + qs })

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

// ---------- 选区交互（overlay 单窗口全流程，iShot 体验） ----------
// 透明 overlay 直接覆盖真实屏幕：hover 拾取窗口 / 拖选 → 选定后 overlay 内
// 调 capture-overlay:freeze 抓整屏帧（SCK 排除自身，overlay 不关窗不入镜；
// 非 SCK 兜底时主进程临时隐藏 overlay 抓完恢复，渲染端无感）→ overlay 原地
// 切换编辑态（定格帧背景 + Canvas 标注 + 微调手柄）→ 确认/贴屏/取消经
// capture-overlay:done 回传。全程单窗口，零切换零闪烁。

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

// ---------- 贴屏（Pin）----------
// 置顶无边框小窗显示截图：可拖动（-webkit-app-region: drag）、滚轮/按钮缩放、
// 双击或叉关闭；同屏可贴多张
const pinWins = []

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
      preload: path.join(__dirname, '../preload.js'),
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
    : win.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: url })
  load.then(() => { if (!win.isDestroyed()) win.show() }).catch(() => onGone())
  // 窗口关闭即清理对应帧（避免内存滞留）
  win.on('closed', () => pinFrames.delete(myId))
  return win
}

let pinWinSeq = 0
const pinFrames = new Map()

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

// ---------- 滚动长截图 ----------
// 流程：选区（同选区截图）→ 选区内静止后弹出控制条小窗（✓完成 / ✕取消）→
// 用户每滚动一段内容点「拍一帧」（或自动连拍）→ 每帧整屏截取 crop 选区 →
// 相邻帧按重叠行像素匹配拼接（自底向上找最佳对齐）→ 完成后入库 + 复制
let scrollSession = null // { display, rectPhys, frames: [NativeImage], ctrlWin }

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

// 控制条小窗：贴在选区下方（空间不足贴上方），始终置顶
function openScrollCtrl(display, phys) {
  const factor = display.scaleFactor || 1
  const cw = 208
  const ch = 44
  // 物理 → CSS 坐标
  const rx = display.bounds.x + phys.x / factor
  const ryBottom = display.bounds.y + (phys.y + phys.height) / factor
  const ryTop = display.bounds.y + phys.y / factor
  const under = ryBottom + ch + 8 <= display.bounds.y + display.bounds.height
  const win = new BrowserWindow({
    x: Math.round(display.bounds.x + Math.max(0, phys.x / factor + phys.width / factor - cw)),
    y: under ? Math.round(ryBottom + 8) : Math.round(ryTop - ch - 8),
    width: cw,
    height: ch,
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
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  const url = '#/capture-scroll-ctrl'
  const load = process.env.ELECTRON_RENDERER_URL
    ? win.loadURL(process.env.ELECTRON_RENDERER_URL + url)
    : win.loadFile(path.join(__dirname, '../../dist/index.html'), { hash: url })
  load.then(() => { if (!win.isDestroyed()) win.show() }).catch(() => {})
  return win
}

function closeScrollCtrl() {
  const s = scrollSession
  if (s && s.ctrlWin) {
    try { if (!s.ctrlWin.isDestroyed()) s.ctrlWin.destroy() } catch (e) { /* 忽略 */ }
  }
}

// 长截图入口（overlay-先行）：选区 → 捕获首帧 → 连拍模式（后续帧 SCK 实时
// 捕获，控制条小窗属自身进程被排除，不入镜）
async function captureScroll() {
  const st = status()
  if (!st.granted) return { ok: false, reason: 'permission' }
  if (selecting) return { ok: false, reason: 'busy' }
  if (scrollSession) return { ok: false, reason: 'busy' }

  try {
    const picked = await waitPick('scroll')
    if (!picked || !picked.ok || !picked.rect) return { ok: false, reason: 'cancelled' }
    const { display, rect } = picked

    const first = await grabDisplay(display)
    if (!first.ok) return first

    const phys = physRectOf(display, rect)
    scrollSession = {
      display,
      phys,
      frames: [first.image.crop(phys)],
      ctrlWin: null,
      hidden: []
    }
    scrollSession.ctrlWin = openScrollCtrl(display, phys)
    return { ok: true, started: true, count: scrollSession.frames.length }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  } finally {
    closeOverlays()
  }
}

// 拍一帧：截当前屏 crop 选区（用户已滚动内容）
async function scrollShot() {
  const s = scrollSession
  if (!s) return { ok: false, reason: 'idle' }
  const res = await grabDisplay(s.display)
  if (!res.ok) return res
  s.frames.push(res.image.crop(s.phys))
  return { ok: true, count: s.frames.length }
}

// 帧数据行哈希（RGBA 每行取每 4 字节首字节 + 行号聚合，快速比对）
function rowSignature(buf, width, y) {
  let h = 5381
  const base = y * width * 4
  for (let x = 0; x < width; x += 4) {
    h = ((h << 5) + h + buf[base + x * 4]) >>> 0
  }
  return h
}

// 拼接：后一帧在已有长图底部附近找最佳重叠（像素行签名匹配），无重叠则直接续接
function stitchFrames(frames) {
  if (!frames.length) return null
  const raws = frames.map(f => f.toBitmap()) // RGBA buffer
  const width = frames[0].getSize().width
  // 汇总画布：按最大可能高度累计，逐段拷贝
  let outHeight = 0
  const segs = [] // { buf, height, overlap }
  for (let i = 0; i < frames.length; i++) {
    const h = frames[i].getSize().height
    if (i === 0) {
      segs.push({ buf: raws[i], height: h, overlap: 0 })
      outHeight += h
      continue
    }
    // 在已拼长图底部（最多 min(既有高, 本帧高) 行）内找本帧顶部的最佳对齐：
    // 取本帧顶部若干候选行的签名，与长图底段各行比对，命中行数最多者胜
    const prev = segs[segs.length - 1]
    const probeRows = []
    for (let r = 2; r < Math.min(h, 40); r += 6) probeRows.push(r)
    const maxSearch = Math.min(prev.height, h)
    let bestOverlap = 0
    let bestHits = 0
    // 长图底段行签名缓存（懒生成）
    const sigCache = new Map()
    const prevSig = y => {
      if (sigCache.has(y)) return sigCache.get(y)
      const v = rowSignature(prev.buf, width, prev.height - 1 - y)
      sigCache.set(y, v)
      return v
    }
    for (let ov = 8; ov <= maxSearch; ov += 2) {
      let hits = 0
      for (const r of probeRows) {
        if (r >= ov) break
        if (rowSignature(raws[i], width, r) === prevSig(ov - 1 - r)) hits++
      }
      if (hits > bestHits) { bestHits = hits; bestOverlap = ov }
      if (bestHits >= probeRows.length) break // 全命中即锁定
    }
    segs.push({ buf: raws[i], height: h, overlap: bestOverlap })
    outHeight += h - bestOverlap
  }

  // RGBA 直拼 → PNG（nativeImage 不认 RGBA bitmap 拼接结果，直接构造 dataURL 交给渲染端转 PNG）
  // Electron nativeImage.createFromBitmap 支持 RGBA raw buffer
  const out = Buffer.alloc(width * outHeight * 4)
  let dst = 0
  for (let i = 0; i < segs.length; i++) {
    const { buf, height, overlap } = segs[i]
    const srcStart = (i === 0 ? 0 : overlap) * width * 4
    const rows = height - (i === 0 ? 0 : overlap)
    buf.copy(out, dst, srcStart, srcStart + rows * width * 4)
    dst += rows * width * 4
  }
  const { nativeImage } = require('electron')
  return nativeImage.createFromBitmap(out, { width, height: outHeight })
}

// 完成长截图：拼接 → 入库 → 复制剪贴板
async function scrollFinish() {
  const s = scrollSession
  if (!s) return { ok: false, reason: 'idle' }
  closeScrollCtrl()
  const hidden = s.hidden || []
  scrollSession = null
  try {
    const image = stitchFrames(s.frames)
    if (!image || image.isEmpty()) return { ok: false, error: '拼接失败' }
    try { clipboard.writeImage(image) } catch (e) { /* 忽略 */ }
    return { ok: true, image: addRecord(image, { kind: 'scroll' }) }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  } finally {
    for (const w of hidden) {
      try { if (!w.isDestroyed()) w.show() } catch (e) { /* 忽略 */ }
    }
  }
}

// 取消长截图：丢弃全部帧
function scrollCancel() {
  const s = scrollSession
  if (!s) return { ok: false, reason: 'idle' }
  closeScrollCtrl()
  const hidden = s.hidden || []
  scrollSession = null
  for (const w of hidden) {
    try { if (!w.isDestroyed()) w.show() } catch (e) { /* 忽略 */ }
  }
  return { ok: true }
}

// ---------- 截图池管理（统一历史中截图来源条目的原图存储） ----------
function deleteRecord(id) {
  if (!records.has(id)) return { ok: false, reason: 'notfound' }
  records.delete(id)
  dropLinkedClip(id)
  pushSync({ op: 'remove', store: 'captures', id })
  return { ok: true }
}

function clearRecords() {
  records.clear()
  for (const rec of Array.from(clipRecords.values())) {
    if (rec.source === 'capture') clipRecords.delete(rec.id)
  }
  pushSync({ op: 'clear', store: 'captures' })
  return { ok: true }
}

// ---------- 全局剪贴板历史（统一复制历史的数据来源之一） ----------
// 主进程轮询系统剪贴板（Electron 无剪贴板变更事件，mac 轮询是通行做法）：
// 内容变化即入库（文本 ≤100KB、图片 PNG）；自己写入的内容不重复记录；
// 截图（addRecord）自动同步一条 source:'capture' 条目（仅内存，原图走截图池）；
// 持久化走 IndexedDB 桥（store: 'clips'，capture 来源不双份存盘）
const CLIP_TEXT_MAX = 100 * 1024 // 文本上限 100KB
const CLIP_KEEP_DEFAULT = 1000 // 剪贴板历史默认保留条数（设置页可改 50-2000）
let clipKeep = CLIP_KEEP_DEFAULT
let clipRecords = new Map() // id -> { id, kind: 'text'|'image', text?, thumb?, source?, refId? }
let clipWatcherOn = false
let clipTimer = null
let clipLastText = null
let clipLastImgHash = null
let clipSerial = 0

// 简单指纹：位图长度 + 首/中/尾采样字节。
// 用 getBitmap（原始像素拷贝，便宜）而非 toPNG（压缩编码，大图每秒一次开销大）
function imgHashOf(image) {
  const buf = image.getBitmap()
  const n = buf.length
  return n + ':' + buf[0] + ':' + buf[n >> 1] + ':' + buf[n - 1]
}

// 读取剪贴板中的文件（mac：Finder 复制文件时写入 public.file-url，无文本/图片数据）
// 返回绝对路径数组（支持多文件），非文件复制返回 null：
// - NSFilenamesPboardType 兼容类型：新版 macOS 返回 XML plist（<array><string>…），
//   旧版为 \n 分隔纯文本，两种格式均解析
// - 均不可用时回退 readBuffer 读取单个 file:// URL
function readClipboardFilePaths() {
  if (process.platform !== 'darwin') return null
  try {
    if (!clipboard.has('public.file-url')) return null
    let paths = null
    try {
      const legacy = clipboard.read('NSFilenamesPboardType')
      if (legacy) {
        if (legacy.indexOf('<') >= 0) {
          // plist XML：<string>路径</string> 逐项提取（文件名可能含 XML 转义）
          const items = legacy.match(/<string>[\s\S]*?<\/string>/g) || []
          paths = items
            .map(s => s.replace(/^<string>|<\/string>$/g, '')
              .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
              .replace(/&#39;/g, "'").replace(/&amp;/g, '&').trim())
            .filter(Boolean)
        } else {
          paths = legacy.split('\n').map(s => s.trim()).filter(Boolean)
        }
      }
    } catch (e) { /* 旧类型不可用，回退单文件 */ }
    if (!paths || !paths.length) {
      const url = clipboard.readBuffer('public.file-url').toString('utf8').replace(/\0+$/, '')
      if (url) {
        try { paths = [decodeURIComponent(url.replace(/^file:\/\//, ''))] }
        catch (e) { paths = [url] }
      }
    }
    return paths && paths.length ? paths : null
  } catch (e) {
    return null
  }
}

function clipMetaOf(rec) {
  const meta = { id: rec.id, kind: rec.kind, createdAt: rec.createdAt }
  if (rec.kind === 'text') {
    meta.text = rec.text
    meta.length = rec.length
  } else {
    meta.width = rec.width
    meta.height = rec.height
    meta.thumb = rec.thumb
  }
  if (rec.source) meta.source = rec.source
  if (rec.refId) meta.refId = rec.refId
  return meta
}

function clipEvict() {
  while (clipRecords.size > clipKeep) {
    const oldest = clipRecords.keys().next().value
    clipRecords.delete(oldest)
    pushSync({ op: 'remove', store: 'clips', id: oldest })
  }
}

// 剪贴板恢复（IndexedDB → 内存，同截图池；capture 来源不持久化，
// 重启后由截图池恢复自然重建统一历史）
ipcMain.handle('capture:clips-restore', (_e, items) => {
  if (!Array.isArray(items)) return { ok: false }
  for (const it of items) {
    if (!it || !it.id || clipRecords.has(it.id)) continue
    const meta = it.meta || {}
    try {
      if (meta.kind === 'text' && typeof meta.text === 'string') {
        clipRecords.set(it.id, {
          id: it.id, kind: 'text', text: meta.text,
          length: meta.text.length, createdAt: meta.createdAt || Date.now()
        })
      } else if (it.png) {
        const image = nativeImage.createFromBuffer(Buffer.from(it.png))
        if (image.isEmpty()) continue
        const size = image.getSize()
        clipRecords.set(it.id, {
          id: it.id, kind: 'image', image,
          width: size.width, height: size.height,
          createdAt: meta.createdAt || Date.now(),
          thumb: meta.thumb || jpegDataURL(image, 200, 70)
        })
      }
    } catch (e) { /* 单条损坏跳过 */ }
  }
  clipEvict()
  return { ok: true, count: clipRecords.size, ids: Array.from(clipRecords.keys()) }
})

function addClipText(text) {
  const id = 'clip-' + Date.now().toString(36) + '-' + (clipSerial++).toString(36)
  const rec = { id, kind: 'text', text, length: text.length, createdAt: Date.now() }
  clipRecords.set(id, rec)
  clipEvict()
  pushSync({ op: 'upsert', store: 'clips', id, meta: clipMetaOf(rec) })
  return rec
}

// 图片入库；extra.source === 'capture' 表示来自本应用截图：
// - 同步更新轮询基线（截图已复制到剪贴板，避免下一 tick 重复记录）
// - 不写 IndexedDB（原图已在 captures store，避免双份占盘）
function addClipImage(image, extra) {
  const id = 'clip-' + Date.now().toString(36) + '-' + (clipSerial++).toString(36)
  const size = image.getSize()
  const rec = Object.assign({
    id, kind: 'image', image,
    width: size.width, height: size.height,
    createdAt: Date.now(),
    thumb: jpegDataURL(image, 200, 70)
  }, extra || {})
  clipRecords.set(id, rec)
  clipEvict()
  if (rec.source === 'capture') {
    clipLastImgHash = imgHashOf(image)
    try { clipLastText = clipboard.readText() || null } catch (e) { clipLastText = null }
  } else {
    pushSync({ op: 'upsert', store: 'clips', id, meta: clipMetaOf(rec), png: image.toPNG() })
  }
  return rec
}

// 截图池条目删除时联动清理其对应的历史条目（refId 反查，池小遍历即可）
function dropLinkedClip(refId) {
  for (const rec of clipRecords.values()) {
    if (rec.refId === refId) {
      clipRecords.delete(rec.id)
      return
    }
  }
}

// 轮询 tick：读取当前剪贴板，变化则入库
async function clipTick() {
  try {
    // 文件优先（Finder 复制文件时剪贴板仅含 file-url）：记录为绝对路径文本
    const filePaths = readClipboardFilePaths()
    if (filePaths) {
      const fileText = filePaths.join('\n')
      if (fileText !== clipLastText) {
        clipLastText = fileText
        clipLastImgHash = null // 文件覆盖后图片标记失效
        addClipText(fileText)
      }
      return
    }
    // 文本次之（同帧同时有文本与图片时按文本记录，符合复制直觉）
    const text = clipboard.readText()
    if (text && text.length <= CLIP_TEXT_MAX) {
      if (text !== clipLastText) {
        clipLastText = text
        clipLastImgHash = null // 文本覆盖后图片标记失效
        addClipText(text)
      }
      return
    }
    const img = clipboard.readImage()
    if (!img.isEmpty()) {
      const hash = imgHashOf(img)
      if (hash !== clipLastImgHash) {
        clipLastImgHash = hash
        clipLastText = clipboard.readText() || null
        addClipImage(img)
      }
    }
  } catch (e) { /* 轮询异常忽略 */ }
}

// 剪贴板监听恒开（复制历史默认记录，无开关）
function startClipWatcher() {
  if (clipWatcherOn) return
  clipWatcherOn = true
  clipTimer = setInterval(clipTick, 1000)
  // 初始化基线（避免启动时把当前剪贴板内容记为历史；文件剪贴板记路径文本）
  try {
    const filePaths = readClipboardFilePaths()
    clipLastText = filePaths ? filePaths.join('\n') : (clipboard.readText() || null)
    const img = clipboard.readImage()
    if (!img.isEmpty()) clipLastImgHash = imgHashOf(img)
  } catch (e) { /* 忽略 */ }
}

function stopClipWatcher() {
  if (!clipWatcherOn) return
  clipWatcherOn = false
  if (clipTimer) { clearInterval(clipTimer); clipTimer = null }
}

function registerIpc() {
  ipcMain.handle('capture:status', () => status())

  // ---------- 全局快捷键（iShot 风格） ----------
  // 默认：⇧⌘S 选区标注截图 / ⌥⇧3 全屏 / ⌥⇧S 长截图（可在设置中修改）
  registerShortcuts()
  ipcMain.handle('capture:get-shortcuts', () => ({ ...shortcuts }))
  ipcMain.handle('capture:set-shortcut', (_e, { key, accelerator } = {}) => {
    if (!SHORTCUT_KEYS.includes(key)) return { ok: false, error: '未知快捷键项' }
    if (!accelerator) return { ok: false, error: '快捷键不能为空' }
    // 先试注册（占用则报错），成功后替换旧键
    const ok = globalShortcut.register(accelerator, shortcutHandlers[key])
    if (!ok) return { ok: false, error: `「${accelerator}」已被其它应用占用` }
    globalShortcut.unregister(shortcuts[key])
    shortcuts[key] = accelerator
    saveCaptureSettings()
    // 通知外部（托盘菜单等展示键位处）同步刷新
    if (typeof onShortcutsChanged === 'function') {
      try { onShortcutsChanged({ ...shortcuts }) } catch (e) { /* 忽略 */ }
    }
    return { ok: true, shortcuts: { ...shortcuts } }
  })
  ipcMain.handle('capture:test-shortcut', (_e, accelerator) => {
    const ok = globalShortcut.register(accelerator, () => {})
    if (ok) globalShortcut.unregister(accelerator)
    return { ok }
  })

  // ---------- 剪贴板历史条数上限（设置页） ----------
  ipcMain.handle('capture:get-clip-keep', () => clipKeep)
  ipcMain.handle('capture:set-clip-keep', (_e, val) => {
    const n = Number(val)
    if (!Number.isInteger(n) || n < 50 || n > 2000) {
      return { ok: false, error: '上限需为 50-2000 的整数' }
    }
    clipKeep = n
    saveCaptureSettings()
    clipEvict() // 改小立即淘汰多余记录
    return { ok: true, clipKeep }
  })

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

  // 覆盖窗拉取交互上下文（实时）：本屏窗口列表（z 序前→后，hover 拾取用）
  // + 光标位置（本屏相对，渲染层据此默认选中光标下窗口）
  ipcMain.handle('capture-overlay:context', (event) => {
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
  })

  // 窗口枚举（实时，供调试/其他调用；overlay 交互用 capture-overlay:context）
  ipcMain.handle('capture:windows', (event) => {
    const mod = nativeWindows()
    if (!mod) return { ok: false, reason: 'native' }
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { ok: false, reason: 'nowin' }
    try {
      return { ok: true, items: toDisplayWindows(mod.getWindows(), displayOfWindow(win)) }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
  })

  // ---------- 统一复制历史（截图 + 剪贴板合并时间线） ----------
  // 条目：文本 / 图片（剪贴板来源）+ 图片（截图来源，refId 指向截图池）
  ipcMain.handle('capture:history-list', () => {
    const items = Array.from(clipRecords.values()).map(clipMetaOf)
    items.sort((a, b) => b.createdAt - a.createdAt) // 最新在前
    return { ok: true, items }
  })
  // 复制历史条目：文本写文本、图片写图片；同时更新轮询基线防下一 tick 重复入库
  ipcMain.handle('capture:history-copy', (_e, id) => {
    const rec = clipRecords.get(id)
    if (!rec) return { ok: false, reason: 'notfound' }
    try {
      if (rec.kind === 'text') {
        clipboard.writeText(rec.text)
        clipLastText = rec.text
      } else {
        clipboard.writeImage(rec.image)
        clipLastImgHash = imgHashOf(rec.image)
        try { clipLastText = clipboard.readText() || null } catch (e) { clipLastText = null }
      }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
    return { ok: true }
  })
  // 删除历史条目：截图来源的联动删截图池（原图随池删除）
  ipcMain.handle('capture:history-remove', (_e, id) => {
    const rec = clipRecords.get(id)
    if (!rec) return { ok: false, reason: 'notfound' }
    clipRecords.delete(id)
    if (rec.source === 'capture' && rec.refId) deleteRecord(rec.refId)
    else pushSync({ op: 'remove', store: 'clips', id })
    return { ok: true }
  })
  // 清空全部历史（两池 + IndexedDB 两 store）
  ipcMain.handle('capture:history-clear', () => {
    clipRecords.clear()
    clearRecords()
    pushSync({ op: 'clear', store: 'clips' })
    return { ok: true }
  })
  // 历史条目原图（截图来源回截图池拉取；剪贴板图片按需转 dataURL）
  ipcMain.handle('capture:history-data', (_e, id) => {
    const rec = clipRecords.get(id)
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
    const rec = clipRecords.get(id)
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

  // ---------- 剪贴板收藏（独立池，与历史池隔离） ----------
  // 收藏时完整复制内容（图片存整份 PNG，截图来源也不依赖截图池）；
  // 删除历史/清空历史均不影响收藏；IndexedDB 持久化走 store: 'favClips'
  const FAV_ID_PREFIX = 'favclip-'
  const FAV_KEEP_MAX = 500 // 收藏上限（超出拒绝加入，前端提示）
  let favRecords = new Map() // id -> { id, kind, text?, image?, width?, height?, thumb?, favedAt }
  let favSerial = 0

  function favMetaOf(rec) {
    const meta = { id: rec.id, kind: rec.kind, createdAt: rec.createdAt, favedAt: rec.favedAt }
    // 来源历史 id：用于剪贴板页回显「已收藏」星标（历史可能已被删除，仅作关联用）
    if (rec.histId) meta.histId = rec.histId
    if (rec.kind === 'text') {
      meta.text = rec.text
      meta.length = rec.length
    } else {
      meta.width = rec.width
      meta.height = rec.height
      meta.thumb = rec.thumb
    }
    return meta
  }

  // 收藏恢复（IndexedDB → 内存）
  ipcMain.handle('capture:fav-restore', (_e, items) => {
    if (!Array.isArray(items)) return { ok: false }
    for (const it of items) {
      if (!it || !it.id || favRecords.has(it.id)) continue
      const meta = it.meta || {}
      try {
        if (meta.kind === 'text' && typeof meta.text === 'string') {
          favRecords.set(it.id, {
            id: it.id, kind: 'text', text: meta.text,
            length: meta.text.length,
            histId: meta.histId || null,
            createdAt: meta.createdAt || meta.favedAt || Date.now(),
            favedAt: meta.favedAt || Date.now()
          })
        } else if (it.png) {
          const image = nativeImage.createFromBuffer(Buffer.from(it.png))
          if (image.isEmpty()) continue
          const size = image.getSize()
          favRecords.set(it.id, {
            id: it.id, kind: 'image', image, histId: meta.histId || null,
            width: size.width, height: size.height,
            createdAt: meta.createdAt || meta.favedAt || Date.now(),
            favedAt: meta.favedAt || Date.now(),
            thumb: meta.thumb || jpegDataURL(image, 200, 70)
          })
        }
      } catch (e) { /* 单条损坏跳过 */ }
    }
    return { ok: true, count: favRecords.size, ids: Array.from(favRecords.keys()) }
  })

  // 收藏列表（按收藏时间倒序，条目结构与 history-list 一致，额外 favedAt）
  ipcMain.handle('capture:fav-list', () => {
    const items = Array.from(favRecords.values()).map(favMetaOf)
    items.sort((a, b) => b.favedAt - a.favedAt)
    return { ok: true, items }
  })

  // 已收藏映射（histId -> favId）：剪贴板页据此渲染实心星标/取消收藏（轻量，可高频拉取）
  ipcMain.handle('capture:fav-ids', () => {
    const map = {}
    favRecords.forEach(rec => {
      if (rec.histId) map[rec.histId] = rec.id
    })
    return { ok: true, map }
  })

  // 加入收藏：从历史条目完整复制一份（图片取整份 PNG；截图来源回截图池拉原图，
  // 收藏后删除历史或截图池均不影响收藏）
  ipcMain.handle('capture:fav-add', (_e, histId) => {
    const rec = clipRecords.get(histId)
    if (!rec) return { ok: false, reason: 'notfound' }
    if (favRecords.size >= FAV_KEEP_MAX) {
      return { ok: false, reason: 'full', limit: FAV_KEEP_MAX }
    }
    const id = FAV_ID_PREFIX + Date.now().toString(36) + '-' + (favSerial++).toString(36)
    let fav
    if (rec.kind === 'text') {
      fav = {
        id, kind: 'text', text: rec.text, length: rec.length,
        histId,
        createdAt: rec.createdAt, favedAt: Date.now()
      }
    } else {
      // 截图来源的历史条目内存中持有 image；防万一为空时回截图池拉取
      let image = rec.image
      if ((!image || image.isEmpty()) && rec.refId) {
        const src = records.get(rec.refId)
        if (src && src.image) image = src.image
      }
      if (!image || image.isEmpty()) return { ok: false, reason: 'noimage' }
      fav = {
        id, kind: 'image', image, histId,
        width: rec.width, height: rec.height,
        createdAt: rec.createdAt, favedAt: Date.now(),
        thumb: rec.thumb || jpegDataURL(image, 200, 70)
      }
    }
    favRecords.set(id, fav)
    pushSync({ op: 'upsert', store: 'favClips', id, meta: favMetaOf(fav), png: fav.kind === 'image' ? fav.image.toPNG() : undefined })
    return { ok: true, id }
  })

  // 收藏条目复制（同 history-copy：更新轮询基线防重复入库）
  ipcMain.handle('capture:fav-copy', (_e, id) => {
    const rec = favRecords.get(id)
    if (!rec) return { ok: false, reason: 'notfound' }
    try {
      if (rec.kind === 'text') {
        clipboard.writeText(rec.text)
        clipLastText = rec.text
      } else {
        clipboard.writeImage(rec.image)
        clipLastImgHash = imgHashOf(rec.image)
        try { clipLastText = clipboard.readText() || null } catch (e) { clipLastText = null }
      }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
    return { ok: true }
  })

  // 删除收藏（仅收藏池，不触碰历史）
  ipcMain.handle('capture:fav-remove', (_e, id) => {
    if (!favRecords.delete(id)) return { ok: false, reason: 'notfound' }
    pushSync({ op: 'remove', store: 'favClips', id })
    return { ok: true }
  })

  // 清空收藏
  ipcMain.handle('capture:fav-clear', () => {
    favRecords.clear()
    pushSync({ op: 'clear', store: 'favClips' })
    return { ok: true }
  })

  // 收藏原图 dataURL（图片预览）
  ipcMain.handle('capture:fav-data', (_e, id) => {
    const rec = favRecords.get(id)
    if (!rec || rec.kind !== 'image') return { ok: false, reason: 'notfound' }
    try {
      return { ok: true, data: rec.image.toDataURL() }
    } catch (e) {
      return { ok: false, error: e.message || String(e) }
    }
  })

  // 收藏另存为 PNG
  ipcMain.handle('capture:fav-save-as', async (_e, id) => {
    const rec = favRecords.get(id)
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

// init：加载设置（快捷键）+ 注入窗口枚举回调 + 启动剪贴板轮询（恒开）
// getWindows 由 main.js 注入：返回需随截图隐藏的 BrowserWindow 列表
// getSink 由 main.js 注入：返回主窗（持久化 sink 校验用）
// onShortcutsChanged 由 main.js 注入：快捷键修改后回调（托盘菜单刷新键位显示）
function init({ getWindows, getSink, onShortcutsChanged: onChanged } = {}) {
  loadCaptureSettings()
  if (typeof getWindows === 'function') getAllWindowsToHide = getWindows
  if (typeof getSink === 'function') getMainWindow = getSink
  if (typeof onChanged === 'function') onShortcutsChanged = onChanged
  startClipWatcher()
  app.on('will-quit', () => {
    globalShortcut.unregisterAll()
    stopClipWatcher()
  })
}

module.exports = {
  init,
  status,
  captureScreen,
  captureArea,
  captureScroll,
  // 快捷截图入口（隐藏全部应用窗口 → 截图 → 恢复）；kind: 'area' | 'screen' | 'scroll'
  shortcutCapture,
  // 当前生效的截图快捷键（托盘菜单键位展示用）
  getShortcuts: () => ({ ...shortcuts }),
  registerIpc
}
