// OmniDeck 内置运行时定位（python / node / playwright 浏览器 / npx 缓存）
// 由 scripts/provision-runtime.sh 装配到 <root>/runtime/<plat>/，
// afterPack 打进安装包 Resources/runtime/<plat>（开箱即用，不依赖宿主环境）。
// 瘦身版另支持在线装配（历史机制，现已全量内置；该机制移除后 userData
// 装配根保留兼容旧版本用户已下载的组件）：
// 解析优先级：内置运行时 → 在线装配（userData）→ 系统（PATH）；未装配时走系统回退。
// 布局差异：POSIX（python/bin/python3、node/bin/、node/lib/node_modules）
// vs Windows（python\python.exe、node\ 根级 node.exe、node\node_modules\）
const path = require('path')
const fs = require('fs')

// ===== 运行时定位与探测 =====
// 平台目录名（与 provision-runtime.sh 的 current_platform 口径一致）
function platKey() {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x86_64'
  }
  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'linux-aarch64' : 'linux-x86_64'
  }
  if (process.platform === 'win32') return 'win-x86_64'
  return ''
}

function isWin() {
  return process.platform === 'win32'
}

// 内置运行时根目录：打包 → Resources/runtime/<plat>；dev → 项目根 runtime/<plat>
function rootDir() {
  const plat = platKey()
  if (!plat) return ''
  const packed = path.join(process.resourcesPath || '', 'runtime', plat)
  if (fs.existsSync(packed)) return packed
  // dist-electron/agent/platform → 上三级为项目根
  const dev = path.join(__dirname, '..', '..', '..', 'runtime', plat)
  if (fs.existsSync(dev)) return dev
  return ''
}

// userData 目录（主进程直取；agent 子进程内 require('electron') 被 agent-shim
// 重定向，getPath 从注入的 init.paths.userData 返回——两进程模型下均可用）
function userDataDir() {
  try {
    const { app } = require('electron')
    return app.getPath('userData')
  } catch (e) {
    return ''
  }
}

// 在线装配运行时根目录：<userData>/omnibuddy/runtime/<plat>
// （历史在线装配解压落位，与内置包同构布局；未装配返回 ''）
function downloadedRootDir() {
  const plat = platKey()
  if (!plat) return ''
  const ud = userDataDir()
  if (!ud) return ''
  const dir = path.join(ud, 'omnibuddy', 'runtime', plat)
  return fs.existsSync(dir) ? dir : ''
}

// 候选根链：内置（安装包 Resources）→ 在线装配（userData），供多根扫描场景
function rootDirs() {
  return [rootDir(), downloadedRootDir()].filter(Boolean)
}

// 两根下探测落位相对路径 → { path, source: 'builtin'|'downloaded' } | null
// （source 供 probe* 上报来源；内置根优先——升级残留的旧装配不遮蔽安装包）
function locate(rel) {
  const builtin = rootDir()
  if (builtin && fs.existsSync(path.join(builtin, rel))) {
    return { path: path.join(builtin, rel), source: 'builtin' }
  }
  const dl = downloadedRootDir()
  if (dl && fs.existsSync(path.join(dl, rel))) {
    return { path: path.join(dl, rel), source: 'downloaded' }
  }
  return null
}

// 应用侧 python 解释器（内置运行时或在线装配；函数名沿用历史调用方口径，
// 返回 '' 时调用方回退系统 PATH）
function builtinPython() {
  const hit = locate(isWin() ? 'python/python.exe' : 'python/bin/python3')
  return hit ? hit.path : ''
}

// 应用侧 node 的 bin 目录（POSIX：bin/ 含 node/npm/npx；Windows：node 根级）
function nodeBinDir() {
  const hit = locate(isWin() ? 'node/node.exe' : 'node/bin/node')
  return hit ? path.dirname(hit.path) : ''
}

// 应用侧 node 可执行文件（无运行时返回 ''，调用方回退 PATH 上的 node）
function nodeExe() {
  const hit = locate(isWin() ? 'node/node.exe' : 'node/bin/node')
  return hit ? hit.path : ''
}

