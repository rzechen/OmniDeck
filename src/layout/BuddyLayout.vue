<template>
  <div class="buddy-layout">
    <!-- OmniBuddy 专属侧边栏：空间 + 对话列表（可折叠） -->
    <aside class="buddy-sidebar" :class="{ collapsed: sidebarCollapsed }">
      <!-- macOS 交通灯按钮独占行 -->
      <div class="buddy-sidebar-topbar"></div>

      <!-- 品牌行：logo + 名称 + 新建对话 icon -->
      <div class="buddy-brand">
        <span class="buddy-brand-icon">
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
          <i class="el-icon-plus"></i>
        </div>
      </div>

      <div class="buddy-scroll">
        <!-- 空间列表（可拖拽排序；默认空间固定且不可编辑/删除） -->
        <div class="buddy-section">
          <div v-show="!sidebarCollapsed" class="buddy-section-title">空间</div>
          <draggable
            v-model="spaces"
            :disabled="sidebarCollapsed"
            :filter="defaultSpaceFilter"
            :prevent-on-filter="false"
            animation="200"
            ghost-class="ob-drag-ghost"
            @end="saveSpaces"
            class="buddy-space-list"
          >
            <div
              v-for="sp in spaces"
              :key="sp.id"
              class="buddy-space"
              :class="{ active: activeSpaceId === sp.id, 'is-default': isDefaultSpace(sp) }"
              :title="sidebarCollapsed ? sp.name : ''"
              @click="activeSpaceId = sp.id"
            >
              <svg-icon :icon-class="sp.icon || 'star'" class="buddy-space-svg" />
              <span v-show="!sidebarCollapsed" class="buddy-space-name">{{ sp.name }}</span>
              <span
                v-if="!isDefaultSpace(sp)"
                v-show="!sidebarCollapsed"
                class="buddy-space-actions"
                @click.stop
              >
                <i
                  class="el-icon-edit"
                  title="重命名"
                  @click.stop="openEditSpace(sp)"
                ></i>
                <i
                  class="el-icon-delete"
                  title="删除空间"
                  @click.stop="confirmDeleteSpace(sp)"
                ></i>
              </span>
            </div>
          </draggable>
          <div
            v-show="!sidebarCollapsed"
            class="buddy-space-add"
            @click="openCreateSpace"
          >
            <i class="el-icon-plus"></i>
            <span>新建空间</span>
          </div>
        </div>

        <!-- 对话列表（主进程 JSONL 持久化） -->
        <div class="buddy-section">
          <div v-show="!sidebarCollapsed" class="buddy-section-title">对话列表</div>
          <div v-if="!visibleChats.length" v-show="!sidebarCollapsed" class="buddy-chat-empty">
            暂无对话
          </div>
          <div
            v-for="c in visibleChats"
            :key="c.id"
            class="buddy-chat"
            :class="{ active: c.id === activeChatId }"
            :title="sidebarCollapsed ? c.title : ''"
            @click="onSelectChat(c.id)"
          >
            <i :class="c.branch ? 'el-icon-share' : 'el-icon-chat-dot-round'" :style="c.branch ? 'color: var(--ob-accent, #722ED1)' : ''"></i>
            <span v-show="!sidebarCollapsed" class="buddy-chat-name">{{ c.title }}</span>
            <span
              v-show="!sidebarCollapsed"
              class="buddy-chat-actions"
              @click.stop
            >
              <i
                class="el-icon-edit"
                title="重命名"
                @click.stop="renameChat(c)"
              ></i>
              <i
                class="el-icon-delete"
                title="删除对话"
                @click.stop="confirmDeleteChat(c)"
              ></i>
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
          <i class="el-icon-back buddy-footer-back-icon"></i>
          <span v-show="!sidebarCollapsed">返回 OmniDeck</span>
        </div>
        <div
          class="buddy-footer-item"
          :class="{ active: isSettings }"
          :title="sidebarCollapsed ? '设置' : ''"
          @click="goSettings"
        >
          <svg-icon icon-class="settings" class="buddy-footer-svg" />
          <span v-show="!sidebarCollapsed">设置</span>
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
          <i class="el-icon-search buddy-search-icon"></i>
          <input
            v-model="searchQuery"
            class="buddy-search-input"
            placeholder="搜索对话名称或内容..."
            @focus="searchFocus = true"
            @blur="onSearchBlur"
            @keydown.esc="searchQuery = ''"
          />
          <i
            v-if="searchQuery"
            class="el-icon-circle-close buddy-search-clear"
            @mousedown.prevent="searchQuery = ''"
          ></i>
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
              <i class="el-icon-chat-dot-round"></i>
              <span class="buddy-search-item-name">{{ r.name }}</span>
              <span class="buddy-search-item-snippet">{{ r.snippet }}</span>
            </div>
          </template>
          <div v-else class="buddy-search-empty">
            <i class="el-icon-search"></i>
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
    <transition name="ob-modal">
      <div v-if="spaceDialogVisible" class="ob-overlay" @click.self="closeSpaceDialog">
        <div class="ob-dialog">
          <header class="ob-dialog-header">
            <h3 class="ob-dialog-title">{{ editingSpaceId ? '编辑空间' : '新建空间' }}</h3>
            <i class="el-icon-close ob-dialog-close" @click="closeSpaceDialog"></i>
          </header>
          <div class="ob-dialog-body">
            <!-- 空间名称 -->
            <div class="ob-field" :class="{ error: !!spaceErrors.name }">
              <label class="ob-field-label">空间名称 <span class="ob-field-required">*</span></label>
              <el-input
                v-model="spaceForm.name"
                size="small"
                clearable
                placeholder="输入空间名称"
                maxlength="20"
                @keydown.enter.native="saveSpace"
                @blur="validateSpaceField('name')"
                @input="clearSpaceFieldError('name')"
              />
              <p class="ob-field-error" :class="{ visible: !!spaceErrors.name }">{{ spaceErrors.name }}</p>
            </div>
            <!-- 描述 -->
            <div class="ob-field" :class="{ error: !!spaceErrors.desc }">
              <label class="ob-field-label">描述 <span class="ob-field-required">*</span></label>
              <el-input
                v-model="spaceForm.desc"
                type="textarea"
                :rows="3"
                placeholder="这个空间用来做什么？"
                maxlength="100"
                @blur="validateSpaceField('desc')"
                @input="clearSpaceFieldError('desc')"
              />
              <p class="ob-field-error" :class="{ visible: !!spaceErrors.desc }">{{ spaceErrors.desc }}</p>
            </div>
            <!-- 图标 -->
            <div class="ob-field">
              <label class="ob-field-label">图标</label>
              <div class="ob-icon-grid">
                <div
                  v-for="ic in spaceIcons"
                  :key="ic"
                  class="ob-icon-item"
                  :class="{ active: spaceForm.icon === ic }"
                  @click="spaceForm.icon = ic"
                >
                  <svg-icon :icon-class="ic" class="ob-icon-svg" />
                </div>
              </div>
            </div>
          </div>
          <footer class="ob-dialog-footer">
            <el-button size="small" round @click="closeSpaceDialog">取消</el-button>
            <el-button size="small" round type="primary" @click="saveSpace">保存</el-button>
          </footer>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import draggable from 'vuedraggable'
