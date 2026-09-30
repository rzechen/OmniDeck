<template>
  <div class="category-page page-container">
    <!-- 分类 Hero：以分类主色渲染的渐变横幅 -->
    <div class="category-hero" :style="heroStyle">
      <div class="hero-icon" :style="{ color: category.color }">
        <svg-icon :icon-class="category.iconSvg" class="hero-svg" />
      </div>
      <div class="hero-info">
        <h2 class="hero-title">{{ category.title }}工具</h2>
        <p class="hero-desc">{{ category.desc }}</p>
      </div>
      <div class="hero-stats">
        <div class="stat-num" :style="{ color: category.color }">{{ tools.length }}</div>
        <div class="stat-label">款工具</div>
      </div>
    </div>

    <!-- 工具区：筛选 + 网格 -->
    <div class="tools-section">
      <div class="section-header">
        <span class="section-title">全部工具</span>
        <div class="filter-box">
          <svg-icon icon-class="search" class-name="filter-icon" />
          <input
            v-model="keyword"
            placeholder="筛选工具..."
            @keydown.esc="keyword = ''"
          />
          <span v-if="keyword" class="filter-count">
            {{ filteredTools.length }}/{{ tools.length }}
          </span>
          <svg-icon v-if="keyword" icon-class="circle-close" class-name="filter-clear" title="清空 (Esc)"
            @click="keyword = ''" />
        </div>
      </div>

      <div class="tool-grid" :style="gridStyle" v-if="filteredTools.length">
        <div
          v-for="(tool, idx) in filteredTools"
          :key="tool.name"
          class="tool-tile stagger-item"
          :class="{ 'is-favorited': isFavorite(tool) }"
          :style="{ animationDelay: Math.min(idx, 17) * 30 + 'ms' }"
          :title="tool.desc"
          @click="$router.push(tool.path)"
        >
          <div class="tile-avatar" :style="avatarStyle">
            <svg-icon v-if="tool.icon" :icon-class="tool.icon" class="tile-svg" />
            <template v-else>{{ tool.name.charAt(0) }}</template>
          </div>
          <div class="tile-info">
            <div class="tile-name">{{ tool.name }}</div>
            <div class="tile-desc">{{ tool.desc }}</div>
          </div>
          <span
            class="tile-fav"
            :class="{ 'is-fav': isFavorite(tool) }"
            :title="isFavorite(tool) ? '取消收藏' : '收藏'"
            @click.stop="toggleFavorite(tool)"
          >
            <svg-icon :icon-class="(isFavorite(tool) ? 'star-on' : 'star-off')" />
          </span>
        </div>
      </div>

      <!-- 筛选无结果 -->
      <div v-else class="filter-empty">
        <svg-icon icon-class="search" class-name="empty-icon" />
        <p>没有找到与「{{ keyword }}」匹配的工具</p>
      </div>
    </div>
  </div>
</template>

<script>
import { setItem } from '@/utils/db'

