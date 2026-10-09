<template>
  <!-- 深度研究任务进度面板：workflow 工具启动的多代理运行实时状态
       数据源为 tool item 的 workflow 字段（后台 runId + 轮询 progress / 前台 snapshot），
       实时更新由 store 的 workflow_progress 事件直接写入（面板天然响应）；
       历史会话回放时无 progress → 经 IPC 拉取最终状态补全卡片 -->
  <div v-if="cards.length" class="ob-wfp">
    <div v-for="c in cards" :key="c.runId" class="ob-wf-card">
      <!-- 头行：任务图标 + 名称 + 状态徽章 -->
      <div class="ob-wf-head">
        <svg-icon icon-class="sparkle" class="ob-wf-ico" />
        <span class="ob-wf-name" :title="c.name">{{ c.name }}</span>
        <span class="ob-wf-badge" :class="c.badge.cls">
          <svg-icon v-if="c.badge.icon" :icon-class="c.badge.icon" :class="{ spin: c.status === 'running' }" />
          {{ c.badge.text }}
        </span>
      </div>

      <!-- 进度条 + 完成计数（有代理任务时呈现） -->
      <div v-if="c.total" class="ob-wf-progress">
        <div class="ob-wf-bar">
          <span class="ob-wf-fill" :class="c.badge.cls" :style="{ width: c.percent + '%' }"></span>
        </div>
        <span class="ob-wf-count">{{ c.done }}/{{ c.total }}</span>
      </div>

      <!-- 当前阶段 -->
      <div v-if="c.phase" class="ob-wf-line">
        <span class="ob-wf-k">阶段</span>{{ c.phase }}
      </div>

      <!-- 运行中的子任务（脉冲圆点 + 标签） -->
      <div v-if="c.activeLabels.length" class="ob-wf-agents">
        <span v-for="label in c.activeLabels" :key="label" class="ob-wf-agent" :title="label">
          <i></i>{{ label }}
        </span>
      </div>

      <!-- 计数行（完成 / 运行中 / 排队 / 失败） -->
      <div v-if="c.total" class="ob-wf-counts">
        <span>完成 {{ c.counts.done }}</span>
        <span v-if="c.counts.running">运行中 {{ c.counts.running }}</span>
        <span v-if="c.counts.queued">排队 {{ c.counts.queued }}</span>
        <span v-if="c.counts.skipped">跳过 {{ c.counts.skipped }}</span>
        <span v-if="c.counts.error" class="err">失败 {{ c.counts.error }}</span>
      </div>

      <!-- 底部 meta：token 用量 · 用时 -->
      <div v-if="c.metaText" class="ob-wf-meta">{{ c.metaText }}</div>

      <!-- 终态 / 异常 / 等待提示 -->
      <div v-if="c.hint" class="ob-wf-hint" :class="{ err: c.status === 'failed' }">{{ c.hint }}</div>
    </div>
  </div>
</template>

<script setup>
// 深度研究进度卡片面板（消息级）：消费 tool item 的 workflow 对象
//   { runId, background, snapshot?, progress? }
// - 实时：主进程 1s 轮询 run 落盘状态 → workflow_progress 事件 → store 写 progress
// - 历史：无 progress 的条目（后台运行的历史记录）mounted 时经 IPC 拉取最终状态回填
import { computed, watch, onMounted } from 'vue'
import { buddyApi } from '@/utils/buddy/buddy-api'

// 内置任务名 → 中文名（净化文案，不向用户暴露英文模式名）
const NAME_MAP = {
  'deep-research': '深度研究',
  'code-review': '代码审查',
  'adversarial-review': '对抗审查',
  'multi-perspective': '多视角分析',
  'codebase-audit': '代码库审计'
}

// 状态 → 徽章（文案 / 图标 / 色调）
const BADGE_MAP = {
  running: { text: '运行中', icon: 'loading', cls: 'run' },
  waiting: { text: '等待确认', icon: 'clock', cls: 'pause' },
  paused: { text: '已暂停', icon: 'video-pause', cls: 'pause' },
  completed: { text: '已完成', icon: 'check', cls: 'done' },
  failed: { text: '失败', icon: 'warning-outline', cls: 'fail' },
  aborted: { text: '已中止', icon: 'stop', cls: 'abort' },
  stopped: { text: '已中止', icon: 'stop', cls: 'abort' },
  missing: { text: '已结束', icon: 'clock', cls: 'abort' }
}

