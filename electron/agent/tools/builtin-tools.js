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
// 浏览器自动化撞登录墙 / 登录成功时上报，主进程登记 site-auth.json 并在
// 状态翻转为 login_required 时投递 login.required 通知（点击打开登录向导小窗）
function createSiteAuthExtension(onReport) {
  return function (piApi) {
    piApi.registerTool({
      name: 'report_site_auth',
      label: '上报站点登录态',
      description: '上报浏览器当前访问站点的登录状态（登录闭环流程）。'
        + '使用 browser 工具访问站点后：若页面出现登录墙 / 扫码 / 验证码 / 被重定向到登录页，'
        + '立即以 status=login_required 上报（note 说明页面特征）；'
        + '若确认已持有效登录态（此前上报过 login_required 的站点），以 status=logged_in 上报。'
        + '不要对未实际访问的站点猜测上报。上报 login_required 后告知用户：'
        + '桌面端已收到通知，点击即可打开登录向导窗口完成登录（成功后自动保存登录态并关闭）。',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string', description: '站点 URL 或域名' },
          status: { type: 'string', enum: ['login_required', 'logged_in'], description: 'login_required=遇到登录墙；logged_in=已确认登录' },
          note: { type: 'string', description: '可选：页面特征说明（如「重定向到 /login 要求扫码」）' }
        },
        required: ['url', 'status']
      },
      execute: async (_id, params) => {
        onReport({
          url: String(params.url || ''),
          status: params.status === 'logged_in' ? 'logged_in' : 'login_required',
          note: String(params.note || '')
        })
        return textResult('登录态已登记')
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
  createSiteAuthExtension
}
