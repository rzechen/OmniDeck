<template>
  <div class="scroll-ctrl" @contextmenu.prevent="cancel">
    <!-- 拍一帧（✓）：滚动内容后再拍下一帧 -->
    <button class="sc-btn" title="拍一帧（滚动内容后点击）" @click="shot">
      <svg-icon class="sc-ico" icon-class="capture" />
      <span>{{ frames }}</span>
    </button>
    <div class="sc-divider"></div>
    <!-- 完成：拼接全部帧并入记录池 -->
    <button class="sc-btn sc-ok" title="完成拼接" @click="finish">完成</button>
    <div class="sc-divider"></div>
    <!-- 取消：丢弃本次长截图 -->
    <button class="sc-btn sc-cancel" title="取消（Esc）" @click="cancel">取消</button>
  </div>
</template>

<script>
// 长截图控制条小窗（P2）：captureScroll 选区完成后由主进程 openScrollCtrl
// 加载（208×44 无边框置顶小窗）。用户滚动目标内容后点「拍一帧」逐帧连拍，
// 「完成」拼接入库并自动复制，「取消」丢弃。主进程会在 finish/cancel 后
// 关闭本窗，页面无需自关；Esc 兜底触发取消。
export default {
  name: 'CaptureScrollCtrl',
  data() {
    return {
      frames: 0, // 已拍帧数（含首帧，主进程首帧自动拍）
      busy: false // 防抖：finish/cancel 进行中禁点
    }
  },
  mounted() {
    // 首帧由主进程 captureScroll 启动时自动拍摄
    this.frames = 1
    window.addEventListener('keydown', this.onKeydown)
  },
  beforeDestroy() {
    window.removeEventListener('keydown', this.onKeydown)
  },
  methods: {
    onKeydown(e) {
      if (e.key === 'Escape') this.cancel()
    },
    api() {
      return window.electronAPI && window.electronAPI.captureScrollCtrl
    },
    async shot() {
      const api = this.api()
      if (!api || this.busy) return
      try {
        // 主进程返回 { ok, count }（count 为含首帧的总帧数）
        const res = await api.shot()
        if (res && res.ok && typeof res.count === 'number') this.frames = res.count
      } catch (err) {
        console.warn('scroll shot failed:', err)
      }
    },
    async finish() {
      const api = this.api()
      if (!api || this.busy) return
      this.busy = true
      try {
        await api.finish()
      } catch (err) {
        console.warn('scroll finish failed:', err)
        this.busy = false
      }
    },
    cancel() {
      const api = this.api()
      if (!api || this.busy) return
      this.busy = true
      api.cancel().catch(() => {})
    }
  }
}
</script>

<style lang="scss" scoped>
.scroll-ctrl {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100vh;
  padding: 0 8px;
  background: rgba(28, 30, 34, 0.92);
  backdrop-filter: blur(10px);
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
  user-select: none;
  -webkit-app-region: no-drag;
}

.sc-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 10px;
  height: 28px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #e8eaf0;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .sc-ico {
    font-size: 14px;
  }
}

.sc-ok {
  color: #4ade80;
}

.sc-cancel {
  color: #ff7b72;
}

.sc-divider {
  width: 1px;
  height: 16px;
  background: rgba(255, 255, 255, 0.15);
}
</style>
