// 首启引导装配：启动时检查运行 buddy 所需的全部运行时组件是否就绪。
// 打包不再内置 runtime / lib（云端仓库托管），首次启动由渲染层 /setup 引导页
// 引导在线装配，装配在主进程后台串行执行（页面切走不中断），全部就绪后进入主视图。
const { app, ipcMain, BrowserWindow } = require('electron')
const path = require('path')
const fs = require('fs')
const downloader = require('./runtime-downloader')

// 引导完成时恢复主窗正常形态（可拖拉 + 最大化）——由 main.js 注册注入
let restoreMainWindow = null

// 必需组件（全平台）：Python 环境 + Node 运行时与工具链 + 浏览器内核 + 多媒体与文档转换
const REQUIRED_COMMON = ['python-env', 'node', 'node-tools', 'chrome-headless-shell', 'ffmpeg', 'pandoc']
// Windows 追加 winldd（运行库落地依赖）；mingit 特判：仅 Windows 且系统无可用 git 时必需

function isWin() {
  return process.platform === 'win32'
}

function markerFile() {
  return path.join(app.getPath('userData'), 'omnibuddy', '.setup-complete')
}

// 系统 git 探测（与 deps.js probeGit 同口径；deps 未导出该函数，此处自持一份）
function probeSystemGit() {
  return new Promise((resolve) => {
    try {
      const { execFile } = require('child_process')
      execFile('git', ['--version'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        resolve(!err && /git version/i.test(String(stdout || '')))
      })
    } catch (e) {
      resolve(false)
    }
  })
}

// 检查结果：needed（是否需要进引导页）+ required（必需组件名全集）+ missing（缺失清单）。
// 完成标记存在 → 直接放行（避免每次启动重复全量探测）；
// OMNIDECK_FORCE_SETUP=1 强制重新检查（开发测试开关）。
// skipMarker：无视完成标记全量探测（重试装配 / 启动续装用——marker 存在但
// 组件可能被卸载，或上次装配中断未完成）
async function check(skipMarker = false) {
  if (!skipMarker && fs.existsSync(markerFile()) && !process.env.OMNIDECK_FORCE_SETUP) {
    return { needed: false, required: [], missing: [] }
  }
  // 本地探测（不拉云端 manifest）：进不进引导页只看 marker 就绪态，慢网不拖首屏
  const st = downloader.localStatus()
  const byName = {}
  for (const c of (st.components || [])) byName[c.name] = c

  const required = REQUIRED_COMMON.slice()
  if (isWin()) {
    required.push('winldd')
    const mingit = byName['mingit']
    const gitOk = (await probeSystemGit()) || !!(mingit && (mingit.builtin || mingit.installed))
    if (!gitOk) required.push('mingit')
  }

  // builtin（内置根命中，dev 环境）或 installed（在线装配根 marker）均视为就绪
  const missing = required.filter(n => {
    const c = byName[n]
    return !c || (!c.builtin && !c.installed)
  })
  return { needed: missing.length > 0, required, missing }
}

// 同步版检查：createWindow 时决定窗口尺寸用（引导期设计尺寸不最大化）。
// 与 check() 同口径，唯 Windows mingit 的系统 git 探测为异步无法同步等——
// 保守视为必需（误差仅影响窗口尺寸，不影响守卫的最终判定）
function isSetupNeeded() {
  if (fs.existsSync(markerFile()) && !process.env.OMNIDECK_FORCE_SETUP) return false
  const st = downloader.localStatus()
  const byName = {}
  for (const c of (st.components || [])) byName[c.name] = c
  const required = REQUIRED_COMMON.concat(isWin() ? ['winldd', 'mingit'] : [])
  return required.some(n => {
    const c = byName[n]
    return !c || (!c.builtin && !c.installed)
  })
}

// 引导完成（含离线逃生门「稍后在设置中装配」的跳过）：写入标记放行后续启动
function complete() {
  try {
    fs.mkdirSync(path.dirname(markerFile()), { recursive: true })
    fs.writeFileSync(markerFile(), new Date().toISOString())
  } catch (e) {
    // 标记写入失败不阻断进入主视图（下次启动会重新检查）
  }
  return { ok: true }
}

// ---------- 后台批量装配（主进程驱动，页面切走不中断） ----------

// 装配会话快照：渲染层任一页面（引导页 / 顶部横幅）凭此渲染进度与 ETA
// state: 'installing' | 'done' | 'failed'；items[i].state: pending|installing|ok|error
let session = null // { state, items, startedAt, bytesDone, bytesTotal, etaSec, error }
let etaSpeed = 0 // 滚动平均下载速度（bytes/s，指数平滑）
let etaLastTick = null

