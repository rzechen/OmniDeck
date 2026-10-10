// OmniBuddy LLM 流式客户端：对接 OpenAI 兼容接口（/chat/completions）
// 响应解析按 content-type 分流：
//  - text/event-stream：SSE 增量（OpenAI choices.delta.content / Anthropic delta.text）
//  - application/json：整体 JSON（部分端点如智谱 api/anthropic 对 stream:true 仍返回
//    非流式 JSON），一次性取 choices[0].message.content 或 Anthropic content[].text

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

  const ctype = String(res.headers.get('content-type') || '').toLowerCase()

  // ===== 非流式 JSON 响应：一次性解析 =====
  if (ctype.indexOf('application/json') !== -1) {
    const data = await res.json()
    console.log('[omnibuddy:llm] json 响应：', JSON.stringify(data).slice(0, 300))
    let text = ''
    // OpenAI 风格：choices[0].message.content（流式回退时或为 delta.content）
    const choice = data.choices && data.choices[0]
    const msg = choice && (choice.message || choice.delta)
    if (msg && typeof msg.content === 'string') text = msg.content
    // Anthropic 风格：content: [{type:'text', text}]
    if (!text && Array.isArray(data.content)) {
      text = data.content
        .filter(b => b && b.type === 'text' && typeof b.text === 'string')
        .map(b => b.text)
        .join('')
    }
    text = String(text || '')
    if (text && onDelta) onDelta(text, text)
    console.log('[omnibuddy:llm] reply <-', JSON.stringify(text.slice(0, 200)))
    return text
  }

  // ===== SSE 流式响应 =====
  const reader = res.body.getReader()
  const decoder = new TextDecoder('utf-8')
  let buf = ''
  let full = ''
  let sampleCount = 0

  // 单行处理：OpenAI choices[0].delta.content 与 Anthropic delta.text 双格式兼容
  function handleLine(t) {
    if (!t.startsWith('data:')) return
    const payload = t.slice(5).trim()
    if (payload === '[DONE]') return
    try {
      const json = JSON.parse(payload)
      const delta = json.choices && json.choices[0] && json.choices[0].delta
      let text = delta && (delta.content || '')
      if (!text && json.delta && typeof json.delta.text === 'string') text = json.delta.text
      if (text) {
        full += text
        if (onDelta) onDelta(text, full)
      }
    } catch (e) {
      /* 跳过无法解析的行 */
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() // 末行可能不完整，留在缓冲区
    for (const line of lines) {
      const t = line.trim()
      if (sampleCount < 5) {
        sampleCount++
        console.log('[omnibuddy:llm] 原始行' + sampleCount + '：', JSON.stringify(t.slice(0, 200)))
      }
      handleLine(t)
    }
  }
  // 尾行 flush：单行响应（无换行结尾）整块滞留缓冲区，此前被直接丢弃
  if (buf.trim()) handleLine(buf.trim())

  console.log('[omnibuddy:llm] reply <-', JSON.stringify(full.slice(0, 200)))
  return full
}

module.exports = {
  // OpenAI/Anthropic 兼容接口对话（SSE 流式 + JSON 整体响应双解析）
  streamChat
}
