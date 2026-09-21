// 背景壁纸：本地图/GIF/视频作为全局背景层
// 存储：壁纸列表（含 Blob 文件本体）与配置分开存放于 IndexedDB
// 壁纸层渲染见 components/AppWallpaper.vue；界面半透明化见 styles/theme.scss

import { getItem, setItem } from './db'

const LIST_KEY = 'wallpaperList'
const CONFIG_KEY = 'wallpaperConfig'

// 默认配置
export const DEFAULT_WALLPAPER_CONFIG = {
  enabled: false,     // 总开关
  selectedId: '',     // 当前选中壁纸 id
  soft: false,        // 柔化：壁纸自身模糊（毛玻璃观感）
  dim: 'none',        // 遮罩浓度：none | light | medium | heavy
  carousel: 'off'     // 轮播：off | 30s | 1m | 5m
}

// 遮罩浓度（黑色遮罩不透明度）
export const dimLevels = { none: 0, light: 0.18, medium: 0.32, heavy: 0.5 }

// 轮播间隔（毫秒）
export const carouselIntervals = { off: 0, '30s': 30000, '1m': 60000, '5m': 300000 }

// 是否视频壁纸（按 MIME 或扩展名判断）
export function isVideoItem(item) {
  if (!item) return false
  if (item.type && item.type.startsWith('video/')) return true
  return /\.(mp4|webm|mov|m4v)$/i.test(item.name || '')
}

// 读取持久化的壁纸列表与配置（启动时调用）
export function getStoredWallpaper() {
  let list = getItem(LIST_KEY, [])
  if (!Array.isArray(list)) list = []
  const config = Object.assign({}, DEFAULT_WALLPAPER_CONFIG, getItem(CONFIG_KEY, {}))
  return { list, config }
}

// 壁纸模式写到 DOM（html dataset），驱动 theme.scss 的半透明变量覆盖
export function applyWallpaperDom(config) {
  const root = document.documentElement
  const list = getItem(LIST_KEY, [])
  const on = !!(config && config.enabled && Array.isArray(list) && list.length)
  if (on) {
    root.dataset.wallpaper = 'on'
  } else {
    delete root.dataset.wallpaper
  }
  if (config && config.soft) {
    root.dataset.wpSoft = 'on'
  } else {
    delete root.dataset.wpSoft
  }
}

// 持久化完整配置
export async function saveWallpaperConfig(config) {
  await setItem(CONFIG_KEY, config)
}

// 添加壁纸文件（File 对象本身就是 Blob，直接入库）
// 返回 { list, config }；首张添加时自动选中
export async function addWallpaperFile(file) {
  if (!file) return null
  const ok = /^(image|video)\//.test(file.type || '') ||
    /\.(gif|jpe?g|png|webp|bmp|mp4|webm|mov|m4v)$/i.test(file.name || '')
  if (!ok) return null
  let list = getItem(LIST_KEY, [])
  if (!Array.isArray(list)) list = []
  list = list.slice()
  const id = 'wp-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
  list.push({ id, name: file.name, type: file.type || '', size: file.size, blob: file })
  const config = Object.assign({}, DEFAULT_WALLPAPER_CONFIG, getItem(CONFIG_KEY, {}))
  if (!config.selectedId) {
    config.selectedId = id
    await setItem(CONFIG_KEY, config)
  }
  await setItem(LIST_KEY, list)
  return { list, config }
}

// 删除壁纸；若删除的是当前选中项，自动切换到第一张（无壁纸时关闭总开关）
export async function removeWallpaper(id) {
  let list = getItem(LIST_KEY, [])
  if (!Array.isArray(list)) list = []
  list = list.filter(w => w && w.id !== id)
  const config = Object.assign({}, DEFAULT_WALLPAPER_CONFIG, getItem(CONFIG_KEY, {}))
  if (config.selectedId === id) {
    config.selectedId = list.length ? list[0].id : ''
    if (!list.length) config.enabled = false
    await setItem(CONFIG_KEY, config)
  }
  await setItem(LIST_KEY, list)
  return { list, config }
}
