<template>
  <tool-shell
    title="Cron 表达式"
    desc="可视化配置定时任务五字段，实时预览执行时间"
    icon="timer"
    color="#FAAD14"
    back-path="/tools/other"
  >
    <template #toolbar>
      <button class="tool-btn" :class="{ 'is-primary': historyVisible }" @click="historyVisible = !historyVisible">
        <svg-icon icon-class="time" />
        历史
      </button>
    </template>

    <div class="split-pane">
      <!-- 左：五字段构建器 -->
      <div class="pane" style="flex: 1.35">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">字段配置</span>
        </div>
        <div class="pane-body cron-builder">
          <div v-for="f in fields" :key="f.key" class="cron-field">
            <div class="cron-field-row">
              <div class="cron-field-label">
                <span class="cron-field-name">{{ f.label }}</span>
                <span class="cron-field-val mono">{{ fieldValue(f) }}</span>
              </div>
              <div class="tool-seg">
                <span
                  v-for="m in ['every', 'step', 'spec']"
                  :key="m"
                  class="tool-seg-item"
                  :class="{ active: state[f.key].mode === m }"
                  @click="state[f.key].mode = m"
                >{{ modeLabel(m) }}</span>
              </div>
              <div v-if="state[f.key].mode === 'step'" class="cron-step">
                <span>每</span>
                <el-input-number
                  v-model="state[f.key].step"
                  size="small"
                  :min="1"
                  :max="f.max - f.min + 1"
                  controls-position="right"
                />
                <span>{{ f.unit }}</span>
              </div>
              <div v-if="state[f.key].mode === 'spec'" class="cron-spec-hint">
                点选{{ f.label }}值{{ state[f.key].selected.length ? '（已选 ' + state[f.key].selected.length + '）' : '' }}
              </div>
            </div>
            <div v-if="state[f.key].mode === 'spec'" class="cron-chips">
              <button
                v-for="n in f.values"
                :key="n"
                class="cron-chip mono"
                :class="{ active: state[f.key].selected.includes(n) }"
                @click="toggleSpec(f.key, n)"
              >{{ f.chipLabel ? f.chipLabel(n) : n }}</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 右：表达式与预览 -->
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">表达式预览</span>
        </div>
        <div class="pane-body cron-preview">
          <!-- 表达式 -->
          <div class="cron-expr-card">
            <div class="cron-expr mono" :class="{ 'is-bad': !parsed.ok }">{{ expression || '— — — — —' }}</div>
            <div class="cron-expr-actions">
              <span class="cron-valid" :class="parsed.ok ? 'ok' : 'bad'">
                {{ parsed.ok ? '✓ 表达式有效' : '✕ ' + parsed.error }}
              </span>
              <button class="tool-btn" :disabled="!parsed.ok" @click="copyExpr">
                <svg-icon icon-class="document-copy" />复制
              </button>
            </div>
          </div>

          <!-- 中文描述 -->
          <div class="cron-desc">
            <div class="cron-desc-title">执行规则</div>
            <div class="cron-desc-text">{{ description }}</div>
            <div v-if="dowDomNote" class="cron-desc-note">{{ dowDomNote }}</div>
          </div>

          <!-- 下次执行 -->
          <div class="cron-next">
            <div class="cron-desc-title">未来 5 次执行</div>
            <div v-if="nextRuns.length" class="cron-next-list">
              <div v-for="(run, i) in nextRuns" :key="i" class="cron-next-item">
                <span class="mono">{{ fmt(run) }}</span>
                <span class="cron-next-rel">{{ relative(run) }}</span>
              </div>
            </div>
            <div v-else-if="parsed.ok" class="cron-next-empty">6 年内未找到执行时间，请检查字段组合</div>
            <div v-else class="cron-next-empty">表达式无效，无法预览</div>
          </div>

          <!-- 常用示例 -->
          <div class="cron-examples">
            <div class="cron-desc-title">常用示例</div>
            <div class="cron-example-chips">
              <button
                v-for="ex in examples"
                :key="ex.label"
                class="cron-example"
                @click="applyExample(ex)"
              >{{ ex.label }}</button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 执行历史面板（与分栏并排，右侧抽屉） -->
    <tool-history-panel
      :visible="historyVisible"
      :tool="TOOL_PATH"
      @close="historyVisible = false"
      @restore="restoreFromHistory"
    />

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !parsed.ok }"></span>
      <span>5 字段 Cron（分 时 日 月 周）</span>
      <span class="status-right">标准 Quartz/Linux crontab 通用格式</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/tool-history'

const TOOL_PATH = '/tools/other/cron'

