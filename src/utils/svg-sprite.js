// SVG 雪碧图：用 Vite 原生 import.meta.glob 收集 svg 原始内容，生成 symbol 注入页面
// 不依赖第三方插件，dev/build 均稳定

const modules = import.meta.glob('@/assets/icons/svg/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default'
})

function generateSprite() {
  return Object.entries(modules)
    .map(([path, svgContent]) => {
      const name = path.match(/\/([^/]+)\.svg$/)[1]
      const viewBoxMatch = svgContent.match(/viewBox="([^"]+)"/)
      const viewBox = viewBoxMatch ? viewBoxMatch[1] : '0 0 24 24'
      const innerMatch = svgContent.match(/<svg[^>]*>([\s\S]*?)<\/svg>/)
      const inner = innerMatch ? innerMatch[1] : ''
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
