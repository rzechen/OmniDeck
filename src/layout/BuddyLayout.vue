<template>
  <div class="buddy-layout">
    <!-- 主体：侧边栏（红绿灯让位行 + logo 区 + 菜单 + 任务列表，可拖宽/收起）+ 主区 -->
    <div class="buddy-body">
      <aside
        class="buddy-sidebar"
        :class="{ collapsed, dragging }"
        :style="{ width: (collapsed ? collapsedW : sidebarW) + 'px' }"
      >
        <!-- 顶部让位行：macOS 红绿灯独占（与主布局 Sidebar 的 sidebar-topbar 一致，
             侧栏通到窗口顶部，红绿灯悬浮于侧栏左上） -->
        <div class="buddy-sidebar-topbar"></div>

        <!-- 顶部：logo + 标题 + 新建任务 -->
        <div class="buddy-sidebar-head">
          <div class="buddy-logo-icon">
            <img src="@/assets/logo.png" alt="OmniDeck" class="buddy-logo-img" />
          </div>
          <span v-if="!collapsed" class="buddy-logo-text">OmniBuddy</span>
          <!-- 新建任务 + 清空本地数据（测试初始化用，两钮并排靠右） -->
          <div v-if="!collapsed" class="buddy-head-actions">
            <div
              class="buddy-new-icon"
              title="新建任务"
              @click="onNewChat"
            >
              <svg-icon icon-class="plus" />
            </div>
            <div
              class="buddy-clear-icon"
              title="清空本地数据（恢复初始化状态并重启）"
              @click="clearLocalData"
            >
              <svg-icon icon-class="delete" />
            </div>
          </div>
        </div>

        <div class="buddy-scroll">
          <!-- 收起态新建任务入口（头部 + 按钮因红绿灯让位被隐藏，补在菜单顶部） -->
          <div
            v-if="collapsed"
            class="buddy-collapse-new"
            title="新建任务"
            @click="onNewChat"
          >
            <svg-icon icon-class="plus" />
          </div>

          <!-- 菜单区（分组）：资源市场 → 能力（技能/连接器/项目规则/权限策略）→ 配置（工作空间/模型供应商）→ 用量统计/能力清单 -->
          <nav class="buddy-menu">
            <div
              v-for="(group, gi) in menuGroups"
              :key="group.title || 'g' + gi"
              class="buddy-menu-group"
            >
              <div v-if="group.title && !collapsed" class="buddy-menu-group-title">{{ group.title }}</div>
              <div
                v-for="m in group.items"
                :key="m.name"
                class="buddy-menu-item"
                :class="{ active: $route.name === m.name, indented: !!group.title }"
                :title="m.label"
                @click="goRoute(m.path)"
              >
                <span class="buddy-ico-wrap">
                  <svg-icon :icon-class="m.icon" class="buddy-menu-ico" />
                </span>
                <span class="buddy-menu-label">{{ m.label }}</span>
              </div>
            </div>
          </nav>

          <!-- 任务列表（主进程 JSONL 持久化，按展示名分组） -->
          <div class="buddy-section buddy-section-chats">
            <div class="buddy-section-title">任务列表</div>
            <!-- 收起态任务列表图标入口：点击展开侧栏查看列表 -->
            <div
              v-if="collapsed"
              class="buddy-collapse-tasks"
              title="任务列表（展开侧栏）"
              @click="toggleSidebar"
            >
              <svg-icon icon-class="chat-dot-round" />
            </div>
            <buddy-task-list
              v-else
              :chats="chats"
              :active-chat-id="activeChatId"
              :loading="chatsLoading"
              @select-chat="onSelectChat"
              @rename-chat="renameChat"
              @delete-chat="confirmDeleteChat"
            />
          </div>
        </div>

        <!-- 底部：返回 OmniDeck（与主布局 OmniBuddy 入口对称的渐变胶囊） -->
        <div class="buddy-sidebar-footer">
          <div class="buddy-back-entry" title="返回 OmniDeck" @click="goMain">
            <span class="buddy-back-entry-icon">
              <svg-icon icon-class="back" class="buddy-back-entry-svg" />
            </span>
            <span class="buddy-back-entry-text">返回 OmniDeck</span>
          </div>
        </div>

        <!-- 右缘拖拽手柄：调宽 / 左拖过阈值收起 -->
        <div
          v-if="!collapsed"
          class="buddy-resizer"
          @mousedown="onResizeStart"
        ></div>
      </aside>

      <!-- 侧边栏垂直居中开关（借鉴主布局折叠钮，随收起/展开平移） -->
      <div
        class="buddy-side-toggle"
        :class="{ dragging }"
        :style="{ left: (collapsed ? collapsedW : sidebarW) + 'px' }"
        title="切换侧边栏"
        @click="toggleSidebar"
      >
        <svg-icon :icon-class="collapsed ? 'expand' : 'fold'" class="buddy-side-toggle-ico" />
      </div>

      <!-- 主区：页签行 + 对话/管理页（参考 Deck：Topbar 位换为页签栏 + 设置入口） -->
      <div class="buddy-right">
        <!-- 顶部页签行：页签本体/设置钮可点，空白处可拖动窗口 -->
        <div class="buddy-tags-row">
          <TagsBar side="buddy" class="buddy-tags-row-bar" />
          <div class="buddy-tags-row-actions">
            <global-topbar-actions />
          </div>
        </div>
        <div class="buddy-main">
          <keep-alive :max="10">
            <router-view :key="buddyTabKey" />
          </keep-alive>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import BuddyTaskList from '@/components/buddy/layout/BuddyTaskList.vue'
