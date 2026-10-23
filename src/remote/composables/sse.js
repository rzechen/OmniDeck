// SSE 连接管理：EventSource 断线自动重连，onEvent 分发数据帧
export function createSse(onEvent, onState) {
  let es = null
  return {
    connect(token) {
      if (es) { try { es.close() } catch (e) { /* 忽略 */ } }
      es = new EventSource('/api/events?token=' + encodeURIComponent(token))
      es.onopen = () => onState && onState(true)
      es.onmessage = e => {
        try { onEvent(JSON.parse(e.data)) } catch (err) { /* 忽略坏帧 */ }
      }
      es.onerror = () => onState && onState(false)
    },
    close() {
      if (es) { try { es.close() } catch (e) { /* 忽略 */ } }
      es = null
    }
  }
}
