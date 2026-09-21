<template>
  <div
    class="capture-overlay"
    @mousedown="onMouseDown"
    @mousemove="onMouseMove"
    @mouseup="onMouseUp"
    @contextmenu.prevent="cancel"
  >
    <!-- 未开始拖拽：提示文案 -->
    <div v-if="!dragging && !rect" class="co-hint">
      <div class="co-hint-title">拖拽框选要截取的区域</div>
      <div class="co-hint-sub">松开完成 · Esc 或右键取消</div>
    </div>

    <!-- 拖拽中 / 已选定：半透明遮罩（选区挖洞 + 边框 + 尺寸角标） -->
    <template v-if="rect">
      <div class="co-mask" :style="maskStyle"></div>
      <div class="co-border" :style="rectStyle"></div>
      <div v-if="dragging" class="co-size" :style="sizeStyle">{{ rect.width }} × {{ rect.height }}</div>
    </template>
  </div>
</template>

<script>
// 选区截屏覆盖窗（M4）：铺满单屏的透明层，拖拽框选区域。
// 选定后经 preload 的 captureOverlay.done(rect) 回传主进程（CSS 坐标，
// 主进程按 scaleFactor 换算物理像素 crop）；Esc / 右键取消。
export default {
  name: 'CaptureOverlay',
  data() {
    return {
      dragging: false,
      start: null,
      rect: null
    }
  },
  computed: {
    // 四块遮罩拼出选区「挖洞」（比 mask-image 兼容性好）
    maskStyle() {
      const r = this.rect
      if (!r) return {}
      return {
        borderTop: r.y + 'px solid rgba(0,0,0,0.35)',
        borderBottom: (window.innerHeight - r.y - r.height) + 'px solid rgba(0,0,0,0.35)',
        borderLeft: r.x + 'px solid rgba(0,0,0,0.35)',
        borderRight: (window.innerWidth - r.x - r.width) + 'px solid rgba(0,0,0,0.35)',
        boxSizing: 'border-box',
        width: '100%',
        height: '100%',
        position: 'absolute',
        inset: 0,
        // 遮罩区域拦截指针事件，选区内透传（不透传会被 pointer-events 干扰）
        pointerEvents: 'none'
      }
    },
    rectStyle() {
      const r = this.rect
      if (!r) return {}
      return {
        left: r.x + 'px',
        top: r.y + 'px',
        width: r.width + 'px',
        height: r.height + 'px'
      }
    },
    sizeStyle() {
      const r = this.rect
      if (!r) return {}
      return {
        left: Math.min(r.x + r.width / 2, window.innerWidth - 70) + 'px',
        top: Math.max(0, r.y - 26) + 'px'
      }
    }
  },
  mounted() {
    window.addEventListener('keydown', this.onKeydown)
  },
  beforeDestroy() {
    window.removeEventListener('keydown', this.onKeydown)
  },
  methods: {
    onKeydown(e) {
      if (e.key === 'Escape') this.cancel()
    },
    onMouseDown(e) {
      if (e.button !== 0) return
      this.dragging = true
      this.start = { x: e.clientX, y: e.clientY }
      this.rect = { x: e.clientX, y: e.clientY, width: 0, height: 0 }
    },
    onMouseMove(e) {
      if (!this.dragging) return
      const s = this.start
      this.rect = {
        x: Math.min(s.x, e.clientX),
        y: Math.min(s.y, e.clientY),
        width: Math.abs(e.clientX - s.x),
        height: Math.abs(e.clientY - s.y)
      }
    },
    onMouseUp() {
      if (!this.dragging) return
      this.dragging = false
      const r = this.rect
      // 过小视为误触：重置等待重新框选
      if (!r || r.width < 3 || r.height < 3) {
        this.rect = null
        return
      }
      this.done(r)
    },
    done(rect) {
      const api = window.electronAPI && window.electronAPI.captureOverlay
      if (api) api.done({ ...rect })
    },
    cancel() {
      const api = window.electronAPI && window.electronAPI.captureOverlay
      if (api) api.done(null)
    }
  }
}
</script>

<style lang="scss" scoped>
.capture-overlay {
  position: fixed;
  inset: 0;
  cursor: crosshair;
  background: transparent;
  overflow: hidden;
  user-select: none;
}

.co-hint {
  position: absolute;
  left: 50%;
  top: 18%;
  transform: translateX(-50%);
  text-align: center;
  color: #fff;
  pointer-events: none;

  .co-hint-title {
    font-size: 15px;
    font-weight: 600;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
  }

  .co-hint-sub {
    margin-top: 6px;
    font-size: 12px;
    opacity: 0.85;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.6);
  }
}

.co-border {
  position: absolute;
  border: 1.5px solid #4a9eff;
  box-shadow: 0 0 0 1px rgba(74, 158, 255, 0.35);
  pointer-events: none;
}

.co-size {
  position: absolute;
  padding: 2px 8px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.7);
  color: #fff;
  font-size: 12px;
  transform: translateX(-50%);
  pointer-events: none;
}
</style>
