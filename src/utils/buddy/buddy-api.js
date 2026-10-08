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
