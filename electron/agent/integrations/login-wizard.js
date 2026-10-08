// OmniBuddy 登录向导：专用小窗首登（替代「全局切有头」方案）
// 设计（登录与任务解耦，人只参与"登录"这一瞬态动作）：
//   - 主进程自建独立 BrowserWindow（不归 playwright / pi 会话所有），
//     只加载目标站点；用持久 partition（persist:login-wizard），
//     不碰 playwright 的 user-data-dir（profile 同时仅允许一个浏览器占用）
//   - 登录检测系统化（不依赖 LLM 上报）：
//     主路径 = session.cookies 'changed' 事件监听目标 domain 的 cookie
//     变化，稳定 1.6s 且含鉴权特征 cookie → 判定成功；
//     辅路径 = 页面注入「我已登录，完成」按钮（复用 / 误报场景一键收尾）
//   - 成功 → 导出 storageState（cookies + localStorage）落
//     <baseDir>/site-auth/<host>.json → 登记表置 logged_in → 回调收尾 →
//     自动关窗；agent 侧后续经 browser_set_storage_state 恢复（prompt 引导）
//   - 关窗 / 超时（10min）= 取消，状态停留 login_required，无卡死态
const { BrowserWindow } = require('electron')
const siteAuth = require('./site-auth')

// 向导专用持久 partition：与应用内浏览器 / playwright profile 均隔离，
// 上次向导登录过的站点再次打开直接是已登录态
const PARTITION = 'persist:login-wizard'
// cookie 变化后的稳定窗口：期间再有变化则重置（登录流程通常分多步写 cookie）
const COOKIE_SETTLE_MS = 1600
// 无任何登录动作的超时：超时关窗（等同取消），防"挂着没人管"
const WIZARD_TIMEOUT_MS = 10 * 60 * 1000
// 鉴权特征 cookie 名（命中其一即视为登录后 cookie）
const AUTH_COOKIE_RE = /(sess|token|auth|sid|uid|passport|login|jwt|sso|ticket|credential|remember)/i

let win = null
// 当前向导目标（open 时设置）
let current = null // { host, url }
let finished = false
let settleTimer = null
let timeoutTimer = null
// 首次加载后的目标 domain cookie 指纹（判定"变化"的基准）。
// 三态：null = 未就绪（采样前）；'' = 就绪但无 cookie（首登常态，合法基准）；
// 非空串 = 就绪且有 cookie。绝不能以 truthy 判就绪——首登场景基准为空串，
// 若误判未就绪会拦掉全部 cookie 变化（settle 主路径失效）
let baseline = null
let loadCount = 0
// 收尾回调（agent/index.js 注入：广播前端 / 复位遗留 headed 开关等）
let hooks = { onSuccess: () => {}, onCancel: () => {} }

function init(opts) {
  hooks = {
    onSuccess: (opts && opts.onSuccess) || (() => {}),
    onCancel: (opts && opts.onCancel) || (() => {})
  }
}

// cookie.domain（可能带前导点，如 ".gitcode.com"）与目标 host 匹配
function matchDomain(cookieDomain, host) {
  const cd = String(cookieDomain || '').replace(/^\./, '')
  if (!cd) return false
  return host === cd || host.endsWith('.' + cd)
}

// 目标 domain cookie 指纹（name=value 排序串联；值变化即指纹变化）。
// 返回 null = 读取失败（区别于 '' = 无 cookie）
async function fingerprint(wc, host) {
  try {
    const cookies = await wc.session.cookies.get({})
    return cookies
      .filter(c => matchDomain(c.domain, host))
      .map(c => c.name + '=' + c.value)
      .sort()
      .join(';')
  } catch (e) {
    return null
  }
}

function hasAuthCookie(fp) {
  if (!fp) return false
  return fp.split(';').some(kv => AUTH_COOKIE_RE.test(kv.split('=')[0] || ''))
}

// Electron cookie → Playwright storageState cookie 字段
function toPlaywrightCookie(c) {
  const out = {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path || '/',
    secure: !!c.secure,
    httpOnly: !!c.httpOnly
  }
  if (typeof c.expirationDate === 'number' && c.expirationDate > 0) {
    out.expires = Math.floor(c.expirationDate)
  }
  // sameSite 取值映射（unspecified 省略，恢复时按浏览器默认）
  if (c.sameSite === 'no_restriction') out.sameSite = 'None'
  else if (c.sameSite === 'lax') out.sameSite = 'Lax'
  else if (c.sameSite === 'strict') out.sameSite = 'Strict'
  return out
}

