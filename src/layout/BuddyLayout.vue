<template>
  <div class="buddy-layout">
    <!-- OmniBuddy 专属侧边栏：空间 + 对话列表（可折叠） -->
    <aside class="buddy-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <!-- macOS 交通灯按钮独占行 -->
      <div class="buddy-sidebar-topbar"></div>

      <!-- 品牌行：logo + 名称 + 新建对话 icon（收起时隐藏 logo，仅保留居中的新建按钮） -->
      <div class="buddy-brand">
        <span v-show="!sidebarCollapsed" class="buddy-brand-icon">
          <svg-icon icon-class="buddy" class="buddy-brand-svg" />
        </span>
        <span v-show="!sidebarCollapsed" class="buddy-brand-text">OmniBuddy</span>
        <!-- 新建对话 icon（title 右侧；折叠态整行变成该按钮） -->
        <div
          class="buddy-new-icon"
          :class="{ solo: sidebarCollapsed }"
          title="新对话"
          @click="onNewChat"
        >
          <svg-icon icon-class="plus" />
        </div>
      </div>

      <div class="buddy-scroll">
        <!-- 空间列表：系统默认空间固定首位（不可编辑/删除/拖拽）+ 用户空间（可拖拽排序） -->
        <div class="buddy-section">
          <div v-show="!sidebarCollapsed" class="buddy-section-title">空间</div>
          <div
            v-if="defaultSpace"
            class="buddy-space"
            :class="{ active: activeSpaceId === defaultSpace.id }"
            :title="sidebarCollapsed ? defaultSpace.name : ''"
            @click="onSelectSpaceItem(defaultSpace)"
          >
            <svg-icon :icon-class="defaultSpace.icon || 'star'" class="buddy-space-svg" />
            <span v-show="!sidebarCollapsed" class="buddy-space-name">{{ defaultSpace.name }}</span>
            <span v-show="!sidebarCollapsed" class="buddy-space-tag">系统</span>
          </div>
          <draggable
            v-model="userSpaces"
            :disabled="sidebarCollapsed"
            animation="200"
            ghost-class="ob-drag-ghost"
            @end="saveSpaces"
            class="buddy-space-list"
          >
            <div
              v-for="sp in userSpaces"
              :key="sp.id"
              class="buddy-space"
              :class="{ active: activeSpaceId === sp.id }"
              :title="sidebarCollapsed ? sp.name : ''"
              @click="onSelectSpaceItem(sp)"
            >
              <svg-icon :icon-class="sp.icon || 'star'" class="buddy-space-svg" />
              <span v-show="!sidebarCollapsed" class="buddy-space-name">{{ sp.name }}</span>
              <span
                v-show="!sidebarCollapsed"
                class="buddy-space-actions"
                @click.stop
              >
                <svg-icon
                  icon-class="edit"
                  title="重命名"
                  @click.stop="openEditSpace(sp)"
                />
                <svg-icon
                  icon-class="delete"
                  class="ob-del"
                  title="删除空间"
                  @click.stop="confirmDeleteSpace(sp)"
                />
              </span>
            </div>
          </draggable>
          <div
            v-show="!sidebarCollapsed"
            class="buddy-space-add"
            @click="openCreateSpace"
          >
            <svg-icon icon-class="plus" />
            <span>新建空间</span>
          </div>
        </div>

        <!-- 对话列表（主进程 JSONL 持久化） -->
        <div class="buddy-section buddy-section-chats">
          <div v-show="!sidebarCollapsed" class="buddy-section-title">对话列表</div>
          <!-- 空状态：在剩余区域内垂直水平居中 -->
          <div v-if="!visibleChats.length" v-show="!sidebarCollapsed" class="buddy-chat-empty">
            <div class="buddy-chat-empty-icon">
              <svg-icon icon-class="chat-dot-round" />
            </div>
            <p class="buddy-chat-empty-title">暂无对话</p>
            <p class="buddy-chat-empty-desc">点击右上角「+」新建对话</p>
          </div>
          <div
            v-for="c in visibleChats"
            :key="c.id"
            class="buddy-chat"
            :class="{ active: c.id === activeChatId }"
            :title="sidebarCollapsed ? c.title : ''"
            @click="onSelectChat(c.id)"
            @mouseenter="onChatEnter"
            @mouseleave="onChatLeave"
          >
            <svg-icon :icon-class="c.branch ? 'share' : 'chat-dot-round'" :style="c.branch ? 'color: var(--primary-color)' : ''" />
            <span v-show="!sidebarCollapsed" class="buddy-chat-name"><span class="ob-name-inner">{{ c.title }}</span></span>
            <span
              v-show="!sidebarCollapsed"
              class="buddy-chat-actions"
              @click.stop
            >
              <svg-icon
                icon-class="edit"
                title="重命名"
                @click.stop="renameChat(c)"
              />
              <svg-icon
                icon-class="delete"
                class="ob-del"
                title="删除对话"
                @click.stop="confirmDeleteChat(c)"
              />
            </span>
          </div>
        </div>
      </div>

      <!-- 底部：返回 OmniDeck + 专属设置 -->
      <div class="buddy-sidebar-footer">
        <div
          class="buddy-footer-item"
          :title="sidebarCollapsed ? '返回 OmniDeck' : ''"
          @click="goMain"
        >
          <svg-icon icon-class="back" class="buddy-footer-back-icon" />
          <span v-show="!sidebarCollapsed">返回 OmniDeck</span>
        </div>
        <div
          class="buddy-footer-item"
          :class="{ active: isSettings }"
          :title="sidebarCollapsed ? 'Buddy 工坊' : ''"
          @click="goSettings"
        >
          <svg-icon icon-class="settings" class="buddy-footer-svg" />
          <span v-show="!sidebarCollapsed">Buddy 工坊</span>
        </div>
      </div>
    </aside>

    <!-- 右侧主区域 -->
    <div class="buddy-right">
      <!-- 顶部：搜索对话 -->
      <header class="buddy-topbar">
        <!-- 毛玻璃背景层：backdrop-filter 会吞掉同元素的 app-region 拖拽区，独立成层规避 -->
        <div class="buddy-topbar-glass"></div>
        <div class="buddy-search" :class="{ focused: searchFocus }">
          <svg-icon icon-class="search" class="buddy-search-icon" />
          <input
            v-model="searchQuery"
            class="buddy-search-input"
            placeholder="搜索对话名称或内容..."
            @focus="searchFocus = true"
            @blur="onSearchBlur"
            @keydown.esc="searchQuery = ''"
          />
          <svg-icon
            v-if="searchQuery"
            icon-class="circle_close"
            class="buddy-search-clear"
            @mousedown.prevent="searchQuery = ''"
          />
          <span v-if="!searchQuery" class="buddy-search-kbd">esc</span>
        </div>
      </header>

      <!-- 搜索结果下拉（对话名称/内容匹配） -->
      <transition name="buddy-drop">
        <div v-if="searchFocus && searchQuery" class="buddy-search-drop">
          <template v-if="searchResults.length">
            <div
              v-for="r in searchResults"
              :key="r.id"
              class="buddy-search-item"
              @mousedown.prevent="onSelectChat(r.id)"
            >
              <svg-icon icon-class="chat-dot-round" />
              <span class="buddy-search-item-name">{{ r.name }}</span>
              <span class="buddy-search-item-snippet">{{ r.snippet }}</span>
            </div>
          </template>
          <div v-else class="buddy-search-empty">
            <svg-icon icon-class="search" />
            <span>未找到「{{ searchQuery }}」相关的对话</span>
          </div>
        </div>
      </transition>

      <!-- 主区：对话内容 / 设置页 -->
      <div class="buddy-main">
        <router-view />
      </div>
    </div>

    <!-- 侧边栏折叠/展开按钮（与主界面一致的边缘样式） -->
    <div
      class="buddy-sidebar-toggle"
      :class="{ 'is-collapsed': sidebarCollapsed }"
      :style="{ left: toggleLeft }"
      title="切换侧边栏"
      @click="sidebarCollapsed = !sidebarCollapsed"
    >
      <svg-icon :icon-class="sidebarCollapsed ? 'expand' : 'fold'" class="toggle-icon" />
    </div>

    <!-- 新建/编辑空间弹窗 -->
    <space-edit-dialog
      :visible="spaceDialogVisible"
      :space="editingSpace"
      :spaces="spaces"
      :dir-only="!!(editingSpace && editingSpace.system)"
      @close="spaceDialogVisible = false"
      @submit="saveSpace"
    />
  </div>
