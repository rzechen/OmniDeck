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
        <i class="el-icon-search search-icon"></i>
        <input
          v-model="keyword"
          placeholder="搜索收藏..."
          @keydown.esc="keyword = ''"
        />
        <span v-if="keyword" class="search-count">{{ searchCount }}</span>
        <i
          v-if="keyword"
          class="el-icon-circle-close search-clear"
          title="清空 (Esc)"
          @click="keyword = ''"
        ></i>
      </div>
    </header>

    <!-- Tab 切换：工具收藏 / 网站收藏（macOS 分段控件风格，可拖拽排序） -->
    <div class="fav-toolbar">
      <draggable
        v-model="tabOrder"
        class="fav-tabs"
        animation="150"
        @end="onTabDragEnd"
      >
        <div
          v-for="key in tabOrder"
          :key="key"
          class="fav-tab"
          :class="{ active: activeTab === key }"
          @click="activeTab = key"
        >
          <svg-icon :icon-class="tabMeta[key].icon" class="tab-svg" />
          <span>{{ tabMeta[key].label }}</span>
          <span class="tab-count">{{ tabCount(key) }}</span>
        </div>
      </draggable>
      <!-- 网站 Tab 操作：新建分组 + 添加网站 -->
      <div v-if="activeTab === 'site'" class="toolbar-actions">
        <span class="add-btn is-plain" @click="createGroup">
          <i class="el-icon-folder-add"></i>
          新建分组
        </span>
        <span class="add-btn" @click="openAddDialog()">
          <i class="el-icon-plus"></i>
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
        @start="onDragStart"
        @end="onDragEnd"
      >
        <div
          v-for="(item, idx) in dragTools"
          :key="item.path"
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
            <i class="el-icon-close"></i>
          </span>
        </div>
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
        <el-button class="empty-btn" size="small" round @click="$router.push('/home')">
          去逛逛工具
        </el-button>
      </div>
    </template>

    <!-- 网站收藏 Tab：分组胶囊流（书签收藏夹风格） -->
    <template v-else>
      <template v-if="siteFavorites.length || siteCategories.length">
        <div v-for="g in visibleGroups" :key="g.name || '__uncategorized'" class="site-group">
          <!-- 分组头：名称 + 数量 + 管理操作（仅自定义分组） -->
          <div class="group-header">
            <i :class="g.name ? 'el-icon-folder' : 'el-icon-folder-opened'" class="group-icon"></i>
            <span class="group-title">{{ g.name || '未分类' }}</span>
            <span class="group-count">{{ g.sites.length }}</span>
            <span v-if="g.name" class="group-actions">
              <i class="el-icon-edit-outline" title="重命名分组" @click="renameGroup(g)"></i>
              <i class="el-icon-delete" title="删除分组" @click="deleteGroup(g)"></i>
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
            @start="onDragStart"
            @end="onSiteDragEnd"
          >
            <div
              v-for="(item, idx) in g.sites"
              :key="item.url"
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
                <i class="el-icon-edit" title="编辑" @click.stop="openEditDialog(item)"></i>
                <i class="el-icon-close" title="移除" @click.stop="removeSite(item)"></i>
              </span>
            </div>
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
      :visible.sync="showAddDialog"
      width="440px"
      custom-class="add-site-dialog"
      append-to-body
      :close-on-click-modal="false"
    >
      <el-form
        ref="siteForm"
        :model="siteForm"
        :rules="rules"
        label-width="56px"
        size="small"
        @submit.native.prevent
      >
        <el-form-item label="网址" prop="url">
          <el-input
            v-model="siteForm.url"
            placeholder="如：github.com（自动补全 https://）"
            clearable
          >
            <i
              v-if="urlChecking"
              slot="suffix"
              class="el-icon-loading url-loading"
            ></i>
          </el-input>
          <!-- 自动获取状态行：可达性 -->
          <div v-if="urlStatus" class="url-meta" :class="urlStatus.type">
            <i :class="urlStatus.type === 'ok' ? 'el-icon-circle-check' : 'el-icon-warning-outline'"></i>
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
      <div slot="footer" class="dialog-footer">
        <el-button size="small" round :disabled="checking" @click="showAddDialog = false">
          取消
        </el-button>
        <el-button size="small" round type="primary" :loading="checking" @click="saveSite">
          {{ checking ? '检测中…' : '保 存' }}
        </el-button>
      </div>
    </el-dialog>
  </div>
</template>

