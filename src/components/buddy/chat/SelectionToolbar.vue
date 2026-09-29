<template>
  <!-- 划选工具条：消息区划选文字后浮现（复制 / 追问），fixed 定位跟随选区 -->
  <transition name="ob-selbar">
    <div
      v-if="visible"
      class="ob-selbar"
      :style="{ top: top + 'px', left: left + 'px' }"
      @mousedown.prevent
    >
      <div class="ob-selbar-item" title="复制选中内容" @click="copySel">
        <svg-icon icon-class="copy" class="ob-selbar-ico" />
        <span>复制</span>
      </div>
      <div class="ob-selbar-item" title="引用选中内容继续追问" @click="quoteSel">
        <svg-icon icon-class="followup" class="ob-selbar-ico" />
        <span>追问</span>
      </div>
    </div>
  </transition>
</template>

<script>
// 划选工具条（豆包风格深色浮条）：监听 document mouseup / selectionchange，
// 选区落在指定容器（消息区）内时按选区矩形定位显示「复制 / 追问」。
// 生命周期由父组件显式管理（setup / teardown）：keep-alive 切走时须移除监听。
export default {
  name: 'SelectionToolbar',
  props: {
    // 划选作用域容器 getter（返回消息滚动区 HTMLElement；函数实时取值，规避 prop 时序）
    getArea: {
      type: Function,
      default: null
    }
  },
  data() {
    return {
      visible: false,
      text: '',
      top: 0,
      left: 0
    }
  },
  created() {
    // 已绑定 scroll 隐藏的容器（teardown 时解绑）
    this._areaEl = null
  },
  beforeUnmount() {
    this.teardown()
  },
  methods: {
    // ===== 监听挂载 / 移除（父级 activated / deactivated 调用） =====
    setup() {
      document.addEventListener('mouseup', this.onMouseUp)
      document.addEventListener('selectionchange', this.onSelChange)
      window.addEventListener('resize', this.hide)
      this.bindAreaScroll(true)
    },
    teardown() {
      document.removeEventListener('mouseup', this.onMouseUp)
      document.removeEventListener('selectionchange', this.onSelChange)
      window.removeEventListener('resize', this.hide)
      this.bindAreaScroll(false)
      this.hide()
    },
    // 消息区滚动即隐藏（选区矩形随滚动失效）
    bindAreaScroll(on) {
      if (this._areaEl) {
        this._areaEl.removeEventListener('scroll', this.hide)
        this._areaEl = null
      }
      if (on) {
        const el = this.getArea && this.getArea()
        if (el) {
          this._areaEl = el
          this._areaEl.addEventListener('scroll', this.hide, { passive: true })
        }
      }
    },
    onMouseUp() {
      // mouseup 后选区才最终确定，延后一帧取稳定状态
      setTimeout(() => this.evaluate(), 0)
    },
    // 选区被折叠（点击空白 / 开始新选择）时立即隐藏
    onSelChange() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed) this.hide()
    },
    evaluate() {
      const sel = window.getSelection()
      if (!sel || sel.isCollapsed || !sel.rangeCount) return this.hide()
      const range = sel.getRangeAt(0)
      const node = range.commonAncestorContainer
      const el = node.nodeType === 1 ? node : node.parentElement
      // 选区必须落在消息区内（排除输入框 / 工具条自身 / 其他区域）
      const area = this.getArea && this.getArea()
      if (!area || !el || !area.contains(el)) return this.hide()
      const text = String(sel.toString() || '').trim()
      if (!text) return this.hide()
      const rect = range.getBoundingClientRect()
      if (!rect || (!rect.width && !rect.height)) return this.hide()

      this.text = text
      // 浮条预估尺寸（宽 ~140 / 高 ~40）：选区上方居中，贴顶时翻到下方，左右越界钳制
      const W = 140
      const H = 44
      const vw = window.innerWidth
      let left = rect.left + rect.width / 2 - W / 2
      left = Math.max(8, Math.min(left, vw - W - 8))
      let top
      if (rect.top - H - 6 >= 8) {
        top = rect.top - H - 6
      } else {
        top = rect.bottom + 6
      }
      this.left = Math.round(left)
      this.top = Math.round(top)
      this.visible = true
    },
    hide() {
      this.visible = false
    },
    copySel() {
      const text = this.text
      this.hide()
      if (!text) return
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          () => this.$message.success('已复制'),
          () => this.$message.error('复制失败')
        )
      } else {
        this.$message.error('当前环境不支持复制')
      }
    },
    quoteSel() {
      const text = this.text
      this.hide()
      if (text) this.$emit('quote', text)
    }
  }
}
</script>

<style lang="scss" scoped>
/* 深色浮条（豆包划选工具条风格） */
.ob-selbar {
  position: fixed;
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 6px;
  border-radius: 12px;
  background: #1f2023;
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  user-select: none;
  cursor: default;
}

.ob-selbar-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  &:active {
    transform: scale(0.96);
  }
}

.ob-selbar-ico {
  font-size: 16px;
}

/* 浮条浮现过渡（Vue2 过渡类名） */
.ob-selbar-enter-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.ob-selbar-leave-active {
  transition: opacity 0.1s ease;
}

.ob-selbar-enter,
.ob-selbar-leave-to {
  opacity: 0;
  transform: translateY(3px);
}
</style>
