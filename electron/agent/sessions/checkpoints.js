// 会话检查点（N4 / §18.3）：写操作工具执行前对工作空间快照，支持一键回滚
// 双引擎策略：
// - shadow（优先）：影子仓库（GIT_DIR 独立于工作空间，bare 仓 + GIT_WORK_TREE
//   指向工作空间）。快照 = add -A + write-tree（tree 对象增量存储，blob 去重，
//   无 commit 无历史污染，不动用户 index）；回滚 = read-tree + checkout-index
//   + clean -fd。优势：增量省空间、突破 zip 的 50MB 上限（node_modules 等
//   经 info/exclude 排除）、code 工程空间可用。
// - zip（兜底）：git 不可用 / shadow 失败时回退 adm-zip 全量快照（原实现，
//   工作空间超 50MB 跳过）。旧会话的 zip 检查点向后兼容可回滚。
// 影子仓库按工作空间共享（<userData>/omnibuddy/shadow/<hash>），同空间多会话
// blob 去重；ref 命名 refs/cp/<sessionId>/<n> 隔离各会话，LRU 删 ref 不删对象。
// 触发：pi-events tool_execution_start，工具名 ∈ WRITE_TOOLS（write/edit/multi_edit/mkdir）
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const { spawnSync } = require('child_process')
const AdmZip = require('adm-zip')
const sessions = require('./sessions')
const runtime = require('../platform/runtime')

// ===== 常量与初始化 =====
// 触发快照的写操作工具（pi 标准 tool 名）
const WRITE_TOOLS = new Set(['write', 'edit', 'multi_edit', 'mkdir', 'delete'])
// zip 引擎单目录体积上限（全量打包的保护阈值；shadow 引擎不受此限）
const MAX_DIR_BYTES = 50 * 1024 * 1024
// 每会话保留快照数
const KEEP = 10
// shadow 引擎 git 单命令超时（首次快照需全量 hash，放宽）
const GIT_TIMEOUT_MS = 120 * 1000

let checkpointsRoot = '' // = sessionsRoot（快照索引落各会话目录内）

function init(sessionsRootPath) {
  checkpointsRoot = sessionsRootPath
}

// ===== 索引与路径 =====
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

// 递归统计目录字节数（超限/不可读返回 -1；zip 引擎保护用）
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

// ===== 影子仓库引擎 =====
// 仓库位置：<omnibuddy 根>/shadow/<工作空间路径 hash>（checkpointsRoot 是
// <omnibuddy 根>/sessions，取上两级即根）
function shadowRoot() {
  return path.join(checkpointsRoot, '..', 'shadow')
}

function shadowDirFor(workspaceDir) {
  const hash = crypto.createHash('sha1').update(path.resolve(workspaceDir)).digest('hex').slice(0, 12)
  return path.join(shadowRoot(), hash)
}

// git 可执行（装配的便携 git 优先，系统回退；'' = 不可用）
function gitBinary() {
  return runtime.gitBin() || 'git'
}

// 惰性初始化影子仓库：bare init + 隔离配置 + 默认排除清单
// 返回 { ok, dir? }；失败不抛出（调用方回退 zip）
function ensureShadowRepo(workspaceDir) {
  const dir = shadowDirFor(workspaceDir)
  try {
    if (!fs.existsSync(path.join(dir, 'HEAD'))) {
      fs.mkdirSync(dir, { recursive: true })
      const bin = gitBinary()
      // 显式剥除继承的 GIT_* 环境变量：init 阶段携带 GIT_WORK_TREE 而无
      // GIT_DIR 会被 git 拒绝（fatal: GIT_WORK_TREE not allowed without GIT_DIR）
      const env = Object.assign({}, process.env)
      delete env.GIT_DIR
      delete env.GIT_WORK_TREE
      delete env.GIT_INDEX_FILE
      const r = spawnSync(bin, ['init', '--bare', '-q', dir],
        { timeout: 15000, windowsHide: true, encoding: 'utf-8', env })
      if (r.status !== 0) return { ok: false }
    }
    // 排除清单（快照与 clean 共用）：依赖目录 / 系统噪音不入库也不参与回滚清除
    const infoDir = path.join(dir, 'info')
    const excludeFile = path.join(infoDir, 'exclude')
    if (!fs.existsSync(excludeFile)) {
      fs.mkdirSync(infoDir, { recursive: true })
      fs.writeFileSync(excludeFile, [
        '# OmniDeck shadow-repo exclude（快照排除清单，非用户 gitignore）',
        'node_modules/',
        '.DS_Store'
      ].join('\n') + '\n')
    }
    return { ok: true, dir }
  } catch (e) {
    return { ok: false }
  }
}

