// 壁纸市场拉取：从 GitCode 资源仓库（omni-resources）下载壁纸到用户本地目录
// - manifest：raw API 拉清单（内存缓存 10 分钟）
// - pull：串行下载（视频+封面成对）→ 写入 <dir>/动态壁纸|静态壁纸/，同名封面自动配对
// - 429 防护：请求间隔 + 指数退避重试 + 明确错误提示；文件已存在且大小一致则跳过
// - 进度经 'wallpaper-market:progress' 推送 { done, total, name }
const fs = require('fs')
const path = require('path')
const { ipcMain, net, dialog } = require('electron')
const remote = require('../../src/config/remote.cjs')

// 资源仓库（维护于 src/config/remote.cjs）：raw 前缀 + 默认分支
const RAW_BASE = remote.rawBase('resources')
const REPO_REF = remote.ref('resources')

const MANIFEST_TTL = 10 * 60 * 1000
const VIDEO_EXT = /\.(mp4|webm|mov|m4v)$/i
const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp)$/i
const DYNAMIC_DIRS = ['动态壁纸', 'dynamic']
const STATIC_DIRS = ['静态壁纸', 'static']
// 下载节奏：条目间隔 + 退避（防 429）
const ITEM_INTERVAL = 800
const RETRY_DELAYS = [1000, 2000, 4000]

let manifestCache = null // { data, at }

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ---------- 下载与清单拉取 ----------
// 单文件下载（Buffer；支持 429 退避重试）
async function downloadBuffer(url, { timeout = 60000, maxSize = 200 * 1024 * 1024 } = {}) {
  for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
    const res = await once(url, { timeout, maxSize })
    if (res.ok) return res
    // 429/网络中断可重试；其余直接失败
    const retryable = res.retryable
    if (!retryable || attempt === RETRY_DELAYS.length) return res
    await sleep(RETRY_DELAYS[attempt])
  }
}

function once(url, { timeout, maxSize }) {
  return new Promise(resolve => {
    let settled = false
    const finish = data => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(data)
    }
    const req = net.request({ url, redirect: 'follow' })
    req.setHeader('User-Agent', 'OmniDeck-WallpaperMarket')
    const timer = setTimeout(() => {
      req.abort()
      finish({ ok: false, error: '下载超时', retryable: true })
    }, timeout)

    let chunks = []
    let size = 0
    req.on('response', res => {
      if (res.statusCode === 429) {
        req.abort()
        finish({ ok: false, error: '触发 GitCode 访问限流（429）', retryable: true })
        return
      }
      if (res.statusCode !== 200) {
        req.abort()
        finish({ ok: false, error: `下载失败（HTTP ${res.statusCode}）`, retryable: false })
        return
      }
      res.on('data', chunk => {
        chunks.push(chunk)
        size += chunk.length
        if (size > maxSize) {
          req.abort()
          finish({ ok: false, error: '文件超出大小限制', retryable: false })
        }
      })
      res.on('end', () => finish({ ok: true, data: Buffer.concat(chunks) }))
      res.on('error', () => finish({ ok: false, error: '网络响应中断', retryable: true }))
    })
    req.on('error', () => finish({ ok: false, error: '网络请求失败', retryable: true }))
    req.end()
  })
}

// 拉取 manifest（TTL 缓存）
async function fetchManifest(useCache = true) {
  if (useCache && manifestCache && Date.now() - manifestCache.at < MANIFEST_TTL) {
    return { ok: true, data: manifestCache.data }
  }
  const res = await downloadBuffer(`${RAW_BASE}/manifest.json?ref=${REPO_REF}`, { timeout: 15000 })
  if (!res.ok) return { ok: false, error: res.error }
  let data
  try {
    data = JSON.parse(res.data.toString('utf-8'))
  } catch (e) {
    return { ok: false, error: 'manifest 解析失败' }
  }
  manifestCache = { data, at: Date.now() }
  return { ok: true, data }
}

// 仓库内路径 → raw URL
function rawUrl(p) {
  return `${RAW_BASE}/${String(p).split('/').map(encodeURIComponent).join('/')}?ref=${REPO_REF}`
}

