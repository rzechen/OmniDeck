// 翻译引擎层：供翻译浏览器（WebContentsView 注入脚本）调用
// 三引擎：google（免费 gtx）/ bing（Edge 公共接口）/ llm（OpenAI/Anthropic 兼容）
// 设计：纯函数无状态，引擎选择与 provider 配置由调用方（browser.js）注入

const { net } = require('electron')
const { buildDirectRequest } = require('../agent/core/direct-llm')

// 主进程网络统一走 Chromium 网络栈（net.fetch）：遵循系统代理与系统证书，
// 与浏览器可达性一致（Node fetch 不走代理，代理环境下微软/谷歌端点直连失败）；
// 旧环境无 net.fetch 时回退全局 fetch
const pfetch = (net && typeof net.fetch === 'function') ? net.fetch : fetch

// 浏览器 UA（微软/谷歌公共端点对非浏览器 UA 拒绝或降级）
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'

// ===== Google 免费翻译（translate_a/single gtx 端点，非官方） =====

const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

// 支持的语言（页面原语言/目标语言下拉用，参考百度翻译完整语种表）：代码 → 名称
const TARGET_LANGS = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  pt: '葡萄牙语',
  it: '意大利语',
  ru: '俄语',
  ar: '阿拉伯语',
  th: '泰语',
  vi: '越南语',
  id: '印尼语',
  ms: '马来语',
  hi: '印地语',
  tr: '土耳其语',
  nl: '荷兰语',
  pl: '波兰语',
  sv: '瑞典语',
  no: '挪威语',
  da: '丹麦语',
  fi: '芬兰语',
  cs: '捷克语',
  ro: '罗马尼亚语',
  hu: '匈牙利语',
  el: '希腊语',
  he: '希伯来语',
  uk: '乌克兰语',
  bg: '保加利亚语',
  sr: '塞尔维亚语',
  hr: '克罗地亚语',
  sk: '斯洛伐克语',
  sl: '斯洛文尼亚语',
  lt: '立陶宛语',
  lv: '拉脱维亚语',
  et: '爱沙尼亚语',
  fa: '波斯语',
  bn: '孟加拉语',
  ur: '乌尔都语',
  ta: '泰米尔语',
  te: '泰卢固语',
  mr: '马拉地语',
  my: '缅甸语',
  km: '高棉语',
  lo: '老挝语',
  mn: '蒙古语',
  ne: '尼泊尔语',
  si: '僧伽罗语',
  ka: '格鲁吉亚语',
  hy: '亚美尼亚语',
  az: '阿塞拜疆语',
  kk: '哈萨克语',
  uz: '乌兹别克语',
  af: '南非荷兰语',
  sw: '斯瓦希里语',
  ca: '加泰罗尼亚语',
  ga: '爱尔兰语',
  cy: '威尔士语',
  is: '冰岛语',
  mk: '马其顿语',
  sq: '阿尔巴尼亚语',
  bs: '波斯尼亚语',
  be: '白俄罗斯语',
  fil: '菲律宾语',
  haw: '夏威夷语',
  la: '拉丁语',
  eo: '世界语',
  yi: '意第绪语',
  ht: '海地克里奥尔语'
}

// Google 检测语言代码 → 中文名（状态栏展示用；未覆盖代码回退 TARGET_LANGS / 大写展示）
const DETECT_NAMES = {
  en: '英语', ja: '日语', ko: '韩语', fr: '法语', de: '德语', es: '西班牙语',
  ru: '俄语', pt: '葡萄牙语', it: '意大利语', ar: '阿拉伯语', th: '泰语',
  vi: '越南语', id: '印尼语', hi: '印地语', nl: '荷兰语', pl: '波兰语',
  tr: '土耳其语', sv: '瑞典语', 'zh-CN': '中文', 'zh-TW': '中文（繁体）'
}

// 目标语言代码 → LLM prompt 语言名（LLM 对英文代码识别不稳定，统一用语言名；
// 未收录代码直接使用 TARGET_LANGS 的中文名）
const LLM_LANG_NAMES = {
  'zh-CN': '简体中文', 'zh-TW': '繁体中文', en: '英语', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语', pt: '葡萄牙语', it: '意大利语'
}

