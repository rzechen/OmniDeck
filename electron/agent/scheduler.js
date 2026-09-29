// OmniBuddy 定时任务（P2 自动化）：任务 CRUD + 调度循环 + 模型配置快照
// 存储：userData/omnibuddy/automation/{tasks.json, provider-snapshot.json}
// 调度：30s tick；daily / weekly 两类周期；错过的任务 6 小时内启动补跑，更久则跳到下个周期
// 执行体由 agent/index.js 注入（无头会话创建 + pi 运行 + 结果落系统会话），
// 本模块只负责「何时跑」，不关心「怎么跑」
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

let dataDir = ''
let tasksFile = ''
let snapshotFile = ''
// index.js 注入的执行器：async (task, reason) => ({ ok, error, sessionId })
let runner = null
let tickTimer = null
// 运行中的任务 id（防同任务并发；手动与计划触发互斥）
const runningTasks = new Set()

// 启动补跑窗口：错过 <= 6h 的任务保留触发（启动后首个 tick 补跑），
// 更久的直接跳到下个周期（补跑多日前的日报没有意义）
const CATCHUP_WINDOW_MS = 6 * 3600 * 1000
const TICK_MS = 30 * 1000

function newId() {
  return 'ts-' + Date.now().toString(36) + '-' + crypto.randomBytes(3).toString('hex')
}

// ===== tasks.json 读写 =====
function readTasks() {
  try {
    const data = JSON.parse(fs.readFileSync(tasksFile, 'utf-8'))
    return Array.isArray(data.tasks) ? data.tasks : []
  } catch (e) {
    return []
  }
}

function writeTasks(list) {
  fs.mkdirSync(dataDir, { recursive: true })
  fs.writeFileSync(tasksFile, JSON.stringify({ tasks: list }, null, 2))
}

// ===== 周期定义 =====
// schedule:
//   { type: 'daily', time: 'HH:mm' }                                    固定时间
//   { type: 'daily', mode: 'random', timeStart: 'HH:mm', timeEnd: 'HH:mm' } 范围随机（每周期随机取点）
//   weekly 同上，另含 weekday: 0-6（周日为 0）
function parseTime(t) {
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(String(t || ''))
  if (!m) return [9, 0]
  return [Math.min(23, parseInt(m[1], 10)), Math.min(59, parseInt(m[2], 10))]
}

function normalizeSchedule(s) {
  const type = s && s.type === 'weekly' ? 'weekly' : 'daily'
  const pad = n => String(n).padStart(2, '0')
  const out = { type }
  if (type === 'weekly') {
    const wd = Number.isInteger(s.weekday) ? Math.min(6, Math.max(0, s.weekday)) : 1
    out.weekday = wd
  }
  // 范围随机模式：顺序颠倒自动交换；两端相同（退化为固定点）则按固定时间处理
  if (s && s.mode === 'random' && s.timeStart && s.timeEnd) {
    const [sh, sm] = parseTime(s.timeStart)
    const [eh, em] = parseTime(s.timeEnd)
    let a = sh * 60 + sm
    let b = eh * 60 + em
    if (a > b) { const t = a; a = b; b = t }
    if (b > a) {
      out.mode = 'random'
      out.timeStart = pad(Math.floor(a / 60)) + ':' + pad(a % 60)
      out.timeEnd = pad(Math.floor(b / 60)) + ':' + pad(b % 60)
      return out
    }
  }
  const [h, m] = parseTime(s && s.time)
  out.time = pad(h) + ':' + pad(m)
  return out
}

// 下次执行时间（from 起算的下一个周期点，不含 from 时刻本身）
// 范围随机模式：每次调度在 [timeStart, timeEnd] 分钟内随机取一个时间点，
// 每个周期（含跨周期顺延重算）都重新随机，避免固定时间点被识别
function computeNextRun(schedule, from) {
  const d = new Date(from)
  if (schedule.mode === 'random') {
    const [sh, sm] = parseTime(schedule.timeStart)
    const [eh, em] = parseTime(schedule.timeEnd)
    const start = sh * 60 + sm
    const end = eh * 60 + em
    const r = start + Math.floor(Math.random() * (end - start + 1))
    d.setHours(Math.floor(r / 60), r % 60, 0, 0)
  } else {
    const [h, m] = parseTime(schedule.time)
    d.setHours(h, m, 0, 0)
  }
  if (schedule.type === 'weekly') {
    let delta = (Number(schedule.weekday || 0) - d.getDay() + 7) % 7
    if (delta === 0 && d.getTime() <= from) delta = 7
    d.setDate(d.getDate() + delta)
  } else {
    if (d.getTime() <= from) d.setDate(d.getDate() + 1)
  }
  return d.getTime()
}

