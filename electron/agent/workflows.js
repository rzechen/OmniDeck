// OmniBuddy 深度研究（P3）：workflow 运行状态读取与轮询
// pi-dynamic-workflows 将运行状态持久化到
//   ~/.pi/workflows/projects/<slug>-<hash12>/runs/<runId>.json（head 文件）
// head 为单 JSON（format: pi-workflow-run-v2），index 含路由/状态/用量等小字段，
// summary 含代理计数/运行中标签/checkpoint 概要 —— 正是进度卡片所需的全量数据，
// 无需 hydrate 完整 events 日志（<runId>.json.events.jsonl）。
// 兼容旧版格式：head 之前的历史文件为完整 PersistedRunState JSON（含 runId 键）。
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'aborted'])
const POLL_INTERVAL_MS = 1000
const MAX_ACTIVE_LABELS = 6
// 轮询兜底上限：背景运行挂死（如权限悬挂）时避免无限轮询（与自动化 15 分钟对齐）
const MAX_WATCH_MS = 15 * 60 * 1000
// head 连续缺失次数上限：run 文件始终未出现（扩展启动运行失败等）时及早停止
const MAX_MISSES = 10

// ===== 路径复刻（pi-dynamic-workflows workflowProjectPaths） =====
function sanitizePathSegment(value) {
  const sanitized = value
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
  return sanitized || 'project'
}

function projectKey(cwd) {
  const resolved = path.resolve(cwd)
  const slug = sanitizePathSegment(path.basename(resolved) || 'project')
  const hash = crypto.createHash('sha256').update(resolved).digest('hex').slice(0, 12)
  return slug + '-' + hash
}

function runsDirOf(cwd) {
  const os = require('os')
  return path.join(os.homedir(), '.pi', 'workflows', 'projects', projectKey(cwd), 'runs')
}

// ===== 扩展安装状态（capabilities 能力清单动态标注用） =====
let agentDir = ''

// 记录 agent 目录（index.js 启动时接线，与 memory.init 同模式）
function init(dir) {
  agentDir = dir
}

// pi-dynamic-workflows 是否已注册（settings.json packages 含其名即视为已安装）
function extensionInstalled() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(agentDir, 'settings.json'), 'utf-8'))
    return (Array.isArray(settings.packages) ? settings.packages : [])
      .some(p => String(p).indexOf('pi-dynamic-workflows') >= 0)
  } catch (e) {
    return false
  }
}

// ===== head 读取与投影 =====
// 投影为精简快照（wire-safe，前端进度卡片直接消费）
function projectHead(head) {
  const index = head.index || {}
  const summary = head.summary || {}
  const counts = {
    total: summary.total || 0,
    done: summary.done || 0,
    running: summary.running || 0,
    queued: summary.queued || 0,
    error: summary.error || 0,
    skipped: summary.skipped || 0
  }
  const usage = summary.usage || {}
  return {
    runId: index.runId || '',
    name: index.workflowName || '',
    status: index.status || 'running',
    currentPhase: index.currentPhase || null,
    pauseReason: index.pauseReason || '',
    error: index.error || '',
    counts,
    activeLabels: (summary.activeLabels || []).slice(0, MAX_ACTIVE_LABELS),
    checkpoint: summary.checkpoint || null,
    tokenUsage: index.tokenUsage || {
      total: usage.total || 0,
      input: usage.input || 0,
      output: usage.output || 0
    },
    durationMs: index.durationMs || null,
    startedAt: index.startedAt || '',
    updatedAt: index.updatedAt || ''
  }
}

// 旧版完整状态（PersistedRunState）投影：字段名与 head 投影对齐
function projectLegacy(state) {
  const agents = Array.isArray(state.agents) ? state.agents : []
  const count = s => agents.filter(a => a && a.status === s).length
  return {
    runId: state.runId || '',
    name: state.workflowName || '',
    status: state.status || 'running',
    currentPhase: state.currentPhase || null,
    pauseReason: state.pauseReason || '',
    error: state.error || '',
    counts: {
      total: agents.length,
      done: count('done'),
      running: count('running'),
      queued: count('queued'),
      error: count('error'),
      skipped: count('skipped')
    },
    activeLabels: agents.filter(a => a && a.status === 'running')
      .map(a => a.label).slice(0, MAX_ACTIVE_LABELS),
    checkpoint: state.checkpoint
      ? { checkpointId: state.checkpoint.checkpointId, kind: state.checkpoint.kind, status: state.checkpoint.status }
      : null,
    tokenUsage: state.tokenUsage || null,
    durationMs: state.durationMs || null,
    startedAt: state.startedAt || '',
    updatedAt: state.updatedAt || ''
  }
}

// 单次读取 run 状态：成功返回快照，读不到（未落盘/已清理/损坏）返回 null
function statusOf(runId, cwd) {
  if (!runId || !cwd) return null
  const file = path.join(runsDirOf(cwd), runId + '.json')
  let raw = null
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch (e) { return null }
  try {
    const parsed = JSON.parse(raw)
    if (parsed && parsed.format === 'pi-workflow-run-v2') return projectHead(parsed)
    if (parsed && typeof parsed.runId === 'string') return projectLegacy(parsed)
    return null
  } catch (e) { return null }
}

// ===== 轮询 =====
// runId -> { timer, startedAt, chatId }；同 runId 重复 watch 幂等（沿用既有轮询）
const watchers = new Map()

function unwatch(runId) {
  const w = watchers.get(runId)
  if (!w) return
  clearInterval(w.timer)
  watchers.delete(runId)
}

// 会话销毁/中断时清理其全部轮询
function unwatchChat(chatId) {
  for (const [runId, w] of Array.from(watchers.entries())) {
    if (w.chatId === chatId) unwatch(runId)
  }
}

// 轮询 run 落盘状态并回调快照；进入终态（completed/failed/aborted）或超时后停止。
// onProgress(snapshot) 由调用方（index.js）转为 workflow_progress 事件下发前端。
function watchRun(runId, chatId, cwd, onProgress) {
  if (!runId || !cwd || typeof onProgress !== 'function') return
  if (watchers.has(runId)) return
  const startedAt = Date.now()
  let misses = 0
  const tick = () => {
    const snap = statusOf(runId, cwd)
    if (snap) {
      misses = 0
      try { onProgress(snap) } catch (e) { /* 回调失败不影响轮询 */ }
      if (TERMINAL_STATUSES.has(snap.status)) {
        unwatch(runId)
        return
      }
    } else {
      misses++
      // run 文件持续缺失：扩展未落盘（启动失败/被清理），及早收尾
      if (misses >= MAX_MISSES) {
        try {
          onProgress({ runId, name: '', status: 'failed', counts: {}, activeLabels: [], error: '运行状态不可用' })
        } catch (e) { /* 忽略 */ }
        unwatch(runId)
        return
      }
    }
    // 超时兜底：防背景运行挂死导致无限轮询
    if (Date.now() - startedAt > MAX_WATCH_MS) {
      try {
        onProgress(Object.assign(snap || { runId, counts: {} }, {
          status: 'failed',
          error: snap && snap.error ? snap.error : '运行超时'
        }))
      } catch (e) { /* 忽略 */ }
      unwatch(runId)
    }
  }
  watchers.set(runId, { timer: setInterval(tick, POLL_INTERVAL_MS), startedAt, chatId })
  tick() // 立即出首帧
}

function stopAll() {
  for (const runId of Array.from(watchers.keys())) unwatch(runId)
}

module.exports = {
  init,
  extensionInstalled,
  runsDirOf,
  statusOf,
  watchRun,
  unwatch,
  unwatchChat,
  stopAll
}
