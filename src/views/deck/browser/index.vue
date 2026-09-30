<template>
  <div class="browser-page">
    <!-- 工具栏：导航 / 地址栏 / 翻译开关 / 引擎切换 -->
    <div class="br-toolbar">
      <div class="br-nav">
        <button class="br-btn" :disabled="!state.canGoBack" title="后退" @click="onBack">
          <i class="el-icon-back"></i>
        </button>
        <button class="br-btn" :disabled="!state.canGoForward" title="前进" @click="onForward">
          <i class="el-icon-right"></i>
        </button>
        <button class="br-btn" :title="state.isLoading ? '停止' : '刷新'" @click="state.isLoading ? onStop() : onReload()">
          <i :class="state.isLoading ? 'el-icon-close' : 'el-icon-refresh'"></i>
        </button>
      </div>

      <div class="br-addr">
        <i
          class="br-secure-icon"
          :class="[isHttps ? 'el-icon-lock secure' : 'el-icon-unlock']"
        ></i>
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
        <!-- 源语言检测 → 目标语言流向展示 -->
        <span v-if="langFlow" class="br-lang-flow" :title="langFlowTitle">{{ langFlow }}</span>
        <!-- 原生菜单下拉（DOM 弹层会被原生子视图盖住，系统菜单浮于一切之上） -->
        <button
          ref="langBtn"
          class="br-menu-btn br-lang"
          :title="'目标语言：' + (LANGS[targetLang] || targetLang)"
          @click="openLangMenu"
        >
          <i class="el-icon-postcard"></i>
          <span class="br-menu-label">{{ LANGS[targetLang] || targetLang }}</span>
          <i class="el-icon-arrow-down br-menu-caret"></i>
        </button>
        <button
          ref="engineBtn"
          class="br-menu-btn br-engine"
          :title="'翻译引擎：' + engineLabel"
          @click="openEngineMenu"
        >
          <span class="br-menu-label">{{ engineLabel }}</span>
          <i class="el-icon-arrow-down br-menu-caret"></i>
        </button>
        <button class="br-btn br-translate" :class="{ on: translating }" title="双语对照翻译" @click="toggleTranslate">
          <i class="el-icon-connection"></i>
          <span>{{ translating ? '对照中' : '翻译' }}</span>
        </button>
      </div>
    </div>

    <!-- 页内提示条（文档流内）：$message 挂 body 会被原生子视图遮挡，故页内自绘；
         占位高度变化经 ResizeObserver 自动推送视图 bounds -->
    <transition name="br-notice">
      <div v-if="notice.text" class="br-notice" :class="'is-' + notice.type">
        <i :class="notice.type === 'error' ? 'el-icon-warning-outline' : 'el-icon-info'"></i>
        <span class="br-notice-text" :title="notice.text">{{ notice.text }}</span>
        <button class="br-notice-close" @click="notice = { text: '', type: 'info' }">
          <i class="el-icon-close"></i>
        </button>
      </div>
    </transition>

    <!-- WebContentsView 宿主容器：rect 经 ResizeObserver 上报主进程 setBounds -->
    <div ref="viewBox" class="br-view">
      <div v-if="!state.url" class="br-empty">
        <i class="el-icon-monitor"></i>
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
import { getItem, setItem } from '@/utils/db'

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

