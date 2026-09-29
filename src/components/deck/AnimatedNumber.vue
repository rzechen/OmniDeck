<template>
  <span class="animated-number">{{ display }}</span>
</template>

<script>
// 数字滚动组件：值变化时用 requestAnimationFrame 缓动（easeOutCubic）滚动到新值
// 支持 money（千分位 + 2 位小数）与 pct（百分比）两种格式；
// 「减弱动态效果」开启时直接跳变不滚动
export default {
  name: 'AnimatedNumber',
  props: {
    value: { type: Number, default: 0 },
    // money = 千分位两位小数；pct = 两位小数百分比
    type: { type: String, default: 'money' },
    // 正数是否带 + 号
    signed: { type: Boolean, default: false },
    duration: { type: Number, default: 700 }
  },
  data() {
    return {
      inner: this.value
    }
  },
  computed: {
    reduceMotion() {
      return this.$store.state.reduceMotion
    },
    display() {
      return this.format(this.inner)
    }
  },
  watch: {
    value(nv) {
      if (this.reduceMotion || nv === this.inner) {
        this.inner = nv
        return
      }
      this.tween(nv)
    }
  },
  methods: {
    format(v) {
      if (v === null || v === undefined || isNaN(v)) return '--'
      const sign = this.signed && v > 0 ? '+' : v < 0 ? '-' : ''
      if (this.type === 'pct') {
        return sign + Math.abs(v).toFixed(2) + '%'
      }
      return (
        sign +
        Math.abs(v).toLocaleString('zh-CN', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2
        })
      )
    },
    tween(target) {
      cancelAnimationFrame(this._raf)
      const from = this.inner
      const start = performance.now()
      const dur = this.duration
      const step = t => {
        const p = Math.min(1, (t - start) / dur)
        const eased = 1 - Math.pow(1 - p, 3)
        this.inner = from + (target - from) * eased
        if (p < 1) {
          this._raf = requestAnimationFrame(step)
        } else {
          this.inner = target
        }
      }
      this._raf = requestAnimationFrame(step)
    }
  },
  beforeUnmount() {
    cancelAnimationFrame(this._raf)
  }
}
</script>
