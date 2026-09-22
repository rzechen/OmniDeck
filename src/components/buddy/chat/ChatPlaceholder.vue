<template>
  <!-- 空会话欢迎占位（垂直水平居中） -->
  <div class="ob-placeholder">
    <div class="ob-icon">
      <img src="@/assets/logo.png" alt="OmniBuddy" class="ob-img" />
    </div>
    <div class="ob-hi">有什么可以帮您？</div>
    <div class="ob-desc">智能工作助手，随时为您答疑解惑</div>
  </div>
</template>

<script>
// OmniBuddy 对话空态欢迎占位：slogan
export default {
  name: 'ChatPlaceholder'
}
</script>

<style lang="scss" scoped>
.ob-placeholder {
  margin: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 48px;
}

.ob-icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.16), rgba(var(--primary-color-rgb), 0.05));
  border: 1px solid rgba(var(--primary-color-rgb), 0.3);
  display: flex;
  align-items: center;
  justify-content: center;

  // 品牌 logo（宽扁异形，contain 原比例呈现）
  .ob-img {
    width: 42px;
    height: 42px;
    object-fit: contain;
  }
}

.ob-hi {
  margin-top: 4px;
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary);
}

/* slogan */
.ob-desc {
  font-size: 12px;
  color: var(--text-secondary);
}
</style>
