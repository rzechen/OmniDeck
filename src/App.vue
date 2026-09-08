<template>
  <div id="app">
    <!-- 主界面 ↔ OmniBuddy 视图切换：整页淡入过渡 -->
    <!-- 不用 keep-alive：顶层缓存 Layout 会让内部 router-view 的
         过渡/缓存状态在视图切换时被中断（表现为返回 deck 后内容
         停留在旧页面、与侧边栏高亮不一致），改为每次全新构建 -->
    <transition name="view-swap" mode="out-in">
      <router-view />
    </transition>
    <!-- OmniBuddy 快速唤起浮窗（全局 ⌘J） -->
    <buddy-spotlight />
    <!-- 应用锁定遮罩（密码 / Touch ID） -->
    <app-lock ref="appLock" />
  </div>
</template>

<script>
import BuddySpotlight from '@/components/buddy/BuddySpotlight.vue'
import AppLock from '@/components/AppLock.vue'
import { getItem, setItem } from '@/utils/db'

export default {
  name: 'App',
  components: { BuddySpotlight, AppLock },
  created() {
    // 代办到期提醒：全局轮询（含启动时补发错过未通知的提醒）
    this.todoRemindTimer = setInterval(this.checkTodoReminders, 30000)
    this.checkTodoReminders()
  },
  beforeDestroy() {
    clearInterval(this.todoRemindTimer)
  },
  methods: {
    // ===== 代办到期提醒 =====
    // 读取代办列表（db 内存缓存与代办页共享同一数组引用，修改后双向可见）
    checkTodoReminders() {
      const todos = getItem('todoItems', [])
      if (!Array.isArray(todos) || !todos.length) return
      const now = Date.now()
      let changed = false
      todos.forEach(t => {
        // 未完成、设置了提醒、未通知过、已到提醒时间
        if (t && t.remindAt && !t.notified && !t.done && t.remindAt <= now) {
          this.fireTodoNotification(t)
          t.notified = true
          changed = true
        }
      })
      if (changed) setItem('todoItems', todos)
    },
    // 系统通知（Electron 渲染进程 Notification 走系统通知）
    fireTodoNotification(t) {
      if (typeof Notification === 'undefined') return
      const fire = () => {
        try {
          const n = new Notification('代办提醒', {
            body: t.title + (t.desc ? '\n' + t.desc : ''),
            tag: 'todo-' + t.id
          })
          n.onclick = () => {
            window.focus()
            if (this.$route.path !== '/todo') {
              this.$router.push('/todo').catch(() => {})
            }
          }
        } catch (e) { /* 通知失败忽略 */ }
      }
      if (Notification.permission === 'granted') {
        fire()
      } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => {
          if (p === 'granted') fire()
        }).catch(() => {})
      }
    }
  }
}
</script>

<style lang="scss">
// 顶层视图切换（主界面 ↔ OmniBuddy）：轻量淡入，避免生硬跳变
.view-swap-enter-active,
.view-swap-leave-active {
  transition: opacity 0.22s ease;
}

.view-swap-enter,
.view-swap-leave-to {
  opacity: 0;
}
</style>
