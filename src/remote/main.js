// 手机远程任务页入口（独立构建，与主渲染应用完全隔离）
// hash 路由：每个页面有独立路由，可直接静态托管 / 嵌 WebView / 转原生 App
// Element Plus 按需引入（复用框架组件：抽屉 / 骨架 / 空态 / 输入 / 按钮 / 消息）
import { createApp } from 'vue'
import { createRouter, createWebHashHistory } from 'vue-router'
import {
  ElDrawer, ElSkeleton, ElSkeletonItem, ElEmpty, ElInput, ElButton, ElSelect, ElOption
} from 'element-plus'
import 'element-plus/es/components/base/style/css'
import 'element-plus/es/components/drawer/style/css'
import 'element-plus/es/components/skeleton/style/css'
import 'element-plus/es/components/empty/style/css'
import 'element-plus/es/components/input/style/css'
import 'element-plus/es/components/button/style/css'
import 'element-plus/es/components/message/style/css'
import 'element-plus/es/components/select/style/css'
import 'element-plus/es/components/option/style/css'
import App from './App.vue'
import { routes, setupGuard } from './router'
import { setToken } from './store'
import './styles.css'

// URL 配对 token（?token=xxx）：吸收后清理地址栏（token 不留痕）
const qsToken = new URLSearchParams(location.search).get('token')
if (qsToken) {
  setToken(qsToken)
  try { history.replaceState(null, '', location.pathname + (location.hash || '')) } catch (e) { /* 忽略 */ }
}

// iOS 捏合缩放兜底：iOS Safari 忽略 user-scalable=no，gesturestart 阻断双指手势
document.addEventListener('gesturestart', e => e.preventDefault())

const router = createRouter({ history: createWebHashHistory(), routes })
setupGuard(router)

const app = createApp(App)
app.use(router)
;[ElDrawer, ElSkeleton, ElSkeletonItem, ElEmpty, ElInput, ElButton, ElSelect, ElOption].forEach(c => app.use(c))
app.mount('#app')
