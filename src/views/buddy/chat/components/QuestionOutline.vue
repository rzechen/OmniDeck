<template>
  <!-- 问题导航指示器（极简）：右侧一列状态圆点（绿=完成/红=终止/黄=输出中/灰=等待），
       垂直居中常驻；鼠标悬停时浮出问题列表面板，点击圆点或列表项定位到对应问答位置 -->
  <aside class="ob-qnav">
    <!-- 指示器圆点列（常驻）：当前所在轮次高亮放大，点击直接定位 -->
    <div class="ob-qnav-dots">
      <span
        v-for="(q, i) in questions"
        :key="q.id || i"
        class="ob-qnav-dot"
        :class="[q.status, { active: q.id === activeId }]"
        :title="q.text"
        @click="$emit('locate', q)"
      ></span>
      <span v-if="!questions.length" class="ob-qnav-none"></span>
    </div>

    <!-- 问题列表面板：悬停指示器区域时浮出（圆点列 + 面板同属 hover 范围） -->
    <div class="ob-qnav-panel">
      <div class="ob-qnav-head">
        <span class="ob-qnav-title">问题导航</span>
        <span class="ob-qnav-count">{{ questions.length }} 轮</span>
      </div>
      <div class="ob-qnav-list">
        <div
          v-for="(q, i) in questions"
          :key="q.id || i"
          class="ob-qnav-item"
          :class="[{ active: q.id === activeId }, q.status]"
          @click="$emit('locate', q)"
          @mouseenter="onItemEnter"
          @mouseleave="onItemLeave"
        >
          <!-- 外层裁剪：超长问题默认省略号截断，hover 时内层从右向左滚动展示（同任务列表标题） -->
          <span class="ob-qnav-text"><span class="ob-qnav-text-inner">{{ i + 1 }}. {{ q.text }}</span></span>
          <span class="ob-qnav-status">{{ statusLabel(q.status) }}</span>
        </div>
        <div v-if="!questions.length" class="ob-qnav-empty">暂无问答轮次</div>
      </div>
    </div>
  </aside>
</template>

<script>
// OmniBuddy 问题导航指示器（圆点 + 悬停面板）
// questions：[{ id：用户消息 id, text：截断后的问题文本, status：done|stopped|running|pending }]
// activeId：当前视口所在的轮次（页面根据滚动位置计算）
export default {
  name: 'QuestionOutline',
  props: {
    questions: {
      type: Array,
      default: () => []
    },
    activeId: {
      type: String,
      default: ''
    }
  },
  methods: {
    statusLabel(s) {
      return {
        done: '已完成',
        stopped: '已终止',
        running: '输出中',
        pending: '等待回答'
      }[s] || ''
    },
    // ===== 问题文本 hover 滚动（超长从右向左滚完，同任务列表标题的交互） =====
    onItemEnter(e) {
      const wrap = e.currentTarget.querySelector('.ob-qnav-text')
      const inner = wrap && wrap.firstElementChild
      if (!wrap || !inner) return
      const diff = inner.scrollWidth - wrap.clientWidth
      wrap.classList.remove('scrolling')
      if (diff > 4) {
        // 宽度差写入 CSS 变量，重置动画后播放（从 0 滚到 -diff）
        wrap.style.setProperty('--scroll-x', -(diff + 4) + 'px')
        void wrap.offsetWidth // 强制 reflow 以重启动画
        wrap.classList.add('scrolling')
      }
    },
    onItemLeave(e) {
      const wrap = e.currentTarget.querySelector('.ob-qnav-text')
      if (wrap) wrap.classList.remove('scrolling')
    }
  }
}
</script>

<style lang="scss" scoped>
/* ===== 指示器轨道：绝对定位悬浮于对话区右侧留白区中部（920px 内容列之外），
       不占 flex 宽；面板为其 hover 浮层 ===== */
.ob-qnav {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: calc((100% - 976px) / 2);
  min-width: 26px;
  pointer-events: none; // 轨道空白不拦截消息区交互，圆点与面板单独恢复
}

/* ===== 圆点列（常驻，页面垂直居中，锚在留白区横向中部） ===== */
.ob-qnav-dots {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  max-height: 62vh;
  overflow-y: auto;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 13px;
  // 左右留白：给 hover/active 放大与外圈光环留出空间，滚动容器不裁剪变形
  padding: 10px 7px;
  scrollbar-width: none;
  pointer-events: auto; // 恢复交互（轨道空白不拦截）

  &::-webkit-scrollbar {
    display: none;
  }
}

