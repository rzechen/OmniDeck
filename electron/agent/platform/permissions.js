// OmniBuddy 权限系统桥接（社区扩展包 @gotgenes/pi-permission-system）
// 扩展负责策略匹配与 fail-closed 拦截；本模块负责：
//   1) config.json 维护（agentDir/extensions/pi-permission-system/，pi CLI 装包后生效）
//   2) authorizer 链桥接：注册 omnibuddy-ui 链接，把 ask 经 IPC 转为前端确认卡片，
//      按「允许一次 / 本会话内允许 / 拒绝」应答（会话内批准记在会话闭包，随会话销毁）
// 服务定位用扩展自己发布的 Symbol.for 全局 Map（跨 jiti 模块副本共享，spike 已验证）。
const path = require('path')
const fs = require('fs')
const capabilities = require('./capabilities')

// 与扩展 src/service.ts 的 SESSION_SERVICES_KEY 保持一致
const SESSION_SERVICES_KEY = Symbol.for('@gotgenes/pi-permission-system:session-services')
// authorizerChain 中本桥接的链接名（config.authorizerChain 需包含同名项才生效）
const AUTHORIZER_NAME = 'omnibuddy-ui'

const EXTENSION_ID = 'pi-permission-system'
const SCOPE = '@gotgenes/' + EXTENSION_ID

// ===== 权限模式（常驻输入框选择器） =====
// readonly：deny 全部 ask 操作（只读策略由 config 放行 read 等）
// auto：allow 全部 ask 操作（config deny 规则仍生效，不经过此层）
// confirm：ask 经 IPC 前端确认条逐次裁决
const MODES = ['readonly', 'auto', 'confirm']
const MODE_FILE = () => path.join(state.agentDir, 'permission-mode.json')
const state = { agentDir: '', mode: 'confirm' }

function loadMode() {
  try {
    const m = JSON.parse(fs.readFileSync(MODE_FILE(), 'utf-8')).mode
    if (MODES.indexOf(m) >= 0) state.mode = m
  } catch (e) { /* 首次无文件，用默认 */ }
  return state.mode
}

function getMode() {
  return state.mode
}

function setMode(mode) {
  if (MODES.indexOf(mode) < 0) return false
  state.mode = mode
  try {
    fs.mkdirSync(state.agentDir, { recursive: true })
    fs.writeFileSync(MODE_FILE(), JSON.stringify({ mode }, null, 2))
  } catch (e) { /* 持久化失败不影响本次生效 */ }
  return true
}

// ===== 配置路径与默认策略 =====
function configDir(agentDir) {
  return path.join(agentDir, 'extensions', EXTENSION_ID)
}

function configPath(agentDir) {
  return path.join(configDir(agentDir), 'config.json')
}

// 工具默认权限：从 capabilities.js 统一目录派生（单一事实来源）。
// 涵盖核心 / 扩展 / 联网 / 文档 / UI / 记忆全部工具的默认键，包括
// pi-web-access 的 4 个 web 工具（web_search / fetch_content /
// source_check / get_search_content）；新增工具在目录登记一处即同步生效

// agentDir 自管目录的 external_directory 放行规则（playwright 产物 / 记忆 / 扩展配置等）：
// 应用内部路径而非用户工作区，模型读取属正常行为，逐次确认会频繁打断；
// path 面的敏感文件 deny（*.env / .ssh）仍独立生效，不受此处放行影响
// 空格路径的字面形态（权限扩展解析 bash 命令时 token 保留原始转义 / 引号，
// 不做归一化，每种形态须各登记一条 pattern）：
//   无引号：.../Application Support/...
//   反斜杠转义：.../App\ Support/...（模型常写 `App\ Support` 转义形式）
//   双引号包裹：".../Application Support/..."（含空格路径的常态命令写法，
//   --caps=storage 后 agent 检视 playwright-profile 等自管目录高频出现）
// 多层补齐：pattern 的 `*` 不跨目录分隔符，而自管目录存在三层及以上路径
// （skills/<name>/SKILL.md 等）——单层 glob 盖不住会落到 '*' 兜底 ask，
// 无头定时任务无人应答即被拒，故逐层显式放行（敏感 deny 面独立生效）
// patterns 形如 ['*', '*/*', ...]（相对 dir 的逐层通配）
function dirAllowPatterns(dir, patterns) {
  const paths = [dir].concat(patterns.map(s => path.join(dir, s)))
  const rules = {}
  const hasSpace = dir.indexOf(' ') >= 0
  paths.forEach(p => {
    rules[p] = 'allow'
    if (hasSpace) {
      rules[p.replace(/ /g, '\\ ')] = 'allow'
      rules['"' + p + '"'] = 'allow'
    }
  })
  return rules
}

