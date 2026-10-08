// OmniBuddy 登录向导（主进程侧）：playwright 有头窗口首登（与 MCP 同一 profile）
// 演进：Electron BrowserWindow 向导 + storageState 迁移方案已退役——向导
// （Electron 环境）与任务浏览器（playwright 无头）环境指纹不同，强风控站点
// （字节系等）判定 cookie 被盗用直接吊销会话。本方案登录闭环整体落在
// playwright 侧：
//   - 登录窗 = 完整 chromium 有头实例 + 同一 user-data-dir（agentDir/
//     playwright-profile，与 @playwright/mcp 完全一致），登录态写入 profile，
//     后续无头任务直接免登录（零迁移零吊销诱因）
//   - 撞墙时 MCP 无头浏览器占用 profile（Chromium 单实例锁），开窗前先按
//     profile 路径杀占用进程；MCP server 存活，agent 下次 browser_* 调用时
//     自动重新拉起无头浏览器（此时 profile 已带登录态）
//   - 登录检测系统化（平移自 Electron 向导版）：cookie 指纹轮询 + 稳定窗口
//     + 鉴权特征（匿名 / 风控 cookie 名单排除）+ 观察期吸收站点初始化；
//     辅路径 = 页面注入底部状态条（关闭倒计时 + 「我已登录，完成」按钮）
//   - 成功 → 登记表 logged_in → 广播前端（login_wizard success + site_auth
//     logged_in）→ 真实 UA 回填（browser-ua.json，mcp.json 刷新后无头侧
//     --user-agent 对齐，消除 HeadlessChrome 标识）→ 自动关窗
//   - 关窗 / 超时（10min）= 取消，状态停留 login_required，无卡死态
//   - 开关状态 / 登录结果经 host-event 回掷子进程薄壳（agent/integrations/
//     login-wizard.js），report_site_auth 工具挂起等待消费
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { chromium } = require('playwright-core')
const runtime = require('./agent/platform/runtime')
const siteAuth = require('./agent/integrations/site-auth')

// cookie 指纹轮询间隔（playwright BrowserContext 无 cookie 变化事件，轮询等价）
const POLL_MS = 1200
// cookie 变化后的稳定窗口：期间指纹再变则重新计时（登录通常分多步写 cookie）
const COOKIE_SETTLE_MS = 1600
// 首次加载后的初始化观察期：期间 cookie 变化只刷基准不参与判定。
// 站点风控 / 实验分流 / 匿名 passport 组件常分多波写 cookie（如字节系
// sid_tt / __ac_* 晚于 onLoad 落地），窗口太短会把站点初始化误判为
// 登录（曾致向导弹出数秒即误报成功自动关窗），故放宽到 5s
const BASELINE_DELAY_MS = 5000
// 无任何登录动作的超时：超时关窗（等同取消），防"挂着没人管"
const WIZARD_TIMEOUT_MS = 10 * 60 * 1000
// 鉴权特征 cookie 名（命中其一即视为登录后 cookie）
const AUTH_COOKIE_RE = /(sess|token|auth|sid|uid|passport|login|jwt|sso|ticket|credential|remember)/i
// 匿名 / 风控 cookie 名单（未登录也会种，命中鉴权正则也不作为登录证据）：
// 字节系（豆包 / 抖音 / TikTok）未登录即种 sid_tt / uid_tt / passport_csrf_token /
// bd_ticket_guard / ttwid / __ac_* / msToken 等，曾致豆包向导误判成功
const ANONYMOUS_COOKIE_RE = /^(?:__ac_.+|msToken|ttwid|tt_csrf_token|tt_webid|s_v_web_id|sid_tt(?:_ss)?|sid_guard|uid_tt(?:_ss)?|passport_csrf_token|passport_auth_status|passport_assist_user|bd_ticket_guard.*|n_s|bd_ticket_crypt_cookie)$/i

