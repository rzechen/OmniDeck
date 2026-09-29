// pi-web-access 内置扩展（web_search / fetch_content / source_check）：
// - 包注册：经 pkg-registry 登记本地依赖路径（pi-subagents 同模式）
// - 免配置即用：auto 模式自动降级（SearXNG → OpenAI/Codex → Exa 免 key
//   走 MCP → Brave → …），无需配置任何密钥；用户按 pi 生态惯例手工在
//   <agentDir>/web-search.json 放 provider key 亦天然兼容（该扩展自读）
// - 联网开关：omnideck.webEnabled（false 时 pi.js 以 excludeTools 屏蔽 web 工具）
const fs = require('fs')
const path = require('path')
const pkgRegistry = require('./pkg-registry')

let agentDir = ''

function configPath() {
  return path.join(agentDir, 'web-search.json')
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf-8'))
  } catch (e) {
    return {}
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2))
}

// ---------- 对外接口 ----------
function init(dir) {
  agentDir = dir
  pkgRegistry.register(agentDir, 'pi-web-access')
}

// 联网开关（默认开启）
function enabled() {
  const cfg = readConfig()
  return !(cfg.omnideck && cfg.omnideck.webEnabled === false)
}

function setEnabled(v) {
  const cfg = readConfig()
  cfg.omnideck = Object.assign({}, cfg.omnideck, { webEnabled: !!v })
  writeConfig(cfg)
  return enabled()
}

module.exports = { init, enabled, setEnabled }
