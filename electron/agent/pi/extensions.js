// pi UI 耦合扩展：ask_user（向用户提问）/ credential_get（凭据按需取用）/
// todo_write（任务清单）三个内联扩展工厂，以内联 factory 注入会话，
// 交互经 onEvent 回调桥接到渲染层。
const credentials = require('../integrations/credentials')

// ask-user：模型向用户提问，前端渲染表单，经 IPC 回传答案
function createAskUserExtension(onAskUser) {
  return function (piApi) {
    piApi.registerTool({
      name: 'ask_user',
      label: '向用户提问',
      description: '当信息不足或存在多种理解时，向用户提出问题。options 为可选的选项列表；需要用户同时选择多项时置 multiSelect=true。',
      parameters: {
        type: 'object',
        properties: {
          question: { type: 'string', description: '要向用户提出的问题' },
          options: {
            type: 'array',
            items: { type: 'string' },
            description: '可选的候选项（可空，允许自由输入）'
          },
          multiSelect: {
            type: 'boolean',
            description: '是否允许多选（默认单选；多选时用户可勾选多项后统一提交）'
          }
        },
        required: ['question']
      },
      execute: async (_id, params, signal) => {
        const answer = await onAskUser(params.question || '', params.options || [], !!params.multiSelect, signal)
        return { content: [{ type: 'text', text: answer }], details: {} }
      }
    })
  }
}

// 凭据按需取用：AI 对话中按名取已录入的「AI 取用类」凭据。
// 权限默认 ask（capabilities.js 登记），敏感操作逐次确认；开关关闭时返回引导
function createCredentialGetExtension() {
  return function (piApi) {
    piApi.registerTool({
      name: 'credential_get',
      label: '取用凭据',
      description: '按名称取用用户预先录入的凭据（API Key、账号等）。需要鉴权信息（登录、调接口、发邮件）时使用；取用前先征得用户同意。codemode 脚本内 await 返回结构化对象 { name, values, headers }，直接取字段即可，不要对返回值做 JSON.parse。',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '凭据名称（见系统提示词中的可用凭据清单）' }
        },
        required: ['name']
      },
      // 声明 outputSchema 后 codemode 嵌套调用返回 structuredContent 对象
      outputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: '凭据名称' },
          values: { type: 'object', description: '键值对（env），如 { "用户名": "rzc", "密码": "***" }', additionalProperties: { type: 'string' } },
          headers: { type: 'object', description: 'HTTP 请求头键值对', additionalProperties: { type: 'string' } }
        },
        required: ['name', 'values', 'headers']
      },
      execute: async (_id, params) => {
        const r = credentials.aiResolve(params.name)
        if (!r.ok) {
          return { content: [{ type: 'text', text: '取用失败：' + r.error }], details: { isError: true } }
        }
        const parts = []
        if (Object.keys(r.values).length) {
          parts.push('键值：\n' + Object.entries(r.values).map(([k, v]) => k + '=' + v).join('\n'))
        }
        if (Object.keys(r.headers).length) {
          parts.push('请求头：\n' + Object.entries(r.headers).map(([k, v]) => k + ': ' + v).join('\n'))
        }
        const text = '已取用凭据「' + r.name + '」。\n' + (parts.join('\n\n') || '（该凭据未配置任何字段）')
          + '\n\n注意：仅用于本次任务，不要在回复中明文展示。'
        // 结构化输出（outputSchema+structuredContent）：codemode 脚本内 await 返回
        // 结构化对象而非拼接文本，避免模型自行 JSON.parse 文本崩溃（10-09 事故）；
        // content 仍为模型可见输出，行为不变
        const structuredContent = { name: r.name, values: r.values || {}, headers: r.headers || {} }
        return { content: [{ type: 'text', text }], details: { credential: r.name }, structuredContent }
      }
    })
  }
}

// todo：模型维护任务清单，前端渲染看板
// 更新频率双通道保障：提示词引导（弱约束）+ context 滞后提醒（机制性兜底）——
// 模型常在长任务中只建清单不更新（实测 68 次工具调用仅 1 次 todo_write），
// 纯提示词引导不足以纠正，需在连续多次未更新时向模型注入提醒
function createTodoExtension(onTodo) {
  return function (piApi) {
    // 扩展闭包态：最近清单快照 / 距上次更新的工具调用数 / 已注入提醒次数
    let todos = null
    let callsSinceUpdate = 0
    let reminders = 0
    piApi.registerTool({
      name: 'todo_write',
      label: '更新任务清单',
      description: '维护当前任务清单（全量覆盖写入）。每次任务状态变化都必须立即调用：开始执行一项时将其置为 in_progress，完成一项时立即置为 completed 并同步推进下一项，全部完成时将所有项置为 completed。不要只在任务开始时调用一次后不再更新——用户界面依赖此工具实时展示进度。',
      parameters: {
        type: 'object',
        properties: {
          todos: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                content: { type: 'string' },
                status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] }
              },
              required: ['content', 'status']
            }
          }
        },
        required: ['todos']
      },
      execute: async (_id, params) => {
        todos = params.todos || []
        callsSinceUpdate = 0
        onTodo(todos)
        return { content: [{ type: 'text', text: '任务清单已更新' }], details: {} }
      }
    })
    // 工具调用计数（todo_write 自身不累计）：滞后检测的依据
    piApi.on('tool_execution_end', (event) => {
      if (event.toolName !== 'todo_write') callsSinceUpdate++
    })
    // 每次 LLM 调用前：清单存在未完成项且已连续多次未更新时，注入一条 user
    // 提醒（仅本次请求可见，不落盘、不进前端消息流）。限量 3 次防持续打扰
    piApi.on('context', (event) => {
      const lagging = todos && todos.some(t => t.status !== 'completed')
      if (!lagging || callsSinceUpdate < 5 || reminders >= 3) return undefined
      callsSinceUpdate = 0
      reminders++
      const snapshot = todos.map(t => '[' + t.status + '] ' + t.content).join('\n')
      return {
        messages: event.messages.concat([{
          role: 'user',
          content: '【系统提醒】你已连续执行多次工具但未更新任务清单，当前清单可能已滞后于实际进度：\n' + snapshot + '\n请立即调用 todo_write 更新状态：已完成的项置为 completed，正在进行的置为 in_progress。此清单是用户界面的进度面板，必须与实际进度保持同步。',
          timestamp: Date.now()
        }])
      }
    })
  }
}

module.exports = {
  // ask_user 扩展工厂：模型向用户提问（前端表单，IPC 回传答案）
  createAskUserExtension,
  // credential_get 扩展工厂：按名取「AI 取用类」凭据
  createCredentialGetExtension,
  // todo_write 扩展工厂：任务清单维护 + 滞后提醒兜底
  createTodoExtension
}
