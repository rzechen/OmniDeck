// OmniBuddy 问答文件变更记录：写工具执行前后内容采集 + 行级 diff
// 参考 autonomous-agent AuditService 的做法：工具执行时实时计算 diff
//（difflib 思路，不依赖 git / 检查点快照），随 tool_end 落盘并下发前端，
// 在问答的工具卡片中呈现「+N / -N」与双列对比视图。
const fs = require('fs')
const path = require('path')

// ===== 执行前后采集 =====
// 参与变更记录的写工具（checkpoints.WRITE_TOOLS + append）
const CHANGE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'append', 'mkdir', 'delete'])

// 超过该体积分行逐行 diff（只记类型与行数摘要，防大文件卡顿）
const MAX_DIFF_BYTES = 512 * 1024
// 中间差异段行数上限：超过按整段替换处理（公共前后缀剥离后仍巨大时）
const MAX_MID_LINES = 2000
// 变更块上下文行数
const CONTEXT_LINES = 2

// toolCallId -> { abs, rel, existed, oldContent, tooLarge }
const pending = new Map()

// 相对工作空间显示（工作空间外用绝对路径）
function relDisplay(abs, workspaceDir) {
  if (workspaceDir && abs.startsWith(workspaceDir + path.sep)) {
    return abs.slice(workspaceDir.length + 1)
  }
  return abs
}

// 工具执行前：记录目标文件旧内容（不存在的文件 = 新建）
function beforeTool(toolCallId, toolName, args, workspaceDir) {
  if (!CHANGE_TOOLS.has(toolName) || !args || !args.path) return
  let abs
  try {
    const p = String(args.path)
    abs = path.isAbsolute(p) ? p : path.join(workspaceDir || process.cwd(), p)
  } catch (e) { return }
  const rec = { abs, rel: relDisplay(abs, workspaceDir), existed: false, oldContent: null, tooLarge: false }
  try {
    // 仅把「已存在的文件」视为旧内容来源（目录不算，mkdir 目标目录存在与否由 afterTool 判定）
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      rec.existed = true
      const size = fs.statSync(abs).size
      if (size > MAX_DIFF_BYTES) rec.tooLarge = true
      else rec.oldContent = fs.readFileSync(abs, 'utf-8')
    }
  } catch (e) { /* 读失败按不存在处理 */ }
  pending.set(toolCallId, rec)
}

// 读当前状态：{ file: bool（存在且是文件）, dir: bool（存在且是目录）, tooLarge, content }
function readCurrent(abs) {
  try {
    if (!fs.existsSync(abs)) return { file: false, dir: false }
    const stat = fs.statSync(abs)
    if (stat.isDirectory()) return { file: false, dir: true }
    if (stat.size > MAX_DIFF_BYTES) return { file: true, dir: false, tooLarge: true }
    return { file: true, dir: false, content: fs.readFileSync(abs, 'utf-8') }
  } catch (e) {
    return { file: false, dir: false }
  }
}

// ===== 行级 diff（公共前后缀剥离 + 中间段 LCS，超大段退化为整段替换） =====

// 中间段 LCS：产出 op 序列 [{op:'eq'|'del'|'add', text}]（段行数受 MAX_MID_LINES 保护）
function lcsMid(oldLines, newLines) {
  const n = oldLines.length
  const m = newLines.length
  // DP 表（行数已被上限保护，O(n*m) 可控）
  const dp = []
  for (let i = 0; i <= n; i++) dp.push(new Uint32Array(m + 1))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }
  const ops = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ op: 'eq', text: oldLines[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ op: 'del', text: oldLines[i] })
      i++
    } else {
      ops.push({ op: 'add', text: newLines[j] })
      j++
    }
  }
  while (i < n) { ops.push({ op: 'del', text: oldLines[i] }); i++ }
  while (j < m) { ops.push({ op: 'add', text: newLines[j] }); j++ }
  return ops
}

