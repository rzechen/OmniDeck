const { app, BrowserWindow, shell, net, ipcMain, systemPreferences, safeStorage, powerMonitor } = require('electron')
const path = require('path')
const fs = require('fs')
const { registerOmnibuddyIpc } = require('./agent')
const { startAgentBridge } = require('./agent-bridge')
const quickPanel = require('./windows/quick-panel')
const capture = require('./windows/capture')
const updater = require('./core/updater')
const deps = require('./core/deps')
const wallpaperFetch = require('./services/wallpaper-fetch')

process.env['ELECTRON_DISABLE_SECURITY_WARNINGS'] = 'true'

let mainWindow = null
// 托盘常驻标记：close 拦截据此放行（真正退出走托盘菜单 / Cmd+Q）
let isQuitting = false

// ===== 应用锁定：密码（safeStorage 加密）+ Touch ID =====
const lockSecretFile = () => path.join(app.getPath('userData'), 'applock.bin')

ipcMain.handle('app-lock:biometric-supported', () => {
  try {
    return systemPreferences.canPromptTouchID()
  } catch (e) {
    return false
  }
})

ipcMain.handle('app-lock:has-password', () => fs.existsSync(lockSecretFile()))

ipcMain.handle('app-lock:set-password', (_e, pwd) => {
  try {
    if (!safeStorage.isEncryptionAvailable()) return { ok: false, reason: 'encryption-unavailable' }
    fs.writeFileSync(lockSecretFile(), safeStorage.encryptString(String(pwd)))
    // 锁密码密文，收紧文件权限
    try { fs.chmodSync(lockSecretFile(), 0o600) } catch (e) { /* chmod 失败不影响功能 */ }
    return { ok: true }
  } catch (e) {
    return { ok: false, reason: e.message }
  }
})

ipcMain.handle('app-lock:clear-password', () => {
  try {
    if (fs.existsSync(lockSecretFile())) fs.unlinkSync(lockSecretFile())
    return { ok: true }
  } catch (e) {
    return { ok: false }
  }
})

ipcMain.handle('app-lock:verify', (_e, pwd) => {
  try {
    if (!fs.existsSync(lockSecretFile())) return { ok: false, noPassword: true }
    const stored = safeStorage.decryptString(fs.readFileSync(lockSecretFile()))
    return { ok: stored === String(pwd) }
  } catch (e) {
    return { ok: false }
  }
})

ipcMain.handle('app-lock:biometric-verify', async () => {
  try {
    await systemPreferences.promptTouchID('解锁 OmniDeck')
    return { ok: true }
  } catch (e) {
    return { ok: false, cancelled: true }
  }
})

// 系统锁屏 → 通知渲染进程锁定应用
powerMonitor.on('lock-screen', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('app-lock:system-locked')
  }
})

// ===== Windows 窗口控制（无边框窗口的自定义最小化/最大化/关闭） =====
ipcMain.handle('win-control:minimize', () => {
  if (mainWindow) mainWindow.minimize()
})
ipcMain.handle('win-control:toggle-maximize', () => {
  if (!mainWindow) return
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize()
  } else {
    mainWindow.maximize()
  }
})
ipcMain.handle('win-control:close', () => {
  if (mainWindow) mainWindow.close()
})
ipcMain.handle('win-control:is-maximized', () => !!(mainWindow && mainWindow.isMaximized()))

// ===== 重启应用（不动任何数据）=====
// 入口视图等需重启生效的设置切换后调用；渲染侧已先持久化到 IndexedDB
ipcMain.handle('app:relaunch', () => {
  app.relaunch()
  app.exit(0)
})

