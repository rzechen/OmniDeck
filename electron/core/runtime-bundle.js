// 运行时组件包首启自解压（全量内置方案的落地侧）：
// 安装包 extraResources 携带 lib/<plat> 的原始发布档（provision 的下载缓存，
// zip / darwin node 为 tar.gz）+ npx-cache 直拷目录；首次启动逐包按落位规则
// 解压到 userData 的在线装配根（runtime.js 双根解析的 downloadedRoot 同位）。
// 落位口径与 scripts/provision-runtime.sh 的 do_install 完全一致：
// - python-env：win zip 根即 env（解到 python/）；mac zip 内含 python/（解到根）
// - node：win zip 根级 node.exe（解到 node/）；mac tar.gz 内含版本目录（strip 1）
// - node-tools：叠加解到 node/；MinGit：解到 git/
// - playwright 三/四件套：解到 playwright-browsers/<包名>-<rev>/ 并写
//   INSTALLATION_COMPLETE（runtime 探测 marker 同口径）
// - pandoc：zip 内查找 pandoc(.exe) 落位 pandoc/bin/（官方包层级随版本漂移）
// 解压引擎用系统 tar（bsdtar：win10+ 与 macOS 均自带，zip 同样支持）；
// 幂等：dest/.pkgs-extracted 记录已解包的 {包名: size-mtime}，重启增量续解，
// 中断残留覆盖解压无害；进度逐包广播（渲染层横幅显示 当前/总数）。
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { app, ipcMain } = require('electron')
const runtime = require('../agent/platform/runtime')

// playwright 组件修订号（与 provision-runtime.sh 的 PW_*_REV 同源，升级两处同步改）
const REV = { chromium: 1244, ffmpeg: 1011, winldd: 1007 }

let getWindow = null
// 当前状态：''（无需/未知）| 'extracting' | 'done' | 'error'
let status = { phase: '', done: 0, total: 0, name: '', error: '' }

// 发布档目录名（与 lib/<plat> 一致；注意与 runtime.platKey 的 win-x86_64 不同）
function pkgsPlat() {
  if (process.platform === 'darwin') return process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x86_64'
  if (process.platform === 'win32') return 'windows-x86_64'
  return ''
}

function pkgsDir() {
  const p = pkgsPlat()
  return p ? path.join(process.resourcesPath || '', 'runtime-pkgs', p) : ''
}

function destDir() {
  return path.join(app.getPath('userData'), 'omnibuddy', 'runtime', runtime.platKey())
}

// 包名 → 落位规则（匹配一个即用；winldd/MinGit 仅出现在 win 包目录）
function matchRule(file) {
  if (/^python-env-win-64\.zip$/.test(file)) return { dir: 'python' }
  if (/^python-env-osx-arm64\.zip$/.test(file)) return { dir: '' }
  // node 官方包（win zip / mac tar.gz）内层均带版本目录，strip 1 落位 node/
  if (/^node-v[\d.]+-win-x64\.zip$/.test(file)) return { dir: 'node', strip: 1 }
  if (/^node-v[\d.]+-darwin-arm64\.tar\.gz$/.test(file)) return { dir: 'node', strip: 1 }
  if (/^node-tools-.*\.zip$/.test(file)) return { dir: 'node' }
  if (/^chrome-headless-shell-.*\.zip$/.test(file)) {
    return { dir: 'playwright-browsers/chromium_headless_shell-' + REV.chromium, complete: true }
  }
  if (/^chrome-.*\.zip$/.test(file)) {
    return { dir: 'playwright-browsers/chromium-' + REV.chromium, complete: true }
  }
  if (/^ffmpeg-.*\.zip$/.test(file)) {
    return { dir: 'playwright-browsers/ffmpeg-' + REV.ffmpeg, complete: true }
  }
  if (/^winldd-.*\.zip$/.test(file)) {
    return { dir: 'playwright-browsers/winldd-' + REV.winldd, complete: true }
  }
  if (/^pandoc-.*\.zip$/.test(file)) return { pandoc: true }
  // MinGit zip 根级即 cmd/ 等；mac git-env zip 内层自带 git/ 目录（解到根）
  if (/^MinGit-.*\.zip$/.test(file)) return { dir: 'git' }
  if (/^git-env-osx-arm64\.zip$/.test(file)) return { dir: '' }
  return null
}

