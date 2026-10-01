// 浏览器容器（webview 架构）：主进程不持有视图，网页由渲染层 <webview> 承载。
// 职责收敛为两块：
// 1) web-contents-created 统一策略：识别 webview（type='webview'，全应用仅浏览器页
//    使用 <webview>），做 UA 清洗 / 弹窗拦截 / 导航协议白名单——渲染层零感知
// 2) 翻译特性（translate/controller.js）注入与 IPC：按 attachWebview 动态绑定目标
const { app, ipcMain } = require('electron')

let getWin = () => null
// 当前绑定的 webview webContents（页面 attachWebview 时登记，销毁即解绑）
let pageWc = null

function win() {
  const w = getWin()
  return w && !w.isDestroyed() ? w : null
}

function activeWc() {
  return pageWc && !pageWc.isDestroyed() ? pageWc : null
}

// ===== webview webContents 统一策略 =====
function onWebContentsCreated(_e, wc) {
  // webview 的 webContents type 为 'webview'（全应用仅浏览器页使用 <webview>）。
  // 注：不能用 partition 识别——E39 起 wc.getWebPreferences() 返回 undefined，
  // 旧检查导致策略从未挂载（allowpopups 后 _blank 链接新开独立窗口即此原因）
  if (!wc.getType || wc.getType() !== 'webview') return

  // 创建即登记为翻译注入目标（web-contents-created 比页面 attachWebview 更早且可靠）
  noteWebview(wc)

  // 清洗 UA：去掉 Electron/应用名 token（如 "omnideck/1.0.0 Electron/31.0.0"），避免站点
  // （如 WhatsApp）把应用名误解析为浏览器版本提示"Chrome 不受支持"。
  // 白名单负向断言保留 Mozilla/AppleWebKit/Chrome/Safari；请求头与 navigator.userAgent 同步
  try {
    const cleanUa = wc.getUserAgent()
      .replace(/\s+(?!Chrome\/|Safari\/|AppleWebKit\/|Mozilla\/)[a-zA-Z][a-zA-Z0-9._-]*\/\S+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (cleanUa) wc.setUserAgent(cleanUa)
  } catch (err) { /* UA 获取失败保持默认 */ }

  // 站内打开：弹窗一律拒绝并在当前 webview 导航（allowpopups 放行 target=_blank
  // 链接到此；loadURL 需移出 handler 回调异步执行，同步调用会被本次 deny 吞掉）
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) setImmediate(() => {
      if (!wc.isDestroyed()) wc.loadURL(url).catch(() => { /* 后续导航取代时 ERR_ABORTED，良性竞态 */ })
    })
    return { action: 'deny' }
  })
  // 仅放行 http/https 导航，其余协议交给系统
  wc.on('will-navigate', (e, url) => {
    if (!/^https?:/i.test(url)) e.preventDefault()
  })
  wc.on('destroyed', () => {
    if (pageWc === wc) pageWc = null
  })
}

// 特性挂载：feature = { name, init?(ctx), handlers, onLoaded?, onFailLoad?, extendState? }
//   handlers: [channel, fn, type?]，type='on' 时用 ipcMain.on（纯上报通道）
//   ctx: { getWindow, ensureView, isPageSender, sendToPage, executeInPage, pushState }
const features = []

function registerFeature(feature) {
  if (!feature || !feature.name || features.some(f => f.name === feature.name)) return
  if (typeof feature.init === 'function') {
    feature.init({
      getWindow: win,
      // webview 架构：ensureView 即登记当前 webview webContents（渲染层 attachWebview 传入）
      ensureView: () => activeWc(),
      isPageSender: (e) => {
        const wc = activeWc()
        return !!(wc && e && e.sender === wc)
      },
      sendToPage: (channel, msg) => {
        const wc = activeWc()
        if (wc) wc.send(channel, msg)
      },
      executeInPage: async (script) => {
        const wc = activeWc()
        if (!wc) return
        try {
          await wc.executeJavaScript(script, true)
        } catch (err) {
          console.warn('[od:browser] 注入脚本失败：', err.message)
        }
      },
      pushState
    })
  }
  if (Array.isArray(feature.handlers)) {
    feature.handlers.forEach(item => {
      if (!Array.isArray(item) || typeof item[0] !== 'string' || typeof item[1] !== 'function') return
      if (item[2] === 'on') ipcMain.on(item[0], item[1])
      else ipcMain.handle(item[0], item[1])
    })
  }
  features.push(feature)
}

