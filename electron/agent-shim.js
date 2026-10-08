// OmniBuddy agent 子进程 electron 仿真层（agent-shim）：让 agent 子树零改动运行在 utilityProcess
// 由 agent-host.js 通过 Module._resolveFilename 将 require('electron') 重定向到本文件，
// 使 electron/agent/ 全部模块零改动运行在 utilityProcess（Node 子进程）中。
// 仅仿真 agent 子树实际用到的 API 面（已 grep 全量核对）：
//   ipcMain / app / dialog / shell / BrowserWindow / Notification /
//   safeStorage（异步桥接版，__bridged 标记）/ nativeImage（缩略图桥接版）/
//   __host.fetchBuffer
// 无法在子进程存在的能力（窗口实例、系统通知、钥匙串、Chromium net、图像对象）
// 一律经 hostCall 转发主进程宿主执行（见 agent-bridge.js 的 HOST 方法表）。

'use strict'

// ===== 内部状态与工具 =====
const state = {
  wired: false,            // __wire 是否完成
  post: null,              // (msg) => void  子 → 主 消息
  hostCall: null,          // (method, args[]) => Promise<any>  宿主服务调用
  init: null,              // { paths, safeStorageAvailable, notificationSupported }
  winFocused: false,       // 主窗口聚焦态（桥推送 browser-window-focus/blur 维护）
  ipcHandlers: new Map(),  // channel -> handler（agent 的 ipcMain.handle 注册表）
  appHandlers: new Map(),  // eventName -> [handlers]（before-quit / browser-window-focus）
  notifications: new Map(),// 通知 id -> Notification 实例（宿主点击事件回掷用）
  notifSeq: 0
}

function assertWired() {
  if (!state.wired) throw new Error('agent-shim 未完成 __wire 初始化')
}

// fire-and-forget 宿主调用：失败静默（show/focus/badge 类调用无错误语义）
function fireAndForget(method, args) {
  try {
    assertWired()
    const p = state.hostCall(method, args || [])
    if (p && typeof p.catch === 'function') p.catch(() => {})
  } catch (e) { /* 忽略 */ }
}

function fireAppEvent(name, event) {
  const handlers = state.appHandlers.get(name)
  if (!handlers) return
  for (const fn of handlers.slice()) {
    try { fn(event) } catch (e) { console.error('[agent-shim] app 事件处理器异常：', e) }
  }
}

// ===== 伪窗口：agent 的 getWindow() 在子进程中拿到的是它 =====
// emit 广播经 webContents.send → 桥 → 真实窗口群；show/focus 转发宿主
const pseudoWindow = {
  __pseudo: true,
  isDestroyed: () => false,
  isFocused: () => state.winFocused,
  show() { fireAndForget('win.show') },
  focus() { fireAndForget('win.focus') },
  webContents: {
    isDestroyed: () => false,
    send(channel, payload) {
      assertWired()
      state.post({ t: 'broadcast', channel, payload })
    }
  }
}

// ===== ipcMain =====
const ipcMain = {
  handle(channel, fn) {
    if (state.ipcHandlers.has(channel)) {
      throw new Error("attempted to register a second handler for '" + channel + "'")
    }
    state.ipcHandlers.set(channel, fn)
  },
  removeHandler(channel) { state.ipcHandlers.delete(channel) },
  handleOnce(channel, fn) {
    state.ipcHandlers.set(channel, (e, ...args) => {
      state.ipcHandlers.delete(channel)
      return fn(e, ...args)
    })
  },
  // agent 子树未使用，空桩防误调用崩溃
  on() {}, once() {}, off() {}, removeAllListeners() {}
}

// ===== app =====
const app = {
  getPath(name) {
    const p = state.init && state.init.paths && state.init.paths[name]
    if (p === undefined) throw new Error("app.getPath('" + name + "') 未注入 agent-shim")
    return p
  },
  on(name, fn) {
    if (!state.appHandlers.has(name)) state.appHandlers.set(name, [])
    state.appHandlers.get(name).push(fn)
  },
  exit(code) {
    assertWired()
    // agent 退出协议（记忆落盘等）完成：通知桥结束握手（桥负责 kill 子进程 + 真正退出）
    state.post({ t: 'shutdown-done', code: code || 0 })
  }
}
// dock 用 getter 保持 app.dock 真值判断兼容（agent 内先判 process.platform === 'darwin'）
Object.defineProperty(app, 'dock', {
  configurable: true,
  get() {
    return {
      setBadge(badge) { fireAndForget('dock.setBadge', [badge]) }
    }
  }
})

// ===== dialog =====
// 剥离窗口首参：本子树 showSaveDialog 均为单参调用、showOpenDialog 均为 (win, opts)
// 双参调用（win 可能为 null），按参数个数剥离即可
function stripWindowArg(args) {
  return args.length >= 2 ? args[1] : args[0]
}

const dialog = {
  showSaveDialog(...args) {
    assertWired()
    return state.hostCall('dialog.showSaveDialog', [stripWindowArg(args)])
  },
  showOpenDialog(...args) {
    assertWired()
    return state.hostCall('dialog.showOpenDialog', [stripWindowArg(args)])
  }
}