// ===== 初始化（registerOmnibuddyIpc 内调用） =====
function init(baseDir) {
  dataDir = path.join(baseDir, 'automation')
  fs.mkdirSync(dataDir, { recursive: true })
  tasksFile = path.join(dataDir, 'tasks.json')
  snapshotFile = path.join(dataDir, 'provider-snapshot.json')

  // 启动补跑判定：错过窗口外的直接顺延到下个周期
  const list = readTasks()
  const now = Date.now()
  let changed = false
  for (const t of list) {
    if (t.enabled && t.nextRunAt && t.nextRunAt < now && now - t.nextRunAt > CATCHUP_WINDOW_MS) {
      t.nextRunAt = computeNextRun(t.schedule, now)
      changed = true
    }
  }
  if (changed) writeTasks(list)

  if (tickTimer) clearInterval(tickTimer)
  tickTimer = setInterval(tick, TICK_MS)
  if (tickTimer.unref) tickTimer.unref()
  console.log('[omnibuddy:scheduler] 已启动（任务 ' + list.length + ' 个）')
}

function stop() {
  if (tickTimer) {
    clearInterval(tickTimer)
    tickTimer = null
  }
}

// ===== 任务 CRUD =====
// payload: { name, scenario, prompt, schedule, workspaceId, notify }
// 校验必填：name / prompt / schedule / workspaceId
function validatePayload(p) {
  if (!p) return '参数缺失'
  if (!String(p.name || '').trim()) return '请填写任务名称'
  if (!String(p.prompt || '').trim()) return '请填写任务指令'
  if (!p.workspaceId) return '请选择工作空间'
  const sch = p.schedule || {}
  const timeOk = sch.mode === 'random'
    ? !!(sch.timeStart && sch.timeEnd)
    : !!sch.time
  if (!timeOk) return '请选择执行时间'
  return ''
}

function createTask(payload) {
  const err = validatePayload(payload)
  if (err) return { ok: false, error: err }
  const schedule = normalizeSchedule(payload.schedule)
  const task = {
    id: newId(),
    name: String(payload.name).trim().slice(0, 40),
    scenario: String(payload.scenario || 'custom'),
    prompt: String(payload.prompt).trim(),
    schedule,
    workspaceId: String(payload.workspaceId),
    notify: payload.notify !== false,
    enabled: true,
    createdAt: Date.now(),
    lastRun: null,
    nextRunAt: computeNextRun(schedule, Date.now())
  }
  const list = readTasks()
  list.push(task)
  writeTasks(list)
  return { ok: true, task }
}

// patch 可改：name / prompt / schedule / workspaceId / notify / enabled / scenario
// schedule 变化时重算 nextRunAt；重新启用时也重算
function updateTask(id, patch) {
  const list = readTasks()
  const t = list.find(x => x.id === id)
  if (!t) return { ok: false, error: '任务不存在' }
  if (patch.name !== undefined) {
    if (!String(patch.name).trim()) return { ok: false, error: '任务名称不能为空' }
    t.name = String(patch.name).trim().slice(0, 40)
  }
  if (patch.scenario !== undefined) t.scenario = String(patch.scenario || 'custom')
  if (patch.prompt !== undefined) {
    if (!String(patch.prompt).trim()) return { ok: false, error: '任务指令不能为空' }
    t.prompt = String(patch.prompt).trim()
  }
  if (patch.workspaceId !== undefined) {
    if (!patch.workspaceId) return { ok: false, error: '请选择工作空间' }
    t.workspaceId = String(patch.workspaceId)
  }
  if (patch.notify !== undefined) t.notify = !!patch.notify
  if (patch.schedule !== undefined && patch.schedule &&
    (patch.schedule.time || (patch.schedule.mode === 'random' && patch.schedule.timeStart && patch.schedule.timeEnd))) {
    t.schedule = normalizeSchedule(patch.schedule)
  }
  if (patch.enabled !== undefined) t.enabled = !!patch.enabled

  if (runningTasks.has(id)) return { ok: false, error: '任务正在运行中，请稍后再改' }

  // 周期变化 / 重新启用：重算下次执行；停用清零（tick 跳过）
  if (!t.enabled) {
    t.nextRunAt = 0
  } else {
    t.nextRunAt = computeNextRun(t.schedule, Date.now())
  }
  writeTasks(list)
  return { ok: true, task: t }
}

