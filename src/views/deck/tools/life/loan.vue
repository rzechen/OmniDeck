<template>
  <tool-shell
    title="贷款计算"
    desc="房贷计算器：等额本息 / 等额本金"
    icon="money"
    color="#13C2C2"
    back-path="/tools/life"
  >
    <div class="loan-layout">
      <!-- 参数区 -->
      <div class="loan-config">
        <div class="loan-field">
          <span class="loan-label">贷款金额</span>
          <div class="loan-input-group">
            <input v-model.number="amount" type="number" min="1" />
            <span class="loan-unit">万元</span>
          </div>
        </div>
        <div class="loan-field">
          <span class="loan-label">贷款期限</span>
          <div class="loan-input-group">
            <input v-model.number="years" type="number" min="1" max="50" />
            <span class="loan-unit">年（{{ months }} 期）</span>
          </div>
        </div>
        <div class="loan-field">
          <span class="loan-label">年利率</span>
          <div class="loan-input-group">
            <input v-model.number="rate" type="number" step="0.01" min="0.01" />
            <span class="loan-unit">%</span>
          </div>
        </div>
        <div class="loan-field">
          <span class="loan-label">还款方式</span>
          <div class="tool-seg" style="flex: 1">
            <div class="tool-seg-item" :class="{ active: mode === 'equal' }" @click="mode = 'equal'">等额本息</div>
            <div class="tool-seg-item" :class="{ active: mode === 'principal' }" @click="mode = 'principal'">等额本金</div>
          </div>
        </div>

        <!-- 汇总 -->
        <div v-if="summary" class="loan-summary">
          <div class="loan-sum-item">
            <span>月供</span>
            <b>{{ summary.monthlyFirst }}</b>
          </div>
          <div class="loan-sum-item">
            <span>还款总额</span>
            <b>{{ summary.total }}</b>
          </div>
          <div class="loan-sum-item">
            <span>支付利息</span>
            <b class="is-interest">{{ summary.interest }}</b>
          </div>
          <div v-if="mode === 'principal'" class="loan-sum-hint">
            首月 {{ summary.monthlyFirst }}，每月递减 {{ summary.decrease }}，末月 {{ summary.monthlyLast }}
          </div>
        </div>
      </div>

      <!-- 还款计划 -->
      <div class="loan-pane">
        <div class="loan-pane-header">
          <span class="pane-dot"></span>
          <span class="pane-title">还款计划表</span>
          <span>每年首期</span>
        </div>
        <div class="loan-table-wrap">
          <table class="loan-table">
            <thead>
              <tr>
                <th>期数</th>
                <th>月供</th>
                <th>本金</th>
                <th>利息</th>
                <th>剩余本金</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in yearRows" :key="r.index">
                <td class="mono">{{ r.index }}</td>
                <td class="mono">{{ r.monthly }}</td>
                <td class="mono">{{ r.principal }}</td>
                <td class="mono is-interest">{{ r.interest }}</td>
                <td class="mono">{{ r.remain }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span v-if="summary">{{ mode === 'equal' ? '等额本息' : '等额本金' }} · {{ months }} 期 · 利率 {{ rate }}%</span>
      <span v-else>输入贷款参数后自动计算</span>
      <span class="status-right">结果仅供参考</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'

// 千分位格式化
function fmt(n) {
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

defineOptions({ name: 'LifeLoan' })

const amount = ref(100)
const years = ref(30)
const rate = ref(3.6)
const mode = ref('equal')

const months = computed(() => years.value * 12)

// 完整还款计划
const schedule = computed(() => {
  if (!amount.value || !months.value || !rate.value) return null
  const P = amount.value * 10000
  const n = months.value
  const r = rate.value / 100 / 12 // 月利率
  const rows = []
  let totalInterest = 0
  if (mode.value === 'equal') {
    // 等额本息：月供 = P·r·(1+r)^n / ((1+r)^n - 1)
    const pow = (1 + r) ** n
    const m = (P * r * pow) / (pow - 1)
    let remain = P
    for (let i = 1; i <= n; i++) {
      const interest = remain * r
      const principal = m - interest
      remain -= principal
      totalInterest += interest
      rows.push({
        index: i,
        monthly: m,
        principal,
        interest,
        remain: Math.max(remain, 0)
      })
    }
  } else {
    // 等额本金：每月本金 = P/n，利息 = 剩余·r
    const base = P / n
    let remain = P
    for (let i = 1; i <= n; i++) {
      const interest = remain * r
      const monthly = base + interest
      remain -= base
      totalInterest += interest
      rows.push({
        index: i,
        monthly,
        principal: base,
        interest,
        remain: Math.max(remain, 0)
      })
    }
  }
  return { rows, totalInterest }
})

const summary = computed(() => {
  if (!schedule.value) return null
  const { rows, totalInterest } = schedule.value
  const P = amount.value * 10000
  return {
    monthlyFirst: fmt(rows[0].monthly) + ' 元',
    monthlyLast: fmt(rows[rows.length - 1].monthly) + ' 元',
    decrease: fmt(rows[0].monthly - rows[1].monthly) + ' 元',
    total: fmt(P + totalInterest) + ' 元',
    interest: fmt(totalInterest) + ' 元'
  }
})

// 每年首期（第 1、13、25... 期）
const yearRows = computed(() => {
  if (!schedule.value) return []
  return schedule.value.rows.filter(r => r.index === 1 || (r.index - 1) % 12 === 0).map(r => ({
    index: r.index,
    monthly: fmt(r.monthly),
    principal: fmt(r.principal),
    interest: fmt(r.interest),
    remain: fmt(r.remain)
  }))
})
</script>

<style lang="scss" scoped>
.loan-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 12px;
}

.loan-config {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

/* 还款计划面板：脱离 split-pane 结构，需自带 flex 布局 */
.loan-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.loan-pane-header {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 12px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;

  .pane-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--success-color);
    flex-shrink: 0;
  }

  .pane-title {
    flex: 1;
    min-width: 0;
  }
}

.loan-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.loan-label {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.loan-input-group {
  display: flex;
  align-items: center;
  height: 36px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--search-bg);
  transition: all 0.16s ease;

  &:focus-within {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 15px;
    font-weight: 600;
    color: var(--text-primary);

    &::-webkit-inner-spin-button {
      display: none;
    }
  }

  .loan-unit {
    font-size: 11.5px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }
}

.loan-summary {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: rgba(var(--primary-color-rgb), 0.05);
  border-radius: 10px;
}

.loan-sum-item {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 12px;
  color: var(--text-secondary);

  b {
    font-size: 14.5px;
    font-weight: 700;
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
  }

  .is-interest {
    color: #FA8C16;
  }
}

.loan-sum-hint {
  font-size: 10.5px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* 表格滚动容器：flex 子项 + 自身滚动 */
.loan-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  -webkit-app-region: no-drag;
}

.loan-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 8px 14px;
    text-align: right;
    font-size: 11px;
    color: var(--text-secondary);
    background-color: var(--card-bg);
    background-image: linear-gradient(var(--search-bg), var(--search-bg));
    border-bottom: 1px solid var(--border-color);
    white-space: nowrap;
  }

  td {
    padding: 7px 14px;
    text-align: right;
    border-bottom: 1px solid var(--border-color);
    color: var(--text-primary);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  tbody tr:hover td {
    background: rgba(var(--primary-color-rgb), 0.04);
  }

  .mono {
    font-family: 'SF Mono', Menlo, monospace;
  }

  .is-interest {
    color: #FA8C16;
  }
}
</style>
