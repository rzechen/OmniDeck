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
        <svg-icon icon-class="buddy" class="buddy-banner-svg" />
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
      <div class="quick-card stagger-item" style="animation-delay: 40ms" @click="$router.push('/todo')">
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
        <i class="el-icon-arrow-right quick-arrow"></i>
      </div>

      <!-- 理财 -->
      <div class="quick-card stagger-item" style="animation-delay: 80ms" @click="$router.push('/finance/fund')">
        <div class="quick-icon qc-fund">
          <svg-icon icon-class="fund" class="quick-svg" />
        </div>
        <div class="quick-info">
          <div class="quick-title">理财</div>
          <div class="quick-desc">基金持仓 · 实时估值 · 收益追踪</div>
        </div>
        <i class="el-icon-arrow-right quick-arrow"></i>
      </div>

      <!-- 我的收藏 -->
      <div class="quick-card stagger-item" style="animation-delay: 120ms" @click="$router.push('/favorites')">
        <div class="quick-icon qc-fav">
          <svg-icon icon-class="star" class="quick-svg" />
        </div>
        <div class="quick-info">
          <div class="quick-title">我的收藏</div>
          <div class="quick-desc">{{ favToolCount }} 个工具 · {{ favSiteCount }} 个网站</div>
        </div>
        <i class="el-icon-arrow-right quick-arrow"></i>
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
        @click="$router.push(cat.path)"
      >
        <span class="cat-dot" :style="{ background: cat.color }">
          <svg-icon :icon-class="cat.iconSvg" class="cat-svg" />
        </span>
        <span class="cat-name">{{ cat.title }}</span>
        <span class="cat-count">{{ cat.children.length }}</span>
        <i class="el-icon-arrow-right cat-arrow"></i>
      </div>
    </div>
  </div>
</template>

<script>
import { toolCategories } from '@/config/tools'
import { getItem } from '@/utils/db'

// 首页：宣传位（OmniBuddy 主推）+ 核心功能入口 + 工具集紧凑网格
export default {
  name: 'Home',
  data() {
    return {
      toolCategories,
      now: new Date(),
      timer: null,
      todayPending: 0,
      favToolCount: 0,
      favSiteCount: 0
    }
  },
  computed: {
    greeting() {
      const h = this.now.getHours()
      if (h >= 5 && h < 11) return '早上好'
      if (h >= 11 && h < 13) return '中午好'
      if (h >= 13 && h < 18) return '下午好'
      if (h >= 18 && h < 23) return '晚上好'
      return '夜深了'
    },
    dateStr() {
      const d = this.now
      const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
      return `${d.getMonth() + 1}月${d.getDate()}日 星期${week}`
    },
    hourMin() {
      const d = this.now
      const pad = n => String(n).padStart(2, '0')
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`
    },
    seconds() {
      return this.now.getSeconds()
    },
    secStr() {
      return String(this.seconds).padStart(2, '0')
    },
    totalTools() {
      return this.toolCategories.reduce((sum, c) => sum + c.children.length, 0)
    },
    todayKey() {
      const d = this.now
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
  },
  mounted() {
    this.timer = setInterval(() => {
      this.now = new Date()
    }, 1000)
    this.loadQuickStats()
  },
  beforeDestroy() {
    if (this.timer) clearInterval(this.timer)
  },
  methods: {
    // 核心入口统计：今日待办数 / 收藏数
    loadQuickStats() {
      const todos = getItem('todoItems', [])
      if (Array.isArray(todos)) {
        this.todayPending = todos.filter(t => !t.done && t.date === this.todayKey).length
      }
      const favTools = getItem('toolFavorites', [])
      this.favToolCount = Array.isArray(favTools) ? favTools.length : 0
      const sites = getItem('siteFavorites', [])
      this.favSiteCount = Array.isArray(sites) ? sites.length : 0
    },
    goBuddy() {
      this.$router.push('/omnibuddy')
    }
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
  background: rgba(255, 255, 255, 0.18);
  border: 1px solid rgba(255, 255, 255, 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .buddy-banner-svg {
    width: 28px;
    height: 28px;
    color: #fff;
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
      color: var(--primary-color, #3366FF);
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
  background: linear-gradient(135deg, #F5222D, #CF1322);
}

.qc-fav {
  background: linear-gradient(135deg, #FA8C16, #D46B08);
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
  cursor: pointer;
  transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-1px);
    border-color: rgba(var(--primary-color-rgb), 0.35);
    box-shadow: $shadow-sm;

    .cat-arrow {
      opacity: 1;
      transform: translateX(2px);
      color: var(--primary-color, #3366FF);
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
