// OmniBuddy 内置工具扩展（LangGraph 版 BUILTIN_TOOLS 的 Pi 同等实现）
// 以 extensionFactories 注入（与 ask_user / todo_write 同模式）：
// - multi_edit / append / mkdir：pi 无对应内置工具，补齐文件操作面
//   （read / ls / grep / find / write / edit / bash 为 pi SDK 内置，无需重复实现）
// - python / node / curl：沙箱代码执行与 HTTP 请求（与 pi 内置 bash 的默认行为一致：
//   本地直接执行；bash 在沙箱开关开启时由 sandbox.js 覆盖为隔离执行）
// - cd：会话级当前目录（cwdState），影响文件工具（multi_edit/append/mkdir）
//   与 python 的相对路径解析（pi 内置 read/write/bash 等基于会话 cwd，不受影响）
// - memory：pi-memory 扩展包（语义记忆 + qmd 检索），
//   由 pi.js 自动安装注册；旧版 memories.jsonl 由 pi.js 迁移到 MEMORY.md
// - todo_read：回读当前会话任务清单（todo_write 的镜像，模型多轮后可自查进度）
// - subagent 委派（对应 LangGraph 版 delegate_agent / delegate_agents）：
//   不重复造轮子，内置注册社区扩展 pi-subagents（本地依赖闭包，
//   经 settings.json packages 本地路径源注册的同模式）
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

let agentDir = ''

// ---------- todo 状态缓存（todo_write 写入，todo_read 回读） ----------
// 会话级内存缓存：pi.js 在 todo_write 推送前端事件时同步写此处
const todosByChat = new Map()

function cacheTodos(chatId, todos) {
  // 空清单也记录（todo_read 区分「无清单」与「已清空」）
  todosByChat.set(chatId, Array.isArray(todos) ? todos : [])
}

function getTodos(chatId) {
  return todosByChat.has(chatId) ? todosByChat.get(chatId) : null
}

// ---------- 旧版记忆读取（<agentDir>/memories.jsonl，仅供 pi.js 迁移到 pi-memory） ----------
function loadMemories() {
  try {
    return fs.readFileSync(path.join(agentDir, 'memories.jsonl'), 'utf-8').split('\n')
      .filter(l => l.trim())
      .map(l => { try { return JSON.parse(l) } catch (e) { return null } })
      .filter(Boolean)
  } catch (e) { return [] }
}

// ---------- pi-subagents 内置注册（pkg-registry 通用注册，与 mcp.js 的内置适配器同模式） ----------
// 包随应用打包（dependencies），登记本地绝对路径到 settings.json 的 packages
// （pi 本地路径源；dev 与打包（asar）环境同构，幂等处理路径切换）
function registerBuiltinSubagents() {
  return require('../integrations/pkg-registry').register(agentDir, 'pi-subagents')
}

// ---------- 工具结果包装 ----------
function textResult(text) {
  return { content: [{ type: 'text', text }], details: {} }
}

// ---------- 执行环境常量 ----------
const EXEC_TIMEOUT_MS = 30000   // python / curl 执行超时
const OUTPUT_MAX_CHARS = 20000  // 工具输出截断上限（防上下文爆炸）

// ---------- cd：会话级当前目录 ----------
// cwdState 为 { dir } 共享对象（pi.js 每会话创建，初始为工作空间目录），
// cd 工具与文件/python 工具共享同一引用
function createCdExtension(cwdState) {
  return function (piApi) {
    piApi.registerTool({
      name: 'cd',
      label: '切换目录',
      description: '切换当前工作目录（会话级）。影响后续相对路径的文件工具（multi_edit / append / mkdir）'
        + '与 python 的执行目录；read / grep / bash 等 pi 内置工具仍基于会话初始目录。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目标目录（相对当前目录或绝对路径）' }
        },
        required: ['path']
      },
      execute: async (_id, params) => {
        const rel = String(params.path || '')
        if (!rel) return textResult('错误：path 不能为空')
        const target = path.resolve(cwdState.dir, rel)
        try {
          const st = fs.statSync(target)
          if (!st.isDirectory()) return textResult('错误：目标不是目录：' + target)
        } catch (e) {
          return textResult('错误：目录不存在：' + target)
        }
        cwdState.dir = target
        return textResult('当前工作目录：' + target)
      }
    })
  }
}