</template>

<script>
import draggable from 'vuedraggable'
import SpaceEditDialog from '@/components/buddy/SpaceEditDialog.vue'
import { getItem, setItem } from '@/utils/db'
import { getBuddySpaces, saveBuddySpaces, DEFAULT_SPACE_ID } from '@/utils/buddy-space'

let spaceUid = Date.now()

// OmniBuddy 视图壳：与主 Layout 平级的独立视图
// 侧边栏（可折叠）= 空间（可管理）+ 对话列表；顶栏 = 对话搜索
export default {
  name: 'BuddyLayout',
  components: { draggable, SpaceEditDialog },
  data() {
    return {
      sidebarCollapsed: false,
      searchQuery: '',
      searchFocus: false,
      // 空间列表：系统默认空间（运行时派生）+ 用户空间（IndexedDB 持久化）
      defaultSpace: null,
      userSpaces: [],
      activeSpaceId: '',
      // 新建/编辑空间弹窗
      spaceDialogVisible: false,
      editingSpaceId: null,
      // 会话列表（主进程 JSONL 持久化，按更新时间倒序）
      chats: [],
      // 顶栏搜索：query -> 结果缓存（主进程搜索，防抖执行）
      searchCache: {},
      searchTimer: null
    }
  },
  computed: {
    isSettings() {
      return this.$route.name === 'OmniBuddySettings'
    },
    isSpace() {
      return this.$route.name === 'OmniBuddySpace'
    },
    // 全部空间：系统默认空间固定首位 + 用户空间
    spaces() {
      return this.defaultSpace ? [this.defaultSpace].concat(this.userSpaces) : this.userSpaces
    },
    // 弹窗编辑目标空间（null 表示新建；默认空间仅关联目录）
    editingSpace() {
      return this.spaces.find(s => s.id === this.editingSpaceId) || null
    },
    toggleLeft() {
      return this.sidebarCollapsed ? '46px' : '200px'
    },
    // 当前激活会话 id（由对话页路由 query.s 驱动）
    activeChatId() {
      return this.$route.query.s || ''
    },
    // 对话列表：与空间解绑（始终显示全部会话，按更新时间倒序）
    visibleChats() {
      return this.chats
    },
    // 顶栏搜索：主进程跨会话搜索（标题 + 内容）
    searchResults() {
      const q = this.searchQuery.trim()
      if (!q) return []
      return this.searchCache[q] || []
    }
  },
  watch: {
    searchQuery(q) {
      this.runSearch(q)
    },
    // 选中空间变化：持久化 + 通知空间页刷新
    // 跳转空间视图由用户点击（onSelectSpaceItem）或新建空间（saveSpace）触发，避免恢复/同步选择时被拽走
    activeSpaceId(id) {
      setItem('buddyActiveSpaceId', id)
      this.$root.$emit('omnibuddy:active-space-changed', id)
    }
  },
  created() {
    // 恢复上次选中的空间（与问答页共用持久化 key），未选中时对话列表显示全部
    this.activeSpaceId = getItem('omnibuddy:spaceId', '')
    this.loadSpaces()
    this.loadChats()
    // 对话页创建/更新会话后刷新列表
    this.$root.$on('omnibuddy:sessions-changed', this.loadChats)
    // 对话页为空间补关联目录后刷新空间列表
    this.$root.$on('omnibuddy:spaces-changed', this.loadSpaces)
    // 问答页底部选择空间后同步左侧选中态
    this.$root.$on('omnibuddy:space-selected', this.onChatSpaceSelected)
  },
  beforeDestroy() {
    this.$root.$off('omnibuddy:sessions-changed', this.loadChats)
    this.$root.$off('omnibuddy:spaces-changed', this.loadSpaces)
    this.$root.$off('omnibuddy:space-selected', this.onChatSpaceSelected)
  },
  methods: {
    // ===== 空间管理 =====
    async loadSpaces() {
      const list = await getBuddySpaces()
      this.defaultSpace = list.find(s => s.system) || null
      this.userSpaces = list.filter(s => !s.system)
      // 已存储的激活空间不存在（或从未选择）时不自动选中，默认停留在新建对话页
      if (!this.spaces.some(s => s.id === this.activeSpaceId)) {
        this.activeSpaceId = ''
      }
      setItem('buddyActiveSpaceId', this.activeSpaceId)
    },
    saveSpaces() {
      saveBuddySpaces(this.userSpaces)
    },
    // 点击空间：选中并切到空间视图（重复点击同一空间也会跳转）
    // 系统默认空间未关联目录、或已关联目录在磁盘上不存在：弹窗引导（重新）关联，仅目录可编辑
    async onSelectSpaceItem(sp) {
      if (sp.system && !(await this.defaultSpaceDirReady())) {
        this.editingSpaceId = sp.id
        this.spaceDialogVisible = true
        return
      }
      this.activeSpaceId = sp.id
      if (this.$route.name !== 'OmniBuddySpace') {
        this.$router.push('/omnibuddy/space').catch(() => {})
      }
    },
    // 默认空间关联目录是否就绪：已关联且仍存在（桌面端用 files.list 探测，失败视为不存在）
    async defaultSpaceDirReady() {
      const dir = getItem('buddyDefaultSpaceDir', '')
      if (!dir) return false
      const api = this.buddyApi()
      if (!api || !api.files) return true // 非桌面端无法探测，视为有效
      const res = await api.files.list(dir).catch(() => null)
      return !!(res && res.ok)
    },
    openCreateSpace() {
      this.editingSpaceId = null
      this.spaceDialogVisible = true
    },
    openEditSpace(sp) {
      this.editingSpaceId = sp.id
      this.spaceDialogVisible = true
    },
    // 弹窗校验通过后提交：更新或新建空间（表单与校验在 SpaceEditDialog 内）
    async saveSpace(form) {
      // 系统默认空间：仅保存关联目录（其余字段弹窗内不可编辑），关联后自动进入
      if (this.editingSpaceId === DEFAULT_SPACE_ID) {
        setItem('buddyDefaultSpaceDir', form.dir)
        this.spaceDialogVisible = false
        await this.loadSpaces()
        this.$root.$emit('omnibuddy:spaces-changed')
        this.$message.success('默认空间已关联目录')
        this.activeSpaceId = DEFAULT_SPACE_ID
        return
      }
      if (this.editingSpaceId) {
        const sp = this.userSpaces.find(s => s.id === this.editingSpaceId)
        if (sp) Object.assign(sp, form)
      } else {
        this.userSpaces.push({
          id: 'sp' + (spaceUid++),
          ...form,
          createdAt: Date.now()
        })
        // 新建空间后自动选中并进入空间视图，后续新建对话归属该空间
        this.activeSpaceId = this.userSpaces[this.userSpaces.length - 1].id
        if (this.$route.name !== 'OmniBuddySpace') {
          this.$router.push('/omnibuddy/space').catch(() => {})
        }
      }
      this.saveSpaces()
      this.spaceDialogVisible = false
      this.$root.$emit('omnibuddy:spaces-changed')
      this.$message.success(this.editingSpaceId ? '空间已更新' : '空间已创建')
    },
    // 删除空间（二次确认；仅用户空间可删，系统默认空间不渲染删除入口）
    confirmDeleteSpace(sp) {
      this.$confirm(
        '删除后该空间下的对话记录将一并移除，确定删除「' + sp.name + '」吗？',
        '删除空间',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      ).then(async () => {
        // 同步删除该空间下的全部会话（主进程 JSONL 数据）
        const api = this.buddyApi()
        if (api) await api.deleteSessionsBySpace(sp.id)
        this.chats = this.chats.filter(c => c.spaceId !== sp.id)
        this.userSpaces = this.userSpaces.filter(s => s.id !== sp.id)
        // 删除的是激活空间 → 回到新建对话页（不自动选中其他空间）
        if (this.activeSpaceId === sp.id) {
          this.activeSpaceId = ''
        }
        this.saveSpaces()
        this.$root.$emit('omnibuddy:spaces-changed')
        this.$message.success('空间已删除')
      }).catch(() => {})
    },
    // ===== 会话（对话）管理 =====
    // preload API（浏览器环境无 electronAPI 时返回空实现）
    buddyApi() {
      return (window.electronAPI && window.electronAPI.omnibuddy) || null
    },
    async loadChats() {
      const api = this.buddyApi()
      if (!api) {
        this.chats = []
        return
      }
      this.chats = await api.listSessions()
      // 搜索缓存失效
      this.searchCache = {}
    },
    // 顶栏搜索：主进程跨会话搜索（防抖 + 简易缓存）
    runSearch(q) {
      const api = this.buddyApi()
      if (!api) return
      const query = q.trim()
      if (!query) return
      if (this.searchCache[query] !== undefined) return
      clearTimeout(this.searchTimer)
      this.searchTimer = setTimeout(async () => {
        const results = await api.searchSessions(query)
        // 结果映射为搜索下拉所需字段（name/snippet → 展示，onSelectChat 用 id）
        this.$set(this.searchCache, query, results.map(r => ({ id: r.id, name: r.name, snippet: r.snippet })))
      }, 200)
    },
    renameChat(c) {
      this.$prompt('请输入新的对话名称', '重命名对话', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: c.title
      }).then(async ({ value }) => {
        const title = String(value || '').trim()
        if (!title || title === c.title) return
        const api = this.buddyApi()
        if (api) await api.renameSession({ id: c.id, title })
        c.title = title
      }).catch(() => {})
    },
    confirmDeleteChat(c) {
      this.$confirm('删除后该对话的记录将一并移除，确定删除吗？', '删除对话', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const api = this.buddyApi()
        if (api) await api.deleteSession(c.id)
        this.chats = this.chats.filter(x => x.id !== c.id)
        // 删除的是当前打开的会话 → 回到空会话页
        if (this.activeChatId === c.id && !this.isSettings) {
          this.$router.push('/omnibuddy')
        }
        this.$message.success('已删除')
      }).catch(() => {})
    },
    // ===== 导航 =====
    // 返回进入 OmniBuddy 前所在的 deck 页面（无记录时回首页）
    goMain() {
      const target = this.$router.lastDeckPath || '/home'
      if (this.$route.path !== target) {
        this.$router.push(target)
      }
    },
    goSettings() {
      if (this.$route.name !== 'OmniBuddySettings') {
        this.$router.push('/omnibuddy/settings')
      }
    },
    goSpace() {
      if (this.$route.name !== 'OmniBuddySpace') {
        this.$router.push('/omnibuddy/space')
      }
    },
    onNewChat() {
      // 回到空会话页（发送首条消息时自动创建会话）
      // 同时清空空间选中态：新建对话后左侧菜单不再高亮任何空间
      this.activeSpaceId = ''
      if (this.$route.path !== '/omnibuddy' || this.activeChatId) {
        this.$router.push('/omnibuddy')
      }
    },
    onSelectChat(id) {
      // 打开对应会话（搜索下拉与对话列表共用）
      if (this.$route.name !== 'OmniBuddy' || this.activeChatId !== id) {
        this.$router.push({ path: '/omnibuddy', query: { s: id } })
      }
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
    },
    // 延迟失焦：给下拉项的 mousedown 留出响应时间
    onSearchBlur() {
      setTimeout(() => {
        this.searchFocus = false
      }, 150)
    }
  }
}
</script>

