// pi 社区扩展包管理（pi CLI）：listPackages 读 agentDir/settings.json 的
// packages 段；installPackage 运行 pi CLI 安装。
// 宿主二进制选择（Windows 黑窗根治）：
// - POSIX：Electron 二进制 node 模式（ELECTRON_RUN_AS_NODE）
// - Windows：pi CLI 内部经 cross-spawn 调 npm（.cmd 批处理 → cmd.exe，控制台程序）。
//   宿主若为 GUI 子系统的 electron.exe 则无控制台可继承，npm/cmd 会各开一个
//   黑色控制台窗口（首启装配期间连装多个扩展 = 弹一串黑窗）。改用运行时
//   node.exe（控制台子系统）+ windowsHide（CREATE_NO_WINDOW）：pi 进程持有
//   隐藏控制台，npm 等孙进程直接继承，全程无窗口。运行时 node 未就绪
//   （引导装配下载中）时轮询等待，超时回退 electron.exe。
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { state, PROJECT_ROOT } = require('./state')
const runtime = require('../platform/runtime')

// pi CLI 入口（dev: <root>/electron/agent/pi → 上三级；打包后 dist-electron/agent/pi 同构）
function piCliPath() {
  return path.join(PROJECT_ROOT, 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'bundle', 'cli.js')
}

// 已安装的社区扩展清单（agentDir/settings.json 的 packages 段）
function listPackages() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(state.agentDir, 'settings.json'), 'utf-8'))
    return Array.isArray(settings.packages) ? settings.packages : []
  } catch (e) {
    return []
  }
}

// Windows 运行时 node 就绪探测（引导装配 node 组件落位后即可用）
function winNodeExe() {
  return process.platform === 'win32' ? runtime.nodeExe() : ''
}

// 等待 Windows 运行时 node 就绪（引导装配并行场景）：立即首探，多数场景零等待；
// 未就绪时 3s 轮询，上限 10 分钟（超时返回 '' 由调用方回退 electron.exe）
function waitForWinNode() {
  return new Promise((resolve) => {
    const probe = () => winNodeExe()
    if (probe()) return resolve(probe())
    const started = Date.now()
    const timer = setInterval(() => {
      if (probe() || Date.now() - started > 10 * 60 * 1000) {
        clearInterval(timer)
        resolve(probe())
      }
    }, 3000)
  })
}

// 安装社区扩展（如 pi-web-access / pi-subagents / pi-memory）
async function installPackage(pkgName) {
  let bin = process.execPath          // POSIX / 兜底：Electron node 模式
  let env = Object.assign({}, process.env, {
    ELECTRON_RUN_AS_NODE: '1',
    PI_CODING_AGENT_DIR: state.agentDir
  })
  if (process.platform === 'win32') {
    // 首启装配与扩展安装并行：node 组件可能仍在下载，等待就绪后再装（全程无窗）
    const node = await waitForWinNode()
    if (node) {
      bin = node                       // 真实 node.exe：无需 ELECTRON_RUN_AS_NODE
      env = Object.assign({}, process.env, { PI_CODING_AGENT_DIR: state.agentDir })
    }
  }
  return new Promise((resolve) => {
    const child = spawn(
      bin,
      [piCliPath(), 'install', 'npm:' + pkgName],
      { env, windowsHide: true }
    )
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    child.on('error', err => resolve({ ok: false, error: err.message }))
    child.on('close', code => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: (out || '').slice(-500) || 'pi install 退出码 ' + code })
    })
  })
}

module.exports = {
  // pi CLI 入口路径（项目根 node_modules 内）
  piCliPath,
  // 已安装的社区扩展清单
  listPackages,
  // 安装社区扩展包（pi install npm:<name>；Windows 走运行时 node.exe 防黑窗）
  installPackage
}
