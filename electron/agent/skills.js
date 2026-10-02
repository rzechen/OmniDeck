// OmniBuddy Skills 管理（M3）
// 基于 pi 原生 skills 机制：SKILL.md 放 <agentDir>/skills/<name>/，
// DefaultResourceLoader 自动扫描装载（目录含 SKILL.md 即为一个 skill）。
// 管理动作：扫描列表 / 本地新建 / 编辑 / 删除 / ZIP 导入（校验 + 解压）。
const path = require('path')
const fs = require('fs')
const AdmZip = require('adm-zip')

let agentDir = ''

function skillsDir() {
  return path.join(agentDir, 'skills')
}

function init(dir) {
  agentDir = dir
  fs.mkdirSync(skillsDir(), { recursive: true })
}

// 解析 SKILL.md 的 frontmatter（name / description）
function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return {}
  const meta = {}
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
    if (kv) meta[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return meta
}

// env-keys：技能声明的所需环境变量名（逗号分隔，frontmatter）
// 统一在「我的凭据」录入值并绑定技能，卡片/导入处只展示变量名提示录入
function parseEnvKeys(raw) {
  return String(raw || '')
    .split(/[,，]/)
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 20)
}

// ===== 正文扫描自动发现环境变量（业界事实标准：技能在正文/脚本里直接引用 $VAR / process.env.VAR / os.environ 等） =====
// 互联网技能（skillhub / ClawHub 等）不在 frontmatter 声明凭据，
// 作者直接在文档与脚本中写变量引用，宿主负责发现并提示录入。
// 系统通用变量与技能目录占位符不视为凭据
const ENV_REF_BLOCKLIST = new Set([
  'PATH', 'HOME', 'PWD', 'SHELL', 'USER', 'LOGNAME', 'USERNAME', 'LANG', 'TERM',
  'TMPDIR', 'TMP', 'TEMP', 'PYTHONPATH', 'PYTHONHOME', 'NODE_ENV', 'NODE_PATH',
  'NO_COLOR', 'CI', 'SKILL', 'JAVA_HOME', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMFILES'
])