function detectName(code) {
  if (!code) return ''
  return DETECT_NAMES[code] || TARGET_LANGS[code] || String(code).toUpperCase()
}

// 单条翻译：GET 返回 [[[译段, 原段, ...], ...], null, 检测语言, ...]
// source 非空时作为 sl 源语言传入（'auto' 为自动检测）
async function googleOne(text, target, source, signal) {
  const sl = source || 'auto'
  const url = GOOGLE_ENDPOINT +
    '?client=gtx&sl=' + encodeURIComponent(sl) + '&dt=t&tl=' + encodeURIComponent(target) +
    '&q=' + encodeURIComponent(text)
  const res = await pfetch(url, {
    signal,
    headers: { 'User-Agent': BROWSER_UA }
  })
  if (!res.ok) throw new Error('Google 翻译服务返回 ' + res.status)
  const data = await res.json()
  if (!data || !Array.isArray(data[0])) throw new Error('Google 翻译返回格式异常')
  return {
    text: data[0].map(seg => (seg && seg[0]) || '').join(''),
    detected: data[2] || ''
  }
}

// 并发池：限制同时进行的 Promise 数量
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i], i)
    }
  })
  await Promise.all(workers)
  return out
}

async function translateWithGoogle(texts, opts) {
  const target = opts.target || 'zh-CN'
  const source = opts.source || 'auto'
  const timeout = AbortSignal.timeout(15000)
  let detected = ''
  let firstErr = ''
  // 单条一个请求（接口本身单 q 语义，避免分隔符歧义），并发 6
  const results = await mapLimit(texts, 6, async text => {
    try {
      const r = await googleOne(text, target, source, timeout)
      if (r.detected && !detected) detected = r.detected
      return r.text
    } catch (e) {
      // 单条失败返回空串（页面显示原文），整体不中断；记录首个错误供诊断
      if (!firstErr) firstErr = String((e && e.message) || e)
      if (process.env.OMNIDECK_DEBUG) console.warn('[od:translate] google single fail:', e.message)
      return ''
    }
  })
  // 至少一条成功才算引擎可用（否则视为引擎故障，上层提示切换）
  const ok = results.some(t => t)
  if (!ok) throw new Error('Google 翻译请求失败：' + (firstErr || '未知错误'))
  return { translations: results, detected, detectedName: detectName(detected) }
}

// ===== 必应翻译（Edge 公共鉴权接口，免密钥，国内可达） =====

const BING_AUTH = 'https://edge.microsoft.com/translate/auth'
const BING_API = 'https://api.cognitive.microsofttranslator.com/translate?api-version=3.0'
// 语言代码映射（Bing 用 zh-Hans / zh-Hant 表示中文简繁）
const BING_LANG_MAP = { 'zh-CN': 'zh-Hans', 'zh-TW': 'zh-Hant' }
const BING_LANG_BACK = { 'zh-Hans': 'zh-CN', 'zh-Hant': 'zh-TW' }
// token 缓存（JWT 有效期约 10 分钟，提前 2 分钟过期）
let bingToken = ''
let bingTokenAt = 0

async function bingAuth(force) {
  const now = Date.now()
  if (!force && bingToken && now - bingTokenAt < 8 * 60 * 1000) return bingToken
  const res = await pfetch(BING_AUTH, {
    signal: AbortSignal.timeout(10000),
    headers: { 'User-Agent': BROWSER_UA }
  })
  if (!res.ok) throw new Error('必应翻译鉴权失败（' + res.status + '）')
  bingToken = await res.text()
  bingTokenAt = now
  return bingToken
}

// 单块翻译：POST [{Text}]，返回数组；401 时强刷 token 重试一次
async function bingChunk(chunk, from, to, signal) {
  const url = BING_API + (from ? '&from=' + encodeURIComponent(from) : '') + '&to=' + encodeURIComponent(to)
  const body = JSON.stringify(chunk.map(t => ({ Text: t })))
  const headers = {
    Authorization: 'Bearer ' + await bingAuth(),
    'Content-Type': 'application/json',
    'User-Agent': BROWSER_UA
  }
  let res = await pfetch(url, { method: 'POST', signal, headers, body })
  if (res.status === 401) {
    headers.Authorization = 'Bearer ' + await bingAuth(true)
    res = await pfetch(url, { method: 'POST', signal, headers, body })
  }
  if (!res.ok) throw new Error('必应翻译服务返回 ' + res.status)
  const data = await res.json()
  if (!Array.isArray(data)) throw new Error('必应翻译返回格式异常')
  return data
}

