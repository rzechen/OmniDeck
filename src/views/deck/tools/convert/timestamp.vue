<template>
  <tool-shell
    title="时间戳转换"
    desc="时间戳与日期时间互转，实时显示当前时间"
    icon="clock"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <button class="tool-btn" @click="fillNow">
        <svg-icon icon-class="time" />
        此刻
      </button>
      <button class="tool-btn" @click="copyText(String(nowTs))">
        <svg-icon icon-class="document-copy" />
        复制当前秒级
      </button>
    </template>

    <div class="ts-layout">
      <!-- 当前时间 -->
      <div class="ts-now">
        <div class="ts-now-time">{{ nowTime }}</div>
        <div class="ts-now-ts" @click="copyText(String(nowTs))" title="点击复制">
          {{ nowTs }}
        </div>
      </div>

      <!-- 时间戳 → 时间 -->
      <div class="ts-card">
        <div class="ts-card-title">
          <span class="pane-dot is-input"></span>
          时间戳 → 日期时间
        </div>
        <div class="ts-input-row">
          <input
            v-model="tsInput"
            class="ts-input mono"
            placeholder="输入秒级或毫秒级时间戳"
            inputmode="numeric"
            @input="convertFromTs"
          />
        </div>
        <div class="ts-results">
          <div
            v-for="r in tsResults"
            :key="r.label"
            class="ts-result"
            :class="{ 'has-val': r.value }"
            @click="copyText(r.value)"
          >
            <span class="ts-result-label">{{ r.label }}</span>
            <span class="ts-result-value mono">{{ r.value || '—' }}</span>
          </div>
        </div>
      </div>

      <!-- 时间 → 时间戳 -->
      <div class="ts-card">
        <div class="ts-card-title">
          <span class="pane-dot is-output"></span>
          日期时间 → 时间戳
        </div>
        <div class="ts-input-row">
          <input
            v-model="timeInput"
            class="ts-input mono"
            placeholder="2026-09-06 12:00:00"
            @input="convertFromTime"
          />
        </div>
        <div class="ts-results">
          <div
            v-for="r in timeResults"
            :key="r.label"
            class="ts-result"
            :class="{ 'has-val': r.value }"
            @click="copyText(r.value)"
          >
            <span class="ts-result-label">{{ r.label }}</span>
            <span class="ts-result-value mono">{{ r.value || '—' }}</span>
          </div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>点击结果卡片即可复制</span>
      <span class="status-right">时区：本地 (UTC{{ tzOffset }})</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'ConvertTimestamp' })

const { message } = useFeedback()

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

const nowTs = ref(0)
const nowTime = ref('')
const tsInput = ref('')
const timeInput = ref('')
const tsResults = ref([])
const timeResults = ref([])

// 每秒刷新定时器（非响应式）
let timer = null

const tzOffset = computed(() => {
  const m = -new Date().getTimezoneOffset() / 60
  return m >= 0 ? `+${m}` : m
})

function tick() {
  const now = new Date()
  nowTs.value = Math.floor(now.getTime() / 1000)
  nowTime.value = formatDate(now)
}

function fillNow() {
  const now = new Date()
  tsInput.value = String(Math.floor(now.getTime() / 1000))
  timeInput.value = formatDate(now)
  convertFromTs()
  convertFromTime()
}

// 时间戳 → 时间：自动识别秒/毫秒
function convertFromTs() {
  const raw = tsInput.value.trim()
  tsResults.value = []
  if (!raw || !/^\d+$/.test(raw)) return
  let ts = parseInt(raw, 10)
  // 10 位秒级，13 位毫秒级，其余按数量级猜测
  if (raw.length <= 11 && ts > 1e9) {
    // 秒级（1973 年以后）
  } else if (raw.length >= 12 || ts < 1e9) {
    ts = ts < 1e12 && raw.length >= 12 ? ts : ts
  }
  if (raw.length === 13) {
    // 毫秒级原样
  } else if (raw.length <= 11) {
    ts = ts * 1000
  } else {
    // 14+ 位视为毫秒
  }
  const d = new Date(ts)
  if (isNaN(d.getTime())) return
  tsResults.value = [
    { label: '日期时间', value: formatDate(d) },
    { label: '毫秒级', value: String(d.getTime()) },
    { label: 'ISO 8601', value: d.toISOString() },
    { label: '星期', value: '周' + '日一二三四五六'[d.getDay()] },
    { label: '今年第几天', value: `${Math.ceil((d - new Date(d.getFullYear(), 0, 0)) / 86400000)} 天` }
  ]
}

