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
  { name: 'bash', label: '执行命令', description: '在当前工作空间执行 bash 命令并返回输出；沙箱开启时在受限环境中运行。', perm: { '*': 'ask' } },
  { name: 'edit', label: '编辑文件', description: '精确替换文件片段；默认需逐次确认，可在权限策略中调整。', perm: 'ask' },
  { name: 'write', label: '写入文件', description: '创建/覆写文件内容；默认需逐次确认，可在权限策略中调整。', perm: 'ask' },
  { name: 'find', label: '查找文件', description: '按名称 / 类型 / 大小等条件在工作空间内查找文件（pi 内置）。' },
  { name: 'grep', label: '搜索内容', description: '按正则表达式在文件内容中搜索匹配行（pi 内置，支持 include 过滤）。' },
  { name: 'ls', label: '列出目录', description: '列出指定目录的内容（pi 内置）。' }
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
        + ' 解释器（内置运行时未装配且系统 PATH 上无可用解释器）。'
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

// 文档交付工具（P1）：doc_export 自研（doc-export.js 注册）+
// preview_export（pi-markdown-preview 社区扩展）；转换引擎 pandoc
// 运行时探测动态标注（内置运行时 → 系统 PATH → 未检测到）
const DOC_TOOLS = [
  { name: 'doc_export', label: '导出文档', description: '把 Markdown 内容导出为 Word / PDF / HTML 正式文档，产物落当前目录 exports/ 下（Word 支持参考模板沿用公司样式）。', perm: 'allow' },
  { name: 'preview_export', label: '生成预览', description: '把 Markdown / LaTeX / 本地文件 / 最新回复渲染为 PDF / HTML / PNG 预览文件。', perm: 'allow' }
]

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
  { name: 'task', label: '子任务委派', description: '将独立子任务委派给子 Agent 并行执行。' }
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

// 权限策略可用的特殊面（非单一工具）：跨工具路径面 / 外部目录 / MCP / 技能 / 兜底
const SPECIAL_SURFACES = [
  { name: 'path', label: '路径面（跨工具）', description: '对 read/bash 等工具访问的文件路径统一设规则，如 *.env。' },
  { name: 'external_directory', label: '外部目录', description: '访问当前工作空间之外的目录（读与写）。' },
  { name: 'external_directory_read', label: '外部目录（只读）', description: '仅控制读取工作空间之外的目录；写入仍走「外部目录」面。' },
  { name: 'mcp', label: '连接器（MCP）', description: '按连接器工具匹配，如 mcp__服务器名__工具名。' },
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
  ['workflow', WORKFLOW_TOOLS],
  ['ui', UI_TOOLS],
  ['memory', MEMORY_TOOLS],
  ['credentials', CREDENTIAL_TOOLS]
]

// 工具名 → 默认权限规则（标量或 pattern 映射对象），供 permissions.js
// 派生默认策略与启动补齐；无 perm 的工具不产生键。
// 对象值深拷贝：防止消费方就地在返回值上改写目录常量
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
