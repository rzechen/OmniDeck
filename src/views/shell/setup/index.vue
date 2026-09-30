<template>
  <div class="og-shell" :class="{ 'is-focus': step !== 1 }">
    <!-- ===== 斜分能力欢迎视图：左 OmniDeck 工具台 / 右 OmniBuddy 智能体 ===== -->
    <div class="og-hero">
      <div class="og-half og-half-deck">
        <div class="og-half-inner">
          <div class="og-half-badge">
            <svg-icon icon-class="tools" class="og-half-badge-icon" />
          </div>
          <h2 class="og-half-name">OmniDeck</h2>
          <p class="og-half-slogan">效率工具台 · 常用能力一屏尽览</p>
          <div class="og-chips">
            <span v-for="(c, i) in deckChips" :key="c.text" class="og-chip" :style="{ animationDelay: -(i * 0.35) + 's' }">
              <svg-icon :icon-class="c.icon" />
              {{ c.text }}
            </span>
          </div>
        </div>
      </div>
      <div class="og-half og-half-buddy">
        <div class="og-half-inner">
          <div class="og-half-badge">
            <svg-icon icon-class="buddy" class="og-half-badge-icon" />
          </div>
          <h2 class="og-half-name">OmniBuddy</h2>
          <p class="og-half-slogan">AI 智能搭子 · 交个任务还你结果</p>
          <div class="og-chips">
            <span v-for="(c, i) in buddyChips" :key="c.text" class="og-chip" :style="{ animationDelay: -(i * 0.35) + 's' }">
              <svg-icon :icon-class="c.icon" />
              {{ c.text }}
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 顶部拖动条：窗口拖动 + Windows 窗口控制 ===== -->
    <div class="og-dragbar">
      <div v-if="isWindows" class="og-win">
        <button class="og-win-btn" title="最小化" @click="winCall('minimize')"><span class="og-g-min" /></button>
        <button class="og-win-btn" :title="winMaximized ? '还原' : '最大化'" @click="winCall('toggleMaximize')">
          <span class="og-g-max" :class="{ restore: winMaximized }" />
        </button>
        <button class="og-win-btn og-win-close" title="关闭" @click="winCall('close')"><span class="og-g-x" /></button>
      </div>
    </div>

    <!-- ===== 第 1 步：欢迎 + 自动检查 ===== -->
    <transition name="og-fade" mode="out-in">
      <div v-if="step === 1" key="welcome" class="og-welcome">
        <img src="@/assets/logo.png" alt="OmniDeck" class="og-logo" />
        <h1 class="og-h1">欢迎使用 OmniDeck</h1>

        <!-- 检查中 -->
        <div v-if="checking" class="og-status">
          <span class="og-spinner" />
          <span>正在检查运行环境…</span>
        </div>
        <!-- 检查失败 -->
        <div v-else-if="checkFailed" class="og-status og-status-warn">{{ checkError || '环境检查失败' }}——请检查网络后重试</div>
        <!-- 已就绪 -->
        <div v-else-if="!pendingItems.length" class="og-status og-status-pill">
          <svg-icon icon-class="check" /> 运行环境已就绪，无需装配
        </div>

        <button class="og-btn-main" :disabled="checking" @click="begin">
          <span class="og-btn-shine" />
          <span class="og-btn-text">{{ mainBtnText }}</span>
          <svg-icon icon-class="arrow-right" class="og-btn-arrow" />
        </button>
      </div>

      <!-- ===== 第 2 步：装配进度（整页视图，后台异步执行，可随时先进入应用） ===== -->
      <div v-else-if="step === 2" key="install" class="og-page">
        <!-- 两侧梯形舞台：左 Buddy 流式问答 / 右 Deck 格式化（互联网产品 hero 感） -->
        <theater-canvas v-if="!sessionFailed && !leaving" side="buddy" class="og-stage og-stage-l" />
        <div class="og-mid">
          <h2 class="og-h2">{{ h2Text }}</h2>
          <p class="og-sub-s">
            {{ sessionFailed
              ? '已完成的部分无需重新下载，可重试继续'
              : sessionDone ? '运行环境装配完成，全部能力已解锁，可关闭' : '装配在后台进行，不会阻塞你进入应用' }}
          </p>

          <!-- 整体进度：大百分比 + 进度条 + ETA -->
          <div class="og-progress-hero">
            <div class="og-progress-num">
              <span class="og-pct">{{ overallPct }}<i>%</i></span>
              <span class="og-progress-meta">
                <template v-if="sessionDone">全部组件装配完成</template>
                <template v-else-if="currentItem">
                  正在装配 · {{ currentItem.label }}<template v-if="sessionItems.length">（{{ doneCount + 1 }}/{{ sessionItems.length }}）</template>
                </template>
                <template v-else-if="sessionFailed">装配中断于「{{ failedItems[0] && failedItems[0].label }}」</template>
                <template v-else>全部组件装配完成</template>
                <template v-if="!sessionDone && etaText"> · 预计剩余 {{ etaText }}</template>
              </span>
            </div>
            <div class="og-progress-track" :class="{ failed: sessionFailed }">
              <div class="og-progress-fill" :style="{ width: overallPct + '%' }" />
            </div>
            <div v-if="!sessionFailed && bytesText" class="og-progress-bytes">{{ bytesText }}</div>
          </div>

          <!-- 组件清单：required 全集（已就绪跳过项也在列，呈现完整装配清单） -->
          <div class="og-list">
            <div v-for="c in sessionItems" :key="c.name" class="og-item" :class="['is-' + c.state, { 'is-skipped': c.skipped }]">
              <div class="og-item-top">
                <span class="og-item-mark">
                  <svg-icon v-if="c.state === 'ok'" icon-class="check" />
                  <span v-else-if="c.state === 'installing'" class="og-mini-ring" />
                  <span v-else-if="c.state === 'error'" class="og-item-x">!</span>
                  <span v-else class="og-item-dot" />
                </span>
                <span class="og-item-label">{{ c.label }}</span>
                <span v-if="c.state === 'installing'" class="og-item-pct">{{ itemPctText(c) }}</span>
                <span v-else class="og-item-state">{{ stateText(c.state, c.skipped) }}</span>
              </div>
              <div class="og-item-desc">{{ c.desc }}</div>
            </div>
          </div>

          <div v-if="sessionFailed" class="og-note og-note-warn">{{ failedItems[0] && failedItems[0].error }}</div>

          <div class="og-actions">
            <template v-if="sessionFailed">
              <button class="og-btn-main" @click="retry"><span class="og-btn-shine" /><span class="og-btn-text">重试装配</span></button>
              <a class="og-skip" @click="skip">稍后在设置中装配</a>
            </template>
            <template v-else-if="sessionDone">
              <button class="og-btn-main" @click="enter"><span class="og-btn-shine" /><span class="og-btn-text">开始使用 OmniDeck</span><svg-icon icon-class="arrow-right" class="og-btn-arrow" /></button>
            </template>
            <template v-else>
              <a class="og-enter-link" @click="enter">
                先进入 OmniDeck
                <svg-icon icon-class="arrow-right" class="og-enter-link-icon" />
              </a>
              <div class="og-waiting">后台装配中，进入应用后顶部会继续显示进度</div>
            </template>
          </div>
        </div>
        <theater-canvas v-if="!sessionFailed && !leaving" side="deck" class="og-stage og-stage-r" />
      </div>
    </transition>
  </div>
