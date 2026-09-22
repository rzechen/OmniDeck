<template>
  <tool-shell
    title="基金"
    desc="录入当前持仓，实时估值与收益计算"
    icon="fund"
    color="#F5222D"
  >
    <template #toolbar>
      <button class="tool-btn" @click="openAdd">
        <i class="el-icon-plus"></i>添加持仓
      </button>
      <!-- 循环倒计时刷新按钮：59s→…→1s→刷新中…→获取成功→59s -->
      <button
        class="tool-btn fp-cd-btn"
        :class="cdState"
        :title="cdTitle"
        @click="manualRefresh"
      >
        <i
          class="el-icon-refresh"
          :class="{ 'is-rotating': cdState === 'refreshing' }"
        ></i>
        <span class="fp-cd-text mono">{{ cdText }}</span>
      </button>
    </template>

    <div class="fp-page">
      <!-- 骨架屏：首次估值加载中（key 区分，切真实内容时强制重挂载触发淡入） -->
      <template v-if="booting && positions.length">
        <div key="sk-summary" class="fp-summary">
          <div class="fp-sk sk-line" style="width: 150px; height: 26px"></div>
          <div class="fp-sk sk-line" style="width: 90px; height: 22px"></div>
          <div class="fp-sk sk-line" style="width: 90px; height: 22px"></div>
          <div class="fp-sk sk-line" style="width: 90px; height: 22px"></div>
          <div class="fp-sk sk-pill" style="width: 68px; margin-left: auto"></div>
        </div>
        <div key="sk-list" class="fp-list">
          <div v-for="n in skRows" :key="'sk' + n" class="fp-row fp-sk-row">
            <div class="fp-sk-row-main">
              <div class="fp-sk sk-line" style="width: 38%"></div>
              <div class="fp-sk sk-line" style="width: 24%; margin-top: 9px"></div>
            </div>
            <div class="fp-sk-row-cells">
              <div v-for="m in 5" :key="m" class="fp-sk sk-line" style="width: 70%"></div>
            </div>
          </div>
        </div>
      </template>

      <template v-else>
      <!-- 汇总卡 -->
      <div key="live-summary" class="fp-summary fp-enter">
        <div class="fp-sum-main">
          <span class="fp-sum-label">总市值</span>
          <span class="fp-sum-value mono">
            <animated-number v-if="!hideAmount" :value="total.marketValue" />
            <template v-else>****</template>
          </span>
        </div>
        <div class="fp-sum-cell">
          <span class="fp-sum-label">当日收益</span>
          <span class="fp-sum-num mono" :style="{ color: riseColor(total.todayProfit) }">
            <animated-number v-if="!hideAmount" :value="total.todayProfit" signed />
            <template v-else>****</template>
          </span>
          <span class="fp-sum-rate mono" :style="{ color: riseColor(total.todayProfit) }">
            <animated-number v-if="!hideAmount" :value="total.todayRate" type="pct" signed />
            <template v-else>****</template>
          </span>
        </div>
        <div class="fp-sum-cell">
          <span class="fp-sum-label">持仓收益</span>
          <span class="fp-sum-num mono" :style="{ color: riseColor(total.profit) }">
            <animated-number v-if="!hideAmount" :value="total.profit" signed />
            <template v-else>****</template>
          </span>
          <span class="fp-sum-rate mono" :style="{ color: riseColor(total.profit) }">
            <animated-number v-if="!hideAmount" :value="total.profitRate" type="pct" signed />
            <template v-else>****</template>
          </span>
        </div>
        <div class="fp-sum-cell">
          <span class="fp-sum-label">持仓成本</span>
          <span class="fp-sum-num mono">
            <animated-number v-if="!hideAmount" :value="total.cost" />
            <template v-else>****</template>
          </span>
        </div>
        <div class="fp-sum-right">
          <!-- 金额隐私切换：隐藏/显示收益等数值 -->
          <button
            class="fp-eye-btn"
            :class="{ 'is-hidden': hideAmount }"
            :title="hideAmount ? '显示金额' : '隐藏金额'"
            @click="toggleHide"
          >
            <i class="el-icon-view"></i>
          </button>
          <!-- 市场状态胶囊：交易中(绿)/午间休市(橙)/已收盘(灰) -->
          <span class="fp-market-chip" :class="marketStatus.type">
            <span class="chip-dot"></span>{{ marketStatus.label }}
          </span>
          <div class="fp-sum-time">
            <i class="el-icon-time"></i>
            {{ updateTime || '—' }}
          </div>
        </div>
      </div>

      <!-- 持仓列表 -->
      <div key="live-list" class="fp-list fp-enter">
        <div
          v-for="(row, i) in rows"
          :key="row.pos.code"
          class="fp-row"
          @click="goDetail(row.pos.code)"
        >
          <!-- 名称与净值 -->
          <div class="fp-row-main">
            <div class="fp-row-title">
              <span class="fp-name" :title="row.pos.name">{{ row.pos.name }}</span>
              <span class="fp-code mono">{{ row.pos.code }}</span>
              <span class="fp-type">{{ row.pos.type }}</span>
            </div>
            <div class="fp-row-quote">
              <span
                v-if="row.quote"
                class="fp-price mono"
                :class="flashClass(row.pos.code)"
              >
                {{ row.quote.estimate.toFixed(4) }}
              </span>
              <span
                v-if="row.quote"
                class="fp-pct mono"
                :class="flashClass(row.pos.code)"
                :style="{ color: riseColor(row.quote.estPct) }"
              >
                {{ fmtPct(row.quote.estPct, true) }}
              </span>
              <span v-if="row.quote && row.quote.time" class="fp-quote-time">
                {{ fmtQuoteDate(row.quote.date) }} {{ fmtQuoteTime(row.quote.time) }}
              </span>
              <span v-if="row.error" class="fp-error"><i class="el-icon-warning"></i> {{ row.error }}</span>
            </div>
          </div>

          <!-- 持仓指标 -->
          <div class="fp-row-cells">
            <div class="fp-cell">
              <span class="fp-cell-label">持有份额</span>
              <span class="fp-cell-value mono">{{ hideNum(row.pos.shares) }}</span>
            </div>
            <div class="fp-cell">
              <span class="fp-cell-label">成本单价</span>
              <span class="fp-cell-value mono">{{ row.pos.costPrice.toFixed(4) }}</span>
            </div>
            <div class="fp-cell">
              <span class="fp-cell-label">市值</span>
              <span class="fp-cell-value mono">{{ showMoney(row.profit.marketValue) }}</span>
            </div>
            <div class="fp-cell">
              <span class="fp-cell-label">当日收益</span>
              <span class="fp-cell-value mono" :style="{ color: riseColor(row.profit.todayProfit) }">
                {{ showMoney(row.profit.todayProfit, true) }}
              </span>
            </div>
            <div class="fp-cell">
              <span class="fp-cell-label">持仓收益</span>
              <span class="fp-cell-value mono" :style="{ color: riseColor(row.profit.profit) }">
                {{ showMoney(row.profit.profit, true) }}
                <em :style="{ color: riseColor(row.profit.profit) }">
                  {{ fmtPct(row.profit.profitRate, true) }}
                </em>
              </span>
            </div>
          </div>

          <!-- 操作 -->
          <div class="fp-row-ops" @click.stop>
            <button class="fp-op" :title="i === 0 ? '已在顶部' : '置顶'" :disabled="i === 0" @click="moveRow(i, -i)">
              <svg-icon icon-class="top" />
            </button>
            <button class="fp-op" :title="i === 0 ? '已是第一个' : '上移'" :disabled="i === 0" @click="moveRow(i, -1)">
              <i class="el-icon-arrow-up"></i>
            </button>
            <button class="fp-op" :title="i === positions.length - 1 ? '已是最后一个' : '下移'" :disabled="i === positions.length - 1" @click="moveRow(i, 1)">
              <i class="el-icon-arrow-down"></i>
            </button>
            <button class="fp-op" title="编辑持仓" @click="openEdit(i)">
              <i class="el-icon-edit"></i>
            </button>
            <button class="fp-op is-danger" title="删除持仓" @click="removeRow(i)">
              <i class="el-icon-delete"></i>
            </button>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-if="!positions.length" class="fp-empty">
          <i class="el-icon-wallet"></i>
          <p>暂无持仓，点击右上角「添加持仓」开始</p>
          <p class="fp-empty-sub">只需录入当前份额与成本，无需历史交易记录</p>
        </div>
      </div>
      </template>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!loadError }"></span>
      <span>{{ positions.length }} 只持仓 · 交易时段 60s 自动刷新 · {{ marketStatus.label }}</span>
      <span v-if="loadError" class="status-err">{{ loadError }}</span>
      <span class="status-right">数据源：新浪财经 / 东方财富 · 红涨绿跌</span>
    </template>

    <!-- 添加 / 编辑弹窗 -->
    <el-dialog
      :title="dialog.code ? '编辑持仓' : '添加持仓'"
      :visible.sync="dialog.visible"
      width="440px"
      append-to-body
      custom-class="fp-dialog"
      :close-on-click-modal="false"
    >
      <!-- 基金代码：输入满 6 位后自动查询（仅添加时） -->
      <div v-if="!dialog.code" class="fp-search">
        <i class="el-icon-search"></i>
        <input
          ref="searchInput"
          v-model="dialog.keyword"
          placeholder="输入 6 位基金代码"
          maxlength="6"
          inputmode="numeric"
          @input="onSearchInput"
        />
        <i
          v-if="dialog.keyword"
          class="el-icon-circle-close fp-search-clear"
          @click="clearKeyword"
        ></i>
        <div v-if="searching" class="fp-search-loading"><i class="el-icon-loading"></i></div>
      </div>

      <!-- 选中信息 -->
      <div v-if="dialog.picked" class="fp-picked">
        <span class="fp-picked-name">{{ dialog.picked.name }}</span>
        <span class="fp-picked-code mono">{{ dialog.picked.code }}</span>
        <span v-if="dialog.nav" class="fp-picked-nav mono">
          最新净值 {{ dialog.nav.toFixed(4) }}
        </span>
      </div>

      <!-- 录入表单 -->
      <template v-if="dialog.picked || dialog.code">
        <el-form label-width="72px" size="small" label-position="left" class="fp-form">
          <el-form-item label="录入方式">
            <div class="tool-seg">
              <div
                class="tool-seg-item"
                :class="{ active: dialog.mode === 'shares' }"
                @click="dialog.mode = 'shares'"
              >按份额</div>
              <div
                class="tool-seg-item"
                :class="{ active: dialog.mode === 'amount' }"
                @click="dialog.mode = 'amount'"
              >按金额</div>
            </div>
          </el-form-item>
          <el-form-item :label="dialog.mode === 'shares' ? '持有份额' : '投入金额'">
            <el-input v-model="dialog.inputVal" class="fp-num-input">
              <template slot="append">{{ dialog.mode === 'shares' ? '份' : '元' }}</template>
            </el-input>
          </el-form-item>
          <el-form-item label="成本单价">
            <el-input v-model="dialog.costPrice" class="fp-num-input" @input="onCostInput">
              <template slot="append">元/份</template>
            </el-input>
            <div class="fp-form-hint">
              默认取最新净值{{ dialog.nav ? '（' + dialog.nav.toFixed(4) + '）' : '' }}，可手动修改
            </div>
          </el-form-item>
          <el-form-item label="投入成本">
            <span class="fp-cost-preview mono">¥ {{ costPreview }}</span>
            <span class="fp-cost-shares mono" v-if="sharesPreview">
              ≈ {{ numFmt(sharesPreview) }} 份
            </span>
          </el-form-item>
        </el-form>
      </template>

      <div slot="footer" class="dialog-footer">
        <el-button size="small" round @click="dialog.visible = false">取消</el-button>
        <el-button size="small" round type="primary" :disabled="!canSubmit" @click="submit">保 存</el-button>
      </div>
    </el-dialog>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import AnimatedNumber from '@/components/deck/AnimatedNumber.vue'
