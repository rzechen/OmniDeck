// 图像工具共享函数
export function formatSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 B'
  // 支持负数（如压缩后体积增大）并钳制单位越界
  const sign = bytes < 0 ? '-' : ''
  const abs = Math.abs(bytes)
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.min(Math.floor(Math.log(abs) / Math.log(k)), sizes.length - 1)
  return sign + (abs / k ** i).toFixed(i === 0 ? 0 : 1) + ' ' + sizes[i]
}

// 加载文件为 Image 对象
export function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => resolve({ img, url })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('图片加载失败'))
    }
    img.src = url
  })
}

// Image 绘制到 canvas
export function drawToCanvas(img, w = img.naturalWidth, h = img.naturalHeight) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  return canvas
}

// canvas 转 Blob
export function canvasToBlob(canvas, type = 'image/png', quality = 0.92) {
  return new Promise(resolve => canvas.toBlob(resolve, type, quality))
}

// dataURL 转 Blob
export function dataUrlToBlob(dataUrl) {
  const [meta, b64] = dataUrl.split(',')
  const mime = meta.match(/:(.*?);/)[1]
  const bin = atob(b64)
  const arr = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i)
  return new Blob([arr], { type: mime })
}

// 下载 dataUrl
export function downloadDataUrl(filename, dataUrl) {
  const a = document.createElement('a')
  a.href = dataUrl
  a.download = filename
  a.click()
}

// 文件名去扩展名
export function baseName(name) {
  return name.replace(/\.[^.]+$/, '')
}
