<template>
  <!-- 任务详情页（/task/:id）：执行时间线（运行中实时刷新） -->
  <div class="page">
    <AppHeader
      view="detail" :title="title" :conn-on="store.connOn"
      :running="running" @back="back"
    />
    <div class="detail-scroll" ref="scrollEl">
      <!-- 加载骨架（el-skeleton：任务气泡 + 过程条 + 正文行形态） -->
      <el-skeleton v-if="loading && !timeline.msgs.value.length" animated class="sk-detail">
        <template #template>
          <el-skeleton-item variant="text" style="height: 46px; width: 62%; margin: 0 0 22px auto; border-radius: 16px 16px 5px 16px; display: block" />
          <el-skeleton-item variant="text" style="height: 46px; margin-bottom: 22px; border-radius: 14px" />
          <el-skeleton-item variant="text" style="width: 92%; height: 14px; margin: 14px 0" />
          <el-skeleton-item variant="text" style="width: 78%; height: 14px; margin: 14px 0" />
          <el-skeleton-item variant="text" style="width: 85%; height: 14px; margin: 14px 0" />
        </template>
      </el-skeleton>
      <el-empty
        v-else-if="!timeline.msgs.value.length"
        :image-size="64"
        description="该任务暂无执行记录"
      >
        <template #image>
          <span class="ico empty-ico" v-html="documentIcon"></span>
        </template>
      </el-empty>
      <MessageItem
        v-for="(m, i) in timeline.msgs.value" :key="i"
        :item="m" :running="running"
      />
    </div>
    <!-- 底部追问输入框：空间锁定展示 + 模型可切换，运行中禁用 -->
    <Composer
      :placeholder="running ? '任务执行中…' : '继续追问…'"
      :disabled="running || sending"
      @send="onSend"
    >
      <template #tools>
        <ComposerPicker
          icon="folder" :label="workspaceName || '未关联空间'"
          title="工作空间" :disabled="true"
          :tip="'会话已绑定此工作空间，新建任务可切换'"
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
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ElMessage } from 'element-plus'
import AppHeader from '../components/AppHeader.vue'
import MessageItem from '../components/MessageItem.vue'
import Composer from '../components/Composer.vue'
import ComposerPicker from '../components/ComposerPicker.vue'
import { store, setSseHandler } from '../store'
import { useTimeline } from '../composables/useTimeline'
import { useKeyboard } from '../composables/useKeyboard'
import api from '../api'
import documentIcon from '@/assets/icons/svg/buddy/document.svg?raw'

const route = useRoute()
const router = useRouter()

const title = ref(String(route.query.title || ''))
const loading = ref(false)
const scrollEl = ref(null)
const timeline = useTimeline()

// 软键盘适配：#app 高度跟随 visualViewport，追问框贴键盘正上方；
// 键盘弹出/收起引起消息区高度变化时保持滚底
const { kbOpen } = useKeyboard()
watch(kbOpen, () => scrollBottom())

// 运行态：全局运行中的会话即本任务（remote_state / 终态事件驱动）
const running = computed(() => !!store.runningId && store.runningId === route.params.id)
const sending = ref(false)

// 追问模型选择：空间随会话锁定展示；模型默认取全局默认，可切换
const providers = ref([])
const providerId = ref('')
const pvItems = computed(() => providers.value.map(p => ({
  id: p.id, label: p.name || p.model, sub: p.model
})))
const pvName = computed(() => {
  const hit = pvItems.value.find(x => x.id === providerId.value)
  return hit ? (hit.label || hit.sub) : '选择模型'
})
const workspaceName = ref('')

// 追问：/api/task 带 sessionId 走 followup 分支；追问气泡与回答由事件流自动渲染
function onSend(text) {
  sending.value = true
  api('POST', '/api/task', { sessionId: route.params.id, text, providerId: providerId.value }).then(r => {
    if (!r || !r.ok) {
      ElMessage({ message: (r && r.error) || '发送失败', type: 'error', duration: 2500 })
    } else {
      // 乐观置运行态（remote_state 广播随到覆盖），输入框立即禁用
      store.runningId = String(route.params.id)
      scrollBottom()
    }
  }).catch(() => {
    ElMessage({ message: '网络错误', type: 'error', duration: 2500 })
  }).finally(() => { sending.value = false })
}

function nearBottom() {
  const el = scrollEl.value
  return !el || el.scrollHeight - el.scrollTop - el.clientHeight < 140
}

function onTick() {
  if (nearBottom()) scrollBottom()
}

function scrollBottom() {
  nextTick(() => {
    const el = scrollEl.value
    if (el) el.scrollTop = el.scrollHeight
  })
}

function back() {
  if (window.history.length > 1) router.back()
  else router.replace('/tasks')
}

onMounted(() => {
  // 注册为当前 SSE 消费者（仅消费本任务事件）
  setSseHandler(ev => {
    if (ev.sessionId === route.params.id) timeline.handleEvent(ev, onTick, null)
  })
  loading.value = true
  api('GET', '/api/session?id=' + encodeURIComponent(route.params.id)).then(r => {
    if (!r || !r.ok) return
    timeline.loadItems(r.items || [])
    if (r.workspaceName) workspaceName.value = String(r.workspaceName)
    if (!title.value) {
      // 无标题参数时从任务行数据兜底（回退为会话 id 短显示）
      title.value = '任务 ' + String(route.params.id).slice(0, 8)
    }
    scrollBottom()
  }).catch(() => {}).finally(() => { loading.value = false })
  // 模型清单（追问切换用）：默认选中全局默认模型
  api('GET', '/api/providers').then(r => {
    if (!r || !r.ok) return
    providers.value = r.providers || []
    if (r.defaultId && providers.value.some(x => x.id === r.defaultId)) providerId.value = r.defaultId
    else if (providers.value.length) providerId.value = providers.value[0].id
  }).catch(() => {})
})

onUnmounted(() => {
  setSseHandler(null)
})
</script>

<style>
/* flex:1 接通 #app 高度链：header 顶部固定、detail-scroll 中部滚动、Composer 贴底 */
.page { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.detail-scroll { flex: 1; overflow-y: auto; overflow-x: hidden; min-width: 0; padding: 14px 16px 28px; -webkit-overflow-scrolling: touch; }
.empty-ico { color: var(--muted); opacity: .5; }
.empty-ico svg { width: 52px; height: 52px; }
.sk-detail { padding-top: 6px; }
</style>
