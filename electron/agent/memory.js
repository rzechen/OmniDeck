// OmniBuddy 记忆管理（P1-8 增强）：pi-memory 记忆文件的读写与就绪状态检查
// 记忆为 agentDir/memory 下的纯 markdown（MEMORY.md / SCRATCHPAD.md / daily/*.md），
// 恢复记录 recovery/*.json 只读展示；写入后触发 qmd 增量索引（fire-and-forget）。
// 与 pi.js 的 setupMemoryExtension 配套：本模块只做文件与 CLI 操作，不装载扩展。
const path = require('path')
const fs = require('fs')
const { execFile } = require('child_process')

const MAX_READ = 2 * 1024 * 1024 // 读取上限 2MB

let agentDir = ''

function init(dir) {
  agentDir = dir
}

function memoryDir() {
  return path.join(agentDir, 'memory')
}

// pi-memory 是否已在 settings.json 的 packages 注册（应用启动时自动安装）
function extensionInstalled() {
  try {
    const settings = JSON.parse(fs.readFileSync(path.join(agentDir, 'settings.json'), 'utf-8'))
    return (Array.isArray(settings.packages) ? settings.packages : [])
      .some(p => String(p).indexOf('pi-memory') >= 0)
  } catch (e) {
    return false
  }
}

// 相对路径安全解析：限制在 memory 目录内（防路径穿越），越界返回 null
function safeFile(rel) {
  const p = path.resolve(memoryDir(), String(rel || ''))
  if (p !== memoryDir() && !p.startsWith(memoryDir() + path.sep)) return null
  return p
}

// ===== 文件清单 =====

function entryOf(p, rel, kind) {
  const stat = fs.statSync(p)
  return {
    kind,
    path: rel.split(path.sep).join('/'), // 统一为 / 分隔（回传渲染进程）
    name: path.basename(rel),
    size: stat.size,
    mtime: stat.mtime.toISOString()
  }
}

// ===== 长期记忆分型解析（对齐 CoALA：preference / semantic / episodic） =====
// pi-memory 的条目书写约定：时间戳注释行（<!-- ... [id] -->）+ 条目行
//（- #tag 内容 / #tag 内容）；历史标签（#fact/#decision/#lesson/#history）
// 与未打标签的列表行按零迁移原则归一到三型（fact/decision/lesson→semantic，
// history→episodic，无标签→semantic）
const TAG_ALIAS = {
  preference: 'preference',
  semantic: 'semantic', fact: 'semantic', decision: 'semantic', lesson: 'semantic',
  episodic: 'episodic', history: 'episodic', event: 'episodic'
}

// 单行条目匹配：返回 { id, type, content } 或 null（lineIdx 供无注释 id 兜底）
// 裸 #tag 行仅当 tag 在归一表内才视为条目（避免把 markdown 英文标题误判）
function matchEntryLine(line, lineIdx, pendingId) {
  const s = line.trim()
  const m = s.match(/^(?:-\s*)?#([a-zA-Z_]+)\s*(.*)$/)
  if (m) {
    const type = TAG_ALIAS[m[1].toLowerCase()]
    if (type) {
      const content = (m[2] || '').trim()
      if (content) return { id: pendingId || 'line-' + lineIdx, type, content }
    }
    return null
  }
  const plain = s.match(/^-\s+(.+)$/)
  if (plain && plain[1].trim()) {
    return { id: pendingId || 'line-' + lineIdx, type: 'semantic', content: plain[1].trim() }
  }
  return null
}

// 解析 MEMORY.md 全部条目（含绑定的时间戳），顺序即文件顺序
function parseEntries(content) {
  const lines = String(content || '').split('\n')
  const entries = []
  let pendingStamp = ''
  let pendingId = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('<!--')) {
      const stamp = line.match(/^<!--\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})\s*(?:\[([a-z0-9-]+)\])?/i)
      pendingStamp = stamp ? stamp[1] : ''
      pendingId = (stamp && stamp[2]) ? stamp[2] : ''
      continue
    }
    const e = matchEntryLine(line, i, pendingId)
    if (e) {
      entries.push({ id: e.id, type: e.type, content: e.content, ts: pendingStamp })
      pendingStamp = ''
      pendingId = ''
    }
  }
  return entries
}

