<template>
  <!-- 通用骨架屏：shimmer 微光扫过，按 type 呈现贴合页面内容的骨架形态 -->
  <div class="ob-skeleton" :class="'sk-' + type" aria-busy="true">
    <!-- 行列表骨架：图标块 + 双行文字（定时任务行 / 规则编辑 / 资料表单段） -->
    <template v-if="type === 'rows'">
      <div v-for="i in count" :key="i" class="sk-row">
        <span class="sk-dot"></span>
        <div class="sk-lines">
          <span class="sk-line" :style="{ width: lineW(i, 62, 30) }"></span>
          <span class="sk-line sm" :style="{ width: lineW(i + 2, 28, 30) }"></span>
        </div>
      </div>
    </template>

    <!-- 侧栏任务列表骨架：分组标题 + 单行条目（小图标 + 单行文字，贴合作业行 32px 节奏） -->
    <template v-else-if="type === 'tasks'">
      <div v-for="g in 2" :key="'g' + g" class="sk-task-group">
        <div class="sk-task-title"></div>
        <div v-for="i in tasksPerGroup" :key="i" class="sk-task-row">
          <span class="sk-task-ico"></span>
          <span class="sk-task-line" :style="{ width: lineW(i + g * 2, 58, 32) }"></span>
        </div>
      </div>
    </template>

    <!-- 卡片网格骨架：logo + 名称/描述双行 + 胶囊标签 + 底部操作行（对齐 ob-grid-card 结构）；
         min/gap 与实际页网格一致，避免加载完成时列数重排 -->
    <template v-else-if="type === 'cards'">
      <div class="sk-grid" :style="gridStyle">
        <div v-for="i in count" :key="i" class="sk-card">
          <div class="sk-card-head">
            <span class="sk-icon"></span>
            <div class="sk-lines sk-card-titles">
              <span class="sk-line" :style="{ width: lineW(i, 46, 20) }"></span>
              <span class="sk-line sm" :style="{ width: lineW(i + 1, 72, 20) }"></span>
            </div>
          </div>
          <span class="sk-line" :style="{ width: lineW(i + 2, 82, 14) }"></span>
          <span class="sk-tag"></span>
          <div class="sk-card-foot">
            <span class="sk-line sm" :style="{ width: '34%' }"></span>
            <span class="sk-btn"></span>
            <span class="sk-btn"></span>
          </div>
        </div>
      </div>
    </template>

    <!-- 对话骨架：用户气泡（主题色浅底，max 85%）+ 助手全宽段落（对齐消息流 20px 节奏） -->
    <template v-else-if="type === 'chat'">
      <div class="sk-chat">
        <div v-for="g in groups" :key="g" class="sk-chat-group">
          <span class="sk-bubble" :style="{ width: bubbleW(g) }"></span>
          <div class="sk-assist">
            <span class="sk-line" :style="{ width: lineW(g, 78, 18) }"></span>
            <span class="sk-line" :style="{ width: lineW(g + 1, 88, 10) }"></span>
            <span class="sk-line sm" :style="{ width: lineW(g + 2, 46, 22) }"></span>
          </div>
        </div>
      </div>
    </template>

    <!-- 统计骨架：4 指标卡 + 柱状图块 + 双列图表块（对齐用量统计页三段结构） -->
    <template v-else-if="type === 'stats'">
      <div class="sk-stats">
        <div class="sk-stat-cards">
          <span v-for="i in 4" :key="i" class="sk-stat-card"></span>
        </div>
        <div class="sk-chart"></div>
        <div class="sk-chart-cols">
          <div class="sk-chart"></div>
          <div class="sk-chart"></div>
        </div>
      </div>
    </template>

    <!-- 左右分栏骨架：左窄栏（搜索 + 分组行）+ 右面板行（权限策略 / 记忆管理）；
         side-w 对齐实际左栏宽，右侧行为多列并排块（近似表格列） -->
    <template v-else-if="type === 'split'">
      <div class="sk-split">
        <div class="sk-split-side" :style="{ width: sideW + 'px' }">
          <span class="sk-search"></span>
          <div v-for="g in 2" :key="'sg' + g" class="sk-task-group">
            <div class="sk-task-title"></div>
            <div v-for="i in 3" :key="i" class="sk-task-row">
              <span class="sk-task-ico"></span>
              <div class="sk-lines sk-side-lines">
                <span class="sk-line" :style="{ width: lineW(i + g, 66, 24) }"></span>
                <span class="sk-line sm" :style="{ width: lineW(i + g + 1, 40, 20) }"></span>
              </div>
            </div>
          </div>
        </div>
        <div class="sk-split-main">
          <div v-for="i in count" :key="i" class="sk-table-row">
            <span class="sk-line" :style="{ width: lineW(i, 60, 25) }"></span>
            <span class="sk-line" :style="{ width: lineW(i + 1, 72, 20) }"></span>
            <span class="sk-line sm" :style="{ width: '52px' }"></span>
            <span class="sk-btn"></span>
          </div>
        </div>
      </div>
    </template>

    <!-- 分组行式清单骨架（macOS 设置风格）：分组标题 + 圆角面板内 40px 单行（能力清单） -->
    <template v-else-if="type === 'list'">
      <div v-for="g in 2" :key="'lg' + g" class="sk-list-group">
        <div class="sk-list-title">
          <span class="sk-list-title-ico"></span>
          <span class="sk-line sm" :style="{ width: lineW(g, 14, 8) }"></span>
        </div>
        <div class="sk-list-panel">
          <div v-for="i in listRowsPerGroup" :key="i" class="sk-list-row">
            <span class="sk-dot sm"></span>
            <span class="sk-line" :style="{ width: lineW(i + g, 14, 8) }"></span>
            <span class="sk-line sm list-desc" :style="{ width: lineW(i + g + 1, 30, 18) }"></span>
            <span class="sk-btn"></span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
