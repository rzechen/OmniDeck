// pi 扩展安装与部署（启动期异步装配，均幂等、失败下次启动重试）：
// - 前台子代理 MCP 加载扩展（omnideck-child-mcp.mjs，部署到 agentDir/extensions）
// - pi-memory 语义记忆（安装 + 旧记忆迁移 + qmd 检测）
// - pi-permission-system 权限系统（安装 + 默认策略 config）
// - pi-markdown-preview 文档导出（安装）
// - pi-dynamic-workflows 深度研究（安装 + 默认护栏设置）
const path = require('path')
const fs = require('fs')
const { execSync } = require('child_process')
const permissions = require('../platform/permissions')
const builtinTools = require('../tools/builtin-tools')
const { state, PROJECT_ROOT } = require('./state')
const { listPackages, installPackage } = require('./packages')
const { disposeAllSessions } = require('./session')

// pi-memory 退出摘要：扩展默认跳过 reload/new/resume/fork 过渡原因的摘要生成。
// SDK 的 dispose() 不发射 session_shutdown，宿主靠主动 reload()（reason=reload）
// 触发摘要，须放开过渡摘要开关；用户已显式设置时尊重用户值
if (!process.env.PI_MEMORY_SUMMARIZE_TRANSITIONS) {
  process.env.PI_MEMORY_SUMMARIZE_TRANSITIONS = '1'
}

// ===== 前台子代理 MCP 加载扩展（部署到 agentDir，agent 定义经 subagentOnlyExtensions 引用）=====
// pi-subagents 前台 child 与宿主同进程但不加载 ambient 扩展（宿主 inline 的
// createMcpExtension 不在其内）→ MCP 工具不可见。本扩展在 child 内部以 pi 内置
// createMcpExtension 读取同一 agentDir/mcp.json（连接配置/工具形态与主会话完全
// 一致），配合 tools 白名单让前台同步委派（阻塞执行 + onUpdate 进度透传）可用。
// 关键：import 须用绝对路径直连 SDK——前台 child 经 jiti 加载本文件时，模块
// 解析从本文件目录（agentDir/extensions/）向上找不到裸包（该包 exports 封闭、
// 不在解析链上，且前台无 JITI_ALIAS）；后台 runner 反而不缺（有别名表）
function childMcpExtensionSource(piPkgEntry) {
  return [
    '// OmniBuddy 自动部署：前台子代理专用 MCP 加载扩展（勿手改，启动时幂等覆写）',
    '// import 绝对路径直连 SDK：前台 child 的 jiti 从本文件目录解析不到裸包 peer',
    "import { createMcpExtension } from '" + piPkgEntry + "'",
    'export default createMcpExtension()',
    ''
  ].join('\n')
}

function deployChildMcpExtension(agentDir) {
  const piPkgEntry = path.join(PROJECT_ROOT, 'node_modules', '@earendil-works',
    'pi-coding-agent', 'dist', 'index.js')
  if (!fs.existsSync(piPkgEntry)) {
    console.warn('[omnibuddy:pi] SDK 入口缺失，跳过子代理 MCP 扩展部署：', piPkgEntry)
    return
  }
  const dir = path.join(agentDir, 'extensions')
  const file = path.join(dir, 'omnideck-child-mcp.mjs')
  const src = childMcpExtensionSource(piPkgEntry)
  try {
    fs.mkdirSync(dir, { recursive: true })
    // 内容一致则跳过写盘（避免每次启动无谓触发文件监听）
    try {
      if (fs.readFileSync(file, 'utf-8') === src) return
    } catch (e) { /* 首次部署无文件 */ }
    fs.writeFileSync(file, src)
    console.log('[omnibuddy:pi] 已部署前台子代理 MCP 扩展：', file)
  } catch (e) {
    console.warn('[omnibuddy:pi] 子代理 MCP 扩展部署失败：', e.message)
  }
}

// ===== subagent 前台同步强制（产品策略：只保留同步委派）=====
// pi-subagents 出厂默认 asyncByDefault=true（省略 async 即后台执行，且模型可
// 显式传 async:true）——后台 child 在独立 runner 进程运行、无流式回传，主回合
// 立即结束只剩轮询活性，违背「过程实时可见、回合内完成」的产品形态。双层强制：
//   1) extensions/subagent/config.json 恒定 asyncByDefault=false（含 workflow
//      script 内省略 async 的内部 spawn 默认）
//   2) omnideck-fg-subagent.mjs 经官方 tool_call 钩子原地改写参数（mutate
//      event.input），剥离显式 async:true —— 官方 disabledFeatures 无 async 组、
//      纯配置挡不住显式传参，钩子层兜底（API 见 pi-coding-agent types.d.ts
//      ToolCallEventResult："To modify arguments, mutate event.input in place"）
function subagentConfigFile(agentDir) {
  return path.join(agentDir, 'extensions', 'subagent', 'config.json')
}

