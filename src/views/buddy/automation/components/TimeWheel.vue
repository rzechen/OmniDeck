<template>
  <!-- mac 风格双列时间滚轮（小时 00-23 + 分钟 5 分钟粒度）：
       触发框展示当前值，点击展开毛玻璃滚轮面板，滚轮/点击选择，滚动自动吸附居中 -->
  <div class="ob-tw" :class="{ open }" @click.stop>
    <!-- 触发框（与向导输入框同观感：边框 + 主题色聚焦） -->
    <div class="ob-tw-field" @click="toggle">
      <svg-icon icon-class="clock" />
      <span class="ob-tw-val">{{ value }}</span>
      <svg-icon icon-class="arrow-right" class="ob-tw-caret" />
    </div>

    <transition name="ob-tw-pop">
      <div v-if="open" class="ob-tw-panel">
        <!-- 小时列 -->
        <div ref="hCol" class="ob-tw-col" @scroll.passive="onScroll('h')">
          <div
            v-for="h in hours"
            :key="'h' + h"
            class="ob-tw-item"
            :class="{ sel: h === hour }"
            @click="pick('h', h)"
          >{{ pad(h) }}</div>
        </div>
        <div class="ob-tw-colon">:</div>
        <!-- 分钟列 -->
        <div ref="mCol" class="ob-tw-col" @scroll.passive="onScroll('m')">
          <div
            v-for="m in minutes"
            :key="'m' + m"
            class="ob-tw-item"
            :class="{ sel: m === minute }"
            @click="pick('m', m)"
          >{{ pad(m) }}</div>
        </div>
        <!-- 中央高亮带（主题色胶囊，标记当前选中行） -->
        <div class="ob-tw-band"></div>
      </div>
    </transition>
  </div>
</template>

<script>
// 定时任务向导的执行时间选择器：两列滚轮（macOS 日历风格），分钟粒度 5 分钟
// - 滚轮滚动停止后自动吸附最近档位（debounce 100ms）
// - 点击任意项直接选中；面板打开时定位到当前值
// - reduce-motion 下滚动/展开均瞬时（无平滑动画）
const ITEM_H = 32       // 单行高度（与高亮带对齐）
const VISIBLE = 8       // 可视行数
const SNAP_DELAY = 100  // 滚动停止判定延时

export default {
  name: 'TimeWheel',
  props: {
    // 'HH:mm'（缺省 09:00）
    value: {
      type: String,
      default: '09:00'
    }
  },
  data() {
    const [h, m] = this.parseValue(this.value)
    return {
      open: false,
      hour: h,
      minute: m,
      // 程序定位期间屏蔽滚动吸附（避免定位触发 snap 回写抖动）
      locking: false,
      snapTimer: null
    }
  },
  computed: {
    hours() {
      const out = []
      for (let h = 0; h < 24; h++) out.push(h)
      return out
    },
    // 5 分钟粒度：00 05 10 ... 55
    minutes() {
      const out = []
      for (let m = 0; m < 60; m += 5) out.push(m)
      return out
    },
    // 减少动态效果：瞬时滚动（html.reduce-motion 由全局设置维护）
    instant() {
      return document.documentElement.classList.contains('reduce-motion')
    }
  },
  watch: {
    // 外部回填（编辑任务）：同步内部值；面板展开时同步滚轮位置
    value(v) {
      const [h, m] = this.parseValue(v)
      this.hour = h
      this.minute = m
      if (this.open) this.$nextTick(this.locate)
    }
  },
  mounted() {
    document.addEventListener('click', this.onDocClick)
  },
  beforeDestroy() {
    document.removeEventListener('click', this.onDocClick)
    clearTimeout(this.snapTimer)
  },
  methods: {
    parseValue(v) {
      const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(v || ''))
      if (!m) return [9, 0]
      return [Math.min(23, parseInt(m[1], 10)), Math.min(55, parseInt(m[2], 10))]
    },
    pad(n) {
      return String(n).padStart(2, '0')
    },
    toggle() {
      this.open = !this.open
      if (this.open) this.$nextTick(this.locate)
    },
    // 打开时把两列滚到当前值（瞬时，无平滑动画）
    locate() {
      this.locking = true
      const hi = this.hours.indexOf(this.hour)
      const mi = this.minutes.indexOf(this.minute)
      this.$refs.hCol.scrollTop = hi * ITEM_H
      this.$refs.mCol.scrollTop = mi * ITEM_H
      clearTimeout(this.snapTimer)
      this.snapTimer = setTimeout(() => { this.locking = false }, SNAP_DELAY)
    },
    // 滚动吸附：停止滚动后 snap 到最近档位并回写
    onScroll() {
      if (this.locking) return
      clearTimeout(this.snapTimer)
      this.snapTimer = setTimeout(() => this.snap(true), SNAP_DELAY)
    },
    snap(smooth) {
      const hIdx = Math.round(this.$refs.hCol.scrollTop / ITEM_H)
      const mIdx = Math.round(this.$refs.mCol.scrollTop / ITEM_H)
      const hc = Math.max(0, Math.min(this.hours.length - 1, hIdx))
      const mc = Math.max(0, Math.min(this.minutes.length - 1, mIdx))
      this.locking = true
      this.$refs.hCol.scrollTo({ top: hc * ITEM_H, behavior: smooth && !this.instant ? 'smooth' : 'auto' })
      this.$refs.mCol.scrollTo({ top: mc * ITEM_H, behavior: smooth && !this.instant ? 'smooth' : 'auto' })
      this.hour = this.hours[hc]
      this.minute = this.minutes[mc]
      this.emitVal()
      clearTimeout(this.snapTimer)
      this.snapTimer = setTimeout(() => { this.locking = false }, SNAP_DELAY)
    },
    // 点击某项：滚到该项（平滑）并立即选中
    pick(col, v) {
      const el = col === 'h' ? this.$refs.hCol : this.$refs.mCol
      const idx = col === 'h' ? this.hours.indexOf(v) : this.minutes.indexOf(v)
      this.locking = true
      el.scrollTo({ top: idx * ITEM_H, behavior: this.instant ? 'auto' : 'smooth' })
      if (col === 'h') this.hour = v
      else this.minute = v
      this.emitVal()
      clearTimeout(this.snapTimer)
      this.snapTimer = setTimeout(() => { this.locking = false }, SNAP_DELAY)
    },
    emitVal() {
      const next = this.pad(this.hour) + ':' + this.pad(this.minute)
      if (next !== this.value) this.$emit('input', next)
    },
    // 面板外点击关闭
    onDocClick() {
      if (this.open) this.open = false
    }
  }
}
</script>