// 写文件（已存在且大小一致跳过）
function writeFileIfChanged(filePath, buf) {
  try {
    const st = fs.statSync(filePath)
    if (st.size === buf.length) return false // 已存在，跳过
  } catch (e) { /* 不存在，继续写 */ }
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, buf)
  return true
}

// ---------- 壁纸拉取与本地读取 ----------
// 拉取条目集合到目录：返回 { ok, pulled, skipped }（pulled 含磁盘路径供渲染层立即使用）
async function pull(payload, event) {
  const dir = payload && payload.dir
  const ids = (payload && payload.ids) || []
  if (!dir || typeof dir !== 'string') return { ok: false, error: '未指定壁纸目录' }
  if (!Array.isArray(ids) || !ids.length) return { ok: false, error: '未选择要拉取的壁纸' }

  let st
  try {
    st = fs.statSync(dir)
  } catch (e) {
    return { ok: false, error: '壁纸目录不存在（可能已被移动）' }
  }
  if (!st.isDirectory()) return { ok: false, error: '壁纸目录路径不是目录' }

  const mf = await fetchManifest(true)
  if (!mf.ok) return { ok: false, error: mf.error }
  const all = (mf.data && Array.isArray(mf.data.items)) ? mf.data.items : []
  const items = ids.map(id => all.find(it => it && it.id === id)).filter(Boolean)
  if (!items.length) return { ok: false, error: '市场清单中未找到所选壁纸' }

  const send = p => {
    if (event && event.sender && !event.sender.isDestroyed()) {
      try {
        event.sender.send('wallpaper-market:progress', p)
      } catch (e) { /* 窗口销毁竞态忽略 */ }
    }
  }

  const total = items.length
  const pulled = []
  let skipped = 0
  send({ done: 0, total, name: '' })

  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    const isImage = it.type === 'image'
    const subDir = isImage ? '静态壁纸' : '动态壁纸'
    const fileName = isImage ? (it.image || it.cover || '').split('/').pop() : (it.video || '').split('/').pop()
    if (!fileName) continue
    send({ done: i, total, name: fileName })

    const destDir = path.join(dir, subDir)
    const destPath = path.join(destDir, fileName)
    const base = fileName.replace(/\.[^.]+$/, '')

    // 主文件（视频/图片）
    const mainRes = await downloadBuffer(rawUrl(isImage ? it.image : it.video))
    if (!mainRes.ok) return { ok: false, error: `「${fileName}」${mainRes.error}` }
    const wrote = writeFileIfChanged(destPath, mainRes.data)
    if (!wrote) skipped++

    const entry = {
      name: fileName,
      path: destPath,
      category: isImage ? 'static' : 'dynamic',
      size: mainRes.data.length,
      coverPath: '',
      // 远程封面 URL（渲染层列表立即可显示，无需读盘）
      remoteCoverUrl: it.cover ? rawUrl(it.cover) : ''
    }

    // 封面（与视频同名落盘，自动配对）
    if (!isImage && it.cover) {
      const coverName = base + '.' + (it.cover.split('.').pop() || 'jpg')
      const coverPath = path.join(destDir, coverName)
      const coverRes = await downloadBuffer(rawUrl(it.cover))
      if (coverRes.ok) {
        writeFileIfChanged(coverPath, coverRes.data)
        entry.coverPath = coverPath
      }
      // 封面失败不阻断（视频仍可用，列表回退角标）
    }

    pulled.push(entry)
    // 逐条推送：携带 entry 供渲染层实时并入列表展示
    send({ done: i + 1, total, name: fileName, entry })
    if (i < items.length - 1) await sleep(ITEM_INTERVAL)
  }

  return { ok: true, pulled, skipped }
}

// 读本地文件 → ArrayBuffer（拉取完成后渲染层立即构造 File 入库）
function readFileAbs(p) {
  if (!p || typeof p !== 'string') return { ok: false, error: '参数错误' }
  let st
  try {
    st = fs.statSync(p)
  } catch (e) {
    return { ok: false, error: '文件不存在（可能已被移动或删除）' }
  }
  if (!st.isFile()) return { ok: false, error: '目标不是文件' }
  try {
    const buf = fs.readFileSync(p)
    return {
      ok: true,
      name: path.basename(p),
      size: st.size,
      data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)
    }
  } catch (e) {
    return { ok: false, error: '读取失败：' + e.message }
  }
}

