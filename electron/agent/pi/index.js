// OmniBuddy pi Agent 运行时门面：init 组合根 + 对外统一 API
// （外部 require('./pi') 目录解析到本文件；子模块位于本目录，各头部有职责说明）：
//   state          共享状态单例 / SDK 惰性加载 / 项目根锚点
//   provider       模型与 Provider 注册、models.json / model-tiers.json 落盘
//   extensions     ask_user / credential_get / todo_write 三个 UI 耦合扩展
//   prompt         系统提示词（按配置动态拼装）
//   ui-context     宿主 UI 权威（select 兜底权限确认）
//   session        会话创建 / resume / 回放重建 / 销毁 / 控制
//   session-events SDK 事件流归一化订阅
//   session-branch 分支切换与增量映射
//   native-export  原生导出（HTML / JSONL）
//   packages       pi CLI 社区扩展包管理
//   setup          扩展安装与部署（memory / permission / preview / workflows）
//
// 背景说明：
// pi-coding-agent 为纯 ESM 包（Node>=22.19），Electron 主进程为 CJS，
// 因此通过 dynamic import() 加载（rollup dynamicImportInCjs 保留原生 import）。
// pi 1.0.0 起 MCP / codemode 为内置扩展（SDK 宿主须显式加入 extensionFactories）：
// createMcpExtension 读取 <agentDir>/mcp.json 装载连接，替代旧社区包 pi-mcp-adapter
// （mcp.js 启动时清理旧注册记录，残留会屏蔽内置支持）。
// 社区扩展（pi-web-access / pi-memory 等）经 pi CLI 安装到
// agentDir，由 DefaultResourceLoader 自动装载；pi-subagents 由 builtin-tools 内置注册。
// ask-user / todo 为 UI 耦合扩展，以内联工厂注入；multi_edit / append / mkdir /
// todo_read 等同等工具见 builtin-tools.js。
const path = require('path')
const fs = require('fs')
const sandbox = require('../platform/sandbox')
const builtinTools = require('../tools/builtin-tools')
const webSearch = require('../integrations/web-search')
const subagentsIntegration = require('../integrations/subagents')
const runtime = require('../platform/runtime')
const permissions = require('../platform/permissions')
const { state, loadPi } = require('./state')
const piProvider = require('./provider')
const piSession = require('./session')
const piBranch = require('./session-branch')
const piExport = require('./native-export')
const piUiContext = require('./ui-context')
const piPackages = require('./packages')
const piSetup = require('./setup')

// ===== 初始化（组合根） =====
function init(agentDir) {
  state.agentDir = agentDir
  fs.mkdirSync(agentDir, { recursive: true })
  sandbox.init(agentDir)
  builtinTools.init(agentDir)
  // pi-web-access（web_search / fetch_content）：内置注册 + 配置托管
  webSearch.init(agentDir)
  // 子代理后台并行（B 方案）：配置托管（asyncEnabled 开关，run 注册表同模块）
  subagentsIntegration.init(agentDir)
  // 内置运行时 PATH 注入：bash 内的裸 python3 / node / pandoc 命令经 PATH 命中
  // 内置二进制（预装 pdfplumber / docx 等依赖栈开箱即用），内置优先，系统回退。
  // bash（含沙箱）与 python/node 工具的 execEnv 均继承 process.env，注入一次全局生效
  const runtimeBinDirs = []
  const py = runtime.builtinPython()
  if (py) runtimeBinDirs.push(path.dirname(py))
  const nodeBin = runtime.nodeBinDir()
  if (nodeBin) runtimeBinDirs.push(nodeBin)
  const pandoc = runtime.pandocBin()
  if (pandoc) runtimeBinDirs.push(path.dirname(pandoc))
  const seen = new Set(process.env.PATH.split(path.delimiter))
  const prepend = runtimeBinDirs.filter(d => !seen.has(d))
  if (prepend.length) {
    process.env.PATH = prepend.join(path.delimiter) + path.delimiter + process.env.PATH
    console.log('[omnibuddy:pi] 内置运行时已注入 PATH：', prepend.join(', '))
  }
  // pi CLI 与 subagents 依赖该环境变量定位 agentDir（config.js: PI_CODING_AGENT_DIR）
  process.env.PI_CODING_AGENT_DIR = agentDir
  // 权限模式持久化加载（输入框选择器状态，authorize 即时读取）
  permissions.loadMode()
  // 前台子代理 MCP 加载扩展部署（幂等）：pi-subagents 前台 child 不加载宿主
  // ambient 扩展，MCP 工具（playwright 等）在其内不可见；此扩展由 agent 定义经
  // subagentOnlyExtensions 显式引用，child 内部经 pi 内置 createMcpExtension
  // 读取同一 agentDir/mcp.json —— 使前台同步委派（业界主流模式）可用
  piSetup.deployChildMcpExtension(agentDir)
  // subagent 执行策略：asyncByDefault=false 恒定写入（省略 async 保持前台语义）；
  // 后台并行按 asyncEnabled 开关——开启时显式 async:true 放行为后台 run（注册表
  // + 轮询 + 卡片 + 通知全链路），关闭时部署剥离扩展强制前台（历史行为）
  piSetup.deploySubagentForegroundPolicy(agentDir)
  // 子代理工具通用化：agent 定义只写 mcp:server / 能力名，环境注入收敛宿主——
  // child 图像扩展 + settings defaultSubagentOnlyExtensions（pi-web-access 等）
  piSetup.deployChildToolPolicy(agentDir)
  // pi-memory 语义记忆：异步安装 + 旧记忆迁移，失败下次启动重试
  piSetup.setupMemoryExtension()
  // 权限系统（@gotgenes/pi-permission-system）：异步安装 + 默认策略 config
  piSetup.setupPermissionExtension()
  // pi-markdown-preview（文档导出）：preview_export 工具，异步安装
  piSetup.setupPreviewExtension()
  // pi-dynamic-workflows（深度研究）：workflow / workflow_control 工具，异步安装
  piSetup.setupWorkflowsExtension()
}

