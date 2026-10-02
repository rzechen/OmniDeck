// 公众号模板渲染 / 发布 / 复制：三工具
// - render_wechat_template：模板四元组（htmlTemplate + fields / loopFields + 值）渲染
//   为成品 HTML，落盘 <工作空间>/wechat/renders/ 预览文件（浏览器可直接打开核对排版）
// - publish_wechat_draft：渲染 → 正文图片 / 封面转存公众号素材库 → 新建草稿
//   （凭据走环境变量 WECHAT_APP_ID / WECHAT_APP_SECRET，perm 'ask' 每次执行需确认）
// - copy_wechat_html：渲染后富文本写入剪贴板（经宿主桥 clipboard.write，
//   直接粘贴公众号编辑器可保留内联排版；粘贴目标不支持富文本时回退纯文本）
// 模板 / 渲染产物均锚定会话工作空间（pi.js 注册扩展时注入），与 import.js 同口径。
// 渲染引擎移植自 weflow templateRender.ts：{{变量}} 标量替换 + {{#each 列表}} 循环块展开。
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { clipboard } = require('electron') // clipboard 为 shim 桥接版（写入转发主进程）

const API_BASE = 'https://api.weixin.qq.com'
const IMG_TIMEOUT = 15000 // 单图下载超时
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// ---------- 渲染引擎（移植 weflow templateRender.ts） ----------
// 值内换行转 <br>（公众号编辑器不保留块级换行语义）
function cleanValue(v) {
  return String(v == null ? '' : v).replace(/\r\n|\n|\r/g, '<br>').trimEnd()
}

// 标量 {{name}} 全局替换 + {{#each name}}...{{/each}} 循环块展开；
// fields / loopFields 缺省时按传入值的键兜底。split/join 替换避免变量名正则歧义。
function renderTemplateHtml(htmlTemplate, formData, loopData, templateFields, loopFields) {
  if (!htmlTemplate) return ''
  let html = htmlTemplate

  const fields = (templateFields && templateFields.length)
    ? templateFields
    : Object.keys(formData || {}).map(name => ({ name }))
  fields.forEach(field => {
    const name = typeof field === 'string' ? field : field.name
    html = html.split('{{' + name + '}}').join(cleanValue((formData || {})[name]))
  })

  const loops = (loopFields && loopFields.length)
    ? loopFields
    : Object.keys(loopData || {}).map(name => ({ name, fields: [] }))
  loops.forEach(loopField => {
    const re = new RegExp('{{#each\\s+' + loopField.name + '}}([\\s\\S]*?){{/each}}', 'g')
    html = html.replace(re, (_match, tpl) => {
      const items = (loopData || {})[loopField.name] || []
      return items.map(item => {
        let rendered = tpl
        const subNames = (loopField.fields && loopField.fields.length)
          ? loopField.fields.map(f => (typeof f === 'string' ? f : f.name))
          : Object.keys(item)
        subNames.forEach(n => {
          rendered = rendered.split('{{' + n + '}}').join(cleanValue(item[n]))
        })
        return rendered
      }).join('')
    })
  })
  return html
}

// 渲染后残留变量检测：未提供值的 {{xxx}} / {{#each xxx}} 原样残留
function findResidual(html) {
  const out = []
  const re = /\{\{[^}]+\}\}/g
  let m
  while ((m = re.exec(html))) {
    if (out.indexOf(m[0]) < 0) out.push(m[0])
  }
  return out
}

