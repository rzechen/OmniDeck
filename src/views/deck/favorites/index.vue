<template>
  <div class="favorites-page page-container">
    <!-- 页头：标题 + 搜索过滤 -->
    <header class="fav-header">
      <div class="header-left">
        <h2 class="page-title">我的收藏</h2>
        <p class="page-sub">收藏常用工具与网站，一键直达</p>
      </div>
      <!-- 搜索框：Mac 胶囊风格，过滤当前 Tab 的收藏 -->
      <div class="search-box">
        <svg-icon icon-class="search" class-name="search-icon" />
        <input
          v-model="keyword"
          placeholder="搜索收藏..."
          @keydown.esc="keyword = ''"
        />
        <span v-if="keyword" class="search-count">{{ searchCount }}</span>
        <svg-icon v-if="keyword" icon-class="circle-close" class-name="search-clear" title="清空 (Esc)"
          @click="keyword = ''" />
      </div>
    </header>

    <!-- Tab 切换：工具收藏 / 网站收藏（macOS 分段控件风格，可拖拽排序） -->
    <div class="fav-toolbar">
      <draggable
        v-model="tabOrder"
        class="fav-tabs"
        animation="150"
        :item-key="k => k"
        @end="onTabDragEnd"
      >
        <template #item="{ element: key }">
        <div
          class="fav-tab"
          :class="{ active: activeTab === key }"
          @click="activeTab = key"
        >
          <svg-icon :icon-class="tabMeta[key].icon" class="tab-svg" />
          <span>{{ tabMeta[key].label }}</span>
          <span class="tab-count">{{ tabCount(key) }}</span>
        </div>
        </template>
      </draggable>
      <!-- 网站 Tab 操作：新建分组 + 添加网站 -->
      <div v-if="activeTab === 'site'" class="toolbar-actions">
        <span class="add-btn is-plain" @click="createGroup">
          <svg-icon icon-class="folder-add" />
          新建分组
        </span>
        <span class="add-btn" @click="openAddDialog()">
          <svg-icon icon-class="plus" />
          添加
        </span>
      </div>
    </div>

    <!-- 工具收藏 Tab：卡片可拖拽排序（搜索时禁用拖拽） -->
    <template v-if="activeTab === 'tool'">
      <draggable
        v-if="filteredToolFavorites.length"
        v-model="dragTools"
        class="fav-grid"
        :disabled="!!keyword"
        animation="150"
        ghost-class="fav-ghost"
        item-key="path"
        @start="onDragStart"
        @end="onDragEnd"
      >
        <template #item="{ element: item, index: idx }">
        <div
          class="fav-card stagger-item"
          :style="{ animationDelay: Math.min(idx, 14) * 35 + 'ms' }"
          :title="item.name"
          @click="openFavorite(item, 'tool')"
        >
          <div class="card-avatar" :style="{ background: item.color + '1A', color: item.color }">
            <svg-icon v-if="item.icon" :icon-class="item.icon" class="card-svg" />
            <template v-else>{{ item.name.charAt(0) }}</template>
          </div>
          <span class="card-name">{{ item.name }}</span>
          <span
            class="card-group"
            :style="{ background: item.color + '1A', color: item.color }"
          >{{ item.categoryTitle }}</span>
          <span
            class="card-remove"
            title="取消收藏"
            @click.stop="removeFavorite(item)"
          >
            <svg-icon icon-class="close" class-name="act-close" />
          </span>
        </div>
        </template>
      </draggable>
      <div v-else-if="keyword" class="section-empty">
        没有与「{{ keyword }}」匹配的工具收藏
      </div>
      <div v-else class="tab-empty">
        <div class="empty-icon">
          <svg-icon icon-class="star" class="empty-svg" />
        </div>
        <p class="empty-title">还没有收藏工具</p>
        <p class="empty-tip">点击工具卡片上的星标，即可收藏到这里</p>
        <el-button class="empty-btn" size="small" round @click="router.push('/home')">
          去逛逛工具
        </el-button>
      </div>
    </template>

    <!-- 剪贴板收藏 Tab：文本 / 图片 收藏条目（与剪贴板页一致的紧凑行） -->
    <template v-else-if="activeTab === 'clip'">
      <div v-if="filteredFavClips.length" class="clip-list">
        <div
          v-for="(c, idx) in filteredFavClips"
          :key="c.id"
          class="clip-item stagger-item"
          :style="{ animationDelay: Math.min(idx, 14) * 30 + 'ms' }"
          @click="onClipClick(c)"
        >
          <!-- 图片收藏：缩略图 + 分辨率 -->
          <template v-if="c.kind === 'image'">
            <div class="clip-thumb" @click.stop="previewClip(c)">
              <img :src="c.thumb" alt="图片收藏" loading="lazy" />
              <span class="clip-thumb-mask"><svg-icon icon-class="view" /></span>
            </div>
            <div class="clip-meta">
              <span class="clip-size">{{ c.width }} × {{ c.height }}</span>
            </div>
          </template>
          <!-- 文本收藏：单行省略，点击看详情 -->
          <p v-else class="clip-text" :title="c.text">{{ c.text }}</p>

          <span class="clip-time">{{ fmtFavTime(c.favedAt) }}</span>

          <div class="clip-ops">
            <button title="复制" @click.stop="copyClip(c)">
              <svg-icon icon-class="document-copy" />
            </button>
            <button v-if="c.kind === 'image'" title="另存为 PNG" @click.stop="saveClip(c)">
              <svg-icon icon-class="download" />
            </button>
            <button title="取消收藏" @click.stop="removeClip(c)">
              <svg-icon icon-class="delete" class-name="act-delete" />
            </button>
          </div>
        </div>
      </div>
      <div v-else-if="keyword" class="section-empty">
        没有与「{{ keyword }}」匹配的剪贴板收藏
      </div>
      <div v-else class="tab-empty">
        <div class="empty-icon is-clip">
          <svg-icon icon-class="clipboard" class="empty-svg" />
        </div>
        <p class="empty-title">还没有剪贴板收藏</p>
        <p class="empty-tip">在剪贴板页点击星标，把常用内容收藏到这里</p>
        <el-button class="empty-btn" size="small" round @click="router.push('/clipboard')">
          去剪贴板看看
        </el-button>
      </div>
    </template>

    <!-- 网站收藏 Tab：分组胶囊流（书签收藏夹风格） -->
    <template v-else-if="activeTab === 'site'">
      <template v-if="siteFavorites.length || siteCategories.length">
        <div v-for="g in visibleGroups" :key="g.name || '__uncategorized'" class="site-group">
          <!-- 分组头：名称 + 数量 + 管理操作（仅自定义分组） -->
          <div class="group-header">
            <svg-icon :icon-class="(g.name ? 'folder' : 'folder-opened')" class-name="group-icon" />
            <span class="group-title">{{ g.name || '未分类' }}</span>
            <span class="group-count">{{ g.sites.length }}</span>
            <span v-if="g.name" class="group-actions">
              <i class='edit-outline' title="重命名分组" @click="renameGroup(g)"></i>
              <i class='delete' title="删除分组" @click="deleteGroup(g)"></i>
            </span>
          </div>

          <!-- 组内网站胶囊：可拖拽排序、跨组拖拽换分组 -->
          <draggable
            v-if="g.sites.length"
            v-model="g.sites"
            class="chip-flow"
            group="site-chips"
            :disabled="!!keyword"
            animation="150"
            ghost-class="fav-ghost"
            item-key="url"
            @start="onDragStart"
            @end="onSiteDragEnd"
          >
            <template #item="{ element: item, index: idx }">
            <div
              class="site-chip stagger-item"
              :style="{ animationDelay: Math.min(idx, 11) * 35 + 'ms' }"
              :title="item.name + '\n' + item.url"
              @click="openFavorite(item, 'site')"
            >
              <img
                v-if="!item.iconFailed"
                class="chip-favicon"
                :src="faviconUrl(item)"
                alt=""
                @error="onFaviconError(item)"
              />
              <span v-else class="chip-letter">{{ item.name.charAt(0) }}</span>
              <span class="chip-name">{{ item.name }}</span>
              <span class="chip-ops">
                <i class='edit' title="编辑" @click.stop="openEditDialog(item)"></i>
                <i class='close' title="移除" @click.stop="removeSite(item)"></i>
              </span>
            </div>
            </template>
          </draggable>
          <!-- 空分组投放区 -->
          <div v-else class="group-dropzone">
            拖动网站到这里，或
            <span class="dz-link" @click="openAddDialog(g.name)">直接添加</span>
          </div>
        </div>

        <!-- 搜索无结果 -->
        <div v-if="keyword && !visibleGroups.length" class="section-empty">
          没有与「{{ keyword }}」匹配的网站收藏
        </div>
      </template>
      <div v-else class="tab-empty">
        <div class="empty-icon is-site">
          <svg-icon icon-class="website" class="empty-svg" />
        </div>
        <p class="empty-title">还没有收藏网站</p>
        <p class="empty-tip">添加常用网站，按分组管理，快速访问</p>
        <el-button class="empty-btn" size="small" round type="primary" @click="openAddDialog()">
          添加网站
        </el-button>
      </div>
    </template>

    <!-- 添加/编辑网站收藏弹窗：URL 优先，自动获取标题与 favicon -->
    <el-dialog
      :title="editingSite ? '编辑网站收藏' : '添加网站收藏'"
      v-model="showAddDialog"
      width="440px"
      class="add-site-dialog"
      append-to-body
      :close-on-click-modal="false"
    >
      <el-form
        ref="siteFormRef"
        :model="siteForm"
        :rules="rules"
        label-width="56px"
        size="small"
        @submit.prevent
      >
        <el-form-item label="网址" prop="url">
          <el-input
            v-model="siteForm.url"
            placeholder="如：github.com（自动补全 https://）"
            clearable
          >
            <template #suffix>
              <svg-icon v-if="urlChecking" icon-class="loading" class-name="url-loading" />
            </template>
          </el-input>
          <!-- 自动获取状态行：可达性 -->
          <div v-if="urlStatus" class="url-meta" :class="urlStatus.type">
            <svg-icon :icon-class="(urlStatus.type === 'ok' ? 'circle-check' : 'warning-outline')" />
            <span>{{ urlStatus.text }}</span>
          </div>
        </el-form-item>
        <el-form-item label="名称" prop="name">
          <el-input
            v-model="siteForm.name"
            placeholder="输入网址后自动获取，可修改"
            maxlength="30"
            @input="onNameInput"
          />
        </el-form-item>
        <el-form-item label="分组" prop="category">
          <el-select
            v-model="siteForm.category"
            filterable
            allow-create
            default-first-option
            placeholder="选择分组或输入新名称"
          >
            <el-option label="未分类" value="" />
            <el-option
              v-for="c in siteCategories"
              :key="c"
              :label="c"
              :value="c"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button size="small" round :disabled="checking" @click="showAddDialog = false">
            取消
          </el-button>
          <el-button size="small" round type="primary" :loading="checking" @click="saveSite">
            {{ checking ? '检测中…' : '保 存' }}
          </el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 剪贴板收藏：图片大图预览 -->
    <el-dialog
      v-model="clipPreviewVisible"
      :title="clipPreviewRec ? `图片收藏 · ${clipPreviewRec.width} × ${clipPreviewRec.height}` : '图片收藏'"
      width="65%"
      top="7vh"
      append-to-body
      class="fav-clip-dialog"
      @closed="clipPreviewData = ''"
    >
      <div class="clip-preview">
        <img v-if="clipPreviewData" :src="clipPreviewData" alt="预览" />
        <div v-else class="clip-preview-loading"><svg-icon icon-class="loading" /></div>
      </div>
      <template #footer>
        <el-button size="small" round @click="copyClip(clipPreviewRec)">复制</el-button>
        <el-button size="small" round type="primary" @click="saveClip(clipPreviewRec)">
          另存为
        </el-button>
      </template>
    </el-dialog>

    <!-- 剪贴板收藏：文本详情（等宽字体，保留原始换行与缩进） -->
    <el-dialog
      v-model="clipTextVisible"
      title="文本收藏"
      width="55%"
      top="12vh"
      append-to-body
      class="fav-clip-dialog is-text"
    >
      <div class="clip-text-preview">
        <pre>{{ clipTextRec ? clipTextRec.text : '' }}</pre>
      </div>
      <template #footer>
        <el-button size="small" round type="primary" @click="copyClip(clipTextRec)">
          复制文本
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onActivated, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useStore } from 'vuex'
import draggable from 'vuedraggable'
import { toolCategories } from '@/config/tools'
import { getItem, setItem } from '@/utils/storage/db'
import { useFeedback } from '@/composables/useFeedback'

