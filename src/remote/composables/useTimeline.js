// 时间线状态机：SSE 事件流 → 三层信息结构（业界移动端问答形态）
//   ① 任务描述气泡（user）
//   ② 执行过程组（process，默认收起）：思考段 / 工具行 / 待办 / 中途正文
//   ③ 最终回答（answer，全宽流式）+ 主线警示（warn）与终态（end）
// 规则：一个任务只聚合一个过程组；流式回答被工具打断（assistant_end mid）
// 时降级为过程组内的"过程输出"，最终回答始终是唯一主体
import { ref } from 'vue'

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

  // 过程组（唯一；首个过程事件触发创建）。thinkItem：组内唯一思考条目
  // （多 cycle 思考聚合为 parts，避免时间线出现多条"思考过程"）
  function ensureProcess() {
    let p = last(m => m.kind === 'process')
    if (!p) {
      p = { kind: 'process', items: [], current: '', thinkItem: null, thinkCount: 0 }
      msgs.value.push(p)
    }
    return p
  }

  // 流式回答候选（mid 降级时移入过程组）
  function ensureAnswer() {
    let a = last(m => m.kind === 'answer' && m.streaming)
    if (!a) {
      a = { kind: 'answer', text: '', streaming: true }
      msgs.value.push(a)
    }
    return a
  }

  function reset() {
    msgs.value = []
    phase.value = ''
    p_curThink = null
  }

  let p_curThink = null // 当前 cycle 的思考段（assistant_start 重置；组内唯一 think 条目聚合）

  // onTick：每帧渲染后通知（详情页滚动用）；onRunChange：运行态变化
  function handleEvent(ev, onTick, onRunChange) {
    if (!ev.sessionId) return false
    const t = ev.type
    if (t === 'user_message') {
      phase.value = 'thinking'
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
      }
    } else if (t === 'tool_start') {
      phase.value = 'tool'
      const p = ensureProcess()
      const item = { type: 'tool', id: ev.toolCallId, toolName: ev.toolName || '', brief: ev.brief || '', state: 'running', open: false }
      p.items.push(item)
      p.current = (ev.toolName || '工具') + ' 执行中…'
    } else if (t === 'tool_end') {
      phase.value = 'tool'
      const p = last(m => m.kind === 'process')
      if (p) {
        for (let i = p.items.length - 1; i >= 0; i--) {
          const it = p.items[i]
          if (it.type === 'tool' && it.id === ev.toolCallId) {
            it.state = 'done'
            it.isError = !!ev.isError
            it.result = ev.result || ''
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
      msgs.value.push({ kind: 'end', level: 'ok', text: '任务完成' })
      onRunChange && onRunChange(false)
    } else if (t === 'error') {
      phase.value = ''
      msgs.value.push({ kind: 'end', level: 'err', text: ev.error || '执行失败' })
      onRunChange && onRunChange(false)
    } else if (t === 'interrupted') {
      phase.value = ''
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
  // 思考随记录进过程组；mid 正文归过程说明；最终回答连续合并为一段
  function loadItems(items) {
    reset()
    for (const it of (items || [])) {
      if (!it) continue
      if (it.kind === 'user') {
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
              msgs.value.push({ kind: 'answer', text: it.text, streaming: false, usage: it.usage || null })
            }
          }
        }
      } else if (it.kind === 'tool') {
        const p = ensureProcess()
        p.items.push({ type: 'tool', id: '', toolName: it.toolName || '', brief: it.brief || '', state: 'done', isError: !!it.isError, open: false })
      } else if (it.kind === 'permission') {
        msgs.value.push({ kind: 'warn', ic: 'lock', text: '权限确认：' + (it.surface || '') + (it.brief ? ' · ' + it.brief : ''), sub: it.decided ? '已' + (it.decided === 'deny' ? '拒绝' : '允许') : '' })
      } else if (it.kind === 'ask') {
        msgs.value.push({ kind: 'warn', ic: 'chat', text: it.question || '', sub: it.answer ? '已回答：' + it.answer : '' })
      }
    }
  }

  return { msgs, phase, reset, loadItems, handleEvent }
}
