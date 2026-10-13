// OmniBuddy 项目规则管理。
// 全局规则：<agentDir>/AGENTS.md（应用内部目录，pi DefaultResourceLoader 原生装载）。
// 工作空间规则：存应用内部 <agentDir>/rules/<空间id>.md——空间规则是应用内置能力，
//   规则文件不再落用户工作空间（否则暴露在空间文件管理里易被误删）；
//   会话创建时经 sessionAgentsFiles 提供内容，由 pi/session.js 通过
//   DefaultResourceLoader 的 agentsFilesOverride 注入为虚拟上下文文件
//   （系统提示词 <project_instructions> 段，path 为虚拟路径不对应磁盘）。
// 工作空间内用户自带的 AGENTS.md / CLAUDE.md 不受本模块影响，pi 仍原生发现装载。
// 兼容：init 时收编历史版本写到工作空间根的规则文件（迁入内部存储并删除原文件，
// 避免与虚拟注入重复装载）。
const path = require('path')
const fs = require('fs')
const workspaces = require('../workspace/workspaces')

// 与 pi resource-loader 的候选顺序保持一致（大小写变体一并兼容）
const CANDIDATES = ['AGENTS.override.md', 'AGENTS.md', 'CLAUDE.md', 'AGENTS.MD', 'CLAUDE.MD']

// ===== 内部状态与工具 =====
let agentDir = ''

function init(dir) {
  agentDir = dir
  try {
    fs.mkdirSync(storeDir(), { recursive: true })
  } catch (e) { /* 建目录失败不阻塞启动，保存时再报错 */ }
  migrateLegacyWorkspaceRules()
}

// 内部规则存储目录：<agentDir>/rules/
function storeDir() {
  return path.join(agentDir, 'rules')
}

// 工作空间规则的内部文件：<agentDir>/rules/<空间id>.md
function ruleFileOf(key) {
  return path.join(storeDir(), String(key) + '.md')
}

// 目录下第一个存在的规则候选文件（无则 null）
function findRuleFile(dir) {
  for (const name of CANDIDATES) {
    const p = path.join(dir, name)
    try {
      if (fs.statSync(p).isFile()) return p
    } catch (e) { /* 不存在继续 */ }
  }
  return null
}

// 历史版本收编：旧版把空间规则直接写到工作空间根的 AGENTS.md（应用创建的唯一
// 文件名）。迁入内部存储后删除原文件（避免与虚拟注入重复装载）；内容为空不收编
// （旧版语义即「空 = 无规则」），内部已有规则的空间跳过。
// 用户手写的 CLAUDE.md / AGENTS.override.md 等不收编：pi 仍原生发现装载。
function migrateLegacyWorkspaceRules() {
  for (const w of workspaces.list()) {
    if (!w.available) continue
    const internal = ruleFileOf(w.id)
    if (fs.existsSync(internal)) continue
    const legacy = path.join(w.path, 'AGENTS.md')
    if (!fs.existsSync(legacy) || !fs.statSync(legacy).isFile()) continue
    const content = readFileSync(legacy)
    if (!content.trim()) continue
    try {
      fs.writeFileSync(internal, content)
      fs.rmSync(legacy, { force: true })
      console.log('[omnibuddy:rules] 已收编历史空间规则（工作空间 → 内部存储）：', legacy)
    } catch (e) {
      console.warn('[omnibuddy:rules] 收编失败（保留原文件）：', legacy, (e && e.message) || e)
    }
  }
}

