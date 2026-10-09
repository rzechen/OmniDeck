<template>
  <tool-shell
    title="日历"
    desc="公历农历对照，法定节假日休班与二十四节气"
    icon="calendar"
    color="#13C2C2"
    back-path="/tools/life"
  >
    <template #toolbar>
      <button class="tool-btn" title="上个月" @click="shiftMonth(-1)">
        <svg-icon icon-class="arrow-left" />
      </button>
      <div class="cal-picker">
        <el-select
          v-model="year"
          class="tool-select cal-year-select"
          size="small"
          popper-class="cal-popper"
        >
          <el-option v-for="y in yearOptions" :key="y" :label="y + ' 年'" :value="y" />
        </el-select>
        <el-select
          v-model="month"
          class="tool-select cal-month-select"
          size="small"
          popper-class="cal-popper"
        >
          <el-option v-for="m in 12" :key="m" :label="m + ' 月'" :value="m" />
        </el-select>
      </div>
      <button class="tool-btn" title="下个月" @click="shiftMonth(1)">
        <svg-icon icon-class="arrow-right" />
      </button>
      <button class="tool-btn" @click="goToday">今天</button>
    </template>

    <div class="cal-body">
      <!-- 星期表头 -->
      <div class="cal-week">
        <span
          v-for="w in weeks"
          :key="w"
          class="cal-week-item"
          :class="{ weekend: w === '六' || w === '日' }"
        >{{ w }}</span>
      </div>
      <!-- 日期网格 -->
      <div class="cal-grid">
        <div
          v-for="(cell, i) in cells"
          :key="i"
          class="cal-cell"
          :class="{
            'is-empty': !cell,
            'is-today': cell && cell.isToday,
            'is-selected': cell && isSelected(cell),
            'is-weekend': cell && (cell.week === 0 || cell.week === 6),
            'is-off': cell && cell.isOff,
            'is-work': cell && cell.isWork
          }"
          :title="cell && cell.tip"
          @click="cell && selectDate(cell)"
        >
          <template v-if="cell">
            <span v-if="cell.isWork" class="cal-badge is-work-badge">班</span>
            <span v-else-if="cell.isOff" class="cal-badge is-off-badge">休</span>
            <div class="cal-cell-top">
              <span class="cal-solar">{{ cell.day }}</span>
              <span class="cal-gz">{{ cell.gzDay }} · {{ cell.star }}</span>
            </div>
            <div class="cal-lunar" :class="{ 'is-term': cell.term, 'is-festival': cell.festival }">
              {{ cell.label }}
            </div>
          </template>
        </div>
      </div>
      <!-- 当日老黄历详情 -->
      <div v-if="selInfo" class="cal-detail">
        <div class="cal-dt-main">
          <div class="cal-dt-lunar">
            {{ selInfo.isLeap ? '闰' : '' }}{{ selInfo.monthCn }}{{ selInfo.dayCn }}
          </div>
          <div class="cal-dt-gz">
            {{ selInfo.gzYear }}年 {{ selInfo.gzMonth }}月 {{ selInfo.gzDay }}日
          </div>
          <div class="cal-dt-tags">
            <span class="cal-dt-tag">{{ selInfo.animal }}年</span>
            <span v-if="selInfo.term" class="cal-dt-tag is-term">{{ selInfo.term }}</span>
            <span v-if="selInfo.festival" class="cal-dt-tag is-fest">{{ selInfo.festival }}</span>
            <span v-if="selInfo.isOff" class="cal-dt-tag is-off">法定节假日</span>
            <span v-if="selInfo.isWork" class="cal-dt-tag is-work">调休上班</span>
          </div>
        </div>
        <div class="cal-dt-star">
          <span class="cal-dt-star-badge">{{ selInfo.star.name }}</span>
          <div class="cal-dt-star-meta">
            <span class="cal-dt-star-label">十二值神</span>
            <span class="cal-dt-clash">冲{{ selInfo.clashAnimal }}煞{{ selInfo.shaDir }}</span>
          </div>
        </div>
        <div class="cal-dt-yi">
          <span class="cal-dt-yi-label">宜</span>
          <span class="cal-dt-yi-items">{{ selInfo.star.yi }}</span>
        </div>
        <div class="cal-dt-ji">
          <span class="cal-dt-ji-label">忌</span>
          <span class="cal-dt-ji-items">{{ selInfo.star.ji }}</span>
        </div>
      </div>
      <!-- 图例 -->
      <div class="cal-legend">
        <span class="cal-legend-item"><i class="lg-dot lg-off"></i>休 · 法定节假日</span>
        <span class="cal-legend-item"><i class="lg-dot lg-work"></i>班 · 调休上班</span>
        <span class="cal-legend-item"><i class="lg-dot lg-term"></i>节气</span>
        <span v-if="!hasHolidayData" class="cal-legend-item is-muted">暂无 {{ year }} 年休班安排数据</span>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ todayText }}</span>
      <span class="status-right">{{ festivalCount }} 个本月节假日/节气</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed } from 'vue'
