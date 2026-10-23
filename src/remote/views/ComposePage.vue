<template>
  <!-- 新建任务页（/compose）：品牌区 + 底部问答输入框（空间/模型在输入框内切换） -->
  <div class="page">
    <AppHeader
      view="detail" :title="'新建任务'" :conn-on="store.connOn"
      :running="false" @back="back"
    />
    <div class="compose-body">
      <!-- 品牌区（logo · OmniDeck · 任务不停 ● 思考不断） -->
      <div class="hero">
        <img class="hero-logo" :src="logoUrl" alt="OmniDeck">
        <b class="hero-name">OmniDeck</b>
        <div class="hero-slogan">
          <span>任务不停</span><i class="sdot"></i><span>思考不断</span>
        </div>
      </div>
    </div>

    <!-- 问答输入框（对齐 PC：多行输入 + 工具栏切换空间/模型 + 右侧发送） -->
    <Composer placeholder="描述要执行的任务…" :disabled="submitting" @send="submit">
      <template #tools>
        <ComposerPicker
          icon="folder" :label="wsName" title="工作空间"
          :model-value="wsId" :items="wsItems"
          empty-text="暂无可用工作空间，请先在 PC 端添加"
          @select="wsId = $event"
        />
        <ComposerPicker
          icon="llm" :label="pvName" title="模型"
          :model-value="providerId" :items="pvItems"
          empty-text="暂无可用模型，请先在 PC 端「模型管理」添加"
          @select="providerId = $event"
        />
      </template>
    </Composer>
  </div>
</template>

<script setup>
// 新建任务页：品牌区 + 问答输入框（空间/模型切换在输入框工具栏，与 PC 同构）；
// 提交后直达详情页实时看进度
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AppHeader from '../components/AppHeader.vue'
import Composer from '../components/Composer.vue'
import ComposerPicker from '../components/ComposerPicker.vue'
import { useKeyboard } from '../composables/useKeyboard'
import logoUrl from '@/assets/logo-sm.png'
import { store } from '../store'
import api from '../api'

const route = useRoute()
const router = useRouter()

const workspaces = ref([])
const providers = ref([])
const wsId = ref('')
const providerId = ref('')
const submitting = ref(false)

// picker 数据：空间（名称）/ 模型（名称 · 型号）
const wsItems = computed(() => workspaces.value.map(w => ({ id: w.id, label: w.name || w.id })))
const pvItems = computed(() => providers.value.map(p => ({
  id: p.id, label: p.name || p.model, sub: p.model
})))
const wsName = computed(() => {
  const hit = wsItems.value.find(x => x.id === wsId.value)
  return hit ? hit.label : '选择空间'
})
const pvName = computed(() => {
  const hit = pvItems.value.find(x => x.id === providerId.value)
  return hit ? (hit.label || hit.sub) : '选择模型'
})

// 软键盘适配：#app 高度跟随 visualViewport（键盘上方区域），输入框贴键盘
// 正上方、浏览器不再上推页面（品牌区不随键盘变化，保持原样）
useKeyboard()

onMounted(() => {
  // 入口带参则预选（分组头 + 携带空间）
  wsId.value = String(route.query.ws || '')
  api('GET', '/api/workspaces').then(r => {
    if (!r || !r.ok) return
    workspaces.value = r.workspaces || []
    if (!wsId.value && workspaces.value.length) wsId.value = workspaces.value[0].id
  }).catch(() => {})
  api('GET', '/api/providers').then(r => {
    if (!r || !r.ok) return
    providers.value = r.providers || []
    if (r.defaultId && providers.value.some(x => x.id === r.defaultId)) providerId.value = r.defaultId
    else if (providers.value.length) providerId.value = providers.value[0].id
  }).catch(() => {})
})

function back() {
  if (window.history.length > 1) router.back()
  else router.replace('/tasks')
}

function submit(text) {
  if (submitting.value) return
  submitting.value = true
  api('POST', '/api/task', { text, workspaceId: wsId.value, providerId: providerId.value }).then(r => {
    if (r && r.ok) {
      router.replace({ name: 'task-detail', params: { id: r.sessionId }, query: { title: text.slice(0, 24) } })
    } else {
      ElMessage({ message: (r && r.error) || '发送失败', type: 'error', duration: 2500 })
    }
  }).catch(() => {
    ElMessage({ message: '网络错误，请重试', type: 'error', duration: 2500 })
  }).finally(() => { submitting.value = false })
}
</script>

<style>
/* flex:1 接通 #app 高度链：header 顶部固定、compose-body 占据中部、Composer 贴底 */
.page { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.compose-body { flex: 1; overflow-y: auto; padding: 8px 16px 16px; -webkit-overflow-scrolling: touch; }

/* 品牌区（不随键盘变化） */
.hero {
  display: flex; flex-direction: column; align-items: center;
  padding: 10vh 0 5vh;
}
.hero-logo { width: 64px; height: 64px; border-radius: 18px; box-shadow: 0 5px 18px rgba(51, 102, 255, .16); }
.hero-name { margin-top: 14px; font-size: 22px; font-weight: 700; letter-spacing: .8px; }
.hero-slogan {
  margin-top: 8px; display: flex; align-items: center; gap: 8px;
  font-size: 12.5px; color: var(--muted); letter-spacing: 1.5px;
}
.sdot { width: 4px; height: 4px; border-radius: 50%; background: var(--brand); }
</style>
