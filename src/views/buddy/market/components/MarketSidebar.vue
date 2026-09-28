<template>
  <!-- 左侧垂直边栏：一级类型 + 二级主题分类（Chrome Web Store 式） -->
  <aside class="ob-market-aside">
    <nav class="ob-market-nav">
      <!-- 一级：类型 -->
      <div class="ob-nav-group-label">类型</div>
      <a
        v-for="c in categories"
        :key="'t-' + c.value"
        class="ob-nav-item"
        :class="{ active: !categoryFilter && typeFilter === c.value }"
        @click="$emit('select-type', c.value)"
      >
        <svg-icon :icon-class="c.value ? typeIcon(c.value) : 'market'" class="nav-icon" />
        <span class="nav-text">{{ c.label }}</span>
        <span class="nav-count">{{ c.count }}</span>
      </a>

      <!-- 二级：主题分类（数据驱动，索引未下发时整组隐藏） -->
      <template v-if="categoryChips.length > 1">
        <div class="ob-nav-divider"></div>
        <div class="ob-nav-group-label">主题</div>
        <a
          v-for="c in categoryChips"
          :key="'c-' + c.value"
          class="ob-nav-item"
          :class="{ active: !typeFilter && categoryFilter === c.value }"
          @click="$emit('select-category', c.value)"
        >
          <span class="nav-dot"></span>
          <span class="nav-text">{{ c.label }}</span>
          <span class="nav-count">{{ c.count }}</span>
        </a>
      </template>
    </nav>
  </aside>
</template>

<script>
// 市场左侧分类边栏（纯展示组件）：选中态与筛选互斥逻辑由页面通过 props/events 驱动
export default {
  name: 'MarketSidebar',
  props: {
    // 一级类型清单（含“全部”），页面 computed categories
    categories: { type: Array, default: () => [] },
    // 二级主题清单（含“全部主题”），页面 computed categoryChips
    categoryChips: { type: Array, default: () => [] },
    // 当前选中的一级类型（空 = 全部）
    typeFilter: { type: String, default: '' },
    // 当前选中的二级主题（空 = 全部主题）
    categoryFilter: { type: String, default: '' }
  },
  methods: {
    // 类型 → 图标名（与页面原实现保持一致）
    typeIcon(type) {
      if (type === 'connector' || type === 'mcp') return 'mcp'
      if (type === 'agent') return 'subagent'
      return 'skill'
    }
  }
}
</script>

<style lang="scss" scoped>
/* 左侧分类栏：随滚动吸附固定（sticky）——不跟随内容下滑。
   aside 不参与父容器 stretch（align-self:flex-start）+ 自身不定高，
   sticky 以滚动容器 .ob-page-body 为参照吸附在其可视顶部 */
.ob-market-aside {
  width: 168px;
  flex-shrink: 0;
  align-self: flex-start;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
}

/* 卡片本体：分类较多超出视口高度时自身滚动（max-height 防止撑破 sticky） */
.ob-market-nav {
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 8px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
  border-radius: $radius-lg;

  &::-webkit-scrollbar {
    width: 4px;
  }
}

.ob-nav-group-label {
  padding: 10px 10px 5px 10px;
  font-size: 11px;
  font-weight: 600;
  color: $text-secondary;
  letter-spacing: 0.05em;
}

.ob-nav-divider {
  height: 1px;
  margin: 8px 10px;
  background: var(--border-color, rgba(0, 0, 0, 0.06));
}

.ob-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  font-size: 12.5px;
  color: $text-secondary;
  border-radius: 8px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;

  .nav-icon {
    font-size: 14px;
    flex-shrink: 0;
  }

  .nav-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--border-color, rgba(0, 0, 0, 0.2));
    flex-shrink: 0;
    margin: 0 4px;
    transition: background 0.15s ease;
  }

  .nav-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .nav-count {
    font-size: 10.5px;
    color: $text-secondary;
    opacity: 0.75;
  }

  &:hover {
    color: $text-primary;
    background: var(--bg-hover, rgba(0, 0, 0, 0.04));
  }

  &.active {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb, 91, 124, 240), 0.09);
    font-weight: 600;

    .nav-dot {
      background: var(--primary-color);
    }

    .nav-count {
      opacity: 1;
      color: var(--primary-color);
    }
  }
}
</style>
