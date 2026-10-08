<template>
  <tool-shell
    title="世界时钟"
    desc="多城市模拟时钟对照，支持增删与拖拽排序"
    icon="clock"
    color="var(--warning-color)"
    back-path="/tools/other"
  >
    <template #toolbar>
      <el-select
        v-model="newCity"
        class="wc-select"
        size="small"
        filterable
        placeholder="添加城市…"
        @change="addCity"
      >
        <el-option
          v-for="z in availableZones"
          :key="z.value"
          :label="z.label"
          :value="z.value"
        />
      </el-select>
    </template>

    <div class="wc-body">
      <draggable v-model="cities" class="wc-grid" animation="150" handle=".wc-card" :item-key="c => c">
        <template #item="{ element: c }">
        <div class="wc-card" :class="{ 'is-day': isDay(c) }">
          <button class="wc-remove" title="移除" @click="removeCity(c)">
            <svg-icon icon-class="close" />
          </button>
          <div class="wc-head">
            <span class="wc-city">{{ label(c) }}</span>
            <span class="wc-day-night" :title="isDay(c) ? '白天' : '夜晚'">
              <svg-icon :icon-class="(isDay(c) ? 'sunny' : 'moon')" :class-name="(isDay(c) ? '' : 'night-ic')" />
            </span>
          </div>
          <!-- 模拟表盘 -->
          <svg class="wc-dial" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="47" class="dial-face" />
            <g class="dial-ticks">
              <line
                v-for="i in 12"
                :key="i"
                x1="50"
                y1="6"
                x2="50"
                :y2="i % 3 === 0 ? 12 : 9"
                :transform="'rotate(' + i * 30 + ' 50 50)'"
                :class="{ major: i % 3 === 0 }"
              />
            </g>
            <line
              class="hand hand-hour"
              x1="50"
              y1="54"
              x2="50"
              y2="28"
              :transform="'rotate(' + clockOf(c).hourAngle + ' 50 50)'"
            />
            <line
              class="hand hand-min"
              x1="50"
              y1="56"
              x2="50"
              y2="18"
              :transform="'rotate(' + clockOf(c).minAngle + ' 50 50)'"
            />
            <line
              class="hand hand-sec"
              x1="50"
              y1="60"
              x2="50"
              y2="15"
              :transform="'rotate(' + clockOf(c).secAngle + ' 50 50)'"
            />
            <circle cx="50" cy="50" r="2.6" class="dial-center" />
          </svg>
          <div class="wc-time mono">
            {{ timeOf(c) }}<span :key="secOf(c)" class="wc-sec tick-in">:{{ secOf(c) }}</span>
          </div>
          <div class="wc-meta">
            <span>{{ dateOf(c) }}</span>
            <span class="wc-offset">{{ offsetOf(c) }}</span>
          </div>
        </div>
        </template>
      </draggable>
      <div v-if="!cities.length" class="wc-empty">
        <svg-icon icon-class="time" />
        <p>从右上角添加城市开始使用</p>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>本地 {{ localTime }} · {{ cities.length }} 个城市</span>
      <span class="status-right">拖动卡片排序</span>
    </template>
  </tool-shell>
</template>

<script>
import draggable from 'vuedraggable'
import ToolShell from '@/components/tool/ToolShell.vue'
import { getItem, setItem } from '@/utils/storage/db'

// 常用时区（IANA）
const ZONES = [
  { value: 'Asia/Shanghai', label: '北京 / 上海' },
  { value: 'Asia/Hong_Kong', label: '香港' },
  { value: 'Asia/Taipei', label: '台北' },
  { value: 'Asia/Tokyo', label: '东京' },
  { value: 'Asia/Seoul', label: '首尔' },
  { value: 'Asia/Singapore', label: '新加坡' },
  { value: 'Asia/Bangkok', label: '曼谷' },
  { value: 'Asia/Kolkata', label: '孟买 / 新德里' },
  { value: 'Asia/Dubai', label: '迪拜' },
  { value: 'Asia/Tehran', label: '德黑兰' },
  { value: 'Europe/Moscow', label: '莫斯科' },
  { value: 'Europe/Istanbul', label: '伊斯坦布尔' },
  { value: 'Europe/Berlin', label: '柏林' },
  { value: 'Europe/Paris', label: '巴黎' },
  { value: 'Europe/London', label: '伦敦' },
  { value: 'America/New_York', label: '纽约' },
  { value: 'America/Chicago', label: '芝加哥' },
  { value: 'America/Denver', label: '丹佛' },
  { value: 'America/Los_Angeles', label: '洛杉矶' },
  { value: 'America/Anchorage', label: '安克雷奇' },
  { value: 'America/Sao_Paulo', label: '圣保罗' },
  { value: 'America/Toronto', label: '多伦多' },
  { value: 'Australia/Sydney', label: '悉尼' },
  { value: 'Australia/Perth', label: '珀斯' },
  { value: 'Pacific/Auckland', label: '奥克兰' },
  { value: 'Pacific/Honolulu', label: '檀香山' },
  { value: 'Africa/Cairo', label: '开罗' },
  { value: 'Africa/Johannesburg', label: '约翰内斯堡' }
]

