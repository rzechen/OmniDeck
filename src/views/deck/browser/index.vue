<template>
  <div class="browser-page">
    <!-- Tab 条（顶行，Chrome 结构）：多标签（每 tab 独立 webview，非激活隐藏保留状态） -->
    <div class="br-tabs">
      <div
        v-for="t in tabState.tabs"
        :key="t.id"
        class="br-tab"
        :class="{ active: t.id === tabState.activeId }"
        :title="t.title || t.url || '新标签页'"
        @click="activateTab(t.id)"
        @auxclick.middle.prevent="closeTabById(t.id)"
      >
        <span v-if="t.isLoading" class="br-tab-spin"></span>
        <svg-icon v-else :icon-class="(t.url ? 'website' : 'plus')" class-name="br-tab-ico" />
        <span class="br-tab-name">{{ t.title || t.url || '新标签页' }}</span>
        <i class="br-tab-close" title="关闭标签" @click.stop="closeTabById(t.id)">
          <svg-icon icon-class="close" />
        </i>
      </div>
      <button class="br-tab-new" title="新建标签页" @click="newTabHandler()">
        <svg-icon icon-class="plus" />
      </button>
      <button
        v-if="tabState.tabs.length > 1"
        class="br-tab-new"
        title="关闭所有标签页"
        @click="closeAllTabs"
      >
        <svg-icon icon-class="close" />
      </button>
    </div>

    <!-- 工具栏（tab 条下方）：导航 / 地址栏（含历史下拉）/ 工作台开关 -->
    <div class="br-toolbar">
      <div class="br-nav">
        <button class="br-btn" :disabled="!state.canGoBack" title="后退" @click="onBack">
          <svg-icon icon-class="back" />
        </button>
        <button class="br-btn" :disabled="!state.canGoForward" title="前进" @click="onForward">
          <svg-icon icon-class="right" />
        </button>
        <button class="br-btn" :title="state.isLoading ? '停止' : '刷新'" @click="state.isLoading ? onStop() : onReload()">
          <svg-icon :icon-class="(state.isLoading ? 'close' : 'refresh')" />
        </button>
      </div>

      <div class="br-addr">
        <svg-icon
          :icon-class="isHttps ? 'lock' : 'unlock'"
          :class-name="isHttps ? 'secure' : 'unlock'"
          class="br-secure-icon"
        />
        <input
          ref="addr"
          v-model="input"
          class="br-input"
          type="text"
          spellcheck="false"
          placeholder="输入访问地址，如:https://www.baidu.com"
          @keydown.enter="onGo"
          @focus="onAddrFocus"
          @blur="onAddrBlur"
        />
        <span v-if="state.isLoading" class="br-spin"></span>
        <!-- 收藏当前页：未收藏一键收藏（记入上次使用的文件夹），已收藏打开编辑 -->
        <button
          v-if="state.url"
          class="br-addr-star"
          :class="{ on: !!currentBookmark }"
          :title="currentBookmark ? '取消收藏' : '收藏此页'"
          @click="onStar"
        >
          <svg-icon :icon-class="currentBookmark ? 'star-on' : 'star'" />
        </button>
        <!-- 访问历史下拉（聚焦时呈现，点击项直达；mousedown.prevent 防失焦吞点击） -->
        <transition name="br-drop">
          <div v-if="historyVisible" class="br-history">
            <button
              v-for="h in filteredHistory"
              :key="h.url"
              class="br-history-item"
              :title="h.url"
              @mousedown.prevent
              @click="pickHistory(h.url)"
            >
              <svg-icon icon-class="history" class-name="br-history-ico" />
              <span class="br-history-title">{{ h.title || h.url }}</span>
              <span class="br-history-url">{{ h.url }}</span>
              <!-- 单条移除：不导航，仅从历史删除 -->
              <i
                class="br-history-del"
                title="从历史中移除"
                @mousedown.prevent
                @click.stop="removeHistory(h.url)"
              ><svg-icon icon-class="close" /></i>
            </button>
          </div>
        </transition>
      </div>

      <div class="br-actions">
        <!-- 网页开发者工具：调试注入的翻译脚本/页面元素（webview 独立 DevTools） -->
        <button class="br-btn" title="网页开发者工具" @click="onDevtools">
          <svg-icon icon-class="code" />
        </button>
        <!-- 缩放徽标：任一（App UI / 网页）非 100% 即显示，点击恢复 100% -->
        <button
          v-if="zoomBadges.length"
          class="br-zoom-badge"
          :title="zoomTitle"
          @click="onZoomBadge"
        >{{ zoomBadges }}</button>
        <!-- 侧边栏开关：纯图标（展开/收起状态高亮） -->
        <button
          class="br-btn br-wb-toggle"
          :class="{ on: workbenchOpen }"
          :title="workbenchOpen ? '收起侧边栏' : '展开侧边栏'"
          @click="toggleWorkbench"
        >
          <svg-icon icon-class="cbl" />
        </button>
      </div>
    </div>

    <!-- 书签栏（Chrome 风格）：显示与否由设置-浏览器控制 -->
    <BookmarkBar v-if="bookmarkBarVisible" @navigate="onBookmarkNav" />

    <!-- 页内提示条（文档流内）：$message 挂 body 会被原生子视图遮挡，故页内自绘；
         占位高度变化经 ResizeObserver 自动推送视图 bounds -->
    <transition name="br-notice">
      <div v-if="notice.text" class="br-notice" :class="'is-' + notice.type">
        <svg-icon :icon-class="(notice.type === 'error' ? 'warning-outline' : 'info')" />
        <span class="br-notice-text" :title="notice.text">{{ notice.text }}</span>
        <button class="br-notice-close" @click="notice = { text: '', type: 'info' }">
          <svg-icon icon-class="close" />
        </button>
      </div>
    </transition>

    <!-- 主体区：网页视图 + 右侧工作台边栏并排（Side Panel 布局） -->
    <div class="br-body">
    <!-- 内嵌网页（多 Tab）：每 tab 一个 <webview>（DOM 参与者，弹层可覆盖），
         非激活 v-show 隐藏（状态完整保留）；src 固定 about:blank 占位，
         dom-ready 后按 tab.url 懒加载（激活时才 loadURL，Chrome 崤起方式）；
         partition 隔离站点数据（全 tab 共享，登录态一致） -->
    <div class="br-view">
      <webview
        v-for="t in tabState.tabs"
        :key="t.id"
        :ref="el => setWv(t.id, el)"
        :data-tab-id="t.id"
        :class="{ active: t.id === tabState.activeId }"
        class="br-webview"
        width="100%"
        height="100%"
        src="about:blank"
        partition="persist:web"
        allowpopups
        @did-start-loading="onStateEvent"
        @did-stop-loading="onStateEvent"
        @did-navigate="onDidNavigate"
        @did-navigate-in-page="onStateEvent"
        @page-title-updated="onTitleEvent"
        @did-finish-load="onLoaded"
        @did-fail-load="onFailLoad"
        @dom-ready="onDomReady"
      />
      <div v-if="!state.url" class="br-empty">
        <svg-icon icon-class="browser" />
        <p class="br-empty-title">浏览器</p>
        <p class="br-empty-desc">在上方输入网址开始浏览，多标签页畅游网页。</p>
        <div class="br-empty-tags">
          <span>多标签页</span>
          <span>书签收藏</span>
          <span>划词翻译</span>
        </div>
      </div>
      <!-- 加载失败/超时占位层（不透明遮住 webview 默认错误页） -->
      <div v-if="loadError" class="br-error">
        <svg-icon icon-class="unlink" class-name="br-error-ico" />
        <p class="br-error-title">{{ loadError.title }}</p>
        <p class="br-error-url" :title="loadError.url">{{ loadError.url }}</p>
        <p class="br-error-desc">{{ loadError.desc }}</p>
        <div class="br-error-actions">
          <button class="br-error-btn primary" @click="onErrorReload">
            <svg-icon icon-class="refresh" /> 重新加载
          </button>
          <button class="br-error-btn" @click="onErrorHome">
            <svg-icon icon-class="home" /> 返回主页
          </button>
        </div>
      </div>
    </div>

      <!-- 工作台·右侧边栏（业界 Side Panel 布局）：与网页并排；两级导航——
           功能入口宫格 → 功能面板独占整栏，宽度可拖拽调整 -->
      <transition name="br-wb">
        <aside v-if="workbenchOpen" class="br-side" :class="{ 'is-dragging': draggingSide }" :style="{ width: sideWidth + 'px' }">
          <!-- 左缘拖拽条：拖拽调整侧栏宽度（范围 280px ~ 窗口一半，拖拽期间屏蔽 webview 指针） -->
          <div class="br-side-grip" title="拖拽调整宽度" @pointerdown="onGripDown"></div>

          <!-- 入口视图：功能宫格（豆腐块），新功能只需在 FEATURES 注册即可出现 -->
          <div v-if="!activeFeature" class="br-home">
            <div class="br-home-grid" :style="{ gridTemplateColumns: 'repeat(' + homeCols + ', minmax(0, 1fr))' }">
              <button
                v-for="f in FEATURES"
                :key="f.id"
                class="br-home-cell"
                @click="openFeature(f.id)"
              >
                <svg-icon :icon-class="f.icon" class-name="br-home-ico" />
                <span class="br-home-name">{{ f.title }}</span>
                <span class="br-home-desc">{{ f.desc }}</span>
              </button>
            </div>
            <div class="br-home-tip">点击功能进入专属面板，拖动侧栏左缘可调整宽度</div>
          </div>

          <!-- 功能面板视图：返回头 + 功能面板独占整栏（KeepAlive 保留面板状态） -->
          <template v-else>
            <div class="br-panel-head">
              <button class="br-panel-back" title="返回功能入口" @click="backToHome">
                <svg-icon icon-class="back" />
              </button>
              <span class="br-panel-title">{{ featureMeta.title }}</span>
            </div>
            <div class="br-panel-body">
              <KeepAlive>
                <component :is="featureMeta.panel" ref="featurePanel" @navigate="onBookmarkNav" @notice="onBookmarkNotice" />
              </KeepAlive>
            </div>
          </template>
        </aside>
      </transition>
    </div>

    <!-- 关闭全部二次确认（页内自绘：挂 body 的弹窗会被原生视图遮挡） -->
    <transition name="br-notice">
      <div v-if="confirmCloseAll" class="br-confirm" @click.self="confirmCloseAll = false">
        <div class="br-confirm-card">
          <p class="br-confirm-title">关闭所有标签页？</p>
          <p class="br-confirm-desc">将关闭 {{ tabState.tabs.length }} 个标签页，此操作不可撤销</p>
          <div class="br-confirm-actions">
            <button class="br-error-btn" @click="confirmCloseAll = false">取消</button>
            <button class="br-error-btn primary" @click="doCloseAllTabs">关闭全部</button>
          </div>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick, onMounted, onActivated, onBeforeUnmount, getCurrentInstance } from 'vue'
