// pi 社区扩展包管理（pi CLI）：listPackages 读 agentDir/settings.json 的
// packages 段；installPackage 以 Electron 二进制 node 模式运行 pi CLI 安装。
// pi CLI 为 ESM 脚本，须用 ELECTRON_RUN_AS_NODE 运行。
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')
const { state, PROJECT_ROOT } = require('./state')

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

// 安装社区扩展（如 pi-web-access / pi-subagents / pi-memory）
function installPackage(pkgName) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [piCliPath(), 'install', 'npm:' + pkgName],
      {
        env: Object.assign({}, process.env, {
          ELECTRON_RUN_AS_NODE: '1',
          PI_CODING_AGENT_DIR: state.agentDir
        })
      }
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
  // 安装社区扩展包（pi install npm:<name>，Electron node 模式运行）
  installPackage
}
