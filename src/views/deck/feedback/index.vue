<template>
  <div class="feedback-page page-container">
    <!-- Hero：问题反馈横幅 -->
    <div class="feedback-hero">
      <div class="hero-icon-wrap">
        <svg-icon icon-class="feedback" class="hero-icon" />
      </div>
      <div class="hero-info">
        <div class="hero-name">问题反馈</div>
        <p class="hero-desc">遇到问题或有改进建议？欢迎告诉我们，帮助 OmniDeck 变得更好</p>
      </div>
    </div>

    <!-- 反馈表单：TODO 占位 -->
    <div class="feedback-section">
      <div class="section-header">
        <span class="section-title">提交反馈</span>
      </div>

      <div class="feedback-placeholder">
        <div class="fp-icon">
          <svg-icon icon-class="edit-outline" />
        </div>
        <div class="fp-title">反馈功能规划中</div>
        <div class="fp-desc">表单提交、截图附带、历史反馈记录等功能正在开发中，敬请期待</div>
        <div class="fp-features">
          <div v-for="f in features" :key="f.label" class="fp-feature">
            <svg-icon :icon-class="f.icon" />
            <span>{{ f.label }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// 问题反馈页（TODO 占位：表单能力规划中）
export default {
  name: 'Feedback',
  data() {
    return {
      features: [
        { icon: 'edit-outline', label: '问题描述' },
        { icon: 'picture-outline', label: '截图附带' },
        { icon: 'collection', label: '历史记录' },
        { icon: 'chat-line-round', label: '进展通知' }
      ]
    }
  }
}
</script>

<style lang="scss" scoped>
.feedback-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* ============ Hero ============ */
.feedback-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: $radius-lg;
  border: 1px solid rgba(var(--primary-color-rgb), 0.2);
  background: linear-gradient(
    135deg,
    rgba(var(--primary-color-rgb), 0.1),
    rgba(var(--primary-color-rgb), 0.03)
  );
}

.hero-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  background: rgba(var(--primary-color-rgb), 0.12);
  border: 1px solid rgba(var(--primary-color-rgb), 0.25);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .hero-icon {
    width: 26px;
    height: 26px;
    color: var(--primary-color);
  }
}

.hero-name {
  font-size: 19px;
  font-weight: 700;
  color: $text-primary;
}

.hero-desc {
  margin-top: 4px;
  font-size: 12.5px;
  color: $text-secondary;
}

/* ============ 占位区 ============ */
.feedback-section {
  margin-top: 16px;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.section-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 12px;

  .section-title {
    font-size: 14.5px;
    font-weight: 700;
    color: $text-primary;
  }
}

/* 占位卡片占满剩余空间，内容垂直居中 */
.feedback-placeholder {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 48px 24px 56px;
  border: 1px dashed var(--border-color);
  border-radius: $radius-lg;
}

.fp-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: rgba(var(--primary-color-rgb), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;

  i {
    font-size: 26px;
    color: var(--primary-color);
  }
}

.fp-title {
  font-size: 15px;
  font-weight: 700;
  color: $text-primary;
}

.fp-desc {
  font-size: 12.5px;
  color: $text-secondary;
  text-align: center;
}

.fp-features {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 8px;
}

.fp-feature {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: $text-secondary;
  background: $search-bg;
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 5px 12px;

  i {
    font-size: 13px;
    color: var(--primary-color);
  }
}
</style>
