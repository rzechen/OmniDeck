// 工具执行历史：统一门面（基于 db.js v3 toolHistory store）
// 设计：
// - 主键 = `${ts}:${rand}` 时序 id，倒序游标即按时间新→旧
// - 记录值 = { tool, ts, input, output, options, preview, size, truncated }
// - 容量治理三件套：单条 512KB 上限 / 每工具条数上限（默认 50，设置页可配）/ 启动 TTL 清理（30 天）
// - 敏感工具（密码生成等）不接入即可；由各工具在自己有意义的执行点显式调用 record()
import { storePut, storeDelete, storeClear, historyQuery, getItem, setItem } from './db'

const STORE = 'toolHistory'
// 单条体积上限（字符数）：超出截断并标记 truncated
const MAX_ITEM_CHARS = 512 * 1024
// 摘要长度：列表页只渲染 preview，避免全量加载
const PREVIEW_CHARS = 200
// TTL：启动时清理超过 N 天的记录
const TTL_DAYS = 30
// 每工具默认保留条数（设置页 toolHistoryLimit 可配）
const DEFAULT_LIMIT = 200
// 管理类全量扫描上限（清空/统计需要覆盖全部记录；正常使用远达不到此量级）
const SCAN_MAX = 10000

// 简易 hash（去重用）：djb2，输入相同则视为同一记录
function hashStr(str) {
  let h = 5381
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

// 字符串截断：超限只存前 max 字符并返回截断标记
function clampText(text, max) {
  if (text == null) return { text: '', truncated: false }
  const s = String(text)
  if (s.length <= max) return { text: s, truncated: false }
  return { text: s.slice(0, max), truncated: true }
}

// 当前每工具条数上限（设置页可改）
export function getLimit() {
  const v = getItem('toolHistoryLimit', DEFAULT_LIMIT)
  return typeof v === 'number' && v > 0 ? v : DEFAULT_LIMIT
}

export async function setLimit(v) {
  await setItem('toolHistoryLimit', v)
  // 上限调小后立即按新上限淘汰一遍
  const tools = await listTools()
  for (const t of tools) evict(t)
}

// 写入一条执行记录（fire-and-forget，不阻塞调用方）
// entry: { input, output, options }，input 用于去重与恢复，output 供复制
export async function record(tool, entry) {
  const ts = Date.now()
  const input = clampText(entry.input, MAX_ITEM_CHARS)
  const output = clampText(entry.output, MAX_ITEM_CHARS)
  const previewSrc = input.text || output.text || ''
  const value = {
    tool,
    ts,
    input: input.text,
    output: output.text,
    options: entry.options || null,
    preview: previewSrc.slice(0, PREVIEW_CHARS).replace(/\s+/g, ' '),
    hash: hashStr(previewSrc),
    size: previewSrc.length,
    truncated: input.truncated || output.truncated
  }
  const key = `${ts}:${Math.random().toString(36).slice(2, 8)}`
  await storePut(STORE, key, value)
  // 去重：删除同工具同 hash 的更旧记录（当前刚写入的最新的除外）
  dedupe(tool, key, value.hash)
  // 条数淘汰（异步，不阻塞）
  evict(tool)
  return key
}

// 同输入去重：保留最新一条，旧的删掉
async function dedupe(tool, keepKey, hash) {
  const rows = await historyQuery(tool, getLimit() + 1)
  for (const r of rows) {
    if (r.key !== keepKey && r.value && r.value.hash === hash) {
      storeDelete(STORE, r.key)
    }
  }
}

// 条数淘汰：超出上限时删除最旧的
async function evict(tool) {
  const limit = getLimit()
  const rows = await historyQuery(tool, limit + 1)
  for (let i = limit; i < rows.length; i++) {
    storeDelete(STORE, rows[i].key)
  }
}

// 读取某工具的历史列表（新→旧）
export async function list(tool, limit) {
  const rows = await historyQuery(tool, limit || getLimit())
  return rows.map(r => ({
    id: r.key,
    tool: r.value.tool,
    ts: r.value.ts,
    preview: r.value.preview,
    size: r.value.size,
    truncated: r.value.truncated,
    output: r.value.output
  }))
}

// 读取一条完整记录（恢复输入用）
export async function get(id) {
  const rows = await historyQuery(null, SCAN_MAX)
  const hit = rows.find(r => r.key === id)
  return hit ? hit.value : null
}

// 删除一条 / 清空某工具 / 清空全部
export async function remove(id) {
  return storeDelete(STORE, id)
}

export async function clear(tool) {
  if (!tool) return storeClear(STORE)
  const rows = await historyQuery(tool, SCAN_MAX)
  for (const r of rows) await storeDelete(STORE, r.key)
  return true
}

// 列出有历史记录的工具 path（设置页「按工具清空」用）
export async function listTools() {
  const rows = await historyQuery(null, SCAN_MAX)
  const set = new Set()
  for (const r of rows) {
    if (r.value && r.value.tool) set.add(r.value.tool)
  }
  return Array.from(set)
}

// 各工具记录条数（设置页管理列表用）：{ tool: count }
export async function countByTool() {
  const rows = await historyQuery(null, SCAN_MAX)
  const map = {}
  for (const r of rows) {
    if (r.value && r.value.tool) map[r.value.tool] = (map[r.value.tool] || 0) + 1
  }
  return map
}

// 启动清理：删除超过 TTL 的记录 + 申请持久化存储（防低磁盘时被浏览器驱逐）
export async function purge() {
  const expireTs = Date.now() - TTL_DAYS * 24 * 3600 * 1000
  const expireKey = String(expireTs) // 主键 `${ts}:...`，字符串比较即时间序
  const rows = await historyQuery(null, Number.MAX_SAFE_INTEGER, expireKey + '~')
  for (const r of rows) {
    if (r.value && r.value.ts < expireTs) storeDelete(STORE, r.key)
  }
  // 申请持久化（Electron 下几乎必成，失败静默）
  try {
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {})
    }
  } catch (e) { /* 忽略 */ }
}
