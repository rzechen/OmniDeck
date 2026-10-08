// 贵金属数据服务层：行情脚本请求（经主进程 http:request 代理绕过 CORS）+
// 新浪 hq_str 风格脚本解析、内存缓存、品种字段格式化
// 脚本为 GBK 编码，中文字段会乱码：解析仅取数字/ASCII 字段，名称以本地配置为准
import { GOLD_API, GOLD_VARIETIES } from '@/config/gold-api'

/* ============ 基础请求（与 fund.js 同模式，主进程代理 + 控制台日志） ============ */

async function httpGetOnce(url, referer, timeout) {
  const t0 = Date.now()
  const headers = {}
  if (referer) headers.Referer = referer
  const res = await window.electronAPI.httpRequest({
    method: 'GET',
    url,
    headers,
    timeout
  })
  const ms = Date.now() - t0
  if (!res || !res.ok) {
    console.warn('[gold http]', url, '失败', ms + 'ms', res && res.error)
    throw new Error((res && res.error) || '网络请求失败')
  }
  if (res.status >= 400) {
    console.warn('[gold http]', url, 'HTTP ' + res.status, ms + 'ms')
    throw new Error('接口返回 ' + res.status)
  }
  console.log('[gold http]', url, '→', res.status, ms + 'ms', (res.body || '').length + 'B')
  return res.body
}

async function httpGet(url, referer, timeout) {
  try {
    return await httpGetOnce(url, referer, timeout)
  } catch (e) {
    // 重试一次
    return await httpGetOnce(url, referer, timeout)
  }
}

/* ============ 脚本解析 ============ */

// hq_str 变量提取：GBK 双字节编码不含 " 与 , ，正则与 split 均安全
function parseScript(text) {
  const map = {}
  const re = /hq_str_([A-Za-z0-9_]+)="([^"]*)"/g
  let m
  while ((m = re.exec(String(text || '')))) {
    map[m[1]] = m[2].split(',')
  }
  return map
}

const num = v => {
  const n = parseFloat(v)
  return isFinite(n) ? n : null
}

// HHMMSS → HH:MM:SS
function fmtHMS(s) {
  const t = String(s || '')
  return /^\d{6}$/.test(t) ? t.slice(0, 2) + ':' + t.slice(2, 4) + ':' + t.slice(4, 6) : t
}

// 逐品种按布局取字段 → 行情对象
// 返回 { [key]: { price, open, high, low, prevClose, change, pct, time, date } }
export function buildQuotes(raw) {
  const out = {}
  GOLD_VARIETIES.forEach(v => {
    const f = raw[v.key]
    if (!f || !f.length) return
    let q = null
    if (v.layout === 'hf' || v.layout === 'gds') {
      // [0]最新 [4]最高 [5]最低 [6]时间 [7]昨收 [8]今开 [12]日期
      const price = num(f[0])
      const prevClose = num(f[7])
      if (price === null) return
      q = {
        price,
        open: num(f[8]),
        high: num(f[4]),
        low: num(f[5]),
        prevClose,
        time: fmtHMS(f[6]),
        date: f[12] || ''
      }
    } else if (v.layout === 'nf') {
      // [2]今开 [3]最高 [4]最低 [5]昨收 [8]最新 [10]昨结 [1]时间 [17]日期；涨跌以昨结为基准（期货惯例）
      const price = num(f[8])
      const prevSettle = num(f[10])
      if (price === null) return
      q = {
        price,
        open: num(f[2]),
        high: num(f[3]),
        low: num(f[4]),
        prevClose: prevSettle,
        time: fmtHMS(f[1]),
        date: f[17] || ''
      }
    } else if (v.layout === 'sge') {
      // [3]最新 [5]最高 [8]最低 [16]时间 [17]涨跌幅（直给）；昨收由涨跌幅反推
      const price = num(f[3])
      const pct = num(f[17])
      if (price === null || pct === null) return
      const prevClose = price / (1 + pct / 100)
      q = {
        price,
        open: null,
        high: num(f[5]),
        low: num(f[8]),
        prevClose: Math.round(prevClose * 100) / 100,
        time: (f[16] || '').split(' ')[1] || '',
        date: (f[16] || '').split(' ')[0] || ''
      }
      q.pct = pct
      q.change = Math.round((price - prevClose) * 100) / 100
      out[v.key] = q
      return
    }
    // hf / gds / nf：涨跌额与涨跌幅（基准昨收/昨结）
    if (q.prevClose !== null && q.prevClose > 0) {
      q.change = Math.round((q.price - q.prevClose) * 1000) / 1000
      q.pct = Math.round(((q.price - q.prevClose) / q.prevClose) * 10000) / 100
    } else {
      q.change = null
      q.pct = null
    }
    out[v.key] = q
  })
  return out
}

// 美元人民币汇率（现汇买价）
export function buildUsdCny(raw) {
  const f = raw.USDCNY
  if (!f || !f.length) return null
  const rate = num(f[1])
  return rate === null ? null : rate
}

/* ============ 对外：一次拉取全量行情 ============ */

let cache = null

export async function fetchGoldQuotes(force) {
  const now = Date.now()
  if (!force && cache && now - cache.t < GOLD_API.quoteTTL) {
    return cache.data
  }
  // 原站带 t= 时间戳防缓存
  const text = await httpGet(GOLD_API.quote + '?t=' + now, GOLD_API.referer, 15000)
  const raw = parseScript(text)
  const data = { quotes: buildQuotes(raw), usdCny: buildUsdCny(raw) }
  cache = { t: now, data }
  return data
}
