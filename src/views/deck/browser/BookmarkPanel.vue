<template>
  <!-- 工作台·书签分区：搜索 + 文件夹分组列表 + 面板内表单（编辑/新建/重命名）。
       嵌入工作台区域（非下拉挂载）；数据经 bookmarks.js 响应式单例与父页星标联动 -->
  <div class="bmp-section" @click.stop>
    <!-- 列表视图 -->
    <template v-if="view === 'list'">
      <!-- 工具行：搜索 + 新建文件夹 / Chrome 书签导入导出 -->
      <div class="bmp-tools">
        <div class="bmp-search">
          <svg-icon icon-class="search" class-name="bmp-search-ico" />
          <input
            v-model="keyword"
            type="text"
            spellcheck="false"
            placeholder="搜索书签名称或地址…"
          />
          <i v-if="keyword" class="bmp-search-clear" @click="keyword = ''"><svg-icon icon-class="close" /></i>
        </div>
        <button class="bmp-tool-btn" title="新建文件夹" @click="startNewFolder"><svg-icon icon-class="plus" /></button>
        <button class="bmp-tool-btn" title="导入 Chrome 书签（html）" @click="onImport"><svg-icon icon-class="upload2" /></button>
        <button class="bmp-tool-btn" title="分享 / 导出书签（Chrome 兼容 html）" @click="onExport"><svg-icon icon-class="export" /></button>
      </div>

      <div v-if="!state.list.length" class="bmp-empty">暂无收藏，点击地址栏星标收藏当前页</div>
      <div v-else-if="!filteredFolders.length && !filteredRootPages.length" class="bmp-empty">未找到匹配的书签</div>
      <div v-else class="bmp-list">
        <!-- 未分组书签 -->
        <div
          v-for="b in filteredRootPages"
          :key="b.id"
          class="bmp-item"
          :title="b.url"
          @click="$emit('navigate', b.url)"
        >
          <svg-icon icon-class="star-on" class-name="bmp-ico" />
          <span class="bmp-name">{{ b.name }}</span>
          <span class="bmp-url">{{ b.url }}</span>
          <span class="bmp-ops" @click.stop>
            <button class="bmp-op" title="重命名/移动" @click="startEdit(b)"><svg-icon icon-class="edit-outline" /></button>
            <button class="bmp-op" title="删除" @click="onDeletePage(b)"><svg-icon icon-class="delete" /></button>
          </span>
        </div>
        <!-- 文件夹（单层；点击展开/收起内部书签） -->
        <div v-for="f in filteredFolders" :key="f.id" class="bmp-folder">
          <div class="bmp-item bmp-folder-head" @click="toggleFolder(f.id)">
            <svg-icon icon-class="arrow-right" class-name="bmp-caret" :class="{ open: openFolders.has(f.id) }" />
            <svg-icon icon-class="folder" class-name="bmp-ico" />
            <span class="bmp-name">{{ f.name }}</span>
            <span class="bmp-count">{{ pagesOf(f.id).length }}</span>
            <span class="bmp-ops" @click.stop>
              <button class="bmp-op" title="重命名" @click="startRenameFolder(f)"><svg-icon icon-class="edit-outline" /></button>
              <!-- 两段式确认：首点布防变红，3s 未确认自动复位 -->
              <button
                class="bmp-op bmp-del"
                :class="{ armed: armDelete === f.id }"
                :title="armDelete === f.id ? '再点一次确认删除（内部书签移回未分组）' : '删除文件夹'"
                @click="onDeleteFolder(f)"
              >{{ armDelete === f.id ? '确认' : '' }}<svg-icon icon-class="delete" /></button>
            </span>
          </div>
          <template v-if="openFolders.has(f.id)">
            <div
              v-for="b in pagesOf(f.id)"
              :key="b.id"
              class="bmp-item bmp-sub"
              :title="b.url"
              @click="$emit('navigate', b.url)"
            >
              <svg-icon icon-class="star-on" class-name="bmp-ico" />
              <span class="bmp-name">{{ b.name }}</span>
              <span class="bmp-url">{{ b.url }}</span>
              <span class="bmp-ops" @click.stop>
                <button class="bmp-op" title="重命名/移动" @click="startEdit(b)"><svg-icon icon-class="edit-outline" /></button>
                <button class="bmp-op" title="删除" @click="onDeletePage(b)"><svg-icon icon-class="delete" /></button>
              </span>
            </div>
            <div v-if="!pagesOf(f.id).length" class="bmp-sub-empty">空文件夹</div>
          </template>
        </div>
      </div>
    </template>

    <!-- 编辑书签：重命名 + 移动文件夹 + 删除 -->
    <div v-else-if="view === 'edit'" class="bmp-form">
      <div class="bmp-form-title">编辑收藏</div>
      <label class="bmp-field">
        <span class="bmp-field-label">名称</span>
        <input v-model="form.name" class="bmp-input" type="text" spellcheck="false" @keydown.enter="saveEdit" />
      </label>
      <label class="bmp-field">
        <span class="bmp-field-label">地址</span>
        <span class="bmp-url" :title="form.url">{{ form.url }}</span>
      </label>
      <label class="bmp-field">
        <span class="bmp-field-label">位置</span>
        <select v-model="form.folderId" class="bmp-input bmp-select">
          <option :value="null">未分组</option>
          <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </label>
      <div class="bmp-form-actions">
        <button class="bmp-btn bmp-danger" @click="onDeletePage(form)">删除收藏</button>
        <span class="bmp-spacer"></span>
        <button class="bmp-btn" @click="backToList">取消</button>
        <button class="bmp-btn bmp-primary" @click="saveEdit">保存</button>
      </div>
    </div>

    <!-- 新建/重命名文件夹 -->
    <div v-else class="bmp-form">
      <div class="bmp-form-title">{{ view === 'new-folder' ? '新建文件夹' : '重命名文件夹' }}</div>
      <label class="bmp-field">
        <span class="bmp-field-label">名称</span>
        <input
          ref="nameInput"
          v-model="form.name"
          class="bmp-input"
          type="text"
          spellcheck="false"
          placeholder="输入文件夹名称"
          @keydown.enter="saveFolder"
        />
      </label>
      <div class="bmp-form-actions">
        <span class="bmp-spacer"></span>
        <button class="bmp-btn" @click="backToList">取消</button>
        <button class="bmp-btn bmp-primary" @click="saveFolder">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