import GlobalTopbarActions from '@/components/common/GlobalTopbarActions.vue'
import TagsBar from '@/components/common/TagsBar.vue'
import { getItem, setItem, clearAll } from '@/utils/db'

// OmniBuddy 视图壳：与主 Layout 平级的独立视图
// 顶部页签条（TagsBar + 设置入口）+ 侧边栏（新建入口 + 菜单 + 任务列表，可拖宽/收起）+ 主区（对话/管理页）
export default {
  name: 'BuddyLayout',
  components: { BuddyTaskList, GlobalTopbarActions, TagsBar },
  data() {
    return {
      // 侧边栏菜单（分组，置于任务列表上方）：市场独立置顶 → 能力（含定时任务）→ 配置 → 用量统计独立
      // 命名与分组对齐业界（Claude Capabilities / Cursor Customize）：技能+规则+连接器聚合为「能力」
      menuGroups: [
        {
          title: '',
          items: [
            { label: '资源市场', name: 'OmniBuddyMarket', path: '/omnibuddy/market', icon: 'market' }
          ]
        },
        {
          title: '能力',
          items: [
            { label: '技能', name: 'OmniBuddySkills', path: '/omnibuddy/skills', icon: 'skill' },
            { label: '连接器', name: 'OmniBuddyMcp', path: '/omnibuddy/mcp', icon: 'mcp' },
            { label: '定时任务', name: 'OmniBuddyAutomation', path: '/omnibuddy/automation', icon: 'auto' },
            { label: '项目规则', name: 'OmniBuddyRules', path: '/omnibuddy/rules', icon: 'rules' },
            { label: '记忆管理', name: 'OmniBuddyMemory', path: '/omnibuddy/memory', icon: 'memory' },
            { label: '权限策略', name: 'OmniBuddyPermissions', path: '/omnibuddy/permissions', icon: 'key' }
          ]
        },
        {
          title: '配置',
          items: [
            { label: '工作空间', name: 'OmniBuddyWorkspace', path: '/omnibuddy/workspace', icon: 'folder' },
            { label: '模型供应商', name: 'OmniBuddyProviders', path: '/omnibuddy/providers', icon: 'llm' }
          ]
        },
        {
          title: '',
          items: [
            { label: '用量统计', name: 'OmniBuddyUsage', path: '/omnibuddy/usage', icon: 'tickets' },
            { label: '能力清单', name: 'OmniBuddyCapabilities', path: '/omnibuddy/capabilities', icon: 'tool' }
          ]
        }
      ],
      // 会话列表（主进程 JSONL 持久化，按更新时间倒序）
      chats: [],
      // 会话列表首次加载中，侧栏显示骨架
      chatsLoading: true,
      // ===== 侧边栏宽度 / 收起 =====
      // 展开宽度（可拖拽调整，持久化）
      sidebarW: getItem('omnibuddy:sidebar-w', 260),
      // 收起宽度：图标缩略栏（与主布局 $sidebar-collapsed-width 一致）
      collapsedW: 56,
      // 收起状态（持久化）
      collapsed: getItem('omnibuddy:sidebar-collapsed', false),
      // 拖拽中（宽度跟随鼠标，禁用过渡）
      dragging: false
    }
  },
  computed: {
    // 当前激活会话 id（由对话页路由 query.s 驱动）
    activeChatId() {
      return this.$route.query.s || ''
    },
    // 页签缓存 key：keep-alive 以 vnode.key 缓存，每个页签（每个会话）独立一份组件实例
    buddyTabKey() {
      return this.$store.getters['tagsView/keyOf']('buddy', this.$route.fullPath)
    }
  },
  watch: {
    // 会话列表变化（新建/删除/他处刷新）后同步会话页签标题
    chats: {
      handler() {
        this.syncChatTabTitles()
      }
    },
    // 切换会话页签后补齐新登记页签的标题
    activeChatId() {
      this.syncChatTabTitles()
    },
    // 会话池 UI 事件（与 chat 实例共用 claim 认领去重）：
    // perm-pending = 权限确认到达但当前页签不是该会话（浮动条不可见），
    // 弹持续通知引导跳转，避免隐形挂起直到主进程超时拒绝
    '$store.state.buddyChat.notice': {
      immediate: true,
      deep: true,
      handler(list) {
        this.consumePermNotices(list)
      }
    }
  },
  created() {
    this.loadChats()
    // 对话页创建/更新会话后刷新列表
    this.$root.$on('omnibuddy:sessions-changed', this.loadChats)
    // 自动标题：主进程 LLM 生成新标题后实时刷新侧栏（store 事件池只写会话状态不外发，
    // 此处独立订阅；preload onEvent 返回退订函数，与 store 的订阅互不影响）
    const api = this.buddyApi()
    if (api && api.onEvent) {
      this._unsubTitle = api.onEvent(e => {
        if (!e) return
        if (e.type === 'title') {
          const c = this.chats.find(x => x.id === e.sessionId)
          if (c && c.title !== e.title) {
            c.title = e.title
            // chats 为浅 watch（不感知对象内部属性变化），手动同步页签标题
            this.syncChatTabTitles()
          }
          return
        }
        // 定时任务开始：侧栏任务列表实时出现新系统会话（「定时任务」分组）
        if (e.type === 'automation:run') {
          this.loadChats()
        }
      })
    }
    // 拖拽调宽的全局监听
    document.addEventListener('mousemove', this.onResizeMove)
    document.addEventListener('mouseup', this.onResizeEnd)
  },
  beforeDestroy() {
    this.$root.$off('omnibuddy:sessions-changed', this.loadChats)
    if (this._unsubTitle) {
      this._unsubTitle()
      this._unsubTitle = null
    }
    document.removeEventListener('mousemove', this.onResizeMove)
    document.removeEventListener('mouseup', this.onResizeEnd)
  },
  methods: {
    // 清空本地数据（测试初始化用）：与设置页「清除本地记录」同逻辑
    // 清空 IndexedDB/localStorage + 主进程删除 buddy 数据并重启
    async clearLocalData() {
      const yes = await this.$confirm(
        '将清除 OmniDeck 与 OmniBuddy 的全部本地数据（偏好设置、工具收藏、对话记录、空间与模型配置等），清除后应用将自动重启。此操作不可恢复，确定继续吗？',
        '清空本地数据',
        { confirmButtonText: '清除', cancelButtonText: '取消', type: 'warning' }
      ).then(() => true).catch(() => false)
      if (!yes) return
      // 渲染侧：清空 IndexedDB 与 localStorage
      await clearAll()
      try { localStorage.clear() } catch (e) { /* 忽略 */ }
      // 主进程：删除全部主进程数据并重启（非桌面端刷新页面兜底）
      if (window.electronAPI && window.electronAPI.resetAllData) {
        await window.electronAPI.resetAllData()
      } else {
        location.reload()
      }
    },
    // ===== 会话（对话）管理 =====
    // preload API（浏览器环境无 electronAPI 时返回空实现）
    buddyApi() {
      return (window.electronAPI && window.electronAPI.omnibuddy) || null
    },
    async loadChats() {
      this.chatsLoading = true
      try {
        const api = this.buddyApi()
        if (!api) {
          this.chats = []
          return
        }
        this.chats = await api.listSessions()
      } finally {
        this.chatsLoading = false
      }
    },
    // ===== 侧边栏拖拽调宽 / 收起 =====
    onResizeStart(e) {
      // 记录起点，进入拖拽（mousemove/mouseup 挂在 document 上）
      this._resizeX = e.clientX
      this._resizeW = this.sidebarW
      this.dragging = true
      // 拖拽期间禁用文本选择
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'
      e.preventDefault()
    },
    onResizeMove(e) {
      if (!this.dragging) return
      const w = this._resizeW + (e.clientX - this._resizeX)
      // 钳制在合理范围（200-420）
      this.sidebarW = Math.min(420, Math.max(200, w))
    },
    onResizeEnd() {
      if (!this.dragging) return
      this.dragging = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      // 左拖过阈值（比下限还少 32px）→ 收起；否则持久化宽度
      if (this.sidebarW <= 232) {
        this.collapsed = true
        setItem('omnibuddy:sidebar-collapsed', true)
        // 恢复默认展开宽度，下次展开不意外过窄
        this.sidebarW = 260
        setItem('omnibuddy:sidebar-w', 260)
      } else {
        setItem('omnibuddy:sidebar-w', this.sidebarW)
      }
    },
    toggleSidebar() {
      this.collapsed = !this.collapsed
      setItem('omnibuddy:sidebar-collapsed', this.collapsed)
    },
    // ===== 页签联动 =====
    // 认领并消费权限待确认通知（claim 与 chat 实例的 notice 消费互斥去重）
    async consumePermNotices(list) {
      for (const n of (list || []).slice()) {
        if (n.kind !== 'perm-pending') continue
        // 过期通知（布局重建回放历史队列时）直接认领丢弃
        const stale = Date.now() - (n.ts || 0) > 60000
        const ok = await this.$store.dispatch('buddyChat/claim', n.nid)
        if (!ok || stale) continue
        // 该会话已在当前页签：浮动条可见，无需全局通知
        if (this.activeChatId === n.sessionId) continue
        let c = this.chats.find(x => x.id === n.sessionId)
        if (!c) {
          // 列表未含该会话（他窗创建 / 冷启动后列表未刷新）：拉取一次再定位，
          // 避免任务已有名称却回落显示「未命名」
          await this.loadChats()
          c = this.chats.find(x => x.id === n.sessionId)
        }
        const title = (c && c.title) || ''
        this.$notify({
          title: '权限确认待处理',
          message: (title ? '任务「' + title + '」' : '一个任务') + '等待你的授权确认，点击前往处理',
          type: 'warning',
          duration: 8000,
          onClick: () => {
            this.onSelectChat(n.sessionId)
          }
        })
      }
    },
    // 会话页签标题同步：页签登记时仅有路由 meta（OmniBuddy），此处按任务列表补齐会话名
    syncChatTabTitles() {
      const tabs = (this.$store.state.tagsView && this.$store.state.tagsView.buddy) || []
      tabs.forEach(tab => {
        if (tab.path !== '/omnibuddy') return
        const id = tab.fullPath.split('s=')[1]
        if (!id) return
        const c = this.chats.find(x => x.id === id)
        if (c && c.title && tab.title !== c.title) {
          this.$store.commit('tagsView/UPDATE_TAB_TITLE', { side: 'buddy', fullPath: tab.fullPath, title: c.title })
        }
      })
    },
    renameChat(c) {
      this.$prompt('请输入新的任务名称', '重命名任务', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: c.title
      }).then(async ({ value }) => {
        const title = String(value || '').trim()
        if (!title || title === c.title) return
        const api = this.buddyApi()
        if (api) await api.renameSession({ id: c.id, title })
        c.title = title
        // 同步更新该会话的页签标题
        this.$store.commit('tagsView/UPDATE_TAB_TITLE', { side: 'buddy', fullPath: '/omnibuddy?s=' + c.id, title })
      }).catch(() => {})
    },
    confirmDeleteChat(c) {
      this.$confirm('删除后该任务的记录将一并移除，确定删除吗？', '删除任务', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const api = this.buddyApi()
        if (api) await api.deleteSession(c.id)
        this.chats = this.chats.filter(x => x.id !== c.id)
        // 同步移除该会话的页签，并清理会话状态池（防泄漏）
        this.$store.commit('tagsView/DEL_TAB', { side: 'buddy', fullPath: '/omnibuddy?s=' + c.id })
        this.$store.commit('buddyChat/DROP_SESSION', c.id)
        // 删除的是当前会话：回到新建页
        if (this.activeChatId === c.id) {
          this.$router.push('/omnibuddy').catch(() => {})
        }
        this.$message.success('已删除')
      }).catch(() => {})
    },
    // ===== 导航 =====
    goRoute(p) {
      if (this.$route.path !== p) this.$router.push(p).catch(() => {})
    },
    // 返回进入 OmniBuddy 前所在的 deck 页面（无记录时回首页）
    goMain() {
      const target = this.$router.lastDeckPath || '/home'
      if (this.$route.path !== target) {
        this.$router.push(target)
      }
    },
    onNewChat() {
      // 回到空会话页（发送首条消息时自动创建会话）
      if (this.$route.path !== '/omnibuddy' || this.activeChatId) {
        this.$router.push('/omnibuddy')
      }
    },
    onSelectChat(id) {
      if (this.$route.name !== 'OmniBuddy' || this.activeChatId !== id) {
        this.$router.push({ path: '/omnibuddy', query: { s: id } })
      }
    }
  }
}
</script>