function agentDirAllowRules(agentDir) {
  if (!agentDir) return {}
  return dirAllowPatterns(agentDir, ['*', '*/*', '*/*/*', '*/*/*/*'])
}

// 应用数据根目录（agentDir 的上级，如 .../omnibuddy）只读放行规则：
// agent 检视自家数据目录（凭据存储 / 工作区清单等）属正常行为，逐次确认会
// 频繁打断。只放开读（写仍限 pi-agent 白名单）；敏感面 deny（*.env / .ssh）
// 独立生效不受影响；credentials.json 为 safeStorage 密文，读不到明文。
// 多层补齐与空格字面形态同 agentDirAllowRules（sessions/<id>/messages.jsonl
// 等三层路径；反斜杠转义与双引号包裹变体）
function baseDirReadAllowRules(agentDir) {
  if (!agentDir) return {}
  return dirAllowPatterns(path.dirname(agentDir), ['*', '*/*', '*/*/*'])
}

// ===== 宿主配置写保护（deny，10-09 事故实证：任务级排障时 agent 手改
// settings.json 注入 child-mcp「修环境」——环境装配是宿主职责，agent 只读）=====
// 覆盖：settings.json / mcp.json / extensions 子树（含权限系统自身配置
// extensions/pi-permission-system/config.json，防篡改绕过）。
// 读不限制（自省/检视正常）；写三面拦截：external_directory（bash 方向不明）、
// external_directory_write（write 工具）、path（bash cat/重定向场景）。
// 空格路径同样登记三种字面形态（无引号 / 反斜杠转义 / 双引号包裹）
function hostDenyVariants(p, rules) {
  rules[p] = 'deny'
  if (p.indexOf(' ') >= 0) {
    rules[p.replace(/ /g, '\\ ')] = 'deny'
    rules['"' + p + '"'] = 'deny'
  }
  return rules
}

function hostConfigDenyRules(agentDir) {
  if (!agentDir) return {}
  const rules = {}
  hostDenyVariants(path.join(agentDir, 'settings.json'), rules)
  hostDenyVariants(path.join(agentDir, 'mcp.json'), rules)
  const ext = path.join(agentDir, 'extensions')
  for (const pat of [ext, path.join(ext, '*'), path.join(ext, '*/*'), path.join(ext, '*/*/*')]) {
    hostDenyVariants(pat, rules)
  }
  return rules
}

