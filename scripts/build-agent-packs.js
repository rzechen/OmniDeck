#!/usr/bin/env node
// 专家市场打包+发布脚本（单专家粒度）：
//   agency-agents-zh（GitHub）→ GitCode omnibuddy-agents 仓库（md 直存）+ 索引条目（每专家一条）
//
// 用法：
//   node scripts/build-agent-packs.js            # 仅生成本地产物（dist/agent-packs/）
//   node scripts/build-agent-packs.js --publish  # 生成 + 推送 omnibuddy-agents 仓库 +
//                                                #   合并 71 条索引到 omnibuddy-market/index.json
//
// 产物形态（为「专家团」组合打基础）：
//   - GitCode omnibuddy-agents 仓库：agents/<领域>/<slug>.md（裸 md，可 raw 直链下载）
//   - 索引条目：每专家一条（type: "agent"），url = raw md 直链 → 客户端下载单个 md 安装
//   - dist/agent-packs/ 本地留存：repo/（推送内容）、index-partial.json、build-report.json
//
// 上游字段适配：frontmatter name/description 原样保留（pi 兼容），color 等杂字段保留（pi 忽略）。
// 依赖：git 凭证存储中有 gitcode.com 的 token（git credential fill），--publish 时需要。

const fs = require('fs')
const path = require('path')
const https = require('https')

// ---------- 配置 ----------
const UPSTREAM = {
  owner: 'keeply-cn',
  repo: 'agency-agents-zh',
  ref: 'main'
}
// 发布目标（GitCode）：md 内容仓 + 索引仓
const GC = {
  owner: 'm0_59492087',
  agentsRepo: 'omnibuddy-agents',   // md 直存仓（本脚本推送）
  marketRepo: 'omnibuddy-market',   // 索引仓（index.json 合并）
  marketRef: 'master'
}

// 领域目录 → 分类/标签映射（category 沿用 omnibuddy-market 既有分类 value）
const DOMAIN_META = {
  engineering:       { category: 'coding',   tags: ['工程', '开发', '架构'] },
  design:            { category: 'design',   tags: ['设计', 'UI', 'UX'] },
  marketing:         { category: 'business', tags: ['营销', '增长', '社媒运营'] },
  product:           { category: 'business', tags: ['产品', '需求分析'] },
  'project-management': { category: 'business', tags: ['项目管理', '协作'] },
  testing:           { category: 'coding',   tags: ['测试', '质量保障'] },
  support:           { category: 'office',   tags: ['办公', '财务', '法务'] },
  'spatial-computing': { category: 'coding', tags: ['空间计算', 'XR', 'visionOS'] },
  specialized:       { category: 'ai-agent', tags: ['智能体', '提示词', '自动化'] }
}
// 排除：各目录 README（导览文档非专家定义）
const EXCLUDE_FILES = new Set(['README.md'])

const OUT_BASE = path.resolve(__dirname, '..', 'dist', 'agent-packs')
const UA = 'OmniDeck-AgentPackBuilder'

// ---------- 工具 ----------
function fetchBuffer(url, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume()
        return resolve(fetchBuffer(res.headers.location, redirects - 1))
      }
      if (res.statusCode !== 200) {
        res.resume()
        return reject(new Error(`HTTP ${res.statusCode} @ ${url}`))
      }
      const chunks = []
      res.on('data', c => chunks.push(c))
      res.on('end', () => resolve(Buffer.concat(chunks)))
    }).on('error', reject)
  })
}

// 一次请求下载整仓 zipball（codeload 端点匿名可用、不受 contents API 60 次/小时限流）
function fetchUpstreamZip() {
  return fetchBuffer(`https://codeload.github.com/${UPSTREAM.owner}/${UPSTREAM.repo}/zip/refs/heads/${UPSTREAM.ref}`)
    .then(buf => {
      const AdmZip = require('adm-zip')
      return { zip: new AdmZip(buf) }
    })
}

// 解析 frontmatter（name / description 单行标量，与运行时 agents.js 同规则）
function parseMeta(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!m) return {}
  const meta = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line)
    if (kv) meta[kv[1].trim()] = kv[2].trim().replace(/^["']|["']$/g, '')
  }
  return meta
}

const SLUG_RE = /^[A-Za-z0-9_-]{1,64}$/

// slug 化：文件名去 .md + 去领域前缀（engineering-frontend-developer → frontend-developer）
function toSlug(dir, fileName) {
  let s = fileName.replace(/\.md$/i, '')
  const prefix = dir.replace(/[^a-z0-9-]/gi, '') + '-'
  if (s.toLowerCase().startsWith(prefix)) s = s.slice(prefix.length)
  return s
}

// raw md 直链（url 进索引条目；客户端 downloadBuffer 下载后按裸 md 安装）
function rawMdUrl(domain, slug) {
  return `https://api.gitcode.com/api/v5/repos/${GC.owner}/${GC.agentsRepo}/raw/agents/${domain}/${slug}.md?ref=main`
}