</template>

<script>
// 首启引导装配（三步向导：斜分能力欢迎 → 后台装配进度 → 完成）。
// 装配由主进程后台串行驱动（setup:start-install 触发）：页面切走不中断，
// 快照经 omnibuddy:setup:progress 广播（引导页与主视图顶部横幅共用同一通道）；
// 第 2 步可随时「先进入 OmniDeck」不阻塞，剩余装配在主视图顶部横幅继续展示。
// setupStatus 为本地探测（不拉 manifest 秒回）。
import TheaterCanvas from './TheaterCanvas.vue'

export default {
  name: 'SetupGuide',
  components: { TheaterCanvas },
  data() {
    return {
      step: 1, // 1 欢迎（含自动检查）/ 2 装配进度 / 3 完成
      leaving: false, // 离场中：停剧场 rAF，避免切页争主线程
      checking: true,
      checkError: '', // 检查失败原因（IPC 异常等）
      items: [], // 检查所得组件清单 [{ name, label, desc, state: ok|pending }]
      session: null, // 主进程后台装配快照 { state, items, bytesDone, bytesTotal, etaSec, error }
      offProgress: null,
      // Windows 无边框窗口自绘控制（mac 用系统红绿灯）
      isWindows: !!(window.electronAPI && window.electronAPI.platform === 'win32'),
      winMaximized: false,
      offMaximized: null,
      // 斜分欢迎视图能力标签（图标走全局 svg 雪碧图命名空间；末位「更多…」示意还有大量能力）
      deckChips: [
        { icon: 'image', text: '图片处理' },
        { icon: 'excel', text: '表格文书' },
        { icon: 'code', text: '代码工具' },
        { icon: 'qrcode', text: '二维码' },
        { icon: 'encrypt', text: '加解密' },
        { icon: 'finance', text: '财经行情' },
        { icon: 'format', text: '格式转换' },
        { icon: 'translate-browser', text: '翻译浏览' },
        { icon: 'clipboard', text: '剪贴板' },
        { icon: 'todo', text: '待办清单' },
        { icon: 'browser', text: '内置浏览器' },
        { icon: 'more', text: '更多能力' }
      ],
      buddyChips: [
        { icon: 'llm', text: '多模型对话' },
        { icon: 'skill', text: '技能编排' },
        { icon: 'mcp', text: 'MCP 扩展' },
        { icon: 'subagent', text: '子智能体' },
        { icon: 'memory', text: '长期记忆' },
        { icon: 'auto', text: '自动化任务' },
        { icon: 'magic-stick', text: '智能体市场' },
        { icon: 'search', text: '联网搜索' },
        { icon: 'promotion', text: '工作流' },
        { icon: 'document', text: '文档问答' },
        { icon: 'storage', text: '知识空间' },
        { icon: 'more', text: '更多能力' }
      ]
    }
  },
  computed: {
    api() {
      return (window.electronAPI && window.electronAPI.omnibuddy) || null
    },
    pendingItems() {
      return this.items.filter(c => c.state === 'pending')
    },
    // 快照组件清单（无快照时回退本地检查清单，保底渲染）
    sessionItems() {
      return (this.session && this.session.items) || this.items
    },
    doneCount() {
      return this.sessionItems.filter(c => c.state === 'ok').length
    },
    failedItems() {
      return this.sessionItems.filter(c => c.state === 'error')
    },
    sessionFailed() {
      return !!(this.session && this.session.state === 'failed')
    },
    // 装配完成态：留在本页呈现 100% + 完成按钮（不自动跳「一切就绪」页）
    sessionDone() {
      return !!(this.session && this.session.state === 'done')
    },
    h2Text() {
      if (this.sessionFailed) return '装配遇到问题'
      if (this.sessionDone) return '装配完成'
      return '正在装配运行环境'
    },
    currentItem() {
      return this.sessionItems.find(c => c.state === 'installing') || null
    },
    checkFailed() {
      return !!this.checkError
    },
    mainBtnText() {
      if (this.checking) return '正在检查环境…'
      if (this.checkFailed) return '重新检查'
      if (this.pendingItems.length) return '开始探索'
      return '立即进入'
    },
    // 整体进度（字节口径优先；无字节时按项数）；完成态精确 100%
    overallPct() {
      if (this.sessionDone) return 100
      const total = this.sessionItems.length
      if (!total) return 0
      const s = this.session
      if (s && s.bytesTotal > 0 && !this.sessionFailed) {
        return Math.min(99, Math.floor((s.bytesDone || 0) / s.bytesTotal * 100))
      }
      let acc = this.doneCount
      if (this.currentItem) acc += this.itemWeight(this.currentItem)
      return Math.min(100, Math.floor(acc / total * 100))
    },
    etaText() {
      const s = this.session
      if (!s || s.state !== 'installing' || !s.etaSec) return ''
      return this.formatEta(s.etaSec)
    },
    bytesText() {
      const s = this.session
      if (!s || !s.bytesTotal) return ''
      // 全部已就绪（无实装下载）时字节口径无意义，不展示
      if (this.sessionItems.length && this.sessionItems.every(c => c.skipped)) return ''
      return '已下载 ' + this.formatSize(s.bytesDone || 0) + ' / 约 ' + this.formatSize(s.bytesTotal)
    }
  },
  watch: {
    // 快照驱动已由 computed 呈现（完成态留在第 2 步），无需自动切步
  },
  created() {
    this.bindProgress()
    this.bindWinControl()
    this.check()
    this.syncSnapshot()
  },
  beforeUnmount() {
    if (this.offProgress) this.offProgress()
    if (this.offMaximized) this.offMaximized()
  },
  methods: {
    // Windows 窗口控制：初始最大化态同步 + 变化监听（切还原/最大化图标）
    bindWinControl() {
      const wc = window.electronAPI && window.electronAPI.winControl
      if (!this.isWindows || !wc) return
      wc.isMaximized().then(v => { this.winMaximized = v })
      this.offMaximized = wc.onMaximizedChanged(v => { this.winMaximized = v })
    },
    winCall(fn) {
      const wc = window.electronAPI && window.electronAPI.winControl
      if (wc && wc[fn]) wc[fn]()
    },
    // 组件净化文案（能力导向，不暴露实现细节；未命中回退主进程 label）
    niceMeta(name, label) {
      const META = {
        'python-env': ['Python 执行环境', '运行代码与数据分析'],
        'node': ['Node.js 运行时', '工具与脚本的运行底座'],
        'node-tools': ['文档处理工具库', '图片与 Office 文档处理'],
        'chrome-headless-shell': ['浏览器引擎', '网页访问与信息检索'],
        'ffmpeg': ['音视频编解码器', '音视频转换与处理'],
        'pandoc': ['文档格式转换', 'Office 与 Markdown 互转'],
        'winldd': ['Windows 运行库', 'Windows 平台依赖组件'],
        'mingit': ['Git 工具', '插件市场与仓库同步']
      }
      return META[name] || [label, '']
    },
    formatSize(bytes) {
      if (!bytes) return '0 B'
      if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
      if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
      if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB'
      return bytes + ' B'
    },
    formatEta(sec) {
      if (sec >= 3600) return Math.floor(sec / 3600) + ' 小时 ' + Math.round((sec % 3600) / 60) + ' 分'
      if (sec >= 60) return Math.ceil(sec / 60) + ' 分钟'
      return sec + ' 秒'
    },
    // 进行中项的阶段权重：下载按百分比（上限 90%），校验 / 解压接近收尾
    itemWeight(c) {
      const p = c._phase || 'download'
      if (p === 'download') return Math.min(0.9, this.itemPercent(c) / 100)
      if (p === 'verify') return 0.93
      if (p === 'extract') return 0.97
      return 0
    },
    itemPercent(c) {
      if (!c.size || !c._received) return 0
      return Math.min(99, Math.floor(c._received / c.size * 100))
    },
    itemPctText(c) {
      const p = c._phase || 'download'
      if (p === 'verify') return '校验中'
      if (p === 'extract') return '装配中'
      return this.itemPercent(c) + '%'
    },
    stateText(state, skipped) {
      const map = { ok: '已就绪', pending: '等待中', error: '失败' }
      if (state === 'ok' && skipped) return '已就绪 · 跳过'
      return map[state] || state
    },
    // 快照通道：后台装配进度广播（主进程直推，含 ETA / 字节 / 逐项态）
    bindProgress() {
      const api = this.api
      if (!api || !api.onSetupProgress) return
      this.offProgress = api.onSetupProgress(s => {
        if (s && s.items) this.session = s
      })
    },
    // 进入时同步既有快照（HMR / 刷新场景后台装配已在跑）
    async syncSnapshot() {
      const api = this.api
      if (!api || !api.setupSnapshot) return
      try {
        const s = await api.setupSnapshot()
        if (s && s.items) {
          this.session = s
          // 会话进行中/已完成（刷新恢复）→ 停留在装配页
          if (this.step === 1 && s.state === 'installing') this.step = 2
        }
      } catch (e) { /* 快照失败不阻断 */ }
    },
    // 进入引导页自动检查：本地探测（setupStatus 秒回）拿必需/缺失清单
    async check() {
      const api = this.api
      this.checking = true
      this.checkError = ''
      if (!api || !api.setupStatus) {
        // 非 Electron 环境：视为就绪（守卫已拦，此处兜底防死锁）
        this.checking = false
        return
      }
      try {
        const st = await api.setupStatus()
        const required = (st && st.required) || []
        const missing = (st && st.missing) || []
        const missSet = {}
        missing.forEach(n => { missSet[n] = 1 })
        this.items = required.map(name => {
          const nice = this.niceMeta(name, name)
          return {
            name,
            label: nice[0],
            desc: nice[1],
            state: missSet[name] ? 'pending' : 'ok'
          }
        })
      } catch (e) {
        this.checkError = '环境检查异常'
      }
      this.checking = false
    },
    // 开始探索：触发主进程后台装配（串行逐组件，页面切走不中断）并进入进度页。
    // 不 await 装配完成——快照经 onSetupProgress 推回驱动本页 UI，用户可随时「先进入」
    async begin() {
      if (this.checkFailed) return this.check()
      if (!this.pendingItems.length) return this.enter()
      const api = this.api
      if (!api || !api.setupStartInstall) return this.enter()
      this.step = 2
      api.setupStartInstall().catch(() => {})
    },
    // 失败重试：重触发后台装配（主进程会重新检查缺失清单）
    retry() {
      this.begin()
    },
    // 完成 / 跳过 → 主视图：写放行标记 + 清守卫缓存，经 '/' 交由既有 redirect（entryView）。
    // 不 await IPC：标记写入与窗口恢复放后台，导航先行，避免「先进入」卡在装配页
    async enter() {
      if (this.leaving) return
      this.leaving = true // 离场：停两侧剧场 rAF + og-fade/blur 不再参与首屏合成
      const api = this.api
      if (api && api.setupComplete) {
        api.setupComplete().catch(() => {})
      }
      this.$router.setupNeeded = false
      this.$router.push('/')
    },
    // 离线逃生门：确认后写标记放行（装配仍在后台跑；设置页「运行时」+ 顶部横幅可续装）
    async skip() {
      const yes = await this.$confirm(
        '跳过装配后，代码执行、文档转换等能力暂不可用；可稍后在「设置 → 运行时」继续装配。',
        '稍后装配',
        { confirmButtonText: '仍要跳过', cancelButtonText: '返回装配', type: 'warning' }
      ).then(() => true).catch(() => false)
      if (!yes) return
      await this.enter()
    }
  }
}
</script>

