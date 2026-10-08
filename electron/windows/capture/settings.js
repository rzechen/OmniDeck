// OmniDeck 截图工具设置持久化（capture-settings.json）：快捷键键位与
// 剪贴板历史上限的读写。各子模块（shortcuts / clips）经本模块统一落盘，
// 写入采用读-改-写合并，避免相互覆盖。
const path = require('path')
const fs = require('fs')
const { app } = require('electron')

// 设置文件路径（userData/capture-settings.json）
function captureSettingsFile() {
  return path.join(app.getPath('userData'), 'capture-settings.json')
}

// 读取设置（文件不存在 / 损坏时返回空对象，调用方走默认值）
function readCaptureSettings() {
  try {
    return JSON.parse(fs.readFileSync(captureSettingsFile(), 'utf-8'))
  } catch (e) {
    return {}
  }
}

// 读-改-写合并落盘（只覆盖传入的键，写失败忽略）
function updateCaptureSettings(patch) {
  try {
    const merged = Object.assign(readCaptureSettings(), patch)
    fs.writeFileSync(captureSettingsFile(), JSON.stringify(merged, null, 2))
  } catch (e) { /* 写失败忽略 */ }
}

module.exports = {
  // 读取设置（异常时返回空对象）
  readCaptureSettings,
  // 读-改-写合并落盘（只覆盖传入的键）
  updateCaptureSettings
}