<style lang="scss" scoped>

/* 侧边栏宽度与 Deck 主界面保持一致（全局变量） */
$buddy-sidebar-w: $sidebar-width;
$buddy-sidebar-collapsed-w: $sidebar-collapsed-width;

.buddy-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: $content-bg;
  position: relative;
}

/* ===== 专属侧边栏（可折叠） ===== */
.buddy-sidebar {
  width: $buddy-sidebar-w;
  flex-shrink: 0;
  height: 100%;
  background: $sidebar-bg;
  display: flex;
  flex-direction: column;
  -webkit-app-region: drag;
  user-select: none;
  overflow: hidden;
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);

  &.collapsed {
    width: $buddy-sidebar-collapsed-w;

    .buddy-brand {
      justify-content: center;
      gap: 0;
    }

    .buddy-footer-item {
      justify-content: center;
      padding: 7px 0;
    }

    .buddy-space,
    .buddy-chat {
      justify-content: center;
      padding: 7px 0;
    }
  }
}

.buddy-sidebar-topbar {
  height: 52px;
  flex-shrink: 0;
}

/* 品牌行 + 新建 icon */
.buddy-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  flex-shrink: 0;
  height: 44px;
}

.buddy-brand-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(var(--primary-color-rgb), 0.35);
  flex-shrink: 0;

  .buddy-brand-svg {
    width: 15px;
    height: 15px;
    color: #fff;
  }
}

