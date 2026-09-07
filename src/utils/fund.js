// 基金数据服务层：封装三方接口请求（经主进程 http:request 代理绕过 CORS）、
// JS/JSONP 响应剥壳、内存+IndexedDB 缓存、交易时段判断与收益计算
import { FUND_API } from '@/config/fund-api'
import { getItem, setItem } from './db'

/* ============ 基础请求 ============ */

// 经主进程代理的 GET 请求（preload 暴露的 electronAPI.httpRequest），返回文本
// 请求走主进程 net 模块，DevTools Network 面板不可见，故在此打印控制台日志
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
    console.warn('[fund http]', url, '失败', ms + 'ms', res && res.error)
    throw new Error((res && res.error) || '网络请求失败')
  }
  if (res.status >= 400) {
    console.warn('[fund http]', url, 'HTTP ' + res.status, ms + 'ms')
    throw new Error('接口返回 ' + res.status)
  }
  console.log('[fund http]', url, '→', res.status, ms + 'ms', (res.body || '').length + 'B')
  return res.body
}

async function httpGet(url, referer, timeout) {
  try {
    return await httpGetOnce(url, referer, timeout || 15000)
  } catch (e) {
    // 重试一次
    return await httpGetOnce(url, referer, timeout || 15000)
  }
}

/* ============ 交易时段判断 ============ */

// 是否处于盘中（周一~周五 9:15-15:05，简化处理不剔除法定节假日）
export function isTradingTime(now) {
  const d = now || new Date()
  const day = d.getDay()
  if (day === 0 || day === 6) return false
  const mins = d.getHours() * 60 + d.getMinutes()
  return mins >= 9 * 60 + 15 && mins <= 15 * 60 + 5
}

// 估值日期格式化：20260904 → 2026-09-04（无日期或已带分隔符时原样返回）
export function fmtQuoteDate(str) {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(String(str || ''))
  return m ? m[1] + '-' + m[2] + '-' + m[3] : (str || '')
}

// 估值时间格式化：14:50 → 14:50:00（补全秒位；已含秒时原样返回）
export function fmtQuoteTime(str) {
  const s = String(str || '')
  const m = /^(\d{1,2}):(\d{2})(:\d{2})?$/.exec(s)
  if (!m) return s
  return m[3] ? s : m[1] + ':' + m[2] + ':00'
}
// 市场状态（A股时段：9:30-11:30 / 13:00-15:00）
// 返回 { label, type }：type: open=交易中 break=午间休市 closed=休市
export function calcMarketStatus(now) {
  const d = now || new Date()
  const day = d.getDay()
  if (day === 0 || day === 6) return { label: '非交易日', type: 'closed' }
  const m = d.getHours() * 60 + d.getMinutes()
  if (m < 9 * 60 + 30) return { label: '未开盘', type: 'closed' }
  if (m <= 11 * 60 + 30) return { label: '交易中', type: 'open' }
  if (m < 13 * 60) return { label: '午间休市', type: 'break' }
  if (m <= 15 * 60) return { label: '交易中', type: 'open' }
  return { label: '已收盘', type: 'closed' }
}

/* ============ 实时估值（新浪财经） ============ */

// 估值内存缓存：code -> { ts, data }
const quoteCache = new Map()

