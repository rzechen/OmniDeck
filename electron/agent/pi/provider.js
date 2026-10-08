// pi 模型 / Provider 注册（OpenAI 兼容 / OpenAI Responses / Anthropic 三种 apiFormat）。
// 职责：把渲染层 provider 表单配置映射为 pi-ai 的 provider/model 注册，落盘
// models.json（subagents 子进程读）与 model-tiers.json（深度研究档位路由），
// 并在配置指纹变化时重建 ModelRuntime。
const path = require('path')
const fs = require('fs')
const { state, loadPi } = require('./state')

// ===== 常量 =====
const PROVIDER_ID = 'omnibuddy'

// 深度研究：三档模型映射（small 轻量 / medium 标准 / big 强力）。
// 渲染层在 provider 对象上携带 tiers: { small: {baseUrl, apiKey, model}, ... }，
// 主进程为每档注册专属 provider（omnibuddy-small 等）并写 ~/.pi/workflows/model-tiers.json，
// workflow 子代理按 tier 路由到对应模型（未配置档位经 inheritMainModel 回落主模型）
const WORKFLOW_TIERS = ['small', 'medium', 'big']
const TIER_LABELS = { small: '轻量', medium: '标准', big: '强力' }

function tierProviderId(tier) {
  return PROVIDER_ID + '-' + tier
}

// 提取有效档位配置（baseUrl / model 齐全才参与映射）
function tiersOf(p) {
  const t = p && p.tiers
  if (!t || typeof t !== 'object') return {}
  const out = {}
  for (const tier of WORKFLOW_TIERS) {
    const c = t[tier]
    if (c && c.baseUrl && c.model) out[tier] = c
  }
  return out
}

// ===== 表单配置 → SDK 参数映射 =====
// 表单 apiFormat → pi-ai KnownApi 映射
function apiOf(p) {
  if (p.apiFormat === 'anthropic') return 'anthropic-messages'
  if (p.apiFormat === 'openai-responses') return 'openai-responses'
  return 'openai-completions'
}

// 表单思考模式 → SDK ThinkingLevel 映射（follow 跟随模型默认 / on 显式开启 / off 关闭）
function thinkingLevelOf(p) {
  if (p && p.thinkingMode === 'off') return 'off'
  if (p && p.thinkingMode === 'on') return 'high'
  return 'medium'
}

// 采样参数（pi 1.0.2+ 原生 samplingParamsByThinkingLevel）：
// 表单按思考档位配置 temperature / top_p，随模型配置下发（OpenAI 兼容接口生效，
// 留空不下发、使用端点默认值）。档位与表单思考模式对应：off / follow(medium) / on(high)
function samplingOf(p) {
  const s = p && p.sampling
  if (!s || typeof s !== 'object') return undefined
  const pick = (o) => {
    if (!o || typeof o !== 'object') return undefined
    const out = {}
    if (Number.isFinite(+o.temperature)) out.temperature = +o.temperature
    if (Number.isFinite(+o.top_p)) out.top_p = +o.top_p
    return Object.keys(out).length ? out : undefined
  }
  const by = {}
  for (const lvl of ['off', 'medium', 'high']) {
    const v = pick(s[lvl])
    if (v) by[lvl] = v
  }
  return Object.keys(by).length ? by : undefined
}

function providerKeyOf(p) {
  // 重建 key 含档位映射与模型高级配置：任一变化都需要重建运行时
  const tiers = tiersOf(p)
  const tierSig = WORKFLOW_TIERS.filter(t => tiers[t])
    .map(t => t + '=' + [tiers[t].baseUrl, tiers[t].model, tiers[t].apiKey || ''].join('~'))
    .join('|')
  const advSig = [
    p.apiFormat || 'openai',
    p.modelSeries || 'default',
    p.contextWindowInput || '',
    p.contextWindowOutput || '',
    p.toolTurns || '',
    p.imageInput === false ? '0' : '1',
    p.thinkingMode || 'follow',
    JSON.stringify(samplingOf(p) || '')
  ].join('~')
  return [p.baseUrl, p.model, p.apiKey || '', tierSig, advSig, p.imageModel || ''].join('|')
}

