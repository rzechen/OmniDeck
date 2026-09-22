<template>
  <!-- 消息列表：按 role 分发气泡（正文 / ask_user 表单 / todo 卡片） -->
  <div class="ob-messages">
    <template v-for="(m, i) in messages">
      <message-bubble
        v-if="m.role === 'user' || m.role === 'assistant'"
        :key="(m.id || i) + '-msg'"
        :message="m"
        :streaming="streaming"
        @truncate="$emit('truncate', m)"
        @branch="$emit('branch', m)"
      />

      <ask-user-card
        v-else-if="m.role === 'ask_user'"
        :key="(m.id || i) + '-ask'"
        :message="m"
        @answer="(msg, value) => $emit('answer', msg, value)"
      />

      <todo-card
        v-else-if="m.role === 'todo'"
        :key="(m.id || i) + '-todo'"
        :todos="m.todos"
      />
    </template>
  </div>
</template>

<script>
import MessageBubble from '@/components/buddy/chat/MessageBubble.vue'
import AskUserCard from '@/components/buddy/chat/AskUserCard.vue'
import TodoCard from '@/components/buddy/chat/TodoCard.vue'

// OmniBuddy 消息列表容器：三种气泡分发，交互事件原样上抛给页面处理
export default {
  name: 'ChatMessageList',
  components: { MessageBubble, AskUserCard, TodoCard },
  props: {
    // 归一化后的消息数组（user / assistant / ask_user / todo）
    messages: {
      type: Array,
      required: true
    },
    // 会话是否正在流式生成（透传给正文气泡控制光标与 hover 操作）
    streaming: {
      type: Boolean,
      default: false
    }
  }
}
</script>

<style lang="scss" scoped>
/* ===== 消息列表 ===== */
.ob-messages {
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  padding: 24px 28px 12px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
</style>