import { useStore } from 'vuex'
import { getItem, setItem } from '@/utils/storage/db'
import BookmarkPanel from './BookmarkPanel.vue'
import BookmarkBar from './BookmarkBar.vue'
import TranslatePanel from './TranslatePanel.vue'
import { addTransHistory } from './transHistory'
import {
  tabState,
  loadTabs,
  tabById,
  addTab,
  closeTab,
  setActiveTab,
  updateTab
} from './tabs'
import {
  loadBookmarks,
  findBookmarkByUrl,
  addBookmark,
  removeBookmark,
  getLastFolderId
} from './bookmarks'

// ===== 设置/持久化键（设置页「浏览器」分区与页面共用） =====
const ENGINE_KEY = 'browser:engineConfig'      // 翻译引擎/语言选择（TranslatePanel 读写）
const HOMEPAGE_KEY = 'browser:homepage'        // 默认主页（设置页可配）
const HISTORY_LIMIT_KEY = 'browser:historyLimit' // 访问历史保留条数（设置页可配）
const HISTORY_LIST_KEY = 'browser:historyList' // 访问历史 [{ url, title }]
const HISTORY_ENABLED_KEY = 'browser:historyEnabled' // 是否记录访问历史（设置页开关）
const LOAD_TIMEOUT_KEY = 'browser:loadTimeout' // 页面加载超时秒数（设置页可配）
const LAST_URL_KEY = 'browser:lastUrl'         // 最后访问页面（切视图返回/重启恢复）
const WB_OPEN_KEY = 'browser:workbenchOpen'    // 工作台展开状态
const WB_FEATURE_KEY = 'browser:workbenchFeature' // 工作台停留的功能面板 id
const WB_WIDTH_KEY = 'browser:workbenchWidth'  // 工作台侧栏宽度（拖拽调整后持久化）
const WB_COLS_KEY = 'browser:workbenchCols'    // 功能宫格每行列数（设置页可配）
const DEFAULT_HOMEPAGE = 'https://www.baidu.com'
const DEFAULT_HISTORY_LIMIT = 20

// ===== 工作台功能注册表：新功能 = 注册一项 + 一个面板组件，宫格/导航自动出现 =====
// 翻译历史合并于「划词翻译」面板内（配置 + 历史一体）
const FEATURES = [
  { id: 'translate', title: '翻译', desc: '划词即译 · 手动输入 · 历史分组收藏', icon: 'auto', panel: TranslatePanel },
  { id: 'bookmark', title: '书签', desc: '网页收藏 · 分组整理 · Chrome 导入导出', icon: 'star', panel: BookmarkPanel }
]