// ---------- 本地壁纸目录扫描（两级结构：动态壁纸/ 静态壁纸/，兼容 dynamic/static） ----------
// 一级平铺；动态目录中与视频同名的图片自动配对为封面；垃圾文件（.DS_Store/._*）过滤
function scanDir(dir) {
  if (!dir || typeof dir !== 'string') return { ok: false, error: '未指定壁纸目录' }
  let st
  try {
    st = fs.statSync(dir)
  } catch (e) {
    return { ok: false, error: '目录不存在或无法访问（可能已被移动或重命名）' }
  }
  if (!st.isDirectory()) return { ok: false, error: '所选路径不是目录' }

  const findSub = names => {
    for (const n of names) {
      const p = path.join(dir, n)
      try {
        if (fs.statSync(p).isDirectory()) return p
      } catch (e) { /* 尝试下一个 */ }
    }
    return null
  }
  const listFlat = sub => {
    try {
      return fs.readdirSync(sub, { withFileTypes: true })
        .filter(e => e.isFile() && !e.name.startsWith('.') && !e.name.startsWith('._'))
        .map(e => {
          const full = path.join(sub, e.name)
          let size = 0
          let mtime = 0
          try {
            const s = fs.statSync(full)
            size = s.size
            mtime = s.mtimeMs
          } catch (err) { /* 保留条目 */ }
          return { name: e.name, path: full, size, mtime }
        })
        .sort((a, b) => b.mtime - a.mtime)
    } catch (e) {
      return []
    }
  }

  const dynDir = findSub(DYNAMIC_DIRS)
  const staDir = findSub(STATIC_DIRS)
  const base = n => n.replace(/\.[^.]+$/, '')
  const items = []

  if (dynDir) {
    const files = listFlat(dynDir)
    const coverMap = new Map(files.filter(f => IMAGE_EXT.test(f.name)).map(f => [base(f.name), f.path]))
    files.filter(f => VIDEO_EXT.test(f.name)).forEach(f => {
      items.push({ name: f.name, path: f.path, category: 'dynamic', size: f.size, cover: coverMap.get(base(f.name)) || '' })
    })
  }
  if (staDir) {
    listFlat(staDir).filter(f => IMAGE_EXT.test(f.name)).forEach(f => {
      items.push({ name: f.name, path: f.path, category: 'static', size: f.size, cover: '' })
    })
  }

  const missing = []
  if (!items.some(it => it.category === 'dynamic')) missing.push('动态壁纸')
  if (!items.some(it => it.category === 'static')) missing.push('静态壁纸')
  return { ok: true, items, missing }
}

// ---------- IPC 注册 ----------
function registerIpc() {
  // 原生目录选择（macOS webkitdirectory 面板按钮被 Chromium 硬编码为「Upload」，故走原生 dialog）
  ipcMain.handle('wallpaper-market:pick-dir', async () => {
    const res = await dialog.showOpenDialog({
      properties: ['openDirectory', 'createDirectory'],
      buttonLabel: '选择此目录'
    })
    if (res.canceled || !res.filePaths.length) return { ok: false, canceled: true }
    return { ok: true, path: res.filePaths[0] }
  })
  // 本地壁纸目录扫描
  ipcMain.handle('wallpaper-market:scan-dir', (_e, dir) => scanDir(dir))
  ipcMain.handle('wallpaper-market:manifest', (_e, useCache) => fetchManifest(useCache !== false))
  ipcMain.handle('wallpaper-market:pull', (e, payload) => pull(payload, e))
  ipcMain.handle('wallpaper-market:read-file', (_e, p) => readFileAbs(p))
}

// 注册壁纸市场 IPC（选目录 / 扫描 / 清单 / 拉取 / 读文件）
module.exports = { registerIpc }
