<template>
  <!-- 空间页头部 Hero 卡片（市场页同款渐变底）：空间信息（点击下拉切换）+ 工具栏 -->
  <header class="sp-head">
    <!-- 工作空间选择器：空间名 + 下拉箭头，浮层向下弹出 -->
    <div class="sp-ws-select" :class="{ open: wsOpen, single: workspaces.length <= 1 }">
      <div class="sp-space" :title="workspaces.length > 1 ? '点击切换工作空间' : space.dir" @click="toggleWs">
        <span class="sp-space-icon"><svg-icon :icon-class="space.icon || 'star'" class="sp-space-svg" /></span>
        <div class="sp-space-info">
          <div class="sp-space-name">
            <span class="sp-space-name-text">{{ space.name }}</span>
            <svg-icon v-if="workspaces.length > 1" icon-class="arrow-down" class="sp-space-arrow" />
            <span class="sp-space-count">{{ count }} 项</span>
          </div>
          <div class="sp-space-dir" :title="space.dir">{{ space.dir }}</div>
        </div>
      </div>

      <!-- 下拉浮层（mac 菜单风：毛玻璃 + 主题色对勾） -->
      <transition name="sp-ws-pop">
        <div v-if="wsOpen" class="sp-ws-pop">
          <div class="sp-ws-pop-head">切换工作空间</div>
          <div class="sp-ws-pop-list">
            <div
              v-for="it in workspaces"
              :key="it.value"
              class="sp-ws-pop-item"
              :class="{ active: it.value === activeId }"
              :title="it.title"
              @click="pickWorkspace(it.value)"
            >
              <svg-icon icon-class="folder" class="sp-ws-pop-ico" />
              <span class="sp-ws-pop-text">{{ it.label }}</span>
              <svg-icon v-if="it.value === activeId" icon-class="check" class="sp-ws-pop-check" />
            </div>
          </div>
        </div>
      </transition>
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
          :class="{ on: view === 'list' }"
          title="列表视图"
          @click="$emit('update:view', 'list')"
        ><svg-icon icon-class="tickets" /></button>
        <button
          class="sp-seg-btn"
          :class="{ on: view === 'grid' }"
          title="网格视图"
          @click="$emit('update:view', 'grid')"
        ><svg-icon icon-class="menu" /></button>
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
      <!-- 空间规则（B 方案收编）：编辑当前工作空间的 AGENTS.md，仅该空间对话生效 -->
      <button class="sp-tool-btn" title="编辑此空间的规则，仅该空间对话生效" @click="$emit('space-rule')"><svg-icon icon-class="rules" /><span>空间规则</span></button>
      <button class="sp-icon-btn" title="重命名此空间" @click="$emit('rename')">
        <svg-icon icon-class="edit" />
      </button>
      <button class="sp-icon-btn" title="刷新" @click="$emit('refresh')">
        <svg-icon icon-class="refresh-left" :class="{ spinning: loading }" />
      </button>
      <!-- 解绑当前工作空间（连带删除该空间任务记录，二次确认在页面层） -->
      <button class="sp-icon-btn" title="解绑此空间" @click="$emit('unbind')">
        <svg-icon icon-class="delete" />
      </button>
    </div>
  </header>
</template>

