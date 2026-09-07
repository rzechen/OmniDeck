<template>
  <div class="ob-chat">
    <!-- 对话主体：规划中欢迎占位 -->
    <div class="ob-body">
      <div class="ob-placeholder">
        <div class="ob-badge">TODO</div>
        <div class="ob-icon">
          <svg-icon icon-class="buddy" class="ob-svg" />
        </div>
        <div class="ob-hi">有什么可以帮您？</div>
        <div class="ob-desc">OmniBuddy 对话能力规划中，模型接入已就绪，敬请期待</div>
        <div class="ob-features">
          <div v-for="f in features" :key="f.label" class="ob-feature">
            <i :class="f.icon"></i>
            <span>{{ f.label }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部：豆包风格输入框组件 -->
    <div class="ob-composer">
      <buddy-composer v-model="draft" @send="send" />
    </div>
  </div>
</template>

<script>
import BuddyComposer from '@/components/buddy/BuddyComposer.vue'

// OmniBuddy 对话主区（占位骨架：布局与输入链路就绪，流式对话接入后填充）
export default {
  name: 'OmniBuddyChat',
  components: { BuddyComposer },
  data() {
    return {
      draft: '',
      features: [
        { icon: 'el-icon-chat-dot-round', label: '多会话对话' },
        { icon: 'el-icon-files', label: '空间管理' },
        { icon: 'el-icon-lightning', label: '流式输出' },
        { icon: 'el-icon-document', label: 'Markdown 渲染' },
        { icon: 'el-icon-cpu', label: '多模型切换' },
        { icon: 'el-icon-bell-off', label: '本地存储' }
      ]
    }
  },
  methods: {
    send() {
      this.draft = ''
      this.$message.info('OmniBuddy 对话能力规划中，敬请期待')
    }
  }
}
</script>

<style lang="scss" scoped>
$ob-accent: #722ED1;

.ob-chat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  -webkit-app-region: no-drag;
  overflow: hidden;
}

/* ===== 主体 ===== */
.ob-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ob-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 36px 48px;
  position: relative;
  max-width: 560px;
}

.ob-badge {
  position: absolute;
  top: 0;
  right: -10px;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #D46B08;
  background: rgba(250, 173, 20, 0.15);
  border: 1px solid rgba(250, 173, 20, 0.4);
  padding: 3px 10px;
  border-radius: 999px;
  transform: rotate(12deg);
}

.ob-icon {
  width: 64px;
  height: 64px;
  border-radius: 20px;
  background: linear-gradient(135deg, rgba(114, 46, 209, 0.16), rgba(114, 46, 209, 0.05));
  border: 1px solid rgba(114, 46, 209, 0.3);
  display: flex;
  align-items: center;
  justify-content: center;

  .ob-svg {
    width: 32px;
    height: 32px;
    color: $ob-accent;
  }
}

.ob-hi {
  margin-top: 4px;
  font-size: 19px;
  font-weight: 700;
  color: var(--text-primary);
}

.ob-desc {
  font-size: 12px;
  color: var(--text-secondary);
  text-align: center;
  line-height: 1.6;
}

.ob-features {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-top: 10px;
}

.ob-feature {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11.5px;
  color: var(--text-secondary);
  background: var(--search-bg);
  border: 1px solid var(--border-color);
  border-radius: 999px;
  padding: 5px 12px;

  i {
    font-size: 13px;
    color: $ob-accent;
  }
}

/* ===== 输入区（BuddyComposer 组件承载） ===== */
.ob-composer {
  flex-shrink: 0;
  padding: 10px 18px 14px;
}
</style>
