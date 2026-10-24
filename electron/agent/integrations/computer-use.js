// 电脑控制执行体（computer use）：
// - 开关存储：<agentDir>/computer-use.json 的 omnideck.computerUseEnabled（默认关）
// - 执行链路：主进程（本模块）─ stdin/stdout JSON 行 RPC ─▶ worker 子进程
//   worker 用 Electron 自带二进制以 ELECTRON_RUN_AS_NODE=1 纯 Node 模式运行，
//   避免 Electron ABI 与系统 Node 的差异（libnut 是 N-API 预编译，双端通用）
// - worker 内动态 import @nut-tree-fork/nut-js（ESM 包）模拟鼠标键盘（辅助功能权限），
//   截屏走系统 screencapture（屏幕录制权限）
// - worker 源码来自本文件内自包含函数 workerMain 的 toString()，运行时落盘到
//   <agentDir>/cache/computer-use-worker.cjs 再执行：
//   规避 electron-vite 打包改写与 asar 内 ESM import 的不确定行为；
//   asar 打包时经 require.resolve + app.asar → app.asar.unpacked 换出物理路径
const { spawn, execFileSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

let agentDir = ''

// ===== 配置读写（照 web-search.js 模式）=====
function configPath() {
  return path.join(agentDir, 'computer-use.json')
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf-8'))
  } catch (e) {
    return {}
  }
}

function writeConfig(cfg) {
  fs.writeFileSync(configPath(), JSON.stringify(cfg, null, 2))
}

// ---------- 对外接口：开关 ----------
function init(dir) {
  agentDir = dir
}

// 电脑控制开关（默认关闭——涉及真实键鼠注入，需用户显式开启）
function enabled() {
  const cfg = readConfig()
  return !!(cfg.omnideck && cfg.omnideck.computerUseEnabled)
}

function setEnabled(v) {
  const cfg = readConfig()
  cfg.omnideck = Object.assign({}, cfg.omnideck, { computerUseEnabled: !!v })
  writeConfig(cfg)
  if (!v) dispose() // 关闭即回收 worker 子进程
  return enabled()
}

// ---------- 对外接口：拟人移动轨迹开关（默认开；worker 启动时经 env 锁定） ----------
function humanMove() {
  const cfg = readConfig()
  return !(cfg.omnideck && cfg.omnideck.humanMove === false)
}

function setHumanMove(v) {
  const cfg = readConfig()
  cfg.omnideck = Object.assign({}, cfg.omnideck, { humanMove: v !== false })
  writeConfig(cfg)
  // 开关在 worker 启动时锁定：变更即回收，下次操作按新配置懒启动
  dispose()
  return humanMove()
}

// ---------- 对外接口：视觉模型（截图解读专用，弹窗表单直存参数） ----------
// 独立配置（不依赖模型管理）：computer-use.json 的 omnideck.vision =
// { name, baseUrl, apiKey, model, apiFormat: 'openai' | 'anthropic' }
function visionProvider() {
  const cfg = readConfig()
  const v = cfg.omnideck && cfg.omnideck.vision
  if (!v || !v.baseUrl || !v.model || !v.apiKey) return null
  return {
    name: v.name || v.model,
    model: v.model,
    baseUrl: v.baseUrl,
    apiKey: v.apiKey,
    apiFormat: v.apiFormat === 'anthropic' ? 'anthropic' : 'openai',
  }
}

