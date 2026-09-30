<template>
  <div class="tool-page">
    <!-- 页头：返回 + 工具标识 + 操作栏 -->
    <header class="tool-header">
      <div class="header-main">
        <button v-if="backPath" class="back-btn" title="返回" @click="goBack">
          <svg-icon icon-class="arrow-left" />
        </button>
        <div class="tool-icon" :style="iconStyle">
          <svg-icon :icon-class="icon" class="icon-svg" />
        </div>
        <div class="tool-meta">
          <h2 class="tool-name">{{ title }}</h2>
          <p class="tool-desc">{{ desc }}</p>
        </div>
      </div>
      <div class="header-actions">
        <slot name="toolbar" />
      </div>
    </header>

    <!-- 内容区：撑满剩余高度 -->
    <main class="tool-body">
      <slot />
    </main>

    <!-- 状态栏：校验状态 / 统计信息 -->
    <footer v-if="$slots.status" class="tool-status">
      <slot name="status" />
    </footer>
  </div>
</template>

<script>
// 工具页通用外壳：统一页头（返回 + 标识 + 操作栏）、内容区与状态栏
// 工具栏按钮 / 分段控件 / 分栏面板的全局样式类（tool-btn / tool-seg / split-pane）
// 也由本组件的非 scoped 样式统一提供，供各工具页插槽内容直接使用
export default {
  name: 'ToolShell',
  props: {
    title: { type: String, required: true },
    desc: { type: String, default: '' },
    icon: { type: String, default: '' },
    color: { type: String, default: '#3366FF' },
    backPath: { type: String, default: '' }
  },
  computed: {
    iconStyle() {
      return {
        background: this.color + '1A',
        color: this.color
      }
    }
  },
  methods: {
    goBack() {
      if (this.backPath) {
        this.$router.push(this.backPath)
      } else {
        this.$router.back()
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.tool-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 14px 16px;
  overflow: hidden;
  -webkit-app-region: no-drag;
}

/* ============ 页头 ============ */
.tool-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  margin-bottom: 12px;
  flex-shrink: 0;
  flex-wrap: wrap;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.back-btn {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.16s ease;
  -webkit-app-region: no-drag;

  i {
    font-size: 14px;
  }

  &:hover {
    color: var(--primary-color);
    border-color: rgba(var(--primary-color-rgb), 0.5);
    transform: translateX(-1px);
  }

  &:active {
    transform: translateX(-1px) scale(0.92);
  }
}

.tool-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .icon-svg {
    width: 20px;
    height: 20px;
  }
}

.tool-meta {
  min-width: 0;

  .tool-name {
    font-size: 16px;
    font-weight: 700;
    color: var(--text-primary);
    line-height: 1.2;
  }

  .tool-desc {
    margin-top: 2px;
    font-size: 11.5px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 44vw;
  }
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  justify-content: flex-end;
  // 换行独占一行时依然靠右；允许收缩使内部 wrap 生效，避免工具栏溢出
  margin-left: auto;
  min-width: 0;
}

/* ============ 内容区与状态栏 ============ */
.tool-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

.tool-status {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 7px 4px 0;
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  flex-shrink: 0;

  /* 状态点 */
  .status-dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--success-color);
    flex-shrink: 0;

    &.is-bad {
      background: var(--danger-color);
    }
  }

  .status-err {
    color: var(--danger-color);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .status-right {
    margin-left: auto;
  }
}
</style>

<style lang="scss">
/* ============ 工具页全局工具类（插槽内容属于父作用域，需全局定义） ============ */

/* Mac 胶囊按钮 */
.tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 12px;
  border-radius: 14px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  color: var(--text-primary);
  font-size: 12px;
  font-weight: 500;
  line-height: 1;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  transition: all 0.16s ease;
  -webkit-app-region: no-drag;

  i {
    font-size: 13px;
  }

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.05);
  }

  &:active {
    transform: scale(0.95);
  }

  &.is-primary {
    background: var(--primary-color);
    border-color: var(--primary-color);
    color: #fff;

    &:hover {
      background: var(--primary-color-hover);
      border-color: var(--primary-color-hover);
      color: #fff;
    }
  }

  &.is-danger {
    &:hover {
      color: var(--danger-color);
      border-color: rgba(var(--danger-color-rgb),  0.5);
      background: rgba(var(--danger-color-rgb),  0.06);
    }
  }

  &[disabled],
  &.is-disabled {
    opacity: 0.45;
    pointer-events: none;
  }
}

/* macOS 分段控件 */
.tool-seg {
  display: inline-flex;
  align-items: center;
  padding: 2px;
  gap: 2px;
  background: var(--search-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;

  .tool-seg-item {
    height: 22px;
    padding: 0 12px;
    line-height: 22px;
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
    border-radius: 7px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.16s ease;
    -webkit-app-region: no-drag;

    &:hover {
      color: var(--text-primary);
    }

    &.active {
      background: var(--card-bg);
      color: var(--primary-color);
      box-shadow: var(--shadow-sm);
    }
  }
}

/* 分栏面板（左右 / 上下） */
.split-pane {
  display: flex;
  gap: 10px;
  flex: 1;
  min-width: 0;
  min-height: 0;

  &.is-vertical {
    flex-direction: column;
  }

  .pane {
    flex: 1;
    min-width: 0;
    min-height: 0;
    display: flex;
    flex-direction: column;
    background: var(--card-bg);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: var(--shadow-sm);
  }

  .pane-header {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 8px 12px;
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary);
    border-bottom: 1px solid var(--border-color);
    flex-shrink: 0;

    /* Mac 红绿灯风格状态点 */
    .pane-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      flex-shrink: 0;

      &.is-input {
        background: var(--primary-color);
      }

      &.is-output {
        background: var(--success-color);
      }
    }

    .pane-title {
      flex: 1;
      min-width: 0;
    }
  }

  .pane-body {
    flex: 1;
    min-height: 0;
    position: relative;
    overflow: hidden;
  }
}

/* 工具页内嵌的 el-select（如下拉选择 SQL 方言）压缩高度，融入工具栏 */
.tool-select {
  .el-input__inner {
    height: 28px;
    line-height: 28px;
    border-radius: 14px;
    font-size: 12px;
    padding: 0 30px 0 12px;
  }

  .el-input__icon {
    line-height: 28px;
  }
}
</style>
