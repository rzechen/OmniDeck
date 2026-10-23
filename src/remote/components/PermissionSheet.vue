<template>
  <!-- 权限确认抽屉（对齐 PC 权限浮动条）：问题 + 授权内容 + 四档编号选项 -->
  <el-drawer
    v-model="sheet"
    direction="btt"
    size="auto"
    :with-header="false"
    class="perm-drawer"
  >
    <div class="perm-head">
      <span class="ico perm-ico" v-html="lockIcon"></span>
      <div class="perm-q">{{ permQuestion }}</div>
      <span v-if="ask && ask.surface" class="perm-surface">{{ ask.surface }}</span>
      <span v-if="queue > 1" class="perm-queue">还有 {{ queue - 1 }} 项待确认</span>
      <button class="perm-close" title="关闭" @click="sheet = false">
        <span class="ico" v-html="closeIcon"></span>
      </button>
    </div>

    <pre v-if="ask && ask.brief" class="perm-code">{{ ask.brief }}</pre>

    <div class="perm-actions">
      <button class="perm-btn" @click="decide('allow')">
        <span class="pb-no">1</span>
        <span class="pb-label">仅本次运行</span>
        <span class="pb-desc">只执行这一次</span>
      </button>
      <button class="perm-btn" @click="decide('allow_session')">
        <span class="pb-no">2</span>
        <span class="pb-label">本次会话允许</span>
        <span class="pb-desc">当前会话内不再询问</span>
      </button>
      <button class="perm-btn" @click="decide('allow_always')">
        <span class="pb-no">3</span>
        <span class="pb-label">始终允许</span>
        <span class="pb-desc">写入权限策略，永久生效</span>
      </button>
      <button class="perm-btn deny" @click="decide('deny')">
        <span class="pb-no">4</span>
        <span class="pb-label">拒绝执行</span>
        <span class="pb-desc">阻止本次操作</span>
      </button>
    </div>
  </el-drawer>
</template>

<script setup>
// 人工审批底部抽屉：决策经 decide 事件上抛，提交与队列管理由详情页承接
import { ref, computed, watch, onUnmounted } from 'vue'
import lockIcon from '@/assets/icons/svg/buddy/lock.svg?raw'
import closeIcon from '@/assets/icons/svg/buddy/close.svg?raw'

const props = defineProps({
  ask: { type: Object, default: null },     // 当前待审批项 {askId, surface, brief}
  queue: { type: Number, default: 1 }       // 待审批队列长度（>1 显示剩余数）
})
const emit = defineEmits(['decide'])

const sheet = ref(false)

defineExpose({ sheet })

// 权限确认问题文案（按工具面区分场景，与 PC 端 chat/index.vue 同源）
const permQuestion = computed(() => {
  const s = (props.ask && props.ask.surface) || ''
  if (['bash', 'python', 'node', 'curl'].indexOf(s) >= 0) return '是否允许运行这个命令？'
  if (['write', 'edit', 'multi_edit', 'append', 'mkdir'].indexOf(s) >= 0) return '是否允许修改这个文件？'
  if (s === 'external_directory' || s === 'external_directory_read' || s === 'external_directory_write') {
    return s === 'external_directory_write' ? '是否允许写入工作空间外的路径？' : '是否允许访问工作空间外的路径？'
  }
  if (s === 'network') return '是否允许沙箱内命令访问该网络地址？'
  return '是否允许执行此操作？'
})

// 抽屉开合：冻结/解冻主页面滚动容器（配合 overscroll-behavior 防滚动穿透）
watch(sheet, v => {
  const el = document.getElementById('app')
  if (el) el.classList.toggle('sheet-open', v)
})
onUnmounted(() => {
  const el = document.getElementById('app')
  if (el) el.classList.remove('sheet-open')
})

function decide(action) {
  sheet.value = false
  emit('decide', action)
}
</script>

<style>
.perm-drawer { border-radius: 18px 18px 0 0 !important; overflow: hidden; max-width: 100vw; }
.perm-drawer .el-drawer__body {
  padding: 0 16px calc(14px + env(safe-area-inset-bottom)) !important;
  display: flex; flex-direction: column; overflow: visible;
}
.perm-head {
  flex: none; display: flex; align-items: center; gap: 9px;
  padding: 14px 0 10px; border-bottom: 1px solid var(--line);
}
.perm-ico { flex: none; color: var(--amber); }
.perm-ico svg { width: 18px; height: 18px; fill: currentColor; }
.perm-q { flex: 1; min-width: 0; font-size: 15px; font-weight: 650; color: var(--text); }
.perm-surface {
  flex: none; max-width: 30%; font-size: 11px; color: var(--amber);
  background: var(--warn-bg); border-radius: 999px; padding: 1px 8px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.perm-queue {
  flex: none; font-size: 11px; color: var(--muted);
  background: var(--card2); border-radius: 999px; padding: 1px 8px;
}
.perm-close {
  flex: none; width: 30px; height: 30px; padding: 0; border-radius: 8px;
  background: transparent; color: var(--muted);
  display: flex; align-items: center; justify-content: center;
}
.perm-close:active { opacity: .55; }
.perm-close svg { width: 16px; height: 16px; }

/* 授权内容（命令 / 路径 / 值）：等宽字体单块展示 */
.perm-code {
  flex: none; margin: 12px 0 2px; padding: 10px 12px; max-height: 120px; overflow: auto;
  background: var(--card2); border-radius: 10px; white-space: pre-wrap; word-break: break-all;
  font: 12.5px/1.6 ui-monospace, Menlo, Consolas, monospace; color: var(--text);
}

/* 四档决策按钮：编号 + 标签 + 描述（deny 红色系警示） */
.perm-actions { flex: none; display: flex; flex-direction: column; gap: 4px; padding-top: 10px; }
.perm-btn {
  display: flex; align-items: center; gap: 10px; width: 100%;
  padding: 11px 12px; border-radius: 12px; background: var(--card);
  text-align: left; transition: background .15s ease;
}
.perm-btn:active { background: var(--card2); }
.pb-no {
  flex: none; width: 20px; height: 20px; border-radius: 50%;
  background: var(--brand); color: #fff; font-size: 12px; font-weight: 650;
  display: flex; align-items: center; justify-content: center;
}
.pb-label { flex: none; font-size: 14px; font-weight: 600; color: var(--text); }
.pb-desc { flex: 1; min-width: 0; font-size: 12px; color: var(--muted); text-align: right; }
.perm-btn.deny .pb-no { background: var(--red); }
.perm-btn.deny .pb-label { color: var(--red); }
</style>
