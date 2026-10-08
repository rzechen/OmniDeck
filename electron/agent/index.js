// OmniBuddy Agent IPC 门面：模块初始化编排 + 退出前记忆落盘 + IPC 注册分发。
// 渲染进程通过 preload 暴露的 window.omnibuddy 调用；流式事件经 'omnibuddy:event' 推送。
// 优先走 pi Agent 循环（工具调用 / ask-user / todo / 社区扩展）；
// pi 加载失败时回退到 core/llm.js 纯对话（OpenAI 兼容流式）。
// 模块按领域划分在子目录（各模块头部有职责说明）：
//   pi/            pi Agent 运行时（门面 index.js + 状态/会话/导出等子模块）
//   core/          对话核心（chat-state 状态中心 / pi-events 事件管线 / direct-llm 直调 / llm 兜底）
//   ipc/           IPC 注册层（chat / sessions / settings / workspace / automation 定时任务执行体）
//   sessions/      会话数据（sessions 存储 / checkpoints / file-changes / branchView / export 导出）
//   knowledge/     知识资产（skills / rules / profile / memory / market）
//   integrations/  外部接入（mcp / connectors / credentials / web-search / site-auth / login-wizard / notify / workflows / pkg-registry）
//   workspace/     空间与文件（workspaces / files / attachments）
//   platform/      平台与安全（permissions / capabilities / runtime / sandbox / scheduler / usage）
//   tools/         pi 工具扩展（builtin-tools / doc-export / image-gen）
const path = require('path')
const { app } = require('electron')
const sessions = require('./sessions/sessions')
const piRuntime = require('./pi')
const sandbox = require('./platform/sandbox')
const skills = require('./knowledge/skills')
const workspaces = require('./workspace/workspaces')
const files = require('./workspace/files')
const mcp = require('./integrations/mcp')
const credentials = require('./integrations/credentials')
const rules = require('./knowledge/rules')
const profile = require('./knowledge/profile')
const memory = require('./knowledge/memory')
const attachments = require('./workspace/attachments')
const market = require('./knowledge/market')
const usage = require('./platform/usage')
const checkpoints = require('./sessions/checkpoints')
const scheduler = require('./platform/scheduler')
const notify = require('./integrations/notify')
const siteAuth = require('./integrations/site-auth')
const workflows = require('./integrations/workflows')
const { handlePiEvent } = require('./core/pi-events')
const { writeExitSummary } = require('./core/direct-llm')
const { createAutomation } = require('./ipc/automation')
const { registerChatIpc } = require('./ipc/chat')
const { registerSessionsIpc } = require('./ipc/sessions')
const { registerSettingsIpc } = require('./ipc/settings')
const { registerWorkspaceIpc } = require('./ipc/workspace')

// 注册 OmniBuddy 全量 IPC 与子系统（主窗口就绪后由主进程调用一次）
function registerOmnibuddyIpc(getWindow, userDataPath) {
  const baseDir = userDataPath || path.join(app.getPath('userData'), 'omnibuddy')
  // ===== 子系统初始化（数据目录落位） =====
  sessions.initSessions(path.join(baseDir, 'sessions'))
  piRuntime.init(path.join(baseDir, 'pi-agent'))
  sandbox.init(path.join(baseDir, 'pi-agent'))
  skills.init(path.join(baseDir, 'pi-agent'))
  workspaces.init(baseDir)
  files.init(baseDir, getWindow)
  mcp.init(path.join(baseDir, 'pi-agent'))
  credentials.init(baseDir)
  rules.init(path.join(baseDir, 'pi-agent'))
  profile.init(baseDir)
  memory.init(path.join(baseDir, 'pi-agent'))
  workflows.init(path.join(baseDir, 'pi-agent'))
  attachments.init(baseDir)
  market.init(baseDir)
  market.registerIpc()
  checkpoints.init(path.join(baseDir, 'sessions'))
  // 用量独立账本（先于使用：含存量会话 usage 的一次性迁移）
  usage.init(baseDir)

  // ===== 定时任务（自动化） =====
  // 调度器只管「何时跑」；执行体在此注入（无头会话 + pi 运行 + 结果落系统会话）
  scheduler.init(baseDir)
  const automation = createAutomation({ getWindow, handlePiEvent })
  scheduler.setRunner(automation.runAutomationTask)
  automation.registerIpc()

  // 通知中心 / 站点登录态登记（任务完成 / 权限审批 / 登录墙引导的统一投递）
  notify.init(baseDir)
  siteAuth.init(baseDir)

  // 登录向导（integrations/login-wizard.js 薄壳）：窗口实体在主进程
  // （utilityProcess 无法 new BrowserWindow），成功 / 取消的广播由主进程
  // 向导直发全窗口，此处不再注入 hooks

  // macOS dock 角标：任务完成且窗口未聚焦时点亮，任意窗口聚焦即清除
  if (process.platform === 'darwin' && app.dock) {
    app.on('browser-window-focus', () => {
      try { app.dock.setBadge('') } catch (e) { /* 忽略 */ }
    })
  }

  // ===== 退出前记忆落盘（自动记忆链路） =====
  // 双路：① 每会话 reload() 触发 pi-memory 原生 session_shutdown 摘要（含 qmd 索引）；
  // ② 自有兜底 writeExitSummary（provider 直调，pi-memory 内部链路静默失败时保底，
  //    按 sid 查重防双写）。逐会话串行（daily 文件追加避免并发写竞态）。
  // 总兜底超时防 provider 挂起导致无法退出（强杀只丢当次摘要）；
  // quitFinalized 防 app.exit() 再次触发 before-quit 造成的递归拦截
  let quitFinalized = false
  app.on('before-quit', (event) => {
    if (quitFinalized) return
    quitFinalized = true
    event.preventDefault()
    const ids = piRuntime.listSessionIds()
    console.log('[omnibuddy] 退出前触发会话记忆摘要（' + ids.length + ' 个活跃会话）…')
    if (!ids.length) {
      app.exit(0)
      return
    }
    const forceExit = setTimeout(() => {
      console.warn('[omnibuddy] 记忆摘要总超时，强制退出')
      app.exit(0)
    }, 20000)
    ;(async () => {
      for (const id of ids) {
        try {
          await piRuntime.finalizeSession(id)
        } catch (e) { /* 原生链路失败不阻断兜底 */ }
        try {
          await writeExitSummary(id)
        } catch (e) { /* 兜底失败不阻断退出 */ }
      }
    })()
      .catch(() => {})
      .finally(() => {
        clearTimeout(forceExit)
        app.exit(0)
      })
  })

  // ===== IPC 注册分发（按领域分组） =====
  registerChatIpc(getWindow)
  registerSessionsIpc(getWindow)
  registerSettingsIpc()
  registerWorkspaceIpc(getWindow)
}

// 会话标题：首问前 24 字截断（sessions.addMessage）为初始标题；
// 每轮回答完成后由 maybeAutoTitle 以全会话内容重新生成（未被手动重命名时）

module.exports = {
  // 注册 OmniBuddy 全量 IPC 与子系统（主窗口就绪后调用一次）
  registerOmnibuddyIpc
}