// 浏览器（Deck 一级入口）：<webview> 内嵌网页（DOM 参与者，弹层可覆盖）；
// 工具栏 UI + 导航/缩放/弹窗策略直接驱动 webview，翻译经主进程特性注入双语对照
defineOptions({ name: 'DeckBrowser' })

const input = ref('')
const addrFocused = ref(false)
const state = reactive({
  url: '',
  title: '',
  isLoading: false,
  canGoBack: false,
  canGoForward: false
})
const lastError = ref('')
const notice = ref({ text: '', type: 'info' })
const zoom = reactive({ ui: 100, web: 100 })
// 工作台
const workbenchOpen = ref(false)
// 当前停留的功能面板：'' 功能宫格 | FEATURES[].id
const activeFeature = ref('')
// 侧栏宽度（拖拽调整，持久化）与拖拽中标记
const sideWidth = ref(360)
const draggingSide = ref(false)
// 功能宫格每行列数（设置页「浏览器」分区可配）
const homeCols = ref(2)
// 书签栏显示开关（设置页「浏览器」分区可配，默认显示）
const bookmarkBarVisible = ref(true)
// 访问历史（持久化）与最后访问 URL（切视图/重启恢复）
const historyList = ref([])
const lastUrl = ref('')
// 加载失败/超时占位：{ title, desc, url }（主帧失败或超时呈现，导航提交即清除）
const loadError = ref(null)

// 模板 ref
const addr = ref(null)
const featurePanel = ref(null)
// 多 Tab：webview 元素集合（tabId → webview）+ 激活 webview 取值
const wvMap = new Map()
function setWv(id, el) {
  if (el) wvMap.set(id, el)
  else wvMap.delete(id)
}

// guest 页面细滚动条（insertCSS user 样式表用；与划词注入脚本的 <style> 规则一致）
const SCROLLBAR_CSS = '*::-webkit-scrollbar{width:6px!important;height:6px!important}' +
  '*::-webkit-scrollbar-track{background:transparent!important}' +
  '*::-webkit-scrollbar-thumb{background:rgba(0,0,0,.22)!important;border-radius:3px!important}' +
  '*::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.38)!important}'

// preload browser API（mounted 时解析）与事件卸载/提示定时器（非响应式）
let browser = null
let offProgress = null
let offZoom = null
let noticeTimer = null
// 加载超时计时器（did-start-loading 挂、加载结束清）
let loadTimer = null
// 上一次已记录历史的 URL（避免 URL 未变时重复写入）
let lastRecorded = ''

const isHttps = computed(() => /^https:/i.test(state.url))
// 当前页收藏（响应 bookmarks 单例，面板增删后自动联动星标态）
const currentBookmark = computed(() => findBookmarkByUrl(state.url))
// 当前功能面板的注册信息（标题/描述/组件）
const featureMeta = computed(() => FEATURES.find(f => f.id === activeFeature.value) || null)
// 缩放徽标文案："125%" / "网页 150%" / "界面 110% · 网页 150%"
const zoomBadges = computed(() => {
  const parts = []
  if (zoom.ui !== 100) parts.push('界面 ' + zoom.ui + '%')
  if (zoom.web !== 100) parts.push('网页 ' + zoom.web + '%')
  return parts.join(' · ')
})
const zoomTitle = computed(() => {
  return '当前缩放：界面 ' + zoom.ui + '%，网页 ' + zoom.web + '%（点击恢复 100%）'
})
// 历史下拉过滤：输入内容作为关键词（与当前页一致时视为无关键词），最多展示 8 条
const filteredHistory = computed(() => {
  const kw = String(input.value || '').trim().toLowerCase()
  const list = historyList.value
  if (!kw || kw === String(state.url || '').toLowerCase()) return list.slice(0, 8)
  return list
    .filter(h => h.url.toLowerCase().includes(kw) || String(h.title || '').toLowerCase().includes(kw))
    .slice(0, 8)
})
const historyVisible = computed(() => addrFocused.value && filteredHistory.value.length > 0)

// 导航后同步地址栏（用户正在输入时不打断）+ 记录访问历史
watch(() => state.url, v => {
  if (!addrFocused.value) input.value = v
  if (/^https?:/i.test(v)) rememberVisit(v, state.title)
})
// 页面标题后到：补写历史条目标题
watch(() => state.title, t => {
  if (!t || !state.url) return
  const hit = historyList.value.find(h => h.url === state.url)
  if (hit && hit.title !== t) {
    hit.title = t
    setItem(HISTORY_LIST_KEY, historyList.value)
  }
})

onMounted(() => {
  const api = window.electronAPI && window.electronAPI.browser
  // 链路自检（主窗口 DevTools Console 可见）：一眼判断 preload 通道是否完整
  console.log('[br] browser api 自检：', api
    ? 'setEngine=' + !!api.setEngine +
      ' onProgress=' + !!api.onProgress + ' attachWebview=' + !!api.attachWebview
    : 'electronAPI.browser 缺失（preload 未注入或版本过旧）')
  if (api) browser = api

  // 访问历史 + 最后访问页（持久化；条数上限每次记录时现读，设置页改完即生效）
  historyList.value = getItem(HISTORY_LIST_KEY, []) || []
  lastUrl.value = String(getItem(LAST_URL_KEY, '') || '')
  // 工作台：展开状态 + 停留面板 + 宽度 + 宫格列数
  loadWorkbenchPrefs()
  // 多 Tab：恢复标签列表（激活 tab 懒加载，非激活显示标题占位）
  loadTabs()
  // 应用重启后首次进入浏览器：恢复标签列表，但激活新标签页打开默认主页
  // （不直接回到上次停留页面；window 内存标记区分「重启」与「会话内
  //   keep-alive 切换返回」：重启后 window 重建标记不存在，切走返回照常恢复）
  if (!window.__odBrSessionBooted) {
    window.__odBrSessionBooted = true
    lastUrl.value = ''
    // Chrome 式启动二选一：有可恢复会话（任一 tab 有 url）→ 原样恢复不新增；
    // 无会话（全空 tab / 首次运行）→ 单 tab 打开默认主页
    const hasSession = tabState.tabs.some(t => t.url)
    if (!hasSession) {
      const solo = tabState.tabs[0]
      if (solo) updateTab(solo.id, { url: normalizeUrl(getHomepage()) })
      else addTab(normalizeUrl(getHomepage()))
    }
  }
  // 书签（响应式单例，与书签面板共享）
  loadBookmarks()

  // 引擎级错误回推（划词面板内也会显示，此处做全局提示与去重）；
  // toast：页面内复制等操作反馈 → 全局 $message（与其他页面一致）
  if (api) {
    offProgress = api.onProgress(p => {
      if (!p) return
      if (p.toast) {
        proxy.$message.success(p.toast)
        return
      }
      // 划词翻译成功回推：写入翻译历史（IndexedDB 单例，功能面板即时呈现）
      if (p.transHistory) {
        addTransHistory(p.transHistory)
        return
      }
      if (!p.error) return
      if (p.error !== lastError.value) {
        lastError.value = p.error
        // 引擎类型从持久化配置实时读（引擎状态由 TranslatePanel 自治管理）
        const savedEngine = (getItem(ENGINE_KEY, null) || {}).engine || 'google'
        const hint = savedEngine === 'google' ? '，建议切换为模型翻译' : '，请检查模型配置或改用 Google 翻译'
        notify('error', '翻译失败：' + p.error + hint)
      }
    })
    // 缩放回推（Cmd+± 界面/网页双值）；旧 preload 无此 API 时静默跳过
    if (typeof api.onZoom === 'function') {
      offZoom = api.onZoom(z => {
        if (z && typeof z.ui === 'number') Object.assign(zoom, z)
      })
    }
  }

  // 窗口尺寸变化：把侧栏宽度夹回上限（窗口一半）内
  window.addEventListener('resize', onWinResize)
})