// 默认策略（平衡）：工具默认权限从 capabilities.js 统一目录派生，此处只
// 保留目录之外的横切规则（workflow 控制面 / 兜底 / 路径面 / 托管放行）
// 注意：config.json 顶层只能放扩展 schema 认识的 key（strictObject 校验，
// 未知 key 会令整个配置被判 invalid 丢弃）
function defaultConfig(agentDir) {
  return {
    yoloMode: false,
    authorizerChain: [AUTHORIZER_NAME],
    permission: Object.assign(
      // 工具默认键（含 web 4 工具；顶层 '*' 为 universal fallback，被扩展
      // 抽离为最低优先级合成规则，工具键无论位置先后均能胜出兜底）
      capabilities.toolPermissionDefaults(),
      {
        // 深度研究：workflow 启动多代理编排（有 token 成本）走 '*' 兜底逐次确认；
        // workflow_control 为控制面（查进度/暂停/停止/恢复），放行避免频繁打断
        workflow_control: 'allow',
        // 其余（subagents / 未登记工具）兜底确认；
        // skill 技能面默认放行：技能为应用内置/用户自装，激活读取 SKILL.md
        // 属正常低风险操作，逐次确认会频繁打断（发布等敏感工具仍按各自键管控）
        '*': 'ask',
        skill: { '*': 'allow' },
        // agentDir 放行须排在 '*' 之后（last-match-wins，后写的具体 pattern 生效）
        // 外部目录三面（族 / _read / _write）默认均逐次确认（fail-safe）：
        // pi 权限系统按效果证明方向（ADR 0013）——write 工具写工作区外走
        // _write 面、只读工具读走 _read 面、bash 等方向不明落裸族名。
        // 显式 _write 面必须镜像族面的 agentDir 托管放行：显式方向键排在
        // 裸键糖展开条目之后（后写胜出），若只写 '*' 兜底 ask 会压过糖展开
        // 的 agentDir allow，playwright 产物等应用自管写入将被逐次打断。
        // 托管 deny（宿主配置写保护）再排在 allow 之后——后写胜出
        external_directory: Object.assign(
          { '*': 'ask' }, agentDirAllowRules(agentDir), hostConfigDenyRules(agentDir)),
        external_directory_write: Object.assign(
          { '*': 'ask' }, agentDirAllowRules(agentDir), hostConfigDenyRules(agentDir)),
        // 应用数据根只读放行：显式 external_directory_read 条目在裸键糖展开的
        // 条目之后（后写胜出），可越过 external_directory 的 '*' 兜底 ask
        external_directory_read: Object.assign({ '*': 'ask' }, baseDirReadAllowRules(agentDir)),
        // 跨工具路径面：密钥与本地凭据文件一律拒绝（含 bash cat 场景）；
        // 宿主配置文件（settings.json / mcp.json / extensions 子树）同样托管 deny
        path: Object.assign({
          '*': 'allow',
          '*.env': 'deny',
          '*.env.*': 'deny',
          '*.env.example': 'allow',
          '.ssh/*': 'deny'
        }, hostConfigDenyRules(agentDir))
      }
    )
  }
}

// ===== 应用托管 pattern（agentDir / baseDir 系列）=====
// 由应用运行时计算维护，三条铁律：
//   1) 配置页不呈现（stripManagedRules 展示前剥离托管行）
//   2) 保存以应用为准（mergeManagedRules 服务端回填，预设覆盖 / 误删 /
//      绕过前端直调 IPC 均无法破坏系统放行）
//   3) 启动无条件校正（patchAgentDirAllow；含排序——托管键须排在 '*' 之后，
//      last-match-wins 才能越过兜底 ask/deny 生效）
// 作用于 external_directory（agentDir 读写 + 宿主配置 deny）、
// external_directory_write（同上）、external_directory_read（baseDir 只读）、
// path（宿主配置 deny，bash 写场景）。rules 值为该键的裁决（allow / deny）
function managedSurfaces(agentDir) {
  return [
    {
      surface: 'external_directory',
      rules: Object.assign({}, agentDirAllowRules(agentDir), hostConfigDenyRules(agentDir))
    },
    {
      surface: 'external_directory_write',
      rules: Object.assign({}, agentDirAllowRules(agentDir), hostConfigDenyRules(agentDir))
    },
    { surface: 'external_directory_read', rules: baseDirReadAllowRules(agentDir) },
    { surface: 'path', rules: hostConfigDenyRules(agentDir) }
  ]
}

// 就地强制：托管键先 delete 再按 rules 值重写（allow 放行 / deny 宿主配置
// 写保护），确保排在 '*' 与用户自建规则之后（last-match-wins 生效）；
// 标量/未配置的面规整为对象并保留原兜底语义
function enforceManagedInto(permission, agentDir) {
  managedSurfaces(agentDir).forEach(function (entry) {
    let cur = permission[entry.surface]
    if (!cur || typeof cur !== 'object') {
      cur = { '*': cur === 'allow' || cur === 'deny' ? cur : 'ask' }
      permission[entry.surface] = cur
    }
    Object.keys(entry.rules).forEach(k => { delete cur[k] })
    Object.keys(entry.rules).forEach(k => { cur[k] = entry.rules[k] })
  })
}