<style lang="scss" scoped>
/* ===== 全屏引导壳：斜分能力视图铺底，内容层悬浮 ===== */
.og-shell {
  position: relative;
  width: 100vw;
  height: 100vh;
  overflow: hidden;
  background: var(--bg-color, #f5f6f8);
}

/* ===== 斜分 hero：左 Deck（品牌蓝）/ 右 Buddy（搭子绿），两半均铺满全屏 ===== */
.og-hero {
  position: absolute;
  inset: 0;
  overflow: hidden;
  transition: filter 0.4s ease, transform 0.5s ease;

  /* 装配 / 完成步：压暗退后聚焦前景面板 */
  .is-focus & {
    filter: saturate(0.55) brightness(1.06);
    transform: scale(1.04);
  }
}

/* 两半绝对定位铺满视口：clip-path 百分比相对全屏计算，斜缝精确衔接不留底色 */
.og-half {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.og-half-deck {
  background: linear-gradient(150deg, #1e4fd0 0%, #2f62e8 55%, #4a7df2 100%);
  clip-path: polygon(0 0, 57% 0, 45% 100%, 0 100%);
}

.og-half-buddy {
  background: linear-gradient(210deg, #5b3fd4 0%, #7452e8 55%, #9273f5 100%);
  clip-path: polygon(57% 0, 100% 0, 100% 100%, 45% 100%);
}

/* 每侧内容按视口百分比定位：deck 中心 30% / buddy 中心 70%，纵向 60% 偏下
   （顶部带留给欢迎区；两侧尽量贴近左右缘，中间欢迎区留足呼吸空间） */
.og-half-inner {
  position: absolute;
  top: 60%;
  width: 340px;
  padding: 0 24px;
  transform: translateY(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  color: #fff;
}

.og-half-deck .og-half-inner {
  left: 30%;
  margin-left: -170px;
}

.og-half-buddy .og-half-inner {
  left: 70%;
  margin-left: -170px;
}

/* 大徽章：磨砂白底 + 悬浮呼吸 */
.og-half-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 74px;
  height: 74px;
  margin-bottom: 14px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.18);
  backdrop-filter: blur(6px);
  box-shadow:
    inset 0 0 0 1px rgba(255, 255, 255, 0.35),
    0 16px 40px rgba(0, 0, 0, 0.18);
  animation: og-badge-float 5s ease-in-out infinite alternate;
}

.og-half-badge-icon {
  width: 38px;
  height: 38px;
  color: #fff;
}

@keyframes og-badge-float {
  from { transform: translateY(-5px); }
  to { transform: translateY(5px); }
}

.og-half-name {
  margin: 0;
  font-size: 27px;
  font-weight: 800;
  letter-spacing: 1px;
  text-shadow: 0 2px 12px rgba(0, 0, 0, 0.18);
}

.og-half-slogan {
  margin: 8px 0 0;
  font-size: 13px;
  opacity: 0.92;
  letter-spacing: 0.5px;
}

/* 能力标签：白磨砂胶囊，逐个错拍浮动 */
.og-chips {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 7px;
  margin-top: 18px;
}

.og-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 11.5px;
  font-weight: 600;
  /* 不用 backdrop-filter：24 颗胶囊逐帧重绘合成层是首帧卡顿主因之一 */
  background: rgba(255, 255, 255, 0.16);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.28);
  /* 负延迟：入场即在各自相位中段，无需等延迟逐颗「跳入」动画 */
  animation: og-chip-float 4s ease-in-out infinite alternate;
  will-change: transform;

  .svg-icon {
    width: 13px;
    height: 13px;
  }
}

@keyframes og-chip-float {
  from { transform: translateY(-3px); }
  to { transform: translateY(3px); }
}

/* ===== 顶部拖动条：可拖动 + Windows 窗控 ===== */
.og-dragbar {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  padding: 0 150px;
  -webkit-app-region: drag;
}

/* Windows 窗口控制（无边框自绘，贴右缘） */
.og-win {
  position: absolute;
  right: 0;
  top: 0;
  display: flex;
  align-items: stretch;
  height: 44px;
  -webkit-app-region: no-drag;
}

.og-win-btn {
  width: 44px;
  border: none;
  background: transparent;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.12s ease;

  &:hover { background: rgba(255, 255, 255, 0.18); }
}

.og-win-close:hover { background: #e5484d; }

.og-g-min {
  width: 10px;
  height: 1.5px;
  background: #fff;
}

.og-g-max {
  width: 9px;
  height: 9px;
  border: 1.5px solid #fff;
  border-top-width: 3px;

  &.restore {
    border-top-width: 1.5px;
    box-shadow: 2.5px -2.5px 0 -1.5px #fff, 2.5px -2.5px 0 0 #fff;
  }
}

.og-g-x {
  position: relative;
  width: 11px;
  height: 11px;

  &::before,
  &::after {
    content: '';
    position: absolute;
    left: 0;
    top: 5px;
    width: 11px;
    height: 1.5px;
    background: #fff;
  }

  &::before { transform: rotate(45deg); }
  &::after { transform: rotate(-45deg); }
}

/* ===== 第 1 步：欢迎与操作（顶部带：位于步骤指示器与两侧能力之间，不遮挡） ===== */
.og-welcome {
  position: absolute;
  left: 50%;
  top: 64px;
  transform: translateX(-50%);
  z-index: 5;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

/* logo：白底圆角承托 */
.og-logo {
  width: 56px;
  height: 56px;
  margin-bottom: 10px;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.og-h1 {
  margin: 0;
  font-size: 34px;
  font-weight: 800;
  letter-spacing: 1px;
  color: #fff;
  text-shadow: 0 2px 16px rgba(0, 0, 0, 0.2);
}

/* 检查状态行 */
.og-status {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  margin-top: 14px;
  min-height: 34px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.92);
}

.og-status-warn {
  padding: 6px 16px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.22);
}

.og-status-pill {
  padding: 7px 18px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  backdrop-filter: blur(8px);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.3);

  b {
    font-size: 16px;
    font-weight: 800;
    margin-right: 2px;
  }

  .svg-icon {
    width: 14px;
    height: 14px;
  }
}

.og-spinner {
  width: 15px;
  height: 15px;
  border: 2px solid rgba(255, 255, 255, 0.35);
  border-top-color: #fff;
  border-radius: 50%;
  animation: og-spin 0.8s linear infinite;
}

@keyframes og-spin {
  to { transform: rotate(360deg); }
}

/* 主按钮（原生 button）：白底主色字，扫光 + 箭头联动 hover 动效 */
.og-btn-main {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-width: 230px;
  height: 47px;
  padding: 0 28px;
  margin-top: 22px;
  font-size: 15px;
  font-weight: 700;
  border: none;
  border-radius: 999px;
  background: #fff;
  color: var(--primary-color, #3366ff);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  overflow: hidden;
  transition: transform 0.25s cubic-bezier(0.34, 1.4, 0.64, 1), box-shadow 0.25s ease;

  &:disabled {
    cursor: default;
    opacity: 0.85;
  }

  &:hover:not(:disabled) {
    transform: translateY(-2px) scale(1.02);
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.32);
  }

  &:active:not(:disabled) {
    transform: translateY(0) scale(0.99);
  }
}

/* 扫光层：默认藏于左侧，hover 时横掠而过 */
.og-btn-shine {
  position: absolute;
  top: 0;
  left: -70%;
  width: 45%;
  height: 100%;
  background: linear-gradient(105deg, transparent, rgba(var(--primary-color-rgb, 51, 102, 255), 0.16) 45%, rgba(var(--primary-color-rgb, 51, 102, 255), 0.3) 50%, rgba(var(--primary-color-rgb, 51, 102, 255), 0.16) 55%, transparent);
  transform: skewX(-18deg);
  pointer-events: none;
}

.og-btn-main:hover:not(:disabled) .og-btn-shine {
  animation: og-btn-sweep 0.9s ease;
}

@keyframes og-btn-sweep {
  from { left: -70%; }
  to { left: 130%; }
}

/* 箭头：hover 右移轻弹，承载「探索出发」的方向感 */
.og-btn-arrow {
  width: 15px;
  height: 15px;
  transition: transform 0.28s cubic-bezier(0.34, 1.5, 0.64, 1);
}

.og-btn-main:hover:not(:disabled) .og-btn-arrow {
  animation: og-arrow-nudge 0.55s ease;
}

@keyframes og-arrow-nudge {
  0%, 100% { transform: translateX(0); }
  40% { transform: translateX(5px); }
  60% { transform: translateX(3px); }
}

/* 深色面板上的主按钮（失败重试 / 完成进入）：主色底白字，扫光反白 */
.og-actions .og-btn-main {
  background: var(--primary-color, #3366ff);
  color: #fff;

  .og-btn-shine {
    background: linear-gradient(105deg, transparent, rgba(255, 255, 255, 0.18) 45%, rgba(255, 255, 255, 0.38) 50%, rgba(255, 255, 255, 0.18) 55%, transparent);
  }
}

/* 「先进入 OmniDeck」：纯文字 + 箭头链接（次级路径，不做按钮样式） */
.og-enter-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--primary-color);
  cursor: pointer;
}

