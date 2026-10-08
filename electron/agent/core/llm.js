// OmniBuddy LLM 流式客户端：对接 OpenAI 兼容接口（/chat/completions，SSE 流式）
// M1 阶段实现纯对话；M2 引入 pi SDK（@earendil-works/pi-coding-agent）承载工具循环

// 发起流式对话，onDelta(text) 逐段回调，返回完整回复文本
// 外部通过 abortSignal 中断
async function streamChat({ baseUrl, apiKey, model, messages, signal, onDelta }) {
  const url = String(baseUrl).replace(/\/+$/, '') + '/chat/completions'
  console.log('[omnibuddy:llm] request ->', url, 'model=' + model, 'messages=' + messages.length)
  const headers = { 'Content-Type': 'application/json' }
  if (apiKey) headers.Authorization = 'Bearer ' + apiKey

  const res = await fetch(url, {
    method: 'POST',
    headers,
    signal,
    body: JSON.stringify({
      model,
      messages,
      stream: true
    })
  })

  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.text()).slice(0, 300)
    } catch (e) { /* 忽略 */ }
    throw new Error('模型服务返回 ' + res.status + (detail ? '：' + detail : ''))
  }

  // 解析 SSE 流：按行读取，data: 前缀的 JSON 中取 choices[0].delta.content
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() // 末行可能不完整，留在缓冲区
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (payload === '[DONE]') return full
      try {
        const json = JSON.parse(payload)
        const delta = json.choices && json.choices[0] && json.choices[0].delta
        const text = delta && (delta.content || '')
        if (text) {
          full += text
          if (onDelta) onDelta(text, full)
        }
      } catch (e) {
        /* 跳过无法解析的行 */
      }
    }
  }
  console.log('[omnibuddy:llm] reply <-', JSON.stringify(full.slice(0, 200)))
  return full
}

module.exports = {
  // OpenAI 兼容接口 SSE 流式对话
  streamChat
}