// 工作台·书签分区（浏览器页局部组件）：搜索 + 列表 + 面板内表单三视图；
// 数据经 bookmarks.js 响应式单例共享，变更后父页星标态自动联动
import { ref, reactive, computed, nextTick, onBeforeUnmount } from 'vue'
import {
  bookmarkState as state,
  addFolder,
  renameFolder,
  removeFolder,
  updateBookmark,
  removeBookmark,
  setLastFolderId,
  importBookmarksHtml,
  exportBookmarksHtml
} from './bookmarks'

defineOptions({ name: 'BookmarkPanel' })
const emit = defineEmits(['navigate', 'notice'])

// 视图：list 列表 | edit 编辑书签 | new-folder 新建文件夹 | rename-folder 重命名文件夹
const view = ref('list')
const form = reactive({ id: '', name: '', url: '', folderId: null })
const nameInput = ref(null)
// 搜索关键词（按名称/URL 过滤）
const keyword = ref('')
// 展开的文件夹 id 集合
const openFolders = ref(new Set())
// 两段式删除布防的文件夹 id
const armDelete = ref('')
let armTimer = null

const folders = computed(() => state.list.filter(b => b.type === 'folder'))
const rootPages = computed(() => state.list.filter(b => b.type === 'page' && !b.folderId))
function pagesOf(folderId) {
  return state.list.filter(b => b.type === 'page' && b.folderId === folderId)
}

// 搜索过滤：命中书签 + 命中书签的文件夹（文件夹名也参与匹配）
function hitPage(b) {
  const kw = keyword.value.trim().toLowerCase()
  if (!kw) return true
  return b.name.toLowerCase().includes(kw) || b.url.toLowerCase().includes(kw)
}
const filteredRootPages = computed(() => rootPages.value.filter(hitPage))
const filteredFolders = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  return folders.value.filter(f =>
    !kw || f.name.toLowerCase().includes(kw) || pagesOf(f.id).some(hitPage))
})