function ensureSubagentForegroundConfig(agentDir) {
  const file = subagentConfigFile(agentDir)
  let config = {}
  try {
    config = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (!config || typeof config !== 'object') config = {}
  } catch (e) { /* 无文件或损坏：重建 */ }
  if (config.asyncByDefault === false) return false
  config.asyncByDefault = false
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(config, null, 2))
    return true
  } catch (e) {
    console.warn('[omnibuddy:pi] subagent 前台默认写入失败：', e.message)
    return false
  }
}

function fgSubagentExtensionSource() {
  return [
    '// OmniBuddy 自动部署：subagent 前台同步强制扩展（勿手改，启动时幂等覆写）',
    '// 官方 tool_call 钩子原地改写参数：剥离 subagent 调用中的显式 async:true，',
    '// 杜绝模型绕过 asyncByDefault=false 的后台委派（后台 child 无流式回传，不采用）',
    'export default function (pi) {',
    '  pi.on("tool_call", (event) => {',
    '    if (event.toolName !== "subagent") return',
    '    const input = event.input',
    '    if (input && typeof input === "object" && input.async === true) {',
    '      delete input.async',
    '      console.log("[omnideck:fg-subagent] 已强制前台执行（剥离 async:true）")',
    '    }',
    '  })',
    '}',
    ''
  ].join('\n')
}

function deployFgSubagentExtension(agentDir) {
  const dir = path.join(agentDir, 'extensions')
  const file = path.join(dir, 'omnideck-fg-subagent.mjs')
  const src = fgSubagentExtensionSource()
  try {
    fs.mkdirSync(dir, { recursive: true })
    try {
      if (fs.readFileSync(file, 'utf-8') === src) return
    } catch (e) { /* 首次部署无文件 */ }
    fs.writeFileSync(file, src)
    console.log('[omnibuddy:pi] 已部署 subagent 前台强制扩展：', file)
  } catch (e) {
    console.warn('[omnibuddy:pi] subagent 前台强制扩展部署失败：', e.message)
  }
}

function deploySubagentForegroundPolicy(agentDir) {
  if (ensureSubagentForegroundConfig(agentDir)) {
    console.log('[omnibuddy:pi] 已写入 pi-subagents 前台默认（asyncByDefault=false）')
  }
  deployFgSubagentExtension(agentDir)
}

