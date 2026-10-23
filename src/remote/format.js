// 文本工具：markdown-it 完整渲染（标题/列表/表格/引用/代码块）+ 时间格式化
import MarkdownIt from 'markdown-it'

const mdi = new MarkdownIt({ breaks: true, html: false, linkify: false })

// markdown 渲染（html:false 内嵌标签自动转义，公网链路安全）
export function md(src) {
  return mdi.render(String(src == null ? '' : src))
}

export function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// 工具中文名（与 PC 能力中心 electron/agent/platform/capabilities.js 同源 label）
const TOOL_LABELS = {
  read: '读取文件',
  bash: '执行命令',
  edit: '编辑文件',
  write: '写入文件',
  append: '追加内容',
  multi_edit: '批量编辑',
  find: '查找文件',
  grep: '搜索内容',
  ls: '列出目录',
  codemode: '脚本编排',
  tool_search: '检索工具',
  python: '运行 Python',
  node: '运行 Node.js',
  curl: '发起请求',
  web_search: '联网搜索',
  web_fetch: '抓取网页',
  fetch_content: '抓取网页',
  get_search_content: '调取搜索结果',
  web_enable: '启用联网',
  open_url: '打开网页',
  browser: '浏览器操作',
  ask_user: '向用户提问',
  subagent: '委派专家',
  workflow: '深度研究',
  todo_write: '任务规划',
  bg_wait: '等待后台任务'
}

export function toolLabel(name) {
  const n = String(name || '').trim()
  if (TOOL_LABELS[n]) return TOOL_LABELS[n]
  // mcp__服务器__工具：去掉前缀显示工具名
  if (n.startsWith('mcp__')) {
    const parts = n.split('__')
    return parts[parts.length - 1] || n
  }
  return n || '工具'
}
