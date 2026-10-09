<template>
  <div class="home-page page-container">
    <!-- Hero：问候 + 日期时间 -->
    <div class="hero">
      <div class="hero-left">
        <h1 class="hero-title">{{ greeting }}，欢迎回来</h1>
        <p class="hero-subtitle">全能桌面，智驭未来 · {{ totalTools }} 款工具开箱即用</p>
      </div>
      <div class="hero-right">
        <div class="hero-time">{{ hourMin }}:{{ secStr }}</div>
        <div class="hero-date">{{ dateStr }}</div>
      </div>
    </div>

    <!-- OmniBuddy 主推横幅：渐变紫 + 流光 + CTA -->
    <div class="buddy-banner stagger-item" @click="goBuddy">
      <span class="buddy-banner-glow"></span>
      <div class="buddy-banner-icon">
        <img src="@/assets/logo.png" alt="OmniBuddy" class="buddy-banner-img" />
      </div>
      <div class="buddy-banner-info">
        <div class="buddy-banner-name">
          OmniBuddy
          <span class="buddy-banner-tag">AI 助手</span>
        </div>
        <div class="buddy-banner-desc">你的智能伙伴 · 多空间会话管理、多模型接入、Markdown 渲染，数据全程本地存储</div>
        <div class="buddy-banner-feats">
          <span>多会话</span><span>空间管理</span><span>多模型</span><span>本地优先</span>
        </div>
      </div>
      <div class="buddy-banner-cta">
        <span class="cta-btn">开始对话</span>
        <span class="cta-kbd">⌘ J</span>
      </div>
    </div>

    <!-- 核心功能入口：我的代办 / 理财 / 我的收藏 -->
    <div class="quick-grid">
      <!-- 我的代办：含今日待办徽标 -->
      <div class="quick-card stagger-item" style="animation-delay: 40ms" @click="router.push('/todo')">
        <div class="quick-icon qc-todo">
          <svg-icon icon-class="calendar" class="quick-svg" />
        </div>
        <div class="quick-info">
          <div class="quick-title">
            我的代办
            <span v-if="todayPending > 0" class="quick-badge">{{ todayPending }}</span>
          </div>
          <div class="quick-desc">日历视图 · 今日 {{ todayPending }} 项待办</div>
        </div>
        <svg-icon icon-class="arrow-right" class-name="quick-arrow" />
      </div>

      <!-- 贵金属 -->
      <div class="quick-card stagger-item" style="animation-delay: 80ms" @click="router.push('/finance/gold')">
        <div class="quick-icon qc-fund">
          <svg-icon icon-class="gold" class="quick-svg" />
        </div>
        <div class="quick-info">
          <div class="quick-title">贵金属</div>
          <div class="quick-desc">金银铂钯 · 实时行情 · 克价换算</div>
        </div>
        <svg-icon icon-class="arrow-right" class-name="quick-arrow" />
      </div>

      <!-- 我的收藏 -->
      <div class="quick-card stagger-item" style="animation-delay: 120ms" @click="router.push('/favorites')">
        <div class="quick-icon qc-fav">
          <svg-icon icon-class="star" class="quick-svg" />
        </div>
        <div class="quick-info">
          <div class="quick-title">我的收藏</div>
          <div class="quick-desc">{{ favToolCount }} 个工具 · {{ favSiteCount }} 个网站</div>
        </div>
        <svg-icon icon-class="arrow-right" class-name="quick-arrow" />
      </div>

      <!-- 本地数据：配额监控 -->
      <div class="quick-card stagger-item" style="animation-delay: 160ms" @click="router.push('/settings')">
        <div class="quick-icon qc-storage">
          <svg-icon icon-class="storage" class="quick-svg" />
        </div>
        <div class="quick-info">
          <div class="quick-title">
            本地数据
            <span v-if="quotaPercent >= 80" class="quota-warn">{{ quotaPercent }}%</span>
          </div>
          <div class="quick-desc">{{ storageDesc }}</div>
          <div class="quota-bar" v-if="quotaPercent > 0">
            <span class="quota-used" :style="{ width: quotaPercent + '%' }"></span>
          </div>
        </div>
        <svg-icon icon-class="arrow-right" class-name="quick-arrow" />
      </div>
    </div>

    <!-- 本地数据：每日存储增长独立折线图（近 30 天 IndexedDB 每日净增长） -->
    <div class="growth-chart stagger-item" style="animation-delay: 200ms">
      <div class="gc-head">
        <div class="gc-head-info">
          <div class="gc-title"><span class="gc-title-dot"></span>每日存储增长</div>
          <div class="gc-sub">近 30 天本地数据每日净增长</div>
        </div>
        <div class="gc-stats" v-if="hasUsage">
          <div class="gc-stat">
            <em>累计</em>
            <b>{{ fmtBytes(totalGrowth) }}</b>
          </div>
          <div class="gc-stat">
            <em>日均</em>
            <b>{{ fmtBytes(avgGrowth) }}</b>
          </div>
          <div class="gc-stat">
            <em>单日峰值</em>
            <b>{{ fmtBytes(peakGrowth) }}</b>
          </div>
        </div>
      </div>

      <div
        v-if="hasUsage"
        class="gc-chart"
        @mousemove="onGrowthMove"
        @mouseleave="growthHover = null"
      >
        <svg :viewBox="`0 0 ${GROWTH_W} ${GROWTH_H}`" preserveAspectRatio="none" class="gc-svg">
          <!-- y 轴网格线（刻度文字用 HTML 层，避免 SVG 拉伸变形） -->
          <line
            v-for="(t, k) in growthTicks"
            :key="'gt' + k"
            x1="0" :x2="GROWTH_W" :y1="t.y" :y2="t.y"
            class="gc-grid"
          />
          <!-- 渐变面积填充 -->
          <defs>
            <linearGradient id="gc-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#10B981" stop-opacity="0.22" />
              <stop offset="100%" stop-color="#10B981" stop-opacity="0" />
            </linearGradient>
          </defs>
          <path :d="growthAreaPath" fill="url(#gc-fill)" />
          <path :d="growthLinePath" fill="none" stroke="#10B981" stroke-width="2"
            stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" />
          <!-- 悬停指示线（数据点用 HTML 层，避免 SVG 拉伸变形） -->
          <line
            v-if="hoverPoint"
            :x1="hoverPoint.x" :x2="hoverPoint.x"
            y1="0" :y2="GROWTH_H"
            class="gc-cursor"
          />
        </svg>
        <!-- 悬停数据点（HTML 圆点，不受 viewBox 非等比拉伸影响） -->
        <span
          v-if="hoverPoint && hoverPoint.y !== null"
          class="gc-hover-dot"
          :style="{
            left: (hoverPoint.x / GROWTH_W * 100) + '%',
            top: (hoverPoint.y / GROWTH_H * 100) + '%'
          }"
        ></span>
        <!-- y 轴刻度（左侧） -->
        <span
          v-for="(t, k) in growthTicks"
          :key="'gl' + k"
          class="gc-ylabel mono"
          :style="{ top: (t.y / GROWTH_H * 100) + '%' }"
        >{{ t.label }}</span>
        <!-- 悬停 tooltip -->
        <div v-if="hoverPoint" class="gc-tip mono" :style="gcTipStyle">
          <span class="gc-tip-date">{{ hoverPoint.date }}</span>
          <b class="gc-tip-val">{{ hoverPoint.growth === null ? '无采样数据' : '+' + fmtBytes(hoverPoint.growth) }}</b>
        </div>
      </div>
      <!-- x 轴日期刻度（与图表左右对齐） -->
      <div v-if="hasUsage" class="gc-xaxis">
        <span
          v-for="(t, k) in growthXTicks"
          :key="'gx' + k"
          :class="{ first: t.first, last: t.last }"
          :style="{ left: t.pct + '%' }"
        >{{ t.label }}</span>
      </div>
      <div v-else class="gc-empty">
        <svg-icon icon-class="storage" class="gc-empty-icon" />
        <span>暂无每日用量数据，次日起开始记录</span>
      </div>
    </div>

    <!-- 工具集：紧凑胶囊网格 -->
    <div class="section-header">
      <span class="section-title">工具集</span>
      <span class="section-count">{{ toolCategories.length }} 个分类</span>
    </div>
    <div class="cat-grid">
      <div
        v-for="(cat, idx) in toolCategories"
        :key="cat.path"
        class="cat-chip stagger-item"
        :style="{ animationDelay: 160 + idx * 30 + 'ms' }"
        @click="router.push(cat.path)"
      >
        <span class="cat-dot" :style="{ background: cat.color }">
          <svg-icon :icon-class="cat.iconSvg" class="cat-svg" />
        </span>
        <span class="cat-name">{{ cat.title }}</span>
        <span class="cat-count">{{ cat.children.length }}</span>
        <svg-icon icon-class="arrow-right" class-name="cat-arrow" />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { toolCategories } from '@/config/tools'