// ===== 子代理工具通用化（环境注入收敛到宿主，agent 定义零绝对路径）=====
// 官方通道（pi-subagents docs/agents.md）：前台 child 不加载宿主 ambient 扩展，
// 其工具来源两条——
//   1) `mcp:server` tools 条目：Pi 内置 MCP（≥0.99）在 child 会话内直连
//      agentDir/mcp.json 的 server，自动解析真实注册名并入白名单（前台可用；
//      仅"扩展运行时注册的 server"前台不可用，本应用 server 均静态配置）
//   2) settings 键 `subagents.defaultSubagentOnlyExtensions`：对未自带
//      subagentOnlyExtensions 的 agent 统一注入 child-only 扩展路径
// 本组函数职责（均幂等）：
//   a) 部署 omnideck-child-image.mjs：child 版 generate_image（复用宿主
//      image-gen.js 工厂，绝对路径直连——与 omnideck-child-mcp.mjs 同模式）
//   b) 部署 omnideck-child-introspect.mjs：child 首回合注入实际装载工具清单
//      （自省简报——工具缺失属宿主装配缺口时模型如实上报，不再读源码排障）
//   c) settings.json 注入 defaultSubagentOnlyExtensions：pi-web-access
//      + child-image + child-mcp + child-introspect。注册后由各 agent 的
//      tools 白名单筛用
// ===== child 自省简报（修复「碰壁式探索」：10-09 公众号任务实证）=====
// before_agent_start（扩展 API 见 pi-coding-agent types.d.ts
// BeforeAgentStartEventResult.message）在首个回合前注入一条 custom message：
// 实际装载工具清单 + 「缺工具 = 宿主装配缺口，如实上报，勿读源码/装依赖/改
// agentDir 配置」的处置指令。MCP 前缀分组压缩（playwright 43 工具不刷屏）。
function childIntrospectExtensionSource() {
  return [
    '// OmniBuddy 自动部署：前台子代理环境简报扩展（勿手改，启动时幂等覆写）',
    '// 首回合注入实际装载工具清单：模型不再为确认工具可用性读宿主源码 /',
    '// 检查 node_modules / 修改 agentDir 配置（环境排障收敛为如实上报）',
    'export default function (pi) {',
    '  let briefed = false',
    '  pi.on("session_start", () => { briefed = false })',
    '  pi.on("before_agent_start", () => {',
    '    if (briefed) return',
    '    briefed = true',
    '    let names = []',
    '    try { names = pi.getActiveTools() || [] } catch (e) { names = [] }',
    '    const groups = {}',
    '    const singles = []',
    '    for (const n of names) {',
    '      const m = /^mcp__([a-z0-9_]+)__/i.exec(n)',
    '      if (m) { (groups[m[1]] = groups[m[1]] || []).push(n) } else singles.push(n)',
    '    }',
    '    const parts = []',
    '    for (const srv of Object.keys(groups).sort()) {',
    '      const tools = groups[srv]',
    '      parts.push("mcp server " + srv + "(" + tools.length + " 个工具)")',
    '    }',
    '    for (const n of singles) parts.push(n)',
    '    const content = "环境简报（宿主注入，可信，勿再自行验证）：本会话实际装载的工具——"',
    '      + parts.join("、") + "。"',
    '      + "任务所需工具若不在此列，属宿主装配缺口：直接如实失败并报告缺少的工具名，"',
    '      + "不要安装依赖、不要读取宿主/产品源码或 node_modules、不要修改 agentDir 配置"',
    '      + "（settings.json / mcp.json / extensions 均为宿主托管，只读）。"',
    '      + "MCP 工具名中 server 段的下划线对应原始 server 名中的连字符等字符（如 wechat_mcp 对应 wechat-mcp）。"',
    '    return { message: { customType: "omnideck_env_brief", content, display: false } }',
    '  })',
    '}',
    ''
  ].join('\n')
}

function deployChildIntrospectExtension(agentDir) {
  const dir = path.join(agentDir, 'extensions')
  const file = path.join(dir, 'omnideck-child-introspect.mjs')
  const src = childIntrospectExtensionSource()
  try {
    fs.mkdirSync(dir, { recursive: true })
    try {
      if (fs.readFileSync(file, 'utf-8') === src) return
    } catch (e) { /* 首次部署无文件 */ }
    fs.writeFileSync(file, src)
    console.log('[omnibuddy:pi] 已部署子代理环境简报扩展：', file)
  } catch (e) {
    console.warn('[omnibuddy:pi] 子代理环境简报扩展部署失败：', e.message)
  }
}

function childImageExtensionSource(projectRoot, agentDir) {
  return [
    '// OmniBuddy 自动部署：前台子代理图像生成扩展（勿手改，启动时幂等覆写）',
    '// 复用宿主 image-gen.js 工厂；agentDir 经 PI_CODING_AGENT_DIR 传递（宿主已设）',
    "import { createImageGenExtension } from '" + path.join(projectRoot, 'electron', 'agent', 'tools', 'image-gen.js') + "'",
    'const agentDir = process.env.PI_CODING_AGENT_DIR || ' + JSON.stringify(agentDir),
    'export default createImageGenExtension({ dir: process.cwd() }, agentDir, null)',
    ''
  ].join('\n')
}

function deployChildImageExtension(agentDir) {
  const dir = path.join(agentDir, 'extensions')
  const file = path.join(dir, 'omnideck-child-image.mjs')
  const src = childImageExtensionSource(PROJECT_ROOT, agentDir)
  try {
    fs.mkdirSync(dir, { recursive: true })
    try {
      if (fs.readFileSync(file, 'utf-8') === src) return
    } catch (e) { /* 首次部署无文件 */ }
    fs.writeFileSync(file, src)
    console.log('[omnibuddy:pi] 已部署子代理图像生成扩展：', file)
  } catch (e) {
    console.warn('[omnibuddy:pi] 子代理图像生成扩展部署失败：', e.message)
  }
}

// 归一化路径比较键：macOS 默认卷大小写不敏感，/OmniDeck 与 /omnideck 为同一路径，
// 字符串直等判重会让同一路径以两种大小写重复注入（实测 child-image 被注入两次）
function pathKey(p) {
  return path.normalize(String(p)).toLowerCase()
}