// 规则内容摘要：首个标题或首行非空文本（去 # 号与空白，截断 60 字）
function summarize(content) {
  const line = String(content || '')
    .split('\n')
    .map(l => l.trim().replace(/^#+\s*/, ''))
    .find(l => l && !l.startsWith('---'))
  if (!line) return ''
  return line.length > 60 ? line.slice(0, 60) + '…' : line
}

function readFileSync(file) {
  try {
    return fs.readFileSync(file, 'utf-8')
  } catch (e) {
    return ''
  }
}

// ===== 对外接口 =====
// 规则目标列表：全局（agentDir 原生文件）+ 全部工作空间（内部存储）
function targets() {
  const globalFile = findRuleFile(agentDir)
  const globalContent = globalFile ? readFileSync(globalFile) : ''
  const list = [{
    key: 'global',
    kind: 'global',
    name: '全局规则',
    path: agentDir,
    hasRule: !!globalFile,
    summary: summarize(globalContent)
  }]
  for (const w of workspaces.list()) {
    const content = w.available ? readFileSync(ruleFileOf(w.id)) : ''
    list.push({
      key: w.id,
      kind: 'workspace',
      name: w.name || path.basename(w.path),
      path: w.path,
      available: w.available,
      hasRule: !!content.trim(),
      summary: summarize(content)
    })
  }
  return list
}

// 读取规则内容（不存在返回空内容 + exists: false）
function getRule(key) {
  // 全局规则：agentDir 原生文件（读写均落此处）
  if (String(key) === 'global') {
    const file = findRuleFile(agentDir)
    if (!file) {
      return { ok: true, key, name: '全局规则', file: path.join(agentDir, 'AGENTS.md'), exists: false, content: '' }
    }
    try {
      const stat = fs.statSync(file)
      if (stat.size > 1024 * 1024) {
        return { ok: false, error: '规则文件超过 1MB，请在文件管理器中编辑' }
      }
      return { ok: true, key, name: '全局规则', file, exists: true, content: fs.readFileSync(file, 'utf-8') }
    } catch (e) {
      return { ok: false, error: '读取规则失败：' + e.message }
    }
  }
  // 工作空间规则：内部存储文件（不落工作空间）
  const ws = workspaces.list().find(w => w.id === String(key || ''))
  if (!ws) return { ok: false, error: '规则目标不存在（工作空间可能已被移除）' }
  const file = ruleFileOf(ws.id)
  const content = readFileSync(file)
  if (content.length > 1024 * 1024) {
    return { ok: false, error: '规则文件超过 1MB' }
  }
  return {
    ok: true,
    key,
    name: ws.name || path.basename(ws.path),
    file,
    exists: !!content.trim(),
    content
  }
}

// 保存规则：内容为空 = 删除规则；全局原位写回 agentDir 候选文件，
// 工作空间只读写内部存储（工作空间磁盘目录不受影响）
function saveRule(key, content) {
  const text = String(content || '')
  if (String(key) === 'global') {
    const file = findRuleFile(agentDir)
    try {
      if (!text.trim()) {
        if (file) fs.rmSync(file, { force: true })
        return { ok: true, removed: true }
      }
      // 原文件原位写回（含用户手写的 CLAUDE.md / AGENTS.override.md），新建走 AGENTS.md
      const dest = file || path.join(agentDir, 'AGENTS.md')
      fs.mkdirSync(agentDir, { recursive: true })
      fs.writeFileSync(dest, text)
      return { ok: true, file: dest }
    } catch (e) {
      return { ok: false, error: '保存规则失败：' + e.message }
    }
  }
  const ws = workspaces.list().find(w => w.id === String(key || ''))
  if (!ws) return { ok: false, error: '规则目标不存在（工作空间可能已被移除）' }
  const file = ruleFileOf(ws.id)
  try {
    if (!text.trim()) {
      fs.rmSync(file, { force: true })
      return { ok: true, removed: true }
    }
    fs.mkdirSync(storeDir(), { recursive: true })
    fs.writeFileSync(file, text)
    return { ok: true, file }
  } catch (e) {
    return { ok: false, error: '保存规则失败：' + e.message }
  }
}

// 会话注入清单：按工作空间目录取内部规则，返回虚拟上下文文件
// （path 仅作提示词内标识，不对应磁盘文件）；无规则返回空数组
function sessionAgentsFiles(workspaceDir) {
  const ws = workspaces.list().find(w => w.path === String(workspaceDir || ''))
  if (!ws) return []
  const content = readFileSync(ruleFileOf(ws.id))
  if (!content.trim()) return []
  return [{ path: '/virtual/space-rules/AGENTS.md', content }]
}

module.exports = {
  // 初始化 agentDir（并收编历史版本写到工作空间的规则文件）
  init,
  // 规则目标列表（全局 + 工作空间）
  targets,
  // 读取规则内容
  getRule,
  // 保存规则（空内容即删除）
  saveRule,
  // 会话注入清单（工作空间规则 → 虚拟上下文文件）
  sessionAgentsFiles
}