import { getItem, getDailyGrowth } from '@/utils/storage/db'

// 字节数人性化：B → KB → MB → GB
function fmtBytes(n) {
  if (!n || n < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

// 首页：宣传位（OmniBuddy 主推）+ 核心功能入口 + 工具集紧凑网格
defineOptions({ name: 'Home' })

const router = useRouter()
const route = useRoute()

const now = ref(new Date())
const todayPending = ref(0)
const favToolCount = ref(0)
const favSiteCount = ref(0)
// 本地数据配额：{ usage, quota } 字节数，null 表示不可用
const storageEstimate = ref(null)
// 近 30 天 IndexedDB 每日净增长 [{ date, growth }]（旧→新；null = 无采样数据）
const dailyUsage = ref([])
// 折线悬停索引：{ i }，null 表示未悬停
const growthHover = ref(null)
// 折线图逻辑尺寸（viewBox）
const GROWTH_W = 560
const GROWTH_H = 190

// 时钟定时器（非响应式）
let timer = null

const greeting = computed(() => {
  const h = now.value.getHours()
  if (h >= 5 && h < 11) return '早上好'
  if (h >= 11 && h < 13) return '中午好'
  if (h >= 13 && h < 18) return '下午好'
  if (h >= 18 && h < 23) return '晚上好'
  return '夜深了'
})
const dateStr = computed(() => {
  const d = now.value
  const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
  return `${d.getMonth() + 1}月${d.getDate()}日 星期${week}`
})
const hourMin = computed(() => {
  const d = now.value
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
})
const seconds = computed(() => now.value.getSeconds())
const secStr = computed(() => String(seconds.value).padStart(2, '0'))
const totalTools = computed(() => {
  return toolCategories.reduce((sum, c) => sum + c.children.length, 0)
})
// 配额已用百分比（0-100；取不到时 0 不渲染进度条）
const quotaPercent = computed(() => {
  if (!storageEstimate.value || !storageEstimate.value.quota) return 0
  return Math.min(100, Math.round((storageEstimate.value.usage / storageEstimate.value.quota) * 100))
})
// 用量文案：已用 / 总配额；取不到时提示不可用
const storageDesc = computed(() => {
  if (!storageEstimate.value) return '用量统计不可用'
  const { usage, quota } = storageEstimate.value
  return `${fmtBytes(usage)} 已用 · 配额 ${fmtBytes(quota)}`
})
// ===== 近 30 天 IndexedDB 每日净增长折线 =====
// 是否有增长数据（任一天有非空采样差值）
const hasUsage = computed(() => {
  return dailyUsage.value.some(d => d.growth !== null)
})
// 有效增长数据（过滤无采样日）
const validUsage = computed(() => {
  return dailyUsage.value.filter(d => d.growth !== null)
})
// 折线数据点（viewBox 坐标）：max 归一化；无采样日（null）跳过该点、折线断开
const growthPoints = computed(() => {
  const max = Math.max(1, ...validUsage.value.map(d => d.growth))
  const n = dailyUsage.value.length
  const W = GROWTH_W
  const H = GROWTH_H
  const padT = 10 // 顶部留白，避免线条贴边
  const padB = 14 // 底部留白，与 x 轴刻度拉开距离
  return dailyUsage.value.map((d, i) => {
    const x = n <= 1 ? W / 2 : (i / (n - 1)) * W
    // 无采样数据的日期：y 置为 null，path 生成时断开
    if (d.growth === null) return { x, y: null, date: d.date, growth: null }
    const ratio = d.growth / max
    const y = padT + (1 - ratio) * (H - padT - padB)
    return { x, y, date: d.date, growth: d.growth }
  })
})
// 折线 path（null 点断线，用 M 重新起笔）
const growthLinePath = computed(() => {
  let d = ''
  let pen = false // 上一笔是否有效（用于 M/L 切换）
  growthPoints.value.forEach(p => {
    if (p.y === null) {
      pen = false
      return
    }
    d += `${pen ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)} `
    pen = true
  })
  return d.trim()
})
// 面积 path（每段折线闭合到底部；无有效点返回空）
const growthAreaPath = computed(() => {
  const H = GROWTH_H
  const pts = growthPoints.value
  let d = ''
  let seg = [] // 当前连续段
  const flush = () => {
    if (seg.length < 2) { seg = []; return }
    const head = seg.map((p, i) =>
      `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`
    ).join(' ')
    d += `${head} L${seg[seg.length - 1].x.toFixed(1)},${H} L${seg[0].x.toFixed(1)},${H} Z `
    seg = []
  }
  pts.forEach(p => {
    if (p.y === null) {
      flush()
    } else {
      seg.push(p)
    }
  })
  flush()
  return d.trim()
})
// y 轴刻度（4 档：max → 0；与数据点共用归一化坐标）
const growthTicks = computed(() => {
  const max = Math.max(1, ...validUsage.value.map(d => d.growth))
  const H = GROWTH_H
  const padT = 10
  const padB = 14
  return [1, 2 / 3, 1 / 3, 0].map(r => ({
    y: padT + (1 - r) * (H - padT - padB),
    label: fmtBytes(Math.round(max * r))
  }))
})
// x 轴日期刻度（间隔采样 + 首尾）
const growthXTicks = computed(() => {
  const pts = growthPoints.value
  const n = pts.length
  if (!n) return []
  const step = Math.max(1, Math.ceil(n / 7))
  const idx = []
  for (let i = 0; i < n; i += step) idx.push(i)
  if (idx[idx.length - 1] !== n - 1) idx.push(n - 1)
  return idx.map(i => ({
    pct: n <= 1 ? 50 : (i / (n - 1)) * 100,
    label: pts[i].date.slice(5), // MM-DD
    first: i === 0,
    last: i === n - 1
  }))
})
// 统计：区间累计增长
const totalGrowth = computed(() => {
  return validUsage.value.reduce((s, d) => s + d.growth, 0)
})
// 统计：日均增长
const avgGrowth = computed(() => {
  if (!validUsage.value.length) return 0
  return Math.round(totalGrowth.value / validUsage.value.length)
})
// 统计：单日峰值增长
const peakGrowth = computed(() => {
  return validUsage.value.length ? Math.max(...validUsage.value.map(d => d.growth)) : 0
})
// 悬停命中的数据点
const hoverPoint = computed(() => {
  if (!growthHover.value) return null
  return growthPoints.value[growthHover.value.i] || null
})
// 悬停 tooltip 定位（x 百分比 clamp 防溢出；点靠上时下移）
const gcTipStyle = computed(() => {
  const p = hoverPoint.value
  if (!p) return {}
  const left = Math.min(84, Math.max(16, (p.x / GROWTH_W) * 100))
  const top = Math.max(22, ((p.y === null ? GROWTH_H - 24 : p.y) / GROWTH_H) * 100)
  return { left: left + '%', top: top + '%' }
})
const todayKey = computed(() => {
  const d = now.value
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
})

onMounted(() => {
  timer = setInterval(() => {
    now.value = new Date()
  }, 1000)
  loadQuickStats()
  loadStorageEstimate()
  loadDailyUsage()
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
})

// 核心入口统计：今日待办数 / 收藏数
function loadQuickStats() {
  const todos = getItem('todoItems', [])
  if (Array.isArray(todos)) {
    todayPending.value = todos.filter(t => !t.done && t.date === todayKey.value).length
  }
  const favTools = getItem('toolFavorites', [])
  favToolCount.value = Array.isArray(favTools) ? favTools.length : 0
  const sites = getItem('siteFavorites', [])
  favSiteCount.value = Array.isArray(sites) ? sites.length : 0
}
// 本地数据配额监控：navigator.storage.estimate()
async function loadStorageEstimate() {
  try {
    if (navigator.storage && navigator.storage.estimate) {
      const { usage, quota } = await navigator.storage.estimate()
      storageEstimate.value = { usage: usage || 0, quota: quota || 0 }
    }
  } catch (e) { /* 不支持时保持 null，卡片显示「不可用」 */ }
}
// 近 30 天 IndexedDB 每日净增长（同步读 KV 内存缓存）
function loadDailyUsage() {
  try {
    dailyUsage.value = getDailyGrowth(30)
  } catch (e) { /* 忽略 */ }
}
// 图表 mousemove：换算 viewBox x 坐标 → 最近数据点索引
function onGrowthMove(evt) {
  const pts = growthPoints.value
  if (pts.length < 2) return
  const rect = evt.currentTarget.getBoundingClientRect()
  const vx = ((evt.clientX - rect.left) / rect.width) * GROWTH_W
  const step = GROWTH_W / (pts.length - 1)
  const i = Math.max(0, Math.min(pts.length - 1, Math.round(vx / step)))
  if (!growthHover.value || growthHover.value.i !== i) growthHover.value = { i }
}
function goBuddy() {
  // 恢复 buddy 侧最后所在页面（无记录时回新任务页）
  const target = router.lastBuddyPath || '/omnibuddy'
  if (route.fullPath !== target) {
    router.push(target).catch(() => {})
  }
}
</script>

<style lang="scss" scoped>
.home-page {
  height: 100%;
}

// Hero
.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  padding: 2px 2px 14px;

  .hero-title {
    font-size: 21px;
    font-weight: 700;
    color: $text-primary;
    letter-spacing: 0.3px;
  }

  .hero-subtitle {
    margin-top: 4px;
    font-size: 13px;
    color: $text-secondary;
  }

  .hero-right {
    text-align: right;
    flex-shrink: 0;
  }

  .hero-time {
    font-size: 22px;
    font-weight: 700;
    color: $text-primary;
    font-variant-numeric: tabular-nums;
    letter-spacing: 0.5px;
    line-height: 1.2;
  }

  .hero-date {
    margin-top: 3px;
    font-size: 12px;
    color: $text-secondary;
  }
}

// ===== OmniBuddy 主推横幅 =====
.buddy-banner {
  position: relative;
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 22px;
  border-radius: 18px;
  background: linear-gradient(120deg, #7C3AED 0%, #9254DE 45%, #B37FEB 100%);
  box-shadow: 0 10px 30px rgba(114, 46, 209, 0.28);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 14px 36px rgba(114, 46, 209, 0.38);
  }

  &:active {
    transform: translateY(0) scale(0.99);
  }
}

// 流光扫过
.buddy-banner-glow {
  position: absolute;
  top: 0;
  left: -60%;
  width: 40%;
  height: 100%;
  background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.18), transparent);
  transform: skewX(-20deg);
  animation: ob-banner-sheen 4.5s ease-in-out infinite;
  pointer-events: none;
}

