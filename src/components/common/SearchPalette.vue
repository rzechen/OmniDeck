<template>
  <!-- Spotlight 风格搜索命令面板（自原 Deck Topbar 抽取，供「快捷搜索」页签唤起） -->
  <el-dialog
    v-model="dlgVisible"
    :show-close="false"
    :modal="true"
    append-to-body
    class="search-dialog"
    width="680px"
    top="12vh"
  >
    <div class="palette-input-wrap">
      <i class="el-icon-search"></i>
      <input
        ref="searchInput"
        v-model="searchQuery"
        class="palette-input"
        placeholder="搜索工具、页面..."
        @keydown.enter.prevent="selectActive"
        @keydown.down.prevent="move(1)"
        @keydown.up.prevent="move(-1)"
        @keydown.esc="dlgVisible = false"
      />
      <span class="palette-kbd">esc</span>
    </div>

    <div class="palette-results" ref="resultsWrap" v-if="filteredItems.length">
      <div
        v-for="(item, i) in filteredItems"
        :key="item.path"
        class="palette-item"
        :class="{ 'is-active': i === activeIndex }"
        :data-index="i"
        @mouseenter="activeIndex = i"
        @click="pick(item)"
      >
        <svg-icon :icon-class="item.iconSvg" class="item-icon" />
        <span class="item-label">{{ item.title }}</span>
        <i v-if="i === activeIndex" class="el-icon-right item-enter"></i>
      </div>
    </div>
    <div class="palette-empty" v-else-if="searchQuery">
      <i class="el-icon-search"></i>
      <span>未找到「{{ searchQuery }}」相关内容</span>
    </div>

    <div class="palette-footer">
      <span class="hint"><kbd>↑</kbd><kbd>↓</kbd> 选择</span>
      <span class="hint"><kbd>↵</kbd> 打开</span>
      <span class="hint"><kbd>esc</kbd> 关闭</span>
    </div>
  </el-dialog>
</template>

<script>
import { searchItems, toolCategories } from '@/config/tools'

export default {
  name: 'SearchPalette',
  props: {
    // 弹框显隐（.sync）
    visible: { type: Boolean, default: false }
  },
  data() {
    return {
      searchQuery: '',
      activeIndex: 0,
      allItems: searchItems
    }
  },
  computed: {
    dlgVisible: {
      get() {
        return this.visible
      },
      set(v) {
        this.$emit('update:visible', v)
      }
    },
    // 所有分类下的具体工具（展平，用于搜索命中）
    toolItems() {
      const out = []
      toolCategories.forEach(cat => {
        cat.children.forEach(t => {
          out.push({ path: t.path, title: t.name, iconSvg: t.icon })
        })
      })
      return out
    },
    filteredItems() {
      if (!this.searchQuery) return this.allItems
      const q = this.searchQuery.toLowerCase()
      // 命中的分组在前，具体工具在后
      const groups = this.allItems.filter(item =>
        item.title.toLowerCase().includes(q)
      )
      const tools = this.toolItems.filter(item =>
        item.title.toLowerCase().includes(q)
      )
      return [...groups, ...tools]
    }
  },
  watch: {
    visible(val) {
      if (val) {
        this.activeIndex = 0
        this.$nextTick(() => {
          if (this.$refs.searchInput) {
            this.$refs.searchInput.focus()
          }
        })
      } else {
        this.searchQuery = ''
      }
    },
    // 输入变化后选中项回到第一个
    searchQuery() {
      this.activeIndex = 0
    }
  },
  methods: {
    // 键盘上下移动选中项（首尾循环）
    move(dir) {
      const len = this.filteredItems.length
      if (!len) return
      this.activeIndex = (this.activeIndex + dir + len) % len
      this.scrollToActive()
    },
    selectActive() {
      if (this.filteredItems.length) {
        this.pick(this.filteredItems[this.activeIndex])
      }
    },
    // 选中项滚动到可视区
    scrollToActive() {
      this.$nextTick(() => {
        const wrap = this.$refs.resultsWrap
        if (!wrap) return
        const el = wrap.querySelector(`[data-index="${this.activeIndex}"]`)
        if (el) el.scrollIntoView({ block: 'nearest' })
      })
    },
    pick(item) {
      this.dlgVisible = false
      this.$emit('select', item)
    }
  }
}
</script>

<style lang="scss">
// 搜索命令面板（Spotlight 风格，append-to-body 所以必须非 scoped；自原 Topbar 迁入）
.search-dialog {
  border-radius: 16px !important;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.24) !important;

  .el-dialog__header {
    display: none;
  }

  .el-dialog__body {
    padding: 0;
  }
}

// 打开时轻微缩放弹出（Mac 风格弹性曲线）
.dialog-fade-enter-active .search-dialog {
  transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.18s ease;
}

.dialog-fade-enter .search-dialog {
  transform: scale(0.95) translateY(-10px);
  opacity: 0;
}

.dialog-fade-leave-active .search-dialog {
  transition: transform 0.15s ease, opacity 0.15s ease;
}

.dialog-fade-leave-to .search-dialog {
  transform: scale(0.97);
  opacity: 0;
}

/* 输入区 */
.palette-input-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 18px;
  border-bottom: 1px solid $border-color;

  .el-icon-search {
    font-size: 20px;
    color: $text-secondary;
  }

  .palette-input {
    flex: 1;
    border: none;
    outline: none;
    font-size: 16px;
    font-weight: 500;
    background: transparent;
    color: $text-primary;

    &::placeholder {
      color: $text-secondary;
      font-weight: 400;
    }
  }

  .palette-kbd {
    font-size: 11px;
    color: $text-secondary;
    background: $search-bg;
    padding: 2px 7px;
    border-radius: 5px;
    border: 1px solid $border-color;
    font-family: 'SF Mono', Menlo, monospace;
  }
}

/* 结果列表 */
.palette-results {
  max-height: 464px;
  overflow-y: auto;
  padding: 8px;
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.12s ease;

  .item-icon {
    width: 18px;
    height: 18px;
    color: $text-secondary;
    flex-shrink: 0;
    transition: color 0.12s ease;
  }

  .item-label {
    font-size: 14px;
    font-weight: 500;
    color: $text-primary;
  }

  .item-enter {
    margin-left: auto;
    font-size: 13px;
    color: $primary-color;
  }

  &.is-active {
    background: rgba(var(--primary-color-rgb), 0.09);

    .item-icon {
      color: $primary-color;
    }

    .item-label {
      color: $primary-color;
      font-weight: 600;
    }
  }
}

/* 空结果 */
.palette-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 32px 0 28px;
  color: $text-secondary;

  .el-icon-search {
    font-size: 28px;
    opacity: 0.4;
  }

  span {
    font-size: 13px;
  }
}

/* 底部快捷键提示栏 */
.palette-footer {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 9px 16px;
  border-top: 1px solid $border-color;
  background: $search-bg;

  .hint {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: $text-secondary;

    kbd {
      font-family: 'SF Mono', Menlo, monospace;
      font-size: 10px;
      color: $text-secondary;
      background: var(--card-bg);
      border: 1px solid $border-color;
      border-radius: 4px;
      padding: 1px 5px;
      line-height: 1.4;
    }
  }
}
</style>
