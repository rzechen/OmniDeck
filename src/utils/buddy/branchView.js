// OmniBuddy 会话内分支（branch）视图计算 —— 渲染层版
// 与主进程 electron/agent/branchView.js 保持同构，双端算法必须一致：
//   - 渲染层：按用户切换（或默认最新变体）过滤出显示消息列表
//   - 主进程：按发送时的目标线路过滤出 AI 上下文（历史回放）
//
// 数据模型（JSONL 消息新增可选字段）：
//   - editOf：用户消息「变体」指向组头消息 id（编辑问题重新提问 = 创建变体）
//   - anchors：消息所属分支路径（锚点 = 各级激活变体 id 数组）
//     * 组头及其原始后续：anchors = 组头创建时的路径（主线为空数组）
//     * 变体消息：anchors = 组头路径
//     * 变体的后续消息（回答等）：anchors = 组头路径 + [变体id]
//
// 过滤算法（按 JSONL 顺序线性遍历，维护当前线路期望路径 expected）：
//   - 遇到组头：组头自身 anchors 须匹配 expected（组在本线路上才可见），
//     显示其激活变体；expected 更新为 组头路径+[变体id]（原始线不延长）
//   - 变体消息：跳过（已在组头位置显示）
//   - 普通消息：anchors 与 expected 精确一致才显示
//   - todo 卡片为会话级全局组件，豁免线路匹配
const SEP = '\u0000'

function keyOf(arr) {
  return Array.isArray(arr) ? arr.join(SEP) : ''
}

// 计算分支视图
// active：{ 组头id -> 激活变体id }（缺省取组内最新变体）
// 返回 { list：显示消息, groups：{ 组头id -> { headId, variants } }, anchors：当前线路路径 }
export function computeBranchView(messages, active) {
  const act = active || {}
  const byId = new Map()
  const variantIds = new Map() // 组头id -> [变体id...]（不含组头，按出现顺序）
  for (const m of (messages || [])) {
    if (!m || !m.id) continue
    byId.set(m.id, m)
    if (m.editOf) {
      if (!variantIds.has(m.editOf)) variantIds.set(m.editOf, [])
      variantIds.get(m.editOf).push(m.id)
    }
  }
  const groups = {}
  for (const [headId, ids] of variantIds) {
    groups[headId] = { headId, variants: [headId].concat(ids) }
  }

  const list = []
  let expected = []
  for (const m of (messages || [])) {
    if (!m) continue
    if (m.role === 'todo') { // 会话级全局卡片：不受线路影响
      list.push(m)
      continue
    }
    if (m.editOf) continue // 变体在组头位置显示
    const g = m.id ? groups[m.id] : null
    if (g) {
      // 组头须在本线路上（anchors 匹配 expected）
      if (keyOf(m.anchors) !== keyOf(expected)) continue
      const vId = (act[m.id] && byId.has(act[m.id])) ? act[m.id] : g.variants[g.variants.length - 1]
      const v = byId.get(vId) || m
      // 组头位置输出激活变体（浅拷贝注入分支信息，不污染原记录）
      list.push(Object.assign({}, v, {
        _branch: { headId: m.id, total: g.variants.length, index: g.variants.indexOf(vId) + 1 }
      }))
      expected = vId === m.id ? (m.anchors || []) : (m.anchors || []).concat([vId])
      continue
    }
    if (keyOf(m.anchors) === keyOf(expected)) list.push(m)
  }
  return { list, groups, anchors: expected.slice() }
}

// 按目标线路（anchors 数组）推导每组激活变体：变体 id 出现在目标线路中则激活，
// 否则走组头原始线。主进程构建 AI 上下文时使用（与渲染层用户切换等价）。
export function resolveActiveByAnchors(messages, anchors) {
  const target = new Set(Array.isArray(anchors) ? anchors : [])
  const act = {}
  for (const m of (messages || [])) {
    if (m && m.editOf && target.has(m.id)) act[m.editOf] = m.id
  }
  return act
}