// 时间 → 时间戳：支持 2026-09-06、2026-09-06 12:00、含秒、ISO
function convertFromTime() {
  const raw = timeInput.value.trim()
  timeResults.value = []
  if (!raw) return
  // 空格分隔的日期时间，iOS Safari 需要 'T' 分隔
  const normalized = raw.replace(' ', 'T')
  const d = new Date(normalized)
  if (isNaN(d.getTime())) return
  timeResults.value = [
    { label: '秒级时间戳', value: String(Math.floor(d.getTime() / 1000)) },
    { label: '毫秒级时间戳', value: String(d.getTime()) },
    { label: 'ISO 8601', value: d.toISOString() },
    { label: '相对描述', value: relative(d) }
  ]
}

// 相对时间描述
function relative(d) {
  const diff = d - new Date()
  const abs = Math.abs(diff)
  const suffix = diff >= 0 ? '后' : '前'
  if (abs < 60000) return `${Math.round(abs / 1000)} 秒${suffix}`
  if (abs < 3600000) return `${Math.round(abs / 60000)} 分钟${suffix}`
  if (abs < 86400000) return `${Math.round(abs / 3600000)} 小时${suffix}`
  return `${Math.round(abs / 86400000)} 天${suffix}`
}

function copyText(t) {
  if (!t) return
  navigator.clipboard.writeText(t).then(() => {
    message({ message: `已复制：${t}`, type: 'success', duration: 1200 })
  })
}

onMounted(() => {
  tick()
  timer = setInterval(tick, 1000)
  // 默认填充当前时间
  tsInput.value = String(Math.floor(Date.now() / 1000))
  convertFromTs()
  timeInput.value = formatDate(new Date())
  convertFromTime()
})

onBeforeUnmount(() => {
  clearInterval(timer)
})
</script>

<style lang="scss" scoped>
.ts-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

/* ============ 当前时间横幅 ============ */
.ts-now {
  display: flex;
  align-items: baseline;
  gap: 14px;
  padding: 14px 18px;
  border-radius: 12px;
  background: linear-gradient(115deg, rgba(var(--primary-color-rgb), 0.08), transparent 70%);
  border: 1px solid rgba(var(--primary-color-rgb), 0.2);
}

.ts-now-time {
  font-size: 24px;
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}

.ts-now-ts {
  font-size: 13px;
  color: var(--primary-color);
  font-family: 'SF Mono', Menlo, monospace;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

/* ============ 转换卡片 ============ */
.ts-card {
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  padding: 14px 16px;
}

.ts-card-title {
  display: flex;
  align-items: center;
  gap: 7px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 10px;
}

.ts-input-row {
  margin-bottom: 12px;
}

.ts-input {
  width: 100%;
  height: 36px;
  padding: 0 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  outline: none;
  background: var(--search-bg);
  font-size: 14px;
  color: var(--text-primary);
  transition: all 0.16s ease;

  &.mono {
    font-family: 'SF Mono', Menlo, monospace;
  }

  &:focus {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
    background: var(--card-bg);
  }

  &::placeholder {
    color: var(--text-secondary);
    font-size: 13px;
  }
}

.ts-results {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.ts-result {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 9px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  cursor: default;
  transition: all 0.15s ease;

  &.has-val {
    cursor: pointer;

    &:hover {
      border-color: rgba(var(--primary-color-rgb), 0.4);
      background: rgba(var(--primary-color-rgb), 0.04);

      .ts-result-value {
        color: var(--primary-color);
      }
    }
  }
}

.ts-result-label {
  font-size: 10.5px;
  color: var(--text-secondary);
}

.ts-result-value {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
}
</style>
