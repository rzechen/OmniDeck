// 会话检查点（N4 / §18.3）：写操作工具执行前对工作空间 zip 快照，支持一键回滚
// - 触发：pi.js tool_execution_start，工具名 ∈ WRITE_TOOLS（write/edit/multi_edit/mkdir）
// - 快照：adm-zip 全量打包工作空间 → sessions/<id>/checkpoints/<n>.zip + index.json（消息分界）
// - LRU：每会话保留最近 10 个（磁盘删除旧的）
// - 回滚：解压覆盖工作空间 + messages.jsonl 截断到分界 + dispose 重建（index.js 调）
// - 守则：工作空间超 50MB 跳过快照（空间换正确性反例保护）；回滚前自动再做一次快照保证可反悔
const path = require('path')
const fs = require('fs')
const AdmZip = require('adm-zip')
const sessions = require('./sessions')

// 触发快照的写操作工具（pi 标准 tool 名）
const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'mkdir', 'delete'])
// 单目录体积上限（全量 zip 策略的保护阈值）
const MAX_DIR_BYTES = 50 * 1024 * 1024
// 每会话保留快照数
const KEEP = 10

let checkpointsRoot = '' // = sessionsRoot（快照在各会话目录内）

function init(sessionsRootPath) {
  checkpointsRoot = sessionsRootPath
}

function cpDir(sessionId) {
  return path.join(checkpointsRoot, sessionId, 'checkpoints')
}

function indexFile(sessionId) {
  return path.join(cpDir(sessionId), 'index.json')
}

function readIndex(sessionId) {
  try {
    return JSON.parse(fs.readFileSync(indexFile(sessionId), 'utf-8'))
  } catch (e) {
    return []
  }
}

function writeIndex(sessionId, list) {
  fs.mkdirSync(cpDir(sessionId), { recursive: true })
  fs.writeFileSync(indexFile(sessionId), JSON.stringify(list, null, 2))
}

// 递归统计目录字节数（超限/不可读返回 -1）
function dirSize(dir) {
  try {
    let total = 0
    const walk = d => {
      for (const en of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, en.name)
        if (en.isDirectory()) walk(p)
        else total += fs.statSync(p).size
      }
    }
    walk(dir)
    return total
  } catch (e) {
    return -1
  }
}

// 工具执行前调用：写工具 → 快照；返回 {ok, skipped?, reason?}
// messageOffset：当前 messages.jsonl 行数（回滚截断分界）
function snapshotBeforeTool(sessionId, workspaceDir, toolName, messageOffset) {
  if (!WRITE_TOOLS.has(toolName)) return { ok: true, skipped: true }
  if (!workspaceDir || !fs.existsSync(workspaceDir)) return { ok: true, skipped: true, reason: 'no-workspace' }
  if (!sessions.readMeta(sessionId)) return { ok: true, skipped: true, reason: 'no-session' }

  const size = dirSize(workspaceDir)
  if (size < 0 || size > MAX_DIR_BYTES) {
    return { ok: true, skipped: true, reason: size < 0 ? 'unreadable' : 'oversize' }
  }

  const list = readIndex(sessionId)
  const n = list.length ? list[list.length - 1].n + 1 : 1
  const zipPath = path.join(cpDir(sessionId), `${n}.zip`)

  try {
    const zip = new AdmZip()
    // 工作空间顶层条目打进去（解压回滚时先清空再解出，路径 = zip 内相对路径）
    zip.addLocalFolder(workspaceDir)
    fs.mkdirSync(cpDir(sessionId), { recursive: true })
    zip.writeZip(zipPath)
  } catch (e) {
    return { ok: false, error: '快照失败：' + e.message }
  }

  list.push({
    n,
    tool: toolName,
    messageOffset,
    // 快照时工作空间绑定（回滚校验目录仍一致）
    workspaceDir,
    createdAt: Date.now(),
    file: `${n}.zip`
  })
  // LRU：超过保留数删最旧
  while (list.length > KEEP) {
    const old = list.shift()
    try { fs.rmSync(path.join(cpDir(sessionId), old.file), { force: true }) } catch (e) { /* 忽略 */ }
  }
  writeIndex(sessionId, list)
  return { ok: true, n }
}

// 检查点列表（时间线倒序展示）
function listCheckpoints(sessionId) {
  const list = readIndex(sessionId)
    .map(c => Object.assign({}, c, {
      // zip 已丢失（被手动清理）标记
      missing: !fs.existsSync(path.join(cpDir(sessionId), c.file))
    }))
    .sort((a, b) => b.n - a.n)
  return { ok: true, items: list }
}

// 回滚：清空工作空间 → 解出快照 → messages.jsonl 截断
// 调用方（index.js IPC）负责 dispose 会话与前端刷新；此处先做「回滚前快照」保证可反悔
function rollback(sessionId, n, workspaceDirNow) {
  const list = readIndex(sessionId)
  const cp = list.find(c => c.n === n)
  if (!cp) return { ok: false, error: '检查点不存在' }
  const zipPath = path.join(cpDir(sessionId), cp.file)
  if (!fs.existsSync(zipPath)) return { ok: false, error: '快照文件已丢失' }

  const targetDir = workspaceDirNow || cp.workspaceDir
  if (!targetDir || !fs.existsSync(targetDir)) {
    return { ok: false, error: '工作空间目录不存在：' + targetDir }
  }

  // 回滚前快照（当前状态入档，反悔可再回滚回来）
  const before = snapshotBeforeTool(sessionId, targetDir, 'rollback', 0)
  if (!before.ok) return before

  // 清空工作空间（保留 checkpoints 目录不在工作空间内，无冲突）
  try {
    for (const en of fs.readdirSync(targetDir)) {
      fs.rmSync(path.join(targetDir, en), { recursive: true, force: true })
    }
    // 解出快照
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(targetDir, true)
  } catch (e) {
    return { ok: false, error: '恢复失败：' + e.message }
  }

  // 截断 messages 到快照分界
  const msgs = sessions.getMessages(sessionId)
  const kept = msgs.slice(0, cp.messageOffset)
  fs.writeFileSync(
    path.join(checkpointsRoot, sessionId, 'messages.jsonl'),
    kept.map(m => JSON.stringify(m)).join('\n') + (kept.length ? '\n' : '')
  )
  sessions.touch(sessionId)
  return { ok: true, keptMessages: kept.length, workspaceDir: targetDir }
}

// 删除会话时清理（sessions.deleteSession 已整目录删除，此处无需额外处理；保留接口对称）
function clearCheckpoints(sessionId) {
  try {
    fs.rmSync(cpDir(sessionId), { recursive: true, force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false }
  }
}

module.exports = { init, snapshotBeforeTool, listCheckpoints, rollback, clearCheckpoints, WRITE_TOOLS }
