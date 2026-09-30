// 运行时组件在线装配（主进程）：瘦身版安装包按需下载 python-env / node / node-tools / pandoc
// 清单来源：OmniBuddy-Plugins 双仓库（GitCode 主源国内快 / GitHub 备源）的 runtime-manifest.json
// 流程：拉 manifest → components[name].targets[plat] → 依次尝试 urls → 流式下载（停滞 90s 超时）
//       → sha256 校验 → 解压装配到 <userData>/omnibuddy/runtime/<plat>/ → 写 installed.json 台账
// 进度经 'omnibuddy:runtime:progress' 推送 { component, phase, received, total, percent, error }
// 放主进程而非 agent 子进程的原因：子进程联网仅 fetchBuffer（50MB 上限 + base64 内存回传），
// 主进程 net 具系统代理语义（GitHub 备源需要）且可流式写盘、直接 event.sender.send 推进度。
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { spawn } = require('child_process')
const { ipcMain, net } = require('electron')
const AdmZip = require('adm-zip')
const runtime = require('../agent/runtime')

// manifest 双源（与 scripts/runtime-publish.sh 推送地址一致）
const MANIFEST_URLS = [
  'https://raw.gitcode.com/m0_59492087/OmniBuddy-Plugins/raw/main/runtime-manifest.json',
  'https://raw.githubusercontent.com/rzechen/OmniBuddy-Plugins/main/runtime-manifest.json'
]
// GitCode 反爬：无 UA 的 raw / release 请求 403 / 401，须带浏览器 UA 且仅 GET
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
const MANIFEST_TTL = 10 * 60 * 1000
// 下载停滞超时（非总超时：发布侧 228MB 经代理传 50 分钟仍成功，慢链路只罚停滞）
const STALL_TIMEOUT = 90 * 1000

let baseDir = '' // <userData>/omnibuddy（init 注入）
let manifestCache = null // { data, at }
const inFlight = new Map() // component -> promise（防重复安装）
let progressSink = null // 后台装配进度汇聚器（setup.js 注入；无 event 上下文时兜底）

const isWin = () => process.platform === 'win32'
const isPosix = () => process.platform !== 'win32'

// manifest 平台口径（windows-x86_64；与 runtime.platKey 的 win-x86_64 不同，两套并存）
function manifestPlat() {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x86_64'
  if (process.platform === 'win32') return 'windows-x86_64'
  if (process.platform === 'linux') return process.arch === 'arm64' ? 'linux-aarch64' : 'linux-x86_64'
  return ''
}

// 在线装配根目录：<userData>/omnibuddy/runtime/<platKey>（与 runtime.downloadedRootDir 同口径）
function downloadedRoot() {
  if (!baseDir) return ''
  return path.join(baseDir, 'runtime', runtime.platKey())
}

// playwright 组件 rev（落位目录名带 rev 号；与 scripts/provision-runtime.sh
// 的 PW_*_REV 常量同源，playwright 升级时两处同步改）
const PW_REV = {
  chrome: 'chromium_headless_shell-1244',
  ffmpeg: 'ffmpeg-1011',
  winldd: 'winldd-1007'
}

