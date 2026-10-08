// pi 运行时共享状态（单例）：SDK 惰性加载、agentDir、模型运行时、会话注册表
// 与各映射书签。provider / session / native-export 等子模块经本模块读写同一份
// state，对外 API 仍由上层 pi.js 门面统一导出。
const path = require('path')

// 项目根锚点：dev 为 electron/agent/pi → 上三级；打包后 dist-electron/agent/pi 同构
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..')

// pi SDK 惰性加载（单例）
let piSdk = null
async function loadPi() {
  if (!piSdk) {
    piSdk = await import('@earendil-works/pi-coding-agent')
  }
  return piSdk
}

const state = {
  agentDir: '',
  // ModelRuntime + 已解析模型（provider 变化时重建）
  modelRuntime: null,
  model: null,
  providerKey: '',
  // 当前 provider 配置快照（轻量 LLM 直调复用，如自动生成会话标题）
  provider: null,
  // chatId -> { session, unsubscribe }
  sessions: new Map(),
  // 回放初始化的映射（chatId -> [{ mid, entryId }]，consumeReplayMap 读后删）
  replayMaps: new Map(),
  // prompt 前的条目数书签（chatId -> entryCount，collectNewMessages 增量基线）
  bookmarks: new Map(),
  // 待应用的分支切换（chatId -> entryId | null；null = resetLeaf）。
  // 内存无会话时记录，resume open 成功后应用；回放重建路径自动失效
  pendingBranches: new Map()
}

module.exports = {
  // 项目根目录（dev 与打包后同构，定位 node_modules 内 SDK 入口用）
  PROJECT_ROOT,
  // pi SDK 惰性加载（单例；pi-coding-agent 为纯 ESM 包，CJS 主进程经 dynamic import() 装载）
  loadPi,
  // 运行时共享状态：agentDir / 模型运行时 / provider 快照 / 会话注册表 / 映射与书签
  state
}