// 全量工具扁平列表（带分类色），用于按 path 反查收藏的完整信息
const allTools = []
toolCategories.forEach(c => {
  c.children.forEach(t => {
    allTools.push({ ...t, color: c.color, categoryTitle: c.title })
  })
})

// 网址合法性校验：自动补全协议后检查格式
function validateUrl(rule, value, callback) {
  let url = (value || '').trim()
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  try {
    const u = new URL(url)
    if (u.hostname && (u.hostname.includes('.') || u.hostname === 'localhost')) {
      return callback()
    }
  } catch (e) {
    // fallthrough
  }
  callback(new Error('网址格式不正确'))
}

// Tab 元信息（工具/网站/剪贴板），顺序由用户拖拽决定
const TAB_META = {
  tool: { label: '工具收藏', icon: 'tools' },
  site: { label: '网站收藏', icon: 'website' },
  clip: { label: '剪贴板收藏', icon: 'clipboard' }
}
// 全部合法 Tab key（用于持久化顺序的校验与补齐）
const TAB_KEYS = ['tool', 'site', 'clip']

defineOptions({ name: 'Favorites' })

const router = useRouter()
const store = useStore()
const { message, confirm, prompt } = useFeedback()

// Tab 顺序：从 IndexedDB 恢复（过滤非法 key，并补齐新增 Tab，兼容旧版仅两项的值）
const tabOrder = ref((() => {
  const saved = getItem('favTabOrder', null)
  const list = (Array.isArray(saved) ? saved : []).filter(k => TAB_KEYS.includes(k))
  TAB_KEYS.forEach(k => {
    if (!list.includes(k)) list.push(k)
  })
  return list
})())
const activeTab = ref(tabOrder.value[0]) // 默认选中排序后的第一个 Tab
const tabMeta = TAB_META
const keyword = ref('')
const siteFavorites = ref([]) // { name, url, domain, category, iconFailed? }
const siteCategories = ref([]) // 有序自定义分组名列表
const groups = ref([]) // 渲染用分组视图：[{ name: ''|自定义, sites: [] }]
const favClips = ref([]) // 剪贴板收藏：[{ id, kind, text?|width/height/thumb, createdAt, favedAt }]
const clipPreviewVisible = ref(false) // 图片预览弹窗
const clipPreviewData = ref('')
const clipPreviewRec = ref(null)
const clipTextVisible = ref(false) // 文本详情弹窗
const clipTextRec = ref(null)
const showAddDialog = ref(false)
const checking = ref(false) // 保存时可访问性检测中
const editingSite = ref(null) // 编辑模式下的原对象
const nameManuallyEdited = ref(false) // 名称被手动编辑后不再自动覆盖
const urlChecking = ref(false) // URL 自动获取元信息中
const urlMeta = ref(null) // 自动获取结果 { ok, title, url }
const urlStatus = ref(null) // URL 下方状态行 { type: 'ok'|'bad', text }
const suppressClick = ref(false) // 拖拽结束后短暂抑制 click，防止误触打开卡片
const siteForm = reactive({
  name: '',
  url: '',
  category: ''
})
const rules = {
  name: [
    { required: true, message: '请输入网站名称', trigger: 'blur' }
  ],
  url: [
    { required: true, message: '请输入网址', trigger: 'blur' },
    { validator: validateUrl, trigger: 'blur' }
  ]
}
// 表单实例（与表单数据 siteForm 区分命名）
const siteFormRef = ref(null)