export default {
  name: 'ToolCategory',
  props: {
    category: { type: Object, required: true }
  },
  data() {
    return {
      keyword: ''
    }
  },
  computed: {
    tools() {
      return this.category.children || []
    },
    filteredTools() {
      if (!this.keyword) return this.tools
      const q = this.keyword.toLowerCase()
      return this.tools.filter(
        t =>
          t.name.toLowerCase().includes(q) ||
          (t.desc || '').toLowerCase().includes(q)
      )
    },
    // 每行卡片数：全局设置（设置-通用），'auto' 按容器宽度自适应
    gridCols() {
      return this.$store.state.toolGridCols
    },
    // 网格列样式：固定列数时覆盖 auto-fill 布局
    gridStyle() {
      return typeof this.gridCols === 'number'
        ? { gridTemplateColumns: `repeat(${this.gridCols}, minmax(0, 1fr))` }
        : {}
    },
    color() {
      return this.category.color || '#3366FF'
    },
    // Hero 渐变背景：分类主色的低透明度渐变（明暗主题下均自然）
    heroStyle() {
      const c = this.color
      return {
        background: `linear-gradient(115deg, ${c}24 0%, ${c}0D 60%, transparent 100%)`,
        borderColor: `${c}33`
      }
    },
    // 字母头像：分类主色浅底 + 主色文字
    avatarStyle() {
      const c = this.color
      return {
        background: `${c}1A`,
        color: c
      }
    }
  },
  methods: {
    isFavorite(tool) {
      return this.$store.state.toolFavorites.includes(tool.path)
    },
    // 收藏/取消收藏：更新 store 并持久化到 IndexedDB
    toggleFavorite(tool) {
      this.$store.commit('TOGGLE_TOOL_FAVORITE', tool.path)
      setItem('toolFavorites', this.$store.state.toolFavorites)
      const fav = this.$store.state.toolFavorites.includes(tool.path)
      this.$message({
        message: fav ? `已收藏「${tool.name}」` : `已取消收藏「${tool.name}」`,
        type: 'success',
        duration: 1500
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.category-page {
  height: 100%;
}

/* ============ 分类 Hero ============ */
.category-hero {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 16px 20px;
  border-radius: $radius-lg;
  border: 1px solid transparent;
  margin-bottom: 14px;
  flex-shrink: 0;
}

.hero-icon {
  width: 46px;
  height: 46px;
  border-radius: $radius-base;
  background: var(--card-bg);
  box-shadow: $shadow-sm;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .hero-svg {
    width: 26px;
    height: 26px;
  }
}

.hero-info {
  flex: 1;
  min-width: 0;

  .hero-title {
    margin-top: 0;
    font-size: 20px;
    font-weight: 700;
    color: $text-primary;
  }

  .hero-desc {
    margin-top: 3px;
    font-size: 12px;
    color: $text-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

.hero-stats {
  text-align: right;
  flex-shrink: 0;

  .stat-num {
    font-size: 24px;
    font-weight: 700;
    line-height: 1.1;
    font-variant-numeric: tabular-nums;
  }

  .stat-label {
    margin-top: 2px;
    font-size: 11px;
    color: $text-secondary;
  }
}

/* ============ 工具区 ============ */
.tools-section {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }
}

/* 筛选框：Mac 胶囊风格，聚焦展开 + 主题色光环 */
.filter-box {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 212px;
  height: 30px;
  padding: 0 12px;
  background: $search-bg;
  border: 1px solid transparent;
  border-radius: 15px;
  transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  -webkit-app-region: no-drag;

  &:hover {
    background: $search-bg-hover;
  }

  &:focus-within {
    width: 248px;
    background: var(--card-bg);
    border-color: rgba(var(--primary-color-rgb), 0.45);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);

    .filter-icon {
      color: $primary-color;
    }
  }

  .filter-icon {
    font-size: 13px;
    color: $text-secondary;
    flex-shrink: 0;
    transition: color 0.18s ease;
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: $text-primary;

    &::placeholder {
      color: $text-secondary;
    }
  }

  /* 匹配计数：等宽字体小胶囊 */
  .filter-count {
    flex-shrink: 0;
    font-size: 11px;
    line-height: 1.5;
    color: $text-secondary;
    font-family: 'SF Mono', Menlo, monospace;
    font-variant-numeric: tabular-nums;
    background: $search-bg;
    padding: 1px 7px;
    border-radius: 8px;
  }

  .filter-clear {
    font-size: 13px;
    color: $text-secondary;
    cursor: pointer;
    flex-shrink: 0;
    border-radius: 50%;
    transition: all 0.15s ease;

    &:hover {
      color: $text-primary;
      transform: scale(1.12);
    }

    &:active {
      transform: scale(0.88);
    }
  }
}

/* 工具网格 */
.tool-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 8px;
}

.tool-tile {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  background: $card-bg;
  border-radius: $radius-base;
  border: 1px solid var(--border-color);
  box-shadow: $shadow-sm;
  cursor: pointer;
  -webkit-app-region: no-drag;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);

  &:hover {
    box-shadow: $shadow-base;
    border-color: rgba(var(--primary-color-rgb), 0.35);
    transform: translateY(-1px);
  }

  .tile-avatar {
    width: 30px;
    height: 30px;
    border-radius: $radius-sm;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    font-size: 14px;
    font-weight: 700;

    .tile-svg {
      width: 16px;
      height: 16px;
    }
  }

  .tile-info {
    flex: 1;
    min-width: 0;
    padding-right: 0;
    transition: padding-right 0.2s ease;
  }

  .tile-name {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tile-desc {
    margin-top: 2px;
    font-size: 11px;
    color: $text-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 收藏星标：绝对定位脱离文档流，不挤压文字 */
  .tile-fav {
    position: absolute;
    right: 8px;
    top: 50%;
    width: 26px;
    height: 26px;
    border-radius: $radius-sm;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    color: $text-secondary;
    opacity: 0;
    transform: translateY(-50%) scale(0.8);
    transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.4, 0, 0.2, 1), background 0.15s ease, color 0.15s ease;
    -webkit-app-region: no-drag;

    i {
      font-size: 16px;
    }

    &:hover {
      background: rgba(var(--primary-color-rgb), 0.1);
      color: $primary-color;
    }

    &.is-fav {
      opacity: 1;
      transform: translateY(-50%) scale(1);
      color: var(--warning-color);

      &:hover {
        color: #EC8C00;
      }
    }
  }

  /* 卡片 hover 或已收藏：星标显示 + 文字让出空间防遮挡 */
  &:hover .tile-fav,
  &.is-favorited .tile-fav {
    opacity: 1;
    transform: translateY(-50%) scale(1);
  }

  &:hover .tile-info,
  &.is-favorited .tile-info {
    padding-right: 30px;
  }
}

/* 筛选无结果 */
.filter-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 0;
  color: $text-secondary;

  .empty-icon {
    font-size: 36px;
    margin-bottom: 10px;
    opacity: 0.5;
  }

  p {
    font-size: 13px;
  }
}
</style>
