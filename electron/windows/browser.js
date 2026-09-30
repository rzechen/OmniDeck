// 浏览器容器（通用）：主窗体内 WebContentsView 网页容器
// 职责：view 生命周期（创建/挂载/分离/销毁）、导航、bounds、UA 清洗、弹窗策略；
// 业务能力由特性(feature)提供，经 registerFeature 挂载——特性自带页面注入脚本
// 与 od-* 命名空间通道（经 browser/view-preload 通用桥 odBridge 回环主进程），
// 如 translate/controller.js（双语对照翻译）、后续公众号编辑器注入等
const { ipcMain, Menu, WebContentsView } = require('electron')
const path = require('path')

let getWin = () => null
let view = null
let wantShow = false
// 已挂载特性：{ name, onLoaded?, onFailLoad?, extendState? }
const features = []

function win() {
  const w = getWin()
  return w && !w.isDestroyed() ? w : null
}

function activeWc() {
  return view && !view.webContents.isDestroyed() ? view.webContents : null
}

// 组装完整状态：容器基础字段 + 各特性扩展字段（consume=true 时特性可读清一次性状态）
function buildState(consume) {
  const w = win()
  const wc = activeWc()
  const state = {
    url: wc ? wc.getURL() : '',
    title: wc ? wc.getTitle() : '',
    isLoading: !!wc && wc.isLoading(),
    canGoBack: !!wc && wc.navigationHistory.canGoBack(),
    canGoForward: !!wc && wc.navigationHistory.canGoForward(),
    attached: !!(view && w && w.contentView && w.contentView.children.indexOf(view) !== -1)
  }
  for (let i = 0; i < features.length; i++) {
    const f = features[i]
    if (typeof f.extendState === 'function') Object.assign(state, f.extendState(consume))
  }
  return state
}

function pushState() {
  const w = win()
  if (!w) return
  w.webContents.send('browser:state', buildState(true))
}

function ensureView() {
  if (view && !view.webContents.isDestroyed()) return view
  view = new WebContentsView({
    webPreferences: {
      preload: path.join(__dirname, '../browser/view-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 独立持久会话：站点 cookie/缓存与主窗应用隔离
      partition: 'persist:web'
    }
  })
  view.setBackgroundColor('#ffffff')
  const wc = view.webContents

  // 清洗 UA：去掉 Electron/应用名 token（如 "omnideck/1.0.0 Electron/31.0.0"），避免站点
  // （如 WhatsApp）把应用名误解析为浏览器版本，提示"Chrome 不受支持"。
  // 白名单负向断言保留 Mozilla/AppleWebKit/Chrome/Safari；导航请求与 navigator.userAgent 同步生效。
  try {
    const cleanUa = wc.getUserAgent()
      .replace(/\s+(?!Chrome\/|Safari\/|AppleWebKit\/|Mozilla\/)[a-zA-Z][a-zA-Z0-9._-]*\/\S+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (cleanUa) wc.setUserAgent(cleanUa)
  } catch (e) { /* UA 获取失败保持默认 */ }

  // 站内打开：弹窗一律拒绝并在当前视图导航
  wc.setWindowOpenHandler(({ url }) => {
    if (/^https?:/i.test(url)) wc.loadURL(url)
    return { action: 'deny' }
  })
  // 仅放行 http/https 导航，其余协议交给系统
  wc.on('will-navigate', (e, url) => {
    if (!/^https?:/i.test(url)) e.preventDefault()
  })

  wc.on('did-start-loading', pushState)
  wc.on('did-stop-loading', pushState)
  wc.on('did-navigate', () => { pushState(); if (wantShow) attach() })
  wc.on('did-navigate-in-page', pushState)
  wc.on('page-title-updated', pushState)
  wc.on('render-process-gone', () => { console.warn('[od:browser] 渲染进程异常退出') })
  // 每次真实加载完成后：推状态并通知各特性（注入脚本等）
  wc.on('did-finish-load', () => {
    pushState()
    features.forEach(f => { if (typeof f.onLoaded === 'function') f.onLoaded() })
  })
  wc.on('did-fail-load', (_e, code, desc, url, isMain) => {
    // 主帧加载失败（非中断）时回推状态，页面展示错误提示
    if (isMain && code !== -3) {
      features.forEach(f => { if (typeof f.onFailLoad === 'function') f.onFailLoad() })
      pushState()
      console.warn('[od:browser] 加载失败', code, desc, url)
    }
  })
  return view
}

function attach() {
  const w = win()
  if (!w || !ensureView()) return
  const cv = w.contentView
  if (cv.children.indexOf(view) === -1) cv.addChildView(view)
  pushState()
}

function detach() {
  const w = win()
  if (!w || !view) return
  try { w.contentView.removeChildView(view) } catch (e) { /* 已移除 */ }
  pushState()
}

function destroyView() {
  if (!view) return
  try { view.webContents.close() } catch (e) { /* noop */ }
  view = null
}

// 视图当前 bounds 记录（resize 时复算用）
let curBounds = null

// 地址归一化：无协议补 https，localhost/IP 补 http
function normalizeUrl(input) {
  const s = String(input || '').trim()
  if (!s) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]|$)/i.test(s)) return 'http://' + s
  return 'https://' + s
}