// 各语言的环境变量引用模式（捕获组 1 为变量名）
const ENV_REF_PATTERNS = [
  /\$\{([A-Z][A-Z0-9_]{2,})\}/g, // ${VAR}
  /\$([A-Z][A-Z0-9_]{2,})/g, // $VAR（shell 风格，含 Markdown 文档写法）
  /process\.env\.([A-Z][A-Z0-9_]{2,})/g, // Node
  /os\.getenv\(['"]([A-Z][A-Z0-9_]{2,})['"]\)/g, // Python
  /os\.environ(?:\.get)?\[?\(?['"]([A-Z][A-Z0-9_]{2,})['"]\)?\]?/g, // Python
  /\benv\.get\(['"]([A-Z][A-Z0-9_]{2,})['"]\)/g // 通用
]

const SCAN_TEXT_EXT = /\.(md|py|js|mjs|cjs|ts|sh|json|yaml|yml|toml|txt|example)$/i
const SKIP_DIRS = new Set(['node_modules', '.git', '__MACOSX', '__pycache__'])

// 递归扫描技能目录内文本文件，收集环境变量引用名（按出现顺序去重，最多 20 个）
function scanEnvRefs(dir, depth, out) {
  if (depth > 5 || out.size >= 20) return
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
    const p = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      scanEnvRefs(p, depth + 1, out)
      continue
    }
    if (!SCAN_TEXT_EXT.test(entry.name)) continue
    try {
      const st = fs.statSync(p)
      if (st.size > 512 * 1024) continue // 大文件跳过
      const text = fs.readFileSync(p, 'utf-8')
      for (const re of ENV_REF_PATTERNS) {
        re.lastIndex = 0
        let m
        while ((m = re.exec(text)) && out.size < 20) {
          const key = m[1]
          if (!ENV_REF_BLOCKLIST.has(key)) out.add(key)
        }
      }
    } catch (e) {
      /* 跳过不可读文件 */
    }
  }
}

// 合并变量名：frontmatter 声明在前（作者显式声明优先），正文扫描发现的补充，去重
function collectEnvKeys(skillDir, declaredRaw) {
  const declared = parseEnvKeys(declaredRaw)
  const scanned = new Set()
  scanEnvRefs(skillDir, 0, scanned)
  const merged = [...declared]
  for (const k of scanned) {
    if (!merged.includes(k)) merged.push(k)
  }
  return merged.slice(0, 20)
}

// frontmatter 生成（name/description/env-keys）
function buildFrontmatter(name, description, envKeys) {
  const lines = [
    '---',
    'name: ' + name,
    'description: ' + String(description || '').replace(/\r?\n/g, ' ').trim()
  ]
  const keys = parseEnvKeys((envKeys || []).join(','))
  if (keys.length) lines.push('env-keys: ' + keys.join(','))
  lines.push('---', '')
  return lines.join('\n')
}

// 目录名仅允许字母数字连字符下划线（同时防止路径穿越）
function validName(name) {
  return /^[A-Za-z0-9_-]{1,64}$/.test(name)
}

function listSkills() {
  const dir = skillsDir()
  let entries = []
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return []
  }
  // 包归属判定：技能目录同时作为某个主技能目录的嵌套子目录存在（多 skill 包
  // 导入形态：主目录解压保留嵌套副本 + 平铺安装），据此 UI 可把包成员折叠到主卡片下
  const dirNames = entries.filter(e => e.isDirectory()).map(e => e.name)
  const packageOf = name => {
    for (const other of dirNames) {
      if (other === name) continue
      if (fs.existsSync(path.join(dir, other, name, 'SKILL.md'))) return other
    }
    return ''
  }
  const skills = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const skillFile = path.join(dir, entry.name, 'SKILL.md')
    if (!fs.existsSync(skillFile)) continue
    try {
      const text = fs.readFileSync(skillFile, 'utf-8')
      const meta = parseFrontmatter(text)
      skills.push({
        name: meta.name || entry.name,
        dir: entry.name,
        description: meta.description || '',
        envKeys: collectEnvKeys(path.join(dir, entry.name), meta['env-keys']),
        content: text,
        // 属于哪个多 skill 包（空 = 独立技能）；包主条目另带 packageMembers
        packageOf: packageOf(entry.name)
      })
    } catch (e) {
      /* 跳过无法解析的 skill */
    }
  }
  // 主条目挂包成员清单（同包的成员名，UI 折叠展示）
  for (const s of skills) {
    if (!s.packageOf) {
      s.packageMembers = skills.filter(x => x.packageOf === s.dir).map(x => x.dir)
    }
  }
  return skills
}

function createSkill({ name, description, content, envKeys }) {
  const dirName = String(name || '').trim()
  if (!validName(dirName)) {
    return { ok: false, error: '名称仅支持 1-64 位字母、数字、连字符、下划线' }
  }
  const skillDir = path.join(skillsDir(), dirName)
  if (fs.existsSync(skillDir)) {
    return { ok: false, error: '同名 Skill 已存在' }
  }
  fs.mkdirSync(skillDir, { recursive: true })
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), buildFrontmatter(dirName, description, envKeys) + String(content || ''))
  return { ok: true }
}

function deleteSkill(dir) {
  if (!validName(String(dir || ''))) {
    return { ok: false, error: '非法的 Skill 名称' }
  }
  const skillDir = path.join(skillsDir(), dir)
  if (!fs.existsSync(skillDir)) return { ok: false, error: 'Skill 不存在' }
  // 包级联删除：主技能目录内的嵌套子 skill（多 skill 包形态）对应的顶层平铺目录
  // 一并删除——否则主目录删除后成员「孤儿化」，UI 变独立卡片须逐个再删
  const removedMembers = []
  try {
    for (const e of fs.readdirSync(skillDir, { withFileTypes: true })) {
      if (!e.isDirectory() || !validName(e.name)) continue
      if (!fs.existsSync(path.join(skillDir, e.name, 'SKILL.md'))) continue
      const memberDir = path.join(skillsDir(), e.name)
      if (fs.existsSync(memberDir)) {
        fs.rmSync(memberDir, { recursive: true, force: true })
        removedMembers.push(e.name)
      }
    }
  } catch (e) { /* 收集失败不影响主目录删除 */
  }
  fs.rmSync(skillDir, { recursive: true, force: true })
  return { ok: true, removedMembers }
}

// 读取单个 skill：解析 frontmatter（name / description）+ 正文
function getSkill(dir) {
  if (!validName(String(dir || ''))) {
    return { ok: false, error: '非法的 Skill 名称' }
  }
  const skillFile = path.join(skillsDir(), dir, 'SKILL.md')
  if (!fs.existsSync(skillFile)) return { ok: false, error: 'Skill 不存在' }
  try {
    const text = fs.readFileSync(skillFile, 'utf-8')
    const meta = parseFrontmatter(text)
    // 正文 = 去掉 frontmatter 块后的内容
    const match = /^---\r?\n[\s\S]*?\r?\n---(\r?\n|$)/.exec(text)
    const content = match ? text.slice(match[0].length) : text
    // 变量名 = frontmatter 声明 + 正文扫描发现（业界惯例：正文直接引用 $VAR）
    return { ok: true, skill: { name: meta.name || dir, description: meta.description || '', envKeys: collectEnvKeys(path.dirname(skillFile), meta['env-keys']), content } }
  } catch (e) {
    return { ok: false, error: '读取 Skill 失败：' + e.message }
  }
}

// 更新 skill：目录名即 name，重写 SKILL.md（frontmatter + 正文）
function updateSkill({ name, description, content, envKeys } = {}) {
  const dirName = String(name || '').trim()
  if (!validName(dirName)) {
    return { ok: false, error: '名称仅支持 1-64 位字母、数字、连字符、下划线' }
  }
  const skillDir = path.join(skillsDir(), dirName)
  if (!fs.existsSync(skillDir)) return { ok: false, error: 'Skill 不存在' }
  try {
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), buildFrontmatter(dirName, description, envKeys) + String(content || ''))
    return { ok: true }
  } catch (e) {
    return { ok: false, error: '更新 Skill 失败：' + e.message }
  }
}

