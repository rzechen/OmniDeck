// OmniBuddy MCP 服务配置管理
// pi 社区扩展 pi-mcp-adapter 读取 <agentDir>/mcp.json（标准 MCP 格式：
// { mcpServers: { name: { command, args, env, disabled?, description? }
//               或 { url, headers, disabled?, description? } } }），
// 注册后由 pi 的 DefaultResourceLoader 自动装载。
// 本模块职责：预置配置初始化 / UI 视图列表 / 校验保存（支持凭证注入）/ 内置适配器注册。
const path = require('path')
const fs = require('fs')
const credentials = require('./credentials')
const runtime = require('./runtime')

let agentDir = ''

// playwright MCP 版本锚点（与 scripts/provision-runtime.sh 的 PLAYWRIGHT_MCP_VERSION
// 联动：npx-cache 预热须同 spec 才能离线命中；@latest 会绕过缓存重新联网下载）
const PLAYWRIGHT_MCP_VERSION = '0.0.81'

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
  // 产物目录指向应用内部：不指定时 MCP 会把截图等自动命名产物写入
  // <工作空间>/.playwright-mcp（stdio server 以会话 cwd 启动），污染用户目录
  // --headless：无头模式静默运行，浏览器窗口不弹出（截图/自动化能力不受影响）
  args = args.concat(['--headless', '--output-dir', path.join(agentDir, 'playwright-output')])
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

// ===== 内置适配器注册（pi-mcp-adapter 随应用打包，无需用户安装） =====
// 包已加入项目 dependencies：dev 环境位于 <root>/node_modules，打包后位于 app.asar 内
// （原生依赖由 electron-builder smartUnpack 自动解包）。
// pi 的 packages 支持本地绝对路径源（不复制、直接加载，jiti 解析依赖时沿
// node_modules 向上查找，天然命中应用内的依赖闭包）。
function builtinAdapterPath() {
  try {
    // 主入口解析为 <pkg>/index.ts，其上级目录即包根；
    // 沿 dist-electron/agent → dist-electron → 应用根 查找 node_modules，dev 与打包（asar）环境同构
    // （注意：包的 exports 未导出 ./package.json 子路径，不能 resolve 子路径）
    return path.dirname(require.resolve('pi-mcp-adapter'))
  } catch (e) {
    return ''
  }
}

// 确保内置适配器已注册到 settings.json 的 packages：
// 1. 已有旧版手动安装记录（npm:pi-mcp-adapter 且实际已装）→ 保留不动
// 2. 已注册本地路径与当前环境一致 → 幂等跳过
// 3. 注册的是其它环境的本地路径（dev ⇄ 打包切换）→ 替换为当前路径
// 4. 无任何记录 → 追加当前路径
// 返回 true 表示 settings.json 发生了变更（调用方需销毁旧会话以重新装载）
function registerBuiltinAdapter() {
  const pkgPath = builtinAdapterPath()
  if (!pkgPath) {
    console.warn('[omnibuddy:mcp] 内置适配器包缺失：node_modules/pi-mcp-adapter 不可解析')
    return false
  }
  let settings = {}
  try {
    settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf-8'))
  } catch (e) { /* 首次不存在 */ }
  const packages = Array.isArray(settings.packages) ? settings.packages : []
  // 旧版经 pi install 装到 agentDir/npm 的记录：目录存在即可用，尊重现状
  if (packages.includes('npm:pi-mcp-adapter') &&
      fs.existsSync(path.join(agentDir, 'npm', 'pi-mcp-adapter'))) {
    return false
  }
  if (packages.includes(pkgPath)) return false
  // 清理其它环境的本地路径记录（字符串源且指向 pi-mcp-adapter 但非当前路径）
  const next = packages.filter(p => {
    if (typeof p !== 'string') return true
    return !(p.indexOf('pi-mcp-adapter') >= 0 && p.indexOf('npm:') !== 0 && p !== pkgPath)
  })
  next.push(pkgPath)
  settings.packages = next
  try {
    fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2))
    console.log('[omnibuddy:mcp] 内置适配器已注册：', pkgPath)
    return true
  } catch (e) {
    console.warn('[omnibuddy:mcp] 注册内置适配器失败：', e.message)
    return false
  }
}

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
    try {
      const config = JSON.parse(fs.readFileSync(mcpFile(), 'utf-8'))
      const servers = (config && config.mcpServers) || {}
      const cur = servers.playwright
      const target = builtin.playwright
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
  // 注册内置适配器（应用启动时尚无会话，无需销毁重建）
  registerBuiltinAdapter()
}

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

// 适配器是否可用：内置包可解析（随应用打包），或旧版 pi install 记录仍有效
function adapterInstalled() {
  if (builtinAdapterPath()) return true
  try {
    const settings = JSON.parse(fs.readFileSync(settingsFile(), 'utf-8'))
    return Array.isArray(settings.packages) && settings.packages.includes('npm:pi-mcp-adapter') &&
      fs.existsSync(path.join(agentDir, 'npm', 'pi-mcp-adapter'))
  } catch (e) {
    return false
  }
}

// 确保适配器可用：内置注册（幂等写 settings.json）；注册发生变化时销毁运行中会话（新会话重建时装载扩展）
// 正常情况启动时 init 已完成注册，此接口仅作兜底修复（UI「修复注册」按钮）
async function ensureAdapter() {
  if (!adapterInstalled()) return { ok: false, error: '适配器包缺失（应用文件不完整，请重新安装应用）' }
  const changed = registerBuiltinAdapter()
  if (changed) {
    // 惰性 require：pi.js 运行时与本模块相互引用，加载期 require 会形成循环依赖
    const piRuntime = require('./pi')
    await piRuntime.disposeAllSessions()
  }
  return { ok: true, installed: true, builtin: true }
}

module.exports = { init, list, builtinList, save, adapterInstalled, ensureAdapter }
