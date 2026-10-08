// pi 会话事件归一化订阅：把 SDK session.subscribe 的原始事件流翻译为
// 渲染进程事件模型（delta / tool_* / compaction_* 等），并维持流式缓冲与
// 工具参数缓存。纯事件翻译层，不持有会话状态。
// 模型用 read 工具读取 SKILL.md 时视为 skill 被激活（pi skills 渐进加载机制），
// 取上级目录名作为 skill 名称下发前端渲染。
function skillNameFromTool(toolName, args) {
  if (toolName !== 'read' || !args) return ''
  const p = args.file_path || args.path || args.filePath || ''
  if (typeof p !== 'string') return ''
  const norm = p.replace(/\\/g, '/')
  if (!/(^|\/)SKILL\.md$/i.test(norm)) return ''
  const parts = norm.split('/')
  return parts.length >= 2 ? parts[parts.length - 2] : ''
}

// 订阅会话事件并归一化转发；onSkillActivated(skillName, toolCallId, toolName)
// 由会话层回调（登记技能激活 → 凭据注入判定依据）。返回 unsubscribe
function subscribeSessionEvents(session, chatId, onEvent, onSkillActivated) {
  let currentText = ''
  let currentThinking = ''
  const toolArgsById = new Map()
  return session.subscribe(async (event) => {
    try {
      switch (event.type) {
        case 'message_start':
          if (event.message && event.message.role === 'assistant') {
            currentText = ''
            currentThinking = ''
            onEvent({ kind: 'assistant_start', chatId })
          }
          break
        case 'message_update': {
          const ae = event.assistantMessageEvent
          if (!ae) break
          if (ae.type === 'thinking_delta' && ae.delta) {
            currentThinking += ae.delta
            onEvent({ kind: 'thinking', chatId, text: currentThinking })
          } else if (ae.type === 'text_delta' && ae.delta) {
            currentText += ae.delta
            onEvent({ kind: 'delta', chatId, text: currentText })
          }
          break
        }
        case 'message_end':
          if (event.message && event.message.role === 'assistant') {
            // 临时诊断（mid 拆分问题定位）：打印 stopReason 与内容块类型后移除
            console.log('[omnibuddy:pi][diag] message_end stopReason=', event.message.stopReason,
              'blocks=', (event.message.content || []).map(c => c && c.type).join(','))
            const text = (event.message.content || [])
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('')
            // token 用量（本轮模型调用；工具循环中多次调用由前端累加展示）
            // + 上下文占用（getContextUsage：tokens/contextWindow/percent，用量条）
            const u = event.message.usage || {}
            let ctx = null
            try { ctx = session.getContextUsage() } catch (err) { /* 模型未加载时无值 */ }
            onEvent({
              kind: 'assistant_end',
              chatId,
              content: text || currentText,
              thinking: currentThinking,
              // 中途正文标记：本轮流式回复以工具调用收尾（正文之后还有动作，非最终
              // 答复）。前端据此把这类正文归位思考区（过程说明），落盘记录同样
              // 带 mid，历史回放按此归位而非并入正文气泡。
              // 判定以内容块为准（stopReason 兜底）：部分第三方 OpenAI 兼容端点在
              // 带 tool_calls 的回复上返回 finish_reason=stop（pi-ai 对 google 端点
              // 有同款改写，openai-completions 没有），仅看 stopReason 会把工具循环
              // 中段误判为回合终点，导致思考过程被拆成多条消息
              mid: !!(text || currentText) && (
                event.message.stopReason === 'toolUse' ||
                (event.message.content || []).some(c => c && c.type === 'toolCall')
              ),
              usage: {
                input: u.input || u.inputTokens || 0,
                output: u.output || u.outputTokens || 0,
                contextTokens: ctx && ctx.tokens != null ? ctx.tokens : undefined,
                contextWindow: ctx ? ctx.contextWindow : undefined
              }
            })
            // pi 不抛出模型请求错误（记在消息上），空回复时须显式透传，避免前端静默挂起
            if (event.message.stopReason === 'error' && !text && !currentText) {
              onEvent({ kind: 'turn_error', chatId, error: event.message.errorMessage || '模型请求失败' })
            }
          }
          break
        case 'tool_execution_start': {
          toolArgsById.set(event.toolCallId, event.args)
          const skillName = skillNameFromTool(event.toolName, event.args)
          if (skillName) {
            onSkillActivated(skillName, event.toolCallId, event.toolName)
          }
          onEvent({
            kind: 'tool_start',
            chatId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args: event.args
          })
          break
        }
        case 'tool_execution_update': {
          // partialResult 为结构化对象（{content:[{type:'text',text}],details}），
          // 须解构提取文本，直接 String() 会得到 "[object Object]"
          let partialText = ''
          const pr = event.partialResult
          if (pr && Array.isArray(pr.content)) {
            partialText = pr.content
              .filter(c => c && c.type === 'text')
              .map(c => c.text)
              .join('')
          } else if (typeof pr === 'string') {
            partialText = pr
          }
          onEvent({
            kind: 'tool_update',
            chatId,
            toolCallId: event.toolCallId,
            partial: partialText.slice(0, 2000)
          })
          break
        }
        case 'tool_execution_end': {
          let resultText = ''
          if (event.result && Array.isArray(event.result.content)) {
            resultText = event.result.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('')
          } else if (event.error) {
            resultText = String(event.error.message || event.error)
          }
          // 产物清单（文档导出）：交付类工具（doc_export / preview_export 等）
          // 在 details.artifacts 返回结构化清单 → 前端产物卡片（打开 / 所在文件夹）
          let artifacts = null
          try {
            const d = event.result && event.result.details
            if (d && Array.isArray(d.artifacts) && d.artifacts.length) {
              artifacts = d.artifacts.filter(a => a && typeof a.path === 'string')
            }
          } catch (e) { /* details 解析失败按无产物处理 */ }
          // 深度研究：workflow 工具返回 details.runId（后台运行）或
          // 完整快照（前台），提取最小字段 → 前端进度卡片（主进程轮询 run 落盘状态）
          let workflow = null
          if (event.toolName === 'workflow') {
            try {
              const d = (event.result && event.result.details) || {}
              if (d.runId) {
                workflow = {
                  runId: d.runId,
                  background: d.background !== false,
                  // 前台完成时 details 即最终快照（含 tokenUsage / phases / agents）
                  snapshot: d.background === false ? {
                    status: 'completed',
                    name: d.name || (d.meta && d.meta.name) || '',
                    phases: d.phases || [],
                    currentPhase: d.currentPhase || null,
                    agents: Array.isArray(d.agents) ? d.agents.map(a => ({
                      label: a.label, status: a.status, phase: a.phase || null
                    })) : [],
                    tokenUsage: d.tokenUsage || null,
                    durationMs: d.durationMs || null
                  } : null
                }
              }
            } catch (e) { /* 快照提取失败按无 workflow 处理 */ }
          }
          const args = toolArgsById.get(event.toolCallId)
          toolArgsById.delete(event.toolCallId)
          onEvent({
            kind: 'tool_end',
            chatId,
            toolCallId: event.toolCallId,
            toolName: event.toolName,
            args,
            isError: !!event.isError,
            result: resultText.slice(0, 4000),
            ...(artifacts ? { artifacts } : {}),
            ...(workflow ? { workflow } : {})
          })
          break
        }
        case 'compaction_start':
          // 上下文压缩开始（阈值自动 / 溢出 / 手动）
          onEvent({ kind: 'compaction_start', chatId, reason: event.reason })
          break
        case 'compaction_end': {
          // 压缩结束：透传摘要与 token 前后量（失败时 errorMessage）
          const r = event.result
          onEvent({
            kind: 'compaction_end',
            chatId,
            reason: event.reason,
            aborted: !!event.aborted,
            willRetry: !!event.willRetry,
            errorMessage: event.errorMessage,
            summary: r ? String(r.summary || '') : '',
            tokensBefore: r ? (r.tokensBefore || 0) : 0,
            tokensAfter: r ? (r.estimatedTokensAfter || 0) : 0
          })
          break
        }
        default:
          break
      }
    } catch (e) {
      /* 单个事件处理失败不影响会话 */
    }
  })
}

module.exports = {
  // 会话事件订阅 + 归一化转发（返回 unsubscribe；技能激活经 onSkillActivated 回调）
  subscribeSessionEvents
}
