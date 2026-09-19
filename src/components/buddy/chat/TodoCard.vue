<template>
  <!-- todo 任务清单卡片 -->
  <div class="ob-todo-card">
    <div class="ob-todo-title"><svg-icon icon-class="todo" /> 任务清单</div>
    <div
      v-for="(t, ti) in todos"
      :key="ti"
      class="ob-todo-item"
      :class="t.status"
    >
      <svg-icon :icon-class="todoIcon(t.status)" />
      <span class="ob-todo-text">{{ t.content }}</span>
      <span v-if="t.status === 'in_progress'" class="ob-todo-tag">进行中</span>
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
    }
  },
  methods: {
    todoIcon(status) {
      return {
        pending: 'clock',
        in_progress: 'loading',
        completed: 'check'
      }[status] || 'clock'
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-todo-card {
  margin-left: 40px;
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
  margin-bottom: 8px;

  .svg-icon {
    color: var(--primary-color);
    font-size: 13px;
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
