// OmniBuddy 通知中心：通知类型 × 投递渠道 × 订阅矩阵
// 触发源（均在 agent 会话体进程内）：定时任务完成/失败（runAutomationTask.finish）、
// 权限审批（handlePiEvent permission_ask）、站点登录态上报（site_auth 事件）
// 渠道适配器：system（系统通知 + dock 角标 + 点击动作）/ webhook（POST JSON）
// —— 应用内广播（automation:done / permission_ask 事件）是功能性事件流，
//    由各触发点照常 emit，不作为通知渠道收编，避免双重投递
// 配置：<baseDir>/notifications.json：{ enabled, channels: { webhook: { url, secret } },
//       matrix: { 类型: ['system','webhook'] } }；secret 不落明文需求，文件 0600
const path = require('path')
const fs = require('fs')
const https = require('https')
const http = require('http')
const { Notification } = require('electron')

// 通知类型注册表（单一事实来源）：新增类型在此登记 + 触发点 dispatch 即接入
// channels 为默认投递渠道（用户可在设置页矩阵中调整）
const TYPES = {
  'task.completed': { label: '定时任务完成', channels: ['system'] },
  'task.failed': { label: '定时任务失败', channels: ['system'] },
  'permission.ask': { label: '权限审批请求', channels: ['system'] },
  'login.required': { label: '站点需要登录', channels: ['system'] },
  'test': { label: '测试通知', channels: ['system', 'webhook'] }
}

// 同键去重冷却窗口（毫秒）：permission.ask 按 askId、login.required 按 host 去重，
// 窗口内重复上报不重复打扰（task 类型天然单次，无需 dedupeKey）
const COOLDOWN_MS = 10 * 60 * 1000

let baseDir = ''
let cfgFile = ''
const recentKeys = new Map() // dedupeKey -> 上次投递时间戳

function defaultConfig() {
  const matrix = {}
  Object.keys(TYPES).forEach(t => { matrix[t] = TYPES[t].channels.slice() })
  return {
    enabled: true,
    channels: { webhook: { url: '', secret: '' } },
    matrix
  }
}

function readConfig() {
  try {
    const cfg = JSON.parse(fs.readFileSync(cfgFile, 'utf-8'))
    if (!cfg || typeof cfg !== 'object') return defaultConfig()
    // 结构校正：缺字段补默认（升级兼容），matrix 未登记的类型回落注册表默认
    const def = defaultConfig()
    cfg.enabled = cfg.enabled !== false
    cfg.channels = Object.assign(def.channels, cfg.channels || {})
    cfg.matrix = cfg.matrix || {}
    Object.keys(TYPES).forEach(t => {
      if (!Array.isArray(cfg.matrix[t])) cfg.matrix[t] = TYPES[t].channels.slice()
    })
    return cfg
  } catch (e) {
    return defaultConfig()
  }
}

function writeConfig(cfg) {
  fs.mkdirSync(baseDir, { recursive: true })
  fs.writeFileSync(cfgFile, JSON.stringify(cfg, null, 2))
  try { fs.chmodSync(cfgFile, 0o600) } catch (e) { /* chmod 失败不影响功能 */ }
}

function init(dir) {
  baseDir = dir
  cfgFile = path.join(dir, 'notifications.json')
  recentKeys.clear()
}

// ===== 渠道适配器 =====

// system：系统通知（含点击动作）。dock 角标不在此处——触发点对聚焦状态
// 有各自的判定（如定时任务仅窗口未聚焦时点亮），由触发点自理
// 点击动作由触发点以 click 闭包注入（nav 跳转 / 切有头开关等），
// 模块自身不感知具体动作语义
function sendSystem(type, opts, cfg) {
  // 任务级开关：定时任务的 notify=false 走 opts.silentSystem，跳过系统通知
  if (opts.silentSystem) return
  try {
    if (!Notification.isSupported()) return
    const n = new Notification({
      title: opts.title || TYPES[type].label,
      body: opts.body || ''
    })
    if (opts.click) {
      n.on('click', () => { try { opts.click() } catch (e) { /* 动作失败忽略 */ } })
    }
    n.show()
  } catch (e) { /* 通知失败不影响主流程 */ }
}

