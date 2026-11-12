<template>
  <!-- 运行环境初始化横幅：首启（或升级后）后台解压内置运行时压缩包期间展示，
       解压完成/出错即收起；error 态提示重启重试（marker 未写，下次启动自动重解压） -->
  <div v-if="phase === 'extracting'" class="rt-init-banner">
    <svg-icon icon-class="loading" class="rt-init-spin" />
    <span>正在初始化运行环境{{ total ? `（${done}/${total}）` : '' }}，数据分析 / 代码执行等能力稍后可用</span>
  </div>
  <div v-else-if="phase === 'error'" class="rt-init-banner is-error" :title="error">
    <svg-icon icon-class="warning-outline" />
    <span>运行环境初始化失败{{ error ? '：' + error : '' }}，重启应用后将自动重试</span>
  </div>
</template>

<script setup>
// 运行时自解压状态横幅（Deck / Buddy 两布局同位挂载）：挂载时同步状态 + 订阅广播
import { ref, onBeforeUnmount, onMounted } from 'vue'

defineOptions({ name: 'RuntimeInitBanner' })

const phase = ref('')
const done = ref(0)
const total = ref(0)
const error = ref('')
let off = null

onMounted(() => {
  const api = (window.electronAPI && window.electronAPI.omnibuddy) || null
  if (!api || !api.runtimeBundleStatus) return
  api.runtimeBundleStatus().then(s => {
    if (s && s.phase) {
      phase.value = s.phase
      done.value = s.done || 0
      total.value = s.total || 0
      error.value = s.error || ''
    }
  }).catch(() => {})
  if (api.onRuntimeBundle) {
    off = api.onRuntimeBundle(s => {
      phase.value = (s && s.phase) || ''
      done.value = (s && s.done) || 0
      total.value = (s && s.total) || 0
      error.value = (s && s.error) || ''
    })
  }
})

onBeforeUnmount(() => {
  if (off) off()
})
</script>

<style lang="scss" scoped>
.rt-init-banner {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 10px 14px 0;
  padding: 7px 12px;
  border-radius: 10px;
  font-size: 12px;
  color: var(--text-primary, #303133);
  background: rgba(var(--primary-color-rgb), 0.07);
  border: 1px solid rgba(var(--primary-color-rgb), 0.18);

  &.is-error {
    background: rgba(var(--danger-color-rgb, 192, 80, 77), 0.07);
    border-color: rgba(var(--danger-color-rgb, 192, 80, 77), 0.22);
  }

  .svg-icon {
    flex-shrink: 0;
    font-size: 14px;
    color: var(--primary-color);
  }

  .rt-init-spin {
    animation: rt-init-rotate 0.9s linear infinite;
  }

  &.is-error .svg-icon {
    color: var(--danger-color);
  }
}

@keyframes rt-init-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
