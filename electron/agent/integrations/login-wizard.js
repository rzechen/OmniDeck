// OmniBuddy 登录向导（子进程薄壳）：窗口实体在主进程（utilityProcess 无法
// new BrowserWindow，曾致 "BrowserWindow is not a constructor"），完整实现
// 见 electron/login-wizard.js（agent-bridge 以 HOST 服务 loginWizard.open /
// loginWizard.state 暴露）。本壳只做：
//   - open：经 agent-shim __host.call 转发主进程开窗（返回 { ok, reused }）
//   - isOpen / currentHost：消费主进程 login-wizard-state 事件回掷的影子状态
//     （siteauth:list 的 wizardOpen 标记用；成功 / 取消 / 打开的广播由主进程直发）
//   - waitForResult：挂起等待该站点的登录结果（login-wizard-result 回掷；
//     report_site_auth 上报 login_required 后工具内联等待用户完成登录用）
const { __host } = require('electron')

// 影子状态：主进程向导开关时回掷（'' = 未开）
let shadowHost = ''

try {
  __host.on('login-wizard-state', (p) => { shadowHost = (p && p.host) || '' })
} catch (e) { /* shim 未接线时忽略（正常不会发生） */ }

// 结果等待表：{ host, resolve, timer }——主进程 success / cancel 回掷时解除
const waiters = new Set()

try {
  __host.on('login-wizard-result', (p) => {
    const host = p && p.host
    const outcome = p && p.outcome
    if (!host || !outcome) return
    for (const w of Array.from(waiters)) {
      if (w.host !== host) continue
      waiters.delete(w)
      clearTimeout(w.timer)
      w.resolve(outcome)
    }
  })
} catch (e) { /* shim 未接线时忽略（正常不会发生） */ }

function open(host, url) {
  return __host.call('loginWizard.open', [host, url])
    .catch(err => ({ ok: false, error: (err && err.message) || String(err) }))
}

// 等待登录结果：resolve 'success' | 'cancel' | 'timeout'。
// 默认 11 分钟兜底（向导自身 10 分钟超时关窗会先发 cancel；兜底防事件
// 丢失导致工具永久挂起——"一直等待用户操作"由向导生命周期界定）
function waitForResult(host, timeoutMs) {
  return new Promise(resolve => {
    const w = { host: host, resolve: resolve, timer: null }
    w.timer = setTimeout(() => {
      waiters.delete(w)
      resolve('timeout')
    }, timeoutMs || 11 * 60 * 1000)
    waiters.add(w)
  })
}

// 立即解除指定 host 的等待（resolve 给定 outcome）：
// 开窗失败等异常路径消费（waitForResult 已挂起但向导不会发结果）
function _resolveWaiter(host, outcome) {
  for (const w of Array.from(waiters)) {
    if (w.host !== host) continue
    waiters.delete(w)
    clearTimeout(w.timer)
    w.resolve(outcome)
  }
}

function isOpen() {
  return !!shadowHost
}

function currentHost() {
  return shadowHost
}

module.exports = { open, waitForResult, _resolveWaiter, isOpen, currentHost }