.og-enter-link-icon {
  width: 13px;
  height: 13px;
}

.og-skip {
  margin-top: 14px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.85);
  opacity: 0.8;
  cursor: pointer;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.2);

  &:hover { opacity: 1; text-decoration: underline; }
}

/* ===== 第 2 步：整页视图（两侧梯形舞台 + 中栏内容，互联网产品 hero 感） ===== */
.og-page {
  position: absolute;
  inset: 44px 0 0 0; /* 顶部留拖动条 */
  z-index: 5;
  display: flex;
  flex-direction: row;
  align-items: stretch;
  justify-content: center;
  gap: 18px;
  padding: 30px 24px 26px;
  overflow: hidden;
  background:
    radial-gradient(1200px 500px at 18% -8%, rgba(116, 82, 232, 0.07), transparent 60%),
    radial-gradient(1100px 480px at 84% 110%, rgba(47, 98, 232, 0.08), transparent 60%),
    rgba(245, 246, 248, 0.9);
  /* 降 blur：整页 backdrop-filter 离场重采样是切页卡顿主因之一，
     视觉上 hero 已压暗，12px 与 20px 差异细微 */
  backdrop-filter: blur(12px) saturate(1.05);
  text-align: center;
}

.og-page > * {
  flex-shrink: 0;
}