// 影子仓库 git 调用：GIT_DIR/GIT_WORK_TREE 环境隔离 + 关闭用户全局配置
// （防 autocrlf 等改写内容，保证 blob 与磁盘字节一致）
function shadowGit(repoDir, workspaceDir, args, timeout) {
  const globalCfg = path.join(repoDir, 'info', 'omnideck-gitconfig')
  try {
    if (!fs.existsSync(globalCfg)) fs.writeFileSync(globalCfg, '')
  } catch (e) { /* 空配置写失败时退化为读用户配置 */ }
  return spawnSync(gitBinary(), args, {
    timeout: timeout || GIT_TIMEOUT_MS,
    windowsHide: true,
    encoding: 'utf-8',
    cwd: workspaceDir,
    env: Object.assign({}, process.env, {
      GIT_DIR: repoDir,
      GIT_WORK_TREE: workspaceDir,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_GLOBAL: globalCfg
    })
  })
}

// shadow 快照：add -A → write-tree → update-ref；返回 tree hash 或 null
// add 自愈：工作空间含「无 commit 的嵌套仓库」（刚 init / clone 中断）时
// git add -A 整体报错 "'xxx/' does not have a commit checked out"——解析
// stderr 提取问题目录追加进 info/exclude（与 gitlink 同语义：不入库不覆盖），
// 重试一次；仍失败返回 null 由调用方回退 zip
function shadowSnapshot(sessionId, workspaceDir, n) {
  const repo = ensureShadowRepo(workspaceDir)
  if (!repo.ok) return null
  let r = shadowGit(repo.dir, workspaceDir, ['add', '-A'])
  if (r.status !== 0) {
    const excludeFile = path.join(repo.dir, 'info', 'exclude')
    const bad = String(r.stderr || '').match(/'(.+?)' does not have a commit/i)
    if (!bad) return null
    try {
      fs.appendFileSync(excludeFile, bad[1].replace(/\/+$/, '/') + '\n')
    } catch (e) { return null }
    r = shadowGit(repo.dir, workspaceDir, ['add', '-A'])
    if (r.status !== 0) return null
  }
  r = shadowGit(repo.dir, workspaceDir, ['write-tree'])
  if (r.status !== 0) return null
  const tree = String(r.stdout || '').trim()
  if (!/^[0-9a-f]{40}$/.test(tree)) return null
  r = shadowGit(repo.dir, workspaceDir,
    ['update-ref', 'refs/cp/' + sessionId + '/' + n, tree], 15000)
  if (r.status !== 0) return null
  return tree
}

// shadow 回滚：read-tree → checkout-index（全量写出）→ clean -fd（删多余）
// 语义：exclude 清单（node_modules 等）与嵌套 git 仓库目录不覆盖不删除
function shadowRestore(repoDir, workspaceDir, tree) {
  let r = shadowGit(repoDir, workspaceDir, ['read-tree', tree])
  if (r.status !== 0) return 'read-tree 失败'
  r = shadowGit(repoDir, workspaceDir, ['checkout-index', '-a', '-f'])
  if (r.status !== 0) return 'checkout-index 失败'
  // -fd 删除未跟踪文件与目录（被 exclude 的保留；嵌套仓库不带 -ff 不递归删）
  r = shadowGit(repoDir, workspaceDir, ['clean', '-fd'])
  if (r.status !== 0) return 'clean 失败'
  return ''
}