// keep-alive 切回（如从设置页返回）：重读宫格列数等设置，保证设置页改动即时生效
onActivated(() => {
  loadWorkbenchPrefs()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', onWinResize)
  if (offProgress) offProgress()
  if (offZoom) offZoom()
  if (noticeTimer) clearTimeout(noticeTimer)
  clearLoadTimeout()
})

// ===== 设置读取（db.getItem 同步读内存缓存，设置页保存后本页即时生效） =====
function getHomepage() {
  const v = String(getItem(HOMEPAGE_KEY, '') || '').trim()
  return v || DEFAULT_HOMEPAGE
}
function getHistoryLimit() {
  const n = Number(getItem(HISTORY_LIMIT_KEY, DEFAULT_HISTORY_LIMIT))
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_HISTORY_LIMIT
}
// 加载超时（毫秒；设置页可配，默认 30s，下限 5s 防误配）
function getLoadTimeout() {
  const n = Number(getItem(LOAD_TIMEOUT_KEY, 30))
  return (Number.isFinite(n) && n >= 5 ? n : 30) * 1000
}

// ===== 加载超时与失败占位 =====
// 超时：停止当前加载并显示超时占位（设置页时长，实时读取）
function armLoadTimeout() {
  clearLoadTimeout()
  loadTimer = setTimeout(() => {
    loadTimer = null
    if (!state.isLoading) return
    // 超时页视为不可访问：从访问历史移除（重试成功后会重新记录）
    if (state.url) removeHistory(state.url)
    loadError.value = {
      title: '页面加载超时',
      desc: '服务器长时间未响应，可重试或稍后再访问',
      url: state.url
    }
    navCmd('stop')
  }, getLoadTimeout())
}
function clearLoadTimeout() {
  if (loadTimer) {
    clearTimeout(loadTimer)
    loadTimer = null
  }
}
// 占位层操作：重试 / 返回主页
function onErrorReload() {
  loadError.value = null
  navCmd('reload')
}
function onErrorHome() {
  loadError.value = null
  const target = normalizeUrl(getHomepage())
  if (/^https?:/i.test(target)) navCmd('loadURL', target)
}

// ===== 访问历史（按 URL 去重、最近优先、按设置条数截断、持久化） =====
function rememberVisit(url, title) {
  if (!/^https?:/i.test(url)) return
  // 设置页「记录访问历史」关闭时不记录（含最后访问页）
  if (getItem(HISTORY_ENABLED_KEY, true) === false) return
  lastUrl.value = url
  setItem(LAST_URL_KEY, url)
  if (url === lastRecorded) return
  lastRecorded = url
  const list = historyList.value.filter(h => h.url !== url)
  list.unshift({ url: url, title: title || '' })
  const limit = getHistoryLimit()
  if (list.length > limit) list.length = limit
  historyList.value = list
  setItem(HISTORY_LIST_KEY, list)
}
// 历史下拉：单条移除（不影响当前浏览与会话恢复）
function removeHistory(url) {
  historyList.value = historyList.value.filter(h => h.url !== url)
  setItem(HISTORY_LIST_KEY, historyList.value)
  // 清除去重标记：该 URL 重新访问成功时可再次记录
  if (lastRecorded === url) lastRecorded = ''
}
// 历史下拉：选中直达
function pickHistory(url) {
  input.value = url
  loadError.value = null
  navCmd('loadURL', url)
  addr.value && addr.value.blur()
}
function onAddrFocus() {
  addrFocused.value = true
  // 聚焦即选中全部，方便直接输入覆盖
  const el = addr.value
  if (el && el.select) setTimeout(() => el.select(), 0)
}
function onAddrBlur() {
  addrFocused.value = false
  // 未跳转离开时回显当前页地址
  if (!input.value) input.value = state.url
}

// ===== 工作台 =====
// 侧边栏开关：展开时联动收起左侧应用菜单栏（为网页腾出宽度）；关闭不自动恢复，
// 由用户自行决定左侧栏状态
const store = useStore()
// 全局 $message（main.js 注册，含统一 offset 包装）：页面内 toast 经主进程转发到这里
const { proxy } = getCurrentInstance()
function ensureSidebarCollapsed() {
  if (!store.state.sidebarCollapsed) store.commit('SET_SIDEBAR_COLLAPSED', true)
}
function toggleWorkbench() {
  workbenchOpen.value = !workbenchOpen.value
  setItem(WB_OPEN_KEY, workbenchOpen.value)
  if (workbenchOpen.value) {
    // 每次展开都回到功能宫格（不维持上次停留的功能面板）
    activeFeature.value = ''
    setItem(WB_FEATURE_KEY, '')
    ensureSidebarCollapsed()
  }
}

// 工作台偏好恢复（挂载 + keep-alive 切回时）：展开状态 / 停留面板 / 宽度 / 宫格列数
function loadWorkbenchPrefs() {
  workbenchOpen.value = getItem(WB_OPEN_KEY, false) === true
  const fid = String(getItem(WB_FEATURE_KEY, '') || '')
  activeFeature.value = FEATURES.some(f => f.id === fid) ? fid : ''
  const w = Number(getItem(WB_WIDTH_KEY, 360))
  sideWidth.value = clampSideWidth(Number.isFinite(w) && w > 0 ? w : 360)
  const c = Number(getItem(WB_COLS_KEY, 2))
  homeCols.value = c === 2 || c === 3 || c === 4 ? c : 2
  // 书签栏显示开关（设置-浏览器；实时读取，改动即时生效）
  bookmarkBarVisible.value = getItem('browser:bookmarkBar', true) !== false
}
// 两级导航：宫格 → 功能面板（停留面板持久化，重开侧栏回到上次功能）
function openFeature(id) {
  activeFeature.value = id
  setItem(WB_FEATURE_KEY, id)
}
function backToHome() {
  activeFeature.value = ''
  setItem(WB_FEATURE_KEY, '')
}