function toggleFolder(id) {
  const s = new Set(openFolders.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  openFolders.value = s
}
function backToList() {
  view.value = 'list'
}
// ===== 书签 =====
function startEdit(b) {
  Object.assign(form, { id: b.id, name: b.name, url: b.url, folderId: b.folderId || null })
  view.value = 'edit'
}
// 供父组件（星标按钮）指定编辑目标
function startEditById(id) {
  const b = state.list.find(x => x.id === id)
  if (b && b.type === 'page') startEdit(b)
}
function saveEdit() {
  if (!form.id) return
  updateBookmark(form.id, {
    name: String(form.name || '').trim() || form.url,
    folderId: form.folderId || null
  })
  // 记住本次选择的文件夹，作为一键收藏默认目标
  setLastFolderId(form.folderId || null)
  backToList()
}
function onDeletePage(b) {
  removeBookmark(b.id)
  backToList()
}
// ===== 文件夹 =====
function startNewFolder() {
  form.name = ''
  view.value = 'new-folder'
  nextTick(() => nameInput.value && nameInput.value.focus())
}
function startRenameFolder(f) {
  form.id = f.id
  form.name = f.name
  view.value = 'rename-folder'
  nextTick(() => nameInput.value && nameInput.value.focus())
}
function saveFolder() {
  const name = String(form.name || '').trim()
  if (!name) return
  if (view.value === 'new-folder') {
    const f = addFolder(name)
    // 新建后自动展开
    const s = new Set(openFolders.value)
    s.add(f.id)
    openFolders.value = s
  } else {
    renameFolder(form.id, name)
  }
  backToList()
}
function onDeleteFolder(f) {
  if (armDelete.value !== f.id) {
    // 首点布防，3s 自动复位
    armDelete.value = f.id
    if (armTimer) clearTimeout(armTimer)
    armTimer = setTimeout(() => { armDelete.value = '' }, 3000)
    return
  }
  if (armTimer) clearTimeout(armTimer)
  armDelete.value = ''
  removeFolder(f.id)
}
// ===== Chrome 书签导入/导出 =====
// 复用的隐藏文件选择器（不重复创建）
let importInput = null
function onImport() {
  if (!importInput) {
    importInput = document.createElement('input')
    importInput.type = 'file'
    importInput.accept = '.html,.htm'
    importInput.style.display = 'none'
    importInput.addEventListener('change', async () => {
      const f = importInput.files && importInput.files[0]
      if (!f) return
      try {
        const text = await f.text()
        const res = importBookmarksHtml(text)
        if (!res.added && !res.skipped) {
          emit('notice', { type: 'warning', text: '未在文件中解析到可导入的书签' })
          return
        }
        emit('notice', {
          type: 'info',
          text: '导入完成：新增 ' + res.added + ' 条书签' +
            (res.folders ? '、' + res.folders + ' 个文件夹' : '') +
            (res.skipped ? '，跳过 ' + res.skipped + ' 条重复' : '')
        })
        // 展开全部文件夹便于查看导入结果
        const s = new Set(openFolders.value)
        state.list.forEach(b => { if (b.type === 'folder') s.add(b.id) })
        openFolders.value = s
      } catch (err) {
        emit('notice', { type: 'error', text: '书签导入失败：' + (err && err.message ? err.message : '文件解析异常') })
      }
    })
  }
  importInput.value = ''
  importInput.click()
}
function onExport() {
  if (!state.list.length) {
    emit('notice', { type: 'warning', text: '暂无书签可导出' })
    return
  }
  const html = exportBookmarksHtml()
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const d = new Date()
  const pad = n => String(n).padStart(2, '0')
  a.download = 'bookmarks_' + d.getFullYear() + '_' + pad(d.getMonth() + 1) + '_' + pad(d.getDate()) + '.html'
  a.href = url
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
  emit('notice', { type: 'info', text: '已导出书签文件（可直接导入 Chrome / Edge）' })
}
onBeforeUnmount(() => {
  if (armTimer) clearTimeout(armTimer)
  if (importInput) importInput = null
})
defineExpose({ startEditById })
</script>

<style lang="scss" scoped>
/* 工作台内嵌分区（非下拉）：无浮层阴影；外层由 .br-wb-bookmarks 撑满侧栏剩余高度 */
.bmp-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
  min-height: 0;
}

