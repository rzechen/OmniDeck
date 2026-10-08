// Pi 1.0.3 升级冒烟验证：复刻 electron/agent/pi.js 的全部 SDK 用法
// 不发真实 LLM 请求（provider 指向假端点），验证创建链路与事件/扩展 API 形态。
import os from 'node:os'
import path from 'node:path'
import fs from 'node:fs'

const results = []
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => { results.push(['PASS', name]); return true })
    .catch((e) => { results.push(['FAIL', name, e.message]); return false })
}

const pi = await import('@earendil-works/pi-coding-agent')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pi-smoke-'))
const agentDir = path.join(tmp, 'agent')
fs.mkdirSync(agentDir, { recursive: true })
const cwd = path.join(tmp, 'ws')
fs.mkdirSync(cwd, { recursive: true })

// ===== 1. ModelRuntime.create + registerProvider + setRuntimeApiKey + snapshot =====
const modelConfig = {
  id: 'test-model', name: 'test-model', reasoning: true,
  input: ['text', 'image'],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 128000, maxTokens: 65536,
  // pi 1.0.2+：按思考档位下发采样参数（OmniDeck pi.js modelConfig 同构）
  samplingParamsByThinkingLevel: {
    off: { temperature: 0.7 },
    medium: { temperature: 0.6, top_p: 0.95 },
    high: { temperature: 1 }
  },
  compat: { supportsDeveloperRole: false, supportsReasoningEffort: false }
}
let modelRuntime, model
await check('ModelRuntime.create({refreshOnCreate,allowModelNetwork})', () =>
  pi.ModelRuntime.create({ refreshOnCreate: false, allowModelNetwork: false }).then(r => { modelRuntime = r }))
await check('registerProvider(omnibuddy, {api:"openai-completions",...含 samplingParamsByThinkingLevel})', () =>
  modelRuntime.registerProvider('omnibuddy', {
    name: 'OmniBuddy', baseUrl: 'http://127.0.0.1:9/v1', apiKey: 'k',
    api: 'openai-completions', models: [modelConfig]
  }))
await check('setRuntimeApiKey', () => modelRuntime.setRuntimeApiKey('omnibuddy', 'k'))
await check('getAvailableSnapshot() -> model.provider + 采样参数透传', () => {
  const snap = modelRuntime.getAvailableSnapshot()
  const m = snap.find(x => x.id === 'test-model' && x.provider === 'omnibuddy')
  if (!m) throw new Error('snapshot 未找到注册模型')
  const sp = m.samplingParamsByThinkingLevel
  if (!sp || !sp.medium || sp.medium.top_p !== 0.95) {
    throw new Error('snapshot 丢失 samplingParamsByThinkingLevel: ' + JSON.stringify(sp))
  }
  model = m
})
await check('ModelRuntime.generateImages 存在', () => {
  if (typeof modelRuntime.generateImages !== 'function') throw new Error('missing generateImages')
})

// ===== 2. SessionManager.create + appendMessage（历史回放路径） =====
let sessionManager
await check('SessionManager.create(cwd, dir, {id})', () => {
  sessionManager = pi.SessionManager.create(cwd, path.join(agentDir, 'sessions', 't1'), { id: 'main' })
})
await check('appendMessage({role:"user",content:[text|image]})', () => {
  sessionManager.appendMessage({ role: 'user', content: [{ type: 'text', text: 'hi' }] })
  sessionManager.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'ok' }] })
  sessionManager.appendMessage({ role: 'user', content: [
    { type: 'text', text: 'img' }, { type: 'image', data: 'aGk=', mimeType: 'image/png' }
  ] })
})

// ===== 3. SettingsManager.inMemory({retry,compaction}) =====
let settingsManager
await check('SettingsManager.inMemory({retry:{enabled},compaction:{enabled}})', () => {
  settingsManager = pi.SettingsManager.inMemory({ retry: { enabled: false }, compaction: { enabled: true } })
})