// ===== 侧栏宽度拖拽（左缘 grip，范围 280px ~ 窗口一半，松手持久化） =====
const MIN_SIDE_WIDTH = 280
function clampSideWidth(w) {
  const max = Math.max(MIN_SIDE_WIDTH, Math.floor(window.innerWidth / 2))
  return Math.min(Math.max(Math.floor(w), MIN_SIDE_WIDTH), max)
}
function onWinResize() {
  sideWidth.value = clampSideWidth(sideWidth.value)
}
function onGripDown(e) {
  e.preventDefault()
  const el = e.currentTarget
  // webview 为原生元素会吞掉指针事件：拖拽期间临时屏蔽全部 tab，松手恢复
  wvMap.forEach(wv => { wv.style.pointerEvents = 'none' })
  draggingSide.value = true
  document.body.style.userSelect = 'none'
  document.body.style.cursor = 'col-resize'
  const startX = e.clientX
  const startW = sideWidth.value
  const onMove = ev => {
    // 侧栏在右侧：指针左移（clientX 减小）宽度增大
    sideWidth.value = clampSideWidth(startW + (startX - ev.clientX))
  }
  const onUp = () => {
    el.removeEventListener('pointermove', onMove)
    el.removeEventListener('pointerup', onUp)
    el.removeEventListener('pointercancel', onUp)
    draggingSide.value = false
    document.body.style.userSelect = ''
    document.body.style.cursor = ''
    wvMap.forEach(wv => { wv.style.pointerEvents = '' })
    setItem(WB_WIDTH_KEY, sideWidth.value)
  }
  el.setPointerCapture(e.pointerId)
  el.addEventListener('pointermove', onMove)
  el.addEventListener('pointerup', onUp)
  el.addEventListener('pointercancel', onUp)
}

// ===== 书签 =====
// 星标：未收藏一键收藏（记入上次使用的文件夹）；已收藏再次点击取消收藏
// （编辑入口保留在工作台书签面板）
async function onStar() {
  if (!/^https?:/i.test(state.url)) {
    proxy.$message.warning('当前页面不可收藏')
    return
  }
  const exist = currentBookmark.value
  if (exist) {
    const name = exist.name || exist.url
    removeBookmark(exist.id)
    proxy.$message.success('已取消收藏「' + name + '」')
    return
  }
  addBookmark(state.title || state.url, state.url, getLastFolderId())
  proxy.$message.success('已收藏「' + (state.title || state.url) + '」')
}
// 工作台书签分区点击书签：直达导航
function onBookmarkNav(url) {
  if (!url) return
  loadError.value = null
  navCmd('loadURL', url)
}
// 书签分区提示转发（导入/导出结果）
function onBookmarkNotice(payload) {
  if (payload && payload.text) notify(payload.type || 'info', payload.text)
}

// 徽标点击：恢复全部 100%（UI + 网页）
function onZoomBadge() {
  if (browser) browser.resetZoom('ui')
  if (browser) browser.resetZoom('web')
}
// 页内提示条（8s 自动消失）
function notify(type, text) {
  notice.value = { type, text }
  if (noticeTimer) clearTimeout(noticeTimer)
  noticeTimer = setTimeout(() => {
    notice.value = { text: '', type: 'info' }
  }, 8000)
}
// ===== 多 Tab：webview 生命周期 =====
// 事件源定位：webview DOM 事件 e.target 即该 webview 元素（data-tab-id 标记归属）
function wvOf(e) {
  const t = e && e.target
  return (t && t.tagName === 'WEBVIEW' && t.dataset && t.dataset.tabId) ? t : null
}
function wvActive() {
  return wvMap.get(tabState.activeId) || null
}
function wvReady() {
  return wvActive()
}
// 主进程激活标记：导航/翻译注入/缩放等「当前页面」操作定向激活 tab
function notifyActivePage(wv) {
  if (!browser || !browser.setActivePage || !wv) return
  try {
    const wcId = wv.getWebContentsId()
    if (wcId) browser.setActivePage(wcId).catch(() => {})
  } catch (err) { /* webview 未 attach（内部方法抛错）：dom-ready 前不标记 */ }
}

// 新建标签页（工具栏 + / tab 条 +）
function newTabHandler(url) {
  const t = addTab(url)
  if (!t) {
    notify('warning', '标签页数量已达上限（15 个）')
    return
  }
  loadError.value = null
  // webview 由 v-for 渲染 → dom-ready 后统一懒加载/同步
}

// 一键关闭所有标签页：先弹页内二次确认（挂 body 的弹窗会被原生视图遮挡）
const confirmCloseAll = ref(false)
function closeAllTabs() {
  confirmCloseAll.value = true
}
// 确认后执行：closeTab 关到最后会自动新建空 tab 保持单页
function doCloseAllTabs() {
  confirmCloseAll.value = false
  tabState.tabs.slice().forEach(t => {
    wvMap.delete(t.id)
    closeTab(t.id)
  })
  loadError.value = null
}

// 关闭标签页：激活转移 + webview 清理
function closeTabById(id) {
  const wasActive = id === tabState.activeId
  const next = closeTab(id)
  wvMap.delete(id)
  if (wasActive) activateTab(next)
}

// 切换标签：主进程定向 + 懒加载未加载过的 tab + 地址栏状态同步
function activateTab(id) {
  if (!id || id === tabState.activeId) return
  setActiveTab(id)
  loadError.value = null
  const wv = wvMap.get(id)
  const tab = tabById(id)
  if (wv) notifyActivePage(wv)
  nextTick(() => {
    if (!tab) return
    // 懒加载：恢复/新建后从未加载过的 tab，激活时才发起导航
    if (wv && tab.url && !tab.loadedOnce) {
      state.url = ''
      state.isLoading = true
      navCmd('loadURL', tab.url)
    } else if (wv) {
      syncFromWebview(wv)
    }
    input.value = state.url
    // 已加载页面：触发翻译幂等注入（激活目标切换后注入到正确 tab）
    if (wv && /^https?:/i.test(state.url) && browser) browser.pageLoaded()
  })
}

