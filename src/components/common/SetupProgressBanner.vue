<template>
  <transition name="setup-banner">
    <div v-if="visible" class="setup-banner" :class="{ 'is-failed': session.state === 'failed', 'is-done': session.state === 'done' }">
      <!-- 底部进度细条：installing 时实时填充 -->
      <div v-if="session.state === 'installing'" class="sb-bar" :style="{ width: pct + '%' }" />
      <svg-icon v-if="session.state === 'installing'" icon-class="loading" class="sb-ico sb-ico-spin" />
      <svg-icon v-else :icon-class="session.state === 'failed' ? 'warning-outline' : 'check'" class="sb-ico" />
      <span class="sb-text">
        <template v-if="session.state === 'failed'">
          运行环境装配中断于「{{ failedItems[0] && failedItems[0].label }}」，已完成部分无需重新下载
        </template>
        <template v-else-if="session.state === 'done'">
          运行环境装配完成，全部能力已解锁
        </template>
        <template v-else>
          正在后台装配运行环境 {{ pct }}%<template v-if="currentText"> · {{ currentText }}</template><template v-if="etaText"> · 预计剩余 {{ etaText }}</template>
        </template>
      </span>
      <a v-if="session.state === 'failed'" class="sb-act" @click="retry">重试装配</a>
    </div>
  </transition>
</template>

<script setup>
// 首启装配进度横幅：后台装配会话（omnibuddy:setup:*）在主视图的常驻展示。
// 引导页「先进入 OmniDeck」后装配仍在主进程继续，本横幅凭同一快照通道渲染：
// installing = 百分比 + 当前组件 + ETA；failed = 重试入口；done = 短暂提示后自动收起。
// 挂载时同步快照（页面刷新 / 二次进入不丢进度），仅 installing/failed 主动展示，
// 挂载即 done 的不展示（老用户常态启动不该看到横幅）。
import { ref, computed, watch, onBeforeUnmount } from 'vue'

defineOptions({ name: 'SetupProgressBanner' })

const session = ref({ state: '', items: [] }) // 空态占位（visible 由 state 驱动）
let offProgress = null
const justDone = ref(false) // 本次挂载周期内目睹完成（用于短暂展示）
let hideTimer = null

const api = computed(() => (window.electronAPI && window.electronAPI.omnibuddy) || null)

const visible = computed(() => {
  if (!session.value || !session.value.state) return false
  if (session.value.state === 'installing') return true
  if (session.value.state === 'failed') return true
  if (session.value.state === 'done') return justDone.value
  return false
})

const items = computed(() => (session.value && session.value.items) || [])
const failedItems = computed(() => items.value.filter(c => c.state === 'error'))
const currentItem = computed(() => items.value.find(c => c.state === 'installing') || null)

// 整体进度：字节口径优先，无字节回退按项数
const pct = computed(() => {
  const s = session.value
  if (s && s.bytesTotal > 0) {
    return Math.min(99, Math.floor((s.bytesDone || 0) / s.bytesTotal * 100))
  }
  const total = items.value.length
  if (!total) return 0
  const ok = items.value.filter(c => c.state === 'ok').length
  return Math.min(100, Math.floor(ok / total * 100))
})

const currentText = computed(() => {
  const c = currentItem.value
  if (!c) return ''
  const phase = c._phase
  if (phase === 'verify') return `${c.label} · 校验中`
  if (phase === 'extract') return `${c.label} · 装配中`
  if (phase === 'download' && c.size && c._received) {
    return `${c.label} · ${Math.min(99, Math.floor(c._received / c.size * 100))}%`
  }
  return c.label || ''
})

const etaText = computed(() => {
  const s = session.value
  if (!s || s.state !== 'installing' || !s.etaSec) return ''
  const sec = s.etaSec
  if (sec >= 60) return Math.ceil(sec / 60) + ' 分钟'
  return sec + ' 秒'
})

// 目睹装配从 installing/failed 走到 done → 短暂展示后自动收起。
// 挂载时快照同步带来的 ''→done 不算（视图切换重建组件会重新拉快照，
// 老用户常态下切来切去不该反复弹"装配完成"）
watch(() => session.value.state, (st, old) => {
  if (st === 'done' && (old === 'installing' || old === 'failed')) {
    justDone.value = true
    clearTimeout(hideTimer)
    hideTimer = setTimeout(() => { justDone.value = false }, 4000)
  }
})

function applySession(s) {
  if (s && s.items) session.value = s
}

function bindProgress() {
  const inst = api.value
  if (!inst || !inst.onSetupProgress) return
  offProgress = inst.onSetupProgress(applySession)
}

// 挂载时同步既有快照（后台装配已在跑 / 已失败的场景）
async function syncSnapshot() {
  const inst = api.value
  if (!inst || !inst.setupSnapshot) return
  try {
    applySession(await inst.setupSnapshot())
  } catch (e) { /* 快照失败静默 */ }
}

// 失败重试：重新触发主进程后台装配（其内部会重新检查缺失清单并续传）
function retry() {
  const inst = api.value
  if (inst && inst.setupStartInstall) inst.setupStartInstall().catch(() => {})
}

// created：绑定进度 + 同步快照
bindProgress()
syncSnapshot()

onBeforeUnmount(() => {
  if (offProgress) offProgress()
  clearTimeout(hideTimer)
})
</script>

<style lang="scss" scoped>
/* 悬浮胶囊：fixed 悬于页签行下方居中，不占布局空间（不挤压页面内容） */
.setup-banner {
  position: fixed;
  top: 44px; /* 页签行下方 */
  left: 50%;
  transform: translateX(-50%);
  z-index: 2100;
  display: flex;
  align-items: center;
  gap: 9px;
  max-width: min(560px, 72vw);
  padding: 7px 16px 7px 13px;
  border-radius: 999px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(14px) saturate(1.2);
  box-shadow:
    0 6px 22px rgba(15, 23, 42, 0.16),
    0 1px 4px rgba(15, 23, 42, 0.08),
    inset 0 0 0 1px rgba(var(--primary-color-rgb), 0.16);
  font-size: 12.5px;
  color: $text-primary;
  -webkit-app-region: no-drag;

  &.is-failed {
    box-shadow:
      0 6px 22px rgba(15, 23, 42, 0.16),
      0 1px 4px rgba(15, 23, 42, 0.08),
      inset 0 0 0 1px rgba(230, 162, 60, 0.4);

    .sb-ico { color: #cf8e22; }
  }

  &.is-done {
    box-shadow:
      0 6px 22px rgba(15, 23, 42, 0.16),
      0 1px 4px rgba(15, 23, 42, 0.08),
      inset 0 0 0 1px rgba(103, 194, 58, 0.4);

    .sb-ico { color: #529b3d; }
  }
}

.sb-ico {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--primary-color);
}

/* 进行中：旋转 spinner */
.sb-ico-spin {
  animation: sb-spin 1s linear infinite;
}

@keyframes sb-spin {
  to { transform: rotate(360deg); }
}

.sb-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sb-act {
  flex-shrink: 0;
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-color);
  cursor: pointer;

  &:hover { text-decoration: underline; }
}

/* 底部进度细条：主色渐变，随字节口径推进 */
.sb-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  background: linear-gradient(90deg, var(--primary-color), rgba(var(--primary-color-rgb), 0.55));
  transition: width 0.35s ease;
}

/* 入场下滑 / 离场上滑收起（保留水平居中定位） */
.setup-banner-enter-active,
.setup-banner-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.setup-banner-enter-from,
.setup-banner-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-10px);
}
</style>