// settings.json 注入 subagents.defaultSubagentOnlyExtensions（merge 不覆盖其余键）。
// 顺带收敛存量：同路径不同大小写/分隔符的重复条目归一保留首个；宿主 wanted
// （web-access / child-image / child-mcp / child-introspect）缺失则补齐——
// child-mcp 补齐即「前台 child MCP 装配闭环」，不再依赖 agent 定义自带
// subagentOnlyExtensions 或模型运行时手动修补（10-09 事故实证）
function ensureChildToolDefaults(agentDir) {
  const file = path.join(agentDir, 'settings.json')
  let settings = {}
  try {
    settings = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (!settings || typeof settings !== 'object') settings = {}
  } catch (e) { /* 首次无文件 */ }
  // pi-web-access 本地路径：settings packages 已登记（pkg-registry），取本地路径条目
  const pkgPath = (settings.packages || []).find(p =>
    typeof p === 'string' && p.indexOf('pi-web-access') >= 0 && p.indexOf('npm:') !== 0)
  if (!pkgPath) {
    console.warn('[omnibuddy:pi] pi-web-access 未登记，跳过 child 工具默认注入')
    return
  }
  const childExtras = [
    'omnideck-child-image.mjs',
    'omnideck-child-mcp.mjs',
    'omnideck-child-introspect.mjs'
  ]
    .map(name => path.join(agentDir, 'extensions', name))
    .filter(p => fs.existsSync(p)) // 部署失败的扩展不注入（避免 child 加载报错）
  const wanted = [pkgPath].concat(childExtras)
  const cur = (settings.subagents && settings.subagents.defaultSubagentOnlyExtensions) || []
  // 存量归一去重（保留用户/历史手动加入的其他条目），再补宿主 wanted 缺项
  const seen = new Set()
  const deduped = []
  for (const p of cur) {
    const k = pathKey(p)
    if (k === '' || seen.has(k)) continue
    seen.add(k)
    deduped.push(p)
  }
  const merged = deduped.concat(wanted.filter(p => !seen.has(pathKey(p))))
  const changed = merged.length !== cur.length ||
    merged.some((p, i) => pathKey(p) !== pathKey(cur[i]))
  if (!changed) return
  settings.subagents = Object.assign({}, settings.subagents, { defaultSubagentOnlyExtensions: merged })
  try {
    fs.writeFileSync(file, JSON.stringify(settings, null, 2))
    console.log('[omnibuddy:pi] 已注入 subagents.defaultSubagentOnlyExtensions（含去重收敛）')
  } catch (e) {
    console.warn('[omnibuddy:pi] child 工具默认注入失败：', e.message)
  }
}

function deployChildToolPolicy(agentDir) {
  deployChildImageExtension(agentDir)
  deployChildIntrospectExtension(agentDir)
  ensureChildToolDefaults(agentDir)
}

// ===== pi-memory 语义记忆 =====
// 社区扩展包 pi-memory：MEMORY.md 长期记忆 + 每日日志 + 语义检索（qmd），
// 经 pi install npm:pi-memory 装到 agentDir 并由 DefaultResourceLoader 自动装载。
// 记忆目录固定到 agentDir/memory（与 agentDir 同盘，随 OmniBuddy 数据管理）。
const MEMORY_PKG = 'pi-memory'

function memoryDir() {
  return path.join(state.agentDir, 'memory')
}

// qmd 存在性检测：npm 全局 bin → bun 全局 bin
function qmdPath() {
  try {
    const p = execSync(
      process.platform === 'win32' ? 'where qmd' : 'which qmd',
      { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 3000 }
    ).split('\n')[0].trim()
    if (p && fs.existsSync(p)) return p
  } catch (e) { /* 未安装 */ }
  const fallback = process.platform === 'win32'
    ? ''
    : path.join(process.env.HOME || '', '.bun', 'bin', 'qmd')
  if (fallback && fs.existsSync(fallback)) return fallback
  return ''
}

