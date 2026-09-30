// electron-builder afterPack 钩子：对 mac 包做 ad-hoc 签名
// 背景：正式签名需连 Apple 时间戳服务器（timestamp.apple.com），国内网络经常不可达导致打包失败；
// 配合 package.json 中 mac.identity: null 跳过正式签名，此处改用 ad-hoc（本地签名，无需联网）。
// ad-hoc 签名足以让 Touch ID / safeStorage（keychain）正常工作，仅影响 Gatekeeper 分发提示。
// 注：运行时组件已改为首启引导在线装配（不再打包内置 runtime / lib），钩子无拷贝职责。
const { execSync } = require('child_process')
const path = require('path')

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`)
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' })
  console.log(`\n[afterPack] ad-hoc 签名完成: ${appPath}\n`)
}