// URL 防抖定时器（非响应式）
let urlTimer = null
let onWinFocus = null

// 剪贴板收藏 IPC（仅桌面端提供）
const favApi = computed(() => {
  return (window.electronAPI && window.electronAPI.captureFav) || null
})
// 已收藏工具：按 store 中的收藏顺序渲染
const toolFavorites = computed(() => {
  const paths = store.state.toolFavorites
  return paths.map(p => allTools.find(t => t.path === p)).filter(Boolean)
})
// 按关键字过滤工具收藏（名称匹配）
const filteredToolFavorites = computed(() => {
  if (!keyword.value) return toolFavorites.value
  const q = keyword.value.toLowerCase()
  return toolFavorites.value.filter(t => t.name.toLowerCase().includes(q))
})
// 关键字过滤后的网站总数（跨分组）
const filteredSiteCount = computed(() => {
  return visibleGroups.value.reduce((n, g) => n + g.sites.length, 0)
})
// 分组视图：搜索时返回过滤副本（拖拽已禁用）；平时返回原引用供 v-model 写入
const visibleGroups = computed(() => {
  if (!keyword.value) return groups.value
  const q = keyword.value.toLowerCase()
  return groups.value
    .map(g => ({
      ...g,
      sites: g.sites.filter(
        s =>
          s.name.toLowerCase().includes(q) ||
          (s.url || '').toLowerCase().includes(q)
      )
    }))
    .filter(g => g.sites.length)
})
// 拖拽排序：get 返回展示列表；set 回写 store 并持久化
const dragTools = computed({
  get() {
    return filteredToolFavorites.value
  },
  set(list) {
    const paths = list.map(t => t.path)
    store.commit('SET_TOOL_FAVORITES', paths)
    setItem('toolFavorites', paths)
  }
})
// 按关键字过滤剪贴板收藏（文本匹配内容，图片匹配「图片 + 分辨率」）
const filteredFavClips = computed(() => {
  if (!keyword.value) return favClips.value
  const q = keyword.value.trim().toLowerCase()
  return favClips.value.filter(c => {
    const hay = c.kind === 'text'
      ? (c.text || '')
      : `图片 ${c.width} × ${c.height}`
    return hay.toLowerCase().includes(q)
  })
})
// 搜索框计数：当前 Tab 的 匹配数/总数
const searchCount = computed(() => {
  if (activeTab.value === 'tool') {
    return `${filteredToolFavorites.value.length}/${toolFavorites.value.length}`
  }
  if (activeTab.value === 'site') {
    return `${filteredSiteCount.value}/${siteFavorites.value.length}`
  }
  return `${filteredFavClips.value.length}/${favClips.value.length}`
})

