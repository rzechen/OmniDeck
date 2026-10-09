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

<script setup>
// OmniBuddy 工作空间页：网盘风格的本地文件管理（状态与业务编排，UI 见 components/buddy/space/）
// 工作空间来源 = 对话中「关联本地磁盘路径」登记的目录；默认为空状态占位
import { ref, reactive, computed, watch, onBeforeUnmount } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useStore } from 'vuex'
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
import { bus } from '@/utils/ui/bus'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'OmniBuddyWorkspace' })

const router = useRouter()
const route = useRoute()
const store = useStore()
const { message, confirm, prompt } = useFeedback()

// 已关联的工作空间列表（由对话关联磁盘路径时登记）
const workspaces = ref([])
const activeId = ref('')
// 当前目录（绝对路径，始终位于所选工作空间根目录内）
const currentDir = ref('')
const entries = ref([])
const loading = ref(false)
// 多选：选中项名集合（Cmd/Ctrl 加选、Shift 范围选、单击单选）
const selected = ref([])
// Shift 范围选择的锚点（最近一次单击/加选项）
const lastAnchor = ref('')
// 视图与筛选
const view = ref('list')
const showHidden = ref(false)
const search = ref('')
// 右键菜单
const menu = reactive({ visible: false, x: 0, y: 0, item: null })
// 拖拽深度（enter/leave 计数，用于遮罩显隐）
const dragDepth = ref(0)
// 文件预览 / 编辑
const preview = reactive({ visible: false, path: '', name: '', content: '', size: 0, mtime: 0, saving: false })
// 空间规则弹窗（hasRule 经 rulesTargets 查询，保存后刷新）
const ruleDialog = reactive({ visible: false, hasRule: false })

const active = computed(() => {
  return workspaces.value.find(w => w.id === activeId.value) || null
})

// 传给 SpaceToolbar 的合成空间对象（icon 统一用文件夹）
const activeSpace = computed(() => {
  return active.value
    ? { name: displayName(active.value), dir: active.value.path, icon: 'folder' }
    : { name: '', dir: '', icon: 'folder' }
})

// 工作空间下拉选项（多空间时头部可切换）
const workspaceItems = computed(() => {
  return workspaces.value.map(w => ({
    value: w.id,
    label: displayName(w),
    svg: 'folder',
    tag: w.id === activeId.value ? '' : (w.path && w.path.length > 30 ? w.path.slice(0, 28) + '…' : w.path)
  }))
})

const filesApi = computed(() => {
  return (window.electronAPI && window.electronAPI.omnibuddy && window.electronAPI.omnibuddy.files) || null
})

// 面包屑：根目录之后的相对层级
const crumbs = computed(() => {
  const root = active.value && active.value.path
  if (!root || !currentDir.value || currentDir.value === root) return []
  const rel = currentDir.value.slice(root.length).replace(/^[/\\]+/, '')
  const parts = rel.split(/[/\\]+/).filter(Boolean)
  let acc = root
  return parts.map(name => {
    acc = acc.replace(/[/\\]+$/, '') + '/' + name
    return { name, path: acc }
  })
})

const hiddenCount = computed(() => {
  return entries.value.filter(e => e.hidden).length
})

// 应用隐藏开关 + 搜索过滤
const visibleEntries = computed(() => {
  const q = search.value.trim().toLowerCase()
  return entries.value.filter(e => {
    if (!showHidden.value && e.hidden) return false
    if (q && !e.name.toLowerCase().includes(q)) return false
    return true
  })
})

// 空目录时的提示文案
const emptyDesc = computed(() => {
  if (search.value) return ''
  if (hiddenCount.value && !showHidden.value) {
    return hiddenCount.value + ' 个隐藏项目未显示，可点击工具栏「隐藏项」查看'
  }
  return '拖入文件或点击「导入」添加内容'
})

// ===== 工作空间 =====
// 展示名（未重命名时按磁盘路径呈现，与任务列表分组口径一致）
function displayName(w) {
  const name = (w && w.name) || ''
  return name && name !== w.path ? name : w.path
}

// 空间规则弹窗：打开前查一次该空间 hasRule 状态
async function openSpaceRule() {
  if (!activeId.value) return
  const api = window.electronAPI && window.electronAPI.omnibuddy
  if (api && api.rulesTargets) {
    try {
      const targets = await api.rulesTargets()
      const t = (targets || []).find(x => x.key === activeId.value)
      ruleDialog.hasRule = !!(t && t.hasRule)
    } catch (e) {
      ruleDialog.hasRule = false
    }
  }
  ruleDialog.visible = true
}

