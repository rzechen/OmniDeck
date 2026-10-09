<template>
  <!-- 任务 TOP5 榜单面板（按成本/用量）；已删除任务显示账本快照名 + 已删除标识 -->
  <div class="ob-panel">
    <div class="ob-panel-title">任务 TOP5（按成本/用量）</div>
    <div class="ob-top-list">
      <div v-if="!sessions.length" class="ob-empty">暂无数据</div>
      <div v-for="(s, i) in sessions" :key="s.id" class="ob-top-item">
        <span class="ob-top-rank" :class="'rank-' + (i + 1)">{{ i + 1 }}</span>
        <span class="ob-top-title" :title="s.title">{{ s.title }}</span>
        <span v-if="s.deleted" class="ob-top-deleted">已删除</span>
        <span class="ob-top-tokens">{{ fmtTokens(s.input + s.output) }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 任务用量 TOP5 榜单：纯展示，榜单数据由页面 summary.top5 传入
defineOptions({ name: 'TopSessions' })

defineProps({
  // TOP 任务数组（[{ id, title, deleted, input, output }]，deleted = 任务已删除）
  sessions: {
    type: Array,
    default: () => []
  }
})

function fmtTokens(n) {
  const v = Number(n) || 0
  if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return (v / 1e3).toFixed(1) + 'k'
  return String(v)
}
</script>

<style lang="scss" scoped>
.ob-panel {
  background: $card-bg;
  border: 1px solid $border-color;
  border-radius: 12px;
  padding: 14px 16px;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ob-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  margin-bottom: 8px;
}

.ob-top-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding-top: 4px;
  flex: 1;
  min-height: 0;
}

/* 空状态占满列表剩余空间垂直居中 */
.ob-empty {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: $text-secondary;
}

.ob-top-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  font-size: 13px;

  &:hover {
    background: $sidebar-item-hover;
  }
}

.ob-top-rank {
  width: 20px;
  height: 20px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
  font-weight: 700;
  color: $text-secondary;
  background: $sidebar-item-hover;
  flex-shrink: 0;

  &.rank-1 {
    color: #fff;
    background: linear-gradient(135deg, #f7ba2a, #f5a623);
  }

  &.rank-2 {
    color: #fff;
    background: linear-gradient(135deg, #b9bcc4, #909399);
  }

  &.rank-3 {
    color: #fff;
    background: linear-gradient(135deg, #e08d5c, #c8764a);
  }
}

.ob-top-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: $text-primary;
}

/* 已删除标识：置灰胶囊（快照名仍展示，仅提示状态） */
.ob-top-deleted {
  flex-shrink: 0;
  font-size: 10px;
  line-height: 16px;
  padding: 0 6px;
  border-radius: 999px;
  color: $text-secondary;
  background: $sidebar-item-hover;
}

.ob-top-tokens {
  font-size: 12px;
  color: $text-secondary;
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;
}
</style>