import solarlunar from 'solarlunar'
import ToolShell from '@/components/tool/ToolShell.vue'

const WEEKS = ['一', '二', '三', '四', '五', '六', '日']
// 农历节日（按农历月-日）
const LUNAR_FESTIVALS = { '1-1': '春节', '1-15': '元宵节', '5-5': '端午节', '7-7': '七夕节', '8-15': '中秋节', '9-9': '重阳节', '12-8': '腊八节' }
// 公历节日
const SOLAR_FESTIVALS = { '1-1': '元旦', '2-14': '情人节', '3-8': '妇女节', '4-1': '愚人节', '4-4': '清明节', '5-1': '劳动节', '5-4': '青年节', '6-1': '儿童节', '7-1': '建党节', '8-1': '建军节', '9-10': '教师节', '10-1': '国庆节', '12-25': '圣诞节' }

// 生成同年内 'MM-DD' 区间列表
function dateRange(y, m1, d1, m2, d2) {
  const out = []
  const start = new Date(y, m1 - 1, d1)
  const end = new Date(y, m2 - 1, d2)
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    out.push(String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'))
  }
  return out
}

// 国务院办公厅公布的法定节假日放假调休安排（off=放假，work=调休上班）
const HOLIDAYS = {
  2025: {
    // 元旦1天；春节1.28-2.4；清明4.4-4.6；劳动5.1-5.5；端午5.31-6.2；国庆中秋10.1-10.8
    off: [
      ...dateRange(2025, 1, 1, 1, 1),
      ...dateRange(2025, 1, 28, 2, 4),
      ...dateRange(2025, 4, 4, 4, 6),
      ...dateRange(2025, 5, 1, 5, 5),
      ...dateRange(2025, 5, 31, 6, 2),
      ...dateRange(2025, 10, 1, 10, 8)
    ],
    work: ['01-26', '02-08', '04-27', '09-28', '10-11']
  },
  2026: {
    // 国办发明电〔2025〕7号：元旦1.1-1.3；春节2.15-2.23；清明4.4-4.6；
    // 劳动5.1-5.5；端午6.19-6.21；中秋9.25-9.27；国庆10.1-10.7
    off: [
      ...dateRange(2026, 1, 1, 1, 3),
      ...dateRange(2026, 2, 15, 2, 23),
      ...dateRange(2026, 4, 4, 4, 6),
      ...dateRange(2026, 5, 1, 5, 5),
      ...dateRange(2026, 6, 19, 6, 21),
      ...dateRange(2026, 9, 25, 9, 27),
      ...dateRange(2026, 10, 1, 10, 7)
    ],
    work: ['01-04', '02-14', '02-28', '05-09', '09-20', '10-10']
  }
}

