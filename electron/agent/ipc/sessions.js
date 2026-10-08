// OmniBuddy 会话管理 IPC：会话 CRUD / 消息读取 / 点赞反馈 / 删除、
// 会话资产化（导出 MD·HTML·PDF·Word、用量看板）、检查点回滚、
// 回退与分支（truncate / branch / variant）。
const { ipcMain, app, dialog } = require('electron')
const path = require('path')
const sessions = require('../sessions/sessions')
const exportSession = require('../sessions/export')
const docExport = require('../tools/doc-export')
const usage = require('../platform/usage')
const checkpoints = require('../sessions/checkpoints')
const piRuntime = require('../pi')
const { emit, running } = require('../core/chat-state')
const { deleteSessionFast } = require('../core/pi-events')

// 注册会话管理相关 IPC（getWindow 由 index.js 注入）
function registerSessionsIpc(getWindow) {
  // ===== 会话资产化（N4） =====
  // 导出：MD / 自包含 HTML（保存对话框 → 写文件 → 可打开所在目录）
  ipcMain.handle('omnibuddy:session:export', async (_e, { id, format }) => exportSession.exportSession(id, format))

  // 打开导出文件所在目录
  ipcMain.handle('omnibuddy:session:export-reveal', (_e, filePath) => exportSession.revealFile(filePath))

  // 单条消息导出（文档导出）：markdown → PDF / Word / HTML（pandoc 管线，
  // 与 doc_export 工具共用 convertMarkdown；保存对话框由用户选择落点）
  ipcMain.handle('omnibuddy:message:export', async (_e, { content, format, filename }) => {
    const md = String(content || '')
    if (!md.trim()) return { ok: false, error: '内容为空，无可导出内容' }
    const fmt = ['pdf', 'docx', 'html'].indexOf(format) >= 0 ? format : 'docx'
    const ext = fmt === 'docx' ? 'docx' : fmt
    const label = { pdf: 'PDF 文档', docx: 'Word 文档', html: '网页' }[fmt]
    const safe = String(filename || 'OmniBuddy-回答').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40)
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), safe + '.' + ext),
      filters: [{ name: label, extensions: [ext] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    const r = docExport.convertMarkdown(md, { format: fmt, outPath: filePath, title: safe })
    if (!r.ok) return { ok: false, error: r.error }
    return { ok: true, filePath: r.filePath }
  })

  // 用量看板：30 天窗口聚合（日/会话TOP5/模型分布）
  ipcMain.handle('omnibuddy:usage:summarize', () => usage.summarize({ days: 30 }))

  // 用量明细导出 CSV
  ipcMain.handle('omnibuddy:usage:export-csv', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: path.join(app.getPath('downloads'), `OmniDeck-用量明细-${Date.now()}.csv`),
      filters: [{ name: 'CSV', extensions: ['csv'] }]
    })
    if (canceled || !filePath) return { ok: false, canceled: true }
    const fs = require('fs')
    fs.writeFileSync(filePath, '\uFEFF' + usage.exportCsv(), 'utf-8')
    return { ok: true, filePath }
  })

  // 检查点：时间线 / 回滚（回滚 = 文件恢复 + 消息截断 + dispose 重建，前端刷新）
  ipcMain.handle('omnibuddy:session:checkpoints', (_e, id) => checkpoints.listCheckpoints(id))

  ipcMain.handle('omnibuddy:session:rollback', async (_e, { id, n }) => {
    if (running.has(id)) {
      return { ok: false, error: '会话回复中，请先停止再回滚' }
    }
    const meta = sessions.readMeta(id)
    const res = checkpoints.rollback(id, n, meta && meta.workspaceDir)
    if (res.ok) {
      // 回滚即上下文重置：连同 pi 落盘转录一并作废（防 resume 复活回滚前历史）
      await piRuntime.invalidateSessionFiles(id)
      emit(getWindow, id, { type: 'rolled_back' })
    }
    return res
  })

  // ===== 会话管理 =====
  ipcMain.handle('omnibuddy:sessions:list', () => sessions.listSessions())

  ipcMain.handle('omnibuddy:sessions:search', (_e, q) => sessions.searchSessions(q))

  ipcMain.handle('omnibuddy:session:create', (_e, opts) => sessions.createSession(opts || {}))

  ipcMain.handle('omnibuddy:session:messages', (_e, id) => sessions.getMessages(id))
  // 会话运行态查询（前端 loadHistory 兜底恢复流式占位：定时任务在页面打开前已启动的场景）
  ipcMain.handle('omnibuddy:session:is-running', (_e, id) => running.has(id))

  // 点赞/点踩持久化（'like' | 'dislike' | '' 取消），写入消息 JSONL 记录
  ipcMain.handle('omnibuddy:session:feedback', (_e, { id, messageId, feedback }) =>
    sessions.setFeedback(id, messageId, feedback))

  ipcMain.handle('omnibuddy:session:rename', (_e, { id, title }) => sessions.renameSession(id, title))

  // 置顶/取消置顶（任务列表置顶 hover 按钮）
  ipcMain.handle('omnibuddy:session:pin', (_e, { id, pinned }) => sessions.setPinned(id, !!pinned))

  ipcMain.handle('omnibuddy:session:delete', async (_e, id) => {
    // 删除即会话终结，记忆摘要后台留档（deleteSessionFast），IPC 秒回不阻塞 UI
    await deleteSessionFast(id)
    return true
  })

  // ===== 回退与分支 =====
  // 回退到某条消息：丢弃该消息及之后的记录（用于"从此处重新提问"），
  // pi 会话与落盘转录必须一并作废（否则 resume 会复活截断前的上下文）
  ipcMain.handle('omnibuddy:session:truncate', async (_e, { id, messageId }) => {
    if (running.has(id)) {
      return { ok: false, error: '当前会话正在回复中，请先停止' }
    }
    await piRuntime.invalidateSessionFiles(id)
    const messages = sessions.truncateFrom(id, messageId)
    emit(getWindow, id, { type: 'truncated', messages })
    return { ok: true, messages }
  })

  // 以某条消息为分叉点创建分支会话（源会话不动），返回新会话
  ipcMain.handle('omnibuddy:session:branch', async (_e, { id, messageId }) => {
    if (running.has(id)) {
      return { ok: false, error: '当前会话正在回复中，请先停止' }
    }
    const meta = sessions.branchFrom(id, messageId)
    if (!meta) return { ok: false, error: '消息不存在或创建失败' }
    return { ok: true, session: meta }
  })

  // ===== 会话内分支（branch）：编辑问题重新提问 =====
  // 以既有用户问题为锚点创建新「变体」消息（editOf 指向组头、anchors 继承组头路径），
  // 落盘后返回记录；随后前端经 session:send（userMessageId）触发回答，
  // 回答及其后续消息的 anchors = 组头路径 + [变体id]，即新分支线路
  ipcMain.handle('omnibuddy:session:variant', (_e, { id, messageId, text }) => {
    if (running.has(id)) {
      return { ok: false, error: '当前会话正在回复中，请先停止' }
    }
    const content = String(text || '').trim()
    if (!content) return { ok: false, error: '内容不能为空' }
    const msgs = sessions.getMessages(id)
    const target = msgs.find(m => m.id === messageId)
    if (!target || target.role !== 'user') return { ok: false, error: '原问题不存在' }
    // 组头 = 最初的问题消息（messageId 可能已是变体，editOf 归一）
    const headId = target.editOf || target.id
    const head = headId === target.id ? target : msgs.find(m => m.id === headId)
    const headAnchors = Array.isArray(head && head.anchors) ? head.anchors : []
    const { record } = sessions.addMessage(id, {
      role: 'user',
      content,
      editOf: headId,
      anchors: headAnchors.slice()
    })
    return { ok: true, message: record }
  })

  // 单个会话 meta（前端恢复会话绑定的工作空间）
  ipcMain.handle('omnibuddy:session:meta', (_e, id) => sessions.readMeta(id))
}

module.exports = {
  // 注册会话管理 IPC（CRUD / 导出 / 用量 / 检查点 / 回退分支）
  registerSessionsIpc
}
