// pi 会话生命周期：创建 / 原生 resume / 文本回放重建 / 销毁 / 中断 / 插话。
// 每个对话一个 pi AgentSession；本进程存活期间复用，应用重启后优先原生
// resume（保留完整工具历史/压缩状态/codemode store/prompt cache 前缀），
// 无落盘转录时降级为「文本回放」重建上下文。
const path = require('path')
const fs = require('fs')
const sandbox = require('../platform/sandbox')
const builtinTools = require('../tools/builtin-tools')
const permissions = require('../platform/permissions')
const credentials = require('../integrations/credentials')
const webSearch = require('../integrations/web-search')
const computerUse = require('../integrations/computer-use')
const mcp = require('../integrations/mcp')
const capabilities = require('../platform/capabilities')
const docExport = require('../tools/doc-export')
const imageGen = require('../tools/image-gen')
const rules = require('../knowledge/rules')
const { state, loadPi } = require('./state')
const { ensureRuntime, thinkingLevelOf, providerKeyOf } = require('./provider')
const { createAskUserExtension, createCredentialGetExtension, createTodoExtension } = require('./extensions')
const { systemPrompt } = require('./prompt')
const { createUiContext, rejectUiAsks } = require('./ui-context')
const { subscribeSessionEvents } = require('./session-events')
const workspaces = require('../workspace/workspaces')

// ===== 记忆策略（按工作空间） =====
// workspaces.memoryPolicy：global 继承全局 / isolate 独立目录 / clean 不装载记忆。
// 会话创建时解析策略：isolate 在扩展装载前把 PI_MEMORY_DIR 指到独立目录
//（pi-memory 模块加载时读一次 env，SDK 扩展缓存按 cwd 失效重载——跨 cwd 必重装）；
// clean 经 extensionsOverride 过滤掉 pi-memory 扩展（工具、上下文注入、退出摘要全断）。
// 进程 env 是全局的：并发创建不同策略会话时注入窗口可能被覆盖 → 创建全程持锁串行。
let sessionCreateLock = Promise.resolve()
function withEnvLock(fn) {
  const run = sessionCreateLock.then(fn, fn)
  // 锁链自愈：异常也放行后续等待者
  sessionCreateLock = run.then(() => {}, () => {})
  return run
}

// ===== 工具扩展（会话闭包级） =====
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

// ===== 会话文件定位 =====
// 定位会话目录下最近一次的会话文件（<时间戳>_main.jsonl，按 mtime 取最新）
function findLatestSessionFile(dir) {
  let names
  try {
    names = fs.readdirSync(dir)
  } catch (e) { return null }
  const files = []
  for (const n of names) {
    if (!n.endsWith('_main.jsonl')) continue
    const p = path.join(dir, n)
    try { files.push({ p, mtime: fs.statSync(p).mtimeMs }) } catch (e) { /* 忽略不可读文件 */ }
  }
  files.sort((a, b) => b.mtime - a.mtime)
  return files.length ? files[0].p : null
}

// 会话上下文作废（分支线路变化 / 删除会话）：销毁内存会话并删除落盘转录。
// resume 语义下 piSessionDir 的存在即视为「上次上下文有效」，凡需上下文重置的
// 场景必须走本函数（仅 disposeSession 会留下旧文件，下次被 resume 复活旧线路）
async function invalidateSessionFiles(chatId) {
  await disposeSession(chatId)
  try {
    fs.rmSync(path.join(state.agentDir, 'sessions', chatId), { recursive: true, force: true })
  } catch (e) { /* 忽略 */ }
}

// ===== 会话创建 / 复用 =====
// workspaceDir 由调用方按用户选定的"工作空间"传入；
// 同一会话切换工作空间时，旧 pi 会话必须丢弃重建（上下文与文件环境绑定）。
async function getOrCreateSession(chatId, provider, historyTexts, onEvent, workspaceDir) {
  const cached = state.sessions.get(chatId)
  if (cached) {
    const policyNow = resolveMemoryPolicy(workspaceDir).policy
    const keyNow = providerKeyOf(provider)
    if (cached.workspaceDir === workspaceDir && cached.memoryPolicy === policyNow && cached.providerKey === keyNow) return cached.session
    // 工作空间 / 记忆策略 / 模型配置变化：丢弃旧会话（含旧转录），下面按新配置重建
    // （原生 resume 保留上下文，provider 变化由 pi 以 model_change 条目衔接）
    if (cached.providerKey !== keyNow) {
      console.log('[omnibuddy:pi] 会话缓存丢弃（模型配置已切换）：', chatId)
    }
    await disposeSession(chatId)
  }
  // 记忆策略注入与扩展装载必须串行（进程 env 全局，见 withEnvLock 注释）
  return withEnvLock(() => createSessionInternal(chatId, provider, historyTexts, onEvent, workspaceDir))
}