<style lang="scss" scoped>
// 触发框宽度与向导其它控件协调（同原时间输入框 200px）
.ob-tw {
  position: relative;
  width: 200px;

  // ===== 触发框（模仿 el-input 观感：边框 + hover/focus 主题色） =====
  .ob-tw-field {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 12px;
    border: 1.5px solid var(--border-light, rgba(0, 0, 0, 0.12));
    border-radius: 8px;
    cursor: pointer;
    user-select: none;
    transition: border-color 0.18s, box-shadow 0.18s;

    > .svg-icon {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .ob-tw-val {
      flex: 1;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      font-size: 13.5px;
      color: var(--text-primary);
      letter-spacing: 1px;
    }

    .ob-tw-caret {
      font-size: 12px;
      color: var(--text-secondary);
      transform: rotate(90deg);
      transition: transform 0.18s;
    }
  }

  &.open .ob-tw-field {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.15);

    .ob-tw-caret {
      transform: rotate(-90deg);
    }
  }

  // ===== 滚轮面板（毛玻璃，macOS picker 风格） =====
  .ob-tw-panel {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    z-index: 3200;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 8px;
    height: 256px; // VISIBLE 行 × 32
    border-radius: 12px;
    background: var(--bg-glass, rgba(255, 255, 255, 0.88));
    backdrop-filter: blur(20px) saturate(1.6);
    -webkit-backdrop-filter: blur(20px) saturate(1.6);
    border: 1px solid var(--border-light, rgba(0, 0, 0, 0.1));
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16);
    overflow: hidden;
  }

  .ob-tw-col {
    width: 52px;
    height: 100%;
    overflow-y: auto;
    // 上下补齐半视口 padding，使首末项可滚到中央高亮带
    padding: 112px 0;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }

    // 顶部/底部渐隐（mac picker 惯例）
    -webkit-mask-image: linear-gradient(transparent 0, #000 34px, #000 calc(100% - 34px), transparent 100%);
    mask-image: linear-gradient(transparent 0, #000 34px, #000 calc(100% - 34px), transparent 100%);
  }

  .ob-tw-item {
    height: 32px; // ITEM_H
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 13.5px;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 6px;
    transition: color 0.15s, font-weight 0.15s;

    &:hover {
      color: var(--text-primary);
    }

    &.sel {
      color: #fff;
      font-weight: 600;
    }
  }

  // 中央高亮带：主题色胶囊（选中行背景，z 轴在文本之下）
  .ob-tw-band {
    position: absolute;
    top: 50%;
    left: 8px;
    right: 8px;
    height: 32px;
    transform: translateY(-50%);
    border-radius: 8px;
    background: var(--primary-color);
    pointer-events: none;
    z-index: 0;
  }

  // 列内容压到高亮带之上
  .ob-tw-col {
    position: relative;
    z-index: 1;
  }

  .ob-tw-colon {
    position: relative;
    z-index: 1;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 14px;
    color: var(--text-secondary);
  }
}

// ===== 展开动画（reduce-motion 下禁用） =====
.ob-tw-pop-enter-active,
.ob-tw-pop-leave-active {
  transition: opacity 0.16s, transform 0.16s;
}

.ob-tw-pop-enter,
.ob-tw-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

html.reduce-motion .ob-tw-pop-enter-active,
html.reduce-motion .ob-tw-pop-leave-active {
  transition: none;
}

html.reduce-motion .ob-tw-field,
html.reduce-motion .ob-tw-caret,
html.reduce-motion .ob-tw-item {
  transition: none;
}
</style>