// 获取基金实时估值（含盘中走势）。
// force=true 跳过缓存强制刷新。
// 返回：{
//   nav, navPct,        // 上一交易日单位净值与涨跌幅（%）
//   estimate, estPct,   // 最新估值与估算涨跌幅（%），收盘后与 nav 相同
//   date, time,         // 净值日期 / 估值时间点
//   points              // 盘中走势 [{t:'09:30', v:1.497, pct:0.34}]
// }
export async function fetchQuote(code, force) {
  const hit = quoteCache.get(code)
  if (!force && hit && Date.now() - hit.ts < FUND_API.quoteTTL) {
    return hit.data
  }
  const body = await httpGet(FUND_API.sinaEstimate + '?symbol=' + code, FUND_API.sinaReferer, 15000)
  const json = JSON.parse(body)
  const status = json && json.result && json.result.status
  if (!status || status.code !== 0) {
    throw new Error('基金不存在或接口异常')
  }
  const d = json.result.data || {}
  const nw = d.networth || []
  const last = nw.length ? nw[nw.length - 1] : null
  // 货币基金等品种既无盘中估值序列也无 worth 净值：显式报错，
  // 避免以 estimate=0 展示、市值/收益被错误计算成巨亏
  if (!last && !Number(d.worth)) {
    throw new Error('该基金暂无估值数据')
  }
  // pre_nav2=最新估值 nav2_pct=估值涨跌幅(%)；
  // 由估值反推上一交易日收盘净值：baseNav = est / (1 + pct/100)
  const estPrice = last ? Number(last.pre_nav2) : Number(d.worth) || 0
  const estPct = last ? Number(last.nav2_pct) || 0 : 0
  const baseNav = last
    ? (estPct > -100 ? estPrice / (1 + estPct / 100) : estPrice)
    : estPrice
  // worth=最新公布净值，worth_date=其对应日期（接口日期有两种格式：20260904 / 2026-09-07）
  const worthVal = Number(d.worth) || 0
  const normDate = s => String(s || '').replace(/\D/g, '').slice(0, 8)
  const worthDate = normDate(d.worth_date)
  const estDate = last ? normDate(last.pre_date) : ''
  // 仅当官方净值已更新到估值日当日（收盘后晚间公布，worth_date 追平 pre_date）才取 worth；
  // 盘中 worth 仍是上一交易日净值，与 baseNav 仅差四舍五入误差（~1e-5 量级），
  // 不能按数值近似判断——旧逻辑 |worth-baseNav|>1e-6 盘中几乎恒成立，
  // 导致最新价卡在昨收净值、当日涨跌恒为 0
  const worthIsNewer = worthVal > 0 && !!estDate && worthDate >= estDate
  const price = worthIsNewer ? worthVal : estPrice
  const pct = worthIsNewer && baseNav > 0
    ? (worthVal - baseNav) / baseNav * 100
    : estPct
  // 上一交易日收盘净值：盘中 worth 即昨收（精确值）；worth 已更新为当日值后只能由估值反推
  const prevNav = !worthIsNewer && worthVal > 0 ? worthVal : baseNav
  const data = {
    // 上一交易日收盘净值（当日收益计算基准）
    nav: prevNav,
    // 昨日实际涨跌幅
    navPct: last ? Number(last.nav_pct) || 0 : 0,
    // 最新净值：盘中为实时估值，收盘后为当日收盘净值
    estimate: price,
    estPct: pct,
    // 估值日期：优先取估值序列的 pre_date（盘中即当日），无估值数据时退回净值公布日
    date: (last && last.pre_date) || d.worth_date || '',
    time: last ? last.min_time : '',
    // 盘中估值走势：每分钟一个点
    points: nw.map(p => ({
      t: p.min_time.slice(0, 5),
      v: Number(p.pre_nav2),
      pct: Number(p.nav2_pct)
    }))
  }
  quoteCache.set(code, { ts: Date.now(), data })
  return data
}

/* ============ 基金基本信息（东方财富移动端 API，轻量） ============ */

const basicCache = new Map()

// 按基金代码查询名称与类型：{ code, name, type }
export async function fetchFundBasic(code) {
  const hit = basicCache.get(code)
  if (hit) return hit
  const url = FUND_API.fundInfo.replace('{code}', code)
  const body = await httpGet(url, FUND_API.emReferer, 15000)
  let d = null
  try {
    d = JSON.parse(body).Datas
  } catch (e) { /* 非法响应按未找到处理 */ }
  if (!d || !d.SHORTNAME) throw new Error('未找到该基金，请检查代码')
  // raw 保留完整字段（基金经理/公司/规模等），供详情页信息 tab 使用
  const info = { code: d.FCODE || code, name: d.SHORTNAME, type: d.FTYPE || '', raw: d }
  basicCache.set(code, info)
  return info
}

/* ============ 历史净值（东方财富 pingzhongdata） ============ */

// 提取 JS 变量中的 JSON 数组文本（括号平衡 + 字符串感知，支持嵌套数组）
function extractJsonArray(body, varName) {
  const m = body.match(new RegExp('var\\s+' + varName + '\\s*=\\s*\\['))
  if (!m) return null
  const start = m.index + m[0].length - 1
  let depth = 0
  for (let i = start; i < body.length; i++) {
    const c = body[i]
    if (c === '"' || c === "'") {
      // 跳过字符串字面量
      const q = c
      i++
      while (i < body.length && body[i] !== q) {
        if (body[i] === '\\') i++
        i++
      }
    } else if (c === '[') {
      depth++
    } else if (c === ']') {
      depth--
      if (depth === 0) return body.slice(start, i + 1)
    }
  }
  return null
}

