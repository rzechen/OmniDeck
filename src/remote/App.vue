<template>
  <!-- 根组件：路由出口 + 全局 SSE 生命周期（连接随 token 变化重建） -->
  <router-view />
</template>

<script setup>
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { store, dispatchSse } from './store'
import { createSse } from './composables/sse'
import api from './api'

const router = useRouter()

function loadOverview() {
  store.loading = true
  api('GET', '/api/state').then(r => {
    if (!r || !r.ok) return
    store.overview = { groups: r.groups || [], current: r.current || null }
    store.runningId = (r.current && r.current.sessionId) || ''
  }).catch(() => {}).finally(() => { store.loading = false })
}

// SSE 事件：运行态入全局 store；终态清 running；其余分发给当前详情页
function onEvent(ev) {
  if (ev.type === 'remote_state') {
    store.runningId = (ev.current && ev.current.sessionId) || ''
    store.overview.current = ev.current || null
    // 列表页停留时刷新总览（运行开始/结束的徽标即时更新）
    if (router.currentRoute.value.path === '/tasks') loadOverview()
    return
  }
  if (ev.type === 'done' || ev.type === 'error' || ev.type === 'interrupted') store.runningId = ''
  dispatchSse(ev)
}

const sse = createSse(onEvent, on => { store.connOn = on })

// token 变化（配对 / 未来登出）→ 重建连接 + 拉总览
watch(() => store.token, t => {
  if (t) {
    sse.connect(t)
    loadOverview()
  } else {
    sse.close()
    store.connOn = false
  }
}, { immediate: true })
</script>
