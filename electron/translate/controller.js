// 浏览器容器特性：划词翻译（常开；状态 + IPC + 页面加载后注入）
// 经 windows/browser.js 的 registerFeature 挂载；页面注入脚本见 translate/inject.js，
// 走 od-tr:* 命名空间通道（browser/view-preload 通用桥 odBridge）
// UI 侧通道名沿用 browser:set-engine（deck/browser 页面配置语言对/引擎）
const { translateBatch, TARGET_LANGS } = require('./engines')
const { INJECT_SCRIPT } = require('./inject')

// 翻译配置（内存态；引擎/源语言/目标语言/供应商选择由页面持久化，每次进页回灌）
// theme：应用主题色（页面下发，划词动作条/面板品牌化用，与网站自身 UI 区分）
const cfg = { engine: 'google', source: 'auto', target: 'zh-CN', provider: null, theme: '#3366FF' }
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
  // 仅在 http(s) 页面注入：about:blank 占位、chrome-error 错误页等特殊页面
  // 无 preload 桥（odBridge）且执行环境受限，注入必失败（"Script failed to execute"）
  const url = ctx.getUrl ? ctx.getUrl() : ''
  if (!/^https?:/i.test(url)) return
  const ok = await ctx.executeInPage(INJECT_SCRIPT)
  // 注入链路日志：配合「划选无动作条」类问题的定位（成功/失败一目了然）
  console.log('[od:browser] 划词脚本注入' + (ok === null ? '失败' : '成功') + '：' + url)
  // 常开：注入即下发语言对（脚本已 boot 时仅更新语言对，幂等）
  sendCmd(enableCmd())
  // 页面状态探测（诊断注入后实际状态）：bridge=odBridge 桥 / tr=划词脚本已 boot
  setTimeout(async () => {
    const probe = await ctx.executeInPage(
      '(function(){try{return JSON.stringify({bridge:!!window.odBridge,tr:!!window.__odTr,' +
      'body:!!document.body})}catch(e){return "probe-error:"+e.message}})()')
    console.log('[od:browser] 页面状态探测：', probe)
  }, 1200)
}

// enable 命令：携带当前语言对与主题色（划词面板展示"自动 → zh-CN"、品牌化用）
function enableCmd() {
  return { type: 'enable', source: cfg.source, target: cfg.target, theme: cfg.theme }
}