// 记忆文件清单：长期记忆 / 草稿板 / 每日日志（倒序）/ 恢复记录（倒序）
// MEMORY.md / SCRATCHPAD.md 不存在时也占位返回（exists: false），供前端展示与新建
function list() {
  const dir = memoryDir()
  const files = []

  // 长期记忆与草稿板（固定两个入口）
  for (const [kind, name] of [['long_term', 'MEMORY.md'], ['scratchpad', 'SCRATCHPAD.md']]) {
    const p = path.join(dir, name)
    if (fs.existsSync(p)) files.push(Object.assign(entryOf(p, name, kind), { exists: true }))
    else files.push({ kind, path: name, name, size: 0, mtime: '', exists: false })
  }

  // 每日日志：daily/*.md 按日期倒序
  const dailyDir = path.join(dir, 'daily')
  if (fs.existsSync(dailyDir)) {
    fs.readdirSync(dailyDir)
      .filter(f => f.endsWith('.md'))
      .sort((a, b) => b.localeCompare(a))
      .forEach(f => files.push(Object.assign(entryOf(path.join(dailyDir, f), 'daily/' + f, 'daily'), { exists: true })))
  }

  // 恢复记录：recovery/*.json 倒序（memory_forget 的可还原载荷，只读）
  const recoveryDir = path.join(dir, 'recovery')
  if (fs.existsSync(recoveryDir)) {
    fs.readdirSync(recoveryDir)
      .filter(f => f.endsWith('.json'))
      .sort((a, b) => b.localeCompare(a))
      .forEach(f => files.push(Object.assign(entryOf(path.join(recoveryDir, f), 'recovery/' + f, 'recovery'), { exists: true })))
  }

  // 长期记忆分型视图：结构化条目 + 三型统计（供前端类型筛选与单条管理）
  let entries = []
  try {
    entries = parseEntries(fs.readFileSync(path.join(dir, 'MEMORY.md'), 'utf-8'))
  } catch (e) { /* 文件不存在 */ }
  const byType = { preference: 0, semantic: 0, episodic: 0 }
  entries.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1 })

  return {
    ok: true,
    dir,
    installed: extensionInstalled(),
    files,
    longTerm: { entries, byType },
    stats: {
      longTermEntries: entries.length,
      dailyCount: files.filter(f => f.kind === 'daily').length,
      recoveryCount: files.filter(f => f.kind === 'recovery').length
    }
  }
}

// ===== 读写 =====

// 读取记忆文件内容（含 recovery JSON，供只读查看）
function read(rel) {
  const p = safeFile(rel)
  if (!p) return { ok: false, error: '非法的文件路径' }
  try {
    if (!fs.existsSync(p)) return { ok: true, path: rel, exists: false, content: '' }
    const stat = fs.statSync(p)
    if (stat.size > MAX_READ) return { ok: false, error: '文件超过 2MB，请在文件管理器中查看' }
    return { ok: true, path: rel, exists: true, content: fs.readFileSync(p, 'utf-8') }
  } catch (e) {
    return { ok: false, error: '读取失败：' + e.message }
  }
}

// 保存记忆文件：仅允许 .md（recovery 恢复数据只读保护）；
// 内容清空保存 = 删除该文件（与项目规则页约定一致）；写后触发 qmd 增量索引
function write(rel, content) {
  const p = safeFile(rel)
  if (!p) return { ok: false, error: '非法的文件路径' }
  if (!p.endsWith('.md')) return { ok: false, error: '仅支持编辑 Markdown 记忆文件（恢复记录只读）' }
  const text = String(content || '')
  try {
    if (!text.trim()) {
      if (fs.existsSync(p)) fs.rmSync(p, { force: true })
      qmdUpdate()
      return { ok: true, removed: true }
    }
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, text)
    qmdUpdate()
    return { ok: true, file: p }
  } catch (e) {
    return { ok: false, error: '保存失败：' + e.message }
  }
}