<style lang="scss" scoped>

/* 侧边栏默认宽度（被 :style 覆盖，此处仅作参考/兜底） */
$buddy-sidebar-w: 260px;

.buddy-layout {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  background: $content-bg;
  position: relative;
}

/* ===== 主体：侧边栏 + 主区（顶栏已提升为窗口级横贯行） ===== */
.buddy-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

/* ===== 专属侧边栏（宽度可拖拽调整，可收起） ===== */
.buddy-sidebar {
  width: $buddy-sidebar-w;
  min-width: 0;
  flex-shrink: 0;
  height: 100%;
  background: $sidebar-bg;
  display: flex;
  flex-direction: column;
  -webkit-app-region: drag;
  user-select: none;
  overflow: hidden;
  position: relative;
  transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1);
}

/* 拖拽中：宽度实时跟随鼠标，禁用过渡避免迟滞 */
.buddy-sidebar.dragging {
  transition: none;
}

/* 收起态：图标缩略栏（宽度由 inline style 控制 = collapsedW）
   保留菜单图标与返回入口的图标形态；头部让位红绿灯、任务列表不展示 */
.buddy-sidebar.collapsed {
  .buddy-sidebar-head {
    // 收起态仅居中显示 logo（标题/新建按钮隐藏，入口在菜单区）
    justify-content: center;
    gap: 0;
    padding: 0 8px;
  }

  .buddy-menu {
    padding-bottom: 6px;
  }

  // 收起态：分组标题隐藏（模板已条件渲染，样式兜底），组间距缩小保持视觉分隔
  .buddy-menu-group-title {
    display: none;
  }

  .buddy-menu-group + .buddy-menu-group {
    margin-top: 7px;
  }

  .buddy-menu-item {
    justify-content: center;
    gap: 0;
    padding: 9px 0;
  }

  // 收起态：分组缩进失效，图标恢复居中
  .buddy-menu-item.indented {
    padding-left: 0;
  }

  .buddy-menu-label {
    display: none;
  }

  .buddy-section-chats {
    // 收起态隐藏标题，仅保留任务列表图标入口
    margin-bottom: 0;

    .buddy-section-title {
      display: none;
    }
  }

  .buddy-sidebar-footer {
    padding-bottom: 16px;
  }

  .buddy-back-entry {
    justify-content: center;
    padding: 7px;
  }

  .buddy-back-entry-text {
    display: none;
  }
}