// 启动强制回填（非版本迁移，属运行时防护）：与保存合并共用 enforceManagedInto，
// 有实质变化才写盘。托管键直接校正覆盖（页面不呈现托管行，
// 留存的显式 deny/ask 值只可能来自误改，校正即恢复）
function patchAgentDirAllow(agentDir) {
  const config = readConfig(agentDir)
  if (!config || !config.permission) return false
  const before = JSON.stringify(config.permission)
  enforceManagedInto(config.permission, agentDir)
  if (JSON.stringify(config.permission) === before) return false
  try {
    writeConfig(agentDir, config)
    console.log('[permissions] 已回填应用托管规则（agentDir 放行 + 宿主配置写保护 deny）')
  } catch (e) { /* 写盘失败忽略，下次启动再补 */ }
  return true
}

// 展示过滤：剥掉托管 pattern，配置页只呈现用户自建规则。
// 浅拷贝不改原对象；剥空的面保留空对象，前端展平时自然无行
function stripManagedRules(agentDir, config) {
  if (!config || typeof config !== 'object') return config
  const out = Object.assign({}, config)
  if (!out.permission || typeof out.permission !== 'object') return out
  const perm = Object.assign({}, out.permission)
  managedSurfaces(agentDir).forEach(function (entry) {
    const cur = perm[entry.surface]
    if (cur && typeof cur === 'object') {
      const next = {}
      Object.keys(cur).forEach(k => { if (!entry.rules[k]) next[k] = cur[k] })
      perm[entry.surface] = next
    }
  })
  out.permission = perm
  return out
}

// 保存合并（三方）：前端回传的 permission 只含用户自建规则，与「页面加载时
// 下发的快照」「保存时重读的盘上配置」做逐键三方合并——
//   回传值 ≠ 快照值        → 用户编辑过，以回传为准（含删除：回传缺失即删）
//   否则 盘上值 ≠ 快照值   → 下发后由「始终允许」等旁路修改，以盘上为准
//   否则                   → 未变化，保持回传
// 从而防止配置页旧快照把旁路追加/升级的键冲掉；托管 pattern 以运行时计算
// 为准回填（深拷贝再改，不信任回传对象）
// 比较用归一化形式：标量 'ask' 与 { '*': 'ask' } 语义等价（扩展加载时同构
// 展开），前端序列化单条 * 规则为标量，不归一化会误判用户编辑
function normalizePermValue(v) {
  return typeof v === 'string' ? { '*': v } : v
}

function mergeManagedRules(agentDir, config, pageSnapshot) {
  let out
  try {
    out = config && typeof config === 'object' ? JSON.parse(JSON.stringify(config)) : {}
  } catch (e) {
    out = {}
  }
  if (!out.permission || typeof out.permission !== 'object') out.permission = {}
  const snap = (pageSnapshot && typeof pageSnapshot.permission === 'object') ? pageSnapshot.permission : {}
  const disk = readConfig(agentDir)
  const diskPerm = (disk && typeof disk.permission === 'object') ? disk.permission : {}
  const keys = {}
  Object.keys(snap).concat(Object.keys(diskPerm)).forEach(k => { keys[k] = true })
  Object.keys(keys).forEach(k => {
    const userEdited = JSON.stringify(normalizePermValue(out.permission[k])) !== JSON.stringify(normalizePermValue(snap[k]))
    if (userEdited) return // 用户动过这个键（含删除），以回传为准
    if (diskPerm[k] === undefined) return
    const sideChanged = JSON.stringify(normalizePermValue(diskPerm[k])) !== JSON.stringify(normalizePermValue(snap[k]))
    if (sideChanged) {
      out.permission[k] = JSON.parse(JSON.stringify(diskPerm[k]))
    }
  })
  enforceManagedInto(out.permission, agentDir)
  return out
}

// ===== 启动补齐（幂等）：旧配置获得目录登记的工具默认键 =====
// 旧版本默认策略从未写入 web 工具等键（落 '*' 兜底逐次询问）；本函数把统一
// 目录中「从未写过」的键追加进已有 config，使旧配置与新装环境行为一致。
// provisioned 记账（agentDir/permission-defaults.json）：只补从未提供过的键，
// 用户随后主动删除的键不再回填（避免启动补齐与用户编辑互相打架）。
// 键追加在 permission 对象末尾不影响优先级：顶层 '*' 被扩展抽离为最低优先级
// 的 universal fallback，工具键无论位置先后均能胜出兜底
function defaultsLedgerFile(agentDir) {
  return path.join(agentDir, 'permission-defaults.json')
}