// ---------- GitCode 凭证与推送（--publish） ----------
function getGcCreds() {
  const { execSync } = require('child_process')
  const fill = execSync("printf 'protocol=https\\nhost=gitcode.com\\n\\n' | git credential fill", { encoding: 'utf-8' })
  const user = (/^username=(.+)$/m.exec(fill) || [])[1]
  const token = (/^password=(.+)$/m.exec(fill) || [])[1]
  if (!user || !token) throw new Error('无法从 git 凭证获取 GitCode token')
  return { user, token }
}

// 推送 md 内容仓：本地组工作树 → git init/commit/push（线性历史，force-with-lease 覆盖）
async function pushAgentsRepo(outDir, creds) {
  const { execSync } = require('child_process')
  const repoDir = path.join(outDir, 'repo')
  const remote = `https://${creds.user}:${creds.token}@gitcode.com/${GC.owner}/${GC.agentsRepo}.git`
  const run = (cmd, cwd = repoDir) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' })

  fs.rmSync(repoDir, { recursive: true, force: true })
  fs.mkdirSync(path.join(repoDir, 'agents'), { recursive: true })
  // 拷贝 agents/<领域>/ 结构
  for (const domain of Object.keys(DOMAIN_META)) {
    const src = path.join(outDir, 'repo-staging', domain)
    if (!fs.existsSync(src)) continue
    fs.cpSync(src, path.join(repoDir, 'agents', domain), { recursive: true })
  }
  // README
  fs.writeFileSync(path.join(repoDir, 'README.md'), `# omnibuddy-agents

OmniDeck 专家市场内容仓：精选专家人设（.md 直存，YAML frontmatter + 系统提示词正文）。

- 来源：[keeply-cn/agency-agents-zh](https://github.com/keeply-cn/agency-agents-zh)（CC 协议，见上游仓库）
- 结构：\`agents/<领域>/<slug>.md\`，slug 为英文标识，frontmatter name 为中文名
- 消费方：OmniDeck 专家市场（单专家安装）与专家团（组合编排）
- 索引：[omnibuddy-market/index.json](https://gitcode.com/${GC.owner}/${GC.marketRepo})（type: agent 条目，url 指向本仓 raw md）

更新：\`node scripts/build-agent-packs.js --publish\`（OmniDeck 仓库内执行）
`)

  run('git init -q -b main')
  run('git -c user.name="OmniBuddy CI" -c user.email="ci@omnibuddy.local" add -A')
  run('git -c user.name="OmniBuddy CI" -c user.email="ci@omnibuddy.local" commit -qm "agents: sync from agency-agents-zh@main"')
  // 空仓库首推可能无 main ref，force-with-lease 语义不适用，先常规推再兜底
  try {
    run(`git push -q "${remote}" HEAD:main`)
  } catch (e) {
    console.log('  常规 push 被拒，force-with-lease 覆盖（机器生成线性历史）')
    run(`git push -q --force-with-lease="${remote}" HEAD:main`)
  }
  return repoDir
}