.buddy-brand-text {
  font-size: 15.5px;
  font-weight: 700;
  color: $text-primary;
  letter-spacing: 0.3px;
  white-space: nowrap;
}

/* 新建对话 icon：默认 title 右侧小圆钮；折叠态独占一行放大居中 */
.buddy-new-icon {
  margin-left: auto;
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

  &.solo {
    margin: 6px 0 0;
    width: 26px;
    height: 26px;

    .svg-icon {
      font-size: 14px;
    }
  }
}

/* 滚动区：空间 + 对话列表 */
.buddy-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 6px 8px;
  -webkit-app-region: no-drag;
  /* 空态以此为定位容器，覆盖整个滚动区做垂直水平居中 */
  position: relative;

  &::-webkit-scrollbar {
    width: 0;
  }
}

.buddy-section {
  margin-bottom: 14px;
}

.buddy-section-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: $text-secondary;
  padding: 0 10px 5px;
  white-space: nowrap;
}

/* 空间项 */
.buddy-space {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: $radius-sm;
  font-size: 12.5px;
  font-weight: 500;
  color: $text-sidebar;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 1px;
  white-space: nowrap;

  > .buddy-space-svg {
    width: 14px;
    height: 14px;
    color: var(--primary-color);
    flex-shrink: 0;
  }

  .buddy-space-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 系统空间标识 tag */
  .buddy-space-tag {
    flex-shrink: 0;
    font-size: 10px;
    line-height: 16px;
    padding: 0 6px;
    border-radius: 999px;
    color: $text-secondary;
    background: $sidebar-item-hover;
  }

  &:hover {
    background: $sidebar-item-hover;
    color: $text-primary;

    .buddy-space-actions {
      opacity: 1;
    }
  }

  &.active {
    background: rgba(var(--primary-color-rgb), 0.12);
    color: $text-sidebar-active;
    font-weight: 600;
  }
}

