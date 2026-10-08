// OmniBuddy MCP 服务配置管理
// pi 1.0.0 内置 MCP 支持：会话经 pi.createMcpExtension() 读取 <agentDir>/mcp.json
// （标准 MCP 格式：{ mcpServers: { name: { command, args, env, disabled?, description? }
//                或 { url, headers, disabled?, description? } } }）装载连接。
// 本模块职责：预置配置初始化 / UI 视图列表 / 校验保存（支持凭证注入）/ 旧适配器清理。
const path = require('path')
const fs = require('fs')
const credentials = require('./credentials')
const runtime = require('../platform/runtime')

let agentDir = ''

// playwright MCP 版本锚点（与 scripts/provision-runtime.sh 的 PLAYWRIGHT_MCP_VERSION
// 联动：npx-cache 预热须同 spec 才能离线命中；@latest 会绕过缓存重新联网下载）
const PLAYWRIGHT_MCP_VERSION = '0.0.81'

// ===== 有头开关 =====
// playwright 有头开关（旧登录方案遗留，仅兜底保留）：<agentDir>/playwright.json
// 的 { "headed": true }。登录闭环已改走登录向导（login-wizard.js）：
// 撞登录墙 → 通知点击打开专用小窗 → cookie 检测成功自动保存 storageState 并
// 关窗；本开关在向导成功时由主进程自动复位清零，正常流程不再置 true
function playwrightHeaded() {
  try {
    const cfg = JSON.parse(fs.readFileSync(path.join(agentDir, 'playwright.json'), 'utf-8'))
    return !!cfg.headed
  } catch (e) { /* 文件不存在或损坏：默认无头 */ return false }
}

// 有头开关读取 / 写入（UI 入口：连接器页「内置浏览器」卡片）
// 写入后同步刷新 mcp.json 内置条目（浏览器参数随开关变化）；MCP server
// 随 pi 会话启动，新开关自下一个会话生效，运行中会话不受影响
function getHeaded() {
  return playwrightHeaded()
}

function setHeaded(headed) {
  try {
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(path.join(agentDir, 'playwright.json'),
      JSON.stringify({ headed: !!headed }, null, 2))
    refreshBuiltinEntry()
    return { ok: true }
  } catch (e) {
    return { ok: false, error: '写入有头开关失败：' + e.message }
  }
}

// ===== 内置服务 =====
// 系统内置服务：配置始终保留且强制启用（不带 disabled 字段），不在 UI 列表呈现。
// 运行时动态生成：npx / 浏览器 / npx 缓存优先取内置运行时（provision 装配 +
// afterPack 打进 Resources），未装配时回退系统环境（npx 走宿主 PATH，
// 浏览器走 playwright 默认缓存目录）
// npx 统一走 node + npx-cli.js（npm 内部脚本）：Windows spawn .cmd 受限，
// 且该模式跨平台同构；无内置运行时才回退宿主 PATH 上的 npx
function builtinServers() {
  const exe = runtime.nodeExe()
  const cli = runtime.npxCli()
  let command = 'npx'
  let args = ['-y', '@playwright/mcp@' + PLAYWRIGHT_MCP_VERSION]
  if (exe && cli) {
    command = exe
    args = [cli, '-y', '@playwright/mcp@' + PLAYWRIGHT_MCP_VERSION]
  }
  // 产物目录指向应用内部：不指定时 MCP 会把截图等自动产物写入
  // <工作空间>/.playwright-mcp（stdio server 以会话 cwd 启动），污染用户目录
  // 浏览器模式（见 playwrightHeaded）：
  //   无头（默认）：--headless 静默运行，窗口不弹出（截图/自动化能力不受影响）
  //   有头：--browser chrome 走系统 Chrome 弹窗，供扫码/验证码等人工交互登录
  // --user-data-dir：持久浏览器 profile（cookie / 登录态跨会话保持），
  //   支撑「首次登录一次、后续免登录」的站点自动化（如需登录态的站点搜索）；
  //   有头首登的登录态同样落此 profile，切回无头后直接复用
  // --caps=storage：登录态持久化工具组（browser_storage_state 保存 /
  //   browser_set_storage_state 恢复 / cookie 与 localStorage 管理等），
  //   支撑「首登一次 → 存状态 → 后续会话恢复免登录」，与 --user-data-dir
  //   持久 profile 双轨互补（storageState 为 JSON 文件，可单独备份迁移）
  args = args.concat(['--caps=storage'],
    playwrightHeaded() ? ['--browser', 'chrome'] : ['--headless'],
    ['--output-dir', path.join(agentDir, 'playwright-output'),
      '--user-data-dir', path.join(agentDir, 'playwright-profile')])
  const env = {}
  const nodeBin = runtime.nodeBinDir()
  if (nodeBin) env.PATH = nodeBin + path.delimiter + (process.env.PATH || '')
  const browsers = runtime.playwrightBrowsersDir()
  if (browsers) env.PLAYWRIGHT_BROWSERS_PATH = browsers
  const npxCache = runtime.npxCacheDir()
  if (npxCache) env.npm_config_cache = npxCache
  return {
    playwright: {
      command,
      args,
      env,
      description: '浏览器自动化（系统内置）'
    }
  }
}