// 状态回推：翻译配置等（导航状态由页面从 webview DOM 事件直接读，不经主进程）
function pushState() {
  const w = win()
  if (!w) return
  const state = {}
  features.forEach(f => {
    if (typeof f.extendState === 'function') Object.assign(state, f.extendState(false))
  })
  w.webContents.send('browser:state', state)
}

// 渲染层导航命令白名单：loadURL 需带 url 参数
const NAV_CMDS = ['loadURL', 'reload', 'goBack', 'goForward', 'stop']

function registerIpc() {
  // 导航命令统一入口（loadURL/goBack/reload 等）：主进程直接驱动 webview。
  // 不让渲染层直调 webview 方法——那走 Electron 内部 GUEST_VIEW_MANAGER_CALL 通道，
  // 导航被重定向/新导航取代时 reject ERR_ABORTED(-3)，主进程必打
  // "Error occurred in handler" 噪音日志（Electron 内置，渲染层 catch 无法拦截）。
  // 在此 catch 即静默竞态（页面实际已由后续导航正常加载）
  ipcMain.handle('browser:navigate', (e, payload) => {
    const w = win()
    if (!w || e.sender !== w.webContents) return { ok: false }
    const wc = activeWc()
    const cmd = payload && payload.cmd
    if (!wc || !NAV_CMDS.includes(cmd)) return { ok: false }
    const run = cmd === 'loadURL'
      ? wc.loadURL(String(payload.url || ''))
      : wc[cmd]()
    return Promise.resolve(run).then(() => ({ ok: true })).catch(() => ({ ok: false }))
  })

  // 页面登记 webview（dom-ready 时）：主进程拿到 webContents 引用做翻译注入
  ipcMain.handle('browser:attach-webview', (e) => {
    // 仅接受主窗渲染层发起；webview 的 webContents 经 web-views 关联校验
    const w = win()
    if (!w || !e || e.sender !== w.webContents) return { ok: false }
    // 渲染层把 webview 的 webContentsId 传来（webview.getWebContentsId()）
    return { ok: true }
  })

  // 翻译开关/引擎等经 controller 特性 handler 处理（browser:translate / browser:set-engine）
  // 页面加载完成通知：触发翻译注入（幂等）
  ipcMain.handle('browser:page-loaded', () => {
    features.forEach(f => { if (typeof f.onLoaded === 'function') f.onLoaded() })
    return { ok: true }
  })

  ipcMain.handle('browser:reset-zoom', (_e, payload) => {
    const w = win()
    if (!w) return { ok: false }
    if (payload && payload.target === 'web') {
      const wc = activeWc()
      if (wc) wc.setZoomFactor(1)
    } else {
      w.webContents.setZoomFactor(1)
    }
    return { ok: true }
  })
}

// 渲染层直接传 webContents 引用不可行（contextIsolation），改由主进程在
// web-contents-created 时自动记录"最近创建的 webview"
function noteWebview(wc) {
  pageWc = wc
}

function init(opts) {
  getWin = (opts && opts.getWindow) || getWin
  // webview 识别与策略挂载、翻译目标登记统一收敛在 onWebContentsCreated
  app.on('web-contents-created', onWebContentsCreated)
  registerIpc()
}

function destroy() {
  pageWc = null
}

module.exports = { init, destroy, registerFeature }
