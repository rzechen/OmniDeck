// 后台子代理运行状态轮询：pi-subagents 的 async run（async: true 委派）在
// 独立进程执行且无流式回传通道 —— 主会话 subagent 工具立即返回 runId 后页面
// 完全静默，用户无法分辨「在跑」还是「已死」。run 落盘的 status.json 含
// state / startedAt / lastActivityAt / deadlineAt，宿主周期读取并推送前端
// （工具卡片显示「后台运行中 · N 秒前活跃」，跨回合可见，与 workflows.watchRun 同模式）
const fs = require('fs')
const path = require('path')

const POLL_INTERVAL_MS = 3000
// 轮询兜底上限：pi-subagents 自带 deadline（默认 30 分钟，status.deadlineAt），
// 宿主超时只防 status 文件异常导致的无限轮询，略高于其上限即可
const MAX_WATCH_MS = 35 * 60 * 1000
const MAX_MISSES = 20 // status.json 持续缺失（启动失败/被清理）及早收尾

// run 终态（与 pi-subagents runner 写入的 state 取值对齐；未知新终态由
// MAX_WATCH_MS 兜底，不误判运行中的 run）
const TERMINAL_STATES = ['completed', 'failed', 'error', 'cancelled', 'canceled', 'timeout']

// runId -> { timer, chatId }
const watchers = new Map()
// chatId -> [runId]（会话删除时批量清理）
const chatRuns = new Map()

function readStatus(asyncDir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(asyncDir, 'status.json'), 'utf-8'))
  } catch (e) {
    return null
  }
}

// 提炼推给前端的活性快照（毫秒时间戳原样透传，展示交给前端算）
function snapshot(asyncDir) {
  const st = readStatus(asyncDir)
  if (!st) return null
  return {
    runId: st.runId || '',
    state: st.state || '',
    startedAt: st.startedAt || 0,
    lastActivityAt: st.lastActivityAt || st.lastUpdate || 0,
    deadlineAt: st.deadlineAt || 0,
    pid: st.pid || 0
  }
}

function watchRun(chatId, runId, asyncDir, onProgress) {
  if (!runId || !asyncDir || typeof onProgress !== 'function') return
  if (watchers.has(runId)) return
  const startedAt = Date.now()
  let misses = 0
  const finish = (snap) => {
    try { onProgress(snap) } catch (e) { /* 回调失败不影响清理 */ }
    unwatch(runId)
  }
  const tick = () => {
    const snap = snapshot(asyncDir)
    if (snap) {
      misses = 0
      try { onProgress(snap) } catch (e) { /* 回调失败不影响轮询 */ }
      if (TERMINAL_STATES.indexOf(snap.state) >= 0) {
        unwatch(runId)
        return
      }
    } else if (++misses >= MAX_MISSES) {
      finish({ runId, state: 'failed', missing: true })
      return
    }
    // 超时兜底：防 status 文件长期不更新导致无限轮询
    if (Date.now() - startedAt > MAX_WATCH_MS) {
      finish({ runId, state: 'timeout' })
    }
  }
  watchers.set(runId, { timer: setInterval(tick, POLL_INTERVAL_MS), chatId })
  if (!chatRuns.has(chatId)) chatRuns.set(chatId, [])
  chatRuns.get(chatId).push(runId)
  tick() // 立即出首帧
}

function unwatch(runId) {
  const w = watchers.get(runId)
  if (!w) return
  clearInterval(w.timer)
  watchers.delete(runId)
  const runs = chatRuns.get(w.chatId)
  if (runs) {
    const i = runs.indexOf(runId)
    if (i >= 0) runs.splice(i, 1)
    if (!runs.length) chatRuns.delete(w.chatId)
  }
}

// 会话删除/中断时清理该会话全部轮询
function unwatchChat(chatId) {
  const runs = (chatRuns.get(chatId) || []).slice()
  runs.forEach(unwatch)
}

module.exports = { watchRun, unwatch, unwatchChat }