// 特性挂载：feature = { name, init?(ctx), handlers, onLoaded?, onFailLoad?, extendState? }
//   handlers: [channel, fn, type?]，type='on' 时用 ipcMain.on（纯上报通道）
//   ctx: { getWindow, ensureView, isPageSender, sendToPage, executeInPage, pushState }
function registerFeature(feature) {
  if (!feature || !feature.name || features.some(f => f.name === feature.name)) return
  if (typeof feature.init === 'function') {
    feature.init({
      getWindow: win,
      ensureView,
      // sender 校验：仅接受本容器页面（webContents）发起的请求
      isPageSender: (e) => {
        const wc = activeWc()
        return !!(view && wc && e && e.sender === wc)
      },
      sendToPage: (channel, msg) => {
        const wc = activeWc()
        if (wc) wc.send(channel, msg)
      },
      // 页面主世界执行脚本（注入 controller 等），失败仅告警不外抛
      executeInPage: async (script) => {
        const wc = activeWc()
        if (!wc) return
        try {
          await wc.executeJavaScript(script, true)
        } catch (e) {
          console.warn('[od:browser] 注入脚本失败(' + feature.name + ')：', e.message)
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

function registerIpc() {
  // ===== 页面 → 容器控制 =====
  ipcMain.handle('browser:navigate', (_e, input) => {
    const url = normalizeUrl(input)
    if (!/^https?:/i.test(url)) return { ok: false, error: '仅支持 http/https 网页地址' }
    ensureView()
    wantShow = true
    view.webContents.loadURL(url).catch(() => { /* 加载失败经 did-fail-load 回推 */ })
    return { ok: true }
  })

  ipcMain.handle('browser:back', () => {
    const wc = activeWc()
    if (wc && wc.navigationHistory.canGoBack()) wc.navigationHistory.goBack()
    return { ok: true }
  })

  ipcMain.handle('browser:forward', () => {
    const wc = activeWc()
    if (wc && wc.navigationHistory.canGoForward()) wc.navigationHistory.goForward()
    return { ok: true }
  })

  ipcMain.handle('browser:reload', () => {
    const wc = activeWc()
    if (wc && !wc.isDestroyed()) wc.reload()
    return { ok: true }
  })

  ipcMain.handle('browser:stop', () => {
    const wc = activeWc()
    if (wc && !wc.isDestroyed()) wc.stop()
    return { ok: true }
  })

  // rect 上报：CSS px → DIP 换算（scale = 内容区宽 / 渲染层视口宽）
  ipcMain.handle('browser:set-bounds', (_e, payload) => {
    const w = win()
    if (!w || !view || !payload || !payload.rect) return
    const { rect, innerWidth, innerHeight } = payload
    const [cw, ch] = w.getContentSize()
    const sx = innerWidth > 0 ? cw / innerWidth : 1
    const sy = innerHeight > 0 ? ch / innerHeight : sx
    view.setBounds({
      x: Math.round(rect.x * sx),
      y: Math.round(rect.y * sy),
      width: Math.max(0, Math.round(rect.width * sx)),
      height: Math.max(0, Math.round(rect.height * sy))
    })
    curBounds = { ...view.getBounds() }
    return { ok: true }
  })

  // 原生下拉菜单：DOM 弹层会被原生子视图盖住，改用系统 Menu（浮于一切之上）。
  // items: [{ value, label, checked? }]；返回选中 value（取消/关闭返回 null）
  ipcMain.handle('browser:popup-menu', (_e, payload) => {
    const w = win()
    if (!w || !payload || !Array.isArray(payload.items)) return Promise.resolve(null)
    const { x, y } = w.getContentBounds()
    return new Promise(resolve => {
      let settled = false
      const done = v => {
        if (!settled) {
          settled = true
          resolve(v)
        }
      }
      const menu = Menu.buildFromTemplate(payload.items.map(it => ({
        label: String(it.label || it.value),
        type: it.checked ? 'checkbox' : 'normal',
        checked: !!it.checked,
        click: () => done(it.value)
      })))
      // callback 是菜单关闭（含点击选中后）的官方通知；窗口销毁兜底
      menu.popup({
        window: w,
        x: Math.round(x + (payload.x || 0)),
        y: Math.round(y + (payload.y || 0)),
        callback: () => done(null)
      })
      w.once('closed', () => done(null))
    })
  })

  ipcMain.handle('browser:show', () => {
    wantShow = true
    // 首次进入且尚无页面内容时保持分离（避免白板盖住空态引导）
    if (view && view.webContents.getURL()) attach()
    return { ok: true }
  })

  ipcMain.handle('browser:hide', () => {
    wantShow = false
    detach()
    return { ok: true }
  })

  ipcMain.handle('browser:get-state', () => buildState(false))
}

function init(opts) {
  getWin = (opts && opts.getWindow) || getWin
  registerIpc()
}

// 主窗销毁时调用：关闭视图 webContents 并解除引用
function destroy() {
  detach()
  destroyView()
}

module.exports = { init, destroy, registerFeature }
