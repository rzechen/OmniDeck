// 时间线状态机：SSE 事件流 → 三层信息结构（业界移动端问答形态）
//   ① 任务描述气泡（user）
//   ② 执行过程组（process）：思考段 / 工具行 / 待办 / 中途正文
//   ③ 最终回答（answer，全宽流式）+ 主线警示（warn）与终态（end）
// 规则：过程组按轮分段（每次问答一组，思考/工具跟着问答走，不跨轮归并）；
// 组内多 cycle 思考聚合为 parts；流式回答被工具打断（assistant_end mid）
// 时降级为组内"过程输出"，最终回答始终是本轮唯一主体
import { ref } from 'vue'
import { toolLabel } from '../format'

export function useTimeline() {
  const msgs = ref([])
  // 执行阶段（驱动时间线末尾的呼吸指示器）：
  //   thinking 思考中 / tool 工具执行中 / streaming 回答流式中（自带打字光标）/ '' 空闲
  const phase = ref('')

  function last(pred) {
    for (let i = msgs.value.length - 1; i >= 0; i--) {
      if (pred(msgs.value[i])) return msgs.value[i]
    }
    return null
  }

  // 当前轮的过程组（user_message 开新轮置空，按需创建）：思考 / 工具 /
  // 中途正文都归入本轮的组，与 PC 端"思考跟着每轮问答"的语义一致。
  // active = 该轮正在执行（仅当前轮的组亮运行态，历史轮入口静止）
  let p_curGroup = null
  let p_curThink = null // 当前 cycle 的思考段（assistant_start 重置；组内唯一 think 条目聚合）

  function ensureProcess() {
    if (!p_curGroup) {
      p_curGroup = { kind: 'process', items: [], current: '', thinkItem: null, thinkCount: 0, active: true }
      msgs.value.push(p_curGroup)
    }
    return p_curGroup
  }

  // 新一轮问答：上一轮组退役（active 置否，入口停止闪动）
  function closeRound() {
    if (p_curGroup) p_curGroup.active = false
    p_curGroup = null
  }

  // 流式回答候选（mid 降级时移入过程组）。
  // final = 本轮已终局（done/error/interrupted/新一轮）：token 用量与复制
  // 按钮只在终局后显示——中途定稿的文本段后续还可能有工具/新段，不提前展示
  function ensureAnswer() {
    let a = last(m => m.kind === 'answer' && m.streaming)
    if (!a) {
      a = { kind: 'answer', text: '', streaming: true, final: false }
      msgs.value.push(a)
    }
    return a
  }

  // 本轮终局：最后一篇回答解锁元信息行（token / 复制）
  function finalizeAnswer() {
    const a = last(m => m.kind === 'answer')
    if (a) a.final = true
  }

  function reset() {
    msgs.value = []
    phase.value = ''
    p_curGroup = null
    p_curThink = null
  }

  // onTick：每帧渲染后通知（详情页滚动用）；onRunChange：运行态变化
  function handleEvent(ev, onTick, onRunChange) {
    if (!ev.sessionId) return false
    const t = ev.type
    if (t === 'user_message') {
      phase.value = 'thinking'
      finalizeAnswer() // 上一轮收尾（无终态事件时兜底）：解锁其 token/复制
      closeRound() // 上一轮组退役：入口停止运行态闪动
      msgs.value.push({ kind: 'user', text: (ev.message && ev.message.content) || '' })
    } else if (t === 'assistant_start') {
      phase.value = 'thinking'
      p_curThink = null // 新 cycle：思考开新段（聚合进组内唯一 think 条目）
    } else if (t === 'thinking') {
      phase.value = 'thinking'
      const p = ensureProcess()
      if (!p.thinkItem) {
        p.thinkItem = { type: 'think', parts: [] }
        p.items.push(p.thinkItem)
      }
      if (!p_curThink) {
        p_curThink = { text: '' }
        p.thinkItem.parts.push(p_curThink)
        p.thinkCount = p.thinkItem.parts.length
      }
      p_curThink.text = ev.text || ''
    } else if (t === 'delta') {
      phase.value = 'streaming'
      ensureAnswer().text = ev.text || ''
    } else if (t === 'assistant_end') {
      phase.value = '' // 本轮流式结束（后续 tool_start / done 再行驱动）
      const a = ensureAnswer()
      a.streaming = false
      if (ev.content) a.text = ev.content
      if (ev.usage) a.usage = ev.usage
      if (ev.mid) {
        // 中途正文（工具调用收尾）：降级为过程组内"过程输出"，不占主线
        const p = ensureProcess()
        if (String(ev.content || '').trim()) p.items.push({ type: 'note', text: ev.content })
        const idx = msgs.value.indexOf(a)
        if (idx >= 0) msgs.value.splice(idx, 1)
      } else {
        // 单轮多段文本输出（cycle 间无工具调用）时，与前一条定稿 answer
        // 紧邻（无 user / warn / end 隔断）→ 拼为一段，token 用量取最新 cycle；
        // 与回放 loadItems 的合并语义一致，避免回答碎成多条 + 用量行穿插
        const i = msgs.value.indexOf(a)
        const prev = i > 0 ? msgs.value[i - 1] : null
        if (prev && prev.kind === 'answer' && !prev.streaming) {
          prev.text = (prev.text ? prev.text + '\n\n' : '') + a.text
          prev.usage = a.usage || prev.usage
          msgs.value.splice(i, 1)
        }
      }
    } else if (t === 'tool_start') {
      phase.value = 'tool'
      const p = ensureProcess()
      const item = { type: 'tool', id: ev.toolCallId, toolName: ev.toolName || '', brief: ev.brief || '', state: 'running', open: false, artifacts: [] }
      p.items.push(item)
      p.current = toolLabel(ev.toolName) + ' 执行中…'
    } else if (t === 'tool_end') {
      phase.value = 'tool'
      const p = p_curGroup || last(m => m.kind === 'process')
      if (p) {
        for (let i = p.items.length - 1; i >= 0; i--) {
          const it = p.items[i]
          if (it.type === 'tool' && it.id === ev.toolCallId) {
            it.state = 'done'
            it.isError = !!ev.isError
            it.result = ev.result || ''
            // 产物清单（含 path）：截图等图片产物由 ProcessGroup 渲染缩略图
            it.artifacts = Array.isArray(ev.artifacts) ? ev.artifacts : []
            if (ev.artifacts && ev.artifacts.length) {
              const names = ev.artifacts.map(a => a.name)
              it.result = (it.result ? it.result + '\n' : '') + '产出：' + names.join('、')
            }
            break
          }
        }
        if (p.current.endsWith('执行中…')) p.current = ''
      }
    } else if (t === 'todo_update') {
      const p = ensureProcess()
      const items = (ev.todos || []).filter(td => td && typeof td.content === 'string')
      let lastT = null
      for (let i = p.items.length - 1; i >= 0; i--) {
        if (p.items[i].type === 'todos') { lastT = p.items[i]; break }
      }
      if (lastT) lastT.items = items
      else p.items.push({ type: 'todos', items })
    } else if (t === 'permission_ask') {
      // askId 关联待审批条目（含 ui- 前缀的 select 兜底路径，移动端可应答）
      const askId = String(ev.askId || '')
      msgs.value.push({
        kind: 'warn', ic: 'lock', askId,
        text: '权限确认：' + (ev.surface || '操作') + (ev.brief ? ' · ' + ev.brief : ''), sub: '等待确认'
      })
    } else if (t === 'permission_done') {
      // 任一端已决策：同步时间线上的等待条目状态
      const askId = String(ev.askId || '')
      const w = last(m => m.kind === 'warn' && m.askId === askId)
      if (w) { w.sub = '已确认，继续执行'; w.askId = '' }
    } else if (t === 'ask_user') {
      msgs.value.push({ kind: 'warn', ic: 'chat', callId: String(ev.callId || ''), text: ev.question || '', sub: '等待回答' })
    } else if (t === 'ask_done') {
      // 任一端已回答：同步时间线上的等待条目状态
      const callId = String(ev.callId || '')
      const w = last(m => m.kind === 'warn' && m.callId === callId)
      if (w) { w.sub = '已回答，继续执行'; w.callId = '' }
    } else if (t === 'done') {
      phase.value = ''
      finalizeAnswer() // 本轮终局：回答元信息（token / 复制）就位
      msgs.value.push({ kind: 'end', level: 'ok', text: '任务完成' })
      onRunChange && onRunChange(false)
    } else if (t === 'error') {
      phase.value = ''
      finalizeAnswer()
      msgs.value.push({ kind: 'end', level: 'err', text: ev.error || '执行失败' })
      onRunChange && onRunChange(false)
    } else if (t === 'interrupted') {
      phase.value = ''
      finalizeAnswer()
      msgs.value.push({ kind: 'end', text: '已停止' })
      onRunChange && onRunChange(false)
    } else if (t === 'pi_unavailable') {
      phase.value = ''
      msgs.value.push({ kind: 'warn', ic: 'warning', text: 'Agent 运行时不可用：' + (ev.error || ''), sub: '' })
    } else {
      return false
    }
    onTick && onTick()
    return true
  }

  // 历史回放转换：/api/session 扁平 items → 三层结构（与实时事件同构）。
  // 过程组按轮分段（user 开新轮）；思考随轮进组；mid 正文归过程说明；
  // 最终回答连续合并为一段
  function loadItems(items) {
    reset()
    for (const it of (items || [])) {
      if (!it) continue
      if (it.kind === 'user') {
        closeRound() // 回放同口径：每轮问答独立过程组，历史轮组退役
        msgs.value.push({ kind: 'user', text: it.text || '' })
      } else if (it.kind === 'assistant') {
        if (it.thinking && String(it.thinking).trim()) {
          const p = ensureProcess()
          if (!p.thinkItem) {
            p.thinkItem = { type: 'think', parts: [] }
            p.items.push(p.thinkItem)
          }
          p.thinkItem.parts.push({ text: it.thinking })
          p.thinkCount = p.thinkItem.parts.length
        }
        if (it.error) {
          msgs.value.push({ kind: 'end', level: 'err', text: it.error })
        } else if (String(it.text || '').trim()) {
          if (it.mid) {
            // 中途正文（PC 端语义：本轮流式以工具调用收尾）→ 过程说明
            ensureProcess().items.push({ type: 'note', text: it.text })
          } else {
            // 最终回答：与前一条 answer 紧邻（无 user / warn 隔断）则拼为一段
            const last = msgs.value[msgs.value.length - 1]
            if (last && last.kind === 'answer' && !last.streaming) {
              last.text = last.text + '\n\n' + it.text
              if (it.usage) last.usage = it.usage
            } else {
              msgs.value.push({ kind: 'answer', text: it.text, streaming: false, final: true, usage: it.usage || null })
            }
          }
        }
      } else if (it.kind === 'tool') {
        const p = ensureProcess()
        p.items.push({ type: 'tool', id: '', toolName: it.toolName || '', brief: it.brief || '', state: 'done', isError: !!it.isError, open: false, artifacts: Array.isArray(it.artifacts) ? it.artifacts : [] })
      } else if (it.kind === 'permission') {
        msgs.value.push({ kind: 'warn', ic: 'lock', text: '权限确认：' + (it.surface || '') + (it.brief ? ' · ' + it.brief : ''), sub: it.decided ? '已' + (it.decided === 'deny' ? '拒绝' : '允许') : '' })
      } else if (it.kind === 'ask') {
        msgs.value.push({ kind: 'warn', ic: 'chat', text: it.question || '', sub: it.answer ? '已回答：' + it.answer : '' })
      }
    }
    // 回放收尾：保留指向最后一轮组的引用与 active 标记——任务仍在跑时
    // 实时事件接续写入该组（入口运行态与 running 联动闪动）；已结束任务
    // running=false，所有入口静止
    p_curThink = null
  }

  return { msgs, phase, reset, loadItems, handleEvent }
}