// ---------- python / curl：代码执行与 HTTP 请求 ----------
function createExecToolsExtension(cwdState, tmpDir, getSkillEnv) {
  // 临时目录按工作空间划分：注入 TMPDIR/TEMP/TMP，使 python tempfile、
  // node os.tmpdir() 等默认临时路径落在 <workspace>/.tmp（与 bash 的 spawnHook 同源）。
  // getSkillEnv：激活技能的凭证 env（技能凭据注入，与 bash 路径同源取数）
  const execEnv = (extra) => {
    const env = Object.assign({}, process.env)
    if (tmpDir) {
      env.TMPDIR = tmpDir
      env.TEMP = tmpDir
      env.TMP = tmpDir
    }
    if (getSkillEnv) {
      try {
        Object.assign(env, getSkillEnv())
      } catch (e) { /* 凭据解析失败不影响执行 */ }
    }
    return extra ? Object.assign(env, extra) : env
  }
  return function (piApi) {
    piApi.registerTool({
      name: 'python',
      label: '运行 Python',
      description: '执行 Python 代码并返回 stdout / stderr（30 秒超时）。'
        + '相对路径基于当前工作目录。'
        + '预装办公与数据栈（numpy / pandas / matplotlib / openpyxl / python-docx / '
        + 'python-pptx / pdfplumber / pillow / requests / beautifulsoup4 / lxml / markitdown 等），可直接 import。',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '要执行的 Python 代码' }
        },
        required: ['code']
      },
      execute: async (_id, params) => {
        const code = String(params.code || '')
        if (!code.trim()) return textResult('错误：code 不能为空')
        const cwd = cwdState.dir
        const result = await new Promise((resolve) => {
          const tryCmd = (cmd) => {
            const child = spawn(cmd, ['-c', code], { cwd, env: execEnv() })
            let out = ''
            let err = ''
            let settled = false
            const timer = setTimeout(() => {
              try { child.kill('SIGKILL') } catch (e) { /* 已退出 */ }
            }, EXEC_TIMEOUT_MS)
            child.stdout.on('data', d => { out += d })
            child.stderr.on('data', d => { err += d })
            child.on('error', e => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              // macOS 无 python3 别名等场景回退 python
              if (e.code === 'ENOENT' && cmd === 'python3') tryCmd('python')
              else resolve({ ok: false, error: '无法启动 ' + cmd + '：' + e.message })
            })
            child.on('close', (codeNum) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              resolve({ ok: true, code: codeNum, out, err, timedOut: false })
            })
            child.on('exit', (codeNum, signal) => {
              if (settled) return
              settled = true
              clearTimeout(timer)
              if (signal === 'SIGKILL') resolve({ ok: true, code: codeNum, out, err, timedOut: true })
              else resolve({ ok: true, code: codeNum, out, err, timedOut: false })
            })
          }
          // 解释器优先级：内置运行时（开箱即用）→ 系统 python3 → python
          const py = require('../platform/runtime').probePython()
          tryCmd(py.bin || (process.platform === 'win32' ? 'python' : 'python3'))
        })
        if (!result.ok) return textResult('错误：' + result.error)
        let output = result.out || ''
        if (result.err) output += (output ? '\n--- stderr ---\n' : '') + result.err
        if (result.timedOut) output += '\n[执行超时（' + EXEC_TIMEOUT_MS / 1000 + ' 秒），进程已终止]'
        const truncated = output.length > OUTPUT_MAX_CHARS
        if (truncated) output = output.slice(0, OUTPUT_MAX_CHARS)
        return textResult('exit code: ' + result.code + '\n\n' + (output || '(无输出)')
          + (truncated ? '\n...[输出已截断]' : ''))
      }
    })

    piApi.registerTool({
      name: 'node',
      label: '运行 Node.js',
      description: '执行 Node.js 代码并返回 stdout / stderr（30 秒超时）。'
        + '相对路径基于当前工作目录。'
        + '预装图像与文档生成库（sharp / docx / pptxgenjs / pdf-lib / pdfjs-dist / marked），可直接 require。',
      parameters: {
        type: 'object',
        properties: {
          code: { type: 'string', description: '要执行的 Node.js 代码' }
        },
        required: ['code']
      },
      execute: async (_id, params) => {
        const code = String(params.code || '')
        if (!code.trim()) return textResult('错误：code 不能为空')
        const cwd = cwdState.dir
        const result = await new Promise((resolve) => {
          // 运行时优先级：内置 node（开箱即用，Windows 为 node.exe）→ 系统 PATH
          const rt = require('../platform/runtime')
          const cmd = rt.nodeExe() || 'node'
          // 预装库经 NODE_PATH 注入（node 的 require 不搜索全局安装路径）；
          // TMPDIR 同步注入（临时文件按工作空间落 .tmp）
          const modulesDir = rt.nodeGlobalModulesDir()
          const env = execEnv(modulesDir ? { NODE_PATH: modulesDir } : null)
          const child = spawn(cmd, ['-e', code], { cwd, env })
          let out = ''
          let err = ''
          let settled = false
          const timer = setTimeout(() => {
            try { child.kill('SIGKILL') } catch (e) { /* 已退出 */ }
          }, EXEC_TIMEOUT_MS)
          child.stdout.on('data', d => { out += d })
          child.stderr.on('data', d => { err += d })
          child.on('error', e => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve({ ok: false, error: '无法启动 ' + cmd + '：' + e.message })
          })
          child.on('close', (codeNum) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            resolve({ ok: true, code: codeNum, out, err, timedOut: false })
          })
          child.on('exit', (codeNum, signal) => {
            if (settled) return
            settled = true
            clearTimeout(timer)
            if (signal === 'SIGKILL') resolve({ ok: true, code: codeNum, out, err, timedOut: true })
            else resolve({ ok: true, code: codeNum, out, err, timedOut: false })
          })
        })
        if (!result.ok) return textResult('错误：' + result.error)
        let output = result.out || ''
        if (result.err) output += (output ? '\n--- stderr ---\n' : '') + result.err
        if (result.timedOut) output += '\n[执行超时（' + EXEC_TIMEOUT_MS / 1000 + ' 秒），进程已终止]'
        const truncated = output.length > OUTPUT_MAX_CHARS
        if (truncated) output = output.slice(0, OUTPUT_MAX_CHARS)
        return textResult('exit code: ' + result.code + '\n\n' + (output || '(无输出)')
          + (truncated ? '\n...[输出已截断]' : ''))
      }
    })

    piApi.registerTool({
      name: 'curl',
      label: '发起请求',
      description: '发起 HTTP 请求并返回响应（30 秒超时，body 截断返回）。'
        + '联网查询/API 调试用；浏览器自动化请走浏览器相关工具。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '请求地址（http:// 或 https://）' },
          method: { type: 'string', description: 'HTTP 方法（默认 GET）' },
          headers: { type: 'object', description: '请求头（键值对，可选）' },
          body: { type: 'string', description: '请求体（POST/PUT 等方法使用，可选）' }
        },
        required: ['url']
      },
      execute: async (_id, params) => {
        const url = String(params.url || '').trim()
        if (!/^https?:\/\//i.test(url)) {
          return textResult('错误：url 必须以 http:// 或 https:// 开头')
        }
        const method = String(params.method || 'GET').toUpperCase()
        const headers = {}
        if (params.headers && typeof params.headers === 'object' && !Array.isArray(params.headers)) {
          for (const k of Object.keys(params.headers)) headers[k] = String(params.headers[k])
        }
        const opts = { method, headers, signal: AbortSignal.timeout(EXEC_TIMEOUT_MS) }
        if (params.body !== undefined && params.body !== null && method !== 'GET' && method !== 'HEAD') {
          opts.body = String(params.body)
        }
        try {
          const res = await fetch(url, opts)
          const ct = res.headers.get('content-type') || ''
          let text = await res.text()
          const truncated = text.length > OUTPUT_MAX_CHARS
          if (truncated) text = text.slice(0, OUTPUT_MAX_CHARS)
          const head = 'HTTP ' + res.status + (res.statusText ? ' ' + res.statusText : '')
            + (ct ? '\nContent-Type: ' + ct : '')
          return textResult(head + '\n\n' + text
            + (truncated ? '\n...[响应已截断，共超过 ' + OUTPUT_MAX_CHARS + ' 字符]' : ''))
        } catch (e) {
          return textResult('请求失败：' + (e.name === 'TimeoutError' ? '超时（' + EXEC_TIMEOUT_MS / 1000 + ' 秒）' : e.message))
        }
      }
    })
  }
}