let ctx = null          // BrowserContext（登录窗）
let current = null      // { host, url }
let finished = false
let openedAt = 0        // 本次向导开启时刻（进度线分母，open 时刷新）
let deadlineAt = 0      // 自动关闭时刻（状态条倒计时 / 进度线目标，绝对时间戳）
let baseline = null     // 目标 domain cookie 指纹基准（三态语义同旧版）
let baselineReadyAt = 0 // 观察期截止时刻
let lastFp = ''         // 上一轮指纹（settle 重置判据）
let firstDiffAt = 0     // 首次偏离基准时刻
let pollTimer = null
let timeoutTimer = null
// 宿主接线（agent-bridge 注入）：
//   broadcast(payload)：omnibuddy:event 广播全窗口
//   postHostEvent(name, payload)：login-wizard-state / login-wizard-result 回掷子进程
let bridge = { broadcast: () => {}, postHostEvent: () => {} }
let profileDir = ''     // 与 @playwright/mcp 共用的 user-data-dir
let agentDir = ''

function init(baseDir, hostApi) {
  agentDir = path.join(baseDir, 'pi-agent')
  profileDir = path.join(agentDir, 'playwright-profile')
  siteAuth.init(baseDir)
  bridge = Object.assign({ broadcast: () => {}, postHostEvent: () => {} }, hostApi || {})
}

// cookie.domain（可能带前导点，如 ".gitcode.com"）与目标 host 匹配
function matchDomain(cookieDomain, host) {
  const cd = String(cookieDomain || '').replace(/^\./, '')
  if (!cd) return false
  return host === cd || host.endsWith('.' + cd)
}

// 登录证据判定：cookie 名命中鉴权特征且不在匿名 / 风控名单
function isAuthCookieName(name) {
  const n = String(name || '').trim()
  if (!n) return false
  if (ANONYMOUS_COOKIE_RE.test(n)) return false
  return AUTH_COOKIE_RE.test(n)
}

function hasAuthCookie(fp) {
  if (!fp) return false
  return fp.split(';').some(kv => isAuthCookieName(kv.split('=')[0]))
}

// 目标 domain cookie 指纹（name=value 排序串联）。null = 读取失败
async function fingerprint(host) {
  try {
    const cookies = await ctx.cookies()
    return cookies
      .filter(c => matchDomain(c.domain, host))
      .map(c => c.name + '=' + c.value)
      .sort()
      .join(';')
  } catch (e) {
    return null
  }
}

