// 临时冒烟：hover / drag / 右键，用完即删
const os = require('os')
const path = require('path')
const fs = require('fs')
const cu = require('./electron/agent/integrations/computer-use')

const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cu-d-'))
cu.init(agentDir)

async function main() {
  await cu.call('activate', { app: 'Finder' }, 15000)
  const shot = await cu.call('screenshot', {}, 30000)
  const w = shot.width, h = shot.height
  console.log('[smoke] 截屏:', w + 'x' + h)

  // hover：桌面空白处（右下角）
  const t0 = Date.now()
  console.log('[smoke] hover:', await cu.call('hover', { x: Math.round(w * 0.95), y: Math.round(h * 0.95) }, 15000),
    '耗时', Date.now() - t0, 'ms（预期 350-900）')

  // drag：空白→空白（对角拖过桌面空白区，不命中图标）
  const t1 = Date.now()
  console.log('[smoke] drag:', await cu.call('drag', {
    from_x: Math.round(w * 0.9), from_y: Math.round(h * 0.93),
    to_x: Math.round(w * 0.85), to_y: Math.round(h * 0.85)
  }, 20000), '耗时', Date.now() - t1, 'ms（预期 500-1200）')

  // 右键：桌面空白（弹上下文菜单）→ esc 关闭
  const t2 = Date.now()
  console.log('[smoke] 右键:', await cu.call('click', { x: Math.round(w * 0.8), y: Math.round(h * 0.9), button: 'right' }, 15000),
    '耗时', Date.now() - t2, 'ms')
  console.log('[smoke] esc 关菜单:', await cu.call('key', { combo: 'esc' }, 15000))

  cu.dispose()
  fs.rmSync(agentDir, { recursive: true, force: true })
  console.log('[smoke] 全部通过')
}

main().catch(e => { console.error('[smoke] 失败:', e && e.message); process.exit(1) })