// URL 输入防抖自动获取：可达性 + 标题 + favicon 预览
watch(() => siteForm.url, val => {
  // 编辑模式预填原 URL：不触发自动获取
  if (editingSite.value && val === editingSite.value.url) return
  clearTimeout(urlTimer)
  urlChecking.value = false
  urlStatus.value = null
  urlMeta.value = null
  if (!val || !val.trim()) return
  urlTimer = setTimeout(() => autoFetchMeta(), 600)
})

// created：加载网站收藏与分组（补齐 category 字段，兼容旧数据）
siteFavorites.value = (getItem('siteFavorites', []) || []).map(s => ({
  ...s,
  category: s.category || ''
}))
siteCategories.value = getItem('siteCategories', [])
rebuildGroups()

onMounted(() => {
  // 剪贴板收藏来自主进程内存池，挂载时拉取 + 窗口聚焦刷新
  loadFavClips()
  onWinFocus = () => loadFavClips()
  window.addEventListener('focus', onWinFocus)
})
// keep-alive 缓存：从剪贴板页切回时立即同步新增/取消的收藏
onActivated(() => {
  loadFavClips()
})
onBeforeUnmount(() => {
  clearTimeout(urlTimer)
  window.removeEventListener('focus', onWinFocus)
})

// ===== 通用 =====
// Tab 徽标计数：搜索时显示「x/y」，平时显示「y」
function countLabel(filtered, total) {
  return keyword.value ? `${filtered}/${total}` : `${total}`
}
// 单个 Tab 的徽标计数文案
function tabCount(key) {
  if (key === 'tool') {
    return countLabel(filteredToolFavorites.value.length, toolFavorites.value.length)
  }
  if (key === 'site') {
    return countLabel(filteredSiteCount.value, siteFavorites.value.length)
  }
  return countLabel(filteredFavClips.value.length, favClips.value.length)
}
// Tab 拖拽排序结束：持久化顺序
function onTabDragEnd() {
  setItem('favTabOrder', tabOrder.value)
}
// 拖拽开始/结束：结束后短暂抑制 click（浏览器会在 mouseup 后补发 click）
function onDragStart() {
  suppressClick.value = true
}
function onDragEnd() {
  setTimeout(() => {
    suppressClick.value = false
  }, 0)
}
// 点击收藏项直达：工具跳转路由，网站打开链接
function openFavorite(item, type) {
  if (suppressClick.value) return
  if (type === 'tool' && item.path) {
    router.push(item.path)
  } else if (type === 'site' && item.url) {
    window.open(item.url, '_blank')
  }
}

// ===== 工具收藏 =====
// 取消收藏
function removeFavorite(item) {
  store.commit('TOGGLE_TOOL_FAVORITE', item.path)
  setItem('toolFavorites', store.state.toolFavorites)
  message({
    message: `已取消收藏「${item.name}」`,
    type: 'success',
    duration: 1500
  })
}

// ===== 网站收藏：分组视图 =====
// 由 siteCategories + siteFavorites 重建渲染分组
// 未分类组仅在有内容时显示；自定义分组始终显示（支持空分组投放）
function rebuildGroups() {
  const uncategorized = { name: '', sites: [] }
  const custom = siteCategories.value.map(name => ({ name, sites: [] }))
  siteFavorites.value.forEach(s => {
    const g = custom.find(g => g.name === s.category)
    ;(g || uncategorized).sites.push(s)
  })
  groups.value = uncategorized.sites.length
    ? [uncategorized, ...custom]
    : custom
}
// 网站 chips 拖拽结束：从分组视图拍平回 siteFavorites（保留对象引用）并持久化
function onSiteDragEnd() {
  onDragEnd()
  const list = []
  groups.value.forEach(g => {
    const cat = g.name
    g.sites.forEach(s => {
      if (s.category !== cat) s.category = cat
      list.push(s)
    })
  })
  siteFavorites.value = list
  setItem('siteFavorites', list)
}
// favicon 地址：优先保存时抓取到的 <link rel=icon> 真实地址，
// 回退站点根 /favicon.ico，加载失败由 @error 回退首字母头像
function faviconUrl(item) {
  if (item.icon) return item.icon
  try {
    return new URL(item.url).origin + '/favicon.ico'
  } catch (e) {
    return ''
  }
}
function onFaviconError(item) {
  // 自定义图标加载失败：先回退根路径 /favicon.ico 再试一次
  if (item.icon) {
    item.icon = ''
  } else {
    item.iconFailed = true
  }
}