function readProvisionedDefaults(agentDir) {
  try {
    const arr = JSON.parse(fs.readFileSync(defaultsLedgerFile(agentDir), 'utf-8')).tools
    return Array.isArray(arr) ? arr : []
  } catch (e) {
    return []
  }
}

function writeProvisionedDefaults(agentDir, tools) {
  try {
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(defaultsLedgerFile(agentDir), JSON.stringify({ tools }, null, 2))
  } catch (e) { /* 记账失败下次启动再补 */ }
}

function backfillToolDefaults(agentDir) {
  const config = readConfig(agentDir)
  if (!config || !config.permission || typeof config.permission !== 'object') return false
  const defaults = capabilities.toolPermissionDefaults()
  const provided = readProvisionedDefaults(agentDir)
  const initialCount = provided.length
  let changed = false
  Object.keys(defaults).forEach(name => {
    if (provided.indexOf(name) >= 0) return
    if (config.permission[name] === undefined) {
      config.permission[name] = defaults[name]
      changed = true
    }
    provided.push(name)
  })
  if (!changed && provided.length === initialCount) return false
  if (changed) {
    try {
      writeConfig(agentDir, config)
      console.log('[permissions] 已补齐旧配置缺失的工具默认键（统一目录派生）')
    } catch (e) {
      return false // 写盘失败不记账，下次启动重试
    }
  }
  writeProvisionedDefaults(agentDir, provided)
  return changed
}

// 清理 web_enable 孤儿键：pi-web-access 1.x 的懒激活加载器工具曾落 '*' 兜底确认，
// 用户选「始终允许」后被 persistAlwaysAllow 写入 config。该工具现已由宿主从
// active 集永久移除（pi.js 校正扩展 + excludeTools），规则键无任何匹配对象，
// 启动幂等摘除（backfillToolDefaults 目录中无此键，不会回填）
function stripOrphanWebEnable(agentDir) {
  const config = readConfig(agentDir)
  if (!config || !config.permission || config.permission.web_enable === undefined) return false
  delete config.permission.web_enable
  try {
    writeConfig(agentDir, config)
    console.log('[permissions] 已清理 web_enable 孤儿规则键（懒激活加载器已由宿主接管）')
  } catch (e) {
    return false // 写盘失败下次启动重试
  }
  return true
}

// 清理旧版 MCP 面（字面 mcp 规则键）：pi-mcp-adapter 时代用单一 mcp 工具 +
// 入参派生 server:tool，其规则面为 mcp；pi 1.0.0 内置 MCP 后工具名为
// mcp__服务器__工具，mcp 面不再匹配任何运行时工具（适配器启动时强制清理）。
// 启动幂等摘除配置键与 notes sidecar 中的同面说明（默认策略已不再写入）
function stripLegacyMcpSurface(agentDir) {
  let changed = false
  const config = readConfig(agentDir)
  if (config && config.permission && config.permission.mcp !== undefined) {
    delete config.permission.mcp
    try {
      writeConfig(agentDir, config)
      changed = true
    } catch (e) {
      return false // 写盘失败下次启动重试
    }
  }
  // notes sidecar 同面键（'mcp|*' / 'mcp|<pattern>''）一并清理
  const notes = readNotes(agentDir)
  const staleKeys = Object.keys(notes).filter(k => k.indexOf('mcp|') === 0)
  if (staleKeys.length) {
    staleKeys.forEach(k => { delete notes[k] })
    writeNotes(agentDir, notes)
    changed = true
  }
  if (changed) console.log('[permissions] 已清理旧版 MCP 面规则（连接器统一走 mcp__服务器名* 通配键）')
  return changed
}

