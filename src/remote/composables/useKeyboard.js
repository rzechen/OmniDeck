// 软键盘适配（iOS）：键盘弹出时 layout viewport 高度不变，浏览器改为上推
// visualViewport 渲染层（offsetTop）让聚焦框可见——页面被顶起、顶部露白，
// 且 window 的 scroll 事件不触发、scrollTo(0,0) 拉不回。
// 解法（聊天 H5 标准做法）：把 #app 高度直接设为 visualViewport.height
// （键盘上方可视区），flex 布局自动重排——底部输入框贴键盘正上方，
// 中部内容区压缩，浏览器无需上推渲染层。
// 返回 kbOpen 供品牌区等元素在键盘弹出时让位（淡出）。
import { ref, onMounted, onUnmounted } from 'vue'

export function useKeyboard() {
  const kbOpen = ref(false)
  let onResize = null

  onMounted(() => {
    const vv = window.visualViewport
    const app = document.getElementById('app')
    if (!vv || !app) return
    onResize = () => {
      app.style.height = vv.height + 'px'
      kbOpen.value = window.innerHeight - vv.height > 120
    }
    vv.addEventListener('resize', onResize)
    onResize()
  })

  onUnmounted(() => {
    const vv = window.visualViewport
    if (vv && onResize) vv.removeEventListener('resize', onResize)
    const app = document.getElementById('app')
    if (app) app.style.height = ''
  })

  return { kbOpen }
}
