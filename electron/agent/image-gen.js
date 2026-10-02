// 图像生成工具：generate_image（OpenAI images generations 兼容格式）
// 业界主流图像端点（智谱 / OpenRouter / 硅基流动 / 阿里兼容模式等）均兼容
// POST {baseUrl}/images/generations，body { model, prompt, size? }，
// 响应 data[0].b64_json 或 data[0].url——两种形态都支持，产物落 <cwd>/exports/。
// 数据源：providers.json 镜像中 type:'image' 条目（模型管理「新建图像生成模型」）；
// 附着式配置（provider 上的 imageModel / imageBaseUrl / imageApiKey）向下兼容。
// 注意：pi SDK 内置的图像通道仅认 openrouter-images，本工具为通用替代，
// models.json 不再注册 type:'image' 模型，避免 SDK 侧重复注册同名工具。
const fs = require('fs')
const path = require('path')

// 读取图像端点配置：独立条目优先（可多条，用第一条），附着式兜底
function readImageEntries(agentDir, provider) {
  const entries = []
  try {
    const mirror = JSON.parse(fs.readFileSync(
      path.join(agentDir, '..', 'automation', 'providers.json'), 'utf-8'))
    for (const x of ((mirror && mirror.providers) || [])) {
      if (x && x.type === 'image' && x.baseUrl && x.model) {
        entries.push({
          baseUrl: x.baseUrl,
          apiKey: x.apiKey || '',
          model: x.model,
          name: x.displayName || x.name || x.model
        })
      }
    }
  } catch (e) { /* 镜像不可读：走附着式 */ }
  if (provider && provider.imageModel) {
    entries.push({
      baseUrl: provider.imageBaseUrl || provider.baseUrl,
      apiKey: provider.imageApiKey || provider.apiKey || '',
      model: provider.imageModel,
      name: provider.imageModel
    })
  }
  return entries
}

function errText(text) {
  return { content: [{ type: 'text', text }], details: { isError: true } }
}

// cwdState：会话当前目录（exports/ 落盘基准）；agentDir：镜像相对根；
// getProvider：() => state.provider（附着式图像配置来源）
function createImageGenExtension(cwdState, agentDir, getProvider) {
  return function imageGenExtension(piApi) {
    piApi.registerTool({
      name: 'generate_image',
      label: '生成图片',
      description: '根据文字描述生成图片（OpenAI 图像接口兼容格式，支持智谱 / OpenRouter / 硅基流动等端点），'
        + '产物自动保存到 exports/ 目录并返回文件路径，可直接用作公众号封面等素材。',
      parameters: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: '图像内容描述（中英文均可，画面要素 + 风格）' },
          size: { type: 'string', description: '尺寸 宽x高（可选，如 1024x1024、1440x720；端点不支持时自动忽略）' }
        },
        required: ['prompt']
      },
      execute: async (_id, params, signal) => {
        const p = params || {}
        const prompt = String(p.prompt || '').trim()
        if (!prompt) return errText('错误：prompt 必填')
        const entries = readImageEntries(agentDir, getProvider ? getProvider() : null)
        if (!entries.length) {
          return errText('未配置图像生成模型：请在「模型管理 → 新建图像生成模型」添加'
            + '（OpenAI 图像接口兼容端点，如 https://open.bigmodel.cn/api/paas/v4）')
        }
        const cfg = entries[0]

        const body = { model: cfg.model, prompt }
        if (p.size && /^\d+x\d+$/.test(String(p.size).trim())) body.size = String(p.size).trim()

        let res
        try {
          res = await fetch(cfg.baseUrl.replace(/\/+$/, '') + '/images/generations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
            body: JSON.stringify(body),
            signal
          })
        } catch (e) {
          return errText('图像接口请求失败：' + e.message)
        }
        if (!res.ok) {
          const txt = await res.text().catch(() => '')
          return errText('图像接口 HTTP ' + res.status + '：' + txt.slice(0, 300))
        }
        const j = await res.json().catch(() => null)
        const item = j && j.data && j.data[0]
        if (!item) return errText('图像接口响应异常（无 data[0]）：' + JSON.stringify(j).slice(0, 300))

        try {
          let buf
          let ext = 'png'
          if (item.b64_json) {
            buf = Buffer.from(item.b64_json, 'base64')
          } else if (item.url && /^https?:\/\//i.test(item.url)) {
            const r2 = await fetch(item.url, { signal })
            if (!r2.ok) throw new Error('下载生成图 HTTP ' + r2.status)
            buf = Buffer.from(await r2.arrayBuffer())
            const ct = r2.headers.get('content-type') || ''
            if (ct.indexOf('jpeg') >= 0) ext = 'jpg'
          } else {
            throw new Error('响应中无 b64_json / url')
          }
          const dir = path.join(cwdState.dir, 'exports')
          fs.mkdirSync(dir, { recursive: true })
          const file = path.join(dir, 'image-' + Date.now().toString(36) + '.' + ext)
          fs.writeFileSync(file, buf)
          const text = '图片已生成：' + file
            + '\n模型：' + cfg.model + (body.size ? '（size=' + body.size + '）' : '')
            + '\n可直接在 publish_wechat_draft 的 cover 参数传入该路径'
          return {
            content: [{ type: 'text', text }],
            details: { artifacts: [{ path: file, name: path.basename(file) }] }
          }
        } catch (e) {
          return errText('生成图落盘失败：' + e.message)
        }
      }
    })
  }
}

module.exports = { createImageGenExtension }
