// OmniBuddy 站点登录态登记（登录闭环状态表）
// 数据源：agent 上报工具 report_site_auth（无头会话撞登录墙 / 登录成功时调用）
//         + 登录向导（login-wizard.js）系统检测成功后写入
// 存储：<baseDir>/site-auth.json：{ sites: { host: { status, lastSeen, note } } }
//   status: 'login_required'（撞登录墙）| 'logged_in'（登录成功）
// 登录态本体在 playwright profile（<agentDir>/playwright-profile，向导有头窗口
// 与 MCP 无头浏览器共用），不再导出 storageState 文件（跨环境迁移曾是强风控
// 站点会话吊销的根因）；本表只记状态供前端展示 / 通知 / 引导
// 消费方：login.required 通知（状态翻转为 login_required 时投递）；连接器页
const path = require('path')
const fs = require('fs')

// ===== 内部状态与读写 =====
let baseDir = ''
let stateFile = ''

function init(dir) {
  baseDir = dir
  stateFile = path.join(dir, 'site-auth.json')
}

// url → host（归一化登记键；解析失败时截掉协议与路径兜底）
function hostOf(url) {
  const s = String(url || '')
  try {
    return new URL(s).hostname || s
  } catch (e) {
    return s.replace(/^https?:\/\//, '').split(/[/?#]/)[0] || s
  }
}

function readAll() {
  try {
    const data = JSON.parse(fs.readFileSync(stateFile, 'utf-8'))
    return (data && typeof data.sites === 'object') ? data.sites : {}
  } catch (e) {
    return {}
  }
}

function writeAll(sites) {
  fs.mkdirSync(baseDir, { recursive: true })
  fs.writeFileSync(stateFile, JSON.stringify({ sites }, null, 2))
}

// ===== 对外接口 =====
// 上报：返回 { host, prev, changed }——changed表示状态翻转（通知层据此
// 决定是否投递 login.required；同状态重复上报只刷新 lastSeen）
function report(url, status, note) {
  const host = hostOf(url)
  if (!host) return { host: '', prev: '', changed: false }
  const st = status === 'logged_in' ? 'logged_in' : 'login_required'
  const sites = readAll()
  const prev = (sites[host] || {}).status || ''
  sites[host] = {
    status: st,
    lastSeen: Date.now(),
    note: String(note || '').slice(0, 200)
  }
  writeAll(sites)
  return { host, prev, changed: prev !== st }
}

function list() {
  const sites = readAll()
  return Object.keys(sites).map(host => Object.assign({ host }, sites[host]))
}

module.exports = {
  // 初始化存储目录
  init,
  // 上报站点登录态（返回状态是否翻转）
  report,
  // 登记表列表
  list,
  // url → host 归一化
  hostOf
}
