<template>
  <div class="todo-page page-container">
    <!-- 顶部标题栏 -->
    <header class="todo-header">
      <div class="todo-title-wrap">
        <h2 class="todo-title">我的代办</h2>
        <span class="todo-sub">共 {{ todos.length }} 项 · 待办 {{ pendingCount }} 项</span>
      </div>
      <button class="todo-add-btn" @click="openCreate">
        <i class="el-icon-plus"></i>新建代办
      </button>
    </header>

    <div class="todo-layout">
      <!-- 左侧：月历 -->
      <section class="cal-card">
        <div class="cal-toolbar">
          <div class="cal-nav">
            <button class="cal-nav-btn" title="上个月" @click="shiftMonth(-1)">
              <i class="el-icon-arrow-left"></i>
            </button>
            <span class="cal-month">{{ viewYear }}年{{ viewMonth + 1 }}月</span>
            <button class="cal-nav-btn" title="下个月" @click="shiftMonth(1)">
              <i class="el-icon-arrow-right"></i>
            </button>
          </div>
          <button class="cal-today-btn" @click="goToday">今天</button>
        </div>

        <div class="cal-weekdays">
          <span
            v-for="w in weekdays"
            :key="w"
            class="cal-weekday"
            :class="{ weekend: w === '六' || w === '日' }"
          >{{ w }}</span>
        </div>

        <div class="cal-grid">
          <div
            v-for="cell in monthCells"
            :key="cell.key"
            class="cal-cell"
            :class="{
              'out-month': !cell.inMonth,
              'is-today': cell.isToday,
              'is-selected': cell.key === selectedDate,
              'is-weekend': cell.isWeekend,
              'is-off': cell.isOff,
              'is-work': cell.isWork
            }"
            :title="cell.tip"
            @click="selectedDate = cell.key"
          >
            <span v-if="cell.isWork" class="cal-badge is-work-badge">班</span>
            <span v-else-if="cell.isOff" class="cal-badge is-off-badge">休</span>
            <div class="cal-cell-top">
              <span class="cal-day">{{ cell.day }}</span>
              <span
                class="cal-lunar"
                :class="{ 'is-term': cell.term, 'is-festival': cell.festival }"
              >{{ cell.lunarLabel }}</span>
            </div>
            <span class="cal-dots">
              <i
                v-for="t in cell.todos.slice(0, 3)"
                :key="t.id"
                class="cal-dot"
                :class="{ done: t.done }"
              ></i>
              <span v-if="cell.todos.length > 3" class="cal-more">+{{ cell.todos.length - 3 }}</span>
            </span>
          </div>
        </div>

        <!-- 图例 -->
        <div class="cal-legend">
          <span class="cal-legend-item"><i class="lg-dot lg-off"></i>休</span>
          <span class="cal-legend-item"><i class="lg-dot lg-work"></i>班</span>
          <span class="cal-legend-item"><i class="lg-dot lg-term"></i>节气/节日</span>
          <span v-if="!hasHolidayData" class="cal-legend-item is-muted">暂无 {{ viewYear }} 年休班数据</span>
        </div>

        <!-- 当日黄历信息条（选中日联动） -->
        <div v-if="almanac" class="almanac-bar">
          <div class="al-main">
            <span class="al-lunar">{{ almanac.lunarText }}</span>
            <span class="al-gz">{{ almanac.gzText }}</span>
          </div>
          <div class="al-tags">
            <span class="al-tag">{{ almanac.animal }}年</span>
            <span v-if="almanac.festival" class="al-tag is-fest">{{ almanac.festival }}</span>
            <span v-else-if="almanac.term" class="al-tag is-term">{{ almanac.term }}</span>
            <span v-if="almanac.isOff" class="al-tag is-off">休</span>
            <span v-if="almanac.isWork" class="al-tag is-work">班</span>
            <span class="al-tag is-star" :title="'十二值神：' + almanac.star.name + ' · 冲' + almanac.clashAnimal + '煞' + almanac.shaDir">
              <b>{{ almanac.star.name }}</b> 冲{{ almanac.clashAnimal }}煞{{ almanac.shaDir }}
            </span>
          </div>
          <div class="al-yiji">
            <span class="al-yi" :title="'宜：' + almanac.star.yi">宜 {{ almanac.star.yi }}</span>
            <span class="al-ji" :title="'忌：' + almanac.star.ji">忌 {{ almanac.star.ji }}</span>
          </div>
        </div>
      </section>

      <!-- 右侧：选中日代办列表 -->
      <section class="day-card">
        <div class="day-header">
          <div class="day-title">
            <span class="day-date">{{ dayLabel }}</span>
            <span class="day-count">{{ selectedTodos.length }} 项代办</span>
          </div>
          <!-- 状态筛选：macOS 分段控件 -->
          <div class="day-filter">
            <div
              v-for="f in filters"
              :key="f.value"
              class="day-filter-item"
              :class="{ active: filter === f.value }"
              @click="filter = f.value"
            >{{ f.label }}</div>
          </div>
        </div>

        <div class="day-list">
          <template v-if="filteredTodos.length">
            <div
              v-for="(t, i) in filteredTodos"
              :key="t.id"
              class="day-item stagger-item"
              :class="{ done: t.done }"
              :style="{ animationDelay: Math.min(i, 12) * 30 + 'ms' }"
            >
              <!-- 状态勾选：圆环 → 主题色实心对勾 -->
              <button
                class="day-check"
                :title="t.done ? '标记为待办' : '标记为已完成'"
                @click="toggleDone(t)"
              >
                <i class="el-icon-check"></i>
              </button>
              <div class="day-info" @dblclick="openEdit(t)">
                <div class="day-item-title">
                  {{ t.title }}
                  <span v-if="timeOf(t)" class="day-item-time">{{ timeOf(t) }}</span>
                  <i
                    v-if="t.remindAt && !t.done"
                    class="el-icon-alarm-outline day-item-remind"
                    title="已设提醒"
                  ></i>
                </div>
                <div v-if="t.desc" class="day-item-desc">{{ t.desc }}</div>
                <div v-if="t.files && t.files.length" class="day-item-files">
                  <span
                    v-for="(f, i) in t.files"
                    :key="i"
                    class="day-item-file"
                    :title="f.name + '（点击下载）'"
                    @click.stop="downloadFile(t, i)"
                  >
                    <i class="el-icon-document"></i>
                    <span class="day-item-file-name">{{ f.name }}</span>
                  </span>
                </div>
              </div>
              <div class="day-actions" @click.stop>
                <i class="el-icon-edit" title="编辑" @click="openEdit(t)"></i>
                <i class="el-icon-delete" title="删除" @click="removeTodo(t)"></i>
              </div>
            </div>
          </template>
          <div v-else class="day-empty">
            <i class="el-icon-calendar"></i>
            <span>{{ filter === 'all' ? '这一天还没有代办' : '没有' + filterLabel + '的代办' }}</span>
            <button class="day-empty-add" @click="openCreate">
              <i class="el-icon-plus"></i>添加一条
            </button>
          </div>
        </div>
      </section>
    </div>

    <!-- 新建/编辑代办弹窗 -->
    <transition name="todo-modal">
      <div v-if="dialogVisible" class="todo-overlay" @click.self="closeDialog">
        <div class="todo-dialog">
          <header class="td-dialog-header">
            <h3 class="td-dialog-title">{{ editingId ? '编辑代办' : '新建代办' }}</h3>
            <i class="el-icon-close td-dialog-close" @click="closeDialog"></i>
          </header>
          <div class="td-dialog-body">
            <!-- 标题 -->
            <div class="td-field" :class="{ error: !!errors.title }">
              <label class="td-field-label">标题 <span class="td-required">*</span></label>
              <el-input
                v-model="form.title"
                size="small"
                clearable
                placeholder="要做什么？"
                maxlength="50"
                @keydown.enter.native="saveTodo"
                @blur="validateTodoField('title')"
                @input="clearTodoFieldError('title')"
              />
              <p class="td-field-error" :class="{ visible: !!errors.title }">{{ errors.title }}</p>
            </div>
            <!-- 描述 -->
            <div class="td-field" :class="{ error: !!errors.desc }">
              <label class="td-field-label">描述 <span class="td-required">*</span></label>
              <el-input
                v-model="form.desc"
                type="textarea"
                :rows="4"
                placeholder="补充细节"
                maxlength="200"
                @blur="validateTodoField('desc')"
                @input="clearTodoFieldError('desc')"
              />
              <p class="td-field-error" :class="{ visible: !!errors.desc }">{{ errors.desc }}</p>
            </div>
            <!-- 日期时间 -->
            <div class="td-field">
              <label class="td-field-label">日期时间</label>
              <el-date-picker
                v-model="form.date"
                size="small"
                type="datetime"
                placeholder="选择日期时间"
                format="yyyy-MM-dd HH:mm:ss"
                value-format="yyyy-MM-dd HH:mm:ss"
                :clearable="false"
                style="width: 100%"
              />
            </div>
            <!-- 提醒 -->
            <div class="td-field">
              <label class="td-field-label">提醒</label>
              <el-select v-model="form.remind" size="small" style="width: 100%">
                <el-option
                  v-for="o in remindOptions"
                  :key="o.value"
                  :label="o.label"
                  :value="o.value"
                />
              </el-select>
            </div>
            <!-- 附件（非必填） -->
            <div class="td-field">
              <label class="td-field-label">
                附件
                <span class="td-attach-add" @click="pickFiles">
                  <i class="el-icon-plus"></i> 添加文件
                </span>
              </label>
              <input
                ref="fileInput"
                type="file"
                multiple
                class="td-file-input"
                @change="onFilesPicked"
              />
              <div v-if="form.files.length" class="td-attach-list">
                <div v-for="(f, i) in form.files" :key="i" class="td-attach-item">
                  <i class="el-icon-document"></i>
                  <span class="td-attach-name" :title="f.name">{{ f.name }}</span>
                  <span class="td-attach-size">{{ fmtFileSize(f.size) }}</span>
                  <i class="el-icon-close td-attach-remove" title="移除" @click="removeFile(i)"></i>
                </div>
              </div>
            </div>
          </div>
          <footer class="td-dialog-footer">
            <el-button size="small" round @click="closeDialog">取消</el-button>
            <el-button size="small" round type="primary" @click="saveTodo">保存</el-button>
          </footer>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import solarlunar from 'solarlunar'
