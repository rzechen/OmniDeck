// 公众号模板导入：import_wechat_template 工具
// 链路：秀米模板市场列表 API（公开 JSON，无需登录）→ 作品展示页 show_url
//   → 宿主桥 wx.fetchArticle（agent-bridge 主进程隐藏 WebContentsView 渲染提取 article，
//     agent 子进程无 Chromium，抓取一律转发主进程执行）
//   → article.innerHTML 即公众号排版模板（内联 style）→ 图片下载本地化并改写 src
//   → 落盘模板资产，供后续变量化（Agent 处理 template.json）与渲染发布
// 资产目录：<工作空间>/wechat/templates/{id}/（template.json + assets/），index.json 汇总；
//   随任务工作空间隔离（由 pi.js 注册扩展时注入）。渲染引擎四元组（htmlTemplate + fields/loopFields）
//   由 Agent 变量化后回填，本工具只负责抓取与本地化。
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const { __host } = require('electron')

const LIST_API = 'https://xiumi.us/api/show_goods/goodses'
// 列表请求 UA：普通 Chrome（与旧爬虫一致，接口公开无鉴权）
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 '
  + '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

const IMG_TIMEOUT = 15000          // 单图下载超时
const ITEM_INTERVAL = 1200         // 相邻模板抓取间隔（限速）
const LIMIT_DEFAULT = 5
const LIMIT_MAX = 20

function templatesRoot(workspaceDir) {
  return path.join(workspaceDir, 'wechat', 'templates')
}

function md5(s) {
  return crypto.createHash('md5').update(String(s)).digest('hex')
}

// ---------- 列表 API（公开，无需登录） ----------
// 返回 [{ title, cover, url }]；limit=72/页，page 从 1 开始
async function fetchList(page) {
  const url = LIST_API + '?limit=72&page=' + page
    + '&show_type=paper&showgoods_type=paper&price_scope=all&by_nearest=1&tpl_flag=0'
  const res = await fetch(url, {
    headers: { 'User-Agent': UA },
    signal: AbortSignal.timeout(25000)
  })
  if (!res.ok) throw new Error('列表接口 HTTP ' + res.status)
  const json = await res.json()
  const goods = (json && json.data && json.data.goodses) || []
  return goods
    .map(g => ({
      title: (g.show && g.show.title) || '',
      cover: String((g.show && g.show.cover) || '').replace(/^\/\//, ''),
      url: (g.show && g.show.show_url) || ''
    }))
    .filter(x => /^https?:\/\//i.test(x.url))
}

// 单模板详情抓取：经宿主桥在主进程隐藏视图渲染提取（主进程侧串行队列复用单视图）
async function fetchArticle(url) {
  const r = await __host.fetchArticle(url)
  if (!r || !r.html) throw new Error('article 正文提取为空')
  return r
}

// ---------- 图片本地化 ----------
function extFrom(contentType, url) {
  const m = /\.([a-z0-9]{2,5})(?:[?#]|$)/i.exec(url)
  let ext = m ? m[1].toLowerCase() : ''
  if (['jpg', 'jpeg', 'png', 'gif', 'webp'].indexOf(ext) < 0) ext = ''
  if (!ext && contentType) {
    if (contentType.indexOf('png') >= 0) ext = 'png'
    else if (contentType.indexOf('gif') >= 0) ext = 'gif'
    else if (contentType.indexOf('webp') >= 0) ext = 'webp'
    else ext = 'jpg'
  }
  return ext || 'jpg'
}

async function downloadImage(url, assetsDir) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Referer: 'https://xiumi.us/' },
    signal: AbortSignal.timeout(IMG_TIMEOUT)
  })
  if (!res.ok) throw new Error('HTTP ' + res.status)
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length) throw new Error('空内容')
  const name = md5(url) + '.' + extFrom(res.headers.get('content-type'), url)
  fs.mkdirSync(assetsDir, { recursive: true })
  fs.writeFileSync(path.join(assetsDir, name), buf)
  return 'assets/' + name
}

