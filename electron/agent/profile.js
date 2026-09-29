// OmniBuddy 用户资料：结构化个人背景，systemPrompt 确定性注入。
// 与规则（行为指令）/ 记忆（过程性记忆）三分互补：
//   资料 = 关于用户的事实（工号/部门/项目/习惯），每轮必注入、零触发成本；
//   规则 = 对 AI 行为的指令（AGENTS.md，pi 原生装载）；
//   记忆 = 对话中积累的过程记忆（按需检索）。
// 存储：<baseDir>/profile.json（userData，非敏感明文）
const fs = require('fs')
const path = require('path')

let baseDir = ''

// 预设字段：渲染层表单与提示词共用（顺序即展示顺序）
const PRESET_FIELDS = [
  { key: 'name', label: '姓名', placeholder: '如：张无忌' },
  { key: 'company', label: '公司', placeholder: '公司 / 组织名称' },
  { key: 'employeeId', label: '工号', placeholder: '工号 / 员工编号' },
  { key: 'department', label: '部门', placeholder: '如：产品研发部' },
  { key: 'title', label: '职务', placeholder: '如：前端工程师' },
  { key: 'projects', label: '常用项目', placeholder: '常参与的项目 / 业务线，多个用顿号分隔', type: 'textarea' },
  { key: 'habits', label: '工作习惯', placeholder: '如：工时按半天粒度填写，周五下午统一补录', type: 'textarea' }
]

function configPath() {
  return path.join(baseDir, 'profile.json')
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath(), 'utf-8'))
  } catch (e) {
    return {}
  }
}

// 归一化：字段裁剪为非空字符串、自定义条目去空行限长（与渲染层 maxlength 保持一致）
function normalize(cfg) {
  const src = cfg || {}
  const fields = {}
  for (const f of PRESET_FIELDS) {
    const v = src.fields && src.fields[f.key]
    fields[f.key] = typeof v === 'string' ? v.trim().slice(0, 2000) : ''
  }
  const customs = Array.isArray(src.customs)
    ? src.customs
        .filter(c => c && typeof c.key === 'string' && c.key.trim())
        .map((c, i) => ({
          id: c.id || 'c' + Date.now() + '_' + i,
          key: c.key.trim().slice(0, 30),
          value: String(c.value || '').trim().slice(0, 2000)
        }))
    : []
  return { fields, customs }
}

// ---------- 对外接口 ----------
function init(dir) {
  baseDir = dir
  // baseDir 可能尚未创建（index.js init 顺序在 userData 目录确保之前）：确保存在，save 才不致 ENOENT
  try {
    fs.mkdirSync(baseDir, { recursive: true })
  } catch (e) { /* 建目录失败时保持原状，save 时自然报错 */ }
}

// 读取（附预设字段定义，渲染层直接渲染表单）
function get() {
  return Object.assign({ presets: PRESET_FIELDS }, normalize(readConfig()))
}

// 保存（返回归一化结果）
function save(cfg) {
  const n = normalize(cfg)
  fs.writeFileSync(configPath(), JSON.stringify(n, null, 2))
  return n
}

// 系统提示词注入块：任一字段非空才输出（换行压平为单行）
function promptBlock() {
  const { fields, customs } = normalize(readConfig())
  const rows = []
  for (const f of PRESET_FIELDS) {
    if (fields[f.key]) rows.push('- ' + f.label + '：' + fields[f.key].replace(/\s*\n\s*/g, '；'))
  }
  for (const c of customs) rows.push('- ' + c.key + '：' + c.value.replace(/\s*\n\s*/g, '；'))
  if (!rows.length) return ''
  return ['## 用户资料（已提前录入，直接使用，无需向用户重复询问）', ...rows].join('\n')
}

module.exports = { init, get, save, promptBlock }