import { getItem, setItem } from '@/utils/db'

let todoUid = Date.now()

// 日期 key：本地时区 YYYY-MM-DD
function fmtKey(d) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

// 完整时间：YYYY-MM-DD HH:mm:ss
function fmtDateTime(d) {
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  const ss = String(d.getSeconds()).padStart(2, '0')
  return fmtKey(d) + ' ' + hh + ':' + mm + ':' + ss
}

// 提醒时机候选（value 为提前分钟数，-1 表示不提醒，0 表示准时）
const REMIND_OPTIONS = [
  { label: '不提醒', value: -1 },
  { label: '准时提醒', value: 0 },
  { label: '提前 5 分钟', value: 5 },
  { label: '提前 15 分钟', value: 15 },
  { label: '提前 30 分钟', value: 30 },
  { label: '提前 1 小时', value: 60 },
  { label: '提前 1 天', value: 1440 }
]

const WEEK_LABELS = ['日', '一', '二', '三', '四', '五', '六']

/* ============ 农历 / 节假日 / 黄历（与生活-日历工具同源逻辑） ============ */
// 农历节日（按农历月-日）
const LUNAR_FESTIVALS = { '1-1': '春节', '1-15': '元宵节', '5-5': '端午节', '7-7': '七夕节', '8-15': '中秋节', '9-9': '重阳节', '12-8': '腊八节' }
// 公历节日
const SOLAR_FESTIVALS = { '1-1': '元旦', '2-14': '情人节', '3-8': '妇女节', '4-1': '愚人节', '5-1': '劳动节', '5-4': '青年节', '6-1': '儿童节', '7-1': '建党节', '8-1': '建军节', '9-10': '教师节', '10-1': '国庆节', '12-25': '圣诞节' }

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

