<template>
  <!-- 日用量柱状图面板 -->
  <div class="ob-panel">
    <div class="ob-panel-title">每日用量</div>
    <div ref="chart" class="ob-chart"></div>
  </div>
</template>

<script>
// 日用量柱状图（输入/输出双系列）：echarts 按需引入（仅柱状图所需），组件内自管理实例与 resize
import * as echarts from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

export default {
  name: 'DailyBarChart',
  props: {
    // 每日用量数组（[{ day, input, output, cost }]），由页面 summary.daily 传入
    days: {
      type: Array,
      default: () => []
    }
  },
  watch: {
    days() {
      this.render()
    }
  },
  mounted() {
    this.render()
    window.addEventListener('resize', this.resize)
  },
  beforeUnmount() {
    window.removeEventListener('resize', this.resize)
    if (this._bar) this._bar.dispose()
  },
  methods: {
    render() {
      const el = this.$refs.chart
      if (!el) return
      if (!this._bar) this._bar = echarts.init(el)
      const daily = this.days || []
      // echarts 为 canvas 渲染，不解析 CSS 变量：itemStyle.color 里写
      // rgba(var(--primary-color-rgb), x) 是非法颜色（静态绘制碰巧沿用上下文
      // 残留样式，hover 触发 emphasis 重绘时赋色失败 → 柱子消失）。
      // 此处读计算值合成合法 rgba
      const cs = window.getComputedStyle(el)
      const rgb = (cs.getPropertyValue('--primary-color-rgb') || '').trim() || '64, 133, 255'
      const primaryColor = 'rgba(' + rgb + ', 0.85)'
      this._bar.setOption({
        grid: { left: 56, right: 16, top: 32, bottom: 28 },
        tooltip: { trigger: 'axis' },
        legend: { top: 0, right: 0, itemWidth: 12, itemHeight: 8, textStyle: { fontSize: 11 } },
        xAxis: {
          type: 'category',
          data: daily.map(d => d.day),
          axisLabel: { fontSize: 10, interval: Math.max(0, Math.floor(daily.length / 10) - 1) }
        },
        yAxis: {
          type: 'value',
          axisLabel: { fontSize: 10, formatter: v => (v >= 1000 ? (v / 1000) + 'k' : v) }
        },
        series: [
          { name: '输入', type: 'bar', stack: 't', barMaxWidth: 18, data: daily.map(d => d.input), itemStyle: { color: primaryColor } },
          { name: '输出', type: 'bar', stack: 't', barMaxWidth: 18, data: daily.map(d => d.output), itemStyle: { color: '#67c23a' } }
        ]
      })
    },
    resize() {
      if (this._bar) this._bar.resize()
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
</style>