// 保存视觉模型参数：vision 为 null/空 → 清除；apiKey 留空 → 沿用已存密钥
function setVision(vision) {
  const cfg = readConfig()
  const prev = (cfg.omnideck && cfg.omnideck.vision) || {}
  if (!vision || !vision.baseUrl) {
    if (cfg.omnideck) {
      delete cfg.omnideck.vision
      writeConfig(cfg)
    }
    return null
  }
  const baseUrl = String(vision.baseUrl || '').trim()
  const model = String(vision.model || '').trim()
  if (!/^https?:\/\//i.test(baseUrl)) throw new Error('Base URL 须以 http(s):// 开头')
  if (!model) throw new Error('模型 ID 不能为空')
  const apiKey = String(vision.apiKey || '').trim() || prev.apiKey || ''
  if (!apiKey) throw new Error('API Key 不能为空')
  const next = {
    name: String(vision.name || '').trim() || model,
    baseUrl,
    model,
    apiKey,
    apiFormat: vision.apiFormat === 'anthropic' ? 'anthropic' : 'openai',
  }
  cfg.omnideck = Object.assign({}, cfg.omnideck, { vision: next })
  writeConfig(cfg)
  return visionProvider()
}

// ---------- nut.js 入口定位（dev 直用 node_modules；打包后换 asar.unpacked 物理路径）----------
function nutEntryPath() {
  try {
    const resolved = require.resolve('@nut-tree-fork/nut-js')
    const physical = resolved.replace('app.asar', 'app.asar.unpacked')
    return fs.existsSync(physical) ? physical : resolved
  } catch (e) {
    return ''
  }
}

// ===== worker 子进程管理（懒启动 + 空闲自杀 + 退出时回收）=====
let child = null
let workerPath = ''
let reqSeq = 0
const pending = new Map() // id -> { resolve, reject }

function workerFile() {
  if (!workerPath) {
    const cacheDir = path.join(agentDir, 'cache')
    fs.mkdirSync(cacheDir, { recursive: true })
    workerPath = path.join(cacheDir, 'computer-use-worker.cjs')
  }
  return workerPath
}

function ensureWorker() {
  if (child && child.exitCode === null) return child
  const entry = nutEntryPath()
  if (!entry) throw new Error('未找到 @nut-tree-fork/nut-js，请先在项目根目录执行 npm install')
  const file = workerFile()
  // 自包含函数源码落盘（workerMain 内禁止引用任何模块级变量）
  fs.writeFileSync(file, '(' + workerMain.toString() + ')();\n')
  const c = spawn(process.execPath, [file], {
    env: Object.assign({}, process.env, {
      ELECTRON_RUN_AS_NODE: '1',
      NUT_ENTRY: entry,
      CU_HUMAN: humanMove() ? '1' : '0',
    }),
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  child = c

  let buf = ''
  c.stdout.setEncoding('utf8')
  c.stdout.on('data', (chunk) => {
    buf += chunk
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      let msg
      try { msg = JSON.parse(line) } catch (e) { continue }
      const p = pending.get(msg.id)
      if (p) {
        pending.delete(msg.id)
        if (msg.ok) p.resolve(msg.result)
        else p.reject(new Error(msg.error || 'worker 返回错误'))
      }
    }
  })

  let errTail = ''
  c.stderr.setEncoding('utf8')
  c.stderr.on('data', (chunk) => { errTail = (errTail + chunk).slice(-2000) })

  c.on('exit', (code) => {
    // 仅处理「当前 worker」的退出；dispose 后旧 worker 的迟到 exit 不得
    // 清空共享 pending（此时可能已有新 worker 的在途请求，误杀报"已退出"）
    if (child !== c) return
    child = null
    const tail = errTail.trim().split('\n').slice(-2).join(' ').slice(0, 300)
    const err = new Error('电脑控制 worker 已退出 (code ' + code + ')' + (tail ? '：' + tail : ''))
    for (const [, p] of pending) p.reject(err)
    pending.clear()
  })
  return c
}

// RPC 调用：{id, action, params} → {id, ok, result|error}
function call(action, params, timeoutMs) {
  const c = ensureWorker()
  const id = ++reqSeq
  const timeout = timeoutMs || (String(action) === 'screenshot' ? 20000 : 30000)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      reject(new Error('电脑控制操作超时：' + action))
    }, timeout)
    pending.set(id, {
      resolve: (v) => { clearTimeout(timer); resolve(v) },
      reject: (e) => { clearTimeout(timer); reject(e) },
    })
    try {
      c.stdin.write(JSON.stringify({ id, action, params: params || {} }) + '\n')
    } catch (e) {
      pending.delete(id)
      clearTimeout(timer)
      reject(new Error('电脑控制 worker 通信失败：' + e.message))
    }
  })
}

