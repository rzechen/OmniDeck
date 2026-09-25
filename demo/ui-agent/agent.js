#!/usr/bin/env node
'use strict';
/**
 * UI-TARS 方案验证 Demo —— 通用桌面 GUI Agent
 *
 * 范式与字节 UI-TARS-desktop 一致（同款 nut.js fork 注入鼠标键盘）：
 *   循环：截屏 → 多模态大模型分析决策 → 解析动作 JSON → 模拟鼠标/键盘 → 观测回填
 *
 * ── 运行前置（macOS）────────────────────────────────────────────
 *   1) cd demo/ui-agent && npm install
 *   2) 系统设置 → 隐私与安全性 → 「辅助功能」：勾选你的终端 App（否则点击/输入无效）
 *   3) 系统设置 → 隐私与安全性 → 「屏幕录制」：勾选你的终端 App（否则截屏只有壁纸）
 *   4) 准备一个支持视觉的 OpenAI 兼容模型（GLM-4.5V / qwen-vl-max / gpt-4o / doubao-vision 均可）
 *
 * ── 用法 ───────────────────────────────────────────────────────
 *   node agent.js --selftest                    # 自检：依赖/截屏/缩放/剪贴板
 *   node agent.js "任务指令" [flags]
 *
 *   flags:
 *     --auto          每步免确认连续执行（默认每步回车确认，q 放弃）
 *     --dry-run       只打印决策，不真正注入鼠标/键盘
 *     --max-steps N   最大步数（默认 15）
 *     --interval MS   步间等待（默认 1200ms）
 *     --base-url URL  OpenAI 兼容地址（默认 $OPENAI_BASE_URL 或 https://api.openai.com/v1）
 *     --model NAME    模型名（默认 $OPENAI_MODEL）
 *     --api-key KEY   API Key（默认 $OPENAI_API_KEY）
 *
 * ── 钉钉示例 ───────────────────────────────────────────────────
 *   export OPENAI_BASE_URL=https://open.bigmodel.cn/api/paas/v4
 *   export OPENAI_MODEL=glm-4.5v
 *   export OPENAI_API_KEY=你的Key
 *   node agent.js "打开钉钉，搜索联系人张三，给他发送消息：明天上午10点开会"
 */

const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const SHOT_PATH = path.join(os.tmpdir(), 'ui-agent-shot.jpg');
const MAX_DIM = 1920; // 截图最长边，超出则缩放（降低 payload 与推理延迟）
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ───────────────────── 小工具 ───────────────────── */

const log = (...a) => console.log(...a);
const die = (msg) => { console.error('❌ ' + msg); process.exit(1); };

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(prompt, (answer) => { rl.close(); resolve((answer || '').trim()); })
  );
}

/* ───────────────────── 平台能力：截屏 / 分辨率 / 剪贴板 / 打开应用 ───────────────────── */

