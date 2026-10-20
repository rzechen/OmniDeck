// OmniBuddy 定时任务无头执行体与自动化 IPC。
// 每次运行创建一个系统会话（meta.automation 标记，侧栏归「定时任务」分组），
// 复用 pi 会话工厂与 handlePiEvent 事件链——前端打开该会话即可看到完整执行过程；
// 权限确认沿现有 permission_ask 链路（前端确认卡 + 布局层通知），
// 等待用户决策永不超时（与普通对话的权限确认同语义：确认即"一直等"；
// 不中断等待用户的任务）。外部中断（前端停止 / session:interrupt）不受影响：
// entry.abort 即中断。
const { ipcMain, app } = require('electron')
const sessions = require('../sessions/sessions')
const workspaces = require('../workspace/workspaces')
const scheduler = require('../platform/scheduler')
const notify = require('../integrations/notify')
const workflows = require('../integrations/workflows')
const subagents = require('../integrations/subagents')
const piRuntime = require('../pi')
const { emit, running, automationTurnErrors, automationHeartbeats,
  isAwaitingUser, AUTOMATION_STALL_TIMEOUT_MS, AUTOMATION_TOOL_STALL_TIMEOUT_MS,
  AUTOMATION_LONG_TOOLS, markHeadlessRun, unmarkHeadlessRun, takeDeniedOps } = require('../core/chat-state')
const { writeExitSummary } = require('../core/direct-llm')