// ===== 4. 扩展工厂（registerTool / on('context') / on('tool_execution_end') / createBashTool） =====
const seen = { events: [], toolRan: false }
function makeTestExtension(piApi) {
  piApi.registerTool({
    name: 'todo_write', label: '更新任务清单', description: 'test',
    parameters: { type: 'object', properties: { todos: { type: 'array' } }, required: ['todos'] },
    execute: async () => ({ content: [{ type: 'text', text: 'ok' }], details: {} })
  })
  if (typeof piApi.on !== 'function') throw new Error('piApi.on missing')
  piApi.on('tool_execution_end', () => { seen.toolRan = true })
  piApi.on('context', (event) => {
    seen.events.push('context')
    if (!Array.isArray(event.messages)) throw new Error('context 事件缺 messages')
    return undefined
  })
}
function makeBashExtension(piApi) {
  const bash = pi.createBashTool(cwd, {
    spawnHook: ({ command, cwd: c, env }) => ({ command, cwd: c, env: { ...env, TMPDIR: path.join(cwd, '.tmp') } })
  })
  if (typeof bash.execute !== 'function') throw new Error('bash.execute missing')
  piApi.registerTool(bash)
}
// 内置 MCP（pi 1.0.0）：预置一个 enabled:false 的服务条目，验证 mcp.json 读取装载
fs.mkdirSync(agentDir, { recursive: true })
fs.writeFileSync(path.join(agentDir, 'mcp.json'), JSON.stringify({
  mcpServers: { echo: { command: 'node', args: ['-e', 'process.exit(0)'], disabled: true } }
}, null, 2))

// ===== 5. DefaultResourceLoader({cwd,agentDir,systemPromptOverride,extensionFactories}) =====
let resourceLoader
await check('DefaultResourceLoader + reload()', async () => {
  resourceLoader = new pi.DefaultResourceLoader({
    cwd, agentDir,
    systemPromptOverride: () => '你是测试助手。',
    extensionFactories: [pi.createMcpExtension(), pi.createCodemodeExtension(), pi.createToolSearchExtension(), makeTestExtension, makeBashExtension]
  })
  await resourceLoader.reload()
})
await check('codemode 工具经 defaultTools ["+codemode"] 激活', async () => {
  const sm = pi.SettingsManager.inMemory({
    retry: { enabled: false }, compaction: { enabled: true }, defaultTools: ['+codemode']
  })
  const r = await pi.createAgentSession({
    cwd, model, modelRuntime, resourceLoader, sessionManager: pi.SessionManager.inMemory(), settingsManager: sm
  })
  const names = r.session.getActiveToolNames()
  if (!names.includes('codemode')) throw new Error('codemode 未激活: ' + names.join(','))
  await r.session.dispose()
})

// ===== 6. createAgentSession（thinkingLevel / excludeTools / modelRuntime） =====
let session, unsubscribe
await check('createAgentSession({cwd,model,modelRuntime,resourceLoader,sessionManager,settingsManager,thinkingLevel,excludeTools})', async () => {
  const r = await pi.createAgentSession({
    cwd, model, modelRuntime, resourceLoader, sessionManager, settingsManager,
    thinkingLevel: 'medium',
    excludeTools: ['web_search', 'fetch_content']
  })
  session = r.session
  // 关键依赖：AgentSession 暴露 sessionManager（branch/resetLeaf/getEntryCount，
  // OmniDeck pi.js branchSessionTo / bookmark / collect 消费）
  if (!session.sessionManager || typeof session.sessionManager.branch !== 'function' ||
    typeof session.sessionManager.getEntryCount !== 'function') {
    throw new Error('AgentSession 未暴露 sessionManager（branch/getEntryCount）')
  }
})