import {
  loadPositions, savePositions, fetchQuote, fetchFundBasic,
  calcProfit, riseColor, fmtMoney, fmtPct,
  calcMarketStatus, fmtQuoteDate, fmtQuoteTime
} from '@/utils/fund'
import { getItem as dbGetItem, setItem as dbSetItem } from '@/utils/db'

export default {
  name: 'FundPortfolio',
  components: { ToolShell, AnimatedNumber },
  data() {
    return {
      positions: [],
      quotes: {},
      errors: {},
      loading: false,
      loadError: '',
      updateTime: '',
      // 首次估值加载（骨架屏）
      booting: true,
      // 金额隐私模式：隐藏收益等金额数值（持久化，IndexedDB）
      // 旧 localStorage 值一次性迁移（mounted 中处理）
      hideAmount: dbGetItem('fundHideAmount', false) === true,
      // 市场状态（每秒 tick 时更新）：{ label, type }
      marketStatus: calcMarketStatus(),
      // 循环倒计时状态机：counting(倒数) → refreshing(刷新中) → success(成功2s) → counting
      cdState: 'counting',
      cdSec: 59,
      // 涨跌闪烁方向：{ code: 'up' | 'down' }，估值变化时短暂点亮对应行
      flashDir: {},
      // 搜索
      searching: false,
      searchTimer: null,
      // 持仓保存中（取估值 + 写入，防重复提交）
      submitting: false,
      // 弹窗
      dialog: {
        visible: false,
        code: '',          // 编辑时的基金代码（添加为空）
        keyword: '',
        picked: null,      // 搜索选中的基金 {code,name,type}
        mode: 'shares',    // shares=按份额 amount=按金额
        inputVal: '',
        costPrice: '',
        nav: 0
      }
    }
  },
  computed: {
    // 骨架屏行数（与持仓数一致，最多 6 行）
    skRows() {
      return Math.min(this.positions.length || 3, 6)
    },
    // 列表行：持仓 + 估值 + 收益合并
    rows() {
      return this.positions.map(pos => {
        const quote = this.quotes[pos.code] || null
        return {
          pos,
          quote,
          error: this.errors[pos.code] || '',
          profit: quote
            ? calcProfit(pos, quote)
            : { price: 0, marketValue: 0, costAmount: pos.costAmount, profit: 0, profitRate: 0, todayProfit: 0, todayRate: 0 }
        }
      })
    },
    // 汇总
    total() {
      let marketValue = 0
      let cost = 0
      let todayProfit = 0
      let profit = 0
      this.rows.forEach(r => {
        marketValue += r.profit.marketValue
        cost += r.pos.costAmount || 0
        todayProfit += r.profit.todayProfit
        profit += r.profit.profit
      })
      return {
        marketValue,
        cost,
        todayProfit,
        todayRate: cost > 0 ? (todayProfit / cost) * 100 : 0,
        profit,
        profitRate: cost > 0 ? (profit / cost) * 100 : 0
      }
    },
    // 弹窗：投入成本预览
    costPreview() {
      const d = this.dialog
      const val = Number(d.inputVal) || 0
      const cp = Number(d.costPrice) || 0
      if (d.mode === 'shares') return (val * cp).toFixed(2)
      return val.toFixed(2)
    },
    // 弹窗：份额预览（按金额时）
    sharesPreview() {
      const d = this.dialog
      if (d.mode !== 'amount') return 0
      const val = Number(d.inputVal) || 0
      const cp = Number(d.costPrice) || 0
      return cp > 0 ? val / cp : 0
    },
    // 弹窗：可提交
    canSubmit() {
      const d = this.dialog
      const inputOk = Number(d.inputVal) > 0 && Number(d.costPrice) > 0
      return inputOk && (d.code || d.picked) && !this.submitting
    },
    /* ============ 倒计时按钮文案 ============ */
    cdText() {
      // 非交易时段：显示市场状态，不倒数
      if (this.marketStatus.type !== 'open' && this.cdState === 'counting') {
        return this.marketStatus.label
      }
      if (this.cdState === 'refreshing') return '刷新中...'
      if (this.cdState === 'success') return '获取成功'
      if (this.cdState === 'fail') return '获取失败'
      return this.cdSec + 's'
    },
    cdTitle() {
      if (!this.positions.length) return '添加持仓后开始获取估值'
      if (this.cdState === 'refreshing') return '正在获取最新估值…'
      if (this.cdState === 'success') return '估值已更新'
      if (this.marketStatus.type !== 'open') return this.marketStatus.label + '，开盘后自动恢复刷新'
      return '点击立即刷新 · ' + this.cdSec + 's 后自动刷新'
    }
  },
  mounted() {
    this.migrateHideAmount()
    this.positions = loadPositions()
    this.refresh()
    // 统一 1s tick 驱动倒计时状态机
    this._tick = setInterval(this.onTick, 1000)
  },
  beforeDestroy() {
    clearInterval(this._tick)
    clearTimeout(this._timer)
    clearTimeout(this._successTimer)
    clearTimeout(this._flashTimer)
  },
  methods: {
    riseColor, fmtMoney, fmtPct, fmtQuoteDate, fmtQuoteTime,
    // 涨跌闪烁 class：无闪烁时返回空串
    flashClass(code) {
      return this.flashDir[code] ? 'is-flash-' + this.flashDir[code] : ''
    },
    // 估值变化时设置闪烁方向，短暂高亮后清除
    setFlash(code, dir) {
      this.$set(this.flashDir, code, dir)
      clearTimeout(this._flashTimer)
      this._flashTimer = setTimeout(() => {
        this.$delete(this.flashDir, code)
      }, 900)
    },
    numFmt(v) {
      return (v || 0).toLocaleString('zh-CN', { maximumFractionDigits: 2 })
    },
    /* ============ 金额隐私 ============ */
    // 金额显示：隐私模式下统一遮罩为 ****
    showMoney(v, signed) {
      if (this.hideAmount) return '****'
      return fmtMoney(v, signed)
    },
    // 数量显示（份额等）：隐私模式遮罩，保留原数字格式
    hideNum(v) {
      if (this.hideAmount) return '****'
      return this.numFmt(v)
    },
    toggleHide() {
      this.hideAmount = !this.hideAmount
      dbSetItem('fundHideAmount', this.hideAmount)
    },
    // 旧 localStorage 值一次性迁移到 IndexedDB（迁移后删除旧 key）
    migrateHideAmount() {
      try {
        const legacy = localStorage.getItem('fundHideAmount')
        if (legacy !== null) {
          dbSetItem('fundHideAmount', legacy === '1')
          localStorage.removeItem('fundHideAmount')
        }
      } catch (e) { /* 忽略迁移失败 */ }
    },

    /* ============ 倒计时状态机 ============ */
    onTick() {
      // 每秒更新市场状态（跨时段边界时自动切换）
      this.marketStatus = calcMarketStatus()
      // 非交易时段（未开盘/午休/收盘/非交易日）：暂停倒数，开盘后从当前秒数继续
      if (this.marketStatus.type !== 'open') return
      if (this.cdState === 'counting') {
        this.cdSec--
        if (this.cdSec <= 0) {
          if (this.positions.length) {
            this.startRefresh()
          } else {
            // 无持仓：仅循环倒数，不发起刷新
            this.cdSec = 59
          }
        }
      }
    },
    // 触发一轮刷新（倒计时归零或手动点击）
    startRefresh() {
      if (this.cdState === 'refreshing') return
      this.cdState = 'refreshing'
      this.refresh(true).then(() => {
        // 有失败显示失败态，否则成功态；均停留 2s 后回到倒数
        this.cdState = this.loadError ? 'fail' : 'success'
        clearTimeout(this._successTimer)
        this._successTimer = setTimeout(() => {
          this.cdState = 'counting'
          this.cdSec = 59
        }, 2000)
      })
    },
    manualRefresh() {
      if (!this.positions.length || this.cdState === 'refreshing') return
      this.startRefresh()
    },

    /* ============ 估值刷新 ============ */
    async refresh(force) {
      if (!this.positions.length) {
        this.booting = false
        return
      }
      this.loading = true
      this.loadError = ''
      // 记录刷新前估值，用于涨跌闪烁方向判断
      const prev = {}
      this.positions.forEach(p => {
        prev[p.code] = this.quotes[p.code] ? this.quotes[p.code].estimate : undefined
      })
      for (const pos of this.positions) {
        try {
          const q = await fetchQuote(pos.code, force)
          // 估值变化 → 涨/跌闪烁（红涨绿跌）
          if (prev[pos.code] !== undefined && q.estimate !== prev[pos.code]) {
            this.setFlash(pos.code, q.estimate > prev[pos.code] ? 'up' : 'down')
          }
          this.$set(this.quotes, pos.code, q)
          this.$set(this.errors, pos.code, '')
          this.updateTime = q.time ? '估值 ' + fmtQuoteDate(q.date) + ' ' + fmtQuoteTime(q.time) : ''
        } catch (e) {
          this.$set(this.errors, pos.code, e.message || '获取失败')
          this.loadError = e.message || '部分基金估值获取失败'
        }
      }
      this.loading = false
      // 首轮刷新结束，骨架屏切换为真实内容
      this.booting = false
    },

    /* ============ 排序 ============ */
    // 移动持仓：offset=-i 为置顶，-1 上移，1 下移；成功后持久化
    moveRow(i, offset) {
      const j = i + offset
      if (offset === 0 || j < 0 || j >= this.positions.length) return
      const list = this.positions
      const [moved] = list.splice(i, 1)
      list.splice(j, 0, moved)
      savePositions(list)
    },

    /* ============ 添加 / 编辑 ============ */
    openAdd() {
      this.dialog = {
        visible: true, code: '', keyword: '', picked: null,
        mode: 'shares', inputVal: '', costPrice: '', nav: 0
      }
      this.$nextTick(() => {
        if (this.$refs.searchInput) this.$refs.searchInput.focus()
      })
    },
    openEdit(i) {
      const pos = this.positions[i]
      const quote = this.quotes[pos.code]
      this.dialog = {
        visible: true,
        code: pos.code,
        keyword: '',
        picked: { code: pos.code, name: pos.name, type: pos.type },
        mode: 'shares',
        inputVal: String(pos.shares),
        costPrice: pos.costPrice.toFixed(4),
        nav: quote ? quote.nav : 0,
        editing: true
      }
    },
    onSearchInput() {
      clearTimeout(this.searchTimer)
      // 重新输入视为放弃当前选中
      this.dialog.picked = null
      const kw = this.dialog.keyword.trim()
      // 满足 6 位数字基金代码才发起查询
      if (!/^\d{6}$/.test(kw)) {
        this.searching = false
        return
      }
      this.searching = true
      this.searchTimer = setTimeout(async () => {
        try {
          const info = await fetchFundBasic(kw)
          this.pickFund(info)
        } catch (e) {
          this.$message.error(e.message || '未找到该基金')
        }
        this.searching = false
      }, 300)
    },
    clearKeyword() {
      this.dialog.keyword = ''
      this.dialog.picked = null
    },
    // 选中基金：带出名称并取最新净值作为默认成本
    async pickFund(f) {
      this.dialog.picked = f
      try {
        const q = await fetchQuote(f.code)
        this.dialog.nav = q.nav || q.estimate
        if (!this.dialog.costPrice) {
          this.dialog.costPrice = String(this.dialog.nav || '')
        }
      } catch (e) {
        // 净值获取失败不阻塞录入
      }
    },
    submit() {
      if (!this.canSubmit) return
      const d = this.dialog
      const code = d.code || d.picked.code
      // 已持有该基金时二次确认是否覆盖
      const exists = this.positions.findIndex(p => p.code === code)
      if (exists > -1 && !d.editing) {
        const pos = this.positions[exists]
        this.$confirm(`「${pos.name}（${code}）」已添加，是否覆盖现有持仓？`, '基金已添加', {
          type: 'warning',
          confirmButtonText: '覆盖',
          cancelButtonText: '取消'
        }).then(() => this.doSubmit(exists)).catch(() => {})
        return
      }
      this.doSubmit(exists)
    },
    async doSubmit(exists) {
      if (this.submitting) return
      const d = this.dialog
      // 成本单价保留 4 位小数（基金净值精度惯例）
      const cp = Math.round((Number(d.costPrice) + Number.EPSILON) * 10000) / 10000
      let shares
      let costAmount
      if (d.mode === 'shares') {
        shares = Number(d.inputVal)
        costAmount = shares * cp
      } else {
        costAmount = Number(d.inputVal)
        shares = cp > 0 ? costAmount / cp : 0
      }
      const code = d.code || d.picked.code
      const entry = {
        code,
        name: d.picked.name,
        type: d.picked.type || '',
        shares,
        costPrice: cp,
        costAmount,
        createdAt: exists > -1 ? this.positions[exists].createdAt : Date.now()
      }
      // 先取该基金估值（选择基金时通常已缓存，瞬时返回），与持仓一同写入，
      // 避免汇总卡先出现「成本已加、市值未加」的中间态闪动
      this.submitting = true
      let q = null
      try {
        q = await fetchQuote(code)
      } catch (e) { /* 估值获取失败不阻塞持仓保存，交给 refresh 重试 */ }
      this.submitting = false
      if (exists > -1) {
        this.positions.splice(exists, 1, entry)
      } else {
        this.positions.push(entry)
      }
      if (q) {
        this.$set(this.quotes, code, q)
        this.updateTime = q.time ? '估值 ' + fmtQuoteDate(q.date) + ' ' + fmtQuoteTime(q.time) : ''
      }
      savePositions(this.positions)
      d.visible = false
      // 立即拉取该基金估值
      this.refresh()
    },
    // 成本单价输入：仅数字 + 小数点，最多 4 位小数
    onCostInput(v) {
      let s = String(v || '').replace(/[^\d.]/g, '')
      const dot = s.indexOf('.')
      if (dot > -1) {
        s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, '').slice(0, 4)
      }
      this.dialog.costPrice = s
    },
    removeRow(i) {
      const pos = this.positions[i]
      this.$confirm(`确定删除「${pos.name}」持仓？`, '提示', {
        type: 'warning',
        confirmButtonText: '删除',
        cancelButtonText: '取消'
      }).then(() => {
        this.positions.splice(i, 1)
        savePositions(this.positions)
        this.$delete(this.quotes, pos.code)
      }).catch(() => {})
    },

    /* ============ 导航 ============ */
    goDetail(code) {
      this.$router.push('/finance/fund/' + code)
    }
  }
}
</script>

