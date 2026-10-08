// OmniBuddy 站点登录态登记（两段式自动登录：无头探测 → 有头首登 → 无头复用）
// 数据源：agent 上报工具 report_site_auth（无头会话撞登录墙 / 登录成功时调用）
// 存储：<baseDir>/site-auth.json：{ sites: { host: { status, lastSeen, note } } }
//   status: 'login_required'（撞登录墙）| 'logged_in'（登录成功）
// 消费方：login.required 通知（状态翻转为 login_required 时投递，通知点击
//   自动切有头模式）；后续可扩展为会话前置检查（访问前查询登记表提示）
const path = require('path')
const fs = require('fs')

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

module.exports = { init, report, list, hostOf }
