// OmniBuddy exports/ 产物捕获：turn 开始快照 + tool_end 扫描 diff
// 背景：doc_export / generate_image 等工具自报 details.artifacts，但 bash /
// node / python / write 等工具写的交付文件不进产物管线（CHANGE_TOOLS 只覆盖
// fileChange diff，不产 artifacts）。本模块按「约定目录」补齐：任何工具执行后，
// exports/ 下相对 turn 基线新增的文件自动合成 artifacts（与工具自报的按路径
// 去重），随 tool_end 事件下发并落盘，前端产物卡片可见。
const fs = require('fs')
const path = require('path')

// 产物大小人性化（与 doc-export.fmtSize 同规则；独立实现避免 sessions → tools 反向依赖）
function fmtSize(n) {
  const v = Number(n) || 0
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB'
  if (v >= 1024) return (v / 1024).toFixed(1) + ' KB'
  return v + ' B'
}

// chatId -> Set<绝对路径小写>（turn 基线；跨 tool 累积防重复上报）
const baselines = new Map()

// 扫描 exports/ 顶层文件 → Map<absLower, { path, name, format, size, sizeText }>
function scanExports(workspaceDir) {
  const out = new Map()
  const dir = path.join(workspaceDir, 'exports')
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch (e) {
    return out // 目录不存在 / 不可读 = 无产物
  }
  for (const ent of entries) {
    if (!ent.isFile() || ent.name.startsWith('.')) continue
    const abs = path.join(dir, ent.name)
    try {
      const st = fs.statSync(abs)
      out.set(abs.toLowerCase(), {
        path: abs,
        name: ent.name,
        format: path.extname(ent.name).slice(1).toLowerCase(),
        size: st.size,
        sizeText: fmtSize(st.size)
      })
    } catch (e) { /* stat 失败跳过该文件 */ }
  }
  return out
}

// turn 开始：建立基线快照（assistant_start 时调用；工具执行前完成，不丢文件）
function baseline(chatId, workspaceDir) {
  if (!workspaceDir) { baselines.delete(chatId); return }
  baselines.set(chatId, new Set(scanExports(workspaceDir).keys()))
}

// 工具执行后：扫描新增文件合成 artifacts
// reported：本工具自报的 artifacts（doc_export 等），按路径去重不再重复上报
// → 新增 artifacts 数组（无新增返回 []）
function afterTool(chatId, workspaceDir, reported) {
  if (!workspaceDir) return []
  const known = baselines.get(chatId)
  if (!known) return [] // 无基线（非本 turn 场景）不捕风捉影
  // 工具自报的产物路径登记为已知（同路径不重复出卡）
  for (const a of (reported || [])) {
    if (a && a.path) known.add(String(a.path).toLowerCase())
  }
  const current = scanExports(workspaceDir)
  const fresh = []
  for (const [key, meta] of current) {
    if (known.has(key)) continue
    known.add(key) // 后续工具不重复上报
    fresh.push(meta)
  }
  return fresh
}

// 会话结束清理（内存回收；缺省靠进程生命周期兜底亦可）
function drop(chatId) {
  baselines.delete(chatId)
}

module.exports = {
  // turn 开始建立 exports/ 基线快照
  baseline,
  // tool_end 扫描 diff 出新增产物（与工具自报去重）
  afterTool,
  // 会话清理
  drop
}
