<template>
  <!-- 空间页头部：空间信息 + 工具栏（搜索 / 视图切换 / 隐藏项 / 新建 / 导入 / 刷新） -->
  <header class="sp-head">
    <div class="sp-space">
      <span class="sp-space-icon"><svg-icon :icon-class="space.icon || 'star'" class="sp-space-svg" /></span>
      <div class="sp-space-info">
        <div class="sp-space-name">
          {{ space.name }}
          <span class="sp-space-count">{{ count }} 项</span>
        </div>
        <div class="sp-space-dir" :title="space.dir">{{ space.dir }}</div>
      </div>
    </div>

    <div class="sp-toolbar">
      <el-input
        :value="search"
        size="mini"
        class="sp-search"
        placeholder="搜索当前目录"
        @input="$emit('update:search', $event)"
      >
        <svg-icon slot="prefix" icon-class="search" class="sp-search-prefix" />
        <svg-icon
          v-if="search"
          slot="suffix"
          icon-class="circle_close"
          class="sp-search-clear"
          title="清空搜索"
          @mousedown.prevent
          @click="$emit('update:search', '')"
        />
      </el-input>
      <div class="sp-seg">
        <button
          class="sp-seg-btn"
          :class="{ on: view === 'grid' }"
          title="网格视图"
          @click="$emit('update:view', 'grid')"
        ><svg-icon icon-class="menu" /></button>
        <button
          class="sp-seg-btn"
          :class="{ on: view === 'list' }"
          title="列表视图"
          @click="$emit('update:view', 'list')"
        ><svg-icon icon-class="tickets" /></button>
      </div>
      <button
        class="sp-tool-btn"
        :class="{ on: showHidden }"
        title="显示隐藏文件 / 目录"
        @click="$emit('update:show-hidden', !showHidden)"
      ><svg-icon icon-class="view" /><span>隐藏项</span></button>
      <div class="sp-divider"></div>
      <button class="sp-tool-btn" title="新建文件夹" @click="$emit('create-folder')"><svg-icon icon-class="folder-add" /><span>文件夹</span></button>
      <button class="sp-tool-btn" title="新建文件" @click="$emit('create-file')"><svg-icon icon-class="document-add" /><span>文件</span></button>
      <button class="sp-tool-btn" title="从本机导入文件" @click="$emit('import')"><svg-icon icon-class="upload" /><span>导入</span></button>
      <button class="sp-icon-btn" title="刷新" @click="$emit('refresh')">
        <svg-icon icon-class="refresh-left" :class="{ spinning: loading }" />
      </button>
    </div>
  </header>
</template>

<script>
// 空间页头部工具栏（受控组件：view/showHidden/search 走 update 事件）
export default {
  name: 'SpaceToolbar',
  props: {
    // 当前空间（含 name/dir/icon）
    space: {
      type: Object,
      required: true
    },
    // 当前目录可见条目数
    count: {
      type: Number,
      default: 0
    },
    view: {
      type: String,
      default: 'grid'
    },
    showHidden: {
      type: Boolean,
      default: false
    },
    search: {
      type: String,
      default: ''
    },
    loading: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style lang="scss" scoped>
.sp-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 14px 20px 10px;
  flex-wrap: wrap;
}

.sp-space {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sp-space-icon {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.16), rgba(var(--primary-color-rgb), 0.05));
  border: 1px solid rgba(var(--primary-color-rgb), 0.28);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .sp-space-svg {
    width: 18px;
    height: 18px;
    color: var(--primary-color);
  }
}

.sp-space-info {
  min-width: 0;
}

.sp-space-name {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  line-height: 1.3;
}

.sp-space-count {
  font-size: 10.5px;
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--search-bg);
  border-radius: 999px;
  padding: 1px 8px;
}

.sp-space-dir {
  font-size: 11px;
  color: var(--text-secondary);
  white-space: normal;
  word-break: break-all;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

.sp-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.sp-search {
  width: 170px;

  ::v-deep .el-input__inner {
    border-radius: 8px;
    background: var(--search-bg);
    padding-right: 24px;
  }

  /* prefix 插槽：svg 搜索图标（替代原 prefix-icon 字体图标） */
  ::v-deep .el-input__prefix {
    display: flex;
    align-items: center;
    left: 8px;
    color: var(--text-secondary);

    .sp-search-prefix {
      font-size: 13px;
    }
  }

  /* suffix 插槽：svg 清除按钮（替代原 clearable 字体图标） */
  ::v-deep .el-input__suffix {
    display: flex;
    align-items: center;
    right: 8px;
    color: var(--text-secondary);

    .sp-search-clear {
      font-size: 12px;
      cursor: pointer;
      transition: color 0.15s ease;

      &:hover {
        color: var(--text-primary);
      }
    }
  }
}

/* 视图切换分段控件 */
.sp-seg {
  display: inline-flex;
  padding: 2px;
  gap: 2px;
  border-radius: 9px;
  background: var(--search-bg);
}

.sp-seg-btn {
  width: 26px;
  height: 24px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 13px;
  }

  &:hover {
    color: var(--text-primary);
  }

  &.on {
    background: var(--card-bg, #fff);
    color: var(--primary-color);
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  }
}

/* 工具按钮 */
.sp-tool-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg, #fff);
  color: var(--text-primary);
  font-size: 11.5px;
  cursor: pointer;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 13px;
    color: var(--text-secondary);
    transition: color 0.15s ease;
  }

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);

    .svg-icon {
      color: var(--primary-color);
    }
  }

  &.on {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    background: rgba(var(--primary-color-rgb), 0.08);
    color: var(--primary-color);

    .svg-icon {
      color: var(--primary-color);
    }
  }
}

.sp-icon-btn {
  width: 26px;
  height: 26px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--card-bg, #fff);
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 13px;
  }

  &:hover {
    color: var(--primary-color);
    border-color: rgba(var(--primary-color-rgb), 0.5);
  }
}

/* 刷新图标旋转（loading 时） */
.svg-icon.spinning {
  animation: sp-rotate 0.8s linear infinite;
}

@keyframes sp-rotate {
  to { transform: rotate(360deg); }
}

.sp-divider {
  width: 1px;
  height: 16px;
  background: var(--border-color);
  margin: 0 2px;
}
</style>