function getInstaller() {
  // 循环依赖安全：downloader 不反向 require setup
  return require('./runtime-downloader')
}

// 广播装配快照到所有窗口（引导页 / 两个布局的顶部横幅都监听同一通道）
function broadcast() {
  if (!session) return
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.webContents && !win.webContents.isDestroyed()) {
      try {
        win.webContents.send('omnibuddy:setup:progress', session)
      } catch (e) { /* 窗口销毁竞态忽略 */ }
    }
  }
}

// 主进程控制台装配进度日志（x7：下载字节数随原始 progress 事件滚动输出）
function logProgress(p) {
  const label = (session && session.items.find(i => i.name === p.component)) || {}
  const tag = `[setup] ${label.label || p.component}`
  if (p.phase === 'download') {
    const got = p.total ? `${(p.received / 1024 / 1024).toFixed(1)}/${(p.total / 1024 / 1024).toFixed(1)}MB` : `${(p.received / 1024 / 1024).toFixed(1)}MB`
    console.log(`${tag} 下载 ${got}（${p.percent || 0}%）`)
  } else if (p.phase === 'verify') {
    console.log(`${tag} 校验 sha256…`)
  } else if (p.phase === 'extract') {
    console.log(`${tag} 解压装配…`)
  } else if (p.phase === 'error') {
    console.error(`${tag} 失败：${p.error}`)
  }
}

// ETA 滚动估算：指数平滑速度 + 剩余字节 → 秒；速度样本不足时返回 null
function updateEta() {
  const s = session
  if (!s || s.state !== 'installing') return
  const now = Date.now()
  if (etaLastTick != null && now > etaLastTick) {
    // 瞬时速度 → 指数平滑（α=0.15，约 7 个样本收敛；解压/校验阶段字节不动，速度自然衰减）
    const inst = (s.bytesDone - (s._lastBytes || 0)) * 1000 / (now - etaLastTick)
    if (inst >= 0) etaSpeed = etaSpeed ? etaSpeed * 0.85 + inst * 0.15 : inst
  }
  etaLastTick = now
  s._lastBytes = s.bytesDone
  s.etaSec = etaSpeed > 1024 && s.bytesTotal > s.bytesDone
    ? Math.max(1, Math.round((s.bytesTotal - s.bytesDone) / etaSpeed))
    : null
}

// 后台串行装配缺失组件：不依赖渲染层存续，失败即停（横幅可重试），
// 全部成功后自动写放行标记（下次启动不再进引导页）。
// items 覆盖 required 全集：已就绪组件预标 ok+skipped 进清单（页面呈现完整装配清单，
// 续装场景用户能看到 node 等已装项「秒过」而非从名单消失）
async function startBackgroundInstall(required, missing) {
  if (session && session.state === 'installing') return session
  const names = required && required.length ? required : (missing || [])
  const missSet = new Set(missing || [])
  const st = await getInstaller().status() // 拉 manifest 补 size（失败不阻断，仅无 ETA 字节口径）
  const byName = {}
  for (const c of (st && st.components) || []) byName[c.name] = c
  session = {
    state: 'installing',
    items: names.map(name => {
      const c = byName[name] || {}
      const skipped = !missSet.has(name)
      return {
        name,
        label: c.label || name,
        desc: c.description || '',
        size: c.size || 0,
        state: skipped ? 'ok' : 'pending', // 已就绪：预标完成
        skipped,                            // true = 启动前已装（含 dev 内置）
        error: ''
      }
    }),
    startedAt: Date.now(),
    bytesDone: 0,
    bytesTotal: 0,
    etaSec: null,
    error: ''
  }
  // 已就绪项计入字节口径（全 skipped 时进度即 100%）
  session.bytesDone = session.items.filter(i => i.state === 'ok').reduce((s, i) => s + i.size, 0)
  session.bytesTotal = session.items.reduce((s, i) => s + i.size, 0)
  etaSpeed = 0
  etaLastTick = null
  const skippedNames = session.items.filter(i => i.skipped).map(i => i.name)
  console.log(`[setup] 后台装配启动：${session.items.map(i => i.name).join(' → ')}` +
    (session.bytesTotal ? `（共 ${(session.bytesTotal / 1024 / 1024).toFixed(1)}MB）` : ''))
  skippedNames.forEach(n => console.log(`[setup] ✓ ${n} 已就绪，跳过`))
  broadcast()

  // 进度汇聚：downloader 无 event 上下文时的兜底通道（累计 bytesDone / 驱动 ETA / 日志）
  getInstaller().setProgressSink && getInstaller().setProgressSink(p => {
    if (!session || session.state !== 'installing' || !p || !p.component) return
    const item = session.items.find(i => i.name === p.component)
    if (!item) return
    logProgress(p)
    if (p.phase === 'download') {
      const prev = item._received || 0
      session.bytesDone += Math.max(0, p.received - prev)
      item._received = p.received
      item._phase = 'download'
      updateEta()
      broadcast()
    } else if (p.phase === 'verify' || p.phase === 'extract') {
      item._phase = p.phase
      broadcast()
    } else if (p.phase === 'error') {
      // 错误经 install 结果统一处理（此处仅日志）
    }
  })

  for (const item of session.items) {
    if (item.state === 'ok') continue
    // 双保险复探：启动时缺失、开装前已被（并发安装等）补齐 → 按就绪跳过
    const probe = getInstaller().localStatus().components.find(c => c.name === item.name)
    if (probe && (probe.builtin || probe.installed)) {
      item.state = 'ok'
      item.skipped = true
      session.bytesDone = session.items.filter(i => i.state === 'ok').reduce((s, i) => s + i.size, 0)
      console.log(`[setup] ✓ ${item.label} 已就绪，跳过`)
      broadcast()
      continue
    }
    item.state = 'installing'
    broadcast()
    const res = await getInstaller().installComponent(item.name, null)
    delete item._received
    if (res && res.ok) {
      item.state = 'ok'
      // 字节口径只累计已完成项：进行中项的字节由 sink 的 received 增量驱动
      session.bytesDone = session.items.filter(i => i.state === 'ok').reduce((s, i) => s + i.size, 0)
      console.log(`[setup] ✓ ${item.label} 装配完成`)
    } else {
      item.state = 'error'
      item.error = (res && res.error) || '未知错误'
      session.state = 'failed'
      session.error = item.error
      console.error(`[setup] ✗ ${item.label} 装配失败：${item.error}`)
      broadcast()
      return session
    }
    broadcast()
  }
  session.state = 'done'
  session.etaSec = 0
  console.log(`[setup] ★ 全部组件装配完成（耗时 ${((Date.now() - session.startedAt) / 1000).toFixed(0)}s）`)
  complete()
  broadcast()
  return session
}