/* 空间行内操作：hover 浮现（重命名/删除） */
.buddy-space-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;

  .svg-icon {
    font-size: 14px;
    color: $text-secondary;
    padding: 2px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(var(--primary-color-rgb), 0.12);
      color: var(--primary-color);
    }

    &.ob-del:hover {
      background: rgba(245, 34, 45, 0.12);
      color: #F5222D;
    }
  }
}

/* 拖拽占位 */
.ob-drag-ghost {
  opacity: 0.4;
}

.buddy-space-add {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 0;
  padding: 6px 10px;
  border: 1px dashed var(--border-color);
  border-radius: $radius-sm;
  font-size: 12px;
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  .svg-icon {
    font-size: 13px;
  }

  &:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }
}

/* 对话项 */
.buddy-chat {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
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

/* 对话空态：绝对定位铺满滚动区，垂直水平居中（不占文档流、不拦截点击） */
.buddy-chat-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  padding: 12px 10px;
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

/* 对话行内操作：hover 浮现（重命名/删除） */
.buddy-chat-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;

  .svg-icon {
    font-size: 14px;
    color: $text-secondary;
    padding: 2px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(var(--primary-color-rgb), 0.12);
      color: var(--primary-color);
    }

    &.ob-del:hover {
      background: rgba(245, 34, 45, 0.12);
      color: #F5222D;
    }
  }
}

