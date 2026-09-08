<template>
  <tool-shell
    :title="name || ('基金 ' + code)"
    :desc="'实时估值与历史净值 · ' + code"
    icon="fund"
    color="#F5222D"
    back-path="/finance/fund"
  >
    <template #toolbar>
      <button class="tool-btn" :class="{ 'is-disabled': loadingQuote }" @click="loadQuote(true)">
        <i class="el-icon-refresh" :class="{ 'is-rotating': loadingQuote }"></i>刷新估值
      </button>
      <button class="tool-btn" @click="openExternal">
        <i class="el-icon-link"></i>东方财富
      </button>
    </template>

    <div class="fd-page">
      <!-- 顶部概要：实时估值 + 我的持仓（横条，不随 Tab 切换） -->
      <div class="fd-overview">
        <div class="fd-ov-quote">
          <template v-if="quote">
            <div class="fd-ov-main">
              <span class="fd-ov-label">{{ trading ? '估算净值' : '单位净值' }}</span>
              <span class="fd-ov-value mono" :style="{ color: riseColor(quote.estPct) }">
                {{ quote.estimate.toFixed(4) }}
              </span>
              <span class="fd-ov-pct mono" :style="{ color: riseColor(quote.estPct) }">
                {{ fmtPct(quote.estPct, true) }}
              </span>
            </div>
            <div class="fd-ov-sub mono">
              昨收 {{ quote.nav.toFixed(4) }}（{{ fmtPct(quote.navPct, true) }}）
              <span v-if="quote.time"> · {{ fmtQuoteDate(quote.date) }} {{ fmtQuoteTime(quote.time) }}</span>
            </div>
          </template>
          <!-- 骨架屏：估值加载中 -->
          <div v-else-if="loadingQuote" class="fd-ov-skeleton">
            <div class="fd-sk fd-sk-wave" style="width: 54px; height: 12px"></div>
            <div class="fd-sk fd-sk-wave" style="width: 200px; height: 24px; margin-top: 8px"></div>
            <div class="fd-sk fd-sk-wave" style="width: 150px; height: 11px; margin-top: 8px"></div>
          </div>
          <div v-else class="fd-ov-loading">
            <i class="el-icon-warning"></i>
            <span>{{ quoteError }}</span>
          </div>
        </div>

        <div v-if="position" class="fd-ov-pos">
          <span class="fd-ov-pos-title">我的持仓</span>
          <div class="fd-ov-pos-cells mono">
            <span class="fd-ov-cell">
              <em>市值</em>
              <b>¥ {{ fmtMoney(myProfit.marketValue) }}</b>
            </span>
            <span class="fd-ov-cell" :style="{ color: riseColor(myProfit.todayProfit) }">
              <em>当日</em>
              <b>{{ fmtMoney(myProfit.todayProfit, true) }}</b>
            </span>
            <span class="fd-ov-cell" :style="{ color: riseColor(myProfit.profit) }">
              <em>持仓</em>
              <b>{{ fmtMoney(myProfit.profit, true) }} {{ fmtPct(myProfit.profitRate, true) }}</b>
            </span>
          </div>
          <router-link class="fd-ov-pos-link" to="/finance/fund">管理 ›</router-link>
        </div>
      </div>

      <!-- Tab 容器 -->
      <div class="fd-tabs">
        <div class="fd-tab-nav">
          <div
            v-for="t in TABS"
            :key="t.key"
            class="fd-tab-item"
            :class="{ active: activeTab === t.key }"
            @click="activeTab = t.key"
          >{{ t.label }}</div>
        </div>
        <div class="fd-tab-body">
          <!-- ============ Tab 1：估值走势 ============ -->
          <div v-show="activeTab === 'trend'" class="fd-trend">
            <!-- 盘中分时 -->
            <div class="fd-chart-block">
              <div class="fd-chart-title">
                盘中分时
                <span v-if="quote && quote.time" class="fd-ct-time mono">{{ fmtQuoteDate(quote.date) }} {{ fmtQuoteTime(quote.time) }}</span>
              </div>
              <div
                class="fd-chart fd-chart-lg"
                @mousemove="onChartMove($event, 'intraHover', intraXY)"
                @mouseleave="intraHover = null"
              >
                <svg viewBox="0 0 560 220" preserveAspectRatio="none">
                  <!-- y 轴网格线（刻度文字用 HTML 层，避免 SVG 拉伸变形） -->
                  <g v-if="intraTicks.length">
                    <line
                      v-for="tk in intraTicks"
                      :key="'tk' + tk.y"
                      :x1="0" :x2="560" :y1="tk.y" :y2="tk.y"
                      class="fd-grid-line"
                    />
                  </g>
                  <line
                    v-if="intraXY.length && intraBaseY"
                    :x1="0" :x2="560" :y1="intraBaseY" :y2="intraBaseY"
                    class="fd-base-line"
                  />
                  <defs>
                    <linearGradient :id="'intraGrad' + code" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" :stop-color="intraColor" stop-opacity="0.26" />
                      <stop offset="100%" :stop-color="intraColor" stop-opacity="0.02" />
                    </linearGradient>
                  </defs>
                  <path v-if="intraPath" :d="intraArea" :fill="`url(#intraGrad${code})`" />
                  <path v-if="intraPath" :d="intraPath" fill="none" :stroke="intraColor" stroke-width="1.6" vector-effect="non-scaling-stroke" />
                  <!-- 悬停指示线（数据点用 HTML 层，避免 SVG 拉伸变形） -->
                  <line
                    v-if="intraHover"
                    :x1="intraXY[intraHover.i].x" :x2="intraXY[intraHover.i].x"
                    y1="0" y2="220" class="fd-cursor-line"
                  />
                </svg>
                <!-- 悬停数据点（HTML 圆点，不受 viewBox 非等比拉伸影响） -->
                <span
                  v-if="intraHover"
                  class="fd-hover-point"
                  :style="{
                    left: (intraXY[intraHover.i].x / 560 * 100) + '%',
                    top: (intraXY[intraHover.i].y / 220 * 100) + '%',
                    background: intraColor
                  }"
                ></span>
                <!-- y 轴刻度（右侧百分比轴，0% 处显示昨收价） -->
                <span
                  v-for="tk in intraTicks"
                  :key="'tl' + tk.y"
                  class="fd-ylabel mono"
                  :class="{ 'is-base': tk.isZero }"
                  :style="{ top: (tk.y / 220 * 100) + '%' }"
                >{{ tk.label }}</span>
                <!-- 最新估值胶囊（跟随折线末端） -->
                <span
                  v-if="intraXY.length && quote"
                  class="fd-last-tag mono"
                  :class="quote.estPct >= 0 ? 'up' : 'down'"
                  :style="{ top: (intraXY[intraXY.length - 1].y / 220 * 100) + '%' }"
                >{{ quote.estimate.toFixed(4) }}</span>
                <!-- x 轴刻度（5 等分） -->
                <div v-if="intraXTicks.length" class="fd-xaxis">
                  <span
                    v-for="(t, k) in intraXTicks"
                    :key="'x' + k"
                    :class="{ first: t.first, last: t.last }"
                    :style="{ left: t.pct + '%' }"
                  >{{ t.label }}</span>
                </div>
                <div v-if="!intraXY.length && !loadingQuote" class="fd-chart-empty">今日暂无盘中估值数据</div>
                <!-- 骨架屏：估值/分时加载中 -->
                <div v-if="!intraXY.length && loadingQuote" class="fd-sk-chart">
                  <div class="fd-sk fd-sk-wave" style="width: 100%; height: 100%; border-radius: 10px"></div>
                </div>
                <!-- Tooltip -->
                <div
                  v-if="intraHover"
                  class="fd-tip mono"
                  :style="tipPos(intraXY[intraHover.i], 220)"
                >
                  <span class="fd-tip-time">{{ intraXY[intraHover.i].t }}</span>
                  <span class="fd-tip-val">{{ intraXY[intraHover.i].v.toFixed(4) }}</span>
                  <span :style="{ color: tipPctColor(intraXY[intraHover.i].pct) }">
                    {{ fmtPct(intraXY[intraHover.i].pct, true) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 历史走势（时间范围切换） -->
            <div class="fd-chart-block">
              <div class="fd-chart-title">
                历史走势
                <span v-if="rangePct !== null" class="mono" :style="{ color: riseColor(rangePct) }">
                  {{ fmtPct(rangePct, true) }}
                </span>
                <div class="tool-seg fd-range-seg">
                  <div
                    v-for="r in RANGES"
                    :key="r.key"
                    class="tool-seg-item"
                    :class="{ active: range === r.key }"
                    @click="range = r.key"
                  >{{ r.label }}</div>
                </div>
              </div>
              <div
                class="fd-chart fd-chart-lg"
                @mousemove="onChartMove($event, 'trendHover', trendXY)"
                @mouseleave="trendHover = null"
              >
                <svg viewBox="0 0 560 240" preserveAspectRatio="none">
                  <!-- y 轴网格线（刻度文字用 HTML 层） -->
                  <g v-if="trendTicks.length">
                    <line
                      v-for="tk in trendTicks"
                      :key="'tk' + tk.y"
                      :x1="0" :x2="560" :y1="tk.y" :y2="tk.y"
                      class="fd-grid-line"
                    />
                  </g>
                  <line
                    v-if="trendXY.length && trendBaseY"
                    :x1="0" :x2="560" :y1="trendBaseY" :y2="trendBaseY"
                    class="fd-base-line"
                  />
                  <defs>
                    <linearGradient :id="'trendGrad' + code" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" :stop-color="trendColor" stop-opacity="0.24" />
                      <stop offset="100%" :stop-color="trendColor" stop-opacity="0.02" />
                    </linearGradient>
                  </defs>
                  <path v-if="trendPath" :d="trendArea" :fill="`url(#trendGrad${code})`" />
                  <path v-if="trendPath" :d="trendPath" fill="none" :stroke="trendColor" stroke-width="1.5" vector-effect="non-scaling-stroke" />
                  <line
                    v-if="trendHover"
                    :x1="trendXY[trendHover.i].x" :x2="trendXY[trendHover.i].x"
                    y1="0" y2="240" class="fd-cursor-line"
                  />
                </svg>
                <!-- 悬停数据点（HTML 圆点，不受 viewBox 非等比拉伸影响） -->
                <span
                  v-if="trendHover"
                  class="fd-hover-point"
                  :style="{
                    left: (trendXY[trendHover.i].x / 560 * 100) + '%',
                    top: (trendXY[trendHover.i].y / 240 * 100) + '%',
                    background: trendColor
                  }"
                ></span>
                <!-- y 轴刻度（右侧净值轴） -->
                <span
                  v-for="tk in trendTicks"
                  :key="'tl' + tk.y"
                  class="fd-ylabel mono"
                  :style="{ top: (tk.y / 240 * 100) + '%' }"
                >{{ tk.label }}</span>
                <!-- 最新净值胶囊 -->
                <span
                  v-if="trendXY.length"
                  class="fd-last-tag mono"
                  :class="rangePct >= 0 ? 'up' : 'down'"
                  :style="{ top: (trendXY[trendXY.length - 1].y / 240 * 100) + '%' }"
                >{{ trendXY[trendXY.length - 1].nav.toFixed(4) }}</span>
                <!-- x 轴刻度（5 等分） -->
                <div v-if="trendXTicks.length" class="fd-xaxis">
                  <span
                    v-for="(t, k) in trendXTicks"
                    :key="'x' + k"
                    :class="{ first: t.first, last: t.last }"
                    :style="{ left: t.pct + '%' }"
                  >{{ t.label }}</span>
                </div>
                <div v-if="!trendXY.length && !loadingHist" class="fd-chart-empty">
                  {{ histError || '暂无数据' }}
                </div>
                <!-- 骨架屏：历史净值加载中 -->
                <div v-if="!trendXY.length && loadingHist" class="fd-sk-chart">
                  <div class="fd-sk fd-sk-wave" style="width: 100%; height: 100%; border-radius: 10px"></div>
                </div>
                <div
                  v-if="trendHover"
                  class="fd-tip mono"
                  :style="tipPos(trendXY[trendHover.i], 240)"
                >
                  <span class="fd-tip-time">{{ trendXY[trendHover.i].date }}</span>
                  <span class="fd-tip-val">{{ trendXY[trendHover.i].nav.toFixed(4) }}</span>
                  <span :style="{ color: tipPctColor(trendXY[trendHover.i].pct) }">
                    {{ fmtPct(trendXY[trendHover.i].pct, true) }}
                  </span>
                </div>
              </div>
            </div>
          </div>

          <!-- ============ Tab 2：历史净值 ============ -->
          <div v-show="activeTab === 'nav'" class="fd-nav-tab">
            <!-- 全量走势（时间范围切换） -->
            <div class="fd-chart-block">
              <div class="fd-chart-title">
                净值走势
                <span v-if="navRangePct !== null" class="mono" :style="{ color: riseColor(navRangePct) }">
                  {{ fmtPct(navRangePct, true) }}
                </span>
                <div class="tool-seg fd-range-seg">
                  <div
                    v-for="r in RANGES"
                    :key="r.key"
                    class="tool-seg-item"
                    :class="{ active: navRange === r.key }"
                    @click="navRange = r.key"
                  >{{ r.label }}</div>
                </div>
              </div>
              <div
                class="fd-chart fd-chart-lg"
                @mousemove="onChartMove($event, 'navHover', navXY)"
                @mouseleave="navHover = null"
              >
                <svg viewBox="0 0 560 240" preserveAspectRatio="none">
                  <!-- y 轴网格线（刻度文字用 HTML 层） -->
                  <g v-if="navTicks.length">
                    <line
                      v-for="tk in navTicks"
                      :key="'tk' + tk.y"
                      :x1="0" :x2="560" :y1="tk.y" :y2="tk.y"
                      class="fd-grid-line"
                    />
                  </g>
                  <line
                    v-if="navXY.length && navBaseY"
                    :x1="0" :x2="560" :y1="navBaseY" :y2="navBaseY"
                    class="fd-base-line"
                  />
                  <defs>
                    <linearGradient :id="'navGrad' + code" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" :stop-color="navColor" stop-opacity="0.24" />
                      <stop offset="100%" :stop-color="navColor" stop-opacity="0.02" />
                    </linearGradient>
                  </defs>
                  <path v-if="navPath" :d="navArea" :fill="`url(#navGrad${code})`" />
                  <path v-if="navPath" :d="navPath" fill="none" :stroke="navColor" stroke-width="1.5" vector-effect="non-scaling-stroke" />
                  <line
                    v-if="navHover"
                    :x1="navXY[navHover.i].x" :x2="navXY[navHover.i].x"
                    y1="0" y2="240" class="fd-cursor-line"
                  />
                </svg>
                <!-- 悬停数据点（HTML 圆点，不受 viewBox 非等比拉伸影响） -->
                <span
                  v-if="navHover"
                  class="fd-hover-point"
                  :style="{
                    left: (navXY[navHover.i].x / 560 * 100) + '%',
                    top: (navXY[navHover.i].y / 240 * 100) + '%',
                    background: navColor
                  }"
                ></span>
                <!-- y 轴刻度（右侧净值轴） -->
                <span
                  v-for="tk in navTicks"
                  :key="'tl' + tk.y"
                  class="fd-ylabel mono"
                  :style="{ top: (tk.y / 240 * 100) + '%' }"
                >{{ tk.label }}</span>
                <!-- 最新净值胶囊 -->
                <span
                  v-if="navXY.length"
                  class="fd-last-tag mono"
                  :class="navRangePct >= 0 ? 'up' : 'down'"
                  :style="{ top: (navXY[navXY.length - 1].y / 240 * 100) + '%' }"
                >{{ navXY[navXY.length - 1].nav.toFixed(4) }}</span>
                <!-- x 轴刻度（5 等分） -->
                <div v-if="navXTicks.length" class="fd-xaxis">
                  <span
                    v-for="(t, k) in navXTicks"
                    :key="'x' + k"
                    :class="{ first: t.first, last: t.last }"
                    :style="{ left: t.pct + '%' }"
                  >{{ t.label }}</span>
                </div>
                <div v-if="!navXY.length && !loadingHist" class="fd-chart-empty">
                  {{ histError || '暂无数据' }}
                </div>
                <!-- 骨架屏：历史净值加载中 -->
                <div v-if="loadingHist && !navXY.length" class="fd-sk-chart">
                  <div class="fd-sk fd-sk-wave" style="width: 100%; height: 100%; border-radius: 10px"></div>
                </div>
                <div
                  v-if="navHover"
                  class="fd-tip mono"
                  :style="tipPos(navXY[navHover.i], 240)"
                >
                  <span class="fd-tip-time">{{ navXY[navHover.i].date }}</span>
                  <span class="fd-tip-val">{{ navXY[navHover.i].nav.toFixed(4) }}</span>
                  <span :style="{ color: tipPctColor(navXY[navHover.i].pct) }">
                    {{ fmtPct(navXY[navHover.i].pct, true) }}
                  </span>
                </div>
              </div>
            </div>

            <!-- 净值列表（倒序全量，滚动） -->
            <div class="fd-nav-list">
              <div class="fd-nav-header">
                <span>日期</span><span>单位净值</span><span>日涨幅</span>
              </div>
              <div class="fd-nav-rows">
                <div v-for="p in reversedNavs" :key="p.date" class="fd-nav-row">
                  <span>{{ p.date.slice(5) }}</span>
                  <span class="mono">{{ p.nav.toFixed(4) }}</span>
                  <span class="mono" :style="{ color: riseColor(p.pct) }">{{ fmtPct(p.pct, true) }}</span>
                </div>
                <div v-if="!reversedNavs.length" class="fd-nav-empty">
                  {{ loadingHist ? '加载中…' : '暂无数据' }}
                </div>
              </div>
            </div>
          </div>

          <!-- ============ Tab 3：基金信息 ============ -->
          <div v-show="activeTab === 'info'" class="fd-info">
            <!-- 骨架屏：基金信息加载中 -->
            <template v-if="loadingInfo">
              <div class="fd-info-grid">
                <div v-for="n in 10" :key="'sk' + n" class="fd-info-item">
                  <div class="fd-sk fd-sk-wave" style="width: 56px; height: 10px"></div>
                  <div class="fd-sk fd-sk-wave" style="width: 70%; height: 13px; margin-top: 6px"></div>
                </div>
              </div>
              <div class="fd-mgr-card">
                <div class="fd-sk fd-sk-wave" style="width: 42px; height: 42px; border-radius: 50%"></div>
                <div style="flex: 1">
                  <div class="fd-sk fd-sk-wave" style="width: 120px; height: 14px"></div>
                  <div class="fd-sk fd-sk-wave" style="width: 200px; height: 11px; margin-top: 8px"></div>
                </div>
              </div>
            </template>
            <template v-else>
              <div v-if="infoFields.length" class="fd-info-grid">
                <div v-for="f in infoFields" :key="f.label" class="fd-info-item">
                  <span class="fd-info-label">{{ f.label }}</span>
                  <span class="fd-info-value" :title="f.value">{{ f.value }}</span>
                </div>
              </div>
              <div v-else class="fd-chart-empty fd-info-empty">
                暂无基金信息
              </div>

              <!-- 现任基金经理 -->
              <div v-if="managers.length" class="fd-mgr">
                <div class="fd-mgr-title">现任基金经理</div>
                <div class="fd-mgr-list">
                  <div v-for="m in managers" :key="m.name" class="fd-mgr-card">
                    <img
                      v-if="m.pic"
                      :src="m.pic"
                      class="fd-mgr-pic"
                      loading="lazy"
                      referrerpolicy="no-referrer"
                      @error="m.pic = ''"
                    />
                    <div v-else class="fd-mgr-pic fd-mgr-pic-empty">
                      <i class="el-icon-user"></i>
                    </div>
                    <div class="fd-mgr-main">
                      <div class="fd-mgr-name">
                        {{ m.name }}
                        <span v-if="m.star" class="fd-mgr-star" title="基金经理评分">★ {{ m.star }}</span>
                      </div>
                      <div class="fd-mgr-meta">
                        <span v-if="m.workTime">任职 {{ m.workTime }}</span>
                        <span v-if="m.fundSize">管理规模 {{ m.fundSize }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!quoteError && !!histError }"></span>
      <span>数据源：新浪财经 / 东方财富</span>
      <span class="status-right">盘中每分钟更新 · 收益按估值计算</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import { FUND_API } from '@/config/fund-api'
