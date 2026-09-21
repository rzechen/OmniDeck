<template>
  <!-- 顶部多 tab 页签：打开的任务会话 + 固定的新建页签 -->
  <div class="buddy-tabs" ref="tabs">
    <transition-group name="buddy-tab" tag="div" class="buddy-tabs-inner">
      <!-- 会话页签 -->
      <div
        v-for="t in tabs"
        :key="t.id"
        class="buddy-tab"
        :class="{ active: t.id === activeTabId, dirty: t.id === activeTabId }"
        :title="t.title"
        @click="$emit('select', t.id)"
        @mouseenter="onEnter"
        @mouseleave="onLeave"
      >
        <svg-icon :icon-class="t.branch ? 'share' : 'chat-dot-round'" class="buddy-tab-ico" />
        <span class="buddy-tab-name"><span class="buddy-tab-inner">{{ t.title }}</span></span>
        <span class="buddy-tab-close" title="关闭页签" @click.stop="$emit('close', t.id)">
          <svg-icon icon-class="close" />
        </span>
      </div>
    </transition-group>
  </div>
</template>

<script>
// OmniBuddy 顶栏多 tab 页签（类浏览器）：会话以页签形式打开
// 打开状态由布局管理（tabs: [{ id, title }]），纯展示组件
export default {
  name: 'BuddyTabs',
  props: {
    tabs: {
      type: Array,
      default: () => []
    },
    activeTabId: {
      type: String,
      default: ''
    }
  },
  methods: {
    // 页签名 hover 滚动（复用任务列表的滚动策略）
    onEnter(e) {
      const wrap = e.currentTarget.querySelector('.buddy-tab-name')
      const inner = wrap && wrap.firstElementChild
      if (!wrap || !inner) return
      const diff = inner.scrollWidth - wrap.clientWidth
      wrap.classList.remove('scrolling')
      if (diff > 4) {
        wrap.style.setProperty('--scroll-x', -(diff + 4) + 'px')
        void wrap.offsetWidth
        wrap.classList.add('scrolling')
      }
    },
    onLeave(e) {
      const wrap = e.currentTarget.querySelector('.buddy-tab-name')
      if (wrap) wrap.classList.remove('scrolling')
    }
  }
}
</script>

<style lang="scss" scoped>
.buddy-tabs {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  align-items: stretch;
  -webkit-app-region: no-drag;
  overflow: hidden;
}

.buddy-tabs-inner {
  display: flex;
  align-items: stretch;
  height: 100%;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    display: none;
  }
}

.buddy-tab {
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 180px;
  min-width: 0;
  padding: 0 8px 0 12px;
  margin: 5px 4px 0;
  border-radius: 10px 10px 0 0;
  font-size: 12px;
  color: $text-secondary;
  cursor: pointer;
  flex-shrink: 0;
  white-space: nowrap;
  position: relative;
  transition: background 0.15s ease, color 0.15s ease;

  .buddy-tab-ico {
    font-size: 12px;
    flex-shrink: 0;
  }

  .buddy-tab-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;

    .buddy-tab-inner {
      display: block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }

    &.scrolling .buddy-tab-inner {
      max-width: none;
      overflow: visible;
      text-overflow: clip;
      animation: buddy-tab-scroll 3.5s ease-in-out 0.35s forwards;
    }
  }

  /* 关闭钮：hover 页签时浮现 */
  .buddy-tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: 5px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s ease;

    .svg-icon {
      font-size: 11px;
    }

    &:hover {
      background: rgba(0, 0, 0, 0.1);
    }
  }

  &:hover {
    background: $sidebar-item-hover;
    color: $text-primary;

    .buddy-tab-close {
      opacity: 1;
    }
  }

  &.active {
    background: var(--card-bg, #fff);
    color: $text-primary;
    font-weight: 500;
    box-shadow: 0 -1px 4px rgba(0, 0, 0, 0.06);

    .buddy-tab-close {
      opacity: 1;
    }
  }
}

/* 页签名 hover 滚动动画 */
@keyframes buddy-tab-scroll {
  to {
    transform: translateX(var(--scroll-x, 0));
  }
}

/* 页签增删过渡 */
.buddy-tab-enter-active,
.buddy-tab-leave-active {
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
}

.buddy-tab-enter,
.buddy-tab-leave-to {
  opacity: 0;
  transform: scale(0.9);
}
</style>
