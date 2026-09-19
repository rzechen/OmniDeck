// IndexedDB 封装：key-value 存储 + 内存缓存
// 设计：启动时 loadAll() 异步加载到内存缓存，之后 getItem 同步读取、setItem 异步写入

const DB_NAME = 'omnideck'
const DB_VERSION = 1
const STORE_NAME = 'settings'

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