import {
  loadPositions, fetchQuote, fetchHistory, fetchFundBasic, calcProfit,
  riseColor, fmtMoney, fmtPct, fmtQuoteDate, fmtQuoteTime, isTradingTime
} from '@/utils/fund'

// 图表 viewBox 常量
const VIEW_W = 560
const CHART_H = 220
const TREND_H = 240
// 图表最大渲染点数（超出降采样，保证"全部"等大范围不卡顿）
const MAX_POINTS = 240
// y 轴刻度线数量
const Y_TICKS = 4

const TABS = [
  { key: 'trend', label: '估值走势' },
  { key: 'nav', label: '历史净值' },
  { key: 'info', label: '基金信息' }
]

// 历史走势时间范围
const RANGES = [
  { key: 'm1', label: '1月', days: 30 },
  { key: 'm3', label: '3月', days: 90 },
  { key: 'm6', label: '6月', days: 182 },
  { key: 'y1', label: '1年', days: 365 },
  { key: 'y3', label: '3年', days: 1095 },
  { key: 'all', label: '全部', days: 0 }
]

const RISK_LEVELS = { 1: 'R1 低风险', 2: 'R2 中低风险', 3: 'R3 中风险', 4: 'R4 中高风险', 5: 'R5 高风险' }

export default {
  name: 'FundDetail',
  components: { ToolShell },
  data() {
    return {
      code: '',
      name: '',
      activeTab: 'trend',
      quote: null,
      quoteError: '',
      loadingQuote: false,
      histPoints: [],
      histError: '',
      loadingHist: false,
      range: 'm3',
      // 历史净值 Tab 时间范围（默认 3 月）
      navRange: 'm3',
      trading: isTradingTime(),
      // 基金信息
      fundInfo: null,
      loadingInfo: false,
      managers: [],
      // 图表悬停状态：{ i: 数据点索引 }
      intraHover: null,
      trendHover: null,
      navHover: null,
      TABS,
      RANGES
    }
  },
  computed: {
    // 持仓（若该基金在持仓中）
    position() {
      return loadPositions().find(p => p.code === this.code) || null
    },
    myProfit() {
      if (!this.position || !this.quote) {
        return { marketValue: 0, profit: 0, profitRate: 0, todayProfit: 0 }
      }
      return calcProfit(this.position, this.quote)
    },

    /* ============ 盘中分时图（昨收中轴对称 + 百分比刻度，专业行情风格） ============ */
    // 分时图对称范围：以昨收为中心，上下取最大偏移，保证 0% 刻度与昨收线重合
    intraRange() {
      if (!this.quote || !this.quote.points.length) return null
      const vals = this.quote.points.map(p => p.v)
      const min = this.minOf(vals)
      const max = this.maxOf(vals)
      const nav = this.quote.nav
      const d = Math.max(Math.abs(min - nav), Math.abs(max - nav)) || 0.0001
      return { lo: nav - d, hi: nav + d, d }
    },
    intraXY() {
      if (!this.quote || this.quote.points.length < 2 || !this.intraRange) return []
      const { lo, hi } = this.intraRange
      const vals = this.quote.points.map(p => p.v)
      const step = VIEW_W / (vals.length - 1)
      return vals.map((v, i) => ({
        x: i * step,
        y: 16 + (1 - (v - lo) / (hi - lo)) * (CHART_H - 32),
        t: this.quote.points[i].t,
        v: this.quote.points[i].v,
        pct: this.quote.points[i].pct
      }))
    },
    intraPath() {
      return this.pathFromXY(this.intraXY)
    },
    intraArea() {
      return this.intraPath ? this.intraPath + ` L ${VIEW_W} ${CHART_H} L 0 ${CHART_H} Z` : ''
    },
    // 昨收线：对称范围下恒为中线
    intraBaseY() {
      return this.intraXY.length ? 16 + (CHART_H - 32) / 2 : 0
    },
    intraColor() {
      if (!this.quote) return '#F5222D'
      return this.quote.estPct >= 0 ? '#F5222D' : '#52C41A'
    },
    // 分时图 y 轴刻度：百分比轴（0% = 昨收价，醒目标注）
    intraTicks() {
      if (!this.intraRange || !this.quote) return []
      const { d } = this.intraRange
      const nav = this.quote.nav
      const maxPct = (d / nav) * 100
      const out = []
      for (let i = 0; i <= Y_TICKS; i++) {
        const pct = -maxPct + (2 * maxPct * i) / Y_TICKS
        const y = 16 + (1 - i / Y_TICKS) * (CHART_H - 32)
        const isZero = Math.abs(pct) < maxPct / Y_TICKS / 2
        out.push({
          y,
          isZero,
          // 0% 刻度位置显示昨收价（专业分时图惯例），其余显示百分比
          label: isZero ? nav.toFixed(4) : (pct > 0 ? '+' : '') + pct.toFixed(2) + '%'
        })
      }
      return out
    },
    // 分时图 x 轴刻度（5 等分）
    intraXTicks() {
      return this.xTicksOf(this.intraXY, CHART_H)
    },

    /* ============ 估值走势 Tab：历史走势（范围切换 + 降采样） ============ */
    trendSliced() {
      return this.sliceByRange(this.histPoints, this.range)
    },
    trendXY() {
      return this.chartData(this.trendSliced, TREND_H, 'nav')
    },
    trendPath() {
      return this.pathFromXY(this.trendXY)
    },
    trendArea() {
      return this.trendPath ? this.trendPath + ` L ${VIEW_W} ${TREND_H} L 0 ${TREND_H} Z` : ''
    },
    trendBaseY() {
      if (!this.trendSliced.length) return 0
      return this.baseY(this.trendSliced.map(p => p.nav), this.trendSliced[0].nav, TREND_H)
    },
    // 区间涨跌幅
    rangePct() {
      if (this.trendSliced.length < 2) return null
      const first = this.trendSliced[0].nav
      const last = this.trendSliced[this.trendSliced.length - 1].nav
      return first > 0 ? ((last - first) / first) * 100 : null
    },
    trendColor() {
      return this.rangePct === null || this.rangePct >= 0 ? '#F5222D' : '#52C41A'
    },
    trendTicks() {
      return this.yTicks(TREND_H, this.trendMin, this.trendMax)
    },
    trendMin() {
      return this.minOf(this.trendSliced.map(p => p.nav))
    },
    trendMax() {
      return this.maxOf(this.trendSliced.map(p => p.nav))
    },
    // 历史走势 x 轴刻度（5 等分）
    trendXTicks() {
      return this.xTicksOf(this.trendXY, TREND_H)
    },

    /* ============ 历史净值 Tab：走势（范围切换 + 降采样） ============ */
    navSliced() {
      return this.sliceByRange(this.histPoints, this.navRange)
    },
    navXY() {
      return this.chartData(this.navSliced, TREND_H, 'nav')
    },
    navPath() {
      return this.pathFromXY(this.navXY)
    },
    navArea() {
      return this.navPath ? this.navPath + ` L ${VIEW_W} ${TREND_H} L 0 ${TREND_H} Z` : ''
    },
    navBaseY() {
      if (!this.navSliced.length) return 0
      return this.baseY(this.navSliced.map(p => p.nav), this.navSliced[0].nav, TREND_H)
    },
    // 历史净值 Tab 区间涨跌幅
    navRangePct() {
      if (this.navSliced.length < 2) return null
      const first = this.navSliced[0].nav
      const last = this.navSliced[this.navSliced.length - 1].nav
      return first > 0 ? ((last - first) / first) * 100 : null
    },
    navColor() {
      return this.navRangePct === null || this.navRangePct >= 0 ? '#F5222D' : '#52C41A'
    },
    navTicks() {
      return this.yTicks(TREND_H, this.navMin, this.navMax)
    },
    navMin() {
      return this.minOf(this.navSliced.map(p => p.nav))
    },
    navMax() {
      return this.maxOf(this.navSliced.map(p => p.nav))
    },
    // 净值走势 x 轴刻度（5 等分）
    navXTicks() {
      return this.xTicksOf(this.navXY, TREND_H)
    },
    // 净值列表（当前范围内倒序）
    reversedNavs() {
      return this.navSliced.slice().reverse()
    },

    /* ============ 基金信息 Tab ============ */
    infoFields() {
      const d = this.fundInfo && this.fundInfo.raw
      if (!d) return []
      const fields = [
        { label: '基金全称', value: d.FULLNAME },
        { label: '基金代码', value: d.FCODE || this.code },
        { label: '基金类型', value: d.FTYPE },
        { label: '成立日期', value: d.ESTABDATE },
        { label: '基金公司', value: d.JJGS },
        { label: '托管银行', value: d.TGYH },
        { label: '基金经理', value: d.JJJL },
        { label: '资产规模', value: this.fmtScale(d.NETNAV) },
        { label: '业绩比较基准', value: d.BENCH },
        { label: '风险等级', value: RISK_LEVELS[Number(d.RISKLEVEL)] || '' }
      ]
      return fields.filter(f => f.value)
    }
  },
  watch: {
    // 路由参数变化（同组件复用）
    '$route.params.code': {
      immediate: true,
      handler(code) {
        if (code && code !== this.code) {
          this.code = code
          this.init()
        }
      }
    }
  },
  mounted() {
    this._timer = setInterval(() => this.loadQuote(true), isTradingTime() ? 60000 : 300000)
  },
  beforeDestroy() {
    clearInterval(this._timer)
  },
  methods: {
    riseColor, fmtMoney, fmtPct, fmtQuoteDate, fmtQuoteTime,

    init() {
      this.quote = null
      this.quoteError = ''
      this.histPoints = []
      this.histError = ''
      this.fundInfo = null
      this.managers = []
      this.intraHover = null
      this.trendHover = null
      this.navHover = null
      this.activeTab = 'trend'
      this.range = 'm3'
      this.navRange = 'm3'
      this.loadQuote()
      this.loadHistory()
      this.loadInfo()
    },

    /* ============ 数据加载 ============ */
    async loadQuote(force) {
      this.loadingQuote = true
      try {
        const q = await fetchQuote(this.code, force)
        this.quote = q
        this.quoteError = ''
      } catch (e) {
        this.quoteError = e.message || '估值获取失败'
      }
      this.loadingQuote = false
    },
    async loadHistory() {
      this.loadingHist = true
      try {
        const h = await fetchHistory(this.code)
        this.name = h.name
        this.histPoints = h.points
        this.managers = h.managers || []
        this.histError = ''
      } catch (e) {
        this.histError = e.message || '历史净值获取失败'
      }
      this.loadingHist = false
    },
    async loadInfo() {
      this.loadingInfo = true
      try {
        this.fundInfo = await fetchFundBasic(this.code)
      } catch (e) {
        this.fundInfo = null
      }
      this.loadingInfo = false
    },
    openExternal() {
      const url = FUND_API.fundDetailPage.replace('{code}', this.code)
      window.open(url, '_blank')
    },

    /* ============ 图表通用 ============ */
    // 范围切片：ts 时间戳比较（数据层已预解析，避免重复 new Date）
    sliceByRange(points, key) {
      const r = RANGES.find(x => x.key === key)
      if (!r || !r.days) return points
      const from = Date.now() - r.days * 86400000
      return points.filter(p => p.ts >= from)
    },
    // 大数组降采样：等距抽取保证首尾点保留（数据过多时 spread/new Date 会导致卡顿）
    downsample(arr, max) {
      if (arr.length <= max) return arr
      const step = (arr.length - 1) / (max - 1)
      const out = []
      for (let i = 0; i < max; i++) {
        out.push(arr[Math.round(i * step)])
      }
      // 首尾覆盖，防浮点偏差丢尾点
      out[0] = arr[0]
      out[out.length - 1] = arr[arr.length - 1]
      return out
    },
    // 序列极值（单遍循环，避免 spread 展开大数组）
    minOf(vals) {
      let m = Infinity
      for (let i = 0; i < vals.length; i++) if (vals[i] < m) m = vals[i]
      return m
    },
    maxOf(vals) {
      let m = -Infinity
      for (let i = 0; i < vals.length; i++) if (vals[i] > m) m = vals[i]
      return m
    },
    // 点序列 → 渲染数据（降采样 + 坐标换算 + 附带原始字段）
    chartData(points, h, valKey) {
      if (!points || points.length < 2) return []
      const sampled = this.downsample(points, MAX_POINTS)
      const vals = sampled.map(p => p[valKey])
      const min = this.minOf(vals)
      const max = this.maxOf(vals)
      const span = max - min || 1
      const step = VIEW_W / (sampled.length - 1)
      return sampled.map((p, i) => ({
        x: i * step,
        y: 16 + (1 - (p[valKey] - min) / span) * (h - 32),
        date: p.date,
        nav: p.nav,
        pct: p.pct,
        t: p.t,
        v: p.v
      }))
    },
    // y 轴刻度：极值 → Y_TICKS+1 条网格线（含数值标签）
    yTicks(h, min, max) {
      if (!isFinite(min) || !isFinite(max) || min === Infinity || max === -Infinity) return []
      const span = (max - min) || 1
      const out = []
      for (let i = 0; i <= Y_TICKS; i++) {
        const v = min + (span * i) / Y_TICKS
        const y = 16 + (1 - i / Y_TICKS) * (h - 32)
        out.push({ y, label: v.toFixed(4) })
      }
      return out
    },
    // x 轴刻度：数据等距 5 档（首尾贴边）
    xTicksOf(xys) {
      if (!xys || xys.length < 2) return []
      const N = 5
      const first = xys[0]
      const last = xys[xys.length - 1]
      const out = []
      for (let i = 0; i < N; i++) {
        const idx = Math.round((i / (N - 1)) * (xys.length - 1))
        const p = xys[idx]
        let label = ''
        if (p.t) {
          // 分时：HH:MM
          label = p.t
        } else if (p.date) {
          // 历史：跨度大显示年-月，否则月-日
          const days = (last.date && first.date) ? (new Date(last.date) - new Date(first.date)) / 86400000 : 0
          label = days > 400 ? p.date.slice(2, 7) : p.date.slice(5)
        }
        out.push({
          pct: (p.x / VIEW_W) * 100,
          label,
          first: i === 0,
          last: i === N - 1
        })
      }
      return out
    },
    // 数值序列 → SVG 坐标点（等距 x，归一化 y；仅小数组使用）
    buildXY(vals, h) {
      if (!vals || vals.length < 2) return []
      const min = this.minOf(vals)
      const max = this.maxOf(vals)
      const span = max - min || 1
      const step = VIEW_W / (vals.length - 1)
      return vals.map((v, i) => ({
        x: i * step,
        y: 16 + (1 - (v - min) / span) * (h - 32)
      }))
    },
    pathFromXY(xys) {
      if (!xys || xys.length < 2) return ''
      return xys
        .map((p, i) => (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ' ' + p.y.toFixed(1))
        .join(' ')
    },
    // 基准值（昨收/期初）的 y 坐标
    baseY(vals, base, h) {
      const min = this.minOf(vals)
      const max = this.maxOf(vals)
      const span = max - min || 1
      const y = 16 + (1 - (base - min) / span) * (h - 32)
      return Math.min(Math.max(y, 0), h)
    },
    // 图表 mousemove：换算 viewBox x 坐标 → 最近数据点索引
    onChartMove(evt, key, xys) {
      if (!xys || xys.length < 2) return
      const rect = evt.currentTarget.getBoundingClientRect()
      if (!rect.width) return
      const vx = ((evt.clientX - rect.left) / rect.width) * VIEW_W
      const step = VIEW_W / (xys.length - 1)
      const i = Math.max(0, Math.min(xys.length - 1, Math.round(vx / step)))
      this[key] = { i }
    },
    // Tooltip 定位：x 百分比（clamp 防溢出），点靠上时显示在下方
    tipPos(p, viewH) {
      if (!p) return {}
      const left = Math.min(90, Math.max(10, (p.x / VIEW_W) * 100))
      const top = (p.y / viewH) * 100
      return {
        left: left + '%',
        top: top + '%',
        transform: top < 30 ? 'translate(-50%, 12px)' : 'translate(-50%, calc(-100% - 10px))'
      }
    },
    // Tooltip 内涨幅色（深色底上偏亮）
    tipPctColor(v) {
      return v >= 0 ? '#FF7875' : '#95DE64'
    },

    /* ============ 基金信息 ============ */
    // '2614228709.42' → '26.14 亿元'
    fmtScale(v) {
      const n = Number(v)
      if (!n || isNaN(n)) return ''
      if (n >= 1e8) return (n / 1e8).toFixed(2) + ' 亿元'
      if (n >= 1e4) return (n / 1e4).toFixed(2) + ' 万元'
      return n.toFixed(2) + ' 元'
    }
  }
}
</script>

<style lang="scss" scoped>
.fd-page {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

/* ============ 顶部概要 ============ */
.fd-overview {
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  padding: 12px 18px;
  gap: 18px;
}

.fd-ov-quote {
  flex: 1.2;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
}

.fd-ov-main {
  display: flex;
  align-items: baseline;
  gap: 10px;
}

.fd-ov-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.fd-ov-value {
  font-size: 24px;
  font-weight: 800;
  line-height: 1;
}

.fd-ov-pct {
  font-size: 14px;
  font-weight: 700;
}

.fd-ov-sub {
  font-size: 11px;
  color: var(--text-secondary);
}

.fd-ov-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
  min-height: 44px;

  i {
    font-size: 18px;
    opacity: 0.6;
  }
}

/* 我的持仓概要 */
.fd-ov-pos {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 14px;
  border-left: 1px solid var(--border-color);
  padding-left: 18px;
  flex-wrap: wrap;
}

.fd-ov-pos-title {
  font-size: 11.5px;
  font-weight: 700;
  color: var(--primary-color);
  white-space: nowrap;
}

.fd-ov-pos-cells {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
}

.fd-ov-cell {
  display: flex;
  align-items: baseline;
  gap: 5px;
  color: var(--text-primary);
  font-size: 12px;
  white-space: nowrap;

  em {
    font-style: normal;
    font-size: 10px;
    color: var(--text-secondary);
  }

  b {
    font-weight: 700;
  }
}

.fd-ov-pos-link {
  font-size: 10.5px;
  color: var(--text-secondary);
  text-decoration: none;
  margin-left: auto;

  &:hover {
    color: var(--primary-color);
  }
}

/* ============ Tab 容器 ============ */
.fd-tabs {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  overflow: hidden;
}

.fd-tab-nav {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  padding: 6px 12px 0;
  border-bottom: 1px solid var(--border-color);
}

.fd-tab-item {
  padding: 8px 18px;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  border-radius: 8px 8px 0 0;
  position: relative;
  transition: color 0.15s ease;
  user-select: none;

  &:hover {
    color: var(--text-primary);
  }

  &.active {
    color: var(--primary-color);
    font-weight: 600;

    &::after {
      content: '';
      position: absolute;
      left: 14px;
      right: 14px;
      bottom: -1px;
      height: 2px;
      background: var(--primary-color);
      border-radius: 2px 2px 0 0;
    }
  }
}

.fd-tab-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
}

