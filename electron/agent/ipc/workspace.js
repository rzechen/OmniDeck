// OmniBuddy 工作空间与知识资产 IPC：附件导入（“+”选择 / 拖拽）、Skills 管理
// （增删改查 / ZIP 导入导出）、多工作空间管理、空间文件管理（网盘风格）、
// 项目规则（AGENTS.md）、我的资料、记忆管理（pi-memory 文件读写）。
const { ipcMain, dialog } = require('electron')
const sessions = require('../sessions/sessions')
const workspaces = require('../workspace/workspaces')
const files = require('../workspace/files')
const skills = require('../knowledge/skills')
const attachments = require('../workspace/attachments')
const rules = require('../knowledge/rules')
const profile = require('../knowledge/profile')
const memory = require('../knowledge/memory')
const piRuntime = require('../pi')
const { deleteSessionFast } = require('../core/pi-events')

// 注册工作空间与知识资产相关 IPC（getWindow 由 index.js 注入）
function registerWorkspaceIpc(getWindow) {
  // ===== 附件导入 =====
  // 缩略图生成器：桥接模式用 shim 的异步 thumbDataUrl（经主进程 nativeImage），
  // 主进程模式直接 createFromBuffer；两者签名统一为 async (buffer) => dataUrl
  function makeThumbFn(nativeImage) {
    if (nativeImage && typeof nativeImage.thumbDataUrl === 'function') {
      return (buffer) => nativeImage.thumbDataUrl(buffer, { width: 360, quality: 72 })
    }
    if (nativeImage && typeof nativeImage.createFromBuffer === 'function') {
      return async (buffer) => {
        try {
          const img = nativeImage.createFromBuffer(buffer)
          if (img.isEmpty()) return ''
          // toJPEG 返回 Buffer，须手工拼 dataURL 前缀
          return 'data:image/jpeg;base64,' + img.resize({ width: 360 }).toJPEG(72).toString('base64')
        } catch (e) {
          return ''
        }
      }
    }
    return null
  }

  // “+”按钮：系统文件选择框（图片 / 文本类 / PDF / Office 文档）
  ipcMain.handle('omnibuddy:attachments:pick', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: '支持的附件（图片/文本/PDF/Office）', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'pdf',
          'txt', 'md', 'markdown', 'json', 'csv', 'log', 'yml', 'yaml', 'xml', 'html', 'htm',
          'js', 'ts', 'jsx', 'tsx', 'vue', 'py', 'java', 'c', 'cpp', 'h', 'hpp', 'cs', 'go',
          'rs', 'rb', 'php', 'sh', 'bash', 'zsh', 'sql', 'css', 'scss', 'less', 'ini', 'conf', 'toml', 'env',
          'docx', 'pptx', 'xlsx', 'odt', 'odp', 'ods', 'odg', 'rtf', 'epub', 'tex'] }
      ]
    })
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true }
    const { nativeImage } = require('electron')
    const thumbFn = makeThumbFn(nativeImage)
    const list = []
    for (const p of result.filePaths) {
      const r = await attachments.importFile(p, thumbFn)
      if (r.ok) list.push(r.attachment)
    }
    return { ok: true, attachments: list }
  })

  // 拖拽导入：渲染端 webUtils.getPathForFile 取真实路径后调用
  ipcMain.handle('omnibuddy:attachments:import', async (_e, filePath) => {
    const { nativeImage } = require('electron')
    return attachments.importFile(String(filePath || ''), makeThumbFn(nativeImage))
  })

  // 粘贴导入：剪贴板 File 无磁盘路径，渲染端读内容为 Buffer 传来
  //（data 为 Uint8Array 经结构化克隆传输，与 skills:import-zip 同模式）
  ipcMain.handle('omnibuddy:attachments:import-buffer', async (_e, { data, name, mime }) => {
    const { nativeImage } = require('electron')
    return attachments.importBuffer(Buffer.from(data), name, mime, makeThumbFn(nativeImage))
  })

  // 预解析附件文本（导入后渲染层调用）：pdf/office 经 officeparser 抽取，
  // 结果缓存于 agent 进程内存，发送（buildTextBlock）直接复用
  ipcMain.handle('omnibuddy:attachments:parse', (_e, meta) => attachments.parseAttachment(meta))

  // ===== Skills 管理 =====
  ipcMain.handle('omnibuddy:skills:list', () => skills.listSkills())

  ipcMain.handle('omnibuddy:skills:create', (_e, skill) => skills.createSkill(skill || {}))

  ipcMain.handle('omnibuddy:skills:delete', (_e, dir) => skills.deleteSkill(dir))

  // ZIP 导入：data 为前端 File 转来的 Uint8Array（结构化克隆传输）
  ipcMain.handle('omnibuddy:skills:validate-zip', (_e, data) => skills.validateZip(data))

  ipcMain.handle('omnibuddy:skills:import-zip', (_e, payload) =>
    skills.importZip(payload.data, !!payload.overwrite))

  ipcMain.handle('omnibuddy:skills:get', (_e, dir) => skills.getSkill(dir))

  ipcMain.handle('omnibuddy:skills:update', (_e, payload) => skills.updateSkill(payload))

  // 导出 Skill 为 ZIP（返回 Buffer，前端触发下载）
  ipcMain.handle('omnibuddy:skills:export-zip', (_e, dir) => skills.exportZip(dir))

  // ===== 工作空间管理（多工作空间，发送前必须选定） =====
  ipcMain.handle('omnibuddy:workspaces:list', () => workspaces.list())

  // 添加本地目录为工作空间（弹出系统目录选择框）
  ipcMain.handle('omnibuddy:workspaces:add', async () => {
    const win = getWindow()
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory', 'createDirectory'] })
    if (result.canceled || !result.filePaths.length) return { ok: false, canceled: true }
    return workspaces.add(result.filePaths[0])
  })

  // 解绑工作空间：解除登记 + 删除该空间下全部会话（复用单会话删除的完整清理链，
  // 记忆摘要照常留档、不清除记忆）；返回被删会话 id 供前端清理页签与会话池
  ipcMain.handle('omnibuddy:workspaces:remove', async (_e, id) => {
    const removed = sessions.listSessions()
      .filter(s => s.workspaceId === id)
      .map(s => s.id)
    for (const sid of removed) {
      // 复用单会话删除快速路径：本地清理即时完成，摘要后台串行留档
      await deleteSessionFast(sid)
    }
    const r = workspaces.remove(id)
    if (!r.ok) return r
    return { ok: true, removedSessions: removed }
  })

  // 更新工作空间展示名（任务列表分组与关联弹窗回显以此为准）
  // 级联：同步刷新所有绑定该空间的会话元数据 displayName（列表分组/会话池快照随读随新）
  ipcMain.handle('omnibuddy:workspaces:rename', (_e, payload) => {
    const r = workspaces.rename(payload.id, payload.name)
    if (!r.ok) return r
    for (const meta of sessions.listSessions()) {
      if (meta.workspaceId === payload.id) sessions.setWorkspace(meta.id, payload.id, meta.workspaceDir, payload.name)
    }
    return r
  })

  // ===== 空间文件管理（网盘风格）=====
  ipcMain.handle('omnibuddy:files:list', (_e, dir) => files.list(dir))
  ipcMain.handle('omnibuddy:files:mkdir', (_e, payload) => files.mkdir(payload.dir, payload.name))
  ipcMain.handle('omnibuddy:files:create', (_e, payload) => files.createFile(payload.dir, payload.name))
  ipcMain.handle('omnibuddy:files:rename', (_e, payload) => files.rename(payload.path, payload.name))
  ipcMain.handle('omnibuddy:files:trash', (_e, p) => files.trash(p))
  ipcMain.handle('omnibuddy:files:trash-batch', (_e, paths) => files.trashBatch(paths))
  ipcMain.handle('omnibuddy:files:empty', (_e, dir) => files.empty(dir))
  ipcMain.handle('omnibuddy:files:read', (_e, p) => files.read(p))
  ipcMain.handle('omnibuddy:files:read-image', (_e, p) => files.readImage(p))
  ipcMain.handle('omnibuddy:files:write', (_e, payload) => files.write(payload.path, payload.content))
  ipcMain.handle('omnibuddy:files:reveal', (_e, p) => files.reveal(p))
  ipcMain.handle('omnibuddy:files:open', (_e, p) => files.open(p))
  ipcMain.handle('omnibuddy:files:import-dialog', (_e, dir) => files.importDialog(dir))
  ipcMain.handle('omnibuddy:files:import-paths', (_e, payload) => files.importPaths(payload.dir, payload.paths))

  // ===== 项目规则：全局 / 工作空间 AGENTS.md 读写，pi SDK 原生装载 =====
  // 保存后销毁全部 pi 会话：规则注入发生在会话创建时，新会话才能装载新规则
  ipcMain.handle('omnibuddy:rules:targets', () => rules.targets())

  ipcMain.handle('omnibuddy:rules:get', (_e, key) => rules.getRule(key))

  ipcMain.handle('omnibuddy:rules:save', async (_e, { key, content }) => {
    const r = rules.saveRule(key, content)
    if (r.ok) await piRuntime.disposeAllSessions()
    return r
  })

  // ===== 我的资料：结构化个人背景，systemPrompt 确定性注入 =====
  // 保存后销毁全部 pi 会话（同规则页语义：注入发生在会话创建时）
  ipcMain.handle('omnibuddy:profile:get', () => profile.get())

  ipcMain.handle('omnibuddy:profile:save', async (_e, cfg) => {
    const data = profile.save(cfg)
    await piRuntime.disposeAllSessions()
    return { ok: true, data }
  })

  // ===== 记忆管理（增强）：pi-memory 记忆文件读写 + qmd 就绪状态 =====
  // 保存后销毁全部 pi 会话：pi-memory 的上下文注入按快照机制在会话边界刷新
  //（与规则页同模式），保证下一次对话装载最新记忆
  ipcMain.handle('omnibuddy:memory:list', () => memory.list())

  ipcMain.handle('omnibuddy:memory:read', (_e, rel) => memory.read(rel))

  ipcMain.handle('omnibuddy:memory:write', async (_e, payload) => {
    const r = memory.write(payload.path, payload.content)
    if (r.ok) await piRuntime.disposeAllSessions()
    return r
  })

  // 单条删除长期记忆（分型条目按 id 定位，重写 MEMORY.md）
  ipcMain.handle('omnibuddy:memory:remove-entry', async (_e, entryId) => {
    const r = memory.removeEntry(entryId)
    if (r.ok) await piRuntime.disposeAllSessions()
    return r
  })

  ipcMain.handle('omnibuddy:memory:status', () => memory.status())

  // 导出记忆（Markdown 汇总保存对话框；与 export.js 会话导出同模式）
  ipcMain.handle('omnibuddy:memory:export', () => memory.exportMemory())
}

module.exports = {
  // 注册工作空间与知识资产 IPC（附件 / Skills / 工作空间 / 文件 / 规则 / 资料 / 记忆）
  registerWorkspaceIpc
}