/* 收起态图标入口：新建任务 / 任务列表（与菜单项同尺寸居中圆钮） */
.buddy-collapse-new,
.buddy-collapse-tasks {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  margin: 4px auto 10px;
  border-radius: 9px;
  cursor: pointer;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 15px;
  }
}

.buddy-collapse-new {
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.12);

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.2);
  }

  &:active {
    transform: scale(0.9);
  }
}

.buddy-collapse-tasks {
  margin-bottom: 4px;
  color: $text-sidebar;
  border-radius: $radius-sm;
  width: 100%;
  height: 34px;

  &:hover {
    background: $sidebar-item-hover;
    color: $text-primary;
  }

  &:active {
    transform: scale(0.94);
  }
}

/* 右缘拖拽手柄：常态透明，hover/拖拽中显示细分割线 */
.buddy-resizer {
  position: absolute;
  top: 0;
  right: 0;
  width: 4px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  -webkit-app-region: no-drag;

  &::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    transform: translateX(-50%);
    width: 1px;
    background: transparent;
    transition: background 0.15s ease;
  }

  &:hover::after,
  .buddy-sidebar.dragging &::after {
    background: var(--primary-color);
  }
}

/* 新建任务 icon：侧边栏头部小圆钮（标题右侧，margin-left 自动推到行尾）。
侧边栏为窗口拖拽区，按钮必须显式 no-drag 才能接收点击 */
.buddy-head-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-left: auto;
  flex-shrink: 0;
}

