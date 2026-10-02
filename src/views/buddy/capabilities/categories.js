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
    key: 'web',
    label: '联网工具',
    desc: '联网搜索与网页抓取（免密钥即可用，多引擎自动降级）',
    icon: 'search',
    logo: 'logo-skill'
  },
  {
    key: 'docs',
    label: '文档交付',
    desc: '把回答与 Markdown 内容导出为 Word / PDF / HTML 正式文档（Word 支持套用模板样式）',
    icon: 'doc',
    logo: 'logo-skill'
  },
  {
    key: 'image',
    label: '图像生成',
    desc: '对话中按文字描述生成图片，产物自动保存（需在模型管理配置 OpenRouter 图像模型）',
    icon: 'picture-outline',
    logo: 'logo-skill'
  },
  {
    key: 'wechat',
    label: '公众号',
    desc: '公众号模板资产管线：秀米模板抓取导入、变量化渲染与草稿发布',
    icon: 'doc',
    logo: 'logo-skill'
  },
  {
    key: 'workflow',
    label: '深度研究',
    desc: 'pi-dynamic-workflows 提供的多代理工作流编排（并行搜集与交叉验证）',
    icon: 'guide',
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
    desc: '跨会话语义记忆：长期记忆、每日日志、草稿板与语义检索',
    icon: 'memory',
    logo: 'logo-skill'
  },
  {
    key: 'credentials',
    label: '凭据取用',
    desc: '对话中按名取用预录凭据（需在「我的资料 → 我的凭据」录入并开启开关）',
    icon: 'key',
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