// webhook：POST JSON { type, title, body, ok, ts }，secret 以
// X-Notify-Secret 头附带（部分平台用头校验来源）；10s 超时，失败仅告警
function sendWebhook(type, opts, cfg) {
  const url = String((cfg.channels.webhook || {}).url || '').trim()
  if (!url) return Promise.resolve({ ok: false, error: '未配置 URL' })
  const body = JSON.stringify({
    type,
    title: opts.title || TYPES[type].label,
    body: opts.body || '',
    ok: opts.ok !== false,
    ts: Date.now()
  })
  return new Promise((resolve) => {
    let settled = false
    const done = (r) => { if (!settled) { settled = true; resolve(r) } }
    try {
      const lib = url.indexOf('https://') === 0 ? https : http
      const req = lib.request(url, {
        method: 'POST',
        headers: Object.assign(
          { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body) },
          (cfg.channels.webhook || {}).secret ? { 'X-Notify-Secret': cfg.channels.webhook.secret } : {}
        ),
        timeout: 10000
      }, (res) => {
        res.resume() // 丢弃响应体，只关心状态码
        done({ ok: res.statusCode >= 200 && res.statusCode < 300, error: res.statusCode >= 300 ? 'HTTP ' + res.statusCode : '' })
      })
      req.on('timeout', () => { req.destroy(new Error('timeout')) })
      req.on('error', (e) => done({ ok: false, error: e.message }))
      req.end(body)
    } catch (e) {
      done({ ok: false, error: e.message })
    }
  })
}

// ===== 分发入口 =====
// opts: { title, body, ok, click, dedupeKey, silentSystem }
//   dedupeKey：冷却窗口内同键不重复投递（permission.ask=askId / login.required=host）
//   silentSystem：跳过系统通知（定时任务 notify=false 时仅走其余渠道）
function dispatch(type, opts) {
  const def = TYPES[type]
  if (!def) return
  const cfg = readConfig()
  if (cfg.enabled === false) return
  const o = opts || {}
  if (o.dedupeKey) {
    const last = recentKeys.get(o.dedupeKey) || 0
    if (Date.now() - last < COOLDOWN_MS) return
    recentKeys.set(o.dedupeKey, Date.now())
  }
  const chans = cfg.matrix[type] || def.channels
  if (chans.indexOf('system') >= 0) sendSystem(type, o, cfg)
  if (chans.indexOf('webhook') >= 0) {
    sendWebhook(type, o, cfg).then(r => {
      if (!r.ok) console.warn('[omnibuddy:notify] webhook 投递失败：', r.error)
    })
  }
}

// ===== 配置视图（IPC：设置页读写）=====
// secret 不下发原文（视图只需知道是否已设置）；test 为内部连通性类型，不进 UI 矩阵
function configView() {
  const cfg = readConfig()
  return {
    enabled: cfg.enabled,
    webhook: {
      url: (cfg.channels.webhook || {}).url || '',
      hasSecret: !!((cfg.channels.webhook || {}).secret)
    },
    matrix: cfg.matrix,
    types: Object.keys(TYPES).filter(t => t !== 'test')
      .map(t => ({ key: t, label: TYPES[t].label }))
  }
}

function updateConfig(patch) {
  const cfg = readConfig()
  if (!patch || typeof patch !== 'object') return { ok: false, error: '参数错误' }
  if (patch.enabled !== undefined) cfg.enabled = !!patch.enabled
  if (patch.webhook && typeof patch.webhook === 'object') {
    if (!cfg.channels.webhook) cfg.channels.webhook = { url: '', secret: '' }
    if (patch.webhook.url !== undefined) {
      cfg.channels.webhook.url = String(patch.webhook.url).trim()
    }
    // secret 传空串表示「保持不变」（视图不下发明文），传非空才覆盖
    if (typeof patch.webhook.secret === 'string' && patch.webhook.secret) {
      cfg.channels.webhook.secret = patch.webhook.secret
    }
  }
  if (patch.matrix && typeof patch.matrix === 'object') {
    Object.keys(TYPES).forEach(t => {
      const v = patch.matrix[t]
      if (Array.isArray(v)) {
        cfg.matrix[t] = v.filter(c => c === 'system' || c === 'webhook')
      }
    })
  }
  try {
    writeConfig(cfg)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: '保存失败：' + e.message }
  }
}

// 测试投递（设置页「发送测试」）：webhook 返回投递结果供 UI 反馈
async function testChannel(channel) {
  if (channel === 'webhook') {
    const cfg = readConfig()
    const r = await sendWebhook('test', { title: 'OmniDeck 测试通知', body: 'webhook 渠道连通性测试', ok: true }, cfg)
    return r
  }
  dispatch('test', { title: 'OmniDeck 测试通知', body: 'system 渠道连通性测试', ok: true })
  return { ok: true }
}

module.exports = { init, dispatch, configView, updateConfig, testChannel }
