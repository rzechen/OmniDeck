import Vue from 'vue'
import ElementUI from 'element-ui'
import { PopupManager } from 'element-ui/lib/utils/popup'
import 'element-ui/lib/theme-chalk/index.css'
import App from './App.vue'
import router, { prefetchToolChunks } from './router'
import store from './store'
import SvgIcon from './components/SvgIcon/index.vue'
import { setupSvgSprite } from './utils/svg-sprite'
import { loadAll, getItem } from './utils/db'
import { applyTheme, getStoredTheme, watchSystemTheme } from './utils/theme'
import { getStoredWallpaper, applyWallpaperDom } from './utils/wallpaper'
import './styles/index.scss'
import './styles/theme.scss'
import './styles/motion.scss'
import './styles/buddy-settings-global.scss'

Vue.use(ElementUI, { size: 'small' })
Vue.component('svg-icon', SvgIcon)
Vue.config.productionTip = false

// Element 弹层（日期/时间面板、select 下拉、MessageBox、Dialog 等）挂在 body 下，
// 默认 z-index 从 2000 起算，低于自定义弹窗遮罩（z-index: 3100）时会被压在遮罩下层
// （如新建待办时日期面板被遮挡）。统一抬高起始层级到 3200：
// - 高于所有自定义弹层（3100），面板正常弹出
// - 保留 Element 按打开顺序自增的层级管理
// - 低于 AppLock 锁屏（9999），锁屏仍覆盖一切
PopupManager.zIndex = 3200

// Message 全局提示统一抬高距顶位置：Element 默认 20px 过于贴顶，
// 统一注入 offset: 72（多条提示仍由 Element 在此基准上自动向下堆叠）
const rawMessage = Vue.prototype.$message
Vue.prototype.$message = function (options) {
  if (typeof options === 'string') options = { message: options }
  return rawMessage(Object.assign({ offset: 72 }, options))
}
;['success', 'warning', 'info', 'error'].forEach(type => {
  Vue.prototype.$message[type] = function (message, options) {
    return rawMessage(Object.assign({ message, type, offset: 72 }, (typeof message === 'object' ? message : options)))
  }
})

// 复制图标变形：点击带复制图标（el-icon-document-copy）的按钮时，
// 图标短暂替换为绿色 ✓ 并弹跳，1.2s 后还原。无需改动任何工具页代码。
function setupCopyMorph() {
  document.addEventListener(
    'click',
    e => {
      const btn = e.target && e.target.closest ? e.target.closest('button, .tool-btn, .add-btn') : null
      if (!btn) return
      const icon = btn.querySelector('i.el-icon-document-copy')
      if (!icon || btn.dataset.copyLock) return
      btn.dataset.copyLock = '1'
      icon.classList.remove('el-icon-document-copy')
      icon.classList.add('el-icon-circle-check', 'is-copied')
      setTimeout(() => {
        icon.classList.remove('el-icon-circle-check', 'is-copied')
        icon.classList.add('el-icon-document-copy')
        delete btn.dataset.copyLock
      }, 1200)
    },
    true
  )
}

// 异步启动：先从 IndexedDB 加载配置到内存，再初始化主题，最后挂载应用
async function bootstrap() {
  // 初始化 SVG 雪碧图
  setupSvgSprite()

  // 从 IndexedDB 加载所有配置到内存缓存
  await loadAll()

  // 应用持久化的主题
  const { mode, color } = getStoredTheme()
  applyTheme(mode, color)
  watchSystemTheme()

  // 同步到 Vuex（含工具收藏、卡片布局、侧边栏默认状态、分组展开状态、动效偏好）
  const { list: wpList, config: wpConfig } = getStoredWallpaper()
  applyWallpaperDom(wpConfig)
  store.commit('INIT_FROM_DB', {
    mode,
    color,
    toolFavorites: getItem('toolFavorites', []),
    toolGridCols: getItem('toolGridCols', 'auto'),
    sidebarDefault: getItem('sidebarDefault', 'expand'),
    sidebarGroupsDefault: getItem('sidebarGroupsDefault', 'expand'),
    reduceMotion: getItem('reduceMotion', false),
    wallpaperList: wpList,
    wallpaperConfig: wpConfig
  })

  // 减弱动态效果：写入 html 根类，全局 CSS 感知
  document.documentElement.classList.toggle('reduce-motion', store.state.reduceMotion)

  // 复制按钮图标变形：全局点击委托（点击含复制图标的按钮，图标短暂变形为 ✓）
  setupCopyMorph()

  new Vue({
    router,
    store,
    render: h => h(App)
  }).$mount('#app')

  // 首屏挂载完成后，空闲时预取工具页分包（后台进行，不阻塞界面）
  prefetchToolChunks()
}

bootstrap()
