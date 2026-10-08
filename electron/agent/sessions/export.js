// 会话导出：pi 原生双格式，pi 转录为唯一数据源（不自研渲染）
// - html：自包含页面（原生 exportToHtml / exportFromFile，含工具渲染与主题）
// - jsonl：当前活跃线路完整 agent 转录（原生 exportToJsonl，机器可复放/审计）
// 导出目录：用户下载目录/OmniDeck 导出/<标题>-<日期>.{html,jsonl}
const path = require('path')
const { app, dialog, shell } = require('electron')
const sessions = require('./sessions')
const piRuntime = require('../pi')

// ===== 辅助函数 =====
function fileStamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function safeName(s) {
  return String(s || '会话').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40)
}

// ===== 导出入口（保存对话框 → pi 原生导出） =====
async function exportSession(sessionId, format) {
  if (format !== 'html' && format !== 'jsonl') {
    return { ok: false, error: '不支持的导出格式（原生仅 html / jsonl）' }
  }
  const meta = sessions.readMeta(sessionId)
  if (!meta) return { ok: false, error: '会话不存在' }

  const base = `${safeName(meta.title)}-${fileStamp()}`
  const filters = format === 'html'
    ? [{ name: '自包含 HTML（pi 原生）', extensions: ['html'] }]
    : [{ name: '会话转录 JSONL（pi 原生）', extensions: ['jsonl'] }]
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: path.join(app.getPath('downloads'), base + '.' + format),
    filters
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  const r = await piRuntime.exportNative(sessionId, format, filePath)
  if (!r.ok) return r
  return { ok: true, filePath: r.filePath || filePath }
}

// 导出成功后「打开所在目录」
function revealFile(filePath) {
  try {
    shell.showItemInFolder(filePath)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

module.exports = {
  // 导出会话（保存对话框 → pi 原生导出）
  exportSession,
  // 在文件管理器中定位导出产物
  revealFile
}
