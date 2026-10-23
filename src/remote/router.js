// 路由表（hash 模式：静态托管 / WebView 套壳 / 转原生 App 均无需服务端重写）
import PairPage from './views/PairPage.vue'
import TasksPage from './views/TasksPage.vue'
import TaskDetailPage from './views/TaskDetailPage.vue'
import ComposePage from './views/ComposePage.vue'
import { store } from './store'

export const routes = [
  { path: '/', redirect: '/tasks' },
  { path: '/tasks', name: 'tasks', component: TasksPage },
  { path: '/task/:id', name: 'task-detail', component: TaskDetailPage, props: true },
  { path: '/compose', name: 'compose', component: ComposePage },
  { path: '/pair', name: 'pair', component: PairPage },
  { path: '/:pathMatch(.*)*', redirect: '/tasks' }
]

// 路由守卫：未配对 → 配对页；已配对访问配对页 → 任务列表
export function setupGuard(router) {
  router.beforeEach((to) => {
    if (to.path !== '/pair' && !store.token) return '/pair'
    if (to.path === '/pair' && store.token) return '/tasks'
  })
}