// 全量 diff：前后缀剥离 → 中间段（超限整段替换）→ op 序列
function diffLines(oldText, newText) {
  const a = String(oldText || '').split('\n')
  const b = String(newText || '').split('\n')
  // 公共前缀
  let pre = 0
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++
  // 公共后缀（不与前缀重叠）
  let suf = 0
  while (suf < a.length - pre && suf < b.length - pre &&
    a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++
  const midA = a.slice(pre, a.length - suf)
  const midB = b.slice(pre, b.length - suf)
  const ops = []
  for (let k = 0; k < pre; k++) ops.push({ op: 'eq', text: a[k] })
  if (midA.length > MAX_MID_LINES || midB.length > MAX_MID_LINES) {
    // 超大中间段：整段替换（保证 added/removed 计数正确，粒度变粗）
    midA.forEach(t => ops.push({ op: 'del', text: t }))
    midB.forEach(t => ops.push({ op: 'add', text: t }))
  } else {
    lcsMid(midA, midB).forEach(o => ops.push(o))
  }
  for (let k = a.length - suf; k < a.length; k++) ops.push({ op: 'eq', text: a[k] })
  return ops
}

// op 序列 → 结构化 DiffRow[]（hunk 收敛：变更块 ±CONTEXT_LINES 上下文）
// Row = { type:'header'|'context'|'add'|'del', left:{n,text}|null, right:{n,text}|null }
function buildRows(ops) {
  const keep = new Array(ops.length).fill(false)
  ops.forEach((o, idx) => {
    if (o.op !== 'eq') {
      for (let k = Math.max(0, idx - CONTEXT_LINES); k <= Math.min(ops.length - 1, idx + CONTEXT_LINES); k++) {
        keep[k] = true
      }
    }
  })
  const rows = []
  let ln = 0 // 旧行号
  let rn = 0 // 新行号
  // 先给全部 op 标行号，再按 keep 收敛输出
  const numbered = ops.map(o => {
    const item = { op: o.op, text: o.text, ln: null, rn: null }
    if (o.op === 'del') { ln++; item.ln = ln }
    else if (o.op === 'add') { rn++; item.rn = rn }
    else { ln++; rn++; item.ln = ln; item.rn = rn }
    return item
  })
  let idx = 0
  while (idx < numbered.length) {
    if (!keep[idx]) {
      // 跳过未保留段：若前后都有保留内容，输出 hunk header（@@ -l,c +l,c @@）
      let next = idx
      while (next < numbered.length && !keep[next]) next++
      if (next < numbered.length && rows.length) {
        const h = numbered[next]
        const oldStart = h.op === 'add' ? (h.ln || ln) : (h.ln || ln + 1)
        const newStart = h.op === 'del' ? (h.rn || rn) : (h.rn || rn + 1)
        rows.push({ type: 'header', text: '@@ -' + oldStart + ' +' + newStart + ' @@', left: null, right: null })
      }
      idx = next
      continue
    }
    const it = numbered[idx]
    if (it.op === 'del') {
      rows.push({ type: 'del', left: { n: it.ln, text: it.text }, right: null })
    } else if (it.op === 'add') {
      rows.push({ type: 'add', left: null, right: { n: it.rn, text: it.text } })
    } else {
      rows.push({ type: 'context', left: { n: it.ln, text: it.text }, right: { n: it.rn, text: it.text } })
    }
    idx++
  }
  return rows
}

// 工具执行后：对比新旧内容，产出变更记录（失败的工具调用不产生变更）
// 返回 null = 无变更（非写工具 / 执行失败 / 内容未变）；其余返回：
// { file, type: 'created'|'modified'|'deleted'|'mkdir', added, removed, rows, truncated }
function afterTool(toolCallId, isError) {
  const rec = pending.get(toolCallId)
  pending.delete(toolCallId)
  if (!rec || isError) return null
  const cur = readCurrent(rec.abs)

  if (!rec.existed) {
    if (cur.dir) {
      // 目录新建（mkdir，含已存在目录的幂等调用）：无内容 diff
      return { file: rec.rel, type: 'mkdir', added: 0, removed: 0, rows: [], truncated: false }
    }
    if (!cur.file) {
      // 目标仍不存在且非目录：写失败但未报错等异常场景，不产生变更
      return null
    }
    // 新建文件：全 add
    if (cur.tooLarge) {
      return { file: rec.rel, type: 'created', added: -1, removed: 0, rows: [], truncated: true }
    }
    const ops = diffLines('', cur.content)
    const added = ops.filter(o => o.op === 'add').length
    return { file: rec.rel, type: 'created', added, removed: 0, rows: buildRows(ops), truncated: false }
  }

  if (!cur.file && !cur.dir) {
    // 删除：全 del
    const removed = rec.tooLarge ? -1 : String(rec.oldContent || '').split('\n').length
    return { file: rec.rel, type: 'deleted', added: 0, removed, rows: [], truncated: rec.tooLarge }
  }

  // 修改（含超限场景；文件被目录替换的极端情况按超限处理）
  if (rec.tooLarge || cur.tooLarge || cur.dir) {
    return { file: rec.rel, type: 'modified', added: -1, removed: -1, rows: [], truncated: true }
  }
  if (rec.oldContent === cur.content) {
    return null // 内容未变（如 edit 未匹配时的空跑）
  }
  const ops = diffLines(rec.oldContent, cur.content)
  const added = ops.filter(o => o.op === 'add').length
  const removed = ops.filter(o => o.op === 'del').length
  return { file: rec.rel, type: 'modified', added, removed, rows: buildRows(ops), truncated: false }
}

module.exports = {
  // 工具执行前采集目标文件旧内容（非写工具忽略）
  beforeTool,
  // 工具执行后产出变更记录（无变更返回 null）
  afterTool,
  // 参与变更记录的写工具名单
  CHANGE_TOOLS,
  // 行级 diff：新旧文本 → op 序列（eq / del / add）
  diffLines,
  // op 序列 → 结构化 DiffRow[]（hunk 收敛，双列视图消费）
  buildRows
}
