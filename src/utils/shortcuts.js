// 应用内快捷键统一管理（渲染进程）
// - 默认键位以「O」开头（OmniDeck / OmniBuddy 的 O），降低与其他产品常见快捷键的冲突概率
// - 支持双字符组合（如 ⌘O+K：按住 O 再按 K），修饰键由浏览器事件提供，
//   普通键序列通过模块级按下键集合跟踪实现
// - 快捷面板为系统级（主进程 globalShortcut，quick-settings.json，仅支持「修饰键+单键」），不在此管理
// - 存储：IndexedDB（key: appShortcuts），读取同步（内存缓存），写入异步
// - 生效方式：设置页改动后 emit('shortcuts:changed')，各监听组件重读配置
import Vue from 'vue'
import { getItem, setItem } from './db'

const STORAGE_KEY = 'appShortcuts'

// 各快捷键默认值（Electron accelerator 风格语法，扩展支持多普通键）
// ⌘O 系列：O = OmniDeck / OmniBuddy 品牌首字母
export const DEFAULT_SHORTCUTS = {
  // 全局搜索（Deck 视图 Topbar）：⌘O K / Ctrl+O K
  search: 'CommandOrControl+O+K',
  // 锁定应用（全局 AppLock）：⌘O L / Ctrl+O L
  lock: 'CommandOrControl+O+L',
  // 唤起助手（Buddy 视图 Spotlight）：⌘O J / Ctrl+O J
  buddy: 'CommandOrControl+O+J'
}

// 事件总线（独立于 $root，避免与业务事件混用）
const bus = new Vue()

// 内存缓存（模块级单例，各窗口同源）
let cache = null

// 读取全部快捷键配置（未配置项回落默认值）
export function getShortcuts() {
  if (!cache) {
    cache = Object.assign({}, DEFAULT_SHORTCUTS, getItem(STORAGE_KEY, {}))
  }
  return cache
}

// 读取单个快捷键 accelerator
export function getShortcut(id) {
  return getShortcuts()[id] || DEFAULT_SHORTCUTS[id]
}

// 校验并保存单个快捷键：
// - 须含至少一个修饰键 + 1~2 个普通键
// - 与其他已配置项冲突时返回错误
export async function saveShortcut(id, accelerator) {
  const parsed = parseAccelerator(accelerator)
  if (!parsed || !parsed.keys.size) {
    return { ok: false, error: '无效的快捷键组合（需包含修饰键）' }
  }
  if (parsed.keys.size > 2) {
    return { ok: false, error: '普通键最多支持 2 个' }
  }
  const all = getShortcuts()
  // 与其它项冲突检测（大小写不敏感）
  const conflict = Object.keys(all).find(k => k !== id && all[k].toLowerCase() === String(accelerator).toLowerCase())
  if (conflict) {
    return { ok: false, error: '与「' + shortcutLabel(conflict) + '」快捷键冲突' }
  }
  all[id] = accelerator
  await setItem(STORAGE_KEY, all)
  bus.$emit('shortcuts:changed')
  return { ok: true }
}

// 恢复全部默认键
export async function resetAllShortcuts() {
  cache = Object.assign({}, DEFAULT_SHORTCUTS)
  await setItem(STORAGE_KEY, cache)
  bus.$emit('shortcuts:changed')
  return { ok: true }
}

// id → 中文名（冲突提示用）
export function shortcutLabel(id) {
  const map = {
    search: '全局搜索',
    lock: '锁定应用',
    buddy: '唤起助手',
    panel: '唤起快捷面板'
  }
  return map[id] || id
}

// 订阅快捷键变更（组件 mounted 时调用，返回解绑函数）
export function onShortcutsChanged(fn) {
  bus.$on('shortcuts:changed', fn)
  return () => bus.$off('shortcuts:changed', fn)
}