// Buddy 通用骨架屏：数据加载期间以内容形状的占位块替代空白/spinner
// type = rows（行列表）/ tasks（侧栏任务列表）/ cards（卡片网格）/ chat（对话流）
//        / stats（指标卡 + 图表块）/ split（左右分栏）/ list（分组行式清单）
// 量化参数（min/gap/side-w）由使用页传入，与实际布局一致避免加载完成时重排跳变
import { computed } from 'vue'

defineOptions({ name: 'BuddySkeleton' })

const props = defineProps({
  type: {
    type: String,
    default: 'rows'
  },
  // 骨架单元数量（chat 型为问答组数的 2 倍；tasks/list 为总条目数，2 组均分）
  count: {
    type: Number,
    default: 4
  },
  // cards 型网格最小列宽（与实际页 grid minmax 一致，默认 250 同 ob-cards-grid）
  min: {
    type: Number,
    default: 250
  },
  // cards 型网格间距（ob-cards-grid 为 14）
  gap: {
    type: Number,
    default: 14
  },
  // split 型左栏宽度（与实际页窄栏一致）
  sideW: {
    type: Number,
    default: 240
  }
})

// chat 型分组数（count 折半，至少 2 组）
const groups = computed(() => Math.max(2, Math.ceil(props.count / 2)))
// tasks 型每组条目数（count 总数 2 组均分）
const tasksPerGroup = computed(() => Math.max(2, Math.ceil(props.count / 2)))
// list 型每组行数（count 总数 2 组均分）
const listRowsPerGroup = computed(() => Math.max(3, Math.ceil(props.count / 2)))
// cards 型网格样式：列宽/间距与实际页一致
const gridStyle = computed(() => ({
  gridTemplateColumns: 'repeat(auto-fill, minmax(' + props.min + 'px, 1fr))',
  gap: props.gap + 'px'
}))

// 伪随机行宽（百分比）：避免所有行等宽显得呆板
function lineW(i, base, spread) {
  return (base + ((i * 37) % spread)) + '%'
}
// 用户气泡宽度：max 85% 内伪随机（对齐实际气泡随内容收缩）
function bubbleW(g) {
  return (32 + ((g * 23) % 28)) + '%'
}
</script>

<style lang="scss" scoped>
/* 中性灰基底（深浅色主题均可读），shimmer 高光扫过 */
$sk-base: rgba(125, 125, 135, 0.14);
$sk-hi: rgba(125, 125, 135, 0.28);
/* 用户气泡：低饱和主题色（对齐实际主题色渐变气泡，降低加载完成后的色彩跳变） */
$sk-bubble-base: rgba(var(--primary-color-rgb), 0.32);
$sk-bubble-hi: rgba(var(--primary-color-rgb), 0.48);

.ob-skeleton {
  width: 100%;
}

/* shimmer 公共占位块 */
.sk-line,
.sk-dot,
.sk-icon,
.sk-bubble,
.sk-card,
.sk-stat-card,
.sk-tag,
.sk-btn,
.sk-search,
.sk-chart,
.sk-task-title,
.sk-task-ico,
.sk-task-line,
.sk-list-title-ico {
  display: block;
  background: linear-gradient(90deg, $sk-base 25%, $sk-hi 50%, $sk-base 75%);
  background-size: 400% 100%;
  animation: sk-shimmer 1.4s ease infinite;
}