// 去标签纯文本（digest 摘要 / 剪贴板纯文本兜底）
function plainText(html) {
  return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// 预览页包裹（renders/ 落盘文件用，浏览器打开即近似公众号排版）
function wrapPreviewHtml(html, title) {
  const titleHtml = title ? '<h1>' + title + '</h1>' : ''
  return '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8">\n'
    + '  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n'
    + '  <style>\n'
    + '    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;'
    + ' background: #fff; padding: 20px 16px; font-size: 15px; line-height: 1.8; color: #333; }\n'
    + '    h1 { font-size: 20px; font-weight: 600; color: #1a1a1a; margin-bottom: 16px; line-height: 1.4; }\n'
    + '    img { max-width: 100%; }\n'
    + '  </style>\n</head>\n<body>\n' + titleHtml + '\n' + html + '\n</body>\n</html>\n'
}

// ---------- 模板资产读取 ----------
function templatesRoot(workspaceDir) {
  return path.join(workspaceDir, 'wechat', 'templates')
}

function rendersRoot(workspaceDir) {
  return path.join(workspaceDir, 'wechat', 'renders')
}

function md5(s) {
  return crypto.createHash('md5').update(String(s)).digest('hex')
}

// 读模板：id 白名单校验（防路径穿越），template.json 必须存在
function loadTemplate(workspaceDir, id) {
  if (!/^[a-z0-9][a-z0-9-]*$/i.test(String(id || ''))) {
    throw new Error('模板 id 非法：' + id)
  }
  const file = path.join(templatesRoot(workspaceDir), id, 'template.json')
  if (!fs.existsSync(file)) {
    throw new Error('模板不存在：' + id + '（先 import_wechat_template 导入，目录 ' + templatesRoot(workspaceDir) + '）')
  }
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

// 统一渲染入口：htmlTemplate 未变量化时回退 rawHtml（无变量则等价原样输出）
function renderFromTemplate(meta, fieldValues, loopFieldValues) {
  const tpl = meta.htmlTemplate || meta.rawHtml || ''
  const html = renderTemplateHtml(
    tpl, fieldValues || {}, loopFieldValues || {}, meta.fields, meta.loopFields
  )
  return { html, residual: findResidual(html) }
}

// ---------- 微信 API ----------
// 凭据三通道（优先级从高到低）：进程环境变量 → 激活技能绑定凭证 → 全库按键名匹配。
// envProvider 由 pi.js 注入（会话闭包取数）；凭据经「我的凭据」录入，env 键名即契约
let envProvider = null // createRenderExtension 注册时注入：() => ({ WECHAT_APP_ID, WECHAT_APP_SECRET })

function wxCreds() {
  let appId = process.env.WECHAT_APP_ID || ''
  let secret = process.env.WECHAT_APP_SECRET || ''
  if ((!appId || !secret) && envProvider) {
    try {
      const extra = envProvider() || {}
      appId = appId || extra.WECHAT_APP_ID || ''
      secret = secret || extra.WECHAT_APP_SECRET || ''
    } catch (e) { /* 取数失败按缺凭据报错 */ }
  }
  if (!appId || !secret) {
    throw new Error('缺少公众号凭据 WECHAT_APP_ID / WECHAT_APP_SECRET：'
      + '请设置进程环境变量，或在「我的资料 → 我的凭据」录入含这两个键名的凭据'
      + '（绑定 wechat-article-publish 技能或任意凭据均可，工具按键名自动取用）')
  }
  return { appId, secret }
}

// access_token 模块级缓存（提前 5 分钟过期）
let tokenCache = { token: '', expireAt: 0 }

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expireAt) return tokenCache.token
  const { appId, secret } = wxCreds()
  const res = await fetch(API_BASE + '/cgi-bin/token?grant_type=client_credential&appid='
    + encodeURIComponent(appId) + '&secret=' + encodeURIComponent(secret))
  const j = await res.json()
  if (!j.access_token) {
    throw new Error('获取 access_token 失败：' + (j.errcode || '') + ' ' + (j.errmsg || '')
      + (j.errcode === 40164 ? '（本机出口 IP 未加入公众号后台 IP 白名单）' : ''))
  }
  tokenCache = {
    token: j.access_token,
    expireAt: Date.now() + ((j.expires_in || 7200) - 300) * 1000
  }
  return j.access_token
}

// 响应统一 errcode 校验
function assertWxOk(j, action) {
  if (j && j.errcode) {
    const tips = {
      40001: '（access_token 无效或过期，稍后重试）',
      40005: '（文件类型不合法）',
      41005: '（缺少多媒体数据）',
      40164: '（本机出口 IP 未加入公众号后台 IP 白名单）'
    }
    throw new Error(action + '失败：' + j.errcode + ' ' + (j.errmsg || '') + (tips[j.errcode] || ''))
  }
  return j
}

