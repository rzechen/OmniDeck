<template>
  <!-- 检查点抽屉（N4）：写操作前自动快照，时间线倒序 + 一键回滚 -->
  <el-drawer
    :model-value="visible"
    title="检查点"
    size="360px"
    append-to-body
    @update:model-value="v => emit('update:visible', v)"
  >
    <div v-loading="cpLoading" class="ob-cp-list">
      <div v-if="!cpLoading && !checkpoints.length" class="ob-cp-empty">
        暂无检查点<br />Agent 执行写操作（写文件/编辑等）前会自动创建快照
      </div>
      <el-timeline v-else>
        <el-timeline-item
          v-for="cp in checkpoints"
          :key="cp.n"
          :timestamp="cpTime(cp)"
          :type="cp.missing ? 'warning' : 'primary'"
          placement="top"
        >
          <div class="ob-cp-item">
            <div class="ob-cp-main">
              <span class="ob-cp-tool">#{{ cp.n }} · {{ cpToolName(cp.tool) }}</span>
              <span v-if="cp.missing" class="ob-cp-missing">快照已丢失</span>
            </div>
            <el-button
              size="small"
              link
              class="ob-cp-rollback"
              :disabled="cp.missing || rollingBack === cp.n"
              :loading="rollingBack === cp.n"
              @click="rollbackTo(cp)"
            >回滚到此</el-button>
          </div>
        </el-timeline-item>
      </el-timeline>
    </div>
    <div class="ob-cp-tip">回滚将恢复快照时的工作空间文件，并截断之后的对话记录；回滚前会自动再做一次快照，可再回滚回来。</div>
  </el-drawer>
</template>

<script setup>
// OmniBuddy 检查点抽屉（自治组件）：内部加载检查点时间线并执行回滚，
// 回滚成功后 emit('rolled-back') 通知页面刷新消息
import { ref, watch } from 'vue'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'CheckpointDrawer' })

const props = defineProps({
  // 抽屉开关（页面通过 v-model:visible 控制）
  visible: {
    type: Boolean,
    default: false
  },
  // 当前会话 ID
  sessionId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:visible', 'rolled-back'])

const { message, confirm } = useFeedback()

const cpLoading = ref(false)
const checkpoints = ref([])
const rollingBack = ref(0)

// 打开抽屉即加载检查点列表
watch(() => props.visible, (val) => {
  if (val && props.sessionId) loadCheckpoints()
})

async function loadCheckpoints() {
  if (!props.sessionId) return
  cpLoading.value = true
  try {
    const api = buddyApi()
    // Web 端无 IPC 桥：与页面原 stub 降级一致，返回空列表
    const res = api
      ? await api.listCheckpoints(props.sessionId)
      : { ok: true, items: [] }
    checkpoints.value = (res && res.items) || []
  } finally {
    cpLoading.value = false
  }
}

function rollbackTo(cp) {
  confirm(
    '将恢复到检查点 #' + cp.n + '：工作空间文件回退到快照状态，之后的对话记录将被截断。继续吗？',
    '回滚到检查点',
    { confirmButtonText: '回滚', cancelButtonText: '取消', type: 'warning' }
  ).then(async () => {
    rollingBack.value = cp.n
    try {
      const api = buddyApi()
      // Web 端无 IPC 桥：与页面原 stub 降级一致，提示需要桌面端
      const res = api
        ? await api.rollbackCheckpoint({ id: props.sessionId, n: cp.n })
        : { ok: false, error: '检查点需要 OmniDeck 桌面端' }
      if (res && res.ok) {
        // 主进程会广播 rolled_back 事件统一刷新，这里兜底关闭抽屉并通知页面
        emit('update:visible', false)
        emit('rolled-back')
      } else {
        message.error((res && res.error) || '回滚失败')
      }
    } finally {
      rollingBack.value = 0
    }
  }).catch(() => {})
}

function cpTime(cp) {
  const d = new Date(cp.createdAt)
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function cpToolName(tool) {
  const map = { write: '写文件', edit: '编辑', multi_edit: '批量编辑', mkdir: '建目录', delete: '删除', rollback: '回滚前备份' }
  return map[tool] || tool
}

// 页面层经模板 ref 调用（消费 notice 后刷新检查点列表）
defineExpose({ loadCheckpoints })
</script>