async function translateWithBing(texts, opts) {
  const to = BING_LANG_MAP[opts.target] || opts.target || 'zh-Hans'
  const from = opts.source && opts.source !== 'auto' ? (BING_LANG_MAP[opts.source] || opts.source) : ''
  const timeout = AbortSignal.timeout(15000)
  // 分块（控制单请求体积）+ 并发 3
  const chunks = []
  for (let i = 0; i < texts.length; i += 200) chunks.push(texts.slice(i, i + 200))
  let detected = ''
  let firstErr = ''
  const results = await mapLimit(chunks, 3, async chunk => {
    try {
      const data = await bingChunk(chunk, from, to, timeout)
      const dl = data[0] && data[0].detectedLanguage && data[0].detectedLanguage.language
      if (dl && !detected) detected = dl
      return data.map(x => (x && x.translations && x.translations[0] && x.translations[0].text) || '')
    } catch (e) {
      // 记录首个错误：全部失败时透出真实原因（HTTP 状态/网络错误），不再笼统
      if (!firstErr) firstErr = String((e && e.message) || e)
      if (process.env.OMNIDECK_DEBUG) console.warn('[od:translate] bing chunk fail:', e.message)
      return chunk.map(() => '')
    }
  })
  const flat = results.flat()
  const ok = flat.some(t => t)
  if (!ok) throw new Error('必应翻译请求失败：' + (firstErr || '未知错误'))
  const det = BING_LANG_BACK[detected] || detected
  return { translations: flat, detected: det, detectedName: detectName(det) }
}

// ===== LLM 翻译（OpenAI 兼容接口，provider 由前端传入） =====

// 剥掉可能的代码块围栏，提取 JSON 数组
function extractJsonArray(raw) {
  let s = String(raw).trim()
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fence) s = fence[1].trim()
  const start = s.indexOf('[')
  const end = s.lastIndexOf(']')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    const arr = JSON.parse(s.slice(start, end + 1))
    return Array.isArray(arr) ? arr : null
  } catch (e) {
    return null
  }
}

// Promise 超时包装（落选方 rejection 由 race 处理，无 unhandled 泄漏）
function withTimeout(p, ms, msg) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(msg)), ms)
  })
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer))
}

