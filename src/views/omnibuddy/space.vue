<template>
  <div
    class="ob-space"
    :class="{ dragging: dragDepth > 0 }"
    @dragenter="onDragEnter"
    @dragleave="onDragLeave"
    @dragover.prevent
    @drop.prevent="onDrop"
  >
    <!-- 未选择空间 -->
    <space-blank
      v-if="!space"
      icon="storage"
      title="未选择空间"
      desc="在左侧选择或新建一个空间，即可像网盘一样管理其关联的本地目录"
    />

    <!-- 空间未关联目录 -->
    <space-blank
      v-else-if="!space.dir"
      icon="folder"
      :title="space.name + ' 未关联本地目录'"
      desc="在左侧编辑该空间并选择一个本地目录后，即可浏览与管理文件"
    />

    <template v-else>
      <!-- 头部：空间信息 + 工具栏 -->
      <space-toolbar
        :space="space"
        :count="visibleEntries.length"
        :view.sync="view"
        :show-hidden.sync="showHidden"
        :search.sync="search"
        :loading="loading"
        @create-folder="createFolder"
        @create-file="createFile"
        @import="importDialog"
        @refresh="load"
      />

      <!-- 面包屑 -->
      <space-crumbs :root-name="space.name" :crumbs="crumbs" @go="goCrumb" />

      <!-- 主体 -->
      <div class="sp-body">
        <!-- 加载中 -->
        <div v-if="loading" class="sp-state"><svg-icon icon-class="loading" class="sp-spin" /></div>

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
          @select="selected = $event"
          @open="openEntry"
          @menu="openMenu"
        />
        <space-list
          v-else
          :entries="visibleEntries"
          :selected="selected"
          @select="selected = $event"
          @open="openEntry"
          @menu="openMenu"
        />
      </div>
    </template>

    <!-- 拖拽导入遮罩 -->
    <transition name="sp-fade">
      <div v-if="dragDepth > 0 && space && space.dir" class="sp-drop-mask">
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
  </div>
</template>

<script>
// OmniBuddy 空间页：网盘风格的本地文件管理（状态与业务编排，UI 见 components/buddy/space/）
import SpaceBlank from '@/components/buddy/space/SpaceBlank.vue'
import SpaceToolbar from '@/components/buddy/space/SpaceToolbar.vue'
import SpaceCrumbs from '@/components/buddy/space/SpaceCrumbs.vue'
import SpaceGrid from '@/components/buddy/space/SpaceGrid.vue'
import SpaceList from '@/components/buddy/space/SpaceList.vue'
import SpaceContextMenu from '@/components/buddy/space/SpaceContextMenu.vue'
import SpaceFilePreview from '@/components/buddy/space/SpaceFilePreview.vue'
import { isTextEntry } from '@/utils/file-meta'
import { getItem } from '@/utils/db'
import { getBuddySpaces } from '@/utils/buddy-space'

export default {
  name: 'OmniBuddySpace',
  components: { SpaceBlank, SpaceToolbar, SpaceCrumbs, SpaceGrid, SpaceList, SpaceContextMenu, SpaceFilePreview },
  data() {
    return {
      spaces: [],
      activeSpaceId: '',
      // 当前目录（绝对路径，始终位于所选空间根目录内）
      currentDir: '',
      entries: [],
      loading: false,
      selected: '',
      // 视图与筛选
      view: 'grid',
      showHidden: false,
      search: '',
      // 右键菜单
      menu: { visible: false, x: 0, y: 0, item: null },
      // 拖拽深度（enter/leave 计数，用于遮罩显隐）
      dragDepth: 0,
      // 文件预览 / 编辑
      preview: { visible: false, path: '', name: '', content: '', size: 0, mtime: 0, saving: false }
    }
  },
  computed: {
    space() {
      return this.spaces.find(s => s.id === this.activeSpaceId) || null
    },
    filesApi() {
      return (window.electronAPI && window.electronAPI.omnibuddy && window.electronAPI.omnibuddy.files) || null
    },
    // 面包屑：根目录之后的相对层级
    crumbs() {
      const root = this.space && this.space.dir
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
      this.selected = ''
      this.search = ''
      this.load()
    }
  },
  created() {
    this.loadSpaces()
    // 左侧空间增删改 / 切换后同步
    this.$root.$on('omnibuddy:spaces-changed', this.onSpacesChanged)
    this.$root.$on('omnibuddy:active-space-changed', this.onActiveSpaceChanged)
    // 全局点击 / Esc 关闭右键菜单
    document.addEventListener('mousedown', this.onDocMouseDown)
    document.addEventListener('keydown', this.onKeydown)
  },
  beforeDestroy() {
    this.$root.$off('omnibuddy:spaces-changed', this.onSpacesChanged)
    this.$root.$off('omnibuddy:active-space-changed', this.onActiveSpaceChanged)
    document.removeEventListener('mousedown', this.onDocMouseDown)
    document.removeEventListener('keydown', this.onKeydown)
  },
  methods: {
    // ===== 数据 =====
    loadSpaces() {
      // 异步加载：系统默认空间（运行时派生）+ 用户空间
      return getBuddySpaces().then(list => {
        this.spaces = list
        const active = getItem('buddyActiveSpaceId', '')
        this.activeSpaceId = this.spaces.some(s => s.id === active) ? active : ''
        this.applySpace()
      })
    },
    // 按当前空间重置目录（目录失效时回根目录）
    applySpace() {
      const dir = this.space && this.space.dir
      if (!dir) {
        this.currentDir = ''
        this.entries = []
        return
      }
      const inside = this.currentDir && (this.currentDir + '/').startsWith(dir.replace(/[/\\]+$/, '') + '/')
      this.currentDir = inside ? this.currentDir : dir
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
      } else {
        this.entries = []
        if (res && res.error) this.$message.error(res.error)
      }
    },
    onSpacesChanged() {
      this.loadSpaces()
    },
    onActiveSpaceChanged(id) {
      if (id === this.activeSpaceId) return
      this.activeSpaceId = id
      // 切换空间回根目录
      const sp = this.space
      this.currentDir = sp && sp.dir ? sp.dir : ''
    },
    // ===== 浏览 =====
    entryPath(en) {
      return this.currentDir.replace(/[/\\]+$/, '') + '/' + en.name
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
      this.currentDir = idx < 0 ? this.space.dir : this.crumbs[idx].path
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
      this.selected = en.name
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
          this.trashEntry(en)
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
.ob-space {
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
