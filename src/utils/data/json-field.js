/**
 * JSON 字段输入工具：市场/连接器/技能等管理页弹窗共用
 * （原 mcp.vue 与 skills.vue 中逐字符相同的两份实现抽此统一）
 */

/**
 * 解析弹窗中的 JSON 字符串
 * - 空串返回空数组/空对象（按 kind）
 * - 解析失败或类型不符：弹出错误提示并返回 false（由调用方兜底拦截）
 */
export function parseJsonField(vm, str, label, kind) {
  const text = (str || '').trim()
  if (!text) return kind === 'array' ? [] : {}
  let parsed = null
  try {
    parsed = JSON.parse(text)
  } catch (e) {
    parsed = null
  }
  const valid = parsed !== null && (kind === 'array'
    ? Array.isArray(parsed)
    : (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)))
  if (!valid) {
    vm.$message.error(label + '不是合法的 JSON ' + (kind === 'array' ? '数组' : '对象'))
    return false
  }
  return parsed
}

/**
 * JSON 字段失焦自动格式化：合法且类型匹配时美化回填，非法时提示
 * @param {object} form 持有字段的表单对象（直接回写）
 * @param {object} vm   组件实例（用于 $message 提示）
 */
export function formatJsonField(form, field, kind, label, vm) {
  const text = String(form[field] || '').trim()
  if (!text) return
  try {
    const parsed = JSON.parse(text)
    const valid = kind === 'array'
      ? Array.isArray(parsed)
      : (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
    if (!valid) throw new Error('bad')
    form[field] = JSON.stringify(parsed, null, 2)
  } catch (e) {
    vm.$message.error((label || '该字段') + '不是合法的 JSON ' + (kind === 'array' ? '数组' : '对象'))
  }
}
