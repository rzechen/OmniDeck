// OmniBuddy agent 桥（主进程侧）
// fork utilityProcess（agent-host.js）承载 agent 全量 IPC（pi 运行时 / 会话 / 技能等重活），
// 本模块只做三件事：
// - invoke 转发：ipcMain.handle(channel) → 子进程 shim 的注册表（通道清单由 ready 宣告）
// - HOST 服务：子进程不能用主进程专属能力（对话框 / 钥匙串 / 系统通知 / dock / 图像 /
//   Chromium net），经 host-call 转发到这里执行后回执
// - 生命周期：崩溃重启（5s 退避 × 5 次）+ before-quit 退出握手（记忆摘要落盘完成再退）
// 时序说明：startAgentBridge 在 createWindow 之前调用，getWindow() 惰性求值，
// aliveWindow() 每次现取（与原 agent 在主进程内的行为一致）。

'use strict'

const path = require('path')
const {
  app, ipcMain, dialog, shell, BrowserWindow, Notification,
  nativeImage, safeStorage, net, utilityProcess,
  clipboard, WebContentsView
} = require('electron')

let started = false

// ===== 公众号模板抓取宿主服务（agent 子进程无 Chromium，隐藏视图只有主进程能建） =====
// wechat/import.js 经 shim __host.fetchArticle 桥调用；串行队列保证单视图复用。
const WX_PAGE_TIMEOUT = 25000    // 单页加载超时
const WX_ARTICLE_TIMEOUT = 10000 // article 出现轮询上限

let wxFetchView = null
let wxFetchQueue = Promise.resolve()

function getWxFetchView() {
  if (wxFetchView && !wxFetchView.webContents.isDestroyed()) return wxFetchView
  wxFetchView = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 非 persist：抓取会话不落盘，与应用浏览容器（persist:web）隔离
      partition: 'wechat-import'
    }
  })
  const wc = wxFetchView.webContents
  // UA 清洗：去 Electron/应用 token，避免站点指纹拦截（与 windows/browser.js 同规则）
  try {
    const cleanUa = wc.getUserAgent()
      .replace(/\s+(?!Chrome\/|Safari\/|AppleWebKit\/|Mozilla\/)[a-zA-Z][a-zA-Z0-9._-]*\/\S+/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim()
    if (cleanUa) wc.setUserAgent(cleanUa)
  } catch (e) { /* UA 获取失败保持默认 */ }
  return wxFetchView
}

function destroyWxFetchView() {
  if (!wxFetchView) return
  try { wxFetchView.webContents.close() } catch (e) { /* 已销毁 */ }
  wxFetchView = null
}

app.on('will-quit', destroyWxFetchView)

// article 轮询提取：部分展示页 JS 渲染慢，did-finish 后正文未必就绪；
// 返回 { html, text, images }（images 取原始 src 属性值，供子进程精确替换本地化）
function wxExtractArticle(wc) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const r = await wc.executeJavaScript(`(() => {
          const a = document.querySelector('article')
          if (!a) return null
          const imgs = []
          a.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src')
            if (src) imgs.push(src)
          })
          return {
            html: a.innerHTML,
            text: (a.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 200),
            images: imgs
          }
        })()`)
        if (r && r.html) return resolve(r)
      } catch (e) { /* 执行异常（页面跳转中）继续轮询 */ }
      if (Date.now() - started > WX_ARTICLE_TIMEOUT) {
        return reject(new Error('未找到 article 正文(' + WX_ARTICLE_TIMEOUT / 1000 + 's)'))
      }
      setTimeout(poll, 500)
    }
    poll()
  })
}

async function wxFetchArticleInMain(url) {
  const wc = getWxFetchView().webContents
  await Promise.race([
    wc.loadURL(url),
    new Promise((_r, reject) => setTimeout(
      () => reject(new Error('页面加载超时(' + WX_PAGE_TIMEOUT / 1000 + 's)')),
      WX_PAGE_TIMEOUT
    ))
  ])
  return wxExtractArticle(wc)
}

