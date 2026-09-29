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
        <el-button size="small" @click="exportCsv"><i class="el-icon-download" /> 导出 CSV</el-button>
      </div>
    </div>

    <div class="ob-usage-body">
      <!-- 加载骨架：指标卡 + 行（替代 v-loading 遮罩） -->
      <div v-if="loading" class="ob-sk-wrap" style="padding: 18px 4px">
        <buddy-skeleton type="stats" :count="6" />
      </div>

      <template v-else>
        <!-- 顶部数字卡：今日 / 窗口合计 / 任务数 -->
        <usage-stat-cards :summary="summary" :days="days" />

        <!-- 日用量柱状图 -->
        <daily-bar-chart :days="summary.daily" />

        <div class="ob-usage-cols">
          <!-- 任务 TOP5（已删除任务显示快照名 + 已删除标识） -->
          <top-sessions :sessions="top5" />

          <!-- 模型分布 -->
          <model-pie-chart :models="summary.models" />
        </div>
      </template>
    </div>
  </div>
</template>

<script>
// 用量统计（N4 / §18.2）：主进程 summarize 聚合好三维数据，页面只做数据编排；
// 卡片 / 柱状图 / 饼图 / TOP5 榜单拆分为 components/ 下 co-locate 子组件
import { buddyApi } from '@/utils/buddy-api'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
import UsageStatCards from './components/UsageStatCards.vue'
import DailyBarChart from './components/DailyBarChart.vue'
import ModelPieChart from './components/ModelPieChart.vue'
import TopSessions from './components/TopSessions.vue'

export default {
  name: 'OmniBuddyUsage',
  components: { BuddySkeleton, UsageStatCards, DailyBarChart, ModelPieChart, TopSessions },
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
    top5() {
      return this.summary.top5 || []
    }
  },
  mounted() {
    this.load()
  },
  methods: {
    async load() {
      const a = buddyApi()
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
      } finally {
        this.loading = false
      }
    },
    async exportCsv() {
      const a = buddyApi()
      if (!a || !a.usageExportCsv) return
      const res = await a.usageExportCsv()
      if (res && res.ok) {
        this.$message.success('已导出：' + res.filePath)
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-usage {
  flex: 1;
  min-width: 0;
  // 页面自身不滚动：头部固定，滚动下放至 .ob-usage-body（与工作空间页一致）
  overflow: hidden;
  padding: 22px 26px;
  display: flex;
  flex-direction: column;
  gap: 16px;
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
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 5px;
  }
}

/* 双列：TOP5 + 模型分布 */
.ob-usage-cols {
  display: grid;
  grid-template-columns: 3fr 2fr;
  gap: 16px;
  flex: 1;
  min-height: 0;
}
</style>
