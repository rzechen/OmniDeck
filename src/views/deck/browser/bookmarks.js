// 书签数据层：模块级响应式单例，浏览器页（星标态）与书签管理面板共享；
// 扁平存储于 IndexedDB KV（browser:bookmarks）：
//   文件夹 { id, type: 'folder', name, createdAt }
//   书签   { id, type: 'page', name, url, folderId(null=未分组), createdAt }
import { reactive } from 'vue'
import { getItem, setItem } from '@/utils/storage/db'

const KEY = 'browser:bookmarks'
const LAST_FOLDER_KEY = 'browser:lastBookmarkFolder'

// 全部书签/文件夹（loaded 防重复加载）
export const bookmarkState = reactive({ list: [], loaded: false })

function persist() {
  setItem(KEY, bookmarkState.list)
}

// 幂等加载（各组件挂载时调用）
export function loadBookmarks() {
  if (bookmarkState.loaded) return
  bookmarkState.list = getItem(KEY, []) || []
  bookmarkState.loaded = true
}

function genId() {
  return 'bm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

// 按 URL 查书签（星标态判断）
export function findBookmarkByUrl(url) {
  if (!url) return null
  return bookmarkState.list.find(b => b.type === 'page' && b.url === url) || null
}

// 上次收藏使用的文件夹（一键收藏默认目标）
export function getLastFolderId() {
  return getItem(LAST_FOLDER_KEY, null)
}
export function setLastFolderId(id) {
  setItem(LAST_FOLDER_KEY, id || null)
}

// 收藏网页（同 URL 已存在则仅更新名称/位置）；返回书签对象
export function addBookmark(name, url, folderId) {
  const exist = findBookmarkByUrl(url)
  if (exist) {
    if (name) exist.name = name
    if (folderId !== undefined && folderId !== null) exist.folderId = folderId
    persist()
    return exist
  }
  const item = {
    id: genId(),
    type: 'page',
    name: name || url,
    url: url,
    folderId: folderId || null,
    createdAt: Date.now()
  }
  bookmarkState.list.unshift(item)
  persist()
  return item
}

// 更新书签（重命名/移动文件夹）
export function updateBookmark(id, patch) {
  const item = bookmarkState.list.find(b => b.id === id)
  if (!item || item.type !== 'page') return
  if (patch.name != null) item.name = patch.name
  if (patch.folderId !== undefined) item.folderId = patch.folderId || null
  persist()
}

// 删除书签
export function removeBookmark(id) {
  const i = bookmarkState.list.findIndex(b => b.id === id)
  if (i >= 0) bookmarkState.list.splice(i, 1)
  persist()
}

// 文件夹名去重（重名自动加序号）
function uniqueFolderName(name) {
  const names = new Set(bookmarkState.list.filter(b => b.type === 'folder').map(f => f.name))
  if (!names.has(name)) return name
  let i = 2
  while (names.has(name + ' ' + i)) i++
  return name + ' ' + i
}

// 新建文件夹；返回文件夹对象
export function addFolder(name) {
  const item = {
    id: genId(),
    type: 'folder',
    name: uniqueFolderName(String(name || '').trim() || '新建文件夹'),
    createdAt: Date.now()
  }
  bookmarkState.list.push(item)
  persist()
  return item
}

// 重命名文件夹
export function renameFolder(id, name) {
  const item = bookmarkState.list.find(b => b.id === id && b.type === 'folder')
  const n = String(name || '').trim()
  if (!item || !n) return
  item.name = n
  persist()
}

// 删除文件夹：内部书签移回未分组（不级联删除）；返回移出的书签数
export function removeFolder(id) {
  const i = bookmarkState.list.findIndex(b => b.id === id && b.type === 'folder')
  if (i < 0) return 0
  bookmarkState.list.splice(i, 1)
  let moved = 0
  bookmarkState.list.forEach(b => {
    if (b.type === 'page' && b.folderId === id) {
      b.folderId = null
      moved++
    }
  })
  if (getLastFolderId() === id) setLastFolderId(null)
  persist()
  return moved
}

// ===== Chrome 书签互导（Netscape Bookmark File 格式） =====

// Chrome 根容器名（书签栏/其他书签等）：导入时不作为文件夹名，子级提升到顶层
const CHROME_ROOT_NAMES = new Set([
  '书签栏', '其他书签', '其他收藏夹', '书签菜单', '移动设备书签',
  'bookmarks', 'bookmarks bar', 'other bookmarks', 'favorites', 'favorites bar',
  'mobile bookmarks'
])

// 解析 Chrome 导出的书签 HTML → { rootPages: [{name,url}], folders: [ [路径名, pages[]] ] }
// 多层文件夹以「父/子」路径拍平为本应用的单层文件夹；仅保留 http/https 链接
// 注意：HTML 解析器不闭合 Netscape 格式未闭合的 <DT>，DOM 中 <DL> 会成为
// 前一个 <DT><H3> 的子元素（而非源码层面的兄弟节点），不能按 DOM 层级递归；
// 改为逐链接自最内层 DL 向上收集所属文件夹链（对两种 DOM 形态均兼容）
export function parseBookmarksHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ''), 'text/html')
  const rootPages = []
  const folderMap = new Map() // path -> pages[]
  for (const a of Array.from(doc.querySelectorAll('a[href]'))) {
    const url = a.getAttribute('href') || ''
    if (!/^https?:/i.test(url)) continue
    const names = []
    let dl = a.closest('dl')
    while (dl) {
      const h3 = ownerH3Of(dl)
      if (h3) {
        const nm = String(h3.textContent || '').trim()
        if (nm && !CHROME_ROOT_NAMES.has(nm.toLowerCase())) names.unshift(nm)
      }
      dl = dl.parentElement ? dl.parentElement.closest('dl') : null
    }
    const item = { name: String(a.textContent || '').trim() || url, url: url }
    if (names.length) {
      const path = names.join('/')
      if (!folderMap.has(path)) folderMap.set(path, [])
      folderMap.get(path).push(item)
    } else {
      rootPages.push(item)
    }
  }
  return { rootPages, folders: Array.from(folderMap.entries()) }
}