<script>
import draggable from 'vuedraggable'
import { toolCategories } from '@/config/tools'
import { getItem, setItem } from '@/utils/db'

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

// Tab 元信息（工具/网站），顺序由用户拖拽决定
const TAB_META = {
  tool: { label: '工具收藏', icon: 'tools' },
  site: { label: '网站收藏', icon: 'website' }
}

export default {
  name: 'Favorites',
  components: { draggable },
  data() {
    // Tab 顺序：从 IndexedDB 恢复（校验完整性，异常回退默认）
    const tabOrder = (() => {
      const saved = getItem('favTabOrder', null)
      return Array.isArray(saved) &&
        saved.length === 2 &&
        saved.includes('tool') &&
        saved.includes('site')
        ? saved
        : ['tool', 'site']
    })()
    return {
      activeTab: tabOrder[0], // 默认选中排序后的第一个 Tab
      tabOrder,
      tabMeta: TAB_META,
      keyword: '',
      siteFavorites: [], // { name, url, domain, category, iconFailed? }
      siteCategories: [], // 有序自定义分组名列表
      groups: [], // 渲染用分组视图：[{ name: ''|自定义, sites: [] }]
      showAddDialog: false,
      checking: false, // 保存时可访问性检测中
      editingSite: null, // 编辑模式下的原对象
      nameManuallyEdited: false, // 名称被手动编辑后不再自动覆盖
      urlChecking: false, // URL 自动获取元信息中
      urlMeta: null, // 自动获取结果 { ok, title, url }
      urlStatus: null, // URL 下方状态行 { type: 'ok'|'bad', text }
      suppressClick: false, // 拖拽结束后短暂抑制 click，防止误触打开卡片
      siteForm: {
        name: '',
        url: '',
        category: ''
      },
      rules: {
        name: [
          { required: true, message: '请输入网站名称', trigger: 'blur' }
        ],
        url: [
          { required: true, message: '请输入网址', trigger: 'blur' },
          { validator: validateUrl, trigger: 'blur' }
        ]
      }
    }
  },
  computed: {
    // 已收藏工具：按 store 中的收藏顺序渲染
    toolFavorites() {
      const paths = this.$store.state.toolFavorites
      return paths.map(p => allTools.find(t => t.path === p)).filter(Boolean)
    },
    // 按关键字过滤工具收藏（名称匹配）
    filteredToolFavorites() {
      if (!this.keyword) return this.toolFavorites
      const q = this.keyword.toLowerCase()
      return this.toolFavorites.filter(t => t.name.toLowerCase().includes(q))
    },
    // 关键字过滤后的网站总数（跨分组）
    filteredSiteCount() {
      return this.visibleGroups.reduce((n, g) => n + g.sites.length, 0)
    },
    // 分组视图：搜索时返回过滤副本（拖拽已禁用）；平时返回原引用供 v-model 写入
    visibleGroups() {
      if (!this.keyword) return this.groups
      const q = this.keyword.toLowerCase()
      return this.groups
        .map(g => ({
          ...g,
          sites: g.sites.filter(
            s =>
              s.name.toLowerCase().includes(q) ||
              (s.url || '').toLowerCase().includes(q)
          )
        }))
        .filter(g => g.sites.length)
    },
    // 拖拽排序：get 返回展示列表；set 回写 store 并持久化
    dragTools: {
      get() {
        return this.filteredToolFavorites
      },
      set(list) {
        const paths = list.map(t => t.path)
        this.$store.commit('SET_TOOL_FAVORITES', paths)
        setItem('toolFavorites', paths)
      }
    },
    // 搜索框计数：当前 Tab 的 匹配数/总数
    searchCount() {
      return this.activeTab === 'tool'
        ? `${this.filteredToolFavorites.length}/${this.toolFavorites.length}`
        : `${this.filteredSiteCount}/${this.siteFavorites.length}`
    }
  },
  watch: {
    // URL 输入防抖自动获取：可达性 + 标题 + favicon 预览
    'siteForm.url'(val) {
      // 编辑模式预填原 URL：不触发自动获取
      if (this.editingSite && val === this.editingSite.url) return
      clearTimeout(this._urlTimer)
      this.urlChecking = false
      this.urlStatus = null
      this.urlMeta = null
      if (!val || !val.trim()) return
      this._urlTimer = setTimeout(() => this.autoFetchMeta(), 600)
    }
  },
  created() {
    // 加载网站收藏与分组（补齐 category 字段，兼容旧数据）
    this.siteFavorites = (getItem('siteFavorites', []) || []).map(s => ({
      ...s,
      category: s.category || ''
    }))
    this.siteCategories = getItem('siteCategories', [])
    this.rebuildGroups()
  },
  beforeDestroy() {
    clearTimeout(this._urlTimer)
  },
  methods: {
    // ===== 通用 =====
    // Tab 徽标计数：搜索时显示「x/y」，平时显示「y」
    countLabel(filtered, total) {
      return this.keyword ? `${filtered}/${total}` : `${total}`
    },
    // 单个 Tab 的徽标计数文案
    tabCount(key) {
      return key === 'tool'
        ? this.countLabel(this.filteredToolFavorites.length, this.toolFavorites.length)
        : this.countLabel(this.filteredSiteCount, this.siteFavorites.length)
    },
    // Tab 拖拽排序结束：持久化顺序
    onTabDragEnd() {
      setItem('favTabOrder', this.tabOrder)
    },
    // 拖拽开始/结束：结束后短暂抑制 click（浏览器会在 mouseup 后补发 click）
    onDragStart() {
      this.suppressClick = true
    },
    onDragEnd() {
      setTimeout(() => {
        this.suppressClick = false
      }, 0)
    },
    // 点击收藏项直达：工具跳转路由，网站打开链接
    openFavorite(item, type) {
      if (this.suppressClick) return
      if (type === 'tool' && item.path) {
        this.$router.push(item.path)
      } else if (type === 'site' && item.url) {
        window.open(item.url, '_blank')
      }
    },

    // ===== 工具收藏 =====
    // 取消收藏
    removeFavorite(item) {
      this.$store.commit('TOGGLE_TOOL_FAVORITE', item.path)
      setItem('toolFavorites', this.$store.state.toolFavorites)
      this.$message({
        message: `已取消收藏「${item.name}」`,
        type: 'success',
        duration: 1500
      })
    },

    // ===== 网站收藏：分组视图 =====
    // 由 siteCategories + siteFavorites 重建渲染分组
    // 未分类组仅在有内容时显示；自定义分组始终显示（支持空分组投放）
    rebuildGroups() {
      const uncategorized = { name: '', sites: [] }
      const custom = this.siteCategories.map(name => ({ name, sites: [] }))
      this.siteFavorites.forEach(s => {
        const g = custom.find(g => g.name === s.category)
        ;(g || uncategorized).sites.push(s)
      })
      this.groups = uncategorized.sites.length
        ? [uncategorized, ...custom]
        : custom
    },
    // 网站 chips 拖拽结束：从分组视图拍平回 siteFavorites（保留对象引用）并持久化
    onSiteDragEnd() {
      this.onDragEnd()
      const list = []
      this.groups.forEach(g => {
        const cat = g.name
        g.sites.forEach(s => {
          if (s.category !== cat) s.category = cat
          list.push(s)
        })
      })
      this.siteFavorites = list
      setItem('siteFavorites', list)
    },
    // favicon 地址：优先保存时抓取到的 <link rel=icon> 真实地址，
    // 回退站点根 /favicon.ico，加载失败由 @error 回退首字母头像
    faviconUrl(item) {
      if (item.icon) return item.icon
      try {
        return new URL(item.url).origin + '/favicon.ico'
      } catch (e) {
        return ''
      }
    },
    onFaviconError(item) {
      // 自定义图标加载失败：先回退根路径 /favicon.ico 再试一次
      if (item.icon) {
        this.$set(item, 'icon', '')
      } else {
        this.$set(item, 'iconFailed', true)
      }
    },

    // ===== 网站收藏：增删改 =====
    // 移除网站收藏
    removeSite(item) {
      this.siteFavorites = this.siteFavorites.filter(s => s.url !== item.url)
      setItem('siteFavorites', this.siteFavorites)
      this.rebuildGroups()
      this.$message({
        message: `已移除「${item.name}」`,
        type: 'success',
        duration: 1500
      })
    },
    // 打开添加弹窗（可预选分组）：重置表单与自动获取状态
    openAddDialog(category) {
      this.editingSite = null
      this.siteForm = { name: '', url: '', category: category || '' }
      this.resetMetaState()
      this.showAddDialog = true
      this.$nextTick(() => {
        this.$refs.siteForm && this.$refs.siteForm.clearValidate()
      })
    },
    // 打开编辑弹窗：预填原值
    openEditDialog(item) {
      this.editingSite = item
      this.siteForm = {
        name: item.name,
        url: item.url,
        category: item.category || ''
      }
      this.resetMetaState()
      // 编辑时直接展示可达状态（不重新请求）
      this.urlStatus = { type: 'ok', text: item.url }
      this.showAddDialog = true
      this.$nextTick(() => {
        this.$refs.siteForm && this.$refs.siteForm.clearValidate()
      })
    },
    resetMetaState() {
      clearTimeout(this._urlTimer)
      this.urlChecking = false
      this.urlMeta = null
      this.urlStatus = null
      this.nameManuallyEdited = false
    },
    // 名称手动输入后，自动获取不再覆盖
    onNameInput() {
      this.nameManuallyEdited = true
    },
    // 抓取网站元信息：优先主进程 IPC（可读 title），回退 no-cors fetch（仅可达性）
    async fetchMeta(url) {
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
    },
    // URL 防抖后自动获取：可达性 + 标题回填 + favicon 预览
    async autoFetchMeta() {
      const raw = (this.siteForm.url || '').trim()
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
      this.urlChecking = true
      const meta = await this.fetchMeta(normalized)
      // 竞态保护：输入已变化则丢弃本次结果
      const current = (this.siteForm.url || '').trim()
      let currentUrl = current
      if (currentUrl && !/^https?:\/\//i.test(currentUrl)) currentUrl = 'https://' + currentUrl
      let currentNorm = currentUrl
      try {
        currentNorm = new URL(currentUrl).href
      } catch (e) {
        currentNorm = currentUrl
      }
      this.urlChecking = false
      if (currentNorm !== normalized) return

      this.urlMeta = { ...meta, url: normalized }
      if (meta.ok) {
        this.urlStatus = {
          type: 'ok',
          text: '网站可访问'
        }
        // 标题回填：未被手动编辑时自动填充（截断至 30 字）
        if (meta.title && !this.nameManuallyEdited && !this.editingSite) {
          this.siteForm.name = meta.title.slice(0, 30)
        }
      } else {
        this.urlStatus = { type: 'bad', text: '无法访问该网址，请检查网络或网址' }
      }
    },
    // 保存（添加/编辑）：校验 → 去重 → 注册新分组 → 可达性兜底 → 落库
    saveSite() {
      this.$refs.siteForm.validate(async valid => {
        if (!valid) return
        const name = this.siteForm.name.trim()
        let url = this.siteForm.url.trim()
        if (!/^https?:\/\//i.test(url)) url = 'https://' + url
        url = new URL(url).href
        if (this.siteFavorites.some(s => s.url === url && s !== this.editingSite)) {
          this.$message({
            message: '该网站已在收藏列表中',
            type: 'warning',
            duration: 1500
          })
          return
        }
        // 新输入的分组名：注册到分组列表
        const category = (this.siteForm.category || '').trim()
        if (category && !this.siteCategories.includes(category)) {
          this.siteCategories.push(category)
          setItem('siteCategories', this.siteCategories)
        }
        // 可达性：优先复用自动获取结果（含 favicon），否则现场抓取
        let meta
        if (this.urlMeta && this.urlMeta.url === url) {
          meta = this.urlMeta
        } else {
          this.checking = true
          meta = await this.fetchMeta(url)
          this.checking = false
        }
        // 编辑模式下 URL 未变：保留原 favicon，避免被空值覆盖
        const keepIcon = this.editingSite && url === this.editingSite.url
        const icon = keepIcon ? this.editingSite.icon : (meta.favicon || '')
        if (!meta.ok) {
          this.$confirm(`无法访问「${url}」，可能是网络原因或网址有误。`, '网站暂不可达', {
            confirmButtonText: '仍要收藏',
            cancelButtonText: '取消',
            type: 'warning'
          })
            .then(() => this.persistSite(name, url, category, icon))
            .catch(() => {})
          return
        }
        this.persistSite(name, url, category, icon)
      })
    },
    // 落库并关闭弹窗
    persistSite(name, url, category, icon) {
      if (this.editingSite) {
        const s = this.editingSite
        s.name = name
        s.url = url
        s.category = category
        s.icon = icon || ''
        this.$set(s, 'iconFailed', false)
      } else {
        this.siteFavorites.push({ name, url, category, icon: icon || '' })
      }
      setItem('siteFavorites', this.siteFavorites)
      this.rebuildGroups()
      this.showAddDialog = false
      this.$message({
        message: this.editingSite ? '已更新收藏' : `已收藏「${name}」`,
        type: 'success',
        duration: 1500
      })
    },

    // ===== 分组管理 =====
    // 新建分组
    createGroup() {
      this.$prompt('输入分组名称', '新建分组', {
        confirmButtonText: '创建',
        cancelButtonText: '取消',
        inputPlaceholder: '如：开发 / 设计 / 文档',
        inputPattern: /\S+/,
        inputErrorMessage: '名称不能为空'
      })
        .then(({ value }) => {
          const name = value.trim()
          if (name === '未分类') {
            this.$message({ message: '「未分类」为保留名称', type: 'warning', duration: 1500 })
            return
          }
          if (this.siteCategories.includes(name)) {
            this.$message({ message: '分组已存在', type: 'warning', duration: 1500 })
            return
          }
          this.siteCategories.push(name)
          setItem('siteCategories', this.siteCategories)
          this.rebuildGroups()
          this.$message({ message: `已创建分组「${name}」`, type: 'success', duration: 1500 })
        })
        .catch(() => {})
    },
    // 重命名分组：同步更新分组列表与网站归属
    renameGroup(g) {
      this.$prompt('输入新的分组名称', '重命名分组', {
        confirmButtonText: '保存',
        cancelButtonText: '取消',
        inputValue: g.name,
        inputPattern: /\S+/,
        inputErrorMessage: '名称不能为空'
      })
        .then(({ value }) => {
          const name = value.trim()
          if (name === g.name) return
          if (name === '未分类' || this.siteCategories.includes(name)) {
            this.$message({ message: '名称不可用或已存在', type: 'warning', duration: 1500 })
            return
          }
          const i = this.siteCategories.indexOf(g.name)
          if (i > -1) this.siteCategories.splice(i, 1, name)
          this.siteFavorites.forEach(s => {
            if (s.category === g.name) s.category = name
          })
          setItem('siteCategories', this.siteCategories)
          setItem('siteFavorites', this.siteFavorites)
          this.rebuildGroups()
          this.$message({ message: '分组已重命名', type: 'success', duration: 1500 })
        })
        .catch(() => {})
    },
    // 删除分组：组内网站移至未分类
    deleteGroup(g) {
      const count = g.sites.length
      this.$confirm(
        count ? `删除分组「${g.name}」？组内 ${count} 个网站将移至未分类。` : `删除空分组「${g.name}」？`,
        '删除分组',
        {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        }
      )
        .then(() => {
          this.siteCategories = this.siteCategories.filter(c => c !== g.name)
          this.siteFavorites.forEach(s => {
            if (s.category === g.name) s.category = ''
          })
          setItem('siteCategories', this.siteCategories)
          setItem('siteFavorites', this.siteFavorites)
          this.rebuildGroups()
          this.$message({ message: '分组已删除', type: 'success', duration: 1500 })
        })
        .catch(() => {})
    }
  }
}
</script>

<style lang="scss" scoped>
.favorites-page {
  height: 100%;
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

/* 搜索框：Mac 胶囊风格（与分类页筛选框一致），聚焦展开 + 主题色光环 */
.search-box {
  display: flex;
  align-items: center;
  gap: 7px;
  width: 200px;
  height: 30px;
  padding: 0 12px;
  margin-bottom: 2px;
  background: $search-bg;
  border: 1px solid transparent;
  border-radius: 15px;
  flex-shrink: 0;
  transition: width 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    background 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
  -webkit-app-region: no-drag;

  &:hover {
    background: $search-bg-hover;
  }

  &:focus-within {
    width: 248px;
    background: var(--card-bg);
    border-color: rgba(var(--primary-color-rgb), 0.45);
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
  border: 1px solid transparent;
  cursor: pointer;
  min-width: 0;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  -webkit-app-region: no-drag;

  &:hover {
    transform: translateY(-2px);
    box-shadow: $shadow-base;
    border-color: rgba(var(--primary-color-rgb), 0.2);
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
      background: rgba(245, 74, 69, 0.12);
      color: #F54A45;
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

      &.el-icon-delete:hover {
        color: #F54A45;
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

      &.el-icon-close:hover {
        background: rgba(245, 74, 69, 0.12);
        color: #F54A45;
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

// ===== Tab 空状态（居中大区块） =====
.tab-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 320px;

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
    color: var(--primary-color, #3366FF);
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
      color: #52C41A;
    }

    &.bad {
      color: #F54A45;
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
</style>
