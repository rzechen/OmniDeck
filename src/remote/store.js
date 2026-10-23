// 全局状态（跨页面共享：token / SSE 连接态 / 运行中任务 / 列表总览）
// 模块级 reactive 单例，配合路由页面化使用
import { reactive } from 'vue'
import { setApiToken } from './api'

export const store = reactive({
  token: localStorage.getItem('odRemoteToken') || '',
  connOn: false,
  // 当前运行中的会话 id（remote_state 推送 / 列表刷新维护；空 = 空闲）
  runningId: '',
  // 总览加载中（列表骨架屏依据）
  loading: true,
  overview: { groups: [], current: null }
})

export function setToken(t) {
  const token = String(t || '').trim()
  store.token = token
  if (token) localStorage.setItem('odRemoteToken', token)
  else localStorage.removeItem('odRemoteToken')
  setApiToken(token)
}

// ===== SSE 事件分发：详情页注册当前消费者（页面级 sink，路由切换自动接管） =====
let sseHandler = null

export function setSseHandler(fn) {
  sseHandler = typeof fn === 'function' ? fn : null
}

export function dispatchSse(ev) {
  if (sseHandler) {
    try { sseHandler(ev) } catch (e) { /* 消费者异常不影响分发 */ }
  }
}

// 初始化 api token（刷新后 localStorage 恢复）
setApiToken(store.token)