function broadcast(patch) {
  Object.assign(status, patch)
  const win = getWindow && getWindow()
  if (win && !win.isDestroyed()) {
    try {
      win.webContents.send('omnibuddy:runtime-bundle', Object.assign({}, status))
    } catch (e) { /* 窗口销毁竞态忽略 */ }
  }
}

// 系统 tar（bsdtar）解压：zip / tar.gz 均支持，strip 仅 tar.gz 用
function tarExtract(archive, dest, strip) {
  return new Promise((resolve, reject) => {
    const args = ['-xf', archive, '-C', dest]
    if (strip) args.push('--strip-components', String(strip))
    const child = spawn('tar', args, { windowsHide: true })
    let err = ''
    child.stderr.on('data', d => { err += d.toString() })
    child.on('error', e => reject(new Error('tar 不可用：' + e.message)))
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error('退出码 ' + code + (err ? '：' + err.slice(0, 200) : '')))
    })
  })
}

// Windows zip 引擎：PowerShell Expand-Archive（.NET）。
// 不用 tar.exe 的原因：conda 等工具打的 zip 条目用反斜杠分隔（如
// python-env-win-64.zip 的 conda-meta\xxx.json），Windows 自带 tar 的旧版
// libarchive 把 '\' 当文件名字符，落盘直接失败；.NET 会规范化两种分隔符。
// -EncodedCommand（UTF-16LE base64）规避路径引号转义问题
function winExpand(archive, dest) {
  const q = s => `'${String(s).replace(/'/g, "''")}'`
  const cmd = `Expand-Archive -LiteralPath ${q(archive)} -DestinationPath ${q(dest)} -Force`
  const encoded = Buffer.from(cmd, 'utf16le').toString('base64')
  return new Promise((resolve, reject) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { windowsHide: true })
    let err = ''
    child.stderr.on('data', d => { err += d.toString() })
    child.on('error', e => reject(new Error('powershell 不可用：' + e.message)))
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error('退出码 ' + code + (err ? '：' + err.slice(0, 200) : '')))
    })
  })
}

// Windows strip：Expand-Archive 无 strip 能力 → 解到临时目录后把内层
// 唯一顶层目录（官方包的版本目录）内容提升到目标
async function winExpandStrip(archive, target) {
  const tmp = target + '.tmp-unpack'
  fs.rmSync(tmp, { recursive: true, force: true })
  await winExpand(archive, tmp)
  const top = fs.readdirSync(tmp).filter(n => n !== '.DS_Store')
  if (top.length !== 1) {
    fs.rmSync(tmp, { recursive: true, force: true })
    throw new Error('strip 解包顶层非单一目录（' + top.slice(0, 3).join(', ') + '）')
  }
  const inner = path.join(tmp, top[0])
  for (const ent of fs.readdirSync(inner)) {
    fs.rmSync(path.join(target, ent), { recursive: true, force: true })
    fs.renameSync(path.join(inner, ent), path.join(target, ent))
  }
  fs.rmSync(tmp, { recursive: true, force: true })
}

// 统一解压入口：win zip 走 PowerShell（strip 用临时目录提升），posix 走 tar
async function extractArchive(archive, dest, strip) {
  if (process.platform === 'win32') {
    if (strip) return winExpandStrip(archive, dest)
    return winExpand(archive, dest)
  }
  return tarExtract(archive, dest, strip)
}

// pandoc 落位：zip 内层级随官方版本漂移，解到临时目录后查找二进制移入 pandoc/bin/
async function extractPandoc(archive, dest) {
  const tmp = dest + '.pandoc-tmp'
  fs.rmSync(tmp, { recursive: true, force: true })
  fs.mkdirSync(tmp, { recursive: true })
  await extractArchive(archive, tmp)
  const binName = process.platform === 'win32' ? 'pandoc.exe' : 'pandoc'
  let found = ''
  const visit = dir => {
    if (found) return
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) visit(p)
      else if (ent.name === binName && !found) found = p
    }
  }
  visit(tmp)
  if (!found) {
    fs.rmSync(tmp, { recursive: true, force: true })
    throw new Error('压缩包内未找到 ' + binName)
  }
  const binDir = path.join(dest, 'pandoc', 'bin')
  fs.mkdirSync(binDir, { recursive: true })
  fs.rmSync(path.join(dest, 'pandoc', 'bin', binName), { force: true })
  fs.renameSync(found, path.join(binDir, binName))
  fs.rmSync(tmp, { recursive: true, force: true })
}

