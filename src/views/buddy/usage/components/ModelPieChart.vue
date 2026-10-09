<template>
  <!-- 模型分布饼图面板 -->
  <div class="ob-panel">
    <div class="ob-panel-title">模型分布</div>
    <div ref="pie" class="ob-chart ob-chart-pie"></div>
  </div>
</template>

<script setup>
// 模型分布饼图（取前 8 个模型）：echarts 按需引入（仅饼图所需），组件内自管理实例与 resize
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

defineOptions({ name: 'ModelPieChart' })

const props = defineProps({
  // 模型用量数组（[{ name, input, output }]），由页面 summary.models 传入
  models: {
    type: Array,
    default: () => []
  }
})

const pie = ref(null)
// echarts 实例（非响应式）
let chart = null

function render() {
  const el = pie.value
  if (!el) return
  if (!chart) chart = echarts.init(el)
  const models = (props.models || []).slice(0, 8)
  chart.setOption({
    tooltip: { trigger: 'item', formatter: '{b}<br/>{c} tokens（{d}%）' },
    legend: { bottom: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
    series: [{
      type: 'pie',
      radius: ['42%', '68%'],
      center: ['50%', '42%'],
      label: { show: false },
      data: models.map(m => ({ name: m.name, value: m.input + m.output }))
    }]
  })
}

function resize() {
  if (chart) chart.resize()
}

watch(() => props.models, () => {
  render()
})

onMounted(() => {
  render()
  window.addEventListener('resize', resize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize)
  if (chart) chart.dispose()
})
</script>

<style lang="scss" scoped>
.ob-panel {
  background: $card-bg;
  border: 1px solid $border-color;
  border-radius: 12px;
  padding: 14px 16px;
  min-height: 0;
}

.ob-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: 8px;
}

.ob-chart {
  width: 100%;
  height: 240px;
}

.ob-chart-pie {
  height: 220px;
}
</style>
