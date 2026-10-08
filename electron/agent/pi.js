// OmniBuddy pi Agent 运行时
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
const { spawn, execSync } = require('child_process')
const sandbox = require('./sandbox')
const builtinTools = require('./builtin-tools')
const permissions = require('./permissions')
const mcp = require('./mcp')
const credentials = require('./credentials')
const webSearch = require('./web-search')
const profile = require('./profile')
const docExport = require('./doc-export')
// 图像生成：generate_image（OpenAI images 兼容格式，智谱/OpenRouter/硅基流动等通用）
const imageGen = require('./image-gen')
const runtime = require('./runtime')
const capabilities = require('./capabilities')

const PROVIDER_ID = 'omnibuddy'

// 深度研究（P3）：三档模型映射（small 轻量 / medium 标准 / big 强力）。
// 渲染层在 provider 对象上携带 tiers: { small: {baseUrl, apiKey, model}, ... }，
// 主进程为每档注册专属 provider（omnibuddy-small 等）并写 ~/.pi/workflows/model-tiers.json，
// workflow 子代理按 tier 路由到对应模型（未配置档位经 inheritMainModel 回落主模型）
const WORKFLOW_TIERS = ['small', 'medium', 'big']
const TIER_LABELS = { small: '轻量', medium: '标准', big: '强力' }

function tierProviderId(tier) {
  return PROVIDER_ID + '-' + tier
}

// 提取有效档位配置（baseUrl / model 齐全才参与映射）
function tiersOf(p) {
  const t = p && p.tiers
  if (!t || typeof t !== 'object') return {}
  const out = {}
  for (const tier of WORKFLOW_TIERS) {
    const c = t[tier]
    if (c && c.baseUrl && c.model) out[tier] = c
  }
  return out
}

// pi-memory 退出摘要：扩展默认跳过 reload/new/resume/fork 过渡原因的摘要生成。
// SDK 的 dispose() 不发射 session_shutdown，宿主靠主动 reload()（reason=reload）
// 触发摘要，须放开过渡摘要开关；用户已显式设置时尊重用户值
if (!process.env.PI_MEMORY_SUMMARIZE_TRANSITIONS) {
  process.env.PI_MEMORY_SUMMARIZE_TRANSITIONS = '1'
}

// pi SDK 惰性加载（单例）
let piSdk = null
async function loadPi() {
  if (!piSdk) {
    piSdk = await import('@earendil-works/pi-coding-agent')
  }
  return piSdk
}

const state = {
  agentDir: '',
  // ModelRuntime + 已解析模型（provider 变化时重建）
  modelRuntime: null,
  model: null,
  providerKey: '',
  // 当前 provider 配置快照（轻量 LLM 直调复用，如自动生成会话标题）
  provider: null,
  // chatId -> { session, unsubscribe }
  sessions: new Map()
}

function init(agentDir) {
  state.agentDir = agentDir
  fs.mkdirSync(agentDir, { recursive: true })
  sandbox.init(agentDir)
  builtinTools.init(agentDir)
  // pi-web-access（web_search / fetch_content）：内置注册 + 配置托管
  webSearch.init(agentDir)
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
  deployChildMcpExtension(agentDir)
  // pi-memory 语义记忆（P1-8）：异步安装 + 旧记忆迁移，失败下次启动重试
  setupMemoryExtension()
  // 权限系统（@gotgenes/pi-permission-system）：异步安装 + 默认策略 config
  setupPermissionExtension()
  // pi-markdown-preview（P1 文档导出）：preview_export 工具，异步安装
  setupPreviewExtension()
  // pi-dynamic-workflows（P3 深度研究）：workflow / workflow_control 工具，异步安装
  setupWorkflowsExtension()
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
  // dev: electron/agent → 上两级为项目根；打包: dist-electron/agent 同构
  const root = path.resolve(__dirname, '..', '..')
  const piPkgEntry = path.join(root, 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'index.js')
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

// ===== 模型 / Provider（OpenAI 兼容 / OpenAI Responses / Anthropic） =====
// 表单 apiFormat → pi-ai KnownApi 映射
function apiOf(p) {
  if (p.apiFormat === 'anthropic') return 'anthropic-messages'
  if (p.apiFormat === 'openai-responses') return 'openai-responses'
  return 'openai-completions'
}

// 表单思考模式 → SDK ThinkingLevel 映射（follow 跟随模型默认 / on 显式开启 / off 关闭）
function thinkingLevelOf(p) {
  if (p && p.thinkingMode === 'off') return 'off'
  if (p && p.thinkingMode === 'on') return 'high'
  return 'medium'
}

function providerKeyOf(p) {
  // 重建 key 含档位映射与模型高级配置：任一变化都需要重建运行时
  const tiers = tiersOf(p)
  const tierSig = WORKFLOW_TIERS.filter(t => tiers[t])
    .map(t => t + '=' + [tiers[t].baseUrl, tiers[t].model, tiers[t].apiKey || ''].join('~'))
    .join('|')
  const advSig = [
    p.apiFormat || 'openai',
    p.modelSeries || 'default',
    p.contextWindowInput || '',
    p.contextWindowOutput || '',
    p.toolTurns || '',
    p.imageInput === false ? '0' : '1',
    p.thinkingMode || 'follow'
  ].join('~')
  return [p.baseUrl, p.model, p.apiKey || '', tierSig, advSig, p.imageModel || ''].join('|')
}

function modelConfig(p) {
  return {
    id: p.model,
    name: p.model,
    // 开启推理：模型才能产出 thinking 内容块（extended thinking）
    reasoning: p.thinkingMode !== 'off',
    input: p.imageInput === false ? ['text'] : ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    // 上下文输入上限：留空使用推荐值（128k）
    contextWindow: p.contextWindowInput || 128000,
    // 思考模型的 thinking 预算（如 32768）占用输出额度，maxTokens 必须大于预算，
    // 否则兼容端点报 400: max_completion_tokens must be greater than thinking_budget
    maxTokens: p.contextWindowOutput || 65536,
    compat: {
      supportsDeveloperRole: false,
      // 不主动发送 reasoning_effort：各家兼容端点对该参数的映射不一（有的映射为
      // 大额 thinking_budget 导致 400），思考内容按模型默认行为经 reasoning_content 回流
      supportsReasoningEffort: false
    }
  }
}

// 写 models.json：subagents 子进程无法接收运行时参数，从 agentDir 读取 provider 配置。
// （图像生成不在此注册：generate_image 由 image-gen.js 提供，OpenAI images 兼容格式）
function writeModelsJson(p) {
  const file = path.join(state.agentDir, 'models.json')
  let existing = {}
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) { /* 首次不存在 */ }
  const providers = existing.providers || {}
  // 清掉历史档位专属 provider（档位调整/取消后不留残影）
  for (const key of Object.keys(providers)) {
    if (key !== PROVIDER_ID && key.indexOf(PROVIDER_ID + '-') === 0) delete providers[key]
  }
  providers[PROVIDER_ID] = {
    baseUrl: p.baseUrl,
    apiKey: p.apiKey || '',
    api: apiOf(p),
    models: [modelConfig(p)]
  }
  // 注：图像生成不再注册进 models.json（SDK 内置通道仅认 openrouter-images）——
  // generate_image 由 image-gen.js 提供（OpenAI images 兼容格式，读镜像图像条目）
  // 深度研究（P3）：档位专属 provider 同步落盘（子进程场景可读）
  const tiers = tiersOf(p)
  for (const tier of WORKFLOW_TIERS) {
    const c = tiers[tier]
    if (!c) continue
    providers[tierProviderId(tier)] = {
      baseUrl: c.baseUrl,
      apiKey: c.apiKey || '',
      api: apiOf(c),
      models: [modelConfig({ model: c.model })]
    }
  }
  fs.writeFileSync(file, JSON.stringify({ providers }, null, 2))
  // 含明文 apiKey（subagents 子进程需明文读取，无法加密），收紧文件权限防同机其他账户读取
  try { fs.chmodSync(file, 0o600) } catch (e) { /* chmod 失败不影响功能 */ }
}

