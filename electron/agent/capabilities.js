// OmniBuddy 能力中心：呈现当前 Agent 可用的工具清单（分类目录）
// 本目录是工具登记的单一事实来源：能力展示（listCapabilities）与权限默认
// 策略（permissions.js 的 defaultConfig / 启动补齐）均从此派生。
// 新增工具只需在此登记一处（name / label / description / perm 默认权限），
// 能力清单与权限策略同步生效，不再出现两处平行维护的漂移；
// 连接器分类由 mcp.js 运行时列表组合。
// perm 取值：'allow' / 'ask' / 'deny' 或 pattern 映射对象（如 bash 的通配规则）；
// 缺省 perm 的工具不产生默认策略键（回落 '*' 兜底）。
const mcp = require('./mcp')
const runtime = require('./runtime')
const memory = require('./memory')
const webSearch = require('./web-search')
const workflows = require('./workflows')

// pi 内置工具（pi-coding-agent 核心工具集）
const CORE_TOOLS = [
  { name: 'read', label: '读取文件', description: '读取本地文件内容（文本与图片），支持行范围。', perm: 'allow' },
  // bash 默认策略：只读命令白名单 + 兜底逐次确认（业界通行的模式白名单，
  // Claude Code `Bash(git status:*)` / OpenCode 同构）。安全边界四条：
  //   1) 链式 / 复合命令逐段匹配、最严者胜（扩展 schema 明文语义）——
  //      `ls x; rm -rf y` 的 rm 段单独落兜底 ask，白名单不外溢；
  //   2) 重定向写有独立效果归因：工作区外落 external_directory_write 逐次
  //      确认，`cat ~/.env` 等敏感路径由 path 面 deny 独立拦截；
  //   3) 不放 find（-delete / -exec 属写效果，文件查找走内置 find 工具）；
  //   4) 不放 echo（`echo x > f` 重定向写工作区会绕过 write 工具的 ask）。
  // pattern 语义：结尾「空格 + *」的通配（如 `ls *`）使裸命令也匹配；
  // `git diff*` 匹配 git diff 及其任意参数形态；`git status` / `git branch`
  // 为精确匹配（branch 带参即创建分支，属写操作不放开）。
  // 键序：'*' 在前、具体 pattern 在后（last-match-wins，后写的白名单生效）
  {
    name: 'bash',
    label: '执行命令',
    description: '在当前工作空间执行 bash 命令并返回输出；沙箱开启时在受限环境中运行。常用只读命令（ls / cat / git status 等）默认放行，其余逐次确认。',
    perm: {
      '*': 'ask',
      'ls *': 'allow',
      'pwd': 'allow',
      'cat *': 'allow',
      'head *': 'allow',
      'tail *': 'allow',
      'wc *': 'allow',
      'grep *': 'allow',
      'which *': 'allow',
      'file *': 'allow',
      'stat *': 'allow',
      'du *': 'allow',
      'df': 'allow',
      'git status': 'allow',
      'git diff*': 'allow',
      'git log*': 'allow',
      'git show*': 'allow',
      'git branch': 'allow'
    }
  },
  { name: 'edit', label: '编辑文件', description: '精确替换文件片段；默认需逐次确认，可在权限策略中调整。', perm: 'ask' },
  { name: 'write', label: '写入文件', description: '创建/覆写文件内容；默认需逐次确认，可在权限策略中调整。', perm: 'ask' },
  // find / grep / ls 均为 pi 内置纯只读工具（无副作用），默认放行，
  // 不再回落 '*' 兜底逐次询问
  { name: 'find', label: '查找文件', description: '按名称 / 类型 / 大小等条件在工作空间内查找文件（pi 内置）。', perm: 'allow' },
  { name: 'grep', label: '搜索内容', description: '按正则表达式在文件内容中搜索匹配行（pi 内置，支持 include 过滤）。', perm: 'allow' },
  { name: 'ls', label: '列出目录', description: '列出指定目录的内容（pi 内置）。', perm: 'allow' },
  // pi 1.0.0 内置编排工具：codemode 经 QuickJS 沙箱脚本编排工具调用（省约 40%
  // prompt token）。工具本身只做编排：脚本内嵌套调用的工具（read/bash/mcp__*
  // 等）仍各自过权限门（带 parentToolCallId），故默认放行不放大攻击面
  { name: 'codemode', label: '脚本编排', description: '以 JavaScript 脚本批量编排工具调用（并行执行、结果过滤），显著节省 token；脚本内嵌套调用的工具仍按各自权限逐次管控。', perm: 'allow' },
  // tool_search：按需搜索并加载未声明的工具（MCP 大服务器的 deferred 工具），
  // 只改变工具可见性、无副作用
  { name: 'tool_search', label: '检索工具', description: '按关键词搜索并按需加载未声明的工具（如大型 MCP 服务的延迟加载工具），仅影响工具可见性。', perm: 'allow' }
]