function deleteTask(id) {
  if (runningTasks.has(id)) return { ok: false, error: '任务正在运行中，无法删除' }
  const list = readTasks()
  const next = list.filter(t => t.id !== id)
  if (next.length === list.length) return { ok: false, error: '任务不存在' }
  writeTasks(next)
  return { ok: true }
}

function listTasks() {
  return readTasks()
}

// ===== 执行 =====
function setRunner(fn) {
  runner = fn
}

// 单任务执行（手动 / 计划共用）：运行中互斥，完成后写 lastRun + 重算 nextRunAt
async function runTask(task, reason) {
  if (!runner) return { ok: false, error: '执行器未就绪' }
  if (runningTasks.has(task.id)) return { ok: false, error: '任务正在运行中' }
  runningTasks.add(task.id)
  console.log('[omnibuddy:scheduler] 任务启动：' + task.name + '（' + reason + '）')
  let result = null
  try {
    result = await runner(task, reason)
  } catch (e) {
    result = { ok: false, error: (e && e.message) || String(e) }
  } finally {
    runningTasks.delete(task.id)
  }
  // 记录执行结果（任务可能已被删除，找不到则跳过）
  const list = readTasks()
  const t = list.find(x => x.id === task.id)
  if (t) {
    t.lastRun = {
      at: Date.now(),
      ok: !!(result && result.ok),
      sessionId: (result && result.sessionId) || '',
      error: (result && result.error) || '',
      reason
    }
    t.nextRunAt = t.enabled ? computeNextRun(t.schedule, Date.now()) : 0
    writeTasks(list)
  }
  console.log('[omnibuddy:scheduler] 任务结束：' + task.name +
    (result && result.ok ? '（成功）' : '（失败：' + ((result && result.error) || '?') + '）'))
  return result
}

// 手动「立即运行」（IPC）
async function runNow(id) {
  const t = readTasks().find(x => x.id === id)
  if (!t) return { ok: false, error: '任务不存在' }
  return runTask(t, 'manual')
}

// 调度 tick：到期即触发（异步执行不阻塞；同任务互斥由 runTask 保证）
function tick() {
  try {
    const now = Date.now()
    for (const t of readTasks()) {
      if (!t.enabled || !t.nextRunAt || t.nextRunAt > now) continue
      if (runningTasks.has(t.id)) continue
      runTask(t, 'schedule').catch(e =>
        console.warn('[omnibuddy:scheduler] tick 执行异常：', (e && e.message) || e))
    }
  } catch (e) {
    console.warn('[omnibuddy:scheduler] tick 异常：', (e && e.message) || e)
  }
}

// ===== 模型配置快照 =====
// 定时任务无头运行时无法读取渲染进程 IndexedDB 的供应商列表，
// 每次普通对话发送成功时把当前 provider 完整配置落到主进程快照文件，
// 任务运行时使用「最近一次对话所用模型」
function updateProviderSnapshot(provider) {
  if (!provider || !provider.baseUrl || !provider.model) return
  try {
    fs.writeFileSync(snapshotFile, JSON.stringify({
      id: provider.id || '',
      name: provider.name || '',
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey || '',
      model: provider.model,
      savedAt: Date.now()
    }, null, 2))
  } catch (e) {
    console.warn('[omnibuddy:scheduler] 模型快照写入失败：', e.message)
  }
}

function getProviderSnapshot() {
  try {
    return JSON.parse(fs.readFileSync(snapshotFile, 'utf-8'))
  } catch (e) {
    return null
  }
}

function isTaskRunning(id) {
  return runningTasks.has(id)
}

module.exports = {
  init,
  stop,
  setRunner,
  listTasks,
  createTask,
  updateTask,
  deleteTask,
  runNow,
  isTaskRunning,
  updateProviderSnapshot,
  getProviderSnapshot
}