<style lang="scss" scoped>
.fp-page {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  min-height: 0;
}

/* 骨架屏 → 真实内容：淡入上浮（交叉切换） */
@keyframes fp-rise-in {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.fp-enter {
  animation: fp-rise-in 0.4s cubic-bezier(0.25, 0.8, 0.3, 1) backwards;
}

.fp-list.fp-enter {
  animation-delay: 0.08s;
}

/* 涨跌闪烁：估值变化时短暂高亮（红涨绿跌） */
@keyframes fp-flash-up {
  0% {
    background: rgba(245, 34, 45, 0.16);
  }
  100% {
    background: transparent;
  }
}

@keyframes fp-flash-down {
  0% {
    background: rgba(82, 196, 26, 0.16);
  }
  100% {
    background: transparent;
  }
}

.is-flash-up {
  display: inline-block;
  padding: 1px 5px;
  margin: -1px -5px;
  animation: fp-flash-up 0.9s ease;
  border-radius: 5px;
}

.is-flash-down {
  display: inline-block;
  padding: 1px 5px;
  margin: -1px -5px;
  animation: fp-flash-down 0.9s ease;
  border-radius: 5px;
}

/* ============ 汇总卡 ============ */
.fp-summary {
  display: flex;
  align-items: center;
  gap: 22px;
  padding: 13px 18px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  flex-wrap: wrap;
}

.fp-sum-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fp-sum-label {
  font-size: 10.5px;
  color: var(--text-secondary);
}

.fp-sum-value {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  line-height: 1.1;
}

.fp-sum-cell {
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding-left: 22px;
  border-left: 1px solid var(--border-color);

  .fp-sum-label {
    align-self: center;
  }
}

.fp-sum-num {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.fp-sum-rate {
  font-size: 11.5px;
  font-weight: 600;
}

.fp-sum-time {
  font-size: 11px;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

/* 汇总卡右侧组：市场状态 + 估值时间 */
.fp-sum-right {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
}

/* 市场状态胶囊 */
.fp-market-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  font-weight: 600;
  padding: 3px 9px;
  border-radius: 999px;
  line-height: 1;

  .chip-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: currentColor;
  }

  // 交易中：绿色 + 呼吸点
  &.open {
    color: #389E0D;
    background: rgba(82, 196, 26, 0.12);

    .chip-dot {
      animation: fp-chip-blink 1.6s ease infinite;
    }
  }

  // 午间休市：橙色
  &.break {
    color: #D46B08;
    background: rgba(250, 140, 22, 0.12);
  }

  // 已收盘 / 非交易日 / 未开盘：灰色
  &.closed {
    color: var(--text-secondary);
    background: var(--search-bg);
  }
}

@keyframes fp-chip-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* ============ 列表 ============ */
/* 网格 + subgrid：名称列取所有行最长内容（最小 208px），各行指标列对齐 */
.fp-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: minmax(208px, max-content) minmax(0, 1fr) auto;
  gap: 8px 14px;
  align-content: start;
  -webkit-app-region: no-drag;
  padding: 2px;
}

