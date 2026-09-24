<template>
  <tool-shell
    title="贵金属"
    desc="金银铂钯实时行情与换算"
    icon="gold"
    color="#FAAD14"
  >
    <template #toolbar>
      <!-- 循环倒计时刷新按钮（与基金页同模式）：29s→…→1s→刷新中…→已更新→29s -->
      <button
        class="tool-btn gold-cd-btn"
        :class="cdState"
        :title="cdTitle"
        @click="manualRefresh"
      >
        <i
          class="el-icon-refresh"
          :class="{ 'is-rotating': cdState === 'refreshing' }"
        ></i>
        <span class="gold-cd-text mono">{{ cdText }}</span>
      </button>
    </template>

    <div class="gold-page">
      <!-- 骨架屏：首轮加载 -->
      <div v-if="booting" class="gold-skel">
        <div class="sk-row">
          <div class="sk sk-wide"></div>
        </div>
        <div class="sk-grid">
          <div v-for="i in 8" :key="i" class="sk sk-card"></div>
        </div>
      </div>

      <!-- 错误态 -->
      <div v-else-if="loadError && !hasData" class="gold-error">
        <i class="el-icon-warning-outline"></i>
        <span>{{ loadError }}</span>
        <el-button size="small" round @click="manualRefresh">重试</el-button>
      </div>

      <template v-else>
        <!-- 伦敦金人民币换算条 -->
        <div v-if="cnGold !== null" class="gold-convert">
          <div class="gc-item">
            <span class="gc-label">伦敦金折人民币</span>
            <animated-number class="gc-value" :value="cnGold" :duration="700" />
            <span class="gc-unit">元/克</span>
          </div>
          <div class="gc-divider"></div>
          <div class="gc-item">
            <span class="gc-label">美元人民币</span>
            <span class="gc-value is-plain">{{ usdCnyText }}</span>
          </div>
          <div class="gc-divider"></div>
          <div class="gc-item">
            <span class="gc-label">对照 黄金 T+D</span>
            <span class="gc-value is-plain">{{ autdText }}</span>
            <span class="gc-unit">元/克</span>
          </div>
        </div>

        <!-- 分组行情卡片 -->
        <div class="gold-scroll">
          <div v-for="g in groupsWithData" :key="g" class="gold-group">
            <div class="gg-header">
              <span class="gg-title">{{ g }}</span>
              <span class="gg-line"></span>
            </div>
            <div class="gg-grid">
              <div
                v-for="v in varietiesOf(g)"
                :key="v.key"
                class="gg-card"
                :class="flashClass(v.key)"
              >
                <div class="gg-head">
                  <span class="gg-name">{{ v.name }}</span>
                  <span class="gg-sub">{{ v.sub }}</span>
                </div>
                <div class="gg-price-row">
                  <span class="gg-price">{{ fmtNum(quotes[v.key] && quotes[v.key].price, v.digits) }}</span>
                  <span class="gg-unit">{{ v.unit }}</span>
                </div>
                <span
                  v-if="quotes[v.key] && quotes[v.key].pct !== null"
                  class="gg-pct"
                  :class="pctClass(quotes[v.key].pct)"
                >
                  {{ pctText(quotes[v.key].pct, quotes[v.key].change) }}
                </span>
                <div class="gg-detail">
                  <span>今开 {{ fmtNum(quotes[v.key] && quotes[v.key].open, v.digits, true) }}</span>
                  <span>最高 {{ fmtNum(quotes[v.key] && quotes[v.key].high, v.digits) }}</span>
                  <span>最低 {{ fmtNum(quotes[v.key] && quotes[v.key].low, v.digits) }}</span>
                  <span>昨收 {{ fmtNum(quotes[v.key] && quotes[v.key].prevClose, v.digits) }}</span>
                </div>
                <div class="gg-time">{{ quoteTime(v.key) }}</div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>贵金属 · 实时行情</span>
      <span class="status-right">最后刷新 {{ updateTime || '—' }} · 数据源：黄金价格网（新浪行情） · 红涨绿跌</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import AnimatedNumber from '@/components/deck/AnimatedNumber.vue'
import { GOLD_API, GOLD_VARIETIES, GOLD_GROUPS, OZ_TO_GRAM } from '@/config/gold-api'
import { fetchGoldQuotes } from '@/utils/gold'

