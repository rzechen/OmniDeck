<template>
  <!-- 根组件：路由出口 + 全局 SSE 生命周期（连接随 token 变化重建） -->
  <router-view />
</template>

<script setup>
import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import { store, dispatchSse } from './store'
import { createSse } from './composables/sse'
import api from './api'

const router = useRouter()

function loadOverview() {
  store.loading = true
  api('GET', '/api/state').then(r => {
    if (!r || !r.ok) return
    store.overview = { groups: r.groups || [], current: r.current || null }
    store.runningIds = r.running || []
  }).catch(() => {}).finally(() => { store.loading = false })
}

const onList = () => router.currentRoute.value.path === '/tasks'

// SSE 事件：运行集合入全局 store；终态按会话移除；其余分发给当前详情页
function onEvent(ev) {
  if (ev.type === 'remote_state') {
    store.runningIds = ev.running || (ev.current ? [ev.current.sessionId] : [])
    store.overview.current = ev.current || null
    // 列表页停留时刷新总览（运行开始/结束的徽标即时更新）
    if (onList()) loadOverview()
    return
  }
  if (ev.type === 'chat_deleted') {
    // 任务被删除（任一端发起）：清运行态；正查看该任务详情则退回列表
    // （列表页由前一条 remote_state 广播触发刷新，无需额外处理）
    store.runningIds = store.runningIds.filter(x => x !== ev.sessionId)
    const cur = router.currentRoute.value
    if (cur.name === 'task-detail' && String(cur.params.id) === String(ev.sessionId)) {
      router.replace('/tasks')
      ElMessage({ message: '该任务已被删除', duration: 2000 })
    }
    return
  }
  // 挂起/已决的人工交互：列表页刷新「待确认」徽标
  if (ev.type === 'permission_ask' || ev.type === 'ask_user'
    || ev.type === 'permission_done' || ev.type === 'ask_done') {
    if (onList()) loadOverview()
    dispatchSse(ev)
    return
  }
  if (ev.type === 'done' || ev.type === 'error' || ev.type === 'interrupted') {
    // 终态：仅移除该会话的运行态（多任务下其它任务不受影响）+ 列表徽标刷新
    store.runningIds = store.runningIds.filter(x => x !== ev.sessionId)
    if (onList()) loadOverview()
  }
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