/* 底部固定区 */
.buddy-sidebar-footer {
  flex-shrink: 0;
  padding: 6px 10px 10px;
  -webkit-app-region: no-drag;
}

.buddy-footer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: $radius-sm;
  font-size: 12.5px;
  font-weight: 500;
  color: $text-sidebar;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;

  .buddy-footer-svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
  }

  .buddy-footer-back-icon {
    font-size: 14px;
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

    .buddy-footer-svg {
      color: var(--primary-color);
    }
  }
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

/* 顶栏：搜索对话（居中）。毛玻璃背景独立成层，顶栏本体保持可拖动窗口 */
.buddy-topbar {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: $topbar-height;
  padding: 0 16px;
  flex-shrink: 0;
  -webkit-app-region: drag;
  z-index: 5;
}

/* 毛玻璃背景层（backdrop-filter 元素自身会丢失 app-region 拖拽区） */
.buddy-topbar-glass {
  position: absolute;
  inset: 0;
  z-index: 0;
  background: $topbar-bg;
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border-bottom: 1px solid $border-color;
  pointer-events: none;
}

/* 搜索框：限定最大宽度，在顶栏内居中（no-drag 保证可点击输入） */
.buddy-search {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 520px;
  height: 28px;
  padding: 0 11px;
  background: $search-bg;
  border-radius: $radius-base;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;

  &.focused {
    background: var(--card-bg);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.14);
  }

  .buddy-search-icon {
    font-size: 13px;
    color: $text-secondary;
  }

  .buddy-search-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: $text-primary;

    &::placeholder {
      color: $text-secondary;
    }
  }

  .buddy-search-clear {
    font-size: 13px;
    color: $text-secondary;
    cursor: pointer;
    flex-shrink: 0;

    &:hover {
      color: $text-primary;
    }
  }

  .buddy-search-kbd {
    font-size: 11px;
    color: $text-secondary;
    background: $search-bg;
    padding: 1px 5px;
    border-radius: 4px;
    font-family: 'SF Mono', monospace;
  }
}

