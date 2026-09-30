// 公众号编辑器注入：inject_wechat_editor 工具
// 场景：用户已在内置浏览器登录 mp.weixin.qq.com 并打开图文编辑页时，
//   渲染成品直接写入编辑器（走网页登录态，绕开开放接口的 IP 白名单要求）。
// 链路：模板渲染（复用 render.js）→ 本地 assets/ 图片内联为 data URI
//   → 宿主桥 wx.injectEditor（agent-bridge 遍历 WebContents 定位公众号页）
//   → 页面内执行：编辑器定位（新版 ProseMirror 优先，四级回退）+ 空占位清理
//     + 离屏解析逐节点追加（不覆盖已有内容）+ 标题/摘要/作者表单回填。
// 图片说明：data URI 图片由公众号编辑器保存时自动转存素材库（mmbiz 域名）；
//   外链图片不转存、可能失效，注入结果带警告。
const fs = require('fs')
const path = require('path')
const { __host } = require('electron')

const render = require('./render')

function errText(text) {
  return { content: [{ type: 'text', text }], details: { isError: true } }
}

// 本地相对路径图片 → data URI 内联（注入编辑器后由微信自动转存素材库）
function inlineLocalImages(html, tplDir) {
  const MIME = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', gif: 'gif', webp: 'webp' }
  let inlined = 0
  let missing = 0
  html = html.replace(/<img\b[^>]*?\bsrc\s*=\s*"([^"]*)"/gi, (m, src) => {
    if (/^(data:|https?:)/i.test(src)) return m
    // 路径越界防护：解析后必须仍在模板目录内
    const p = path.resolve(tplDir, src)
    if (p !== tplDir && !p.startsWith(tplDir + path.sep)) return m
    try {
      const buf = fs.readFileSync(p)
      const ext = path.extname(p).toLowerCase().replace('.', '')
      const mime = MIME[ext] || 'png'
      inlined++
      return m.split('"' + src + '"')
        .join('"data:image/' + mime + ';base64,' + buf.toString('base64') + '"')
    } catch (e) {
      missing++
      return m
    }
  })
  return { html, inlined, missing }
}

function createEditorExtension() {
  return function wechatEditorExtension(piApi) {
    piApi.registerTool({
      name: 'inject_wechat_editor',
      label: '注入公众号编辑器',
      description: '将模板渲染成品直接写入已打开的公众号图文编辑页（需先在内置浏览器登录 mp.weixin.qq.com '
        + '并进入图文编辑页）：正文追加进编辑器（不覆盖已有内容），本地图片自动内联为 data URI'
        + '（保存时由微信转存素材库），并回填标题 / 摘要 / 作者。走网页登录态，无需 API 凭据与 IP 白名单。'
        + '存在未提供值的变量时仍会注入并提示（可在编辑器内手动修改）。',
      parameters: {
        type: 'object',
        properties: {
          id: { type: 'string', description: '模板 id' },
          title: { type: 'string', description: '文章标题（回填编辑器标题框）' },
          author: { type: 'string', description: '作者名（可选）' },
          digest: { type: 'string', description: '摘要（可选，默认正文前 120 字）' },
          fieldValues: { type: 'object', description: '标量变量值映射（同 render_wechat_template）' },
          loopFieldValues: { type: 'object', description: '循环变量值映射（同 render_wechat_template）' }
        },
        required: ['id']
      },
      execute: async (_id, params) => {
        const p = params || {}
        let meta
        try {
          meta = render.loadTemplate(p.id)
        } catch (e) {
          return errText(e.message)
        }
        const { html, residual } = render.renderFromTemplate(meta, p.fieldValues, p.loopFieldValues)
        const tplDir = path.join(render.templatesRoot(), meta.id)
        const inl = inlineLocalImages(html, tplDir)

        // 宿主桥：主进程定位公众号页面并在页面内执行注入
        let r
        try {
          r = await __host.injectEditor(inl.html, {
            title: (p.title && String(p.title).trim()) || meta.title || '',
            author: (p.author && String(p.author).trim()) || '',
            digest: (p.digest && String(p.digest).trim())
              || render.plainText(html).slice(0, 120)
          })
        } catch (e) {
          return errText('注入失败：' + e.message)
        }
        if (!r || !r.ok) {
          return errText((r && r.error) || '注入失败（未知错误）')
        }

        const notes = []
        if (inl.inlined) notes.push(inl.inlined + ' 张本地图片已内联（编辑器保存时自动转存素材库）')
        if (inl.missing) notes.push(inl.missing + ' 张本地图片读取失败（原样保留）')
        const external = /<img\b[^>]*\bsrc\s*=\s*"https?:/i.test(inl.html)
        if (external) notes.push('存在外链图片：微信可能不转存，保存后请检查图片是否正常显示')
        if (residual.length) notes.push(residual.length + ' 个变量未提供值已原样注入：' + residual.join('、') + '（可在编辑器内手动修改）')

        const text = '已注入公众号编辑器（页面：' + (r.url || '') + '）'
          + '\n正文：' + r.nodes + ' 个内容节点已追加，表单回填：' + (r.filled && r.filled.length ? r.filled.join('、') : '无')
          + (notes.length ? '\n提示：\n  - ' + notes.join('\n  - ') : '')
          + '\n后续：在编辑器内核对排版，确认无误后点「保存」或「预览」。'
        return { content: [{ type: 'text', text }] }
      }
    })
  }
}

module.exports = { createEditorExtension }