/* 两侧梯形舞台：斜切渐变衬底（::before 承载 clip-path，canvas 白卡浮于其上不被裁切） */
.og-stage {
  position: relative;
  width: min(300px, 25vw);
  align-self: center;
  height: min(430px, 100%);
  padding: 0 10px 14px; /* canvas 自带 44px 顶部让位斜边，CSS 侧不再叠加 */
}

.og-stage::before {
  content: '';
  position: absolute;
  inset: 0;
  z-index: 0;
  filter: drop-shadow(0 18px 34px rgba(30, 41, 59, 0.16));
}

/* 左舞台（Buddy）：右上斜切，渐变从顶部展开 */
.og-stage-l::before {
  background: linear-gradient(150deg, rgba(116, 82, 232, 0.18), rgba(116, 82, 232, 0.04) 70%);
  clip-path: polygon(0 0, 100% 10%, 100% 90%, 0 100%);
}

/* 右舞台（Deck）：镜像斜切 */
.og-stage-r::before {
  background: linear-gradient(210deg, rgba(47, 98, 232, 0.18), rgba(47, 98, 232, 0.04) 70%);
  clip-path: polygon(0 10%, 100% 0, 100% 100%, 0 90%);
}

.og-stage .theater-cv {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
}

/* 中栏：进度 + 清单（720px 内容柱，可纵向滚动） */
.og-mid {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 0 1 720px;
  min-width: 0;
  /* 清单不限高常态无滚动；极小窗口高度时仅中栏兜底滚动，整页稳定 */
  min-height: 0;
  overflow-y: auto;
  padding: 6px 2px;
}

