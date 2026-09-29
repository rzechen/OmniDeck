<template>
  <!-- 消息列表：按 role 分发气泡（正文）；todo 卡片已移至输入框上方固定面板（页面层渲染），
       权限历史为只读状态行；ask_user 表单内嵌于深度思考区 -->
  <div class="ob-messages">
    <template v-for="(m, i) in messages">
      <!-- data-mid：问题导航定位锚点（页面大纲面板按 id 查找元素滚动定位） -->
      <message-bubble
        v-if="m.role === 'user' || m.role === 'assistant'"
        :key="(m.id || i) + '-msg'"
        :data-mid="m.id"
        :message="m"
        :streaming="streaming"
        :perm-pending="permPending"
        :session-id="sessionId"
        @branch="$emit('branch', m)"
        @feedback="payload => $emit('feedback', payload)"
        @edit-resend="payload => $emit('edit-resend', payload)"
        @switch-branch="payload => $emit('switch-branch', payload)"
        @ask-answer="(msg, value) => $emit('answer', msg, value)"
      />

      <!-- 权限确认历史（只读状态行：交互在输入框上方浮动条完成，不进消息流） -->
      <!-- 无 surface/value 且无有效决定的异常/空数据记录不渲染 -->
      <div
        v-else-if="m.role === 'permission' && hasPermInfo(m)"
        :key="(m.id || i) + '-perm'"
        class="ob-perm-history"
        :class="{ denied: m.decided === 'deny' }"
      >
        <svg-icon :icon-class="m.decided === 'deny' ? 'close' : 'check'" class="ob-perm-history-ico" />
        <span class="ob-perm-history-surface">{{ m.surface || '工具' }}</span>
        <span class="ob-perm-history-value">{{ m.command || m.path || m.value }}</span>
        <span class="ob-perm-history-decision">{{ { allow: '已允许', allow_session: '本会话内允许', allow_always: '始终允许', deny: '已拒绝' }[m.decided] || '' }}</span>
      </div>
    </template>
  </div>
</template>

<script>
import MessageBubble from '@/components/buddy/chat/MessageBubble.vue'

// OmniBuddy 消息列表容器：按 role 分发气泡（正文 / 权限历史），交互事件原样上抛给页面处理
// todo 卡片不在消息流渲染（固定于输入框上方，页面层挂载）
export default {
  name: 'ChatMessageList',
  components: { MessageBubble },
  props: {
    // 归一化后的消息数组（user / assistant / todo）
    messages: {
      type: Array,
      required: true
    },
    // 会话是否正在流式生成（透传给正文气泡控制光标与 hover 操作）
    streaming: {
      type: Boolean,
      default: false
    },
    // 队首待确认权限（透传给工具卡片显示"等待授权"状态；null 表示无）
    permPending: {
      type: Object,
      default: null
    },
    // 所属会话 id（透传给气泡内深度研究进度卡片：历史回放拉取运行状态）
    sessionId: {
      type: String,
      default: ''
    }
  },
  mounted() {
    // 内容尺寸监听：思考区/工具详情的折叠展开只改组件内部状态（不经 store 数据驱动），
    // 页面层的贴底跟滚 watch 捕捉不到，收起后末尾内容（任务清单）会脱离输入框；
    // 观察列表根元素尺寸变化上抛，由页面在贴底语义下补偿滚动
    if (typeof ResizeObserver !== 'undefined') {
      this._ro = new ResizeObserver(() => this.$emit('content-resize'))
      this._ro.observe(this.$el)
    }
  },
  beforeUnmount() {
    if (this._ro) this._ro.disconnect()
  },
  methods: {
    // 权限记录有效判定：至少有一项可展示信息，且决定合法（历史空数据行不渲染）
    hasPermInfo(m) {
      const decided = ['allow', 'allow_session', 'allow_always', 'deny'].indexOf(m.decided) >= 0
      return decided && !!(m.surface || m.command || m.path || m.value)
    }
  }
}
</script>

<style lang="scss" scoped>
/* ===== 消息列表 ===== */
.ob-messages {
  width: 100%;
  // 外框 976 = 内容 920 + 两侧 28 padding（border-box）：内容区与输入框
  // （.ob-composer-inner 920px）严格对齐，消息不再比输入框缩进
  max-width: 976px;
  margin: 0 auto;
  // 顶部留白 40px：与窗口顶/页签行拉开间距，避免首条消息贴顶
  padding: 40px 28px 12px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* ===== 权限确认历史（只读状态行） ===== */
.ob-perm-history {
  margin-left: 40px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-secondary);
  min-width: 0;

  .ob-perm-history-ico {
    flex-shrink: 0;
    font-size: 13px;
    color: var(--primary-color);
  }

  .ob-perm-history-surface {
    flex-shrink: 0;
    font-size: 10.5px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    background: var(--search-bg);
    border-radius: 4px;
    padding: 1px 6px;
  }

  .ob-perm-history-value {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    color: var(--text-primary);
  }

  .ob-perm-history-decision {
    flex-shrink: 0;
    margin-left: auto;
    font-size: 11px;
  }

  &.denied .ob-perm-history-ico {
    color: var(--text-secondary);
  }
}
</style>
