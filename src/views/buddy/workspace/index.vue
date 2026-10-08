<template>
  <div
    class="ob-workspace"
    :class="{ dragging: dragDepth > 0 }"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <!-- 空状态：尚未通过对话关联任何磁盘路径 -->
    <space-blank
      v-if="!workspaces.length"
      icon="storage"
      title="暂无工作空间"
      desc="在对话中关联本地磁盘路径后，即可在此像网盘一样浏览与管理文件"
    />

    <template v-else>
      <!-- 头部：工作空间信息（点击下拉切换）+ 工具栏 -->
      <space-toolbar
        :space="activeSpace"
        :count="visibleEntries.length"
        v-model:view="view"
        v-model:show-hidden="showHidden"
        v-model:search="search"
        :loading="loading"
        :workspaces="workspaceItems"
        :active-id="activeId"
        :selected-count="selected.length"
        @select-workspace="selectWorkspace"
        @create-folder="createFolder"
        @create-file="createFile"
        @import="importDialog"
        @refresh="load"
        @rename="renameWorkspace"
        @unbind="confirmUnbind"
        @space-rule="openSpaceRule"
        @trash-selected="confirmTrashSelected"
        @empty="confirmEmpty"
      />

      <!-- 面包屑 -->
      <space-crumbs :root-name="displayName(active)" :crumbs="crumbs" @go="goCrumb" />

      <!-- 主体 -->
      <div class="sp-body">
        <!-- 加载中：卡片骨架占位 -->
        <div v-if="loading" class="ob-sk-wrap">
          <buddy-skeleton type="cards" :count="12" :min="104" :gap="8" />
        </div>

        <!-- 空目录 -->
        <space-blank
          v-else-if="!visibleEntries.length"
          small
          icon="folder"
          :title="search ? '没有匹配「' + search + '」的项目' : '空文件夹'"
          :desc="emptyDesc"
        />

        <!-- 网格 / 列表视图 -->
        <space-grid
          v-else-if="view === 'grid'"
          :entries="visibleEntries"
          :selected="selected"
          @select="selectEntry"
          @open="openEntry"
          @menu="openMenu"
        />
        <space-list
          v-else
          :entries="visibleEntries"
          :selected="selected"
          @select="selectEntry"
          @open="openEntry"
          @menu="openMenu"
        />
      </div>
    </template>

    <!-- 拖拽导入遮罩 -->
    <transition name="sp-fade">
      <div v-if="dragDepth > 0 && workspaces.length" class="sp-drop-mask">
        <div class="sp-drop-inner">
          <svg-icon icon-class="upload" />
          <p>松开将文件导入当前文件夹</p>
        </div>
      </div>
    </transition>

    <!-- 右键 / 更多 菜单 -->
    <space-context-menu
      :visible="menu.visible"
      :x="menu.x"
      :y="menu.y"
      :item="menu.item"
      :selected-count="selected.length"
      @action="menuAction"
    />

    <!-- 文件预览 / 编辑 -->
    <space-file-preview
      :file="preview"
      @update:content="preview.content = $event"
      @save="savePreview"
      @close="preview.visible = false"
      @reveal="revealFile(preview.path)"
    />

    <!-- 空间规则弹窗：编辑当前空间 AGENTS.md -->
    <space-rule-dialog
      :visible="ruleDialog.visible"
      :space-id="activeId"
      :space-name="active ? displayName(active) : ''"
      :has-rule="ruleDialog.hasRule"
      @saved="onSpaceRuleSaved"
      @close="ruleDialog.visible = false"
    />
  </div>
</template>

<script>
// OmniBuddy 工作空间页：网盘风格的本地文件管理（状态与业务编排，UI 见 components/buddy/space/）
// 工作空间来源 = 对话中「关联本地磁盘路径」登记的目录；默认为空状态占位
import SpaceBlank from '@/components/buddy/space/SpaceBlank.vue'
import SpaceToolbar from '@/components/buddy/space/SpaceToolbar.vue'
import SpaceCrumbs from '@/components/buddy/space/SpaceCrumbs.vue'
import SpaceGrid from '@/components/buddy/space/SpaceGrid.vue'
import SpaceList from '@/components/buddy/space/SpaceList.vue'
import SpaceContextMenu from '@/components/buddy/space/SpaceContextMenu.vue'
import SpaceFilePreview from '@/components/buddy/space/SpaceFilePreview.vue'
import SpaceRuleDialog from '@/components/buddy/space/SpaceRuleDialog.vue'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
import { isTextEntry } from '@/utils/ui/file-meta'
import { getItem, setItem } from '@/utils/storage/db'