// 应用侧 npx 入口脚本（npx-cli.js）——统一走 node + npx-cli.js 而非 npx
// 可执行：Windows spawn .cmd 受限，且跨平台同构无需按平台拼命令名
function npxCli() {
  const hit = locate(isWin()
    ? 'node/node_modules/npm/bin/npx-cli.js'
    : 'node/lib/node_modules/npm/bin/npx-cli.js')
  return hit ? hit.path : ''
}

// 应用侧 node 预装库目录（provision 装配的 node-tools 组件，
// 沙箱增强集 sharp/docx/pptxgenjs 等；require 不搜全局路径，须 NODE_PATH 注入）
function nodeGlobalModulesDir() {
  const hit = locate(isWin() ? 'node/node_modules' : 'node/lib/node_modules')
  return hit ? hit.path : ''
}

// 应用侧 playwright 浏览器目录
function playwrightBrowsersDir() {
  const hit = locate('playwright-browsers')
  return hit ? hit.path : ''
}

// 应用侧 npx 缓存目录（预热 @playwright/mcp，离线可用）
function npxCacheDir() {
  const hit = locate('npx-cache')
  return hit ? hit.path : ''
}

// 应用侧 git 二进制（影子仓库检查点 / 工作空间 git 命令共用）：
// 在线装配组件（Windows MinGit：git/cmd/git.exe；POSIX conda 便携包：git/bin/git）
// → 系统 PATH 回退。返回 '' 时调用方视为 git 不可用
function gitBin() {
  const hit = locate(isWin() ? 'git/cmd/git.exe' : 'git/bin/git')
  return hit ? hit.path : ''
}

// git 可用性总览（能力清单 / 影子仓库降级判定共用；与 probePython 同构）
// → { bin, source: 'builtin'|'downloaded'|'system'|null, sourceLabel }
let sysGitCache = null
function probeGit() {
  const hit = locate(isWin() ? 'git/cmd/git.exe' : 'git/bin/git')
  if (hit) {
    return {
      bin: hit.path,
      source: hit.source,
      sourceLabel: hit.source === 'downloaded' ? '在线装配' : '内置运行时'
    }
  }
  if (sysGitCache === null) {
    sysGitCache = ''
    const { spawnSync } = require('child_process')
    try {
      const r = spawnSync('git', ['--version'], { timeout: 5000, encoding: 'utf-8' })
      if (r.status === 0 && /git version/i.test(String(r.stdout || ''))) sysGitCache = 'git'
    } catch (e) { /* ENOENT 等 */ }
  }
  if (sysGitCache) return { bin: sysGitCache, source: 'system', sourceLabel: '系统 Git' }
  return { bin: '', source: null, sourceLabel: '未检测到' }
}

// 应用侧 pandoc 二进制（doc_export 工具与 pi-markdown-preview 的转换引擎；
// pandoc 为静态单文件，落位 runtime/<plat>/pandoc/bin/）
function pandocBin() {
  const hit = locate(isWin() ? 'pandoc/bin/pandoc.exe' : 'pandoc/bin/pandoc')
  return hit ? hit.path : ''
}

// 内置 chrome-headless-shell 可执行文件（playwright-browsers 下；
// doc_export 的 PDF 渲染走 --print-to-pdf，不依赖 LaTeX）
function chromeHeadlessBin() {
  const dir = playwrightBrowsersDir()
  if (!dir) return ''
  try {
    const shells = fs.readdirSync(dir).filter(n => n.indexOf('chromium_headless_shell-') === 0)
    for (const n of shells) {
      const sub = path.join(dir, n)
      if (!fs.statSync(sub).isDirectory()) continue
      // 布局：chromium_headless_shell-<rev>/chrome-headless-shell-<asset>/chrome-headless-shell(.exe)
      for (const leaf of fs.readdirSync(sub)) {
        const inner = path.join(sub, leaf)
        if (!fs.statSync(inner).isDirectory()) continue
        const bin = path.join(inner, isWin() ? 'chrome-headless-shell.exe' : 'chrome-headless-shell')
        if (fs.existsSync(bin)) return bin
      }
    }
  } catch (e) { /* 布局异常按未装配处理 */ }
  return ''
}

