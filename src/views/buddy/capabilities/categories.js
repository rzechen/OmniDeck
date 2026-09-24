// OmniBuddy 能力分组元数据（共享定义）
// 能力中心（views/buddy/capabilities）与权限策略对象下拉（views/buddy/permissions）
// 共用同一份分组定义，保证两处清单一致；主进程 capabilities.js 新增分组时
// 在此同步登记即可（未登记的分组在下拉中按 key 名兜底展示）。
// asSurface：该分组条目是否可直接作为权限策略的操作面（surface）——
// 连接器组的权限统一走特殊面 mcp（pattern 匹配 mcp__服务器__工具），不直接纳入
export const CAPABILITY_CATEGORIES = [
  {
    key: 'core',
    label: '核心工具',
    desc: 'Agent 运行时内置的文件读写与命令执行工具',
    icon: 'code',
    logo: 'logo-skill'
  },
  {
    key: 'builtin',
    label: '扩展工具',
    desc: 'OmniBuddy 随应用注册的增强工具',
    icon: 'magic-stick',
    logo: 'logo-skill'
  },
  {
    key: 'ui',
    label: '交互与任务',
    desc: '与界面协作的提问、任务清单与子任务工具',
    icon: 'view',
    logo: 'logo-skill'
  },
  {
    key: 'memory',
    label: '语义记忆',
    desc: 'pi-memory 提供的跨会话记忆：长期记忆、每日日志、草稿板与语义检索',
    icon: 'memory',
    logo: 'logo-skill'
  },
  {
    key: 'connectors',
    label: '连接器',
    desc: '已接入的 MCP 服务提供的扩展能力（系统内置的随包启用，自行登记的在「连接器」页管理）',
    icon: 'mcp',
    logo: 'logo-connector',
    asSurface: false
  }
]
