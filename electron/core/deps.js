// 启动依赖预检：qmd 内置于应用（开箱即用，无需用户全局安装）
// - dev：node_modules/@tobilu/qmd（vite/electron 运行目录）
// - 打包：app.asar.unpacked/node_modules/@tobilu/qmd（package.json asarUnpack 配置）
// - 原理：pi-memory 以 execFile("qmd", ...) 从 PATH 调用 qmd，
//   因此在 userData 写一个 shim 脚本并注入 PATH。
//   打包版用户机器可能没有 node，shim 用 ELECTRON_RUN_AS_NODE=1 借
//   Electron 自身二进制（内置 node 22）运行 qmd 的 JS 入口。
const { app, dialog } = require('electron')
const path = require('path')
const fs = require('fs')

// 内置 qmd 包根目录：dev 与打包两种布局
function bundledQmdDir() {
  const isPackaged = app.isPackaged
  const candidates = isPackaged
    ? [
        path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', '@tobilu', 'qmd'),
        // 兜底：asar 内直接可执行场景（不应出现，但 asarUnpack 失败时不至于误报）
        path.join(process.resourcesPath, 'app', 'node_modules', '@tobilu', 'qmd')
      ]
    : [
        path.join(app.getAppPath(), 'node_modules', '@tobilu', 'qmd')
      ]
  for (const d of candidates) {
    if (fs.existsSync(path.join(d, 'bin', 'qmd'))) return d
  }
  return ''
}

// shim 输出目录（写进 userData，重装应用后自动失效重建）
function shimDir() {
  return path.join(app.getPath('userData'), 'omnibuddy', 'bin')
}

// qmd 单次执行超时（毫秒）：pi-memory 以 execFile("qmd") 调用且未设超时，
// qmd 首次初始化/网络阻塞时会永久挂起（表现为 memory_search 工具一直转圈）。
// shim 内置看门狗整组终止，超时经非零退出码 + stderr 返回给调用方
const QMD_TIMEOUT_MS = 60000

// 生成跨平台 shim：入口脚本（qmd / qmd.cmd）+ 看门狗 runner（qmd-runner.js）
// runner 借 ELECTRON_RUN_AS_NODE 用 Electron 自身二进制执行，不依赖系统 node
function writeShim() {
  const dir = shimDir()
  fs.mkdirSync(dir, { recursive: true })

  const qmdDir = bundledQmdDir()
  if (!qmdDir) return ''

  const entry = path.join(qmdDir, 'bin', 'qmd')
  const runner = path.join(dir, 'qmd-runner.js')
  const logFile = path.join(dir, 'qmd-shim.log')
  const isWin = process.platform === 'win32'

  // 看门狗 runner：转发参数执行内置 qmd，超时杀整组（unix 下 detached 自成进程组）
  // 每次执行写一行日志到 qmd-shim.log（启动参数 / 退出码 / 耗时 / 超时），
  // 用于排查 memory_search 调用挂起：日志有记录说明 execFile 命中 shim，无记录说明走了别的 qmd
  const runnerCode = [
    '// qmd shim 看门狗（OmniDeck 自动生成，勿手动编辑）',
    'const cp = require(\'child_process\')',
    'const fs = require(\'fs\')',
    'const entry = ' + JSON.stringify(entry),
    'const bin = ' + JSON.stringify(process.execPath),
    'const TIMEOUT = ' + QMD_TIMEOUT_MS,
    'const LOGFILE = ' + JSON.stringify(logFile),
    'function log(msg) { try { fs.appendFileSync(LOGFILE, new Date().toISOString() + \' \' + msg + \'\\n\') } catch (e) {} }',
    'const START = Date.now()',
    'log(\'start pid=\' + process.pid + \' args=\' + JSON.stringify(process.argv.slice(2)))',
    'const child = cp.spawn(bin, [entry].concat(process.argv.slice(2)), {',
    '  env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: \'1\' }),',
    '  stdio: [\'inherit\', \'inherit\', \'inherit\'],',
    '  detached: process.platform !== \'win32\'',
    '})',
    'const t = setTimeout(() => {',
    '  log(\'timeout child=\' + child.pid + \' after \' + TIMEOUT + \'ms —— 已整组终止\')',
    '  process.stderr.write(\'qmd 执行超时（\' + TIMEOUT + \'ms），已终止；请重试或改用关键词检索\\n\')',
    '  try { process.kill(-child.pid, \'SIGKILL\') } catch (e) { try { child.kill(\'SIGKILL\') } catch (e2) {} }',
    '  process.exit(124)',
    '}, TIMEOUT)',
    't.unref()',
    'child.on(\'exit\', (code) => { log(\'exit code=\' + code + \' elapsed=\' + (Date.now() - START) + \'ms\'); clearTimeout(t); process.exit(code == null ? 1 : code) })',
    'child.on(\'error\', (err) => { log(\'error \' + String((err && err.message) || err)); process.stderr.write(String((err && err.message) || err) + \'\\n\'); process.exit(1) })'
  ].join('\n')
  fs.writeFileSync(runner, runnerCode)

  const shimPath = path.join(dir, isWin ? 'qmd.cmd' : 'qmd')
  const content = isWin
    ? [
        '@echo off',
        `set "ELECTRON_RUN_AS_NODE=1"`,
        `"${process.execPath}" "${runner}" %*`
      ].join('\r\n')
    : [
        '#!/bin/sh',
        `ELECTRON_RUN_AS_NODE=1 exec "${process.execPath}" "${runner}" "$@"`
      ].join('\n')

  fs.writeFileSync(shimPath, content)
  if (!isWin) {
    try { fs.chmodSync(shimPath, 0o755) } catch (e) { /* 忽略 */ }
  }
  return shimPath
}

