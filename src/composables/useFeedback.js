// script setup 组件统一弹层反馈入口。
// main.js 对 $message（offset 72）/$confirm（遮罩不关闭）做了全局定制，
// 组件迁移到 <script setup> 后没有 this，经 getCurrentInstance().proxy
// 取同一实例，保证全应用弹层行为一致（不各自直连 ElMessage 造成分叉）
import { getCurrentInstance } from 'vue'

export function useFeedback() {
  const proxy = getCurrentInstance().proxy
  return {
    message: proxy.$message.bind(proxy),
    confirm: proxy.$confirm.bind(proxy),
    prompt: proxy.$prompt.bind(proxy),
    alert: proxy.$alert.bind(proxy),
    notify: proxy.$notify ? proxy.$notify.bind(proxy) : null
  }
}