// 创建自动化执行体（getWindow 由 index.js 注册时注入）
function createAutomation({ getWindow, handlePiEvent }) {
  // 定时任务模型解析：任务绑定的模型（providerId，主进程镜像查找）优先；
  // 未绑定时依次回落「最近一次对话所用模型快照」→「模型管理中的默认模型」。
  // 返回 { provider } 或 { error }，供执行前与「立即运行」预检共用
  function resolveAutomationProvider(task) {
    const providers = scheduler.getProviders()
    if (task.providerId) {
      const p = providers.find(x => x.id === task.providerId)
      if (p) return { provider: p }
      return { error: '任务关联的模型已被删除，请编辑任务重新选择执行模型' }
    }
    const snap = scheduler.getProviderSnapshot()
    if (snap && snap.baseUrl && snap.model) {
      // 旧快照文件可能缺 apiFormat 等字段（Anthropic 端点会被误按 OpenAI
      // 协议请求）：镜像中有同 id 供应商时以镜像完整配置为准（providers 页
      // 增删改时同步，配置总是最新）
      const mirror = providers.find(x => x.id === snap.id)
      return { provider: mirror || snap }
    }
    const def = providers.find(x => x.isDefault) || providers[0]
    if (def) return { provider: def }
    return { error: '未配置模型：请先在「模型管理」中添加模型，或编辑任务选择执行模型' }
  }

  async function runAutomationTask(task, reason) {
    // 结束统一处理：广播 automation:done + 通知中心投递 + dock 角标。
    // 预检失败（无会话）时同样走此链路，避免定时触发静默失败无任何提示
    const finish = (result, chatId) => {
      emit(getWindow, chatId, {
        type: 'automation:done',
        taskId: task.id,
        taskName: task.name,
        ok: result.ok,
        error: result.error || '',
        sessionId: chatId || ''
      })
      // 通知中心投递（task.notify=false 时跳过系统通知，其余启用渠道照常）
      const deniedNote = (result.deniedOps && result.deniedOps.length)
        ? '；无头策略已拦截写操作 ' + result.deniedOps.length + ' 项（详情见运行历史）'
        : ''
      notify.dispatch(result.ok ? 'task.completed' : 'task.failed', {
        title: result.ok ? '定时任务已完成' : '定时任务失败',
        body: result.ok
          ? '「' + task.name + '」执行完成，点击查看结果' + deniedNote
          : '「' + task.name + '」执行失败：' + (result.error || '未知错误') + deniedNote,
        ok: !!result.ok,
        silentSystem: task.notify === false,
        click: () => {
          // 预检失败无会话可跳转；会话可能已被用户删除（幽灵引用）——
          // 跳转前校验存在性，避免 nav:goto 落到不存在的会话
          if (!chatId) return
          if (!sessions.readMeta(chatId)) return
          // 复用 quick-panel 的 nav:goto 机制（App.vue 监听跳转）：聚焦 + 直达会话
          const win = getWindow()
          if (win && !win.isDestroyed()) {
            win.show()
            win.focus()
            win.webContents.send('nav:goto', '/omnibuddy?s=' + chatId)
          }
        }
      })
      if (process.platform === 'darwin' && app.dock) {
        try {
          const win = getWindow()
          if (!win || win.isDestroyed() || !win.isFocused()) app.dock.setBadge('•')
        } catch (e) { /* 忽略 */ }
      }
      return result
    }

    // 模型检测：任务绑定模型 / 最近对话快照 / 默认模型均不可用时明确报错
    const resolved = resolveAutomationProvider(task)
    if (resolved.error) {
      return finish({ ok: false, error: resolved.error }, '')
    }
    const provider = resolved.provider
    const workspaceDir = workspaces.resolve(task.workspaceId)
    if (!workspaceDir) {
      return finish({ ok: false, error: '任务关联的工作空间已不存在，请编辑任务重新选择' }, '')
    }
    const pad = n => String(n).padStart(2, '0')
    const d = new Date()
    const stamp = pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    // 系统会话：固定标题（autoTitle=false 不被 LLM 重命名）+ 自动化标记
    const meta = sessions.createSession({
      title: task.name + ' · ' + stamp,
      workspaceId: task.workspaceId,
      workspaceDir,
      displayName: '定时任务',
      autoTitle: false,
      automation: { taskId: task.id, taskName: task.name }
    })
    const chatId = meta.id
    const promptText = [
      '这是定时任务「' + task.name + '」的自动执行请求（' + (reason === 'manual' ? '手动触发' : '按计划触发') + '，执行时间 ' + stamp + '）。',
      '',
      task.prompt,
      '',
      reason === 'schedule'
        ? '请自动完成上述任务：本次为无人值守的定时执行——优先使用联网搜索等只读工具收集信息，独立完成全部步骤，最终以回复正文交付完整结果；' +
          '提问不会得到用户应答（将自动按保守规则决策），写类操作（写文件、有副作用的命令等）会被权限策略默认拒绝，请优先采用只读方案，被拒操作在最终汇报中如实说明。'
        : '请自动完成上述任务：优先使用联网搜索等只读工具收集信息，独立完成全部步骤，最终以回复正文交付完整结果；' +
          '写入文件等操作需要授权且可能无人及时应答，请仅在必要时使用。'
    ].join('\n')

    // 无头策略标记：仅计划触发（schedule）标记——无头运行中 ask_user / 权限确认
    // 不进前端等待管线（无人应答即永久挂起），由 pi-events 无头短路自动决策；
    // 手动「立即运行」通常有用户在场，保留前端交互链路
    if (reason === 'schedule') markHeadlessRun(chatId)

    // 落盘用户消息（重开会话可见完整请求）+ 广播任务开始
    const { record } = sessions.addMessage(chatId, { role: 'user', content: promptText })
    emit(getWindow, chatId, { type: 'user_message', message: record })
    emit(getWindow, chatId, { type: 'automation:run', taskId: task.id, taskName: task.name })

    const entry = { abort: null, mode: 'pi', model: provider.model, anchors: [] }
    running.set(chatId, entry)
    // interruptedBy 覆盖外部 abort（session:interrupt / 前端停止）与看门狗中断——
    // pi 的 abort 让 prompt() 正常 resolve 而非抛错，须显式查出防止
    // 中断被误判为「成功」并发完成通知
    let interruptedBy = '' // '' 无 / 'manual' 外部中断（不重试）/ 'watchdog' 停滞看门狗中断（可重试）
    entry.abort = () => { interruptedBy = 'manual'; piRuntime.interruptSession(chatId) }
    let result
    // 熔断计数：整个任务生命周期内看门狗触发次数。MAX_ATTEMPTS=2 天然限制
    // 重试次数，连续 2 次流悬挂 → 终判失败并标注模型服务不稳定（熔断器模式）
    let stallCount = 0
    let stallMessage = ''
    // 失败自动重试一次：流式端点在长任务 / 工具调用多轮场景下偶发断流
    // （如 Stream ended without finish_reason）。注意 pi 不抛模型请求错误，
    // 只发 turn_error 事件（已透传前端并落盘）——prompt 正常返回后须查
    // automationTurnErrors 把空回合判为失败；用户中断不重试、看门狗停滞中断重试
    const MAX_ATTEMPTS = 2
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      let failError = ''        // 本轮失败原因（空 = 成功）
      let failFromEvent = false // true = turn_error 事件路径（错误已落盘并广播，勿重复）
      automationTurnErrors.delete(chatId)
      interruptedBy = ''
      // 注册本轮心跳并启动看门狗：LLM 流悬挂（连接建立后不返回数据也不报错）
      // 时 pi 不产生任何事件、prompt() 永不 resolve，错误驱动的重试全部失效
      // ——看门狗以事件心跳判定停滞，主动 abort 让 prompt() resolve，落入
      // 下方既有重试判定（不依赖「错误返回」形态，这是 10-03 20:00 卡死的根治点）
      automationHeartbeats.set(chatId, { lastActivityAt: Date.now(), lastEventKind: '', toolOpen: false, lastToolName: '' })
      const watchdog = setInterval(() => {
        const hb = automationHeartbeats.get(chatId)
        if (!hb) return
        if (isAwaitingUser(chatId)) return // AWAITING_USER：等用户决策，永不超时
        if (interruptedBy === 'manual') return // 用户中断路径自会 resolve，勿抢判
        const longTool = hb.toolOpen && AUTOMATION_LONG_TOOLS.has(hb.lastToolName)
        const timeoutMs = longTool ? AUTOMATION_TOOL_STALL_TIMEOUT_MS : AUTOMATION_STALL_TIMEOUT_MS
        if (Date.now() - hb.lastActivityAt < timeoutMs) return
        // 首次停滞：置标记并记数；此后每周期重试 abort（幂等）直至 prompt()
        // resolve 进入 finally 清除本定时器——防止单次 abort 失效导致看门狗
        // 空转、任务回到永久悬挂（这正是要根治的形态）
        if (!interruptedBy) {
          interruptedBy = 'watchdog'
          stallCount++
          stallMessage = '模型响应停滞（' + Math.round(timeoutMs / 60000) + ' 分钟无任何事件' +
            (hb.toolOpen ? '，卡在工具 ' + hb.lastToolName : '') + '），已自动中断'
          console.warn('[omnibuddy:automation] 心跳看门狗触发：' + stallMessage +
            '，最后事件 ' + hb.lastEventKind + ' @ ' + new Date(hb.lastActivityAt).toISOString())
        }
        piRuntime.interruptSession(chatId).catch(() => { /* abort 异常由下周期重试兜底 */ })
      }, 30 * 1000)
      watchdog.unref && watchdog.unref() // 不阻塞进程退出
      try {
        // 必须返回 handlePiEvent 的返回值：permission_ask 分支返回的
        // verdictPromise 是权限 authorizer 等待用户点击的挂起点，花括号体
        // 吞掉返回值会让 onAsk 得到 undefined → 全部 ask 立即被判
        // 「用户拒绝」（确认条刚弹出即失效，用户永远来不及点）
        const session = await piRuntime.getOrCreateSession(chatId, provider, [], e => {
          return handlePiEvent(getWindow, e)
        }, workspaceDir)
        // streamingBehavior=followUp：上一回合可能仍有 pi-subagents 注入驱动的
        // 续跑回合在执行（前台委派完成后后台 run 唤醒等场景），此时重发 prompt
        // 会抛 "Agent is already processing" 被误判为失败——followUp 让消息排队，
        // 当前 run 结束后作为跟进回合执行
        await session.prompt(attempt > 1
          ? promptText + '\n\n（上一次执行中断，请继续完成上述任务并输出完整结果）'
          : promptText, { streamingBehavior: 'followUp' })
        // 中断判定先于错误判定：abort 让 prompt() 正常 resolve，须显式查出；
        // watchdog 携带具体停滞信息（阈值、卡点工具），manual 统一为执行被中断
        if (interruptedBy === 'watchdog') {
          failError = stallMessage
        } else if (interruptedBy === 'manual') {
          failError = '执行被中断'
        } else {
          failError = automationTurnErrors.get(chatId) || ''
          failFromEvent = !!failError
        }
      } catch (err) {
        const aborted = err && (err.name === 'AbortError' || /abort/i.test(String(err.message || '')))
        failError = interruptedBy === 'watchdog'
          ? stallMessage
          : (interruptedBy || aborted ? '执行被中断' : ((err && err.message) || '未知错误'))
      } finally {
        // 本回合结束（含 abort 后 resolve）即停看门狗，防泄漏与跨回合误触发
        clearInterval(watchdog)
      }
      if (!failError) {
        // 回合完成释放前端流式态：定时任务不走 session:send（无 done 发射点），
        // P3 的幽灵回合补发又被 running 表挡住，须在此显式发送（done 幂等）
        emit(getWindow, chatId, { type: 'done' })
        sessions.touch(chatId)
        // 会话记忆摘要（消息数不足门槛时自动跳过）
        writeExitSummary(chatId)
        result = { ok: true, sessionId: chatId }
        break
      }
      // 只有用户手动中断不可重试；看门狗停滞中断走重试（下一次 attempt 重注册心跳）
      const abortedFail = interruptedBy === 'manual' || failError === '执行被中断'
      if (!abortedFail && attempt < MAX_ATTEMPTS) {
        console.warn('[omnibuddy:automation] 第 ' + attempt + ' 次执行失败，3 秒后自动重试：' + failError)
        await new Promise(r => setTimeout(r, 3000))
        continue
      }
      // 熔断标注：连续看门狗停滞到终判（MAX_ATTEMPTS 内未恢复）→ 模型服务
      // 可能不稳定，明确提示而非笼统「执行失败」
      if (stallCount >= 2 && interruptedBy === 'watchdog') {
        failError += '（已自动重试仍停滞，模型服务可能不稳定）'
      }
      // 终判失败：catch 路径补落盘与广播（turn_error 路径已在事件分支完成），
      // 无头运行无人盯屏，重开会话可见失败原因
      if (!failFromEvent) {
        try {
          sessions.addMessage(chatId, { role: 'assistant', content: '（任务' + (abortedFail ? '中断：' : '执行失败：') + failError + '）', error: failError })
        } catch (e) { /* 会话已删除等忽略 */ }
        // 释放前端流式态（interrupted 清理运行中工具图标，error 展示原因；均幂等）
        emit(getWindow, chatId, abortedFail
          ? { type: 'interrupted' }
          : { type: 'error', error: failError })
      }
      result = { ok: false, sessionId: chatId, error: failError }
      // 终判即退出：不可重试的失败（含用户手动中断）落盘后必须离开循环，
      // 否则 manual 中断在 attempt=1 终判后 attempt=2 照常发起（无 3 秒等待），
      // 表现为「已停止生成」后任务立即自动重跑
      break
    }
    running.delete(chatId)
    automationTurnErrors.delete(chatId)
    automationHeartbeats.delete(chatId)
    // 无头标记与被拒操作收割：deniedOps 随 result 带出（写入运行历史 +
    // 通知提示），用户据此决定是否在权限管理为对应面预配置允许
    unmarkHeadlessRun(chatId)
    const deniedOps = takeDeniedOps(chatId)
    if (deniedOps.length) result.deniedOps = deniedOps

    // 结束：广播（自动化页/侧栏刷新）+ 原生通知 + dock 角标
    return finish(result, chatId)
  }

  // ===== 定时任务管理 IPC（定时任务页） =====
  function registerIpc() {
    ipcMain.handle('omnibuddy:automation:list', () => ({
      ok: true,
      tasks: scheduler.listTasks().map(t => Object.assign({}, t, { running: scheduler.isTaskRunning(t.id) }))
    }))

    ipcMain.handle('omnibuddy:automation:create', (_e, payload) => scheduler.createTask(payload || {}))

    ipcMain.handle('omnibuddy:automation:update', (_e, { id, patch }) => scheduler.updateTask(id, patch || {}))

    ipcMain.handle('omnibuddy:automation:delete', (_e, id) => scheduler.deleteTask(id))

    // 立即运行（手动触发；不等执行完成即返回，结果经 automation:done 广播）。
    // 返回前先做模型/工作空间预检：配置缺失立即报错给前端弹提示，避免「点了没反应」
    ipcMain.handle('omnibuddy:automation:run-now', (_e, id) => {
      if (!id) return { ok: false, error: '参数缺失' }
      const task = scheduler.listTasks().find(t => t.id === id)
      if (!task) return { ok: false, error: '任务不存在' }
      if (scheduler.isTaskRunning(id)) return { ok: false, error: '任务正在运行中' }
      const check = resolveAutomationProvider(task)
      if (check.error) return { ok: false, error: check.error }
      if (!workspaces.resolve(task.workspaceId)) {
        return { ok: false, error: '任务关联的工作空间已不存在，请编辑任务重新选择' }
      }
      scheduler.runNow(id).catch(e =>
        console.warn('[omnibuddy:automation] 手动运行异常：', (e && e.message) || e))
      return { ok: true }
    })

    // 渲染侧同步模型列表镜像（模型增删改 / 相关页面加载时调用）：
    // 定时任务按 providerId 从镜像取绑定模型的完整配置（IndexedDB 主进程不可读）
    ipcMain.handle('omnibuddy:automation:sync-providers', (_e, list) => {
      scheduler.updateProviders(list)
      return { ok: true }
    })

    // 深度研究：历史会话打开时按 runId 拉取运行最终状态（进度卡片回放）；
    // 若 run 仍在运行（如应用重启后内存轮询已丢），重新挂上轮询继续驱动前端卡片
    ipcMain.handle('omnibuddy:workflow:status', (_e, { runId, chatId }) => {
      let cwd = ''
      try {
        const meta = sessions.readMeta(chatId)
        cwd = meta && meta.workspaceDir
      } catch (e) { /* 无 meta 按无状态处理 */ }
      if (!runId || !cwd) return { ok: false, error: '参数缺失' }
      const workflow = workflows.statusOf(runId, cwd)
      if (!workflow) return { ok: false, error: '运行记录不存在' }
      if (workflow.status === 'running' || workflow.status === 'waiting' || workflow.status === 'paused') {
        try {
          workflows.watchRun(runId, chatId, cwd, snap => {
            emit(getWindow, chatId, { type: 'workflow_progress', workflow: snap })
          })
        } catch (e) { /* 重新挂轮询失败不影响本次状态返回 */ }
      }
      return { ok: true, workflow }
    })

    // 子代理后台 run：渲染层刷新/重开后按会话拉取活跃 run 清单（注册表重建
    // 卡片与任务列表 running 态）。仍在运行的 run 同时重挂轮询，进度继续
    // 经 workflow_progress 事件驱动前端（与深度研究同管线）
    ipcMain.handle('omnibuddy:subagent:active-runs', (_e, chatId) => {
      if (!chatId) return { ok: false, error: '参数缺失' }
      const runs = subagents.activeRunsOf(chatId)
      runs.forEach(r => {
        if (r.snapshot && (r.snapshot.status === 'running' || r.snapshot.status === 'paused')
          && !subagents.isWatched(r.runId)) {
          try {
            subagents.watchRun(r.runId, chatId,
              snap => emit(getWindow, chatId, { type: 'workflow_progress', workflow: snap }),
              snap => {
                emit(getWindow, chatId, { type: 'workflow_progress', workflow: snap })
                const okDone = snap.status === 'completed'
                notify.dispatch(okDone ? 'subagent.completed' : 'subagent.failed', {
                  title: okDone ? '专家任务完成' : '专家任务未完成',
                  body: '「' + (snap.name || r.agent || '专家') + '」' + (okDone ? '已完成' : '已结束'),
                  ok: okDone,
                  click: () => {
                    const win = getWindow()
                    if (win && !win.isDestroyed()) {
                      win.show()
                      win.focus()
                      win.webContents.send('nav:goto', '/omnibuddy?s=' + chatId)
                    }
                  }
                })
              },
              snap => {
                emit(getWindow, chatId, { type: 'workflow_progress', workflow: snap })
              })
          } catch (e) { /* 重挂轮询失败不影响本次返回 */ }
        }
      })
      return { ok: true, runs }
    })

    // 子代理 run 单查（历史卡片回放）：脱离注册表直读磁盘 status.json，
    // 终态后注册表已移除也能拿到真实终态快照（临时目录被清理则由前端兜底）
    ipcMain.handle('omnibuddy:subagent:run-status', (_e, runId) => {
      if (!runId) return { ok: false, error: '参数缺失' }
      const snap = subagents.snapshotOf(String(runId))
      return snap ? { ok: true, snapshot: snap } : { ok: false }
    })
  }

  return {
    resolveAutomationProvider,
    runAutomationTask,
    registerIpc
  }
}

module.exports = {
  // 创建自动化执行体（返回模型解析 / 无头执行体 / IPC 注册；getWindow 由 index.js 注入）
  createAutomation
}