// 老黄历：地支/生肖/六冲/煞方/十二值神
const BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥']
const BRANCH_ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
const BRANCH_CLASH = [6, 7, 8, 9, 10, 11, 0, 1, 2, 3, 4, 5]
const SHA_DIR = ['南', '东', '北', '西', '南', '东', '北', '西', '南', '东', '北', '西']
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

function branchOf(gz) {
  return BRANCHES.indexOf(gz.charAt(gz.length - 1))
}

// 十二值神：正月建寅，月支 = (农历月 + 1) % 12；建日在日支与月支相重之日
function starOf(sl) {
  const monthBranch = (Math.abs(sl.lMonth) + 1) % 12
  const dayBranch = branchOf(sl.gzDay)
  return STARS[(dayBranch - monthBranch + 12) % 12]
}

// 某公历日的农历/节日/休班标签信息
function lunarInfoOf(y, m, d) {
  const sl = solarlunar.solar2lunar(y, m, d)
  if (sl === -1) return null
  const hd = HOLIDAYS[y] || null
  const key = String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')
  const isOff = !!(hd && hd.off.indexOf(key) !== -1)
  const isWork = !!(hd && hd.work.indexOf(key) !== -1)
  const term = sl.term || ''
  const lunarFestival = LUNAR_FESTIVALS[sl.lMonth + '-' + sl.lDay] || ''
  const solarFestival = SOLAR_FESTIVALS[m + '-' + d] || ''
  // 标签优先级：节气 > 农历节日 > 公历节日 > 农历日
  let lunarLabel = ''
  let festival = ''
  if (term) {
    lunarLabel = term
  } else if (lunarFestival) {
    lunarLabel = lunarFestival
    festival = lunarFestival
  } else if (solarFestival) {
    lunarLabel = solarFestival
    festival = solarFestival
  } else {
    lunarLabel = sl.lDay === 1 ? sl.monthCn : sl.dayCn
  }
  return { sl, isOff, isWork, term, festival, lunarLabel }
}

