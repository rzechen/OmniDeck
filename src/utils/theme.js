// 主题工具：主题模式（浅色/深色/跟随系统/自定义）+ 强调色 + IndexedDB 持久化

import { getItem, setItem } from './db'

const MODE_KEY = 'theme-mode'
const COLOR_KEY = 'primary-color'

export const DEFAULT_PRIMARY_COLOR = '#3366FF'

// 强调色选项（与外观模式无关，任何模式下均可选；第一项为默认色）
export const presetColors = [
  { name: '极光蓝', value: '#3366FF' },
  { name: '翡翠绿', value: '#00B96B' },
  { name: '紫罗兰', value: '#722ED1' },
  { name: '活力橙', value: '#FA8C16' },
  { name: '玫瑰粉', value: '#EB2F96' },
  { name: '火焰红', value: '#F5222D' }
]

// 外观模式选项（设置页展示用）；强调色独立于此单独选择
export const themeModes = [
  { value: 'light', label: '浅色', desc: '明亮的界面风格', icon: 'el-icon-sunny' },
  { value: 'dark', label: '深色', desc: '深邃的界面风格', icon: 'el-icon-moon' },
  { value: 'system', label: '跟随系统', desc: '自动匹配系统外观', icon: 'el-icon-monitor' }
]

// 当前主题状态（模块级，供系统变化监听回调用）
let currentMode = 'light'
let currentColor = DEFAULT_PRIMARY_COLOR
let systemWatched = false

function getSystemDark() {
  return !!(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)
}

function isDarkMode(mode) {
  if (mode === 'dark') return true
  if (mode === 'system') return getSystemDark()
  return false
}

// #RRGGBB -> { r, g, b }
function hexToRgb(hex) {
  let h = hex.replace('#', '').trim()
  if (h.length === 3) {
    h = h.split('').map(c => c + c).join('')
  }
  const num = parseInt(h, 16)
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255
  }
}

// 颜色明暗调整：percent > 0 变亮，< 0 变暗
function shade(hex, percent) {
  const { r, g, b } = hexToRgb(hex)
  const t = percent < 0 ? 0 : 255
  const p = Math.abs(percent) / 100
  const mix = v => Math.round((t - v) * p + v)
  const toHex = v => v.toString(16).padStart(2, '0')
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`
}

// 语义状态色基值（与 styles/theme.scss token 保持一致，浅/深两套）
const SEMANTIC_COLORS = {
  success: { light: '#52C41A', dark: '#73D13D' },
  warning: { light: '#FAAD14', dark: '#FFC53D' },
  danger: { light: '#F54A45', dark: '#FF7875' },
  // Element Plus 的 error 与 danger 同义（消息/表单校验取 error）
  error: { light: '#F54A45', dark: '#FF7875' },
  info: { light: '#909399', dark: '#A6A6AF' }
}

// 注入 Element Plus 主题变量（组件内部全部经由这些变量取色，覆盖即全局生效）
// light-3 是 EP 的 hover 色、dark-2 是 active 色，直接对齐业务 hover/active 值；
// light-5/7/8/9 仅做淡背景（plain 标签/禁用底等），按官方比例与白/黑混合：
// 浅色向白混、深色向黑混（避免深底下出现刺眼浅色块）
function setElVars(root, name, base, hover, active, dark) {
  const mixTo = p => shade(base, dark ? -p : p)
  root.style.setProperty(`--el-color-${name}`, base)
  root.style.setProperty(`--el-color-${name}-light-3`, hover || mixTo(30))
  root.style.setProperty(`--el-color-${name}-light-5`, mixTo(50))
  root.style.setProperty(`--el-color-${name}-light-7`, mixTo(70))
  root.style.setProperty(`--el-color-${name}-light-8`, mixTo(80))
  root.style.setProperty(`--el-color-${name}-light-9`, mixTo(90))
  root.style.setProperty(`--el-color-${name}-dark-2`, active || shade(base, dark ? 15 : -20))
}

// 渲染当前主题到全局 CSS 变量
// 外观与强调色相互独立：任何外观下均可使用任意强调色
function render() {
  const root = document.documentElement
  const dark = isDarkMode(currentMode)
  root.dataset.theme = dark ? 'dark' : 'light'
  root.dataset.themeMode = currentMode

  // 深色模式下强调色自动提亮一档（业界惯例：深底上的品牌色更亮更利于辨识）
  // hover/active 方向也随之反转：深色下 hover 更亮，浅色下 hover 微亮、active 加深
  const base = dark ? shade(currentColor, 20) : currentColor
  const { r, g, b } = hexToRgb(base)
  const hover = dark ? shade(currentColor, 32) : shade(currentColor, 12)
  const active = dark ? shade(currentColor, 10) : shade(currentColor, -12)
  root.style.setProperty('--primary-color', base)
  root.style.setProperty('--primary-color-rgb', `${r}, ${g}, ${b}`)
  root.style.setProperty('--primary-color-hover', hover)
  root.style.setProperty('--primary-color-active', active)

  // Element Plus 主题变量：主色对齐业务 hover/active，语义色按当前外观取基值
  setElVars(root, 'primary', base, hover, active, dark)
  for (const [name, pair] of Object.entries(SEMANTIC_COLORS)) {
    setElVars(root, name, pair[dark ? 'dark' : 'light'], null, null, dark)
  }
}

// 应用主题并持久化
export function applyTheme(mode, color) {
  if (mode) currentMode = mode
  if (color) currentColor = color
  render()
  setItem(MODE_KEY, currentMode)
  setItem(COLOR_KEY, currentColor)
}

// 读取持久化的主题（从内存缓存同步读取）
export function getStoredTheme() {
  let mode = getItem(MODE_KEY, 'light')
  // 旧版本存在 'custom' 模式（外观与强调色耦合），统一回落到浅色；其强调色继续沿用
  if (mode === 'custom') mode = 'light'
  return {
    mode,
    color: getItem(COLOR_KEY, DEFAULT_PRIMARY_COLOR)
  }
}

// 跟随系统：注册一次系统外观变化监听（仅 system 模式下响应）
export function watchSystemTheme() {
  if (systemWatched || !window.matchMedia) return
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const handler = () => {
    if (currentMode === 'system') render()
  }
  if (mq.addEventListener) {
    mq.addEventListener('change', handler)
  } else if (mq.addListener) {
    mq.addListener(handler)
  }
  systemWatched = true
}
