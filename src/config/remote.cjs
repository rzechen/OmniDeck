// GitCode 远程源统一配置（Electron 主进程 CJS 共用）
// 更新检测（updater）/ 技能市场（agent/market）/ 壁纸资源（wallpaper-fetch）/ 文档外链（agent/connectors）
// 的账号、仓库、分支与地址全部集中在此维护——仓库迁移、分支调整只改本文件，业务模块不感知。
// 注意：
// - 本文件为 CommonJS（主进程 require 引入），勿改为 ESM export；
// - 打包经 package.json build.files 收入 asar（dist-electron 内相对 require 运行时解析）

const apiBase = 'https://api.gitcode.com/api/v5' // OpenAPI 前缀（匿名可读 raw / releases）
const webBase = 'https://gitcode.com' // Web 页面前缀（仓库页 / Releases 下载直链）

// 仓库清单（owner 为 GitCode 账号；name 仓库名；ref 默认分支，raw 拉取用）
const owner = 'm0_59492087'
const repos = {
  app: { name: 'OmniDeck', ref: 'main' }, // 应用主仓库：更新源 / 文档
  market: { name: 'omnibuddy-market', ref: 'master' }, // 技能市场索引源
  resources: { name: 'omni-resources', ref: 'main' } // 壁纸等静态资源
}

// raw 文件直链（file 为仓库内路径；ref 缺省用仓库默认分支）
function rawUrl(key, file, ref) {
  const r = repos[key] || {}
  return `${apiBase}/repos/${owner}/${r.name}/raw/${file}?ref=${ref || r.ref}`
}

// raw 前缀（不带文件与查询，调用方自行拼路径编码时使用）
function rawBase(key) {
  const r = repos[key] || {}
  return `${apiBase}/repos/${owner}/${r.name}/raw`
}

// 仓库默认分支
function ref(key) {
  return (repos[key] || {}).ref || 'main'
}

// 仓库 Web 页面前缀（拼 /blob、/releases 等使用）
function webUrl(key) {
  const r = repos[key] || {}
  return `${webBase}/${owner}/${r.name}`
}

// 最新 Release 元数据 API（更新检测）
function latestReleaseApi(key) {
  const r = repos[key] || {}
  return `${apiBase}/repos/${owner}/${r.name}/releases/latest`
}

module.exports = { apiBase, webBase, owner, repos, rawUrl, rawBase, ref, webUrl, latestReleaseApi }