// 串行入口：HOST 'wx.fetchArticle' 调用；失败不断链
function wxFetchArticleHost(url) {
  const run = wxFetchQueue.then(() => wxFetchArticleInMain(url))
  wxFetchQueue = run.catch(() => { /* 队列不断链 */ })
  return run
}

// ===== 公众号编辑器注入宿主服务（wechat/editor.js 经 shim __host.injectEditor 桥调用） =====
// 页面内注入函数：编辑器四级回退定位（新版 ProseMirror 优先）+ 空文档占位段落清理
// + 离屏解析逐节点追加（不覆盖已有内容）+ 受控表单回填（派发 input 事件）
const WX_INJECT_FN = function (html, opts) {
  const editor = document.querySelector('.ProseMirror[contenteditable="true"]')
    || document.querySelector('#js_editor')
    || document.querySelector('.rich_media_content')
    || document.querySelector('[contenteditable="true"]')
  if (!editor) {
    return { ok: false, error: '页面已找到但未检测到编辑器区域（请进入图文编辑页再试）' }
  }
  // 新版 ProseMirror 空文档占位段落（trailing break 节点）清理，避免追加后残留空段
  try {
    const emptySection = editor.querySelector('section:has(span[leaf] .ProseMirror-trailingBreak)')
    if (emptySection) emptySection.remove()
  } catch (e) { /* :has 不支持时忽略 */ }
  const wrapper = document.createElement('div')
  wrapper.innerHTML = html
  let nodes = 0
  while (wrapper.firstChild) {
    editor.appendChild(wrapper.firstChild)
    nodes++
  }
  // 表单回填：直接设 value + 派发冒泡 input 事件，让受控组件感知变更
  const filled = []
  const fill = (sel, val) => {
    if (!val) return
    const el = document.querySelector(sel)
    if (!el) return
    el.value = val
    el.dispatchEvent(new Event('input', { bubbles: true }))
    filled.push(sel)
  }
  fill('#title', opts.title)
  fill('#js_description', opts.digest)
  fill('#author', opts.author)
  return { ok: true, nodes, filled }
}

// 遍历全部 WebContents 定位公众号页（内置浏览器 / 独立窗口均可），取最近一个注入
async function wxInjectEditorHost(html, fields) {
  let target = null
  for (const wc of BrowserWindow.getAllWebContents()) {
    try {
      if (new URL(wc.getURL()).hostname === 'mp.weixin.qq.com') target = wc
    } catch (e) { /* 非标准 URL 跳过 */ }
  }
  if (!target) {
    return {
      ok: false,
      error: '未找到已打开的公众号页面（mp.weixin.qq.com）——请先在内置浏览器登录并进入图文编辑页'
    }
  }
  const script = '(' + WX_INJECT_FN.toString() + ')('
    + JSON.stringify(String(html || '')) + ', ' + JSON.stringify(fields || {}) + ')'
  const r = await target.executeJavaScript(script, true)
  return Object.assign({ url: target.getURL() }, r || { ok: false, error: '注入无返回' })
}

