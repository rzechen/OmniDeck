<template>
  <!-- 空态占位（未选空间 / 未关联目录 / 空文件夹共用，垂直水平居中） -->
  <div class="sp-blank" :class="{ small: small }">
    <div class="sp-blank-icon">
      <svg-icon :icon-class="icon" class="sp-blank-svg" />
    </div>
    <div class="sp-blank-title">{{ title }}</div>
    <div v-if="desc" class="sp-blank-desc">{{ desc }}</div>
    <slot></slot>
  </div>
</template>

<script setup>
// 空间页空态占位
defineOptions({ name: 'SpaceBlank' })

defineProps({
  icon: {
    type: String,
    default: 'folder'
  },
  title: {
    type: String,
    required: true
  },
  desc: {
    type: String,
    default: ''
  },
  // 目录内空态（图标小一号）
  small: {
    type: Boolean,
    default: false
  }
})
</script>

<style lang="scss" scoped>
.sp-blank {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px 20px;
  text-align: center;
}

.sp-blank-icon {
  width: 68px;
  height: 68px;
  border-radius: 22px;
  background: linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.14), rgba(var(--primary-color-rgb), 0.04));
  border: 1px solid rgba(var(--primary-color-rgb), 0.22);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;

  .sp-blank-svg {
    width: 30px;
    height: 30px;
    color: var(--primary-color);
  }
}

.sp-blank.small .sp-blank-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;

  .sp-blank-svg {
    width: 26px;
    height: 26px;
  }
}

.sp-blank-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
}

.sp-blank.small .sp-blank-title {
  font-size: 13.5px;
}

.sp-blank-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.6;
  max-width: 320px;
}
</style>
