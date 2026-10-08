// pi 宿主 UI 权威（业界标准做法：宿主向 SDK 注册 uiContext）。
// pi-permission-system 对 ask 的三路裁决：hasUI ? 本地交互（chain link 优先，
// 兜底走 ui.select fallback）: subagent ? 转发父 : 直接拒绝（"no interactive UI"）。
// 注册最小 uiContext：hasUI=true，chain link 未注册时 ask 落到 LocalUserAuthorizer
// 的非 TUI fallback —— ui.select()，由宿主转发 IPC 前端确认条应答，双保险。
const permissions = require('../platform/permissions')
const { state } = require('./state')

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

module.exports = {
  // uiContext 工厂：宿主 UI 权威，select 转 IPC 前端确认条
  createUiContext,
  // 前端四档应答路由（命中返回询问 info 供补写确认记录，未命中返回 null）
  replyUiAsk,
  // 未决询问清单（渲染层重载后恢复确认条用）
  getPendingUiAsks,
  // 会话终止/中断时批量拒绝其未决 select
  rejectUiAsks
}
