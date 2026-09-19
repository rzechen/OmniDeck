<template>
  <!-- 空间页右键 / 更多操作菜单（mac 风浮层） -->
  <transition name="sp-menu">
    <div
      v-if="visible"
      class="sp-menu"
      :style="{ left: x + 'px', top: y + 'px' }"
    >
      <div class="sp-menu-item" @click="$emit('action', 'open')">
        <svg-icon :icon-class="isDir ? 'folder' : 'view'" />
        {{ isDir ? '打开' : (textable ? '预览 / 编辑' : '打开') }}
      </div>
      <div class="sp-menu-item" @click="$emit('action', 'reveal')">
        <svg-icon icon-class="monitor" /> 在访达中显示
      </div>
      <div class="sp-menu-sep"></div>
      <div class="sp-menu-item" @click="$emit('action', 'rename')">
        <svg-icon icon-class="edit" /> 重命名
      </div>
      <div class="sp-menu-item danger" @click="$emit('action', 'trash')">
        <svg-icon icon-class="delete" /> 移到废纸篓
      </div>
    </div>
  </transition>
</template>

<script>
// 空间页右键菜单（定位/显隐由父组件控制，动作以事件上抛）
import { isTextEntry } from '@/utils/file-meta'

export default {
  name: 'SpaceContextMenu',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    x: {
      type: Number,
      default: 0
    },
    y: {
      type: Number,
      default: 0
    },
    // 目标条目
    item: {
      type: Object,
      default: null
    }
  },
  computed: {
    isDir() {
      return !!(this.item && this.item.isDir)
    },
    // 文本文件显示「预览 / 编辑」入口
    textable() {
      return !!this.item && isTextEntry(this.item)
    }
  }
}
</script>

<style lang="scss" scoped>
.sp-menu {
  position: fixed;
  z-index: 3200;
  min-width: 172px;
  padding: 5px;
  border-radius: 11px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.16), 0 2px 8px rgba(0, 0, 0, 0.06);
}

html[data-theme='dark'] .sp-menu {
  background: rgba(46, 46, 52, 0.94);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24);
}

.sp-menu-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 30px;
  padding: 4px 9px;
  border-radius: 7px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: background 0.12s ease;

  .svg-icon {
    font-size: 13px;
    color: var(--text-secondary);
  }

  &:hover {
    background: var(--search-bg-hover);

    .svg-icon {
      color: var(--primary-color);
    }
  }

  &.danger {
    color: #F5222D;

    .svg-icon {
      color: #F5222D;
    }

    &:hover {
      background: rgba(245, 34, 45, 0.08);

      .svg-icon {
        color: #F5222D;
      }
    }
  }
}

.sp-menu-sep {
  height: 1px;
  margin: 4px 6px;
  background: var(--border-color);
}

/* 菜单弹出过渡 */
.sp-menu-enter-active {
  transition: opacity 0.14s ease, transform 0.14s cubic-bezier(0.34, 1.2, 0.64, 1);
}

.sp-menu-leave-active {
  transition: opacity 0.1s ease;
}

.sp-menu-enter,
.sp-menu-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