// 检查点 ref 是否仍存在（loose ref；本仓不跑 gc 永为 loose 文件）
function shadowRefExists(sessionId, n) {
  for (const dir of fs.existsSync(shadowRoot())
    ? fs.readdirSync(shadowRoot()) : []) {
    const p = path.join(shadowRoot(), dir, 'refs', 'cp', sessionId, String(n))
    if (fs.existsSync(p)) return true
  }
  return false
}

// ===== 快照（统一入口：shadow 优先，zip 兜底） =====
// 工具执行前调用：写工具 → 快照；返回 {ok, skipped?, reason?}
// messageOffset：当前 messages.jsonl 行数（回滚截断分界）
function snapshotBeforeTool(sessionId, workspaceDir, toolName, messageOffset) {
  if (!WRITE_TOOLS.has(toolName)) return { ok: true, skipped: true }
  if (!workspaceDir || !fs.existsSync(workspaceDir)) return { ok: true, skipped: true, reason: 'no-workspace' }
  if (!sessions.readMeta(sessionId)) return { ok: true, skipped: true, reason: 'no-session' }

  const list = readIndex(sessionId)
  const n = list.length ? list[list.length - 1].n + 1 : 1

  // shadow 引擎：git 可用即增量 tree 快照（不设体积上限）
  if (runtime.probeGit().bin) {
    const tree = shadowSnapshot(sessionId, workspaceDir, n)
    if (tree) {
      list.push({
        n,
        tool: toolName,
        messageOffset,
        workspaceDir,
        mode: 'shadow',
        tree,
        createdAt: Date.now()
      })
      trimAndSave(sessionId, list)
      return { ok: true, n, mode: 'shadow' }
    }
    // shadow 失败（空间含只读嵌套仓库等）：本次回退 zip，下次再试 shadow
  }

  // zip 引擎兜底：全量打包（超 50MB 跳过）
  const size = dirSize(workspaceDir)
  if (size < 0 || size > MAX_DIR_BYTES) {
    return { ok: true, skipped: true, reason: size < 0 ? 'unreadable' : 'oversize' }
  }
  const zipPath = path.join(cpDir(sessionId), `${n}.zip`)
  try {
    const zip = new AdmZip()
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
    workspaceDir,
    mode: 'zip',
    createdAt: Date.now(),
    file: `${n}.zip`
  })
  trimAndSave(sessionId, list)
  return { ok: true, n, mode: 'zip' }
}

// LRU 落盘：超过保留数删最旧（shadow 删 ref；zip 删文件）
function trimAndSave(sessionId, list) {
  while (list.length > KEEP) {
    const old = list.shift()
    try {
      if (old.mode === 'shadow' && old.tree) {
        const repo = shadowDirFor(old.workspaceDir)
        fs.rmSync(path.join(repo, 'refs', 'cp', sessionId, String(old.n)), { force: true })
        // 删 ref 后 tree/blob 成悬空对象，留待会话删除时 prune（blob 跨快照共享）
      } else if (old.file) {
        fs.rmSync(path.join(cpDir(sessionId), old.file), { force: true })
      }
    } catch (e) { /* 删旧失败不阻断 */ }
  }
  writeIndex(sessionId, list)
}

// ===== 列表 / 回滚 / 清理 =====
// 检查点列表（时间线倒序展示）
function listCheckpoints(sessionId) {
  const list = readIndex(sessionId)
    .map(c => Object.assign({}, c, {
      // 快照载体丢失标记：shadow 看 ref，zip 看文件
      missing: c.mode === 'shadow' ? !shadowRefExists(sessionId, c.n)
        : !fs.existsSync(path.join(cpDir(sessionId), c.file || ''))
    }))
    .sort((a, b) => b.n - a.n)
  return { ok: true, items: list }
}

