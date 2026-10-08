// 自动更新（双通道）：GitCode Releases 检测更新，引导下载或 electron-updater 全自动安装
// - 引导通道：GitCode Releases API 检测 + 引导下载（mac 未签名唯一可行形态）
// - 全自动通道：electron-updater generic provider 全自动（win 全自动价值最大）
//   GitCode 不在官方 provider 名单 → 动态 setFeedURL：
//   检查时先调 Releases latest API 拿最新 tag，feed 指向
//   https://gitcode.com/{owner}/{repo}/releases/download/v{tag}/ 前缀
//   （附件经 upload_url API 预签名 PUT 上传，匿名 GET 可达）
// - mac 未签名：quitAndInstall 会被 Gatekeeper 拦截，保持引导下载形态；
//   签名后可放开 ALLOW_FULL_AUTO_ON_MAC
const { app, ipcMain, net, shell } = require('electron')
const { autoUpdater } = require('electron-updater')
const remote = require('../../src/config/remote.cjs')

// 更新源仓库（维护于 src/config/remote.cjs，与 git remote origin 一致）
const LATEST_API = remote.latestReleaseApi('app')

// mac 签名后放开（未签名 quitAndInstall 会被 Gatekeeper 拦，保持引导）
const ALLOW_FULL_AUTO_ON_MAC = false

const log = (...args) => console.log('[updater]', ...args)

// 跳过本次更新的版本（渲染页「下次再说」写入内存态；重启后恢复提示）
let skippedVersion = null
// 最近一次检测结果缓存（version 页进入时先展示，再后台刷新）
let lastResult = null
// 主窗口引用（进度推送）
let getWindow = null
// electron-updater 是否已初始化（拿到 feed tag 后置 true）
let feedReady = false
// 全自动通道下载状态（idle / downloading / ready / error，推送给渲染侧）
let downloadState = { status: 'idle', percent: 0, version: '', error: '' }

// ---------- semver 字符串比对（零依赖）：a > b 返回 1，小于 -1，相等 0 ----------
function compareVersions(a, b) {
  const parse = v => String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split('-')[0] // 忽略预发布后缀（-beta.1 等）
    .split('.')
    .map(n => parseInt(n, 10) || 0)
  const pa = parse(a)
  const pb = parse(b)
  const len = Math.max(pa.length, pb.length)
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0
    const y = pb[i] || 0
    if (x > y) return 1
    if (x < y) return -1
  }
  return 0
}

// ---------- 全自动通道：electron-updater 事件 → 渲染进程推送 ----------
function pushState(extra) {
  downloadState = Object.assign({}, downloadState, extra)
  const win = getWindow && getWindow()
  if (win && !win.isDestroyed()) {
    win.webContents.send('updater:download-state', downloadState)
  }
}

function bindAutoUpdaterEvents() {
  // 检测阶段事件由自研 checkUpdate 覆盖，这里只绑定下载与安装阶段
  autoUpdater.on('error', err => {
    log('error', err && err.message)
    pushState({ status: 'error', error: (err && err.message) || String(err) })
  })
  autoUpdater.on('download-progress', p => {
    pushState({
      status: 'downloading',
      percent: Math.round(p.percent || 0),
      transferred: p.transferred,
      total: p.total,
      bytesPerSecond: p.bytesPerSecond
    })
  })
  autoUpdater.on('update-downloaded', info => {
    log('update-downloaded', info && info.version)
    pushState({ status: 'ready', percent: 100, version: (info && info.version) || '' })
    // 通知渲染侧：下载完成可重启安装（version 页更新按钮态）
    const win = getWindow && getWindow()
    if (win && !win.isDestroyed()) {
      win.webContents.send('updater:available', {
        version: (info && info.version) || (lastResult && lastResult.release && lastResult.release.tag),
        notes: lastResult && lastResult.release ? lastResult.release.notes : '',
        url: lastResult && lastResult.release ? lastResult.release.url : '',
        downloaded: true
      })
    }
  })
}

// ---------- 请求 GitCode Releases latest ----------
function fetchLatestRelease() {
  return new Promise(resolve => {
    const finish = data => {
      clearTimeout(timer)
      resolve(data)
    }
    const req = net.request({ url: LATEST_API, redirect: 'follow' })
    req.setHeader('User-Agent', 'OmniDeck-Updater')
    const timer = setTimeout(() => {
      req.abort()
      finish({ ok: false, error: '请求 GitCode 超时' })
    }, 15000)

    let chunks = []
    req.on('response', res => {
      // 404 / 400+未找到 release：仓库尚无任何 Release（首版发布前的正常态）
      if (res.statusCode === 404) {
        feedReady = false
        req.abort()
        finish({ ok: false, error: '暂无发布版本', noRelease: true })
        return
      }
      if (res.statusCode !== 200) {
        // GitCode 无 Release 时 /latest 返回 400 {"error_message":"未找到 release"}，一并视为正常态
        res.on('data', chunk => chunks.push(chunk))
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf-8')
          if (/未找到\s*release/i.test(text)) {
            finish({ ok: false, error: '暂无发布版本', noRelease: true })
          } else {
            finish({ ok: false, error: `GitCode 返回 ${res.statusCode}` })
          }
        })
        res.on('error', () => finish({ ok: false, error: `GitCode 返回 ${res.statusCode}` }))
        return
      }
      res.on('data', chunk => chunks.push(chunk))
      res.on('end', () => {
        try {
          const rel = JSON.parse(Buffer.concat(chunks).toString('utf-8'))
          finish({
            ok: true,
            release: {
              tag: String(rel.tag_name || '').replace(/^v/i, ''),
              name: rel.name || '',
              // body 即 Release 描述（更新说明，Markdown）
              notes: rel.body || '',
              url: rel.html_url || remote.webUrl('app') + '/releases',
              createdAt: rel.created_at || '',
              assets: (rel.assets || []).map(a => ({
                name: a.name,
                url: a.browser_download_url
              }))
            }
          })
        } catch (e) {
          finish({ ok: false, error: 'Release 数据解析失败' })
        }
      })
      res.on('error', () => finish({ ok: false, error: '网络响应中断' }))
    })
    req.on('error', () => finish({ ok: false, error: '网络请求失败（检查代理/网络）' }))
    req.end()
  })
}