// 我的代办：月历 + 日代办列表（Mac 风格），IndexedDB 本地持久化
export default {
  name: 'TodoPage',
  data() {
    const now = new Date()
    return {
      todos: [],
      // 月历视图年月
      viewYear: now.getFullYear(),
      viewMonth: now.getMonth(),
      // 选中日期（YYYY-MM-DD），默认今天
      selectedDate: fmtKey(now),
      // 状态筛选：all / pending / done
      filter: 'all',
      filters: [
        { label: '全部', value: 'all' },
        { label: '待办', value: 'pending' },
        { label: '已完成', value: 'done' }
      ],
      weekdays: WEEK_LABELS,
      // 弹窗表单
      dialogVisible: false,
      editingId: null,
      form: { title: '', desc: '', date: '', remind: 15, files: [] },
      // 必填字段失焦校验的错误提示
      errors: { title: '', desc: '' },
      // 提醒时机候选
      remindOptions: REMIND_OPTIONS
    }
  },
  computed: {
    pendingCount() {
      return this.todos.filter(t => !t.done).length
    },
    todayKey() {
      return fmtKey(new Date())
    },
    hasHolidayData() {
      return !!HOLIDAYS[this.viewYear]
    },
    // 月历 6×7 单元格（周日起始），带农历/节日/休班标注
    monthCells() {
      const first = new Date(this.viewYear, this.viewMonth, 1)
      const cursor = new Date(this.viewYear, this.viewMonth, 1 - first.getDay())
      const cells = []
      for (let i = 0; i < 42; i++) {
        const key = fmtKey(cursor)
        const y = cursor.getFullYear()
        const m = cursor.getMonth() + 1
        const d = cursor.getDate()
        const info = lunarInfoOf(y, m, d)
        const tips = []
        if (info) {
          if (info.festival) tips.push(info.festival)
          if (info.term) tips.push(info.term + '（节气）')
          tips.push('农历 ' + info.sl.monthCn + info.sl.dayCn + ' · ' + info.sl.gzDay + '日')
          if (info.isOff) tips.push('法定节假日放假')
          if (info.isWork) tips.push('调休上班')
        }
        cells.push({
          key,
          day: d,
          inMonth: cursor.getMonth() === this.viewMonth,
          isToday: key === this.todayKey,
          isWeekend: cursor.getDay() === 0 || cursor.getDay() === 6,
          isOff: info ? info.isOff : false,
          isWork: info ? info.isWork : false,
          term: info ? info.term : '',
          festival: info ? info.festival : '',
          lunarLabel: info ? info.lunarLabel : '',
          todos: this.todosByDate[key] || [],
          tip: tips.join(' · ')
        })
        cursor.setDate(cursor.getDate() + 1)
      }
      return cells
    },
    // 按日期分组索引（兼容旧数据纯日期与新数据完整时间，取日期部分）
    todosByDate() {
      const map = {}
      this.todos.forEach(t => {
        const key = (t.date || '').slice(0, 10)
        if (!map[key]) map[key] = []
        map[key].push(t)
      })
      return map
    },
    // 选中日的代办（完成的沉底，其余按时间先后）
    selectedTodos() {
      const list = this.todosByDate[this.selectedDate] || []
      return [...list].sort((a, b) => {
        if (a.done !== b.done) return a.done ? 1 : -1
        return (a.date || '').localeCompare(b.date || '') || a.createdAt - b.createdAt
      })
    },
    filteredTodos() {
      if (this.filter === 'pending') return this.selectedTodos.filter(t => !t.done)
      if (this.filter === 'done') return this.selectedTodos.filter(t => t.done)
      return this.selectedTodos
    },
    filterLabel() {
      const f = this.filters.find(x => x.value === this.filter)
      return f ? f.label : ''
    },
    // 右侧标题：X月X日 星期X
    dayLabel() {
      const [y, m, d] = this.selectedDate.split('-').map(Number)
      const date = new Date(y, m - 1, d)
      return m + '月' + d + '日 星期' + WEEK_LABELS[date.getDay()] + (this.selectedDate === this.todayKey ? ' · 今天' : '')
    },
    // 当日黄历：农历/干支/生肖/值神/冲煞/宜忌
    almanac() {
      const [y, m, d] = this.selectedDate.split('-').map(Number)
      const info = lunarInfoOf(y, m, d)
      if (!info) return null
      const sl = info.sl
      const dayBranch = branchOf(sl.gzDay)
      return {
        lunarText: (sl.isLeap ? '闰' : '') + sl.monthCn + sl.dayCn,
        gzText: sl.gzYear + '年 ' + sl.gzMonth + '月 ' + sl.gzDay + '日',
        animal: sl.animal,
        term: info.term,
        festival: info.festival,
        isOff: info.isOff,
        isWork: info.isWork,
        star: starOf(sl),
        clashAnimal: BRANCH_ANIMALS[BRANCH_CLASH[dayBranch]],
        shaDir: SHA_DIR[dayBranch]
      }
    }
  },
  created() {
    const saved = getItem('todoItems', [])
    this.todos = Array.isArray(saved) ? saved : []
  },
  methods: {
    persist() {
      setItem('todoItems', this.todos)
    },
    // ===== 月历导航 =====
    shiftMonth(delta) {
      const d = new Date(this.viewYear, this.viewMonth + delta, 1)
      this.viewYear = d.getFullYear()
      this.viewMonth = d.getMonth()
    },
    goToday() {
      const now = new Date()
      this.viewYear = now.getFullYear()
      this.viewMonth = now.getMonth()
      this.selectedDate = this.todayKey
    },
    // ===== 代办 CRUD =====
    openCreate() {
      this.editingId = null
      this.form = { title: '', desc: '', date: fmtDateTime(new Date()), remind: 15, files: [] }
      this.resetErrors()
      this.dialogVisible = true
    },
    openEdit(t) {
      this.editingId = t.id
      // 兼容旧数据纯日期（补零点时间）；附件数组复制，取消编辑不影响原数据
      this.form = {
        title: t.title,
        desc: t.desc || '',
        date: (t.date || '').length === 10 ? t.date + ' 00:00:00' : t.date,
        remind: t.remind == null ? -1 : t.remind,
        files: (t.files || []).slice()
      }
      this.resetErrors()
      this.dialogVisible = true
    },
    closeDialog() {
      this.dialogVisible = false
    },
    // ===== 必填字段失焦校验 =====
    resetErrors() {
      this.errors.title = ''
      this.errors.desc = ''
    },
    validateTodoField(field) {
      const val = (this.form[field] || '').trim()
      if (!val) {
        this.errors[field] = field === 'title' ? '请输入标题' : '请输入描述'
        return false
      }
      this.errors[field] = ''
      return true
    },
    // 重新输入时清除错误提示（失焦时再校验）
    clearTodoFieldError(field) {
      if (this.errors[field]) this.errors[field] = ''
    },
    // 列表项时间（HH:mm），旧数据纯日期不显示
    timeOf(t) {
      return (t.date || '').length > 10 ? t.date.slice(11, 16) : ''
    },
    // ===== 附件 =====
    pickFiles() {
      if (this.$refs.fileInput) this.$refs.fileInput.click()
    },
    // 选择文件：读入内存（ArrayBuffer），随代办一起持久化到 IndexedDB
    async onFilesPicked(e) {
      const files = Array.from((e.target.files || []))
      e.target.value = '' // 允许重复选择同一文件
      const MAX = 20 * 1024 * 1024
      for (const file of files) {
        if (file.size > MAX) {
          this.$message.warning('「' + file.name + '」超过 20MB，已跳过')
          continue
        }
        const data = await file.arrayBuffer()
        this.form.files.push({ name: file.name, size: file.size, type: file.type || '', data })
      }
    },
    removeFile(index) {
      this.form.files.splice(index, 1)
    },
    fmtFileSize(n) {
      if (n == null) return ''
      if (n < 1024) return n + ' B'
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB'
      return (n / 1024 / 1024).toFixed(1) + ' MB'
    },
    // 下载附件（从存储的 ArrayBuffer 还原文件）
    downloadFile(t, i) {
      const f = (t.files || [])[i]
      if (!f || !f.data) return
      const blob = new Blob([f.data], { type: f.type || 'application/octet-stream' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = f.name
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    },
    // 计算提醒时间戳（不提醒返回 null）
    computeRemindAt(dateStr, remind) {
      if (remind == null || remind < 0) return null
      const due = new Date(String(dateStr).replace(/-/g, '/')).getTime()
      if (isNaN(due)) return null
      return due - remind * 60 * 1000
    },
    saveTodo() {
      const validTitle = this.validateTodoField('title')
      const validDesc = this.validateTodoField('desc')
      if (!validTitle || !validDesc) return
      const title = this.form.title.trim()
      const desc = this.form.desc.trim()
      const date = this.form.date // 完整时间 YYYY-MM-DD HH:mm:ss
      const dayKey = date.slice(0, 10)
      const remindAt = this.computeRemindAt(date, this.form.remind)
      if (this.editingId) {
        const t = this.todos.find(x => x.id === this.editingId)
        if (t) {
          t.title = title
          t.desc = desc
          t.date = date
          t.remind = this.form.remind
          t.remindAt = remindAt
          t.notified = false
          t.files = this.form.files
        }
      } else {
        this.todos.push({
          id: 'td' + (todoUid++),
          title,
          desc,
          date,
          remind: this.form.remind,
          remindAt,
          notified: false,
          files: this.form.files,
          done: false,
          createdAt: Date.now(),
          doneAt: null
        })
      }
      // 跟随弹窗选择的日期展示
      this.selectedDate = dayKey
      this.syncViewToDate(dayKey)
      this.persist()
      this.closeDialog()
      this.$message.success(this.editingId ? '代办已更新' : '代办已创建')
    },
    // 切换完成状态（恢复待办时若提醒仍在未来，重新允许提醒）
    toggleDone(t) {
      t.done = !t.done
      t.doneAt = t.done ? Date.now() : null
      if (!t.done && t.notified && t.remindAt && t.remindAt > Date.now()) {
        t.notified = false
      }
      this.persist()
    },
    // 删除（二次确认）
    removeTodo(t) {
      this.$confirm('确定删除代办「' + t.title + '」吗？', '删除代办', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.todos = this.todos.filter(x => x.id !== t.id)
        this.persist()
        this.$message.success('已删除')
      }).catch(() => {})
    },
    // 日期联动月历视图（编辑跨月日期时月历跟随跳转）
    syncViewToDate(key) {
      const [y, m] = key.split('-').map(Number)
      if (y !== this.viewYear || m - 1 !== this.viewMonth) {
        this.viewYear = y
        this.viewMonth = m - 1
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.todo-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  -webkit-app-region: no-drag;
}

/* ===== 顶部标题栏 ===== */
.todo-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.todo-title-wrap {
  display: flex;
  align-items: baseline;
  gap: 10px;

  .todo-title {
    font-size: 19px;
    font-weight: 700;
    color: $text-primary;
  }

  .todo-sub {
    font-size: 12px;
    color: $text-secondary;
  }
}

.todo-add-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 14px;
  border: none;
  border-radius: 999px;
  background: var(--primary-color, #3366FF);
  color: #fff;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.3);
  transition: all 0.15s ease;

  i {
    font-size: 13px;
  }

  &:hover {
    filter: brightness(1.08);
  }

  &:active {
    transform: scale(0.96);
  }
}

/* ===== 双栏布局 ===== */
.todo-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}

/* ===== 左侧月历 + 黄历 ===== */
.cal-card {
  flex: 1.35;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  padding: 16px;
  box-shadow: $shadow-sm;
}

.cal-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
  flex-shrink: 0;
}

.cal-nav {
  display: flex;
  align-items: center;
  gap: 6px;

  .cal-month {
    font-size: 14.5px;
    font-weight: 700;
    color: $text-primary;
    min-width: 96px;
    text-align: center;
  }
}

.cal-nav-btn {
  width: 24px;
  height: 24px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: transparent;
  color: $text-secondary;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  i {
    font-size: 12px;
  }

  &:hover {
    border-color: var(--primary-color, #3366FF);
    color: var(--primary-color, #3366FF);
  }

  &:active {
    transform: scale(0.9);
  }
}

.cal-today-btn {
  height: 24px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: $text-secondary;
  font-size: 11.5px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--primary-color, #3366FF);
    color: var(--primary-color, #3366FF);
  }
}

.cal-weekdays {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
  margin-bottom: 6px;
  flex-shrink: 0;

  .cal-weekday {
    text-align: center;
    font-size: 11px;
    font-weight: 600;
    color: $text-secondary;
    padding: 2px 0;

    &.weekend {
      color: #F54A45;
      opacity: 0.75;
    }
  }
}

.cal-grid {
  // 不再纵向拉伸：单元格按宽度取正方形，剩余空白留在网格与图例之间
  flex: 0 0 auto;
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 4px;
}

.cal-cell {
  position: relative;
  border-radius: 10px;
  border: 1px solid transparent;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: 2px 2px 2px;
  cursor: pointer;
  transition: all 0.12s ease;
  // 正方形：宽 = 列宽，高跟随（避免被行高拉伸变长条）
  aspect-ratio: 1 / 1;
  align-self: start;

  .cal-day {
    font-size: 12px;
    font-weight: 600;
    color: $text-primary;
    line-height: 1.35;
    font-variant-numeric: tabular-nums;
  }

  // 农历/节日小字
  .cal-lunar {
    font-size: 8.5px;
    color: $text-secondary;
    line-height: 1.3;
    max-width: 100%;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;

    &.is-term {
      color: #52C41A;
      font-weight: 600;
    }

    &.is-festival {
      color: #F54A45;
      font-weight: 600;
    }
  }

  &.out-month {
    .cal-day,
    .cal-lunar {
      color: $text-secondary;
      opacity: 0.45;
    }

    .cal-dot {
      opacity: 0.35;
    }
  }

  &.is-weekend .cal-day {
    color: #F54A45;
  }

  &:hover {
    background: $search-bg;
  }

  // 法定节假日：淡绿底
  &.is-off {
    background: rgba(82, 196, 26, 0.07);
    border-color: rgba(82, 196, 26, 0.28);
  }

  // 调休上班：淡橙底
  &.is-work {
    background: rgba(250, 140, 22, 0.07);
    border-color: rgba(250, 140, 22, 0.3);
  }

  &.is-today {
    border-color: rgba(var(--primary-color-rgb), 0.6);
    background: rgba(var(--primary-color-rgb), 0.06);

    .cal-day {
      color: var(--primary-color, #3366FF);
      font-weight: 700;
    }
  }

  &.is-selected {
    background: rgba(var(--primary-color-rgb), 0.1);
    border-color: rgba(var(--primary-color-rgb), 0.45);
    box-shadow: 0 0 0 2px rgba(var(--primary-color-rgb), 0.1);
  }
}

// 休/班徽标（右上角）
.cal-badge {
  position: absolute;
  top: 3px;
  right: 4px;
  height: 13px;
  line-height: 13px;
  padding: 0 3.5px;
  border-radius: 4px;
  font-size: 8.5px;
  font-weight: 700;

  &.is-off-badge {
    background: rgba(82, 196, 26, 0.85);
    color: #fff;
  }

  &.is-work-badge {
    background: rgba(250, 140, 22, 0.9);
    color: #fff;
  }
}

.cal-cell-top {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  min-width: 0;
  max-width: 100%;
}

.cal-dots {
  display: flex;
  align-items: center;
  gap: 3px;
  margin-top: 2px;
  min-height: 9px;
  flex-wrap: wrap;
  justify-content: center;
}

.cal-dot {
  width: 4.5px;
  height: 4.5px;
  border-radius: 50%;
  background: var(--primary-color, #3366FF);

  &.done {
    background: #52C41A;
    opacity: 0.55;
  }
}

.cal-more {
  font-size: 8.5px;
  color: $text-secondary;
  font-weight: 600;
}

// 图例（吸附卡片底部：日历格为正方形不再撑满高度时，图例与黄历沉底）
.cal-legend {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 8px 2px 0;
  flex-shrink: 0;
  margin-top: auto;
}

.cal-legend-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 10.5px;
  color: $text-secondary;

  &.is-muted {
    color: #FA8C16;
  }

  .lg-dot {
    width: 8px;
    height: 8px;
    border-radius: 3px;

    &.lg-off {
      background: rgba(82, 196, 26, 0.85);
    }

    &.lg-work {
      background: rgba(250, 140, 22, 0.9);
    }

    &.lg-term {
      background: #52C41A;
      border-radius: 50%;
    }
  }
}

/* ===== 黄历信息条（日历下方） ===== */
.almanac-bar {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: $radius-base;
  background: $search-bg;
  border: 1px solid var(--border-color);
  flex-shrink: 0;
}

.al-main {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.al-lunar {
  font-size: 13px;
  font-weight: 700;
  color: $text-primary;
  white-space: nowrap;
}

.al-gz {
  font-size: 10.5px;
  color: $text-secondary;
  white-space: nowrap;
}

.al-tags {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.al-tag {
  height: 17px;
  line-height: 17px;
  padding: 0 6px;
  border-radius: 8.5px;
  font-size: 9.5px;
  font-weight: 600;
  background: var(--card-bg);
  color: $text-secondary;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 4px;

  &.is-term {
    background: rgba(82, 196, 26, 0.12);
    color: #52C41A;
  }

  &.is-fest {
    background: rgba(245, 74, 69, 0.1);
    color: #F54A45;
  }

  &.is-off {
    background: rgba(82, 196, 26, 0.12);
    color: #52C41A;
  }

  &.is-work {
    background: rgba(250, 140, 22, 0.12);
    color: #FA8C16;
  }

  // 值神 + 冲煞
  &.is-star {
    b {
      width: 15px;
      height: 15px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 9.5px;
      font-weight: 700;
      color: var(--primary-color, #3366FF);
      background: rgba(var(--primary-color-rgb), 0.12);
      border: 1px solid rgba(var(--primary-color-rgb), 0.3);
    }
  }
}

// 宜 / 忌
.al-yiji {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.al-yi,
.al-ji {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 10.5px;
}

.al-yi {
  color: #389E0D;
}

.al-ji {
  color: #CF1322;
}

/* ===== 右侧当日列表 ===== */
.day-card {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  padding: 16px;
  box-shadow: $shadow-sm;
}

.day-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 12px;
  flex-shrink: 0;
}

.day-title {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;

  .day-date {
    font-size: 14.5px;
    font-weight: 700;
    color: $text-primary;
    white-space: nowrap;
  }

  .day-count {
    font-size: 11.5px;
    color: $text-secondary;
    white-space: nowrap;
  }
}

/* 状态筛选：macOS 分段控件 */
.day-filter {
  display: inline-flex;
  background: $search-bg;
  border-radius: $radius-base;
  padding: 2px;
  gap: 2px;
  flex-shrink: 0;
}

.day-filter-item {
  padding: 4px 11px;
  border-radius: 6px;
  font-size: 11.5px;
  font-weight: 500;
  color: $text-secondary;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;

  &.active {
    background: var(--card-bg);
    color: var(--primary-color, #3366FF);
    font-weight: 600;
    box-shadow: $shadow-sm;
  }
}

.day-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-right: 2px;

  &::-webkit-scrollbar {
    width: 4px;
  }
}

.day-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: $radius-base;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.35);

    .day-actions {
      opacity: 1;
    }
  }

  &.done {
    background: $search-bg;

    .day-item-title {
      color: $text-secondary;
      text-decoration: line-through;
    }

    .day-item-desc {
      opacity: 0.6;
    }
  }
}

/* 勾选圆钮：空心圆 → 主题色实心对勾 */
.day-check {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid var(--border-color);
  background: transparent;
  color: transparent;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  margin-top: 1px;
  transition: all 0.15s ease;

  i {
    font-size: 11px;
    font-weight: 700;
  }

  &:hover {
    border-color: var(--primary-color, #3366FF);
  }

  .day-item.done & {
    border-color: var(--primary-color, #3366FF);
    background: var(--primary-color, #3366FF);
    color: #fff;
  }
}

.day-info {
  flex: 1;
  min-width: 0;
  cursor: default;

  .day-item-title {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
    line-height: 1.5;
    word-break: break-all;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  // 具体时间（HH:mm）
  .day-item-time {
    font-size: 10.5px;
    font-weight: 600;
    color: var(--primary-color, #3366FF);
    background: rgba(var(--primary-color-rgb), 0.09);
    padding: 0 6px;
    border-radius: 999px;
    line-height: 1.7;
    font-variant-numeric: tabular-nums;
  }

  // 已设提醒标识
  .day-item-remind {
    font-size: 12px;
    color: #FA8C16;
  }

  // 附件 chips（点击下载）
  .day-item-files {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    margin-top: 5px;
  }

  .day-item-file {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 220px;
    height: 20px;
    padding: 0 9px;
    border: 1px solid var(--border-color);
    border-radius: 999px;
    background: $search-bg;
    font-size: 10.5px;
    color: $text-secondary;
    cursor: pointer;
    transition: all 0.15s ease;

    i {
      font-size: 11px;
      flex-shrink: 0;
    }

    .day-item-file-name {
      min-width: 0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    &:hover {
      border-color: rgba(var(--primary-color-rgb), 0.5);
      color: var(--primary-color, #3366FF);
    }
  }

  .day-item-desc {
    margin-top: 3px;
    font-size: 11.5px;
    color: $text-secondary;
    line-height: 1.5;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
}

/* 行内操作：hover 浮现 */
.day-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;

  i {
    font-size: 13px;
    color: $text-secondary;
    padding: 4px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(var(--primary-color-rgb), 0.1);
      color: var(--primary-color, #3366FF);
    }

    &.el-icon-delete:hover {
      background: rgba(245, 34, 45, 0.1);
      color: #F5222D;
    }
  }
}

/* 空状态 */
.day-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: $text-secondary;

  i {
    font-size: 30px;
    opacity: 0.45;
  }

  span {
    font-size: 12.5px;
  }
}

.day-empty-add {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  margin-top: 4px;
  height: 26px;
  padding: 0 13px;
  border: 1px dashed var(--border-color);
  border-radius: 999px;
  background: transparent;
  color: $text-secondary;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  i {
    font-size: 12px;
    opacity: 1;
  }

  &:hover {
    border-color: var(--primary-color, #3366FF);
    color: var(--primary-color, #3366FF);
  }
}

/* ===== 新建/编辑弹窗 ===== */
.todo-overlay {
  position: fixed;
  inset: 0;
  z-index: 3100;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.todo-dialog {
  // 宽弹窗：宽明显大于高，容纳附件列表
  width: 560px;
  max-width: calc(100vw - 48px);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--card-bg, #fff);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.td-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 0;

  .td-dialog-title {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  .td-dialog-close {
    font-size: 15px;
    color: $text-secondary;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    transition: all 0.15s ease;

    &:hover {
      background: $search-bg;
      color: $text-primary;
    }
  }
}

.td-dialog-body {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 13px;
  // 附件较多时弹窗内部滚动，高度不超视口
  max-height: calc(100vh - 180px);
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }
}

.td-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .td-field-label {
    font-size: 12px;
    font-weight: 600;
    color: $text-primary;
    display: flex;
    align-items: center;
  }

  .td-required {
    color: #F5222D;
  }

  // 校验失败：输入框/文本域红框
  &.error ::v-deep .el-input__inner,
  &.error ::v-deep .el-textarea__inner {
    border-color: #F5222D;

    &:focus {
      border-color: #F5222D;
    }
  }

  // 错误提示固定占位，避免出现/消失时挤压布局导致抖动
  .td-field-error {
    height: 15px;
    font-size: 11px;
    line-height: 15px;
    color: #F5222D;
    visibility: hidden;

    &.visible {
      visibility: visible;
    }
  }
}

/* ===== 附件字段 ===== */
// 原生文件选择输入框隐藏，由"添加文件"按钮触发
.td-file-input {
  display: none;
}

.td-attach-add {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-left: auto;
  height: 20px;
  padding: 0 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color, #3366FF);
  background: rgba(var(--primary-color-rgb), 0.09);
  cursor: pointer;
  transition: all 0.15s ease;

  i {
    font-size: 11px;
  }

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.16);
  }

  &:active {
    transform: scale(0.96);
  }
}

.td-attach-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 128px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }
}

.td-attach-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid var(--border-color);
  border-radius: $radius-base;
  background: $search-bg;

  > .el-icon-document {
    font-size: 13px;
    color: $text-secondary;
    flex-shrink: 0;
  }

  .td-attach-name {
    flex: 1;
    min-width: 0;
    font-size: 12px;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .td-attach-size {
    flex-shrink: 0;
    font-size: 10.5px;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
  }

  .td-attach-remove {
    flex-shrink: 0;
    font-size: 12px;
    color: $text-secondary;
    padding: 2px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(245, 34, 45, 0.1);
      color: #F5222D;
    }
  }
}

.td-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 18px 16px;
}

/* 弹窗过渡 */
.todo-modal-enter-active {
  transition: opacity 0.18s ease;

  .todo-dialog {
    transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.todo-modal-leave-active {
  transition: opacity 0.14s ease;

  .todo-dialog {
    transition: transform 0.14s ease;
  }
}

.todo-modal-enter,
.todo-modal-leave-to {
  opacity: 0;

  .todo-dialog {
    transform: scale(0.95) translateY(8px);
  }
}
</style>