.og-mid > .og-h2,
.og-mid > .og-sub-s,
.og-mid > .og-progress-hero,
.og-mid > .og-list,
.og-mid > .og-note,
.og-mid > .og-actions {
  width: min(720px, 100%);
}

/* 窄窗时舞台退场（中栏独占整页） */
@media (max-width: 980px) {
  .og-page { flex-direction: column; align-items: center; overflow-y: auto; }
  .og-stage { display: none; }
  .og-mid { overflow: visible; flex-basis: auto; }
}

.og-h2 {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: $text-primary;
}

.og-sub-s {
  margin: 10px 0 0;
  font-size: 12.5px;
  color: $text-secondary;
}

/* 整体进度 */
.og-progress-hero {
  width: 100%;
  margin-top: 28px;
}

.og-progress-num {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 10px;
}

.og-pct {
  font-size: 44px;
  font-weight: 800;
  line-height: 1;
  color: var(--primary-color);
  font-variant-numeric: tabular-nums;

  i {
    font-style: normal;
    font-size: 20px;
    font-weight: 700;
    margin-left: 2px;
    opacity: 0.7;
  }
}

.og-progress-meta {
  min-width: 0;
  font-size: 12.5px;
  font-weight: 600;
  color: $text-primary;
  text-align: right;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.og-progress-track {
  height: 10px;
  border-radius: 5px;
  background: rgba(var(--primary-color-rgb), 0.12);
  overflow: hidden;

  &.failed {
    background: rgba(245, 108, 108, 0.14);
  }
}

.og-progress-fill {
  height: 100%;
  border-radius: 5px;
  background: linear-gradient(90deg, var(--primary-color), rgba(var(--primary-color-rgb), 0.75));
  box-shadow: 0 0 14px rgba(var(--primary-color-rgb), 0.4);
  transition: width 0.35s ease;
}

.og-progress-bytes {
  margin-top: 8px;
  text-align: right;
  font-size: 11px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: $text-secondary;
  opacity: 0.8;
}

/* 组件清单 */
.og-list {
  width: 100%;
  margin-top: 16px;
  border-radius: 14px;
  background: rgba(0, 0, 0, 0.025);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.05);
  /* 不限高不出滚动条：靠紧凑行距 + 页高容纳全部 8 项 */
}