// ---------- 全自动通道：初始化 electron-updater（feed 指向最新 tag 下载前缀） ----------
async function setupFeedFromLatestRelease(fetchRes) {
  if (!fetchRes || !fetchRes.ok || !fetchRes.release || !fetchRes.release.tag) return false
  const tag = fetchRes.release.tag.replace(/^v/i, '')
  const feedUrl = remote.webUrl('app') + `/releases/download/v${tag}/`
  try {
    autoUpdater.setFeedURL({ provider: 'generic', url: feedUrl })
    autoUpdater.autoDownload = false // 下载由用户在 version 页触发
    autoUpdater.autoInstallOnAppQuit = true // 下载完成后退出时自动装
    if (!feedReady) bindAutoUpdaterEvents() // 只绑一次
    feedReady = true
    return true
  } catch (e) {
    log('setFeedURL failed', e && e.message)
    feedReady = false
    return false
  }
}

// ---------- 检查更新（手动/静默共用） ----------
async function checkUpdate({ silent = false } = {}) {
  const fetchRes = await fetchLatestRelease()
  // 全自动通道 feed 初始化（失败自动降级纯引导下载）
  const feedOk = await setupFeedFromLatestRelease(fetchRes)
  if (!fetchRes.ok) {
    // 静默检查失败不打扰用户
    if (silent) return null
    return { ok: false, error: fetchRes.error, noRelease: !!fetchRes.noRelease }
  }
  const current = app.getVersion()
  const remote = fetchRes.release.tag
  const hasUpdate = compareVersions(remote, current) > 0
  // 全自动通道：win（NSIS）价值最大；mac 未签名保持引导
  const canFullAuto = feedOk && (process.platform === 'win32' || ALLOW_FULL_AUTO_ON_MAC)
  const result = {
    ok: true,
    hasUpdate,
    current,
    release: fetchRes.release,
    // 用户点过「下次再说」的版本不再视为待更新（手动检查仍如实展示）
    skipped: !hasUpdate ? false : remote === skippedVersion,
    // 全自动通道可用：有更新且平台允许全自动
    fullAuto: hasUpdate && canFullAuto,
    feedReady: feedOk
  }
  lastResult = result
  return result
}

// ---------- IPC ----------
function registerIpc() {
  // 手动检查（version 页「检查更新」按钮 / 托盘菜单）
  ipcMain.handle('updater:check', () => checkUpdate({ silent: false }))

  // 全自动通道：开始下载（发现新版本后由用户触发）
  ipcMain.handle('updater:download', async () => {
    if (!feedReady) return { ok: false, error: '更新通道未就绪' }
    if (downloadState.status === 'downloading') return { ok: true }
    try {
      pushState({ status: 'downloading', percent: 0, error: '' })
      await autoUpdater.downloadUpdate()
      return { ok: true }
    } catch (e) {
      pushState({ status: 'error', error: e && e.message })
      return { ok: false, error: e && e.message }
    }
  })

  // 全自动通道：重启并安装（下载完成后）
  ipcMain.handle('updater:install', () => {
    if (downloadState.status !== 'ready') return { ok: false, error: '安装包尚未下载完成' }
    setImmediate(() => autoUpdater.quitAndInstall())
    return { ok: true }
  })

  // 查询当前下载状态（version 页进入时恢复进度条）
  ipcMain.handle('updater:download-state', () => downloadState)

  // 最近一次结果缓存（页面进入时秒显，再自行触发刷新）
  ipcMain.handle('updater:last-result', () => lastResult)

  // 「下次再说」：跳过当前新版本，直到更新的版本出现
  ipcMain.handle('updater:skip', (_e, version) => {
    skippedVersion = String(version || '').replace(/^v/i, '')
    return { ok: true }
  })

  // 「前往下载」：系统浏览器打开 Release 页（或直链资产）
  ipcMain.handle('updater:open-download', (_e, assetUrl) => {
    const url = assetUrl || (lastResult && lastResult.release && lastResult.release.url)
    if (!url) return { ok: false }
    shell.openExternal(url)
    return { ok: true }
  })
}

// ---------- 启动静默检查：延迟 30s，发现新版本经 IPC 推送 ----------
function startSilentCheck() {
  setTimeout(async () => {
    const res = await checkUpdate({ silent: true })
    if (res && res.ok && res.hasUpdate && !res.skipped) {
      const win = getWindow && getWindow()
      if (win && !win.isDestroyed()) {
        win.webContents.send('updater:available', {
          version: res.release.tag,
          notes: res.release.notes,
          url: res.release.url,
          fullAuto: res.fullAuto
        })
      }
    }
  }, 30 * 1000)
}

function init(getWindowFn) {
  getWindow = getWindowFn
  autoUpdater.logger = console
  registerIpc()
  startSilentCheck()
}

// 初始化更新模块（记录窗口引用 + 注册 IPC + 启动静默检查）
module.exports = { init }