function startAgentBridge(getWindow, baseDir) {
  if (started) return
  started = true

  let child = null
  let readyReceived = false
  let readyError = null
  let lastChannels = []            // 最近一次 ready 的通道清单（崩溃重启后预注册）
  const registeredChannels = new Set()
  const pendingInvokes = new Map() // invoke id -> { resolve, reject }
  let invokeSeq = 0
  let restarts = 0
  let shuttingDown = false
  let quitFinalized = false
  let quitResolve = null

  function post(msg) {
    if (!child) return
    try { child.postMessage(msg) } catch (e) { /* 端口关闭竞态忽略 */ }
  }

  function errText(err) {
    return (err && err.message) ? err.message : String(err)
  }

  function aliveWindow() {
    try {
      const w = getWindow()
      return (w && !w.isDestroyed()) ? w : null
    } catch (e) { return null }
  }

  // 子 → 主返回值中的 Buffer 经结构化克隆变 Uint8Array（如 skills:export-zip），深度复原
  function revive(value, seen) {
    if (!value || typeof value !== 'object') return value
    if (value instanceof Uint8Array) {
      return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
    }
    if (seen.has(value)) return value
    seen.add(value)
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) value[i] = revive(value[i], seen)
      return value
    }
    const proto = Object.getPrototypeOf(value)
    if (proto === Object.prototype || proto === null) {
      for (const k of Object.keys(value)) value[k] = revive(value[k], seen)
    }
    return value
  }

  // ===== HOST 服务表（子进程不能碰的主进程专属能力） =====
  // 网络下载（market.js）：保持 Chromium net 栈 + 系统代理语义，
  // 大文件以 base64 字符串回传（结构化克隆安全，避免 Buffer 复原歧义）
  function fetchBufferViaNet(url, { timeout = 30000, maxSize = 50 * 1024 * 1024 } = {}) {
    return new Promise(resolve => {
      let settled = false
      const finish = data => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        resolve(data)
      }
      const req = net.request({ url, redirect: 'follow' })
      req.setHeader('User-Agent', 'OmniDeck-Market')
      const timer = setTimeout(() => {
        req.abort()
        finish({ ok: false, error: '下载超时' })
      }, timeout)

      let chunks = []
      let size = 0
      req.on('response', res => {
        if (res.statusCode === 429) {
          req.abort()
          finish({ ok: false, error: '触发 GitCode 访问限流（429），请稍后再试' })
          return
        }
        if (res.statusCode !== 200) {
          req.abort()
          finish({ ok: false, error: `下载失败（HTTP ${res.statusCode}）` })
          return
        }
        res.on('data', chunk => {
          chunks.push(chunk)
          size += chunk.length
          if (size > maxSize) {
            req.abort()
            finish({ ok: false, error: '文件超出大小限制' })
          }
        })
        res.on('end', () => finish({ ok: true, dataB64: Buffer.concat(chunks).toString('base64') }))
        res.on('error', () => finish({ ok: false, error: '网络响应中断' }))
      })
      req.on('error', () => finish({ ok: false, error: '网络请求失败（检查网络/代理）' }))
      req.end()
    })
  }

  const HOST = {
    // 对话框：有存活窗口则附着（模态归属正确），否则退化为无窗口调用（与原 agent 行为一致）
    'dialog.showSaveDialog': (opts) => {
      const w = aliveWindow()
      return w ? dialog.showSaveDialog(w, opts) : dialog.showSaveDialog(opts)
    },
    'dialog.showOpenDialog': (opts) => {
      const w = aliveWindow()
      return w ? dialog.showOpenDialog(w, opts) : dialog.showOpenDialog(opts)
    },
    'shell.openExternal': (url) => shell.openExternal(url),
    'shell.openPath': (p) => shell.openPath(p),
    'shell.showItemInFolder': (p) => shell.showItemInFolder(p),
    'shell.trashItem': (p) => shell.trashItem(p),
    // 钥匙串加解密：密文 Buffer 以 base64 字符串跨进程
    'safeStorage.encrypt': async (plain) => ({
      b64: safeStorage.encryptString(String(plain)).toString('base64')
    }),
    'safeStorage.decrypt': async (b64) => ({
      plain: safeStorage.decryptString(Buffer.from(b64, 'base64'))
    }),
    // 系统通知：真实通知在主进程弹，点击事件经 host-event 回掷子进程实例
    'notification.show': (opts) => {
      try {
        const n = new Notification({ title: opts.title, body: opts.body })
        n.on('click', () => post({ t: 'host-event', name: 'notification-click', payload: { id: opts.id } }))
        n.show()
      } catch (e) { /* 通知失败不影响任务 */ }
      return true
    },
    'dock.setBadge': (badge) => {
      if (process.platform === 'darwin' && app.dock) {
        try { app.dock.setBadge(badge == null ? '' : String(badge)) } catch (e) { /* 忽略 */ }
      }
      return true
    },
    'win.show': () => {
      const w = aliveWindow()
      if (w) { w.show(); w.focus() }
      return true
    },
    'win.focus': () => {
      const w = aliveWindow()
      if (w) w.focus()
      return true
    },
    // 附件缩略图：子进程无法持有图像对象，主进程代生成 dataURL
    'thumb': (buf, opts) => {
      const img = nativeImage.createFromBuffer(Buffer.from(buf))
      if (img.isEmpty()) return { dataUrl: '' }
      const width = (opts && opts.width) || 360
      const quality = (opts && opts.quality) != null ? opts.quality : 72
      return { dataUrl: img.resize({ width }).toJPEG(quality).toDataURL() }
    },
    'fetchBuffer': (url, opts) => fetchBufferViaNet(url, opts),
    // 公众号模板抓取：隐藏 WebContentsView 加载作品页并提取 article（子进程无 Chromium）
    'wx.fetchArticle': (url) => wxFetchArticleHost(url),
    // 公众号编辑器注入：定位已打开的 mp.weixin.qq.com 页面写入渲染成品
    'wx.injectEditor': (html, fields) => wxInjectEditorHost(html, fields),
    // 剪贴板组合写入（wechat/copy 工具：html 富文本 + text 纯文本兜底）
    'clipboard.write': (payload) => {
      clipboard.write(payload || {})
      return true
    }
  }

  // ===== 子进程消息路由 =====
  function onChildMessage(msg) {
    if (!msg || typeof msg !== 'object') return

    if (msg.t === 'host-call') {
      const fn = HOST[msg.method]
      Promise.resolve()
        .then(() => (fn ? fn(...msg.args) : Promise.reject(new Error('未知宿主方法：' + msg.method))))
        .then(
          (data) => post({ t: 'host-res', id: msg.id, ok: true, data }),
          (err) => post({ t: 'host-res', id: msg.id, ok: false, error: errText(err) })
        )
      return
    }

    if (msg.t === 'invoke-res') {
      const p = pendingInvokes.get(msg.id)
      if (p) {
        pendingInvokes.delete(msg.id)
        if (msg.ok) p.resolve(revive(msg.data, new WeakSet()))
        else p.reject(new Error(msg.error))
      }
      return
    }

    if (msg.t === 'ready') {
      readyReceived = true
      if (msg.error) {
        readyError = msg.error
        console.error('[agent-bridge] agent 子进程启动失败（不重启）：', msg.error)
        return
      }
      readyError = null
      lastChannels = Array.isArray(msg.channels) ? msg.channels : []
      registerChannels(lastChannels)
      console.log('[agent-bridge] agent 子进程就绪（' + lastChannels.length + ' 个 IPC 通道）')
      return
    }

    if (msg.t === 'broadcast') {
      // 等价原 agent 的 emit：遍历真实窗口群（主窗 + 快捷面板），各窗口按 sessionId 自行过滤
      for (const win of BrowserWindow.getAllWindows()) {
        try {
          if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
            win.webContents.send(msg.channel, msg.payload)
          }
        } catch (e) { /* 窗口销毁竞态忽略 */ }
      }
      return
    }

    if (msg.t === 'shutdown-done') {
      if (quitResolve) quitResolve()
    }
  }

  // ===== invoke 通道注册 =====
  function registerChannels(channels) {
    for (const channel of channels) {
      if (registeredChannels.has(channel)) continue
      registeredChannels.add(channel)
      ipcMain.handle(channel, (_e, ...args) => new Promise((resolve, reject) => {
        if (!child || shuttingDown) {
          reject(new Error('agent 子进程未就绪，请稍后重试'))
          return
        }
        const id = 'inv-' + (++invokeSeq)
        pendingInvokes.set(id, { resolve, reject })
        try {
          child.postMessage({ t: 'invoke', id, channel, args })
        } catch (e) {
          pendingInvokes.delete(id)
          reject(new Error('agent 通信失败：' + errText(e)))
        }
      }))
    }
  }

  function failPendingInvokes(text) {
    for (const [, p] of Array.from(pendingInvokes)) p.reject(new Error(text))
    pendingInvokes.clear()
  }

  // ===== 崩溃重启 =====
  function onChildExit(code) {
    if (shuttingDown) { finishQuit(); return }
    console.error('[agent-bridge] agent 子进程异常退出（code=' + code + '）')
    failPendingInvokes('agent 子进程已退出，本次请求失败，请重试')
    child = null
    readyReceived = false
    if (readyError) return // 启动失败不重启（坏状态循环拉起无意义）
    if (++restarts <= 5) {
      // 5s 退避：给外部资源（被杀的 pi 子进程 / 端口 / 文件锁）喘息窗口
      setTimeout(() => {
        if (shuttingDown) return
        console.log('[agent-bridge] 重启 agent 子进程（第 ' + restarts + ' 次）…')
        forkChild()
        // 预注册上一轮通道清单：重启窗口期（fork → ready 之间）到达的 invoke 不至于
        // 因通道未注册而直接失败（子进程侧 shim 未 wire 前消息排队，ready 后正常消费）
        registerChannels(lastChannels)
      }, 5000)
    } else {
      console.error('[agent-bridge] agent 子进程重启次数超限（5 次），放弃')
    }
  }

  // ===== fork =====
  function forkChild() {
    let safeStorageAvailable = false
    try { safeStorageAvailable = safeStorage.isEncryptionAvailable() } catch (e) { /* 忽略 */ }
    let notificationSupported = false
    try { notificationSupported = Notification.isSupported() } catch (e) { /* 忽略 */ }

    const paths = {}
    try { paths.userData = app.getPath('userData') } catch (e) { paths.userData = baseDir }
    try { paths.downloads = app.getPath('downloads') } catch (e) { paths.downloads = baseDir }

    const initPayload = {
      userDataPath: baseDir,
      paths,
      safeStorageAvailable,
      notificationSupported
    }

    child = utilityProcess.fork(
      path.join(__dirname, 'agent-host.js'),
      ['--omnideck-agent-init=' + encodeURIComponent(JSON.stringify(initPayload))],
      { serviceName: 'omnideck-agent', stdio: 'inherit' }
    )
    child.on('message', onChildMessage)
    child.on('exit', onChildExit)
  }

  // ===== 退出握手 =====
  // agent 的 before-quit（记忆摘要落盘）在子进程内执行：shutdown → agent 收尾 →
  // shutdown-done（或 30s 总兜底超时，agent 内部另有 20s 超时）→ kill 子进程 → app.exit(0)
  function finishQuit() {
    if (quitFinalized) return
    quitFinalized = true
    if (child) {
      try { child.kill() } catch (e) { /* 忽略 */ }
      child = null
    }
    app.exit(0)
  }

  app.on('before-quit', (event) => {
    if (quitFinalized || shuttingDown) return
    shuttingDown = true
    event.preventDefault()
    // 子进程不在 / 从未就绪 / 启动失败：直接退（防早退挂 30s 超时）
    if (!child || !readyReceived || readyError) {
      finishQuit()
      return
    }
    const timeout = setTimeout(() => {
      console.warn('[agent-bridge] agent 退出握手超时，强制结束')
      if (quitResolve) quitResolve = null
      finishQuit()
    }, 30000)
    quitResolve = () => {
      clearTimeout(timeout)
      quitResolve = null
      finishQuit()
    }
    post({ t: 'shutdown' })
  })

  // ===== 聚焦态推送（app 级事件：桥启动时主窗口可能尚未创建，不能绑窗口实例） =====
  // 子进程 shim 依赖它维护伪窗口 isFocused()（dock 角标判断）+ 触发 browser-window-focus
  // 处理器（darwin 清角标）
  app.on('browser-window-focus', () => post({ t: 'host-event', name: 'win-focus', payload: true }))
  app.on('browser-window-blur', () => post({ t: 'host-event', name: 'win-focus', payload: false }))

  forkChild()
}

module.exports = { startAgentBridge }
