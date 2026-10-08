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
  // 安装 pi-memory + 迁移旧记忆 + qmd 检测（异步，失败下次启动重试）
  setupMemoryExtension,
  // 安装 pi-permission-system + 写默认策略（异步，失败下次启动重试）
  setupPermissionExtension,
  // 安装 pi-markdown-preview（preview_export 工具；异步，失败下次启动重试）
  setupPreviewExtension,
  // 安装 pi-dynamic-workflows + 默认护栏 + 重建会话（异步，失败下次启动重试）
  setupWorkflowsExtension
}
