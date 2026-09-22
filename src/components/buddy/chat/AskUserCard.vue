<template>
  <!-- ask_user 提问卡片：选项按钮 + 自定义输入 -->
  <div class="ob-ask-card">
    <div class="ob-ask-question">
      <img src="@/assets/logo.png" alt="OmniBuddy" class="ob-ask-logo" />
      <span>{{ message.question }}</span>
    </div>
    <div v-if="message.answered || message.answer" class="ob-ask-answer">
      <svg-icon icon-class="user-solid" />
      {{ message.answer || '（未作答）' }}
    </div>
    <div v-else class="ob-ask-form">
      <el-button
        v-for="opt in message.options"
        :key="opt"
        size="mini"
        round
        @click="$emit('answer', message, opt)"
      >{{ opt }}</el-button>
      <el-input
        v-model="message._input"
        size="mini"
        class="ob-ask-input"
        placeholder="或输入回答…"
        @keyup.enter.native="$emit('answer', message, message._input)"
      >
        <el-button slot="append" @click="$emit('answer', message, message._input)">
          <svg-icon icon-class="promotion" />
        </el-button>
      </el-input>
    </div>
  </div>
</template>

<script>
// OmniBuddy ask_user 提问卡片（Agent 中途向用户提问）
export default {
  name: 'AskUserCard',
  props: {
    message: {
      type: Object,
      required: true
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-ask-card {
  margin-left: 40px;
  border: 1px solid rgba(var(--primary-color-rgb), 0.35);
  border-radius: 12px;
  background: rgba(var(--primary-color-rgb), 0.05);
  padding: 12px 14px;
}

.ob-ask-question {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.6;

  // 品牌 logo（宽扁异形，contain 原比例呈现）
  .ob-ask-logo {
    width: 16px;
    height: 16px;
    object-fit: contain;
    flex-shrink: 0;
    margin-top: 2px;
  }
}

.ob-ask-form {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .el-button { margin: 0; }
}

.ob-ask-input {
  width: 260px;
}

.ob-ask-answer {
  margin-top: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-secondary);
  word-break: break-word;

  .svg-icon { color: var(--primary-color); }
}
</style>
