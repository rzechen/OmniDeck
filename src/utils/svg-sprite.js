// SVG 雪碧图：用 Vite 原生 import.meta.glob 收集 svg 原始内容，生成 symbol 注入页面
// 不依赖第三方插件，dev/build 均稳定

// 通用图标目录 + 空间专属图标目录（src/assets/space，space- 前缀命名避免重名）
const modules = {
  ...import.meta.glob('@/assets/icons/svg/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default'
  }),
  ...import.meta.glob('@/assets/space/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default'
  })
}

function generateSprite() {
  return Object.entries(modules)
    .map(([path, svgContent]) => {
      const name = path.match(/\/([^/]+)\.svg$/)[1]
      const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/)
      const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 24 24'
      const innerMatch = svgContent.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
      let inner = innerMatch ? innerMatch[1] : ''
      // 视觉统一：24x24 细描边图标（stroke 系，图形仅占画布 70~80% 且为细线条）
      // 中心放大 1.12 倍补偿，与 1024 系 / 24 系实心图标的视觉大小一致
      // 实心填充系（无 stroke）图形本就占满画布，不补偿以免边缘裁切
      if (viewBox === '0 0 24 24' && /stroke=/.test(svgContent)) {
        const s = 1.12
        const t = (12 * (1 - s)).toFixed(2)
        inner = `<g transform="translate(${t} ${t}) scale(${s})">${inner}</g>`
      }
      return `<symbol id="icon-${name}" viewBox="${viewBox}">${inner}</symbol>`
    })
    .join('')
}

const SPRITE_ID = 'svg-sprite-container'

export function setupSvgSprite() {
  if (typeof document === 'undefined') return
  let container = document.getElementById(SPRITE_ID)
  if (!container) {
    container = document.createElement('div')
    container.id = SPRITE_ID
    container.style.cssText =
      'position:absolute;width:0;height:0;overflow:hidden'
    document.body.appendChild(container)
  }
  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${generateSprite()}</svg>`
}
