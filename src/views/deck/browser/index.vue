<template>
  <div class="browser-page">
    <!-- 工具栏：导航 / 地址栏 / 翻译开关 / 引擎切换 -->
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
          placeholder="输入网址访问，如 github.com"
          @keydown.enter="onGo"
          @focus="addrFocused = true"
          @blur="addrFocused = false"
        />
        <span v-if="state.isLoading" class="br-spin"></span>
      </div>

      <div class="br-actions">
        <span v-if="progressText" class="br-progress" :title="progressTitle">{{ progressText }}</span>
        <!-- 缩放徽标：任一（App UI / 网页）非 100% 即显示，点击恢复 100% -->
        <button
          v-if="zoomBadges.length"
          class="br-zoom-badge"
          :title="zoomTitle"
          @click="onZoomBadge"
        >{{ zoomBadges }}</button>
        <!-- 源语言检测 → 目标语言流向展示 -->
        <span v-if="langFlow" class="br-lang-flow" :title="langFlowTitle">{{ langFlow }}</span>
        <!-- 目标语言下拉：DOM 面板（展开时主进程临时摘视图，天然对齐、无坐标换算） -->
        <div ref="langMenu" class="br-menu">
          <button
            class="br-menu-btn br-lang"
            :title="'目标语言：' + (LANGS[targetLang] || targetLang)"
            @click="toggleMenu('lang')"
          >
            <svg-icon icon-class="postcard" />
            <span class="br-menu-label">{{ LANGS[targetLang] || targetLang }}</span>
            <svg-icon icon-class="arrow-down" class-name="br-menu-caret" :class="{ open: menu === 'lang' }" />
          </button>
          <transition name="br-drop">
            <div v-if="menu === 'lang'" class="br-drop-panel">
              <button
                v-for="(label, code) in LANGS"
                :key="code"
                class="br-drop-item"
                :class="{ active: code === targetLang }"
                @click="pickLang(code)"
              >{{ label }}<svg-icon v-if="code === targetLang" icon-class="check" class-name="br-drop-check" /></button>
            </div>
          </transition>
        </div>
        <!-- 翻译引擎下拉 -->
        <div ref="engineMenu" class="br-menu">
          <button
            class="br-menu-btn br-engine"
            :title="'翻译引擎：' + engineLabel"
            @click="toggleMenu('engine')"
          >
            <span class="br-menu-label">{{ engineLabel }}</span>
            <svg-icon icon-class="arrow-down" class-name="br-menu-caret" :class="{ open: menu === 'engine' }" />
          </button>
          <transition name="br-drop">
            <div v-if="menu === 'engine'" class="br-drop-panel">
              <button class="br-drop-item" :class="{ active: engine === 'google' }" @click="pickEngine('google')">
                Google 翻译<svg-icon v-if="engine === 'google'" icon-class="check" class-name="br-drop-check" />
              </button>
              <button
                v-for="p in providers"
                :key="p.id"
                class="br-drop-item"
                :class="{ active: engine === 'llm' && providerId === p.id }"
                @click="pickEngine('llm:' + p.id)"
              >
                {{ (p.displayName || p.name) + ' · 模型' }}<svg-icon v-if="engine === 'llm' && providerId === p.id" icon-class="check" class-name="br-drop-check" />
              </button>
            </div>
          </transition>
        </div>
        <button class="br-btn br-translate" :class="{ on: translating }" title="双语对照翻译" @click="toggleTranslate">
          <svg-icon icon-class="connection" />
          <span>{{ translating ? '对照中' : '翻译' }}</span>
        </button>
      </div>
    </div>

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

    <!-- 内嵌网页：<webview> 是 DOM 参与者，弹层/下拉可自然覆盖其上（z-index 生效），
         无需 rect 上报与视图摘挂；partition 隔离站点数据 -->
    <div ref="viewHost" class="br-view">
      <webview
        ref="webview"
        class="br-webview"
        width="100%"
        height="100%"
        src="about:blank"
        partition="persist:web"
        allowpopups
        @did-start-loading="onStateEvent"
        @did-stop-loading="onStateEvent"
        @did-navigate="onStateEvent"
        @did-navigate-in-page="onStateEvent"
        @page-title-updated="onStateEvent"
        @did-finish-load="onLoaded"
        @did-fail-load="onFailLoad"
        @dom-ready="onDomReady"
      />
      <div v-if="!state.url" class="br-empty">
        <svg-icon icon-class="monitor" />
        <p class="br-empty-title">浏览器</p>
        <p class="br-empty-desc">在上方输入网址开始浏览，开启「翻译」即可在不破坏排版的前提下，以双语对照方式阅读外文网页。</p>
        <div class="br-empty-tags">
          <span>排版零破坏</span>
          <span>视口优先翻译</span>
          <span>Google / 模型双引擎</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { getItem, setItem } from '@/utils/storage/db'