defineOptions({ name: 'WorkflowPanel' })

const props = defineProps({
  // workflow 对象数组（tool item 的 workflow 字段，store 内对象引用，可回写 progress）
  workflows: {
    type: Array,
    default: () => []
  },
  // 所属会话 id（历史回放 IPC 拉取定位运行记录）
  sessionId: {
    type: String,
    default: ''
  }
})

// 已尝试拉取的 runId（避免 watch 重入反复请求；非渲染态无需响应式）
const fetched = {}

// 卡片视图模型：progress（实时/回放）> snapshot（前台快照）> 缺省 running
const cards = computed(() => {
  return props.workflows
    .filter(wf => wf && wf.runId)
    .map(wf => {
      const p = wf.progress || wf.snapshot || { runId: wf.runId, status: 'running', counts: {} }
      const status = p.status || 'running'
      const counts = p.counts || {}
      const total = counts.total || 0
      const done = counts.done || 0
      const error = counts.error || 0
      const skipped = counts.skipped || 0
      // 完成度：已结束的代理（完成/失败/跳过）占比，运行中也按完成一半折算让进度条有动感
      const finished = done + error + skipped
      const runningHalf = (counts.running || 0) * 0.5
      const percent = total
        ? Math.min(100, Math.max(0, Math.round(((finished + runningHalf) / total) * 100)))
        : 0
      const parts = []
      const tokens = tokensOf(p)
      if (tokens) parts.push(tokens)
      const dur = durationOf(p, status)
      if (dur) parts.push(dur)
      return {
        runId: wf.runId,
        name: NAME_MAP[p.name] || p.name || '深度研究任务',
        status,
        badge: BADGE_MAP[status] || BADGE_MAP.running,
        total,
        done,
        counts,
        percent,
        phase: p.currentPhase || '',
        activeLabels: Array.isArray(p.activeLabels) ? p.activeLabels : [],
        metaText: parts.join(' · '),
        hint: hintOf(p, status)
      }
    })
})

// 历史加载完成（messages 整体替换）或新增 workflow 条目时触发回放补全
watch(() => props.workflows, () => {
  hydrate()
})

onMounted(() => {
  hydrate()
})

// 历史回放：无 progress / snapshot 的后台运行条目经 IPC 拉取最终状态
async function hydrate() {
  const api = buddyApi()
  if (!api || !api.workflowStatus || !props.sessionId) return
  for (const wf of props.workflows) {
    if (!wf || !wf.runId || wf.progress || wf.snapshot) continue
    if (fetched[wf.runId]) continue
    fetched[wf.runId] = true
    try {
      const res = await api.workflowStatus({ runId: wf.runId, chatId: props.sessionId })
      if (res && res.ok && res.workflow) {
        wf.progress = res.workflow
      } else {
        // 运行记录不存在（已清理/跨设备）：中性「已结束」态，不报错打扰
        wf.progress = { runId: wf.runId, status: 'missing', counts: {} }
      }
    } catch (e) { /* 拉取失败保持静默，卡片按缺省运行中渲染 */ }
  }
}

// 状态提示行（终态结果指引 / 失败原因 / 等待说明）
function hintOf(p, status) {
  if (status === 'completed') return '任务完成，结果已回注对话'
  if (status === 'failed') return p.error || '任务执行失败'
  if (status === 'aborted' || status === 'stopped') return '任务已中止'
  if (status === 'waiting') return '已在关键节点暂停，等待模型确认后继续'
  if (status === 'paused') return p.pauseReason ? '已暂停：' + p.pauseReason : '任务已暂停'
  if (status === 'missing') return '运行记录已过期，结果见对话内容'
  return ''
}

// token 用量（合计缩写）
function tokensOf(p) {
  const u = p.tokenUsage || {}
  const total = u.total || ((u.input || 0) + (u.output || 0))
  if (!total) return ''
  return fmtTokens(total) + ' tokens'
}

// 用时：终态取 durationMs；运行中按 startedAt 实时推算（progress 每 1s 刷新自然走表）
function durationOf(p, status) {
  let ms = p.durationMs
  if (!ms && p.startedAt && (status === 'running' || status === 'waiting')) {
    const t = Date.parse(p.startedAt)
    if (!isNaN(t)) ms = Date.now() - t
  }
  if (!ms || ms < 0) return ''
  return fmtDuration(ms)
}