function createWindow() {
  const isMac = process.platform === 'darwin'
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#F0F0F2',
    show: false,
    // 平台差异：mac 用红绿灯 + 毛玻璃；Windows 无边框，由 Topbar 自绘窗口控制按钮
    ...(isMac
      ? {
          titleBarStyle: 'hiddenInset',
          // 红绿灯与右侧 36px 页签行垂直居中对齐（按钮 12px，y = (36-12)/2 = 12）；
          // x=8 → 红绿灯组（52px 宽）在 68px 收起轨道内两侧各留 8px，收起后不溢出
          trafficLightPosition: { x: 8, y: 12 },
          vibrancy: 'under-window',
          visualEffectState: 'active'
        }
      : {
          frame: false
        }),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  // 最大化状态变化 → 通知渲染进程切换按钮图标
  const sendMax = v => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('win-control:maximized-changed', v)
    }
  }
  mainWindow.on('maximize', () => sendMax(true))
  mainWindow.on('unmaximize', () => sendMax(false))

  // 启动默认最大化（保留用户手动还原后的尺寸记忆由系统管理）
  mainWindow.maximize()

  // 开发模式加载 dev server，生产模式加载打包文件
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  // 自检：窗口加载完成后输出 electronAPI 实际注入的键（诊断 preload 是否为最新）
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow.webContents
      .executeJavaScript('window.electronAPI ? Object.keys(window.electronAPI).join(",") : "(NO electronAPI)"')
      .then(keys => console.log('[preload-check]', keys))
      .catch(() => {})
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  // 外部链接在系统浏览器中打开
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // 无 target=_blank 的链接（含 markdown 渲染出的伪链接，如 `entries.md`
  // 被解析成 http://entries.md）会令当前窗口导航离开应用页面导致白屏：
  // 应用自身地址（dev server / 打包产物）之外的一切导航一律阻止，交系统浏览器
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const appBase = process.env.ELECTRON_RENDERER_URL ||
      require('url').pathToFileURL(path.join(__dirname, '../dist/index.html')).href
    if (url === appBase || url.startsWith(appBase)) return
    e.preventDefault()
    if (/^https?:\/\//i.test(url)) shell.openExternal(url)
  })

  // 托盘常驻：关闭按钮 = 隐藏到托盘（真正退出走托盘菜单 / Cmd+Q，
  // before-quit 会置 isQuitting 放行 close）
  mainWindow.on('close', (e) => {
    if (!isQuitting) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

// HTML 常见实体解码（title 抓取用，避免引入完整实体表）
function decodeEntities(str) {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
}

// 从 HTML 提取 favicon 地址：<link rel="icon"> 声明的真实地址（相对路径按 base 解析）
// 优先级：icon / shortcut icon > apple-touch-icon
function extractFavicon(html, base) {
  const linkRe = /<link\s[^>]*>/gi
  const found = []
  let m
  while ((m = linkRe.exec(html))) {
    const tag = m[0]
    const rel = /rel\s*=\s*["']([^"']+)["']/i.exec(tag)
    if (!rel || !/icon/i.test(rel[1])) continue
    const href = /href\s*=\s*["']([^"']+)["']/i.exec(tag)
    if (href) found.push({ rel: rel[1].toLowerCase(), href: href[1] })
  }
  if (!found.length) return ''
  const pref = ['icon', 'shortcut icon', 'apple-touch-icon-precomposed', 'apple-touch-icon']
  found.sort((a, b) => {
    const ai = pref.indexOf(a.rel)
    const bi = pref.indexOf(b.rel)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
  try {
    return new URL(found[0].href, base).href
  } catch (e) {
    return ''
  }
}

// 通用 HTTP 请求代理：API 调试工具使用
// 渲染进程受 CORS 限制无法请求任意外站接口，故在主进程用 net 转发
ipcMain.handle('http:request', async (_event, opts) => {
  const { method = 'GET', url, headers = {}, body = '', timeout = 15000 } = opts || {}
  let target
  try {
    target = new URL(url)
    if (!/^https?:$/.test(target.protocol)) {
      return { ok: false, error: '仅支持 http/https 协议' }
    }
  } catch (e) {
    return { ok: false, error: 'URL 格式不正确' }
  }

  return new Promise(resolve => {
    const started = Date.now()
    let settled = false
    const finish = data => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(data)
    }

    const req = net.request({ url: target.href, method: method.toUpperCase(), redirect: 'follow' })
    req.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    for (const [k, v] of Object.entries(headers || {})) {
      if (k) {
        try { req.setHeader(k, String(v)) } catch (e) { /* 非法头忽略 */ }
      }
    }

    const timer = setTimeout(() => {
      req.abort()
      finish({ ok: false, error: '请求超时（' + timeout + 'ms）', durationMs: Date.now() - started })
    }, Math.min(timeout, 60000))

    let chunks = []
    let size = 0
    req.on('response', res => {
      res.on('data', chunk => {
        chunks.push(chunk)
        size += chunk.length
        // 响应体超过 5MB 截断，避免内存问题
        if (size > 5 * 1024 * 1024) req.abort()
      })
      res.on('end', () => {
        const buf = Buffer.concat(chunks)
        const text = buf.toString('utf-8')
        finish({
          ok: true,
          status: res.statusCode,
          statusText: res.statusMessage || '',
          headers: res.headers,
          // 文本超 2MB 截断（基金档案等接口约 1MB，需完整返回）
          body: text.length > 2 * 1024 * 1024 ? text.slice(0, 2 * 1024 * 1024) + '\n…（已截断）' : text,
          durationMs: Date.now() - started,
          size: buf.length
        })
      })
      res.on('error', err => {
        finish({ ok: false, error: err.message, durationMs: Date.now() - started })
      })
    })
    req.on('error', err => {
      finish({ ok: false, error: err.message, durationMs: Date.now() - started })
    })

    if (body && method.toUpperCase() !== 'GET') {
      req.write(body)
    }
    req.end()
  })
})

// 抓取网站元信息：可达性（是否收到 HTTP 响应）+ <title> + favicon 地址
// 渲染进程受 CORS 限制无法读取外站响应体，故在主进程完成
ipcMain.handle('site-meta:fetch', async (_event, rawUrl) => {
  const result = { ok: false, title: '', favicon: '' }
  let target
  try {
    target = new URL(rawUrl)
    if (!/^https?:$/.test(target.protocol)) return result
  } catch (e) {
    return result
  }

  return new Promise(resolve => {
    let settled = false
    const finish = data => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(data)
    }

    const req = net.request({ url: target.href, redirect: 'follow' })
    // 模拟常规浏览器 UA，避免被部分站点拦截
    req.setHeader('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
    req.setHeader('Accept-Language', 'zh-CN,zh;q=0.9')
    const timer = setTimeout(() => {
      result.timeout = true
      req.abort()
      finish(result)
    }, 8000)

    let html = ''
    let bytes = 0
    let titleDone = false
    let faviconDone = false

    req.on('response', res => {
      // 收到任意 HTTP 响应即视为网站存在（403/404 等也说明域名可解析）
      result.ok = true
      const contentType = String(res.headers['content-type'] || '')
      if (contentType && !/text\/html|application\/xhtml/i.test(contentType)) {
        // 非 HTML 资源（如直链文件），只判可达性
        req.abort()
        finish(result)
        return
      }
      res.on('data', chunk => {
        bytes += chunk.length
        html += chunk.toString()
        if (!titleDone) {
          const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
          if (m) {
            const title = decodeEntities(m[1].replace(/\s+/g, ' ')).trim()
            if (title) result.title = title.slice(0, 100)
            titleDone = true
          }
        }
        if (!faviconDone) {
          const fav = extractFavicon(html, target.href)
          if (fav) {
            result.favicon = fav
            faviconDone = true
          }
        }
        // title 与 favicon 都拿到（或读满 128KB）即结束
        if ((titleDone && faviconDone) || bytes > 131072) {
          req.abort()
          finish(result)
        }
      })
      res.on('end', () => {
        // 流结束兜底：favicon 声明靠后时再提取一次
        if (!faviconDone) {
          const fav = extractFavicon(html, target.href)
          if (fav) result.favicon = fav
        }
        finish(result)
      })
      res.on('error', () => finish(result))
    })
    req.on('error', () => finish(result))
    req.end()
  })
})

app.whenReady().then(async () => {
  // 启动依赖预检：qmd 等必需外部 CLI 缺失时弹窗引导安装，不满足不放行
  if (!await deps.ensureDeps()) return

  // git 预检：Windows 首启后台解压内置 MinGit 并注入 PATH（几秒内就绪，
  // 后续启动毫秒级）；mac/linux 实测系统 git，缺失一次性提示，均不阻断启动
  deps.ensureGit()

  // OmniBuddy Agent：pi 运行时（agentDir/workspace）+ 会话持久化 + 流式对话 IPC
  // 默认走 utilityProcess 子进程（agent-bridge 桥接），OMNIDECK_AGENT_IN_PROCESS=1 回退主进程内运行
  const omnibuddyDir = path.join(app.getPath('userData'), 'omnibuddy')
  if (process.env.OMNIDECK_AGENT_IN_PROCESS) {
    registerOmnibuddyIpc(() => mainWindow, omnibuddyDir)
  } else {
    startAgentBridge(() => mainWindow, omnibuddyDir)
  }

  // 屏幕截取（iShot 风格截图工具）：内存记录池（无落盘），IPC 注册；
  // getWindows：快捷键截图时需隐藏的应用窗口（主窗 + 快捷面板）
  capture.init({
    getWindows: () => {
      const wins = []
      if (mainWindow && !mainWindow.isDestroyed()) wins.push(mainWindow)
      const qw = quickPanel.getPanelWindow && quickPanel.getPanelWindow()
      if (qw && !qw.isDestroyed()) wins.push(qw)
      return wins
    },
    // 持久化 sink 校验：仅主窗可作为 IndexedDB 持久化执行方
    getSink: () => mainWindow,
    // 截图快捷键修改后：托盘「快捷截图」项键位显示同步刷新
    onShortcutsChanged: () => quickPanel.rebuildTrayMenu()
  })
  capture.registerIpc()

  // 壁纸市场拉取：manifest / 下载到本地目录 / 读拉取文件（渲染层经 preload wallpaperMarket 调用）
  wallpaperFetch.registerIpc()

  createWindow()

  // 快捷入口（P0-M1）：托盘 + 全局快捷键 + 快捷面板壳
  quickPanel.init({ getWindow: () => mainWindow })

  // 自动更新（N1 阶段一）：GitCode Releases 检测 + 引导下载（启动 30s 后静默检查）
  updater.init(() => mainWindow)

  app.on('activate', () => {
    // 托盘常驻后主窗口多为隐藏态：dock 点击恢复而非重建
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show()
      mainWindow.focus()
    } else if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 托盘常驻：窗口全关后保留应用（真正退出走托盘菜单「退出」/ Cmd+Q）
app.on('window-all-closed', () => { /* 不退出 */ })

app.on('before-quit', () => {
  isQuitting = true
})