// 浏览器（Deck 一级入口）：工具栏 UI + WebContentsView 容器 rect 上报；
// 网页本体由主进程 windows/browser.js 持有，翻译经注入脚本双语对照展示
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
        canGoForward: false,
        attached: false
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
      offState: null,
      offProgress: null,
      ro: null
    }
  },
  computed: {
    // 语言表暴露给模板（模块级常量模板不可见，此前导致页面崩溃/下拉空列表）
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
    if (!browser) return
    this.browser = browser

    // 恢复引擎配置 + 供应商列表（IndexedDB）
    this.providers = getItem('aiProviderList', []) || []
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
    this.applyEngine()

    // 导航状态回推
    this.offState = browser.onState(s => {
      if (!s) return
      this.state = Object.assign({}, this.state, s)
      this.translating = !!s.enabled
      if (s.engine) this.engine = s.engine
      // 主进程 cfg 为准（target 变更触发重译时保持同步）
      if (s.target && LANGS[s.target]) this.targetLang = s.target
      this.detectedName = s.detectedName || ''
    })
    // 翻译进度回推（引擎级错误提示切换）
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

    // 初始状态 + 容器尺寸监听
    browser.getState().then(st => {
      if (st) {
        this.state = Object.assign({}, this.state, st)
        this.input = st.url || ''
        this.translating = !!st.enabled
        if (st.target && LANGS[st.target]) this.targetLang = st.target
        this.detectedName = st.detectedName || ''
      }
      this.show()
    })

    this.$nextTick(() => {
      const box = this.$refs.viewBox
      if (box && typeof ResizeObserver !== 'undefined') {
        this.ro = new ResizeObserver(() => this.reportBounds())
        this.ro.observe(box)
      }
      window.addEventListener('resize', this.reportBounds)
    })
  },
  // keep-alive：切回页签重新挂载视图，切出走隐藏
  activated() {
    this.show()
  },
  deactivated() {
    if (this.browser) this.browser.hide()
  },
  beforeUnmount() {
    if (this.browser) this.browser.hide()
    if (this.offState) this.offState()
    if (this.offProgress) this.offProgress()
    if (this.ro) this.ro.disconnect()
    if (this.noticeTimer) clearTimeout(this.noticeTimer)
    window.removeEventListener('resize', this.reportBounds)
  },
  methods: {
    // 页内提示条（8s 自动消失）：$message 挂 body 会被原生视图遮挡
    notify(type, text) {
      this.notice = { type, text }
      if (this.noticeTimer) clearTimeout(this.noticeTimer)
      this.noticeTimer = setTimeout(() => {
        this.notice = { text: '', type: 'info' }
      }, 8000)
    },
    // 原生菜单：锚点为按钮左下角（CSS px）；positioningItem 让当前选中项
    // 对齐按钮（原生 select 行为）。CSS px → 屏幕 DIP 由主进程按 zoomFactor 换算
    popupAt(refName, items) {
      const el = this.$refs[refName]
      if (!el || !this.browser) return Promise.resolve(null)
      const r = el.getBoundingClientRect()
      return this.browser.popupMenu({
        x: Math.round(r.left),
        y: Math.round(r.bottom + 4),
        positioningItem: items.findIndex(it => it.checked),
        items
      })
    },
    async openLangMenu() {
      const val = await this.popupAt('langBtn', Object.keys(LANGS).map(code => ({
        value: code,
        label: LANGS[code],
        checked: code === this.targetLang
      })))
      if (val) this.targetLang = val
    },
    async openEngineMenu() {
      const items = [{ value: 'google', label: 'Google 翻译', checked: this.engine === 'google' }]
        .concat(this.providers.map(p => ({
          value: 'llm:' + p.id,
          label: (p.displayName || p.name) + ' · 模型翻译',
          checked: this.engine === 'llm' && this.providerId === p.id
        })))
      const val = await this.popupAt('engineBtn', items)
      if (!val) return
      if (val === 'google') {
        this.engine = 'google'
        this.providerId = ''
      } else {
        this.engine = 'llm'
        this.providerId = val.slice(4)
      }
      this.applyEngine()
    },
    onBack() { if (this.browser) this.browser.back() },
    onForward() { if (this.browser) this.browser.forward() },
    onReload() { if (this.browser) this.browser.reload() },
    onStop() { if (this.browser) this.browser.stop() },
    onGo() {
      const url = String(this.input || '').trim()
      if (!url || !this.browser) return
      this.browser.navigate(url).then(res => {
        if (res && res.ok === false && res.error) this.notify('warning', res.error)
        this.$refs.addr && this.$refs.addr.blur()
      })
    },
    toggleTranslate() {
      this.translating = !this.translating
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
    },
    show() {
      if (!this.browser) return
      this.browser.show()
      this.$nextTick(() => this.reportBounds())
    },
    // 容器 rect 上报：主进程换算 DIP 后 setBounds 到 WebContentsView
    reportBounds() {
      const box = this.$refs.viewBox
      if (!box || !this.browser) return
      const rect = box.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) return
      this.browser.setBounds({
        rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight
      })
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

/* 视图宿主：WebContentsView 覆盖区域 */
.br-view {
  flex: 1;
  position: relative;
  min-height: 0;
  background: $content-bg;
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
