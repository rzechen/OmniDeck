// pi 树分支切换与增量映射：宿主自有 JSONL 消息 ↔ pi 会话树条目的对齐层。
// 分支切换（branch/resetLeaf）、prompt 前后增量收集、回放映射消费均在此。
const { state } = require('./state')

// ===== 分支切换 =====
// 切换会话线路（分支线路变化时调用）：entryId = 目标线路锚点（线路末条消息的
// pi entry id）；null = resetLeaf（首条消息重提场景）。
// 会话在内存 → 直接操作 sessionManager（AgentSession 每轮 prompt 从 leaf
// 重建上下文，append-only 不破坏旧线路）；无内存会话 → 记 pending，
// resume open 成功后应用（若最终走回放重建则自动失效，锚点不存在的
// pending 会抛错回退回放）
async function branchSessionTo(chatId, entryId) {
  const entry = state.sessions.get(chatId)
  const sm = entry && entry.session && entry.session.sessionManager
  if (sm) {
    try {
      if (entryId === null || entryId === undefined) {
        sm.resetLeaf()
      } else {
        if (!sm.getEntry(entryId)) return { ok: false, error: 'branch 锚点不存在' }
        sm.branch(entryId)
      }
      return { ok: true }
    } catch (e) {
      return { ok: false, error: (e && e.message) || String(e) }
    }
  }
  state.pendingBranches.set(chatId, entryId === undefined ? null : entryId)
  return { ok: true }
}

// ===== 增量映射 =====
// prompt 前记录条目数书签（collectNewMessages 的增量基线）
function markSessionBookmark(chatId) {
  const entry = state.sessions.get(chatId)
  const sm = entry && entry.session && entry.session.sessionManager
  if (!sm) return
  try { state.bookmarks.set(chatId, sm.getEntryCount()) } catch (e) { /* 忽略 */ }
}

// prompt 后收集新增的 user/assistant 消息条目（entry 级，不含 toolCall/
// toolResult/compaction 等），供宿主与自有 JSONL 消息对齐写回 pi-map
function collectNewMessages(chatId) {
  const entry = state.sessions.get(chatId)
  const sm = entry && entry.session && entry.session.sessionManager
  const base = state.bookmarks.get(chatId)
  state.bookmarks.delete(chatId)
  if (!sm || typeof base !== 'number') return []
  try {
    return sm.getEntries().slice(base)
      .filter(e => e && e.type === 'message' && e.message &&
        (e.message.role === 'user' || e.message.role === 'assistant'))
      .map(e => ({ entryId: e.id, role: e.message.role }))
  } catch (e) {
    return []
  }
}

// 回放初始化产生的映射（[{ mid, entryId }]）：一次性消费（读后删），
// 宿主据此全量替换 pi-map（pi 树重建，旧映射整体作废）
function consumeReplayMap(chatId) {
  const v = state.replayMaps.get(chatId) || null
  state.replayMaps.delete(chatId)
  return v
}

module.exports = {
  // 原生分支切换（内存会话直接操作，无会话记 pending 待 resume 应用）
  branchSessionTo,
  // prompt 前条目数书签（增量基线）
  markSessionBookmark,
  // prompt 后收集新增 user/assistant 条目（pi-map 写回对齐用）
  collectNewMessages,
  // 回放映射一次性消费（读后删，宿主全量替换 pi-map）
  consumeReplayMap
}