export default {
  name: 'OmniBuddyWorkspace',
  components: { SpaceBlank, SpaceToolbar, SpaceCrumbs, SpaceGrid, SpaceList, SpaceContextMenu, SpaceFilePreview, SpaceRuleDialog, BuddySkeleton },
  data() {
    return {
      // 已关联的工作空间列表（由对话关联磁盘路径时登记）
      workspaces: [],
      activeId: '',
      // 当前目录（绝对路径，始终位于所选工作空间根目录内）
      currentDir: '',
      entries: [],
      loading: false,
      // 多选：选中项名集合（Cmd/Ctrl 加选、Shift 范围选、单击单选）
      selected: [],
      // Shift 范围选择的锚点（最近一次单击/加选项）
      lastAnchor: '',
      // 视图与筛选
      view: 'list',
      showHidden: false,
      search: '',
      // 右键菜单
      menu: { visible: false, x: 0, y: 0, item: null },
      // 拖拽深度（enter/leave 计数，用于遮罩显隐）
      dragDepth: 0,
      // 文件预览 / 编辑
      preview: { visible: false, path: '', name: '', content: '', size: 0, mtime: 0, saving: false },
      // 空间规则弹窗（hasRule 经 rulesTargets 查询，保存后刷新）
      ruleDialog: { visible: false, hasRule: false }
    }
  },
  computed: {
    active() {
      return this.workspaces.find(w => w.id === this.activeId) || null
    },
    // 传给 SpaceToolbar 的合成空间对象（icon 统一用文件夹）
    activeSpace() {
      return this.active
        ? { name: this.displayName(this.active), dir: this.active.path, icon: 'folder' }
        : { name: '', dir: '', icon: 'folder' }
    },
    // 工作空间下拉选项（多空间时头部可切换）
    workspaceItems() {
      return this.workspaces.map(w => ({
        value: w.id,
        label: this.displayName(w),
        svg: 'folder',
        tag: w.id === this.activeId ? '' : (w.path && w.path.length > 30 ? w.path.slice(0, 28) + '…' : w.path)
      }))
    },
    filesApi() {
      return (window.electronAPI && window.electronAPI.omnibuddy && window.electronAPI.omnibuddy.files) || null
    },
    // 面包屑：根目录之后的相对层级
    crumbs() {
      const root = this.active && this.active.path
      if (!root || !this.currentDir || this.currentDir === root) return []
      const rel = this.currentDir.slice(root.length).replace(/^[/\\]+/, '')
      const parts = rel.split(/[/\\]+/).filter(Boolean)
      let acc = root
      return parts.map(name => {
        acc = acc.replace(/[/\\]+$/, '') + '/' + name
        return { name, path: acc }
      })
    },
    hiddenCount() {
      return this.entries.filter(e => e.hidden).length
    },
    // 应用隐藏开关 + 搜索过滤
    visibleEntries() {
      const q = this.search.trim().toLowerCase()
      return this.entries.filter(e => {
        if (!this.showHidden && e.hidden) return false
        if (q && !e.name.toLowerCase().includes(q)) return false
        return true
      })
    },
    // 空目录时的提示文案
    emptyDesc() {
      if (this.search) return ''
      if (this.hiddenCount && !this.showHidden) {
        return this.hiddenCount + ' 个隐藏项目未显示，可点击工具栏「隐藏项」查看'
      }
      return '拖入文件或点击「导入」添加内容'
    }
  },
  watch: {
    currentDir() {
      this.selected = []
      this.lastAnchor = ''
      this.search = ''
      this.load()
    }
  },
  created() {
    this.loadWorkspaces()
    // 对话关联/展示名更新后同步
    this.$bus.on('omnibuddy:workspaces-changed', this.loadWorkspaces)
    // 全局点击 / Esc 关闭右键菜单
    document.addEventListener('mousedown', this.onDocMouseDown)
    document.addEventListener('keydown', this.onKeydown)
  },
  beforeUnmount() {
    this.$bus.off('omnibuddy:workspaces-changed', this.loadWorkspaces)
    document.removeEventListener('mousedown', this.onDocMouseDown)
    document.removeEventListener('keydown', this.onKeydown)
  },
  methods: {
    // ===== 工作空间 =====
    // 展示名（未重命名时按磁盘路径呈现，与任务列表分组口径一致）
    displayName(w) {
      const name = (w && w.name) || ''
      return name && name !== w.path ? name : w.path
    },
    // 空间规则弹窗：打开前查一次该空间 hasRule 状态
    async openSpaceRule() {
      if (!this.activeId) return
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (api && api.rulesTargets) {
        try {
          const targets = await api.rulesTargets()
          const t = (targets || []).find(x => x.key === this.activeId)
          this.ruleDialog.hasRule = !!(t && t.hasRule)
        } catch (e) {
          this.ruleDialog.hasRule = false
        }
      }
      this.ruleDialog.visible = true
    },
    // 空间规则保存后：刷新徽标状态
    async onSpaceRuleSaved() {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (!api || !api.rulesTargets) return
      try {
        const targets = await api.rulesTargets()
        const t = (targets || []).find(x => x.key === this.activeId)
        this.ruleDialog.hasRule = !!(t && t.hasRule)
      } catch (e) { /* 保持现状 */ }
    },
    async loadWorkspaces() {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (!api) {
        this.workspaces = []
        return
      }
      const list = await api.listWorkspaces()
      this.workspaces = Array.isArray(list) ? list.filter(w => w.available !== false) : []
      // 恢复上次选中；失效则取第一个
      const saved = getItem('buddyActiveWorkspaceId', '')
      const hit = this.workspaces.find(w => w.id === saved)
      this.selectWorkspace(hit || this.workspaces[0] || null)
    },
    selectWorkspace(w) {
      // 下拉事件传 id，这里归一为对象
      if (typeof w === 'string') w = this.workspaces.find(x => x.id === w) || null
      const prevId = this.activeId
      this.activeId = (w && w.id) || ''
      if (this.activeId) setItem('buddyActiveWorkspaceId', this.activeId)
      // 切换工作空间回根目录（同空间不重置当前目录）
      if (this.activeId && this.activeId !== prevId) {
        this.currentDir = w.path
      } else if (!this.activeId) {
        this.currentDir = ''
        this.entries = []
      }
    },
    // 重命名当前工作空间：改展示名（磁盘目录不动），成功后同步下拉与任务列表分组
    async renameWorkspace() {
      const ws = this.active
      if (!ws) return
      const { value } = await this.$prompt('请输入新的空间名称', '重命名工作空间', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: this.displayName(ws)
      }).catch(() => ({ value: '' }))
      const name = String(value || '').trim()
      if (!name || name === this.displayName(ws)) return
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (!api || !api.renameWorkspace) return
      const res = await api.renameWorkspace({ id: ws.id, name })
      if (res && res.ok) {
        ws.name = name
        this.$bus.emit('omnibuddy:workspaces-changed')
        this.$message.success('已重命名')
      } else {
        this.$message.error((res && res.error) || '重命名失败')
      }
    },
    // 解绑当前工作空间：二次确认后解除登记并删除该空间全部任务记录（含检查点）；
    // 磁盘文件不受影响，记忆摘要照常留档
    confirmUnbind() {
      const ws = this.active
      if (!ws) return
      const name = this.displayName(ws)
      this.$confirm(
        '解绑后「' + name + '」将从列表移除，该空间下的任务记录（含对话与检查点）将一并删除；磁盘文件不受影响。',
        '解绑工作空间',
        { confirmButtonText: '解绑', cancelButtonText: '取消', type: 'warning' }
      ).then(async () => {
        const api = window.electronAPI && window.electronAPI.omnibuddy
        if (!api) return
        const res = await api.removeWorkspace(ws.id)
        if (!res || !res.ok) {
          this.$message.error((res && res.error) || '解绑失败')
          return
        }
        const removed = res.removedSessions || []
        // 被删会话：清理页签与会话状态池，当前正在查看的会话命中则回新建页
        for (const sid of removed) {
          this.$store.commit('tagsView/DEL_TAB', { side: 'buddy', fullPath: '/omnibuddy?s=' + sid })
          this.$store.commit('buddyChat/DROP_SESSION', sid)
        }
        if (removed.includes(this.$route.query.s)) {
          this.$router.push('/omnibuddy').catch(() => {})
        }
        await this.loadWorkspaces()
        this.$bus.emit('omnibuddy:sessions-changed')
        this.$bus.emit('omnibuddy:workspaces-changed')
        this.$message.success(removed.length ? '已解绑，删除任务记录 ' + removed.length + ' 条' : '已解绑')
      }).catch(() => {})
    },
    async load() {
      if (!this.currentDir) return
      if (!this.filesApi) {
        this.$message.info('文件管理需要 OmniDeck 桌面端')
        return
      }
      this.loading = true
      const res = await this.filesApi.list(this.currentDir)
      this.loading = false
      if (res && res.ok) {
        this.entries = res.entries || []
        // 清理已消失的选中项（删除 / 重命名 / 导入覆盖后保持高亮一致）
        this.selected = this.selected.filter(n => this.entries.some(x => x.name === n))
        if (!this.selected.includes(this.lastAnchor)) this.lastAnchor = this.selected[this.selected.length - 1] || ''
      } else {
        this.entries = []
        if (res && res.error) this.$message.error(res.error)
      }
    },
    // ===== 浏览 =====
    entryPath(en) {
      return this.currentDir.replace(/[/\\]+$/, '') + '/' + en.name
    },
    // 列表项点击选择（访达式多选）：普通单击单选 / Cmd+Ctrl 切换加选 / Shift 范围选
    selectEntry(name, e) {
      const toggle = e && (e.metaKey || e.ctrlKey)
      const range = e && e.shiftKey
      if (toggle) {
        this.selected = this.selected.includes(name)
          ? this.selected.filter(n => n !== name)
          : this.selected.concat(name)
        this.lastAnchor = name
      } else if (range && this.lastAnchor) {
        const names = this.visibleEntries.map(x => x.name)
        const a = names.indexOf(this.lastAnchor)
        const b = names.indexOf(name)
        if (a >= 0 && b >= 0) {
          const [s, t] = a < b ? [a, b] : [b, a]
          this.selected = names.slice(s, t + 1)
        }
      } else {
        this.selected = [name]
        this.lastAnchor = name
      }
    },
    openEntry(en) {
      if (en.isDir) {
        this.currentDir = this.entryPath(en)
        return
      }
      if (isTextEntry(en)) {
        this.openPreview(en)
      } else {
        this.openExternal(en)
      }
    },
    goCrumb(idx) {
      this.currentDir = idx < 0 ? this.active.path : this.crumbs[idx].path
    },
    // ===== 操作 =====
    async createFolder() {
      const { value } = await this.$prompt('请输入文件夹名称', '新建文件夹', {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputValue: '新建文件夹',
        inputPattern: /^[^\\/]+$/,
        inputErrorMessage: '名称不能包含 / 或 \\'
      }).catch(() => ({ value: '' }))
      const name = String(value || '').trim()
      if (!name) return
      const res = await this.filesApi.mkdir({ dir: this.currentDir, name })
      if (res && res.ok) {
        this.$message.success('文件夹已创建')
        this.load()
      } else {
        this.$message.error((res && res.error) || '创建失败')
      }
    },
    async createFile() {
      const { value } = await this.$prompt('请输入文件名称（含扩展名）', '新建文件', {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputValue: '未命名.txt',
        inputPattern: /^[^\\/]+$/,
        inputErrorMessage: '名称不能包含 / 或 \\'
      }).catch(() => ({ value: '' }))
      const name = String(value || '').trim()
      if (!name) return
      const res = await this.filesApi.createFile({ dir: this.currentDir, name })
      if (res && res.ok) {
        this.$message.success('文件已创建')
        this.load()
      } else {
        this.$message.error((res && res.error) || '创建失败')
      }
    },
    async importDialog() {
      if (!this.filesApi) return
      const res = await this.filesApi.importDialog(this.currentDir)
      if (res && res.ok) {
        this.$message.success('已导入 ' + res.count + ' 个文件')
        this.load()
      } else if (res && !res.canceled && res.error) {
        this.$message.error(res.error)
      }
    },
    async renameEntry(en) {
      const { value } = await this.$prompt('请输入新名称', '重命名', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: en.name,
        inputPattern: /^[^\\/]+$/,
        inputErrorMessage: '名称不能包含 / 或 \\'
      }).catch(() => ({ value: '' }))
      const name = String(value || '').trim()
      if (!name || name === en.name) return
      const res = await this.filesApi.rename({ path: this.entryPath(en), name })
      if (res && res.ok) {
        this.$message.success('已重命名')
        this.load()
      } else {
        this.$message.error((res && res.error) || '重命名失败')
      }
    },
    trashEntry(en) {
      const tip = en.isDir ? '文件夹及其全部内容' : '文件'
      this.$confirm('将把该' + tip + '移到系统废纸篓，确定删除「' + en.name + '」吗？', '删除', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const res = await this.filesApi.trash(this.entryPath(en))
        if (res && res.ok) {
          this.$message.success('已移到废纸篓')
          this.load()
        } else {
          this.$message.error((res && res.error) || '删除失败')
        }
      }).catch(() => {})
    },
    // 批量删除所选（工具栏按钮 / 多选态右键菜单入口）
    confirmTrashSelected() {
      const names = this.selected.slice()
      if (!names.length || !this.filesApi) return
      this.$confirm('将把所选 ' + names.length + ' 个项目（含文件夹及其内容）移到系统废纸篓，确定删除吗？', '删除所选', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const res = await this.filesApi.trashBatch(names.map(n => this.entryPath({ name: n })))
        if (res && res.ok) {
          this.$message.success('已移到废纸篓 ' + res.count + ' 项' + (res.error ? '，' + res.error : ''))
          this.selected = []
          this.lastAnchor = ''
          this.load()
        } else {
          this.$message.error((res && res.error) || '删除失败')
        }
      }).catch(() => {})
    },
    // 清空当前空间：根目录全部内容（含隐藏项）移到废纸篓，不影响空间绑定与任务记录
    confirmEmpty() {
      const ws = this.active
      if (!ws || !this.filesApi) return
      this.$confirm(
        '将把「' + this.displayName(ws) + '」根目录下的全部内容（含隐藏项目）移到系统废纸篓。空间绑定与任务记录不受影响，确定清空吗？',
        '清空空间',
        { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' }
      ).then(async () => {
        const res = await this.filesApi.empty(ws.path)
        if (res && res.ok) {
          this.$message.success('已清空 ' + res.count + ' 个项目' + (res.error ? '，' + res.error : ''))
          this.selected = []
          this.lastAnchor = ''
          this.load()
        } else {
          this.$message.error((res && res.error) || '清空失败')
        }
      }).catch(() => {})
    },
    async revealEntry(en) {
      const res = await this.filesApi.reveal(this.entryPath(en))
      if (!res || !res.ok) this.$message.error((res && res.error) || '操作失败')
    },
    async openExternal(en) {
      const res = await this.filesApi.open(this.entryPath(en))
      if (!res || !res.ok) this.$message.error((res && res.error) || '打开失败')
    },
    // ===== 右键菜单 =====
    openMenu(e, en) {
      // 右键项不在选中集合内：重置为单选；在集合内：保留多选（删除项作用于全部选中）
      if (!this.selected.includes(en.name)) {
        this.selected = [en.name]
        this.lastAnchor = en.name
      }
      // 视口边缘收敛
      const x = Math.min(e.clientX, window.innerWidth - 190)
      const y = Math.min(e.clientY, window.innerHeight - 190)
      this.menu = { visible: true, x, y, item: en }
    },
    closeMenu() {
      this.menu.visible = false
      this.menu.item = null
    },
    onDocMouseDown(e) {
      if (this.menu.visible && !e.target.closest('.sp-menu')) this.closeMenu()
    },
    onKeydown(e) {
      if (e.key !== 'Escape') return
      this.closeMenu()
      if (this.preview.visible) this.preview.visible = false
    },
    menuAction(action) {
      const en = this.menu.item
      this.closeMenu()
      if (!en) return
      switch (action) {
        case 'open':
          this.openEntry(en)
          break
        case 'reveal':
          this.revealEntry(en)
          break
        case 'rename':
          this.renameEntry(en)
          break
        case 'trash':
          // 多选态下（右键项在选中集合内）：批量删除全部选中项，否则删单条
          if (this.selected.length > 1 && this.selected.includes(en.name)) {
            this.confirmTrashSelected()
          } else {
            this.trashEntry(en)
          }
          break
        default:
          break
      }
    },
    // ===== 预览 / 编辑 =====
    async openPreview(en) {
      if (!this.filesApi) return
      const res = await this.filesApi.read(this.entryPath(en))
      if (res && res.ok) {
        this.preview = {
          visible: true,
          path: this.entryPath(en),
          name: en.name,
          content: res.content,
          size: res.size,
          mtime: res.mtime,
          saving: false
        }
      } else if (res && (res.binary || res.tooLarge)) {
        // 二进制 / 超大文件交给系统应用
        this.openExternal(en)
      } else {
        this.$message.error((res && res.error) || '读取失败')
      }
    },
    async savePreview() {
      this.preview.saving = true
      const res = await this.filesApi.write({ path: this.preview.path, content: this.preview.content })
      this.preview.saving = false
      if (res && res.ok) {
        this.$message.success('已保存')
        this.load()
      } else {
        this.$message.error((res && res.error) || '保存失败')
      }
    },
    async revealFile(p) {
      const res = await this.filesApi.reveal(p)
      if (!res || !res.ok) this.$message.error((res && res.error) || '操作失败')
    },
    // ===== 拖拽导入 =====
    onDragEnter() {
      this.dragDepth++
    },
    onDragLeave() {
      this.dragDepth = Math.max(0, this.dragDepth - 1)
    },
    async onDrop(e) {
      this.dragDepth = 0
      const files = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
      if (!files.length || !this.filesApi || !this.currentDir) return
      const getPath = window.electronAPI && window.electronAPI.getPathForFile
      const paths = files.map(f => (getPath ? getPath(f) : '')).filter(Boolean)
      if (!paths.length) return
      const res = await this.filesApi.importPaths({ dir: this.currentDir, paths })
      if (res && res.ok) {
        this.$message.success('已导入 ' + res.count + ' 个文件')
        this.load()
      } else if (res && res.error) {
        this.$message.error(res.error)
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-workspace {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  position: relative;
  -webkit-app-region: no-drag;
}

/* ===== 主体 ===== */
.sp-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 20px 20px;
  display: flex;
  flex-direction: column;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(0, 0, 0, 0.15));
    border-radius: 3px;
  }
}

/* 加载骨架容器内边距 */
.ob-sk-wrap {
  padding: 18px 4px;
}

/* 加载中 */
.sp-state {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--text-secondary);

  i {
    font-size: 22px;
  }
}

/* ===== 拖拽导入遮罩 ===== */
.sp-drop-mask {
  position: absolute;
  inset: 0;
  z-index: 500;
  background: rgba(var(--primary-color-rgb), 0.06);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.sp-drop-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 28px 44px;
  border-radius: 18px;
  border: 2px dashed rgba(var(--primary-color-rgb), 0.5);
  background: var(--card-bg, #fff);
  box-shadow: 0 16px 40px rgba(0, 0, 0, 0.14);

  .svg-icon {
    font-size: 28px;
    color: var(--primary-color);
  }

  p {
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary);
  }
}

/* 遮罩淡入淡出 */
.sp-fade-enter-active,
.sp-fade-leave-active {
  transition: opacity 0.15s ease;
}

.sp-fade-enter,
.sp-fade-leave-to {
  opacity: 0;
}
</style>
