// OmniBuddy 设置与集成 IPC：权限体系（模式 / 策略编辑 / 应答路由）、
// 能力中心、凭证管理、联网搜索开关、沙箱、MCP 服务、生态连接器、通知中心。
const { ipcMain } = require('electron')
const capabilities = require('../platform/capabilities')
const permissions = require('../platform/permissions')
const sandbox = require('../platform/sandbox')
const credentials = require('../integrations/credentials')
const webSearch = require('../integrations/web-search')
const computerUse = require('../integrations/computer-use')
const mcp = require('../integrations/mcp')
const connectors = require('../integrations/connectors')
const notify = require('../integrations/notify')
const siteAuth = require('../integrations/site-auth')
const loginWizard = require('../integrations/login-wizard')
const piRuntime = require('../pi')
const piSetup = require('../pi/setup')
const sessions = require('../sessions/sessions')
const { pendingPermissions } = require('../core/chat-state')

// 注册设置与集成相关 IPC（无窗口依赖，纯配置读写与转发）
function registerSettingsIpc() {
  // ===== 权限确认回答（仅本次 / 本会话内 / 始终允许 / 拒绝） =====
  // 双路分发：chain link（omnibuddy-ui 桥接）优先，未命中走 ui.select 兜底权威
  ipcMain.handle('omnibuddy:permission:reply', (_e, { sessionId, askId, action }) => {
    const act = ['allow', 'allow_session', 'allow_always', 'deny'].indexOf(action) >= 0 ? action : 'deny'
    const p = pendingPermissions.get(askId)
    if (p && p.chatId === sessionId) {
      pendingPermissions.delete(askId)
      // 始终允许：把该面 ask 规则升级为 allow 写入策略（跨会话生效；本会话由授权缓存放行）。
      // 网络面（沙箱动态审批）例外：域名写沙箱配置，走权限系统的 persistAlwaysAllow
      // 会把扩展不认识的 network surface 写进 config.json 导致整个权限配置失效
      if (act === 'allow_always') {
        if (p.info.surface === 'network') sandbox.persistNetworkAllow(p.info.value)
        else permissions.persistAlwaysAllow(piRuntime.agentDir, p.info.surface)
      }
      p.resolve(act)
      // 持久化确认记录（重开会话可见历史确认）
      sessions.addMessage(sessionId, Object.assign({ role: 'permission' }, p.info, {
        decided: act
      }, p.anchors && p.anchors.length ? { anchors: p.anchors } : {}))
      return { ok: true }
    }
    // ui.select 兜底路径（hasUI 权威）：映射回 select 选项并终结等待；
    // 返回 info 供补写确认记录（保持与 chain 路径的落盘一致性）
    const uiInfo = piRuntime.replyUiAsk(askId, act)
    if (uiInfo) {
      sessions.addMessage(sessionId, Object.assign({ role: 'permission' }, uiInfo, { decided: act }))
      return { ok: true }
    }
    return { ok: false }
  })

  // 未决权限查询：渲染层重载（HMR/刷新）会丢失一次性推送的 permission_ask 事件，
  // 前端就绪后主动拉取恢复确认条，避免"主进程挂起等待、前端一无所知"的隐形卡死
  // （chain 路径 + ui.select 兜底路径一并返回，均为 permission_ask 形态）
  ipcMain.handle('omnibuddy:permission:pending', () => {
    const chainPending = Array.from(pendingPermissions.entries()).map(([askId, p]) => Object.assign(
      { askId, sessionId: p.chatId },
      p.info
    ))
    return chainPending.concat(piRuntime.getPendingUiAsks())
  })

  // ===== 能力中心（可用工具分类清单 + 权限策略可选对象） =====
  // 能力清单页已并入权限策略：本接口由权限页消费（分组目录 + 特殊面元数据）
  ipcMain.handle('omnibuddy:capability:list', () => {
    return {
      ok: true,
      groups: capabilities.listCapabilities(),
      specialSurfaces: capabilities.SPECIAL_SURFACES
    }
  })

  // ===== 权限模式（输入框常驻选择器，即时生效） =====
  ipcMain.handle('omnibuddy:permission:get-mode', () => ({ ok: true, mode: permissions.getMode() }))
  ipcMain.handle('omnibuddy:permission:set-mode', (_e, mode) => {
    const ok = permissions.setMode(String(mode || ''))
    return { ok }
  })

  // ===== 权限策略编辑（设置页读写 config.json） =====
  // 下发前剥离应用托管 pattern（agentDir / baseDir 系统放行）：配置页只呈现
  // 用户自建规则，避免误删/误改系统路径造成的丢失。
  // 下发的剥离快照留存一份（permissionPageSnapshot）：保存时作为三方合并
  // 基线，识别「下发后由『始终允许』等旁路追加的键」不被页面旧数据冲掉
  let permissionPageSnapshot = null
  ipcMain.handle('omnibuddy:permission:config', () => {
    const stripped = permissions.stripManagedRules(piRuntime.agentDir, permissions.readConfig(piRuntime.agentDir))
    permissionPageSnapshot = stripped
    return {
      ok: true,
      config: stripped,
      // 规则说明 sidecar（'surface|pattern' → 描述），与配置分开发放下发
      notes: permissions.readNotes(piRuntime.agentDir)
    }
  })
  // payload 形态：{ config: { yoloMode, authorizerChain, permission }, notes: {...} }
  // notes 单独走 sidecar 落盘（config.json 的 schema 不认描述类 key）
  ipcMain.handle('omnibuddy:permission:save-config', (_e, payload) => {
    try {
      const config = (payload && payload.config) || payload
      const notes = (payload && payload.notes) || null
      // 服务端三方合并：回传值 ≠ 快照值 → 用户编辑，以回传为准；否则盘上值
      // ≠ 快照值 → 「始终允许」等旁路修改，以盘上为准；托管 pattern 以运行时
      // 计算为准回填（预设覆盖 / 误删 / 绕过前端直调 IPC 均无法破坏系统放行）
      permissions.writeConfig(piRuntime.agentDir, permissions.mergeManagedRules(piRuntime.agentDir, config, permissionPageSnapshot))
      if (notes) permissions.writeNotes(piRuntime.agentDir, notes)
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // 重置为系统默认策略：整份重写 defaultConfig + 清空规则说明 sidecar，
  // 不走三方合并（重置语义就是丢弃自建/旁路修改）；快照同步刷新避免下次保存误判
  ipcMain.handle('omnibuddy:permission:reset', () => {
    try {
      permissions.writeConfig(piRuntime.agentDir, permissions.defaultConfig(piRuntime.agentDir))
      permissions.writeNotes(piRuntime.agentDir, {})
      permissionPageSnapshot = permissions.stripManagedRules(piRuntime.agentDir, permissions.readConfig(piRuntime.agentDir))
      return { ok: true }
    } catch (err) {
      return { ok: false, error: err.message }
    }
  })

  // ===== MCP 服务管理（pi 内置 createMcpExtension 读取 <agentDir>/mcp.json 装载） =====
  ipcMain.handle('omnibuddy:mcp:list', () => mcp.list())

  ipcMain.handle('omnibuddy:mcp:save', (_e, servers) => mcp.save(servers))

  // ===== 站点登录（登录向导 + 登录态登记表） =====
  // 站点清单（含向导打开标记）：连接器页「站点登录」区展示 / 主动补登
  // （登录态本体在 playwright profile，此处只呈现登记状态）
  ipcMain.handle('omnibuddy:siteauth:list', () => {
    return siteAuth.list().map(s => Object.assign({}, s, {
      wizardOpen: loginWizard.currentHost() === s.host
    }))
  })

  // 打开登录向导（host 必传；url 可选，缺省 https://host 由站点自行跳登录页）
  ipcMain.handle('omnibuddy:siteauth:login', (_e, host, url) => {
    const h = siteAuth.hostOf(String(host || ''))
    if (!h) return { ok: false, error: '站点域名无效' }
    return loginWizard.open(h, url)
  })

  // ===== 通知中心（类型 × 渠道矩阵 + webhook 配置 + 测试投递） =====
  ipcMain.handle('omnibuddy:notify:config', () => notify.configView())
  ipcMain.handle('omnibuddy:notify:update', (_e, patch) => notify.updateConfig(patch || {}))
  ipcMain.handle('omnibuddy:notify:test', (_e, channel) => notify.testChannel(channel))

  // ===== 生态连接器（官方 MCP Server 目录，一键接入） =====
  // 目录合并 mcp.list() 实时连接状态
  ipcMain.handle('omnibuddy:connectors:list', () => connectors.listConnectors(mcp.list()))

  // 一键接入（credentialId 可选，经凭证库注入鉴权）
  ipcMain.handle('omnibuddy:connectors:connect', (_e, id, opts) => connectors.connect(id, opts || {}))

  // 断开（从 mcp.json 移除 server 条目）
  ipcMain.handle('omnibuddy:connectors:disconnect', (_e, id) => connectors.disconnect(id))

  // 凭证引导信息（弹窗展示用，不含 secret）
  ipcMain.handle('omnibuddy:connectors:credential-spec', (_e, id) => connectors.credentialSpec(id))

  // 打开接入说明（系统浏览器）
  ipcMain.handle('omnibuddy:connectors:open-doc', (_e, url) => {
    if (!/^https?:\/\//.test(String(url || ''))) return { ok: false }
    require('electron').shell.openExternal(url)
    return { ok: true }
  })

  // ===== 凭证管理（safeStorage 加密存储，list 仅脱敏视图；resolve 明文仅用于编辑回显） =====
  ipcMain.handle('omnibuddy:credentials:list', () => credentials.list())

  // 明文解析：编辑凭据弹窗回显 env（渲染进程按需单条获取，不做全量明文列表）
  ipcMain.handle('omnibuddy:credentials:resolve', (_e, id) => {
    const secret = credentials.resolve(id)
    return { ok: true, secret }
  })

  ipcMain.handle('omnibuddy:credentials:create', async (_e, c) => {
    const r = await credentials.create(c)
    // 子代理凭据 env 即时刷新（globalThis 缓存，无需销毁会话即生效）
    if (r.ok) piSetup.refreshChildCredEnv()
    return r
  })

  ipcMain.handle('omnibuddy:credentials:update', async (_e, c) => {
    const r = await credentials.update(c)
    if (r.ok) piSetup.refreshChildCredEnv()
    return r
  })

  ipcMain.handle('omnibuddy:credentials:delete', async (_e, id) => {
    const r = credentials.remove(id)
    if (r.ok) piSetup.refreshChildCredEnv()
    return r
  })

  // ===== 凭据保存后销毁 pi 会话（AI 凭据清单注入发生在会话创建时） =====
  ipcMain.handle('omnibuddy:credentials:dispose-sessions', async () => {
    await piRuntime.disposeAllSessions()
    return { ok: true }
  })

  // 联网搜索（pi-web-access 内置扩展，免配置即用）：总开关（输入框联网按钮）
  ipcMain.handle('omnibuddy:web-search:get', () => ({ enabled: webSearch.enabled() }))
  ipcMain.handle('omnibuddy:web-search:set-enabled', (_e, enabled) => webSearch.setEnabled(!!enabled))

  // ===== 桌面控制（UI-TARS 原子动作面）：开关 / 权限探测 / 系统设置直达 =====
  // 开关变更后新会话生效（会话创建时锁定，与联网开关同模式）
  ipcMain.handle('omnibuddy:computer-use:get', () => ({ enabled: computerUse.enabled() }))
  ipcMain.handle('omnibuddy:computer-use:set-enabled', (_e, enabled) => {
    const enabledNow = computerUse.setEnabled(!!enabled)
    return { enabled: enabledNow }
  })

  // 权限探测：辅助功能 / 屏幕录制（macOS TCC）+ nut.js 可用性（探测期间懒启动 worker）
  ipcMain.handle('omnibuddy:computer-use:probe', () => computerUse.probe())

  // 直达系统设置对应权限页（kind: 'accessibility' | 'screen'；非 macOS 返回不支持）
  ipcMain.handle('omnibuddy:computer-use:open-permission', (_e, kind) => {
    if (process.platform !== 'darwin') return { ok: false, error: '桌面控制目前仅支持 macOS' }
    const anchor = kind === 'screen' ? 'Privacy_ScreenCapture' : 'Privacy_Accessibility'
    require('electron').shell.openExternal('x-apple.systempreferences:com.apple.preference.security?' + anchor)
    return { ok: true }
  })

  // ===== 沙箱执行 =====
  ipcMain.handle('omnibuddy:sandbox:get', () => sandbox.getSandboxConfig())

  ipcMain.handle('omnibuddy:sandbox:set-enabled', (_e, enabled) => {
    // 开关落盘，新会话生效（运行中会话不热切换，避免沙箱状态不一致）
    sandbox.setSandboxEnabled(!!enabled)
    return sandbox.getSandboxConfig()
  })
}

module.exports = {
  // 注册设置与集成 IPC（权限 / 能力 / 凭证 / MCP / 连接器 / 通知 / 沙箱 / 联网）
  registerSettingsIpc
}