function fmtTokens(n) {
  const v = Number(n) || 0
  return v >= 10000 ? (v / 1000).toFixed(1) + 'k' : String(v)
}

function fmtDuration(ms) {
  const v = Math.max(1, Math.round(ms / 1000))
  if (v < 60) return v + ' 秒'
  const m = Math.floor(v / 60)
  const s = v % 60
  if (m < 60) return s ? m + ' 分 ' + s + ' 秒' : m + ' 分钟'
  return Math.floor(m / 60) + ' 小时 ' + (m % 60) + ' 分'
}
</script>

<style lang="scss" scoped>
/* 面板：卡片纵向平铺（正文末尾，与产物/文件变更面板同区域），撑满气泡宽度 */
.ob-wfp {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  margin: 4px 0 8px;
  user-select: none;
}

/* 任务卡片：圆角面板（macOS 设置风），左侧状态色条呼应进行感 */
.ob-wf-card {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg, #fff);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.45);
    box-shadow: 0 1px 8px rgba(var(--primary-color-rgb), 0.08);
  }
}

/* 头行：图标 + 名称 + 状态徽章 */
.ob-wf-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ob-wf-ico {
  flex-shrink: 0;
  font-size: 14px;
  color: var(--primary-color);
}

.ob-wf-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

/* 状态徽章（色调随状态：蓝运行 / 琥珀等待 / 绿完成 / 红失败 / 灰中止） */
.ob-wf-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;

  .svg-icon {
    font-size: 11px;

    &.spin {
      animation: ob-wf-spin 1s linear infinite;
    }
  }

  &.run {
    color: #0284C7;
    background: rgba(2, 132, 199, 0.12);
  }

  &.pause {
    color: #D97706;
    background: rgba(217, 119, 6, 0.12);
  }

  &.done {
    color: var(--success-color);
    background: rgba(var(--success-color-rgb),  0.12);
  }

  &.fail {
    color: var(--danger-color);
    background: rgba(var(--danger-color-rgb),  0.12);
  }

  &.abort {
    color: var(--text-secondary);
    background: rgba(125, 125, 135, 0.1);
  }
}

@keyframes ob-wf-spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* 进度条 + 完成计数 */
.ob-wf-progress {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ob-wf-bar {
  flex: 1;
  height: 5px;
  border-radius: 999px;
  background: rgba(125, 125, 135, 0.14);
  overflow: hidden;
}

.ob-wf-fill {
  display: block;
  height: 100%;
  border-radius: 999px;
  transition: width 0.6s ease;

  &.run { background: linear-gradient(90deg, #0EA5E9, #0284C7); }
  &.pause { background: #D97706; }
  &.done { background: var(--success-color); }
  &.fail { background: var(--danger-color); }
  &.abort { background: var(--text-secondary); }
}

.ob-wf-count {
  flex-shrink: 0;
  font-size: 11px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: var(--text-secondary);
}

/* 当前阶段行 */
.ob-wf-line {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  font-size: 12px;
  color: var(--text-primary);

  .ob-wf-k {
    flex-shrink: 0;
    font-size: 10.5px;
    color: var(--text-secondary);
    background: var(--search-bg);
    border-radius: 4px;
    padding: 1px 6px;
  }
}

/* 运行中子任务标签（脉冲圆点） */
.ob-wf-agents {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.ob-wf-agent {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid rgba(2, 132, 199, 0.25);
  background: rgba(2, 132, 199, 0.06);
  font-size: 11px;
  color: var(--text-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;

  i {
    flex-shrink: 0;
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #0284C7;
    animation: ob-wf-pulse 1.6s ease-in-out infinite;
  }
}

@keyframes ob-wf-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.35; transform: scale(0.8); }
}

/* 计数行 */
.ob-wf-counts {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  font-size: 11.5px;
  color: var(--text-secondary);

  .err {
    color: var(--danger-color);
    font-weight: 600;
  }
}

/* 底部 meta（token · 用时） */
.ob-wf-meta {
  font-size: 11px;
  color: var(--text-secondary);
}

/* 终态 / 异常提示行 */
.ob-wf-hint {
  padding: 5px 10px;
  border-radius: 7px;
  background: rgba(var(--success-color-rgb),  0.07);
  font-size: 11.5px;
  color: #047857;

  &.err {
    background: rgba(var(--danger-color-rgb),  0.07);
    color: #B91C1C;
    word-break: break-all;
  }
}
</style>