// 组件规则表：installDir = zip 解压落位（相对 runtime 根）；ownDir = 卸载整体删除的目录；
// marker = 装配成功探测路径；freshExtract = 解压前先清 ownDir（防旧版残留混装）
// 布局依据 scripts/provision-runtime.sh 的打包口径：
// - python-env macOS zip 内含 python/（解到根）；Windows zip 根即 env 内容（解到 python/）
// - node-tools zip 根为 node 目录内部结构（解到 node/）
// - node darwin 官方包为 tar.gz（内含一层版本目录，strip 1）；Windows zip 根级 node.exe（解到 node/）
// - pandoc 官方 zip 内 pandoc-<ver>-<asset>/bin/pandoc(.exe)（Windows 可能无 bin/ 层，find 落位）
const COMPONENT_RULES = {
  'python-env': {
    label: 'Python 环境',
    description: '内置 Python 解释器与 site-packages（numpy / pandas / openpyxl 等预装依赖）。',
    group: '解释器与依赖库',
    installDir: () => (isWin() ? 'python' : ''),
    ownDir: 'python',
    marker: () => (isWin() ? 'python/python.exe' : 'python/bin/python3'),
    freshExtract: true
  },
  'node': {
    label: 'Node.js 运行时',
    description: 'Node.js 官方发行版（node / npm 可执行），agent 工具链与 npx 依赖它。',
    group: '解释器与依赖库',
    installDir: () => 'node',
    ownDir: 'node',
    marker: () => (isWin() ? 'node/node.exe' : 'node/bin/node'),
    freshExtract: true,
    darwinTarGz: true
  },
  'node-tools': {
    label: 'Node 预装库',
    description: '沙箱增强集（sharp / docx / pptxgenjs / pdf-lib / pdfjs-dist / marked）。',
    group: '解释器与依赖库',
    installDir: () => 'node',
    marker: () => (isWin() ? 'node/node_modules/sharp' : 'node/lib/node_modules/sharp'),
    // 与官方 node 共享 node/ 目录（npm 全局位置），卸载只精删已知包、不动其余
    uninstallList: ['sharp', 'docx', 'pptxgenjs', 'pdf-lib', 'pdfjs-dist', 'marked']
  },
  'pandoc': {
    label: 'Pandoc 转换器',
    description: '文档转换引擎（Markdown ↔ Word / HTML 等），文档导出与预览共用。',
    group: '文档转换',
    installDir: () => 'pandoc',
    ownDir: 'pandoc',
    marker: () => (isWin() ? 'pandoc/bin/pandoc.exe' : 'pandoc/bin/pandoc'),
    freshExtract: true,
    // 官方 zip 布局随平台变化，走 zip 内查找二进制的特殊落位
    pandocStyle: true
  },
  // playwright 三组件：zip 解到 playwright-browsers/<包名>-<rev>/（与 provision
  // 内置装配同构布局，chromeHeadlessBin / playwright MCP 按 rev 目录扫描）；
  // marker 用装配完成标记而非精确二进制路径（ffmpeg 各平台内层结构不一致）
  'chrome-headless-shell': {
    label: 'Chrome 无头内核',
    description: 'playwright 无头浏览器内核（PDF 渲染 / 浏览器 MCP 的渲染引擎）。',
    group: '浏览器内核与辅助',
    installDir: () => 'playwright-browsers/' + PW_REV.chrome,
    ownDir: 'playwright-browsers/' + PW_REV.chrome,
    marker: () => 'playwright-browsers/' + PW_REV.chrome + '/INSTALLATION_COMPLETE',
    freshExtract: true,
    completeFile: true
  },
  'ffmpeg': {
    label: 'FFmpeg 媒体组件',
    description: 'playwright 配套 ffmpeg（浏览器录屏与媒体处理的编解码）。',
    group: '浏览器内核与辅助',
    installDir: () => 'playwright-browsers/' + PW_REV.ffmpeg,
    ownDir: 'playwright-browsers/' + PW_REV.ffmpeg,
    marker: () => 'playwright-browsers/' + PW_REV.ffmpeg + '/INSTALLATION_COMPLETE',
    freshExtract: true,
    completeFile: true
  },
  'winldd': {
    label: 'WinLdd 辅助工具',
    description: 'playwright Windows 落地依赖（浏览器进程树清理助手，仅 Windows 发行）。',
    group: '浏览器内核与辅助',
    installDir: () => 'playwright-browsers/' + PW_REV.winldd,
    ownDir: 'playwright-browsers/' + PW_REV.winldd,
    marker: () => 'playwright-browsers/' + PW_REV.winldd + '/INSTALLATION_COMPLETE',
    freshExtract: true,
    completeFile: true,
    winOnly: true
  },
  // MinGit：Windows 无系统 git 时的兜底（插件市场 / 仓库同步依赖）；原「安装包内置
  // 解压」已取消，统一改为在线装配（与全套组件口径一致），zip 根即 cmd/git.exe 布局
  'mingit': {
    label: 'Git 工具',
    description: 'MinGit 便携版 Git（插件市场与仓库同步的基础依赖，仅 Windows 发行）。',
    group: '解释器与依赖库',
    installDir: () => 'git',
    ownDir: 'git',
    marker: () => 'git/cmd/git.exe',
    freshExtract: true,
    winOnly: true
  }
}