// 完整 chromium 可执行文件（有头，登录向导窗口用；headless-shell 无 GUI 起不了窗）。
// 候选目录：内置装配（playwright-browsers）→ 系统 playwright 默认缓存（dev 常见），
// 取修订号最大的一档；布局 chromium-<rev>/chrome-mac*/Chromium.app（mac）/
// chrome-win|chrome-linux（win/linux）
function chromiumFullBin() {
  const dirs = [playwrightBrowsersDir(), systemPwCacheDir()].filter(Boolean)
  let best = null // { rev, bin }
  for (const dir of dirs) {
    let entries = []
    try {
      entries = fs.readdirSync(dir)
    } catch (e) {
      continue
    }
    for (const n of entries) {
      const m = /^chromium-(\d+)$/.exec(n)
      if (!m) continue
      const sub = path.join(dir, n)
      if (!fs.statSync(sub).isDirectory()) continue
      const bin = findChromiumBin(sub)
      if (bin && (!best || Number(m[1]) > best.rev)) best = { rev: Number(m[1]), bin }
    }
  }
  return best ? best.bin : ''
}

// chromium-<rev>/ 下的平台可执行文件（chrome-mac[-arm64] 布局；app 名两种：
// 旧版 Chromium.app / 新版 CFT "Google Chrome for Testing.app"）
function findChromiumBin(sub) {
  try {
    for (const leaf of fs.readdirSync(sub)) {
      const inner = path.join(sub, leaf)
      if (!fs.statSync(inner).isDirectory()) continue
      if (isWin()) {
        const bin = path.join(inner, 'chrome.exe')
        if (fs.existsSync(bin)) return bin
      } else if (process.platform === 'darwin') {
        for (const app of ['Chromium.app', 'Google Chrome for Testing.app']) {
          const bin = path.join(inner, app, 'Contents', 'MacOS', path.basename(app, '.app'))
          if (fs.existsSync(bin)) return bin
        }
      } else {
        const bin = path.join(inner, 'chrome')
        if (fs.existsSync(bin)) return bin
      }
    }
  } catch (e) { /* 布局异常跳过该档 */ }
  return ''
}

// 系统 playwright 默认浏览器缓存目录（未配置 PLAYWRIGHT_BROWSERS_PATH 时
// npx @playwright/mcp 的落位处；dev 环境常见形态）
function systemPwCacheDir() {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH) {
    const p = process.env.PLAYWRIGHT_BROWSERS_PATH
    return fs.existsSync(p) ? p : ''
  }
  const home = process.env.HOME || ''
  if (isWin()) {
    const p = path.join(process.env.LOCALAPPDATA || '', 'ms-playwright')
    return fs.existsSync(p) ? p : ''
  }
  if (process.platform === 'darwin') {
    const p = path.join(home, 'Library', 'Caches', 'ms-playwright')
    return fs.existsSync(p) ? p : ''
  }
  const p = path.join(home, '.cache', 'ms-playwright')
  return fs.existsSync(p) ? p : ''
}

// 系统 python 探测（PATH 上 python3 / python；进程级缓存防重复 spawn）
let sysPythonCache = null
function systemPython() {
  if (sysPythonCache !== null) return sysPythonCache
  sysPythonCache = ''
  const { spawnSync } = require('child_process')
  for (const cmd of (isWin() ? ['python', 'python3'] : ['python3', 'python'])) {
    try {
      const r = spawnSync(cmd, ['-c', 'print(1)'], { timeout: 5000 })
      if (r.status === 0) {
        sysPythonCache = cmd
        break
      }
    } catch (e) { /* ENOENT 等继续探测 */ }
  }
  return sysPythonCache
}

// python 可用性总览（能力清单 / 工具执行共用）
// → { bin, source: 'builtin'|'downloaded'|'system'|null, sourceLabel }
function probePython() {
  const hit = locate(isWin() ? 'python/python.exe' : 'python/bin/python3')
  if (hit) {
    return {
      bin: hit.path,
      source: hit.source,
      sourceLabel: hit.source === 'downloaded' ? '在线装配' : '内置运行时'
    }
  }
  const sys = systemPython()
  if (sys) return { bin: sys, source: 'system', sourceLabel: '系统解释器' }
  return { bin: '', source: null, sourceLabel: '未检测到' }
}