// ===== 网站收藏：增删改 =====
// 移除网站收藏
function removeSite(item) {
  siteFavorites.value = siteFavorites.value.filter(s => s.url !== item.url)
  setItem('siteFavorites', siteFavorites.value)
  rebuildGroups()
  message({
    message: `已移除「${item.name}」`,
    type: 'success',
    duration: 1500
  })
}
// 打开添加弹窗（可预选分组）：重置表单与自动获取状态
function openAddDialog(category) {
  editingSite.value = null
  Object.assign(siteForm, { name: '', url: '', category: category || '' })
  resetMetaState()
  showAddDialog.value = true
  nextTick(() => {
    siteFormRef.value && siteFormRef.value.clearValidate()
  })
}
// 打开编辑弹窗：预填原值
function openEditDialog(item) {
  editingSite.value = item
  Object.assign(siteForm, {
    name: item.name,
    url: item.url,
    category: item.category || ''
  })
  resetMetaState()
  // 编辑时直接展示可达状态（不重新请求）
  urlStatus.value = { type: 'ok', text: item.url }
  showAddDialog.value = true
  nextTick(() => {
    siteFormRef.value && siteFormRef.value.clearValidate()
  })
}
function resetMetaState() {
  clearTimeout(urlTimer)
  urlChecking.value = false
  urlMeta.value = null
  urlStatus.value = null
  nameManuallyEdited.value = false
}
// 名称手动输入后，自动获取不再覆盖
function onNameInput() {
  nameManuallyEdited.value = true
}
// 抓取网站元信息：优先主进程 IPC（可读 title），回退 no-cors fetch（仅可达性）
async function fetchMeta(url) {
  if (window.electronAPI && window.electronAPI.fetchSiteMeta) {
    try {
      return await window.electronAPI.fetchSiteMeta(url)
    } catch (e) {
      return { ok: false, title: '' }
    }
  }
  try {
    await fetch(url, { mode: 'no-cors', cache: 'no-store' })
    return { ok: true, title: '' }
  } catch (e) {
    return { ok: false, title: '' }
  }
}
// URL 防抖后自动获取：可达性 + 标题回填 + favicon 预览
async function autoFetchMeta() {
  const raw = (siteForm.url || '').trim()
  if (!raw) return
  let url = raw
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url
  let normalized
  try {
    normalized = new URL(url).href
    const u = new URL(normalized)
    if (!u.hostname || !(u.hostname.includes('.') || u.hostname === 'localhost')) {
      return
    }
  } catch (e) {
    return
  }
  urlChecking.value = true
  const meta = await fetchMeta(normalized)
  // 竞态保护：输入已变化则丢弃本次结果
  const current = (siteForm.url || '').trim()
  let currentUrl = current
  if (currentUrl && !/^https?:\/\//i.test(currentUrl)) currentUrl = 'https://' + currentUrl
  let currentNorm = currentUrl
  try {
    currentNorm = new URL(currentUrl).href
  } catch (e) {
    currentNorm = currentUrl
  }
  urlChecking.value = false
  if (currentNorm !== normalized) return

  urlMeta.value = { ...meta, url: normalized }
  if (meta.ok) {
    urlStatus.value = {
      type: 'ok',
      text: '网站可访问'
    }
    // 标题回填：未被手动编辑时自动填充（截断至 30 字）
    if (meta.title && !nameManuallyEdited.value && !editingSite.value) {
      siteForm.name = meta.title.slice(0, 30)
    }
  } else {
    urlStatus.value = { type: 'bad', text: '无法访问该网址，请检查网络或网址' }
  }
}
// 保存（添加/编辑）：校验 → 去重 → 注册新分组 → 可达性兜底 → 落库
function saveSite() {
  siteFormRef.value.validate(async valid => {
    if (!valid) return
    const name = siteForm.name.trim()
    let url = siteForm.url.trim()
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url
    url = new URL(url).href
    if (siteFavorites.value.some(s => s.url === url && s !== editingSite.value)) {
      message({
        message: '该网站已在收藏列表中',
        type: 'warning',
        duration: 1500
      })
      return
    }
    // 新输入的分组名：注册到分组列表
    const category = (siteForm.category || '').trim()
    if (category && !siteCategories.value.includes(category)) {
      siteCategories.value.push(category)
      setItem('siteCategories', siteCategories.value)
    }
    // 可达性：优先复用自动获取结果（含 favicon），否则现场抓取
    let meta
    if (urlMeta.value && urlMeta.value.url === url) {
      meta = urlMeta.value
    } else {
      checking.value = true
      meta = await fetchMeta(url)
      checking.value = false
    }
    // 编辑模式下 URL 未变：保留原 favicon，避免被空值覆盖
    const keepIcon = editingSite.value && url === editingSite.value.url
    const icon = keepIcon ? editingSite.value.icon : (meta.favicon || '')
    if (!meta.ok) {
      confirm(`无法访问「${url}」，可能是网络原因或网址有误。`, '网站暂不可达', {
        confirmButtonText: '仍要收藏',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => persistSite(name, url, category, icon))
        .catch(() => {})
      return
    }
    persistSite(name, url, category, icon)
  })
}
// 落库并关闭弹窗
function persistSite(name, url, category, icon) {
  if (editingSite.value) {
    const s = editingSite.value
    s.name = name
    s.url = url
    s.category = category
    s.icon = icon || ''
    s.iconFailed = false
  } else {
    siteFavorites.value.push({ name, url, category, icon: icon || '' })
  }
  setItem('siteFavorites', siteFavorites.value)
  rebuildGroups()
  showAddDialog.value = false
  message({
    message: editingSite.value ? '已更新收藏' : `已收藏「${name}」`,
    type: 'success',
    duration: 1500
  })
}

// ===== 分组管理 =====
// 新建分组
function createGroup() {
  prompt('输入分组名称', '新建分组', {
    confirmButtonText: '创建',
    cancelButtonText: '取消',
    inputPlaceholder: '如：开发 / 设计 / 文档',
    inputPattern: /\S+/,
    inputErrorMessage: '名称不能为空'
  })
    .then(({ value }) => {
      const name = value.trim()
      if (name === '未分类') {
        message({ message: '「未分类」为保留名称', type: 'warning', duration: 1500 })
        return
      }
      if (siteCategories.value.includes(name)) {
        message({ message: '分组已存在', type: 'warning', duration: 1500 })
        return
      }
      siteCategories.value.push(name)
      setItem('siteCategories', siteCategories.value)
      rebuildGroups()
      message({ message: `已创建分组「${name}」`, type: 'success', duration: 1500 })
    })
    .catch(() => {})
}
// 重命名分组：同步更新分组列表与网站归属
function renameGroup(g) {
  prompt('输入新的分组名称', '重命名分组', {
    confirmButtonText: '保存',
    cancelButtonText: '取消',
    inputValue: g.name,
    inputPattern: /\S+/,
    inputErrorMessage: '名称不能为空'
  })
    .then(({ value }) => {
      const name = value.trim()
      if (name === g.name) return
      if (name === '未分类' || siteCategories.value.includes(name)) {
        message({ message: '名称不可用或已存在', type: 'warning', duration: 1500 })
        return
      }
      const i = siteCategories.value.indexOf(g.name)
      if (i > -1) siteCategories.value.splice(i, 1, name)
      siteFavorites.value.forEach(s => {
        if (s.category === g.name) s.category = name
      })
      setItem('siteCategories', siteCategories.value)
      setItem('siteFavorites', siteFavorites.value)
      rebuildGroups()
      message({ message: '分组已重命名', type: 'success', duration: 1500 })
    })
    .catch(() => {})
}
// 删除分组：组内网站移至未分类
function deleteGroup(g) {
  const count = g.sites.length
  confirm(
    count ? `删除分组「${g.name}」？组内 ${count} 个网站将移至未分类。` : `删除空分组「${g.name}」？`,
    '删除分组',
    {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning'
    }
  )
    .then(() => {
      siteCategories.value = siteCategories.value.filter(c => c !== g.name)
      siteFavorites.value.forEach(s => {
        if (s.category === g.name) s.category = ''
      })
      setItem('siteCategories', siteCategories.value)
      setItem('siteFavorites', siteFavorites.value)
      rebuildGroups()
      message({ message: '分组已删除', type: 'success', duration: 1500 })
    })
    .catch(() => {})
}

// ===== 剪贴板收藏 =====
// 拉取收藏列表（主进程按收藏时间倒序返回）
async function loadFavClips() {
  if (!favApi.value || !favApi.value.list) return
  const res = await favApi.value.list()
  if (res && res.ok) favClips.value = res.items || []
}
// 点击行：文本看详情（保留格式），图片直接复制
function onClipClick(c) {
  if (suppressClick.value) return
  if (c.kind === 'text') previewClipText(c)
  else copyClip(c)
}
async function copyClip(c) {
  if (!c || !favApi.value) return
  const res = await favApi.value.copy(c.id)
  if (res && res.ok) message.success('已复制到剪贴板')
}
// 文本详情弹窗：保留换行与缩进
function previewClipText(c) {
  clipTextRec.value = c
  clipTextVisible.value = true
}
// 图片大图预览
async function previewClip(c) {
  if (!c || c.kind !== 'image' || !favApi.value) return
  clipPreviewRec.value = c
  clipPreviewVisible.value = true
  clipPreviewData.value = ''
  const res = await favApi.value.data(c.id)
  if (res && res.ok) clipPreviewData.value = res.data
}
// 取消收藏（仅移除收藏池，不影响剪贴板历史）
async function removeClip(c) {
  if (!c || !favApi.value) return
  await favApi.value.remove(c.id)
  loadFavClips()
  message({ message: '已取消收藏', type: 'success', duration: 1500 })
}
// 图片另存为 PNG
async function saveClip(c) {
  if (!c || c.kind !== 'image' || !favApi.value) return
  const res = await favApi.value.saveAs(c.id)
  if (res && res.ok) message.success('已保存：' + res.filePath)
}
// 收藏时间：月-日 时:分
function fmtFavTime(ts) {
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
</script>

<style lang="scss" scoped>
.favorites-page {
  height: 100%;
  display: flex;
  flex-direction: column;
}

// ===== 页头 =====
.fav-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 2px 2px 14px;

  .header-left {
    min-width: 0;
  }

  .page-title {
    font-size: 20px;
    font-weight: 700;
    color: $text-primary;
    letter-spacing: 0.3px;
    line-height: 1.3;
  }

  .page-sub {
    margin-top: 3px;
    font-size: 12px;
    color: $text-secondary;
  }
}

/* 搜索框：全局统一规格（8px 圆角 / 28px 高 / 聚焦不展开，主题色描边+光晕） */
.search-box {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 200px;
  height: 28px;
  padding: 0 10px;
  margin-bottom: 2px;
  background: $search-bg;
  border: 1px solid transparent;
  border-radius: $radius-base;
  flex-shrink: 0;
  transition: background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  -webkit-app-region: no-drag;

  &:hover {
    background: $search-bg-hover;
  }

  &:focus-within {
    background: var(--card-bg);
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);

    .search-icon {
      color: $primary-color;
    }
  }

  .search-icon {
    font-size: 13px;
    color: $text-secondary;
    flex-shrink: 0;
    transition: color 0.18s ease;
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

  .search-count {
    flex-shrink: 0;
    font-size: 11px;
    line-height: 1.5;
    color: $text-secondary;
    font-family: 'SF Mono', Menlo, monospace;
    font-variant-numeric: tabular-nums;
    background: $search-bg;
    padding: 1px 7px;
    border-radius: 8px;
  }

  .search-clear {
    font-size: 13px;
    color: $text-secondary;
    cursor: pointer;
    flex-shrink: 0;
    border-radius: 50%;
    transition: all 0.15s ease;

    &:hover {
      color: $text-primary;
      transform: scale(1.12);
    }

    &:active {
      transform: scale(0.88);
    }
  }
}

// ===== Tab 工具栏（macOS 分段控件 + 右侧操作） =====
.fav-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.fav-tabs {
  display: inline-flex;
  background: $search-bg;
  border-radius: $radius-base;
  padding: 2px;
  gap: 2px;
  -webkit-app-region: no-drag;
}

.fav-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: $text-secondary;
  cursor: pointer;
  white-space: nowrap;
  user-select: none;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;

  .tab-svg {
    width: 13px;
    height: 13px;
  }

  &:hover {
    color: $text-primary;
  }

  &.active {
    background: var(--card-bg);
    color: $primary-color;
    font-weight: 600;
    box-shadow: $shadow-sm;

    .tab-count {
      background: rgba(var(--primary-color-rgb), 0.1);
      color: $primary-color;
    }
  }

  .tab-count {
    font-size: 11px;
    line-height: 1.5;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
    background: $search-bg;
    padding: 0 7px;
    border-radius: 8px;
  }
}

/* 工具栏右侧操作按钮 */
.toolbar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

/* 添加/操作按钮：主题色胶囊 */
.add-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 26px;
  padding: 0 12px;
  border-radius: 13px;
  font-size: 12px;
  font-weight: 500;
  color: $primary-color;
  background: rgba(var(--primary-color-rgb), 0.1);
  cursor: pointer;
  flex-shrink: 0;
  user-select: none;
  transition: background 0.15s ease, transform 0.15s ease;
  -webkit-app-region: no-drag;

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.18);
  }

  &:active {
    transform: scale(0.95);
  }

  /* 次级按钮：中性色（新建分组） */
  &.is-plain {
    color: $text-secondary;
    background: $search-bg;

    &:hover {
      background: $search-bg-hover;
      color: $text-primary;
    }
  }
}

