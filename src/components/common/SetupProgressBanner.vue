<template>
  <transition name="setup-banner">
    <div v-if="visible" class="setup-banner" :class="{ 'is-failed': session.state === 'failed', 'is-done': session.state === 'done' }">
      <!-- 底部进度细条：installing 时实时填充 -->
      <div v-if="session.state === 'installing'" class="sb-bar" :style="{ width: pct + '%' }" />
      <svg-icon :icon-class="session.state === 'failed' ? 'warning-outline' : (session.state === 'done' ? 'check' : 'download')" class="sb-ico" />
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

<script>
// 首启装配进度横幅：后台装配会话（omnibuddy:setup:*）在主视图的常驻展示。
// 引导页「先进入 OmniDeck」后装配仍在主进程继续，本横幅凭同一快照通道渲染：
// installing = 百分比 + 当前组件 + ETA；failed = 重试入口；done = 短暂提示后自动收起。
// 挂载时同步快照（页面刷新 / 二次进入不丢进度），仅 installing/failed 主动展示，
// 挂载即 done 的不展示（老用户常态启动不该看到横幅）。
export default {
  name: 'SetupProgressBanner',
  data() {
    return {
      session: { state: '', items: [] }, // 空态占位（visible 由 state 驱动）
      offProgress: null,
      justDone: false, // 本次挂载周期内目睹完成（用于短暂展示）
      hideTimer: null
    }
  },
  computed: {
    api() {
      return (window.electronAPI && window.electronAPI.omnibuddy) || null
    },
    visible() {
      if (!this.session || !this.session.state) return false
      if (this.session.state === 'installing') return true
      if (this.session.state === 'failed') return true
      if (this.session.state === 'done') return this.justDone
      return false
    },
    items() {
      return (this.session && this.session.items) || []
    },
    failedItems() {
      return this.items.filter(c => c.state === 'error')
    },
    currentItem() {
      return this.items.find(c => c.state === 'installing') || null
    },
    // 整体进度：字节口径优先，无字节回退按项数
    pct() {
      const s = this.session
      if (s && s.bytesTotal > 0) {
        return Math.min(99, Math.floor((s.bytesDone || 0) / s.bytesTotal * 100))
      }
      const total = this.items.length
      if (!total) return 0
      const ok = this.items.filter(c => c.state === 'ok').length
      return Math.min(100, Math.floor(ok / total * 100))
    },
    currentText() {
      const c = this.currentItem
      if (!c) return ''
      const phase = c._phase
      if (phase === 'verify') return `${c.label} · 校验中`
      if (phase === 'extract') return `${c.label} · 装配中`
      if (phase === 'download' && c.size && c._received) {
        return `${c.label} · ${Math.min(99, Math.floor(c._received / c.size * 100))}%`
      }
      return c.label || ''
    },
    etaText() {
      const s = this.session
      if (!s || s.state !== 'installing' || !s.etaSec) return ''
      const sec = s.etaSec
      if (sec >= 60) return Math.ceil(sec / 60) + ' 分钟'
      return sec + ' 秒'
    }
  },
  watch: {
    // 目睹完成 → 短暂展示后自动收起
    'session.state'(st) {
      if (st === 'done') {
        this.justDone = true
        clearTimeout(this.hideTimer)
        this.hideTimer = setTimeout(() => { this.justDone = false }, 4000)
      }
    }
  },
  created() {
    this.bindProgress()
    this.syncSnapshot()
  },
  beforeUnmount() {
    if (this.offProgress) this.offProgress()
    clearTimeout(this.hideTimer)
  },
  methods: {
    applySession(s) {
      if (s && s.items) this.session = s
    },
    bindProgress() {
      const api = this.api
      if (!api || !api.onSetupProgress) return
      this.offProgress = api.onSetupProgress(this.applySession)
    },
    // 挂载时同步既有快照（后台装配已在跑 / 已失败的场景）
    async syncSnapshot() {
      const api = this.api
      if (!api || !api.setupSnapshot) return
      try {
        this.applySession(await api.setupSnapshot())
      } catch (e) { /* 快照失败静默 */ }
    },
    // 失败重试：重新触发主进程后台装配（其内部会重新检查缺失清单并续传）
    retry() {
      const api = this.api
      if (api && api.setupStartInstall) api.setupStartInstall().catch(() => {})
    }
  }
}
</script>

<style lang="scss" scoped>
.setup-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 10px 14px 0;
  padding: 7px 14px 7px 12px;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(var(--primary-color-rgb), 0.07);
  border: 1px solid rgba(var(--primary-color-rgb), 0.18);
  font-size: 12.5px;
  color: $text-primary;
  -webkit-app-region: no-drag;

  &.is-failed {
    background: rgba(230, 162, 60, 0.1);
    border-color: rgba(230, 162, 60, 0.3);

    .sb-ico { color: #cf8e22; }
  }

  &.is-done {
    background: rgba(103, 194, 58, 0.09);
    border-color: rgba(103, 194, 58, 0.28);

    .sb-ico { color: #529b3d; }
  }
}

.sb-ico {
  flex-shrink: 0;
  width: 14px;
  height: 14px;
  color: var(--primary-color);
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

/* 入场下滑 / 离场上滑收起 */
.setup-banner-enter-active,
.setup-banner-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.setup-banner-enter-from,
.setup-banner-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
</style>
