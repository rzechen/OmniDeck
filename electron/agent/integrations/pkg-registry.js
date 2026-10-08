// 内置扩展包注册（通用）：随应用打包的 npm 依赖以本地绝对路径登记到
// agentDir/settings.json 的 packages（pi 支持本地路径源，jiti 沿 node_modules
// 向上解析依赖闭包，dev 与打包（asar）环境同构）。
// 幂等：处理 dev ⇄ 打包路径切换；尊重用户经 pi install 装到 agentDir/npm
// 的记录（目录存在即保留现状，不重复登记）。
// 使用方：builtin-tools.js（pi-subagents）、web-search.js（pi-web-access）
const path = require('path')
const fs = require('fs')

// ===== 包路径解析 =====
function resolvePkgDir(pkgName) {
  // 主入口解析为包根内文件，其上级目录即包根
  try {
    return path.dirname(require.resolve(pkgName))
  } catch (e) { /* 无 main 字段的包（如 pi-web-access）回落子路径 */ }
  // 部分包未声明 node main/exports（pi 扩展按自身 manifest 加载），改经
  // package.json 子路径定位包根（published 包必含该文件）
  try {
    return path.dirname(require.resolve(pkgName + '/package.json'))
  } catch (e) {
    return ''
  }
}

// ===== 注册入口 =====
function register(agentDir, pkgName) {
  const pkgPath = resolvePkgDir(pkgName)
  if (!pkgPath) {
    console.warn('[omnibuddy:pkg] 内置 ' + pkgName + ' 缺失：node_modules 不可解析')
    return false
  }
  const settingsFile = path.join(agentDir, 'settings.json')
  let settings = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile, 'utf-8'))
  } catch (e) { /* 首次不存在 */ }
  const packages = Array.isArray(settings.packages) ? settings.packages : []
  // 旧版经 pi install 装到 agentDir/npm 的记录：目录存在即可用，尊重现状
  if (packages.includes('npm:' + pkgName) &&
      fs.existsSync(path.join(agentDir, 'npm', pkgName))) {
    return false
  }
  if (packages.includes(pkgPath)) return false
  // 清理其它环境的本地路径记录（字符串源且指向该包但非当前路径）
  const next = packages.filter(p => {
    if (typeof p !== 'string') return true
    return !(p.indexOf(pkgName) >= 0 && p.indexOf('npm:') !== 0 && p !== pkgPath)
  })
  next.push(pkgPath)
  settings.packages = next
  try {
    fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2))
    console.log('[omnibuddy:pkg] ' + pkgName + ' 已注册：', pkgPath)
    return true
  } catch (e) {
    console.warn('[omnibuddy:pkg] 注册 ' + pkgName + ' 失败：', e.message)
    return false
  }
}

module.exports = {
  // 登记内置包到 settings.json
  register
}