.fp-row {
  display: grid;
  grid-template-columns: subgrid;
  grid-column: 1 / -1;
  align-items: center;
  padding: 11px 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);

    .fp-row-ops {
      opacity: 1;
    }
  }
}

.fp-row-main {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.fp-row-title {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.fp-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  // 单行完整显示，不换行不截断
  white-space: nowrap;
}

.fp-code {
  font-size: 10.5px;
  color: var(--text-secondary);
}

.fp-type {
  font-size: 9.5px;
  color: var(--text-secondary);
  background: var(--search-bg);
  padding: 0 5px;
  border-radius: 6px;
  white-space: nowrap;
  flex-shrink: 0;
}

.fp-row-quote {
  display: flex;
  align-items: baseline;
  gap: 8px;
  // 估值/涨幅/时间一行排开（时间含年月日秒，较长）
  white-space: nowrap;
}

.fp-price {
  font-size: 14px;
  font-weight: 700;
}

.fp-pct {
  font-size: 12px;
  font-weight: 600;
  padding: 0 6px;
  border-radius: 8px;
}

.fp-quote-time {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.fp-error {
  font-size: 11px;
  color: #FA8C16;
}

/* 指标格 */
.fp-row-cells {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  min-width: 0;
}

.fp-cell {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  padding: 0 10px;
}

.fp-cell-label {
  font-size: 10px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.fp-cell-value {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;

  em {
    font-style: normal;
    font-size: 10.5px;
    margin-left: 4px;
  }
}

/* 操作列 */
.fp-row-ops {
  display: flex;
  gap: 6px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.fp-op {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: center;

  .svg-icon {
    width: 13px;
    height: 13px;
  }
  transition: all 0.15s ease;

  &:hover {
    color: var(--primary-color);
    border-color: rgba(var(--primary-color-rgb), 0.5);
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;

    &:hover {
      color: var(--text-secondary);
      border-color: var(--border-color);
    }
  }

  &.is-danger:hover {
    color: #F54A45;
    border-color: rgba(245, 74, 69, 0.5);
  }
}

/* 空状态 */
.fp-empty {
  grid-column: 1 / -1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 260px;
  border: 1.5px dashed var(--border-color);
  border-radius: 12px;
  color: var(--text-secondary);

  i {
    font-size: 34px;
    opacity: 0.4;
  }

  p {
    font-size: 13px;
  }

  .fp-empty-sub {
    font-size: 11px;
    opacity: 0.75;
  }
}

/* ============ 弹窗 ============ */
.fp-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  background: var(--search-bg);
  border-radius: 10px;

  > .el-icon-search {
    color: var(--text-secondary);
    font-size: 14px;
  }

  input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    color: var(--text-primary);

    &::placeholder {
      color: var(--text-secondary);
    }
  }

  .fp-search-clear {
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 13px;

    &:hover {
      color: var(--text-primary);
    }
  }

  .fp-search-loading {
    font-size: 13px;
    color: var(--text-secondary);
  }
}

.fp-picked {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 9px 12px;
  border-radius: 10px;
  background: rgba(var(--primary-color-rgb), 0.07);
  border: 1px solid rgba(var(--primary-color-rgb), 0.25);
}

.fp-picked-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-color);
}