module.exports = {
  // pi SDK 惰性加载（单例）
  loadPi,
  // 初始化（组合根）：子模块装配 + 内置运行时 PATH 注入 + 扩展安装
  init,
  // 会话创建 / 复用（原生 resume 优先，无转录时文本回放重建）
  getOrCreateSession: piSession.getOrCreateSession,
  // 销毁单个会话（退订事件 + dispose + 拒绝未决权限确认）
  disposeSession: piSession.disposeSession,
  // 全量销毁运行中会话（扩展安装后调用，新会话装载新扩展）
  disposeAllSessions: piSession.disposeAllSessions,
  // 上下文作废（分支线路变化 / 删除会话）：销毁内存会话 + 删除落盘转录（防 resume 复活）
  invalidateSessionFiles: piSession.invalidateSessionFiles,
  // 原生分支切换（内存会话直接操作，无会话记 pending 待 resume 应用）
  branchSessionTo: piBranch.branchSessionTo,
  // prompt 前条目数书签（增量基线）
  markSessionBookmark: piBranch.markSessionBookmark,
  // prompt 后收集新增 user/assistant 条目（pi-map 写回对齐用）
  collectNewMessages: piBranch.collectNewMessages,
  // 回放映射一次性消费（读后删，宿主全量替换 pi-map）
  consumeReplayMap: piBranch.consumeReplayMap,
  // 原生导出（html / jsonl，pi 转录为唯一数据源）
  exportNative: piExport.exportNative,
  // 销毁前触发 pi-memory 退出摘要（reload → session_shutdown → daily 落盘）
  finalizeSession: piSession.finalizeSession,
  // 内存会话 id 清单
  listSessionIds: piSession.listSessionIds,
  // 会话记忆目录解析（记忆策略 isolate/clean 的兜底摘要按此分目录）
  getSessionMemoryInfo: piSession.getSessionMemoryInfo,
  // 当前 provider 配置快照（含 imageConfigured 能力判定）
  getProviderInfo: piProvider.getProviderInfo,
  // 中断会话当前回合（abort）
  interruptSession: piSession.interruptSession,
  // 运行中插话（排队转向消息，不打断进行中的回答）
  steerSession: piSession.steerSession,
  // select 兜底权限确认：前端四档应答路由（命中返回询问 info 供补写确认记录）
  replyUiAsk: piUiContext.replyUiAsk,
  // 会话终止/中断时批量拒绝其未决 select
  rejectUiAsks: piUiContext.rejectUiAsks,
  // 未决询问清单（渲染层重载后恢复确认条用）
  getPendingUiAsks: piUiContext.getPendingUiAsks,
  // 已安装的社区扩展清单
  listPackages: piPackages.listPackages,
  // 安装社区扩展包（pi install npm:<name>）
  installPackage: piPackages.installPackage,
  // agentDir 只读访问（init 后有效）
  get agentDir() { return state.agentDir }
}
