<template>
  <!-- 空间页面包屑：根目录（空间名）+ 子层级，点击跳转 -->
  <nav class="sp-crumbs">
    <span class="sp-crumb" @click="$emit('go', -1)">
      <svg-icon icon-class="folder" class="sp-crumb-svg" />
      {{ rootName }}
    </span>
    <template v-for="(c, ci) in crumbs">
      <svg-icon :key="'i' + ci" icon-class="arrow-right" class="sp-crumb-sep" />
      <span
        :key="'c' + ci"
        class="sp-crumb"
        :class="{ last: ci === crumbs.length - 1 }"
        @click="$emit('go', ci)"
      >{{ c.name }}</span>
    </template>
  </nav>
</template>

<script>
// 空间页面包屑导航
export default {
  name: 'SpaceCrumbs',
  props: {
    // 根级名称（显示空间名）
    rootName: {
      type: String,
      required: true
    },
    // 子层级 [{ name, path }]（含点击跳转所需 path）
    crumbs: {
      type: Array,
      default: () => []
    }
  }
}
</script>

<style lang="scss" scoped>
.sp-crumbs {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 0 20px 8px;
  font-size: 12px;
  overflow-x: auto;
  white-space: nowrap;

  &::-webkit-scrollbar {
    height: 0;
  }
}

.sp-crumb {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px 7px;
  border-radius: 6px;
  transition: all 0.12s ease;

  .sp-crumb-img {
    width: 14px;
    height: 14px;
    object-fit: contain;
    -webkit-user-drag: none;
  }

  &:hover {
    background: var(--search-bg);
    color: var(--text-primary);
  }

  &.last {
    color: var(--text-primary);
    font-weight: 600;
    cursor: default;

    &:hover {
      background: transparent;
    }
  }
}

.sp-crumb-sep {
  font-size: 11px;
  color: var(--text-secondary);
  opacity: 0.6;
}
</style>