.fp-picked-code {
  font-size: 11px;
  color: var(--text-secondary);
}

.fp-picked-nav {
  margin-left: auto;
  font-size: 11.5px;
  color: var(--text-secondary);
}

.fp-form {
  margin-top: 4px;

  .el-form-item {
    margin-bottom: 12px;
  }
}

.fp-form-hint {
  font-size: 10.5px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-top: 2px;
}

.fp-cost-preview {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.fp-cost-shares {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 8px;
}

.fp-num-input {
  width: 100%;
}

/* ============ 倒计时刷新按钮 ============ */
.fp-cd-btn {
  min-width: 92px;
  justify-content: center;
  font-variant-numeric: tabular-nums;

  .fp-cd-text {
    font-size: 12px;
    font-weight: 600;
  }

  // 倒计时中：数字用主题色，秒数个位数时轻微强调
  &.counting .fp-cd-text {
    color: var(--primary-color);
  }

  // 刷新中：旋转图标 + 主题色描边
  &.refreshing {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    color: var(--primary-color);
  }

  // 成功态：绿色闪烁反馈
  &.success {
    border-color: rgba(82, 196, 26, 0.55);
    color: #52C41A;
    animation: fp-cd-pop 0.3s ease;
  }

  // 失败态：橙色提示
  &.fail {
    border-color: rgba(250, 140, 22, 0.6);
    color: #FA8C16;
  }
}

@keyframes fp-cd-pop {
  0% { transform: scale(0.96); }
  55% { transform: scale(1.04); }
  100% { transform: scale(1); }
}
</style>

<style lang="scss">
/* ============ 添加持仓弹窗（对齐收藏页弹窗风格） ============ */
.fp-dialog {
  border-radius: 14px !important;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18) !important;

  .el-dialog__header {
    padding: 16px 20px 10px;

    .el-dialog__title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary, #1A1A1F);
    }

    .el-dialog__headerbtn {
      .el-dialog__close {
        font-size: 15px;
        color: var(--text-secondary);
        transition: color 0.15s ease;

        &:hover {
          color: var(--text-primary);
        }
      }
    }
  }

  .el-dialog__body {
    padding: 8px 20px 4px;
  }

  .el-dialog__footer {
    padding: 10px 20px 16px;

    .dialog-footer {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
    }
  }
}