// 回收 worker（app before-quit / 关闭开关时调用）
function dispose() {
  if (child && child.exitCode === null) {
    try { child.kill() } catch (e) { /* 忽略 */ }
  }
  child = null
  for (const [, p] of pending) p.reject(new Error('电脑控制已关闭'))
  pending.clear()
}

// ---------- 权限探测（macOS：辅助功能 + 屏幕录制 + nut 可用性）----------
function probe() {
  const res = {
    platform: process.platform,
    accessibility: false, // 辅助功能（点击/键入）
    screen: false,        // 屏幕录制（截屏）
    screenNote: '',
    nut: false,           // nut.js 模块可用
    nutError: '',
  }
  if (process.platform !== 'darwin') {
    res.screenNote = '电脑控制目前仅支持 macOS'
    return call('ping', {}, 15000).then(() => {
      res.nut = true
      return res
    }).catch((e) => {
      res.nutError = e.message
      return res
    })
  }
  // 辅助功能：System Events 取进程名，未授权时 osascript 直接报错
  try {
    execFileSync('osascript',
      ['-e', 'tell application "System Events" to get name of first application process'],
      { stdio: 'ignore' })
    res.accessibility = true
  } catch (e) { res.accessibility = false }

  // 屏幕录制：试截一张，未授权时只能截到纯壁纸（文件远小于含窗口内容的截图）
  try {
    const tmp = path.join(os.tmpdir(), 'omnideck-cu-probe-' + process.pid + '.jpg')
    if (fs.existsSync(tmp)) { try { fs.unlinkSync(tmp) } catch (e) { /* 忽略 */ } }
    execFileSync('screencapture', ['-x', '-m', '-t', 'jpg', tmp], { stdio: 'ignore' })
    const size = fs.existsSync(tmp) ? fs.statSync(tmp).size : 0
    res.screen = size > 50 * 1024
    try { fs.unlinkSync(tmp) } catch (e) { /* 忽略 */ }
    if (!res.screen) res.screenNote = '屏幕录制权限未授予，截屏只能得到空白壁纸'
  } catch (e) {
    res.screenNote = '截屏失败：' + e.message
  }

  // nut.js 可用性（顺带验证原生模块在 Electron-as-Node 下可加载）
  return call('ping', {}, 15000).then(() => {
    res.nut = true
    return res
  }).catch((e) => {
    res.nutError = e.message
    return res
  })
}

/* ════════════════════════════════════════════════════════════════
 * worker 主体（自包含函数，禁止引用上方任何模块级变量！）
 * 经 toString() 落盘为 .cjs，由 Electron 二进制以 ELECTRON_RUN_AS_NODE=1 运行。
 * 核心实现照搬 todo/ui-agent/agent.js（已验证）。
 * ════════════════════════════════════════════════════════════════ */