// 删除单条长期记忆：按条目 id 定位行（及其绑定的上方时间戳注释行）后整组移除，
// 重写经 write()（复用安全校验 + qmd 索引 + 空文件即删的约定）
function removeEntry(entryId) {
  const p = safeFile('MEMORY.md')
  if (!p) return { ok: false, error: '非法的文件路径' }
  if (!fs.existsSync(p)) return { ok: false, error: '记忆文件不存在' }
  const lines = fs.readFileSync(p, 'utf-8').split('\n')
  let stampIdx = -1
  let targetIdx = -1
  let pendingId = ''
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()
    if (line.startsWith('<!--')) {
      const stamp = line.match(/^<!--\s*\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}\s*(?:\[([a-z0-9-]+)\])?/i)
      pendingId = (stamp && stamp[1]) ? stamp[1] : ''
      stampIdx = i
      continue
    }
    const e = matchEntryLine(line, i, pendingId)
    if (e && e.id === String(entryId || '')) {
      targetIdx = i
      break
    }
    if (e) {
      stampIdx = -1
      pendingId = ''
    }
  }
  if (targetIdx < 0) return { ok: false, error: '未找到该记忆条目' }
  const drop = new Set([targetIdx])
  if (stampIdx >= 0) drop.add(stampIdx)
  const next = lines.filter((_l, i) => !drop.has(i)).join('\n')
  const r = write('MEMORY.md', next)
  return r.ok ? { ok: true, removed: r.removed === true } : r
}

// ===== qmd 检索引擎状态 =====
// 执行 qmd 子命令（Windows 的 .cmd shim 须经 shell 调用）
function runQmd(args, timeout) {
  return new Promise((resolve) => {
    try {
      execFile('qmd', args, {
        timeout: timeout || 8000,
        windowsHide: true,
        shell: process.platform === 'win32'
      }, (err, stdout, stderr) => {
        resolve({ ok: !err, code: err ? (err.code || 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') })
      })
    } catch (e) {
      resolve({ ok: false, code: -1, stdout: '', stderr: e.message })
    }
  })
}

// 写入后的增量索引：fire-and-forget，失败静默（下次会话 pi-memory 自行补齐）
function qmdUpdate() {
  runQmd(['update'], 15000).then(() => runQmd(['embed'], 60000)).catch(() => {})
}

// 记忆就绪状态：扩展注册 / 记忆目录 / qmd 与 pi-memory collection / 内容统计
async function status() {
  const dir = memoryDir()
  const res = {
    ok: true,
    installed: extensionInstalled(),
    dir,
    dirExists: fs.existsSync(dir),
    qmd: { available: false, collection: false }
  }

  // qmd 可用性：--version 探测；可用再看 collection 是否登记 pi-memory
  const ver = await runQmd(['--version'], 5000)
  if (ver.ok) {
    res.qmd.available = true
    res.qmd.version = ver.stdout.trim().split('\n')[0]
    const cols = await runQmd(['collection', 'list'], 8000)
    res.qmd.collection = cols.ok && cols.stdout.indexOf('pi-memory') >= 0
  }

  const info = list()
  res.stats = info.stats
  return res
}

// ===== 导出记忆（Markdown 汇总单文件） =====
// 长期记忆 / 草稿板 / 每日日志按分组拼接；recovery 为内部恢复载荷不导出。
// 保存对话框（默认下载目录），与 export.js 的会话导出同模式
async function exportMemory() {
  const { app, dialog } = require('electron')
  const info = list()
  const exportable = info.files.filter(f => f.exists && f.kind !== 'recovery')
  if (!exportable.length) return { ok: false, error: '暂无可导出的记忆' }

  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`

  const lines = ['# OmniDeck 记忆导出', '']
  lines.push(`> 导出时间 ${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())} · 长期记忆 ${info.stats.longTermEntries} 条 · 日志 ${info.stats.dailyCount} 天`, '')
  const sections = [
    ['long_term', '## 长期记忆', ''],
    ['scratchpad', '## 草稿板', ''],
    ['daily', '## 每日日志', '### ']
  ]
  for (const [kind, heading, sub] of sections) {
    const items = exportable.filter(f => f.kind === kind)
    if (!items.length) continue
    lines.push(heading, '')
    for (const f of items) {
      if (sub) lines.push(sub + f.name.replace(/\.md$/, ''), '')
      try {
        lines.push(fs.readFileSync(path.join(memoryDir(), f.path), 'utf-8'), '')
      } catch (e) { /* 单文件读取失败跳过 */ }
    }
  }

  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: path.join(app.getPath('downloads'), `OmniDeck-记忆-${stamp}.md`),
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  })
  if (canceled || !filePath) return { ok: false, canceled: true }
  try {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8')
    return { ok: true, filePath }
  } catch (e) {
    return { ok: false, error: '导出失败：' + e.message }
  }
}

module.exports = { init, list, read, write, removeEntry, status, exportMemory, extensionInstalled, parseEntries }