// ---------- 展示格式化 ----------
// accelerator → 键帽数组（CommandOrControl+O+K → ['⌘','O','K'] / ['Ctrl','O','K']），平台自感知
export function acceleratorToKeys(a) {
  const isMac = !!(window.electronAPI && window.electronAPI.platform === 'darwin')
  return String(a)
    .split('+')
    .map(k => {
      if (k === 'CommandOrControl' || k === 'CmdOrCtrl') return isMac ? '⌘' : 'Ctrl'
      if (k === 'Command' || k === 'Cmd') return '⌘'
      if (k === 'Control' || k === 'Ctrl') return isMac ? '⌃' : 'Ctrl'
      if (k === 'Alt' || k === 'AltGr') return isMac ? '⌥' : 'Alt'
      if (k === 'Shift') return isMac ? '⇧' : 'Shift'
      if (k === 'Meta' || k === 'Super') return isMac ? '⌘' : 'Win'
      if (isMac && k === 'Space') return '空格'
      return k
    })
}

// accelerator → 展示文案（⌘OK / Ctrl+O+K）
export function formatAccelerator(a) {
  const isMac = !!(window.electronAPI && window.electronAPI.platform === 'darwin')
  return acceleratorToKeys(a).join(isMac ? '' : '+')
}

// ---------- 按下键跟踪（双字符组合支持：⌘O+K 需知道 O 处于按住状态） ----------
const pressedKeys = new Set()
// e.code → 归一键名（KeyK → K / Digit1 → 1）
function normCode(code) {
  return String(code || '').replace(/^(Key|Digit)/, '')
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', e => {
    // 修饰键不记入（由 e.metaKey 等属性精确判断）
    if (['Meta', 'Control', 'Alt', 'Shift'].indexOf(e.key) >= 0) return
    const k = normCode(e.code) || (e.key && e.key.length === 1 ? e.key.toUpperCase() : '')
    if (k) pressedKeys.add(k)
  }, true)
  window.addEventListener('keyup', e => {
    pressedKeys.delete(normCode(e.code))
  }, true)
  // 窗口失焦：清空按住集合，防止粘滞
  window.addEventListener('blur', () => pressedKeys.clear())
}

// ---------- 事件匹配（keydown 事件 → 是否命中快捷键） ----------
const MOD_NAMES = ['COMMANDORCONTROL', 'CMDORCTRL', 'COMMAND', 'CMD', 'CONTROL', 'CTRL', 'ALT', 'ALTGR', 'SHIFT', 'META', 'SUPER']

// 解析 accelerator 为 { mods: Set(修饰键), keys: Set(普通键，1~2 个) }（均大写归一）
export function parseAccelerator(accelerator) {
  const parts = String(accelerator || '').split('+').filter(Boolean).map(p => p.trim().toUpperCase())
  if (!parts.length) return null
  const mods = new Set()
  const keys = new Set()
  for (const p of parts) {
    if (MOD_NAMES.indexOf(p) >= 0) mods.add(p)
    else keys.add(p)
  }
  // 归一：CommandOrControl / CmdOrCtrl → CMD（按平台在 matchesShortcut 判断）
  if (mods.has('COMMANDORCONTROL') || mods.has('CMDORCTRL')) {
    mods.delete('COMMANDORCONTROL')
    mods.delete('CMDORCTRL')
    mods.add('CMD')
  }
  if (!keys.size) return null
  return { mods, keys }
}

// keydown 事件是否命中 accelerator
// - 修饰键精确比对（未要求的修饰键必须未按下，避免 ⌘K 命中 ⌘⇧K）
// - 普通键：当前键或处于按住状态的键（支持双字符组合）
// - 长按重复（e.repeat）不重复触发
export function matchesShortcut(e, accelerator) {
  if (e.repeat) return false
  const parsed = parseAccelerator(accelerator)
  if (!parsed) return false
  const isMac = !!(window.electronAPI && window.electronAPI.platform === 'darwin')
  const mods = parsed.mods
  if (mods.has('CMD') !== (isMac ? e.metaKey : e.ctrlKey)) return false
  if (mods.has('CTRL') !== e.ctrlKey) return false
  if ((mods.has('ALT') || mods.has('ALTGR')) !== e.altKey) return false
  if (mods.has('SHIFT') !== e.shiftKey) return false
  // 普通键（可多个，如 ⌘O+K 的 O 和 K）：全部要求处于按下状态
  const curKey = normCode(e.code) || ((e.key || '').length === 1 ? (e.key || '').toUpperCase() : '')
  for (const k of parsed.keys) {
    if (k !== curKey && !pressedKeys.has(k)) return false
  }
  return true
}