// OmniBuddy 扩展工具（builtin-tools.js 注册）
const EXT_TOOLS = [
  { name: 'python', label: '运行 Python', description: '执行 Python 代码并返回 stdout / stderr（30 秒超时）。'
    + '预装办公与数据栈（numpy / pandas / matplotlib / openpyxl 等），可直接 import。', perm: 'ask' },
  { name: 'node', label: '运行 Node.js', description: '执行 Node.js 代码并返回 stdout / stderr（30 秒超时）。'
    + '预装图像与文档生成库（sharp / docx / pptxgenjs 等），可直接 require。', perm: 'ask' },
  { name: 'curl', label: '发起请求', description: '发起 HTTP 请求并返回响应（30 秒超时，响应体截断）。', perm: 'allow' },
  { name: 'multi_edit', label: '批量编辑', description: '对同一文件批量执行多处精确替换（任一处未匹配则整批不写入）。', perm: 'ask' },
  { name: 'append', label: '追加内容', description: '追加内容到文件末尾（文件不存在时自动创建）。', perm: 'ask' },
  { name: 'mkdir', label: '创建目录', description: '创建目录（递归创建缺失的父目录）。', perm: 'ask' },
  { name: 'cd', label: '切换目录', description: '切换会话级当前工作目录，影响后续相对路径解析。', perm: 'allow' }
]

// python / node 工具依赖解释器（优先内置运行时，回退系统 PATH）——运行时探测动态标注
// 同时附带预装依赖落位明细（runtime.pythonPackages / nodePackages），供能力清单展开「已装依赖与模块」
function extToolsWithRuntimeStatus() {
  const probes = { python: runtime.probePython(), node: runtime.probeNode() }
  const modules = { python: runtime.pythonPackages(), node: runtime.nodePackages() }
  return EXT_TOOLS.map(t => {
    const probe = probes[t.name]
    if (!probe) return t
    const detail = {
      software: t.name === 'python' ? 'Python' : 'Node.js',
      source: probe.source,
      sourceLabel: probe.sourceLabel,
      modules: modules[t.name] || []
    }
    if (probe.source === 'builtin') {
      return Object.assign({}, t, { runtime: detail, description: t.description + '解释器来自内置运行时。' })
    }
    if (probe.source === 'downloaded') {
      return Object.assign({}, t, {
        runtime: detail,
        description: t.description + '解释器来自在线装配的运行时组件（设置 → 运行时可管理）。'
      })
    }
    if (probe.source === 'system') {
      return Object.assign({}, t, {
        runtime: detail,
        description: t.description + '解释器来自系统环境。'
      })
    }
    return Object.assign({}, t, {
      disabled: true,
      runtime: detail,
      description: '未检测到 ' + (t.name === 'python' ? 'Python' : 'Node.js')
        + ' 解释器（运行时未装配且系统 PATH 上无可用解释器，可在设置 → 运行时在线装配）。'
    })
  })
}

// 联网工具（pi-web-access 社区扩展注册，pkg-registry 内置登记）
// 免密钥即可用（auto 模式多引擎自动降级）；按联网开关动态标注禁用态。
// 4 个工具须全部登记：get_search_content 为分页取回已存储的搜索/抓取结果
// （web_search / fetch_content 的伴随读取面），缺失会导致能力清单与
// excludeTools 屏蔽名单漏项
const WEB_TOOLS = [
  { name: 'web_search', label: '联网搜索', description: '搜索互联网最新信息（多引擎自动降级，免密钥即可用）。', perm: 'allow' },
  { name: 'fetch_content', label: '抓取网页', description: '把网页 / 代码仓库 / 在线 PDF 抓取并转为 Markdown 供阅读引用。', perm: 'allow' },
  { name: 'source_check', label: '核实来源', description: '对引用的网络来源做真实性与一致性核查。', perm: 'allow' },
  { name: 'get_search_content', label: '调取搜索结果', description: '分页取回已存储的搜索 / 抓取结果全文，供深入阅读与引用（web_search / fetch_content 的配套读取工具）。', perm: 'allow' }
]