// webview 首次就绪 / keep-alive 返回重建：初始状态 + 主进程翻译注入通道；
// about:blank 占位：激活 tab 按 tab.url 懒加载恢复；空 tab（新建/关光后）保持空白页
function onDomReady(e) {
  const wv = wvOf(e) || wvActive()
  if (!wv) return
  const tid = wv.dataset.tabId
  // 仅激活 tab 可标记主进程「当前页面」：非激活 tab 的 dom-ready 抢注会把
  // 懒加载导航发到错误 webview（激活 tab 停在 about:blank、地址栏空的根因）
  if (tid === tabState.activeId) notifyActivePage(wv)
  syncFromWebview(wv)
  const attach = browser ? browser.attachWebview() : Promise.resolve()
  attach.then(() => {
    let url = ''
    try { url = wv.getURL() } catch (err) { /* 已销毁 */ }
    if (/^https?:/i.test(url)) {
      // 正常就绪（含进程恢复）：翻译开启中则重新注入
      updateTab(tid, { loadedOnce: true })
      if (browser && tid === tabState.activeId) browser.pageLoaded()
      return
    }
    // about:blank：仅激活 tab 恢复（非激活 tab 激活时懒加载）；空 tab 保持空白
    if (tid !== tabState.activeId) return
    const tab = tabById(tid)
    const target = tab && tab.url ? normalizeUrl(tab.url) : ''
    if (/^https?:/i.test(target)) {
      state.url = ''
      state.isLoading = true
      loadError.value = null
      // 导航前再定向一次：attach 异步间隙内激活 tab 可能已被切换
      notifyActivePage(wv)
      navCmd('loadURL', target)
    }
  }).catch(() => {})
}
// 从指定 webview 同步导航状态到地址栏（仅激活 tab 生效；tab 条状态始终更新）
function syncFromWebview(wv) {
  if (!wv) return
  let url = ''
  try { url = wv.getURL() } catch (err) { return }
  const tid = wv.dataset.tabId
  if (tid) {
    updateTab(tid, {
      url: /^https?:/i.test(url) ? url : (tabById(tid) || {}).url,
      // 空白页（about:blank）不落标题，保持「新标签页」占位
      title: /^https?:/i.test(url) ? wv.getTitle() : (tabById(tid) || {}).title,
      isLoading: wv.isLoading()
    })
  }
  if (!tid || tid !== tabState.activeId) return
  Object.assign(state, {
    // 空白页地址栏显示为空（空态引导层依赖 !state.url 显示）
    url: /^https?:/i.test(url) ? url : '',
    title: /^https?:/i.test(url) ? wv.getTitle() : '',
    isLoading: wv.isLoading(),
    canGoBack: wv.canGoBack(),
    canGoForward: wv.canGoForward()
  })
  detectZoom(wv)
}
// webview DOM 事件统一入口（loading/navigate 等）；加载中挂超时（激活 tab），
function onStateEvent(e) {
  const wv = wvOf(e)
  if (wv) syncFromWebview(wv)
  if (state.isLoading && /^https?:/i.test(state.url)) {
    if (!loadTimer) armLoadTimeout()
  } else if (!state.isLoading) {
    clearLoadTimeout()
  }
}
// 标题更新：只改 tab 条（地址栏无标题）
function onTitleEvent(e) {
  const wv = wvOf(e)
  if (!wv) return
  let title = ''
  let isHttp = false
  try {
    title = wv.getTitle()
    isHttp = /^https?:/i.test(wv.getURL())
  } catch (err) { return }
  // 空白页（about:blank）不落标题，保持「新标签页」占位
  if (!isHttp) return
  updateTab(wv.dataset.tabId, { title })
  if (wv.dataset.tabId === tabState.activeId) state.title = title
}
// 导航提交（主帧 URL 变化）：清除失败/超时占位（激活 tab）+ 记录访问历史
function onDidNavigate(e) {
  const wv = wvOf(e)
  if (!wv) return
  const tid = wv.dataset.tabId
  updateTab(tid, { loadedOnce: true })
  let url = ''
  try { url = wv.getURL() } catch (err) { /* 忽略 */ }
  if (/^https?:/i.test(url)) rememberVisit(url, wv.getTitle())
  if (tid === tabState.activeId) loadError.value = null
  onStateEvent(e)
}
// 页面加载完成：注入划词脚本（经主进程，幂等、常开）
function onLoaded(e) {
  const wv = wvOf(e)
  if (!wv) return
  syncFromWebview(wv)
  if (wv.dataset.tabId === tabState.activeId) {
    clearLoadTimeout()
    if (browser) browser.pageLoaded()
  }
  // 细滚动条：以 user 样式表注入 guest 页面（不受站点 CSP 限制，优先级高于
  // 站点 author 样式），每次导航后重新注入；与注入脚本的 <style> 双保险
  try {
    if (wv.insertCSS) wv.insertCSS(SCROLLBAR_CSS, { cssOrigin: 'user' })
  } catch (err) { /* 旧版本无此 API 时静默跳过 */ }
}
// 主帧加载失败：失败占位层（子帧失败与主动中断不占位）；失败页不留在访问历史
function onFailLoad(e) {
  const wv = wvOf(e)
  if (!wv) return
  const code = e && e.errorCode
  if (code === -3) return // ERR_ABORTED：主动跳转中断，非错误
  syncFromWebview(wv)
  if (wv.dataset.tabId !== tabState.activeId) return
  clearLoadTimeout()
  if (e && e.isMainFrame === false) return
  if (state.url) removeHistory(state.url)
  loadError.value = {
    title: '无法访问此页面',
    desc: (e && e.errorDescription) || ('错误码 ' + (code || '未知')) + '，请检查地址或网络后重试',
    url: state.url || input.value
  }
}
// 网页侧缩放值探测（激活 tab 的 webview）
function detectZoom(wv) {
  const el = wv || wvActive()
  if (!el || !el.getZoomFactor) return
  try {
    const web = Math.round((el.getZoomFactor() || 1) * 100)
    if (web !== zoom.web) Object.assign(zoom, { web })
  } catch (err) { /* webview 未就绪 */ }
}
function onBack() {
  const wv = wvReady()
  if (wv && wv.canGoBack()) navCmd('goBack')
}
function onForward() {
  const wv = wvReady()
  if (wv && wv.canGoForward()) navCmd('goForward')
}
function onReload() {
  const wv = wvReady()
  if (wv) navCmd('reload')
}
function onStop() {
  const wv = wvReady()
  if (wv) navCmd('stop')
}
// 网页开发者工具：webview 独立 DevTools（Console 看 [od-tr] 日志、Elements 查注入元素）
function onDevtools() {
  const wv = wvReady()
  if (!wv || !wv.openDevTools) {
    notify('warning', '当前 webview 不支持打开开发者工具')
    return
  }
  try { wv.openDevTools() } catch (err) {
    notify('warning', '打开开发者工具失败：' + (err && err.message ? err.message : '未知错误'))
  }
}
// 导航命令统一走主进程（browser:navigate）：渲染层直调 webview.loadURL 等
// 走 Electron 内部 GUEST_VIEW_MANAGER_CALL，导航被重定向/新导航取代时 reject
// ERR_ABORTED(-3) 且主进程必打报错日志；preload 未就绪时兜底直调并 catch
function navCmd(cmd, url) {
  if (browser) {
    browser.navigate(cmd, url).catch(() => {})
    return
  }
  const wv = wvReady()
  if (!wv) return
  try {
    const r = cmd === 'loadURL' ? wv.loadURL(url) : wv[cmd]()
    if (r && typeof r.catch === 'function') r.catch(() => {})
  } catch (err) { /* webview 未 attach：静默 */ }
}
// 地址归一化：无协议补 https，localhost/IP 补 http
function normalizeUrl(input) {
  const s = String(input || '').trim()
  if (!s) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s
  if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]|$)/i.test(s)) return 'http://' + s
  return 'https://' + s
}
function onGo() {
  const wv = wvReady()
  if (!wv) return
  const url = normalizeUrl(input.value)
  if (!/^https?:/i.test(url)) {
    notify('warning', '仅支持 http/https 网页地址')
    return
  }
  loadError.value = null
  navCmd('loadURL', url)
  addr.value && addr.value.blur()
}
</script>

