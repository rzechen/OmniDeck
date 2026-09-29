// electron-builder afterPack 钩子：
// 1. 将 scripts/provision-runtime.sh 装配的内置运行时（runtime/<plat>/：
//    python/node/playwright-browsers/npx-cache）拷进应用 Resources——打包
//    自动携带、安装后开箱即用（未装配或平台不匹配时跳过，不阻塞打包）
// 2. 对 mac 包做 ad-hoc 签名（需在 runtime 拷入之后执行，--deep 才能覆盖
//    内嵌二进制）
// 背景：正式签名需连 Apple 时间戳服务器（timestamp.apple.com），国内网络经常不可达导致打包失败；
// 配合 package.json 中 mac.identity: null 跳过正式签名，此处改用 ad-hoc（本地签名，无需联网）。
// ad-hoc 签名足以让 Touch ID / safeStorage（keychain）正常工作，仅影响 Gatekeeper 分发提示。
const { execSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// 打包平台 → runtime 目录名（与 scripts/provision-runtime.sh 的 current_platform 口径一致；
// arch 取构建机 process.arch——打包在目标平台本机执行，无交叉编译场景）
function runtimePlat(platform) {
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'
  if (platform === 'darwin') return `darwin-${arch}`
  if (platform === 'linux') return `linux-${arch}`
  if (platform === 'win32') return 'win-x86_64'
  return ''
}

// 内置运行时拷入（存在才拷；node fs.cpSync 保留符号链接——python 的 bin 别名树）
// OMNIDECK_SKIP_RUNTIME=1 时跳过拷入：本地快速验证包体积/功能用（运行时相关功能不可用）
function copyRuntime(context) {
  if (process.env.OMNIDECK_SKIP_RUNTIME === '1') {
    console.log('[afterPack] OMNIDECK_SKIP_RUNTIME=1，跳过内置运行时拷入（slim 包）')
    return
  }
  const plat = runtimePlat(context.electronPlatformName)
  if (!plat) return
  const src = path.join(__dirname, '..', 'runtime', plat)
  if (!fs.existsSync(src)) {
    console.log(`[afterPack] 未装配内置运行时（runtime/${plat}），跳过拷入（sh scripts/provision-runtime.sh install 可装配）`)
    return
  }
  // mac: <app>.app/Contents/Resources；win/linux: <out>/resources（与 process.resourcesPath 对应）
  const resourcesDir = context.electronPlatformName === 'darwin'
    ? path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`, 'Contents', 'Resources')
    : path.join(context.appOutDir, 'resources')
  const dest = path.join(resourcesDir, 'runtime', plat)
  console.log(`[afterPack] 拷入内置运行时: ${src} → ${dest}`)
  fs.rmSync(dest, { recursive: true, force: true })
  fs.cpSync(src, dest, { recursive: true, verbatimSymlinks: true })
}

module.exports = async function afterPack(context) {
  copyRuntime(context)
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
  console.log(`\n[afterPack] ad-hoc 签名完成: ${appPath}\n`)
}
