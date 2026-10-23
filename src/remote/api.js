// 移动端 API 客户端：统一 token 注入（query，SSE/普通请求共用）
let token = ''

export function setApiToken(t) {
  token = String(t || '')
}

export function getApiToken() {
  return token
}

export default function api(method, path, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } }
  const url = path + (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token)
  if (body) opt.body = JSON.stringify(body)
  return fetch(url, opt).then(r => r.json())
}
