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
      <!-- 执行中呼吸指示器：思考/工具阶段常驻（流式中回答自带打字光标，不重复显示） -->
      <div v-if="showPending" class="pending-line">
        <span class="pl-dots"><i></i><i></i><i></i></span>
        <span class="pl-text">{{ pendingText }}</span>
      </div>
    </div>
    <!-- 待回答条（Agent 中途提问，品牌蓝）：点击底部滑出问答抽屉 -->
    <div v-if="curAskUser" class="user-ask-bar" @click="openAskSheet">
      <span class="ico uask-ico" v-html="chatIcon"></span>
      <span class="uask-text">{{ curAskUser.question || '请回答 Agent 的提问' }}</span>
      <span v-if="pendingAskUsers.length > 1" class="uask-count">{{ pendingAskUsers.length }}</span>
      <span class="uask-go">去回答</span>
    </div>
    <!-- 待审批条（Composer 上方）：有人工审批请求时常驻，点击底部滑出审批抽屉 -->
    <div v-if="curAsk" class="ask-bar" @click="openSheet">
      <span class="ico ask-ico" v-html="lockIcon"></span>
      <span class="ask-text">{{ curAsk.brief || curAsk.surface || '操作' }}</span>
      <span v-if="pendingAsks.length > 1" class="ask-count">{{ pendingAsks.length }}</span>
      <span class="ask-go">去审批</span>
    </div>
    <!-- 底部追问输入框：空间锁定展示 + 模型可切换，运行中禁用（按钮变停止键） -->
    <Composer
      :placeholder="running ? '任务执行中…' : '继续追问…'"
      :disabled="running || sending"
      :running="running"
      @send="onSend"
      @stop="onStop"
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
    <!-- 人工审批抽屉（四档决策，与 PC 端权限浮动条同构） -->
    <PermissionSheet ref="permSheetRef" :ask="curAsk" :queue="pendingAsks.length" @decide="onDecide" />
    <!-- ask_user 问答抽屉（单选即点即交 / 多选统一提交 / 其它自由输入） -->
    <AskSheet ref="askSheetRef" :ask="curAskUser" :queue="pendingAskUsers.length" @answer="onAnswerAsk" />
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
import PermissionSheet from '../components/PermissionSheet.vue'
import AskSheet from '../components/AskSheet.vue'
import { store, setSseHandler } from '../store'
import { useTimeline } from '../composables/useTimeline'
import { useKeyboard } from '../composables/useKeyboard'
import api from '../api'
import documentIcon from '@/assets/icons/svg/buddy/document.svg?raw'
import lockIcon from '@/assets/icons/svg/buddy/lock.svg?raw'
import chatIcon from '@/assets/icons/svg/buddy/chat-dot-round.svg?raw'

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

// 呼吸指示器：运行中且非流式回答阶段（thinking / tool）显示，证明任务仍在执行
const showPending = computed(() => running && !!timeline.phase.value && timeline.phase.value !== 'streaming')
const pendingText = computed(() => timeline.phase.value === 'tool' ? '执行中' : '思考中')

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

// 停止执行：中断当前会话（服务端 interrupted 事件 → 终态 → 按钮自动复原）
function onStop() {
  api('POST', '/api/interrupt', { sessionId: route.params.id }).then(r => {
    if (r && r.ok && r.idle) ElMessage({ message: '当前没有正在执行的任务', duration: 1500 })
    else ElMessage({ message: '正在停止…', duration: 1500 })
  }).catch(() => {
    ElMessage({ message: '网络错误', type: 'error', duration: 2200 })
  })
}

// ===== 人工审批（命令审批）：pendingPermissions 收集 / 同步 / 决策 =====
const pendingAsks = ref([])
const permSheetRef = ref(null)
const curAsk = computed(() => pendingAsks.value[0] || null)

function openSheet() {
  if (permSheetRef.value) permSheetRef.value.sheet = true
}

