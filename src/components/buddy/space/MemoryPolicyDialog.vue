<template>
  <!-- 记忆策略弹窗：绑定工作空间后 / 空间页修改时选择
       global 继承全局记忆 / isolate 独立记忆目录 / clean 干净启动（不装载记忆） -->
  <el-dialog
    :model-value="visible"
    class="ob-mp-dialog"
    width="min(440px, 92vw)"
    append-to-body
    @update:model-value="v => !v && emit('close')"
  >
    <div class="ob-mp">
      <header class="ob-mp-head">
        <h3 class="ob-mp-title">记忆策略</h3>
        <span class="ob-mp-sub">{{ workspaceName || '工作空间' }}</span>
        <svg-icon icon-class="close" class="ob-mp-close" @click="emit('close')" />
      </header>

      <div class="ob-mp-body">
        <div
          v-for="opt in OPTIONS"
          :key="opt.value"
          class="ob-mp-item"
          :class="{ on: selected === opt.value }"
          @click="selected = opt.value"
        >
          <svg-icon :icon-class="opt.icon" class="ob-mp-ico" />
          <div class="ob-mp-info">
            <div class="ob-mp-name">{{ opt.label }}<span v-if="selected === opt.value" class="ob-mp-tag">当前选择</span></div>
            <p class="ob-mp-desc">{{ opt.desc }}</p>
          </div>
          <svg-icon v-if="selected === opt.value" icon-class="check" class="ob-mp-check" />
        </div>
      </div>

      <footer class="ob-mp-foot">
        <p class="ob-mp-tip">切换后已有对话将重建会话再继续；isolate 首次使用时自动创建独立记忆目录</p>
        <div class="ob-mp-btns">
          <el-button size="small" round @click="emit('close')">取消</el-button>
          <el-button size="small" round type="primary" :disabled="!selected" @click="apply">确定</el-button>
        </div>
      </footer>
    </div>
  </el-dialog>
</template>

<script setup>
// 记忆策略弹窗：三档策略选择（默认继承全局）
// 确定后调主进程 setWorkspaceMemoryPolicy（主进程内置销毁全部 pi 会话，新策略下次创建会话时生效）
import { ref, watch } from 'vue'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'MemoryPolicyDialog' })

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  workspaceId: {
    type: String,
    default: ''
  },
  workspaceName: {
    type: String,
    default: ''
  },
  // 当前策略（打开时回显选中，缺省 global）
  current: {
    type: String,
    default: 'global'
  }
})

const emit = defineEmits(['close', 'applied'])

const { message } = useFeedback()

const OPTIONS = [
  { value: 'global', icon: 'memory', label: '继承全局', desc: '与本机全局助手共用一份长期记忆（默认）' },
  { value: 'isolate', icon: 'fork', label: '独立记忆', desc: '此空间单独一份记忆目录，互不串扰' },
  { value: 'clean', icon: 'circle-close', label: '干净启动', desc: '不装载记忆扩展，每次对话从零开始' }
]

const selected = ref('global')

// 打开时回显当前策略
watch(() => props.visible, v => {
  if (v) selected.value = props.current || 'global'
})

async function apply() {
  const api = window.electronAPI && window.electronAPI.omnibuddy
  if (!api || !api.setWorkspaceMemoryPolicy || !props.workspaceId) return
  const res = await api.setWorkspaceMemoryPolicy({ id: props.workspaceId, policy: selected.value })
  if (res && res.ok) {
    emit('applied', selected.value)
    emit('close')
  } else {
    message.error((res && res.error) || '设置失败')
  }
}
</script>

<style lang="scss" scoped>
/* 弹窗圆角（class 落在 .el-dialog 上，与 FileChangesPanel 同款写法） */
:deep(.ob-mp-dialog) {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.22);
  background: var(--bg-primary, #fff);

  .el-dialog__header,
  .el-dialog__footer {
    display: none; /* 头/底部由自绘 ob-mp-head / ob-mp-foot 承载 */
  }

  .el-dialog__body {
    padding: 18px 20px;
  }
}

.ob-mp {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ob-mp-head {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  padding-right: 26px;
}

.ob-mp-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
}

.ob-mp-sub {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ob-mp-close {
  font-size: 20px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 2px;
  border-radius: 6px;
  transition: all 0.15s ease;

  &:hover {
    background: var(--search-bg);
    color: var(--text-primary);
  }
}

.ob-mp-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ob-mp-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.45);
  }

  &.on {
    border-color: rgba(var(--primary-color-rgb), 0.6);
    background: rgba(var(--primary-color-rgb), 0.06);
  }
}

.ob-mp-ico {
  font-size: 17px;
  color: var(--text-secondary);
  flex-shrink: 0;

  .ob-mp-item.on & {
    color: var(--primary-color);
  }
}

.ob-mp-info {
  flex: 1;
  min-width: 0;
}

.ob-mp-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
}

.ob-mp-tag {
  font-size: 10px;
  font-weight: 500;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  border-radius: 5px;
  padding: 0 6px;
  line-height: 1.6;
}

.ob-mp-desc {
  margin: 2px 0 0;
  font-size: 11.5px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.ob-mp-check {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-color);
  flex-shrink: 0;
}

.ob-mp-foot {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 12px;
}

.ob-mp-tip {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: var(--text-secondary);
}

.ob-mp-btns {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>