function modelConfig(p) {
  // 采样参数（pi 1.0.2+）：按思考档位下发 temperature / top_p（未配置时省略字段）
  const sampling = samplingOf(p)
  return {
    id: p.model,
    name: p.model,
    // 开启推理：模型才能产出 thinking 内容块（extended thinking）
    reasoning: p.thinkingMode !== 'off',
    input: p.imageInput === false ? ['text'] : ['text', 'image'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    // 上下文输入上限：留空使用推荐值（128k）
    contextWindow: p.contextWindowInput || 128000,
    // 思考模型的 thinking 预算（如 32768）占用输出额度，maxTokens 必须大于预算，
    // 否则兼容端点报 400: max_completion_tokens must be greater than thinking_budget
    maxTokens: p.contextWindowOutput || 65536,
    ...(sampling ? { samplingParamsByThinkingLevel: sampling } : {}),
    compat: {
      supportsDeveloperRole: false,
      // 不主动发送 reasoning_effort：各家兼容端点对该参数的映射不一（有的映射为
      // 大额 thinking_budget 导致 400），思考内容按模型默认行为经 reasoning_content 回流
      supportsReasoningEffort: false
    }
  }
}

// ===== 配置落盘 =====
// 写 models.json：subagents 子进程无法接收运行时参数，从 agentDir 读取 provider 配置。
// （图像生成不在此注册：generate_image 由 image-gen.js 提供，OpenAI images 兼容格式）
function writeModelsJson(p) {
  const file = path.join(state.agentDir, 'models.json')
  let existing = {}
  try {
    existing = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) { /* 首次不存在 */ }
  const providers = existing.providers || {}
  // 清掉历史档位专属 provider（档位调整/取消后不留残影）
  for (const key of Object.keys(providers)) {
    if (key !== PROVIDER_ID && key.indexOf(PROVIDER_ID + '-') === 0) delete providers[key]
  }
  providers[PROVIDER_ID] = {
    baseUrl: p.baseUrl,
    apiKey: p.apiKey || '',
    api: apiOf(p),
    models: [modelConfig(p)]
  }
  // 注：图像生成不注册进 models.json（SDK 内置通道仅认 openrouter-images）——
  // generate_image 由 image-gen.js 提供（OpenAI images 兼容格式，读镜像图像条目）
  // 深度研究：档位专属 provider 同步落盘（子进程场景可读）
  const tiers = tiersOf(p)
  for (const tier of WORKFLOW_TIERS) {
    const c = tiers[tier]
    if (!c) continue
    providers[tierProviderId(tier)] = {
      baseUrl: c.baseUrl,
      apiKey: c.apiKey || '',
      api: apiOf(c),
      models: [modelConfig({ model: c.model })]
    }
  }
  fs.writeFileSync(file, JSON.stringify({ providers }, null, 2))
  // 含明文 apiKey（subagents 子进程需明文读取，无法加密），收紧文件权限防同机其他账户读取
  try { fs.chmodSync(file, 0o600) } catch (e) { /* chmod 失败不影响功能 */ }
}

// 写 ~/.pi/workflows/model-tiers.json（pi-dynamic-workflows 读取）：
// 档位 → "providerId/modelId" spec；空映射写 { tiers: {} }，加载器视为
// 无配置（合法降级：子代理按 inheritMainModel 回落主模型）
function writeModelTiers(p) {
  try {
    const os = require('os')
    const file = path.join(os.homedir(), '.pi', 'workflows', 'model-tiers.json')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    const tiers = tiersOf(p)
    const map = {}
    for (const tier of WORKFLOW_TIERS) {
      if (tiers[tier]) map[tier] = tierProviderId(tier) + '/' + tiers[tier].model
    }
    fs.writeFileSync(file, JSON.stringify({ tiers: map }, null, 2))
  } catch (e) { /* 写失败降级：档位回落主模型，不影响对话 */ }
}

// ===== 运行时构建 =====
async function ensureRuntime(provider) {
  const key = providerKeyOf(provider)
  // provider 快照无论如何都刷新（轻量直调取最新配置；重建运行时仍按 key 判定）
  state.provider = {
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey || '',
    model: provider.model,
    apiFormat: provider.apiFormat || 'openai',
    imageModel: provider.imageModel || '',
    imageBaseUrl: provider.imageBaseUrl || '',
    imageApiKey: provider.imageApiKey || ''
  }
  if (state.modelRuntime && state.providerKey === key) return
  console.log('[omnibuddy:pi] runtime provider ->', provider.baseUrl, 'model=' + provider.model)
  const pi = await loadPi()
  const runtime = await pi.ModelRuntime.create({
    refreshOnCreate: false,
    allowModelNetwork: false
  })
  runtime.registerProvider(PROVIDER_ID, {
    name: provider.name || 'OmniBuddy',
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey || '',
    api: apiOf(provider),
    // 仅注册 chat 模型：图像生成由 image-gen.js 的 generate_image 工具提供
    models: [modelConfig(provider)]
  })
  if (provider.apiKey) {
    await runtime.setRuntimeApiKey(PROVIDER_ID, provider.apiKey)
  }
  // 深度研究：档位专属 provider 注册（每档独立 baseUrl/apiKey/model）
  const tiers = tiersOf(provider)
  for (const tier of WORKFLOW_TIERS) {
    const c = tiers[tier]
    if (!c) continue
    const pid = tierProviderId(tier)
    runtime.registerProvider(pid, {
      name: (provider.name || 'OmniBuddy') + ' · ' + TIER_LABELS[tier],
      baseUrl: c.baseUrl,
      apiKey: c.apiKey || '',
      api: apiOf(c),
      models: [modelConfig({ model: c.model })]
    })
    if (c.apiKey) {
      await runtime.setRuntimeApiKey(pid, c.apiKey)
    }
  }
  const snapshot = runtime.getAvailableSnapshot()
  // 主模型匹配限定主 provider（tier 模型可能与主模型同名，避免错拿档位实例）
  const model = snapshot.find(m => m.id === provider.model && m.provider === PROVIDER_ID) ||
    snapshot.find(m => m.id === provider.model) || snapshot[0]
  if (!model) throw new Error('模型注册失败：' + provider.model)
  writeModelsJson(provider)
  writeModelTiers(provider)

  // provider 变化：丢弃旧会话（各会话持有旧 model 引用）
  if (state.sessions.size) {
    for (const s of state.sessions.values()) {
      try { s.unsubscribe() } catch (e) { /* 忽略 */ }
      try { s.session.dispose() } catch (e) { /* 忽略 */ }
    }
    state.sessions.clear()
  }
  state.modelRuntime = runtime
  state.model = model
  state.providerKey = key
}

// 当前 provider 配置快照（OpenAI 兼容端点直调用，如自动生成会话标题）。
// imageConfigured：generate_image 能力可用判定——附着式 imageModel 或镜像中
// 存在独立图像条目（type: 'image'）任一命中即 true（capabilities 消费）
function getProviderInfo() {
  const info = Object.assign({}, state.provider)
  let hasImageEntry = false
  try {
    const mirror = JSON.parse(fs.readFileSync(
      path.join(state.agentDir, '..', 'automation', 'providers.json'), 'utf-8'))
    hasImageEntry = ((mirror && mirror.providers) || [])
      .some(x => x && x.type === 'image' && x.baseUrl && x.model)
  } catch (e) { /* 镜像不可读：仅附着式判定 */ }
  info.imageConfigured = !!(info.imageModel || hasImageEntry)
  return info
}

module.exports = {
  // 主 provider 注册 id
  PROVIDER_ID,
  // 表单 apiFormat → pi-ai KnownApi 映射
  apiOf,
  // 表单思考模式 → SDK ThinkingLevel 映射
  thinkingLevelOf,
  // 模型配置构造（采样参数 / 兼容开关 / 上下文窗口）
  modelConfig,
  // 确保模型运行时就绪（配置指纹变化时重建并清空旧会话）
  ensureRuntime,
  // 当前 provider 配置快照（含 imageConfigured 能力判定）
  getProviderInfo
}