// 旧版关键词记忆（memories.jsonl）迁移到 pi-memory 的 MEMORY.md
// （MEMORY.md 不存在时追加，已迁移过则跳过；原文件重命名为 .bak 保留）
function migrateLegacyMemories() {
  const legacy = path.join(state.agentDir, 'memories.jsonl')
  if (!fs.existsSync(legacy)) return false
  const list = builtinTools.loadMemories()
  if (!list.length) {
    fs.renameSync(legacy, legacy + '.bak')
    return false
  }
  const target = path.join(memoryDir(), 'MEMORY.md')
  fs.mkdirSync(memoryDir(), { recursive: true })
  const TYPE_TAG = { preference: '#preference', semantic: '#fact', episodic: '#history' }
  const stamp = new Date().toISOString().slice(0, 19).replace('T', ' ')
  const lines = list
    .filter(m => typeof m.content === 'string' && m.content.trim())
    .map(m => `- ${TYPE_TAG[m.type] || '#fact'} ${m.content.trim()}`)
  if (!lines.length) {
    fs.renameSync(legacy, legacy + '.bak')
    return false
  }
  const block = [
    `<!-- ${stamp} [legacy-migration] -->`,
    '## 从旧版 OmniBuddy 记忆迁移（memories.jsonl）',
    ...lines,
    ''
  ].join('\n')
  if (fs.existsSync(target)) {
    fs.appendFileSync(target, '\n' + block)
  } else {
    fs.writeFileSync(target, block)
  }
  fs.renameSync(legacy, legacy + '.bak')
  console.log('[omnibuddy:pi] 旧记忆已迁移到 pi-memory：', list.length, '条')
  return true
}

// 首次启动流程：安装 pi-memory → 迁移旧记忆 → 注入环境变量
// 异步执行（pi install 需联网，不阻塞主流程；失败后下次启动重试）
let memorySetupDone = false
async function setupMemoryExtension() {
  if (memorySetupDone) return
  memorySetupDone = true
  try {
    // 已注册（本机已装或旧版经 pi install 安装过）则跳过安装
    if (!listPackages().some(p => String(p).indexOf(MEMORY_PKG) >= 0)) {
      const r = await installPackage(MEMORY_PKG)
      if (!r.ok) {
        console.warn('[omnibuddy:pi] pi-memory 安装失败（下次启动重试）：', r.error)
        return
      }
      console.log('[omnibuddy:pi] pi-memory 已安装')
    }
    migrateLegacyMemories()
    // PI_MEMORY_DIR：记忆固定存到 agentDir/memory（确保目录存在）；qmd PATH 注入
    fs.mkdirSync(memoryDir(), { recursive: true })
    process.env.PI_MEMORY_DIR = memoryDir()
    const qmd = qmdPath()
    if (qmd) {
      process.env.PATH = path.dirname(qmd) + path.delimiter + process.env.PATH
      console.log('[omnibuddy:pi] qmd 已检测到：', qmd)
    } else {
      console.log('[omnibuddy:pi] qmd 未安装，memory_search 语义检索不可用（核心记忆工具不受影响）')
    }
  } catch (e) {
    console.warn('[omnibuddy:pi] pi-memory 初始化异常：', e.message)
  }
}

// ===== 权限系统（@gotgenes/pi-permission-system） =====
// 扩展经 pi CLI 装到 agentDir/npm，由 DefaultResourceLoader 自动装载；
// 确认交互经 permissions.js 桥接到前端卡片。异步安装，失败下次启动重试。
let permissionSetupDone = false
async function setupPermissionExtension() {
  if (permissionSetupDone) return
  permissionSetupDone = true
  try {
    if (!listPackages().some(p => String(p).indexOf(permissions.SCOPE) >= 0)) {
      const r = await installPackage(permissions.SCOPE)
      if (!r.ok) {
        console.warn('[omnibuddy:pi] 权限系统安装失败（下次启动重试）：', r.error)
        return
      }
      console.log('[omnibuddy:pi] pi-permission-system 已安装')
    }
    // 默认策略（无 config 时写入；已有则尊重用户编辑）
    if (permissions.ensureConfig(state.agentDir)) {
      console.log('[omnibuddy:pi] 已写入权限系统默认策略')
    }
  } catch (e) {
    console.warn('[omnibuddy:pi] 权限系统初始化异常：', e.message)
  }
}

// ===== pi-markdown-preview（文档导出） =====
// 社区扩展包：注册 preview_export 工具（Markdown/LaTeX/本地文件/最新回复 →
// PDF/HTML/PNG artifact 文件并返回路径，适配远程/无头交付）。仅消费工具面，
// 其 /preview 系列终端命令在 GUI 宿主不触发即无害。转换依赖 pandoc
// （init 已注入 PATH）与 chromium（puppeteer-core 随包依赖）。
// 异步安装（需联网），失败下次启动重试。
let previewSetupDone = false
async function setupPreviewExtension() {
  if (previewSetupDone) return
  previewSetupDone = true
  try {
    if (!listPackages().some(p => String(p).indexOf('pi-markdown-preview') >= 0)) {
      const r = await installPackage('pi-markdown-preview')
      if (!r.ok) {
        console.warn('[omnibuddy:pi] pi-markdown-preview 安装失败（下次启动重试）：', r.error)
        return
      }
      console.log('[omnibuddy:pi] pi-markdown-preview 已安装')
    }
  } catch (e) {
    console.warn('[omnibuddy:pi] pi-markdown-preview 初始化异常：', e.message)
  }
}