// 系统 node 探测（PATH 上 node；进程级缓存防重复 spawn）
let sysNodeCache = null
function systemNode() {
  if (sysNodeCache !== null) return sysNodeCache
  sysNodeCache = ''
  const { spawnSync } = require('child_process')
  try {
    const r = spawnSync('node', ['-v'], { timeout: 5000 })
    if (r.status === 0) sysNodeCache = 'node'
  } catch (e) { /* ENOENT 等继续 */ }
  return sysNodeCache
}

// node 可用性总览（能力清单 / 工具执行共用；与 probePython 同构）
function probeNode() {
  const hit = locate(isWin() ? 'node/node.exe' : 'node/bin/node')
  if (hit) {
    return {
      bin: hit.path,
      source: hit.source,
      sourceLabel: hit.source === 'downloaded' ? '在线装配' : '内置运行时'
    }
  }
  const sys = systemNode()
  if (sys) return { bin: sys, source: 'system', sourceLabel: '系统解释器' }
  return { bin: '', source: null, sourceLabel: '未检测到' }
}

// 系统 pandoc 探测（PATH 上 pandoc；进程级缓存防重复 spawn）
let sysPandocCache = null
function systemPandoc() {
  if (sysPandocCache !== null) return sysPandocCache
  sysPandocCache = ''
  const { spawnSync } = require('child_process')
  try {
    const r = spawnSync('pandoc', ['--version'], { timeout: 5000, encoding: 'utf-8' })
    if (r.status === 0) sysPandocCache = 'pandoc'
  } catch (e) { /* ENOENT 等继续 */ }
  return sysPandocCache
}

// pandoc 可用性总览（能力清单 / doc-export 共用；附版本号供展示）
// → { bin, source, sourceLabel, version }
function probePandoc() {
  const hit = locate(isWin() ? 'pandoc/bin/pandoc.exe' : 'pandoc/bin/pandoc')
  const bin = hit ? hit.path : ''
  const sys = bin ? '' : systemPandoc()
  const resolved = bin || sys
  if (!resolved) return { bin: '', source: null, sourceLabel: '未检测到', version: '' }
  let version = ''
  try {
    const { spawnSync } = require('child_process')
    const r = spawnSync(resolved, ['--version'], { timeout: 5000, encoding: 'utf-8' })
    if (r.status === 0) version = (String(r.stdout || '').split('\n')[0] || '').replace(/^pandoc\.exe\s*/i, '').trim()
  } catch (e) { /* 版本探测失败不影响可用性判定 */ }
  return {
    bin: bin || 'pandoc',
    source: hit ? hit.source : 'system',
    sourceLabel: hit ? (hit.source === 'downloaded' ? '在线装配' : '内置运行时') : '系统 PATH',
    version
  }
}

// ===== 预装依赖落位情况（仅能力清单展示用） =====
// 清单口径与 scripts/requirements-sandbox.txt、scripts/node-sandbox-tools.txt 一致；
// 版本按 runtime/ 下实际落位扫描（python 读 *.dist-info，node 读 package.json），
// 未装配内置运行时时全部标记未落位，供界面提示补装配。

// python 预装依赖（pip 名 + 用途分组，与 requirements-sandbox.txt 分节口径一致）
const PY_PACKAGES = [
  { name: 'numpy', group: '表格与数值' },
  { name: 'pandas', group: '表格与数值' },
  { name: 'openpyxl', group: 'Excel' },
  { name: 'python-docx', group: 'Word / PPT' },
  { name: 'python-pptx', group: 'Word / PPT' },
  { name: 'pypdf', group: 'PDF' },
  { name: 'pdfplumber', group: 'PDF' },
  { name: 'pdfminer.six', group: 'PDF' },
  { name: 'matplotlib', group: '图表' },
  { name: 'requests', group: '网页抓取解析' },
  { name: 'beautifulsoup4', group: '网页抓取解析' },
  { name: 'lxml', group: '网页抓取解析' },
  { name: 'pillow', group: '图像' },
  { name: 'markitdown', group: 'Markdown 互转' },
  { name: 'markdown', group: 'Markdown 互转' }
]

// node 预装库（npm 名 + 用途分组，与 node-sandbox-tools.txt 分节口径一致）
const NODE_PACKAGES = [
  { name: 'sharp', group: '图像' },
  { name: 'docx', group: 'Word / PPT 生成' },
  { name: 'pptxgenjs', group: 'Word / PPT 生成' },
  { name: 'pdf-lib', group: 'PDF' },
  { name: 'pdfjs-dist', group: 'PDF' },
  { name: 'marked', group: 'Markdown → HTML' }
]