// 存量 MCP 规则键 sanitize 迁移：早期目录键按原始服务器名拼接（可含横杠等
// 字符），而 pi 注册的工具名一律转下划线（createMcpToolName：非 [A-Za-z0-9_]
// 全部转 _），导致同一服务器在权限页分裂出「目录行 + 追加行」两条规则，且
// 旧键永远匹配不到真实工具（死规则）。目录键已改按 sanitize 名生成
// （capabilities.mcpBuiltinTools），此处把配置中的存量键同步转换：值迁移、
// 原键删除（目标键已存在时保留现有配置，只摘除旧键），notes sidecar
// 的同面说明一并迁移。启动幂等
function migrateMcpSurfaceKeys(agentDir) {
  const config = readConfig(agentDir)
  const perm = config && config.permission
  if (!perm) return false
  const stale = Object.keys(perm).filter(k =>
    k.indexOf('mcp__') === 0 && /[^A-Za-z0-9_*]/.test(k))
  if (!stale.length) return false
  stale.forEach(k => {
    const sane = k.replace(/[^A-Za-z0-9_*]/g, '_')
    if (perm[sane] === undefined) perm[sane] = perm[k]
    delete perm[k]
  })
  try {
    writeConfig(agentDir, config)
  } catch (e) {
    return false // 写盘失败下次启动重试
  }
  const notes = readNotes(agentDir)
  let notesChanged = false
  stale.forEach(k => {
    const sane = k.replace(/[^A-Za-z0-9_*]/g, '_')
    Object.keys(notes).forEach(nk => {
      if (nk.indexOf(k + '|') === 0) {
        notes[sane + '|' + nk.slice(k.length + 1)] = notes[nk]
        delete notes[nk]
        notesChanged = true
      }
    })
  })
  if (notesChanged) writeNotes(agentDir, notes)
  console.log('[permissions] 已迁移存量 MCP 规则键至 sanitize 命名（mcp__服务器名*）')
  return true
}

// ===== 配置初始化与读写 =====
// 无 config 时写入默认策略；已有 config 补齐缺失工具键 + agentDir 放行幂等校正
function ensureConfig(agentDir) {
  const file = configPath(agentDir)
  if (fs.existsSync(file)) {
    const backfilled = backfillToolDefaults(agentDir)
    const strippedWebEnable = stripOrphanWebEnable(agentDir)
    const strippedLegacyMcp = stripLegacyMcpSurface(agentDir)
    const migratedMcpKeys = migrateMcpSurfaceKeys(agentDir)
    return patchAgentDirAllow(agentDir) || backfilled || strippedWebEnable || strippedLegacyMcp || migratedMcpKeys
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(defaultConfig(agentDir), null, 2))
  // 记账：默认键视为已提供，用户随后的删除不会被启动补齐复活
  writeProvisionedDefaults(agentDir, Object.keys(capabilities.toolPermissionDefaults()))
  console.log('[permissions] 已初始化默认权限配置：' + file)
  return true
}

function readConfig(agentDir) {
  try {
    return JSON.parse(fs.readFileSync(configPath(agentDir), 'utf-8'))
  } catch (e) {
    return null
  }
}

// 写盘守门：任何调用方（保存策略 / 补齐 / 持久化放行）都不允许把扩展 schema
// 不认识的顶层 key 写进 config.json（未知 key 一旦写入，整个配置失效）
function writeConfig(agentDir, config) {
  if (config && typeof config === 'object') delete config.defaultsVersion
  fs.mkdirSync(configDir(agentDir), { recursive: true })
  fs.writeFileSync(configPath(agentDir), JSON.stringify(config, null, 2))
}

// ===== 规则说明 sidecar（permission-notes.json）：'surface|pattern' → 描述 =====
// 描述不进 config.json——扩展 schema 严格校验，未知顶层 key 会令整份配置被判
// invalid 丢弃；独立落盘于 agentDir，读写均为整份对象，key 与前端序列化同构
function notesFile(agentDir) {
  return path.join(agentDir, 'permission-notes.json')
}

function readNotes(agentDir) {
  try {
    const o = JSON.parse(fs.readFileSync(notesFile(agentDir), 'utf-8')).notes
    return (o && typeof o === 'object') ? o : {}
  } catch (e) {
    return {}
  }
}

function writeNotes(agentDir, notes) {
  try {
    fs.mkdirSync(agentDir, { recursive: true })
    fs.writeFileSync(notesFile(agentDir), JSON.stringify({ notes: notes || {} }, null, 2))
  } catch (e) { /* 写盘失败不阻断权限保存 */ }
}

