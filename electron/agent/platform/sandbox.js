// OmniBuddy 沙箱执行（参照 @erichll/pi-sandbox 安全模型）
// 基于 @anthropic-ai/sandbox-runtime（macOS: sandbox-exec / Linux: bubblewrap）：
// - fail-closed 静态文件系统策略：写许可是 allow-only（默认全拒绝），读取为
//   deny-list（敏感目录显式禁读），越界访问由 OS 层直接阻断，无动态授权；
// - 网络三级评估：静态 deny → 静态 allow → 动态审批（未命中白名单的连接经
//   前端确认卡逐次授权，「本会话允许」把域名并入运行时 allowlist）；
// - 每命令私有可写临时目录（omnibuddy-sbx-*）：子进程 TMPDIR 指向私有目录，
//   命令退出即销毁，不全局放开 /tmp 写（避免跨命令/跨进程交叉污染）；
// - 秘密文件默认写封禁（.env 变体 / *.pem / *.key / *.p12 / *.pfx / secrets/），
//   沙箱与权限配置文件自身同样禁写防篡改；
// - 违规归因标注：OS 层拦截经日志监控进入违规存储，命令结束追加到 stderr，
//   模型能据此修正命令而非面对无声失败。
// 配置存 <agentDir>/sandbox.json，UI 开关写 enabled 字段，会话创建时读取注入。
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawn } = require('child_process')

// ===== 常量与默认策略 =====
// bash 默认超时（秒）：与非沙箱路径（pi.js createTmpBashExtension）保持一致。
// 模型不传 timeout 时挂起命令（find 大目录 / 交互等待 / 沙箱 profile 阻塞）会永久
// 卡住整个回合，沙箱 exec 原生支持秒级超时（超时杀进程组），这里兜底注入。
const BASH_DEFAULT_TIMEOUT_SECONDS = 120

// 配置版本：v2 起收紧默认策略（/tmp 全局写 → 每命令私有临时目录、秘密文件封禁扩容）
const CONFIG_VERSION = 2

// 默认沙箱策略（fail-closed 基线，用户配置只能在其上叠加，不能削弱默认封禁项）
const DEFAULT_CONFIG = {
  version: CONFIG_VERSION,
  enabled: false,
  network: {
    allowedDomains: [
      'npmjs.org', '*.npmjs.org', 'registry.npmjs.org', 'registry.yarnpkg.com',
      'pypi.org', '*.pypi.org',
      'github.com', '*.github.com', 'api.github.com', 'raw.githubusercontent.com'
    ],
    deniedDomains: []
  },
  filesystem: {
    // 敏感凭证目录禁读（deny-only：不在列表内的路径默认可读）
    denyRead: [
      '~/.ssh', '~/.aws', '~/.gnupg',
      '~/.config/gcloud', '~/.kube', '~/.docker'
    ],
    // 可写区（allow-only：'.' 在运行时锚定为会话工作空间；私有临时目录按命令注入）
    allowWrite: ['.'],
    // 秘密文件写封禁（相对项运行时锚定到工作空间；.env.example 想放开需手动加豁免）
    denyWrite: ['.env', '.env.*', '*.pem', '*.key', '*.p12', '*.pfx', 'secrets']
  }
}

// ===== 配置读写与开关 =====
let agentDir = ''

function configFile() {
  return path.join(agentDir, 'sandbox.json')
}

// 数组并集合并：默认封禁项不可被旧配置悄悄移除（安全默认优先）
function mergeArr(a, b) {
  return Array.from(new Set([].concat(a || [], b || [])))
}

function loadConfig() {
  let saved = {}
  try {
    saved = JSON.parse(fs.readFileSync(configFile(), 'utf-8'))
  } catch (e) {
    saved = {}
  }
  const sn = saved.network || {}
  const sf = saved.filesystem || {}
  const config = {
    version: CONFIG_VERSION,
    enabled: 'enabled' in saved ? !!saved.enabled : DEFAULT_CONFIG.enabled,
    network: {
      allowedDomains: mergeArr(DEFAULT_CONFIG.network.allowedDomains, sn.allowedDomains),
      deniedDomains: mergeArr(DEFAULT_CONFIG.network.deniedDomains, sn.deniedDomains)
    },
    filesystem: {
      denyRead: mergeArr(DEFAULT_CONFIG.filesystem.denyRead, sf.denyRead),
      allowWrite: mergeArr(DEFAULT_CONFIG.filesystem.allowWrite, sf.allowWrite),
      denyWrite: mergeArr(DEFAULT_CONFIG.filesystem.denyWrite, sf.denyWrite)
    }
  }
  // v1 → v2 迁移：旧默认放开的 /tmp 全局写移除（由每命令私有临时目录替代），写回生效
  if (!saved.version || saved.version < CONFIG_VERSION) {
    config.filesystem.allowWrite = config.filesystem.allowWrite.filter(p => p !== '/tmp')
    try { saveConfig(config) } catch (e) { /* 磁盘异常时内存配置仍生效 */ }
  }
  return config
}