// 正文图片本地化：rawHtml 中原始 src 精确替换为 assets/ 相对路径；
// data URI / 相对路径 / 下载失败项保留原样并计数
async function localizeImages(html, images, assetsDir) {
  let ok = 0
  let failed = 0
  const seen = {}
  for (const src of images) {
    if (!/^https?:\/\//i.test(src) || seen[src]) continue
    seen[src] = true
    try {
      const local = await downloadImage(src, assetsDir)
      html = html.split(src).join(local)
      ok++
    } catch (e) {
      failed++
    }
  }
  return { html, ok, failed }
}

// ---------- 模板落盘 ----------
function readIndex(workspaceDir) {
  try {
    const list = JSON.parse(fs.readFileSync(path.join(templatesRoot(workspaceDir), 'index.json'), 'utf-8'))
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

function updateIndex(workspaceDir, meta) {
  const list = readIndex(workspaceDir)
  list.push({
    id: meta.id,
    title: meta.title,
    source: meta.source,
    cover: meta.cover,
    originUrl: meta.originUrl,
    importedAt: meta.importedAt
  })
  fs.mkdirSync(templatesRoot(workspaceDir), { recursive: true })
  fs.writeFileSync(path.join(templatesRoot(workspaceDir), 'index.json'), JSON.stringify(list, null, 2))
}

// 导入单个模板：已导入（template.json 存在）直接跳过；抓取失败抛错由调用方汇总
async function importOne(workspaceDir, item) {
  const id = 'xiumi-' + md5(item.url).slice(0, 10)
  const dir = path.join(templatesRoot(workspaceDir), id)
  const metaFile = path.join(dir, 'template.json')
  if (fs.existsSync(metaFile)) return { skipped: true, id, title: item.title, metaFile }

  const article = await fetchArticle(item.url)
  const loc = await localizeImages(article.html, article.images, path.join(dir, 'assets'))

  const meta = {
    id,
    source: 'xiumi',
    title: item.title || ('秀米模板-' + id),
    originUrl: item.url,
    importedAt: new Date().toISOString(),
    cover: item.cover,            // 封面外链（发布时按需转存素材库）
    rawHtml: loc.html,            // 原始正文（图片已本地化）
    htmlTemplate: '',             // 变量化模板（Agent 生成，{{变量}}/{{#each}}）
    fields: [],                   // 变量声明（Agent 生成）
    loopFields: [],               // 循环变量声明（Agent 生成）
    assetsLocalized: loc.ok,
    assetsFailed: loc.failed,
    textPreview: article.text
  }
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2))
  updateIndex(workspaceDir, meta)
  return { skipped: false, id, title: meta.title, metaFile, meta }
}

// ---------- 工具扩展 ----------
// workspaceDir：会话工作空间（pi.js 注册时注入），模板资产落 <工作空间>/wechat/templates/
function createImportExtension(workspaceDir) {
  return function wechatImportExtension(piApi) {
    piApi.registerTool({
      name: 'import_wechat_template',
      label: '导入秀米模板',
      description: '从秀米模板市场批量导入公众号排版模板：抓取作品页 article 正文（内联样式排版），'
        + '图片下载本地化，落盘为本地模板资产（工作空间 wechat/templates/{id}/template.json，含索引 index.json）。'
        + '导入后可读取 template.json，把 rawHtml 中可变文案替换为 {{变量}} / {{#each}} 循环并回填 '
        + 'htmlTemplate 与 fields / loopFields，供后续渲染与发布使用。',
      parameters: {
        type: 'object',
        properties: {
          page: {
            type: 'number',
            description: '秀米模板市场页码（从 1 开始，每页 72 个作品）；与 url 二选一'
          },
          url: {
            type: 'string',
            description: '秀米作品展示页直链（xiumi.us 的 show_url）；与 page 二选一'
          },
          limit: {
            type: 'number',
            description: 'page 模式下最多导入条数（默认 ' + LIMIT_DEFAULT + '，上限 ' + LIMIT_MAX
              + '；已导入过的自动跳过）'
          }
        }
      },
      execute: async (_id, params) => {
        const p = params || {}
        const hasUrl = typeof p.url === 'string' && /^https?:\/\//i.test(p.url.trim())
        const hasPage = p.page !== undefined && p.page !== null && Number(p.page) >= 1
        if (!hasUrl && !hasPage) {
          return errText('错误：page 与 url 至少提供一项（url 须为 http(s) 秀米作品页链接）')
        }
        let limit = LIMIT_DEFAULT
        if (p.limit !== undefined && p.limit !== null) {
          limit = Math.max(1, Math.min(LIMIT_MAX, Number(p.limit) || LIMIT_DEFAULT))
        }

        // 组装待导入清单
        let items = []
        try {
          if (hasUrl) {
            items = [{ title: '', cover: '', url: p.url.trim() }]
          } else {
            items = await fetchList(Number(p.page))
          }
        } catch (e) {
          return errText('获取秀米列表失败：' + e.message + '（页码超出范围或接口不可达时请调整 page 重试）')
        }
        if (!items.length) return errText('该页未取到任何作品（页码超出范围或接口返回为空）')
        items = items.slice(0, hasUrl ? 1 : limit)

        // 逐个导入：抓取在主进程宿主侧串行执行（复用隐藏视图），条目间隔限速；单条失败不中断
        const results = []
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          try {
            const r = await importOne(workspaceDir, item)
            results.push({ ok: true, ...r })
          } catch (e) {
            results.push({ ok: false, title: item.title, error: e.message })
          }
          if (i < items.length - 1) {
            await new Promise(r2 => setTimeout(r2, ITEM_INTERVAL))
          }
        }

        // 汇总：成功（含跳过）与失败分列；产物卡片挂成功导入的 template.json
        const lines = []
        const artifacts = []
        let imported = 0
        let skipped = 0
        for (const r of results) {
          if (!r.ok) {
            lines.push('[失败] ' + (r.title || '未命名') + '：' + r.error)
            continue
          }
          if (r.skipped) {
            skipped++
            lines.push('[跳过] ' + (r.title || r.id) + '（已导入过：' + r.metaFile + '）')
            continue
          }
          imported++
          artifacts.push({ path: r.metaFile, name: path.basename(path.dirname(r.metaFile)) + '.json' })
          lines.push(
            '[导入] ' + r.meta.title
            + '\n  id：' + r.meta.id
            + '\n  正文：' + r.meta.rawHtml.length + ' 字符，图片本地化 ' + r.meta.assetsLocalized + ' 张'
            + (r.meta.assetsFailed ? '（' + r.meta.assetsFailed + ' 张失败保留外链）' : '')
            + '\n  预览：' + (r.meta.textPreview || '(无可提取文本)')
            + '\n  文件：' + r.metaFile
          )
        }
        const head = imported + ' 个导入、' + skipped + ' 个跳过、'
          + (results.length - imported - skipped) + ' 个失败。'
          + (imported ? '模板资产根目录：' + templatesRoot(workspaceDir) : '')
        const next = imported
          ? '\n下一步：读取 template.json，将 rawHtml 中可变文案变量化（{{变量}} / {{#each}} 列表循环），'
            + '回填 htmlTemplate 与 fields / loopFields 字段后即可用于渲染发布。'
          : ''
        return {
          content: [{ type: 'text', text: head + '\n\n' + lines.join('\n') + next }],
          details: artifacts.length ? { artifacts } : {}
        }
      }
    })
  }
}

function errText(text) {
  return { content: [{ type: 'text', text }], details: { isError: true } }
}

module.exports = { createImportExtension }