// ===== 持久化放行 =====
// 始终允许：把该 surface 的 ask 规则升级为 allow 并写盘（跨会话生效）
// 对象型规则（如 bash: { '*': 'ask' }）仅升级值为 ask 的 pattern，其余保留；
// 显式 deny 的规则不放宽；无规则（兜底 * 命中）时新建 allow 规则
function persistAlwaysAllow(agentDir, surface) {
  if (!surface || typeof surface !== 'string') return false
  const config = readConfig(agentDir)
  if (!config || !config.permission) return false
  const rule = config.permission[surface]
  if (rule === 'deny') return false
  if (rule === 'ask' || rule === undefined) {
    config.permission[surface] = 'allow'
  } else if (rule && typeof rule === 'object') {
    let changed = false
    for (const k of Object.keys(rule)) {
      if (rule[k] === 'ask') {
        rule[k] = 'allow'
        changed = true
      }
    }
    if (!changed) return false
  } else {
    return false // 已是 allow 等其它取值，无需写盘
  }
  try {
    writeConfig(agentDir, config)
    return true
  } catch (e) {
    return false
  }
}

// ===== authorizer 链桥接工厂（每个会话一个实例） =====
// onAsk: ({ askId, surface, value, toolName, command, path, preview }) => Promise<'allow'|'allow_session'|'deny'>
// onUiPrompt: (e) => void —— permissions:ui_prompt 结构化广播（select 兜底路径的弹窗预告）
function createBridgeExtension(onAsk, onDecision, onUiPrompt) {
  // 会话内批准缓存：surface|matchedPattern -> true（disposeSession 后随闭包释放）
  const sessionGrants = new Map()

  function resolveService(sessionId) {
    try {
      const map = globalThis[SESSION_SERVICES_KEY]
      return (map && sessionId) ? map.get(sessionId) : undefined
    } catch (e) {
      return undefined
    }
  }

  async function authorize(details, query) {
    // 模式优先（选择器即时生效）：只读拒绝 / 自动放行 / 确认走前端确认条
    const mode = getMode()
    if (mode === 'auto') {
      return { kind: 'allow' }
    }
    if (mode === 'readonly') {
      return { kind: 'deny', reason: '当前为只读模式，无法执行该操作；可在输入框下方切换权限模式' }
    }
    // 排除面（external_directory* / path*）：扩展的安全封顶会把链路授权器的
    // allow 一律降级为 defer 并交终审重问（用户被迫确认两次，第一次点击被丢弃）。
    // 这里对排除面直接 defer 不发前端询问，让终审 ui.select 的单张确认条成为
    // 唯一交互（应答路由：pi.replyUiAsk / index.js reply 分流）
    const gateSurface = ((details.payload && details.payload.request) || {}).surface || ''
    if (/^(external_directory|path)(_read|_write)?$/.test(gateSurface)) {
      return { kind: 'defer' }
    }
    const req = (details.payload && details.payload.request) || {}
    const surface = details.toolName || req.surface || ''
    const value = details.command || details.path || details.target || req.value || ''
    // 会话内批准命中：直接放行（用策略匹配的 pattern 做粒度，与前端「本会话内允许」一致）
    let matchedPattern = ''
    try {
      const check = query.checkPermission(surface, value)
      matchedPattern = (check && check.matchedPattern) || ''
    } catch (e) { /* 查询失败不影响询问 */ }
    if (sessionGrants.has(surface + '|' + matchedPattern)) {
      return { kind: 'allow' }
    }
    // 调试日志：走到 authorize 说明策略判定为 ask（allow 不会进此链路），
    // 记录 surface 与策略命中的 pattern，用于排查"配置了 allow 仍弹确认"类问题
    console.log('[permissions] ask → surface=' + surface + ' pattern=' + (matchedPattern || '(兜底*)') + ' mode=' + mode + ' value=' + String(value).slice(0, 80))
    const action = await onAsk({
      askId: details.requestId,
      surface,
      value,
      toolName: details.toolName || '',
      command: details.command || '',
      path: details.path || '',
      preview: details.toolInputPreview || ''
    })
    if (action === 'allow_session') {
      sessionGrants.set(surface + '|' + matchedPattern, true)
      return { kind: 'allow' }
    }
    // 始终允许：本会话即刻生效（会话缓存）；跨会话的持久化由主进程 reply 侧写 config
    if (action === 'allow_always') {
      sessionGrants.set(surface + '|' + matchedPattern, true)
      return { kind: 'allow' }
    }
    if (action === 'allow') {
      console.log('[permissions] decision → surface=' + surface + ' action=allow')
      return { kind: 'allow' }
    }
    // 中断路径的自动拒绝（非用户点击）：与会话中断事件对应，文案如实描述，
    // 避免模型/日志把「会话被停止」误读为「用户明确拒绝此操作」
    if (action === 'deny_interrupt') {
      console.log('[permissions] decision → surface=' + surface + ' action=deny_interrupt')
      return { kind: 'deny', reason: '会话已被用户中断，此操作自动取消' }
    }
    // 无头定时执行的默认拒绝（主进程 pi-events 无头分级判定）：写副作用面
    // 在无人值守时拒绝并记录；模型可改走只读路径，确需该操作时用户应在
    // 权限管理中将对应面配置为 allow（allow 不进 ask 链路，不受无头拦截）
    if (action === 'deny_headless') {
      console.log('[permissions] decision → surface=' + surface + ' action=deny_headless')
      return {
        kind: 'deny',
        reason: '当前为无头定时执行环境，写类操作默认拒绝（只读操作自动放行）。' +
          '请改用只读方式继续，或跳过该步骤并在最终汇报中说明；如该操作对任务必需，' +
          '需要用户在 OmniDeck 权限管理中将对应工具配置为允许后重跑。'
      }
    }
    console.log('[permissions] decision → surface=' + surface + ' action=deny')
    return { kind: 'deny', reason: '用户在 OmniBuddy 中拒绝了此操作' }
  }

  return function (piApi) {
    // permissions:ready 可能重复发射（session_start + 每次 turn 前 latch），注册需幂等
    piApi.events.on('permissions:ready', (e) => {
      const svc = resolveService(e && e.sessionId)
      if (!svc) return
      try {
        svc.registerAuthorizer(AUTHORIZER_NAME, authorize)
      } catch (err) {
        /* 已注册：ready 重复发射的正常路径 */
      }
    })
    // 结构化 UI 提示广播：LocalUserAuthorizer（ui.select 兜底路径）在弹窗前发射，
    // 宿主缓存最近一条供 select 到达时组装结构化 permission_ask 下发前端
    if (onUiPrompt) {
      piApi.events.on('permissions:ui_prompt', (e) => {
        try { onUiPrompt(e) } catch (err) { /* 观察者失败不影响决策 */ }
      })
    }
    // 决策广播：仅转发给前端做轻提示（allow 的执行已在工具卡片呈现）
    if (onDecision) {
      piApi.events.on('permissions:decision', (e) => {
        try { onDecision(e) } catch (err) { /* 广播观察者失败不影响决策 */ }
      })
    }
  }
}

module.exports = {
  // 扩展 npm scope（@gotgenes/pi-permission-system）
  SCOPE,
  // authorizer 链中本桥接的链接名
  AUTHORIZER_NAME,
  // 扩展 config.json 的落盘路径
  configPath,
  // 初始化 / 幂等校正权限配置
  ensureConfig,
  // 读取 config.json（失败返回 null）
  readConfig,
  // 写盘 config.json（剥离扩展不认识的顶层键）
  writeConfig,
  // 默认权限策略（工具默认键 + 横切规则）
  defaultConfig,
  // 始终允许：surface 的 ask 升级为 allow 写盘
  persistAlwaysAllow,
  // authorizer 链桥接扩展工厂（每会话一实例）
  createBridgeExtension,
  // 应用托管 pattern：展示过滤 / 保存合并（配置页只见可改的用户自建规则）
  stripManagedRules,
  // 保存时三方合并并回填托管规则
  mergeManagedRules,
  // 读取规则说明 sidecar
  readNotes,
  // 写规则说明 sidecar
  writeNotes,
  // 启动加载持久化的权限模式
  loadMode,
  // 获取当前权限模式
  getMode,
  // 设置并持久化权限模式
  setMode
}