// 按联网开关动态标注（关闭 → 禁用态卡片 + 引导说明）
function webTools() {
  if (webSearch.enabled()) return WEB_TOOLS
  return WEB_TOOLS.map(t => Object.assign({}, t, {
    disabled: true,
    description: '联网开关已关闭（对话页输入框旁可重新开启）。' + t.description
  }))
}

// 内置 MCP 通配放行（pi 1.0.0 命名）：内置 MCP 的工具名为
// mcp__服务器__工具（每工具独立注册，权限 surface = 工具全名）。
// 权限规则的 surface 键支持通配（* 编译为 .*），mcp__playwright* 一条键
// 放行内置浏览器全部工具，否则 playwright 数十个浏览器工具会逐个落 '*'
// 兜底询问。自行登记的 MCP 服务器仍逐工具确认（fail-safe），用户可照此
// 格式自建 mcp__服务器名* 通配规则
// （旧 pi-mcp-adapter 的字面「mcp」面已退役：适配器启动时强制清理，
// 默认策略不再写 mcp 键，存量键由启动迁移摘除）
const MCP_BUILTIN_TOOLS = [
  { name: 'mcp__playwright*', label: '内置浏览器（全部工具）', description: '内置 playwright MCP 服务的全部浏览器操作工具（mcp__playwright__导航 / 截图 / 点击 / 等待等）通配放行：系统内置服务、无头运行、产物落应用自管目录。', perm: 'allow' }
]

// MCP 通配条目（仅用于能力目录下发 / 权限页呈现）：静态内置条目 +
// 自建连接器动态条目。注意：自建条目只让权限页「看得见」该服务器，
// 不进入 toolPermissionDefaults——不产生默认规则键，其工具落 '*'
// 兜底 ask；用户在页面调整后保存的键（allow/ask）属用户配置，
// 「重置默认」时清除
function mcpBuiltinTools() {
  const dynamic = []
  try {
    mcp.list().forEach(srv => {
      if (!srv || !srv.name) return
      dynamic.push({
        name: 'mcp__' + srv.name + '*',
        label: srv.name + '（全部工具）',
        description: '自建 MCP 服务器「' + srv.name + '」全部工具（mcp__' + srv.name + '__工具名）的通配规则：缺省逐次确认（落兜底），可在权限策略中调整为允许，或按 mcp__' + srv.name + '__工具名 细分到具体工具。',
        perm: 'ask',
        disabled: !srv.enabled,
        // 非系统默认：不进默认策略 / 启动补齐；保存时动作若与兜底等价则不落显式键
        systemDefault: false
      })
    })
  } catch (e) { /* mcp 未初始化时无自建条目 */ }
  return MCP_BUILTIN_TOOLS.concat(dynamic)
}

// 文档交付工具（P1）：doc_export 自研（doc-export.js 注册）+
// preview_export（pi-markdown-preview 社区扩展）；转换引擎 pandoc
// 运行时探测动态标注（内置运行时 → 系统 PATH → 未检测到）
const DOC_TOOLS = [
  { name: 'doc_export', label: '导出文档', description: '把 Markdown 内容导出为 Word / PDF / HTML 正式文档，产物落当前目录 exports/ 下（Word 支持参考模板沿用公司样式）。', perm: 'allow' },
  { name: 'preview_export', label: '生成预览', description: '把 Markdown / LaTeX / 本地文件 / 最新回复渲染为 PDF / HTML / PNG 预览文件。', perm: 'allow' }
]

// 图像生成（pi 1.0.0）：generate_image 工具仅在 provider 配置了图像模型时注册；
// 未配置时按禁用态呈现（文案引导去模型管理页），与联网开关同模式
const IMAGE_TOOLS = [
  { name: 'generate_image', label: '生成图片', description: '根据文字描述生成图片（OpenAI 图像接口兼容格式，支持智谱 / OpenRouter / 硅基流动等端点），产物自动保存到 exports/ 并展示卡片。', perm: 'allow' }
]

