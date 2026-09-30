<template>
  <div
    class="capture-pin"
    @wheel="onWheel"
    @dblclick="close"
    @contextmenu.prevent
  >
    <img v-if="src" :src="src" alt="贴图" draggable="false" />
    <!-- 操作角标（hover 显示） -->
    <button class="cp-close" title="关闭 (双击)" @click.stop="close">
      <svg-icon icon-class="close" />
    </button>
    <div class="cp-zoom" v-show="hovering">
      <button title="放大" @click.stop="resize(1.2)"><svg-icon icon-class="zoom-in" /></button>
      <button title="缩小" @click.stop="resize(0.8)"><svg-icon icon-class="zoom-out" /></button>
    </div>
  </div>
</template>

<script>
// 贴屏小窗（iShot「贴到屏幕」）：置顶无边框窗口显示标注结果。
// 整体可拖动（CSS app-region drag），滚轮/按钮缩放，双击或叉关闭。
// 图片经 capture-pin:frame?id= 拉取；缩放经 capture-pin:resize 由主进程改窗尺寸。
export default {
  name: 'CapturePin',
  data() {
    return {
      src: '',
      hovering: false
    }
  },
  computed: {
    api() {
      return window.electronAPI && window.electronAPI.capturePin
    }
  },
  async mounted() {
    const id = Number(this.$route.query.id || 0)
    const res = await this.api.frame(id)
    if (res && res.ok) this.src = res.data
  },
  methods: {
    onWheel(e) {
      this.resize(e.deltaY < 0 ? 1.1 : 0.9)
    },
    async resize(scale) {
      if (this.api) await this.api.resize({ scale })
    },
    close() {
      if (this.api) this.api.close()
    }
  }
}
</script>

<style lang="scss" scoped>
.capture-pin {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  -webkit-app-region: drag; /* 整窗拖动 */
  user-select: none;
}

img {
  max-width: 100%;
  max-height: 100%;
  pointer-events: none;
}

.cp-close,
.cp-zoom {
  -webkit-app-region: no-drag;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.capture-pin:hover .cp-close,
.capture-pin:hover .cp-zoom {
  opacity: 1;
}

.cp-close {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 14px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;

  &:hover { background: rgba(220, 38, 38, 0.85); }
}

.cp-zoom {
  position: absolute;
  bottom: 8px;
  right: 8px;
  display: flex;
  gap: 4px;

  button {
    width: 26px;
    height: 26px;
    border: none;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.6);
    color: #fff;
    font-size: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:hover { background: rgba(0, 0, 0, 0.8); }
  }
}
</style>