@keyframes ob-banner-sheen {
  0%, 60% {
    left: -60%;
  }
  100% {
    left: 140%;
  }
}

.buddy-banner-icon {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  // 实白 chip 衬底：logo 为蓝色渐变，紫底上需实白底衬出，半透明白会显脏
  background: #fff;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  // 品牌 logo（宽扁异形，contain 原比例呈现）
  .buddy-banner-img {
    width: 34px;
    height: 34px;
    object-fit: contain;
  }
}

.buddy-banner-info {
  flex: 1;
  min-width: 0;
}

.buddy-banner-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 800;
  letter-spacing: 0.4px;
  color: #fff;
}

.buddy-banner-tag {
  font-size: 9.5px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.95);
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.35);
  padding: 1px 8px;
  border-radius: 999px;
}

.buddy-banner-desc {
  margin-top: 5px;
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.88);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.buddy-banner-feats {
  display: flex;
  gap: 6px;
  margin-top: 8px;

  span {
    font-size: 10px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.92);
    background: rgba(255, 255, 255, 0.14);
    border: 1px solid rgba(255, 255, 255, 0.22);
    padding: 2px 9px;
    border-radius: 999px;
    white-space: nowrap;
  }
}

.buddy-banner-cta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  .cta-btn {
    display: inline-flex;
    align-items: center;
    height: 32px;
    padding: 0 18px;
    border-radius: 999px;
    background: #fff;
    color: #722ED1;
    font-size: 13px;
    font-weight: 700;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.18);
    transition: transform 0.15s ease;
  }

  .cta-kbd {
    font-size: 10.5px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.9);
    border: 1px solid rgba(255, 255, 255, 0.4);
    border-radius: 6px;
    padding: 1px 6px;
  }
}