function mcpFile() {
  return path.join(agentDir, 'mcp.json')
}

function settingsFile() {
  return path.join(agentDir, 'settings.json')
}

// ===== 旧版 pi-mcp-adapter 清理 =====
// pi 1.0.0 已内置 MCP 支持，且安装了注册 /mcp 命令的扩展（如 pi-mcp-adapter）
// 反而会「替代」内置支持（pi 不再读取 mcp.json）。升级后须清掉旧注册记录：
// 1. settings.json packages 中的本地路径记录与 npm: 记录
// 2. pi install 装到 agentDir/npm 的残留目录
// 返回 true 表示发生了清理（调用方在无会话的启动阶段调用，无需销毁重建）
function cleanupLegacyAdapter() {
  let changed = false
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf-8'))
    const packages = Array.isArray(settings.packages) ? settings.packages : []
    const next = packages.filter(p => typeof p === 'string' && p.indexOf('pi-mcp-adapter') < 0)
    if (next.length !== packages.length) {
      settings.packages = next
      fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2))
      changed = true
      console.log('[omnibuddy:mcp] 已清理旧版 pi-mcp-adapter 注册记录')
    }
  } catch (e) { /* settings.json 不存在或损坏：无需清理 */ }
  const legacyDir = path.join(agentDir, 'npm', 'pi-mcp-adapter')
  if (fs.existsSync(legacyDir)) {
    try {
      fs.rmSync(legacyDir, { recursive: true, force: true })
      changed = true
      console.log('[omnibuddy:mcp] 已删除旧版 pi-mcp-adapter 安装目录')
    } catch (e) { /* 删除失败不影响内置装载 */ }
  }
  return changed
}

// ===== 初始化与刷新 =====
function init(dir) {
  agentDir = dir
  fs.mkdirSync(agentDir, { recursive: true })
  const builtin = builtinServers()
  // 首次运行写入预置配置（内置服务）
  if (!fs.existsSync(mcpFile())) {
    try {
      fs.writeFileSync(mcpFile(), JSON.stringify({ mcpServers: builtin }, null, 2))
    } catch (e) {
      // 写入失败不阻塞启动，list() 会回退空列表
    }
  } else {
    // 内置服务条目按当前运行时刷新（dev ⇄ 打包路径切换 / 版本升级后自动修正），幂等
    refreshBuiltinEntry()
  }
  // 清理旧版 pi-mcp-adapter 注册（升级到内置 MCP 后的幂等迁移）
  cleanupLegacyAdapter()
}

// 内置服务条目按当前运行时刷新 mcp.json（幂等）：init 启动校正与
// setHeaded 开关切换共用——路径 / 版本 / 有头开关任一变化即重写条目
function refreshBuiltinEntry() {
  try {
    const config = JSON.parse(fs.readFileSync(mcpFile(), 'utf-8'))
    const servers = (config && config.mcpServers) || {}
    const cur = servers.playwright
    const target = builtinServers().playwright
    const stale = !cur || cur.command !== target.command ||
      JSON.stringify(cur.args || []) !== JSON.stringify(target.args) ||
      JSON.stringify(cur.env || {}) !== JSON.stringify(target.env)
    if (stale) {
      servers.playwright = target
      config.mcpServers = servers
      fs.writeFileSync(mcpFile(), JSON.stringify(config, null, 2))
      console.log('[omnibuddy:mcp] 内置服务条目已按当前运行时刷新')
    }
  } catch (e) {
    // 损坏文件交给 list() 回退空列表，不做硬性修复
  }
}

// ===== 配置清单与保存 =====
// mcp.json → UI 结构数组：
// { name, transport: 'stdio'|'http', description, enabled,
//   command, args, env, url, headers, credentialId }
// 内置服务（如 playwright）为系统级能力，过滤后不返回——连接器页不呈现、不可管理
// （能力清单需呈现系统级连接器，取 builtinList()）
function list() {
  let config = {}
  try {
    config = JSON.parse(fs.readFileSync(mcpFile(), 'utf-8'))
  } catch (e) {
    /* 文件不存在或损坏：返回空列表 */
  }
  const servers = (config && config.mcpServers) || {}
  const builtin = builtinServers()
  const out = []
  for (const name of Object.keys(servers)) {
    if (builtin[name]) continue
    const s = servers[name] || {}
    const isHttp = !!s.url
    out.push({
      name,
      transport: isHttp ? 'http' : 'stdio',
      description: s.description || '',
      enabled: !s.disabled,
      command: isHttp ? undefined : s.command,
      args: isHttp ? undefined : s.args,
      env: isHttp ? undefined : s.env,
      url: isHttp ? s.url : undefined,
      headers: isHttp ? s.headers : undefined,
      credentialId: s.credentialId || undefined
    })
  }
  return out
}