// 导出目标站点的 storageState（Playwright 格式：cookies + origins.localStorage）
async function exportState(wc, host) {
  const state = { cookies: [], origins: [] }
  try {
    const all = await wc.session.cookies.get({})
    state.cookies = all.filter(c => matchDomain(c.domain, host)).map(toPlaywrightCookie)
  } catch (e) { /* cookie 导出失败不阻断（localStorage 独立尝试） */ }
  try {
    const raw = await wc.executeJavaScript(
      'JSON.stringify(Object.entries(window.localStorage || {}))', true)
    const entries = JSON.parse(raw || '[]')
    if (entries.length) {
      state.origins.push({
        origin: new URL(wc.getURL()).origin,
        localStorage: entries.map(([name, value]) => ({ name, value }))
      })
    }
  } catch (e) { /* localStorage 不可用（如 about: 页）时省略 */ }
  return state
}

// 判定成功后的统一收尾：落 storageState → 登记 logged_in → 回调 → 延迟关窗
async function finish() {
  if (!win || finished) return
  finished = true
  clearTimers()
  const { host } = current
  try {
    const state = await exportState(win.webContents, host)
    siteAuth.saveStorageState(host, state)
  } catch (e) { /* 导出失败仍按成功收尾（登记表更新优先） */ }
  siteAuth.report('https://' + host + '/', 'logged_in', '登录向导：检测到登录成功')
  hooks.onSuccess(host)
  try { win.setTitle('登录成功 · 正在关闭…') } catch (e) { /* 忽略 */ }
  setTimeout(() => { try { win && !win.isDestroyed() && win.close() } catch (e) { /* 忽略 */ } }, 1200)
}

function clearTimers() {
  if (settleTimer) { clearTimeout(settleTimer); settleTimer = null }
  if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
}

// cookie 变化稳定判定：指纹相对 baseline 发生实质变化 → 启动稳定计时，
// 计满后校验鉴权特征（未达特征则刷新 baseline 继续监听，容忍登录中途态）
async function onCookieChanged(wc, host) {
  const fp = await fingerprint(wc, host)
  // null = 读取失败；与基准相同 = 无实质变化。空串基准（首登无 cookie）合法
  if (fp === null || fp === baseline) return
  if (settleTimer) clearTimeout(settleTimer)
  settleTimer = setTimeout(async () => {
    settleTimer = null
    try {
      const latest = await fingerprint(wc, host)
      if (latest !== null && latest !== baseline) {
        if (hasAuthCookie(latest)) {
          await finish()
        } else {
          // 变化但无鉴权特征（如浏览过程中的偏好 cookie）：更新基准继续等
          baseline = latest
        }
      }
    } catch (e) { /* 忽略 */ }
  }, COOKIE_SETTLE_MS)
}

// 页面注入「我已登录，完成」悬浮按钮：复用 / 误报场景的人工兜底出口。
// 点击置 window 标志位，主进程轮询发现即收尾（不做双向 IPC，保持零 preload）
const INJECT_SNIPPET = `
(function () {
  if (window.__omnibuddyWizardInjected) return;
  window.__omnibuddyWizardInjected = true;
  window.__omnibuddyWizardDone = false;
  var bar = document.createElement('div');
  bar.textContent = 'OmniBuddy 登录向导 · 登录成功后将自动关闭';
  var btn = document.createElement('button');
  btn.textContent = '我已登录，完成';
  function apply(el, s) { for (var k in s) el.style[k] = s[k]; }
  apply(bar, {
    position: 'fixed', left: '0', right: '0', bottom: '0', zIndex: '2147483647',
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '12px',
    padding: '10px 16px', boxSizing: 'border-box',
    background: 'rgba(20, 20, 20, 0.88)', color: '#fff',
    font: '13px/1.4 -apple-system, "PingFang SC", sans-serif',
    backdropFilter: 'blur(4px)'
  });
  apply(btn, {
    background: '#0FDC78', color: '#004D26', border: 'none', borderRadius: '6px',
    padding: '6px 14px', font: 'inherit', fontWeight: '600', cursor: 'pointer'
  });
  btn.addEventListener('click', function () { window.__omnibuddyWizardDone = true; });
  bar.appendChild(btn);
  document.documentElement.appendChild(bar);
})();`