// ===== shell =====
const shell = {
  openExternal(url) {
    assertWired()
    // 调用方均 fire-and-forget：吞掉 rejection 防 unhandledRejection
    const p = state.hostCall('shell.openExternal', [url])
    if (p && typeof p.catch === 'function') p.catch(() => {})
    return p
  },
  openPath(p) { return state.hostCall('shell.openPath', [p]) },
  trashItem(p) { return state.hostCall('shell.trashItem', [p]) },
  showItemInFolder(p) { fireAndForget('shell.showItemInFolder', [p]) }
}

// ===== BrowserWindow =====
const BrowserWindow = {
  getAllWindows: () => [pseudoWindow]
}

// ===== Notification（伪类：真实通知由宿主弹，点击事件回掷） =====
class Notification {
  constructor(opts) {
    this.__opts = opts || {}
    this.__clickHandlers = []
  }

  static isSupported() {
    return !!(state.init && state.init.notificationSupported)
  }

  on(name, fn) {
    if (name === 'click' && typeof fn === 'function') this.__clickHandlers.push(fn)
    return this
  }

  show() {
    assertWired()
    const id = ++state.notifSeq
    state.notifications.set(id, this)
    state.hostCall('notification.show', [{ id, title: this.__opts.title, body: this.__opts.body }])
      .catch(() => state.notifications.delete(id))
  }

  close() { /* 宿主侧无对应回收协议，忽略 */ }

  __fireClick() {
    for (const fn of this.__clickHandlers.slice()) {
      try { fn() } catch (e) { console.error('[agent-shim] 通知点击处理器异常：', e) }
    }
  }
}

// ===== safeStorage（异步桥接版：钥匙串只有主进程能碰） =====
const safeStorage = {
  // credentials.js 依此识别桥接模式：同步解密改走启动预热缓存
  __bridged: true,
  isEncryptionAvailable() {
    return !!(state.init && state.init.safeStorageAvailable)
  },
  async encryptString(plain) {
    const r = await state.hostCall('safeStorage.encrypt', [plain])
    return Buffer.from(r.b64, 'base64')
  },
  async decryptString(b64) {
    const r = await state.hostCall('safeStorage.decrypt', [b64])
    return r.plain
  }
}

// ===== nativeImage（子进程无法持有图像对象，仅保留缩略图桥接） =====
const nativeImage = {
  async thumbDataUrl(buffer, opts) {
    const r = await state.hostCall('thumb', [buffer, opts])
    return (r && r.dataUrl) || ''
  },
  createFromBuffer() {
    throw new Error('agent-shim：nativeImage.createFromBuffer 仅主进程可用，请改用 nativeImage.thumbDataUrl')
  }
}

// ===== market.js 专用网络桥（保持 Chromium net 栈 + 系统代理语义） =====
const __host = {
  // 返回 { ok, data: Buffer } 或 { ok:false, error }（与原 downloadBuffer 形态一致）
  async fetchBuffer(url, opts) {
    const r = await state.hostCall('fetchBuffer', [url, opts])
    if (r && r.ok && r.dataB64) r.data = Buffer.from(r.dataB64, 'base64')
    return r || { ok: false, error: '下载失败' }
  }
}

module.exports = {
  // ipcMain 仿真：handle / handleOnce / removeHandler 注册表
  ipcMain,
  // app 仿真：getPath / on / exit（dock 经 getter 提供）
  app,
  // dialog 仿真：保存 / 打开对话框经宿主执行
  dialog,
  // shell 仿真：外链与文件操作经宿主执行
  shell,
  // BrowserWindow 仿真：仅 getAllWindows 返回伪窗口
  BrowserWindow,
  // Notification 伪类：真实通知由宿主弹并回掷点击事件
  Notification,
  // safeStorage 异步桥接版（__bridged 标记）
  safeStorage,
  // nativeImage 桥接版：仅提供缩略图 dataURL
  nativeImage,
  // market 专用网络下载桥（fetchBuffer）
  __host
}

// ===== 宿主接线（仅 agent-host.js 调用） =====
// 注入 post / hostCall / init，置 wired 就绪标记
module.exports.__wire = function __wire({ post, hostCall, init }) {
  state.post = post
  state.hostCall = hostCall
  state.init = init || {}
  state.wired = true
}

// 渲染进程 invoke 转发入口（桥发来 { t:'invoke', channel, args }）
module.exports.__invoke = function __invoke(channel, args) {
  const fn = state.ipcHandlers.get(channel)
  if (!fn) throw new Error("agent 内无 '" + channel + "' 的处理器")
  return fn({ sender: null }, ...(args || []))
}

// 宿主事件回掷：win-focus（聚焦态维护 + 触发 agent 的 browser-window-focus 处理器）
// / notification-click（真实通知被点击，回掷对应实例的 click 监听）
module.exports.__hostEvent = function __hostEvent(name, payload) {
  if (name === 'win-focus') {
    state.winFocused = !!payload
    fireAppEvent('browser-window-focus')
    return
  }
  if (name === 'notification-click') {
    const n = state.notifications.get(payload && payload.id)
    if (n) n.__fireClick()
  }
}

// 退出握手入口：触发 agent 的 before-quit 处理器（记忆摘要落盘等），
// 完成后 agent 调 app.exit() → shutdown-done → 桥结束握手并 kill
module.exports.__shutdown = function __shutdown() {
  fireAppEvent('before-quit', {
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true }
  })
}

// 取伪窗口（子进程中 agent getWindow() 的返回值）
module.exports.__window = () => pseudoWindow
// 已注册 IPC 通道清单（ready 宣告用）
module.exports.__channels = () => Array.from(state.ipcHandlers.keys())
