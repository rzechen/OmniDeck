// OmniDeck 内置资源同步（技能 / 专家）
// 源：随安装包分发的内置资源根 builtin/（打包 → Resources/builtin；
// dev → 项目根 builtin，与 platform/runtime.js 同一双布局探测模式）。
// 目标：agentDir 下的用户资源目录（pi 运行时的实际装载位）：
//   builtin/skills/<name>/  → <agentDir>/skills/<name>/   （pi 只扫一级目录，必须平铺）
//   builtin/agents/*.md     → <agentDir>/agents/builtin/  （pi-subagents 递归发现，子目录天然隔离）
// 同步策略（幂等，启动时执行一次）：
//   - 技能：目录内含 .builtin 标记（内容 = 源目录指纹）→ 与源指纹一致跳过；
//     不一致（应用升级）→ 整目录替换重部署；目标存在但无标记（用户自建同名）→ 跳过，用户版优先
//   - 专家：目标 builtin/ 子目录整目录指纹比对，变化即重建
// 内置资源对用户只读：skills.js / agents.js 依据标记拒绝编辑与删除（详见各自模块）
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

// 技能目录内的内置标记文件名（内容 = 部署时源目录指纹）
const SKILL_MARKER = '.builtin'

// ===== 内置资源根定位 =====
// 打包 → Resources/builtin；dev → 项目根 builtin（dist-electron/agent/knowledge 上三级）
function builtinRoot() {
  const packed = path.join(process.resourcesPath || '', 'builtin')
  if (fs.existsSync(path.join(packed, 'skills'))) return packed
  const dev = path.join(__dirname, '..', '..', '..', 'builtin')
  if (fs.existsSync(path.join(dev, 'skills'))) return dev
  return ''
}

// ===== 指纹 =====
// 目录指纹：递归收集「相对路径 + 文件内容」的 sha256（排序保证稳定）
function dirFingerprint(dir) {
  const h = crypto.createHash('sha256')
  const walk = (base, rel) => {
    let entries = []
    try {
      entries = fs.readdirSync(base, { withFileTypes: true })
    } catch (e) {
      return
    }
    entries.sort((a, b) => a.name.localeCompare(b.name))
    for (const e of entries) {
      const r = rel ? rel + '/' + e.name : e.name
      h.update(r)
      const p = path.join(base, e.name)
      if (e.isDirectory()) walk(p, r)
      else if (e.isFile()) {
        try { h.update(fs.readFileSync(p)) } catch (err) { /* 不可读文件跳过 */ }
      }
    }
  }
  walk(dir, '')
  return h.digest('hex')
}

// 递归复制目录（排除 .DS_Store / Thumbs.db；不复制源侧遗留标记）
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name === '.DS_Store' || e.name === 'Thumbs.db') continue
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDir(s, d)
    else if (e.isFile()) fs.copyFileSync(s, d)
  }
}

// ===== 技能同步 =====
function syncSkills(agentDir) {
  const root = builtinRoot()
  if (!root) return
  const srcRoot = path.join(root, 'skills')
  if (!fs.existsSync(srcRoot)) return
  const dstRoot = path.join(agentDir, 'skills')
  fs.mkdirSync(dstRoot, { recursive: true })
  for (const entry of fs.readdirSync(srcRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    if (!fs.existsSync(path.join(srcRoot, entry.name, 'SKILL.md'))) continue
    const src = path.join(srcRoot, entry.name)
    const dst = path.join(dstRoot, entry.name)
    const fp = dirFingerprint(src)
    const marker = path.join(dst, SKILL_MARKER)
    if (fs.existsSync(dst)) {
      // 用户自建同名技能：无内置标记 → 用户版优先，不覆盖
      if (!fs.existsSync(marker)) continue
      let deployed = ''
      try { deployed = fs.readFileSync(marker, 'utf-8').trim() } catch (e) { /* 视为需重部署 */ }
      if (deployed === fp) continue
      fs.rmSync(dst, { recursive: true, force: true })
    }
    copyDir(src, dst)
    fs.writeFileSync(marker, fp)
  }
}

// ===== 专家同步 =====
// 源 builtin/agents/*.md → <agentDir>/agents/builtin/*.md（目录级指纹，变化整目录重建）
function syncAgents(agentDir) {
  const root = builtinRoot()
  if (!root) return
  const srcDir = path.join(root, 'agents')
  if (!fs.existsSync(srcDir)) return
  const files = fs.readdirSync(srcDir).filter(f => /\.md$/i.test(f)).sort()
  if (!files.length) return
  const h = crypto.createHash('sha256')
  for (const f of files) {
    h.update(f)
    try { h.update(fs.readFileSync(path.join(srcDir, f))) } catch (e) { /* 跳过 */ }
  }
  const fp = h.digest('hex')
  const dstDir = path.join(agentDir, 'agents', 'builtin')
  const marker = path.join(dstDir, SKILL_MARKER)
  if (fs.existsSync(marker)) {
    let deployed = ''
    try { deployed = fs.readFileSync(marker, 'utf-8').trim() } catch (e) { /* 视为需重建 */ }
    if (deployed === fp) return
  }
  fs.rmSync(dstDir, { recursive: true, force: true })
  fs.mkdirSync(dstDir, { recursive: true })
  for (const f of files) fs.copyFileSync(path.join(srcDir, f), path.join(dstDir, f))
  fs.writeFileSync(marker, fp)
}

// 启动同步入口（子系统 init 后调用；异常不阻断启动）
function sync(agentDir) {
  if (!agentDir) return
  try {
    syncSkills(agentDir)
  } catch (e) {
    console.warn('[omnibuddy:builtin] 内置技能同步失败：', e && e.message)
  }
  try {
    syncAgents(agentDir)
  } catch (e) {
    console.warn('[omnibuddy:builtin] 内置专家同步失败：', e && e.message)
  }
}

module.exports = {
  // 启动时幂等同步内置技能 / 专家到 agentDir（应用升级自动更新，用户自建同名优先）
  sync,
  // 内置技能标记文件名（skills.js 只读保护判定用）
  SKILL_MARKER
}