/* Tab 内容撑满剩余高度（shrink 0：内容超出时由 tab-body 滚动） */
.fd-trend,
.fd-nav-tab,
.fd-info {
  display: flex;
  flex-direction: column;
  gap: 14px;
  flex: 1 0 auto;
}

/* ============ 图表 ============ */
/* 图表块弹性分摊可用高度，图表随窗口伸缩（固定 252px 高会在宽窗口下显得扁平） */
.fd-chart-block {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 0;
  min-height: 258px; // 标题 + 间距 + 图表最小高 220，矮窗口时由 tab-body 滚动
}

.fd-chart-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;

  > span.mono {
    font-weight: 700;
  }
}

.fd-ct-time {
  font-weight: 400 !important;
  font-size: 10.5px;
}

.fd-chart {
  position: relative;
  background: var(--search-bg);
  border-radius: 10px;
  overflow: hidden;

  svg {
    width: 100%;
    height: 100%;
    display: block;
  }
}

.fd-chart-lg {
  flex: 1 1 0;
  min-height: 220px;
}

.fd-base-line {
  stroke: var(--text-secondary);
  stroke-width: 0.8;
  stroke-dasharray: 4 4;
  opacity: 0.5;
}

/* y 轴网格线（极淡，衬托折线） */
.fd-grid-line {
  stroke: var(--border-color);
  stroke-width: 0.6;
  opacity: 0.45;
}