function saveConfig(config) {
  fs.mkdirSync(agentDir, { recursive: true })
  fs.writeFileSync(configFile(), JSON.stringify(config, null, 2))
}

function init(dir) {
  agentDir = dir
}

function getSandboxConfig() {
  return loadConfig()
}

function setSandboxEnabled(enabled) {
  const config = loadConfig()
  config.enabled = !!enabled
  saveConfig(config)
  return config
}

// 网络域名持久授权：host(:port) 写入 sandbox.json 白名单（跨会话生效）。
// 「始终允许」对网络面必须落沙箱配置——若走权限系统的 persistAlwaysAllow
// 会把 network 这一扩展不认识的 surface 写进 config.json，导致整个权限配置失效
function persistNetworkAllow(value) {
  if (!value || typeof value !== 'string') return false
  const host = value.split(':')[0]
  if (!host) return false
  const config = loadConfig()
  if (config.network.allowedDomains.indexOf(host) >= 0) return true
  config.network.allowedDomains.push(host)
  try { saveConfig(config) } catch (e) { return false }
  return true
}

// ===== 运行时配置组装 =====
// 相对路径 → 会话工作空间绝对路径。sandbox-runtime 按 process.cwd() 解析相对路径，
// 而 Electron 主进程 cwd 不受控（通常是 /），必须显式锚定到工作空间
function resolveWorkspacePath(p, workspaceDir) {
  if (p === '.') return workspaceDir
  if (p === '~' || p.indexOf('~/') === 0) return p // sandbox-runtime 自行展开 ~
  if (path.isAbsolute(p)) return p
  return path.resolve(workspaceDir, p)
}

// 运行时只读豁免（allowWithinDeny）：内置 node/python 解释器与预装库目录。
// 即便 denyRead 扩到家目录，这些执行器仍可读（否则沙箱内命令无从运行）
function runtimeReadAllows() {
  try {
    const runtime = require('./runtime')
    const root = runtime.rootDir()
    return root ? [root] : []
  } catch (e) {
    return []
  }
}

// 组装 SandboxManager.initialize 的运行时配置（在默认基线上锚定路径 + 追加保护项）
function buildRuntimeConfig(workspaceDir) {
  const config = loadConfig()
  const fsc = config.filesystem
  // 配置文件自身禁写：沙箱内命令篡改 sandbox.json / 权限配置即提权
  const selfProtect = [configFile()]
  try {
    const permConfigPath = require('./permissions').configPath(agentDir)
    if (permConfigPath) selfProtect.push(permConfigPath)
  } catch (e) { /* permissions 模块不可用时跳过 */ }
  const denyWrite = Array.from(new Set([]
    .concat((fsc.denyWrite || []).map(p => resolveWorkspacePath(p, workspaceDir)))
    // 嵌套子树封禁（macOS 原生 glob；Linux 写路径不支持 glob，对应项被 runtime 跳过）
    .concat(['**/.env', '**/.env.*', '**/*.pem', '**/*.key', '**/*.p12', '**/*.pfx', '**/secrets/**'])
    .concat(selfProtect)))
  return {
    network: {
      allowedDomains: config.network.allowedDomains.slice(),
      deniedDomains: config.network.deniedDomains.slice()
    },
    filesystem: {
      denyRead: (fsc.denyRead || []).map(p => resolveWorkspacePath(p, workspaceDir)),
      allowRead: runtimeReadAllows(),
      allowWrite: (fsc.allowWrite || []).map(p => resolveWorkspacePath(p, workspaceDir)),
      denyWrite
    }
  }
}