// SSE 收集（含 ui- 前缀的 select 兜底路径，移动端可应答）；done 移除
function collectAsk(ev) {
  const askId = String(ev.askId || '')
  if (!askId) return
  if (pendingAsks.value.some(a => a.askId === askId)) return
  pendingAsks.value.push({
    askId, surface: ev.surface || ev.toolName || '', toolName: ev.toolName || '', brief: ev.brief || ''
  })
}
function removeAsk(askId) {
  pendingAsks.value = pendingAsks.value.filter(a => a.askId !== askId)
}

// 决策提交：与 PC 端 omnibuddy:permission:reply 同一服务端通道（action 白名单一致）
function onDecide(action) {
  const a = curAsk.value
  if (!a) return
  api('POST', '/api/permission', { askId: a.askId, sessionId: route.params.id, action }).then(r => {
    if (!r || !r.ok) {
      ElMessage({ message: (r && r.error) || '提交失败', type: 'error', duration: 2200 })
      return
    }
    removeAsk(a.askId)
    ElMessage({ message: action === 'deny' ? '已拒绝' : '已允许', type: 'success', duration: 1500 })
  }).catch(() => {
    ElMessage({ message: '网络错误', type: 'error', duration: 2200 })
  })
}

// ===== ask_user 问答：pendingAsks 收集 / 同步 / 应答 =====
const pendingAskUsers = ref([])
const askSheetRef = ref(null)
const curAskUser = computed(() => pendingAskUsers.value[0] || null)

function openAskSheet() {
  if (askSheetRef.value) askSheetRef.value.sheet = true
}

function collectAskUser(ev) {
  const callId = String(ev.callId || '')
  if (!callId) return
  if (pendingAskUsers.value.some(a => a.callId === callId)) return
  pendingAskUsers.value.push({
    callId, question: ev.question || '', options: ev.options || [], multiSelect: !!ev.multiSelect
  })
}
function removeAskUser(callId) {
  pendingAskUsers.value = pendingAskUsers.value.filter(a => a.callId !== callId)
}

