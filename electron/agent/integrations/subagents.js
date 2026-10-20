// OmniBuddy 子代理后台并行：pi-subagents async run 状态注册表与轮询
// pi-subagents 后台（async:true）child 在独立 runner 进程运行，状态落盘到
//   $TMPDIR/pi-subagents-<scope>/async-subagent-runs/<runId>/status.json
// （scope 见 pi-subagents src/shared/types.js resolveTempScopeId：优先 uid）。
// status.json 关键字段：runId / state(running|paused|complete|partial|failed|
// stopped) / steps[]（每 step: agent/status/description）/ mode / startedAt /
// lastUpdate / usageBudget 等。本模块职责（对标 integrations/workflows.js）：
//   1) run 注册表：chatId -> 活跃 run（tool_end 捕获 asyncId 登记，终态移除），
//      前端刷新/HMR 后可经 IPC 拉取重建卡片与任务列表 running 态
//   2) 状态轮询：POLL_INTERVAL_MS 读 status.json 投影精简快照回调（终态停止），
//      悬挂检测（长时间无更新）回调告警
//   3) 结果通知：终态时回调（调用方发 workflow_progress 事件 + 系统通知）
const path = require('path')
const fs = require('fs')
const os = require('os')

// ===== 后台委派开关（asyncEnabled）=====
// 配置：<agentDir>/subagents.json 键 omnideck.asyncEnabled，默认开启（B 方案形态：
// 前台同步为主、显式 async:true 后台并行 + 全链路 UI）。关闭时 setup.js 部署
// 剥离扩展强制前台（历史行为），prompt/capabilities 同步降级描述
let agentDir = ''

function configPath() {
  return path.join(agentDir, 'subagents.json')
}

function readConfig() {
  if (!agentDir) return {}
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf-8'))
  } catch (e) { return {} }
}

function init(dir) {
  agentDir = dir || ''
}

function asyncEnabled() {
  const cfg = readConfig()
  return !(cfg.omnideck && cfg.omnideck.asyncEnabled === false)
}

function setAsyncEnabled(v) {
  const cfg = readConfig()
  cfg.omnideck = Object.assign({}, cfg.omnideck, { asyncEnabled: !!v })
  fs.mkdirSync(path.dirname(configPath()), { recursive: true })
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2))
  return asyncEnabled()
}

// ===== 临时根目录定位（复刻 pi-subagents DIRS，不引入对包内部的运行时依赖）=====
// PI_SUBAGENTS_TEMP_ROOT 显式配置优先；否则 <tmpdir>/pi-subagents-<scope>
// scope：getuid 可用即 uid-<uid>（macOS/Linux 主路径），回落 USER/HOME
function tempScope() {
  if (typeof process.getuid === 'function') return 'uid-' + process.getuid()
  const byName = ['USERNAME', 'USER', 'LOGNAME']
    .map(k => process.env[k])
    .find(Boolean)
  if (byName) return 'user-' + String(byName).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  const home = process.env.USERPROFILE || process.env.HOME
  if (home) return 'home-' + String(home).replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '')
  return 'shared'
}

function asyncRunsDir() {
  if (process.env.PI_SUBAGENTS_TEMP_ROOT) {
    return path.join(path.resolve(process.env.PI_SUBAGENTS_TEMP_ROOT), 'async-subagent-runs')
  }
  return path.join(os.tmpdir(), 'pi-subagents-' + tempScope(), 'async-subagent-runs')
}

// ===== run 注册表 =====
// runId -> { chatId, toolCallId, agent, task, cwd, startedAt, lastSnap }
// 挂起期间常驻（终态移除）；渲染层刷新后经 activeRunsOf(chatId) 重建视图
const registry = new Map()

function registerRun(runId, info) {
  if (!runId || !info || !info.chatId) return
  registry.set(runId, {
    chatId: info.chatId,
    toolCallId: info.toolCallId || '',
    agent: info.agent || '',
    task: info.task || '',
    cwd: info.cwd || '',
    startedAt: Date.now(),
    lastSnap: null
  })
}