// 手动完成按钮轮询（1s 一次，窗口关闭 / 被替换即停）
function pollManualDone(thisWin) {
  if (finished || win !== thisWin || !win || win.isDestroyed()) return
  try {
    win.webContents.executeJavaScript('window.__omnibuddyWizardDone === true', true)
      .then(done => { if (done) finish() })
      .catch(() => {})
      .finally(() => setTimeout(() => pollManualDone(thisWin), 1000))
  } catch (e) { /* 忽略 */ }
}

// ===== 对外入口 =====
// 打开登录向导：同 host 已开则聚焦；不同 host 替换（关旧开新，单实例）
function open(host, url) {
  const target = 'https://' + host + '/'
  const loadUrl = /^https?:\/\//i.test(String(url || '')) ? url : target
  if (win && !win.isDestroyed()) {
    if (current && current.host === host) {
      win.show(); win.focus()
      return { ok: true, reused: true }
    }
    // 不同站点：关闭旧向导（其 closed 回调按实例判定静默退场）后重开
    win.close()
  }
  finished = false
  baseline = null
  loadCount = 0
  current = { host, url: loadUrl }
  win = new BrowserWindow({
    width: 1040,
    height: 720,
    title: '登录 ' + host + ' · 成功后自动关闭',
    backgroundColor: '#ffffff',
    autoHideMenuBar: true,
    webPreferences: {
      partition: PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  const thisWin = win
  const wc = win.webContents

  wc.on('did-finish-load', async () => {
    // 旧向导实例的迟到事件（替换场景）：忽略
    if (win !== thisWin) return
    loadCount++
    // 采样基准指纹并注入提示条 / 手动完成按钮（每次导航后重注入，
    // SPA 跳转不会重触发；跨页导航的 DOM 重建需要）
    try { await wc.executeJavaScript(INJECT_SNIPPET, true) } catch (e) { /* 注入失败不阻断 */ }
    if (loadCount === 1) {
      // 首次加载：延迟采样基准（等站点自身初始化 cookie 落定），再挂监听
      setTimeout(async () => {
        if (win !== thisWin) return
        baseline = await fingerprint(wc, host)
        pollManualDone(thisWin)
      }, 1200)
    }
  })

  // cookie 变化监听：目标 domain 的写入 / 更新（忽略删除）触发稳定判定。
  // partition 为持久 session（跨向导实例复用）：先清旧监听器防累积，
  // 回调内按实例判定，被替换实例的迟到事件直接忽略
  wc.session.cookies.removeAllListeners('changed')
  wc.session.cookies.on('changed', (_e, cookie, cause) => {
    // baseline === null 才是"未就绪"；空串基准（首登无 cookie）合法放行
    if (finished || win !== thisWin || baseline === null) return
    if (!matchDomain(cookie.domain, host)) return
    if (cause === 'expired' || cause === 'evicted') return
    onCookieChanged(wc, host)
  })

  win.on('closed', () => {
    // 已被后续向导替换（open 关旧开新，closed 异步迟到）：新向导的
    // 定时器与状态归它自己管，本实例静默退场，不触发 onCancel
    if (win !== thisWin) return
    clearTimers()
    const wasCurrent = current
    win = null
    current = null
    if (!finished && wasCurrent) hooks.onCancel(wasCurrent.host)
  })

  timeoutTimer = setTimeout(() => {
    console.log('[omnibuddy:login-wizard] 超时未完成，自动关闭（' + host + '）')
    try { win && !win.isDestroyed() && win.close() } catch (e) { /* 忽略 */ }
  }, WIZARD_TIMEOUT_MS)

  win.loadURL(loadUrl).catch(() => { /* 加载失败留给用户手动导航 / 关窗取消 */ })
  win.show()
  console.log('[omnibuddy:login-wizard] 登录向导已打开：' + host + '（' + loadUrl + '）')
  return { ok: true, reused: false }
}

function isOpen() {
  return !!(win && !win.isDestroyed())
}

function currentHost() {
  return isOpen() && current ? current.host : ''
}

module.exports = { init, open, isOpen, currentHost }
