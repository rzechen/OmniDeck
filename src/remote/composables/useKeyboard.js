// 软键盘适配（iOS 13+ 悬浮式键盘）：键盘弹出时布局视口高度不变，
// Safari 只把视觉视口向上推（visualViewport.offsetTop > 0）让聚焦框可见，
// 且 window.scrollTo 无法复位该偏移 —— 页面整体被顶起、顶部露白。
// 解法（聊天 H5 标准做法）：#app 高度设为 visualViewport.height（键盘上方
// 可视区），再用 transform: translateY(offsetTop) 把 #app 平移到当前可视
// 区域 —— 底边恒等于键盘上沿，输入框贴键盘正上方，中部内容自动压缩。
// Android / 旧 iOS 键盘会直接缩小布局视口（innerHeight 缩水、offsetTop=0），
// 同一套逻辑天然兼容。
// 返回：kbOpen 键盘是否弹出（品牌区等让位淡出）；kbGap 键盘高度像素
// （底部滑出抽屉是 fixed 定位相对布局视口，键盘会盖住抽屉下半部，
// 需用 kbGap 做底部留白补偿让输入行可见）。
// 单例：refs 与监听模块级共享，多处调用（页面 + 抽屉）不会重复绑定。
import { ref, onMounted } from 'vue'

const kbOpen = ref(false)
const kbGap = ref(0)
let bound = false

function update() {
  const vv = window.visualViewport
  const app = document.getElementById('app')
  if (!vv || !app) return
  kbGap.value = Math.max(0, Math.round(window.innerHeight - vv.height))
  kbOpen.value = kbGap.value > 120
  app.style.height = vv.height + 'px'
  // 视觉视口被上推时（offsetTop > 0）跟随平移，保持 #app 充满可视区
  app.style.transform = vv.offsetTop > 0 ? `translateY(${vv.offsetTop}px)` : ''
  // 键盘弹出时底部安全区 padding 由键盘替代，去掉避免输入框悬空
  app.style.paddingBottom = kbOpen.value ? '0' : ''
  // 兜底：若 Safari 走的是文档滚动而非视觉视口偏移，拉回顶部
  if (window.scrollY > 0) window.scrollTo(0, 0)
}

function ensureBound() {
  if (bound) return
  const vv = window.visualViewport
  if (!vv) return
  vv.addEventListener('resize', update)
  vv.addEventListener('scroll', update)
  bound = true
  update()
}

export function useKeyboard() {
  onMounted(ensureBound)
  return { kbOpen, kbGap }
}