// ===== pi-dynamic-workflows（深度研究） =====
// 社区扩展包 @quintinshaw/pi-dynamic-workflows：注册 workflow / workflow_control
// 工具（多代理编排：deep-research / code-review / adversarial-review /
// multi-perspective / codebase-audit 五个内置模式 + 自定义脚本）。
// 子代理为进程内会话、共享宿主 ModelRuntime，无额外进程开销。
// 异步安装（需联网），失败下次启动重试。
//
// 默认护栏（~/.pi/workflows/settings.json，仅无配置时写入，尊重用户编辑）：
// - inheritMainModel: 未打标子代理继承主会话模型（单 provider 必需，否则回落默认档）
// - defaultConcurrency / defaultTokenBudget: 并发与 token 预算上限（成本护栏）
// - excludeSubagentTools: 子代理会话不加载宿主扩展（无权限确认桥），
//   排除 shell 与写类工具使其只读（read/grep/find/ls），写操作回到主会话经权限确认
const WORKFLOWS_PKG = '@quintinshaw/pi-dynamic-workflows'

function workflowSettingsPath() {
  const os = require('os')
  return path.join(os.homedir(), '.pi', 'workflows', 'settings.json')
}

function ensureWorkflowSettings() {
  const file = workflowSettingsPath()
  try {
    if (fs.existsSync(file)) return false // 已有配置（用户或 pi CLI 写入）则尊重
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify({
      inheritMainModel: true,
      defaultConcurrency: 4,
      defaultTokenBudget: 200000,
      excludeSubagentTools: ['bash', 'powershell', 'write', 'edit'],
      progressPanelMode: 'compact'
    }, null, 2))
    return true
  } catch (e) {
    console.warn('[omnibuddy:pi] workflow 设置写入失败（不影响安装）：', e.message)
    return false
  }
}

let workflowsSetupDone = false
async function setupWorkflowsExtension() {
  if (workflowsSetupDone) return
  workflowsSetupDone = true
  try {
    if (!listPackages().some(p => String(p).indexOf('pi-dynamic-workflows') >= 0)) {
      const r = await installPackage(WORKFLOWS_PKG)
      if (!r.ok) {
        console.warn('[omnibuddy:pi] pi-dynamic-workflows 安装失败（下次启动重试）：', r.error)
        return
      }
      console.log('[omnibuddy:pi] pi-dynamic-workflows 已安装')
    }
    if (ensureWorkflowSettings()) {
      console.log('[omnibuddy:pi] 已写入 workflow 默认护栏设置')
    }
    // 新会话装载扩展（安装后既有会话不重载，与权限系统同模式）
    await disposeAllSessions()
  } catch (e) {
    console.warn('[omnibuddy:pi] pi-dynamic-workflows 初始化异常：', e.message)
  }
}

module.exports = {
  // 部署前台子代理 MCP 加载扩展到 agentDir/extensions（幂等，内容一致跳过）
  deployChildMcpExtension,
  // 部署 subagent 前台同步强制策略（config + tool_call 拦截扩展，幂等）
  deploySubagentForegroundPolicy,
  // 部署子代理工具通用化（child 图像/自省扩展 + defaultSubagentOnlyExtensions，幂等）
  deployChildToolPolicy,
  // 部署子代理环境简报扩展（幂等；deployChildToolPolicy 内已含，独立导出供按需重部署）
  deployChildIntrospectExtension,
  // 安装 pi-memory + 迁移旧记忆 + qmd 检测（异步，失败下次启动重试）
  setupMemoryExtension,
  // 安装 pi-permission-system + 写默认策略（异步，失败下次启动重试）
  setupPermissionExtension,
  // 安装 pi-markdown-preview（preview_export 工具；异步，失败下次启动重试）
  setupPreviewExtension,
  // 安装 pi-dynamic-workflows + 默认护栏 + 重建会话（异步，失败下次启动重试）
  setupWorkflowsExtension
}