.buddy-new-icon {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  box-shadow: 0 1px 3px rgba(var(--primary-color-rgb), 0.35);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;

  .svg-icon {
    font-size: 13px;
  }

  &:hover {
    filter: brightness(1.1);
  }

  &:active {
    transform: scale(0.9);
  }
}

/* 清空本地数据 icon：与新建钮同尺寸的次级灰钮 */
.buddy-clear-icon {
  width: 24px;
  height: 24px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
  background: $sidebar-item-hover;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;

  .svg-icon {
    font-size: 13px;
  }

  &:hover {
    color: #d93025;
    background: rgba(217, 48, 37, 0.1);
  }

  &:active {
    transform: scale(0.9);
  }
}

/* 滚动列：菜单固定，滚动下放至任务列表本身（仅列表滚，头部/菜单不参与） */
.buddy-scroll {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 6px 8px;
  -webkit-app-region: no-drag;
  position: relative;
}

/* ===== 菜单区（任务列表上方，固定不随列表滚动） ===== */
.buddy-menu {
  display: flex;
  flex-direction: column;
  padding: 2px 0 10px;
  flex-shrink: 0;
}

/* 菜单分组：组间用间距分隔（首个分组无标题，紧贴顶部） */
.buddy-menu-group {
  display: flex;
  flex-direction: column;
  gap: 2px;

  & + .buddy-menu-group {
    margin-top: 10px;
  }
}

