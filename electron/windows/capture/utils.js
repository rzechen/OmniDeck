// OmniDeck 截图工具通用助手：毫秒等待与 JPEG 缩略图 dataURL 构造
// （toJPEG 返回 Buffer，需手工拼 base64 前缀）。
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

// JPEG 缩略图 dataURL
const jpegDataURL = (image, width, quality) =>
  'data:image/jpeg;base64,' + image.resize({ width }).toJPEG(quality).toString('base64')

module.exports = {
  // 毫秒等待（隐藏窗口后等系统刷新等场景）
  sleep,
  // JPEG 缩略图 dataURL（指定宽度与质量）
  jpegDataURL
}