// 内置服务的清单结构（能力清单用）：供能力中心呈现系统级连接器
// 与 list() 的过滤口径同源（builtinServers 的键即内置服务），但不受「UI 不呈现」约束
function builtinList() {
  const builtin = builtinServers()
  return Object.keys(builtin).map(name => ({
    name,
    transport: 'stdio',
    description: builtin[name].description || '',
    enabled: true,
    builtin: true
  }))
}

function isPlainObject(v) {
  return !!v && typeof v === 'object' && !Array.isArray(v)
}

// 保存（全量覆盖写 mcp.json）：
// 1. 校验：name 非空且唯一、stdio 需 command、http 需 url；
//    args 必须数组、env/headers 必须对象，非法直接返回错误
// 2. 凭证注入：credentialId → credentials.resolve 解密取 { headers, env } 合并，
//    server 自身显式值优先（按 key 覆盖凭证值）
// 3. 序列化：内置服务始终前置合并（强制启用、不带 disabled）；
//    stdio 型写 { command, args, env, description, disabled, credentialId }；
//    http 型写 { url, headers, description, disabled, credentialId }
function save(servers) {
  try {
    if (!Array.isArray(servers)) return { ok: false, error: '参数错误：服务列表必须为数组' }
    const mcpServers = {}
    const seen = new Set()
    for (const raw of servers) {
      const s = raw || {}
      const name = String(s.name || '').trim()
      if (!name) return { ok: false, error: '服务名称不能为空' }
      if (seen.has(name)) return { ok: false, error: '服务名称重复：' + name }
      seen.add(name)

      const isHttp = s.transport === 'http'
      const description = String(s.description || '').trim()
      const enabled = s.enabled !== false

      const args = (s.args === undefined || s.args === null) ? [] : s.args
      if (!Array.isArray(args)) return { ok: false, error: 'args 必须为数组：' + name }
      if (s.env !== undefined && s.env !== null && !isPlainObject(s.env)) {
        return { ok: false, error: 'env 必须为对象：' + name }
      }
      if (s.headers !== undefined && s.headers !== null && !isPlainObject(s.headers)) {
        return { ok: false, error: 'headers 必须为对象：' + name }
      }

      // 凭证注入（server 自身显式值优先）
      let credHeaders = {}
      let credEnv = {}
      if (s.credentialId) {
        const cred = credentials.resolve(s.credentialId)
        credHeaders = cred.headers || {}
        credEnv = cred.env || {}
      }
      const headers = Object.assign({}, credHeaders, isPlainObject(s.headers) ? s.headers : null)
      const env = Object.assign({}, credEnv, isPlainObject(s.env) ? s.env : null)

      let entry
      if (isHttp) {
        const url = String(s.url || '').trim()
        if (!url) return { ok: false, error: 'http 服务需填写 URL：' + name }
        entry = { url, headers, description, disabled: !enabled }
      } else {
        const command = String(s.command || '').trim()
        if (!command) return { ok: false, error: 'stdio 服务需填写启动命令：' + name }
        entry = { command, args, env, description, disabled: !enabled }
      }
      if (s.credentialId) entry.credentialId = s.credentialId
      mcpServers[name] = entry
    }
    // 内置服务始终保留并强制启用（当前运行时路径动态生成，前置合并覆盖旧值——
    // dev ⇄ 打包切换时自动刷新 npx / 浏览器 / 缓存路径）
    const merged = Object.assign({}, builtinServers(), mcpServers)
    fs.writeFileSync(mcpFile(), JSON.stringify({ mcpServers: merged }, null, 2))
    // 凭证注入后含明文 headers/env（pi 装载器需真实值），收紧文件权限
    try { fs.chmodSync(mcpFile(), 0o600) } catch (e) { /* chmod 失败不影响功能 */ }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: '保存 MCP 配置失败：' + e.message }
  }
}

module.exports = {
  // 初始化目录并写入预置配置
  init,
  // 用户 MCP 服务列表（过滤内置）
  list,
  // 内置服务清单（能力中心用）
  builtinList,
  // 校验并全量保存（含凭证注入）
  save,
  // 读取有头开关
  getHeaded,
  // 写入有头开关并刷新内置条目
  setHeaded
}