// 包名归一化（PEP 503：小写 + [-_.] 统一为 -）
// pip 名与 dist-info 目录名（如 python_docx / pdfminer_six）归一后同口径可比对
function normalizePkgName(name) {
  return String(name || '').toLowerCase().replace(/[-_.]+/g, '-')
}

// python site-packages 目录（内置与在线装配两根合并扫描）：
// POSIX（python/lib/python3.x/site-packages，兼容多版本目录）；Windows（python/Lib/site-packages）
function pythonSitePackagesDirs() {
  const out = []
  rootDirs().forEach(root => {
    const base = isWin() ? path.join(root, 'python', 'Lib') : path.join(root, 'python', 'lib')
    if (isWin()) {
      const dir = path.join(base, 'site-packages')
      if (fs.existsSync(dir)) out.push(dir)
      return
    }
    let entries = []
    try {
      entries = fs.readdirSync(base)
    } catch (e) {
      return
    }
    entries
      .filter(n => /^python3\.\d+$/.test(n))
      .forEach(n => {
        const dir = path.join(base, n, 'site-packages')
        if (fs.existsSync(dir)) out.push(dir)
      })
  })
  return out
}

// 扫描 *.dist-info → { 归一化包名: 版本 }
function installedPyVersions() {
  const map = {}
  pythonSitePackagesDirs().forEach(dir => {
    let entries = []
    try {
      entries = fs.readdirSync(dir)
    } catch (e) {
      return
    }
    entries.forEach(n => {
      if (!n.endsWith('.dist-info')) return
      const stem = n.slice(0, -'.dist-info'.length)
      const cut = stem.lastIndexOf('-')
      if (cut <= 0) return
      const key = normalizePkgName(stem.slice(0, cut))
      if (!map[key]) map[key] = stem.slice(cut + 1)
    })
  })
  return map
}

// python 预装依赖落位清单 → [{ name, group, version, installed }]
function pythonPackages() {
  const installed = installedPyVersions()
  return PY_PACKAGES.map(p => {
    const version = installed[normalizePkgName(p.name)] || ''
    return { name: p.name, group: p.group, version, installed: !!version }
  })
}

// node 预装库落位清单 → [{ name, group, version, installed }]
function nodePackages() {
  const dir = nodeGlobalModulesDir()
  return NODE_PACKAGES.map(p => {
    let version = ''
    if (dir) {
      try {
        version = JSON.parse(fs.readFileSync(path.join(dir, p.name, 'package.json'), 'utf8')).version || ''
      } catch (e) { /* 未落位或清单不可读 */ }
    }
    return { name: p.name, group: p.group, version, installed: !!version }
  })
}

// ===== playwright 预装组件（仅能力清单展示用）=====
// 口径与 scripts/provision-runtime.sh 的 playwright（浏览器内核）与 npx-cache
// （MCP 服务包预热）两组件一致：前者落 playwright-browsers/<名>-<修订号>/，
// 后者落 npx-cache/_npx/<哈希>/node_modules/<包>。

// MCP 服务包（@playwright/mcp 及其浏览器驱动 playwright-core，预热于 npx 缓存）
const PW_PACKAGES = [
  { name: '@playwright/mcp', group: 'MCP 服务' },
  { name: 'playwright-core', group: 'MCP 服务' }
]

// playwright 浏览器工具（@playwright/mcp 默认暴露集，取自该版本 README 的
// Core automation / Tab management 两节；opt-in 能力（vision/pdf/devtools 等）
// 未启用故不计入）。版本锚点与 mcp.js 的 PLAYWRIGHT_MCP_VERSION 联动，升级时同步核对
const PW_TOOLS = [
  'browser_navigate', 'browser_navigate_back', 'browser_tabs', 'browser_resize', 'browser_close',
  'browser_snapshot', 'browser_find', 'browser_take_screenshot', 'browser_console_messages',
  'browser_network_requests', 'browser_network_request',
  'browser_click', 'browser_type', 'browser_hover', 'browser_drag', 'browser_drop',
  'browser_select_option', 'browser_fill_form', 'browser_file_upload', 'browser_press_key',
  'browser_handle_dialog',
  'browser_evaluate', 'browser_run_code_unsafe', 'browser_wait_for',
  'browser_webmcp_list', 'browser_webmcp_call'
]