// 预检主流程：内置 qmd → 写 shim → PATH 注入；全局已装则直接用全局
// 返回 true 放行启动；内置与全局都缺失时弹窗退出（正常打包不应发生）
async function ensureDeps() {
  // 1) 用户已全局安装 qmd（bun/npm 全局），优先尊重用户环境
  try {
    const { execSync } = require('child_process')
    const p = execSync(
      process.platform === 'win32' ? 'where qmd' : 'which qmd',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }
    ).split('\n')[0].trim()
    if (p) {
      console.log('[deps] 使用全局 qmd：', p)
      return true
    }
  } catch (e) { /* 未全局安装，走内置 */ }

  // 2) 内置 qmd：写 shim 并注入 PATH（pi-memory 的 execFile("qmd") 即可命中）
  const shim = writeShim()
  if (shim) {
    process.env.PATH = shimDir() + path.delimiter + process.env.PATH
    console.log('[deps] 内置 qmd shim 已注入 PATH：', shim)
    return true
  }

  // 3) 都没有：开箱即用被破坏（打包遗漏或依赖未安装），明确报错退出
  dialog.showErrorBox(
    '内置依赖缺失',
    '未找到内置 qmd 组件（语义记忆检索需要）。\n\n' +
    (app.isPackaged
      ? '安装包不完整，请重新下载安装。'
      : '开发环境请先执行：npm install')
  )
  app.exit(1)
  return false
}

// ===== git 预检（P2）=====
// Windows：内置 MinGit（win extraResources 的 resources/git/MinGit-*.zip）首启
//   解压到 userData/omnibuddy/git，cmd 目录前置 PATH（bash 等工具即可用 git）。
// mac/linux：实测系统 git——用 --version 实测而非 which 判定（mac 的
//   /usr/bin/git 是 xcrun shim，未装 CLT 时执行会触发 GUI 安装弹窗）；
//   缺失仅一次性提示，不阻断启动（git 非核心链路，只影响工作空间 git 命令）。

// 实测 git 可执行（返回 Promise<boolean>）
function probeGit(bin) {
  return new Promise((resolve) => {
    try {
      const { execFile } = require('child_process')
      execFile(bin || 'git', ['--version'], { timeout: 5000, windowsHide: true }, (err, stdout) => {
        resolve(!err && /git version/i.test(String(stdout || '')))
      })
    } catch (e) {
      resolve(false)
    }
  })
}

// 内置 MinGit zip：dev 在 <app>/lib/windows-x86_64（与参考项目 lib/<平台> 结构对齐）；
// 打包在 resources/git（win extraResources filter 仅取 MinGit zip）
function mingitZip() {
  const dir = app.isPackaged
    ? path.join(process.resourcesPath, 'git')
    : path.join(app.getAppPath(), 'lib', 'windows-x86_64')
  try {
    const f = fs.readdirSync(dir).find(n => /^MinGit.*\.zip$/i.test(n))
    return f ? path.join(dir, f) : ''
  } catch (e) {
    return ''
  }
}

// 解压目标（userData/omnibuddy/git，官方 zip 根目录即 cmd\git.exe 布局）
function unpackedGitDir() {
  return path.join(app.getPath('userData'), 'omnibuddy', 'git')
}

async function ensureGit() {
  // 1) 系统 git 实测（PATH 可能已含此前注入的内置目录）
  if (await probeGit()) {
    console.log('[deps] git 可用（系统 PATH）')
    return true
  }
  // 2) Windows：解压内置 MinGit → cmd 目录前置 PATH → 复测
  if (process.platform === 'win32') {
    try {
      const gitExe = path.join(unpackedGitDir(), 'cmd', 'git.exe')
      if (!fs.existsSync(gitExe)) {
        const zip = mingitZip()
        if (!zip) throw new Error('未找到内置 MinGit 包')
        console.log('[deps] 首次启动：解压内置 MinGit…')
        const AdmZip = require('adm-zip')
        fs.mkdirSync(unpackedGitDir(), { recursive: true })
        new AdmZip(zip).extractAllTo(unpackedGitDir(), true) // 覆盖式幂等
      }
      process.env.PATH = path.dirname(gitExe) + path.delimiter + process.env.PATH
      if (await probeGit(gitExe)) {
        console.log('[deps] 内置 MinGit 已就绪')
        return true
      }
    } catch (e) {
      console.warn('[deps] MinGit 解压失败：', e.message)
    }
  }
  // 3) 缺失：打包环境下一次性提示安装（不阻断启动）
  console.warn('[deps] 未检测到 git：工作空间内的 git 命令将不可用')
  if (app.isPackaged) {
    const flag = path.join(app.getPath('userData'), 'omnibuddy', '.git-missing-notified')
    let notified = false
    try { notified = fs.existsSync(flag) } catch (e) { /* 按未提示处理 */ }
    if (!notified) {
      dialog.showMessageBox({
        type: 'info',
        title: '未检测到 git',
        message: 'Agent 工作空间中的 git 命令将不可用。',
        detail: process.platform === 'darwin'
          ? '可执行「xcode-select --install」安装命令行工具（含 git）后重启应用。'
          : '可在 https://git-scm.com/downloads 安装 git 后重启应用。',
        buttons: ['知道了']
      })
      try {
        fs.mkdirSync(path.dirname(flag), { recursive: true })
        fs.writeFileSync(flag, String(Date.now()))
      } catch (e) { /* 标记失败无碍 */ }
    }
  }
  return false
}

module.exports = { ensureDeps, ensureGit, bundledQmdDir, shimDir }