// 截主显示器为 JPEG 并读取尺寸；返回 { b64, width, height }
function takeScreenshot() {
  if (fs.existsSync(SHOT_PATH)) fs.unlinkSync(SHOT_PATH);
  if (IS_MAC) {
    execFileSync('screencapture', ['-x', '-m', '-t', 'jpg', SHOT_PATH], { stdio: 'ignore' });
    try { execFileSync('sips', ['-Z', String(MAX_DIM), SHOT_PATH], { stdio: 'ignore' }); } catch {} // 缩图（仅缩不放）
    const out = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', SHOT_PATH], { encoding: 'utf8' });
    const w = parseInt((out.match(/pixelWidth:\s*(\d+)/) || [])[1], 10);
    const h = parseInt((out.match(/pixelHeight:\s*(\d+)/) || [])[1], 10);
    if (!w || !h) throw new Error('sips 解析截图尺寸失败');
    return { b64: fs.readFileSync(SHOT_PATH).toString('base64'), width: w, height: h };
  }
  if (IS_WIN) {
    const script = [
      "Add-Type -AssemblyName System.Windows.Forms,System.Drawing",
      "Add-Type 'using System.Runtime.InteropServices; public class Dpi { [DllImport(\"user32.dll\")] public static extern bool SetProcessDPIAware(); }'",
      "[Dpi]::SetProcessDPIAware() | Out-Null",
      "$b=[System.Windows.Forms.Screen]::PrimaryScreen.Bounds",
      "$bmp=New-Object System.Drawing.Bitmap $b.Width,$b.Height",
      "$g=[System.Drawing.Graphics]::FromImage($bmp)",
      "$g.CopyFromScreen($b.Location,[System.Drawing.Point]::Empty,$b.Size)",
      `$bmp.Save('${SHOT_PATH.replace(/\\/g, '/')}',[System.Drawing.Imaging.ImageFormat]::Jpeg)`,
      "[Console]::Write($b.Width.ToString()+'x'+$b.Height.ToString())",
    ].join('; ');
    const res = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
    const m = (res.stdout || '').match(/(\d+)x(\d+)/);
    if (!m) throw new Error('Windows 截屏失败（demo 以 macOS 为主，Windows 为尽力支持）');
    return { b64: fs.readFileSync(SHOT_PATH).toString('base64'), width: +m[1], height: +m[2] };
  }
  throw new Error('仅支持 macOS / Windows');
}

// 屏幕逻辑分辨率（Retina 屏上截图像素是逻辑坐标的 2 倍，点击坐标需按比例换算）
function getLogicalScreenSize() {
  if (IS_MAC) {
    try {
      const out = execFileSync('osascript',
        ['-e', 'tell application "Finder" to get bounds of window of desktop'], { encoding: 'utf8' });
      const n = out.split(',').map((s) => parseInt(s.trim(), 10));
      if (n.length === 4 && n[2] > 0 && n[3] > 0) return { w: n[2], h: n[3] };
    } catch {}
  }
  if (IS_WIN) {
    try {
      const script = "Add-Type -AssemblyName System.Windows.Forms;" +
        "[Console]::Write([System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Width.ToString()+'x'+[System.Windows.Forms.Screen]::PrimaryScreen.Bounds.Height.ToString())";
      const res = spawnSync('powershell', ['-NoProfile', '-Command', script], { encoding: 'utf8' });
      const m = (res.stdout || '').match(/(\d+)x(\d+)/);
      if (m) return { w: +m[1], h: +m[2] };
    } catch {}
  }
  return null; // 拿不到时按 scale=1 处理（Retina 上会点击偏移，selftest 有提示）
}

async function copyToClipboard(nut, text) {
  try {
    await nut.clipboard.setContent(text); // nut.js 自带剪贴板（跨平台）
  } catch (e) {
    // 兜底：系统命令（中文 keystroke 不可靠，粘贴是标准做法）
    if (IS_MAC) spawnSync('pbcopy', [], { input: text });
    else if (IS_WIN) spawnSync('powershell', ['-NoProfile', '-Command', '$input | Set-Clipboard'], { input: text });
    else throw e;
  }
}

function openAppOrUrl({ app, url }) {
  if (url) {
    if (IS_MAC) execFileSync('open', [url]);
    else if (IS_WIN) spawnSync('cmd', ['/c', 'start', '', url]);
    return;
  }
  if (!app) throw new Error('open 需要 app 或 url 字段');
  if (IS_MAC) {
    try { execFileSync('open', ['-a', app]); }
    catch { execFileSync('open', ['-a', `${app}.app`]); }
  } else if (IS_WIN) {
    spawnSync('powershell', ['-NoProfile', '-Command', `Start-Process '${app}'`]);
  } else throw new Error('仅支持 macOS / Windows');
}

/* ───────────────────── nut.js：按键/按键组解析 ───────────────────── */

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
  };
  for (let i = 1; i <= 12; i++) map[`f${i}`] = [`F${i}`];
  return map;
})();