// 获取基金全量历史净值走势
// 返回：{ name, points, managers }（pct 为日涨跌幅 %；managers 为现任基金经理）
export async function fetchHistory(code) {
  const url = FUND_API.pingzhong.replace('{code}', code)
  const body = await httpGet(url, FUND_API.emReferer + '/' + code + '.html')
  const nameMatch = body.match(/var\s+fS_name\s*=\s*"([^"]*)"/)
  const trendMatch = body.match(/var\s+Data_netWorthTrend\s*=\s*(\[.*?\])\s*;/)
  if (!trendMatch) throw new Error('历史净值数据解析失败')
  // 数组元素键无引号（{x:123,y:1.2}），非合法 JSON，用 Function 解析
  const trend = new Function('return ' + trendMatch[1])()
  const points = trend.map(p => ({
    date: new Date(p.x).toISOString().slice(0, 10),
    // 时间戳（性能：图表范围过滤用，避免重复解析日期字符串）
    ts: p.x,
    nav: p.y,
    pct: p.equityReturn || 0
  }))
  // 现任基金经理（含嵌套数组，需括号平衡提取）
  let managers = []
  const mgrRaw = extractJsonArray(body, 'Data_currentFundManager')
  if (mgrRaw) {
    try {
      const arr = new Function('return ' + mgrRaw)()
      if (Array.isArray(arr)) {
        managers = arr.map(m => ({
          name: m.name || '',
          pic: m.pic || '',
          star: m.star || 0,
          workTime: m.workTime || '',
          fundSize: m.fundSize || ''
        }))
      }
    } catch (e) { /* 经理信息解析失败不阻塞净值 */ }
  }
  return { name: nameMatch ? nameMatch[1] : '', points, managers }
}

/* ============ 本地持仓存取（IndexedDB） ============ */

// 持仓条目：{ code, name, type, shares, costPrice, costAmount, createdAt }
// shares 为 0 时仅作为自选展示
export function loadPositions() {
  const list = getItem('fundPositions')
  return Array.isArray(list) ? list : []
}

export function savePositions(list) {
  return setItem('fundPositions', list)
}

/* ============ 收益计算 ============ */

// 由持仓 + 实时估值计算单只基金的收益指标
// quote 为 fetchQuote 返回值
export function calcProfit(pos, quote) {
  const shares = pos.shares || 0
  // 最新净值：盘中取估值，收盘后与单位净值一致
  const price = quote.estimate || quote.nav || 0
  const marketValue = shares * price
  const costAmount = pos.costAmount || shares * (pos.costPrice || 0)
  const profit = marketValue - costAmount
  const profitRate = costAmount > 0 ? (profit / costAmount) * 100 : 0
  // 当日收益 = 份额 ×（最新价 − 昨收净值）
  const todayProfit = shares * (price - (quote.nav || price))
  return {
    price,
    marketValue,
    costAmount,
    profit,
    profitRate,
    todayProfit,
    todayRate: costAmount > 0 ? (todayProfit / costAmount) * 100 : 0
  }
}

/* ============ 展示辅助 ============ */

// 涨跌颜色（A股习惯：红涨绿跌），返回 CSS 颜色值
export function riseColor(val) {
  if (val > 0) return '#F5222D'
  if (val < 0) return '#52C41A'
  return 'var(--text-secondary)'
}

// 金额格式化：千分位 + 两位小数；symbol 控制正负号
export function fmtMoney(val, symbol) {
  if (val === null || val === undefined || isNaN(val)) return '--'
  const sign = symbol && val > 0 ? '+' : val < 0 ? '-' : ''
  return sign + Math.abs(val).toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

// 百分比格式化
export function fmtPct(val, symbol) {
  if (val === null || val === undefined || isNaN(val)) return '--'
  const sign = symbol && val > 0 ? '+' : val < 0 ? '-' : ''
  return sign + Math.abs(val).toFixed(2) + '%'
}
