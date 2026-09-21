<template>
  <div class="ob-usage">
    <!-- 顶部：标题 + 窗口切换 + 导出 -->
    <div class="ob-usage-head">
      <div>
        <div class="ob-usage-title">用量统计</div>
        <div class="ob-usage-sub">近 30 天 token 消耗与成本（按消息级 usage 聚合）</div>
      </div>
      <div class="ob-usage-actions">
        <el-radio-group v-model="days" size="small" @change="load">
          <el-radio-button :label="7">7 天</el-radio-button>
          <el-radio-button :label="30">30 天</el-radio-button>
        </el-radio-group>
        <el-button size="small" icon="el-icon-download" @click="exportCsv">导出 CSV</el-button>
      </div>
    </div>

    <div v-loading="loading" class="ob-usage-body">
      <!-- 顶部数字卡：今日 / 窗口合计 / 会话数 -->
      <div class="ob-usage-cards">
        <div class="ob-card">
          <div class="ob-card-label">今日输入</div>
          <div class="ob-card-value">{{ fmtTokens(today.input) }}</div>
        </div>
        <div class="ob-card">
          <div class="ob-card-label">今日输出</div>
          <div class="ob-card-value">{{ fmtTokens(today.output) }}</div>
        </div>
        <div class="ob-card">
          <div class="ob-card-label">{{ days }} 天合计</div>
          <div class="ob-card-value">{{ fmtTokens(total.input + total.output) }}</div>
        </div>
        <div class="ob-card">
          <div class="ob-card-label">活跃会话</div>
          <div class="ob-card-value">{{ summary.sessionCount || 0 }}</div>
        </div>
      </div>

      <!-- 日用量柱状图 -->
      <div class="ob-panel">
        <div class="ob-panel-title">每日用量</div>
        <div ref="chart" class="ob-chart"></div>
      </div>

      <div class="ob-usage-cols">
        <!-- 会话 TOP5 -->
        <div class="ob-panel">
          <div class="ob-panel-title">会话 TOP5（按成本/用量）</div>
          <div class="ob-top-list">
            <div v-if="!top5.length" class="ob-empty">暂无数据</div>
            <div v-for="(s, i) in top5" :key="s.id" class="ob-top-item">
              <span class="ob-top-rank" :class="'rank-' + (i + 1)">{{ i + 1 }}</span>
              <span class="ob-top-title" :title="s.title">{{ s.title }}</span>
              <span class="ob-top-tokens">{{ fmtTokens(s.input + s.output) }}</span>
            </div>
          </div>
        </div>

        <!-- 模型分布 -->
        <div class="ob-panel">
          <div class="ob-panel-title">模型分布</div>
          <div ref="pie" class="ob-chart ob-chart-pie"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// 用量统计（N4 / §18.2）：主进程 summarize 聚合好三维数据，前端只做渲染
// echarts 按需引入（柱状图 + 饼图），避免整包
import * as echarts from 'echarts/core'
import { BarChart, PieChart } from 'echarts/charts'
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'

echarts.use([BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer])

function api() {
  return (window.electronAPI && window.electronAPI.omnibuddy) || null
}