// ===== 工具收藏卡片：定宽网格 =====
// 等宽卡片整齐排列，超长名称截断兜底（title 提示）
.fav-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 10px;
}

.fav-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px 7px 12px;
  background: $card-bg;
  border-radius: $radius-base;
  border: 1px solid var(--border-color);
  box-shadow: $shadow-sm;
  cursor: pointer;
  min-width: 0;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: no-drag;

  &:hover {
    transform: translateY(-2px);
    box-shadow: $shadow-base;
    border-color: rgba(var(--primary-color-rgb), 0.35);
  }

  &:active {
    transform: translateY(0);
  }

  /* 取消收藏：常显在卡片右侧 */
  .card-remove {
    flex-shrink: 0;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    color: $text-secondary;
    background: $search-bg;
    transition: all 0.15s ease;

    &:hover {
      background: rgba(var(--danger-color-rgb),  0.12);
      color: var(--danger-color);
    }

    &:active {
      transform: scale(0.88);
    }
  }

  .card-avatar {
    width: 28px;
    height: 28px;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    flex-shrink: 0;

    .card-svg {
      width: 15px;
      height: 15px;
    }
  }

  /* 名称：占满剩余空间，超长截断（title 兜底） */
  .card-name {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* 所属分组：分类色胶囊 */
  .card-group {
    flex-shrink: 0;
    padding: 1.5px 8px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 500;
    line-height: 1.5;
    white-space: nowrap;
    max-width: 76px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* 拖拽占位样式 */
.fav-ghost {
  opacity: 0.35;
}

// ===== 网站收藏：分组胶囊流 =====
.site-group {
  margin-bottom: 16px;

  &:last-child {
    margin-bottom: 4px;
  }
}

/* 分组头 */
.group-header {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;

  .group-icon {
    font-size: 14px;
    color: #13C2C2;
  }

  .group-title {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  .group-count {
    font-size: 12px;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
  }

  /* 分组管理操作：hover 分组头时浮现 */
  .group-actions {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    margin-left: 2px;
    opacity: 0;
    transition: opacity 0.15s ease;

    i {
      width: 20px;
      height: 20px;
      border-radius: $radius-sm;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 12px;
      color: $text-secondary;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: $search-bg-hover;
        color: $primary-color;
      }

      &.act-delete:hover {
        color: var(--danger-color);
      }
    }
  }

  &:hover .group-actions {
    opacity: 1;
  }
}

/* 组内胶囊流：flex 换行布局 */
.chip-flow {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* 网站胶囊：favicon + 名称，hover 显示操作 */
.site-chip {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  padding: 0 10px 0 11px;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: 16px;
  cursor: pointer;
  max-width: 260px;
  transition: all 0.16s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: no-drag;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.25);
    box-shadow: $shadow-base;
    transform: translateY(-1px);

    .chip-ops {
      opacity: 1;
    }
  }

  &:active {
    transform: translateY(0);
  }

  .chip-favicon {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    flex-shrink: 0;
    object-fit: contain;
  }

  /* favicon 加载失败的首字母兜底 */
  .chip-letter {
    width: 16px;
    height: 16px;
    border-radius: 4px;
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 10px;
    font-weight: 700;
    background: rgba(19, 194, 194, 0.12);
    color: #13C2C2;
  }

  .chip-name {
    font-size: 12.5px;
    font-weight: 600;
    color: $text-primary;
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 编辑/移除操作：固定占位，hover 显现 */
  .chip-ops {
    display: inline-flex;
    align-items: center;
    gap: 1px;
    flex-shrink: 0;
    opacity: 0;
    transition: opacity 0.15s ease;

    i {
      width: 18px;
      height: 18px;
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      font-size: 11px;
      color: $text-secondary;
      cursor: pointer;
      transition: all 0.15s ease;

      &:hover {
        background: $search-bg-hover;
        color: $primary-color;
      }

      &.act-close:hover {
        background: rgba(var(--danger-color-rgb),  0.12);
        color: var(--danger-color);
      }
    }
  }
}

/* 空分组投放区 */
.group-dropzone {
  padding: 14px 16px;
  border: 1px dashed var(--border-color);
  border-radius: $radius-base;
  font-size: 12px;
  color: $text-secondary;
  transition: border-color 0.15s ease, color 0.15s ease;

  .dz-link {
    color: $primary-color;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.35);
  }
}

// ===== 搜索无匹配提示 =====
.section-empty {
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-color);
  border-radius: $radius-base;
  font-size: 12px;
  color: $text-secondary;
}

