// WebContentsView 通用 preload：向网页主世界暴露受限桥 window.odBridge
// 按特性命名空间白名单放行通道（od-tr:* 翻译 / od-wx:* 公众号等后续特性），
// 仅暴露 invoke/send/on 三类受限能力，不含任何 Node 泄漏
const { contextBridge, ipcRenderer } = require('electron')

const ALLOWED_PREFIXES = ['od-tr:', 'od-wx:']

function allowed(channel) {
  return typeof channel === 'string' && ALLOWED_PREFIXES.some(p => channel.indexOf(p) === 0)
}

contextBridge.exposeInMainWorld('odBridge', {
  // 特性请求：invoke('od-xx:channel', payload) -> Promise
  invoke: (channel, payload) => {
    if (!allowed(channel)) return Promise.reject(new Error('channel not allowed: ' + channel))
    return ipcRenderer.invoke(channel, payload)
  },
  // 注入脚本上报：send('od-xx:channel', payload)
  send: (channel, payload) => {
    if (allowed(channel)) ipcRenderer.send(channel, payload)
  },
  // 主进程命令订阅：on('od-xx:channel', cb)
  on: (channel, cb) => {
    if (!allowed(channel)) return
    ipcRenderer.on(channel, (_e, msg) => { try { cb(msg) } catch (err) { /* 页面脚本异常不外抛 */ } })
  }
})