// 回答提交：与 PC 端 omnibuddy:ask-user:reply 同一服务端通道
function onAnswerAsk(value) {
  const a = curAskUser.value
  if (!a) return
  api('POST', '/api/ask', { callId: a.callId, sessionId: route.params.id, value }).then(r => {
    if (!r || !r.ok) {
      ElMessage({ message: (r && r.error) || '提交失败', type: 'error', duration: 2200 })
      return
    }
    removeAskUser(a.callId)
    ElMessage({ message: '已提交', type: 'success', duration: 1500 })
  }).catch(() => {
    ElMessage({ message: '网络错误', type: 'error', duration: 2200 })
  })
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
  // 注册为当前 SSE 消费者（仅消费本任务事件；审批/问答事件额外收集进待处理队列）
  setSseHandler(ev => {
    if (ev.sessionId !== route.params.id) return
    if (ev.type === 'permission_ask') collectAsk(ev)
    else if (ev.type === 'permission_done') removeAsk(String(ev.askId || ''))
    else if (ev.type === 'ask_user') collectAskUser(ev)
    else if (ev.type === 'ask_done') removeAskUser(String(ev.callId || ''))
    timeline.handleEvent(ev, onTick, null)
  })
  loading.value = true
  api('GET', '/api/session?id=' + encodeURIComponent(route.params.id)).then(r => {
    if (!r || !r.ok) return
    timeline.loadItems(r.items || [])
    if (r.workspaceName) workspaceName.value = String(r.workspaceName)
    // 运行态恢复（页面刷新后 store 丢失）：执行中 → 输入框禁用 + 呼吸指示器就位
    if (r.running) store.runningId = String(route.params.id)
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
  // 未决审批同步（页面刷新 / PC 先弹卡的场景）：服务端快照按会话过滤
  api('GET', '/api/permission/pending').then(r => {
    if (!r || !r.ok) return
    pendingAsks.value = (r.asks || [])
      .filter(a => a.sessionId === route.params.id)
      .map(a => ({ askId: a.askId, surface: a.surface || a.toolName || '', toolName: a.toolName || '', brief: a.brief || '' }))
  }).catch(() => {})
  // 未决问答同步（页面刷新 / 切页重进 / PC 先弹卡的场景）
  api('GET', '/api/ask/pending').then(r => {
    if (!r || !r.ok) return
    pendingAskUsers.value = (r.asks || [])
      .filter(a => a.sessionId === route.params.id)
      .map(a => ({ callId: a.callId, question: a.question || '', options: a.options || [], multiSelect: !!a.multiSelect }))
    // 时间线补插等待条目：未回答的提问只在应答后才落盘（回放里没有），
    // 补上后时间线与待答条一致，ask_done 到达时也能原地更新为「已回答」
    for (const a of pendingAskUsers.value) {
      if (!a.callId) continue
      const dup = timeline.msgs.value.some(m => m.kind === 'warn' && m.callId === a.callId)
      if (!dup) timeline.msgs.value.push({ kind: 'warn', ic: 'chat', callId: a.callId, text: a.question || '', sub: '等待回答' })
    }
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

/* 执行中呼吸指示器：三点波浪起伏（思考中 / 执行中） */
.pending-line { display: flex; align-items: center; gap: 9px; margin: 16px 0 6px; }
.pl-dots { display: flex; gap: 4px; }
.pl-dots i {
  width: 6px; height: 6px; border-radius: 50%; background: var(--brand);
  animation: pl-bounce 1.2s ease-in-out infinite;
}
.pl-dots i:nth-child(2) { animation-delay: .15s; }
.pl-dots i:nth-child(3) { animation-delay: .3s; }
@keyframes pl-bounce {
  0%, 60%, 100% { opacity: .25; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-3px); }
}
.pl-text { font-size: 13px; color: var(--muted); }

/* 待审批条（贴输入框上方，琥珀警示）：点击滑出审批抽屉 */
.ask-bar {
  flex: none; margin: 0 14px; padding: 10px 12px;
  display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;
  background: var(--warn-bg); border-radius: 12px;
}
.ask-ico { flex: none; color: var(--amber); }
.ask-ico svg { width: 15px; height: 15px; fill: currentColor; }
.ask-text {
  flex: 1; min-width: 0; font-size: 13px; color: var(--amber);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ask-count {
  flex: none; font-size: 11px; color: var(--amber);
  background: rgba(0,0,0,.06); border-radius: 999px; padding: 1px 7px;
}
.ask-go { flex: none; font-size: 12.5px; font-weight: 600; color: var(--amber); }
.ask-bar:active { opacity: .75; }
/* 审批条与输入框间距（无审批条时 Composer 贴滚动区） */
.ask-bar + .composer { padding-top: 10px; }

/* 待回答条（Agent 中途提问，品牌蓝）：点击滑出问答抽屉 */
.user-ask-bar {
  flex: none; margin: 0 14px 8px; padding: 10px 12px;
  display: flex; align-items: center; gap: 8px; cursor: pointer; user-select: none;
  background: color-mix(in srgb, var(--brand) 10%, transparent); border-radius: 12px;
}
.uask-ico { flex: none; color: var(--brand); }
.uask-ico svg { width: 15px; height: 15px; fill: currentColor; }
.uask-text {
  flex: 1; min-width: 0; font-size: 13px; color: var(--brand);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.uask-count {
  flex: none; font-size: 11px; color: var(--brand);
  background: color-mix(in srgb, var(--brand) 16%, transparent); border-radius: 999px; padding: 1px 7px;
}
.uask-go { flex: none; font-size: 12.5px; font-weight: 600; color: var(--brand); }
.user-ask-bar:active { opacity: .75; }
</style>
