// 会话导出（N4 / §18.1）：Markdown / 自包含 HTML 双格式
// - MD：messages.jsonl → 正文 + 工具调用折叠引用块，adm-zip 打包附件图片
// - HTML：markdown-it 服务端渲染 + 内联 CSS → 单文件离线可看（图片 base64 内联）
// 导出目录：用户下载目录/OmniDeck 导出/<标题>-<日期>.{md,html,zip}
const path = require('path')
const fs = require('fs')
const { app, dialog, shell } = require('electron')
const MarkdownIt = require('markdown-it')
const AdmZip = require('adm-zip')
const sessions = require('./sessions')

// markdown-it 实例：与前端 utils/markdown.js 同配置（html:false 防注入）
const md = new MarkdownIt({ html: false, linkify: true, breaks: true })

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function fmtTime(ts) {
  const d = new Date(ts)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function fileStamp() {
  const d = new Date()
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`
}

function safeName(s) {
  return String(s || '会话').replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 40)
}

// ===== Markdown =====
function toMarkdown(meta, msgs) {
  const lines = [`# ${meta.title || 'OmniDeck 会话'}`, '']
  lines.push(`> 导出自 OmniDeck · ${fmtTime(Date.now())} · 共 ${msgs.length} 条记录`, '')
  for (const m of msgs) {
    if (m.role === 'user') {
      lines.push(`## 🧑 用户 · ${fmtTime(m.createdAt)}`, '')
      lines.push(m.content || '', '')
    } else if (m.role === 'assistant') {
      if (m.compaction) {
        lines.push('---', '', '> ⏳ **上下文压缩摘要**', '', m.content || '', '')
        continue
      }
      lines.push(`## 🤖 助手 · ${fmtTime(m.createdAt)}`, '')
      if (m.thinking) {
        lines.push('<details><summary>思考过程</summary>', '', m.thinking, '', '</details>', '')
      }
      lines.push(m.content || '', '')
      if (m.usage && (m.usage.input || m.usage.output)) {
        lines.push(`<sub>tokens: in ${m.usage.input || 0} / out ${m.usage.output || 0}</sub>`, '')
      }
    } else if (m.role === 'tool') {
      lines.push(`> 🔧 **工具 ${m.toolName || ''}**`)
      if (m.args) lines.push('> ' + JSON.stringify(m.args).replace(/\n/g, ' ').slice(0, 200))
      if (m.result) lines.push('> ' + String(m.result).replace(/\n/g, '\n> ').slice(0, 500))
      lines.push('')
    } else if (m.role === 'ask_user') {
      lines.push(`> ❓ **反问** ${m.question || ''}`, '')
    }
  }
  return lines.join('\n')
}

// ===== HTML（自包含单文件） =====
function toHtml(meta, msgs) {
  const css = [
    'body{font-family:-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;max-width:760px;margin:0 auto;padding:40px 20px;color:#1d1d1f;background:#fff;line-height:1.7}',
    'header{border-bottom:1px solid #e5e5e7;padding-bottom:16px;margin-bottom:28px}',
    'h1{font-size:22px;margin:0 0 6px}',
    '.meta{font-size:12px;color:#86868b}',
    'h2{font-size:15px;margin:28px 0 10px;color:#6e6e73;font-weight:600}',
    'pre{background:#f5f5f7;border-radius:10px;padding:14px;overflow-x:auto;font-size:12.5px}',
    'code{font-family:"SF Mono",Menlo,monospace;font-size:12.5px;background:#f5f5f7;border-radius:4px;padding:2px 5px}',
    'pre code{background:none;padding:0}',
    'blockquote{border-left:3px solid #d2d2d7;margin:10px 0;padding:6px 14px;color:#6e6e73;background:#f5f5f7;border-radius:0 8px 8px 0;font-size:13px}',
    'img{max-width:100%;border-radius:10px;margin:8px 0}',
    'sub{color:#86868b}',
    '.avatar{display:inline-flex;align-items:center;gap:6px}',
    '.chip{display:inline-block;background:#e8e8ed;border-radius:999px;padding:1px 9px;font-size:11px;font-weight:600}',
    '.chip.user{background:#0071e3;color:#fff}',
    '.chip.ai{background:#e8f5e9;color:#1b5e20}'
  ].join('\n')

  const body = []
  for (const m of msgs) {
    if (m.role === 'user') {
      body.push(`<h2><span class="chip user">用户</span> <span class="meta">${fmtTime(m.createdAt)}</span></h2>`)
      body.push(md.render(m.content || ''))
    } else if (m.role === 'assistant') {
      if (m.compaction) {
        body.push('<blockquote>⏳ 上下文压缩摘要</blockquote>')
        body.push(md.render(m.content || ''))
        continue
      }
      body.push(`<h2><span class="chip ai">助手</span> <span class="meta">${fmtTime(m.createdAt)}${m.model ? ' · ' + esc(m.model) : ''}</span></h2>`)
      body.push(md.render(m.content || ''))
      if (m.usage && (m.usage.input || m.usage.output)) {
        body.push(`<sub>tokens: in ${m.usage.input || 0} / out ${m.usage.output || 0}</sub>`)
      }
    } else if (m.role === 'tool') {
      const args = m.args ? esc(JSON.stringify(m.args).slice(0, 200)) : ''
      const result = m.result ? esc(String(m.result).slice(0, 500)) : ''
      body.push(`<blockquote><b>🔧 ${esc(m.toolName || '工具')}</b> ${args ? '<br>' + args : ''}${result ? '<br>→ ' + result : ''}</blockquote>`)
    } else if (m.role === 'ask_user') {
      body.push(`<blockquote><b>❓ 反问</b> ${esc(m.question || '')}</blockquote>`)
    }
  }

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title || 'OmniDeck 会话')}</title>
<style>${css}</style>
</head>
<body>
<header>
<h1>${esc(meta.title || 'OmniDeck 会话')}</h1>
<div class="meta">导出自 OmniDeck · ${fmtTime(Date.now())} · 共 ${msgs.length} 条记录</div>
</header>
${body.join('\n')}
</body>
</html>`
}

// ===== 导出入口（保存对话框） =====
async function exportSession(sessionId, format) {
  const meta = sessions.readMeta(sessionId)
  if (!meta) return { ok: false, error: '会话不存在' }
  const msgs = sessions.getMessages(sessionId)
  if (!msgs.length) return { ok: false, error: '会话为空，无可导出内容' }

  const base = `${safeName(meta.title)}-${fileStamp()}`
  const filters = format === 'html'
    ? [{ name: '自包含 HTML', extensions: ['html'] }]
    : [{ name: 'Markdown', extensions: ['md'] }]
  const { canceled, filePath } = await dialog.showSaveDialog({
    defaultPath: path.join(app.getPath('downloads'), base + (format === 'html' ? '.html' : '.md')),
    filters
  })
  if (canceled || !filePath) return { ok: false, canceled: true }

  let content = ''
  if (format === 'html') {
    content = toHtml(meta, msgs)
  } else {
    content = toMarkdown(meta, msgs)
    // 带图片附件的会话：md + images/ 目录 zip 打包（自包含分发）
    const images = []
    const dir = path.dirname(filePath)
    for (const m of msgs) {
      for (const im of (m.images || [])) images.push(im)
    }
    if (images.length) {
      const zip = new AdmZip()
      zip.addFile(path.basename(filePath), Buffer.from(content, 'utf-8'))
      // 图片源：截图 captures 与文件附件（attachments.readBase64 由 index.js 持有，
      // 此处按 meta 存的 path/thumb 读取原图；thumb 为 dataURL 直接落文件）
      let added = 0
      for (const im of images) {
        try {
          if (im.thumb && im.thumb.startsWith('data:')) {
            const b64 = im.thumb.split(',')[1]
            zip.addFile(`images/${im.id || added}.png`, Buffer.from(b64, 'base64'))
            added++
          } else if (im.path && fs.existsSync(im.path)) {
            zip.addFile(`images/${path.basename(im.path)}`, fs.readFileSync(im.path))
            added++
          }
        } catch (e) { /* 单图失败跳过 */ }
      }
      if (added) {
        const zipPath = filePath.replace(/\.md$/, '.zip')
        zip.writeZip(zipPath)
        return { ok: true, filePath: zipPath, note: `已打包 ${added} 张图片` }
      }
    }
  }
  fs.writeFileSync(filePath, content, 'utf-8')
  return { ok: true, filePath }
}

// 导出成功后「打开所在目录」
function revealFile(filePath) {
  try {
    shell.showItemInFolder(filePath)
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

module.exports = { exportSession, revealFile, toMarkdown, toHtml }