// 页面注入登录向导状态条（幂等：同页由标志位拦截，跨页导航后随新文档重建）：
//   - 底部贴边全宽毛玻璃条：position:fixed + left:0 + width:100% + bottom:0，
//     浏览器窗口缩放（Cmd+±）或改变尺寸时始终贴满可视区，宽度与窗口一致
//   - 自动关闭倒计时（mm:ss 胶囊）+ 顶部剩余时长进度线：目标时刻由宿主以
//     绝对时间戳下发（openedAt / deadlineAt），导航 / 刷新不重置；临近超时
//     （≤60s）倒计时 / 状态灯 / 进度线转琥珀色
//   - 「我已登录，完成」人工兜底按钮：点击置 window 标志位，轮询发现即收尾
// 样式全走内联且动画由 JS 驱动（不注入 <style>）：规避站点 style-src CSP
// 拦截 keyframes 的可能
function injectSnippet() {
  return `(function () {
  if (window.__omnibuddyWizardInjected) return;
  window.__omnibuddyWizardInjected = true;
  window.__omnibuddyWizardDone = false;
  var OPENED = ${openedAt};
  var DEADLINE = ${deadlineAt};
  function apply(el, s) { for (var k in s) el.style[k] = s[k]; }
  var bar = document.createElement('div');
  apply(bar, {
    position: 'fixed', left: '0', width: '100%', bottom: '0', zIndex: '2147483647',
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    flexWrap: 'wrap', gap: '12px', padding: '12px 20px', boxSizing: 'border-box',
    background: 'rgba(22, 22, 26, 0.82)',
    backdropFilter: 'blur(18px) saturate(160%)',
    WebkitBackdropFilter: 'blur(18px) saturate(160%)',
    color: '#f5f5f7',
    boxShadow: '0 -1px 0 rgba(255, 255, 255, 0.06), 0 -10px 28px rgba(0, 0, 0, 0.30)',
    font: '13px/1.4 -apple-system, "PingFang SC", "Helvetica Neue", sans-serif',
    opacity: '0', transition: 'opacity .3s ease'
  });
  var progress = document.createElement('div');
  apply(progress, {
    position: 'absolute', top: '0', left: '0', height: '2px', width: '100%',
    background: 'linear-gradient(90deg, #0fdc78, #34c759)',
    transition: 'width .5s linear, background .3s ease'
  });
  var left = document.createElement('div');
  apply(left, { display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600' });
  var dot = document.createElement('span');
  apply(dot, {
    width: '8px', height: '8px', borderRadius: '50%', background: '#30d158',
    boxShadow: '0 0 6px rgba(48, 209, 88, 0.9)',
    transition: 'opacity .4s ease, background .3s ease'
  });
  left.appendChild(dot);
  left.appendChild(document.createTextNode('OmniBuddy 登录向导'));
  var mid = document.createElement('div');
  apply(mid, { display: 'flex', alignItems: 'center', gap: '8px', opacity: '0.92' });
  var cd = document.createElement('span');
  apply(cd, {
    fontVariantNumeric: 'tabular-nums', fontWeight: '600',
    background: 'rgba(255, 255, 255, 0.12)',
    padding: '2px 10px', borderRadius: '999px', transition: 'color .3s ease'
  });
  mid.appendChild(cd);
  mid.appendChild(document.createTextNode('后未完成登录将自动关闭'));
  var btn = document.createElement('button');
  btn.textContent = '我已登录，完成';
  apply(btn, {
    background: 'linear-gradient(180deg, #35c76a, #27ae5c)', color: '#033016',
    border: 'none', borderRadius: '999px', padding: '7px 16px',
    font: 'inherit', fontWeight: '600', cursor: 'pointer',
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.28)',
    transition: 'filter .15s ease, transform .1s ease'
  });
  btn.addEventListener('mouseenter', function () { btn.style.filter = 'brightness(1.1)'; });
  btn.addEventListener('mouseleave', function () { btn.style.filter = 'none'; });
  btn.addEventListener('click', function () { window.__omnibuddyWizardDone = true; });
  bar.appendChild(progress);
  bar.appendChild(left);
  bar.appendChild(mid);
  bar.appendChild(btn);
  (document.body || document.documentElement).appendChild(bar);
  requestAnimationFrame(function () { bar.style.opacity = '1'; });
  var dim = false;
  function tick() {
    var now = Date.now();
    var sec = Math.max(0, Math.ceil((DEADLINE - now) / 1000));
    cd.textContent = Math.floor(sec / 60) + ':' + ('0' + (sec % 60)).slice(-2);
    progress.style.width = Math.max(0, Math.min(100,
      (DEADLINE - now) / (DEADLINE - OPENED) * 100)) + '%';
    if (sec <= 60) {
      cd.style.color = '#ffd60a';
      dot.style.background = '#ffd60a';
      progress.style.background = 'linear-gradient(90deg, #ffd60a, #ff9f0a)';
    }
    dim = !dim;
    dot.style.opacity = dim ? '0.45' : '1';
  }
  tick();
  setInterval(tick, 500);
})();`
}

function clearTimers() {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null }
  if (timeoutTimer) { clearTimeout(timeoutTimer); timeoutTimer = null }
}

// 向子进程薄壳回掷当前开关状态（currentHost / isOpen 的数据源）
function pushState() {
  bridge.postHostEvent('login-wizard-state', { host: currentHost() })
}

// 向子进程薄壳回掷登录结果（success / cancel）：
// report_site_auth 工具挂起等待的解除信号（loginWizard.waitForResult 消费）
function pushResult(outcome, host) {
  bridge.postHostEvent('login-wizard-result', { host, outcome })
}