// 写 ~/.pi/workflows/model-tiers.json（pi-dynamic-workflows 读取）：
// 档位 → "providerId/modelId" spec；空映射写 { tiers: {} }，加载器视为
// 无配置（合法降级：子代理按 inheritMainModel 回落主模型）
function writeModelTiers(p) {
  try {
    const os = require('os')
    const file = path.join(os.homedir(), '.pi', 'workflows', 'model-tiers.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tiers = tiersOf(p)
    const map = {}
    for (const tier of WORKFLOW_TIERS) {
      if (tiers[tier]) map[tier] = tierProviderId(tier) + '/' + tiers[tier].model
    }
    fs.writeFileSync(file, JSON.stringify({ tiers: map }, null, 2))
  } catch (e) { /* 写失败降级：档位回落主模型，不影响对话 */ }
}

async function ensureRuntime(provider) {
  const key = providerKeyOf(provider)
  // provider 快照无论如何都刷新（轻量直调取最新配置；重建运行时仍按 key 判定）
  state.provider = {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey || '',
    model: provider.model,
    apiFormat: provider.apiFormat || 'openai',
    imageModel: provider.imageModel || '',
    imageBaseUrl: provider.imageBaseUrl || '',
    imageApiKey: provider.imageApiKey || ''
  }
  if (state.modelRuntime && state.providerKey === key) return
  console.log('[omnibuddy:pi] runtime provider ->', provider.baseUrl, 'model=' + provider.model)
  const pi = await loadPi()
  const runtime = await pi.ModelRuntime.create({
    refreshOnCreate: false,
    allowModelNetwork: false
  })
  runtime.registerProvider(PROVIDER_ID, {
    name: provider.name || 'OmniBuddy',
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey || '',
    api: apiOf(provider),
    // 仅注册 chat 模型：图像生成由 image-gen.js 的 generate_image 工具提供
    models: [modelConfig(provider)]
  })
  if (provider.apiKey) {
    await runtime.setRuntimeApiKey(PROVIDER_ID, provider.apiKey)
  }
  // 深度研究（P3）：档位专属 provider 注册（每档独立 baseUrl/apiKey/model）
  const tiers = tiersOf(provider)
  for (const tier of WORKFLOW_TIERS) {
    const c = tiers[tier]
    if (!c) continue
    const pid = tierProviderId(tier)
    runtime.registerProvider(pid, {
      name: (provider.name || 'OmniBuddy') + ' · ' + TIER_LABELS[tier],
      baseUrl: c.baseUrl,
      apiKey: c.apiKey || '',
      api: apiOf(c),
      models: [modelConfig({ model: c.model })]
    })
    if (c.apiKey) {
      await runtime.setRuntimeApiKey(pid, c.apiKey)
    }
  }
  const snapshot = runtime.getAvailableSnapshot()
  // 主模型匹配限定主 provider（tier 模型可能与主模型同名，避免错拿档位实例）
  const model = snapshot.find(m => m.id === provider.model && m.provider === PROVIDER_ID) ||
    snapshot.find(m => m.id === provider.model) || snapshot[0]
  if (!model) throw new Error('模型注册失败：' + provider.model)
  writeModelsJson(provider)
  writeModelTiers(provider)

  // provider 变化：丢弃旧会话（各会话持有旧 model 引用）
  if (state.sessions.size) {
    for (const s of state.sessions.values()) {
      try { s.unsubscribe() } catch (e) { /* 忽略 */ }
      try { s.session.dispose() } catch (e) { /* 忽略 */ }
    }
    state.sessions.clear()
  }
  state.modelRuntime = runtime
  state.model = model
  state.providerKey = key
}

// ===== UI 耦合扩展 =====
// （原 SDK 通道 generate_image 已移除：openrouter-images 仅认 OpenRouter，
//  现由 image-gen.js 提供 OpenAI images 兼容格式的通用实现）

// ask-user：模型向用户提问，前端渲染表单，经 IPC 回传答案
function createAskUserExtension(onAskUser) {
  return function (piApi) {
    piApi.registerTool({
      name: 'ask_user',
      label: '向用户提问',
      description: '当信息不足或存在多种理解时，向用户提出问题。options 为可选的选项列表；需要用户同时选择多项时置 multiSelect=true。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '要向用户提出的问题' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: '可选的候选项（可空，允许自由输入）'
          },
          multiSelect: {
            type: 'boolean',
            description: '是否允许多选（默认单选；多选时用户可勾选多项后统一提交）'
          }
        },
        required: ['question']
      },
      execute: async (_id, params, signal) => {
        const answer = await onAskUser(params.question || '', params.options || [], !!params.multiSelect, signal)
        return { content: [{ type: 'text', text: answer }], details: {} }
      }
    })
  }
}

// 凭据按需取用（B 方案后续）：AI 对话中按名取已录入的「AI 取用类」凭据。
// 权限默认 ask（capabilities.js 登记），敏感操作逐次确认；开关关闭时返回引导
function createCredentialGetExtension() {
  return function (piApi) {
    piApi.registerTool({
      name: 'credential_get',
      label: '取用凭据',
      description: '按名称取用用户预先录入的凭据（API Key、账号等）。需要鉴权信息（登录、调接口、发邮件）时使用；取用前先征得用户同意。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '凭据名称（见系统提示词中的可用凭据清单）' }
        },
        required: ['name']
      },
      execute: async (_id, params) => {
        const r = credentials.aiResolve(params.name)
        if (!r.ok) {
          return { content: [{ type: 'text', text: '取用失败：' + r.error }], details: { isError: true } }
        }
        const parts = []
        if (Object.keys(r.values).length) {
          parts.push('键值：\n' + Object.entries(r.values).map(([k, v]) => k + '=' + v).join('\n'))
        }
        if (Object.keys(r.headers).length) {
          parts.push('请求头：\n' + Object.entries(r.headers).map(([k, v]) => k + ': ' + v).join('\n'))
        }
        const text = '已取用凭据「' + r.name + '」。\n' + (parts.join('\n\n') || '（该凭据未配置任何字段）')
          + '\n\n注意：仅用于本次任务，不要在回复中明文展示。'
        return { content: [{ type: 'text', text }], details: { credential: r.name } }
      }
    })
  }
}