// 上传永久图片素材：返回 { media_id, url }
async function uploadMaterial(token, buf, filename) {
  const form = new FormData()
  form.append('media', new Blob([buf]), filename)
  const res = await fetch(API_BASE + '/cgi-bin/material/add_material?access_token='
    + token + '&type=image', { method: 'POST', body: form })
  return assertWxOk(await res.json(), '上传素材')
}

// 下载外链图（封面 / 正文未本地化图片转存用）
async function downloadImage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(IMG_TIMEOUT)
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length) throw new Error('空内容')
  return buf
}

// 正文图片转存：本地 assets/ 文件或外链 → 素材库 URL 替换（公众号仅认自家域名图片）；
// data URI 无法转存，保留原样并计数警告
const IMG_SRC_RE = /<img\b[^>]*?\bsrc\s*=\s*"([^"]*)"/gi

async function transferImages(html, tplDir, token) {
  const replaced = new Map()
  let ok = 0
  let failed = 0
  let dataUri = 0
  let m
  while ((m = IMG_SRC_RE.exec(html))) {
    const src = m[1]
    if (!src || replaced.has(src)) continue
    if (/^data:/i.test(src)) { dataUri++; continue }
    try {
      let buf
      let name
      if (/^https?:\/\//i.test(src)) {
        buf = await downloadImage(src)
        name = 'img-' + md5(src) + '.jpg'
      } else {
        // 本地相对路径（assets/xxx）：解析后必须仍在模板目录内
        const p = path.resolve(tplDir, src)
        if (p !== tplDir && !p.startsWith(tplDir + path.sep)) {
          throw new Error('路径越界')
        }
        buf = fs.readFileSync(p)
        name = path.basename(p)
      }
      const r = await uploadMaterial(token, buf, name)
      if (r && r.url) {
        replaced.set(src, r.url)
        ok++
      } else {
        failed++
      }
    } catch (e) {
      failed++
    }
  }
  for (const [from, to] of replaced) {
    html = html.split(from).join(to)
  }
  return { html, ok, failed, dataUri }
}

// ---------- 工具扩展 ----------
function errText(text) {
  return { content: [{ type: 'text', text }], details: { isError: true } }
}

