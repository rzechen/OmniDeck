<template>
  <span class="animated-number">{{ display }}</span>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'

// 数字滚动组件：值变化时用 requestAnimationFrame 缓动（easeOutCubic）滚动到新值
// 支持 money（千分位 + 2 位小数）与 pct（百分比）两种格式；
// 「减弱动态效果」开启时直接跳变不滚动
defineOptions({ name: 'AnimatedNumber' })

const props = defineProps({
  value: { type: Number, default: 0 },
  // money = 千分位两位小数；pct = 两位小数百分比
  type: { type: String, default: 'money' },
  // 正数是否带 + 号
  signed: { type: Boolean, default: false },
  duration: { type: Number, default: 700 }
})

const store = useStore()

const inner = ref(props.value)
// 动画帧句柄（非响应式）
let raf = null

const reduceMotion = computed(() => store.state.reduceMotion)
const display = computed(() => format(inner.value))

// 数字格式化
function format(v) {
  if (v === null || v === undefined || isNaN(v)) return '--'
  const sign = props.signed && v > 0 ? '+' : v < 0 ? '-' : ''
  if (props.type === 'pct') {
    return sign + Math.abs(v).toFixed(2) + '%'
  }
  return (
    sign +
    Math.abs(v).toLocaleString('zh-CN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    })
  )
}

// 缓动滚动到目标值
function tween(target) {
  cancelAnimationFrame(raf)
  const from = inner.value
  const start = performance.now()
  const dur = props.duration
  const step = t => {
    const p = Math.min(1, (t - start) / dur)
    const eased = 1 - Math.pow(1 - p, 3)
    inner.value = from + (target - from) * eased
    if (p < 1) {
      raf = requestAnimationFrame(step)
    } else {
      inner.value = target
    }
  }
  raf = requestAnimationFrame(step)
}

// 外部值变化：减弱动态效果或值相同直接跳变，否则缓动滚动
watch(
  () => props.value,
  nv => {
    if (reduceMotion.value || nv === inner.value) {
      inner.value = nv
      return
    }
    tween(nv)
  }
)

onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
})
</script>