function imageTools() {
  // 惰性 require：pi.js 顶层引用本模块（webToolNames），加载期反向 require 会循环
  let configured = false
  try {
    configured = !!(require('./pi').getProviderInfo() || {}).imageConfigured
  } catch (e) { /* pi 运行时未初始化按未配置处理 */ }
  if (configured) return IMAGE_TOOLS
  return IMAGE_TOOLS.map(t => Object.assign({}, t, {
    disabled: true,
    description: '未配置图像生成模型（模型管理 → 新建图像生成模型，OpenAI 图像接口兼容端点）。'
  }))
}

// 按 pandoc 落位状态动态标注（python / node 工具同模式）；
// 对用户文案不暴露底层引擎术语（pandoc / 扩展包名），仅呈现可用状态
function docTools() {
  const probe = runtime.probePandoc()
  const detail = { software: 'Pandoc', source: probe.source, sourceLabel: probe.sourceLabel, version: probe.version }
  if (probe.source === 'builtin') {
    return DOC_TOOLS.map(t => Object.assign({}, t, {
      runtime: detail,
      description: t.description + '文档转换引擎已随应用内置，开箱即用。'
    }))
  }
  if (probe.source === 'downloaded') {
    return DOC_TOOLS.map(t => Object.assign({}, t, {
      runtime: detail,
      description: t.description + '文档转换引擎来自在线装配的运行时组件（设置 → 运行时可管理）。'
    }))
  }
  if (probe.source === 'system') {
    return DOC_TOOLS.map(t => Object.assign({}, t, {
      runtime: detail,
      description: t.description + '文档转换引擎来自系统环境。'
    }))
  }
  return DOC_TOOLS.map(t => Object.assign({}, t, {
    disabled: true,
    runtime: detail,
    description: '未检测到文档转换引擎，文档导出暂不可用（重新装配运行时后自动恢复）。' + t.description
  }))
}

// 深度研究工具（P3）：@quintinshaw/pi-dynamic-workflows 社区扩展注册
// （pi.js 启动时自动安装，失败下次启动重试）
const WORKFLOW_TOOLS = [
  { name: 'workflow', label: '编排工作流', description: '编排多代理工作流（深度研究 / 多视角分析等），子代理并行搜集与验证后汇总结论（后台运行，进度在对话卡片实时呈现）。', perm: 'ask' },
  { name: 'workflow_control', label: '控制工作流', description: '查询 / 暂停 / 恢复 / 停止进行中的工作流运行。', perm: 'allow' }
]

// 按扩展安装状态动态标注（未就绪 → 禁用态卡片 + 引导说明，memory 同模式）
function workflowTools() {
  if (workflows.extensionInstalled()) return WORKFLOW_TOOLS
  return WORKFLOW_TOOLS.map(t => Object.assign({}, t, {
    disabled: true,
    description: '深度研究能力尚未就绪（应用启动时自动装配，稍后重试）。' + t.description
  }))
}