// ===== Tab 空状态（垂直居中占满剩余页面） =====
.tab-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-height: 0;

  .empty-icon {
    width: 64px;
    height: 64px;
    border-radius: $radius-lg;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 16px;
    background: rgba(var(--primary-color-rgb), 0.1);
    color: $primary-color;

    &.is-site {
      background: rgba(19, 194, 194, 0.1);
      color: #13C2C2;
    }

    &.is-clip {
      background: rgba(235, 47, 150, 0.1);
      color: #EB2F96;
    }

    .empty-svg {
      width: 28px;
      height: 28px;
    }
  }

  .empty-title {
    font-size: 14px;
    font-weight: 600;
    color: $text-primary;
  }

  .empty-tip {
    margin-top: 5px;
    font-size: 12px;
    color: $text-secondary;
  }

  .empty-btn {
    margin-top: 16px;
  }
}

// ===== 剪贴板收藏：紧凑行列表（图片缩略图 / 文本单行省略，与剪贴板页对齐） =====
.clip-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.clip-item {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 40px; /* 文本行基准高度，与图片缩略图 36px + padding 对齐 */
  box-sizing: border-box;
  padding: 4px 8px;
  border-radius: $radius-base;
  background: $card-bg;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);
  -webkit-app-region: no-drag;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.35);
    box-shadow: $shadow-base;
  }
}