.og-item {
  padding: 6px 16px;
  text-align: left;
  transition: background 0.15s ease;

  & + & {
    border-top: 1px solid rgba(0, 0, 0, 0.045);
  }

  &.is-installing {
    background: rgba(var(--primary-color-rgb), 0.05);
  }

  &.is-error {
    background: rgba(245, 108, 108, 0.05);
  }
}

.og-item-mark {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  font-size: 12px;
  color: #46a87f;
}

.og-item-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.16);
}

.og-item-x {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #f56c6c;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.og-mini-ring {
  width: 14px;
  height: 14px;
  border: 2px solid rgba(var(--primary-color-rgb), 0.2);
  border-top-color: var(--primary-color);
  border-radius: 50%;
  animation: og-spin 0.8s linear infinite;
}

/* 行一：图标 + 组件名 + 状态（单行） */
.og-item-top {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 26px;
}

/* 行二：完整描述（不再截断省略，可自然折行） */
.og-item-desc {
  padding-left: 30px; /* 与组件名对齐（图标 20 + gap 10） */
  font-size: 11.5px;
  line-height: 1.45;
  color: $text-secondary;
  word-break: break-all;
}

.og-item-label {
  flex-shrink: 0;
  max-width: 220px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.og-item-pct {
  flex-shrink: 0;
  min-width: 42px;
  text-align: right;
  font-size: 11px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-weight: 600;
  color: var(--primary-color);
}

.og-item-state {
  flex-shrink: 0;
  font-size: 11px;
  color: $text-secondary;
  opacity: 0.85;
}

.og-item.is-ok .og-item-state {
  color: #2e8b63;
  opacity: 1;
}

/* 已就绪跳过项：整行弱化（半透明），与本次实装项区分 */
.og-item.is-skipped {
  opacity: 0.62;

  .og-item-state {
    color: $text-secondary;
    font-weight: 500;
  }
}

.og-item.is-error .og-item-state {
  color: #c45656;
  opacity: 1;
}

/* 失败详情 */
.og-note {
  width: 100%;
  margin-top: 14px;
  padding: 10px 14px;
  border-radius: 10px;
  font-size: 12px;
  line-height: 1.7;
  text-align: left;
}

.og-note-warn {
  background: rgba(230, 162, 60, 0.1);
  color: #a06a1b;
}

.og-waiting {
  font-size: 12px;
  color: $text-secondary;
  opacity: 0.75;
}

.og-actions {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  margin-top: 26px;

  .og-skip {
    color: $text-secondary;
    text-shadow: none;
  }
}


/* ===== 步骤切换过渡 ===== */
.og-fade-enter-active,
.og-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}

.og-page.og-fade-enter-from {
  opacity: 0;
  transform: translateY(16px);
}

.og-welcome.og-fade-enter-from {
  opacity: 0;
  transform: translateX(-50%) translateY(12px);
}

.og-fade-leave-to {
  opacity: 0;
}

.og-welcome.og-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-8px);
}
</style>