/* 搜索结果下拉 */
.buddy-search-drop {
  position: absolute;
  top: 36px;
  left: 16px;
  width: 380px;
  max-height: 320px;
  overflow-y: auto;
  border-radius: $radius-lg;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  backdrop-filter: blur(24px) saturate(1.6);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
  z-index: 20;
  -webkit-app-region: no-drag;
  padding: 6px;

  &::-webkit-scrollbar {
    width: 4px;
  }
}

.buddy-search-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: $radius-base;
  cursor: pointer;
  transition: background 0.12s ease;

  > .svg-icon {
    font-size: 13px;
    color: var(--primary-color);
    flex-shrink: 0;
  }

  .buddy-search-item-name {
    font-size: 12.5px;
    font-weight: 600;
    color: $text-primary;
    white-space: nowrap;
    flex-shrink: 0;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .buddy-search-item-snippet {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    color: $text-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.08);
  }
}

.buddy-search-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 22px 0;
  font-size: 12px;
  color: $text-secondary;

  .svg-icon {
    font-size: 14px;
  }
}

/* 下拉过渡 */
.buddy-drop-enter-active,
.buddy-drop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.buddy-drop-enter,
.buddy-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
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

/* 侧边栏折叠按钮（与主界面边缘样式一致） */
.buddy-sidebar-toggle {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  z-index: 1000;
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
  transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: no-drag;

  .toggle-icon {
    width: 12px;
    height: 12px;
    transition: opacity 0.2s ease;
    opacity: 0.45;
  }

  &:hover {
    width: 20px;
    background: var(--card-bg, #ffffff);
    box-shadow: 3px 0 12px rgba(0, 0, 0, 0.1), 1px 0 0 rgba(0, 0, 0, 0.08);

    .toggle-icon {
      opacity: 0.85;
      transform: scale(1.1);
    }
  }

  &:active {
    transform: translateY(-50%) scale(0.92);
  }
}
</style>
