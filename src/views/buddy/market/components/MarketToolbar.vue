<template>
  <!-- 工具行：结果计数 + 搜索框（筛选状态由顶部 chips 承载） -->
  <div class="ob-market-toolbar">
    <div class="ob-market-current">
      <span class="ob-market-current-count">{{ resultCount }} 个资源</span>
    </div>
    <div class="ob-market-search">
      <svg-icon icon-class="search" class-name="search-icon" />
      <input
        v-model="localKeyword"
        placeholder="搜索技能、代理或连接器..."
        @keydown.esc="localKeyword = ''"
      />
      <span v-if="modelValue" class="search-count">{{ resultCount }}</span>
      <svg-icon v-if="modelValue" icon-class="circle-close" class-name="search-clear" @click="localKeyword = ''" />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

// 市场右侧工具栏（搜索框支持 v-model，清空/ESC 由组件内部 emit update:modelValue 完成）
defineOptions({ name: 'MarketToolbar' })

const props = defineProps({
  // 搜索关键词（v-model）
  modelValue: { type: String, default: '' },
  // 当前筛选结果数量（filteredItems.length）
  resultCount: { type: Number, default: 0 }
})

const emit = defineEmits(['update:modelValue'])

// v-model 代理：写入时向父组件 emit update:modelValue
const localKeyword = computed({
  get() {
    return props.modelValue
  },
  set(val) {
    emit('update:modelValue', val)
  }
})
</script>

<style lang="scss" scoped>
.ob-market-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 16px;
}

.ob-market-current {
  display: flex;
  align-items: center;
  min-width: 0;
  font-size: 12px;
  color: $text-secondary;

  .ob-market-current-count {
    flex-shrink: 0;
  }
}

/* 极简搜索框：无边框（聚焦才浮现主题色描边） */
.ob-market-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 220px;
  height: 32px;
  padding: 0 12px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  border: 1px solid transparent;
  border-radius: 16px;
  flex-shrink: 0;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-hover-dark, rgba(0, 0, 0, 0.06));
  }

  &:focus-within {
    background: var(--card-bg, #fff);
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);

    .search-icon {
      color: var(--primary-color);
    }
  }

  .search-icon {
    font-size: 13px;
    color: $text-secondary;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: $text-primary;

    &::placeholder {
      color: $text-secondary;
    }
  }

  .search-count {
    font-size: 10px;
    color: $text-secondary;
    background: var(--bg-hover, rgba(0, 0, 0, 0.06));
    padding: 1px 6px;
    border-radius: 8px;
  }

  .search-clear {
    font-size: 13px;
    color: $text-secondary;
    cursor: pointer;

    &:hover {
      color: $text-primary;
    }
  }
}
</style>