/* y 轴刻度（右侧 HTML 层，不随 SVG 拉伸变形） */
.fd-ylabel {
  position: absolute;
  right: 5px;
  transform: translateY(-50%);
  font-size: 10px;
  line-height: 1;
  color: var(--text-secondary);
  opacity: 0.9;
  background: var(--card-bg);
  padding: 2px 3px;
  border-radius: 3px;
  pointer-events: none;
  z-index: 2;

  // 分时图 0% 刻度（昨收价）：醒目标注
  &.is-base {
    color: var(--text-primary);
    font-weight: 600;
    opacity: 1;
  }
}

/* 折线末端最新价胶囊（红涨绿跌） */
.fd-last-tag {
  position: absolute;
  right: 5px;
  transform: translateY(-50%);
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  color: #fff;
  padding: 3px 6px;
  border-radius: 4px;
  pointer-events: none;
  z-index: 3;

  &.up {
    background: #F5222D;
  }

  &.down {
    background: #52C41A;
  }
}

/* x 轴刻度（5 等分，首尾贴边） */
.fd-xaxis {
  position: absolute;
  left: 8px;
  right: 8px;
  bottom: 3px;
  height: 12px;
  pointer-events: none;
  z-index: 2;

  span {
    position: absolute;
    transform: translateX(-50%);
    font-size: 10px;
    line-height: 1;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;

    &.first {
      left: 0 !important;
      transform: none;
    }

    &.last {
      left: auto !important;
      right: 0;
      transform: none;
    }
  }
}

