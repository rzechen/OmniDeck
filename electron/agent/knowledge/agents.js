// OmniBuddy 专家（子代理）管理
// 基于 pi-subagents 原生机制：专家 = Markdown 文件（YAML frontmatter + 系统提示词正文），
// 放 <agentDir>/agents/<name>.md（用户级目录，pi 会话启动时装载；.chain.md 不定义专家）。
// 表单要素：名称 / 描述 / 系统提示词 / 可用工具（可选，逗号分隔白名单）。
const path = require('path')
const fs = require('fs')
const AdmZip = require('adm-zip')

let agentDir = ''

// ===== 基础目录 =====
function agentsDir() {
  return path.join(agentDir, 'agents')
}

function init(dir) {
  agentDir = dir
  fs.mkdirSync(agentsDir(), { recursive: true })
}

// ===== frontmatter 解析（name / description 单行标量；tools 支持逗号与块列表两种形式） =====
function splitFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/.exec(text)
  if (!match) return { metaText: '', body: text }
  return { metaText: match[1], body: text.slice(match[0].length) }
}

function parseMeta(metaText) {
  const meta = {}
  const lines = String(metaText || '').split(/\r?\n/)
  for (let i = 0; i < lines.length; i++) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(lines[i])
    if (!kv) continue
    const key = kv[1].trim()
    let val = kv[2].trim()
    // 块列表形式（tools:\n  - read\n  - bash）
    if (!val) {
      const items = []
      for (let j = i + 1; j < lines.length; j++) {
        const item = /^\s+-\s+(.+)$/.exec(lines[j])
        if (!item) break
        items.push(item[1].trim().replace(/^["']|["']$/g, ''))
      }
      if (items.length) {
        meta[key] = items
        continue
      }
    }
    meta[key] = val.replace(/^["']|["']$/g, '')
  }
  return meta
}

// tools 字段归一为数组（兼容数组 / 逗号分隔字符串）
function parseTools(raw) {
  if (Array.isArray(raw)) return raw.map(s => String(s).trim()).filter(Boolean)
  return String(raw || '')
    .split(/[,，]/)
    .map(s => s.trim())
    .filter(Boolean)
}

// frontmatter 生成（name / description / tools 逗号形式）
function buildFrontmatter(name, description, tools) {
  const lines = [
    '---',
    'name: ' + name,
    'description: ' + String(description || '').replace(/\r?\n/g, ' ').trim()
  ]
  const ts = parseTools(Array.isArray(tools) ? tools.join(',') : tools)
  if (ts.length) lines.push('tools: ' + ts.join(', '))
  lines.push('---', '')
  return lines.join('\n')
}

// 名称仅允许字母数字连字符下划线（防路径穿越，与 skills 同规则）
function validName(name) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(name)
}

// 相对文件路径解析（必须落在 agents 目录内，防穿越；统一 / 分隔）
function resolveAgentFile(file) {
  const rel = String(file || '').replace(/\\/g, '/')
  if (!rel || !/\.md$/i.test(rel)) return null
  const base = path.resolve(agentsDir())
  const abs = path.resolve(base, rel)
  if (!abs.startsWith(base + path.sep)) return null
  return abs
}

// 解析专家 md 文本（frontmatter + 正文；供 teams 模块校验专家团包成员用）
function parseAgentText(text) {
  const { metaText, body } = splitFrontmatter(String(text || ''))
  const meta = parseMeta(metaText)
  return {
    name: String(meta.name || '').trim(),
    description: String(meta.description || '').trim(),
    tools: parseTools(meta.tools),
    content: body
  }
}

// ===== 专家 CRUD =====
// 递归扫描 agents 目录（.chain.md 为编排链文件，不定义专家，跳过）
function walkAgents(dir, rel, depth, out) {
  if (depth > 3) return
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const relPath = rel ? rel + '/' + entry.name : entry.name
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkAgents(p, relPath, depth + 1, out)
      continue
    }
    if (!/\.md$/i.test(entry.name) || /\.chain\.md$/i.test(entry.name)) continue
    try {
      const text = fs.readFileSync(p, 'utf-8')
      const { metaText, body } = splitFrontmatter(text)
      const meta = parseMeta(metaText)
      out.push({
        name: meta.name || entry.name.replace(/\.md$/i, ''),
        file: relPath,
        description: meta.description || '',
        tools: parseTools(meta.tools),
        content: body
      })
    } catch (e) { /* 跳过不可读文件 */ }
  }
}

// 预留子目录（不进「我的专家」列表，但 pi 递归发现照常装载）：
//   pipeline/ — 技能流水线专员（由技能体系维护，用户在技能页管理）
//   market/   — 市场安装的专家（列表正常显示，子目录仅为卸载定位）
const HIDDEN_DIRS = ['pipeline']

// 内置专家目录（builtin.js 启动时随包部署，列表展示带「系统」标识、只读）
const BUILTIN_DIR = 'builtin'

function isBuiltinAgentFile(file) {
  return String(file || '').replace(/\\/g, '/').startsWith(BUILTIN_DIR + '/')
}

function listAgents() {
  const out = []
  walkAgents(agentsDir(), '', 0, out)
  return out
    .filter(a => !HIDDEN_DIRS.some(d => a.file.startsWith(d + '/')))
    // 内置专家标记（UI 隐藏编辑/删除，仅允许查看详情；后端 update/delete 另有拒绝兜底）
    .map(a => ({ ...a, builtin: isBuiltinAgentFile(a.file) }))
}

function createAgent({ name, description, content, tools } = {}) {
  const agentName = String(name || '').trim()
  if (!validName(agentName)) {
    return { ok: false, error: '名称仅支持 1-64 位字母、数字、连字符、下划线' }
  }
  if (!String(description || '').trim()) {
    return { ok: false, error: '描述不能为空' }
  }
  const file = path.join(agentsDir(), agentName + '.md')
  if (fs.existsSync(file)) {
    return { ok: false, error: '同名专家已存在' }
  }
  try {
    fs.mkdirSync(agentsDir(), { recursive: true })
    fs.writeFileSync(file, buildFrontmatter(agentName, description, tools) + String(content || ''))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: '创建专家失败：' + e.message }
  }
}

