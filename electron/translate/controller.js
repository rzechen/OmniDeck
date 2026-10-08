// 浏览器容器特性：双语对照翻译（状态 + IPC + 页面加载后注入）
// 经 windows/browser.js 的 registerFeature 挂载；页面注入脚本见 translate/inject.js，
// 走 od-tr:* 命名空间通道（browser/view-preload 通用桥 odBridge）
// UI 侧通道名沿用 browser:translate / browser:set-engine（deck/browser 页面零改动）
const { translateBatch, TARGET_LANGS } = require('./engines')
const { INJECT_SCRIPT } = require('./inject')

// 翻译配置（内存态；引擎/目标语言/供应商选择由页面持久化，每次进页回灌）
const cfg = { engine: 'google', target: 'zh-CN', enabled: false, provider: null }
// 页面源语言检测结果（Google 引擎回传；{ code, name }）
let detectedLang = { code: '', name: '' }
// 上次引擎级错误（页面提示"切换引擎"用，读到即清）
let lastEngineError = ''

// 容器上下文（init 注入）：{ getWindow, ensureView, isPageSender, sendToPage, executeInPage, pushState }
let ctx = null

// ===== 内部辅助 =====
function sendCmd(msg) {
  ctx.sendToPage('od-tr:command', msg)
}

async function injectController() {
  await ctx.executeInPage(INJECT_SCRIPT)
  if (cfg.enabled) sendCmd({ type: 'enable' })
}

// 翻译状态字段（并入容器 browser:state 下发；consume=true 时读取即清 engineError）
function stateFields(consume) {
  const fields = {
    engine: cfg.engine,
    target: cfg.target,
    targetName: TARGET_LANGS[cfg.target] || cfg.target,
    detected: detectedLang.code || '',
    detectedName: detectedLang.name || '',
    enabled: cfg.enabled,
    engineError: lastEngineError
  }
  if (consume) lastEngineError = ''
  return fields
}

module.exports = {
  // 特性名（registerFeature 注册去重标识）
  name: 'translate',

  // 容器上下文注入（sendToPage / executeInPage 等）
  init(context) { ctx = context },

  // handlers: [channel, fn, type?]，type='on' 时用 ipcMain.on（纯上报通道）
  handlers: [
    // 开：注入并启用；关：下发 disable 移除全部译文
    ['browser:translate', (_e, enabled) => {
      cfg.enabled = !!enabled
      if (cfg.enabled) {
        ctx.ensureView()
        injectController().then(() => ctx.pushState())
      } else {
        sendCmd({ type: 'disable' })
      }
      ctx.pushState()
      return { ok: true }
    }],
    // opts: { engine: 'google'|'llm', target, provider: { baseUrl, apiKey, model } }
    // target 变更且翻译开启中：切换后自动按新语言重译当前页面
    ['browser:set-engine', (_e, opts) => {
      if (!opts) return { ok: false }
      if (opts.engine === 'llm' || opts.engine === 'google') cfg.engine = opts.engine
      if (opts.provider) cfg.provider = opts.provider
      let targetChanged = false
      if (opts.target && TARGET_LANGS[opts.target] && opts.target !== cfg.target) {
        cfg.target = opts.target
        detectedLang = { code: '', name: '' }
        targetChanged = true
      }
      if (targetChanged && cfg.enabled) {
        // 关→开 循环触发注入脚本重收集重翻译
        sendCmd({ type: 'disable' })
        injectController().then(() => ctx.pushState())
      }
      ctx.pushState()
      return { ok: true }
    }],
    // 注入脚本回环：批量翻译（仅接受本容器页面的请求）
    ['od-tr:translate', (e, texts) => {
      if (!ctx.isPageSender(e) || !Array.isArray(texts)) {
        return Promise.resolve({ translations: [] })
      }
      return translateBatch(texts, { engine: cfg.engine, target: cfg.target, provider: cfg.provider })
        .then(res => {
          // Google 引擎回传检测语言，透传给注入脚本/页面展示
          if (res && res.detected && res.detected !== detectedLang.code) {
            detectedLang = { code: res.detected, name: res.detectedName || res.detected }
            ctx.pushState()
          }
          return { translations: res ? res.translations : [] }
        })
        .catch(err => {
          lastEngineError = String((err && err.message) || err)
          // 引擎级故障回推，页面提示切换引擎
          const w = ctx.getWindow()
          if (w) w.webContents.send('browser:progress', { error: lastEngineError })
          return { translations: texts.map(() => '') }
        })
    }],
    // 注入脚本进度上报 → 转发到 /browser 页面
    ['od-tr:report', (e, stats) => {
      if (!ctx.isPageSender(e)) return
      const w = ctx.getWindow()
      if (w) w.webContents.send('browser:progress', stats || {})
    }, 'on']
  ],

  // 页面加载完成（含站内跳转/刷新）：注入翻译 controller
  onLoaded() {
    return injectController()
  },

  // 主帧加载失败：清错误并让注入脚本移除全部译文
  onFailLoad() {
    lastEngineError = ''
    sendCmd({ type: 'disable' })
  },

  // 翻译状态字段并入容器 browser:state 回推
  extendState(consume) {
    return stateFields(consume)
  }
}