// todo：模型维护任务清单，前端渲染看板
// 更新频率双通道保障：提示词引导（弱约束）+ context 滞后提醒（机制性兜底）——
// 模型常在长任务中只建清单不更新（实测 68 次工具调用仅 1 次 todo_write），
// 纯提示词引导不足以纠正，需在连续多次未更新时向模型注入提醒
function createTodoExtension(onTodo) {
  return function (piApi) {
    // 扩展闭包态：最近清单快照 / 距上次更新的工具调用数 / 已注入提醒次数
    let todos = null
    let callsSinceUpdate = 0
    let reminders = 0
    piApi.registerTool({
      name: 'todo_write',
      label: '更新任务清单',
      description: '维护当前任务清单（全量覆盖写入）。每次任务状态变化都必须立即调用：开始执行一项时将其置为 in_progress，完成一项时立即置为 completed 并同步推进下一项，全部完成时将所有项置为 completed。不要只在任务开始时调用一次后不再更新——用户界面依赖此工具实时展示进度。',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }
              },
              required: ['content', 'status']
            }
          }
        },
        required: ['todos']
      },
      execute: async (_id, params) => {
        todos = params.todos || []
        callsSinceUpdate = 0
        onTodo(todos)
        return { content: [{ type: 'text', text: '任务清单已更新' }], details: {} }
      }
    })
    // 工具调用计数（todo_write 自身不累计）：滞后检测的依据
    piApi.on('tool_execution_end', (event) => {
      if (event.toolName !== 'todo_write') callsSinceUpdate++
    })
    // 每次 LLM 调用前：清单存在未完成项且已连续多次未更新时，注入一条 user
    // 提醒（仅本次请求可见，不落盘、不进前端消息流）。限量 3 次防持续打扰
    piApi.on('context', (event) => {
      const lagging = todos && todos.some(t => t.status !== 'completed')
      if (!lagging || callsSinceUpdate < 5 || reminders >= 3) return undefined
      callsSinceUpdate = 0
      reminders++
      const snapshot = todos.map(t => '[' + t.status + '] ' + t.content).join('\n')
      return {
        messages: event.messages.concat([{
          role: 'user',
          content: '【系统提醒】你已连续执行多次工具但未更新任务清单，当前清单可能已滞后于实际进度：\n' + snapshot + '\n请立即调用 todo_write 更新状态：已完成的项置为 completed，正在进行的置为 in_progress。此清单是用户界面的进度面板，必须与实际进度保持同步。',
          timestamp: Date.now()
        }])
      }
    })
  }
}

// ===== 系统提示词（办公助手） =====
// 是否存在已启用的 MCP 服务（含内置）：联网引导分支用。
// 服务清单本身不再手工列举——pi 1.0.0 内置 MCP 扩展会自动在系统提示词
// 注入 mcp_servers 段（名称+一行描述，每轮 prompt 更新），宿主只保留使用引导
function hasEnabledMcp() {
  try {
    for (const s of mcp.list()) if (s.enabled) return true
    return mcp.builtinList().length > 0
  } catch (e) {
    return false
  }
}

function systemPrompt() {
  const lines = [
    '你是 OmniBuddy 智能工作助手。',
    '回答简洁、准确、友好，使用用户提问时的语言；代码与技术内容使用 Markdown 格式输出。',
    '内部思考过程（thinking）请使用中文撰写。',
    '执行多步骤任务（≥2 步）时，必须先用 todo_write 工具建立任务清单。此后每完成一项或切换到下一项时都要立即调用 todo_write 更新状态（in_progress → completed 逐项推进），任务全部结束前保持清单与实际进度严格同步——用户界面实时展示此清单，只建不更会让进度面板停留在初始状态。',
    '当信息不足或存在歧义时，先用 ask_user 工具向用户提问再行动。',
    '使用浏览器自动化（mcp__playwright 工具）访问需要登录的站点后：若遇到登录墙 / 扫码 / 验证码（无头模式无法人工交互），立即调用 report_site_auth 工具以 status=login_required 上报，随后告知用户点击系统通知即可一键转有头完成登录（登录完成自动恢复无头，无需手动操作）；确认站点已登录时同样以 status=logged_in 上报（系统将自动切回无头模式）。',
    '协助用户处理日常办公任务：阅读、整理、检索本地文件。'
  ]
  // 联网能力引导按当前实际配置动态生成：
  // - web_search / fetch_content（pi-web-access 内置扩展）为联网首选；
  //   联网开关关闭时明确告知不可用，避免空跑
  // - 已配置 MCP：SDK 自动注入 mcp_servers 段（服务清单+描述），此处只保留
  //   「优先 MCP、回落 curl」的决策引导；以上均不适用时回落 curl
  if (webSearch.enabled()) {
    lines.push('联网搜索优先使用 web_search 工具（多引擎自动降级），网页、代码仓库与 PDF 的抓取优先使用 fetch_content 工具。')
  } else {
    lines.push('当前已关闭联网搜索（web_search / fetch_content 不可用）；如需实时信息，提示用户在输入框上方开启联网开关。')
  }
  if (hasEnabledMcp()) {
    lines.push('联网等外部能力优先使用已配置的 MCP 服务（清单与用途见系统提示词的 mcp_servers 段，工具经 codemode 脚本调用）；均不适用时可用 curl 工具发起 HTTP 请求获取公开数据。')
  } else {
    lines.push('当前未配置 MCP 服务；联网需求直接用 curl 工具发起 HTTP 请求获取公开数据，不要尝试搜索 MCP 工具。')
  }
  // 临时文件按工作空间划分：统一落 <workspace>/.tmp（会话创建时自动建目录并注入 TMPDIR），
  // 避免模型按通用习惯写系统 /tmp 触发 external_directory 逐次询问
  lines.push('临时文件（脚本、中间产物等）一律写入当前工作空间根目录的 .tmp/ 目录（已自动创建，环境变量 TMPDIR 已指向该处），不要写入系统 /tmp 等工作空间外的路径。')
  lines.push('每次任务完成后，删除本次任务产生的临时文件（.tmp/ 中不再需要的脚本、中间产物等），不要遗留；exports/ 下的交付产物与用户既有文件不属于临时文件，不得删除。')
  lines.push('交付正式文档（Word / PDF / HTML 报告、方案、纪要、信函等）时，先组织好完整的 Markdown 内容，再调用 doc_export 工具导出文件（输出到当前目录 exports/ 下，Word 可用 reference_doc 参数或工作目录下的 template.docx 沿用模板样式），不要把长文档直接贴在回复正文里。')
  // 图像生成引导（pi 1.0.0）：仅配置了图像模型时注入，未配置不提及（工具未注册）
  if (state.provider && state.provider.imageModel) {
    lines.push('用户需要生成图片、插画、配图时，调用 generate_image 工具（产物自动保存并展示），不要用文字描摹替代。')
  }
  lines.push('深度研究（P3）：当用户明确要求深度研究、多源交叉验证、并行审查、代码库巡检等多代理编排任务时，调用 workflow 工具（内置模式：deep-research 深度研究 / code-review 代码审查 / adversarial-review 对抗审查 / multi-perspective 多视角 / codebase-audit 代码库审计；也可传 script 自定义编排）。默认后台运行：工具立即返回，结果完成后自动回注对话继续处理，期间可告知用户任务已在后台进行。未获用户明确要求时不要主动调用 workflow。运行中的任务可用 workflow_control 工具查询进度、暂停或停止。')
  // codemode 脚本约束：脚本被包装为 (async (tools, console) => {...}) 执行，
  // 声明同名变量会直接语法报错（invalid redefinition of parameter name）
  lines.push('编写 codemode 脚本时：脚本以 (tools, console) 参数形式注入环境，不得用 const/let/function 再声明 tools、console 同名变量（会报 invalid redefinition of parameter name）；调用工具写作 await tools.<工具名>({ ...参数 })，查找未列出的工具用 searchTools(关键词)。')
  lines.push('文件写入与编辑工具（write / edit）默认需经用户逐次确认，确认通过后方可执行。')
  lines.push('若用户拒绝确认或处于只读模式，则不写文件，将结果直接输出给用户。')
  // 用户资料（B 方案）：结构化个人背景确定性注入，填工时等场景无需再手写 work-assistant 技能
  const profileBlock = profile.promptBlock()
  if (profileBlock) lines.push(profileBlock)
  // 凭据清单（B 方案后续）：开关开启且有「AI 取用类」凭据时注入，引导 credential_get 按名取用
  const credBlock = credentials.aiPromptBlock()
  if (credBlock) lines.push(credBlock)
  return lines.join('\n')
}