// 读取单个专家（frontmatter + 正文）
function getAgent(file) {
  const abs = resolveAgentFile(file)
  if (!abs || !fs.existsSync(abs)) return { ok: false, error: '专家不存在' }
  try {
    const text = fs.readFileSync(abs, 'utf-8')
    const { metaText, body } = splitFrontmatter(text)
    const meta = parseMeta(metaText)
    return {
      ok: true,
      agent: {
        name: meta.name || path.basename(abs, '.md'),
        file: String(file).replace(/\\/g, '/'),
        description: meta.description || '',
        tools: parseTools(meta.tools),
        content: body
      }
    }
  } catch (e) {
    return { ok: false, error: '读取专家失败：' + e.message }
  }
}

// 更新专家：重写 .md（frontmatter + 正文；文件名即调用名不可改）
// 系统内置专家只读（builtin/ 目录），拒绝更新
function updateAgent({ file, name, description, content, tools } = {}) {
  if (isBuiltinAgentFile(file)) return { ok: false, error: '系统内置专家不可编辑' }
  const abs = resolveAgentFile(file)
  if (!abs || !fs.existsSync(abs)) return { ok: false, error: '专家不存在' }
  if (!String(description || '').trim()) {
    return { ok: false, error: '描述不能为空' }
  }
  try {
    fs.writeFileSync(abs, buildFrontmatter(name || path.basename(abs, '.md'), description, tools) + String(content || ''))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: '更新专家失败：' + e.message }
  }
}