// 真实 UA 回填：登录窗（完整 chromium 有头）的 UA 写入 browser-ua.json，
// mcp.js 刷新 mcp.json 后无头侧经 --user-agent 对齐（headless-shell 默认
// UA 含 HeadlessChrome 标识，风控可据此识别自动化环境）
async function savePageUa(page) {
  try {
    const ua = await page.evaluate('navigator.userAgent')
    if (ua) {
      fs.mkdirSync(agentDir, { recursive: true })
      fs.writeFileSync(path.join(agentDir, 'browser-ua.json'), JSON.stringify({ ua }))
      bridge.postHostEvent('browser-ua-updated', {})
    }
  } catch (e) { /* UA 读取失败不阻断收尾 */ }
}

// 判定成功后的统一收尾：登记 logged_in → 广播前端 → UA 回填 → 延迟关窗
// （登录态天然在 profile 内，无导出 / 恢复动作）
async function finish() {
  if (!ctx || finished) return
  finished = true
  const siteHost = current ? current.host : ''
  clearTimers()
  siteAuth.report('https://' + siteHost + '/', 'logged_in', '登录向导：检测到登录成功')
  bridge.broadcast({ type: 'login_wizard', host: siteHost, phase: 'success' })
  bridge.broadcast({ type: 'site_auth', host: siteHost, status: 'logged_in' })
  pushResult('success', siteHost)
  const pages = ctx.pages()
  if (pages.length) await savePageUa(pages[0])
  setTimeout(() => { try { ctx && ctx.close() } catch (e) { /* 忽略 */ } }, 1200)
}

// 检测轮询：观察期吸收初始化 → 指纹偏离基准且稳定（settle）→ 鉴权特征判定；
// 人工完成按钮并行轮询。语义与旧 Electron 向导的 changed 事件版等价
function startPolling(page, host) {
  baseline = null
  lastFp = ''
  firstDiffAt = 0
  baselineReadyAt = Date.now() + BASELINE_DELAY_MS
  let inFlight = false
  pollTimer = setInterval(async () => {
    if (finished || !ctx || inFlight) return
    inFlight = true
    try {
      // 注入状态条（幂等；跨页导航的 DOM 重建后自动重注入，倒计时按宿主
      // 下发的绝对时刻续走，导航 / 刷新不重置）
      try { await page.evaluate(injectSnippet()) } catch (e) { /* 页面不可用时跳过 */ }
      try {
        if (await page.evaluate('window.__omnibuddyWizardDone === true')) { finish(); return }
      } catch (e) { /* 忽略 */ }
      const fp = await fingerprint(host)
      if (fp === null) return
      // 基准未建立（观察期内读取一直失败等）或观察期内：全部吸收进基准
      if (baseline === null || Date.now() < baselineReadyAt) { baseline = fp; lastFp = fp; return }
      if (fp === baseline) { firstDiffAt = 0; return }
      // 偏离基准：指纹仍在变（登录多步写 cookie）则重置稳定计时
      if (fp !== lastFp) firstDiffAt = Date.now()
      lastFp = fp
      if (!firstDiffAt) firstDiffAt = Date.now()
      if (Date.now() - firstDiffAt < COOKIE_SETTLE_MS) return
      if (hasAuthCookie(fp)) {
        finish()
      } else {
        // 变化但无鉴权特征（如浏览过程中的偏好 cookie）：更新基准继续等
        baseline = fp
        firstDiffAt = 0
      }
    } finally {
      inFlight = false
    }
  }, POLL_MS)
}

// 杀占用 profile 的浏览器进程（Chromium 单实例锁：MCP 无头浏览器在跑时
// 有头实例起不来）。按 user-data-dir 路径匹配命令行，精准且不误伤；
// MCP server 不受影响，下次 browser_* 调用自动重新拉起浏览器
function killProfileLockers() {
  return new Promise(resolve => {
    if (process.platform === 'win32') {
      try {
        const wmic = spawn('wmic', ['process', 'where', 'CommandLine like "%' + profileDir + '%"', 'get', 'ProcessId'], { stdio: 'ignore' })
        // wmic 输出解析繁琐，Windows 侧以 taskkill /IM 兜底由后续 launch 报错兜住
        wmic.on('error', () => {})
        wmic.on('close', () => resolve())
      } catch (e) { resolve() }
      return
    }
    try {
      const pgrep = spawn('pgrep', ['-f', profileDir], { stdio: ['ignore', 'pipe', 'ignore'] })
      let out = ''
      pgrep.stdout.on('data', d => { out += d })
      pgrep.on('error', () => resolve())
      pgrep.on('close', () => {
        const pids = out.split('\n').map(s => s.trim()).filter(s => /^\d+$/.test(s))
        pids.forEach(pid => {
          try { process.kill(Number(pid), 'SIGTERM') } catch (e) { /* 已退出 */ }
        })
        // 给 Chromium 一点时间落盘释放 SingletonLock
        setTimeout(resolve, pids.length ? 500 : 0)
      })
    } catch (e) { resolve() }
  })
}