/* ============ 老黄历：干支 / 十二值神 / 冲煞 ============ */
// 地支与生肖
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
const BRANCH_ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
// 地支六冲：子午冲 丑未冲 寅申冲 卯酉冲 辰戌冲 巳亥冲
const BRANCH_CLASH = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]
// 煞方：申子辰日煞南、寅午戌日煞北、巳酉丑日煞东、亥卯未日煞西
const SHA_DIR = ['南', '东', '北', '西', '南', '东', '北', '西', '南', '东', '北', '西']
// 十二建星（值神）与传统宜忌（简编）
const STARS = [
  { name: '建', yi: '出行 · 上书 · 见贵', ji: '动土 · 开仓 · 掘井' },
  { name: '除', yi: '沐浴 · 扫舍 · 求医', ji: '结婚 · 出行' },
  { name: '满', yi: '祈福 · 开市 · 结亲', ji: '服药 · 栽种' },
  { name: '平', yi: '修造 · 平整 · 修饰', ji: '词讼' },
  { name: '定', yi: '订婚 · 签约 · 安床', ji: '诉讼 · 出行' },
  { name: '执', yi: '祭祀 · 祈福 · 捕捉', ji: '搬家 · 远行' },
  { name: '破', yi: '破屋 · 坏垣 · 拆卸', ji: '结婚 · 签约 · 开市' },
  { name: '危', yi: '安床 · 静养', ji: '登高 · 行船' },
  { name: '成', yi: '开业 · 结婚 · 入学', ji: '诉讼' },
  { name: '收', yi: '纳财 · 收纳 · 置产', ji: '安葬 · 放债' },
  { name: '开', yi: '开业 · 开工 · 求职', ji: '安葬' },
  { name: '闭', yi: '安葬 · 修坟 · 筑堤', ji: '开市 · 出行' }
]

// 干支（如"甲子"）取地支索引
function branchOf(gz) {
  return BRANCHES.indexOf(gz.charAt(gz.length - 1))
}

// 十二值神：正月建寅，月支 = (农历月 + 1) % 12；建日在日支与月支相重之日，顺行十二辰
function starOf(sl) {
  const monthBranch = (Math.abs(sl.lMonth) + 1) % 12
  const dayBranch = branchOf(sl.gzDay)
  return STARS[(dayBranch - monthBranch + 12) % 12]
}

defineOptions({ name: 'LifeCalendar' })

const now = new Date()
const year = ref(now.getFullYear())
const month = ref(now.getMonth() + 1)
const today = ref(now)
const weeks = WEEKS
// 选中的日期（老黄历详情展示），默认今天
const selected = ref({
  y: now.getFullYear(),
  m: now.getMonth() + 1,
  d: now.getDate()
})

const yearOptions = computed(() => {
  const y = new Date().getFullYear()
  const out = []
  for (let i = y - 6; i <= y + 6; i++) out.push(i)
  return out
})

const hasHolidayData = computed(() => !!HOLIDAYS[year.value])

const monthLunarText = computed(() => {
  const sl = solarlunar.solar2lunar(year.value, month.value, 1)
  if (sl === -1) return ''
  return `${sl.gzYear}${sl.monthCn}`
})