// 交互与任务工具（UI 耦合扩展，pi.js 内联注册）
const UI_TOOLS = [
  { name: 'ask_user', label: '向用户提问', description: '信息不足或存在歧义时向用户提问，前端渲染表单收集回答。', perm: 'allow' },
  { name: 'todo_write', label: '更新任务清单', description: '维护当前任务清单（pending / in_progress / completed），前端看板呈现。', perm: 'allow' },
  { name: 'todo_read', label: '查看任务清单', description: '读取当前会话的任务清单与进度。', perm: 'allow' },
  // 站点登录态上报（两段式自动登录）：撞登录墙时通知桌面端引导有头首登；
  // 默认放行——纯登记操作无副作用，无头定时任务中被 ask 拦截会丢失登录引导
  { name: 'report_site_auth', label: '上报站点登录态', description: '浏览器访问站点后上报登录状态：撞登录墙报 login_required（触发桌面通知引导有头登录），确认已登录报 logged_in。', perm: 'allow' },
  // pi-subagents 注册的委派工具（实际工具名 subagent；有 token 成本且产生
  // 子代理行为，默认逐次确认）。早期目录误记为 'task' 且无 perm，导致该键
  // 从未进入默认策略与启动补齐，落 '*' 兜底
  { name: 'subagent', label: '子任务委派', description: '将独立子任务委派给子代理执行（pi-subagents：前台同步阻塞到完成，或后台异步运行）。', perm: 'ask' },
  // pi-subagents 运行时配套工具（主会话与 child 内均可能经权限门；缺省落
  // '*' 兜底会在无头流水线中弹确认打断）：bg_wait 等待/收拢后台 run，
  // contact_supervisor / structured_output 为 child 内通信与交付面，均无副作用
  { name: 'bg_wait', label: '等待后台任务', description: '等待无原生完成通知的后台子代理 / 供给者任务完成并返回结果（控制面，无副作用）。', perm: 'allow' },
  { name: 'contact_supervisor', label: '联系父会话', description: '子代理内向父 / 监督会话发起决策请求、结构化访谈或进度汇报。', perm: 'allow' },
  { name: 'structured_output', label: '提交结构化输出', description: '子代理内提交该步骤要求的最终结构化结果并结束步骤。', perm: 'allow' },
  // subagent_supervisor：pi-subagents 的监督控制面（与子代理会话交互 / 下发
  // 监督指令）。此前目录漏登记，用户经确认条「始终允许」写入的键在能力
  // 清单无对应条目（权限有、清单无的漂移源之一），补齐
  { name: 'subagent_supervisor', label: '监督子代理', description: '以监督者身份与子代理会话交互（下发指令 / 汇报与管控），pi-subagents 运行时配套控制面，无文件副作用。', perm: 'allow' }
]

// 语义记忆工具（pi-memory 社区扩展注册，pi.js 启动时自动安装；
// 未注册时整体降级标注，qmd 未就绪仅影响 memory_search 的语义/混合模式）
// perm 即权限默认值（memory_forget 删除条目较敏感，逐次确认）
const MEMORY_TOOLS = [
  { name: 'memory_write', label: '写入记忆', description: '把事实、偏好与决策写入长期记忆（MEMORY.md）或当日工作日志，跨会话持续生效。', perm: 'allow' },
  { name: 'memory_read', label: '读取记忆', description: '读取长期记忆、草稿板或指定日期的工作日志。', perm: 'allow' },
  { name: 'memory_search', label: '检索记忆', description: '按关键词 / 语义 / 混合三种模式检索全部记忆（语义与混合模式需检索引擎就绪）。', perm: 'allow' },
  { name: 'memory_forget', label: '遗忘记忆', description: '删除匹配的记忆条目并生成恢复记录，误删可还原。', perm: 'ask' },
  { name: 'memory_restore', label: '恢复记忆', description: '按恢复 ID 还原一次「遗忘」删除的记忆条目。', perm: 'allow' },
  { name: 'scratchpad', label: '草稿清单', description: '维护待办与待回看清单（添加 / 完成 / 撤销 / 清空 / 列出），每轮对话开场自动注入。', perm: 'allow' },
  { name: 'memory_status', label: '记忆体检', description: '检查记忆目录、检索引擎与向量索引的就绪状态。', perm: 'allow' }
]

// 按 pi-memory 注册状态动态标注（未注册 → 禁用态卡片 + 引导说明）
function memoryTools() {
  const installed = memory.extensionInstalled()
  if (installed) return MEMORY_TOOLS
  return MEMORY_TOOLS.map(t => Object.assign({}, t, {
    disabled: true,
    description: '记忆能力尚未就绪（应用启动时自动装配，稍后重试）。' + t.description
  }))
}

// 权限策略可用的特殊面（非单一工具）：跨工具路径面 / 外部目录 / 技能 / 兜底
// （旧 pi-mcp-adapter 的字面「mcp」面已退役：连接器统一走 mcp__服务器名*
// 通配键，见「MCP 通配规则」分组）
const SPECIAL_SURFACES = [
  { name: 'path', label: '路径面（跨工具）', description: '对 read/bash 等工具访问的文件路径统一设规则，如 *.env。' },
  { name: 'external_directory', label: '外部目录', description: '访问当前工作空间之外的目录（方向不明时读写一并管控）。' },
  { name: 'external_directory_read', label: '外部目录（只读）', description: '仅控制读取工作空间之外的目录；写入走「外部目录（只写）」面。' },
  { name: 'external_directory_write', label: '外部目录（只写）', description: '仅控制写入工作空间之外的目录；读取走「外部目录（只读）」面。' },
  { name: 'skill', label: '技能', description: '技能激活与输入工具。' },
  { name: '*', label: '所有操作（兜底）', description: '未命中其他规则的操作按此规则处理。' }
]