// 渲染层主动触发（引导页「开始探索」/ 横幅「重试」）：拉清单后交后台装配器。
// skipMarker=true：完成标记可能在上次装配中断前已写入（或组件被卸载），须全量复探
ipcMain.handle('omnibuddy:setup:start-install', async () => {
  const c = await check(true)
  if (!(c.missing || []).length) {
    // 无缺失：若仍有旧会话残留，对齐为 done
    if (session && session.state === 'installing') {
      session.items.forEach(i => { if (i.state !== 'ok') i.state = 'ok' })
      session.state = 'done'
      session.etaSec = 0
      broadcast()
    }
    return { ok: true, done: true }
  }
  await startBackgroundInstall(c.required, c.missing)
  return { ok: true, done: false }
})
// 当前装配快照（页面刷新 / 首次进入时同步初始态）
ipcMain.handle('omnibuddy:setup:install-snapshot', () => session)

// 启动自动续装：完成标记已写但组件仍有缺失（上次装配中断 / 被卸载）→
// 不再拦截进引导页（放行进主视图），由后台静默续装，顶部横幅展示进度。
// 幂等：无缺失 / 会话已在跑时不动
async function maybeAutoResume() {
  try {
    if (session && session.state === 'installing') return
    const c = await check(true)
    if (!(c.missing || []).length) return
    console.log(`[setup] 检测到未完成装配（${c.missing.join('、')}），后台自动续装`)
    startBackgroundInstall(c.required, c.missing).catch(e => console.error('[setup] 续装失败：', e && e.message))
  } catch (e) { /* 续装探测失败不阻断启动 */ }
}

function registerIpc(getMainWindow) {
  // 引导完成恢复主窗：注入 main.js 的窗口引用与恢复动作（可拖拉 + 最大化）。
  // 最大化延后一拍（setTimeout 0）：避免与渲染层切页首渲染同帧执行整窗重排，造成「先进入」卡顿
  restoreMainWindow = () => {
    const win = getMainWindow && getMainWindow()
    if (win && !win.isDestroyed()) {
      win.setResizable(true)
      setTimeout(() => {
        if (!win.isDestroyed()) win.maximize()
      }, 0)
    }
  }
  ipcMain.handle('omnibuddy:setup:status', () => check())
  ipcMain.handle('omnibuddy:setup:complete', () => {
    const r = complete()
    if (restoreMainWindow) restoreMainWindow()
    return r
  })
}

module.exports = { registerIpc, check, isSetupNeeded, maybeAutoResume }