// 空间规则保存后：刷新徽标状态
async function onSpaceRuleSaved() {
  const api = window.electronAPI && window.electronAPI.omnibuddy
  if (!api || !api.rulesTargets) return
  try {
    const targets = await api.rulesTargets()
    const t = (targets || []).find(x => x.key === activeId.value)
    ruleDialog.hasRule = !!(t && t.hasRule)
  } catch (e) { /* 保持现状 */ }
}

async function loadWorkspaces() {
  const api = window.electronAPI && window.electronAPI.omnibuddy
  if (!api) {
    workspaces.value = []
    return
  }
  const list = await api.listWorkspaces()
  workspaces.value = Array.isArray(list) ? list.filter(w => w.available !== false) : []
  // 恢复上次选中；失效则取第一个
  const saved = getItem('buddyActiveWorkspaceId', '')
  const hit = workspaces.value.find(w => w.id === saved)
  selectWorkspace(hit || workspaces.value[0] || null)
}

function selectWorkspace(w) {
  // 下拉事件传 id，这里归一为对象
  if (typeof w === 'string') w = workspaces.value.find(x => x.id === w) || null
  const prevId = activeId.value
  activeId.value = (w && w.id) || ''
  if (activeId.value) setItem('buddyActiveWorkspaceId', activeId.value)
  // 切换工作空间回根目录（同空间不重置当前目录）
  if (activeId.value && activeId.value !== prevId) {
    currentDir.value = w.path
  } else if (!activeId.value) {
    currentDir.value = ''
    entries.value = []
  }
}

// 重命名当前工作空间：改展示名（磁盘目录不动），成功后同步下拉与任务列表分组
async function renameWorkspace() {
  const ws = active.value
  if (!ws) return
  const { value } = await prompt('请输入新的空间名称', '重命名工作空间', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputValue: displayName(ws)
  }).catch(() => ({ value: '' }))
  const name = String(value || '').trim()
  if (!name || name === displayName(ws)) return
  const api = window.electronAPI && window.electronAPI.omnibuddy
  if (!api || !api.renameWorkspace) return
  const res = await api.renameWorkspace({ id: ws.id, name })
  if (res && res.ok) {
    ws.name = name
    bus.emit('omnibuddy:workspaces-changed')
    message.success('已重命名')
  } else {
    message.error((res && res.error) || '重命名失败')
  }
}

// 解绑当前工作空间：二次确认后解除登记并删除该空间全部任务记录（含检查点）；
// 磁盘文件不受影响，记忆摘要照常留档
function confirmUnbind() {
  const ws = active.value
  if (!ws) return
  const name = displayName(ws)
  confirm(
    '解绑后「' + name + '」将从列表移除，该空间下的任务记录（含对话与检查点）将一并删除；磁盘文件不受影响。',
    '解绑工作空间',
    { confirmButtonText: '解绑', cancelButtonText: '取消', type: 'warning' }
  ).then(async () => {
    const api = window.electronAPI && window.electronAPI.omnibuddy
    if (!api) return
    const res = await api.removeWorkspace(ws.id)
    if (!res || !res.ok) {
      message.error((res && res.error) || '解绑失败')
      return
    }
    const removed = res.removedSessions || []
    // 被删会话：清理页签与会话状态池，当前正在查看的会话命中则回新建页
    for (const sid of removed) {
      store.commit('tagsView/DEL_TAB', { side: 'buddy', fullPath: '/omnibuddy?s=' + sid })
      store.commit('buddyChat/DROP_SESSION', sid)
    }
    if (removed.includes(route.query.s)) {
      router.push('/omnibuddy').catch(() => {})
    }
    await loadWorkspaces()
    bus.emit('omnibuddy:sessions-changed')
    bus.emit('omnibuddy:workspaces-changed')
    message.success(removed.length ? '已解绑，删除任务记录 ' + removed.length + ' 条' : '已解绑')
  }).catch(() => {})
}

async function load() {
  if (!currentDir.value) return
  if (!filesApi.value) {
    message.info('文件管理需要 OmniDeck 桌面端')
    return
  }
  loading.value = true
  const res = await filesApi.value.list(currentDir.value)
  loading.value = false
  if (res && res.ok) {
    entries.value = res.entries || []
    // 清理已消失的选中项（删除 / 重命名 / 导入覆盖后保持高亮一致）
    selected.value = selected.value.filter(n => entries.value.some(x => x.name === n))
    if (!selected.value.includes(lastAnchor.value)) lastAnchor.value = selected.value[selected.value.length - 1] || ''
  } else {
    entries.value = []
    if (res && res.error) message.error(res.error)
  }
}

// ===== 浏览 =====
function entryPath(en) {
  return currentDir.value.replace(/[/\\]+$/, '') + '/' + en.name
}