/* 工具行：搜索 + 新建文件夹（固定，不随列表滚动） */
.bmp-tools {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.bmp-search {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  background: $search-bg;
  border-radius: $radius-sm;
  border: 1px solid transparent;
  transition: border-color 0.12s ease;

  &:focus-within {
    border-color: $primary-color;
  }

  .bmp-search-ico {
    flex-shrink: 0;
    font-size: 12px;
    color: $text-secondary;
    margin-right: 6px;
  }

  input {
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

  .bmp-search-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: $radius-sm;
    color: $text-secondary;
    font-size: 10px;
    cursor: pointer;
    flex-shrink: 0;

    &:hover {
      background: $divider;
      color: $text-primary;
    }
  }
}

/* 列表区：撑满侧栏剩余高度滚动 */
.bmp-list {
  flex: 1;
  min-height: 80px;
  overflow-y: auto;
  padding: 2px;
  border: 1px solid $divider;
  border-radius: $radius-sm;
  background: rgba(255, 255, 255, 0.35);

  &:empty {
    display: none;
  }
}

:global(html[data-theme='dark']) .bmp-list {
  background: rgba(0, 0, 0, 0.12);
}

.bmp-empty {
  padding: 14px 12px;
  font-size: 12px;
  color: $text-secondary;
  text-align: center;
  border: 1px dashed $border-color;
  border-radius: $radius-sm;
}

/* 列表项（书签/文件夹头；div：内部含操作按钮，button 不可嵌套） */
.bmp-item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 30px;
  padding: 0 8px;
  border-radius: 7px;
  color: $text-primary;
  font-size: 12px;
  cursor: pointer;
  text-align: left;
  user-select: none;
  transition: background 0.12s ease;

  &:hover {
    background: $search-bg;

    .bmp-ops { opacity: 1; }
    .bmp-url { opacity: 1; }
  }

  .bmp-ico {
    flex-shrink: 0;
    font-size: 13px;
    color: $warning-color;
  }

  .bmp-name {
    flex-shrink: 0;
    max-width: 40%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 地址淡显（hover 提亮），一眼区分标题与地址 */
  .bmp-url {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    color: $text-secondary;
    opacity: 0.65;
  }

  .bmp-count {
    flex-shrink: 0;
    font-size: 10px;
    color: $text-secondary;
  }

  /* hover 操作区（编辑/删除） */
  .bmp-ops {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.12s ease;
  }
}

.bmp-caret {
  flex-shrink: 0;
  font-size: 10px;
  color: $text-secondary;
  transition: transform 0.15s ease;

  &.open {
    transform: rotate(90deg);
  }
}

.bmp-folder-head .bmp-ico {
  color: $primary-color;
}

/* 文件夹内书签缩进 */
.bmp-sub {
  padding-left: 26px;
}

.bmp-sub-empty {
  padding: 2px 0 4px 26px;
  font-size: 11px;
  color: $text-secondary;
}

.bmp-op {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 2px;
  height: 20px;
  min-width: 20px;
  padding: 0 3px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: $text-secondary;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover {
    background: $divider;
    color: $text-primary;
  }
}

/* 两段式删除布防态 */
.bmp-del.armed {
  background: rgba(var(--danger-color-rgb, 245, 63, 63), 0.12);
  color: $danger-color;
}

/* 工具行图标按钮（新建文件夹 / 导入 / 导出） */
.bmp-tool-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: 1px solid transparent;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s ease;

  &:hover {
    background: $search-bg;
    color: $primary-color;
  }
}

/* ===== 面板内表单 ===== */
.bmp-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 6px 2px 2px;
}

.bmp-form-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.bmp-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bmp-field-label {
  flex-shrink: 0;
  width: 34px;
  font-size: 12px;
  color: $text-secondary;
}

.bmp-input {
  flex: 1;
  min-width: 0;
  height: 28px;
  padding: 0 8px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $search-bg;
  color: $text-primary;
  font-size: 12px;
  outline: none;
  transition: border-color 0.12s ease;

  &:focus {
    border-color: $primary-color;
  }
}

/* 原生下拉（移动文件夹目标选择） */
.bmp-select {
  appearance: none;
  cursor: pointer;
}

.bmp-url {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  color: $text-secondary;
}

.bmp-form-actions {
  display: flex;
  align-items: center;
  gap: 6px;
}

.bmp-spacer {
  flex: 1;
}

.bmp-btn {
  height: 26px;
  padding: 0 12px;
  border: 1px solid $border-color;
  border-radius: 13px;
  background: transparent;
  color: $text-primary;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover {
    border-color: $text-secondary;
  }
}

.bmp-primary {
  border-color: $primary-color;
  background: $primary-color;
  color: #fff;

  &:hover {
    opacity: 0.88;
    border-color: $primary-color;
  }
}

.bmp-danger {
  border-color: transparent;
  color: $danger-color;

  &:hover {
    border-color: $danger-color;
  }
}
</style>