// 回滚：恢复快照时的工作空间 → messages.jsonl 截断
// 调用方（ipc-sessions）负责 dispose 会话与前端刷新；此处先做「回滚前快照」保证可反悔
function rollback(sessionId, n, workspaceDirNow) {
  const list = readIndex(sessionId)
  const cp = list.find(c => c.n === n)
  if (!cp) return { ok: false, error: '检查点不存在' }

  const targetDir = workspaceDirNow || cp.workspaceDir
  if (!targetDir || !fs.existsSync(targetDir)) {
    return { ok: false, error: '工作空间目录不存在：' + targetDir }
  }

  // shadow 检查点：git 路径恢复
  if (cp.mode === 'shadow' && cp.tree) {
    if (!shadowRefExists(sessionId, n)) return { ok: false, error: '快照已丢失' }
    const before = snapshotBeforeTool(sessionId, targetDir, 'rollback', 0)
    if (!before.ok) return before
    const repo = ensureShadowRepo(targetDir)
    if (!repo.ok) return { ok: false, error: '影子仓库不可用' }
    const err = shadowRestore(repo.dir, targetDir, cp.tree)
    if (err) return { ok: false, error: '恢复失败：' + err }
    return truncateMessages(sessionId, cp, targetDir)
  }

  // zip 检查点（旧会话兼容 / shadow 失败兜底产生）
  const zipPath = path.join(cpDir(sessionId), cp.file || '')
  if (!fs.existsSync(zipPath)) return { ok: false, error: '快照文件已丢失' }
  // 回滚前快照（当前状态入档，反悔可再回滚回来）
  const before = snapshotBeforeTool(sessionId, targetDir, 'rollback', 0)
  if (!before.ok) return before
  try {
    // 清空工作空间（保留 checkpoints 目录不在工作空间内，无冲突）
    for (const en of fs.readdirSync(targetDir)) {
      fs.rmSync(path.join(targetDir, en), { recursive: true, force: true })
    }
    const zip = new AdmZip(zipPath)
    zip.extractAllTo(targetDir, true)
  } catch (e) {
    return { ok: false, error: '恢复失败：' + e.message }
  }
  return truncateMessages(sessionId, cp, targetDir)
}

// 截断 messages 到快照分界（两种引擎共用）
function truncateMessages(sessionId, cp, targetDir) {
  const msgs = sessions.getMessages(sessionId)
  const kept = msgs.slice(0, cp.messageOffset)
  fs.writeFileSync(
    path.join(checkpointsRoot, sessionId, 'messages.jsonl'),
    kept.map(m => JSON.stringify(m)).join('\n') + (kept.length ? '\n' : '')
  )
  sessions.touch(sessionId)
  return { ok: true, keptMessages: kept.length, workspaceDir: targetDir }
}

// 删除会话时清理：zip 目录 + 该会话全部 shadow ref（对象库按工作空间共享，
// prune 只回收本会话不再引用的悬空对象，存活快照引用的 blob 不受影响）
function clearCheckpoints(sessionId) {
  try {
    fs.rmSync(cpDir(sessionId), { recursive: true, force: true })
  } catch (e) { /* 目录不存在忽略 */ }
  try {
    if (fs.existsSync(shadowRoot())) {
      for (const dir of fs.readdirSync(shadowRoot())) {
        const refsCp = path.join(shadowRoot(), dir, 'refs', 'cp', sessionId)
        if (!fs.existsSync(refsCp)) continue
        fs.rmSync(refsCp, { recursive: true, force: true })
        // 同步 prune 回收悬空对象（失败无碍，下次会话删除时再清）
        spawnSync(gitBinary(), ['prune', '--expire', 'now'], {
          timeout: 30000, windowsHide: true,
          env: Object.assign({}, process.env, {
            GIT_DIR: path.join(shadowRoot(), dir),
            GIT_CONFIG_NOSYSTEM: '1'
          })
        })
      }
    }
    return { ok: true }
  } catch (e) {
    return { ok: false }
  }
}

module.exports = {
  // 初始化（记录会话根目录，快照索引落各会话目录内）
  init,
  // 写工具执行前快照工作空间（shadow 优先 / zip 兜底，超限 / 异常跳过）
  snapshotBeforeTool,
  // 检查点列表（倒序，含载体丢失标记）
  listCheckpoints,
  // 回滚到指定检查点（先做回滚前快照保证可反悔）
  rollback,
  // 清理会话全部检查点（zip 目录 + shadow ref）
  clearCheckpoints,
  // 触发快照的写工具名单
  WRITE_TOOLS
}