export default {
  name: 'FinanceGold',
  components: { ToolShell, AnimatedNumber },
  data() {
    return {
      booting: true,
      loadError: '',
      quotes: {},
      usdCny: null,
      // 最后刷新时间：年-月-日 时:分:秒
      updateTime: '',
      // 涨跌闪烁方向：{ key: 'up' | 'down' }
      flash: {},
      // 循环倒计时状态机（与基金页同模式）：counting(倒数) → refreshing(刷新中) → success(成功2s) → counting
      cdState: 'counting',
      cdSec: 29
    }
  },
  computed: {
    // 伦敦金折人民币克价：XAU(美元/盎司) / 金衡盎司 * USDCNY
    cnGold() {
      const xau = this.quotes && this.quotes.hf_XAU
      if (!xau || this.usdCny === null) return null
      return Math.round((xau.price / OZ_TO_GRAM) * this.usdCny * 100) / 100
    },
    usdCnyText() {
      return this.usdCny === null ? '—' : this.usdCny.toFixed(4)
    },
    autdText() {
      const q = this.quotes && this.quotes.gds_AUTD
      return q ? q.price.toFixed(2) : '—'
    },
    hasData() {
      return Object.keys(this.quotes).length > 0
    },
    groupsWithData() {
      return GOLD_GROUPS.filter(g => this.varietiesOf(g).length > 0)
    },
    /* ============ 倒计时按钮文案（与基金页同模式） ============ */
    cdText() {
      if (this.cdState === 'refreshing') return '刷新中...'
      if (this.cdState === 'success') return '已更新'
      if (this.cdState === 'fail') return '刷新失败'
      return this.cdSec + 's'
    },
    cdTitle() {
      if (this.cdState === 'refreshing') return '正在获取最新行情…'
      if (this.cdState === 'success') return '行情已更新'
      return '点击立即刷新 · ' + this.cdSec + 's 后自动刷新'
    }
  },
  mounted() {
    // 非 data 实例属性（Vue 2 不代理 _ 前缀 data key，勿放入 data）
    this.tickTimer = null
    this.flashTimers = {}
    this.startRefresh()
    // 统一 1s tick 驱动倒计时状态机
    this.tickTimer = setInterval(this.onTick, 1000)
  },
  beforeDestroy() {
    clearInterval(this.tickTimer)
    Object.values(this.flashTimers || {}).forEach(clearTimeout)
  },
  methods: {
    varietiesOf(group) {
      return GOLD_VARIETIES.filter(v => v.group === group && this.quotes[v.key])
    },
    onTick() {
      if (this.cdState === 'counting') {
        this.cdSec--
        if (this.cdSec <= 0) this.startRefresh()
      }
    },
    // 触发一轮刷新（倒计时归零或手动点击）
    startRefresh() {
      if (this.cdState === 'refreshing') return
      this.cdState = 'refreshing'
      this.refresh().then(() => {
        // 有失败显示失败态，否则成功态；均停留 2s 后回到倒数
        this.cdState = this.loadError ? 'fail' : 'success'
        clearTimeout(this._cdTimer)
        this._cdTimer = setTimeout(() => {
          this.cdState = 'counting'
          this.cdSec = Math.floor(GOLD_API.refresh / 1000) - 1
        }, 2000)
      })
    },
    manualRefresh() {
      if (this.cdState === 'refreshing') return
      this.startRefresh()
    },
    async refresh() {
      // 记录刷新前价格，用于涨跌闪烁方向判断
      const prev = {}
      Object.keys(this.quotes).forEach(k => {
        if (this.quotes[k]) prev[k] = this.quotes[k].price
      })
      try {
        const data = await fetchGoldQuotes(true)
        if (!data || !data.quotes) throw new Error('行情数据解析失败')
        const now = new Date()
        const pad = n => String(n).padStart(2, '0')
        this.updateTime = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`
        this.usdCny = data.usdCny
        Object.keys(data.quotes).forEach(k => {
          if (prev[k] !== undefined && data.quotes[k].price !== prev[k]) {
            this.setFlash(k, data.quotes[k].price > prev[k] ? 'up' : 'down')
          }
        })
        this.quotes = data.quotes
        this.loadError = ''
      } catch (e) {
        this.loadError = (e && e.message) || '行情获取失败'
      } finally {
        this.booting = false
      }
    },
    setFlash(key, dir) {
      // 红涨绿跌闪烁（与基金页同模式）：0.9s 后清除
      this.$set(this.flash, key, dir)
      clearTimeout(this.flashTimers[key])
      this.flashTimers[key] = setTimeout(() => {
        this.$delete(this.flash, key)
      }, 900)
    },
    flashClass(key) {
      const d = this.flash[key]
      return d === 'up' ? 'is-flash-up' : (d === 'down' ? 'is-flash-down' : '')
    },
    pctClass(pct) {
      return pct > 0 ? 'is-up' : (pct < 0 ? 'is-down' : 'is-flat')
    },
    pctText(pct, change) {
      const sign = pct > 0 ? '+' : ''
      return `${sign}${pct.toFixed(2)}%${change !== null && change !== undefined ? ' ' + sign + change : ''}`
    },
    fmtNum(v, digits, dashZero) {
      if (v === null || v === undefined) return '—'
      if (dashZero && !v) return '—'
      return Number(v).toFixed(digits)
    },
    // 行情时间：年-月-日 时:分:秒
    quoteTime(key) {
      const q = this.quotes && this.quotes[key]
      if (!q || !q.date) return ''
      return `${q.date} ${q.time || ''}`.trim()
    }
  }
}
</script>

<style lang="scss" scoped>
.gold-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  -webkit-app-region: no-drag;
}

/* ============ 骨架屏 ============ */
.gold-skel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.sk {
  background: linear-gradient(90deg, var(--search-bg) 25%, var(--border-color) 37%, var(--search-bg) 63%);
  background-size: 400% 100%;
  animation: gold-sk-wave 1.3s ease infinite;
  border-radius: 8px;
}

@keyframes gold-sk-wave {
  0% { background-position: 100% 50%; }
  100% { background-position: 0 50%; }
}

html.reduce-motion .sk {
  animation: none;
}

.sk-row .sk-wide {
  height: 56px;
  border-radius: 12px;
}

.sk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}

.sk-card {
  height: 128px;
  border-radius: 12px;
}

/* ============ 错误态 ============ */
.gold-error {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 13px;

  i {
    font-size: 32px;
    color: var(--danger-color, #F56C6C);
  }
}

/* ============ 换算条 ============ */
.gold-convert {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-shrink: 0;
  padding: 12px 18px;
  border-radius: 12px;
  border: 1px solid rgba(250, 173, 20, 0.28);
  background: linear-gradient(115deg, rgba(250, 173, 20, 0.12) 0%, rgba(250, 173, 20, 0.04) 60%, transparent 100%);
}

.gc-item {
  display: flex;
  align-items: baseline;
  gap: 6px;
  min-width: 0;
}

.gc-label {
  font-size: 12px;
  color: var(--text-secondary);
  flex-shrink: 0;
}

.gc-value {
  font-size: 17px;
  font-weight: 700;
  color: #FAAD14;
  font-variant-numeric: tabular-nums;

  &.is-plain {
    color: var(--text-primary);
  }
}

.gc-unit {
  font-size: 11px;
  color: var(--text-secondary);
}

.gc-divider {
  width: 1px;
  height: 22px;
  background: var(--border-color);
  flex-shrink: 0;
}

/* ============ 倒计时刷新按钮（与基金页同模式） ============ */
.gold-cd-btn {
  min-width: 92px;
  justify-content: center;
  font-variant-numeric: tabular-nums;

  .gold-cd-text {
    font-size: 12px;
    font-weight: 600;
  }

  // 倒计时中：数字用主题色
  &.counting .gold-cd-text {
    color: var(--primary-color);
  }

  // 刷新中：旋转图标 + 主题色描边
  &.refreshing {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    color: var(--primary-color);
  }

  // 成功态：绿色反馈
  &.success {
    border-color: rgba(82, 196, 26, 0.55);
    color: #52C41A;
    animation: gold-cd-pop 0.3s ease;
  }

  // 失败态：橙色提示
  &.fail {
    border-color: rgba(250, 140, 22, 0.6);
    color: #FA8C16;
  }
}

@keyframes gold-cd-pop {
  0% { transform: scale(0.92); }
  100% { transform: scale(1); }
}

/* 刷新中：图标旋转 */
.is-rotating {
  animation: gold-rotate 0.9s linear infinite;
}

@keyframes gold-rotate {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

html.reduce-motion .is-rotating {
  animation: none;
}

/* ============ 分组行情 ============ */
.gold-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.gg-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;

  .gg-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
    flex-shrink: 0;
  }

  .gg-line {
    flex: 1;
    height: 1px;
    background: var(--border-color);
  }
}

.gg-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}

.gg-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: box-shadow 0.18s ease, border-color 0.18s ease;

  &:hover {
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.06);
    border-color: rgba(250, 173, 20, 0.35);
  }
}

.gg-head {
  display: flex;
  align-items: baseline;
  gap: 8px;

  .gg-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .gg-sub {
    font-size: 11px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.gg-price-row {
  display: flex;
  align-items: baseline;
  gap: 6px;

  .gg-price {
    font-size: 21px;
    font-weight: 700;
    color: var(--text-primary);
    font-family: 'SF Mono', Menlo, monospace;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.3px;
    line-height: 1;
  }

  .gg-unit {
    font-size: 10.5px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }
}

/* 涨跌幅徽章：独占一行 */
.gg-pct {
  align-self: flex-start;
  font-size: 12px;
  font-weight: 600;
  font-family: 'SF Mono', Menlo, monospace;
  padding: 1px 8px;
  border-radius: 999px;
  white-space: nowrap;

  &.is-up {
    color: #F5222D;
    background: rgba(245, 34, 45, 0.08);
  }

  &.is-down {
    color: #52C41A;
    background: rgba(82, 196, 26, 0.1);
  }

  &.is-flat {
    color: var(--text-secondary);
    background: var(--search-bg);
  }
}

.gg-detail {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.gg-time {
  font-size: 10.5px;
  color: var(--text-secondary);
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

/* 涨跌闪烁（红涨绿跌，与基金页同模式） */
@keyframes gold-flash-up {
  0% { background: rgba(245, 34, 45, 0.12); }
  100% { background: var(--card-bg); }
}

@keyframes gold-flash-down {
  0% { background: rgba(82, 196, 26, 0.14); }
  100% { background: var(--card-bg); }
}

.gg-card.is-flash-up {
  animation: gold-flash-up 0.9s ease;
}

.gg-card.is-flash-down {
  animation: gold-flash-down 0.9s ease;
}

html.reduce-motion .gg-card {
  &.is-flash-up,
  &.is-flash-down {
    animation: none;
  }
}
</style>
