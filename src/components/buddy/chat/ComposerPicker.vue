<template>
  <!-- 输入框底部工具栏的上拉选择器（mac 菜单风浮层，向上弹出） -->
  <div class="ob-select" :class="{ open: isOpen }">
    <!-- 触发 chip：幽灵按钮（透明底，hover 浮现），无选中时文字弱化 -->
    <span
      class="ob-inline-chip"
      :class="{ placeholder: !modelValue }"
      :title="triggerTitle"
      @click="$emit('toggle')"
    >
      <svg-icon :icon-class="triggerIcon" class="ob-chip-icon" />
      <span class="ob-chip-text">{{ triggerLabel }}</span>
      <svg-icon icon-class="arrow-down" class="ob-chip-arrow" />
    </span>

    <!-- 上拉浮层 -->
    <transition name="ob-pop">
      <div v-if="isOpen" class="ob-select-pop">
        <div v-if="panelTitle" class="ob-pop-head">{{ panelTitle }}</div>

        <div v-if="items.length" class="ob-pop-list">
          <div
            v-for="it in items"
            :key="it.value"
            class="ob-pop-item"
            :class="{ active: it.value === modelValue }"
            @click="$emit('select', it.value)"
          >
            <span class="ob-pop-ico">
              <svg-icon :icon-class="it.svg || 'collection-tag'" class="ob-pop-svg" />
            </span>
            <span class="ob-pop-text">{{ it.label }}</span>
            <span v-if="it.tag" class="ob-pop-tag">{{ it.tag }}</span>
            <svg-icon v-if="it.value === modelValue" icon-class="check" class="ob-pop-check" />
          </div>
        </div>

        <!-- 空状态 -->
        <slot name="empty">
          <div v-if="!items.length" class="ob-pop-empty">
            <div class="ob-pop-empty-icon"><svg-icon :icon-class="triggerIcon" /></div>
            <p class="ob-pop-empty-title">{{ emptyTitle }}</p>
            <span v-if="emptyDesc" class="ob-pop-empty-desc">{{ emptyDesc }}</span>
          </div>
        </slot>

        <!-- 底部操作区 -->
        <div v-if="$slots.footer" class="ob-pop-footer">
          <slot name="footer"></slot>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
// OmniBuddy 输入栏上拉选择器：空间 / 模型等内嵌 chip 的统一浮层
// 设计参考 Claude / ChatGPT 输入栏：chip 为中性幽灵按钮（无警示配色），
// 浮层为 mac 菜单风（毛玻璃 + 选中项主题色对勾 + 次要信息弱化标签）。
// 打开状态由父组件集中管理（activeKey），保证同时只展开一个。
export default {
  name: 'ComposerPicker',
  props: {
    // 自身标识（与 activeKey 比较判断是否展开）
    pickerKey: {
      type: String,
      required: true
    },
    // 当前展开的选择器标识（'' 表示全部收起）
    activeKey: {
      type: String,
      default: ''
    },
    // 当前选中值（空值时 chip 文字弱化为占位样式）
    modelValue: {
      type: [String, Number],
      default: ''
    },
    // 触发 chip 图标（svg 图标名）
    triggerIcon: {
      type: String,
      default: 'collection-tag'
    },
    triggerLabel: {
      type: String,
      default: ''
    },
    triggerTitle: {
      type: String,
      default: ''
    },
    // 浮层顶部小标题
    panelTitle: {
      type: String,
      default: ''
    },
    // 选项：{ value, label, svg?, tag? }
    items: {
      type: Array,
      default: () => []
    },
    emptyTitle: {
      type: String,
      default: '暂无选项'
    },
    emptyDesc: {
      type: String,
      default: ''
    }
  },
  computed: {
    isOpen() {
      return this.activeKey === this.pickerKey
    }
  }
}
</script>

<style lang="scss" scoped>
/* ===== 触发 chip：中性幽灵按钮 ===== */
.ob-inline-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 7px 0 9px;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 11.5px;
  cursor: pointer;
  user-select: none;
  max-width: 200px;
  transition: background 0.15s ease;

  .ob-chip-icon {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .ob-chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  // 未选择：占位文字弱化（不用警示色，保持简约）
  &.placeholder .ob-chip-text {
    color: var(--text-secondary);
  }

  .ob-chip-arrow {
    font-size: 11px;
    color: var(--text-secondary);
    transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  }

  &:hover {
    background: var(--search-bg);
  }
}

.ob-select.open .ob-inline-chip {
  background: var(--search-bg-hover);

  .ob-chip-arrow {
    transform: rotate(180deg);
  }
}

/* ===== 上拉浮层：mac 菜单风（毛玻璃 + 分层阴影 + 大圆角） ===== */
.ob-select {
  position: relative;
  display: inline-flex;
}

.ob-select-pop {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  min-width: 208px;
  max-width: 280px;
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

html[data-theme='dark'] .ob-select-pop {
  background: rgba(46, 46, 52, 0.92);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24);
}

/* 浮层小标题 */
.ob-pop-head {
  padding: 6px 10px 5px;
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 0.6px;
  color: var(--text-secondary);
  white-space: nowrap;
}

/* 列表区（超出滚动，细滚动条） */
.ob-pop-list {
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

/* 选项：hover 圆角高亮块；选中项主题色 + 对勾 */
.ob-pop-item {
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
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;

  .ob-pop-ico {
    width: 16px;
    height: 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;

    .ob-pop-svg {
      width: 14px;
      height: 14px;
      color: var(--text-secondary);
    }
  }

  .ob-pop-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  // 次要信息弱化标签（如「未关联」），中性色不用警示色
  .ob-pop-tag {
    flex-shrink: 0;
    font-size: 10px;
    color: var(--text-secondary);
    background: var(--search-bg);
    border-radius: 999px;
    padding: 1px 7px;
  }

  .ob-pop-check {
    font-size: 12px;
    font-weight: 600;
    color: var(--primary-color);
    flex-shrink: 0;
  }

  &:hover {
    background: var(--search-bg-hover);

    .ob-pop-ico .ob-pop-svg {
      color: var(--primary-color);
    }
  }

  &.active {
    font-weight: 600;

    .ob-pop-ico .ob-pop-svg {
      color: var(--primary-color);
    }
  }
}

/* 底部操作区：细分割线 */
.ob-pop-footer {
  margin-top: 4px;
  padding-top: 4px;
  border-top: 1px solid var(--border-color);

  ::v-deep .ob-pop-item {
    color: var(--text-secondary);
    font-weight: 400;

    &:hover {
      color: var(--text-primary);

      .ob-pop-ico .svg-icon {
        color: var(--primary-color);
      }
    }
  }
}

/* 空状态 */
.ob-pop-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  padding: 18px 14px 14px;

  .ob-pop-empty-icon {
    width: 34px;
    height: 34px;
    border-radius: 12px;
    background: var(--search-bg);
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 3px;

    .svg-icon {
      font-size: 16px;
      color: var(--text-secondary);
    }
  }

  .ob-pop-empty-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .ob-pop-empty-desc {
    font-size: 11px;
    color: var(--text-secondary);
    text-align: center;
    line-height: 1.5;
  }
}

/* 浮层弹出过渡（mac 菜单感：轻缩放 + 上移淡入） */
.ob-pop-enter-active {
  transition: opacity 0.18s ease, transform 0.18s cubic-bezier(0.34, 1.3, 0.64, 1);
}

.ob-pop-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.ob-pop-enter,
.ob-pop-leave-to {
  opacity: 0;
  transform: translateY(6px) scale(0.96);
  transform-origin: bottom left;
}
</style>