/* 用户气泡单独用主题色渐变（与灰基底区分角色） */
.sk-bubble {
  background: linear-gradient(90deg, $sk-bubble-base 25%, $sk-bubble-hi 50%, $sk-bubble-base 75%);
  background-size: 400% 100%;
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

  /* list 行内小图标（能力清单行 40px 高，图标 16px 量级） */
  &.sm {
    width: 18px;
    height: 18px;
    border-radius: 6px;
  }
}

/* ===== tasks：侧栏任务列表（分组标题 + 单行条目，贴 32px 行节奏） ===== */
.sk-task-group + .sk-task-group {
  margin-top: 6px;
}

.sk-task-title {
  height: 11px;
  width: 46%;
  border-radius: 4px;
  margin: 8px 10px 5px 10px;
}

.sk-task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px 8px 26px;
}

.sk-task-ico {
  width: 14px;
  height: 14px;
  border-radius: 5px;
  flex-shrink: 0;
}

.sk-task-line {
  height: 11px;
  border-radius: 5px;
}

/* ===== cards：卡片网格（对齐 ob-grid-card：logo38 + 双行 + 胶囊 + foot） ===== */
.sk-card {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: transparent;
}

.sk-card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}

.sk-icon {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  flex-shrink: 0;
}

.sk-card-titles {
  gap: 6px;
  padding-top: 2px;
}

/* 胶囊标签（凭据变量 / 标签行） */
.sk-tag {
  height: 22px;
  width: 52%;
  border-radius: 999px;
}

/* 底部操作行：上分隔线 + 左信息块 + 右两个小按钮（对齐 ob-card-foot） */
.sk-card-foot {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  gap: 8px;

  .sk-line {
    flex: 1;
  }
}

/* 小操作按钮块 */
.sk-btn {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  flex-shrink: 0;
}

/* ===== chat：对话流（对齐 ob-messages 20px 消息间距与全宽助手内容） ===== */
.sk-chat {
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 10px 0;
}

.sk-chat-group {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

/* 用户气泡骨架：右对齐圆角块（宽度由 bubbleW 伪随机，上限 60%） */
.sk-bubble {
  align-self: flex-end;
  max-width: 85%;
  min-width: 140px;
  height: 40px;
  border-radius: 14px;
}

/* 助手回答骨架：全宽多行文字（对齐助手气泡 width:100% 纯内容形态） */
.sk-assist {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ===== stats：指标卡 + 图表块 ===== */
.sk-stats {
  display: flex;
  flex-direction: column;
  gap: 14px;
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

/* 图表块：柱状图 / 饼图 / TOP5 榜单容器（高 240 同实际图表区） */
.sk-chart {
  height: 240px;
  border-radius: 12px;
}

.sk-chart-cols {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
}

/* ===== split：左右分栏（左窄栏 + 右面板行） ===== */
.sk-split {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.sk-split-side {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
}

/* 左栏搜索框块 */
.sk-search {
  height: 32px;
  border-radius: 8px;
  margin: 2px 10px 8px;
}

.sk-side-lines {
  gap: 5px;
}

/* 右侧主区：面板容器 + 多列并排行（近似规则表 grid 列） */
.sk-split-main {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 6px 14px;
}

.sk-table-row {
  display: grid;
  grid-template-columns: minmax(80px, 1fr) minmax(100px, 1.4fr) 52px 24px;
  gap: 10px;
  align-items: center;
  padding: 11px 0;

  & + .sk-table-row {
    border-top: 1px solid var(--border-color);
  }
}

/* ===== list：分组行式清单（macOS 设置风格圆角面板） ===== */
.sk-list-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 14px 8px 8px;

  .sk-line {
    width: 110px;
  }
}

.sk-list-title-ico {
  width: 16px;
  height: 16px;
  border-radius: 5px;
  flex-shrink: 0;
}

.sk-list-panel {
  border: 1px solid var(--border-color);
  border-radius: 12px;
  margin-right: 8px;
  padding: 4px 14px;
}

.sk-list-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 6px 0;

  & + .sk-list-row {
    border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.05));
  }

  .sk-line:not(.list-desc) {
    width: 90px;
    flex-shrink: 0;
  }

  .list-desc {
    flex: 1;
    min-width: 0;
  }

  .sk-btn {
    margin-left: auto;
    width: 56px;
    height: 22px;
    border-radius: 999px;
  }
}
</style>