// 已解包清单（增量续解）：{ '<包名>': '<size>-<mtimeMs>' }
function readDoneMap(marker) {
  try {
    const m = JSON.parse(fs.readFileSync(marker, 'utf-8'))
    return m && typeof m === 'object' && m.files ? m.files : {}
  } catch (e) {
    return {}
  }
}

function writeDoneMap(marker, files) {
  try {
    fs.writeFileSync(marker, JSON.stringify({ files, at: Date.now() }, null, 2))
  } catch (e) { /* marker 写失败：下次重解（幂等无害） */ }
}

function pkgStamp(p) {
  const st = fs.statSync(p)
  return st.size + '-' + Math.floor(st.mtimeMs)
}

// 入口（app ready 后异步执行，不阻塞窗口与主功能）
async function init(getWin) {
  getWindow = getWin
  const src = pkgsDir()
  // dev：resourcesPath 无发布档，runtime/<plat> 本地目录直用
  if (!src || !fs.existsSync(src)) return
  const archives = fs.readdirSync(src)
    .filter(f => matchRule(f))
    .sort()
  if (!archives.length) return
  const dest = destDir()
  fs.mkdirSync(dest, { recursive: true })
  const marker = path.join(dest, '.pkgs-extracted')
  const doneMap = readDoneMap(marker)

  const pending = archives.filter(f => doneMap[f] !== pkgStamp(path.join(src, f)))
  if (!pending.length) {
    status = { phase: 'done', done: archives.length, total: archives.length, name: '', error: '' }
    return
  }

  broadcast({ phase: 'extracting', done: archives.length - pending.length, total: archives.length, name: '', error: '' })
  for (const file of pending) {
    const rule = matchRule(file)
    const archive = path.join(src, file)
    try {
      broadcast({ name: file })
      if (rule.pandoc) {
        await extractPandoc(archive, dest)
      } else {
        const target = path.join(dest, rule.dir)
        fs.mkdirSync(target, { recursive: true })
        await extractArchive(archive, target, rule.strip)
        if (rule.complete) {
          try { fs.writeFileSync(path.join(target, 'INSTALLATION_COMPLETE'), '') } catch (e) { /* 标记失败不阻断 */ }
        }
      }
      // POSIX 执行位：zip 不保留权限位，bin/ 下可执行与 shebang 脚本补 755
      if (process.platform !== 'win32' && rule.dir && !rule.pandoc) fixExecBits(path.join(dest, rule.dir))
      doneMap[file] = pkgStamp(archive)
      writeDoneMap(marker, doneMap)
      broadcast({ done: archives.filter(f => doneMap[f] === pkgStamp(path.join(src, f))).length })
    } catch (e) {
      broadcast({ phase: 'error', error: file + '：' + (e && e.message) })
      console.error('[runtime-bundle] 解压失败（下次启动重试）：', file, e && e.message)
      return
    }
  }
  broadcast({ phase: 'done', name: '', error: '' })
  console.log('[runtime-bundle] 运行时组件解压完成：', dest)
}

// zip 不保留权限位：bin / .bin 目录下的文件补执行位（provision 同口径；
// node 的 bin/（node/npm/npx）、python 的 bin/ 均覆盖，shebang 脚本场景由 bin 归位兜住）
function fixExecBits(root) {
  const visit = (dir, inBin) => {
    let entries = []
    try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch (e) { return }
    for (const ent of entries) {
      const p = path.join(dir, ent.name)
      if (ent.isDirectory()) visit(p, /^(bin|\.bin)$/.test(ent.name) || inBin)
      else if (inBin) {
        try { fs.chmodSync(p, 0o755) } catch (e) { /* 忽略 */ }
      }
    }
  }
  visit(root, false)
}

function registerIpc() {
  ipcMain.handle('omnibuddy:runtime-bundle:status', () => Object.assign({}, status))
}

module.exports = { init, registerIpc }
