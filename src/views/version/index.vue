<template>
  <div class="version-page page-container">
    <!-- Hero：主题色渐变横幅 -->
    <div class="version-hero">
      <div class="hero-logo-wrap">
        <img src="@/assets/logo.png" alt="OmniDeck" class="hero-logo" />
      </div>
      <div class="hero-info">
        <div class="hero-name">
          OmniDeck
          <span class="hero-badge">v{{ appVersion }}</span>
        </div>
        <p class="hero-slogan">全能桌面，智驭未来 · Your All-in-One AI-Powered Desktop Toolkit</p>
      </div>
    </div>

    <!-- 更新记录：时间线 -->
    <div class="changelog-section">
      <div class="section-header">
        <span class="section-title">更新记录</span>
        <span class="section-count">{{ changelog.length }} 个版本</span>
      </div>

      <div class="timeline">
        <div
          v-for="(log, i) in changelog"
          :key="log.version"
          class="timeline-item"
          :class="{ 'is-latest': i === 0 }"
        >
          <!-- 左侧轨道：竖线 + 节点 -->
          <div class="tl-rail">
            <span class="tl-dot"></span>
          </div>

          <!-- 右侧内容 -->
          <div class="tl-card">
            <div class="tl-head">
              <span class="tl-version">v{{ log.version }}</span>
              <span v-if="i === 0" class="tl-badge">当前版本</span>
              <span class="tl-date">{{ log.date }}</span>
            </div>
            <ul class="tl-notes">
              <li v-for="(note, j) in log.notes" :key="j">{{ note }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { appVersion, changelog } from '@/config/app'

export default {
  name: 'Version',
  data() {
    return {
      appVersion,
      changelog
    }
  }
}
</script>

<style lang="scss" scoped>
.version-page {
  height: 100%;
}

/* ============ Hero ============ */
.version-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: $radius-lg;
  border: 1px solid rgba(var(--primary-color-rgb), 0.2);
  background: linear-gradient(
    115deg,
    rgba(var(--primary-color-rgb), 0.14) 0%,
    rgba(var(--primary-color-rgb), 0.05) 60%,
    transparent 100%
  );
  margin-bottom: 18px;
  flex-shrink: 0;
}

.hero-logo-wrap {
  width: 56px;
  height: 56px;
  border-radius: $radius-base;
  background: var(--card-bg);
  box-shadow: $shadow-base;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .hero-logo {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }
}

.hero-info {
  flex: 1;
  min-width: 0;

  .hero-name {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 21px;
    font-weight: 700;
    color: $text-primary;
    letter-spacing: 0.3px;
  }

  .hero-badge {
    font-size: 12px;
    font-weight: 600;
    font-family: 'SF Mono', Menlo, monospace;
    color: $primary-color;
    background: rgba(var(--primary-color-rgb), 0.12);
    border: 1px solid rgba(var(--primary-color-rgb), 0.25);
    padding: 1px 9px;
    border-radius: 999px;
    line-height: 1.6;
  }

  .hero-slogan {
    margin-top: 5px;
    font-size: 12px;
    color: $text-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* ============ 更新记录 ============ */
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  .section-count {
    font-size: 12px;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
  }
}

/* 时间线 */
.timeline {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  gap: 14px;

  /* 左侧轨道 */
  .tl-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 14px;
    flex-shrink: 0;

    .tl-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-top: 5px;
      background: var(--border-color);
      box-shadow: 0 0 0 3px var(--card-bg);
      flex-shrink: 0;
    }

    /* 节点下方的连接线 */
    &::after {
      content: '';
      flex: 1;
      width: 2px;
      margin-top: 4px;
      background: var(--border-color);
    }
  }

  &:last-child .tl-rail::after {
    display: none;
  }

  /* 最新版本节点高亮 */
  &.is-latest .tl-dot {
    background: $primary-color;
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.18);
  }
}

/* 右侧版本卡片 */
.tl-card {
  flex: 1;
  min-width: 0;
  background: $card-bg;
  border: 1px solid transparent;
  border-radius: $radius-base;
  padding: 12px 16px;
  margin-bottom: 12px;
  transition: box-shadow 0.18s ease, border-color 0.18s ease;

  &:hover {
    box-shadow: $shadow-base;
    border-color: rgba(var(--primary-color-rgb), 0.2);
  }

  .tl-head {
    display: flex;
    align-items: center;
    gap: 10px;

    .tl-version {
      font-size: 14px;
      font-weight: 700;
      color: $text-primary;
      font-family: 'SF Mono', Menlo, monospace;
    }

    .tl-badge {
      font-size: 11px;
      font-weight: 600;
      color: $primary-color;
      background: rgba(var(--primary-color-rgb), 0.1);
      padding: 1px 8px;
      border-radius: 999px;
    }

    .tl-date {
      margin-left: auto;
      font-size: 12px;
      color: $text-secondary;
      font-variant-numeric: tabular-nums;
    }
  }

  .tl-notes {
    list-style: none;
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;

    li {
      position: relative;
      padding-left: 14px;
      font-size: 13px;
      color: $text-secondary;
      line-height: 1.5;

      &::before {
        content: '';
        position: absolute;
        left: 2px;
        top: 8px;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: rgba(var(--primary-color-rgb), 0.5);
      }
    }
  }
}
</style>