// DL 的属主 H3（文件夹名），兼容两种 DOM 形态：
// 形态1（DOMParser 常见）：DL 的父元素是 DT，H3 在该 DT 内
// 形态2（源码平级被保留）：DL 前面的兄弟元素链上存在 H3 或含 H3 的 DT/P
function ownerH3Of(dl) {
  const parent = dl.parentElement
  if (parent && parent.tagName === 'DT') {
    const h3 = parent.querySelector('h3')
    if (h3) return h3
  }
  let sib = dl.previousElementSibling
  while (sib) {
    if (sib.tagName === 'H3') return sib
    if (sib.tagName === 'DT' || sib.tagName === 'P') {
      const h3 = sib.querySelector('h3')
      if (h3) return h3
    }
    sib = sib.previousElementSibling
  }
  return null
}

// 导入 Chrome 书签 HTML（合并）：URL 去重、同名文件夹复用；返回 { added, skipped, folders }
export function importBookmarksHtml(html) {
  const { rootPages, folders } = parseBookmarksHtml(html)
  let added = 0
  let skipped = 0
  const now = Date.now()
  for (const p of rootPages) {
    if (findBookmarkByUrl(p.url)) { skipped++; continue }
    bookmarkState.list.unshift({ id: genId(), type: 'page', name: p.name, url: p.url, folderId: null, createdAt: now })
    added++
  }
  let folderCount = 0
  for (const [path, pages] of folders) {
    const name = path.split('/').pop()
    let folder = bookmarkState.list.find(b => b.type === 'folder' && b.name === name)
    if (!folder) {
      folder = { id: genId(), type: 'folder', name: uniqueFolderName(name), createdAt: now }
      bookmarkState.list.push(folder)
      folderCount++
    }
    for (const p of pages) {
      if (findBookmarkByUrl(p.url)) { skipped++; continue }
      bookmarkState.list.unshift({ id: genId(), type: 'page', name: p.name, url: p.url, folderId: folder.id, createdAt: now })
      added++
    }
  }
  persist()
  return { added, skipped, folders: folderCount }
}

// HTML 转义
function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// 导出为 Chrome 兼容的 Netscape Bookmark HTML 字符串（可直接导入 Chrome/Edge）
export function exportBookmarksHtml() {
  const now = Math.floor(Date.now() / 1000)
  const folders = bookmarkState.list.filter(b => b.type === 'folder')
  const rootPages = bookmarkState.list.filter(b => b.type === 'page' && !b.folderId)
  const link = p => '        <DT><A HREF="' + esc(p.url) + '" ADD_DATE="' + now + '">' + esc(p.name) + '</A>\n'
  let out = ''
  for (const p of rootPages) out += link(p)
  for (const f of folders) {
    const pages = bookmarkState.list.filter(b => b.type === 'page' && b.folderId === f.id)
    out += '    <DT><H3 ADD_DATE="' + now + '">' + esc(f.name) + '</H3>\n    <DL><p>\n'
    for (const p of pages) out += link(p)
    out += '    </DL><p>\n'
  }
  return '<!DOCTYPE NETSCAPE-Bookmark-file-1>\n' +
    '<!-- This is an automatically generated file.\n     It will be read and overwritten.\n     DO NOT EDIT! -->\n' +
    '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">\n' +
    '<TITLE>Bookmarks</TITLE>\n<H1>Bookmarks</H1>\n<DL><p>\n' +
    out +
    '</DL><p>\n'
}