.fd-cursor-line {
  stroke: var(--text-secondary);
  stroke-width: 0.8;
  opacity: 0.4;
  stroke-dasharray: 3 3;
}

/* 悬停数据点（HTML 圆点，保持正圆不受 SVG 非等比拉伸影响） */
.fd-hover-point {
  position: absolute;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  border: 1.5px solid #fff;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.25);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 4;
}

.fd-chart-empty {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-secondary);
  gap: 6px;
}

/* Tooltip（深色毛玻璃） */
.fd-tip {
  position: absolute;
  z-index: 5;
  pointer-events: none;
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
  padding: 6px 11px;
  border-radius: 8px;
  background: rgba(29, 29, 31, 0.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.28);
  color: #f5f5f7;
  font-size: 11px;
}

.fd-tip-time {
  color: rgba(245, 245, 247, 0.65);
}

.fd-tip-val {
  font-weight: 700;
}

/* ============ 历史净值列表 ============ */
.fd-nav-list {
  flex-shrink: 0;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
}

.fd-nav-header,
.fd-nav-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  padding: 7px 14px;
  font-size: 11.5px;
}

.fd-nav-header {
  background: var(--search-bg);
  color: var(--text-secondary);
  font-weight: 600;
  position: sticky;
  top: 0;
  z-index: 1;
}

