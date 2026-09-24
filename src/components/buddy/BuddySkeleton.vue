<template>
  <!-- 通用骨架屏：shimmer 微光扫过，按 type 呈现贴合页面内容的骨架形态 -->
  <div class="ob-skeleton" :class="'sk-' + type" aria-busy="true">
    <!-- 行列表骨架：图标块 + 双行文字（规则/记忆/任务列表/权限策略等） -->
    <template v-if="type === 'rows'">
      <div v-for="i in count" :key="i" class="sk-row">
        <span class="sk-dot"></span>
        <div class="sk-lines">
          <span class="sk-line" :style="{ width: lineW(i, 62, 30) }"></span>
          <span class="sk-line sm" :style="{ width: lineW(i + 2, 28, 30) }"></span>
        </div>
      </div>
    </template>

    <!-- 卡片网格骨架：头部图标 + 标题 + 描述行（技能/连接器/市场/能力清单/工作空间） -->
    <template v-else-if="type === 'cards'">
      <div class="sk-grid">
        <div v-for="i in count" :key="i" class="sk-card">
          <div class="sk-card-head">
            <span class="sk-icon"></span>
            <span class="sk-line" :style="{ width: lineW(i, 42, 18) }"></span>
          </div>
          <span class="sk-line" :style="{ width: lineW(i + 1, 80, 15) }"></span>
          <span class="sk-line sm" :style="{ width: lineW(i + 3, 55, 25) }"></span>
        </div>
      </div>
    </template>

    <!-- 对话骨架：用户气泡 + 助手段落交替（会话历史加载） -->
    <template v-else-if="type === 'chat'">
      <div class="sk-chat">
        <div v-for="g in groups" :key="g" class="sk-chat-group">
          <span class="sk-bubble"></span>
          <div class="sk-assist">
            <span class="sk-line" :style="{ width: lineW(g, 78, 18) }"></span>
            <span class="sk-line" :style="{ width: lineW(g + 1, 88, 10) }"></span>
            <span class="sk-line sm" :style="{ width: lineW(g + 2, 46, 22) }"></span>
          </div>
        </div>
      </div>
    </template>

    <!-- 统计骨架：顶部指标卡行 + 内容行（用量统计） -->
    <template v-else-if="type === 'stats'">
      <div class="sk-stats">
        <div class="sk-stat-cards">
          <span v-for="i in 4" :key="i" class="sk-stat-card"></span>
        </div>
        <div class="sk-lines">
          <span v-for="i in count" :key="i" class="sk-line" :style="{ width: lineW(i, 58, 36) }"></span>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
// Buddy 通用骨架屏：数据加载期间以内容形状的占位块替代空白/spinner
// type = rows（行列表）/ cards（卡片网格）/ chat（对话流）/ stats（指标卡 + 行）
export default {
  name: 'BuddySkeleton',
  props: {
    type: {
      type: String,
      default: 'rows'
    },
    // 骨架单元数量（chat 型为问答组数的 2 倍）
    count: {
      type: Number,
      default: 4
    }
  },
  computed: {
    // chat 型分组数（count 折半，至少 2 组）
    groups() {
      return Math.max(2, Math.ceil(this.count / 2))
    }
  },
  methods: {
    // 伪随机行宽（百分比）：避免所有行等宽显得呆板
    lineW(i, base, spread) {
      return (base + ((i * 37) % spread)) + '%'
    }
  }
}
</script>

<style lang="scss" scoped>
/* 中性灰基底（深浅色主题均可读），shimmer 高光扫过 */
$sk-base: rgba(125, 125, 135, 0.14);
$sk-hi: rgba(125, 125, 135, 0.28);

.ob-skeleton {
  width: 100%;
}

/* shimmer 公共占位块 */
.sk-line,
.sk-dot,
.sk-icon,
.sk-bubble,
.sk-card,
.sk-stat-card {
  display: block;
  background: linear-gradient(90deg, $sk-base 25%, $sk-hi 50%, $sk-base 75%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}

@keyframes sk-shimmer {
  0% {
    background-position: 100% 0;
  }

  100% {
    background-position: 0 0;
  }
}

.sk-line {
  height: 12px;
  border-radius: 6px;

  &.sm {
    height: 10px;
  }
}

.sk-lines {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ===== rows：行列表 ===== */
.sk-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 4px;

  & + .sk-row {
    border-top: 1px solid var(--border-color);
  }
}

.sk-dot {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  flex-shrink: 0;
}

/* ===== cards：卡片网格 ===== */
.sk-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
  gap: 12px;
}

.sk-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.sk-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sk-icon {
  width: 30px;
  height: 30px;
  border-radius: 9px;
  flex-shrink: 0;
}

/* ===== chat：对话流 ===== */
.sk-chat {
  display: flex;
  flex-direction: column;
  gap: 30px;
  padding: 10px 0;
}

.sk-chat-group {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 用户气泡骨架：右对齐圆角块 */
.sk-bubble {
  align-self: flex-end;
  width: 36%;
  min-width: 140px;
  height: 40px;
  border-radius: 14px;
}

/* 助手回答骨架：左侧多行文字 */
.sk-assist {
  width: 80%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ===== stats：指标卡 + 行 ===== */
.sk-stats {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.sk-stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.sk-stat-card {
  height: 76px;
  border-radius: 12px;
}
</style>
