// 跨组件事件总线单例（mitt）。
// Vue 3 移除 $root $on/$off/$emit 后经此模块共享同一 emitter；
// main.js 挂到 globalProperties.$bus 的即该实例，script setup 组件
// 直接 import 使用，与 Options 组件通信可达
import mitt from 'mitt'

export const bus = mitt()
export default bus
