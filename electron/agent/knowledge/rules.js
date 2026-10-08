// OmniBuddy 项目规则：管理 AGENTS.md 规则文件
// pi SDK DefaultResourceLoader 原生装载：全局 <agentDir>/AGENTS.md +
// 工作空间目录（cwd 向上遍历）的 AGENTS.md / CLAUDE.md，注入系统提示词。
// 本模块只做文件读写：scope = 'global'（全局）或工作空间 id。
// 读取按 pi 候选顺序（AGENTS.override.md > AGENTS.md > CLAUDE.md），
// 保存优先写回原文件（避免覆盖用户手写文件），新建一律 AGENTS.md。
const path = require('path')
const fs = require('fs')
const workspaces = require('../workspace/workspaces')

// 与 pi resource-loader 的候选顺序保持一致（大小写变体一并兼容）
const CANDIDATES = ['AGENTS.override.md', 'AGENTS.md', 'CLAUDE.md', 'AGENTS.MD', 'CLAUDE.MD']

// ===== 内部状态与工具 =====
let agentDir = ''

function init(dir) {
  agentDir = dir
}

// key → { dir, name }（未登记工作空间返回 null）
function resolveTarget(key) {
  if (key === 'global') {
    return { dir: agentDir, name: '全局规则' }
  }
  const ws = workspaces.list().find(w => w.id === key)
  if (!ws) return null
  return { dir: ws.path, name: ws.name || path.basename(ws.path) }
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

// 规则内容摘要：首个标题或首行非空文本（去 # 号与空白，截断 60 字）
function summarize(content) {
  const line = String(content || '')
    .split('\n')
    .map(l => l.trim().replace(/^#+\s*/, ''))
    .find(l => l && !l.startsWith('---'))
  if (!line) return ''
  return line.length > 60 ? line.slice(0, 60) + '…' : line
}

// ===== 对外接口 =====
// 规则目标列表：全局 + 全部工作空间（含 hasRule / summary 状态）
function targets() {
  const globalFile = findRuleFile(agentDir)
  const globalContent = globalFile ? readFileSync(globalFile) : ''
  const list = [{
    key: 'global',
    kind: 'global',
    name: '全局规则',
    path: agentDir,
    hasRule: !!globalFile,
    ruleFile: globalFile ? path.basename(globalFile) : '',
    summary: summarize(globalContent)
  }]
  for (const w of workspaces.list()) {
    const f = w.available ? findRuleFile(w.path) : null
    const content = f ? readFileSync(f) : ''
    list.push({
      key: w.id,
      kind: 'workspace',
      name: w.name || path.basename(w.path),
      path: w.path,
      available: w.available,
      hasRule: !!f,
      ruleFile: f ? path.basename(f) : '',
      summary: summarize(content)
    })
  }
  return list
}

function readFileSync(file) {
  try {
    return fs.readFileSync(file, 'utf-8')
  } catch (e) {
    return ''
  }
}

// 读取规则内容（不存在返回空内容 + exists: false）
function getRule(key) {
  const target = resolveTarget(String(key || ''))
  if (!target) return { ok: false, error: '规则目标不存在（工作空间可能已被移除）' }
  const file = findRuleFile(target.dir)
  if (!file) {
    return { ok: true, key, name: target.name, file: path.join(target.dir, 'AGENTS.md'), exists: false, content: '' }
  }
  try {
    const stat = fs.statSync(file)
    if (stat.size > 1024 * 1024) {
      return { ok: false, error: '规则文件超过 1MB，请在文件管理器中编辑' }
    }
    return {
      ok: true,
      key,
      name: target.name,
      file,
      exists: true,
      content: fs.readFileSync(file, 'utf-8')
    }
  } catch (e) {
    return { ok: false, error: '读取规则失败：' + e.message }
  }
}

// 保存规则：内容为空 = 删除规则文件；已有文件原位写回，否则新建 AGENTS.md
function saveRule(key, content) {
  const target = resolveTarget(String(key || ''))
  if (!target) return { ok: false, error: '规则目标不存在（工作空间可能已被移除）' }
  const text = String(content || '')
  const file = findRuleFile(target.dir)
  try {
    if (!text.trim()) {
      // 清空即删除（仅删除识别到的规则候选文件）
      if (file) fs.rmSync(file, { force: true })
      return { ok: true, removed: true }
    }
    // 原文件原位写回（含用户手写的 CLAUDE.md / AGENTS.override.md），新建走 AGENTS.md
    const dest = file || path.join(target.dir, 'AGENTS.md')
    fs.writeFileSync(dest, text)
    return { ok: true, file: dest }
  } catch (e) {
    return { ok: false, error: '保存规则失败：' + e.message }
  }
}

module.exports = {
  // 初始化 agentDir
  init,
  // 规则目标列表（全局 + 工作空间）
  targets,
  // 读取规则内容
  getRule,
  // 保存规则（空内容即删除）
  saveRule
}