// 工作空间目录 → 记忆策略（path 反查登记项；未登记回退 global）
function resolveMemoryPolicy(workspaceDir) {
  try {
    const hit = workspaces.list().find(w => w.path === workspaceDir)
    if (hit) return workspaces.memoryDirFor(hit.id)
  } catch (e) { /* 读失败回退 global */ }
  return { policy: 'global', dir: null }
}

async function createSessionInternal(chatId, provider, historyTexts, onEvent, workspaceDir) {
  const cwd = workspaceDir
  const memory = resolveMemoryPolicy(cwd)
  await ensureRuntime(provider)
  const pi = await loadPi()

  // 记忆策略注入（锁内）：isolate 改 PI_MEMORY_DIR；clean 还原默认（全局）
  const prevMemoryDir = process.env.PI_MEMORY_DIR
  if (memory.policy === 'isolate' && memory.dir) {
    process.env.PI_MEMORY_DIR = memory.dir
  } else {
    process.env.PI_MEMORY_DIR = path.join(state.agentDir, 'memory')
  }

  const piSessionDir = path.join(state.agentDir, 'sessions', chatId)
  fs.mkdirSync(cwd, { recursive: true })
  // 工作空间临时目录（按空间划分）：Agent 临时产物的统一落点（TMPDIR 注入指向此处）
  fs.mkdirSync(path.join(cwd, '.tmp'), { recursive: true })

  // 原生 resume：目录下存在会话文件则 SessionManager.open 续接。
  // provider / 模型重启后变化由 pi 以 model_change 条目衔接（缓存不 reuse 但
  // 上下文完整）；header cwd 与当前工作空间不一致（重启前切换过工作空间）或
  // 打开失败（文件损坏等）→ 回退文本回放重建。OB_NATIVE_RESUME=0 可整体关闭
  let sessionManager = null
  state.replayMaps.delete(chatId)
  state.bookmarks.delete(chatId)
  if (process.env.OB_NATIVE_RESUME !== '0') {
    const sessionFile = findLatestSessionFile(piSessionDir)
    if (sessionFile) {
      try {
        const sm = pi.SessionManager.open(sessionFile, piSessionDir)
        if (sm.getCwd() !== cwd) {
          console.log('[omnibuddy:pi] resume 跳过（工作空间已变化），回放重建：', chatId)
        } else {
          // 应用待定分支切换（内存无会话时 branchSessionTo 登记的锚点）；
          // 锚点在文件中不存在（映射过期/文件被外部改动）→ 抛错走回放兜底
          const pending = state.pendingBranches.get(chatId)
          if (pending !== undefined) {
            state.pendingBranches.delete(chatId)
            if (pending === null) sm.resetLeaf()
            else if (!sm.getEntry(pending)) throw new Error('pending branch 锚点不存在于会话文件')
            else sm.branch(pending)
            console.log('[omnibuddy:pi] resume 并应用待定分支切换：', chatId)
          }
          sessionManager = sm
          console.log('[omnibuddy:pi] 原生 resume 会话：', chatId, '->', path.basename(sessionFile))
        }
      } catch (e) {
        console.warn('[omnibuddy:pi] resume 失败，回退回放重建：', (e && e.message) || e)
      }
    }
  }
  if (!sessionManager) {
    // 初始化 / 兜底路径：清掉旧转录文件（避免与固定 id 冲突），文本回放重建
    // （仅回放 user/assistant 文本与图片附件，工具调用历史不保留）
    state.pendingBranches.delete(chatId)
    fs.rmSync(piSessionDir, { recursive: true, force: true })
    fs.mkdirSync(piSessionDir, { recursive: true })
    sessionManager = pi.SessionManager.create(cwd, piSessionDir, { id: 'main' })
    // 回放历史（user/assistant 文本 + 用户消息的图片附件）；
    // appendMessage 返回 entry id，与 history 元素携带的自有消息 id（mid）
    // 组成映射交宿主落盘 pi-map（分支切换时 branch 锚点定位用）
    const replayMap = []
    for (const m of historyTexts) {
      try {
        const content = [{ type: 'text', text: m.content || '' }]
        // 图片附件回放为 image 块（data 为 base64；由 agent/index.js 装载）
        for (const img of (m.images || [])) {
          if (img && img.data) content.push({ type: 'image', data: img.data, mimeType: img.mimeType || 'image/png' })
        }
        const entryId = sessionManager.appendMessage({ role: m.role, content })
        if (m.mid && entryId) replayMap.push({ mid: m.mid, entryId })
      } catch (e) {
        /* 跳过无法回放的消息 */
      }
    }
    if (replayMap.length) state.replayMaps.set(chatId, replayMap)
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
    // tool_search 供模型按需加载 deferred 工具。
    // inlineBudget 10000（默认 3000）：实测（官方 renderToolSample + 轮转算法
    // 模拟）内置工具组 ~2500 + playwright 43 工具 4939 + wechat-mcp 6 工具 1005
    // ≈ 8500 token——10000 全量入目录并留余量，未来增配 MCP 无需再调。预算外
    // 工具 schema 不可见时模型凭先验猜参数名（10-09 事故：browser_evaluate 传
    // fn 而非 function）。工具目录是稳定前缀，prompt cache 命中后增量成本极低
    pi.createCodemodeExtension({ inlineBudget: 10000 }),
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
    // 站点登录态上报：撞登录墙 → 主进程登记 + login.required 通知（引导有头首登）；
    // toolCallId 随行携带，供前端把上报关联回思考区工具卡片（内嵌「打开登录向导」按钮）
    builtinTools.createSiteAuthExtension(r =>
      onEvent({ kind: 'site_auth', chatId, toolCallId: r.toolCallId, url: r.url, status: r.status, note: r.note })),
    builtinTools.createCdExtension(cwdState),
    builtinTools.createExecToolsExtension(cwdState, path.join(cwd, '.tmp'), getSkillEnv),
    builtinTools.createFileToolsExtension(cwdState),
    builtinTools.createTodoReadExtension(() => builtinTools.getTodos(chatId)),
    // 桌面控制：UI-TARS 原子动作面（开关状态会话创建时锁定，与联网开关同模式；
    // 关闭时不注册工具 + excludeTools 双保险）
    ...(computerUse.enabled() ? [builtinTools.createComputerUseExtension(cwdState)] : []),
    // 文档导出：markdown → Word / PDF / HTML，产物落 <cwd>/exports/
    docExport.createDocExportExtension(cwdState),
    // 图像生成：OpenAI images 兼容格式（独立图像条目 / 附着式配置），
    // 产物落 <cwd>/exports/；SDK 内置 openrouter-images 通道不再注册（通用替代）
    imageGen.createImageGenExtension(cwdState, state.agentDir, () => state.provider),
    // 凭据按需取用：AI 对话中经 credential_get 取「AI 取用类」凭据；
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

  // clean 档：过滤 pi-memory 扩展（packages 里注册路径含 "pi-memory"）
  const loaderOptions = {
    cwd,
    agentDir: state.agentDir,
    systemPromptOverride: () => systemPrompt(),
    extensionFactories: factories,
    // 空间规则虚拟注入：规则存应用内部（不落工作空间磁盘），此处以虚拟上下文
    // 文件并入 pi 原生发现的清单（全局 agentDir/AGENTS.md 与用户手写文件照常装载）
    agentsFilesOverride: (base) => ({
      agentsFiles: base.agentsFiles.concat(rules.sessionAgentsFiles(cwd))
    })
  }
  if (memory.policy === 'clean') {
    loaderOptions.extensionsOverride = (base) => {
      const kept = base.extensions.filter(ext => {
        const p = String(ext && ext.path || '')
        return p.indexOf('pi-memory') < 0
      })
      return Object.assign({}, base, { extensions: kept })
    }
  }
  const resourceLoader = new pi.DefaultResourceLoader(loaderOptions)
  await resourceLoader.reload()

  // 关闭 SDK 自动重试（默认最多 3 次静默重试，期间前端一直停留在"思考中"）；
  // 开启上下文自动压缩（长会话接近窗口上限时自动总结早期记录）；
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
    // createWebToolsDirectExtension 校正扩展兜底维护。
    // 桌面控制开关关闭时同样屏蔽 computer_* 工具（开启时由工具注册兜底，
    // 关闭时双保险防绕过）
    ...(webSearch.enabled()
      ? { excludeTools: ['web_enable'].concat(computerUse.enabled() ? [] : capabilities.computerToolNames()) }
      : { excludeTools: capabilities.webToolNames()
        .concat(['web_enable'])
        .concat(computerUse.enabled() ? [] : capabilities.computerToolNames()) })
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

  // 事件订阅：归一化为渲染进程事件模型（技能激活经回调登记）
  const unsubscribe = subscribeSessionEvents(session, chatId, onEvent, (skillName, toolCallId, toolName) => {
    // 技能激活登记：后续 bash / python / node 的执行环境注入该技能的凭证 env
    activeSkills.add(skillName)
    onEvent({ kind: 'skill', chatId, toolCallId, skillName, toolName })
  })

  // 会话缓存带上策略与模型配置指纹（getOrCreateSession 比对：切换模型即重建；
  // writeExitSummary 兜底按会话取目录；restore env）
  state.sessions.set(chatId, { session, unsubscribe, workspaceDir: cwd, memoryPolicy: memory.policy, providerKey: providerKeyOf(provider) })
  // env 已在扩展装载时被读取，恢复进程默认（避免污染其它会话的 bash env 继承）
  process.env.PI_MEMORY_DIR = prevMemoryDir
  return session
}

// ===== 会话销毁与控制 =====
async function disposeSession(chatId) {
  const entry = state.sessions.get(chatId)
  if (!entry) return
  state.sessions.delete(chatId)
  // 拒绝该会话未决的 select 兜底权限确认（Promise 须终结，否则工具门悬挂）
  rejectUiAsks(chatId)
  try { entry.unsubscribe() } catch (e) { /* 忽略 */ }
  try { await entry.session.dispose() } catch (e) { /* 忽略 */ }
  // pi dispose 不发射 session_shutdown，MCP stdio 子进程不随之关闭（详见
  // mcp.cleanupLeakedServers 注释）；最后一个会话销毁后清理泄漏进程，
  // 有并发会话时不清理（无法区分子进程归属，等最后一个会话销毁/退出）
  if (state.sessions.size === 0) {
    try { mcp.cleanupLeakedServers() } catch (e) { /* 忽略 */ }
  }
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

// 会话记忆目录解析（writeExitSummary 兜底用）：
// 运行时会话直接取缓存；已销毁会话按其绑定的工作空间目录反查（历史会话摘要留档场景）
function getSessionMemoryInfo(chatId) {
  const entry = state.sessions.get(chatId)
  if (entry) {
    if (entry.memoryPolicy === 'clean') return { policy: 'clean', dir: null }
    if (entry.memoryPolicy === 'isolate') {
      const hit = workspaces.list().find(w => w.path === entry.workspaceDir)
      if (hit) {
        const info = workspaces.memoryDirFor(hit.id)
        if (info.policy === 'isolate') return info
      }
    }
    return { policy: 'global', dir: null }
  }
  return null
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

module.exports = {
  // 会话定位：目录下最近一次的会话转录文件（resume / 原生导出共用）
  findLatestSessionFile,
  // 会话上下文作废：销毁内存会话 + 删除落盘转录（防 resume 复活旧线路）
  invalidateSessionFiles,
  // 会话创建 / 复用（原生 resume 优先，无转录时文本回放重建）
  getOrCreateSession,
  // 销毁单个会话（退订事件 + dispose + 拒绝未决权限确认）
  disposeSession,
  // 全量销毁运行中会话（扩展安装后调用，新会话装载新扩展）
  disposeAllSessions,
  // 销毁前触发 pi-memory 退出摘要（reload → session_shutdown → daily 落盘）
  finalizeSession,
  // 内存会话 id 清单
  listSessionIds,
  // 会话记忆目录解析（记忆策略 isolate/clean 的兜底摘要按此分目录）
  getSessionMemoryInfo,
  // 中断会话当前回合（abort）
  interruptSession,
  // 运行中插话（排队转向消息，不打断进行中的回答）
  steerSession
}
