// 用量统计（N4 / §18.2）：独立流水账本（append-only JSONL）聚合三维数据
// 账本：<agentDir>/usage.jsonl，每行 { ts, sessionId, title, model, input, output }
// title 为记账时会话标题快照：会话删除后统计仍能显示任务名称（已删除标识）
// 写入：assistant 回复落盘时（index.js assistant_end）同步记一笔；
// 删除会话 / 解绑工作空间不触碰账本 —— 历史用量与任务记录解耦，删除不再清零。
// 首次启动迁移：扫描现存会话 messages.jsonl 的 usage 一次性转入账本（标记文件防重）。
// 聚合输出：按天（柱状图）/ 按任务 TOP5 / 按模型分布，全部主进程算好前端只渲染
const path = require('path')
const fs = require('fs')
const sessions = require('./sessions')

let ledgerFile = ''
let migratedMark = ''

function init(dir) {
  ledgerFile = path.join(dir, 'usage.jsonl')
  migratedMark = path.join(dir, '.usage-migrated')
  migrateOnce()
}

// 存量迁移（一次性）：现存会话消息里的 usage → 账本流水；此后统计只读账本
function migrateOnce() {
  try {
    if (fs.existsSync(migratedMark)) return
    for (const meta of sessions.listSessions()) {
      for (const m of sessions.getMessages(meta.id)) {
        if (m.usage && (m.usage.input || m.usage.output)) {
          appendLine({
            ts: m.createdAt || meta.updatedAt,
            sessionId: meta.id,
            title: meta.title || '未命名',
            model: m.model || '',
            input: m.usage.input || 0,
            output: m.usage.output || 0
          })
        }
      }
    }
    fs.writeFileSync(migratedMark, String(Date.now()))
  } catch (e) { /* 迁移失败不写标记，下次启动重试 */ }
}

function appendLine(entry) {
  fs.appendFileSync(ledgerFile, JSON.stringify(entry) + '\n')
}

// 记一笔（assistant 回复落盘处调用）；usage 形如 { input, output }
// title：记账时的会话标题快照（会话删除后统计仍可显示任务名）
function record(sessionId, model, usage, title) {
  if (!ledgerFile || !usage || !(usage.input || usage.output)) return
  try {
    appendLine({
      ts: Date.now(),
      sessionId,
      title: String(title || '').trim() || '未命名',
      model: model || '',
      input: usage.input || 0,
      output: usage.output || 0
    })
  } catch (e) { /* 记账失败不影响对话主链路 */ }
}

// 读全部流水（容错跳过损坏行，与 messages.jsonl 同策略）
function readLedger() {
  if (!ledgerFile || !fs.existsSync(ledgerFile)) return []
  const out = []
  for (const line of fs.readFileSync(ledgerFile, 'utf-8').split('\n')) {
    const t = line.trim()
    if (!t) continue
    try {
      const e = JSON.parse(t)
      if (e && e.ts) out.push(e)
    } catch (err) { /* 跳过损坏行 */ }
  }
  return out
}

// 单价：providers 页 cost 字段（元 / 百万 token）；未配置按 0 估
// models.json 的 cost 结构 { input, output }（每百万 token 单价，元）
function costOf(entry, cost) {
  const cin = (cost && Number(cost.input)) || 0
  const cout = (cost && Number(cost.output)) || 0
  return (entry.input || 0) / 1e6 * cin + (entry.output || 0) / 1e6 * cout
}