function resolveKey(Key, name) {
  const n = String(name).trim().toLowerCase();
  const candidates = [
    ...(KEY_ALIASES[n] || []),
    n,
    n.toUpperCase(),
    n[0].toUpperCase() + n.slice(1), // 首字母大写，如 a -> A
  ];
  for (const c of candidates) {
    if (Key[c] !== undefined) return Key[c]; // 注意：不能用 !!（枚举值可能为 0）
  }
  throw new Error(`未知按键「${name}」`);
}

/* ───────────────────── 动作执行 ───────────────────── */

async function executeAction(nut, act, ctx) {
  const a = String(act.action || '').toLowerCase();
  switch (a) {
    case 'click':
    case 'double_click': {
      let [x, y] = Array.isArray(act.coordinate) ? act.coordinate
        : (act.coordinate && typeof act.coordinate === 'object') ? [act.coordinate.x, act.coordinate.y]
        : [];
      x = +x; y = +y;
      if (!Number.isFinite(x) || !Number.isFinite(y)) throw new Error('coordinate 缺失或非法');
      // 模型给的是截图像素坐标，按缩放比例换算成屏幕逻辑坐标
      const sx = Math.round(x * ctx.scale), sy = Math.round(y * (ctx.scaleY ?? ctx.scale));
      if (sx < 0 || sy < 0 || (ctx.logical && (sx > ctx.logical.w || sy > ctx.logical.h))) {
        throw new Error(`坐标越界 (${sx},${sy})`);
      }
      await nut.mouse.setPosition(new nut.Point(sx, sy));
      await sleep(150); // 等待系统焦点跟随
      if (a === 'double_click') {
        try { await nut.mouse.doubleClick(); } catch { await nut.mouse.leftClick(); await nut.mouse.leftClick(); }
      } else {
        await nut.mouse.leftClick();
      }
      return `${a} @ 逻辑坐标(${sx},${sy})`;
    }
    case 'type': {
      const text = String(act.text ?? act.content ?? '');
      if (!text) throw new Error('text 缺失');
      if (/^[\x00-\x7F]*$/.test(text)) {
        await nut.keyboard.type(text); // 纯 ASCII 直接键入
        return `type(键盘)「${text.slice(0, 30)}」`;
      }
      // 含中文：keystroke 模拟输入法不可靠，标准做法是剪贴板 + 粘贴
      await copyToClipboard(nut, text);
      await sleep(80);
      await pressCombo(nut, IS_MAC ? 'cmd+v' : 'ctrl+v');
      return `type(剪贴板粘贴)「${text.slice(0, 30)}」`;
    }
    case 'key': {
      const combo = act.combo || act.key || act.value;
      if (!combo) throw new Error('combo 缺失');
      await pressCombo(nut, combo);
      return `key ${combo}`;
    }
    case 'scroll': {
      const dir = String(act.direction || 'down').toLowerCase();
      const amount = Math.max(1, Math.min(10, +act.amount || 3));
      const fn = dir === 'up' ? nut.mouse.scrollUp : nut.mouse.scrollDown;
      try { await fn(amount); } catch { await fn(); }
      return `scroll ${dir} x${amount}`;
    }
    case 'open': {
      openAppOrUrl(act);
      return `open ${act.app || act.url}`;
    }
    case 'wait': {
      await sleep(1500);
      return 'wait 1.5s';
    }
    default:
      throw new Error(`未知 action「${a}」`);
  }
}

async function pressCombo(nut, combo) {
  const names = String(combo).split('+').map((s) => s.trim()).filter(Boolean);
  if (!names.length) throw new Error('空按键组合');
  const keys = names.map((n) => resolveKey(nut.Key, n));
  await nut.keyboard.pressKey(...keys);
  await sleep(80);
  await nut.keyboard.releaseKey(...keys);
}

function summarizeAction(act) {
  const a = String(act.action || '').toLowerCase();
  if (act.coordinate) return `${a}@(${act.coordinate[0]},${act.coordinate[1]})`;
  if (a === 'type') return `type「${String(act.text || '').slice(0, 20)}」`;
  if (a === 'key') return `key ${act.combo || act.key}`;
  if (a === 'open') return `open ${act.app || act.url}`;
  if (a === 'scroll') return `scroll ${act.direction}`;
  return a;
}