// wrap 阶段互斥：私有临时目录经 process.env.CLAUDE_CODE_TMPDIR 传递（wrapper 在
// wrap 时读取并固化进子进程 env 前缀），并发 wrap 会互相覆盖，须串行化
let wrapChain = Promise.resolve()
function serializedWrap(fn) {
  const run = wrapChain.then(fn, fn)
  wrapChain = run.then(() => {}, () => {})
  return run
}

// ===== 多会话共享单例管理 =====
// SandboxManager 是进程级单例（网络代理/日志监控全局一份），多个会话并发启用
// 沙箱时按引用计数共享生命周期：首个会话 initialize，末个会话 shutdown 才 reset
// （中途 reset 会拆掉其他在用会话的代理）。网络审批回调按会话动态路由：
// 最近一次 wrap 命令的会话优先（审批卡落到发起命令的会话窗口）。
const askRouters = new Map() // 会话key → 网络审批回调
let lastActiveSession = ''
let sandboxRefCount = 0
let pendingInit = null
let SandboxManagerRef = null

async function initManagerShared(runtimeConfig, askCallbackFactory) {
  if (!pendingInit) {
    if (!SandboxManagerRef) throw new Error('SandboxManager 未注入')
    pendingInit = SandboxManagerRef.initialize(runtimeConfig, askCallbackFactory(), true)
      .catch(err => { pendingInit = null; throw err })
  }
  return pendingInit
}

// ===== 沙箱化 bash 执行 =====
// 沙箱化的 BashOperations：每命令建立私有临时目录，命令经 wrapWithSandbox
// 包裹（注入沙箱参数）后 spawn；退出时标注违规 + 清理临时目录
function createSandboxedBashOps(SandboxManager, runtimeConfigRef) {
  return {
    async exec(command, cwd, { onData, signal, timeout, env }) {
      if (!fs.existsSync(cwd)) {
        throw new Error('工作目录不存在: ' + cwd)
      }
      // 每命令私有临时目录：白名单外的专属可写区，退出即焚
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnibuddy-sbx-'))
      const fsBase = (runtimeConfigRef.config && runtimeConfigRef.config.filesystem) || {}
      // customConfig 提供时会整体替换 filesystem，须带上完整规则集 + 本次临时目录
      const customConfig = {
        filesystem: {
          denyRead: fsBase.denyRead || [],
          allowRead: fsBase.allowRead || [],
          allowWrite: [].concat(fsBase.allowWrite || [], [tmpDir]),
          denyWrite: fsBase.denyWrite || []
        }
      }
      const wrappedCommand = await serializedWrap(async () => {
        const prev = process.env.CLAUDE_CODE_TMPDIR
        process.env.CLAUDE_CODE_TMPDIR = tmpDir
        try {
          return await SandboxManager.wrapWithSandbox(command, undefined, customConfig)
        } finally {
          if (prev === undefined) delete process.env.CLAUDE_CODE_TMPDIR
          else process.env.CLAUDE_CODE_TMPDIR = prev
        }
      })
      try {
        return await new Promise((resolve, reject) => {
          const child = spawn('bash', ['-c', wrappedCommand], {
            cwd,
            detached: true,
            // Windows 上 bash（git-bash）为控制台程序：隐藏控制台防黑窗
            windowsHide: true,
            // TMPDIR/TMP/TEMP 指向私有目录（wrapper 的 env 前缀会把 TMPDIR 固化为同值）；
            // env 为技能凭据（spawnHook 注入），放最后合并（同名键以技能凭证为准）
            env: Object.assign({}, process.env, { TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir }, env || {}),
            stdio: ['ignore', 'pipe', 'pipe']
          })
          let timedOut = false
          let timeoutHandle
          // stderr 尾部缓存：违规标注按命令文本匹配，无需全文，保留尾部即可
          let stderrTail = ''
          const STDERR_KEEP = 8192
          if (timeout !== undefined && timeout > 0) {
            timeoutHandle = setTimeout(() => {
              timedOut = true
              if (child.pid) {
                try { process.kill(-child.pid, 'SIGKILL') } catch (e) { child.kill('SIGKILL') }
              }
            }, timeout * 1000)
          }
          child.stdout.on('data', onData)
          child.stderr.on('data', d => {
            stderrTail = (stderrTail + d.toString()).slice(-STDERR_KEEP)
            onData(d)
          })
          child.on('error', err => {
            if (timeoutHandle) clearTimeout(timeoutHandle)
            reject(err)
          })
          const onAbort = () => {
            if (child.pid) {
              try { process.kill(-child.pid, 'SIGKILL') } catch (e) { child.kill('SIGKILL') }
            }
          }
          if (signal) signal.addEventListener('abort', onAbort, { once: true })
          child.on('close', code => {
            if (timeoutHandle) clearTimeout(timeoutHandle)
            if (signal) signal.removeEventListener('abort', onAbort)
            // 违规标注：OS 层拦截的事件以 <sandbox_violations> 追加到输出尾部，
            // 模型据此修正命令而非面对无声失败（归因键 = 命令文本，与 wrap 一致）。
            // 过滤良性噪音：macOS libSystem 每个二进制启动都会探测
            // kern.iossupportversion 等 sysctl，默认 profile 拒绝但无实际影响，
            // 不过滤则每条命令都会带一长串违规标注（浪费 token 且误导模型）
            try {
              const annotated = SandboxManager.annotateStderrWithSandboxFailures(command, stderrTail)
              if (annotated && annotated.length > stderrTail.length) {
                const extra = annotated.slice(stderrTail.length)
                const benignOnly = /deny\(\d+\) sysctl-read kern\.iossupportversion/.test(extra) &&
                  !/\bdeny\(\d+\) (file|network|process|mach-lookup)/.test(extra)
                if (!benignOnly) onData(Buffer.from('\n' + extra))
              }
            } catch (e) { /* 标注失败不影响执行结果 */ }
            // Linux bwrap 挂载点清理（macOS no-op）
            try { SandboxManager.cleanupAfterCommand() } catch (e) { /* 忽略 */ }
            if (signal && signal.aborted) reject(new Error('aborted'))
            else if (timedOut) reject(new Error('timeout:' + timeout))
            else resolve({ exitCode: code })
          })
        })
      } finally {
        // 私有临时目录退出即焚（含正常/超时/中断/异常全部路径）
        try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch (e) { /* 忽略 */ }
      }
    }
  }
}

