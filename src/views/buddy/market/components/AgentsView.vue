<template>
  <div class="ob-manage-page">
    <!-- 顶部 Hero（与技能页同款：标题 + 数量徽标 + 描述） -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">我的专家</h2>
          <span class="ob-hero-badge" v-if="agentList.length">{{ agentList.length }} 个</span>
        </div>
        <p class="ob-section-desc">
          定义可委派的专家（agents/*.md）：主会话按描述路由子任务，专家按系统提示词独立执行
        </p>
      </div>
    </header>

    <!-- 内容区 -->
    <div class="ob-page-body">
      <!-- 空状态 -->
      <div v-if="!agentList.length && !agentLoading" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="subagent" />
        </div>
        <div class="ob-empty-title">暂无专家</div>
        <div class="ob-empty-desc">点击下方按钮创建第一个专家</div>
        <el-button size="small" round type="primary" plain @click="emit('add')">新增专家</el-button>
      </div>

      <!-- 专家卡片网格 -->
      <div v-else class="ob-cards-grid">
        <!-- 加载中：卡片骨架占位 -->
        <div v-if="agentLoading" class="ob-sk-wrap">
          <buddy-skeleton type="cards" :count="8" :min="340" />
        </div>
        <div
          v-for="a in agentList"
          v-else
          :key="a.file"
          class="ob-grid-card ob-agent-card"
        >
          <div class="ob-card-head">
            <div class="ob-card-logo logo-agent">
              <svg-icon icon-class="subagent" />
            </div>
            <div class="ob-card-title">
              <div class="ob-card-name" :title="a.name">
                <span class="ob-name-text">{{ a.name }}</span>
              </div>
              <div class="ob-card-meta">{{ a.description || '（无描述）' }}</div>
            </div>
          </div>

          <div class="ob-card-foot">
            <div class="ob-foot-info" />
            <div class="ob-card-actions" @click.stop>
              <span class="ob-item-action" title="编辑" @click="emit('edit', a)">
                <svg-icon icon-class="edit" />
              </span>
              <span class="ob-item-action danger" title="删除" @click="removeAgent(a)">
                <svg-icon icon-class="delete" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
// 我的专家视图（市场页内嵌）：本地 agents 目录列表 + 卡片（编辑 / 删除）；
// 新增与编辑弹窗由市场页统一持有（AgentFormDialog），本组件只上抛事件
import { ref, onActivated } from 'vue'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'AgentsView' })

const emit = defineEmits(['edit', 'add'])

const { message, confirm } = useFeedback()

const agentList = ref([])
const agentLoading = ref(false)

async function loadAgents() {
  agentLoading.value = true
  try {
    const api = buddyApi()
    const res = api && api.agents ? await api.agents.list() : []
    agentList.value = Array.isArray(res) ? res : []
  } catch (e) {
    agentList.value = []
  }
  agentLoading.value = false
}

function removeAgent(a) {
  confirm('确定删除专家「' + a.name + '」吗？', '删除专家', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    const api = buddyApi()
    const res = await api.agents.remove(a.file)
    if (res && res.ok) {
      message.success('已删除')
      loadAgents()
    } else {
      message.error((res && res.error) || '删除失败')
    }
  }).catch(() => {})
}

// created：进入页面即拉取
loadAgents()

// keep-alive 页签重入：专家可能在市场页「添加」弹窗已变更，重新拉取
// （首次进入 loadAgents 已加载，此时 agentLoading 仍为 true，天然跳过）
onActivated(() => {
  if (!agentLoading.value) loadAgents()
})

// 供父级（市场页）在弹窗保存后触发刷新
defineExpose({ reload: loadAgents })
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 专家卡片与技能卡片同宽 */
.ob-cards-grid {
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
}

.ob-sk-wrap {
  padding: 18px 4px;
}

/* 与技能卡片一致：名称完整呈现（允许换行） */
.ob-card-name,
.ob-card-name .ob-name-text {
  white-space: normal;
  word-break: break-word;
  overflow: visible;
  text-overflow: unset;
  display: block;
}

/* 描述多行展示（3 行截断，锁定最小高度保持卡片规整） */
.ob-card-meta {
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  min-height: 50px;
}
</style>