export default {
  name: 'OtherWorldClock',
  components: { ToolShell, draggable },
  data() {
    return {
      now: new Date(),
      newCity: '',
      // 默认展示城市
      cities: ['Asia/Shanghai', 'Asia/Tokyo', 'Europe/London', 'America/New_York']
    }
  },
  computed: {
    zones() {
      return ZONES
    },
    availableZones() {
      return ZONES.filter(z => !this.cities.includes(z.value))
    },
    localTime() {
      return this.fmt(this.now, 'HH:mm', undefined)
    }
  },
  mounted() {
    this._timer = setInterval(() => {
      this.now = new Date()
    }, 1000)
    this.loadPersisted()
  },
  beforeUnmount() {
    clearInterval(this._timer)
  },
  methods: {
    // Intl 格式化
    fmt(date, opt, zone) {
      const map = { HH: '2-digit', mm: '2-digit' }
      const cfg = opt === 'HH:mm'
        ? { hour: map.HH, minute: map.mm, hour12: false, timeZone: zone }
        : opt === 'date'
          ? { month: 'long', day: 'numeric', weekday: 'short', timeZone: zone }
          : { timeZone: zone }
      return new Intl.DateTimeFormat('zh-CN', cfg).format(date)
    },
    timeOf(zone) {
      return this.fmt(this.now, 'HH:mm', zone)
    },
    // 秒数（两位）：驱动数字秒跳变动画
    secOf(zone) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hour12: false,
        second: '2-digit'
      }).formatToParts(this.now)
      const p = parts.find(x => x.type === 'second')
      return p ? p.value : '00'
    },
    dateOf(zone) {
      return this.fmt(this.now, 'date', zone)
    },
    offsetOf(zone) {
      // 计算与本地时差
      const local = -this.now.getTimezoneOffset() / 60
      const target = this.zoneOffset(zone)
      const diff = target - local
      if (diff === 0) return '同时区'
      return (diff > 0 ? '+' : '') + diff + 'h'
    },
    // 表盘指针角度（时/分/秒）
    clockOf(zone) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      }).formatToParts(this.now)
      const get = t => Number(parts.find(p => p.type === t).value)
      const h = get('hour') % 24
      const m = get('minute')
      const s = get('second')
      return {
        hourAngle: (h % 12 + m / 60 + s / 3600) * 30,
        minAngle: (m + s / 60) * 6,
        secAngle: s * 6
      }
    },
    zoneOffset(zone) {
      try {
        const dtf = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        const parts = dtf.formatToParts(this.now)
        const get = t => Number(parts.find(p => p.type === t).value)
        const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
        return Math.round((asUtc - this.now.getTime()) / 3600000)
      } catch (e) {
        return 0
      }
    },
    isDay(zone) {
      const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: '2-digit', hour12: false }).format(this.now)) % 24
      return h >= 6 && h < 18
    },
    label(zone) {
      const z = ZONES.find(x => x.value === zone)
      return z ? z.label : zone
    },
    addCity(zone) {
      if (zone && !this.cities.includes(zone)) {
        this.cities.push(zone)
        this.persist()
      }
      this.$nextTick(() => {
        this.newCity = ''
      })
    },
    removeCity(zone) {
      this.cities = this.cities.filter(c => c !== zone)
      this.persist()
    },
    // IndexedDB 持久化
    persist() {
      setItem('worldClockCities', this.cities)
    },
    loadPersisted() {
      const saved = getItem('worldClockCities')
      if (Array.isArray(saved) && saved.length) this.cities = saved
    }
  }
}
</script>

<style lang="scss" scoped>
.wc-select {
  width: 190px;
}

.wc-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.wc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
  gap: 10px;
  align-content: start;
  // 上下留白：避免 hover 上移的卡片顶部 border 被滚动容器裁剪
  padding: 4px 2px 12px;
}

.wc-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 12px 12px 14px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  cursor: grab;
  transition: all 0.16s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
    z-index: 1;

    .wc-remove {
      opacity: 1;
    }
  }

  &:active {
    cursor: grabbing;
  }

  &.is-day {
    background: linear-gradient(160deg, rgba(var(--warning-color-rgb),  0.09), transparent 65%);
  }
}

.wc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  gap: 6px;
  padding-right: 14px;
}

.wc-city {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wc-day-night {
  font-size: 13px;
  color: var(--warning-color);
  flex-shrink: 0;

  .night-ic {
    color: #722ED1;
  }
}

/* ============ 模拟表盘 ============ */
.wc-dial {
  width: 108px;
  height: 108px;

  .dial-face {
    fill: var(--search-bg);
    stroke: var(--border-color);
    stroke-width: 1.5;
  }

  .dial-ticks line {
    stroke: var(--text-secondary);
    stroke-width: 1.6;
    stroke-linecap: round;
    opacity: 0.45;

    &.major {
      stroke-width: 2.4;
      opacity: 0.8;
    }
  }

  .hand {
    stroke: var(--text-primary);
    stroke-linecap: round;

    &.hand-hour {
      stroke-width: 4.5;
    }

    &.hand-min {
      stroke-width: 3;
    }

    &.hand-sec {
      stroke: var(--danger-color);
      stroke-width: 1.4;
    }
  }

  .dial-center {
    fill: var(--text-primary);
  }
}

.wc-time {
  font-size: 19px;
  font-weight: 800;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}

.wc-meta {
  display: flex;
  justify-content: space-between;
  width: 100%;
  font-size: 10.5px;
  color: var(--text-secondary);
  padding: 0 2px;
}

.wc-remove {
  position: absolute;
  top: 6px;
  right: 6px;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 50%;
  background: var(--search-bg);
  color: var(--text-secondary);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  opacity: 0;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(var(--danger-color-rgb),  0.85);
    color: #fff;
  }
}

.wc-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  border: 1.5px dashed var(--border-color);
  border-radius: 12px;

  i {
    font-size: 30px;
    opacity: 0.4;
  }

  p {
    font-size: 12.5px;
  }
}
</style>
