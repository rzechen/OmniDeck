<template>
  <!-- 配对页（/pair）：首次访问输入 token，成功后进任务列表 -->
  <div class="page">
    <div class="gate">
      <div class="brand">
        <img class="logo-lg" :src="logoUrl" alt="OmniDeck">
        <b>OmniDeck</b>
        <small>输入 PC 端「设置 → 移动端」显示的配对 Token</small>
      </div>
      <el-input
        v-model="input"
        placeholder="配对 Token"
        size="large"
        clearable
        @keyup.enter="pair"
      />
      <el-button type="primary" size="large" round class="pair-btn" :disabled="!input.trim()" @click="pair">连 接</el-button>
      <p class="tip">请保持电脑唤醒（休眠时服务不可达）</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import logoUrl from '@/assets/logo-sm.png'
import { setToken } from '../store'

const router = useRouter()
const input = ref('')

function pair() {
  const t = input.value.trim()
  if (!t) return
  setToken(t)
  router.replace('/tasks')
}
</script>

<style>
.page { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.gate { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 32px; }
.gate .brand { text-align: center; }
.gate .brand b { display: block; font-size: 20px; font-weight: 700; margin-top: 12px; letter-spacing: .3px; }
.gate .brand small { color: var(--muted); font-size: 12.5px; }
.gate .el-input { width: 100%; max-width: 300px; }
.pair-btn { min-width: 140px; font-weight: 600; }
.gate .tip { font-size: 11.5px; color: var(--muted); }
</style>
