// OmniDeck 应用协议（app://）：dev 与打包版统一加载 origin，根治 IndexedDB 隔离
//
// 背景：IndexedDB / localStorage 按页面源（origin）隔离——
//   dev 走 http://localhost:5173、打包版走 file://，两套源各自为库，
//   模型列表 / 壁纸 / 快捷键等渲染层配置互不可见（曾表现为“安装后模型列表消失”）。
//
// 方案：注册标准安全协议 app://（URL 形如 app://od/index.html）：
//   - dev：协议代理转发到 vite dev server（ELECTRON_RENDERER_URL），HMR 不受影响
//   - 生产：映射到本地 dist/ 静态产物
// 两种模式同一 origin（app://od），IndexedDB 互通，从此 dev 配置即安装版配置。
//
// 历史数据迁移（migrateLegacy，一次性）：leveldb 目录对拷实测无效（Chromium 库元数据
// 与 origin 绑定），故走 API 搬运——隐藏窗口在旧源上加载 public/idb-migrate.html
// 读出全部记录（Blob 转 base64 过桥，V8 序列化不支持 Blob），主进程经
// executeJavaScript 取回，再交 app://od 源上的 public/idb-write.html 落库还原。
// 源顺序：file://（旧安装版）先、dev 后——同 key 冲突时 dev 数据胜出。
// 完成后写哨兵文件，不再重复执行；有数据但写入失败时不写哨兵（下次启动重试）。
//
// 时序：registerSchemesAsPrivileged 必须在 app ready 前同步调用，故在模块加载期执行
const { app, BrowserWindow, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

// 协议 scheme（URL 实际展示为 app://od/...）
const SCHEME = 'app'
const HOST = 'od'

// registerSchemesAsPrivileged：standard 才支持相对路径解析 / 同源判定，
// secure + supportFetchAPI 保证 IndexedDB / fetch 等完整 Web 能力可用
protocol.registerSchemesAsPrivileged([
  { scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

// dev 模式目标：vite dev server 地址（init 注入）
let devServerUrl = ''
// 生产模式根目录：渲染产物 dist/
let distRoot = ''

// 迁移哨兵文件：存在即跳过迁移（userData 根下，与其它标记文件同策略）
function migrateFlagFile() {
  return path.join(app.getPath('userData'), '.idb-migrated-to-app-origin')
}

// MIME 兜底表：按扩展名补 Content-Type（net.fetch(file://) 大多能识别，
// 个别类型（.mjs/.svg 等）识别不准时以此校正）
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.wasm': 'application/wasm'
}

function handleRequest(request) {
  if (devServerUrl) {
    // dev：原样转发到 vite dev server（保留 query；hash 不参与请求）
    const target = request.url.replace(/^app:\/\/od/, devServerUrl)
    return net.fetch(target, { bypassCustomProtocolHandlers: true })
  }
  // 生产：app://od/<rel> → dist/<rel>
  const u = new URL(request.url)
  const rel = decodeURIComponent(u.pathname).replace(/^\/+/, '') || 'index.html'
  const filePath = path.normalize(path.join(distRoot, rel))
  // 目录穿越防护：解析后必须仍在 distRoot 内
  if (!filePath.startsWith(distRoot + path.sep) && filePath !== distRoot) {
    return new Response(null, { status: 403 })
  }
  // 不存在的资源回退 index.html（hash 路由下正常资源均存在，此为兜底）
  let file = filePath
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    file = path.join(distRoot, 'index.html')
  }
  return net.fetch(pathToFileURL(file).href).then(res => {
    // 校正 Content-Type（个别扩展名 net.fetch 识别不准）
    const ext = path.extname(file).toLowerCase()
    const type = MIME[ext]
    if (type && (!res.headers.get('content-type') || res.headers.get('content-type').includes('octet-stream'))) {
      const headers = new Headers(res.headers)
      headers.set('content-type', type)
      return new Response(res.body, { status: res.status, headers })
    }
    return res
  })
}

// ===== 历史数据迁移（一次性，读/写双侧页面 + 主进程搬运） =====

// 迁移源清单：file://（旧安装版）在前、dev 在后——同 key 后写覆盖，
// dev 数据（用户主要使用环境）在冲突时胜出；生产模式仅 file:// 一源
function legacySources() {
  const list = []
  // file:// 旧源：file:// 下所有路径同源（file__0 库），任一路径加载均可读到。
  // 迁移页优先取 dist/（生产，public 随构建拷入）；dev 未构建过 dist 时用 public/ 源文件
  const p = [path.join(distRoot, 'idb-migrate.html'), path.join(__dirname, '../public/idb-migrate.html')]
    .find(f => fs.existsSync(f))
  if (p) list.push({ label: 'file://', url: pathToFileURL(p).href })
  // dev 旧源：dev server 根下 public/idb-migrate.html
  if (devServerUrl) list.push({ label: devServerUrl, url: devServerUrl.replace(/\/$/, '') + '/idb-migrate.html' })
  return list
}

async function migrateLegacy() {
  try {
    if (fs.existsSync(migrateFlagFile())) return
    const sources = legacySources()
    let total = 0
    let writeFailed = false
    for (const src of sources) {
      const result = await runMigrate(src.url)
      const counts = result.counts
      if (result.copied > 0) {
        console.log(`[app-protocol] IndexedDB 已从 ${src.label} 迁移 ${result.copied} 条 → app://od`)
        total += result.copied
      } else if (counts > 0) {
        writeFailed = true
        console.warn(`[app-protocol] ${src.label} 有 ${counts} 条数据但写入失败，下次启动将重试`)
      }
    }
    // 有数据但写入失败：不写哨兵，下次启动重试（无数据/全部成功才落哨兵）
    if (writeFailed) return
    fs.writeFileSync(migrateFlagFile(), new Date().toISOString())
    if (total > 0) console.log(`[app-protocol] 迁移完成，共 ${total} 条`)
  } catch (e) {
    console.warn('[app-protocol] 历史数据迁移失败（跳过，不影响启动）:', e && e.message)
  }
}

// 单源迁移：旧源窗口读（页面挂 window.__odMigrateResult）→ app://od 窗口写
async function runMigrate(pageUrl) {
  // 1) 读侧：旧源迁移页
  const readWin = await openHidden(pageUrl)
  if (!readWin) return { copied: 0, counts: 0 }
  const data = await waitResult(readWin)
  closeWin(readWin)
  const counts = data && data.stores
    ? Object.keys(data.stores).reduce((s, k) => s + data.stores[k].length, 0)
    : 0
  if (!counts) return { copied: 0, counts: 0 }

  // 2) 写侧：app://od 源上的 idb-write.html。读侧已把 Blob/Date/Buffer 转
  //    JSON 安全约定格式，数据可安全 JSON.stringify 注入（Blob 走 base64 过桥）
  const writeWin = await openHidden(appUrl('idb-write.html'))
  if (!writeWin) return { copied: 0, counts }
  const written = await writeWin.webContents.executeJavaScript(
    `window.__odWriteAll && window.__odWriteAll(${JSON.stringify(data)})`, true
  ).catch(() => -1)
  closeWin(writeWin)
  // __odWriteAll 返回成功条数；-1/0 表示失败
  return { copied: written > 0 ? written : 0, counts }
}

// 隐藏窗口辅助（默认 session——与主窗口同存储分区，迁移落库直接可见）
function openHidden(url) {
  return new Promise((resolve) => {
    const win = new BrowserWindow({
      show: false, skipTaskbar: true, width: 300, height: 200,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    win.loadURL(url).then(() => resolve(win)).catch(() => { win.destroy(); resolve(null) })
  })
}

// 等迁移页读结果（页面读完后把数据挂 window.__odMigrateResult；
// 截图 Blob 转 base64 可能数秒，轮询上限 15s）
function waitResult(win) {
  return new Promise((resolve) => {
    let ticks = 0
    const t = setInterval(async () => {
      if (win.isDestroyed() || ticks++ > 150) {
        clearInterval(t); return resolve(null)
      }
      try {
        const r = await win.webContents.executeJavaScript('window.__odMigrateResult || null', true)
        if (r) { clearInterval(t); resolve(r) }
      } catch (e) { /* 导航间隙忽略 */ }
    }, 100)
  })
}

function closeWin(win) {
  try { if (win && !win.isDestroyed()) win.destroy() } catch (e) { /* 忽略 */ }
}

// main.js 调用：注册协议 handler（须在 app ready 后；scheme 注册已在模块加载期完成）
// opts.devUrl 存在即 dev 模式；opts.distRoot 生产产物根（默认 dist/）
function init(opts = {}) {
  devServerUrl = opts.devUrl || ''
  distRoot = opts.distRoot || path.join(__dirname, '../dist')
  protocol.handle(SCHEME, handleRequest)
}

// 统一入口 URL：dev 与生产均为 app://od/（窗口加载后源一致）
function appUrl(hash) {
  return `app://${HOST}/${hash || ''}`
}

module.exports = { init, appUrl, migrateLegacy }
