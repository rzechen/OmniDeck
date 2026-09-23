// 壁纸市场（本地目录 + 远程拉取）
// 目录选择/扫描：Electron 原生 dialog + 主进程磁盘扫描（preload wallpaperMarket 桥）
// ——不依赖 webkitdirectory（macOS 面板按钮被 Chromium 硬编码为「Upload」），
//   磁盘路径模式条目按需读盘，无 File 句柄失效问题
//
// 目录规则（仅两层）：
//   <所选目录>/动态壁纸/   mp4/webm/mov/m4v（可放同名 jpg/png 作封面）
//   <所选目录>/静态壁纸/   jpg/png/webp/gif/bmp

import { getItem, setItem } from './db'

const DIR_KEY = 'localWallpaperDir'

// preload 暴露的壁纸市场 API（未重启加载旧 preload 时为 null）
export function wpMarketApi() {
  return (window.electronAPI && window.electronAPI.wallpaperMarket) || null
}

// 已保存的壁纸目录（空串 = 未选择）
export function getSavedWallpaperDir() {
  return getItem(DIR_KEY, '') || ''
}

export function saveWallpaperDir(dir) {
  setItem(DIR_KEY, dir || '')
}

// 按扩展推断 MIME（File 构造用）
export function mimeOf(name) {
  const ext = (String(name).split('.').pop() || '').toLowerCase()
  const map = {
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/x-m4v',
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp'
  }
  return map[ext] || ''
}

export function isVideoFile(name) {
  return /\.(mp4|webm|mov|m4v)$/i.test(String(name || ''))
}

// 原生目录选择（主进程 dialog）：返回目录路径或 null（取消）
export async function pickWallpaperDirectory() {
  const wm = wpMarketApi()
  if (!wm || !wm.pickDir) return null
  try {
    const res = await wm.pickDir()
    if (!res || !res.ok) return null
    return res.path
  } catch (e) {
    return null
  }
}

// 扫描本地壁纸目录（主进程）：{ ok, items: [{name,path,category,size,cover}], missing }
export async function scanLocalWallpaperDir(dir) {
  const wm = wpMarketApi()
  if (!wm || !wm.scanDir) throw new Error('壁纸市场能力未加载')
  const res = await wm.scanDir(dir)
  if (!res || !res.ok) throw new Error((res && res.error) || '扫描失败')
  return res
}

// 读取磁盘文件为 File（「使用」壁纸 / 封面缩略）
export async function readPulledFile(filePath) {
  const wm = wpMarketApi()
  if (!wm) throw new Error('壁纸市场能力未加载')
  const res = await wm.readFile(filePath)
  if (!res || !res.ok) throw new Error((res && res.error) || '文件读取失败')
  return new File([res.data], res.name, { type: mimeOf(res.name) })
}

// ============ 磁盘缩略 objectURL 缓存（按路径） ============
const diskThumbCache = {}

// 读磁盘封面/图片生成 objectURL（失败返回 ''，卡片回退角标）
export async function getDiskThumbUrl(filePath) {
  if (!filePath) return ''
  if (diskThumbCache[filePath] !== undefined) return diskThumbCache[filePath]
  try {
    const file = await readPulledFile(filePath)
    diskThumbCache[filePath] = URL.createObjectURL(file)
  } catch (e) {
    diskThumbCache[filePath] = ''
  }
  return diskThumbCache[filePath]
}

// ============ 视频首帧封面（文件选择的 mp4 自动生成缩略） ============
// video → seek 首帧 → canvas 截帧 → jpeg Blob；失败返回 null（列表回退播放角标）
export function captureVideoPoster(file) {
  return new Promise(resolve => {
    let settled = false
    let url = ''
    let timer = 0
    let video = null
    let seeked = false
    const done = b => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try { URL.revokeObjectURL(url) } catch (e) { /* 忽略 */ }
      resolve(b || null)
    }
    const drawFrame = () => {
      if (!video) return done(null)
      try {
        const w = video.videoWidth || 480
        const h = video.videoHeight || 270
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(video, 0, 0, w, h)
        canvas.toBlob(b => done(b), 'image/jpeg', 0.82)
      } catch (e) {
        console.warn('[wp-poster] drawFrame failed:', e && e.message)
        done(null)
      }
    }
    // seek 到 0.5s 或时长 1/10（避开纯黑首帧）；仅执行一次
    const seek = () => {
      if (seeked || !video) return
      seeked = true
      try {
        video.currentTime = Math.min(0.5, (video.duration || 1) / 10)
      } catch (e) {
        drawFrame()
      }
    }
    try {
      url = URL.createObjectURL(file)
      video = document.createElement('video')
      video.muted = true
      video.preload = 'auto'
      video.src = url
      video.addEventListener('loadeddata', seek)
      video.addEventListener('canplay', seek) // 环境差异兜底：loadeddata 不触发时经 canplay 触发
      video.addEventListener('seeked', drawFrame)
      video.addEventListener('error', () => {
        console.warn('[wp-poster] video decode error')
        done(null)
      })
      video.load() // 显式触发加载
      timer = setTimeout(() => {
        console.warn('[wp-poster] timeout, readyState =', video ? video.readyState : 'n/a')
        done(null)
      }, 8000)
    } catch (e) {
      console.warn('[wp-poster] init failed:', e && e.message)
      done(null)
    }
  })
}