function workerMain() {
  'use strict'
  const fs = require('fs')
  const os = require('os')
  const path = require('path')
  const { execFileSync } = require('child_process')
  const { pathToFileURL } = require('url')

  const IS_MAC = process.platform === 'darwin'
  const MAX_DIM = 1920 // 截图最长边，超出则缩放（降低 payload 与推理延迟）
  const SHOT_PATH = path.join(os.tmpdir(), 'omnideck-cu-shot-' + process.pid + '.jpg')
  const IDLE_QUIT_MS = 5 * 60 * 1000
  // 拟人移动轨迹开关（主进程 spawn 时经 env 注入；worker 启动时锁定）
  const HUMAN_MOVE = process.env.CU_HUMAN !== '0'

  let nut = null      // 懒加载 { mouse, keyboard, Key, Point, clipboard, Button }
  let lastShot = null // 最近一次截图 { width, height }（模型坐标基准）
  let logical = null  // 屏幕逻辑分辨率 { w, h }
  let idleTimer = null

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
  const rand = (min, max) => min + Math.random() * (max - min)

  // 拟人移动：三次贝塞尔弧线 + ease-out 步距 + 微抖动。
  // 逐点 move 产生连续 CGEvent 移动流，网页端可见完整 mousemove 序列，
  // 避免 setPosition 瞬移被反自动化识别；到位后随机停留再交由调用方按压
  async function moveHuman(m, tx, ty) {
    const Point = m.Point
    if (!HUMAN_MOVE) {
      await m.mouse.setPosition(new Point(tx, ty))
      await sleep(150)
      return
    }
    const start = await m.mouse.getPosition()
    const dist = Math.hypot(tx - start.x, ty - start.y)
    if (dist < 3) { await sleep(rand(60, 130)); return } // 已在目标附近：仅停留
    const steps = Math.max(8, Math.min(30, Math.round(dist / 45)))
    // 法向量随机弯曲（人手轨迹不是直线）
    const nx = (tx - start.x) / dist, ny = (ty - start.y) / dist
    const bend = rand(-0.25, 0.25) * dist
    const p1 = { x: start.x + nx * dist * 0.3 - ny * bend, y: start.y + ny * dist * 0.3 + nx * bend }
    const p2 = { x: start.x + nx * dist * 0.7 - ny * bend, y: start.y + ny * dist * 0.7 + nx * bend }
    const path = []
    for (let i = 1; i <= steps; i++) {
      const t = 1 - Math.pow(1 - i / steps, 2) // ease-out：先快后慢
      const u = 1 - t
      const x = u * u * u * start.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * tx
      const y = u * u * u * start.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * ty
      const j = i === steps ? 0 : 1.5 // 末点不抖动，精确落位
      path.push(new Point(Math.round(x + rand(-j, j)), Math.round(y + rand(-j, j))))
    }
    path[steps - 1] = new Point(tx, ty)
    await m.mouse.move(path)
    await sleep(rand(60, 130)) // hover 停留（hover 展开菜单也依赖此停留）
  }

  // 拟人按压：按下-抬起间隔随机（替代 leftClick 固定节奏）；button 缺省左键
  async function pressHuman(m, button) {
    if (!HUMAN_MOVE) {
      if (button === m.Button.RIGHT) { await m.mouse.rightClick(); return }
      await m.mouse.leftClick()
      return
    }
    await m.mouse.pressButton(button === undefined ? m.Button.LEFT : button)
    await sleep(rand(40, 90))
    await m.mouse.releaseButton(button === undefined ? m.Button.LEFT : button)
  }

  function bumpIdle() {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => process.exit(0), IDLE_QUIT_MS)
    if (idleTimer.unref) idleTimer.unref()
  }

  function send(msg) {
    process.stdout.write(JSON.stringify(msg) + '\n')
  }

  async function loadNut() {
    if (nut) return nut
    const entry = process.env.NUT_ENTRY
    if (!entry) throw new Error('缺少 NUT_ENTRY 环境变量（nut.js 未安装？）')
    let mod
    try {
      mod = await import(pathToFileURL(entry).href)
    } catch (e) {
      throw new Error('nut.js 加载失败：' + ((e && e.message) || e))
    }
    const api = (mod.default && mod.default.mouse && !mod.mouse) ? mod.default : mod
    const { mouse, keyboard, Key, Point, clipboard, Button } = api
    if (!mouse || !keyboard || !Key || !Point || !Button) throw new Error('nut.js 导出异常')
    nut = { mouse, keyboard, Key, Point, clipboard, Button }
    return nut
  }

  // 截主显示器为 JPEG 并读取尺寸；返回 { b64, width, height }
  function takeScreenshot() {
    if (!IS_MAC) throw new Error('电脑控制目前仅支持 macOS')
    if (fs.existsSync(SHOT_PATH)) { try { fs.unlinkSync(SHOT_PATH) } catch (e) { /* 忽略 */ } }
    execFileSync('screencapture', ['-x', '-m', '-t', 'jpg', SHOT_PATH], { stdio: 'ignore' })
    if (!fs.existsSync(SHOT_PATH)) throw new Error('截屏失败（请检查「屏幕录制」权限）')
    try { execFileSync('sips', ['-Z', String(MAX_DIM), SHOT_PATH], { stdio: 'ignore' }) } catch (e) { /* 缩图失败不致命 */ }
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', SHOT_PATH], { encoding: 'utf8' })
    const w = parseInt((out.match(/pixelWidth:\s*(\d+)/) || [])[1], 10)
    const h = parseInt((out.match(/pixelHeight:\s*(\d+)/) || [])[1], 10)
    if (!w || !h) throw new Error('解析截图尺寸失败')
    return { b64: fs.readFileSync(SHOT_PATH).toString('base64'), width: w, height: h }
  }

  // 屏幕逻辑分辨率（Retina 截图像素是逻辑坐标的 2 倍，点击坐标需按比例换算）
  function getLogicalScreenSize() {
    if (IS_MAC) {
      try {
        const out = execFileSync('osascript',
          ['-e', 'tell application "Finder" to get bounds of window of desktop'], { encoding: 'utf8' })
        const n = out.split(',').map((s) => parseInt(s.trim(), 10))
        if (n.length === 4 && n[2] > 0 && n[3] > 0) return { w: n[2], h: n[3] }
      } catch (e) { /* 拿不到时按 scale=1 处理 */ }
    }
    return null
  }

  // 由「截图像素坐标」换算「屏幕逻辑坐标」的比例
  function shotScale() {
    if (!lastShot) throw new Error('请先调用 screenshot 获取当前屏幕截图（点击坐标以截图像素为准）')
    if (!logical) logical = getLogicalScreenSize()
    if (logical) {
      return { scale: logical.w / lastShot.width, scaleY: logical.h / lastShot.height, logical }
    }
    return { scale: 1, scaleY: 1, logical: null }
  }

  async function copyToClipboard(text) {
    try {
      await nut.clipboard.setContent(text)
    } catch (e) {
      if (IS_MAC) require('child_process').spawnSync('pbcopy', [], { input: text })
      else throw e
    }
  }

  // 按键名 → nut Key 枚举（枚举值可能为 0，不能用 !! 判断）
  const KEY_ALIASES = (() => {
    const map = {
      cmd: ['LeftCmd', 'Cmd', 'LeftSuper', 'LeftMeta', 'Meta'],
      win: ['LeftWindows', 'LeftSuper', 'LeftMeta', 'Meta'],
      super: ['LeftSuper', 'LeftMeta', 'LeftCmd'],
      meta: ['LeftMeta', 'Meta', 'LeftCmd'],
      ctrl: ['LeftControl', 'Control'],
      control: ['LeftControl', 'Control'],
      alt: ['LeftAlt', 'Alt', 'Option'],
      option: ['LeftAlt', 'Option'],
      shift: ['LeftShift', 'Shift'],
      enter: ['Enter', 'Return'],
      return: ['Enter', 'Return'],
      esc: ['Escape'],
      escape: ['Escape'],
      tab: ['Tab'],
      space: ['Space'],
      backspace: ['Backspace'],
      delete: ['Delete', 'Del'],
      del: ['Delete'],
      up: ['Up'], down: ['Down'], left: ['Left'], right: ['Right'],
      home: ['Home'], end: ['End'],
      pageup: ['PageUp'], pagedown: ['PageDown'],
    }
    for (let i = 1; i <= 12; i++) map['f' + i] = ['F' + i]
    return map
  })()

  function resolveKey(Key, name) {
    const n = String(name).trim().toLowerCase()
    const candidates = (KEY_ALIASES[n] || [])
      .concat([n, n.toUpperCase(), n[0].toUpperCase() + n.slice(1)])
    for (const c of candidates) {
      if (Key[c] !== undefined) return Key[c]
    }
    throw new Error('未知按键「' + name + '」')
  }

  async function pressCombo(combo) {
    const names = String(combo).split('+').map((s) => s.trim()).filter(Boolean)
    if (!names.length) throw new Error('空按键组合')
    const keys = names.map((n) => resolveKey(nut.Key, n))
    await nut.keyboard.pressKey.apply(null, keys)
    await sleep(80)
    await nut.keyboard.releaseKey.apply(null, keys)
  }

  // 截图像素坐标 → 逻辑坐标（校验数值与边界；click / hover / drag 共用）
  function toLogical(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('x/y 缺失或非法')
    const { scale, scaleY, logical: lg } = shotScale()
    const sx = Math.round(x * scale), sy = Math.round(y * scaleY)
    if (sx < 0 || sy < 0 || (lg && (sx > lg.w || sy > lg.h))) {
      throw new Error('坐标越界 (' + sx + ',' + sy + ')，逻辑分辨率 ' + (lg ? lg.w + 'x' + lg.h : '未知'))
    }
    return [sx, sy]
  }

  // ---------- 动作处理器 ----------
  const handlers = {
    async ping() {
      await loadNut()
      return { platform: process.platform }
    },

    async screenshot() {
      const shot = takeScreenshot()
      lastShot = { width: shot.width, height: shot.height }
      logical = null // 每次截屏后重取，避免分辨率/主屏变化导致换算错位
      return shot // { b64, width, height }
    },

    async click(params) {
      const m = await loadNut()
      const [sx, sy] = toLogical(+params.x, +params.y)
      await moveHuman(m, sx, sy)
      await pressHuman(m, params.button === 'right' ? m.Button.RIGHT : m.Button.LEFT)
      return (params.button === 'right' ? 'right-' : '') + 'click @ 逻辑坐标(' + sx + ',' + sy + ')'
    },

    async double_click(params) {
      const m = await loadNut()
      const [sx, sy] = toLogical(+params.x, +params.y)
      await moveHuman(m, sx, sy)
      if (HUMAN_MOVE) {
        // 双击 = 两次拟人按压，间隔随机（模拟人手连点）
        await pressHuman(m)
        await sleep(rand(60, 120))
        await pressHuman(m)
      } else {
        try { await m.mouse.doubleClick() } catch (e) {
          await m.mouse.leftClick()
          await m.mouse.leftClick()
        }
      }
      return 'double_click @ 逻辑坐标(' + sx + ',' + sy + ')'
    },

    // 悬停：移动到目标并停留（hover 展开菜单 / 触发 tooltip；停留比点击长）
    async hover(params) {
      const m = await loadNut()
      const [sx, sy] = toLogical(+params.x, +params.y)
      await moveHuman(m, sx, sy)
      await sleep(HUMAN_MOVE ? rand(250, 500) : 200) // 等待 hover 菜单/tooltip 展开
      return 'hover @ 逻辑坐标(' + sx + ',' + sy + ')'
    },

    // 拖拽：按住起点 → 贝塞尔移动到终点 → 释放（滑块 / 文件拖放 / 窗口移动）
    async drag(params) {
      const m = await loadNut()
      const [s1x, s1y] = toLogical(+params.from_x, +params.from_y)
      const [s2x, s2y] = toLogical(+params.to_x, +params.to_y)
      await moveHuman(m, s1x, s1y)
      await m.mouse.pressButton(m.Button.LEFT)
      await sleep(rand(80, 150)) // 按住稳定
      await moveHuman(m, s2x, s2y) // 按住状态沿贝塞尔移动
      await sleep(rand(60, 120)) // 到位稳定（拖放目标高亮等）
      await m.mouse.releaseButton(m.Button.LEFT)
      return 'drag (' + s1x + ',' + s1y + ') → (' + s2x + ',' + s2y + ')'
    },

    async type(params) {
      const m = await loadNut()
      const text = String(params.text ?? '')
      if (!text) throw new Error('text 缺失')
      if (/^[\x00-\x7F]*$/.test(text)) {
        await m.keyboard.type(text) // 纯 ASCII 直接键入
        return 'type(键盘)「' + text.slice(0, 30) + '」'
      }
      // 含中文：keystroke 模拟输入法不可靠，标准做法是剪贴板 + 粘贴
      await copyToClipboard(text)
      await sleep(80)
      await pressCombo(IS_MAC ? 'cmd+v' : 'ctrl+v')
      return 'type(剪贴板粘贴)「' + text.slice(0, 30) + '」'
    },

    async key(params) {
      await loadNut()
      const combo = params.combo || params.key
      if (!combo) throw new Error('combo 缺失')
      await pressCombo(combo)
      return 'key ' + combo
    },

    async scroll(params) {
      const m = await loadNut()
      const dir = String(params.direction || 'down').toLowerCase()
      const amount = Math.max(1, Math.min(10, +params.amount || 3))
      const fns = { up: m.mouse.scrollUp, down: m.mouse.scrollDown, left: m.mouse.scrollLeft, right: m.mouse.scrollRight }
      const fn = fns[dir]
      if (!fn) throw new Error('direction 须为 up/down/left/right')
      try { await fn.call(m.mouse, amount) } catch (e) { await fn.call(m.mouse) }
      return 'scroll ' + dir + ' x' + amount
    },

    async open(params) {
      if (params.url) {
        if (IS_MAC) execFileSync('open', [params.url])
        else throw new Error('仅支持 macOS')
        return 'open ' + params.url
      }
      if (!params.app) throw new Error('open 需要 app 或 url')
      if (!IS_MAC) throw new Error('仅支持 macOS')
      try { execFileSync('open', ['-a', params.app]) } catch (e) {
        execFileSync('open', ['-a', params.app + '.app'])
      }
      return 'open ' + params.app
    },

    // 置前应用（osascript activate）：目标窗口被遮挡时点击会落到别的窗口，
    // 点击类操作前先把目标应用带到前台（不新开窗口，与 open 互补）
    async activate(params) {
      if (!IS_MAC) throw new Error('仅支持 macOS')
      const app = String(params.app || '').replace(/["\\]/g, '').trim()
      if (!app) throw new Error('app 缺失')
      execFileSync('osascript', ['-e', 'tell application "' + app + '" to activate'])
      await sleep(300) // 等待窗口置前与重绘
      return 'activate ' + app
    },

    async quit() {
      setTimeout(() => process.exit(0), 50)
      return 'bye'
    },
  }

  // ---------- JSON 行 RPC 主循环 ----------
  let buf = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk) => {
    buf += chunk
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx).trim()
      buf = buf.slice(idx + 1)
      if (!line) continue
      let req
      try { req = JSON.parse(line) } catch (e) { continue }
      handle(req)
    }
  })
  process.stdin.on('end', () => process.exit(0))
  bumpIdle()

  async function handle(req) {
    bumpIdle()
    const fn = handlers[String(req.action)]
    try {
      if (!fn) throw new Error('未知 action「' + req.action + '」')
      const result = await fn(req.params || {})
      send({ id: req.id, ok: true, result })
    } catch (e) {
      send({ id: req.id, ok: false, error: (e && e.message) || String(e) })
    }
  }
}

module.exports = {
  init,
  enabled,
  setEnabled,
  humanMove,
  setHumanMove,
  visionProvider,
  setVision,
  call,
  probe,
  dispose,
}