function unregisterRun(runId) {
  registry.delete(runId)
}

// 会话的全部活跃 run（IPC 重建用）：投影为前端可消费的最小字段
function activeRunsOf(chatId) {
  const out = []
  for (const [runId, r] of registry.entries()) {
    if (r.chatId !== chatId) continue
    out.push({
      runId,
      agent: r.agent,
      task: r.task,
      snapshot: r.lastSnap || snapshotOf(runId)
    })
  }
  return out
}

// 会话销毁时清理注册表与轮询
function clearChat(chatId) {
  for (const [runId, r] of Array.from(registry.entries())) {
    if (r.chatId === chatId) {
      registry.delete(runId)
      unwatch(runId)
    }
  }
}

function stopAll() {
  for (const runId of Array.from(registry.keys())) {
    registry.delete(runId)
    unwatch(runId)
  }
}

// ===== status.json 读取与投影 =====
// 投影为与深度研究进度卡片同构的精简快照（wire-safe）：
// steps[].status: running|pending|complete|partial|failed|stopped|paused
// —— 前端按 done = complete 计数，与 WorkflowPanel 的 counts 约定对齐
function snapshotOf(runId) {
  const file = path.join(asyncRunsDir(), String(runId), 'status.json')
  let raw = null
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (e) { return null }
  try {
    const st = JSON.parse(raw)
    if (!st || typeof st !== 'object' || !st.runId) return null
    const steps = Array.isArray(st.steps) ? st.steps : []
    const count = s => steps.filter(x => x && x.status === s).length
    const done = count('complete') + count('partial')
    const rec = registry.get(runId)
    const agents = steps.map(x => (x && (x.label || x.agent)) || '专家').slice(0, 8)
    return {
      runId: st.runId,
      kind: 'subagent',
      name: rec && rec.agent ? rec.agent : (st.mode === 'chain' ? '专家链' : '专家任务'),
      status: st.state === 'complete' ? 'completed'
        : st.state === 'partial' ? 'completed'
          : st.state === 'stopped' ? 'stopped'
            : st.state === 'paused' ? 'paused'
              : st.state === 'failed' ? 'failed' : 'running',
      state: st.state,
      error: st.error || (st.result && st.result.error) || '',
      counts: {
        total: steps.length,
        done,
        running: count('running'),
        queued: count('pending'),
        error: count('failed'),
        skipped: count('skipped') + count('stopped')
      },
      activeLabels: steps
        .filter(x => x && x.status === 'running')
        .map(x => x.label || x.agent || '专家')
        .slice(0, 6),
      steps: steps.map(x => ({
        agent: (x && (x.label || x.agent)) || '',
        description: (x && x.description) || '',
        status: (x && x.status) || 'pending'
      })),
      tokenUsage: st.usageBudget && st.usageBudget.usage
        ? st.usageBudget.usage
        : null,
      durationMs: st.startedAt && st.lastUpdate && st.state !== 'running'
        ? st.lastUpdate - st.startedAt
        : null,
      startedAt: st.startedAt || (rec ? rec.startedAt : Date.now()),
      updatedAt: st.lastUpdate || 0
    }
  } catch (e) { return null }
}

// ===== 轮询 =====
// runId -> { timer, startedAt, chatId, onProgress, onTerminal, staleWarned }
const watchers = new Map()
const POLL_INTERVAL_MS = 1000
// 悬挂判定：连续 N 秒快照 updatedAt 无推进（run 还在 running 态但无活动）。
// 90 秒阈值：远小于 MAX_WATCH_MS 兜底，给「等待权限确认」这类真实悬挂留出
// 主动告警窗口（用户可去处理或停止），而不是 15 分钟后被静默判失败
const STALE_MS = 90 * 1000
// 轮询兜底上限（对齐深度研究 MAX_WATCH_MS）
const MAX_WATCH_MS = 15 * 60 * 1000

function unwatch(runId) {
  const w = watchers.get(runId)
  if (!w) return
  clearInterval(w.timer)
  watchers.delete(runId)
}

