// IndexedDB 封装：key-value 存储 + 内存缓存
// 设计：启动时 loadAll() 异步加载到内存缓存，之后 getItem 同步读取、setItem 异步写入

const DB_NAME = 'omnideck'
const DB_VERSION = 4
const STORE_NAME = 'settings'
// v2 新增：截图记录池 / 剪贴板历史（记录 id 为主键，值为 { meta, blob }）
const EXTRA_STORES = ['captures', 'clips']
// v3 新增：工具执行历史（主键 = 时序 id，值为 { tool, ts, input, output, ... }，
// 不进内存缓存，走 store* 系列按记录异步读写）
const HISTORY_STORE = 'toolHistory'
// v4 新增：剪贴板收藏（主键 = favclip id，值为 { meta, png? }；与 clips 历史隔离）
const FAV_STORE = 'favClips'

let db = null
const cache = new Map()
let ready = null

function openDB() {
  if (ready) return ready
  ready = new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION)
      req.onupgradeneeded = (e) => {
        const database = e.target.result
        if (!database.objectStoreNames.contains(STORE_NAME)) {
          database.createObjectStore(STORE_NAME)
        }
        // v2：截图记录池 / 剪贴板历史 store（无 keyPath，主键显式传入）
        EXTRA_STORES.forEach(name => {
          if (!database.objectStoreNames.contains(name)) {
            database.createObjectStore(name)
          }
        })
        // v3：工具执行历史 store
        if (!database.objectStoreNames.contains(HISTORY_STORE)) {
          database.createObjectStore(HISTORY_STORE)
        }
        // v4：剪贴板收藏 store
        if (!database.objectStoreNames.contains(FAV_STORE)) {
          database.createObjectStore(FAV_STORE)
        }
      }
      req.onsuccess = (e) => {
        db = e.target.result
        resolve()
      }
      req.onerror = () => {
        // 降级：仅用内存缓存（刷新后数据丢失，须在控制台留痕便于排查）
        console.warn('[omnideck:db] IndexedDB 打开失败，本次运行仅内存缓存：', req.error && req.error.message)
        db = null
        resolve()
      }
    } catch (e) {
      db = null
      resolve()
    }
  })
  return ready
}

// 启动时调用：加载所有数据到内存缓存
export async function loadAll() {
  await openDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.openCursor()
      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          cache.set(cursor.key, cursor.value)
          cursor.continue()
        } else {
          resolve()
        }
      }
      req.onerror = () => resolve()
    } catch (e) {
      resolve()
    }
  })
}

// 同步读取（从内存缓存）
export function getItem(key, defaultVal) {
  return cache.has(key) ? cache.get(key) : defaultVal
}

// 写入前转为纯数据：Vue3 响应式对象是 Proxy，IndexedDB 结构化克隆无法序列化
// （put 抛 DataCloneError 且事务中止）。优先 structuredClone（保留 Date 等类型），
// 遇 Proxy 抛错时用 JSON 深拷贝兜底（JSON 读写会穿透 Proxy 得到纯数据）
function toStorable(value) {
  try {
    return structuredClone(value)
  } catch (e) {
    try {
      return JSON.parse(JSON.stringify(value === undefined ? null : value))
    } catch (e2) {
      return value
    }
  }
}

// 异步写入（更新缓存 + 持久化到 IndexedDB）
export async function setItem(key, value) {
  value = toStorable(value)
  cache.set(key, value)
  await openDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => {
        // 不再静默：写入失败必须留痕（此前 DataCloneError 被吞，表现为「重启后数据回退」）
        console.warn('[omnideck:db] IndexedDB 写入失败:', key, tx.error)
        resolve()
      }
    } catch (e) {
      console.warn('[omnideck:db] IndexedDB 写入异常:', key, e)
      resolve()
    }
  })
}

// 异步删除（清除缓存 + IndexedDB）
export async function removeItem(key) {
  cache.delete(key)
  await openDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch (e) {
      resolve()
    }
  })
}

// ============ 指定 store 读写（v2：截图池 / 剪贴板历史） ============
// 与 settings 键值缓存不同，这两个 store 单条体积大（含 Blob 原图），
// 不进内存缓存，直接异步读写；失败静默（截图记录仅影响持久化，不影响功能）

function storeTx(name, mode) {
  return db.transaction(name, mode).objectStore(name)
}

