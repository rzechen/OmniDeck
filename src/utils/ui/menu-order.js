// 侧边栏菜单排序持久化（IndexedDB）
// 结构：{ groupKeys: ['tools'], children: { tools: ['Format', 'Convert', ...] } }

import { getItem, setItem, removeItem } from '../storage/db'

const KEY = 'menu-order'

export function saveMenuOrder(order) {
  setItem(KEY, order)
}

export function getMenuOrder() {
  return getItem(KEY, null)
}

export function clearMenuOrder() {
  removeItem(KEY)
}