// 列表项点击选择（访达式多选）：普通单击单选 / Cmd+Ctrl 切换加选 / Shift 范围选
function selectEntry(name, e) {
  const toggle = e && (e.metaKey || e.ctrlKey)
  const range = e && e.shiftKey
  if (toggle) {
    selected.value = selected.value.includes(name)
      ? selected.value.filter(n => n !== name)
      : selected.value.concat(name)
    lastAnchor.value = name
  } else if (range && lastAnchor.value) {
    const names = visibleEntries.value.map(x => x.name)
    const a = names.indexOf(lastAnchor.value)
    const b = names.indexOf(name)
    if (a >= 0 && b >= 0) {
      const [s, t] = a < b ? [a, b] : [b, a]
      selected.value = names.slice(s, t + 1)
    }
  } else {
    selected.value = [name]
    lastAnchor.value = name
  }
}

function openEntry(en) {
  if (en.isDir) {
    currentDir.value = entryPath(en)
    return
  }
  if (isTextEntry(en)) {
    openPreview(en)
  } else {
    openExternal(en)
  }
}

function goCrumb(idx) {
  currentDir.value = idx < 0 ? active.value.path : crumbs.value[idx].path
}

// ===== 操作 =====
async function createFolder() {
  const { value } = await prompt('请输入文件夹名称', '新建文件夹', {
    confirmButtonText: '创建',
    cancelButtonText: '取消',
    inputValue: '新建文件夹',
    inputPattern: /^[^\\/]+$/,
    inputErrorMessage: '名称不能包含 / 或 \\'
  }).catch(() => ({ value: '' }))
  const name = String(value || '').trim()
  if (!name) return
  const res = await filesApi.value.mkdir({ dir: currentDir.value, name })
  if (res && res.ok) {
    message.success('文件夹已创建')
    load()
  } else {
    message.error((res && res.error) || '创建失败')
  }
}

async function createFile() {
  const { value } = await prompt('请输入文件名称（含扩展名）', '新建文件', {
    confirmButtonText: '创建',
    cancelButtonText: '取消',
    inputValue: '未命名.txt',
    inputPattern: /^[^\\/]+$/,
    inputErrorMessage: '名称不能包含 / 或 \\'
  }).catch(() => ({ value: '' }))
  const name = String(value || '').trim()
  if (!name) return
  const res = await filesApi.value.createFile({ dir: currentDir.value, name })
  if (res && res.ok) {
    message.success('文件已创建')
    load()
  } else {
    message.error((res && res.error) || '创建失败')
  }
}

async function importDialog() {
  if (!filesApi.value) return
  const res = await filesApi.value.importDialog(currentDir.value)
  if (res && res.ok) {
    message.success('已导入 ' + res.count + ' 个文件')
    load()
  } else if (res && !res.canceled && res.error) {
    message.error(res.error)
  }
}

async function renameEntry(en) {
  const { value } = await prompt('请输入新名称', '重命名', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputValue: en.name,
    inputPattern: /^[^\\/]+$/,
    inputErrorMessage: '名称不能包含 / 或 \\'
  }).catch(() => ({ value: '' }))
  const name = String(value || '').trim()
  if (!name || name === en.name) return
  const res = await filesApi.value.rename({ path: entryPath(en), name })
  if (res && res.ok) {
    message.success('已重命名')
    load()
  } else {
    message.error((res && res.error) || '重命名失败')
  }
}

function trashEntry(en) {
  const tip = en.isDir ? '文件夹及其全部内容' : '文件'
  confirm('将把该' + tip + '移到系统废纸篓，确定删除「' + en.name + '」吗？', '删除', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    const res = await filesApi.value.trash(entryPath(en))
    if (res && res.ok) {
      message.success('已移到废纸篓')
      load()
    } else {
      message.error((res && res.error) || '删除失败')
    }
  }).catch(() => {})
}

// 批量删除所选（工具栏按钮 / 多选态右键菜单入口）
function confirmTrashSelected() {
  const names = selected.value.slice()
  if (!names.length || !filesApi.value) return
  confirm('将把所选 ' + names.length + ' 个项目（含文件夹及其内容）移到系统废纸篓，确定删除吗？', '删除所选', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    const res = await filesApi.value.trashBatch(names.map(n => entryPath({ name: n })))
    if (res && res.ok) {
      message.success('已移到废纸篓 ' + res.count + ' 项' + (res.error ? '，' + res.error : ''))
      selected.value = []
      lastAnchor.value = ''
      load()
    } else {
      message.error((res && res.error) || '删除失败')
    }
  }).catch(() => {})
}