// ---------- 文件工具：multi_edit / append / mkdir ----------
// 相对路径基于 cwdState（cd 可变）解析
function createFileToolsExtension(cwdState) {
  return function (piApi) {
    piApi.registerTool({
      name: 'multi_edit',
      label: '批量编辑',
      description: '对同一文件批量执行多处精确替换（all-or-nothing：任一处未匹配则整批不写入）。'
        + 'edits 按顺序应用，每处替换 old_str 在当前内容中的首次出现。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（相对当前工作空间或绝对路径）' },
          edits: {
            type: 'array',
            description: '编辑列表，按顺序应用',
            items: {
              type: 'object',
              properties: {
                old_str: { type: 'string', description: '要查找的原文片段' },
                new_str: { type: 'string', description: '替换后的内容' }
              },
              required: ['old_str', 'new_str']
            }
          }
        },
        required: ['path', 'edits']
      },
      execute: async (_id, params) => {
        try {
          const rel = String(params.path || '')
          const edits = Array.isArray(params.edits) ? params.edits : []
          if (!rel) return textResult('错误：path 不能为空')
          if (!edits.length) return textResult('错误：edits 不能为空')
          const file = path.resolve(cwdState.dir, rel)
          let cur
          try {
            cur = fs.readFileSync(file, 'utf-8')
          } catch (e) {
            return textResult('错误：无法读取文件 ' + rel + '：' + e.message)
          }
          for (let i = 0; i < edits.length; i++) {
            const oldStr = String((edits[i] || {}).old_str || '')
            const newStr = String((edits[i] || {}).new_str || '')
            if (!oldStr) return textResult('错误：edits[' + i + '] 的 old_str 不能为空，整批未写入')
            if (cur.indexOf(oldStr) < 0) {
              return textResult('错误：edits[' + i + '] 的 old_str 未在文件中找到，整批未写入')
            }
            // String.replace（字符串参数）仅替换首次出现
            cur = cur.replace(oldStr, newStr)
          }
          fs.writeFileSync(file, cur, 'utf-8')
          return textResult('已应用 ' + edits.length + ' 处编辑到 ' + rel)
        } catch (e) {
          return textResult('错误：' + e.message)
        }
      }
    })

    piApi.registerTool({
      name: 'append',
      label: '追加内容',
      description: '追加内容到文件末尾（文件不存在时自动创建）。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '文件路径（相对当前工作空间或绝对路径）' },
          content: { type: 'string', description: '要追加的内容' }
        },
        required: ['path', 'content']
      },
      execute: async (_id, params) => {
        try {
          const rel = String(params.path || '')
          const content = String(params.content || '')
          if (!rel) return textResult('错误：path 不能为空')
          const file = path.resolve(cwdState.dir, rel)
          fs.appendFileSync(file, content, 'utf-8')
          const size = fs.statSync(file).size
          return textResult('已追加 ' + content.length + ' 字符到 ' + rel + '（文件现共 ' + size + ' 字节）')
        } catch (e) {
          return textResult('错误：' + e.message)
        }
      }
    })

    piApi.registerTool({
      name: 'mkdir',
      label: '创建目录',
      description: '创建目录（递归创建缺失的父目录）。',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '目录路径（相对当前工作空间或绝对路径）' }
        },
        required: ['path']
      },
      execute: async (_id, params) => {
        try {
          const rel = String(params.path || '')
          if (!rel) return textResult('错误：path 不能为空')
          const dir = path.resolve(cwdState.dir, rel)
          if (fs.existsSync(dir)) {
            if (fs.statSync(dir).isDirectory()) return textResult('目录已存在：' + dir)
            return textResult('错误：同路径存在同名文件：' + dir)
          }
          fs.mkdirSync(dir, { recursive: true })
          return textResult('目录已创建：' + dir)
        } catch (e) {
          return textResult('错误：' + e.message)
        }
      }
    })
  }
}