// ===== 宿主 UI 权威（业界标准做法：宿主向 SDK 注册 uiContext） =====
// pi-permission-system 对 ask 的三路裁决：hasUI ? 本地交互（chain link 优先，
// 兜底走 ui.select fallback）: subagent ? 转发父 : 直接拒绝（"no interactive UI"）。
// 此前 bindExtensions 未传 uiContext（hasUI 恒 false），确认完全依赖 chain link
// 的 ready 时序注册，一旦注册失败整会话静默进入全拒绝。
// 现注册最小 uiContext：hasUI=true，chain link 未注册时 ask 落到 LocalUserAuthorizer
// 的非 TUI fallback —— ui.select()，由宿主转发 IPC 前端确认条应答，双保险。
// select 兜底路径的待应答：askId -> { resolve, chatId, options }
const pendingUiAsks = new Map()

// 最近一次权限 ui_prompt（结构化广播，select 弹窗前发射；select 到达时组装
// 结构化 permission_ask 下发前端 —— select 本身只拿得到渲染后的文本）
function createUiContext(chatId, onEvent, getUiPrompt) {
  const noop = () => {}
  return {
    // 权限确认（非 TUI fallback 唯一关键实现）：转 IPC 前端确认条，
    // 前端四档应答映射回 select 期望的选项字符串（approve/session）或 undefined（拒绝）
    // 权限模式即时生效：auto 直接放行（approve 首选项）、readonly 直接拒绝，
    // 不经前端（排除面在链路会被封顶降级，终审 select 是 auto 模式唯一收口）
    select: (prompt, options) => new Promise(resolve => {
      const mode = permissions.getMode()
      if (mode === 'auto') return resolve((options || [])[0])
      if (mode === 'readonly') return resolve(undefined)
      // ui_prompt 结构化广播：request 为询问核心事实（含 command/path/gate surface），
      // select 本身只拿得到渲染文本；透传给前端确认条展示与策略升级
      const e = getUiPrompt() || {}
      const req = e.request || {}
      const info = {
        surface: e.surface || req.surface || '',
        value: e.value || '',
        toolName: req.toolName || e.surface || '',
        command: req.command || '',
        path: req.path || '',
        preview: req.toolInputPreview || '',
        gateSurface: req.surface || ''
      }
      const askId = 'ui-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
      pendingUiAsks.set(askId, { resolve, chatId, options: options || [], info })
      onEvent(Object.assign({ kind: 'permission_ask', chatId, askId }, info))
    }),
    input: async () => undefined,
    confirm: async () => false,
    notify: noop,
    onTerminalInput: () => () => {},
    setStatus: noop,
    setWorkingMessage: noop,
    setWorkingVisible: noop,
    setWorkingIndicator: noop,
    setHiddenThinkingLabel: noop,
    setWidget: noop,
    setFooter: noop,
    setHeader: noop,
    setTitle: noop,
    custom: async () => undefined,
    pasteToEditor: noop,
    setEditorText: noop,
    getEditorText: () => '',
    editor: async () => undefined,
    addAutocompleteProvider: noop,
    setEditorComponent: noop,
    getEditorComponent: () => undefined,
    theme: {},
    getAllThemes: () => [],
    getTheme: () => undefined,
    setTheme: () => ({ success: false, error: 'not available' }),
    getToolsExpanded: () => false,
    setToolsExpanded: noop
  }
}

// select 兜底路径应答：前端四档 → select 选项（按扩展构造顺序 approve 在首、
// session 次之；deny 映射 undefined = 取消 = 拒绝，无需依赖选项文案常量）
// 命中时返回该询问的 info（供主进程补写确认记录），未命中返回 null
function replyUiAsk(askId, action) {
  const p = pendingUiAsks.get(askId)
  if (!p) return null
  pendingUiAsks.delete(askId)
  const info = p.info || {}
  // 始终允许：与 chain 路径同规则升级策略（跨会话生效）。
  // 升级目标是门面（gate surface，如 external_directory_read）而非展示面
  if (action === 'allow_always' && info.gateSurface) {
    try { permissions.persistAlwaysAllow(state.agentDir, info.gateSurface) } catch (e) { /* 写盘失败不影响本次 */ }
  }
  if (action === 'deny') {
    p.resolve(undefined)
  } else if (action === 'allow_session') {
    p.resolve(p.options[1] || p.options[0])
  } else {
    p.resolve(p.options[0])
  }
  return info
}

// select 兜底路径的未决询问清单：渲染层重载（HMR/刷新）后恢复确认条用
function getPendingUiAsks() {
  return Array.from(pendingUiAsks.entries()).map(entry =>
    Object.assign({ askId: entry[0], sessionId: entry[1].chatId }, entry[1].info || {}))
}

// 会话终止/中断：拒绝其全部未决 select（Promise 须终结，否则工具门悬挂）
function rejectUiAsks(chatId) {
  for (const [askId, p] of Array.from(pendingUiAsks.entries())) {
    if (p.chatId === chatId) {
      pendingUiAsks.delete(askId)
      p.resolve(undefined)
    }
  }
}