<style lang="scss" scoped>
.browser-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

/* 工具栏 */
.br-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 46px;
  padding: 0 12px;
  background: $card-bg;
  border-bottom: 1px solid $divider;
  flex-shrink: 0;
}

.br-nav {
  display: flex;
  align-items: center;
  gap: 4px;
}

.br-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  width: 28px;
  height: 28px;
  border: none;
  background: transparent;
  border-radius: $radius-sm;
  color: $text-secondary;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover:not(:disabled) {
    background: $search-bg;
    color: $text-primary;
  }

  &:disabled {
    opacity: 0.35;
    cursor: default;
  }
}

/* 地址栏 */
.br-addr {
  position: relative;
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 10px;
  background: $search-bg;
  border-radius: 15px;
  min-width: 0;

  > i {
    font-size: 12px;
    color: $text-secondary;
    flex-shrink: 0;

    &.secure {
      color: $success-color;
    }
  }
}

.br-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: $text-primary;

  &::placeholder {
    color: $text-secondary;
  }
}

/* 加载指示 */
.br-spin {
  width: 12px;
  height: 12px;
  border: 2px solid $border-color;
  border-top-color: $primary-color;
  border-radius: 50%;
  flex-shrink: 0;
  animation: br-rotate 0.7s linear infinite;
}

@keyframes br-rotate {
  to { transform: rotate(360deg); }
}

/* 地址栏内星标（收藏当前页） */
.br-addr-star {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s ease;

  &:hover {
    background: $divider;
    color: $warning-color;
  }

  &.on {
    color: $warning-color;
  }
}

.br-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.br-progress {
  font-size: 11px;
  color: $text-secondary;
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 1;
}

/* 缩放徽标：非 100% 时出现，点击恢复（主题色由 --primary-color-rgb 组合） */
.br-zoom-badge {
  height: 22px;
  padding: 0 8px;
  border: none;
  border-radius: 11px;
  background: rgba(var(--primary-color-rgb, 51, 102, 255), 0.14);
  color: $primary-color;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s ease;

  &:hover {
    background: rgba(var(--primary-color-rgb, 51, 102, 255), 0.24);
  }
}

/* 侧边栏开关按钮（图标态，展开高亮） */
.br-wb-toggle {
  &.on {
    color: $primary-color;
    background: rgba(51, 102, 255, 0.1);
  }
}

/* ===== 主体区：网页 + 右侧工作台边栏并排 ===== */
.br-body {
  flex: 1;
  display: flex;
  min-height: 0;
}

/* 工作台·右侧边栏（Side Panel 布局）：宽度可拖拽（默认 360，280 ~ 窗口一半）、
   两级导航（功能宫格 → 功能面板独占）、与网页并排 */
.br-side {
  position: relative;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 10px;
  background: $card-bg;
  border-left: 1px solid $divider;
  min-height: 0;
  min-width: 0;
}

/* 左缘拖拽条：hover/拖拽时显示主题色细线 */
.br-side-grip {
  position: absolute;
  left: -4px;
  top: 0;
  bottom: 0;
  width: 8px;
  cursor: col-resize;
  z-index: 20;

  &::after {
    content: '';
    position: absolute;
    left: 4px;
    top: 0;
    bottom: 0;
    width: 2px;
    background: transparent;
    transition: background 0.12s ease;
  }

  &:hover::after,
  .br-side.is-dragging &::after {
    background: $primary-color;
  }
}

/* ===== 入口视图：功能宫格（豆腐块） ===== */
.br-home {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding-top: 4px;
}

.br-home-grid {
  display: grid;
  gap: 10px;
}

.br-home-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
  padding: 18px 10px 14px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: transparent;
  cursor: pointer;
  text-align: center;
  transition: all 0.12s ease;

  .br-home-ico {
    font-size: 22px;
    color: $text-secondary;
    transition: color 0.12s ease;
  }

  .br-home-name {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
    line-height: 1.4;
  }

  .br-home-desc {
    font-size: 11px;
    color: $text-secondary;
    line-height: 1.4;
    /* 描述较长时按「·」自然换行（不再单行截断） */
    white-space: normal;
    word-break: break-word;
    overflow: hidden;
    max-width: 100%;
  }

  &:hover {
    border-color: $primary-color;
    background: rgba(51, 102, 255, 0.06);

    .br-home-ico {
      color: $primary-color;
    }
  }
}

.br-home-tip {
  margin-top: auto;
  padding: 10px 4px 2px;
  font-size: 11px;
  color: $text-secondary;
  text-align: center;
}

/* ===== 功能面板视图：返回头 + 面板独占整栏 ===== */
.br-panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  min-width: 0;
}

.br-panel-back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  font-size: 14px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s ease;

  &:hover {
    background: $search-bg;
    color: $text-primary;
  }
}

.br-panel-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  flex-shrink: 0;
}

/* 面板主体：撑满侧栏剩余高度（面板组件内部自行滚动） */
.br-panel-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* ===== 访问历史下拉（macOS 菜单风格，与 br-drop-panel 同款） ===== */
.br-history {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 40;
  max-height: 320px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px) saturate(1.5);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
}

:global(html[data-theme='dark']) .br-history {
  background: rgba(46, 46, 52, 0.92);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24);
}

.br-history-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 32px;
  padding: 0 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: $text-primary;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: $search-bg;
  }

  .br-history-ico {
    flex-shrink: 0;
    font-size: 13px;
    color: $text-secondary;
  }

  .br-history-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .br-history-url {
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: $text-secondary;
    font-size: 11px;
    flex-shrink: 0;
  }

  /* 单条移除按钮（hover 显示） */
  .br-history-del {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: $radius-sm;
    color: $text-secondary;
    font-size: 11px;
    flex-shrink: 0;
    opacity: 0;
    cursor: pointer;
    transition: all 0.12s ease;

    &:hover {
      background: $divider;
      color: $danger-color;
    }
  }

  &:hover .br-history-del {
    opacity: 1;
  }
}

/* 工作台边栏展开/收起动画（右侧滑入） */
.br-wb-enter-active,
.br-wb-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.br-wb-enter-from,
.br-wb-leave-to {
  opacity: 0;
  transform: translateX(16px);
}

/* ===== Tab 条（多标签） ===== */
.br-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  height: 36px;
  padding: 0 8px;
  background: $search-bg;
  border-bottom: 1px solid $divider;
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  scrollbar-width: none;

  &::-webkit-scrollbar {
    height: 0;
  }
}