function deleteAgent(file) {
  if (isBuiltinAgentFile(file)) return { ok: false, error: '系统内置专家不可删除' }
  const abs = resolveAgentFile(file)
  if (!abs || !fs.existsSync(abs)) return { ok: false, error: '专家不存在' }
  try {
    fs.rmSync(abs, { force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: '删除专家失败：' + e.message }
  }
}

// ===== 专家包 ZIP 导入（市场安装管线） =====
// pi-subagents 递归发现 agents/**/*.md，市场专家包整体落 agents/<collection>/<name>.md：
// - 文件名用英文 slug（校验规则同目录名，防路径穿越）
// - frontmatter name 可为中文（pi 仅要求非空）；color 等额外字段由 pi 忽略，原样保留
// ZIP 支持两种结构：
//   A. 根级散装 .md（agency-agents-zh 单集合打包形态）
//   B. <collection>/... .md（目录打包）
// 安装一律以市场项 id 作为集合目录名（幂等覆盖，与 skill 市场语义一致）
function parseAgentZip(data) {
  let zip
  try {
    zip = new AdmZip(Buffer.from(data))
  } catch (e) {
    return { error: '无法解析 ZIP 文件：' + e.message }
  }
  const norm = zip.getEntries()
    .map(e => ({
      entry: e,
      name: String(e.entryName || '').replace(/\\/g, '/').replace(/^\.\//, '')
    }))
    .filter(x => x.name && !x.name.startsWith('__MACOSX/')
      && !/(^|\/)\.DS_Store$/.test(x.name)
      && !/(^|\/)\.chain\.md$/i.test(x.name)) // 编排链文件不随市场包安装
  const mdFiles = norm.filter(x => !x.entry.isDirectory && /\.md$/i.test(x.name))
  if (!mdFiles.length) return { error: 'ZIP 内未找到专家定义（.md 文件）' }
  // 结构 B：全部文件都带同一顶级目录前缀 → 剥掉；否则视为根级散装（结构 A）
  const tops = new Set(mdFiles.map(x => x.name.split('/')[0]))
  const prefix = tops.size === 1 && mdFiles[0].name.includes('/') ? mdFiles[0].name.split('/')[0] + '/' : ''
  return { zip, prefix, files: mdFiles }
}

// 逐个校验包内专家（frontmatter name/description 必填；文件名 slug 合法），
// 返回 { ok, agents } 或 { ok:false, error }（任一文件非法即整体拒绝，避免半包安装）
function validateAgentEntries(files, prefix) {
  const out = []
  for (const { entry, name } of files) {
    const rel = name.slice(prefix.length)
    const slug = rel.replace(/\.md$/i, '')
    let meta = {}
    try {
      const { metaText } = splitFrontmatter(entry.getData().toString('utf-8'))
      meta = parseMeta(metaText)
    } catch (e) { /* 无 frontmatter 走兜底 */ }
    if (!String(meta.name || '').trim() || !String(meta.description || '').trim()) {
      return { ok: false, error: `专家「${slug}」缺少 name 或 description，无法安装` }
    }
    if (!validName(slug)) {
      return { ok: false, error: `专家文件名无效（仅支持 1-64 位字母、数字、连字符、下划线）：${slug}` }
    }
    if (out.some(a => a.slug === slug)) {
      return { ok: false, error: `专家包内文件名重复：${slug}` }
    }
    out.push({ entry, rel, slug, name: String(meta.name).trim(), description: String(meta.description).trim() })
  }
  return { ok: true, agents: out }
}

// 导入单个专家 md（市场裸 md 直链安装）：校验 frontmatter 后落 agents/market/<slug>.md。
// slug 取自市场项 id（agent-zh-<domain>-<slug> 尾段或整体），防穿越同集合校验
function importAgentFile(data, itemId) {
  const text = Buffer.from(data).toString('utf-8')
  let meta = {}
  try {
    const { metaText } = splitFrontmatter(text)
    meta = parseMeta(metaText)
  } catch (e) { /* 无 frontmatter 走报错 */ }
  const name = String(meta.name || '').trim()
  const desc = String(meta.description || '').trim()
  if (!name || !desc) return { ok: false, error: '专家定义缺少 name 或 description，无法安装' }

  const slug = String(itemId || '').trim().replace(/^agent-zh-/, '').replace(/[^A-Za-z0-9_-]/g, '-').slice(0, 64)
  if (!validName(slug)) return { ok: false, error: '专家标识无效：' + slug }
  const dir = path.join(agentsDir(), 'market')
  fs.mkdirSync(dir, { recursive: true })
  const dest = path.join(dir, slug + '.md')
  fs.writeFileSync(dest, text, 'utf-8')
  return { ok: true, file: 'market/' + slug + '.md', skill: { name, description: desc } }
}

// 导入专家包 ZIP：解压到 agents/<collection>/（zip-slip 防护同 skills）。
// overwrite=true 时先清空集合目录（市场语义：安装/更新/重装一律覆盖）
function importAgentZip(data, collection, overwrite) {
  const col = String(collection || '').trim()
  if (col === BUILTIN_DIR) return { ok: false, error: '不可使用系统内置目录名：' + col }
  if (!validName(col)) return { ok: false, error: '集合名称无效：' + (col || '(空)') }
  const parsed = parseAgentZip(data)
  if (parsed.error) return { ok: false, error: parsed.error }
  const checked = validateAgentEntries(parsed.files, parsed.prefix)
  if (!checked.ok) return checked

  const targetDir = path.join(agentsDir(), col)
  if (fs.existsSync(targetDir)) {
    if (!overwrite) return { ok: false, exists: true, error: '同名专家集合已存在：' + col }
    fs.rmSync(targetDir, { recursive: true, force: true })
  }
  fs.mkdirSync(targetDir, { recursive: true })
  let count = 0
  for (const { entry, rel } of checked.agents) {
    const parts = rel.split('/').filter(Boolean)
    if (!parts.length || parts.some(p => p === '..') || path.isAbsolute(rel)) continue
    const dest = path.join(targetDir, path.join(...parts))
    const resolved = path.resolve(dest)
    if (resolved !== targetDir && !resolved.startsWith(targetDir + path.sep)) continue
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, entry.getData())
    count++
  }
  if (!count) {
    fs.rmSync(targetDir, { recursive: true, force: true })
    return { ok: false, error: '解压后未写入任何专家文件，已回滚' }
  }
  return {
    ok: true,
    collection: col,
    count,
    // 对齐 skill 管线返回形态（market.js 直接透传给前端）
    skill: { name: checked.agents[0].name, description: checked.agents[0].description, files: count }
  }
}

// 删除整个专家集合目录（市场卸载用；仅允许集合目录名，防穿越）
// 内置专家目录（builtin/）只读，拒绝删除
function deleteCollection(collection) {
  const col = String(collection || '').trim()
  if (col === BUILTIN_DIR) return { ok: false, error: '系统内置专家集合不可删除' }
  if (!validName(col)) return { ok: false, error: '集合名称无效' }
  const dir = path.join(agentsDir(), col)
  if (!fs.existsSync(dir)) return { ok: false, error: '专家集合不存在' }
  try {
    fs.rmSync(dir, { recursive: true, force: true })
    return { ok: true }
  } catch (e) {
    return { ok: false, error: '删除专家集合失败：' + e.message }
  }
}

// 集合目录是否已存在（重名提示用）
function collectionExists(collection) {
  const col = String(collection || '').trim()
  return !!col && validName(col) && fs.existsSync(path.join(agentsDir(), col))
}

module.exports = {
  // 初始化 agents 根目录
  init,
  // agents 根目录路径（市场模块检查集合目录用）
  agentsRoot: agentsDir,
  // 解析专家 md 文本（frontmatter + 正文）
  parseAgentText,
  // 扫描专家列表（frontmatter + 正文）
  listAgents,
  // 本地新建专家（<name>.md）
  createAgent,
  // 读取单个专家
  getAgent,
  // 重写专家 .md
  updateAgent,
  // 删除专家文件
  deleteAgent,
  // 导入专家包 ZIP（落 agents/<collection>/，市场安装管线）
  importAgentZip,
  // 导入单个专家 md（市场裸 md 直链安装，落 agents/market/<slug>.md）
  importAgentFile,
  // 删除整个专家集合目录（市场卸载）
  deleteCollection,
  // 集合目录存在性检查
  collectionExists
}