/* 分组标题：与任务列表标题（buddy-section-title）视觉一致 */
.buddy-menu-group-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: $text-secondary;
  padding: 0 10px 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 分组内菜单项：相对组标题缩进，形成标题 → 子项的层级 */
.buddy-menu-item.indented {
  padding-left: 20px;
}

/* 图标对齐容器：与主布局 nav-icon-wrap 一致（20px 宽居中，保证文字左缘对齐） */
.buddy-ico-wrap {
  width: 20px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.buddy-menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 11px;
  border-radius: $radius-sm;
  font-size: 14px;
  font-weight: 500;
  color: $text-sidebar;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  .buddy-menu-ico {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
  }

  &:hover {
    background: $sidebar-item-hover;
    color: $text-primary;
  }

  &.active {
    background: rgba(var(--primary-color-rgb), 0.12);
    color: $text-sidebar-active;
    font-weight: 600;

    .buddy-menu-ico {
      color: var(--primary-color);
    }
  }
}

.buddy-section {
  margin-bottom: 14px;
  display: flex;
  flex-direction: column;
}

.buddy-section-chats {
  flex: 1;
  min-height: 0; // 允许收缩：把剩余高度交给任务列表
  overflow: hidden;

  // 任务列表组件根元素：唯一的滚动容器（菜单/标题固定）
  ::v-deep .buddy-tasks {
    flex: 1;
    min-height: 0;
    overflow-y: auto;

    &::-webkit-scrollbar {
      width: 0;
    }
  }
}

.buddy-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: $text-secondary;
  padding: 0 10px 5px;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 底部固定区（左右边距与滚动区 8px 对齐；底部留足窗口边距，避免胶囊贴底） */
.buddy-sidebar-footer {
  flex-shrink: 0;
  padding: 6px 8px 18px;
  -webkit-app-region: no-drag;
}

/* 返回 OmniDeck 胶囊：与主布局 OmniBuddy 入口（buddy-entry）对称呼应 */
.buddy-back-entry {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 7px 11px;
  border-radius: $radius-base;
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  box-shadow: 0 2px 8px rgba(var(--primary-color-rgb), 0.3);
  cursor: pointer;
  transition: all 0.15s ease;
  overflow: hidden;

  &:hover {
    filter: brightness(1.08);
    box-shadow: 0 3px 12px rgba(var(--primary-color-rgb), 0.42);

    // 图标向左微移，呼应"返回"方向
    .buddy-back-entry-svg {
      transform: translateX(-1.5px);
    }
  }

  &:active {
    transform: scale(0.97);
  }
}