// ---------- 小文件内存拉取（manifest） ----------

function fetchBufferOnce(url, timeout) {
  return new Promise(resolve => {
    let settled = false
    const finish = data => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      resolve(data)
    }
    const req = net.request({ url, redirect: 'follow' })
    req.setHeader('User-Agent', UA)
    const timer = setTimeout(() => {
      req.abort()
      finish({ ok: false, error: '请求超时' })
    }, timeout)
    const chunks = []
    req.on('response', res => {
      if (res.statusCode !== 200) {
        req.abort()
        finish({ ok: false, error: `HTTP ${res.statusCode}` })
        return
      }
      res.on('data', c => chunks.push(c))
      res.on('end', () => finish({ ok: true, data: Buffer.concat(chunks) }))
      res.on('error', () => finish({ ok: false, error: '网络响应中断' }))
    })
    req.on('error', () => finish({ ok: false, error: '网络请求失败' }))
    req.end()
  })
}

async function fetchBuffer(url, timeout) {
  const res = await fetchBufferOnce(url, timeout)
  return res.ok ? res : { ok: false, error: `${url.split('/')[2]}：${res.error}` }
}

// 拉取 manifest（双源依次回退 + TTL 缓存）
async function fetchManifest(useCache = true) {
  if (useCache && manifestCache && Date.now() - manifestCache.at < MANIFEST_TTL) {
    return { ok: true, data: manifestCache.data }
  }
  let lastError = ''
  for (const url of MANIFEST_URLS) {
    const res = await fetchBuffer(url, 15000)
    if (!res.ok) {
      lastError = res.error
      continue
    }
    try {
      const data = JSON.parse(res.data.toString('utf-8'))
      manifestCache = { data, at: Date.now() }
      return { ok: true, data }
    } catch (e) {
      lastError = 'manifest 解析失败'
    }
  }
  return { ok: false, error: lastError || '清单拉取失败' }
}

// ---------- 大文件流式下载 ----------

// 单源流式下载 → 落盘 tmp；onProgress(received, total) 约 400ms 节流
function streamToFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    let settled = false
    let stallTimer = null
    let lastTick = 0
    const fail = err => {
      if (settled) return
      settled = true
      clearTimeout(stallTimer)
      try { req.abort() } catch (e) { /* 已结束 */ }
      try { fs.unlinkSync(dest) } catch (e) { /* 未写或已删 */ }
      reject(new Error(err))
    }
    const req = net.request({ url, redirect: 'follow' })
    req.setHeader('User-Agent', UA)
    req.on('response', res => {
      // Release 资产 CDN 常见 206（分段返回），两者都算正常
      if (res.statusCode !== 200 && res.statusCode !== 206) {
        fail(`HTTP ${res.statusCode}`)
        return
      }
      const total = parseInt((res.headers && res.headers['content-length']) || '0', 10)
      const ws = fs.createWriteStream(dest)
      const resetStall = () => {
        clearTimeout(stallTimer)
        stallTimer = setTimeout(() => fail('下载停滞超时（90 秒无数据），已自动中断'), STALL_TIMEOUT)
      }
      let received = 0
      res.on('data', chunk => {
        resetStall()
        received += chunk.length
        ws.write(chunk)
        const now = Date.now()
        if (now - lastTick > 400) {
          lastTick = now
          if (onProgress) onProgress(received, total)
        }
      })
      res.on('end', () => {
        if (settled) return
        clearTimeout(stallTimer)
        ws.end(() => {
          if (!settled) {
            settled = true
            if (onProgress) onProgress(received, total || received)
            resolve({ received, total })
          }
        })
      })
      res.on('error', e => fail('网络响应中断：' + (e && e.message)))
      ws.on('error', e => fail('写盘失败：' + (e && e.message)))
      resetStall()
    })
    req.on('error', e => fail('网络请求失败：' + (e && e.message)))
    req.end()
  })
}