// workspaceDir：会话工作空间（pi.js 注册时注入），渲染产物落 <工作空间>/wechat/renders/
// getEnv：凭据取数（pi.js 注入，技能绑定 + 键名匹配兜底），进程环境变量优先
function createRenderExtension(workspaceDir, getEnv) {
  envProvider = getEnv || null
  return function wechatRenderExtension(piApi) {
    // 1. 渲染预览：落盘 renders/{id}-{ts}.html
    piApi.registerTool({
      name: 'render_wechat_template',
      label: '渲染公众号模板',
      description: '按变量值渲染公众号模板：{{变量}} 替换 + {{#each 列表}} 循环展开（值内换行自动转 <br>），'
        + '渲染结果落盘为可预览 HTML 文件（工作空间 wechat/renders/，浏览器打开即近似公众号排版）。'
        + '渲染后返回残留变量清单（未提供值的 {{xxx}} 会原样保留），据此补值重渲染。'
        + '模板四元组（htmlTemplate + fields / loopFields）由 template.json 承载，'
        + '未变量化时回退 rawHtml 原样渲染。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '模板 id（import_wechat_template 返回，如 xiumi-xxxxxxxxxx）' },
          fieldValues: {
            type: 'object',
            description: '标量变量值映射：{ 变量名: 文本 }（值内换行转 <br>）'
          },
          loopFieldValues: {
            type: 'object',
            description: '循环变量值映射：{ 列表名: [{ 子变量: 文本 }, ...] }，逐项展开 {{#each 列表名}} 块'
          }
        },
        required: ['id']
      },
      execute: async (_id, params) => {
        const p = params || {}
        let meta
        try {
          meta = loadTemplate(workspaceDir, p.id)
        } catch (e) {
          return errText(e.message)
        }
        const { html, residual } = renderFromTemplate(meta, p.fieldValues, p.loopFieldValues)

        const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
        const file = path.join(rendersRoot(workspaceDir), meta.id + '-' + ts + '.html')
        fs.mkdirSync(rendersRoot(workspaceDir), { recursive: true })
        fs.writeFileSync(file, wrapPreviewHtml(html, meta.title))

        const lines = [
          '模板：' + meta.title + '（' + meta.id + '）',
          '正文：' + html.length + ' 字符，纯文本约 ' + plainText(html).length + ' 字',
          '预览：' + file,
          residual.length
            ? '注意：' + residual.length + ' 个变量未提供值，原样残留——' + residual.join('、')
              + '（在 fieldValues / loopFieldValues 补值后重渲染）'
            : '变量全部替换完成，可用于发布或复制。'
        ]
        return {
          content: [{ type: 'text', text: lines.join('\n') }],
          details: { artifacts: [{ path: file, name: path.basename(file) }] }
        }
      }
    })

    // 2. 发布草稿：渲染 → 图片/封面转存素材库 → draft/add
    piApi.registerTool({
      name: 'publish_wechat_draft',
      label: '发布公众号草稿',
      description: '将渲染成品发布到公众号草稿箱（不群发）：正文图片与封面自动转存公众号素材库，'
        + '新建草稿返回 media_id，可在公众号后台「草稿箱」查看并群发。'
        + '凭据经环境变量 WECHAT_APP_ID / WECHAT_APP_SECRET 注入；'
        + '本机出口 IP 须加入公众号后台 IP 白名单。存在残留变量时拒绝发布（先 render 补值）。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '模板 id' },
          title: { type: 'string', description: '文章标题（草稿必需）' },
          author: { type: 'string', description: '作者名（可选）' },
          digest: { type: 'string', description: '摘要（可选，默认正文前 120 字）' },
          cover: { type: 'string', description: '封面图 URL（可选，默认模板封面 cover 字段）' },
          fieldValues: { type: 'object', description: '标量变量值映射（同 render 工具）' },
          loopFieldValues: { type: 'object', description: '循环变量值映射（同 render 工具）' }
        },
        required: ['id', 'title']
      },
      execute: async (_id, params) => {
        const p = params || {}
        let meta
        try {
          meta = loadTemplate(workspaceDir, p.id)
        } catch (e) {
          return errText(e.message)
        }
        if (!p.title || !String(p.title).trim()) {
          return errText('错误：title 必填（公众号草稿必需标题）')
        }

        // 渲染 + 残留校验（带 {{}} 上线即事故，硬阻止）
        const { html, residual } = renderFromTemplate(meta, p.fieldValues, p.loopFieldValues)
        if (residual.length) {
          return errText('存在 ' + residual.length + ' 个未提供值的变量：' + residual.join('、')
            + '。请在 fieldValues / loopFieldValues 补值后重试。')
        }

        try {
          const token = await getAccessToken()

          // 正文图片转存（公众号仅认 mmbiz.qpic.cn 域名图片）
          const tplDir = path.join(templatesRoot(workspaceDir), meta.id)
          const tr = await transferImages(html, tplDir, token)

          // 封面转存 → thumb_media_id（draft/add 必需）
          const coverUrl = p.cover || meta.cover
          if (!coverUrl || !/^https?:\/\//i.test(String(coverUrl))) {
            return errText('错误：缺少有效封面图 URL（params.cover 或模板 cover 字段），草稿必需封面')
          }
          const coverBuf = await downloadImage(String(coverUrl))
          const up = await uploadMaterial(token, coverBuf, 'cover-' + md5(String(coverUrl)) + '.jpg')
          if (!up || !up.media_id) {
            return errText('封面转存素材库失败（未取得 thumb_media_id）')
          }

          const digest = (p.digest && String(p.digest).trim())
            || plainText(tr.html).slice(0, 120)
          const res = await fetch(API_BASE + '/cgi-bin/draft/add?access_token=' + token, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              articles: [{
                title: String(p.title).trim(),
                author: (p.author && String(p.author).trim()) || '',
                digest,
                content: tr.html,
                thumb_media_id: up.media_id,
                need_open_comment: 0,
                only_fans_can_comment: 0
              }]
            })
          })
          const j = assertWxOk(await res.json(), '新建草稿')
          if (!j || !j.media_id) {
            return errText('新建草稿未返回 media_id：' + JSON.stringify(j))
          }

          const warn = []
          if (tr.failed) warn.push(tr.failed + ' 张正文图片转存失败（保留原地址，公众号内可能不显示）')
          if (tr.dataUri) warn.push(tr.dataUri + ' 张 data URI 图片无法转存（公众号不支持）')
          const text = '草稿已创建：' + j.media_id
            + '\n标题：' + String(p.title).trim()
            + '\n模板：' + meta.title + '（' + meta.id + '）'
            + (meta.originUrl ? '\n模板来源：' + meta.originUrl : '')
            + '\n正文：' + tr.html.length + ' 字符，图片转存 ' + tr.ok + ' 张，封面已转存素材库'
            + '\n后续：公众号后台「草稿箱」查看并群发（media_id：' + j.media_id + '）'
            + (warn.length ? '\n警告：' + warn.join('；') : '')
          return { content: [{ type: 'text', text }], details: {} }
        } catch (e) {
          return errText('发布草稿失败：' + e.message)
        }
      }
    })

    // 3. 复制富文本：粘贴公众号编辑器兜底通道
    piApi.registerTool({
      name: 'copy_wechat_html',
      label: '复制公众号排版',
      description: '将渲染成品以富文本写入剪贴板：直接粘贴到公众号编辑器可保留内联排版与图片，'
        + '同时写入纯文本兜底（粘贴目标不支持富文本时生效）。'
        + '适合不用开放接口的临时发文场景（publish_wechat_draft 之外的兜底通道）。'
        + '存在残留变量时仍会复制，但会提示先补值。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '模板 id' },
          fieldValues: { type: 'object', description: '标量变量值映射（同 render 工具）' },
          loopFieldValues: { type: 'object', description: '循环变量值映射（同 render 工具）' }
        },
        required: ['id']
      },
      execute: async (_id, params) => {
        const p = params || {}
        let meta
        try {
          meta = loadTemplate(workspaceDir, p.id)
        } catch (e) {
          return errText(e.message)
        }
        const { html, residual } = renderFromTemplate(meta, p.fieldValues, p.loopFieldValues)

        // 注意：本地 assets/ 相对路径图片粘贴后不可达——需上传后才有公网 URL，
        // 未转存场景提示用户优先走 publish 工具或先在编辑器内补图
        const localImgs = IMG_SRC_RE.test(html)
        IMG_SRC_RE.lastIndex = 0

        try {
          await clipboard.write({ html, text: plainText(html) })
        } catch (e) {
          return errText('剪贴板写入失败：' + e.message)
        }
        const text = '已复制富文本到剪贴板（' + html.length + ' 字符）：'
          + '\n  粘贴到公众号编辑器即可保留排版；不支持富文本的输入框将得到纯文本。'
          + (localImgs ? '\n  注意：模板图片为本地 assets/ 路径，粘贴后不可达——建议改用 publish_wechat_draft（自动转存素材库），或在编辑器内手动补图。' : '')
          + (residual.length ? '\n  注意：' + residual.length + ' 个变量未提供值（' + residual.join('、') + '），已原样复制。' : '')
        return { content: [{ type: 'text', text }] }
      }
    })
  }
}

module.exports = {
  createRenderExtension,
  // 供编辑器注入（editor.js）复用：模板读取 + 渲染 + 图片收集
  templatesRoot, rendersRoot, loadTemplate, renderFromTemplate,
  plainText, IMG_SRC_RE
}