// ===== 会话 =====
// 临时目录约定（按工作空间划分）：覆盖内置 bash，spawn 前注入 TMPDIR/TEMP/TMP
// 指向 <workspace>/.tmp，使 mktemp、$TMPDIR 等通用临时路径自然落在工作空间内
// （不触发 external_directory 逐次询问；模型硬编码 /tmp 时仍由权限策略兜底）。
// 沙箱开启时 bash 由 sandbox.js 覆盖，本扩展不注册（沙箱有独立隔离语义）。
// 非沙箱 bash 默认超时（秒）：SDK 原生 bash 在模型不传 timeout 参数时无任何超时，
// 遇到挂起命令（交互等待、watch、ssh 等）会永久卡住整个回合。这里在 execute 入口
// 兜底注入默认值，模型显式传了更短/更长的 timeout 时以模型为准。
const BASH_DEFAULT_TIMEOUT_SECONDS = 120
// 技能凭据注入：激活技能（会话内读取过 SKILL.md）的凭证 env 合并进执行环境。
// getSkillEnv 由会话闭包提供（activeSkills 集合 → credentials.resolveEnvForSkills），
// bash 走 spawnHook、python/node 走 execEnv、沙箱路径经 spawnHook + ops 透传
function createTmpBashExtension(piSdk, workspaceDir, getSkillEnv) {
  return function tmpBashExtension(piApi) {
    const tmpDir = path.join(workspaceDir, '.tmp')
    const bash = piSdk.createBashTool(workspaceDir, {
      spawnHook: ({ command, cwd, env }) => ({
        command,
        cwd,
        // 技能凭据放最后：不被 TMPDIR 注入覆盖（同名键以技能凭证为准）
        env: Object.assign({}, env, { TMPDIR: tmpDir, TEMP: tmpDir, TMP: tmpDir },
          getSkillEnv ? getSkillEnv() : null)
      })
    })
    const rawExecute = bash.execute
    bash.execute = function executeWithDefaultTimeout(toolCallId, params, signal, onUpdate, ctx) {
      const patched = Object.assign({}, params, {
        timeout: Number.isFinite(params && params.timeout) && params.timeout > 0
          ? params.timeout
          : BASH_DEFAULT_TIMEOUT_SECONDS
      })
      return rawExecute.call(bash, toolCallId, patched, signal, onUpdate, ctx)
    }
    piApi.registerTool(bash)
  }
}
// 模型用 read 工具读取 SKILL.md 时视为 skill 被激活（pi skills 渐进加载机制），
// 取上级目录名作为 skill 名称下发前端渲染。
function skillNameFromTool(toolName, args) {
  if (toolName !== 'read' || !args) return ''
  const p = args.file_path || args.path || args.filePath || ''
  if (typeof p !== 'string') return ''
  const norm = p.replace(/\\/g, '/')
  if (!/(^|\/)SKILL\.md$/i.test(norm)) return ''
  const parts = norm.split('/')
  return parts.length >= 2 ? parts[parts.length - 2] : ''
}
// 每个对话一个 pi AgentSession；本进程存活期间复用，
// 应用重启后重建并以「文本回放」方式恢复上下文（工具调用历史不回放）。
// workspaceDir 由调用方按用户选定的"工作空间"传入；
// 同一会话切换工作空间时，旧 pi 会话必须丢弃重建（上下文与文件环境绑定）。
async function getOrCreateSession(chatId, provider, historyTexts, onEvent, workspaceDir) {
  const cwd = workspaceDir
  const cached = state.sessions.get(chatId)
  if (cached) {
    if (cached.workspaceDir === cwd) return cached.session
    // 工作空间变化：丢弃旧会话（含旧转录），下面按新配置重建
    await disposeSession(chatId)
  }
  await ensureRuntime(provider)
  const pi = await loadPi()

  const piSessionDir = path.join(state.agentDir, 'sessions', chatId)
  // 重建：清掉旧转录文件，避免与固定 id 冲突
  fs.rmSync(piSessionDir, { recursive: true, force: true })
  fs.mkdirSync(piSessionDir, { recursive: true })
  fs.mkdirSync(cwd, { recursive: true })
  // 工作空间临时目录（按空间划分）：Agent 临时产物的统一落点（TMPDIR 注入指向此处）
  fs.mkdirSync(path.join(cwd, '.tmp'), { recursive: true })

  const sessionManager = pi.SessionManager.create(cwd, piSessionDir, { id: 'main' })
  // 回放历史（user/assistant 文本 + 用户消息的图片附件）
  for (const m of historyTexts) {
    try {
      const content = [{ type: 'text', text: m.content || '' }]
      // 图片附件回放为 image 块（data 为 base64；由 agent/index.js 装载）
      for (const img of (m.images || [])) {
        if (img && img.data) content.push({ type: 'image', data: img.data, mimeType: img.mimeType || 'image/png' })
      }
      sessionManager.appendMessage({ role: m.role, content })
    } catch (e) {
      /* 跳过无法回放的消息 */
    }
  }

  // 会话级当前目录（cd 工具可变，文件/python 工具相对路径解析基准；初始为工作空间）
  const cwdState = { dir: cwd }

  // 最近一次权限 ui_prompt（结构化广播）：select 兜底到达时组装结构化 permission_ask
  let lastUiPrompt = null

  // 会话内已激活技能（模型读取过 SKILL.md 即激活）：技能凭据注入的判定依据。
  // 随会话闭包销毁（新会话重新激活），每次取数现解密（凭证变更即时生效）
  const activeSkills = new Set()
  const getSkillEnv = () => {
    try {
      return credentials.resolveEnvForSkills(Array.from(activeSkills))
    } catch (e) {
      return {}
    }
  }

  // pi-web-access 1.x 懒激活校正：该扩展默认只激活 web_enable 加载器工具，模型须
  // 先调它、下一轮请求才能用 web_search 等联网工具——与 OmniDeck 的联网开关设计
  // 冲突（多一轮往返、触发兜底权限确认并把 web_enable 键写进权限配置、开关关闭时
  // 还可经它绕过 excludeTools 屏蔽）。本扩展在 pi-web-access 的事件处理器之后
  // （packages 路径扩展先派发、inline factories 后派发，emit 按注册顺序串行 await）
  // 校正 active 集：开关联网时联网工具直接可用并移除 web_enable；关闭时两者一并
  // 移除。开关状态在会话创建时锁定（与会话内 excludeTools 初始集一致）
  const webEnabledAtSession = webSearch.enabled()
  const createWebToolsDirectExtension = (pi) => {
    const enforce = () => {
      try {
        const active = pi.getActiveTools()
        const webSet = new Set(capabilities.webToolNames())
        const next = active.filter(n => n !== 'web_enable' && (webEnabledAtSession || !webSet.has(n)))
        if (webEnabledAtSession) {
          capabilities.webToolNames().forEach(n => { if (next.indexOf(n) < 0) next.push(n) })
        }
        if (JSON.stringify(next) !== JSON.stringify(active)) pi.setActiveTools(next)
      } catch (e) { /* get/setActiveTools 异常时维持现状 */ }
    }
    pi.on('session_start', enforce)
    pi.on('session_tree', enforce)
    pi.on('before_agent_start', enforce)
  }

  // 沙箱开启时注入沙箱扩展（bash 工具覆盖），并预加载 ESM 依赖
  const factories = [
    // 内置 MCP（pi 1.0.0）：读 <agentDir>/mcp.json 装载 stdio/HTTP 连接，
    // OAuth / 重连 / 工具列表热更新由 SDK 管理；服务清单自动注入 mcp_servers 系统提示词段
    pi.createMcpExtension(),
    // codemode / tool_search（pi 1.0.0 内置，SDK 宿主须显式注册）：
    // 注册为 inactive，经 settings 的 defaultTools ["+codemode"] 激活；
    // MCP 服务器默认 codemode exposure 的工具经 codemode 脚本调用（不占工具声明），
    // tool_search 供模型按需加载 deferred 工具
    pi.createCodemodeExtension(),
    pi.createToolSearchExtension(),
    // pi-web-access 懒激活校正（见上方 createWebToolsDirectExtension 注释）
    createWebToolsDirectExtension,
    // 权限确认桥接：ask 转 IPC 前端卡片（扩展未装时监听器空转，无害）；
    // onUiPrompt 缓存结构化广播供 ui.select 兜底路径使用
    permissions.createBridgeExtension(
      (info) => onEvent({ kind: 'permission_ask', chatId, ...info }),
      (d) => onEvent({ kind: 'permission_decision', chatId, surface: d.surface, value: d.value, result: d.result, resolution: d.resolution }),
      (e) => { lastUiPrompt = e }
    ),
    createAskUserExtension((question, options, multiSelect, signal) =>
      onEvent({ kind: 'ask_user', chatId, question, options, multiSelect, signal })),
    createTodoExtension(todos => {
      // 同步缓存：todo_read 回读（todo_update 事件走前端看板）
      builtinTools.cacheTodos(chatId, todos)
      onEvent({ kind: 'todo_update', chatId, todos })
    }),
    // 站点登录态上报：撞登录墙 → 主进程登记 + login.required 通知（引导有头首登）
    builtinTools.createSiteAuthExtension(r =>
      onEvent({ kind: 'site_auth', chatId, url: r.url, status: r.status, note: r.note })),
    builtinTools.createCdExtension(cwdState),
    builtinTools.createExecToolsExtension(cwdState, path.join(cwd, '.tmp'), getSkillEnv),
    builtinTools.createFileToolsExtension(cwdState),
    builtinTools.createTodoReadExtension(() => builtinTools.getTodos(chatId)),
    // 文档导出（P1）：markdown → Word / PDF / HTML，产物落 <cwd>/exports/
    docExport.createDocExportExtension(cwdState),
    // 图像生成：OpenAI images 兼容格式（独立图像条目 / 附着式配置），
    // 产物落 <cwd>/exports/；SDK 内置 openrouter-images 通道不再注册（通用替代）
    imageGen.createImageGenExtension(cwdState, state.agentDir, () => state.provider),
    // 凭据按需取用（B 方案后续）：AI 对话中经 credential_get 取「AI 取用类」凭据；
    // 默认 ask 权限（capabilities 登记），开关关闭时工具返回引导文案
    createCredentialGetExtension()
  ]
  if (sandbox.getSandboxConfig().enabled) {
    try {
      const { SandboxManager } = await import('@anthropic-ai/sandbox-runtime')
      factories.push(sandbox.createSandboxExtension(pi, SandboxManager, (status) =>
        onEvent({ kind: 'sandbox_status', chatId, status }), getSkillEnv,
        // 网络审批通道：扩展经 onEvent 发 permission_ask（复用权限确认前端管线），
        // 主进程 handleAgentEvent 的 pendingPermissions 路径会返回 Promise<action>
        (info) => onEvent(Object.assign({ kind: 'permission_ask', chatId }, info))))
    } catch (e) {
      onEvent({ kind: 'sandbox_status', chatId, status: { enabled: false, reason: 'load-failed: ' + e.message } })
    }
  } else {
    // 非沙箱：bash 注入 TMPDIR（临时文件按工作空间落 <workspace>/.tmp）
    factories.push(createTmpBashExtension(pi, cwd, getSkillEnv))
  }

  const resourceLoader = new pi.DefaultResourceLoader({
    cwd,
    agentDir: state.agentDir,
    systemPromptOverride: () => systemPrompt(),
    extensionFactories: factories
  })
  await resourceLoader.reload()

  // 关闭 SDK 自动重试（默认最多 3 次静默重试，期间前端一直停留在"思考中"）；
  // 开启上下文自动压缩（长会话接近窗口上限时自动总结早期记录，P1-9）；
  // 启用 codemode（pi 1.0.0 内置）：模型经 QuickJS 沙箱脚本编排工具调用，
  // 约 40% prompt token 节省；MCP 服务器默认 codemode exposure 的工具亦经此调用
  const settingsManager = pi.SettingsManager.inMemory({
    retry: { enabled: false },
    compaction: { enabled: true },
    defaultTools: ['+codemode'],
    // prompt cache warming（0.86.0）：长工具循环期间保温 prompt 缓存，
    // 避免工具执行超过缓存有效期后整段前缀重算（第三方兼容端点按 token 计费直接省钱）
    cacheWarming: 'streaming'
  })
  // 写入工具（edit/write）不再排除：统一纳入权限策略管控（默认逐次确认）。
  // bash / powershell 为 shell 能力，按平台自动选择其一，沙箱开关开启时
  // bash 由 sandbox.js 扩展覆盖为隔离执行。
  // 注意：本 SDK 支持 excludeTools 黑名单（不能用 tools 白名单，
  // 否则 MCP / skills / ask_user 等扩展注册的工具会被一并过滤掉），
  // 当前无需排除任何工具，保留该参数位以备安全兜底
  const result = await pi.createAgentSession({
    cwd,
    model: state.model,
    modelRuntime: state.modelRuntime,
    resourceLoader,
    sessionManager,
    settingsManager,
    // 深度思考档位：reasoning 模型据此产出 thinking 事件
    // （表单思考模式：follow 跟随模型默认 / on 显式开启 / off 关闭）
    thinkingLevel: thinkingLevelOf(provider),
    // 联网开关关闭时屏蔽 pi-web-access 的 web 工具（excludeTools 黑名单机制，
    // 不能用白名单以免过滤掉 MCP / skills / ask_user 等扩展工具）；
    // 名单从 capabilities.js 统一目录派生（含 get_search_content）。
    // web_enable（懒激活加载器）无论开关状态一律排除：active 集由
    // createWebToolsDirectExtension 校正扩展兜底维护
    ...(webSearch.enabled()
      ? { excludeTools: ['web_enable'] }
      : { excludeTools: capabilities.webToolNames().concat(['web_enable']) })
  })
  const session = result.session
  // 绑定扩展生命周期：SDK createAgentSession 不发 session_start（print/rpc 等
  // 模式入口的职责），权限系统的 service 发布与 config 加载依赖该事件，须手动触发。
  // uiContext：宿主 UI 权威（select → IPC 前端确认条），使 hasUI=true，
  // chain link 未注册时 ask 仍可交互应答而非静默全拒绝（"no interactive UI" 根治）
  const uiContext = createUiContext(chatId, onEvent, () => lastUiPrompt)
  try {
    await session.bindExtensions({ mode: 'json', uiContext })
  } catch (e) {
    console.warn('[omnibuddy:pi] bindExtensions 失败：', e.message)
  }

  // 事件订阅：归一化为渲染进程事件模型
  let currentText = ''
  let currentThinking = ''
  const toolArgsById = new Map()
  const unsubscribe = session.subscribe(async (event) => {
    try {
      switch (event.type) {
        case 'message_start':
          if (event.message && event.message.role === 'assistant') {
            currentText = ''
            currentThinking = ''
            onEvent({ kind: 'assistant_start', chatId })
          }
          break
        case 'message_update': {
          const ae = event.assistantMessageEvent
          if (!ae) break
          if (ae.type === 'thinking_delta' && ae.delta) {
            currentThinking += ae.delta
            onEvent({ kind: 'thinking', chatId, text: currentThinking })
          } else if (ae.type === 'text_delta' && ae.delta) {
            currentText += ae.delta
            onEvent({ kind: 'delta', chatId, text: currentText })
          }
          break
        }
        case 'message_end':
          if (event.message && event.message.role === 'assistant') {
            // 临时诊断（mid 拆分问题定位）：打印 stopReason 与内容块类型后移除
            console.log('[omnibuddy:pi][diag] message_end stopReason=', event.message.stopReason,
              'blocks=', (event.message.content || []).map(c => c && c.type).join(','))
            const text = (event.message.content || [])
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('')
            // token 用量（本轮模型调用；工具循环中多次调用由前端累加展示）
            // + 上下文占用（getContextUsage：tokens/contextWindow/percent，P1-9 用量条）
            const u = event.message.usage || {}
            let ctx = null
            try { ctx = session.getContextUsage() } catch (err) { /* 模型未加载时无值 */ }
            onEvent({
              kind: 'assistant_end',
              chatId,
              content: text || currentText,
              thinking: currentThinking,
              // 中途正文标记：本轮流式回复以工具调用收尾（正文之后还有动作，非最终
              // 答复）。前端据此把这类正文归位思考区（过程说明），落盘记录同样
              // 带 mid，历史回放按此归位而非并入正文气泡。
              // 判定以内容块为准（stopReason 兜底）：部分第三方 OpenAI 兼容端点在
              // 带 tool_calls 的回复上返回 finish_reason=stop（pi-ai 对 google 端点
              // 有同款改写，openai-completions 没有），仅看 stopReason 会把工具循环
              // 中段误判为回合终点，导致思考过程被拆成多条消息
              mid: !!(text || currentText) && (
                event.message.stopReason === 'toolUse' ||
                (event.message.content || []).some(c => c && c.type === 'toolCall')
              ),
              usage: {
                input: u.input || u.inputTokens || 0,
                output: u.output || u.outputTokens || 0,
                contextTokens: ctx && ctx.tokens != null ? ctx.tokens : undefined,
                contextWindow: ctx ? ctx.contextWindow : undefined
              }
            })
            // pi 不抛出模型请求错误（记在消息上），空回复时须显式透传，避免前端静默挂起
            if (event.message.stopReason === 'error' && !text && !currentText) {
              onEvent({ kind: 'turn_error', chatId, error: event.message.errorMessage || '模型请求失败' })
            }
          }
          break
        case 'tool_execution_start': {
          toolArgsById.set(event.toolCallId, event.args)
          const skillName = skillNameFromTool(event.toolName, event.args)
          if (skillName) {
            // 技能激活登记：后续 bash / python / node 的执行环境注入该技能的凭证 env
            activeSkills.add(skillName)
            onEvent({ kind: 'skill', chatId, toolCallId: event.toolCallId, skillName, toolName: event.toolName })
          }
          onEvent({
            kind: 'tool_start',
            chatId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args
          })
          break
        }
        case 'tool_execution_update': {
          // partialResult 为结构化对象（{content:[{type:'text',text}],details}），
          // 须解构提取文本，直接 String() 会得到 "[object Object]"
          let partialText = ''
          const pr = event.partialResult
          if (pr && Array.isArray(pr.content)) {
            partialText = pr.content
              .filter(c => c && c.type === 'text')
              .map(c => c.text)
              .join('')
          } else if (typeof pr === 'string') {
            partialText = pr
          }
          onEvent({
            kind: 'tool_update',
            chatId,
            toolCallId: event.toolCallId,
            partial: partialText.slice(0, 2000)
          })
          break
        }
        case 'tool_execution_end': {
          let resultText = ''
          if (event.result && Array.isArray(event.result.content)) {
            resultText = event.result.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('')
          } else if (event.error) {
            resultText = String(event.error.message || event.error)
          }
          // 产物清单（P1 文档导出）：交付类工具（doc_export / preview_export 等）
          // 在 details.artifacts 返回结构化清单 → 前端产物卡片（打开 / 所在文件夹）
          let artifacts = null
          try {
            const d = event.result && event.result.details
            if (d && Array.isArray(d.artifacts) && d.artifacts.length) {
              artifacts = d.artifacts.filter(a => a && typeof a.path === 'string')
            }
          } catch (e) { /* details 解析失败按无产物处理 */ }
          // 深度研究（P3）：workflow 工具返回 details.runId（后台运行）或
          // 完整快照（前台），提取最小字段 → 前端进度卡片（主进程轮询 run 落盘状态）
          let workflow = null
          if (event.toolName === 'workflow') {
            try {
              const d = (event.result && event.result.details) || {}
              if (d.runId) {
                workflow = {
                  runId: d.runId,
                  background: d.background !== false,
                  // 前台完成时 details 即最终快照（含 tokenUsage / phases / agents）
                  snapshot: d.background === false ? {
                    status: 'completed',
                    name: d.name || (d.meta && d.meta.name) || '',
                    phases: d.phases || [],
                    currentPhase: d.currentPhase || null,
                    agents: Array.isArray(d.agents) ? d.agents.map(a => ({
                      label: a.label, status: a.status, phase: a.phase || null
                    })) : [],
                    tokenUsage: d.tokenUsage || null,
                    durationMs: d.durationMs || null
                  } : null
                }
              }
            } catch (e) { /* 快照提取失败按无 workflow 处理 */ }
          }
          const args = toolArgsById.get(event.toolCallId)
          toolArgsById.delete(event.toolCallId)
          onEvent({
            kind: 'tool_end',
            chatId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args,
            isError: !!event.isError,
            result: resultText.slice(0, 4000),
            ...(artifacts ? { artifacts } : {}),
            ...(workflow ? { workflow } : {})
          })
          break
        }
        case 'compaction_start':
          // 上下文压缩开始（阈值自动 / 溢出 / 手动）
          onEvent({ kind: 'compaction_start', chatId, reason: event.reason })
          break
        case 'compaction_end': {
          // 压缩结束：透传摘要与 token 前后量（失败时 errorMessage）
          const r = event.result
          onEvent({
            kind: 'compaction_end',
            chatId,
            reason: event.reason,
            aborted: !!event.aborted,
            willRetry: !!event.willRetry,
            errorMessage: event.errorMessage,
            summary: r ? String(r.summary || '') : '',
            tokensBefore: r ? (r.tokensBefore || 0) : 0,
            tokensAfter: r ? (r.estimatedTokensAfter || 0) : 0
          })
          break
        }
        default:
          break
      }
    } catch (e) {
      /* 单个事件处理失败不影响会话 */
    }
  })

  state.sessions.set(chatId, { session, unsubscribe, workspaceDir: cwd })
  return session
}