// ===== 对外入口 =====
// 打开登录向导（playwright 有头窗口）：同 host 已开则前置；不同 host 替换
async function open(host, url) {
  const loadUrl = /^https?:\/\//i.test(String(url || '')) ? url : 'https://' + host + '/'
  if (ctx) {
    if (current && current.host === host) {
      try {
        const pages = ctx.pages()
        if (pages.length) await pages[0].bringToFront()
      } catch (e) { /* 忽略 */ }
      return { ok: true, reused: true }
    }
    // 不同站点：关旧开新（closed 回调按实例判定静默退场）
    try { await ctx.close() } catch (e) { /* 忽略 */ }
  }
  const executablePath = runtime.chromiumFullBin()
  if (!executablePath) {
    const err = '未找到完整 Chromium 浏览器（登录窗口需要）：请在系统安装 Playwright Chromium（npx playwright install chromium）或装配应用运行时'
    console.warn('[omnibuddy:login-wizard] ' + err)
    return { ok: false, error: err }
  }
  finished = false
  current = { host, url: loadUrl }
  openedAt = Date.now()
  deadlineAt = openedAt + WIZARD_TIMEOUT_MS
  await killProfileLockers()
  try {
    ctx = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      executablePath,
      viewport: { width: 1080, height: 760 },
      ignoreHTTPSErrors: true
    })
  } catch (err) {
    ctx = null
    current = null
    const msg = (err && err.message) || String(err)
    console.error('[omnibuddy:login-wizard] 有头窗口启动失败：', msg)
    return { ok: false, error: '登录窗口启动失败：' + String(msg).split('\n')[0] }
  }
  const thisCtx = ctx
  let page = thisCtx.pages()[0]
  if (!page) page = await thisCtx.newPage()

  thisCtx.on('close', () => {
    // 已被后续向导替换（open 关旧开新，close 异步迟到）：静默退场
    if (ctx !== thisCtx) return
    clearTimers()
    const wasCurrent = current
    ctx = null
    current = null
    pushState()
    if (!finished && wasCurrent) {
      bridge.broadcast({ type: 'login_wizard', host: wasCurrent.host, phase: 'cancel' })
      pushResult('cancel', wasCurrent.host)
    }
  })

  timeoutTimer = setTimeout(() => {
    console.log('[omnibuddy:login-wizard] 超时未完成，自动关闭（' + host + '）')
    try { ctx && ctx === thisCtx && ctx.close() } catch (e) { /* 忽略 */ }
  }, WIZARD_TIMEOUT_MS)

  page.goto(loadUrl, { waitUntil: 'domcontentloaded', timeout: 60000 })
    .catch(() => { /* 加载失败留给用户手动导航 / 关窗取消 */ })
  startPolling(page, host)
  console.log('[omnibuddy:login-wizard] 登录向导已打开：' + host + '（' + loadUrl + '）')
  // 打开态广播（前端工具卡片「登录中…」翻转）+ 子进程薄壳状态同步
  bridge.broadcast({ type: 'login_wizard', host, phase: 'open' })
  pushState()
  return { ok: true, reused: false }
}

function isOpen() {
  try {
    return !!(ctx && ctx.browser() && ctx.browser().connected())
  } catch (e) {
    return false
  }
}

function currentHost() {
  return isOpen() && current ? current.host : ''
}

module.exports = { init, open, isOpen, currentHost }
