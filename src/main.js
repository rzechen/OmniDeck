import { createApp, h } from 'vue'
import ElementPlus, { ElDialog, ElDrawer, ElMessage, ElMessageBox } from 'element-plus'
import mitt from 'mitt'
import 'element-plus/dist/index.css'
import App from './App.vue'
import router, { prefetchToolChunks } from './router'
import store from './store'
import SvgIcon from './components/common/SvgIcon/index.vue'
import { setupSvgSprite } from './utils/svg-sprite'
import { loadAll, getItem, sampleDailyUsage } from './utils/db'
import { purge as purgeToolHistory } from './utils/tool-history'
import { applyTheme, getStoredTheme, watchSystemTheme } from './utils/theme'
import { getStoredWallpaper, applyWallpaperDom } from './utils/wallpaper'
import './styles/index.scss'
import './styles/theme.scss'
import './styles/motion.scss'
import './styles/buddy-settings-global.scss'

const app = createApp(App)
app.use(ElementPlus, { size: 'small', zIndex: 3200 })
app.use(router)
app.use(store)
app.component('svg-icon', SvgIcon)

// 事件总线（替代 Vue2 $root.$on/$off/$emit 跨组件通信）
app.config.globalProperties.$bus = mitt()

// 弹窗统一交互：点击弹窗外遮罩区域一律不关闭弹窗（全局默认）
// - Dialog / Drawer：改组件 props 默认值，模板中的 el-dialog / el-drawer 全部生效
// - MessageBox（$confirm / $prompt / $msgbox）：注入全局默认参数
// - 个别弹窗如需恢复遮罩关闭，可在模板属性/调用参数中显式传 true 覆盖
ElDialog.props.closeOnClickModal.default = false
ElDrawer.props.closeOnClickModal.default = false
const rawMsgBox = ElMessageBox
app.config.globalProperties.$msgbox = (options = {}) =>
  rawMsgBox(Object.assign({ closeOnClickModal: false }, options))
app.config.globalProperties.$msgbox.alert = (msg, title, options) =>
  rawMsgBox.alert(msg, title, Object.assign({ closeOnClickModal: false }, options))
app.config.globalProperties.$msgbox.confirm = (msg, title, options) =>
  rawMsgBox.confirm(msg, title, Object.assign({ closeOnClickModal: false }, options))
app.config.globalProperties.$msgbox.prompt = (msg, title, options) =>
  rawMsgBox.prompt(msg, title, Object.assign({ closeOnClickModal: false }, options))

// Message 全局提示统一抬高距顶位置：Element 默认 20px 过于贴顶，
// 统一注入 offset: 72（多条提示仍由 Element 在此基准上自动向下堆叠）
const rawMessage = ElMessage
app.config.globalProperties.$message = function (options) {
  if (typeof options === 'string') options = { message: options }
  return rawMessage(Object.assign({ offset: 72 }, options))
}
;['success', 'warning', 'info', 'error'].forEach(type => {
  app.config.globalProperties.$message[type] = function (message, options) {
    return rawMessage(Object.assign({ message, type, offset: 72 }, (typeof message === 'object' ? message : options)))
  }
})
// 消息弹窗走统一封装：$alert / $confirm / $prompt 与 $msgbox 同源
app.config.globalProperties.$alert = app.config.globalProperties.$msgbox.alert
app.config.globalProperties.$confirm = app.config.globalProperties.$msgbox.confirm
app.config.globalProperties.$prompt = app.config.globalProperties.$msgbox.prompt

// 复制图标变形：点击带复制图标的按钮时，图标短暂替换为绿色 ✓ 并弹跳，1.2s 后还原。
// 无需改动任何工具页代码。
function setupCopyMorph() {
  document.addEventListener(
    'click',
    e => {
      const btn = e.target && e.target.closest ? e.target.closest('button, .tool-btn, .add-btn') : null
      if (!btn) return
      // svg-icon 渲染为 <svg class="svg-icon..."><use href="#icon-xxx"/></svg>
      const use = btn.querySelector('svg use[href="#icon-document-copy"], svg use[xlink\\:href="#icon-document-copy"]')
      if (!use || btn.dataset.copyLock) return
      const svg = use.closest('svg')
      btn.dataset.copyLock = '1'
      use.setAttribute('href', '#icon-circle-check')
      use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#icon-circle-check')
      svg.classList.add('is-copied')
      setTimeout(() => {
        use.setAttribute('href', '#icon-document-copy')
        use.setAttributeNS('http://www.w3.org/1999/xlink', 'xlink:href', '#icon-document-copy')
        svg.classList.remove('is-copied')
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

  // 复制按钮图标变形：全局点击委托（点击含复制图标时，图标短暂变形为 ✓）
  setupCopyMorph()

  // 每日 IndexedDB 用量采样（每天首次启动记一次，首页折线图数据源）。
  // 必须在挂载前完成：否则首页 mounted 读采样表时尚无"今天"的样本，
  // 差值全为 null，折线图在每天首次启动时必然显示"暂无数据"
  await sampleDailyUsage().catch(() => {})

  app.mount('#app')

  // 首屏挂载完成后，空闲时预取工具页分包（后台进行，不阻塞界面）
  prefetchToolChunks()

  // 工具执行历史治理：清理过期记录（TTL 30 天）+ 申请持久化存储
  // 后台异步执行，不阻塞启动；失败静默
  purgeToolHistory().catch(() => {})
}

bootstrap()