const ENGINE_KEY = 'browser:engineConfig'

// 目标语言列表（与主进程 engines.js TARGET_LANGS 保持一致）
const LANGS = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
  ru: 'Русский',
  pt: 'Português',
  it: 'Italiano'
}

// 浏览器（Deck 一级入口）：<webview> 内嵌网页（DOM 参与者，弹层可覆盖）；
// 工具栏 UI + 导航/缩放/弹窗策略直接驱动 webview，翻译经主进程特性注入双语对照
export default {
  name: 'DeckBrowser',
  data() {
    return {
      input: '',
      addrFocused: false,
      state: {
        url: '',
        title: '',
        isLoading: false,
        canGoBack: false,
        canGoForward: false
      },
      translating: false,
      engine: 'google',
      providerId: '',
      targetLang: 'zh-CN',
      detectedName: '',
      providers: [],
      progress: { total: 0, done: 0, failed: 0 },
      lastError: '',
      notice: { text: '', type: 'info' },
      noticeTimer: null,
      // 当前展开的下拉：'' | 'lang' | 'engine'
      menu: '',
      zoom: { ui: 100, web: 100 },
      // preload browser API（mounted 时解析）
      browser: null,
      offProgress: null,
      offZoom: null
    }
  },
  computed: {
    // 目标语言列表（模块级常量桥接模板作用域）
    LANGS() {
      return LANGS
    },
    isHttps() {
      return /^https:/i.test(this.state.url)
    },
    // "检测语言 → 目标语言" 流向文案（Google 引擎在翻译后回填检测语言）
    langFlow() {
      if (!this.detectedName) return ''
      return this.detectedName + ' → ' + (LANGS[this.targetLang] || this.targetLang)
    },
    langFlowTitle() {
      return '页面语言：' + this.detectedName + '，正在翻译为 ' + (LANGS[this.targetLang] || this.targetLang)
    },
    // 引擎按钮文案
    engineLabel() {
      if (this.engine === 'google') return 'Google 翻译'
      const p = this.findProvider()
      return p ? (p.displayName || p.name) + ' · 模型' : '模型翻译'
    },
    // 缩放徽标文案："125%" / "网页 150%" / "界面 110% · 网页 150%"
    zoomBadges() {
      const parts = []
      if (this.zoom.ui !== 100) parts.push('界面 ' + this.zoom.ui + '%')
      if (this.zoom.web !== 100) parts.push('网页 ' + this.zoom.web + '%')
      return parts.join(' · ')
    },
    zoomTitle() {
      return '当前缩放：界面 ' + this.zoom.ui + '%，网页 ' + this.zoom.web + '%（点击恢复 100%）'
    },
    progressText() {
      const p = this.progress
      if (!p || (!p.total && !p.error)) return ''
      if (p.error) return '翻译失败'
      return '已译 ' + p.done + '/' + p.total + ' 段'
    },
    progressTitle() {
      const p = this.progress
      if (p && p.error) return p.error
      return ''
    }
  },
  watch: {
    // 导航后同步地址栏（用户正在输入时不打断）
    'state.url'(v) {
      if (!this.addrFocused) this.input = v
    },
    // 目标语言切换：回灌主进程（变更自动重译）+ 持久化
    targetLang() {
      this.applyEngine()
    }
  },
  mounted() {
    const browser = window.electronAPI && window.electronAPI.browser
    // 点击面板外关闭下拉（DOM 方案，无需指令）
    document.addEventListener('click', this.onDocClick)
    if (browser) this.browser = browser

    // 恢复引擎配置 + 供应商列表（IndexedDB）；仅文本生成模型（图像模型不参与对话）
    this.providers = (getItem('aiProviderList', []) || []).filter(p => p && p.type !== 'image')
    const saved = getItem(ENGINE_KEY, null)
    if (saved && saved.engine) {
      this.engine = saved.engine
      this.providerId = saved.providerId || ''
    }
    if (saved && saved.target && LANGS[saved.target]) this.targetLang = saved.target
    // 选了模型翻译但供应商缺失：回退默认供应商 / Google
    if (this.engine === 'llm' && !this.findProvider()) {
      const def = this.providers.find(p => p.isDefault) || this.providers[0]
      if (def) {
        this.providerId = def.id
      } else {
        this.engine = 'google'
        this.providerId = ''
      }
    }

    // 翻译进度回推（引擎级错误提示切换）
    if (browser) {
      this.offProgress = browser.onProgress(p => {
        if (!p) return
        if (p.error) {
          if (p.error !== this.lastError) {
            this.lastError = p.error
            const hint = this.engine === 'google' ? '，建议切换为模型翻译' : '，请检查模型配置或改用 Google 翻译'
            this.notify('error', '翻译失败：' + p.error + hint)
          }
          this.progress = Object.assign({}, this.progress, { error: p.error })
          return
        }
        this.lastError = ''
        this.progress = p
      })
      // 缩放回推（Cmd+± 界面/网页双值）；旧 preload 无此 API 时静默跳过
      if (typeof browser.onZoom === 'function') {
        this.offZoom = browser.onZoom(z => {
          if (z && typeof z.ui === 'number') this.zoom = z
        })
      }
    }

    // webview 就绪经模板 @dom-ready 事件（onDomReady），无需 addEventListener
    this.applyEngine()
  },
  beforeUnmount() {
    document.removeEventListener('click', this.onDocClick)
    if (this.offProgress) this.offProgress()
    if (this.offZoom) this.offZoom()
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
  },
  methods: {
    // 徽标点击：恢复全部 100%（UI + 网页）
    onZoomBadge() {
      if (this.browser) this.browser.resetZoom('ui')
      if (this.browser) this.browser.resetZoom('web')
    },
    // 页内提示条（8s 自动消失）
    notify(type, text) {
      this.notice = { type, text }
      if (this.noticeTimer) clearTimeout(this.noticeTimer)
      this.noticeTimer = setTimeout(() => {
        this.notice = { text: '', type: 'info' }
      }, 8000)
    },
    // ===== webview 生命周期 =====
    wvReady() {
      return this.$refs.webview || null
    },
    // webview 首次就绪：初始状态 + 主进程翻译注入通道（每次 dom-ready 都可能触发，
    // 如进程恢复；attachWebview/pageLoaded 幂等）
    onDomReady() {
      const wv = this.wvReady()
      if (!wv) return
      this.syncFromWebview()
      if (this.browser) {
        this.browser.attachWebview()
        // 翻译开启中：新页面重新注入
        if (this.translating) this.browser.pageLoaded()
      }
    },
    // 从 webview 同步导航状态（事件驱动）；未 dom-ready 前页面方法不可调
    syncFromWebview() {
      const wv = this.wvReady()
      if (!wv) return
      let url = ''
      try { url = wv.getURL() } catch (err) { return }
      this.state = Object.assign({}, this.state, {
        url: url,
        title: wv.getTitle(),
        isLoading: wv.isLoading(),
        canGoBack: wv.canGoBack(),
        canGoForward: wv.canGoForward()
      })
      this.detectZoom()
    },
    // webview DOM 事件统一入口（loading/navigate/title 等）
    onStateEvent() {
      this.syncFromWebview()
    },
    // 页面加载完成：注入翻译（经主进程，幂等）
    onLoaded() {
      this.syncFromWebview()
      if (this.translating && this.browser) this.browser.pageLoaded()
    },
    // 主帧加载失败：页内提示
    onFailLoad(e) {
      const code = e && e.errorCode
      if (code === -3) return // ERR_ABORTED：主动跳转中断，非错误
      this.syncFromWebview()
      this.notify('error', '页面加载失败：' + ((e && e.errorDescription) || code || '未知错误'))
    },
    // 网页侧缩放值探测（webview.getZoomFactor）
    detectZoom() {
      const wv = this.wvReady()
      if (!wv || !wv.getZoomFactor) return
      try {
        const web = Math.round((wv.getZoomFactor() || 1) * 100)
        if (web !== this.zoom.web) this.zoom = Object.assign({}, this.zoom, { web })
      } catch (err) { /* webview 未就绪 */ }
    },
    // webview 是否已就绪（dom-ready 后页面方法才可安全调用）
    wvIsReady() {
      const wv = this.wvReady()
      if (!wv) return false
      try { wv.getURL(); return true } catch (err) { return false }
    },
    // ===== DOM 下拉面板（与按钮天然对齐，无坐标换算） =====
    toggleMenu(which) {
      this.menu = this.menu === which ? '' : which
    },
    closeMenus() {
      this.menu = ''
    },
    onDocClick(e) {
      if (!this.menu) return
      const inLang = this.$refs.langMenu && this.$refs.langMenu.contains(e.target)
      const inEngine = this.$refs.engineMenu && this.$refs.engineMenu.contains(e.target)
      if (!inLang && !inEngine) this.closeMenus()
    },
    pickLang(code) {
      this.targetLang = code
      this.closeMenus()
    },
    pickEngine(val) {
      if (val === 'google') {
        this.engine = 'google'
        this.providerId = ''
      } else {
        this.engine = 'llm'
        this.providerId = val.slice(4)
      }
      this.applyEngine()
      this.closeMenus()
    },
    onBack() {
      const wv = this.wvReady()
      if (wv && wv.canGoBack()) this.navCmd('goBack')
    },
    onForward() {
      const wv = this.wvReady()
      if (wv && wv.canGoForward()) this.navCmd('goForward')
    },
    onReload() {
      const wv = this.wvReady()
      if (wv) this.navCmd('reload')
    },
    onStop() {
      const wv = this.wvReady()
      if (wv) this.navCmd('stop')
    },
    // 导航命令统一走主进程（browser:navigate）：渲染层直调 webview.loadURL 等
    // 走 Electron 内部 GUEST_VIEW_MANAGER_CALL，导航被重定向/新导航取代时 reject
    // ERR_ABORTED(-3) 且主进程必打报错日志；preload 未就绪时兜底直调并 catch
    navCmd(cmd, url) {
      if (this.browser) {
        this.browser.navigate(cmd, url).catch(() => {})
        return
      }
      const wv = this.wvReady()
      if (!wv) return
      try {
        const r = cmd === 'loadURL' ? wv.loadURL(url) : wv[cmd]()
        if (r && typeof r.catch === 'function') r.catch(() => {})
      } catch (err) { /* webview 未 attach：静默 */ }
    },
    // 地址归一化：无协议补 https，localhost/IP 补 http
    normalizeUrl(input) {
      const s = String(input || '').trim()
      if (!s) return ''
      if (/^[a-z][a-z0-9+.-]*:/i.test(s)) return s
      if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?([/?#]|$)/i.test(s)) return 'http://' + s
      return 'https://' + s
    },
    onGo() {
      const wv = this.wvReady()
      if (!wv) return
      const url = this.normalizeUrl(this.input)
      if (!/^https?:/i.test(url)) {
        this.notify('warning', '仅支持 http/https 网页地址')
        return
      }
      this.navCmd('loadURL', url)
      this.$refs.addr && this.$refs.addr.blur()
    },
    toggleTranslate() {
      this.translating = !this.translating
      this.applyTranslate()
    },
    applyTranslate() {
      if (this.browser) this.browser.setTranslate(this.translating)
    },
    findProvider() {
      return this.providers.find(p => p.id === this.providerId) || null
    },
    // 引擎/目标语言切换：回灌主进程 + 持久化（引擎切换后重新点「翻译」按新引擎重译；
    // 目标语言变更时主进程自动重译当前页面）
    applyEngine() {
      const provider = this.findProvider()
      if (this.browser) {
        this.browser.setEngine({
          engine: this.engine,
          target: this.targetLang,
          provider: provider
            ? { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }
            : null
        })
      }
      setItem(ENGINE_KEY, { engine: this.engine, providerId: this.providerId, target: this.targetLang })
    }
  }
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

/* 原生菜单触发按钮（引擎/语言）：视觉与工具栏按钮一致 */
.br-menu-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: $radius-sm;
  background: $search-bg;
  color: $text-primary;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s ease;

  &:hover {
    background: $divider;
  }

  .br-menu-label {
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .br-menu-caret {
    font-size: 10px;
    color: $text-secondary;
  }
}

.br-engine {
  width: auto;
}

/* ===== DOM 下拉面板（macOS 菜单风格：毛玻璃 + 大圆角 + 选项小圆角，对齐
   theme.scss 中 .el-select-dropdown 的既有 token） ===== */
.br-menu {
  position: relative;
  flex-shrink: 0;
}

.br-menu-caret {
  transition: transform 0.15s ease;

  &.open {
    transform: rotate(180deg);
  }
}

.br-drop-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  min-width: 152px;
  max-height: 320px;
  overflow-y: auto;
  padding: 5px;
  /* macOS 菜单：毛玻璃半透明 + 12px 大圆角，与全局 el-select-dropdown 同款 */
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px) saturate(1.5);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
}

/* 暗色：macOS 菜单暗色版（对齐 theme.scss 的 dark 下拉规范）。
   scoped 下 html 属性选择器不命中，用 :global 穿透 */
:global(html[data-theme='dark']) .br-drop-panel {
  background: rgba(46, 46, 52, 0.92);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24);
}

.br-drop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: $text-primary;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;

  &:hover {
    background: $search-bg;
  }

  &.active {
    color: $primary-color;
    font-weight: 500;
  }

  .br-drop-check {
    flex-shrink: 0;
    color: $primary-color;
  }
}

/* 面板展开动画 */
.br-drop-enter-active,
.br-drop-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.br-drop-enter,
.br-drop-enter-from,
.br-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 目标语言按钮（窄） */
.br-lang {
  width: auto;
}

/* 语言流向：检测语言 → 目标语言 */
.br-lang-flow {
  font-size: 11px;
  color: $text-secondary;
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 翻译开关按钮 */
.br-translate {
  width: auto;
  padding: 0 10px;
  gap: 5px;
  font-size: 12px;
  border: 1px solid $border-color;

  &.on {
    color: $primary-color;
    border-color: $primary-color;
    background: rgba(51, 102, 255, 0.08);
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
  background: #fff;
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
