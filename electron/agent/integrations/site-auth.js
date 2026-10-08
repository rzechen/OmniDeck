// OmniBuddy 站点登录态登记（登录闭环：无头探测 → 登录向导首登 → storageState 复用）
// 数据源：agent 上报工具 report_site_auth（无头会话撞登录墙 / 登录成功时调用）
//         + 登录向导（login-wizard.js）系统检测成功后写入
// 存储：<baseDir>/site-auth.json：{ sites: { host: { status, lastSeen, note } } }
//   status: 'login_required'（撞登录墙）| 'logged_in'（登录成功）
//   <baseDir>/site-auth/<host>.json：Playwright storageState（cookies + localStorage，
//   登录向导导出，agent 侧经 browser_set_storage_state 恢复，实现首登一次后续免登录）
// 消费方：login.required 通知（状态翻转为 login_required 时投递，通知点击
//   打开登录向导）；系统提示词（已存登录态站点清单与恢复引导）
const path = require('path')
const fs = require('fs')

// ===== 内部状态与读写 =====
let baseDir = ''
let stateFile = ''
let stateDir = ''

function init(dir) {
  baseDir = dir
  stateFile = path.join(dir, 'site-auth.json')
  stateDir = path.join(dir, 'site-auth')
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
// 上报：返回 { host, prev, changed }——changed 表示状态翻转（通知层据此
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

// ===== storageState（per-site 登录态文件） =====
// 文件名 = host（hostOf 归一化后的域名，不含路径分隔符，直接作文件名安全）
function storageStatePath(host) {
  return path.join(stateDir, host + '.json')
}

// 登录向导成功后保存（Playwright storageState 格式）；含明文 cookie，收紧权限
function saveStorageState(host, state) {
  try {
    fs.mkdirSync(stateDir, { recursive: true })
    fs.writeFileSync(storageStatePath(host), JSON.stringify(state, null, 2))
    try { fs.chmodSync(storageStatePath(host), 0o600) } catch (e) { /* chmod 失败不影响功能 */ }
    return true
  } catch (e) {
    console.warn('[omnibuddy:site-auth] storageState 写入失败：', e.message)
    return false
  }
}

function hasStorageState(host) {
  try {
    return fs.existsSync(storageStatePath(host))
  } catch (e) {
    return false
  }
}

// 已存登录态的站点清单（系统提示词注入 / 连接器页展示用）：
// [{ host, path }]——path 为 storageState 绝对路径，供 browser_set_storage_state 恢复
function savedSites() {
  return list()
    .filter(s => s.host && hasStorageState(s.host))
    .map(s => ({ host: s.host, path: storageStatePath(s.host) }))
}

module.exports = {
  // 初始化存储目录
  init,
  // 上报站点登录态（返回状态是否翻转）
  report,
  // 登记表列表
  list,
  // url → host 归一化
  hostOf,
  // storageState：保存 / 路径 / 是否存在 / 已存站点清单
  saveStorageState,
  storageStatePath,
  hasStorageState,
  savedSites
}