import { getItem, setItem } from '@/utils/db'

let spaceUid = Date.now()

// 空间可选图标（来自 assets/icons/svg）
const SPACE_ICONS = [
  'star', 'heart', 'sparkle', 'buddy', 'book', 'case', 'code', 'cube',
  'crown', 'database', 'flag', 'globe', 'home', 'key', 'money', 'palette',
  'pen', 'storage', 'tools', 'gift', 'shield', 'timer', 'calendar', 'clock'
]

// OmniBuddy 视图壳：与主 Layout 平级的独立视图
// 侧边栏（可折叠）= 空间（可管理）+ 对话列表；顶栏 = 对话搜索
export default {
  name: 'BuddyLayout',
  components: { draggable },
  data() {
    return {
      sidebarCollapsed: false,
      searchQuery: '',
      searchFocus: false,
      // 默认空间不可拖拽/编辑/删除
      defaultSpaceFilter: '.is-default',
      // 空间图标候选
      spaceIcons: SPACE_ICONS,
      // 空间列表（IndexedDB 持久化）
      spaces: [],
      activeSpaceId: '',
      // 新建/编辑空间弹窗
      spaceDialogVisible: false,
      editingSpaceId: null,
      spaceForm: { name: '', desc: '', icon: 'star' },
      // 必填字段失焦校验的错误提示
      spaceErrors: { name: '', desc: '' },
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
    toggleLeft() {
      return this.sidebarCollapsed ? '46px' : '200px'
    },
    // 当前激活会话 id（由对话页路由 query.s 驱动）
    activeChatId() {
      return this.$route.query.s || ''
    },
    // 当前空间下的对话
    visibleChats() {
      return this.chats.filter(c => c.spaceId === this.activeSpaceId)
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
    // 切换空间时记住（对话页新建会话时取用）
    activeSpaceId(id) {
      setItem('buddyActiveSpaceId', id)
    }
  },
  created() {
    this.loadSpaces()
    this.loadChats()
    // 对话页创建/更新会话后刷新列表
    this.$root.$on('omnibuddy:sessions-changed', this.loadChats)
  },
  beforeDestroy() {
    this.$root.$off('omnibuddy:sessions-changed', this.loadChats)
  },
  methods: {
    // ===== 空间管理 =====
    // 默认空间（sp-default）固定：不可编辑/删除/拖拽
    isDefaultSpace(sp) {
      return sp.id === 'sp-default'
    },
    loadSpaces() {
      const saved = getItem('buddySpaces', null)
      if (Array.isArray(saved) && saved.length) {
        this.spaces = saved
      } else {
        // 首次使用：预置默认空间
        this.spaces = [{ id: 'sp-default', name: '默认空间', desc: '', createdAt: Date.now() }]
        this.saveSpaces()
      }
      if (!this.spaces.some(s => s.id === this.activeSpaceId)) {
        this.activeSpaceId = this.spaces[0].id
      }
      setItem('buddyActiveSpaceId', this.activeSpaceId)
    },
    saveSpaces() {
      setItem('buddySpaces', this.spaces)
    },
    openCreateSpace() {
      this.editingSpaceId = null
      this.spaceForm = { name: '', desc: '', icon: 'star' }
      this.resetSpaceErrors()
      this.spaceDialogVisible = true
    },
    openEditSpace(sp) {
      this.editingSpaceId = sp.id
      this.spaceForm = { name: sp.name, desc: sp.desc || '', icon: sp.icon || 'star' }
      this.resetSpaceErrors()
      this.spaceDialogVisible = true
    },
    closeSpaceDialog() {
      this.spaceDialogVisible = false
    },
    // ===== 必填字段失焦校验 =====
    resetSpaceErrors() {
      this.spaceErrors.name = ''
      this.spaceErrors.desc = ''
    },
    validateSpaceField(field) {
      const val = (this.spaceForm[field] || '').trim()
      if (!val) {
        this.spaceErrors[field] = field === 'name' ? '请输入空间名称' : '请输入描述'
        return false
      }
      this.spaceErrors[field] = ''
      return true
    },
    // 重新输入时清除错误提示（失焦时再校验）
    clearSpaceFieldError(field) {
      if (this.spaceErrors[field]) this.spaceErrors[field] = ''
    },
    saveSpace() {
      const validName = this.validateSpaceField('name')
      const validDesc = this.validateSpaceField('desc')
      if (!validName || !validDesc) return
      const name = this.spaceForm.name.trim()
      const desc = this.spaceForm.desc.trim()
      if (this.editingSpaceId) {
        const sp = this.spaces.find(s => s.id === this.editingSpaceId)
        if (sp) {
          sp.name = name
          sp.desc = desc
          sp.icon = this.spaceForm.icon
        }
      } else {
        this.spaces.push({
          id: 'sp' + (spaceUid++),
          name,
          desc,
          icon: this.spaceForm.icon,
          createdAt: Date.now()
        })
      }
      this.saveSpaces()
      this.closeSpaceDialog()
      this.$message.success(this.editingSpaceId ? '空间已更新' : '空间已创建')
    },
    // 删除空间（二次确认；删除激活空间后自动选中第一个）
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
        this.spaces = this.spaces.filter(s => s.id !== sp.id)
        if (this.activeSpaceId === sp.id && this.spaces.length) {
          this.activeSpaceId = this.spaces[0].id
        }
        this.saveSpaces()
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
    onNewChat() {
      // 回到空会话页（发送首条消息时自动创建会话）
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
$ob-accent: #722ED1;
$buddy-sidebar-w: 200px;
$buddy-sidebar-collapsed-w: 52px;

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
  background: linear-gradient(135deg, #9254DE, $ob-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(114, 46, 209, 0.35);
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
  background: linear-gradient(135deg, #9254DE, $ob-accent);
  box-shadow: 0 1px 3px rgba(114, 46, 209, 0.35);
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;

  i {
    font-size: 12px;
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

    i {
      font-size: 13px;
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
    color: $ob-accent;
    flex-shrink: 0;
  }

  .buddy-space-name {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    background: $sidebar-item-hover;
    color: $text-primary;

    .buddy-space-actions {
      opacity: 1;
    }
  }

  &.active {
    background: rgba(114, 46, 209, 0.12);
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

  i {
    font-size: 12px;
    color: $text-secondary;
    padding: 3px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(114, 46, 209, 0.12);
      color: $ob-accent;
    }

    &.el-icon-delete:hover {
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

  i {
    font-size: 12px;
  }

  &:hover {
    border-color: $ob-accent;
    color: $ob-accent;
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

  > i {
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
    text-overflow: ellipsis;
  }

  &:hover {
    background: $sidebar-item-hover;
    color: $text-primary;

    .buddy-chat-actions {
      opacity: 1;
    }
  }

  &.active {
    background: rgba(114, 46, 209, 0.1);

    > i {
      color: $ob-accent;
    }
  }
}

/* 对话空态 */
.buddy-chat-empty {
  padding: 8px 10px;
  font-size: 12px;
  color: $text-secondary;
}

/* 对话行内操作：hover 浮现（重命名/删除） */
.buddy-chat-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;

  i {
    font-size: 12px;
    color: $text-secondary;
    padding: 3px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(114, 46, 209, 0.12);
      color: $ob-accent;
    }

    &.el-icon-delete:hover {
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
    background: rgba(114, 46, 209, 0.12);
    color: $text-sidebar-active;
    font-weight: 600;

    .buddy-footer-svg {
      color: $ob-accent;
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
    box-shadow: 0 0 0 3px rgba(114, 46, 209, 0.14);
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

  > i {
    font-size: 13px;
    color: $ob-accent;
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
    background: rgba(114, 46, 209, 0.08);
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

  i {
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

/* ===== 新建/编辑空间弹窗 ===== */
.ob-overlay {
  position: fixed;
  inset: 0;
  z-index: 3100;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
}

.ob-dialog {
  width: 460px;
  max-width: calc(100vw - 48px);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--card-bg, #fff);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

/* 空间图标选择网格 */
.ob-icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  max-height: 132px;
  overflow-y: auto;
  padding: 2px;

  &::-webkit-scrollbar {
    width: 4px;
  }
}

.ob-icon-item {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.13s ease;

  .ob-icon-svg {
    width: 15px;
    height: 15px;
    color: $text-secondary;
    transition: color 0.13s ease;
  }

  &:hover {
    border-color: rgba(114, 46, 209, 0.45);

    .ob-icon-svg {
      color: $ob-accent;
    }
  }

  &.active {
    border-color: $ob-accent;
    background: rgba(114, 46, 209, 0.1);

    .ob-icon-svg {
      color: $ob-accent;
    }
  }
}

.ob-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 0;

  .ob-dialog-title {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  .ob-dialog-close {
    font-size: 15px;
    color: $text-secondary;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    transition: all 0.15s ease;

    &:hover {
      background: $search-bg;
      color: $text-primary;
    }
  }
}

.ob-dialog-body {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.ob-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .ob-field-label {
    font-size: 12px;
    font-weight: 600;
    color: $text-primary;
  }

  .ob-field-required {
    color: #F5222D;
  }

  // 校验失败：输入框/文本域红框
  &.error ::v-deep .el-input__inner,
  &.error ::v-deep .el-textarea__inner {
    border-color: #F5222D;

    &:focus {
      border-color: #F5222D;
    }
  }

  // 错误提示固定占位，避免出现/消失时挤压布局导致抖动
  .ob-field-error {
    height: 15px;
    font-size: 11px;
    line-height: 15px;
    color: #F5222D;
    visibility: hidden;

    &.visible {
      visibility: visible;
    }
  }
}

.ob-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 18px 16px;
}

/* 弹窗过渡 */
.ob-modal-enter-active {
  transition: opacity 0.18s ease;

  .ob-dialog {
    transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.ob-modal-leave-active {
  transition: opacity 0.14s ease;

  .ob-dialog {
    transition: transform 0.14s ease;
  }
}

.ob-modal-enter,
.ob-modal-leave-to {
  opacity: 0;

  .ob-dialog {
    transform: scale(0.95) translateY(8px);
  }
}
</style>
