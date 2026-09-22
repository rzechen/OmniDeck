<template>
  <!-- 顶部数字卡：今日输入/输出、窗口合计、活跃会话 -->
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
</template>

<script>
// 用量数字卡（今日 / 窗口合计 / 会话数）：纯展示，数据由页面 summary 编排传入
export default {
  name: 'UsageStatCards',
  props: {
    // 主进程聚合结果（today / total / sessionCount）
    summary: {
      type: Object,
      default: () => ({})
    },
    // 统计窗口天数（7 / 30），用于合计卡标签
    days: {
      type: Number,
      default: 30
    }
  },
  computed: {
    today() {
      return this.summary.today || { input: 0, output: 0 }
    },
    total() {
      return this.summary.total || { input: 0, output: 0 }
    }
  },
  methods: {
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
</style>