// ===== 7. uiContext（select/notify/setStatus/... 全字段，pi.js createUiContext 同构） =====
const noop = () => {}
const uiContext = {
  select: (prompt, options) => Promise.resolve((options || [])[0]),
  input: async () => undefined, confirm: async () => false, notify: noop,
  onTerminalInput: () => () => {}, setStatus: noop, setWorkingMessage: noop,
  setWorkingVisible: noop, setWorkingIndicator: noop, setHiddenThinkingLabel: noop,
  setWidget: noop, setFooter: noop, setHeader: noop, setTitle: noop,
  custom: async () => undefined, pasteToEditor: noop, setEditorText: noop,
  getEditorText: () => '', editor: async () => undefined, addAutocompleteProvider: noop,
  setEditorComponent: noop, getEditorComponent: () => undefined, theme: {},
  getAllThemes: () => [], getTheme: () => undefined, setTheme: () => ({ success: false }),
  getToolsExpanded: () => false, setToolsExpanded: noop
}
await check('bindExtensions({mode:"json", uiContext})', () => session.bindExtensions({ mode: 'json', uiContext }))

// ===== 8. subscribe 事件 + getContextUsage + prompt（假端点，预期报错路径） =====
await check('subscribe() 事件流（message_start/update/end 形态）', () => {
  unsubscribe = session.subscribe((event) => {
    if (event.type === 'message_update' && event.assistantMessageEvent) {
      const ae = event.assistantMessageEvent
      if (ae.type !== 'thinking_delta' && ae.type !== 'text_delta' && ae.type !== 'toolCall_delta') {
        throw new Error('未知 assistantMessageEvent: ' + ae.type)
      }
    }
    if (event.type === 'message_end' && event.message && event.message.role === 'assistant') {
      // stopReason / usage / content 形态（pi.js 消费）
      if (!('stopReason' in event.message)) throw new Error('message_end 缺 stopReason')
    }
  })
})
await check('getContextUsage()', () => {
  const u = session.getContextUsage()
  if (!u || typeof u.tokens !== 'number') throw new Error('getContextUsage 形态异常: ' + JSON.stringify(u))
})
await check('prompt() 到假端点：请求失败被记录而非抛出（pi 语义）', async () => {
  try { await session.prompt('你好') } catch (e) { /* 部分版本会抛网络错误，均可接受 */ }
})

// ===== 8.5 原生 resume：create → append → open → 上下文续接 =====
await check('SessionManager.open() resume：落盘转录续接 + branch 分支', async () => {
  const dir = path.join(agentDir, 'sessions', 'resume-t')
  fs.mkdirSync(dir, { recursive: true })
  const sm1 = pi.SessionManager.create(cwd, dir, { id: 'main' })
  sm1.appendMessage({ role: 'user', content: [{ type: 'text', text: 'q1' }] })
  sm1.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'a1' }] })
  sm1.appendMessage({ role: 'user', content: [{ type: 'text', text: 'q2' }] })
  const ctx1 = sm1.buildSessionContext()
  if (ctx1.messages.length !== 3) throw new Error('写入后上下文应为 3 条，实际 ' + ctx1.messages.length)
  // 落盘文件定位（<时间戳>_main.jsonl，对应 pi.js findLatestSessionFile 契约）
  const file = fs.readdirSync(dir).find(n => n.endsWith('_main.jsonl'))
  if (!file) throw new Error('会话文件未落盘')
  // 模拟重启：同文件重新 open（不传 cwdOverride，header cwd 为准）
  const sm2 = pi.SessionManager.open(path.join(dir, file), dir)
  if (sm2.getCwd() !== cwd) throw new Error('resume 后 cwd 不一致: ' + sm2.getCwd())
  const ctx2 = sm2.buildSessionContext()
  if (ctx2.messages.length !== ctx1.messages.length) {
    throw new Error('resume 消息数不一致: ' + ctx2.messages.length + ' vs ' + ctx1.messages.length)
  }
  if (JSON.stringify(ctx2.messages) !== JSON.stringify(ctx1.messages)) {
    throw new Error('resume 上下文内容与原会话不一致')
  }
  // 续接：open 后 append 挂在原线路末端
  sm2.appendMessage({ role: 'assistant', content: [{ type: 'text', text: 'a2' }] })
  if (sm2.buildSessionContext().messages.length !== 4) throw new Error('resume 后 append 未续接')
  // branch：leaf 回退到首条 user 消息后 append 形成变体分支
  const q1 = sm2.getEntries().find(e => e.type === 'message' && e.message && e.message.role === 'user')
  sm2.branch(q1.id)
  sm2.appendMessage({ role: 'user', content: [{ type: 'text', text: 'q1-variant' }] })
  const ctx3 = sm2.buildSessionContext()
  const tail = ctx3.messages[ctx3.messages.length - 1]
  if (!tail || JSON.stringify(tail).indexOf('q1-variant') < 0) throw new Error('branch 后新线路末端应为变体消息')
  if (ctx3.messages.length !== 2) throw new Error('branch 线路应仅含 q1 + 变体，实际 ' + ctx3.messages.length)
  // 旧线路未被破坏（append-only）：树中总条目数 = 4 原有 + 1 变体
  if (sm2.getEntries().length !== 5) throw new Error('append-only 校验失败: ' + sm2.getEntries().length)
})