async function disposeSession(chatId) {
  const entry = state.sessions.get(chatId)
  if (!entry) return
  state.sessions.delete(chatId)
  // 拒绝该会话未决的 select 兜底权限确认（Promise 须终结，否则工具门悬挂）
  rejectUiAsks(chatId)
  try { entry.unsubscribe() } catch (e) { /* 忽略 */ }
  try { await entry.session.dispose() } catch (e) { /* 忽略 */ }
}

// 触发 pi-memory 退出摘要（自动记忆链路）：SDK 的 dispose() 是纯同步清理、
// 不发射 session_shutdown，而全 SDK 唯一发射点是 reload()（reason=reload）。
// 配合 PI_MEMORY_SUMMARIZE_TRANSITIONS=1，在销毁会话前主动 reload 一次，
// 扩展的 shutdown handler 即完成「LLM 摘要 → 写 daily/<日期>.md → qmd 索引」
// （pi-memory 内部有 10s 超时护栏；<4 条消息的会话直接跳过，无 LLM 开销）。
// 注意：pi-memory 内部链路失败（取 key / complete）是静默的，宿主无法感知 ——
// 主进程 index.js 的 writeExitSummary 兜底双保险，按 sid 查重防双写
async function finalizeSession(chatId) {
  const entry = state.sessions.get(chatId)
  if (!entry) {
    console.log('[omnibuddy:pi] finalize 跳过（无运行时会话）:', chatId)
    return
  }
  try {
    console.log('[omnibuddy:pi] finalize reload 触发原生摘要:', chatId)
    await entry.session.reload()
    console.log('[omnibuddy:pi] finalize reload 完成:', chatId)
  } catch (e) {
    // 摘要在 reload 第一步（emit shutdown）完成；后续步骤失败不影响销毁
    console.warn('[omnibuddy:pi] finalize reload 异常（不影响销毁）:', (e && e.message) || e)
  }
}

