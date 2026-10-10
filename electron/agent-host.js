// OmniBuddy agent 子进程入口（utilityProcess）：初始化仿真 shim 并加载 agent 全量 IPC
// 职责：
// - argv 解析初始化数据：agent 模块顶层同步 require('electron')，而 parentPort 消息是
//   异步到达的，init（路径 / safeStorage 可用性等）必须经 argv 同步可读
// - Module._resolveFilename hook：require('electron') → agent-shim.js（零改动仿真层）
// - 协议中枢：渲染 invoke（主→子）/ 宿主调用（子→主）/ 宿主事件 / 退出握手
// - 启动序列：加载 agent 全量 IPC → 预热凭证解密缓存 → 宣告就绪（附通道清单）
// 协议消息：
//   子 → 主：host-call / invoke-res / ready / broadcast / shutdown-done
//   主 → 子：invoke / host-res / host-event / shutdown

'use strict'

const path = require('path')
const Module = require('module')

// ---- 初始化数据（argv）----
const INIT_PREFIX = '--omnideck-agent-init='
function parseInit() {
  for (const a of process.argv) {
    if (typeof a === 'string' && a.startsWith(INIT_PREFIX)) {
      try {
        return JSON.parse(decodeURIComponent(a.slice(INIT_PREFIX.length)))
      } catch (e) {
        console.error('[agent-host] init 参数解析失败：', e && e.message)
        return null
      }
    }
  }
  return null
}

const init = parseInit()
if (!init || !init.userDataPath) {
  console.error('[agent-host] 缺少 --omnideck-agent-init 启动参数，退出')
  process.exit(1)
}

// ---- require('electron') 重定向到 agent-shim ----
const shimPath = path.join(__dirname, 'agent-shim.js')
const origResolveFilename = Module._resolveFilename
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request === 'electron') return shimPath
  return origResolveFilename.call(this, request, parent, isMain, options)
}

const shim = require('./agent-shim')

// ---- 子 → 主 宿主调用（无超时：系统对话框可长时间停留，由主进程侧兜底）----
let hostSeq = 0
const hostPending = new Map()
function hostCall(method, args) {
  return new Promise((resolve, reject) => {
    const id = 'hc-' + (++hostSeq)
    hostPending.set(id, { resolve, reject })
    process.parentPort.postMessage({ t: 'host-call', id, method, args: args || [] })
  })
}

shim.__wire({
  post: (msg) => process.parentPort.postMessage(msg),
  hostCall,
  init: {
    paths: init.paths || { userData: init.userDataPath },
    safeStorageAvailable: !!init.safeStorageAvailable,
    notificationSupported: !!init.notificationSupported
  }
})

// ---- 结构化克隆复原：跨 postMessage 的 Buffer 变 Uint8Array，深度复原 ----
function revive(value, seen) {
  if (!value || typeof value !== 'object') return value
  if (value instanceof Uint8Array) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength)
  }
  if (seen.has(value)) return value
  seen.add(value)
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) value[i] = revive(value[i], seen)
    return value
  }
  const proto = Object.getPrototypeOf(value)
  if (proto === Object.prototype || proto === null) {
    for (const k of Object.keys(value)) value[k] = revive(value[k], seen)
  }
  return value
}

function errText(err) {
  return (err && err.message) ? err.message : String(err)
}

// ---- 主 → 子 消息路由 ----
process.parentPort.on('message', (e) => {
  const msg = e.data
  if (!msg || typeof msg !== 'object') return

  if (msg.t === 'invoke') {
    Promise.resolve()
      .then(() => shim.__invoke(msg.channel, revive(msg.args || [], new WeakSet())))
      .then(
        (data) => process.parentPort.postMessage({ t: 'invoke-res', id: msg.id, ok: true, data }),
        (err) => process.parentPort.postMessage({ t: 'invoke-res', id: msg.id, ok: false, error: errText(err) })
      )
    return
  }

  if (msg.t === 'host-res') {
    const p = hostPending.get(msg.id)
    if (p) {
      hostPending.delete(msg.id)
      if (msg.ok) p.resolve(msg.data)
      else p.reject(new Error(msg.error))
    }
    return
  }

  if (msg.t === 'host-event') {
    shim.__hostEvent(msg.name, msg.payload)
    return
  }

  if (msg.t === 'shutdown') {
    shim.__shutdown()
  }
})

// ---- 启动：加载 agent 全量 IPC → 预热凭证解密缓存 → 宣告就绪 ----
// 先挂好 parentPort 监听再 require agent：加载期间到达的 invoke 不会丢失
// （parentPort 具备 MessagePort 语义，接收端就绪前消息排队）
;(async () => {
  try {
    const agent = require('./agent')
    agent.registerOmnibuddyIpc(() => shim.__window(), init.userDataPath)
    try {
      await require('./agent/integrations/credentials').prewarm()
      // 子代理凭据 env 重刷：init 期首刷时解密缓存可能未预热（桥接模式），
      // 此处缓存就绪后刷新，保证 globalThis 上的 env 已含明文凭据
      require('./agent/pi/setup').refreshChildCredEnv()
    } catch (e) {
      console.warn('[agent-host] 凭证解密缓存预热失败（不影响启动）：', errText(e))
    }
    process.parentPort.postMessage({ t: 'ready', channels: shim.__channels() })
  } catch (err) {
    console.error('[agent-host] agent 启动失败：', err)
    // ready 带 error：桥记日志、不注册通道、不重启（避免坏状态循环拉起）
    process.parentPort.postMessage({ t: 'ready', error: errText(err) })
  }
})()