// ===== ZIP 导入（对齐参考项目：上传 ZIP → 校验含 SKILL.md → 解压导入） =====
// 支持两种 ZIP 结构：
//   A. 根级 SKILL.md（单文件打包）——导入时以 zip 名/frontmatter name 建目录包裹
//   B. <name>/SKILL.md（目录打包，标准形态）——取该目录为 skill 目录
// 解析结果：{ zip, structure: 'root'|'dir', skillDirName, entries: 相关条目数组 }
function parseSkillZip(data) {
  let zip
  try {
    zip = new AdmZip(Buffer.from(data))
  } catch (e) {
    return { error: '无法解析 ZIP 文件：' + e.message }
  }
  const all = zip.getEntries()
  // 归一化条目名（去掉 ./ 前缀、统一 / 分隔）
  const norm = all.map(e => ({
    entry: e,
    name: String(e.entryName || '').replace(/\\/g, '/').replace(/^\.\//, '')
  })).filter(x => x.name && !x.name.startsWith('__MACOSX/') && !/(^|\/)\.DS_Store$/.test(x.name))

  // 结构 B：找 <name>/SKILL.md
  const dirHit = norm.find(x => /^[^/]+\/SKILL\.md$/i.test(x.name))
  if (dirHit) {
    return { zip, structure: 'dir', skillDirName: dirHit.name.split('/')[0], entries: norm }
  }
  // 结构 A：根级 SKILL.md
  const rootHit = norm.find(x => /^SKILL\.md$/i.test(x.name))
  if (rootHit) {
    return { zip, structure: 'root', skillDirName: '', entries: norm }
  }
  return { error: 'ZIP 内未找到 SKILL.md（应位于压缩包根目录或 <skill-name>/ 目录下）' }
}

// 从 SKILL.md 条目读取 frontmatter 描述与 name
function readSkillMdMeta(zip, entryName) {
  try {
    const text = zip.readAsText(entryName)
    const meta = parseFrontmatter(text)
    return { name: meta.name || '', description: meta.description || '' }
  } catch (e) {
    return { name: '', description: '' }
  }
}

// 校验 ZIP：返回 { ok, skillName, description, fileCount, exists }
function validateZip(data) {
  const parsed = parseSkillZip(data)
  if (parsed.error) return { ok: false, error: parsed.error }
  const { zip, structure, skillDirName, entries } = parsed
  const skillMdName = structure === 'dir'
    ? entries.find(x => x.name === skillDirName + '/SKILL.md').name
    : entries.find(x => /^SKILL\.md$/i.test(x.name)).name
  const meta = readSkillMdMeta(zip, skillMdName)
  // 结构 A：skill 名取 frontmatter name；结构 B：取目录名（frontmatter name 备选）
  const name = structure === 'dir' ? (skillDirName || meta.name) : (meta.name || '')
  if (!validName(String(name || ''))) {
    return { ok: false, error: 'Skill 名称无效（仅支持 1-64 位字母、数字、连字符、下划线）：' + (name || '(空)') }
  }
  const targetDir = path.join(skillsDir(), name)
  return {
    ok: true,
    skillName: name,
    description: meta.description,
    fileCount: entries.filter(x => !x.entry.isDirectory).length,
    exists: fs.existsSync(targetDir)
  }
}

// 递归复制目录（多 skill 包平铺安装用）
function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDirSync(s, d)
    else fs.copyFileSync(s, d)
  }
}