async function translateWithLLM(texts, opts) {
  const target = opts.target || 'zh-CN'
  const provider = opts.provider || {}
  if (!provider.baseUrl || !provider.model) {
    throw new Error('未配置模型服务，请先在 Buddy「模型管理」中添加供应商')
  }
  const lang = LLM_LANG_NAMES[target] || TARGET_LANGS[target] || target
  const single = texts.length === 1
  // 划词单段：直译 prompt（流式 delta 即译文本身，打字机呈现）；
  // 多段：JSON 数组协议（批处理一次性返回）
  const systemParts = single
    ? [
        '你是专业的翻译引擎。把用户给的文本翻译成' + lang + '，要求：忠实原意、符合' + lang + '的表达习惯、专业术语准确。',
        '直接输出译文文本：不要解释、不要注释、不要引号、不要代码块围栏；保留原文中的专有名词、代码、URL。'
      ]
    : [
        '你是专业的网页翻译引擎。用户会给你一个 JSON 字符串数组，每个元素是一段网页文本。',
        '把每段文本翻译成' + lang + '，要求：忠实原意、符合' + lang + '的表达习惯、专业术语准确；',
        '不要添加任何解释或注释；保留原文中的专有名词、代码、URL。',
        '输出严格的 JSON 字符串数组：长度与输入完全一致，第 i 个元素是第 i 段的译文，不要输出代码块围栏。'
      ]
  if (opts.source && opts.source !== 'auto') {
    const src = LLM_LANG_NAMES[opts.source] || TARGET_LANGS[opts.source] || opts.source
    systemParts.splice(1, 0, '原文语言为' + src + '。')
  }
  const userContent = single ? texts[0] : JSON.stringify(texts)
  // 复用 Buddy 直调链路（direct-llm.buildDirectRequest）：按供应商 apiFormat
  // 适配端点与协议（anthropic /v1/messages、openai /chat/completions、responses）；
  // 120s 超时兜底
  const req = buildDirectRequest(provider, [
    { role: 'system', content: systemParts.join('') },
    { role: 'user', content: userContent }
  ], 4096)
  // 单段且有增量回调：开流式（SSE），delta 实时回传打字机效果
  const wantStream = single && typeof opts.onDelta === 'function'
  if (wantStream) {
    try {
      const body = JSON.parse(req.init.body)
      body.stream = true
      req.init.body = JSON.stringify(body)
    } catch (e) { /* body 组装异常：退回非流式 */ }
  }
  const res = await withTimeout(pfetch(req.url, Object.assign({}, req.init, {
    signal: AbortSignal.timeout(120000)
  })), 120000, '模型响应超时（120 秒），请检查模型服务或改用 Google/必应翻译')
  if (!res.ok) {
    let detail = ''
    try { detail = (await res.text()).slice(0, 300) } catch (e) { /* 忽略 */ }
    throw new Error('模型服务返回 ' + res.status + (detail ? '：' + detail : ''))
  }
  let full = ''
  // SSE 流式：逐行解析双格式（openai choices[].delta.content / anthropic delta.text），
  // 服务端不支持流式时（返回 json）自动走整体解析
  if (wantStream && res.body && String(res.headers.get('content-type') || '').includes('event-stream')) {
    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = ''
    for (;;) {
      const r = await reader.read()
      if (r.done) break
      buf += decoder.decode(r.value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() || ''
      for (const line of lines) {
        const s = line.trim()
        if (!s || s.startsWith('event:') || s.startsWith(':')) continue
        if (!s.startsWith('data:')) continue
        const payload = s.slice(5).trim()
        if (payload === '[DONE]') continue
        let d = null
        try { d = JSON.parse(payload) } catch (e) { continue }
        const piece = llmDeltaText(d)
        if (piece) {
          full += piece
          opts.onDelta(full)
        }
      }
    }
  } else {
    const data = await res.json()
    full = req.parse(data)
  }
  if (single) {
    const t = String(full || '').trim()
    if (!t) throw new Error('模型返回内容为空')
    return { translations: [t], detected: '' }
  }
  const arr = extractJsonArray(full)
  if (!arr) throw new Error('模型返回内容无法解析为翻译结果（' + String(full).slice(0, 80) + '）')
  const translations = texts.map((_, i) => {
    const t = arr[i]
    return typeof t === 'string' ? t : (t && t.translation) || ''
  })
  return { translations, detected: '' }
}

// 流式增量文本提取：兼容 OpenAI（choices[0].delta.content）与
// Anthropic（content_block_delta.delta.text）两种事件格式
function llmDeltaText(d) {
  try {
    if (Array.isArray(d.choices) && d.choices[0] && d.choices[0].delta) {
      return d.choices[0].delta.content || ''
    }
    if (d.type === 'content_block_delta' && d.delta) {
      return d.delta.text || ''
    }
  } catch (e) { /* 忽略畸形事件 */ }
  return ''
}

// ===== 统一入口 =====
// opts: { engine: 'google'|'bing'|'llm', source, target, provider }
// source/target 为语言代码（'auto' 为自动检测）；返回 { translations, detected?, detectedName? }；
// 引擎级故障抛错（上层提示用户切换引擎）
async function translateBatch(texts, opts = {}) {
  const list = texts.map(t => String(t || ''))
  if (!list.length) return { translations: [] }
  if (opts.engine === 'llm') return translateWithLLM(list, opts)
  if (opts.engine === 'bing') return translateWithBing(list, opts)
  return translateWithGoogle(list, opts)
}

module.exports = {
  // 批量翻译统一入口（按 opts.engine 分发 google / bing / llm）
  translateBatch,
  // 支持的语言表（代码 → 名称，页面原语言/目标语言下拉用）
  TARGET_LANGS
}