/* ============ 金额隐私切换按钮 ============ */
.fp-eye-btn {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg);
  color: var(--text-secondary);
  font-size: 14px;
  cursor: pointer;
  transition: all 0.15s ease;
  padding: 0;

  &:hover {
    color: var(--primary-color);
    border-color: rgba(var(--primary-color-rgb), 0.5);
  }

  // 隐藏金额激活态：主题色高亮
  &.is-hidden {
    color: var(--primary-color);
    border-color: rgba(var(--primary-color-rgb), 0.5);
    background: rgba(var(--primary-color-rgb), 0.08);
  }
}

/* ============ 骨架屏 ============ */
.fp-sk {
  background: linear-gradient(90deg, var(--search-bg) 25%, var(--border-color) 37%, var(--search-bg) 63%);
  background-size: 400% 100%;
  animation: fp-sk-wave 1.3s ease infinite;
  border-radius: 6px;
}

.fp-sk.sk-line {
  height: 13px;
}

.fp-sk.sk-pill {
  height: 20px;
  border-radius: 999px;
}

@keyframes fp-sk-wave {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}

.fp-sk-row {
  // 骨架行保持伸缩布局（覆盖行的 subgrid），整行横跨网格
  display: flex;
  gap: 14px;
  grid-column: 1 / -1;
  cursor: default;
  pointer-events: none;
}

.fp-sk-row-main {
  flex: 1.1;
  min-width: 0;
}

.fp-sk-row-cells {
  flex: 2;
  display: flex;
  gap: 18px;
  justify-content: flex-end;
}
</style>