// 五字段定义：min/max 取值范围，values 可选值序列
const FIELD_DEFS = [
  { key: 'minute', label: '分钟', min: 0, max: 59, unit: '分钟' },
  { key: 'hour', label: '小时', min: 0, max: 23, unit: '小时' },
  { key: 'dom', label: '日', min: 1, max: 31, unit: '天' },
  { key: 'month', label: '月', min: 1, max: 12, unit: '个月' },
  { key: 'dow', label: '周', min: 0, max: 6, unit: '天', chipLabel: n => '周' + '日一二三四五六'[n] }
].map(f => ({
  ...f,
  values: Array.from({ length: f.max - f.min + 1 }, (_, i) => f.min + i)
}))

const WEEK_CN = n => '周' + '日一二三四五六'[n]

export default {
  name: 'OtherCron',
  components: { ToolShell, ToolHistoryPanel },
  data() {
    return {
      fields: FIELD_DEFS,
      historyVisible: false,
      TOOL_PATH: TOOL_PATH,
      // 每个字段的选择状态：every 任意 / step 每N / spec 指定
      state: {
        minute: { mode: 'spec', step: 5, selected: [30] },
        hour: { mode: 'spec', step: 2, selected: [9] },
        dom: { mode: 'every', step: 2, selected: [] },
        month: { mode: 'every', step: 3, selected: [] },
        dow: { mode: 'spec', step: 2, selected: [1, 2, 3, 4, 5] }
      },
      examples: [
        { label: '每分钟', expr: '* * * * *' },
        { label: '每 5 分钟', expr: '*/5 * * * *' },
        { label: '每小时 30 分', expr: '30 * * * *' },
        { label: '每天 3:00', expr: '0 3 * * *' },
        { label: '工作日 9:30', expr: '30 9 * * 1-5' },
        { label: '每周一 8:00', expr: '0 8 * * 1' },
        { label: '每月 1 号 0 点', expr: '0 0 1 * *' },
        { label: '每年 1 月 1 日', expr: '0 0 1 1 *' }
      ]
    }
  },
  computed: {
    // 由构建器状态生成表达式
    expression() {
      return FIELD_DEFS.map(f => {
        const s = this.state[f.key]
        if (s.mode === 'every' || (s.mode === 'spec' && !s.selected.length)) return '*'
        if (s.mode === 'step') return '*/' + s.step
        return [...s.selected].sort((a, b) => a - b).join(',')
      }).join(' ')
    },
    // 解析表达式为允许值集合（用于预览执行时间）
    parsed() {
      return this.parseCron(this.expression)
    },
    nextRuns() {
      return this.nextN(this.parsed, 5)
    },
    // 日与周同时受限时的语义提示（标准 cron 为"或"关系）
    dowDomNote() {
      const domRestrict = this.state.dom.mode !== 'every' && this.state.dom.selected.length > 0
      const dowRestrict = this.state.dow.mode !== 'every' && this.state.dow.selected.length > 0
      return domRestrict && dowRestrict
        ? '注：日 与 周 同时指定时，任一匹配即执行（标准 Cron 的 OR 语义）'
        : ''
    },
    // 中文规则描述
    description() {
      if (!this.parsed.ok) return '—'
      const m = this.state.minute
      const h = this.state.hour
      const dom = this.state.dom
      const mo = this.state.month
      const dow = this.state.dow
      const mm = m.mode === 'spec' && m.selected.length === 1 ? m.selected[0] : null
      const hh = h.mode === 'spec' && h.selected.length === 1 ? h.selected[0] : null
      const pad = n => String(n).padStart(2, '0')

      // 常见模式的简洁描述
      if (dom.mode === 'every' && mo.mode === 'every' && dow.mode === 'every') {
        if (m.mode === 'every' && h.mode === 'every') return '每分钟执行一次'
        if (m.mode === 'step') return `每 ${m.step} 分钟执行一次`
        if (h.mode === 'step') return `每 ${h.step} 小时的第 ${mm !== null ? mm : 'X'} 分钟执行`
        if (mm !== null && hh !== null) return `每天 ${pad(hh)}:${pad(mm)} 执行`
        if (mm !== null && h.mode === 'every') return `每小时第 ${mm} 分钟执行`
      }
      if (mm !== null && hh !== null) {
        let when = ''
        if (dow.mode === 'spec' && dow.selected.length === 1) when = `每${WEEK_CN(dow.selected[0])}`
        else if (dow.mode === 'spec') when = '每' + dow.selected.slice().sort((a, b) => a - b).map(WEEK_CN).join('、')
        else if (dom.mode === 'spec' && dom.selected.length === 1) when = `每月 ${dom.selected[0]} 号`
        else if (dom.mode === 'spec') when = '每月 ' + dom.selected.slice().sort((a, b) => a - b).join('、') + ' 号'
        if (when) {
          const monthPart = mo.mode === 'spec' && mo.selected.length
            ? mo.selected.length === 1 ? `${mo.selected[0]} 月` : mo.selected.slice().sort((a, b) => a - b).join('、') + ' 月'
            : ''
          return `${monthPart}${when} ${pad(hh)}:${pad(mm)} 执行`
        }
      }
      // 兜底：逐字段拼接
      const parts = []
      parts.push(this.describeField('minute'))
      parts.push(this.describeField('hour'))
      parts.push(this.describeField('dom'))
      parts.push(this.describeField('month'))
      parts.push(this.describeField('dow'))
      return parts.join('，') + ' 执行'
    }
  },
  methods: {
    modeLabel(m) {
      return { every: '任意', step: '每N', spec: '指定' }[m]
    },
    fieldValue(f) {
      const s = this.state[f.key]
      if (s.mode === 'every' || (s.mode === 'spec' && !s.selected.length)) return '*'
      if (s.mode === 'step') return '*/' + s.step
      return [...s.selected].sort((a, b) => a - b).join(',')
    },
    toggleSpec(key, n) {
      const s = this.state[key]
      const i = s.selected.indexOf(n)
      if (i >= 0) s.selected.splice(i, 1)
      else s.selected.push(n)
    },
    describeField(key) {
      const f = FIELD_DEFS.find(x => x.key === key)
      const s = this.state[key]
      if (s.mode === 'every' || (s.mode === 'spec' && !s.selected.length)) {
        return { minute: '每分钟', hour: '每小时', dom: '每天', month: '每月', dow: '每天' }[key]
      }
      if (s.mode === 'step') {
        return { minute: `每 ${s.step} 分钟`, hour: `每 ${s.step} 小时`, dom: `每 ${s.step} 天`, month: `每 ${s.step} 个月`, dow: `每 ${s.step} 天` }[key]
      }
      const list = s.selected.slice().sort((a, b) => a - b)
      if (key === 'dow') return list.map(WEEK_CN).join('、')
      if (key === 'minute') return `第 ${list.join('/')} 分钟`
      if (key === 'hour') return `${list.join('/')} 点`
      if (key === 'dom') return `每月 ${list.join('/')} 号`
      if (key === 'month') return `${list.join('/')} 月`
      return list.join('/')
    },
    // ---- Cron 解析：表达式 → 各字段允许值集合 ----
    parseField(part, min, max, isDow) {
      const sets = new Set()
      for (const seg of part.split(',')) {
        const m = seg.match(/^(\*|\d+-\d+|\d+)?(?:\/(\d+))?$/)
        if (!m) return { error: `字段 "${seg}" 格式不正确` }
        const range = m[1] || '*'
        const step = m[2] ? Number(m[2]) : 1
        if (step < 1) return { error: `步长 "${m[2]}" 必须为正整数` }
        let lo = min
        let hi = max
        if (range !== '*') {
          if (range.includes('-')) {
            const [a, b] = range.split('-').map(Number)
            lo = a
            hi = b
          } else {
            lo = Number(range)
            hi = m[2] ? max : lo // "3/2" 视为 3 到 max 每 2
          }
        }
        if (lo < min || hi > max || lo > hi) return { error: `取值应在 ${min}-${max} 之间` }
        for (let v = lo; v <= hi; v += step) {
          // 周字段 7 与 0 均表示周日
          if (isDow && v === 7) sets.add(0)
          else sets.add(v)
        }
      }
      return { sets }
    },
    parseCron(expr) {
      const parts = expr.trim().split(/\s+/)
      if (parts.length !== 5) return { ok: false, error: '需要 5 个字段' }
      const ranges = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]]
      const keys = ['minute', 'hour', 'dom', 'month', 'dow']
      const out = {}
      for (let i = 0; i < 5; i++) {
        const r = this.parseField(parts[i], ranges[i][0], ranges[i][1], keys[i] === 'dow')
        if (r.error) return { ok: false, error: r.error }
        out[keys[i]] = r.sets
      }
      // dom/dow 均为 * 时特殊处理见 nextN；这里记录是否受限
      out.domAll = parts[2] === '*'
      out.dowAll = parts[4] === '*'
      return { ok: true, ...out }
    },
    // ---- 计算未来 n 次执行时间：按天推进，天内在允许的时分上展开 ----
    nextN(parsed, n) {
      if (!parsed.ok) return []
      const hours = [...parsed.hour].sort((a, b) => a - b)
      const minutes = [...parsed.minute].sort((a, b) => a - b)
      const now = new Date()
      const runs = []
      // 最多向后找 6 年
      const maxDays = 366 * 6
      for (let d = 0; d < maxDays && runs.length < n; d++) {
        const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() + d)
        if (!parsed.month.has(day.getMonth() + 1)) continue
        const domMatch = parsed.dom.has(day.getDate())
        const dowMatch = parsed.dow.has(day.getDay())
        // 标准 Cron：两边都受限时任一匹配即可；仅一边受限时需该边匹配
        const dayOk = parsed.domAll && parsed.dowAll
          ? true
          : parsed.domAll ? dowMatch
            : parsed.dowAll ? domMatch
              : domMatch || dowMatch
        if (!dayOk) continue
        for (const h of hours) {
          for (const m of minutes) {
            const t = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
            if (t > now) {
              runs.push(t)
              if (runs.length >= n) break
            }
          }
          if (runs.length >= n) break
        }
      }
      return runs
    },
    fmt(d) {
      const pad = n => String(n).padStart(2, '0')
      const week = WEEK_CN(d.getDay())
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())} ${week}`
    },
    relative(d) {
      const diff = d - Date.now()
      const mins = Math.round(diff / 60000)
      if (mins < 60) return `${mins} 分钟后`
      const hours = Math.floor(mins / 60)
      if (hours < 24) return `${hours} 小时 ${mins % 60} 分钟后`
      return `${Math.floor(hours / 24)} 天后`
    },
    // 应用示例：解析表达式回填构建器状态
    applyExample(ex) {
      const parts = ex.expr.split(' ')
      const keys = ['minute', 'hour', 'dom', 'month', 'dow']
      parts.forEach((p, i) => {
        const key = keys[i]
        const f = FIELD_DEFS.find(x => x.key === key)
        const s = this.state[key]
        if (p === '*') {
          s.mode = 'every'
          s.selected = []
        } else if (p.startsWith('*/')) {
          s.mode = 'step'
          s.step = Number(p.slice(2))
          s.selected = []
        } else if (/^\d+-\d+$/.test(p)) {
          // 区间展开为指定
          const [a, b] = p.split('-').map(Number)
          s.mode = 'spec'
          s.selected = []
          for (let v = a; v <= b; v++) s.selected.push(v === 7 ? 0 : v)
        } else {
          s.mode = 'spec'
          s.selected = p.split(',').map(v => (Number(v) === 7 ? 0 : Number(v)))
        }
      })
    },
    async copyExpr() {
      try {
        await navigator.clipboard.writeText(this.expression)
        this.$message.success('已复制：' + this.expression)
        record(TOOL_PATH, {
          input: this.expression,
          output: this.description,
          options: { action: 'copy', expr: this.expression }
        })
      } catch (e) {
        this.$message.error('复制失败')
      }
    },
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      const expr = (full.options && full.options.expr) || full.input
      if (expr) this.applyExample({ expr })
      this.$message.success('已从历史恢复')
    }
  }
}
</script>

<style lang="scss" scoped>
.cron-builder {
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  -webkit-app-region: no-drag;
}

.cron-field {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bg-color, transparent);
}

.cron-field-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.cron-field-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 110px;
}

.cron-field-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.cron-field-val {
  font-size: 11.5px;
  color: var(--primary-color);
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cron-step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);

  .el-input-number {
    width: 84px;
  }
}

.cron-spec-hint {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.cron-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 9px;
  padding-top: 9px;
  border-top: 1px dashed var(--border-color);
}

.cron-chip {
  min-width: 30px;
  height: 22px;
  padding: 0 5px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--card-bg);
  color: var(--text-secondary);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    color: var(--primary-color);
  }

  &.active {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: #fff;
  }
}

.cron-preview {
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  -webkit-app-region: no-drag;
}

.cron-expr-card {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 12px 14px;
  background: var(--search-bg);
}

.cron-expr {
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 1px;
  word-break: break-all;

  &.is-bad {
    color: var(--danger-color);
  }
}

.cron-expr-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 9px;
}

.cron-valid {
  font-size: 11.5px;

  &.ok { color: var(--success-color); }
  &.bad { color: var(--danger-color); }
}

.cron-desc,
.cron-next,
.cron-examples {
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 11px 14px;
}

.cron-desc-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 8px;
}

.cron-desc-text {
  font-size: 13.5px;
  color: var(--text-primary);
  line-height: 1.6;
}

.cron-desc-note {
  margin-top: 7px;
  font-size: 11px;
  color: #FA8C16;
}

.cron-next-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.cron-next-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12.5px;
  color: var(--text-primary);
  padding: 5px 8px;
  border-radius: 7px;
  background: var(--search-bg);
}

.cron-next-rel {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
  margin-left: 10px;
}

.cron-next-empty {
  min-height: 88px;
  display: flex;
  align-items: center;
  font-size: 12px;
  color: var(--text-secondary);
}

.cron-example-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.cron-example {
  height: 24px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  color: var(--text-secondary);
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.14s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.05);
  }
}
</style>