function dayKey(ts) {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// 会话名映射：会话仍在则取实时标题；已删除（会话目录被清）显示占位名
function titleMap() {
  const titles = new Map()
  for (const meta of sessions.listSessions()) {
    titles.set(meta.id, meta.title || '未命名')
  }
  return titles
}

// 汇总入口：range 天数（默认 30），costs 为模型名 -> { input, output } 单价映射
function summarize({ days = 30, costs = {} } = {}) {
  const now = Date.now()
  const from = now - days * 24 * 3600 * 1000

  const byDay = {}          // 'YYYY-MM-DD' -> { input, output, cost }
  const bySession = {}      // sessionId -> { title, deleted, input, output, cost, updatedAt }
  const byModel = {}        // modelName -> { input, output, cost }
  const titles = titleMap()

  for (const e of readLedger()) {
    // 流水时间落在统计窗口外则跳过（会话级累计亦按窗口，口径一致）
    if (e.ts < from) continue
    const cost = costOf(e, costs[e.model])
    const dk = dayKey(e.ts)
    if (!byDay[dk]) byDay[dk] = { input: 0, output: 0, cost: 0 }
    byDay[dk].input += e.input || 0
    byDay[dk].output += e.output || 0
    byDay[dk].cost += cost
    const mk = e.model || '未知模型'
    if (!byModel[mk]) byModel[mk] = { input: 0, output: 0, cost: 0 }
    byModel[mk].input += e.input || 0
    byModel[mk].output += e.output || 0
    byModel[mk].cost += cost
    const sk = e.sessionId || ''
    if (!bySession[sk]) {
      // 会话仍在 → 实时标题；已删除 → 账本快照标题（无快照的旧流水兜底「已删除任务」）
      const alive = titles.get(sk)
      bySession[sk] = {
        id: sk,
        title: alive || e.title || '已删除任务',
        deleted: !alive,
        input: 0,
        output: 0,
        cost: 0,
        updatedAt: 0
      }
    } else if (titles.get(sk)) {
      // 会话仍在：后续流水若带旧快照标题，仍以实时标题为准
      bySession[sk].title = titles.get(sk)
      bySession[sk].deleted = false
    }
    bySession[sk].input += e.input || 0
    bySession[sk].output += e.output || 0
    bySession[sk].cost += cost
    bySession[sk].updatedAt = Math.max(bySession[sk].updatedAt, e.ts)
  }

  // 天序列补零（窗口内连续日期，图表 x 轴）
  const daily = []
  for (let i = days - 1; i >= 0; i--) {
    const dk = dayKey(now - i * 24 * 3600 * 1000)
    const d = byDay[dk] || { input: 0, output: 0, cost: 0 }
    daily.push({ day: dk.slice(5), input: d.input, output: d.output, cost: d.cost })
  }

  const top5 = Object.values(bySession).sort((a, b) => b.cost - a.cost || (b.input + b.output) - (a.input + a.output)).slice(0, 5)
  const models = Object.entries(byModel)
    .map(([name, v]) => Object.assign({ name }, v))
    .sort((a, b) => (b.input + b.output) - (a.input + a.output))

  // 今日合计（看板顶部数字）
  const today = daily[daily.length - 1] || { input: 0, output: 0, cost: 0 }
  const total = daily.reduce((acc, d) => ({
    input: acc.input + d.input,
    output: acc.output + d.output,
    cost: acc.cost + d.cost
  }), { input: 0, output: 0, cost: 0 })

  return {
    ok: true,
    today,
    total,
    daily,
    top5,
    models,
    sessionCount: Object.keys(bySession).length,
    generatedAt: Date.now()
  }
}

// 导出 CSV：按任务明细（用量看板「导出 CSV」）；已删除任务显示账本快照名
function exportCsv() {
  const rows = [['任务', '输入 token', '输出 token', '成本(元)', '最后更新']]
  const titles = titleMap()
  const agg = new Map() // sessionId -> { title, input, output, updatedAt }
  for (const e of readLedger()) {
    let a = agg.get(e.sessionId)
    if (!a) {
      a = { title: titles.get(e.sessionId) || e.title || '已删除任务', input: 0, output: 0, updatedAt: 0 }
      agg.set(e.sessionId, a)
    } else if (titles.get(e.sessionId)) {
      a.title = titles.get(e.sessionId)
    }
    a.input += e.input || 0
    a.output += e.output || 0
    a.updatedAt = Math.max(a.updatedAt, e.ts)
  }
  for (const [sid, a] of agg) {
    if (!a.input && !a.output) continue
    const name = titles.get(sid) ? a.title : a.title + '（已删除）'
    rows.push([
      '"' + String(name).replace(/"/g, '""') + '"',
      a.input, a.output, '0.0000',
      new Date(a.updatedAt).toLocaleString('zh-CN')
    ])
  }
  return rows.map(r => r.join(',')).join('\n')
}

module.exports = { init, record, summarize, exportCsv }