.ob-qnav-dot {
  flex-shrink: 0;
  // 宽高全部锁死，杜绝任何 flex 拉伸/压缩导致的变形
  width: 9px;
  height: 9px;
  min-width: 9px;
  max-width: 9px;
  min-height: 9px;
  max-height: 9px;
  border-radius: 50%;
  background: var(--border-color);
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: scale(1.45);
  }

  /* 当前所在轮次：放大 + 外圈 */
  &.active {
    transform: scale(1.35);

    &:hover {
      transform: scale(1.6);
    }
  }

  /* 状态配色 */
  &.done { background: #67C23A; }
  &.stopped { background: var(--danger-color); }
  &.running {
    background: var(--warning-color);
    animation: ob-qnav-blink 1.2s ease-in-out infinite;
  }

  &.active {
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);

    &.running { box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.2); }
    &.done { box-shadow: 0 0 0 3px rgba(103, 194, 58, 0.18); }
    &.stopped { box-shadow: 0 0 0 3px rgba(245, 108, 108, 0.18); }
  }
}

/* 输出中：呼吸闪烁 */
@keyframes ob-qnav-blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.35; }
}

/* 空态占位（保持轨道高度塌缩为单点） */
.ob-qnav-none {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--border-color);
  opacity: 0.4;
}

/* ===== 问题列表面板：悬停浮出，垂直居中锚在圆点列左侧 ===== */
.ob-qnav-panel {
  position: absolute;
  // 可视面板右缘距圆点列 14px；与圆点之间的悬停桥由 ::after 承担（不参与阴影）
  right: calc(50% + 14px);
  top: 50%;
  transform: translateY(-50%) translateX(4px);
  width: 264px;
  max-height: min(480px, 72vh);
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: var(--card-bg, #fff);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.14), 0 0 0 1px rgba(0, 0, 0, 0.04);
  opacity: 0;
  visibility: hidden;
  pointer-events: none;
  transition: opacity 0.18s ease, transform 0.18s ease, visibility 0.18s;

  // 透明悬停桥：向右延伸盖住面板与圆点列之间的空隙（伪元素属于面板，hover 不断链，
  // 且不占盒子尺寸、不参与阴影计算，面板视觉宽度保持真实值）
  &::after {
    content: '';
    position: absolute;
    left: 100%;
    top: 0;
    bottom: 0;
    width: 44px;
  }
}

/* 悬停指示器整体（圆点列或面板自身）时浮出 */
.ob-qnav:hover .ob-qnav-panel {
  opacity: 1;
  visibility: visible;
  pointer-events: auto;
  transform: translateY(-50%) translateX(0);
}

.ob-qnav-head {
  display: flex;
  align-items: baseline;
  gap: 6px;
  flex-shrink: 0;
  padding: 12px 14px 8px;
}

.ob-qnav-title {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--text-secondary);
}

.ob-qnav-count {
  margin-left: auto;
  font-size: 10.5px;
  color: var(--text-secondary);
  opacity: 0.7;
}

/* ===== 列表 ===== */
.ob-qnav-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 2px 8px 10px;

  &::-webkit-scrollbar {
    width: 4px;
  }
}

.ob-qnav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;

  &:hover {
    background: var(--search-bg-hover, rgba(0, 0, 0, 0.05));

    .ob-qnav-text {
      color: var(--text-primary);
    }
  }

  &.active .ob-qnav-text {
    color: var(--text-primary);
    font-weight: 600;
  }
}

.ob-qnav-text {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  line-height: 17px;
  color: var(--text-secondary);
  // 外层裁剪：超长问题默认省略号截断，hover 时内层从右向左滚动展示
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  .ob-qnav-text-inner {
    display: block;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    will-change: transform;
  }

  &.scrolling .ob-qnav-text-inner {
    max-width: none;
    overflow: visible;
    text-overflow: clip;
    animation: ob-qnav-scroll 3.5s ease-in-out 0.35s forwards;
  }
}

/* 问题文本 hover 滚动：从 0 滚到 --scroll-x */
@keyframes ob-qnav-scroll {
  to {
    transform: translateX(var(--scroll-x, 0));
  }
}

.ob-qnav-status {
  flex-shrink: 0;
  font-size: 10.5px;

  .done & { color: #67C23A; }
  .stopped & { color: var(--danger-color); }
  .running & { color: var(--warning-color); }
  .pending & { color: var(--text-secondary); }
}

.ob-qnav-empty {
  padding: 16px 12px;
  font-size: 12px;
  color: var(--text-secondary);
  opacity: 0.7;
  text-align: center;
}
</style>
