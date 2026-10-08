// OmniDeck 滚动长截图：选区（同选区截图）→ 选区内静止后弹出控制条小窗
// （✓完成 / ✕取消）→ 用户每滚动一段内容点「拍一帧」（或自动连拍）→
// 每帧整屏截取 crop 选区 → 相邻帧按重叠行像素匹配拼接（自底向上找最佳
// 对齐）→ 完成后入库 + 复制。
const path = require('path')
const { BrowserWindow, nativeImage, clipboard } = require('electron')
const { physRectOf } = require('./native')
const { status, grabDisplay } = require('./screen')
const { waitPick, isSelecting, closeOverlays } = require('./overlay')
const { addRecord } = require('./records')

let scrollSession = null // { display, rectPhys, frames: [NativeImage], ctrlWin }

// 控制条小窗：贴在选区下方（空间不足贴上方），始终置顶
function openScrollCtrl(display, phys) {
  const factor = display.scaleFactor || 1
  const cw = 208
  const ch = 44
  // 物理 → CSS 坐标
  const rx = display.bounds.x + phys.x / factor
  const ryBottom = display.bounds.y + (phys.y + phys.height) / factor
  const ryTop = display.bounds.y + phys.y / factor
  const under = ryBottom + ch + 8 <= display.bounds.y + display.bounds.height
  const win = new BrowserWindow({
    x: Math.round(display.bounds.x + Math.max(0, phys.x / factor + phys.width / factor - cw)),
    y: under ? Math.round(ryBottom + 8) : Math.round(ryTop - ch - 8),
    width: cw,
    height: ch,
    show: false,
    frame: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    focusable: true,
    alwaysOnTop: true,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, '../../preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  })
  win.setAlwaysOnTop(true, 'screen-saver')
  const url = '#/capture-scroll-ctrl'
  const load = process.env.ELECTRON_RENDERER_URL
    ? win.loadURL(process.env.ELECTRON_RENDERER_URL + url)
    : win.loadFile(path.join(__dirname, '../../../dist/index.html'), { hash: url })
  load.then(() => { if (!win.isDestroyed()) win.show() }).catch(() => {})
  return win
}

function closeScrollCtrl() {
  const s = scrollSession
  if (s && s.ctrlWin) {
    try { if (!s.ctrlWin.isDestroyed()) s.ctrlWin.destroy() } catch (e) { /* 忽略 */ }
  }
}

// 长截图入口（overlay-先行）：选区 → 捕获首帧 → 连拍模式（后续帧 SCK 实时
// 捕获，控制条小窗属自身进程被排除，不入镜）
async function captureScroll() {
  const st = status()
  if (!st.granted) return { ok: false, reason: 'permission' }
  if (isSelecting()) return { ok: false, reason: 'busy' }
  if (scrollSession) return { ok: false, reason: 'busy' }

  try {
    const picked = await waitPick('scroll')
    if (!picked || !picked.ok || !picked.rect) return { ok: false, reason: 'cancelled' }
    const { display, rect } = picked

    const first = await grabDisplay(display)
    if (!first.ok) return first

    const phys = physRectOf(display, rect)
    scrollSession = {
      display,
      phys,
      frames: [first.image.crop(phys)],
      ctrlWin: null,
      hidden: []
    }
    scrollSession.ctrlWin = openScrollCtrl(display, phys)
    return { ok: true, started: true, count: scrollSession.frames.length }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  } finally {
    closeOverlays()
  }
}

// 拍一帧：截当前屏 crop 选区（用户已滚动内容）
async function scrollShot() {
  const s = scrollSession
  if (!s) return { ok: false, reason: 'idle' }
  const res = await grabDisplay(s.display)
  if (!res.ok) return res
  s.frames.push(res.image.crop(s.phys))
  return { ok: true, count: s.frames.length }
}

// 帧数据行哈希（RGBA 每行取每 4 字节首字节 + 行号聚合，快速比对）
function rowSignature(buf, width, y) {
  let h = 5381
  const base = y * width * 4
  for (let x = 0; x < width; x += 4) {
    h = ((h << 5) + h + buf[base + x * 4]) >>> 0
  }
  return h
}

// 拼接：后一帧在已有长图底部附近找最佳重叠（像素行签名匹配），无重叠则直接续接
function stitchFrames(frames) {
  if (!frames.length) return null
  const raws = frames.map(f => f.toBitmap()) // RGBA buffer
  const width = frames[0].getSize().width
  // 汇总画布：按最大可能高度累计，逐段拷贝
  let outHeight = 0
  const segs = [] // { buf, height, overlap }
  for (let i = 0; i < frames.length; i++) {
    const h = frames[i].getSize().height
    if (i === 0) {
      segs.push({ buf: raws[i], height: h, overlap: 0 })
      outHeight += h
      continue
    }
    // 在已拼长图底部（最多 min(既有高, 本帧高) 行）内找本帧顶部的最佳对齐：
    // 取本帧顶部若干候选行的签名，与长图底段各行比对，命中行数最多者胜
    const prev = segs[segs.length - 1]
    const probeRows = []
    for (let r = 2; r < Math.min(h, 40); r += 6) probeRows.push(r)
    const maxSearch = Math.min(prev.height, h)
    let bestOverlap = 0
    let bestHits = 0
    // 长图底段行签名缓存（懒生成）
    const sigCache = new Map()
    const prevSig = y => {
      if (sigCache.has(y)) return sigCache.get(y)
      const v = rowSignature(prev.buf, width, prev.height - 1 - y)
      sigCache.set(y, v)
      return v
    }
    for (let ov = 8; ov <= maxSearch; ov += 2) {
      let hits = 0
      for (const r of probeRows) {
        if (r >= ov) break
        if (rowSignature(raws[i], width, r) === prevSig(ov - 1 - r)) hits++
      }
      if (hits > bestHits) { bestHits = hits; bestOverlap = ov }
      if (bestHits >= probeRows.length) break // 全命中即锁定
    }
    segs.push({ buf: raws[i], height: h, overlap: bestOverlap })
    outHeight += h - bestOverlap
  }

  // RGBA 直拼 → PNG（nativeImage 不认 RGBA bitmap 拼接结果，直接构造 dataURL 交给渲染端转 PNG）
  // Electron nativeImage.createFromBitmap 支持 RGBA raw buffer
  const out = Buffer.alloc(width * outHeight * 4)
  let dst = 0
  for (let i = 0; i < segs.length; i++) {
    const { buf, height, overlap } = segs[i]
    const srcStart = (i === 0 ? 0 : overlap) * width * 4
    const rows = height - (i === 0 ? 0 : overlap)
    buf.copy(out, dst, srcStart, srcStart + rows * width * 4)
    dst += rows * width * 4
  }
  return nativeImage.createFromBitmap(out, { width, height: outHeight })
}

// 完成长截图：拼接 → 入库 → 复制剪贴板
async function scrollFinish() {
  const s = scrollSession
  if (!s) return { ok: false, reason: 'idle' }
  closeScrollCtrl()
  const hidden = s.hidden || []
  scrollSession = null
  try {
    const image = stitchFrames(s.frames)
    if (!image || image.isEmpty()) return { ok: false, error: '拼接失败' }
    try { clipboard.writeImage(image) } catch (e) { /* 忽略 */ }
    return { ok: true, image: addRecord(image, { kind: 'scroll' }) }
  } catch (e) {
    return { ok: false, error: e.message || String(e) }
  } finally {
    for (const w of hidden) {
      try { if (!w.isDestroyed()) w.show() } catch (e) { /* 忽略 */ }
    }
  }
}

// 取消长截图：丢弃全部帧
function scrollCancel() {
  const s = scrollSession
  if (!s) return { ok: false, reason: 'idle' }
  closeScrollCtrl()
  const hidden = s.hidden || []
  scrollSession = null
  for (const w of hidden) {
    try { if (!w.isDestroyed()) w.show() } catch (e) { /* 忽略 */ }
  }
  return { ok: true }
}

module.exports = {
  // 长截图入口：选区 → 首帧 → 连拍模式（控制条小窗）
  captureScroll,
  // 拍一帧（截当前屏 crop 选区）
  scrollShot,
  // 完成长截图：像素对齐拼接 → 入库 → 复制
  scrollFinish,
  // 取消长截图：丢弃全部帧
  scrollCancel
}