.buddy-back-entry-icon {
  width: 22px;
  height: 22px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.2);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .buddy-back-entry-svg {
    width: 13px;
    height: 13px;
    color: #fff;
    transition: transform 0.15s ease;
  }
}

.buddy-back-entry-text {
  flex: 1;
  font-size: 12.5px;
  font-weight: 700;
  letter-spacing: 0.3px;
  color: #fff;
  white-space: nowrap;
}

/* ===== 右侧区域 ===== */
.buddy-right {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
}

/* ===== 主区顶部页签行（参考 Deck：Topbar 位换为页签栏 + 设置入口） =====
   页签本体/设置钮可点（no-drag），空白处可拖动窗口 */
.buddy-tags-row {
  display: flex;
  align-items: stretch;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

/* 页签栏占满行内剩余宽度 */
.buddy-tags-row-bar {
  flex: 1;
  min-width: 0;
}

/* 右侧：齿轮（Windows 下含窗口控制钮）贴窗口右缘，与 Deck 顶栏同位 */
.buddy-tags-row-actions {
  display: flex;
  align-items: center;
  padding: 0 10px 0 2px;
  background: $content-bg;
  border-bottom: 1px solid $border-color;
  -webkit-app-region: no-drag;
}

/* macOS 交通灯按钮独占行（与主布局 Sidebar 的 sidebar-topbar 一致）：
   侧栏通到窗口顶部，红绿灯悬浮于本行 */
.buddy-sidebar-topbar {
  height: 52px;
  flex-shrink: 0;
}

/* 侧边栏顶部：logo + 标题 + 新建（紧随红绿灯让位行，logo 距顶对齐 Deck） */
.buddy-sidebar-head {
  display: flex;
  align-items: center;
  gap: 10px; /* 与主布局 Sidebar 的 logo↔标题间距一致 */
  padding: 0 12px 0 16px;
  flex-shrink: 0;
  height: 46px;
}

/* logo 与标题（与主布局侧边栏同款 lockup：38px 图标 + 16px/600 标题） */
.buddy-logo-icon {
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  // 图形为宽扁异形（非圆角方块 App 图标），contain 原比例呈现，不加圆角裁切
  .buddy-logo-img {
    width: 38px;
    height: 38px;
    object-fit: contain;
  }
}

.buddy-logo-text {
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
  letter-spacing: -0.2px;
  line-height: 1;
  white-space: nowrap;
}

/* 侧边栏垂直居中开关：贴侧边栏右缘（借鉴主布局折叠钮），随收起/展开平移。
展开态显示 «（收起方向），收起态显示 »（展开方向） */
.buddy-side-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  left: 0;
  z-index: 20;
  width: 16px;
  height: 48px;
  border-radius: 0 8px 8px 0;
  background: var(--toggle-bg, rgba(255, 255, 255, 0.88));
  backdrop-filter: blur(8px);
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06), 1px 0 0 rgba(0, 0, 0, 0.04);
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-left: none;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
  /* 跟随侧边栏宽度平移（过渡与侧边栏宽度动画同步；拖拽中禁用过渡实时跟随） */
  transition: left 0.22s cubic-bezier(0.4, 0, 0.2, 1);

  &.dragging {
    transition: none;
  }

  .buddy-side-toggle-ico {
    width: 12px;
    height: 12px;
    opacity: 0.45;
    transition: all 0.2s ease;
  }

  &:hover {
    width: 20px;
    background: var(--card-bg, #ffffff);
    box-shadow: 3px 0 12px rgba(0, 0, 0, 0.1), 1px 0 0 rgba(0, 0, 0, 0.08);

    .buddy-side-toggle-ico {
      opacity: 0.85;
      transform: scale(1.1);
    }
  }

  &:active {
    transform: translateY(-50%) scale(0.92);
  }
}

/* 右侧：齿轮贴窗口右缘（与 Deck 顶栏同位），可点击不可拖窗 */
.buddy-tabstrip-actions {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  -webkit-app-region: no-drag;
}

/* ===== 主区 ===== */
.buddy-main {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  // 内容区不可划选文本（输入框、代码块除外）
  user-select: none;

  ::v-deep input,
  ::v-deep textarea,
  ::v-deep [contenteditable],
  ::v-deep pre,
  ::v-deep code {
    -webkit-user-select: text;
    user-select: text;
  }
}
</style>