function unwatchChat(chatId) {
  for (const [runId, w] of Array.from(watchers.entries())) {
    if (w.chatId === chatId) unwatch(runId)
  }
}

// 轮询 run 状态文件并回调快照：
// - onProgress(snapshot)：每 tick（含终态最后一帧）
// - onTerminal(snapshot)：仅终态（completed/failed/stopped）一次
// - onStale(snapshot)：疑似挂起（长时间无状态推进），告警一次
function watchRun(runId, chatId, onProgress, onTerminal, onStale) {
  if (!runId || watchers.has(runId)) return
  const startedAt = Date.now()
  let misses = 0
  const w = {
    chatId,
    startedAt,
    onProgress,
    onTerminal,
    onStale,
    staleWarned: false
  }
  const tick = () => {
    const snap = snapshotOf(runId)
    const rec = registry.get(runId)
    if (rec) rec.lastSnap = snap
    if (snap) {
      misses = 0
      try { onProgress(snap) } catch (e) { /* 回调失败不影响轮询 */ }
      if (snap.status === 'completed' || snap.status === 'failed' || snap.status === 'stopped') {
        try { onTerminal(snap) } catch (e) { /* 忽略 */ }
        unregisterRun(runId)
        unwatch(runId)
        return
      }
      // 悬挂检测：running/paused 且状态文件 updatedAt 超过 STALE_MS 无推进
      if (!w.staleWarned && (snap.status === 'running' || snap.status === 'paused')
        && snap.updatedAt && Date.now() - snap.updatedAt > STALE_MS) {
        w.staleWarned = true
        try { onStale(snap) } catch (e) { /* 忽略 */ }
      } else if (snap.updatedAt && Date.now() - snap.updatedAt <= STALE_MS) {
        // 恢复活动即重置告警（下次再悬挂仍可告警）
        w.staleWarned = false
      }
    } else {
      misses++
      // 状态文件持续缺失（runner 启动失败/被清理）：及早收尾
      if (misses >= 10) {
        try {
          const failSnap = {
            runId,
            kind: 'subagent',
            name: (rec && rec.agent) || '专家任务',
            status: 'failed',
            counts: {},
            activeLabels: [],
            error: '运行状态不可用'
          }
          onProgress(failSnap)
          onTerminal(failSnap)
        } catch (e) { /* 忽略 */ }
        unregisterRun(runId)
        unwatch(runId)
        return
      }
    }
    // 超时兜底：防挂死导致无限轮询
    if (Date.now() - startedAt > MAX_WATCH_MS) {
      try {
        const timeoutSnap = Object.assign(snap || { runId, kind: 'subagent', counts: {}, activeLabels: [] }, {
          status: 'failed',
          error: (snap && snap.error) || '运行超时'
        })
        onProgress(timeoutSnap)
        onTerminal(timeoutSnap)
      } catch (e) { /* 忽略 */ }
      unregisterRun(runId)
      unwatch(runId)
    }
  }
  w.timer = setInterval(tick, POLL_INTERVAL_MS)
  watchers.set(runId, w)
  tick() // 立即出首帧
}

module.exports = {
  // 配置：后台委派开关（agentDir 初始化；asyncEnabled 默认 true）
  init,
  asyncEnabled,
  setAsyncEnabled,
  // 后台 run 目录（$TMPDIR/pi-subagents-<scope>/async-subagent-runs）
  asyncRunsDir,
  // run 注册表：登记（tool_end 捕获）/ 移除 / 按会话查询（IPC 重建）
  registerRun,
  unregisterRun,
  activeRunsOf,
  // 会话销毁 / 全量停止
  clearChat,
  stopAll,
  // 单次读取 run 状态快照（读不到返回 null）
  snapshotOf,
  // 轮询（终态/超时自动停止；onStale 悬挂告警）
  watchRun,
  // 是否已在轮询（IPC 重建时防重复挂载）
  isWatched: runId => watchers.has(runId),
  unwatch,
  unwatchChat
}