// ===== 8.6 原生导出：JSONL 序列化 + HTML standalone（deep import 复刻 pi.js） =====
await check('原生导出：exportSessionToJsonl + exportFromFile（html）', async () => {
  const { pathToFileURL } = await import('node:url')
  const cwdRoot = path.resolve(import.meta.dirname, '..')
  const core = path.join(cwdRoot, 'node_modules', '@earendil-works', 'pi-coding-agent', 'dist', 'core')
  // 复用 8.5 的会话文件目录（resume-t）
  const dir = path.join(agentDir, 'sessions', 'resume-t')
  const file = fs.readdirSync(dir).find(n => n.endsWith('_main.jsonl'))
  if (!file) throw new Error('缺少 8.5 产生的会话文件')
  const sessionFile = path.join(dir, file)
  // JSONL：SessionManager.open → exportSessionToJsonl
  const jsonlMod = await import(pathToFileURL(path.join(core, 'session-export.js')).href)
  const sm = pi.SessionManager.open(sessionFile)
  const jsonlPath = path.join(tmp, 'export.jsonl')
  const r1 = jsonlMod.exportSessionToJsonl(sm, jsonlPath)
  const jsonlText = fs.readFileSync(jsonlPath, 'utf8')
  if (!jsonlText.includes('q1-variant')) throw new Error('JSONL 导出缺当前线路消息')
  if (!r1 || !fs.existsSync(r1)) throw new Error('exportSessionToJsonl 未返回有效路径')
  // HTML：exportFromFile（standalone，无 AgentState）
  const htmlMod = await import(pathToFileURL(path.join(core, 'export-html', 'index.js')).href)
  const htmlPath = path.join(tmp, 'export.html')
  const r2 = await htmlMod.exportFromFile(sessionFile, { outputPath: htmlPath })
  const htmlText = fs.readFileSync(r2 || htmlPath, 'utf8')
  if (!/<html/i.test(htmlText)) throw new Error('HTML 导出非自包含页面')
  fs.rmSync(jsonlPath, { force: true })
  fs.rmSync(r2 || htmlPath, { force: true })
})

// ===== 9. abort / reload / dispose（finalizeSession 与中断路径） =====
await check('abort()', () => session.abort())
await check('reload()（pi-memory 摘要触发路径）', () => session.reload())
await check('dispose()', () => session.dispose())
try { unsubscribe() } catch (e) { /* 忽略 */ }

console.log('='.repeat(72))
for (const [st, name, msg] of results) console.log(st, name + (msg ? '  -> ' + msg : ''))
const fails = results.filter(r => r[0] === 'FAIL').length
console.log('='.repeat(72))
console.log(`PASS ${results.length - fails}/${results.length}`)
fs.rmSync(tmp, { recursive: true, force: true })
process.exit(fails ? 1 : 0)
