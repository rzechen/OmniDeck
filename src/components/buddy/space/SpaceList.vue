<template>
  <!-- 空间页列表视图：名称 / 大小 / 修改时间 -->
  <div class="sp-list">
    <div class="sp-list-head">
      <span class="col-name">名称</span>
      <span class="col-size">大小</span>
      <span class="col-time">修改时间</span>
      <span class="col-act"></span>
    </div>
    <div
      v-for="en in entries"
      :key="en.name"
      class="sp-row"
      :class="{ selected: selected.includes(en.name), hidden: en.hidden }"
      @click="$emit('select', en.name, $event)"
      @dblclick="$emit('open', en)"
      @contextmenu.prevent="$emit('menu', $event, en)"
    >
      <span class="col-name">
        <span class="sp-row-icon"><img :src="iconOf(en)" class="sp-row-img" alt="" /></span>
        <span class="sp-row-name" :title="en.name">{{ en.name }}</span>
      </span>
      <span class="col-size">{{ en.isDir ? '—' : formatSize(en.size) }}</span>
      <span class="col-time">{{ formatTime(en.mtime) }}</span>
      <span class="col-act">
        <svg-icon icon-class="more" title="更多操作" @click.stop="$emit('menu', $event, en)" />
      </span>
    </div>
  </div>
</template>

<script>
// 空间页列表视图
import { iconOf, formatSize, formatTime } from '@/utils/file-meta'

export default {
  name: 'SpaceList',
  props: {
    entries: {
      type: Array,
      default: () => []
    },
    // 当前选中项名集合（多选，高亮）
    selected: {
      type: Array,
      default: () => []
    }
  },
  methods: { iconOf, formatSize, formatTime }
}
</script>

<style lang="scss" scoped>
/* 简约列表：无卡片边框、无表头底色、无行分隔线（hover 浮现浅色圆角块） */
.sp-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.sp-list-head,
.sp-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 90px 150px 44px;
  align-items: center;
  gap: 10px;
  padding: 0 10px;
}

.sp-list-head {
  height: 28px;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
}

.sp-row {
  height: 40px;
  font-size: 12.5px;
  color: var(--text-primary);
  cursor: default;
  border-radius: 9px;
  transition: background 0.12s ease;

  &:hover {
    background: var(--search-bg);
  }

  &.selected {
    background: rgba(var(--primary-color-rgb), 0.07);
  }

  &.hidden {
    opacity: 0.55;
  }
}

.col-name {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
}

.sp-row-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .sp-row-img {
    width: 20px;
    height: 20px;
    object-fit: contain;
    -webkit-user-drag: none;
    user-select: none;
  }
}

.sp-row-name {
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.col-size,
.col-time {
  font-size: 11.5px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.col-act {
  display: flex;
  justify-content: flex-end;

  .svg-icon {
    font-size: 13px;
    color: var(--text-secondary);
    padding: 4px;
    border-radius: 6px;
    cursor: pointer;
    opacity: 0;
    transition: all 0.15s ease;
    transform: rotate(90deg);
  }
}

.sp-row:hover .col-act .svg-icon {
  opacity: 1;

  &:hover {
    background: rgba(0, 0, 0, 0.08);
    color: var(--text-primary);
  }
}
</style>
