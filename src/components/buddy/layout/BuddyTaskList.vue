<template>
  <!-- 任务列表：按工作空间展示名分组（无展示名按磁盘路径） -->
  <div class="buddy-tasks">
    <!-- 加载骨架：会话首次拉取期间替代列表与空态（分组标题 + 单行条目，贴任务行节奏） -->
    <buddy-skeleton v-if="loading" type="tasks" :count="5" />

    <!-- 空状态：在剩余区域内垂直水平居中 -->
    <div v-else-if="!groups.length" class="buddy-chat-empty">
      <div class="buddy-chat-empty-icon">
        <svg-icon icon-class="chat-dot-round" />
      </div>
      <p class="buddy-chat-empty-title">暂无任务</p>
      <p class="buddy-chat-empty-desc">点击左上角「+」新建任务</p>
    </div>

    <div v-for="g in groups" :key="g.key" class="buddy-group">
      <!-- 分组标题：展示名（无则磁盘路径），title 提示完整路径 -->
      <div class="buddy-group-title" :title="g.dir">
        <svg-icon icon-class="folder" class="buddy-group-ico" />
        <span class="buddy-group-name">{{ g.name }}</span>
        <span class="buddy-group-count">{{ g.chats.length }}</span>
      </div>

      <template v-for="(sec, si) in g.sections">
        <!-- 置顶区起始：带「置顶」文字的分隔线 -->
        <div v-if="sec.pinned" :key="'ph' + si" class="buddy-pin-divider">
          <span class="buddy-pin-divider-line"></span>
          <span class="buddy-pin-divider-text">置顶</span>
          <span class="buddy-pin-divider-line"></span>
        </div>
        <!-- 置顶区收尾：普通段前的闭合细线（与上方「置顶」线围出完整区域） -->
        <div v-if="!sec.pinned && si > 0" :key="'pe' + si" class="buddy-pin-divider buddy-pin-divider-end">
          <span class="buddy-pin-divider-line"></span>
        </div>

        <div
          v-for="c in sec.chats"
          :key="c.id"
          class="buddy-chat"
          :class="{ active: c.id === activeChatId, running: !!stateOf(c) }"
          @click="$emit('select-chat', c.id)"
          @mouseenter="onChatEnter"
          @mouseleave="onChatLeave"
        >
          <!-- 实时状态标记（store 会话池）：流式输出中 = 主色转圈；待权限确认 = 黄点 -->
          <svg-icon
            v-if="stateOf(c) === 'streaming'"
            icon-class="loading"
            class="buddy-state-spin"
            title="回答生成中"
          />
          <span
            v-else-if="stateOf(c) === 'pending'"
            class="buddy-state-pending"
            title="等待权限确认"
          ></span>
          <!-- 分叉创建的会话用 fork 图标（与气泡分叉按钮同图标，不做常亮高亮） -->
          <svg-icon v-else :icon-class="c.branch ? 'fork' : 'chat-dot-round'" />
          <span class="buddy-chat-name"><span class="ob-name-inner">{{ c.title }}</span></span>
          <span class="buddy-chat-actions" @click.stop>
            <!-- 置顶：已置顶时常亮显示（hover 外也可见，颜色不变），未置顶时随行 hover 浮现 -->
            <svg-icon
              icon-class="pin"
              class="ob-pin"
              :class="{ pinned: c.pinned }"
              :title="c.pinned ? '取消置顶' : '置顶'"
              @click.stop="$emit('pin-chat', c)"
            />
            <svg-icon icon-class="edit" class="ob-edit" title="重命名" @click.stop="$emit('rename-chat', c)" />
            <svg-icon icon-class="delete" class="ob-del" title="删除任务" @click.stop="$emit('delete-chat', c)" />
          </span>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
// OmniBuddy 侧边栏任务列表：按会话工作空间的展示名（displayName）分组
// 分组名 = displayName || workspaceDir（快照自会话元数据），纯展示组件
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'