.br-tab {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  /* 激活/非激活同高：避免切换时 tab 条内容上下抖动 */
  height: 32px;
  width: 200px;
  min-width: 56px;
  padding: 0 6px 0 10px;
  border-radius: $radius-sm $radius-sm 0 0;
  background: transparent;
  color: $text-secondary;
  cursor: pointer;
  flex-shrink: 0;
  user-select: none;
  transition: background 0.12s ease, color 0.12s ease;
  align-self: flex-end;
  /* 所有 tab 静态统一：激活态不产生位移（无凸出动态） */
  margin-bottom: -1px;
  border: 1px solid transparent;
  border-bottom: none;

  &:hover {
    background: rgba(0, 0, 0, 0.05);

    .br-tab-close {
      opacity: 1;
    }
  }

  &.active {
    background: $card-bg;
    color: $text-primary;
    font-weight: 500;
    border-color: $divider;

    .br-tab-close {
      opacity: 1;
    }
  }

  .br-tab-ico {
    flex-shrink: 0;
    font-size: 12px;
    color: $text-secondary;
  }

  .br-tab-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
  }

  .br-tab-close {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    border-radius: $radius-sm;
    font-size: 9px;
    opacity: 0;
    transition: all 0.12s ease;
    flex-shrink: 0;

    &:hover {
      background: rgba(245, 63, 63, 0.12);
      color: #f53f3f;
    }
  }

  /* 加载中小菊花 */
  .br-tab-spin {
    flex-shrink: 0;
    width: 11px;
    height: 11px;
    border: 2px solid rgba(51, 102, 255, 0.2);
    border-top-color: $primary-color;
    border-radius: 50%;
    animation: br-tab-cw 0.8s linear infinite;
  }
}

@keyframes br-tab-cw {
  to {
    transform: rotate(360deg);
  }
}

.br-tab-new {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: $radius-sm;
  /* 与激活 tab 中心线对齐：激活 tab 32px + 下探1px → 中心距底 15px；本按钮 26px → margin 2px */
  align-self: flex-end;
  margin-bottom: 2px;
  background: transparent;
  color: $text-secondary;
  font-size: 13px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s ease;

  &:hover {
    background: $search-bg;
    color: $text-primary;
  }
}

/* 视图宿主 */
.br-view {
  flex: 1;
  position: relative;
  min-height: 0;
  background: $content-bg;
}

/* webview 外观兜底（尺寸强制见文末全局样式块，scoped 对自定义元素可能不匹配） */
.br-webview {
  position: absolute;
  inset: 0;
  /* v-show → display:none 会被 Electron 判定不可见、打断 guest 渲染管线，
     切回白屏；visibility 保 DOM/渲染状态，恢复即时（Chrome/VS Code webview 叠放方案） */
  visibility: hidden;
  background: #fff;

  &.active {
    visibility: visible;
  }
}

/* 关闭全部二次确认弹层（页内自绘，覆盖在 webview 之上） */
.br-confirm {
  position: absolute;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.4);
}

.br-confirm-card {
  width: 320px;
  padding: 20px 22px;
  border-radius: $radius-base;
  background: $card-bg;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.25);
}

.br-confirm-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: $text-primary;
}

.br-confirm-desc {
  margin: 8px 0 0;
  font-size: 12px;
  color: $text-secondary;
}

.br-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 18px;
}

/* 页内提示条：文档流内自绘（$message 挂 body 会被原生视图遮挡） */
.br-notice {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 34px;
  padding: 0 12px;
  background: $card-bg;
  border-bottom: 1px solid $divider;
  font-size: 12px;
  flex-shrink: 0;

  > i {
    font-size: 14px;
    flex-shrink: 0;
  }

  .br-notice-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .br-notice-close {
    border: none;
    background: transparent;
    color: $text-secondary;
    cursor: pointer;
    font-size: 12px;
    padding: 2px;
    flex-shrink: 0;

    &:hover {
      color: $text-primary;
    }
  }

  &.is-error {
    color: $danger-color;

    > i { color: $danger-color; }
  }

  &.is-warning {
    color: $warning-color;

    > i { color: $warning-color; }
  }
}

.br-notice-enter-active,
.br-notice-leave-active {
  transition: all 0.18s ease;
  overflow: hidden;
}

.br-notice-enter-from,
.br-notice-leave-to {
  height: 0;
  opacity: 0;
}

/* 空态引导（无网址时视图保持分离，引导层可见） */
.br-empty {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 40px;
  text-align: center;

  > i {
    font-size: 40px;
    color: $border-color;
  }
}

/* 加载失败/超时占位层（不透明遮住 webview 默认错误页） */
.br-error {
  position: absolute;
  inset: 0;
  z-index: 6;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 40px;
  text-align: center;
  background: $content-bg;

  .br-error-ico {
    font-size: 40px;
    color: $border-color;
    margin-bottom: 6px;
  }
}

.br-error-title {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.br-error-url {
  margin: 0;
  max-width: 480px;
  font-size: 12px;
  color: $text-secondary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.br-error-desc {
  margin: 0;
  max-width: 420px;
  font-size: 12px;
  line-height: 1.7;
  color: $text-secondary;
}

.br-error-actions {
  display: flex;
  gap: 10px;
  margin-top: 14px;
}

.br-error-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 30px;
  padding: 0 14px;
  border: 1px solid $border-color;
  border-radius: 15px;
  background: transparent;
  color: $text-primary;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.12s ease;

  &:hover {
    border-color: $text-secondary;
  }

  &.primary {
    border-color: $primary-color;
    background: $primary-color;
    color: #fff;

    &:hover {
      opacity: 0.88;
    }
  }
}

.br-empty-title {
  margin: 8px 0 0;
  font-size: 16px;
  font-weight: 600;
  color: $text-primary;
}

.br-empty-desc {
  margin: 0;
  max-width: 420px;
  font-size: 12px;
  line-height: 1.7;
  color: $text-secondary;
}

.br-empty-tags {
  display: flex;
  gap: 8px;
  margin-top: 12px;

  span {
    font-size: 11px;
    color: $text-secondary;
    background: $search-bg;
    padding: 3px 10px;
    border-radius: 10px;
  }
}
</style>

<style lang="scss">
/* webview 尺寸强制（全局非 scoped）：Electron 官方文档要求 webview 必须保持
   display:flex——内部 shadow DOM 的 iframe 依赖 flex 填满容器，改为 block
   会导致内容缩在顶部（元素本身高度正常、guest 不跟随）。配合绝对定位
   撑满宿主（.br-view 为 relative），!important 防外部样式误覆盖 */
.br-view > webview {
  position: absolute !important;
  inset: 0 !important;
  display: flex !important;
  width: 100% !important;
  height: 100% !important;
  border: none !important;
}
</style>
