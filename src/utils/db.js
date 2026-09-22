// IndexedDB 封装：key-value 存储 + 内存缓存
// 设计：启动时 loadAll() 异步加载到内存缓存，之后 getItem 同步读取、setItem 异步写入

const DB_NAME = 'omnideck'
const DB_VERSION = 2
const STORE_NAME = 'settings'
// v2 新增：截图记录池 / 剪贴板历史（记录 id 为主键，值为 { meta, blob }）
const EXTRA_STORES = ['captures', 'clips']

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
      }
      req.onsuccess = (e) => {
        db = e.target.result
        resolve()
      }
      req.onerror = () => {
        // 降级：仅用内存缓存
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

// 异步写入（更新缓存 + 持久化到 IndexedDB）
export async function setItem(key, value) {
  cache.set(key, value)
  await openDB()
  if (!db) return
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      tx.objectStore(STORE_NAME).put(value, key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    } catch (e) {
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

// 清空全部本地数据（危险操作）：关闭连接后删除整个数据库
export async function clearAll() {
  cache.clear()
  await openDB()
  if (db) {
    try { db.close() } catch (e) { /* 忽略 */ }
    db = null
  }
  ready = null
  return new Promise((resolve) => {
    let done = false
    const finish = () => {
      if (!done) {
        done = true
        resolve(true)
      }
    }
    try {
      const req = indexedDB.deleteDatabase(DB_NAME)
      req.onsuccess = finish
      req.onerror = finish
      req.onblocked = finish
    } catch (e) {
      finish()
    }
    // 兜底：连接未及时释放导致 blocked 时也放行（内存缓存已清空）
    setTimeout(finish, 500)
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
