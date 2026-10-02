// 生态连接器（N3 / §15）：官方 MCP Server 预置目录 + 一键注册
// 核心决策：生态集成 = 声明式注册官方 MCP Server，不写一行 SDK 调用。
// - 目录为纯数据（CONNECTORS），新增连接器只需加一条元数据
// - 一键接入 = mcp.save 追加一个 server 条目（stdio npx 启动或远程 URL）
// - 需鉴权的连接器（GitHub）引导创建凭证（credentials.js，safeStorage 加密）
// - 首版预置 4 个官方连接器；社区 MCP Server 仍走现有自定义 MCP 入口
const remote = require('../../src/config/remote.cjs')

// 连接器说明文档外链（主仓库 docs，地址维护于 src/config/remote.cjs）
const DOC_URL = remote.webUrl('app') + '/blob/' + remote.ref('app') + '/docs/p3.md'

const CONNECTORS = [
  {
    id: 'lark',
    name: '飞书 / Lark',
    icon: 'promotion',
    category: 'IM 协作',
    description: '消息、日历、云文档、审批等飞书 OpenAPI 全集（官方 lark-mcp）',
    // stdio：npx 拉起官方包（pi 内置 MCP 装载，新会话生效）
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@larksuiteoapi/lark-mcp', 'mcp'],
    docUrl: DOC_URL,
    // 鉴权说明（引导用户填 token，写入环境变量 LARK_TOKEN）
    credential: {
      envKey: 'LARK_TOKEN',
      label: '飞书开放平台 Token',
      hint: '在飞书开放平台创建企业自建应用，获取 tenant_access_token 或 user_access_token'
    }
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'link',
    category: '代码托管',
    description: 'Issues、PR、仓库读写（GitHub 官方 github-mcp-server 远程服务）',
    // 官方远程 MCP 端点（Streamable HTTP），PAT 作为 Bearer 头注入
    transport: 'http',
    url: 'https://api.githubcopilot.com/mcp/',
    docUrl: DOC_URL,
    credential: {
      headerKey: 'Authorization',
      headerPrefix: 'Bearer ',
      label: 'GitHub Personal Access Token',
      hint: 'GitHub → Settings → Developer settings → Personal access tokens 生成（建议 Fine-grained）'
    }
  },
  {
    id: 'notion',
    name: 'Notion',
    icon: 'document',
    category: '云文档',
    description: '页面、数据库读写（Notion 官方 @notionhq/notion-mcp-server）',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    docUrl: DOC_URL,
    credential: {
      envKey: 'OPENAPI_MCP_HEADERS',
      label: 'Notion Integration Token',
      hint: 'notion.so/my-integrations 创建 Integration，复制 Internal Integration Secret'
      // token 需包成 JSON 头注入：{"Authorization":"Bearer ntn_...","Notion-Version":"2022-06-28"}
    }
  },
  {
    id: 'web',
    name: '网页访问',
    icon: 'search',
    category: '信息获取',
    description: '浏览器自动化与网页读取（系统内置 playwright，已随应用启用）',
    transport: 'builtin',
    docUrl: DOC_URL,
    credential: null // 内置能力无需鉴权
  }
]

// mcp.json 中注册后 server 的名字（一键接入后按此识别「已连接」）
function serverName(id) {
  return 'connector-' + id
}

// 目录视图（渲染进程）：合并 mcp.list() 实时状态
function listConnectors(mcpServers) {
  const names = new Set((mcpServers || []).map(s => s.name))
  return CONNECTORS.map(c => Object.assign({}, c, {
    serverName: serverName(c.id),
    connected: names.has(serverName(c.id)),
    // 凭证字段（credential 对象本身不回传 hint 之外的敏感定义）
    needsCredential: !!c.credential
  }))
}

// 一键接入：向 mcp.json 追加 server 条目（复用 mcp.js 保存管线，校验/凭证注入全复用）
// credentialId 可选：提供则经 credentials.resolve 注入 env/headers
function connect(connectorId, { credentialId } = {}) {
  const c = CONNECTORS.find(x => x.id === connectorId)
  if (!c) return { ok: false, error: '连接器不存在' }
  if (c.transport === 'builtin') {
    return { ok: false, error: '内置能力无需接入，开箱即用' }
  }
  const mcp = require('./mcp')
  const current = mcp.list()
  const exists = current.some(s => s.name === serverName(c.id))
  if (exists) return { ok: false, error: '该连接器已接入' }

  const item = {
    name: serverName(c.id),
    description: c.name + '（官方连接器）',
    enabled: true
  }
  if (c.transport === 'http') {
    item.transport = 'http'
    item.url = c.url
  } else {
    item.transport = 'stdio'
    item.command = c.command
    item.args = c.args
    item.env = {}
  }
  if (credentialId) item.credentialId = credentialId
  const res = mcp.save(current.concat([item]))
  if (!res.ok) return res
  return { ok: true, serverName: item.name }
}

// 断开：从 mcp.json 移除 server 条目
function disconnect(connectorId) {
  const c = CONNECTORS.find(x => x.id === connectorId)
  if (!c) return { ok: false, error: '连接器不存在' }
  const mcp = require('./mcp')
  const current = mcp.list()
  const next = current.filter(s => s.name !== serverName(c.id))
  if (next.length === current.length) return { ok: false, error: '该连接器未接入' }
  return mcp.save(next)
}

// 凭证引导所需信息（渲染进程弹窗用）
function credentialSpec(connectorId) {
  const c = CONNECTORS.find(x => x.id === connectorId)
  if (!c || !c.credential) return null
  return {
    id: c.id,
    name: c.name,
    envKey: c.credential.envKey || '',
    headerKey: c.credential.headerKey || '',
    headerPrefix: c.credential.headerPrefix || '',
    label: c.credential.label,
    hint: c.credential.hint
  }
}

module.exports = { CONNECTORS, listConnectors, connect, disconnect, credentialSpec }