// 翻译状态字段（并入容器 browser:state 下发；consume=true 时读取即清 engineError）
function stateFields(consume) {
  const fields = {
    engine: cfg.engine,
    source: cfg.source,
    target: cfg.target,
    targetName: TARGET_LANGS[cfg.target] || cfg.target,
    detected: detectedLang.code || '',
    detectedName: detectedLang.name || '',
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
    // opts: { engine: 'google'|'bing'|'llm', source, target, provider: { baseUrl, apiKey, model, apiFormat } }
    // 引擎/语言变更：重发 enable 让页面脚本更新面板语言对展示（划词按需翻译，无需重译）
    ['browser:set-engine', (_e, opts) => {
      if (!opts) return { ok: false }
      let configChanged = false
      if ((opts.engine === 'llm' || opts.engine === 'google' || opts.engine === 'bing') && opts.engine !== cfg.engine) {
        cfg.engine = opts.engine
        configChanged = true
      }
      if (opts.provider) cfg.provider = opts.provider
      // 应用主题色（hex 校验）：划词 UI 品牌化，与应用当前主题一致
      if (opts.theme && /^#[0-9a-fA-F]{6}$/.test(opts.theme) && opts.theme !== cfg.theme) {
        cfg.theme = opts.theme
        configChanged = true
      }
      if (opts.source && (opts.source === 'auto' || TARGET_LANGS[opts.source]) && opts.source !== cfg.source) {
        cfg.source = opts.source
        detectedLang = { code: '', name: '' }
        configChanged = true
      }
      if (opts.target && TARGET_LANGS[opts.target] && opts.target !== cfg.target) {
        cfg.target = opts.target
        detectedLang = { code: '', name: '' }
        configChanged = true
      }
      if (configChanged) sendCmd(enableCmd())
      ctx.pushState()
      return { ok: true }
    }],
    // UI 手动翻译（翻译面板自输入区）：与划词共用当前 cfg 引擎/语言对
    // 返回 { translations: [译文], detected, source, target, engine } 或 { error }
    ['browser:translate-text', (_e, text) => {
      const t = String(text || '').trim().slice(0, 3000)
      if (!t) return Promise.resolve({ translations: [] })
      return translateBatch([t], {
        engine: cfg.engine,
        source: cfg.source,
        target: cfg.target,
        provider: cfg.provider
      })
        .then(res => {
          if (res && res.detected && res.detected !== detectedLang.code) {
            detectedLang = { code: res.detected, name: res.detectedName || res.detected }
            ctx.pushState()
          }
          return {
            translations: res ? res.translations : [],
            detected: (res && res.detected) || '',
            source: cfg.source,
            target: cfg.target,
            engine: cfg.engine
          }
        })
        .catch(err => {
          lastEngineError = String((err && err.message) || err)
          return { error: lastEngineError, translations: [] }
        })
    }],
    // 插入译文到网页当前聚焦输入框（翻译面板手动翻译区）：转发命令至页面注入脚本
    ['browser:insert-text', (_e, text) => {
      sendCmd({ type: 'tr-insert', text: String(text || '').slice(0, 3000) })
      return { ok: true }
    }],
    // 注入脚本回环：划词翻译（仅接受本容器页面的请求）
    // 入参 { texts, token }：token 为页面请求代际，随流式增量回传（旧请求增量由页面丢弃）；
    // LLM 单段流式：onDelta 增量经 tr-delta 命令实时下发，页面打字机呈现
    ['od-tr:translate', (e, payload) => {
      const texts = payload && Array.isArray(payload.texts) ? payload.texts : payload
      const token = (payload && payload.token) || 0
      if (!ctx.isPageSender(e) || !Array.isArray(texts)) {
        return Promise.resolve({ translations: [] })
      }
      return translateBatch(texts, {
        engine: cfg.engine,
        source: cfg.source,
        target: cfg.target,
        provider: cfg.provider,
        onDelta: full => sendCmd({ type: 'tr-delta', text: full, token })
      })
        .then(res => {
          // Google/必应引擎回传检测语言，透传给划词面板展示（如 en → zh-CN）
          if (res && res.detected && res.detected !== detectedLang.code) {
            detectedLang = { code: res.detected, name: res.detectedName || res.detected }
            ctx.pushState()
          }
          return { translations: res ? res.translations : [], detected: (res && res.detected) || '' }
        })
        .catch(err => {
          lastEngineError = String((err && err.message) || err)
          // 引擎级故障回推，页面提示切换引擎
          const w = ctx.getWindow()
          if (w) w.webContents.send('browser:progress', { error: lastEngineError })
          return { translations: texts.map(() => '') }
        })
    }],
    // 注入脚本就绪上报 → 转发到 /browser 页面
    // 注意：odBridge.invoke 走 invoke/handle 协议，必须 handle 注册
    // （此前误用 'on' 监听导致 "No handler registered" 报错）
    ['od-tr:report', (e, stats) => {
      if (!ctx.isPageSender(e)) return { ok: false }
      // 脚本就绪兜底：脚本可能因 odBridge 未就绪延迟启动，期间早到的语言对
      // 命令会丢失，就绪即补发（幂等）
      if (stats && stats.ready) sendCmd(enableCmd())
      const w = ctx.getWindow()
      if (w) w.webContents.send('browser:progress', stats || {})
      return { ok: true }
    }],
    // 页面内操作反馈（复制等）→ 转发主窗口用全局 $message 呈现（与其他页面一致）
    ['od-tr:toast', (e, text) => {
      if (!ctx.isPageSender(e) || !text) return { ok: false }
      const w = ctx.getWindow()
      if (w) w.webContents.send('browser:progress', { toast: String(text) })
      return { ok: true }
    }],
    // 划词翻译成功上报 → 主进程补全语言对/引擎/来源 URL 后转推浏览器页
    // 写入翻译历史（IndexedDB 持久化，工作台「翻译历史」面板呈现）
    ['od-tr:log', (e, rec) => {
      if (!ctx.isPageSender(e) || !rec || !rec.text || !rec.trans) return { ok: false }
      let url = ''
      try { url = ctx.getUrl ? ctx.getUrl() : '' } catch (err) { /* 忽略 */ }
      let host = ''
      try { host = url ? new URL(url).host : '' } catch (err) { /* 忽略 */ }
      const w = ctx.getWindow()
      if (w) {
        w.webContents.send('browser:progress', {
          transHistory: {
            text: String(rec.text).slice(0, 3000),
            trans: String(rec.trans).slice(0, 3000),
            source: cfg.source,
            target: cfg.target,
            engine: cfg.engine,
            url,
            host,
            time: Date.now()
          }
        })
      }
      return { ok: true }
    }]
  ],

  // 页面加载完成（含站内跳转/刷新）：注入划词脚本（常开）
  onLoaded() {
    return injectController()
  },

  // 主帧加载失败：清引擎错误态
  onFailLoad() {
    lastEngineError = ''
  },

  // 翻译状态字段并入容器 browser:state 回推
  extendState(consume) {
    return stateFields(consume)
  }
}