<script>
// 空间页头部工具栏（受控组件：view/showHidden/search 走 update 事件）
// 空间名区域兼任工作空间下拉选择器（多空间时点击向下弹出浮层切换）
export default {
  name: 'SpaceToolbar',
  props: {
    // 当前空间（含 name/dir/icon）
    space: {
      type: Object,
      required: true
    },
    // 工作空间下拉选项：{ value, label, svg?, tag?, title? }
    workspaces: {
      type: Array,
      default: () => []
    },
    // 当前激活工作空间 id
    activeId: {
      type: String,
      default: ''
    },
    // 当前目录可见条目数
    count: {
      type: Number,
      default: 0
    },
    view: {
      type: String,
      default: 'list'
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
  },
  data() {
    return {
      // 下拉展开状态（组件内部管理，点击外部关闭）
      wsOpen: false
    }
  },
  created() {
    document.addEventListener('mousedown', this.onDocMouseDown)
  },
  beforeDestroy() {
    document.removeEventListener('mousedown', this.onDocMouseDown)
  },
  methods: {
    // 仅多空间时可展开
    toggleWs() {
      if (this.workspaces.length <= 1) return
      this.wsOpen = !this.wsOpen
    },
    pickWorkspace(id) {
      this.wsOpen = false
      if (id !== this.activeId) this.$emit('select-workspace', id)
    },
    onDocMouseDown(e) {
      if (this.wsOpen && !e.target.closest('.sp-ws-select')) this.wsOpen = false
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
  margin: 12px 20px;
  padding: 14px 20px;
  background: linear-gradient(135deg, rgba(var(--primary-color-rgb, 91, 124, 240), 0.04) 0%, rgba(0, 0, 0, 0.01) 100%);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
  border-radius: 12px;
  flex-wrap: wrap;
}

/* ===== 工作空间选择器（空间名区域） ===== */
.sp-ws-select {
  position: relative;
  min-width: 0;
}

/* 多空间时：hover 高亮 + 可点击 */
.sp-ws-select:not(.single) .sp-space {
  cursor: pointer;
  padding: 5px 10px;
  margin: -5px -10px;
  border-radius: 10px;
  transition: background 0.15s ease;

  &:hover {
    background: var(--search-bg);
  }
}

.sp-ws-select.open:not(.single) .sp-space {
  background: var(--search-bg-hover);

  .sp-space-arrow {
    transform: rotate(180deg);
  }
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

.sp-space-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 下拉箭头（多空间时显示，展开旋转 180°） */
.sp-space-arrow {
  font-size: 11px;
  color: var(--text-secondary);
  flex-shrink: 0;
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
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

/* ===== 工作空间下拉浮层（mac 菜单风：毛玻璃 + 主题色对勾） ===== */
.sp-ws-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: -10px;
  min-width: 240px;
  max-width: 340px;
  border-radius: 12px;
  border: 1px solid var(--border-color);
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(24px) saturate(1.6);
  -webkit-backdrop-filter: blur(24px) saturate(1.6);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
  z-index: 300;
  padding: 5px;
  -webkit-app-region: no-drag;
}

html[data-theme='dark'] .sp-ws-pop {
  background: rgba(46, 46, 52, 0.92);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24);
}

.sp-ws-pop-head {
  padding: 6px 10px 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: var(--text-secondary);
  white-space: nowrap;
}

.sp-ws-pop-list {
  max-height: 264px;
  overflow-y: auto;

  &::-webkit-scrollbar {
    width: 4px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(0, 0, 0, 0.18));
    border-radius: 2px;
  }
}

.sp-ws-pop-item {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 32px;
  padding: 5px 9px;
  border-radius: 8px;
  font-size: 12px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;
  transition: background 0.12s ease;

  .sp-ws-pop-ico {
    font-size: 14px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .sp-ws-pop-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sp-ws-pop-check {
    font-size: 12px;
    font-weight: 600;
    color: var(--primary-color);
    flex-shrink: 0;
  }

  &:hover {
    background: var(--search-bg-hover);

    .sp-ws-pop-ico {
      color: var(--primary-color);
    }
  }

  &.active {
    font-weight: 600;

    .sp-ws-pop-ico {
      color: var(--primary-color);
    }
  }
}

/* 浮层弹出过渡（轻缩放 + 下移淡入） */
.sp-ws-pop-enter-active {
  transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.sp-ws-pop-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.sp-ws-pop-enter,
.sp-ws-pop-leave-to {
  opacity: 0;
  transform: translateY(-6px) scale(0.96);
  transform-origin: top left;
}
</style>