// playwright-browsers/<前缀>-<修订号> → 修订号（未落位返回 ''）
function pwRev(prefix) {
  const dir = playwrightBrowsersDir()
  if (!dir) return ''
  let entries = []
  try {
    entries = fs.readdirSync(dir)
  } catch (e) {
    return ''
  }
  const hit = entries.find(n => n.indexOf(prefix) === 0)
  return hit ? hit.slice(prefix.length).replace(/^-/, '') : ''
}

// npx 缓存内预热的包版本（npx-cache/_npx/<哈希>/node_modules/<包>/package.json）
function npxCachedVersion(pkg) {
  const cache = npxCacheDir()
  if (!cache) return ''
  let hashes = []
  try {
    hashes = fs.readdirSync(path.join(cache, '_npx'))
  } catch (e) {
    return ''
  }
  for (const h of hashes) {
    try {
      const v = JSON.parse(fs.readFileSync(
        path.join(cache, '_npx', h, 'node_modules', pkg, 'package.json'), 'utf-8')).version
      if (v) return v
    } catch (e) { /* 该档未含此包 */ }
  }
  return ''
}

// playwright 可用性总览（能力清单 / 连接器卡片共用）
// → { software, source, sourceLabel, modules, tools }
// modules = 预装组件落位明细（浏览器内核 + MCP 服务包）；tools = 服务暴露的浏览器工具
function playwrightRuntime() {
  const installed = !!(playwrightBrowsersDir() || npxCacheDir())
  const chromeRev = pwRev('chromium_headless_shell-')
  const ffmpegRev = pwRev('ffmpeg-')
  const modules = [
    { name: 'chrome-headless-shell', group: '浏览器内核', version: chromeRev ? 'rev ' + chromeRev : '' },
    { name: 'ffmpeg', group: '浏览器内核', version: ffmpegRev ? 'rev ' + ffmpegRev : '' }
  ].concat(PW_PACKAGES.map(p => ({ name: p.name, group: p.group, version: npxCachedVersion(p.name) })))
    .map(m => ({ name: m.name, group: m.group, version: m.version, installed: !!m.version }))
  return {
    software: 'Playwright',
    source: installed ? 'builtin' : 'system',
    sourceLabel: installed ? '内置运行时' : '系统环境',
    modules,
    tools: PW_TOOLS.slice()
  }
}

module.exports = {
  // 平台目录名（darwin-arm64 / win-x86_64 等）
  platKey,
  // 内置运行时根目录（打包 Resources / dev 项目根）
  rootDir,
  // 在线装配运行时根目录（userData，未装配为 ''）
  downloadedRootDir,
  // 内置 python 解释器路径
  builtinPython,
  // 内置 node 的 bin 目录
  nodeBinDir,
  // 内置 node 可执行文件路径
  nodeExe,
  // 内置 npx-cli.js 入口路径
  npxCli,
  // 内置 node 预装库目录（NODE_PATH 注入用）
  nodeGlobalModulesDir,
  // playwright 浏览器目录
  playwrightBrowsersDir,
  // npx 缓存目录（MCP 服务预热）
  npxCacheDir,
  // 内置 pandoc 二进制路径
  pandocBin,
  // 应用侧 git 二进制路径（装配优先，'' = 未装配）
  gitBin,
  // git 可用性总览（bin + 来源）
  probeGit,
  // chrome-headless-shell 可执行文件路径
  chromeHeadlessBin,
  // 完整 chromium 可执行文件路径（有头，登录向导用；'' = 未装配且无系统缓存）
  chromiumFullBin,
  // pandoc 可用性总览（含版本）
  probePandoc,
  // python 可用性总览（bin + 来源）
  probePython,
  // node 可用性总览（bin + 来源）
  probeNode,
  // python 预装依赖落位清单
  pythonPackages,
  // node 预装库落位清单
  nodePackages,
  // playwright 可用性总览（组件 + 工具集）
  playwrightRuntime
}
