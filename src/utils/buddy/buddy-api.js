/**
 * OmniBuddy 渲染进程 → 主进程 IPC 桥统一入口
 * （原 8 个页面各自实现一份 api()/filesApi() 的获取逻辑，抽此统一；
 *  chat 页的 Web 端 stub 降级仍在页面内自行处理）
 */

/** 完整 omnibuddy 桥（不可用时返回 null，由调用方降级提示） */
export function buddyApi() {
  return (window.electronAPI && window.electronAPI.omnibuddy) || null
}

/** 指定子桥（如 'market' / 'files' / 'connectors'），不可用返回 null */
export function buddyApiSection(name) {
  const api = buddyApi()
  return (api && api[name]) || null
}

/**
 * 统一附件导入（拖拽 / 粘贴共用）：
 * - 拖拽或带磁盘路径的 File → webUtils.getPathForFile 取路径走 importAttachment
 * - 粘贴的剪贴板 File（无路径）→ 读内容为 Uint8Array 走 importAttachmentBuffer
 * 返回 { ok, attachment } / { ok:false, error } / null（桌面桥不可用）
 */
export async function importFileObject(file) {
  const api = buddyApi()
  if (!api || !api.importAttachment) return null
  // 路径优先（Electron 32+ File.path 已移除，须经 webUtils 取真实路径）
  let p = ''
  const bridge = window.electronAPI
  if (bridge && bridge.getPathForFile) {
    try { p = bridge.getPathForFile(file) } catch (e) { p = '' }
  }
  if (p) return api.importAttachment(p)
  // 无路径（粘贴）：读内容走 Buffer 管道
  if (api.importAttachmentBuffer) {
    const data = new Uint8Array(await file.arrayBuffer())
    return api.importAttachmentBuffer({ data, name: file.name, mime: file.type })
  }
  return { ok: false, error: '附件导入需要 OmniDeck 桌面端' }
}

/**
 * 附件预解析（导入后调用）：pdf/office 经 officeparser 抽取文本并缓存于
 * agent 进程，发送（buildTextBlock）直接命中缓存；text 类同步直读秒回。
 * 返回 { ok, chars } / { ok:false, error } / null（桌面桥不可用）
 */
export function parseAttachment(meta) {
  const api = buddyApi()
  if (!api || !api.parseAttachment) return null
  return api.parseAttachment(meta)
}