export default {
  name: 'BuddyTaskList',
  components: { BuddySkeleton },
  props: {
    // 会话列表（主进程持久化，含 workspaceDir/displayName）
    chats: {
      type: Array,
      default: () => []
    },
    activeChatId: {
      type: String,
      default: ''
    },
    // 会话列表加载中（侧栏以骨架替代列表与空态）
    loading: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    // 按展示名分组（组间按组内最新会话时间倒序，组内置顶优先再按更新时间倒序）
    groups() {
      const map = {}
      for (const c of this.chats) {
        const name = (c.displayName && c.displayName.trim()) || c.workspaceDir || '未关联目录'
        if (!map[name]) {
          map[name] = { key: name, name, dir: c.workspaceDir || '', chats: [], latest: 0, hasPinned: false }
        }
        map[name].chats.push(c)
        if (c.updatedAt > map[name].latest) map[name].latest = c.updatedAt
        if (c.pinned) map[name].hasPinned = true
      }
      return Object.values(map)
        .map(g => {
          // 组内排序：置顶优先（按置顶时间倒序），其余按更新时间倒序
          g.chats.sort((a, b) => {
            const pa = a.pinned ? 1 : 0
            const pb = b.pinned ? 1 : 0
            if (pa !== pb) return pb - pa
            if (pa === 1) return (b.pinnedAt || 0) - (a.pinnedAt || 0)
            return b.updatedAt - a.updatedAt
          })
          // 拆置顶/普通两段渲染（置顶段前带「置顶」分隔线区隔）
          const pinned = g.chats.filter(c => c.pinned)
          const normal = g.chats.filter(c => !c.pinned)
          g.sections = []
          if (pinned.length) g.sections.push({ pinned: true, chats: pinned })
          if (normal.length) g.sections.push({ pinned: false, chats: normal })
          return g
        })
        // 组间排序：含置顶任务的组优先（组内最新置顶时间倒序），其余按组内最新会话时间倒序
        .sort((a, b) => {
          if (a.hasPinned !== b.hasPinned) return a.hasPinned ? -1 : 1
          if (a.hasPinned) {
            const pa = Math.max(...a.chats.filter(c => c.pinned).map(c => c.pinnedAt || 0))
            const pb = Math.max(...b.chats.filter(c => c.pinned).map(c => c.pinnedAt || 0))
            return pb - pa
          }
          return b.latest - a.latest
        })
    }
  },
  methods: {
    // 会话实时状态（store 会话池快照）：streaming = 流式输出中 / pending = 待权限确认
    stateOf(c) {
      const s = this.$store.getters['buddyChat/session'](c.id)
      if (!s) return ''
      if (s.streaming) return 'streaming'
      if (s.permQueue && s.permQueue.length) return 'pending'
      return ''
    },
    // ===== 对话名称 hover 滚动（超长标题从右向左滚动展示） =====
    onChatEnter(e) {
      const wrap = e.currentTarget.querySelector('.buddy-chat-name')
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
    onChatLeave(e) {
      const wrap = e.currentTarget.querySelector('.buddy-chat-name')
      if (wrap) wrap.classList.remove('scrolling')
    }
  }
}
</script>

<style lang="scss" scoped>
.buddy-tasks {
  flex: 1;
  display: flex;
  flex-direction: column;
}

/* 分组容器 */
.buddy-group {
  margin-bottom: 10px;
}

/* 组内「置顶」分隔线：置顶段与普通段交界（线 - 文字 - 线） */
.buddy-pin-divider {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px 3px;
  margin-top: 2px;

  .buddy-pin-divider-line {
    flex: 1;
    height: 1px;
    background: $sidebar-item-hover;
  }

  .buddy-pin-divider-text {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 1px;
    color: var(--primary-color);
    opacity: 0.85;
  }
}

/* 置顶区收尾线：稍深更醒目（围出置顶区域，与普通任务明确分区） */
.buddy-pin-divider-end {
  margin-top: 0;
  padding: 2px 10px 4px;

  .buddy-pin-divider-line {
    background: var(--border-color);
  }
}

/* 分组标题：展示名 + 计数 */
.buddy-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px 5px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: $text-secondary;
  white-space: nowrap;

  .buddy-group-ico {
    font-size: 12px;
    flex-shrink: 0;
    color: $text-secondary;
  }

  .buddy-group-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .buddy-group-count {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 500;
    color: $text-secondary;
    background: $sidebar-item-hover;
    border-radius: 999px;
    padding: 0 6px;
    line-height: 15px;
  }
}