/* ───────────────────── 模型调用（OpenAI 兼容） ───────────────────── */

async function callModel(cfg, messages) {
  const url = cfg.baseUrl.replace(/\/+$/, '') + '/chat/completions';
  let lastErr = null;
  for (let i = 0; i < 3; i++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 90_000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
        body: JSON.stringify({ model: cfg.model, messages, temperature: 0, max_tokens: 2048 }),
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      const data = await res.json();
      let content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
      if (Array.isArray(content)) content = content.map((c) => c.text || '').join('');
      if (!content) throw new Error('模型返回空内容');
      return content;
    } catch (e) {
      lastErr = e;
      log(`   ⚠ 模型调用失败（第 ${i + 1} 次）：${e.message}`);
      await sleep(1000 * (i + 1));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function buildMessages(cfg, task, history, shot) {
  const sysLines = [
    '你是一个桌面 GUI 操作 Agent（UI-TARS 范式）。每一步你会收到当前屏幕截图，请决策"下一个动作"。',
    `当前操作系统：${IS_MAC ? 'macOS' : 'Windows'}；屏幕逻辑分辨率 ${cfg.logical.w}x${cfg.logical.h}；截图分辨率 ${shot.width}x${shot.height}，坐标一律按截图像素给出。`,
    '',
    '只输出一个 JSON 对象，禁止输出任何其他文字。字段 action 取值：',
    '- click / double_click：附 "coordinate":[x,y]，落在目标元素中心',
    '- type：附 "text"，要输入的文字（中文会经剪贴板粘贴，可直接写中文）',
    '- key：附 "combo"，如 "enter"、"cmd+v"、"ctrl+a"（macOS 用 cmd，Windows 用 ctrl）',
    '- scroll：附 "direction":"down|up"，可选 "amount":1-10',
    '- open：附 "app"（macOS 应用名如 DingTalk/WeChat/Safari）或 "url"（支持 https:// 和 dingtalk:// 等私有协议）',
    '- done：任务完成，附 "message"',
    '- fail：确认无法完成，附 "message"',
    '',
    '规则：',
    '1. 输入文字前必须先 click 输入框使其聚焦；聊天应用里发送消息用 key enter。',
    '2. 每步只做一个动作；"thought" 用一句话说明当前看到了什么、为什么这么做。',
    '3. 上一步结果若为 error，先观察截图调整策略；窗口未就绪时可先 wait 或重新定位。',
    '',
    '输出示例：',
    '{"thought":"当前是钉钉主界面，先打开搜索框","action":"click","coordinate":[320,102]}',
  ];
  if (cfg.dryRun) {
    sysLines.push('');
    sysLines.push('【dry-run 模拟模式】本次为模拟运行：你的动作不会被真正执行，截屏永远停留在同一画面。请始终假设你上一步的动作已经成功生效（忽略截图与该假设的矛盾），按任务逻辑给出下一个动作，直到 done。禁止因为"截图没有变化/上一步未执行"而重复上一步。');
  }
  const sys = sysLines.join('\n');

  const historyText = history.length
    ? history.slice(-8).map((h) => `第${h.step}步 ${h.desc} → ${h.result}`).join('\n')
    : '（无，这是第一步）';

  const user = {
    role: 'user',
    content: [
      { type: 'text', text: `任务目标：${task}\n\n已执行步骤：\n${historyText}\n\n当前屏幕截图如下，请给出下一个动作的 JSON。` },
      { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${shot.b64}` } },
    ],
  };
  return [{ role: 'system', content: sys }, user];
}

/* ───────────────────── 动作解析（JSON 优先，UI-TARS 原生格式兜底） ───────────────────── */

function stripReasoning(text) {
  return String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '');
}

function normalizeAction(o) {
  const action = String(o.action || '').toLowerCase().trim();
  let coordinate = o.coordinate;
  if (coordinate && !Array.isArray(coordinate)) {
    if (typeof coordinate === 'object') coordinate = [coordinate.x, coordinate.y];
    else if (typeof coordinate === 'string') {
      const m = coordinate.match(/(\d+)\D+(\d+)/);
      coordinate = m ? [+m[1], +m[2]] : undefined;
    }
  }
  const out = { thought: o.thought || '', action };
  if (coordinate) out.coordinate = coordinate;
  if (o.text != null) out.text = String(o.text);
  if (o.content != null && out.text == null) out.text = String(o.content);
  if (o.combo != null) out.combo = String(o.combo);
  if (o.key != null && out.combo == null) out.combo = String(o.key);
  if (o.value != null && out.combo == null) out.combo = String(o.value);
  if (o.direction) out.direction = String(o.direction);
  if (o.amount != null) out.amount = +o.amount;
  if (o.app) out.app = String(o.app);
  if (o.url) out.url = String(o.url);
  if (o.message) out.message = String(o.message);
  if (!out.action) throw new Error('动作对象缺少 action 字段');
  return out;
}

// UI-TARS 原生输出兜底：Action: click(start_box='<|box_start|>(544,416)<|box_end|>')
// 参数值兼容 'quoted' / "quoted" / key=裸值 三种写法
function extractArg(args, name) {
  let m = args.match(new RegExp(`${name}\\s*=\\s*'([^']*)'`)) || args.match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`));
  if (m) return m[1];
  m = args.match(new RegExp(`${name}\\s*=\\s*([^,)]+)`));
  return m ? m[1].trim() : null;
}

function parseUiTarsNative(text) {
  const m = text.match(/Action:\s*([a-zA-Z_]+)\s*\(([\s\S]*?)\)/);
  if (!m) return null;
  const name = m[1].toLowerCase();
  const args = m[2] || '';
  const box = args.match(/\(?(\d{2,4})\s*,\s*(\d{2,4})\)?/);
  const out = { thought: (text.match(/Thought:\s*([\s\S]*?)(?:\n|Action:)/) || [])[1] || '', action: '' };
  if (/finished|complete/.test(name)) { out.action = 'done'; out.message = extractArg(args, 'content') || ''; return out; }
  if (/call_user|fail/.test(name)) { out.action = 'fail'; out.message = extractArg(args, 'content') || ''; return out; }
  if (/click|drag/.test(name)) {
    if (!box) return null;
    out.action = /drag/.test(name) ? 'click' : name.includes('double') ? 'double_click' : 'click';
    out.coordinate = [+box[1], +box[2]];
    return out;
  }
  if (/type|input/.test(name)) {
    const t = extractArg(args, 'content') ?? extractArg(args, 'text');
    if (t == null) return null;
    out.action = 'type'; out.text = t;
    return out;
  }
  if (/key|press/.test(name)) {
    const k = extractArg(args, 'value') ?? extractArg(args, 'key');
    if (k == null) return null;
    out.action = 'key'; out.combo = k;
    return out;
  }
  if (/scroll/.test(name)) {
    out.action = 'scroll';
    out.direction = /up/i.test(args) ? 'up' : 'down';
    return out;
  }
  return null;
}

function parseAction(rawContent) {
  const raw = stripReasoning(rawContent);
  const start = raw.indexOf('{');
  if (start !== -1) {
    let end = raw.lastIndexOf('}');
    while (end > start) {
      try {
        const o = JSON.parse(raw.slice(start, end + 1));
        if (o && typeof o === 'object') return normalizeAction(o);
      } catch {}
      end = raw.lastIndexOf('}', end - 1);
    }
  }
  const native = parseUiTarsNative(raw);
  if (native) return normalizeAction(native);
  throw new Error(`无法解析模型输出：${raw.slice(0, 160).replace(/\n/g, ' ')}`);
}

/* ───────────────────── nut.js 加载 ───────────────────── */

async function loadNut() {
  let mod;
  try {
    mod = await import('@nut-tree-fork/nut-js');
  } catch (e) {
    throw new Error('nut.js 加载失败，请先在 demo/ui-agent 目录执行 npm install');
  }
  const api = (mod.default && mod.default.mouse && !mod.mouse) ? mod.default : mod;
  const { mouse, keyboard, Key, Button, Point, clipboard } = api;
  if (!mouse || !keyboard || !Key || !Point) throw new Error('nut.js 导出异常');
  return { mouse, keyboard, Key, Button, Point, clipboard };
}

/* ───────────────────── 自检 ───────────────────── */

async function selftest() {
  log('══ UI-TARS Demo 自检 ══');
  try {
    await loadNut();
    log('✅ nut.js 加载成功（mouse/keyboard/clipboard 就绪）');
  } catch (e) {
    log('❌ nut.js 加载失败：' + e.message);
  }
  try {
    const shot = takeScreenshot();
    log(`✅ 截屏成功：${shot.width}x${shot.height}，大小约 ${(shot.b64.length / 1024) | 0}KB(base64)`);
    const ls = getLogicalScreenSize();
    if (ls) {
      const scale = (shot.width / ls.w).toFixed(2);
      log(`✅ 逻辑分辨率：${ls.w}x${ls.h}（缩放系数 ${scale}x）`);
      if (scale !== '1.00') log(`   Retina/缩放屏：模型坐标将除以 ${scale} 再点击`);
    } else {
      log('⚠ 未能获取逻辑分辨率：Retina 屏上点击可能偏移（osascript Finder 查询失败）');
    }
  } catch (e) {
    log('❌ 截屏失败：' + e.message);
    log('   提示：需在 系统设置 → 隐私与安全性 →「屏幕录制」勾选终端 App');
  }
  try {
    const nut = await loadNut();
    await nut.clipboard.setContent('ui-agent 自检 OK');
    await sleep(100);
    const back = await nut.clipboard.getContent();
    log(/OK/.test(String(back)) ? '✅ 剪贴板读写正常（中文输入将走剪贴板+粘贴）' : '⚠ 剪贴板回读异常：' + back);
  } catch (e) {
    log('❌ 剪贴板失败：' + e.message);
  }
  log('提示：点击/输入需在 系统设置 → 隐私与安全性 →「辅助功能」勾选终端 App');
  log('提示：截屏若只有壁纸没有窗口，是「屏幕录制」权限未授予');
}

/* ───────────────────── 主流程 ───────────────────── */

function printUsage() {
  const m = fs.readFileSync(__filename, 'utf8').match(/\/\*\*([\s\S]*?)\*\//);
  log((m ? m[1] : '用法见文件头部注释').replace(/^ ?\* ?/gm, '').trim());
}

async function main() {
  const { task, flags } = parseArgv();
  if (flags.selftest) { await selftest(); process.exit(0); }
  if (!task) { printUsage(); process.exit(1); }

  const cfg = {
    baseUrl: flags.baseUrl || process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    model: flags.model || process.env.OPENAI_MODEL || '',
    apiKey: flags.apiKey || process.env.OPENAI_API_KEY || '',
    maxSteps: flags.maxSteps,
    interval: flags.interval,
    auto: !!flags.auto,
    dryRun: !!flags.dryRun,
  };
  if (!cfg.model) die('缺少模型名：--model 或环境变量 OPENAI_MODEL（需为支持视觉的多模态模型）');
  if (!cfg.apiKey) die('缺少 API Key：--api-key 或环境变量 OPENAI_API_KEY');

  const nut = await loadNut();
  const logical = getLogicalScreenSize();
  if (!logical) log('⚠ 未能获取屏幕逻辑分辨率，Retina 缩放按 1x 处理，点击可能偏移');
  cfg.logical = logical || { w: 0, h: 0 };

  log(`🎯 任务：${task}`);
  log(`   模型：${cfg.model} @ ${cfg.baseUrl}`);
  log(`   模式：${cfg.dryRun ? 'dry-run（只决策不执行）' : cfg.auto ? '自动连续执行' : '每步人工确认'}`);
  if (!cfg.dryRun && !cfg.auto) log('   提示：执行期间请勿移动鼠标、切换窗口；按 Ctrl+C 可随时中断');
  if (cfg.dryRun) log('   提示：模拟模式截屏不会变化；模型将按「上一步已生效」推进完整计划');

  const history = [];
  let parseFails = 0;
  let lastDecision = '';
  let repeatCount = 0;

  for (let step = 1; step <= cfg.maxSteps; step++) {
    const shot = takeScreenshot();
    const scale = logical ? logical.w / shot.width : 1;
    const scaleY = logical ? logical.h / shot.height : 1;
    log(`\n━━ 第 ${step}/${cfg.maxSteps} 步 · 截屏 ${shot.width}x${shot.height} · 缩放 ${scale.toFixed(2)}x ━━`);

    const messages = buildMessages(cfg, task, history, shot);
    const content = await callModel(cfg, messages);

    let act;
    try {
      act = parseAction(content);
    } catch (e) {
      parseFails++;
      log(`   ⚠ 解析失败（${parseFails}/3）：${e.message}`);
      history.push({ step, desc: '模型输出解析失败', result: 'error：格式非法，请严格输出一个 JSON' });
      if (parseFails >= 3) die('连续 3 步解析失败，中止（可尝试换模型）');
      continue;
    }
    parseFails = 0;

    log(`💭 ${act.thought || '(无思考)'}`);
    log(`🎯 决策：${JSON.stringify(act)}`);

    // 死循环保护：连续 3 步完全相同的决策视为卡死
    const sig = JSON.stringify(act);
    if (sig === lastDecision) repeatCount++;
    else { lastDecision = sig; repeatCount = 0; }
    if (repeatCount >= 2) {
      log(`\n⚠ 连续 ${repeatCount + 1} 步决策完全相同，疑似卡死，主动中止`);
      log(cfg.dryRun
        ? '   dry-run 下模型应按「上一步已生效」推进计划；仍循环说明模型未遵循模拟规则，建议换更强的视觉模型'
        : '   真实模式下请检查：「辅助功能」权限是否授予终端（点击/输入会静默失效），或模型坐标不准');
      process.exit(2);
    }

    if (act.action === 'done') { log(`\n✅ 任务完成：${act.message || ''}`); process.exit(0); }
    if (act.action === 'fail') { log(`\n❌ Agent 放弃：${act.message || ''}`); process.exit(1); }

    if (!cfg.dryRun && !cfg.auto) {
      const ans = await ask('   [回车]执行本步  [q]放弃 > ');
      if (ans.toLowerCase() === 'q') die('用户中止');
    }

    let result;
    if (cfg.dryRun) {
      result = '模拟成功（dry-run，实际未执行）';
    } else {
      try {
        result = await executeAction(nut, act, { scale, scaleY, logical });
      } catch (e) {
        result = `error：${e.message}`;
      }
      log(`🔧 执行：${result}`);
    }
    history.push({ step, desc: summarizeAction(act), result });
    await sleep(cfg.interval);
  }

  log(`\n⚠ 达到最大步数 ${cfg.maxSteps}，任务未确认完成。可加 --max-steps 继续`);
  process.exit(2);
}

function parseArgv() {
  const argv = process.argv.slice(2);
  const flags = { maxSteps: 15, interval: 1200 };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case '--auto': flags.auto = true; break;
      case '--dry-run': flags.dryRun = true; break;
      case '--selftest': flags.selftest = true; break;
      case '--max-steps': flags.maxSteps = parseInt(argv[++i], 10) || 15; break;
      case '--interval': flags.interval = parseInt(argv[++i], 10) || 1200; break;
      case '--base-url': flags.baseUrl = argv[++i]; break;
      case '--model': flags.model = argv[++i]; break;
      case '--api-key': flags.apiKey = argv[++i]; break;
      default:
        if (!a.startsWith('--')) positional.push(a);
    }
  }
  return { task: positional.join(' ').trim(), flags };
}

if (require.main === module) {
  main().catch((e) => die(e.stack || e.message));
}

// 便于离线单元测试（node -e "require('./agent.js')..."）
module.exports = { parseAction, parseUiTarsNative, normalizeAction, summarizeAction, resolveKey, loadNut };