// ===== 核心功能入口 =====
.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 12px;
  margin-top: 14px;
}

.quick-card {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: $card-bg;
  box-shadow: $shadow-sm;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-2px);
    border-color: rgba(var(--primary-color-rgb), 0.4);
    box-shadow: $shadow-lg;

    .quick-arrow {
      transform: translateX(2px);
      color: var(--primary-color);
      opacity: 1;
    }
  }

  &:active {
    transform: translateY(0) scale(0.98);
  }
}

.quick-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .quick-svg {
    width: 19px;
    height: 19px;
    color: #fff;
  }
}

.qc-todo {
  background: linear-gradient(135deg, #3B82F6, #2563EB);
}

.qc-fund {
  background: linear-gradient(135deg, var(--danger-color), #CF1322);
}

.qc-fav {
  background: linear-gradient(135deg, #FA8C16, #D46B08);
}

.qc-storage {
  background: linear-gradient(135deg, var(--success-color), #059669);
}

// 配额进度条
.quota-bar {
  margin-top: 6px;
  height: 4px;
  border-radius: 2px;
  background: var(--border-color, rgba(0, 0, 0, 0.08));
  overflow: hidden;

  .quota-used {
    display: block;
    height: 100%;
    border-radius: 2px;
    background: linear-gradient(90deg, var(--success-color), #059669);
    transition: width 0.4s ease;
  }
}

// 用量告警徽标（≥80%）
.quota-warn {
  min-width: 17px;
  height: 17px;
  line-height: 17px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(245, 154, 23, 0.9);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
}

// ===== 每日存储增长：独立折线图面板 =====
.growth-chart {
  margin-top: 12px;
  padding: 16px 18px 14px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: $card-bg;
  box-shadow: $shadow-sm;
}

.gc-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.gc-head-info {
  min-width: 0;
}

.gc-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14.5px;
  font-weight: 700;
  color: $text-primary;
}

.gc-title-dot {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  background: linear-gradient(135deg, var(--success-color), #059669);
  box-shadow: 0 0 0 3px rgba(var(--success-color-rgb),  0.15);
}

.gc-sub {
  margin-top: 4px;
  font-size: 11.5px;
  color: $text-secondary;
}

.gc-stats {
  display: flex;
  gap: 22px;
  flex-shrink: 0;
}

.gc-stat {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;

  em {
    font-style: normal;
    font-size: 10.5px;
    color: $text-secondary;
  }

  b {
    font-size: 14px;
    font-weight: 700;
    color: #059669;
    font-variant-numeric: tabular-nums;
  }
}

// 图表主体（左右留白给 y 轴刻度）
.gc-chart {
  position: relative;
  height: 190px;
  margin: 14px 46px 0 48px;
  cursor: crosshair;
}

.gc-svg {
  width: 100%;
  height: 100%;
  display: block;
  overflow: visible;
}

.gc-grid {
  stroke: var(--border-color);
  stroke-width: 0.6;
  stroke-dasharray: 3 4;
}

.gc-cursor {
  stroke: var(--text-secondary);
  stroke-width: 0.8;
  opacity: 0.45;
  stroke-dasharray: 3 3;
}

// y 轴刻度（左侧 HTML 层，不受 SVG 拉伸变形影响；宽度自适应不换行）
.gc-ylabel {
  position: absolute;
  right: calc(100% + 8px);
  white-space: nowrap;
  transform: translateY(-50%);
  font-size: 10px;
  line-height: 1;
  color: $text-secondary;
  opacity: 0.9;
  pointer-events: none;
}

// 悬停数据点（HTML 圆点，保持正圆不受 SVG 非等比拉伸影响）
.gc-hover-dot {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--success-color);
  border: 1.5px solid #fff;
  box-shadow: 0 1px 5px rgba(0, 0, 0, 0.28);
  transform: translate(-50%, -50%);
  pointer-events: none;
  z-index: 4;
}

// 悬停 tooltip（深色毛玻璃，同 finance 图表风格）
.gc-tip {
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
  transform: translate(-50%, -135%);
}

.gc-tip-date {
  color: rgba(245, 245, 247, 0.65);
}

.gc-tip-val {
  font-weight: 700;
  color: #34D399;
}

// x 轴日期刻度（与图表左右对齐）
.gc-xaxis {
  position: relative;
  height: 16px;
  margin: 5px 46px 0 48px;

  span {
    position: absolute;
    top: 0;
    transform: translateX(-50%);
    font-size: 10px;
    color: $text-secondary;
    white-space: nowrap;

    &.first {
      transform: none;
    }

    &.last {
      transform: translateX(-100%);
    }
  }
}

// 无数据占位
.gc-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 120px;
  margin-top: 10px;
  font-size: 12px;
  color: $text-secondary;
}

.gc-empty-icon {
  width: 18px;
  height: 18px;
  opacity: 0.5;
}

// 等宽数字/文本（图表刻度与 tooltip）
.mono {
  font-family: 'SF Mono', Menlo, Consolas, 'Courier New', monospace;
}

.quick-info {
  flex: 1;
  min-width: 0;
}

.quick-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 700;
  color: $text-primary;
}

.quick-badge {
  min-width: 17px;
  height: 17px;
  line-height: 17px;
  padding: 0 5px;
  border-radius: 999px;
  background: rgba(245, 34, 45, 0.9);
  color: #fff;
  font-size: 10px;
  font-weight: 700;
  text-align: center;
}

.quick-desc {
  margin-top: 3px;
  font-size: 11.5px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.quick-arrow {
  font-size: 13px;
  color: $text-secondary;
  opacity: 0.55;
  flex-shrink: 0;
  transition: all 0.15s ease;
}

// ===== 工具集紧凑胶囊网格 =====
.section-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin: 18px 0 12px;

  .section-title {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  .section-count {
    font-size: 11.5px;
    color: $text-secondary;
  }
}

.cat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 10px;
}

.cat-chip {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: $card-bg;
  box-shadow: $shadow-sm;
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--primary-color-rgb), 0.35);
    box-shadow: $shadow-base;

    .cat-arrow {
      opacity: 1;
      transform: translateX(2px);
      color: var(--primary-color);
    }
  }

  &:active {
    transform: scale(0.98);
  }
}

.cat-dot {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .cat-svg {
    width: 15px;
    height: 15px;
    color: #fff;
  }
}

.cat-name {
  flex: 1;
  min-width: 0;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.cat-count {
  font-size: 11px;
  font-weight: 600;
  color: $text-secondary;
  background: $search-bg;
  border-radius: 999px;
  padding: 1px 8px;
  flex-shrink: 0;
}

.cat-arrow {
  font-size: 12px;
  color: $text-secondary;
  opacity: 0;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
</style>
