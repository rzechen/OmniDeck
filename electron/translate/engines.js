// 翻译引擎层：供翻译浏览器（WebContentsView 注入脚本）调用
// 双引擎：google（免费 gtx 接口）/ llm（复用 agent/llm.streamChat，OpenAI 兼容）
// 设计：纯函数无状态，引擎选择与 provider 配置由调用方（browser.js）注入

const { streamChat } = require('../agent/core/llm')

// ===== Google 免费翻译（translate_a/single gtx 端点，非官方） =====

const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single'

// 支持的目标语言（页面下拉用）：代码 → 英文名
const TARGET_LANGS = {
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

// Google 检测语言代码 → 中文名（状态栏展示用）
const DETECT_NAMES = {
  en: '英语', ja: '日语', ko: '韩语', fr: '法语', de: '德语', es: '西班牙语',
  ru: '俄语', pt: '葡萄牙语', it: '意大利语', ar: '阿拉伯语', th: '泰语',
  vi: '越南语', id: '印尼语', hi: '印地语', nl: '荷兰语', pl: '波兰语',
  tr: '土耳其语', sv: '瑞典语', 'zh-CN': '中文', 'zh-TW': '中文（繁体）'
}

// 目标语言代码 → LLM prompt 语言名（LLM 对英文代码识别不稳定，统一用语言名）
const LLM_LANG_NAMES = {
  'zh-CN': '简体中文', 'zh-TW': '繁体中文', en: '英语', ja: '日语', ko: '韩语',
  fr: '法语', de: '德语', es: '西班牙语', ru: '俄语', pt: '葡萄牙语', it: '意大利语'
}

function detectName(code) {
  if (!code) return ''
  return DETECT_NAMES[code] || TARGET_LANGS[code] || String(code).toUpperCase()
}

// 单条翻译：GET 返回 [[[译段, 原段, ...], ...], null, 检测语言, ...]
async function googleOne(text, target, signal) {
  const url = GOOGLE_ENDPOINT +
    '?client=gtx&sl=auto&dt=t&tl=' + encodeURIComponent(target) +
    '&q=' + encodeURIComponent(text)
  const res = await fetch(url, {
    signal,
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
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
  const timeout = AbortSignal.timeout(15000)
  let detected = ''
  // 单条一个请求（接口本身单 q 语义，避免分隔符歧义），并发 6
  const results = await mapLimit(texts, 6, async text => {
    try {
      const r = await googleOne(text, target, timeout)
      if (r.detected && !detected) detected = r.detected
      return r.text
    } catch (e) {
      // 单条失败返回空串（页面显示原文），整体不中断
      if (process.env.OMNIDECK_DEBUG) console.warn('[od:translate] google single fail:', e.message)
      return ''
    }
  })
  // 至少一条成功才算引擎可用（否则视为引擎故障，上层提示切换）
  const ok = results.some(t => t)
  if (!ok) throw new Error('Google 翻译请求失败（网络不可达或被限流）')
  return { translations: results, detected, detectedName: detectName(detected) }
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

async function translateWithLLM(texts, opts) {
  const target = opts.target || 'zh-CN'
  const provider = opts.provider || {}
  if (!provider.baseUrl || !provider.model) {
    throw new Error('未配置模型服务，请先在 Buddy「模型管理」中添加供应商')
  }
  const lang = LLM_LANG_NAMES[target] || target
  const system = [
    '你是专业的网页翻译引擎。用户会给你一个 JSON 字符串数组，每个元素是一段网页文本。',
    '把每段文本翻译成' + lang + '，要求：忠实原意、符合' + lang + '的表达习惯、专业术语准确；',
    '不要添加任何解释或注释；保留原文中的专有名词、代码、URL。',
    '输出严格的 JSON 字符串数组：长度与输入完全一致，第 i 个元素是第 i 段的译文，不要输出代码块围栏。'
  ].join('')
  const full = await streamChat({
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    model: provider.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: JSON.stringify(texts) }
    ]
  })
  const arr = extractJsonArray(full)
  if (!arr) throw new Error('模型返回内容无法解析为翻译结果')
  const translations = texts.map((_, i) => {
    const t = arr[i]
    return typeof t === 'string' ? t : (t && t.translation) || ''
  })
  return { translations, detected: '' }
}

// ===== 统一入口 =====
// opts: { engine: 'google'|'llm', target, provider }
// 返回 { translations, detected?, detectedName? }；引擎级故障抛错（上层提示用户切换引擎）
async function translateBatch(texts, opts = {}) {
  const list = texts.map(t => String(t || ''))
  if (!list.length) return { translations: [] }
  if (opts.engine === 'llm') return translateWithLLM(list, opts)
  return translateWithGoogle(list, opts)
}

module.exports = {
  // 批量翻译统一入口（按 opts.engine 分发 google / llm）
  translateBatch,
  // 支持的目标语言表（代码 → 名称，页面下拉用）
  TARGET_LANGS
}