// 写一条（value: { meta, blob } 等，key = 记录 id）
export async function storePut(name, key, value) {
  await openDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = storeTx(name, 'readwrite')
      tx.put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch (e) { resolve() }
  })
}

// 删一条
export async function storeDelete(name, key) {
  await openDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = storeTx(name, 'readwrite')
      tx.delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch (e) { resolve() }
  })
}

// 清空整个 store
export async function storeClear(name) {
  await openDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = storeTx(name, 'readwrite')
      tx.clear()
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch (e) { resolve() }
  })
}

// 全量读出（含 Blob），按插入序返回 [{ key, value }]
export async function storeGetAll(name) {
  await openDB()
  if (!db) return []
  return new Promise((resolve) => {
    const out = []
    try {
      const req = storeTx(name, 'readonly').openCursor()
      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          out.push({ key: cursor.key, value: cursor.value })
          cursor.continue()
        } else {
          resolve(out)
        }
      }
      req.onerror = () => resolve(out)
    } catch (e) { resolve(out) }
  })
}

// ============ IndexedDB 每日用量采样（首页折线图数据源） ============
// 每天首次启动采样一次 navigator.storage.estimate().usage（覆盖全库：
// settings/captures/clips/toolHistory），KV 存 { 'YYYY-MM-DD': bytes }，
// 折线画相邻采样日的差值（每日净增长），只保留最近 90 天

const USAGE_SAMPLES_KEY = 'idbDailyUsageSamples'
const USAGE_SAMPLES_DAYS = 90

// 本地时区日期键
function usageDayKey(ts) {
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 每日采样（当天已有采样则跳过）：返回是否写入
export async function sampleDailyUsage() {
  try {
    if (!(navigator.storage && navigator.storage.estimate)) return false
    const { usage } = await navigator.storage.estimate()
    if (!Number.isFinite(usage)) return false
    const samples = getItem(USAGE_SAMPLES_KEY, {}) || {}
    const today = usageDayKey(Date.now())
    if (samples[today] !== undefined) return false // 当天已采样
    samples[today] = usage
    // 顺手清理超期样本
    const cutoff = usageDayKey(Date.now() - USAGE_SAMPLES_DAYS * 24 * 3600 * 1000)
    Object.keys(samples).forEach(k => {
      if (k < cutoff) delete samples[k]
    })
    setItem(USAGE_SAMPLES_KEY, samples)
    return true
  } catch (e) {
    return false
  }
}

// 近 N 天每日净增长（旧→新）：当天用量 − 前一个采样日用量；首日 / 无前值补 null
// bytes→可读文案由调用方格式化；null 表示该日无增长数据（不画点）
export function getDailyGrowth(days) {
  const n = days || 14
  const samples = getItem(USAGE_SAMPLES_KEY, {}) || {}
  const keys = Object.keys(samples).sort() // 升序日期键
  const out = []
  const now = new Date()
  for (let i = n - 1; i >= 0; i--) {
    const k = usageDayKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - i).getTime())
    let growth = null
    const idx = keys.indexOf(k)
    if (idx > 0) {
      growth = Math.max(0, samples[k] - samples[keys[idx - 1]]) // 净增长不为负（有清理时归 0）
    }
    out.push({ date: k, growth })
  }
  return out
}

// 倒序游标遍历历史 store：按 tool 过滤，最多取 limit 条
// 倒序方向从最新往旧走（主键为时序 id `${ts}:${rand}`），配合 IDBKeyRange.upperBound 实现分页
export async function historyQuery(tool, limit, before) {
  await openDB()
  if (!db) return []
  return new Promise((resolve) => {
    const out = []
    try {
      const range = before
        ? IDBKeyRange.upperBound(before, true)
        : undefined
      const req = storeTx(HISTORY_STORE, 'readonly').openCursor(range, 'prev')
      req.onsuccess = (e) => {
        const cursor = e.target.result
        if (cursor) {
          if (!tool || (cursor.value && cursor.value.tool === tool)) {
            out.push({ key: cursor.key, value: cursor.value })
          }
          if (out.length >= limit) {
            resolve(out)
          } else {
            cursor.continue()
          }
        } else {
          resolve(out)
        }
      }
      req.onerror = () => resolve(out)
    } catch (e) { resolve(out) }
  })
}
