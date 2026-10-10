// 多 Tab 数据层：模块级响应式单例（浏览器页独占），IndexedDB 持久化。
// tab { id, url, title, isLoading, loadedOnce }——url/title 持久化字段，
// isLoading/loadedOnce 为运行态（重启后非激活 tab 懒加载，激活时才 loadURL）
import { reactive } from 'vue'
import { getItem, setItem } from '@/utils/storage/db'

const KEY = 'browser:tabs'
// tab 数量上限（每 webview 独立进程，防内存失控）
const MAX_TABS = 15

export const tabState = reactive({
  loaded: false,
  tabs: [],      // [{ id, url, title, isLoading, loadedOnce }]
  activeId: ''
})

function genId() {
  return 'tab_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function persist() {
  setItem(KEY, {
    tabs: tabState.tabs.map(t => ({ id: t.id, url: t.url, title: t.title })),
    activeId: tabState.activeId
  })
}

export function loadTabs() {
  if (tabState.loaded) return
  const saved = getItem(KEY, null)
  if (saved && Array.isArray(saved.tabs) && saved.tabs.length) {
    tabState.tabs = saved.tabs.map(t => ({
      id: t.id || genId(),
      url: String(t.url || ''),
      title: String(t.title || ''),
      isLoading: false,
      loadedOnce: false
    }))
    tabState.activeId = tabState.tabs.some(t => t.id === saved.activeId)
      ? saved.activeId
      : tabState.tabs[0].id
  } else {
    const t = { id: genId(), url: '', title: '', isLoading: false, loadedOnce: false }
    tabState.tabs = [t]
    tabState.activeId = t.id
  }
  tabState.loaded = true
}

export function tabById(id) {
  return tabState.tabs.find(t => t.id === id) || null
}

// 新建 tab 并激活；超上限返回 null
export function addTab(url) {
  loadTabs()
  if (tabState.tabs.length >= MAX_TABS) return null
  const t = { id: genId(), url: String(url || ''), title: '', isLoading: false, loadedOnce: false }
  tabState.tabs.push(t)
  tabState.activeId = t.id
  persist()
  return t
}

// 关闭 tab：激活转移给相邻（优先右侧）；最后一个 tab 关闭则新建空 tab 保持单页
export function closeTab(id) {
  const i = tabState.tabs.findIndex(t => t.id === id)
  if (i === -1) return tabState.activeId
  tabState.tabs.splice(i, 1)
  if (!tabState.tabs.length) {
    const t = { id: genId(), url: '', title: '', isLoading: false, loadedOnce: false }
    tabState.tabs.push(t)
    tabState.activeId = t.id
  } else if (tabState.activeId === id) {
    tabState.activeId = tabState.tabs[Math.min(i, tabState.tabs.length - 1)].id
  }
  persist()
  return tabState.activeId
}

export function setActiveTab(id) {
  if (id && tabState.tabs.some(t => t.id === id) && id !== tabState.activeId) {
    tabState.activeId = id
    persist()
  }
}

// 更新 tab 字段：url/title 持久化字段变化时写库（isLoading 等运行态不写）
export function updateTab(id, patch) {
  const t = tabById(id)
  if (!t) return
  let dirty = false
  if (patch.url !== undefined && patch.url !== t.url) { t.url = patch.url; dirty = true }
  if (patch.title !== undefined && patch.title !== t.title) { t.title = patch.title; dirty = true }
  if (patch.isLoading !== undefined) t.isLoading = !!patch.isLoading
  if (patch.loadedOnce !== undefined) t.loadedOnce = !!patch.loadedOnce
  if (dirty) persist()
}
