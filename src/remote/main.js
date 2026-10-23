// 手机远程任务页入口（独立构建，与主渲染应用完全隔离）
import { createApp } from 'vue'
import App from './App.vue'

createApp(App).mount('#app')