// ---------- todo_read ----------
function createTodoReadExtension(getTodos) {
  return function (piApi) {
    piApi.registerTool({
      name: 'todo_read',
      label: '查看任务清单',
      description: '读取当前会话的任务清单与进度（todo_write 写入的内容）。多轮任务中回顾进度时使用。',
      parameters: {
        type: 'object',
        properties: {}
      },
      execute: async () => {
        const todos = getTodos()
        if (!todos) return textResult('当前会话暂无任务清单（可用 todo_write 创建）')
        if (!todos.length) return textResult('任务清单为空')
        return textResult(todos.map((t, i) => {
          const mark = t.status === 'in_progress' ? '▶' : (t.status === 'completed' ? '✓' : '·')
          return (i + 1) + '. ' + mark + ' ' + (t.content || '')
        }).join('\n'))
      }
    })
  }
}

// ---------- 初始化 ----------
function init(dir) {
  agentDir = dir
  fs.mkdirSync(agentDir, { recursive: true })
  // 启动时尚无会话，注册后新会话即装载 subagent 工具
  registerBuiltinSubagents()
}

// ---------- site_auth：站点登录态上报（登录闭环登记） ----------
// 浏览器自动化撞登录墙 / 登录成功时上报。login_required 上报后登录闭环
// 内联在工具执行中：自动弹出登录向导浏览器窗口（playwright 完整 chromium
// 有头，与任务浏览器共用同一 profile）并挂起等待用户完成登录——成功后
// 登录态落在 profile 内（无迁移），直接重新访问即已登录；取消 / 超时
// 返回收尾指引
function createSiteAuthExtension(onReport) {
  return function (piApi) {
    piApi.registerTool({
      name: 'report_site_auth',
      label: '上报站点登录态',
      description: '上报浏览器当前访问站点的登录状态（登录闭环流程）。'
        + '使用 browser 工具访问站点后：若页面出现登录墙 / 扫码 / 验证码 / 被重定向到登录页，'
        + '立即以 status=login_required 上报（note 说明页面特征）——系统将自动弹出登录向导'
        + '浏览器窗口（与本工具共用同一浏览器配置），本工具会挂起等待用户完成登录：成功后'
        + '直接重新访问目标页面即为已登录状态，继续任务即可（无需任何恢复操作）；用户取消 / '
        + '超时则按返回说明收尾（用户可稍后经工具卡片「打开登录向导」补登）。'
        + '若确认已持有效登录态（此前上报过 login_required 的站点），以 status=logged_in 上报。'
        + '不要对未实际访问的站点猜测上报。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '站点 URL 或域名' },
          status: { type: 'string', enum: ['login_required', 'logged_in'], description: 'login_required=遇到登录墙；logged_in=已确认登录' },
          note: { type: 'string', description: '可选：页面特征说明（如「重定向到 /login 要求扫码」）' }
        },
        required: ['url', 'status']
      },
      execute: async (toolCallId, params) => {
        const url = String(params.url || '')
        const status = params.status === 'logged_in' ? 'logged_in' : 'login_required'
        onReport({
          toolCallId: String(toolCallId || ''),
          url: url,
          status: status,
          note: String(params.note || '')
        })
        if (status !== 'login_required') return textResult('登录态已登记')
        // 登录等待闭环：登记 + 前端卡片 / 通知已由 onReport 发出，此处自动
        // 开向导（已开则聚焦）并等待结果；等待期间用户操作向导即可。
        // 先挂等待再开窗：向导复用持久 profile，已登录站点可能秒级成功，
        // 结果回掷早于注册会丢失
        const siteAuth = require('../integrations/site-auth')
        const loginWizard = require('../integrations/login-wizard')
        const host = siteAuth.hostOf(url)
        if (!host) return textResult('站点域名无效，无法打开登录向导')
        const waitPromise = loginWizard.waitForResult(host)
        const opened = await loginWizard.open(host, url)
        if (!opened || !opened.ok) {
          // 开窗失败也要解除等待（waitForResult 已挂起）
          loginWizard._resolveWaiter(host, 'cancel')
          return textResult('登录窗口打开失败：' + ((opened && opened.error) || '未知错误')
            + '。请停止需要登录的操作并收尾。')
        }
        const outcome = await waitPromise
        if (outcome === 'success') {
          return textResult('登录成功：「' + host + '」登录态已保存在浏览器配置中（与本工具共用）。'
            + '请直接重新访问目标页面继续之前的任务——已是登录状态，无需任何恢复操作；'
            + '若页面仍显示未登录，先刷新或重新访问一次。')
        }
        return textResult('用户未完成登录（' + (outcome === 'timeout' ? '等待超时' : '已取消') + '）。'
          + '请停止需要登录的操作并收尾，告知用户：可稍后在对话中的工具卡片点「打开登录向导」补登'
          + '（成功后登录态自动保存在浏览器配置中，后续免登录），届时可重新发起该任务。')
      }
    })
  }
}

