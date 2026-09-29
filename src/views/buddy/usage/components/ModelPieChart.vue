<template>
  <!-- 模型分布饼图面板 -->
  <div class="ob-panel">
    <div class="ob-panel-title">模型分布</div>
    <div ref="pie" class="ob-chart ob-chart-pie"></div>
  </div>
</template>

<script>
// 模型分布饼图（取前 8 个模型）：echarts 按需引入（仅饼图所需），组件内自管理实例与 resize
import * as echarts from 'echarts/core'
import { PieChart } from 'echarts/charts'
import { TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([PieChart, TooltipComponent, LegendComponent, CanvasRenderer])

export default {
  name: 'ModelPieChart',
  props: {
    // 模型用量数组（[{ name, input, output }]），由页面 summary.models 传入
    models: {
      type: Array,
      default: () => []
    }
  },
  watch: {
    models() {
      this.render()
    }
  },
  mounted() {
    this.render()
    window.addEventListener('resize', this.resize)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.resize)
    if (this._pie) this._pie.dispose()
  },
  methods: {
    render() {
      const el = this.$refs.pie
      if (!el) return
      if (!this._pie) this._pie = echarts.init(el)
      const models = (this.models || []).slice(0, 8)
      this._pie.setOption({
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
    },
    resize() {
      if (this._pie) this._pie.resize()
    }
  }
}
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