const todayText = computed(() => {
  const d = today.value
  return `今天是 ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
})

const festivalCount = computed(() => cells.value.filter(c => c && c.festival).length)

// 选中日期的老黄历信息
const selInfo = computed(() => {
  const { y, m, d } = selected.value
  const sl = solarlunar.solar2lunar(y, m, d)
  if (sl === -1) return null
  const hd = HOLIDAYS[y] || null
  const key = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')
  const isOff = !!(hd && hd.off.indexOf(key) !== -1)
  const isWork = !!(hd && hd.work.indexOf(key) !== -1)
  const lunarKey = `${sl.lMonth}-${sl.lDay}`
  const solarKey = `${m}-${d}`
  const festival = LUNAR_FESTIVALS[lunarKey] || SOLAR_FESTIVALS[solarKey] || ''
  const dayBranch = branchOf(sl.gzDay)
  const clashIdx = BRANCH_CLASH[dayBranch]
  return {
    monthCn: sl.monthCn,
    dayCn: sl.dayCn,
    isLeap: sl.isLeap,
    gzYear: sl.gzYear,
    gzMonth: sl.gzMonth,
    gzDay: sl.gzDay,
    animal: sl.animal,
    term: sl.term || '',
    festival,
    isOff,
    isWork,
    star: starOf(sl),
    clashAnimal: BRANCH_ANIMALS[clashIdx],
    shaDir: SHA_DIR[dayBranch]
  }
})

// 日历格子：周一起始，前置补位
const cells = computed(() => {
  const Y = year.value
  const M = month.value
  const firstDay = new Date(Y, M - 1, 1)
  const daysInMonth = new Date(Y, M, 0).getDate()
  // 周一=0 ... 周日=6
  let lead = firstDay.getDay() - 1
  if (lead < 0) lead = 6
  const list = []
  for (let i = 0; i < lead; i++) list.push(null)
  const t = today.value
  const hd = HOLIDAYS[Y] || null
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(Y, M - 1, d)
    const sl = solarlunar.solar2lunar(Y, M, d)
    const week = date.getDay()
    const isToday =
      date.getFullYear() === t.getFullYear() &&
      date.getMonth() === t.getMonth() &&
      date.getDate() === t.getDate()
    const key = String(M).padStart(2, '0') + '-' + String(d).padStart(2, '0')
    const isOff = !!(hd && hd.off.indexOf(key) !== -1)
    const isWork = !!(hd && hd.work.indexOf(key) !== -1)
    // 标签优先级：节气 > 农历节日 > 公历节日 > 农历日
    const term = sl && sl.term ? sl.term : ''
    const lunarKey = sl ? `${sl.lMonth}-${sl.lDay}` : ''
    const solarKey = `${M}-${d}`
    const lunarFestival = LUNAR_FESTIVALS[lunarKey] || ''
    const solarFestival = SOLAR_FESTIVALS[solarKey] || ''
    let label = ''
    let festival = ''
    if (term) {
      label = term
    } else if (lunarFestival) {
      label = lunarFestival
      festival = lunarFestival
    } else if (solarFestival) {
      label = solarFestival
      festival = solarFestival
    } else {
      label = sl ? (sl.lDay === 1 ? sl.monthCn : sl.dayCn) : ''
    }
    const tips = []
    if (festival) tips.push(festival)
    if (term) tips.push(term + '（节气）')
    if (sl) tips.push(`农历 ${sl.monthCn}${sl.dayCn} · ${sl.gzDay}日`)
    if (isOff) tips.push('法定节假日放假')
    if (isWork) tips.push('调休上班')
    list.push({
      day: d,
      week,
      isToday,
      isOff,
      isWork,
      term,
      festival,
      label,
      gzDay: sl ? sl.gzDay : '',
      star: sl ? starOf(sl).name : '',
      tip: tips.join(' · ')
    })
  }
  return list
})

function isSelected(cell) {
  return (
    selected.value.y === year.value &&
    selected.value.m === month.value &&
    selected.value.d === cell.day
  )
}

function selectDate(cell) {
  selected.value = { y: year.value, m: month.value, d: cell.day }
}

function shiftMonth(delta) {
  const d = new Date(year.value, month.value - 1 + delta, 1)
  year.value = d.getFullYear()
  month.value = d.getMonth() + 1
}

function goToday() {
  const d = new Date()
  year.value = d.getFullYear()
  month.value = d.getMonth() + 1
}
</script>

<style lang="scss" scoped>
.cal-picker {
  display: flex;
  align-items: center;
  gap: 6px;

  .cal-year-select {
    width: 92px;
  }

  .cal-month-select {
    width: 80px;
  }
}

.cal-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.cal-week {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 6px;
  flex-shrink: 0;
}

.cal-week-item {
  text-align: center;
  font-size: 11.5px;
  color: var(--text-secondary);
  font-weight: 600;

  &.weekend {
    color: var(--danger-color);
    opacity: 0.75;
  }
}

.cal-grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  grid-auto-rows: 1fr;
  gap: 6px;
}

.cal-cell {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 8px;
  border-radius: 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.14s ease;
  text-align: left;

  &:hover:not(.is-empty) {
    border-color: rgba(var(--primary-color-rgb), 0.4);
    transform: translateY(-1px);
  }

  &.is-empty {
    background: transparent;
    border-color: transparent;
    cursor: default;
  }

  &.is-weekend .cal-solar {
    color: var(--danger-color);
  }

  &.is-off {
    background: rgba(var(--success-color-rgb),  0.07);
    border-color: rgba(var(--success-color-rgb),  0.28);
  }

  &.is-work {
    background: rgba(var(--warning-color-rgb),  0.07);
    border-color: rgba(var(--warning-color-rgb),  0.3);
  }

  &.is-today {
    border: 1.5px solid rgba(var(--primary-color-rgb), 0.6);
    background: rgba(var(--primary-color-rgb), 0.06);

    .cal-solar {
      color: var(--primary-color);
    }
  }

  &.is-selected {
    border-color: rgba(var(--primary-color-rgb), 0.65);
    box-shadow: 0 0 0 2.5px rgba(var(--primary-color-rgb), 0.14);
  }
}

.cal-cell-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px;
}

.cal-badge {
  position: absolute;
  bottom: 4px;
  right: 5px;
  height: 14px;
  line-height: 14px;
  padding: 0 4px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;

  &.is-off-badge {
    background: rgba(var(--success-color-rgb),  0.85);
    color: #fff;
  }

  &.is-work-badge {
    background: rgba(var(--warning-color-rgb),  0.9);
    color: #fff;
  }
}

.cal-solar {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

// 干支 + 值神小字
.cal-gz {
  font-size: 9px;
  color: var(--text-secondary);
  opacity: 0.85;
  white-space: nowrap;
}

.cal-lunar {
  font-size: 9.5px;
  color: var(--text-secondary);

  &.is-term {
    color: var(--success-color);
    font-weight: 600;
  }

  &.is-festival {
    color: var(--danger-color);
    font-weight: 600;
  }
}

/* ============ 老黄历详情面板 ============ */
.cal-detail {
  display: flex;
  align-items: stretch;
  gap: 14px;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  overflow-x: auto;
}

.cal-dt-main {
  min-width: 150px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cal-dt-lunar {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.cal-dt-gz {
  font-size: 11px;
  color: var(--text-secondary);
}

.cal-dt-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}

.cal-dt-tag {
  height: 16px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 8px;
  font-size: 10px;
  font-weight: 600;
  background: var(--search-bg);
  color: var(--text-secondary);

  &.is-term {
    background: rgba(var(--success-color-rgb),  0.12);
    color: var(--success-color);
  }

  &.is-fest {
    background: rgba(var(--danger-color-rgb),  0.1);
    color: var(--danger-color);
  }

  &.is-off {
    background: rgba(var(--success-color-rgb),  0.12);
    color: var(--success-color);
  }

  &.is-work {
    background: rgba(var(--warning-color-rgb),  0.12);
    color: #FA8C16;
  }
}

/* 值神与冲煞 */
.cal-dt-star {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 14px;
  border-left: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
}

.cal-dt-star-badge {
  width: 34px;
  height: 34px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-size: 16px;
  font-weight: 700;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  border: 1px solid rgba(var(--primary-color-rgb), 0.3);
  flex-shrink: 0;
}

.cal-dt-star-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.cal-dt-star-label {
  font-size: 10px;
  color: var(--text-secondary);
}

.cal-dt-clash {
  font-size: 11px;
  color: var(--text-primary);
  font-weight: 500;
}

/* 宜 / 忌 */
.cal-dt-yi,
.cal-dt-ji {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.cal-dt-yi-label,
.cal-dt-ji-label {
  width: 26px;
  height: 26px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  font-size: 13px;
  font-weight: 700;
  flex-shrink: 0;
}

.cal-dt-yi-label {
  color: var(--success-color);
  background: rgba(var(--success-color-rgb),  0.1);
  border: 1px solid rgba(var(--success-color-rgb),  0.3);
}

.cal-dt-ji-label {
  color: var(--danger-color);
  background: rgba(var(--danger-color-rgb),  0.08);
  border: 1px solid rgba(var(--danger-color-rgb),  0.3);
}

.cal-dt-yi-items,
.cal-dt-ji-items {
  font-size: 11.5px;
  color: var(--text-primary);
  line-height: 1.6;
}

.cal-legend {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 2px 4px 0;
  flex-shrink: 0;
}

.cal-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: var(--text-secondary);

  &.is-muted {
    color: #FA8C16;
  }

  .lg-dot {
    width: 8px;
    height: 8px;
    border-radius: 3px;

    &.lg-off {
      background: rgba(var(--success-color-rgb),  0.85);
    }

    &.lg-work {
      background: rgba(var(--warning-color-rgb),  0.9);
    }

    &.lg-term {
      background: var(--success-color);
      border-radius: 50%;
    }
  }
}
</style>