function listSessionIds() {
  return Array.from(state.sessions.keys())
}

// 当前 provider 配置快照（OpenAI 兼容端点直调用，如自动生成会话标题）。
// imageConfigured：generate_image 能力可用判定——附着式 imageModel 或镜像中
// 存在独立图像条目（type: 'image'）任一命中即 true（capabilities 消费）
function getProviderInfo() {
  const info = Object.assign({}, state.provider)
  let hasImageEntry = false
  try {
    const mirror = JSON.parse(fs.readFileSync(
      path.join(state.agentDir, '..', 'automation', 'providers.json'), 'utf-8'))
    hasImageEntry = ((mirror && mirror.providers) || [])
      .some(x => x && x.type === 'image' && x.baseUrl && x.model)
  } catch (e) { /* 镜像不可读：仅附着式判定 */ }
  info.imageConfigured = !!(info.imageModel || hasImageEntry)
  return info
}

// 全量销毁运行中的 pi 会话（安装 MCP 适配器等扩展后调用，新会话重建时装载新扩展）
async function disposeAllSessions() {
  const ids = Array.from(state.sessions.keys())
  for (const id of ids) {
    await disposeSession(id)
  }
  state.sessions.clear()
}

async function interruptSession(chatId) {
  const entry = state.sessions.get(chatId)
  if (entry) await entry.session.abort()
}