.fd-nav-header span:nth-child(2),
.fd-nav-header span:nth-child(3),
.fd-nav-row span:nth-child(2),
.fd-nav-row span:nth-child(3) {
  text-align: right;
}

.fd-nav-rows {
  max-height: 300px;
  overflow-y: auto;
}

.fd-nav-row {
  color: var(--text-primary);
  border-top: 1px solid var(--border-color);
  font-variant-numeric: tabular-nums;

  span:first-child {
    color: var(--text-secondary);
  }
}

.fd-nav-empty {
  min-height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: var(--text-secondary);
}

/* ============ 基金信息 Tab ============ */
.fd-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 1px;
  background: var(--border-color);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
}

.fd-info-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 11px 14px;
  background: var(--card-bg);
  min-width: 0;
}

.fd-info-label {
  font-size: 10.5px;
  color: var(--text-secondary);
}

.fd-info-value {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fd-info-empty {
  min-height: 120px;
}

/* 基金经理卡片 */
.fd-mgr-title {
  font-size: 11.5px;
  font-weight: 600;
  color: var(--text-secondary);
}

.fd-mgr-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fd-mgr-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--search-bg);
}

.fd-mgr-pic {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
}

.fd-mgr-pic-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--border-color);
  color: var(--text-secondary);
  font-size: 18px;
}

.fd-mgr-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fd-mgr-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
  display: flex;
  align-items: center;
  gap: 8px;
}

.fd-mgr-star {
  font-size: 10.5px;
  font-weight: 600;
  color: #FAAD14;
}

.fd-mgr-meta {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 11px;
  color: var(--text-secondary);
}

/* 时间范围切换 */
.fd-range-seg {
  transform: scale(0.86);
  transform-origin: right center;
  margin-left: auto;

  .tool-seg-item {
    padding: 0 9px;
  }
}

/* ============ 骨架屏 ============ */
.fd-sk {
  background: linear-gradient(90deg, var(--search-bg) 25%, var(--border-color) 37%, var(--search-bg) 63%);
  background-size: 400% 100%;
  border-radius: 6px;
}

.fd-sk-wave {
  animation: fd-sk-wave 1.3s ease infinite;
}

@keyframes fd-sk-wave {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

/* 图表区骨架屏容器 */
.fd-sk-chart {
  position: absolute;
  inset: 0 0 14px;
  z-index: 2;
  overflow: hidden;
}

/* 概要区估值骨架屏 */
.fd-ov-skeleton {
  display: flex;
  flex-direction: column;
  justify-content: center;
}
</style>