/* 文本收藏：占满剩余宽度，超长省略（完整内容点开弹窗看） */
.clip-text {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 12.5px;
  line-height: 1.4;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 图片缩略图：hover 蒙层查看大图 */
.clip-thumb {
  position: relative;
  flex-shrink: 0;
  width: 72px;
  height: 36px;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: $search-bg;

  img {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: transform 0.2s ease;
  }

  .clip-thumb-mask {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.3);
    color: #fff;
    font-size: 13px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  &:hover {
    img {
      transform: scale(1.05);
    }

    .clip-thumb-mask {
      opacity: 1;
    }
  }
}

/* 图片信息区：允许收缩，右侧时间与按钮不被挤出边界 */
.clip-meta {
  flex: 1;
  min-width: 0;
  overflow: hidden;
}

.clip-size {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: $text-secondary;
  white-space: nowrap;
}

.clip-time {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: $text-secondary;
  opacity: 0.75;
}

/* 行内操作：常驻显示 */
.clip-ops {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  padding-left: 4px;

  button {
    width: 22px;
    height: 22px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: $text-secondary;
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.12s ease;

    &:hover {
      background: $search-bg;
      border-color: var(--border-color);
      color: $primary-color;
    }

    &:active {
      transform: scale(0.92);
    }
  }
}
</style>

<style lang="scss">
// 添加/编辑网站收藏弹窗（append-to-body 所以必须非 scoped）
.add-site-dialog {
  border-radius: 14px !important;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.18) !important;

  .el-dialog__header {
    padding: 16px 20px 10px;

    .el-dialog__title {
      font-size: 15px;
      font-weight: 600;
      color: var(--text-primary, #1A1A1F);
    }
  }

  .el-dialog__body {
    padding: 8px 20px 4px;
  }

  .el-dialog__footer {
    padding: 10px 20px 16px;
  }

  /* URL 输入框内 loading 后缀 */
  .url-loading {
    line-height: 32px;
    color: var(--primary-color);
  }

  /* URL 自动获取状态行 */
  .url-meta {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 7px;
    font-size: 11px;
    line-height: 1.4;
    word-break: break-all;

    &.ok {
      color: var(--success-color);
    }

    &.bad {
      color: var(--danger-color);
    }

    i {
      font-size: 13px;
      flex-shrink: 0;
    }
  }

  /* 分组选择器：全宽 */
  .el-select {
    width: 100%;
  }
}

// 剪贴板收藏 预览/详情弹窗（append-to-body 所以必须非 scoped）
.fav-clip-dialog {
  border-radius: 14px !important;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18) !important;

  .el-dialog__header {
    padding: 12px 18px 10px;
    border-bottom: 1px solid var(--border-color, #e8e8e8);
  }

  .el-dialog__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #1a1a1f);
  }

  .el-dialog__body {
    padding: 14px 18px;
  }

  .el-dialog__footer {
    padding: 10px 18px 14px;
    border-top: 1px solid var(--border-color, #e8e8e8);
  }

  .clip-preview {
    max-height: 60vh;
    overflow: auto;
    text-align: center;
    background: var(--search-bg, #f5f5f5);
    border-radius: 10px;

    img {
      max-width: 100%;
      border-radius: 6px;
    }
  }

  .clip-preview-loading {
    padding: 70px 0;
    font-size: 26px;
    color: var(--text-secondary);
  }

  /* 文本详情：等宽字体 + 保留原始换行与缩进 */
  &.is-text .clip-text-preview {
    max-height: 62vh;
    overflow: auto;
    background: var(--search-bg, #f5f5f5);
    border-radius: 10px;
    padding: 14px 16px;

    pre {
      margin: 0;
      font-family: 'SF Mono', Menlo, Consolas, 'Courier New', monospace;
      font-size: 12.5px;
      line-height: 1.6;
      color: var(--text-primary, #1a1a1f);
      white-space: pre-wrap; /* 保留换行 */
      word-break: break-all; /* 长串不撑破容器 */
      tab-size: 4;
    }
  }
}
</style>