// 运行中插话（pi 1.0.0 AgentSession.steer）：排队转向消息，当前工具轮执行完、
// 下次 LLM 调用前送达——不打断进行中的回答（区别于 abort），模型可据此调整后续动作
async function steerSession(chatId, text) {
  const entry = state.sessions.get(chatId)
  if (!entry) return false
  try {
    await entry.session.steer(String(text || ''))
    return true
  } catch (e) {
    console.warn('[omnibuddy:pi] steer 失败:', (e && e.message) || e)
    return false
  }
}

// ===== 社区扩展包管理（pi CLI） =====
// pi CLI 为 ESM 脚本，用 Electron 二进制以 node 模式运行
function piCliPath() {
  // dev: <root>/dist-electron/agent → ../../node_modules；打包后: app.asar/dist-electron/agent → ../../node_modules（同构）
  return path.join(__dirname, '..', '..', 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'bundle', 'cli.js')
}

function listPackages() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(state.agentDir, 'settings.json'), 'utf-8'))
    return Array.isArray(settings.packages) ? settings.packages : []
  } catch (e) {
    return []
  }
}

// 安装社区扩展（如 pi-web-access / pi-subagents）
function installPackage(pkgName) {
  return new Promise((resolve) => {
    const child = spawn(
      process.execPath,
      [piCliPath(), 'install', 'npm:' + pkgName],
      {
        env: Object.assign({}, process.env, {
          ELECTRON_RUN_AS_NODE: '1',
          PI_CODING_AGENT_DIR: state.agentDir
        })
      }
    )
    let out = ''
    child.stdout.on('data', d => { out += d })
    child.stderr.on('data', d => { out += d })
    child.on('error', err => resolve({ ok: false, error: err.message }))
    child.on('close', code => {
      if (code === 0) resolve({ ok: true })
      else resolve({ ok: false, error: (out || '').slice(-500) || 'pi install 退出码 ' + code })
    })
  })
}

// ===== pi-memory 语义记忆（P1-8） =====
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

// ===== pi-markdown-preview（P1 文档导出） =====
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

// ===== pi-dynamic-workflows（P3 深度研究） =====
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
  loadPi,
  init,
  getOrCreateSession,
  disposeSession,
  disposeAllSessions,
  // 销毁前触发 pi-memory 退出摘要（reload → session_shutdown → daily 落盘）
  finalizeSession,
  listSessionIds,
  getProviderInfo,
  interruptSession,
  steerSession,
  // select 兜底权限确认：前端四档应答路由 / 会话中断批量拒绝 / 未决清单（重载恢复）
  replyUiAsk,
  rejectUiAsks,
  getPendingUiAsks,
  listPackages,
  installPackage,
  get agentDir() { return state.agentDir }
}