// 连接器条目：系统内置连接器（随包内置、强制启用）+ 用户登记的 MCP 服务（连接器页管理）
// 内置 playwright 附带预装组件明细，供能力清单展开「预装依赖」（与 python / node 同构）
function connectorEntries() {
  let builtin = []
  let custom = []
  try {
    builtin = mcp.builtinList()
    custom = mcp.list()
  } catch (e) { /* mcp 未初始化时为空 */ }
  return builtin.concat(custom).map(s => {
    const entry = {
      name: s.name,
      label: s.name,
      description: (s.description ||
        (s.transport === 'http' ? '远程服务 ' + (s.url || '') : '本地服务 ' + (s.command || ''))
      ) + (s.enabled ? '' : '（未启用）'),
      disabled: !s.enabled,
      builtin: !!s.builtin
    }
    if (s.builtin && s.name === 'playwright') entry.runtime = runtime.playwrightRuntime()
    return entry
  })
}

// 凭据取用工具（B 方案后续）：pi.js 内联注册；条目级 aiEnabled 放行，权限默认允许
const CREDENTIAL_TOOLS = [
  { name: 'credential_get', label: '取用凭据', description: '按名称取用用户预录的凭据（API Key、账号等），用于登录、调接口等鉴权场景。', perm: 'allow' }
]

function listCapabilities() {
  return {
    core: CORE_TOOLS,
    builtin: extToolsWithRuntimeStatus(),
    web: webTools(),
    docs: docTools(),
    image: imageTools(),
    mcpBuiltin: mcpBuiltinTools(),
    workflow: workflowTools(),
    ui: UI_TOOLS,
    memory: memoryTools(),
    credentials: CREDENTIAL_TOOLS,
    connectors: connectorEntries()
  }
}

// ===== 统一目录派生（单一事实来源的其他消费方） =====

// 静态工具分组清单（连接器为运行时组合，不参与派生）
const TOOL_GROUPS = [
  ['core', CORE_TOOLS],
  ['builtin', EXT_TOOLS],
  ['web', WEB_TOOLS],
  ['docs', DOC_TOOLS],
  ['image', IMAGE_TOOLS],
  ['mcpBuiltin', MCP_BUILTIN_TOOLS],
  ['workflow', WORKFLOW_TOOLS],
  ['ui', UI_TOOLS],
  ['memory', MEMORY_TOOLS],
  ['credentials', CREDENTIAL_TOOLS]
]

// 工具名 → 默认权限规则（标量或 pattern 映射对象），供 permissions.js
// 派生默认策略与启动补齐；无 perm 的工具不产生键。
// 对象值深拷贝：防止消费方就地在返回值上改写目录常量。
// 只含「系统自带」键（含内置 playwright 通配放行）；用户自建连接器
// （mcp.list() 动态服务器）不在此列——其工具缺省落 '*' 兜底 ask，
// fail-safe 不破；用户在权限页调整 / 确认条「始终允许」产生的键属
// 用户配置，「重置默认」整份重写时随之清除（重置 = 只保留系统默认）
function toolPermissionDefaults() {
  const out = {}
  TOOL_GROUPS.forEach(([, tools]) => {
    tools.forEach(t => {
      if (t.perm === undefined) return
      out[t.name] = (typeof t.perm === 'object' && t.perm !== null)
        ? JSON.parse(JSON.stringify(t.perm))
        : t.perm
    })
  })
  return out
}

// 联网工具名清单：联网开关关闭时的 excludeTools 黑名单（pi.js 消费）
function webToolNames() {
  return WEB_TOOLS.map(t => t.name)
}

module.exports = { listCapabilities, SPECIAL_SURFACES, toolPermissionDefaults, webToolNames }