export default {
  name: 'OmniBuddyUsage',
  data() {
    return {
      loading: false,
      days: 30,
      summary: {
        today: { input: 0, output: 0, cost: 0 },
        total: { input: 0, output: 0, cost: 0 },
        daily: [],
        top5: [],
        models: [],
        sessionCount: 0
      }
    }
  },
  computed: {
    today() {
      return this.summary.today || { input: 0, output: 0 }
    },
    total() {
      return this.summary.total || { input: 0, output: 0 }
    },
    top5() {
      return this.summary.top5 || []
    }
  },
  mounted() {
    this.load()
    window.addEventListener('resize', this.resizeCharts)
  },
  beforeDestroy() {
    window.removeEventListener('resize', this.resizeCharts)
    if (this._bar) this._bar.dispose()
    if (this._pie) this._pie.dispose()
  },
  methods: {
    async load() {
      const a = api()
      if (!a || !a.usageSummarize) {
        this.$message.warning('用量统计需要 OmniDeck 桌面端')
        return
      }
      this.loading = true
      try {
        // 主进程固定 30 天窗口返回；切换 7 天时前端裁剪窗口与合计
        const res = await a.usageSummarize()
        if (res && res.ok) {
          if (this.days < 30 && Array.isArray(res.daily)) {
            const daily = res.daily.slice(-this.days)
            const total = daily.reduce((acc, d) => ({
              input: acc.input + d.input,
              output: acc.output + d.output,
              cost: acc.cost + d.cost
            }), { input: 0, output: 0, cost: 0 })
            res.daily = daily
            res.total = total
          }
          this.summary = res
        }
        this.render()
      } finally {
        this.loading = false
      }
    },
    render() {
      this.$nextTick(() => this.renderBar())
      this.$nextTick(() => this.renderPie())
    },
    // 日柱状图（输入/输出双系列）
    renderBar() {
      const el = this.$refs.chart
      if (!el) return
      if (!this._bar) this._bar = echarts.init(el)
      const daily = this.summary.daily || []
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
          { name: '输入', type: 'bar', stack: 't', barMaxWidth: 18, data: daily.map(d => d.input), itemStyle: { color: 'rgba(var(--primary-color-rgb), 0.85)' } },
          { name: '输出', type: 'bar', stack: 't', barMaxWidth: 18, data: daily.map(d => d.output), itemStyle: { color: '#67c23a' } }
        ]
      })
    },
    // 模型分布饼图
    renderPie() {
      const el = this.$refs.pie
      if (!el) return
      if (!this._pie) this._pie = echarts.init(el)
      const models = (this.summary.models || []).slice(0, 8)
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
    resizeCharts() {
      if (this._bar) this._bar.resize()
      if (this._pie) this._pie.resize()
    },
    async exportCsv() {
      const a = api()
      if (!a || !a.usageExportCsv) return
      const res = await a.usageExportCsv()
      if (res && res.ok) {
        this.$message.success('已导出：' + res.filePath)
      }
    },
    fmtTokens(n) {
      const v = Number(n) || 0
      if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
      if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k'
      return String(v)
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-usage {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 22px 26px;
  display: flex;
  flex-direction: column;
  gap: 16px;

  &::-webkit-scrollbar {
    width: 5px;
  }
}

.ob-usage-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-shrink: 0;
}

.ob-usage-title {
  font-size: 17px;
  font-weight: 700;
  color: $text-primary;
}

.ob-usage-sub {
  margin-top: 3px;
  font-size: 12px;
  color: $text-secondary;
}

.ob-usage-actions {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ob-usage-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* 顶部数字卡 */
.ob-usage-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  flex-shrink: 0;
}

.ob-card {
  background: $card-bg;
  border: 1px solid $border-color;
  border-radius: 12px;
  padding: 14px 16px;
}

.ob-card-label {
  font-size: 12px;
  color: $text-secondary;
}

.ob-card-value {
  margin-top: 6px;
  font-size: 22px;
  font-weight: 700;
  color: $text-primary;
  font-variant-numeric: tabular-nums;
}

/* 面板 */
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

/* 双列：TOP5 + 模型分布 */
.ob-usage-cols {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
}

.ob-top-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
}

.ob-empty {
  padding: 28px 0;
  text-align: center;
  font-size: 12px;
  color: $text-secondary;
}

.ob-top-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;

  &:hover {
    background: $sidebar-item-hover;
  }
}

.ob-top-rank {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: $text-secondary;
  background: $sidebar-item-hover;
  flex-shrink: 0;

  &.rank-1 {
    color: #fff;
    background: linear-gradient(135deg, #f7ba2a, #f5a623);
  }

  &.rank-2 {
    color: #fff;
    background: linear-gradient(135deg, #b9bcc4, #909399);
  }

  &.rank-3 {
    color: #fff;
    background: linear-gradient(135deg, #e08d5c, #c8764a);
  }
}

.ob-top-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: $text-primary;
}

.ob-top-tokens {
  font-size: 12px;
  color: $text-secondary;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>
