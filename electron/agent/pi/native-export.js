// pi 原生导出（HTML / JSONL）：pi 转录为唯一数据源。
// SDK 主入口未导出导出模块，经绝对路径 deep import（绕过 exports 白名单，
// 与 deployChildMcpExtension 同模式）：
// - export-html/index.js 的 exportFromFile：standalone 导出任意会话文件（无 AgentState）
// - session-export.js 的 exportSessionToJsonl：SessionManager → JSONL
const path = require('path')
const { pathToFileURL } = require('url')
const { state, loadPi, PROJECT_ROOT } = require('./state')
const { findLatestSessionFile } = require('./session')

// 导出模块惰性加载（单例；deep import 项目根 node_modules 内 SDK 的 dist/core）
let piExportModules = null
async function loadExportModules() {
  if (!piExportModules) {
    const pkg = path.join(PROJECT_ROOT, 'node_modules', '@earendil-works',
      'pi-coding-agent', 'dist', 'core')
    piExportModules = {
      html: await import(pathToFileURL(path.join(pkg, 'export-html', 'index.js')).href),
      jsonl: await import(pathToFileURL(path.join(pkg, 'session-export.js')).href)
    }
  }
  return piExportModules
}

// 原生导出会话（当前活跃线路）：html（自包含页面，含工具渲染）/ jsonl（完整
// agent 转录，机器可复放）。内存会话走 AgentSession 实例方法（扩展工具渲染器
// 可用）；无内存会话打开落盘转录走独立导出函数
async function exportNative(chatId, format, outputPath) {
  const cached = state.sessions.get(chatId)
  if (cached && cached.session) {
    if (format === 'jsonl') {
      return { ok: true, filePath: cached.session.exportToJsonl(outputPath) }
    }
    return { ok: true, filePath: await cached.session.exportToHtml(outputPath) }
  }
  const sessionFile = findLatestSessionFile(path.join(state.agentDir, 'sessions', chatId))
  if (!sessionFile) {
    return { ok: false, error: '会话无 pi 转录（未在本机对话过或转录已清理），无可导出内容' }
  }
  const mods = await loadExportModules()
  if (format === 'jsonl') {
    const pi = await loadPi()
    const sm = pi.SessionManager.open(sessionFile)
    return { ok: true, filePath: mods.jsonl.exportSessionToJsonl(sm, outputPath) }
  }
  return { ok: true, filePath: await mods.html.exportFromFile(sessionFile, { outputPath }) }
}

module.exports = {
  // 原生导出会话（html 自包含页面 / jsonl 完整转录；pi 转录为唯一数据源）
  exportNative
}