// 导入 ZIP：解压到 <skillsDir>/<name>/（zip-slip 防护：条目路径必须落在目标目录内）
// 多 skill 包支持：包内二层目录含 SKILL.md 的子技能（如 wechat-article-publish 包内的
// model-digest-writer / ai-case-writer）自动复制到 skills 顶层平铺安装——
// pi 的 skill 装载只扫描一级目录，嵌套子 skill 不平铺则永不生效。
// overwrite 时覆盖同名子技能；否则跳过并在返回中注明（不阻断主技能安装）
function importZip(data, overwrite) {
  const parsed = parseSkillZip(data)
  if (parsed.error) return { ok: false, error: parsed.error }
  const { zip, structure, skillDirName, entries } = parsed
  const skillMdName = structure === 'dir'
    ? entries.find(x => x.name === skillDirName + '/SKILL.md').name
    : entries.find(x => /^SKILL\.md$/i.test(x.name)).name
  const meta = readSkillMdMeta(zip, skillMdName)
  const name = structure === 'dir' ? (skillDirName || meta.name) : meta.name
  if (!validName(String(name || ''))) {
    return { ok: false, error: 'Skill 名称无效：' + (name || '(空)') }
  }
  const targetDir = path.join(skillsDir(), name)
  if (fs.existsSync(targetDir)) {
    if (!overwrite) return { ok: false, exists: true, error: '同名 Skill 已存在：' + name }
    fs.rmSync(targetDir, { recursive: true, force: true })
  }
  fs.mkdirSync(targetDir, { recursive: true })
  // 相关条目：结构 B 只取 <name>/ 前缀；结构 A 取全部
  const related = structure === 'dir'
    ? entries.filter(x => x.name === skillDirName + '/' || x.name.startsWith(skillDirName + '/'))
    : entries
  let count = 0
  for (const { entry, name: entryName } of related) {
    // 相对路径（结构 B 剥掉 <name>/ 前缀；结构 A 原样）
    const rel = structure === 'dir' ? entryName.slice(skillDirName.length + 1) : entryName
    const parts = rel.split('/').filter(Boolean)
    if (!parts.length || parts.some(p => p === '..') || path.isAbsolute(rel)) continue
    // zip-slip 防护：规范化后的目标必须落在目标目录内
    const dest = path.join(targetDir, path.join(...parts))
    const resolved = path.resolve(dest)
    if (resolved !== targetDir && !resolved.startsWith(targetDir + path.sep)) continue
    if (entry.isDirectory) {
      fs.mkdirSync(dest, { recursive: true })
      continue
    }
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.writeFileSync(dest, entry.getData())
    count++
  }
  if (!fs.existsSync(path.join(targetDir, 'SKILL.md'))) {
    // 兜底：解压后无 SKILL.md（异常结构）则回滚
    fs.rmSync(targetDir, { recursive: true, force: true })
    return { ok: false, error: '解压后未找到 SKILL.md，已回滚' }
  }
  // 多 skill 包平铺：扫描包内二层目录的 SKILL.md，逐个复制到 skills 顶层
  const extraSkills = []
  const skippedSkills = []
  for (const e of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!e.isDirectory() || !validName(e.name)) continue
    if (!fs.existsSync(path.join(targetDir, e.name, 'SKILL.md'))) continue
    const subDst = path.join(skillsDir(), e.name)
    if (fs.existsSync(subDst)) {
      if (!overwrite) {
        skippedSkills.push(e.name)
        continue
      }
      fs.rmSync(subDst, { recursive: true, force: true })
    }
    copyDirSync(path.join(targetDir, e.name), subDst)
    extraSkills.push(e.name)
  }
  return {
    ok: true,
    skill: { name, description: meta.description, files: count },
    extraSkills,
    skippedSkills
  }
}

// 导出 ZIP：将 <skillsDir>/<dir>/ 打包为 <name>.zip（递归收集，排除临时文件）
function exportZip(dir) {
  const skillDir = path.join(skillsDir(), String(dir || ''))
  if (!fs.existsSync(skillDir)) return { ok: false, error: 'Skill 目录不存在' }
  // zip-slip 防护：规范化后必须仍在 skills 目录内
  const resolved = path.resolve(skillDir)
  if (!resolved.startsWith(skillsDir() + path.sep)) return { ok: false, error: '路径无效' }
  const zip = new AdmZip()
  // 收集文件（相对路径递归）
  const files = []
  const walk = (base, rel) => {
    for (const entry of fs.readdirSync(base, { withFileTypes: true })) {
      if (entry.name === '.DS_Store' || entry.name === 'Thumbs.db') continue
      const childRel = rel ? rel + '/' + entry.name : entry.name
      if (entry.isDirectory()) walk(path.join(base, entry.name), childRel)
      else files.push(childRel)
    }
  }
  walk(skillDir, '')
  if (!files.some(f => f === 'SKILL.md' || f.endsWith('/SKILL.md'))) {
    return { ok: false, error: '未找到 SKILL.md' }
  }
  for (const rel of files) zip.addLocalFile(path.join(skillDir, rel), path.dirname(rel) === '.' ? '' : path.dirname(rel))
  return { ok: true, data: zip.toBuffer() }
}

module.exports = { init, listSkills, createSkill, deleteSkill, getSkill, updateSkill, validateZip, importZip, exportZip }
