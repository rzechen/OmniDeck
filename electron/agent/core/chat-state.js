// OmniBuddy Agent 会话运行时共享状态中心：运行中回合注册表、挂起询问
// （ask_user / 权限确认）、无头任务心跳看门狗、分支线路锚点与事件广播。
// index.js 门面、事件管线（pi-events.js）、自动化执行体（automation.js）与
// 各 IPC 注册模块经本模块读写同一份状态，避免相互 require 成环。
const { BrowserWindow } = require('electron')
const piRuntime = require('../pi')

// ===== 运行中回合 =====
// 运行中的请求：sessionId -> { abort, mode, model, anchors, assistantIds }
const running = new Map()

// 各会话上次发送的分支线路（anchors key）：切换线路时 pi 会话须丢弃重建
// （pi 上下文与 JSONL 分支视图保持一致）
const sessionAnchorKeys = new Map()

// ===== 挂起询问（等待渲染层应答） =====
// 待回答的 ask_user：callId -> resolve
const pendingAsks = new Map()
// 待回答的权限确认：askId -> { resolve, chatId, info, anchors }
// 无超时：一直等用户决策；仅 interrupt / reply 终结（可见性由前端"等待授权"徽标保证）
const pendingPermissions = new Map()

// ===== 无头任务监护：任务状态机（派生）+ 事件心跳看门狗 =====
// 背景：无头回合的全部生命周期判定（中断/失败/重试）都依赖 session.prompt()
// 的 resolve；LLM 流悬挂（连接建立后不返回数据也不报错）时错误永不返回——
// pi 的 turn_error、pi-ai 的 retryAssistantCall（仅覆盖"错误返回"形态）与
// 执行体的 MAX_ATTEMPTS 重试全部失效，任务在 scheduler 眼中永远 running。
//
// 任务状态机（状态为事件流的派生值，不单独存储避免双份状态失同步）：
//   RUNNING        事件持续到达（流式输出 / 工具执行）
//   AWAITING_USER  存在未决 permission_ask / ask_user / ui.select —— 确认
//                  语义即"一直等用户决策"，看门狗豁免（区别于旧版 15 分钟
//                  墙钟看门狗不区分语义、误杀等待用户任务的问题）
//   AWAITING_MODEL 无事件且非等用户 —— 等待下一次模型响应或工具内部长阻塞；
//                  心跳超时即停滞 → 主动 abort → prompt() resolve → 落入
//                  既有 MAX_ATTEMPTS 重试链路（不依赖"错误返回"）
// 定时任务运行中的回合错误：chatId -> 错误文本（pi 不抛模型请求错误，
// 只发 turn_error 事件；执行体在 prompt 返回后据此判失败并驱动重试）
const automationTurnErrors = new Map()
// 无头会话心跳表：chatId -> { lastActivityAt, lastEventKind, toolOpen, lastToolName }
// （handlePiEvent 全事件入口刷新；普通对话不在表中，O(1) 查询直接返回）
const automationHeartbeats = new Map()
// 无事件判停滞阈值：普通回合 15 分钟（> bash 默认 120s 超时与常见显式
// timeout、上下文压缩时长；< auto-drain 30 分钟上限）
const AUTOMATION_STALL_TIMEOUT_MS = 15 * 60 * 1000
// 长阻塞工具执行中放宽到 35 分钟兜底（防真卡死）：
// bg_wait 等后台 run 收拢（auto-drain 上限 30 分钟）、subagent 前台同步委派、
// workflow 前台深度研究 —— 执行期间无事件属正常行为，误用 15 分钟会截杀
const AUTOMATION_TOOL_STALL_TIMEOUT_MS = 35 * 60 * 1000
const AUTOMATION_LONG_TOOLS = new Set(['bg_wait', 'subagent', 'workflow'])

// 心跳刷新：任何 pi 事件都算活跃信号；tool_start/tool_end 维护"当前是否有
// 未终结工具调用"（看门狗据此选择普通/长阻塞阈值）
function touchAutomationHeartbeat(e) {
  const hb = automationHeartbeats.get(e.chatId)
  if (!hb) return
  hb.lastActivityAt = Date.now()
  hb.lastEventKind = e.kind
  if (e.kind === 'tool_start' && e.toolName) {
    hb.toolOpen = true
    hb.lastToolName = e.toolName
  } else if (e.kind === 'tool_end') {
    hb.toolOpen = false
  }
}

// AWAITING_USER 判定：三处挂起点任一存在未决询问即等用户——
// pendingPermissions（权限确认链路）/ pendingAsks（ask_user 工具）/
// pi.select 兜底（piRuntime.getPendingUiAsks）。用户应答后挂起点自动移除，
// 状态自然迁回 AWAITING_MODEL / RUNNING，无需手动同步
function isAwaitingUser(chatId) {
  for (const p of pendingPermissions.values()) if (p.chatId === chatId) return true
  for (const p of pendingAsks.values()) if (p.chatId === chatId) return true
  try {
    if (piRuntime.getPendingUiAsks().some(p => p && p.sessionId === chatId)) return true
  } catch (err) { /* 列表不可读时按非等用户处理（宁超时勿永久挂起） */ }
  return false
}

// ===== 工具函数 =====
// 当前轮次的分支线路（落盘 assistant/tool 等记录时写入 anchors，渲染层按线路过滤）
function runAnchors(chatId) {
  const a = (running.get(chatId) || {}).anchors
  return Array.isArray(a) && a.length ? a.slice() : null
}

function emit(getWindow, chatId, payload) {
  // 广播至所有窗口（主窗口 + 快捷面板等）：各窗口按 sessionId 自行过滤
  const data = Object.assign({ sessionId: chatId }, payload)
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
        win.webContents.send('omnibuddy:event', data)
      }
    } catch (e) { /* 窗口销毁竞态忽略 */ }
  }
}

module.exports = {
  // 运行中的请求注册表：sessionId -> { abort, mode, model, anchors, assistantIds }
  running,
  // 各会话上次发送的分支线路 key（线路变化时 pi 会话丢弃重建）
  sessionAnchorKeys,
  // 待回答的 ask_user：callId -> resolve
  pendingAsks,
  // 待回答的权限确认：askId -> { resolve, chatId, info, anchors }
  pendingPermissions,
  // 定时任务回合错误登记表（turn_error 事件路径，执行体据此判失败）
  automationTurnErrors,
  // 无头会话心跳表（看门狗数据源，handlePiEvent 全事件刷新）
  automationHeartbeats,
  // 心跳停滞判定阈值：普通回合 15 分钟 / 长阻塞工具 35 分钟
  AUTOMATION_STALL_TIMEOUT_MS,
  AUTOMATION_TOOL_STALL_TIMEOUT_MS,
  // 长阻塞工具名单（执行期间无事件属正常，放宽看门狗阈值）
  AUTOMATION_LONG_TOOLS,
  // 心跳刷新（任何 pi 事件都算活跃信号）
  touchAutomationHeartbeat,
  // AWAITING_USER 判定（三处挂起点任一存在未决询问即等用户）
  isAwaitingUser,
  // 当前轮次分支线路（落盘记录时写入 anchors）
  runAnchors,
  // 事件广播：omnibuddy:event 推送至所有窗口（各窗口按 sessionId 过滤）
  emit
}