/* 对话项：缩进于分组标题之下（视觉层级） */
.buddy-chat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 7px 26px;
  border-radius: $radius-sm;
  color: $text-sidebar;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 1px;

  > .svg-icon {
    font-size: 13px;
    color: $text-secondary;
    flex-shrink: 0;
  }

  .buddy-chat-name {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    white-space: nowrap;
    overflow: hidden;

    /* 内层承载文字：默认省略号截断，hover 超长时从右向左滚动 */
    .ob-name-inner {
      display: block;
      max-width: 100%;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      will-change: transform;
    }

    &.scrolling .ob-name-inner {
      max-width: none;
      overflow: visible;
      text-overflow: clip;
      animation: ob-name-scroll 3.5s ease-in-out 0.35s forwards;
    }
  }

  &:hover {
    background: $sidebar-item-hover;
    color: $text-primary;

    .buddy-chat-actions {
      opacity: 1;
    }
  }

  &.active {
    background: rgba(var(--primary-color-rgb), 0.1);

    > .svg-icon {
      color: var(--primary-color);
    }
  }
}

/* 对话名称 hover 滚动动画（滚动量由 --scroll-x 变量按溢出宽度注入） */
@keyframes ob-name-scroll {
  to {
    transform: translateX(var(--scroll-x, 0));
  }
}

/* 对话空态：铺满任务列表剩余空间垂直水平居中（不拦截点击） */
.buddy-chat-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  /* 视觉重心略上移（完全居中显偏下） */
  padding: 12px 10px 14%;
  gap: 3px;
  text-align: center;
  pointer-events: none;

  .buddy-chat-empty-icon {
    width: 40px;
    height: 40px;
    border-radius: 14px;
    background: $sidebar-item-hover;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 6px;

    .svg-icon {
      font-size: 19px;
      color: $text-secondary;
    }
  }

  .buddy-chat-empty-title {
    font-size: 12px;
    font-weight: 600;
    color: $text-primary;
    margin: 0;
  }

  .buddy-chat-empty-desc {
    font-size: 11px;
    color: $text-secondary;
    margin: 0;
    line-height: 1.5;
  }
}

/* 对话行内操作：默认隐藏、hover 浮现。
   注意：不能在父容器上整体 opacity（子元素无法穿透），需按图标单独控制，
   否则置顶常亮标识会一并被隐藏 */
.buddy-chat-actions {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;

  .svg-icon {
    font-size: 12px;
    margin: 0 3px;
    color: $text-secondary;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s ease, color 0.15s ease;

    &:hover {
      color: var(--primary-color);
    }

    &.ob-del:hover {
      color: var(--danger-color);
    }
  }
}

/* 行 hover：操作图标全部浮现 */
.buddy-chat:hover .buddy-chat-actions .svg-icon {
  opacity: 1;
}

/* 任务运行中（流式输出/待权限确认）：hover 不浮现重命名与删除，且不可点击，防误操作 */
.buddy-chat.running:hover .buddy-chat-actions .ob-edit,
.buddy-chat.running:hover .buddy-chat-actions .ob-del {
  opacity: 0;
  pointer-events: none;
}

/* 已置顶：置顶钮常亮（hover 区外也可见），颜色与普通图标一致不高亮 */
.buddy-chat .ob-pin.pinned {
  opacity: 1;
}

/* ===== 实时状态标记 ===== */
/* 流式输出中：主色转圈（行首图标位替换） */
.buddy-state-spin {
  font-size: 13px;
  color: var(--primary-color);
  flex-shrink: 0;
  animation: buddy-task-spin 0.9s linear infinite;
}

@keyframes buddy-task-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* 待权限确认：琥珀色圆点（带柔光晕，行首图标位替换） */
.buddy-state-pending {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--warning-color);
  box-shadow: 0 0 0 3px rgba(230, 162, 60, 0.2);
  flex-shrink: 0;
}
</style>