// ===== 会话沙箱扩展 =====
// 沙箱扩展工厂：session_start 时初始化 SandboxManager，并覆盖内置 bash 工具。
// piSdk 与 SandboxManager 由调用方（pi.js）预加载后注入（两者均为纯 ESM 包）；
// 工厂本身保持同步，以符合 pi extensionFactories 的签名约定。
// onStatus 回调用于把沙箱初始化结果通知渲染进程（成功/失败/禁用）。
// onAsk 回调（可选）是网络审批通道：info → Promise<action>，复用权限确认
// 前端管线（permission_ask → pendingPermissions → IPC reply）。
function createSandboxExtension(piSdk, workspaceDir, SandboxManager, onStatus, getSkillEnv, onAsk) {
  SandboxManagerRef = SandboxManager
  // 会话级回调标识：审批回调动态路由到「最近发起命令的会话」（代理是进程级
  // 单例，无法按连接归属会话，取活跃会话是可用的最近似；并发下跨会话误路由
  // 仅影响审批卡弹出的窗口，不影响授权语义）
  const sessionKey = 'k' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
  return function sandboxExtension(pi) {
    const config = loadConfig()
    let sandboxEnabled = false
    let initialized = false
    // 运行时配置快照：ops 的 per-command customConfig 基于它扩展
    const runtimeConfigRef = { config: null }

    // bash 工具的工作目录 = 当前会话绑定的工作空间
    const localBash = piSdk.createBashTool(workspaceDir)

    pi.registerTool(Object.assign({}, localBash, {
      label: 'bash (sandboxed)',
      async execute(id, params, signal, onUpdate) {
        // 默认超时兜底（两条路径统一在入口注入）：模型显式传了有效 timeout 时以模型为准
        const patched = Object.assign({}, params, {
          timeout: Number.isFinite(params && params.timeout) && params.timeout > 0
            ? params.timeout
            : BASH_DEFAULT_TIMEOUT_SECONDS
        })
        if (!sandboxEnabled || !initialized) {
          return localBash.execute(id, patched, signal, onUpdate)
        }
        lastActiveSession = sessionKey
        const sandboxedBash = piSdk.createBashTool(workspaceDir, {
          operations: createSandboxedBashOps(SandboxManager, runtimeConfigRef),
          // 技能凭据注入（与非沙箱路径同源取数）：经 spawnContext.env 传入 ops.exec
          spawnHook: getSkillEnv
            ? ({ command, cwd, env }) => ({ command, cwd, env: Object.assign({}, env, getSkillEnv()) })
            : undefined
        })
        return sandboxedBash.execute(id, patched, signal, onUpdate)
      }
    }))

    pi.on('session_start', async () => {
      if (!config.enabled) {
        onStatus && onStatus({ enabled: false, reason: 'disabled' })
        return
      }
      const platform = process.platform
      if (platform !== 'darwin' && platform !== 'linux') {
        onStatus && onStatus({ enabled: false, reason: 'unsupported-platform: ' + platform })
        return
      }
      try {
        const runtimeConfig = buildRuntimeConfig(workspaceDir)
        runtimeConfigRef.config = runtimeConfig
        // 网络动态审批（erichll 模型）：静态 deny/allow 未命中的连接逐次询问。
        // allow = 本次连接放行；allow_session = 域名并入运行时 allowlist（代理层
        // 直通，后续连接免询问，随会话销毁）；deny = 拒绝。无 onAsk 通道时未命中
        // 即拒绝（fail-closed）。enableLogMonitor 开启后 OS 拦截事件进入违规存储。
        // 多会话共享单例：仅首个会话的回调注册生效，内部按 lastActiveSession 路由
        if (onAsk) askRouters.set(sessionKey, onAsk)
        await initManagerShared(runtimeConfig, () => async ({ host, port }) => {
          const router = askRouters.get(lastActiveSession)
          const ask = router || null
          if (!ask) return false // 无审批通道：未命中白名单即拒绝（fail-closed）
          const target = host + (port ? ':' + port : '')
          const askId = 'sbx-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8)
          let action = 'deny'
          try {
            action = await ask({
              askId,
              surface: 'network',
              value: target,
              toolName: 'bash (sandboxed)',
              preview: '沙箱内命令请求访问外部网络'
            })
          } catch (e) {
            return false // 通道异常按拒绝处理（fail-closed）
          }
          if (action === 'allow') return true
          if (action === 'allow_session' || action === 'allow_always') {
            if (action === 'allow_always') {
              // 始终允许：域名写入 sandbox.json（跨会话生效）
              try { persistNetworkAllow(target) } catch (e) { /* 写盘失败仅本会话生效 */ }
            }
            try {
              const cur = runtimeConfigRef.config
              runtimeConfigRef.config = Object.assign({}, cur, {
                network: Object.assign({}, cur.network, {
                  allowedDomains: Array.from(new Set(
                    [].concat(cur.network.allowedDomains || [], [host])))
                })
              })
              SandboxManager.updateConfig(runtimeConfigRef.config)
            } catch (e) { /* updateConfig 失败则退化为逐次审批 */ }
            return true
          }
          return false
        })
        sandboxEnabled = true
        initialized = true
        sandboxRefCount++
        onStatus && onStatus({ enabled: true })
      } catch (err) {
        sandboxEnabled = false
        askRouters.delete(sessionKey)
        onStatus && onStatus({ enabled: false, reason: 'init-failed: ' + (err && err.message) })
      }
    })

    pi.on('session_shutdown', async () => {
      if (initialized) {
        initialized = false
        sandboxEnabled = false
        runtimeConfigRef.config = null
        askRouters.delete(sessionKey)
        sandboxRefCount--
        // 引用计数归零才真正销毁单例（还有其他会话在用时 reset 会拆掉其代理）
        if (sandboxRefCount <= 0) {
          sandboxRefCount = 0
          pendingInit = null
          try { await SandboxManager.reset() } catch (e) { /* 忽略清理错误 */ }
        }
      }
    })
  }
}

module.exports = {
  // 设定 agentDir 根目录
  init,
  // 读取合并默认基线后的沙箱配置
  getSandboxConfig,
  // 切换沙箱开关并写盘
  setSandboxEnabled,
  // 域名写入网络白名单（跨会话生效）
  persistNetworkAllow,
  // 组装 SandboxManager 运行时配置
  buildRuntimeConfig,
  // 沙箱扩展工厂（覆盖 bash、管理会话生命周期）
  createSandboxExtension
}
