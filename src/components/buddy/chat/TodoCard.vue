<template>
  <!-- todo 任务清单卡片（宽度与输入框同宽：负 margin 抵消消息列 padding；可展开收起，默认展开） -->
  <div class="ob-todo-card">
    <!-- 标题行（可点击折叠/展开）：图标 + 任务清单 + 进度摘要 + 箭头 -->
    <div class="ob-todo-title" @click="collapsed = !collapsed">
      <svg-icon icon-class="todo" />
      <span class="ob-todo-title-text">任务清单</span>
      <span v-if="summaryText" class="ob-todo-summary">{{ summaryText }}</span>
      <svg-icon icon-class="arrow-down" class="ob-todo-arrow" :class="{ collapsed }" />
    </div>
    <div v-show="!collapsed">
      <div
        v-for="(t, ti) in todos"
        :key="ti"
        class="ob-todo-item"
        :class="displayStatus(t)"
      >
        <svg-icon :icon-class="todoIcon(t)" />
        <span class="ob-todo-text">{{ t.content }}</span>
        <span v-if="t.status === 'in_progress' && streaming" class="ob-todo-tag">进行中</span>
      </div>
    </div>
  </div>
</template>

<script>
// OmniBuddy 任务清单卡片（Agent 执行计划实时展示）
export default {
  name: 'TodoCard',
  props: {
    todos: {
      type: Array,
      default: () => []
    },
    // 会话是否流式进行中：结束后 in_progress 不再转圈（停止/完成都视为结束）
    streaming: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      // 默认展开；用户可点击标题收起/展开
      collapsed: false
    }
  },
  computed: {
    // 进度摘要：已完成 x / 总数 y
    summaryText() {
      if (!this.todos.length) return ''
      const done = this.todos.filter(t => t.status === 'completed').length
      return done + '/' + this.todos.length
    }
  },
  methods: {
    // 展示状态：会话已结束（非流式）时 in_progress 回落为 pending（不转圈、不带标签）
    displayStatus(t) {
      return t.status === 'in_progress' && !this.streaming ? 'pending' : t.status
    },
    todoIcon(t) {
      const map = {
        pending: 'clock',
        in_progress: 'loading',
        completed: 'check'
      }
      return map[this.displayStatus(t)] || 'clock'
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-todo-card {
  // 与输入框同宽：负 margin 抵消消息列 28px 水平 padding（消息列 max-width 920 与输入框一致）
  margin: 0 -28px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg, #fff);
  padding: 10px 14px;
}

.ob-todo-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  border-radius: 6px;
  margin: -2px -4px 8px;
  padding: 2px 4px;
  transition: background 0.15s ease;

  &:hover {
    background: var(--search-bg-hover, rgba(0, 0, 0, 0.04));
  }

  .svg-icon {
    color: var(--primary-color);
    font-size: 13px;
  }
}

.ob-todo-title-text {
  flex-shrink: 0;
}

.ob-todo-summary {
  font-size: 10.5px;
  font-weight: 600;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: var(--text-secondary);
  background: rgba(0, 0, 0, 0.04);
  border-radius: 999px;
  padding: 1px 7px;
}

.ob-todo-arrow {
  margin-left: auto;
  font-size: 12px;
  color: var(--text-secondary);
  transition: transform 0.18s ease;

  &.collapsed {
    transform: rotate(-90deg);
  }
}

.ob-todo-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 0;
  font-size: 12.5px;

  > .svg-icon {
    font-size: 13px;
    flex-shrink: 0;
  }

  &.pending {
    color: var(--text-secondary);
    > .svg-icon { color: var(--text-secondary); }
  }

  &.in_progress {
    color: var(--primary-color);
    font-weight: 600;

    > .svg-icon {
      color: var(--primary-color);
      animation: ob-spin 0.9s linear infinite;
    }
  }

  &.completed {
    color: var(--text-secondary);
    text-decoration: line-through;

    > .svg-icon { color: #67C23A; }
  }
}

@keyframes ob-spin {
  to { transform: rotate(360deg); }
}

.ob-todo-text {
  flex: 1;
  min-width: 0;
}

.ob-todo-tag {
  font-size: 10.5px;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  border-radius: 999px;
  padding: 1px 8px;
}
</style>