// 流式 sha256
function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256')
    const rs = fs.createReadStream(p)
    rs.on('data', d => h.update(d))
    rs.on('end', () => resolve(h.digest('hex')))
    rs.on('error', reject)
  })
}

// ---------- 解压与落位 ----------

// tar.gz 解压（darwin 的 node 官方包：内含一层版本目录，strip 1）
function extractTarGz(archive, destDir) {
  return new Promise((resolve, reject) => {
    fs.mkdirSync(destDir, { recursive: true })
    const p = spawn('tar', ['-xzf', archive, '-C', destDir, '--strip-components', '1'])
    let err = ''
    p.stderr.on('data', d => { err += d.toString() })
    p.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error('tar 解压失败' + (err ? '：' + err.slice(0, 200) : '')))
    })
    p.on('error', e => reject(e))
  })
}

// pandoc 特殊落位：zip 内查找 pandoc / pandoc.exe 二进制（Windows 官方包可能无 bin/ 层），
// 抽取落位 <runtime>/pandoc/bin/（与 provision 脚本 do_pandoc 的落位口径一致）
function extractPandoc(archive, destDir) {
  const binDir = path.join(destDir, 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  const zip = new AdmZip(archive)
  const binName = isWin() ? 'pandoc.exe' : 'pandoc'
  const entry = zip.getEntries().find(e => {
    if (e.isDirectory) return false
    const parts = e.entryName.split('/')
    return parts[parts.length - 1] === binName
  })
  if (!entry) throw new Error('压缩包内未找到 pandoc 二进制（布局可能已变化）')
  fs.writeFileSync(path.join(binDir, binName), entry.getData())
}

// Unix 执行位修复：zip 不保留权限位（AdmZip 亦不恢复），按两条规则 chmod 755——
// ① bin / .bin 目录下的文件；② 以 #! 开头的 shebang 脚本（仅 POSIX）
function fixExecBits(root) {
  if (!isPosix()) return
  const visit = dir => {
    let entries = []
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch (e) { return }
    const dirName = path.basename(dir)
    const inBin = dirName === 'bin' || dirName === '.bin'
    for (const ent of entries) {
      const full = path.join(dir, ent.name)
      if (ent.isDirectory()) {
        visit(full)
        continue
      }
      if (!ent.isFile()) continue
      let exec = inBin
      if (!exec) {
        try {
          const fd = fs.openSync(full, 'r')
          const buf = Buffer.alloc(2)
          fs.readSync(fd, buf, 0, 2, 0)
          fs.closeSync(fd)
          exec = buf[0] === 0x23 && buf[1] === 0x21
        } catch (e) { /* 不可读跳过 */ }
      }
      if (exec) {
        try { fs.chmodSync(full, 0o755) } catch (e) { /* 权限失败不阻断装配 */ }
      }
    }
  }
  visit(root)
}

// ---------- 装配台账（installed.json） ----------

function ledgerPath() {
  return path.join(downloadedRoot(), 'installed.json')
}

function readLedger() {
  try {
    return JSON.parse(fs.readFileSync(ledgerPath(), 'utf-8')) || {}
  } catch (e) {
    return {}
  }
}

function writeLedger(ledger) {
  fs.mkdirSync(downloadedRoot(), { recursive: true })
  fs.writeFileSync(ledgerPath(), JSON.stringify(ledger, null, 2))
}

// ---------- 状态探测 ----------

// marker 相对路径探测（相对根目录；根为空字符串时防 path.join 假阳性）。
// 存在即命中（文件或目录）：node-tools 的 marker 是 node/lib/node_modules/sharp 目录，
// 若限定 isFile 会永远探测失败 → 每次启动重复装配该组件
function markerHit(root, rel) {
  if (!root) return false
  try {
    return fs.existsSync(path.join(root, rel))
  } catch (e) {
    return false
  }
}

// 内置包（安装包 Resources/runtime）探测 → 依据 runtime.js 各解析函数
function builtinProbe(name) {
  switch (name) {
    case 'python-env': return !!runtime.builtinPython()
    case 'node': return !!runtime.nodeExe()
    case 'pandoc': return !!runtime.pandocBin()
    case 'node-tools': {
      const root = runtime.rootDir()
      return markerHit(root, isWin() ? 'node/node_modules/sharp' : 'node/lib/node_modules/sharp')
    }
    // playwright 三组件：只探内置根（在线装配根由 installed/marker 覆盖），
    // INSTALLATION_COMPLETE 为 provision 内置装配的完成标记
    case 'chrome-headless-shell':
      return markerHit(runtime.rootDir(), 'playwright-browsers/' + PW_REV.chrome + '/INSTALLATION_COMPLETE')
    case 'ffmpeg':
      return markerHit(runtime.rootDir(), 'playwright-browsers/' + PW_REV.ffmpeg + '/INSTALLATION_COMPLETE')
    case 'winldd':
      return isWin() && markerHit(runtime.rootDir(), 'playwright-browsers/' + PW_REV.winldd + '/INSTALLATION_COMPLETE')
    // mingit：老版本曾把内置 zip 解压到 <userData>/omnibuddy/git（非 runtime 根），
    // 升级用户按老目录兼容探测，避免引导页 / 设置页要求重复下载
    case 'mingit':
      return isWin() && markerHit(path.join(baseDir, 'git'), 'cmd/git.exe')
    default: return false
  }
}

// 组件总览（本地探测版）：不拉云端 manifest，纯本地规则表 + marker 探测，同步秒回。
// 供首启引导 check 用——判定是否进引导页只看就绪态（builtin / installed），
// size 等云端字段缺失（安装步会经 status() 渐进补齐），慢网下引导页检查不再被 manifest 拖住
function localStatus() {
  const dRoot = downloadedRoot()
  const names = Object.keys(COMPONENT_RULES)
    // winldd / mingit 仅 Windows 发行，其余平台不参与检查
    .filter(n => !COMPONENT_RULES[n].winOnly || isWin())
  const components = names.map(name => {
    const rule = COMPONENT_RULES[name]
    const builtin = builtinProbe(name)
    const installed = !builtin && markerHit(dRoot, rule.marker())
    return {
      name,
      label: rule.label,
      description: rule.description,
      group: rule.group,
      builtin,
      installed,
      installable: true,
      busy: inFlight.has(name)
    }
  })
  return {
    ok: true,
    local: true,
    builtinRoot: runtime.rootDir(),
    downloadedRoot: dRoot,
    components
  }
}

// 组件总览：合并规则表与 manifest 组件，逐项给出 builtin / installed / installable 与来源台账
async function status() {
  const mf = await fetchManifest(true)
  const manifestComps = (mf.ok && mf.data && mf.data.components) || {}
  const names = Array.from(new Set(Object.keys(COMPONENT_RULES).concat(Object.keys(manifestComps))))
    // winldd / mingit 仅 Windows 发行（Windows 落地依赖 / Windows 兜底），其余平台不展示
    .filter(n => (n !== 'winldd' && n !== 'mingit') || isWin())
  const mPlat = manifestPlat()
  const dRoot = downloadedRoot()
  const ledger = readLedger()

  const components = names.map(name => {
    const rule = COMPONENT_RULES[name] || null
    const target = manifestComps[name] && manifestComps[name].targets
      ? (manifestComps[name].targets[mPlat] || null)
      : null
    const builtin = builtinProbe(name)
    const installed = !builtin && !!rule && markerHit(dRoot, rule.marker())
    return {
      name,
      label: rule ? rule.label : name,
      description: rule ? rule.description : '',
      group: rule ? rule.group : '浏览器内核与辅助',
      builtin,
      installed,
      installable: !!rule && !!target,
      unsupported: !rule ? '未知组件' : (!target ? '当前平台暂无发行包' : ''),
      busy: inFlight.has(name),
      version: (target && target.file) || '',
      size: (target && target.size) || 0,
      installedMeta: ledger[name] || null,
      runtimeVersion: (mf.ok && mf.data.runtimeVersion) || ''
    }
  })

  return {
    ok: true,
    manifestOk: mf.ok,
    manifestError: mf.ok ? '' : mf.error,
    runtimeVersion: (mf.ok && mf.data.runtimeVersion) || '',
    updatedAt: (mf.ok && mf.data.updatedAt) || '',
    builtinRoot: runtime.rootDir(),
    downloadedRoot: dRoot,
    manifestPlat: mPlat,
    components
  }
}

// ---------- 安装 / 卸载 ----------

function sendProgress(event, payload) {
  if (event && event.sender && !event.sender.isDestroyed()) {
    try {
      event.sender.send('omnibuddy:runtime:progress', payload)
    } catch (e) { /* 窗口销毁竞态忽略 */ }
  } else if (progressSink) {
    // 后台装配（无 event 上下文）：交主进程汇聚器累计 ETA 后全窗广播
    try { progressSink(payload) } catch (e) { /* sink 异常不阻断下载 */ }
  }
}

async function doInstall(name, event) {
  const rule = COMPONENT_RULES[name]
  if (!rule) {
    return { ok: false, error: '未知组件，当前版本不支持在线装配' }
  }
  const mPlat = manifestPlat()
  const mf = await fetchManifest(true)
  if (!mf.ok) return { ok: false, error: '清单拉取失败：' + mf.error }
  const comp = (mf.data.components || {})[name]
  const target = comp && comp.targets ? comp.targets[mPlat] : null
  if (!target || !Array.isArray(target.urls) || !target.urls.length) {
    return { ok: false, error: '清单中无当前平台（' + mPlat + '）的发行包' }
  }

  const dRoot = downloadedRoot()
  const cacheDir = path.join(baseDir, 'runtime-cache')
  fs.mkdirSync(cacheDir, { recursive: true })
  fs.mkdirSync(dRoot, { recursive: true })
  const tmp = path.join(cacheDir, target.file + '.download')

  // 多源依次尝试（GitCode 主源国内快 → GitHub 备源走系统代理）。
  // 缓存复用：上次中断的 tmp 完整（大小命中 manifest）则免重下，会话重启后断点续装
  let lastError = ''
  let downloaded = false
  if (fs.existsSync(tmp) && (!target.size || fs.statSync(tmp).size === target.size)) {
    console.log(`[setup] ${name} 已有完整下载缓存，跳过下载`)
    downloaded = true
  }
  for (const url of target.urls) {
    if (downloaded) break
    try {
      await streamToFile(url, tmp, (received, total) => {
        sendProgress(event, {
          component: name,
          phase: 'download',
          received,
          total,
          percent: total ? Math.min(99, Math.floor(received / total * 100)) : 0
        })
      })
      downloaded = true
      break
    } catch (e) {
      lastError = `${url.split('/')[2]}：${e.message}`
    }
  }
  if (!downloaded) {
    sendProgress(event, { component: name, phase: 'error', error: lastError })
    return { ok: false, error: '下载失败（已尝试全部源）——' + lastError }
  }

  // 校验：大小粗检 + sha256
  sendProgress(event, { component: name, phase: 'verify', percent: 100 })
  const st = fs.statSync(tmp)
  if (target.size && st.size !== target.size) {
    try { fs.unlinkSync(tmp) } catch (e) { /* 忽略 */ }
    const msg = `大小不符（期望 ${target.size}，实际 ${st.size}），包可能损坏`
    sendProgress(event, { component: name, phase: 'error', error: msg })
    return { ok: false, error: msg }
  }
  const digest = await sha256File(tmp)
  if (target.sha256 && digest !== target.sha256) {
    try { fs.unlinkSync(tmp) } catch (e) { /* 忽略 */ }
    const msg = 'sha256 校验失败，包可能被篡改或损坏'
    sendProgress(event, { component: name, phase: 'error', error: msg })
    return { ok: false, error: msg }
  }

  // 解压装配
  sendProgress(event, { component: name, phase: 'extract', percent: 100 })
  const installDirRel = rule.installDir()
  const installDir = installDirRel ? path.join(dRoot, installDirRel) : dRoot
  fs.mkdirSync(installDir, { recursive: true })
  if (rule.freshExtract && rule.ownDir) {
    try { fs.rmSync(path.join(dRoot, rule.ownDir), { recursive: true, force: true }) } catch (e) { /* 首装无旧目录 */ }
    fs.mkdirSync(installDir, { recursive: true })
  }
  try {
    if (rule.pandocStyle) {
      extractPandoc(tmp, installDir)
    } else if (rule.darwinTarGz && process.platform === 'darwin') {
      await extractTarGz(tmp, installDir)
    } else {
      new AdmZip(tmp).extractAllTo(installDir, true)
    }
  } catch (e) {
    sendProgress(event, { component: name, phase: 'error', error: '解压失败：' + e.message })
    return { ok: false, error: '解压失败：' + e.message }
  }
  fixExecBits(path.join(dRoot, rule.ownDir || installDirRel))

  // playwright 组件：写装配完成标记（provision 内置装配同款口径，
  // 亦为 status() 的 installed 探测 marker）
  if (rule.completeFile) {
    try { fs.writeFileSync(path.join(installDir, 'INSTALLATION_COMPLETE'), '') } catch (e) { /* 标记失败不阻断 */ }
  }

  // 台账
  const ledger = readLedger()
  ledger[name] = {
    file: target.file,
    sha256: target.sha256,
    size: target.size,
    installedAt: new Date().toISOString()
  }
  writeLedger(ledger)
  try { fs.unlinkSync(tmp) } catch (e) { /* 缓存清理失败不影响结果 */ }

  sendProgress(event, { component: name, phase: 'done' })
  return { ok: true, root: dRoot }
}

function installComponent(name, event) {
  if (!COMPONENT_RULES[name]) {
    return Promise.resolve({ ok: false, error: '未知组件，当前版本不支持在线装配' })
  }
  if (inFlight.has(name)) {
    return Promise.resolve({ ok: false, error: '该组件正在装配中，请勿重复操作' })
  }
  const task = doInstall(name, event).finally(() => inFlight.delete(name))
  inFlight.set(name, task)
  return task
}

function uninstall(name) {
  const rule = COMPONENT_RULES[name]
  if (!rule) return { ok: false, error: '未知组件' }
  const dRoot = downloadedRoot()
  try {
    if (rule.uninstallList) {
      // node-tools：与官方 node 共享目录，只精删已知包
      const modulesRel = isWin() ? 'node/node_modules' : 'node/lib/node_modules'
      rule.uninstallList.forEach(pkg => {
        try { fs.rmSync(path.join(dRoot, modulesRel, pkg), { recursive: true, force: true }) } catch (e) { /* 未装跳过 */ }
      })
    } else if (rule.ownDir) {
      fs.rmSync(path.join(dRoot, rule.ownDir), { recursive: true, force: true })
    }
    // node 与 node-tools 共享 node/ 目录：删 node 连带删除预装库，台账同步清理保持状态一致
    const ledger = readLedger()
    delete ledger[name]
    if (name === 'node') delete ledger['node-tools']
    writeLedger(ledger)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: '卸载失败：' + e.message }
  }
}

// ---------- IPC ----------

// 后台装配进度汇聚器注入（setup.js 后台循环用；null 清除）
function setProgressSink(fn) {
  progressSink = fn
}

function init(dir) {
  baseDir = dir || ''
}

function registerIpc() {
  ipcMain.handle('omnibuddy:runtime:status', async () => status())
  ipcMain.handle('omnibuddy:runtime:install', (e, name) => installComponent(name, e))
  ipcMain.handle('omnibuddy:runtime:uninstall', (_e, name) => uninstall(name))
}

module.exports = { init, registerIpc, status, localStatus, installComponent, setProgressSink }
