<template>
  <!-- 空间页网格视图：文件夹/文件卡片 -->
  <div class="sp-grid">
    <div
      v-for="en in entries"
      :key="en.name"
      class="sp-card"
      :class="{ selected: selected.includes(en.name), hidden: en.hidden }"
      :title="en.name + (en.isDir ? '' : ' · ' + formatSize(en.size)) + ' · ' + formatTime(en.mtime)"
      @click="$emit('select', en.name, $event)"
      @dblclick="$emit('open', en)"
      @contextmenu.prevent="$emit('menu', $event, en)"
    >
      <div class="sp-card-icon">
        <img :src="iconOf(en)" class="sp-card-img" alt="" />
        <span v-if="en.hidden" class="sp-card-dot" title="隐藏项目"></span>
      </div>
      <div class="sp-card-name">{{ en.name }}</div>
      <button class="sp-card-more" title="更多操作" @click.stop="$emit('menu', $event, en)">
        <svg-icon icon-class="more" />
      </button>
    </div>
  </div>
</template>

<script>
// 空间页网格视图
import { iconOf, formatSize, formatTime } from '@/utils/file-meta'

export default {
  name: 'SpaceGrid',
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
.sp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
  gap: 8px;
}

.sp-card {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 14px 8px 10px;
  border-radius: 12px;
  border: 1px solid transparent;
  cursor: default;
  transition: all 0.15s ease;

  &:hover {
    background: var(--search-bg);

    .sp-card-more {
      opacity: 1;
    }
  }

  &.selected {
    background: rgba(var(--primary-color-rgb), 0.08);
    border-color: rgba(var(--primary-color-rgb), 0.35);
  }

  &.hidden {
    opacity: 0.55;
  }
}

.sp-card-icon {
  position: relative;
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;

  .sp-card-img {
    width: 34px;
    height: 34px;
    object-fit: contain;
    // 拖拽预览时不显示原图
    -webkit-user-drag: none;
    user-select: none;
  }

  .sp-card-dot {
    position: absolute;
    right: 2px;
    top: 0;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--warning-color);
    border: 2px solid var(--card-bg, #fff);
  }
}

.sp-card-name {
  width: 100%;
  font-size: 11.5px;
  line-height: 1.4;
  color: var(--text-primary);
  text-align: center;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.sp-card-more {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  opacity: 0;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 13px;
    transform: rotate(90deg);
  }

  &:hover {
    background: rgba(0, 0, 0, 0.08);
    color: var(--text-primary);
  }
}
</style>