// 清空当前空间：根目录全部内容（含隐藏项）移到废纸篓，不影响空间绑定与任务记录
function confirmEmpty() {
  const ws = active.value
  if (!ws || !filesApi.value) return
  confirm(
    '将把「' + displayName(ws) + '」根目录下的全部内容（含隐藏项目）移到系统废纸篓。空间绑定与任务记录不受影响，确定清空吗？',
    '清空空间',
    { confirmButtonText: '清空', cancelButtonText: '取消', type: 'warning' }
  ).then(async () => {
    const res = await filesApi.value.empty(ws.path)
    if (res && res.ok) {
      message.success('已清空 ' + res.count + ' 个项目' + (res.error ? '，' + res.error : ''))
      selected.value = []
      lastAnchor.value = ''
      load()
    } else {
      message.error((res && res.error) || '清空失败')
    }
  }).catch(() => {})
}

async function revealEntry(en) {
  const res = await filesApi.value.reveal(entryPath(en))
  if (!res || !res.ok) message.error((res && res.error) || '操作失败')
}

async function openExternal(en) {
  const res = await filesApi.value.open(entryPath(en))
  if (!res || !res.ok) message.error((res && res.error) || '打开失败')
}

// ===== 右键菜单 =====
function openMenu(e, en) {
  // 右键项不在选中集合内：重置为单选；在集合内：保留多选（删除项作用于全部选中）
  if (!selected.value.includes(en.name)) {
    selected.value = [en.name]
    lastAnchor.value = en.name
  }
  // 视口边缘收敛
  const x = Math.min(e.clientX, window.innerWidth - 190)
  const y = Math.min(e.clientY, window.innerHeight - 190)
  Object.assign(menu, { visible: true, x, y, item: en })
}

function closeMenu() {
  menu.visible = false
  menu.item = null
}

function onDocMouseDown(e) {
  if (menu.visible && !e.target.closest('.sp-menu')) closeMenu()
}

function onKeydown(e) {
  if (e.key !== 'Escape') return
  closeMenu()
  if (preview.visible) preview.visible = false
}

function menuAction(action) {
  const en = menu.item
  closeMenu()
  if (!en) return
  switch (action) {
    case 'open':
      openEntry(en)
      break
    case 'reveal':
      revealEntry(en)
      break
    case 'rename':
      renameEntry(en)
      break
    case 'trash':
      // 多选态下（右键项在选中集合内）：批量删除全部选中项，否则删单条
      if (selected.value.length > 1 && selected.value.includes(en.name)) {
        confirmTrashSelected()
      } else {
        trashEntry(en)
      }
      break
    default:
      break
  }
}

// ===== 预览 / 编辑 =====
async function openPreview(en) {
  if (!filesApi.value) return
  const res = await filesApi.value.read(entryPath(en))
  if (res && res.ok) {
    Object.assign(preview, {
      visible: true,
      path: entryPath(en),
      name: en.name,
      content: res.content,
      size: res.size,
      mtime: res.mtime,
      saving: false
    })
  } else if (res && (res.binary || res.tooLarge)) {
    // 二进制 / 超大文件交给系统应用
    openExternal(en)
  } else {
    message.error((res && res.error) || '读取失败')
  }
}

async function savePreview() {
  preview.saving = true
  const res = await filesApi.value.write({ path: preview.path, content: preview.content })
  preview.saving = false
  if (res && res.ok) {
    message.success('已保存')
    load()
  } else {
    message.error((res && res.error) || '保存失败')
  }
}

async function revealFile(p) {
  const res = await filesApi.value.reveal(p)
  if (!res || !res.ok) message.error((res && res.error) || '操作失败')
}

// ===== 拖拽导入 =====
function onDragEnter() {
  dragDepth.value++
}

function onDragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1)
}

async function onDrop(e) {
  dragDepth.value = 0
  const files = Array.from((e.dataTransfer && e.dataTransfer.files) || [])
  if (!files.length || !filesApi.value || !currentDir.value) return
  const getPath = window.electronAPI && window.electronAPI.getPathForFile
  const paths = files.map(f => (getPath ? getPath(f) : '')).filter(Boolean)
  if (!paths.length) return
  const res = await filesApi.value.importPaths({ dir: currentDir.value, paths })
  if (res && res.ok) {
    message.success('已导入 ' + res.count + ' 个文件')
    load()
  } else if (res && res.error) {
    message.error(res.error)
  }
}

watch(() => currentDir.value, () => {
  selected.value = []
  lastAnchor.value = ''
  search.value = ''
  load()
})

// created：进入页面即拉取工作空间并挂事件
loadWorkspaces()
// 对话关联/展示名更新后同步
bus.on('omnibuddy:workspaces-changed', loadWorkspaces)
// 全局点击 / Esc 关闭右键菜单
document.addEventListener('mousedown', onDocMouseDown)
document.addEventListener('keydown', onKeydown)

onBeforeUnmount(() => {
  bus.off('omnibuddy:workspaces-changed', loadWorkspaces)
  document.removeEventListener('mousedown', onDocMouseDown)
  document.removeEventListener('keydown', onKeydown)
})
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