// 合并索引到 omnibuddy-market：clone → merge items（按 id 替换）→ push
async function mergeMarketIndex(outDir, creds, indexItems) {
  const { execSync } = require('child_process')
  const work = fs.mkdtempSync('/tmp/omnibuddy-market.')
  const remote = `https://${creds.user}:${creds.token}@gitcode.com/${GC.owner}/${GC.marketRepo}.git`
  const run = (cmd, cwd = path.join(work, 'repo')) => execSync(cmd, { cwd, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf-8' })

  execSync(`git clone -q "${remote}" repo`, { cwd: work, encoding: 'utf-8' })
  const indexPath = path.join(work, 'repo', 'index.json')
  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'))
  if (!Array.isArray(index.items)) throw new Error('market index.json 无 items 数组')

  // 按 id 替换合并：本脚本管理的 id 前缀整体重写（防上游改名后残留旧条目）
  const MANAGED_PREFIX = 'agent-zh-'
  const kept = index.items.filter(it => !String(it.id || '').startsWith(MANAGED_PREFIX))
  const before = index.items.length - kept.length
  index.items = kept.concat(indexItems)
  fs.writeFileSync(indexPath, JSON.stringify(index, null, 2), 'utf-8')

  run('git -c user.name="OmniBuddy CI" -c user.email="ci@omnibuddy.local" add index.json')
  run('git -c user.name="OmniBuddy CI" -c user.email="ci@omnibuddy.local" commit -qm "index: sync agent entries (single-agent granularity, ' + indexItems.length + ' items)"')
  run(`git push -q "${remote}" HEAD`)
  console.log(`  ✓ 索引合并完成：替换 ${before} 条旧 agent 条目，新增/更新 ${indexItems.length} 条`)
  fs.rmSync(work, { recursive: true, force: true })
}

// ---------- 主流程 ----------
async function main() {
  const publish = process.argv.includes('--publish')
  const outDir = OUT_BASE
  const stagingDir = path.join(outDir, 'repo-staging')
  fs.rmSync(stagingDir, { recursive: true, force: true })
  fs.mkdirSync(stagingDir, { recursive: true })

  // 1. 一次性下载整仓 zipball 并内存解包
  console.log(`[1/4] 下载上游仓库 ${UPSTREAM.owner}/${UPSTREAM.repo}@${UPSTREAM.ref} ...`)
  const { zip } = await fetchUpstreamZip()
  const rootPrefix = zip.getEntries()[0].entryName.replace(/\\/g, '/').split('/')[0] + '/'
  const allFiles = zip.getEntries()
    .filter(e => !e.isDirectory && e.entryName.replace(/\\/g, '/').endsWith('.md'))
    .map(e => {
      const name = e.entryName.replace(/\\/g, '/')
      return { path: name.slice(rootPrefix.length), text: e.getData().toString('utf-8') }
    })
    .filter(f => f.path && !f.path.startsWith('.'))
  console.log(`      共 ${allFiles.length} 个 .md 文件`)

  // 2. 逐领域校验 + 落 staging（agents/<领域>/<slug>.md）
  console.log('[2/4] 校验并按领域整理专家文件 ...')
  const report = { agents: [], failedFiles: [], skipped: [] }
  const indexItems = []
  const today = new Date().toISOString().slice(0, 10)

  for (const [domain, meta] of Object.entries(DOMAIN_META)) {
    const files = allFiles
      .filter(f => f.path.startsWith(domain + '/') && !f.path.slice(domain.length + 1).includes('/'))
      .filter(f => !EXCLUDE_FILES.has(f.path.split('/').pop()))
    if (!files.length) { report.skipped.push(domain + '/（无专家文件）'); continue }

    for (const f of files) {
      const fileName = f.path.split('/').pop()
      const fm = parseMeta(f.text)
      const slug = toSlug(domain, fileName)
      if (!String(fm.name || '').trim() || !String(fm.description || '').trim()) {
        report.failedFiles.push({ path: f.path, error: '缺少 name 或 description，剔除' })
        continue
      }
      if (!SLUG_RE.test(slug)) {
        report.failedFiles.push({ path: f.path, error: `slug 非法：${slug}` })
        continue
      }
      // 落 staging（推送内容 = 本地留存）
      const destDir = path.join(stagingDir, domain)
      fs.mkdirSync(destDir, { recursive: true })
      fs.writeFileSync(path.join(destDir, slug + '.md'), f.text, 'utf-8')
      report.agents.push({ domain, slug, name: fm.name, description: fm.description })

      // 索引条目（每专家一条）
      indexItems.push({
        id: `agent-zh-${domain}-${slug}`,
        name: fm.name,
        type: 'agent',
        category: meta.category,
        version: '1.0.0',
        author: 'keeply-cn',
        authorHandle: 'keeply-cn',
        namespace: '@keeply-cn/' + slug,
        tags: meta.tags,
        downloads: 0,
        favorites: 0,
        comments: 0,
        aiScore: 0,
        aiDimensions: null,
        trendingScore: 0,
        verified: false,
        requiresApiKey: false,
        updatedAt: today,
        description: fm.description,
        details: fm.description,
        changelog: ['Initial release'],
        url: rawMdUrl(domain, slug),
        // 专家团组合线索：同领域专家共享 domain 字段（后续专家团功能按 domain 分组推荐）
        domain,
        homepage: 'https://github.com/keeply-cn/agency-agents-zh',
        iconMime: '',
        iconBase64: '',
        iconSource: ''
      })
    }
  }

  // 本地产物落盘
  fs.writeFileSync(path.join(outDir, 'index-partial.json'), JSON.stringify(indexItems, null, 2), 'utf-8')
  fs.writeFileSync(path.join(outDir, 'build-report.json'), JSON.stringify(report, null, 2), 'utf-8')
  const byDomain = report.agents.reduce((m, a) => (m[a.domain] = (m[a.domain] || 0) + 1, m), {})
  console.log(`      ✓ ${report.agents.length} 位专家：` + Object.entries(byDomain).map(([d, n]) => `${d}(${n})`).join(' '))

  if (!publish) {
    console.log('[3/4] 跳过发布（未指定 --publish）')
    console.log(`[4/4] 本地产物：${outDir}/repo-staging/ + index-partial.json + build-report.json`)
    console.log(`\n完成：${report.agents.length} 位专家待发布（加 --publish 推送 GitCode）`)
    return
  }

  // 3. 推送 omnibuddy-agents 仓库
  console.log('[3/4] 推送 GitCode omnibuddy-agents ...')
  const creds = getGcCreds()
  await pushAgentsRepo(outDir, creds)
  console.log(`  ✓ 已推送：https://gitcode.com/${GC.owner}/${GC.agentsRepo}`)

  // 4. 合并索引到 omnibuddy-market
  console.log('[4/4] 合并索引到 omnibuddy-market ...')
  await mergeMarketIndex(outDir, creds, indexItems)
  console.log(`\n完成：${report.agents.length} 位专家已发布（仓库 + 索引）`)
}

main().catch(e => {
  console.error('失败：', e.message)
  process.exit(1)
})