// ---------- 电脑控制：UI-TARS 原子动作面（computer-use.js 执行体） ----------
// 截屏 → 模型决策 → 注入鼠标键盘 → 观测回填的循环由主 agent 驱动，
// 本工厂只注册原子工具（截屏/点击/键入/滚动/打开）。截图产物落
// <cwd>/.tmp/，引导模型用 pi 内置 read 工具读图查看（支持图片）；
// 点击坐标一律按「最近一张截图的像素坐标」给出，worker 内做 Retina 换算
// 视觉模型（computer_look）：设置页「电脑控制 → 视觉模型」配置后额外注册，
// 截图直接交由该模型解读（GUI grounding），主对话模型无需视觉能力
function createComputerUseExtension(cwdState) {
  const computerUse = require('../integrations/computer-use')
  const call = (action, params) => computerUse.call(action, params)
  const hint = '如需继续操作，请先重新截屏观察最新画面（每次动作后画面可能已变化）。'

  // 视觉观察提示词：GUI grounding（描述 + 可交互元素 + 像素坐标），供动作决策
  function visionPrompt(shot) {
    return '你是桌面视觉观察助手（macOS GUI grounding 专家）。'
      + '你会收到一张屏幕截图（分辨率 ' + shot.width + 'x' + shot.height + '）与一个观察任务，'
      + '请输出面向动作决策的结构化观察报告：\n'
      + '1. 前台应用与当前窗口/场景概述（一句话）。\n'
      + '2. 与观察任务相关的可交互元素清单（按钮/输入框/链接/菜单项等），'
      + '每项给出描述与中心像素坐标（以截图左上角为原点，格式 (x,y)）。\n'
      + '3. 针对观察任务的直接回答：若任务指定了要操作的目标，精确给出其中心像素坐标。\n'
      + '坐标必须取自本截图的实际像素位置，禁止凭记忆或推测；报告简洁、只保留决策所需信息。'
  }

  // 调视觉模型解读截图（openai / anthropic 双格式，direct-llm 同模式）
  async function visionDescribe(vp, shot, question, signal) {
    const url = vp.baseUrl.replace(/\/+$/, '')
    let fetchUrl, headers, body
    if (vp.apiFormat === 'anthropic') {
      fetchUrl = url + (url.endsWith('/v1') ? '/messages' : '/v1/messages')
      headers = {
        'Content-Type': 'application/json',
        'x-api-key': vp.apiKey,
        'anthropic-version': '2023-06-01',
      }
      body = {
        model: vp.model,
        max_tokens: 2048,
        system: visionPrompt(shot),
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: shot.b64 } },
            { type: 'text', text: '观察任务：' + question },
          ],
        }],
      }
    } else {
      fetchUrl = url + '/chat/completions'
      headers = {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + vp.apiKey,
      }
      body = {
        model: vp.model,
        messages: [
          { role: 'system', content: visionPrompt(shot) },
          {
            role: 'user',
            content: [
              { type: 'text', text: '观察任务：' + question },
              { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,' + shot.b64 } },
            ],
          },
        ],
      }
    }
    let res
    try {
      res = await fetch(fetchUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal,
      })
    } catch (e) {
      throw new Error('视觉模型请求失败：' + e.message)
    }
    if (!res.ok) {
      const txt = await res.text().catch(() => '')
      throw new Error('视觉模型 HTTP ' + res.status + '：' + txt.slice(0, 300))
    }
    const j = await res.json().catch(() => null)
    // anthropic：content 为块数组，可能含 thinking 块（glm 等默认输出）——只取 text 块拼接；
    // openai：choices[0].message.content 直接是字符串
    let text = ''
    if (j && Array.isArray(j.content)) {
      text = j.content.filter(b => b && b.type === 'text' && b.text)
        .map(b => b.text).join('\n').trim()
    } else if (j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) {
      text = String(j.choices[0].message.content).trim()
    }
    if (!text) throw new Error('视觉模型响应异常：' + JSON.stringify(j).slice(0, 300))
    return text
  }

  return function (piApi) {
    // 视觉观察工具：仅配置了视觉模型时注册（工厂在会话创建时求值，同开关锁定模式）
    if (computerUse.visionProvider()) {
      piApi.registerTool({
        name: 'computer_look',
        label: '观察屏幕',
        description: '截取当前屏幕并交由专用视觉模型解读，返回结构化观察报告'
          + '（前台应用、可交互元素清单及像素坐标、对观察任务的回答）。'
          + '本工具返回的坐标可直接用于 computer_click；每次动作后应重新调用本工具观察最新画面。',
        parameters: {
          type: 'object',
          properties: {
            question: { type: 'string', description: '观察任务：要在屏幕上找什么/确认什么（如「找到新建按钮的位置」）' }
          },
          required: ['question']
        },
        execute: async (_id, params, signal) => {
          const question = String((params || {}).question || '描述当前屏幕状态与可交互元素').trim()
          // 配置可能在会话创建后被改动：执行时取最新，条目失效则报错引导
          const vp = computerUse.visionProvider()
          if (!vp) {
            return textResult('错误：视觉模型未配置或已失效，请在「设置 → 电脑控制 → 视觉模型」选择支持图像输入的模型，'
              + '或改用 computer_screenshot + read 工具自行读图。')
          }
          const shot = await call('screenshot')
          // 截图同步落盘：前端会话时间线可直接查看，也作为动作坐标的原始依据
          const dir = path.join(cwdState.dir, '.tmp')
          fs.mkdirSync(dir, { recursive: true })
          const file = path.join(dir, 'screen-' + Date.now() + '.jpg')
          fs.writeFileSync(file, Buffer.from(shot.b64, 'base64'))
          let report
          try {
            report = await visionDescribe(vp, shot, question, signal)
          } catch (e) {
            return textResult('视觉模型解读失败：' + e.message + '\n截图已保存：' + file
              + '（可改用 read 工具自行读图观察）')
          }
          return {
            content: [{
              type: 'text',
              text: '【视觉观察报告（' + vp.name + '）】任务：' + question + '\n' + report
                + '\n\n（截图存档：' + file + '；报告坐标基于该截图像素，可直接用于 computer_click）'
            }],
            details: { artifacts: [{ path: file, name: path.basename(file) }] }
          }
        }
      })
    }

    piApi.registerTool({
      name: 'computer_screenshot',
      label: '截取屏幕',
      description: '截取当前主显示器画面为 JPEG（最长边 1920）。返回截图文件路径与像素尺寸，'
        + '必须用 read 工具读取该图片查看画面；后续点击工具的坐标以截图像素为准。',
      parameters: { type: 'object', properties: {} },
      execute: async (_id, _params) => {
        const shot = await call('screenshot')
        const dir = path.join(cwdState.dir, '.tmp')
        fs.mkdirSync(dir, { recursive: true })
        const file = path.join(dir, 'screen-' + Date.now() + '.jpg')
        fs.writeFileSync(file, Buffer.from(shot.b64, 'base64'))
        return textResult('截图已保存：' + file + '（像素 ' + shot.width + 'x' + shot.height + '）\n'
          + '请立即用 read 工具读取该图片查看画面；computer_click / computer_double_click 的 x/y '
          + '以此截图的像素坐标为准。')
      }
    })

    piApi.registerTool({
      name: 'computer_click',
      label: '点击屏幕',
      description: '在截图像素坐标处模拟鼠标单击（先移动再点击，Retina 坐标自动换算）。'
        + '坐标必须来自最近一次 computer_screenshot 的截图像素。',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '目标元素中心的横坐标（截图像素）' },
          y: { type: 'number', description: '目标元素中心的纵坐标（截图像素）' }
        },
        required: ['x', 'y']
      },
      execute: async (_id, params) => {
        return textResult(await call('click', { x: params.x, y: params.y }) + '\n' + hint)
      }
    })

    piApi.registerTool({
      name: 'computer_double_click',
      label: '双击屏幕',
      description: '在截图像素坐标处模拟鼠标双击。坐标必须来自最近一次 computer_screenshot 的截图像素。',
      parameters: {
        type: 'object',
        properties: {
          x: { type: 'number', description: '目标元素中心的横坐标（截图像素）' },
          y: { type: 'number', description: '目标元素中心的纵坐标（截图像素）' }
        },
        required: ['x', 'y']
      },
      execute: async (_id, params) => {
        return textResult(await call('double_click', { x: params.x, y: params.y }) + '\n' + hint)
      }
    })

    piApi.registerTool({
      name: 'computer_type',
      label: '键入文字',
      description: '向前台应用键入文字。纯 ASCII 直接敲键盘；含中文自动经剪贴板粘贴（cmd+v，会覆盖用户剪贴板）。'
        + '输入前须先点击目标输入框使其聚焦。',
      parameters: {
        type: 'object',
        properties: {
          text: { type: 'string', description: '要键入的文字' }
        },
        required: ['text']
      },
      execute: async (_id, params) => {
        return textResult(await call('type', { text: String(params.text ?? '') }) + '\n' + hint)
      }
    })

    piApi.registerTool({
      name: 'computer_key',
      label: '按快捷键',
      description: '向前台应用发送按键组合，如 enter、esc、tab、cmd+v、cmd+tab、alt+f4（macOS 修饰键用 cmd/alt/ctrl/shift）。',
      parameters: {
        type: 'object',
        properties: {
          combo: { type: 'string', description: '按键组合（+ 连接），如 enter / cmd+v / cmd+shift+t' }
        },
        required: ['combo']
      },
      execute: async (_id, params) => {
        return textResult(await call('key', { combo: params.combo }) + '\n' + hint)
      }
    })

    piApi.registerTool({
      name: 'computer_scroll',
      label: '滚动屏幕',
      description: '在当前鼠标位置滚动页面（up / down / left / right，幅度 1-10 默认 3）。',
      parameters: {
        type: 'object',
        properties: {
          direction: { type: 'string', description: '滚动方向：up / down / left / right', enum: ['up', 'down', 'left', 'right'] },
          amount: { type: 'number', description: '滚动幅度 1-10（默认 3）' }
        },
        required: ['direction']
      },
      execute: async (_id, params) => {
        return textResult(await call('scroll', { direction: params.direction, amount: params.amount }) + '\n' + hint)
      }
    })

    piApi.registerTool({
      name: 'computer_open',
      label: '打开应用/链接',
      description: '用系统默认方式打开 macOS 应用（应用名，如 "备忘录" / "Safari" / "Finder"）'
        + '或 URL（https:// 与 dingtalk:// 等私有协议）。操作后须重新截屏确认结果。',
      parameters: {
        type: 'object',
        properties: {
          app: { type: 'string', description: 'macOS 应用名（与 url 二选一）' },
          url: { type: 'string', description: '要打开的 URL（与 app 二选一）' }
        }
      },
      execute: async (_id, params) => {
        return textResult(await call('open', { app: params.app, url: params.url }) + '\n' + hint)
      }
    })
  }
}

module.exports = {
  // 初始化 agentDir 并注册内置 subagents
  init,
  // 写入会话 todo 缓存（todo_write 镜像）
  cacheTodos,
  // 回读会话 todo 缓存（无清单返回 null）
  getTodos,
  // 读取旧版 memories.jsonl（供迁移）
  loadMemories,
  // cd 会话级目录工具扩展工厂
  createCdExtension,
  // python / node / curl 工具扩展工厂
  createExecToolsExtension,
  // multi_edit / append / mkdir 工具扩展工厂
  createFileToolsExtension,
  // todo_read 工具扩展工厂
  createTodoReadExtension,
  // report_site_auth 登录态上报工具工厂
  createSiteAuthExtension,
  // 电脑控制工具扩展工厂（截屏/点击/键入/滚动/打开）
  createComputerUseExtension
}
