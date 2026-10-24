<template>
  <div class="ob-manage-page">
    <!-- 顶部 Hero（与技能页同款：标题 + 数量徽标 + 描述） -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">我的专家</h2>
          <span class="ob-hero-badge" v-if="totalCount">{{ totalCount }} 个</span>
        </div>
        <p class="ob-section-desc">
          定义可委派的专家（agents/*.md）与专家团（teams/*.json）：主会话按描述路由子任务，专家按系统提示词独立执行；卡片角标区分「团」与「专家」
        </p>
      </div>
    </header>

    <!-- 内容区 -->
    <div class="ob-page-body">
      <!-- 空状态 -->
      <div v-if="!totalCount && !agentLoading" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="subagent" />
        </div>
        <div class="ob-empty-title">暂无专家</div>
        <div class="ob-empty-desc">点击下方按钮创建第一个专家</div>
        <el-button size="small" round type="primary" plain @click="emit('add')">新增专家</el-button>
      </div>

      <!-- 专家团 + 专家 卡片网格（团在前，角标标识类型） -->
      <div v-else class="ob-cards-grid">
        <!-- 加载中：卡片骨架占位 -->
        <div v-if="agentLoading" class="ob-sk-wrap">
          <buddy-skeleton type="cards" :count="8" :min="340" />
        </div>
        <template v-else>
          <!-- 专家团卡片（安装专家团后在此呈现，带「团」角标） -->
          <div
            v-for="t in teamList"
            :key="'team-' + t.id"
            class="ob-grid-card ob-agent-card ob-team-card"
          >
            <div class="ob-card-head">
              <div class="ob-card-logo logo-team">
                <svg-icon icon-class="team" />
              </div>
              <div class="ob-card-title">
                <div class="ob-card-name" :title="t.name">
                  <span class="ob-name-text">{{ t.name }}</span>
                  <span class="ob-kind-badge is-team">团</span>
                  <span v-if="t.collection" class="ob-kind-badge is-market" title="从专家团广场安装">市场</span>
                </div>
                <div class="ob-card-meta">{{ t.description || '（无描述）' }}</div>
              </div>
            </div>

            <!-- 成员摘要：N 位成员 + 专家名列表（1 行截断） -->
            <div class="ob-team-members" :title="memberNames(t)">
              <span class="ob-team-members-count">{{ t.members.length }} 位成员</span>
              <span class="ob-team-members-names">{{ memberNames(t) }}</span>
            </div>

            <div class="ob-card-foot">
              <div class="ob-foot-info" />
              <div class="ob-card-actions" @click.stop>
                <span class="ob-item-action" title="编辑专家团" @click="emit('edit-team', t)">
                  <svg-icon icon-class="edit" />
                </span>
                <span class="ob-item-action danger" title="删除专家团" @click="removeTeam(t)">
                  <svg-icon icon-class="delete" />
                </span>
              </div>
            </div>
          </div>

          <!-- 专家卡片（带「专家」角标） -->
          <div
            v-for="a in agentList"
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
                  <span class="ob-kind-badge is-expert">专家</span>
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
        </template>
      </div>
    </div>
  </div>
</template>

<script setup>
// 我的专家视图（市场页内嵌）：本地 agents 目录列表 + 专家团（teams 目录）合并卡片；
// 团卡片带「团」角标、专家卡片带「专家」角标（安装专家团后可区分团/专家）；
// 新增与编辑弹窗由市场页统一持有（AgentFormDialog / TeamFormDialog），本组件只上抛事件；
// 系统内置专家（builtin）不在本页展示——仅对话 @ 引用呈现（带「系统」标识）
import { ref, computed, onActivated } from 'vue'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'AgentsView' })

const emit = defineEmits(['edit', 'add', 'edit-team'])

const { message, confirm } = useFeedback()

const agentList = ref([])
const teamList = ref([])
const agentLoading = ref(false)
// 成员路径 → 专家名 映射（团成员摘要展示用；丢失成员退化为文件名）
const agentNames = ref({})

const totalCount = computed(() => agentList.value.length + teamList.value.length)

async function loadAgents() {
  agentLoading.value = true
  try {
    const api = buddyApi()
    const [agentsRes, teamsRes] = await Promise.all([
      api && api.agents ? api.agents.list() : Promise.resolve([]),
      api && api.teams ? api.teams.list() : Promise.resolve([])
    ])
    // 系统内置专家过滤：仅展示用户自建 / 市场安装的
    const list = Array.isArray(agentsRes) ? agentsRes : []
    agentList.value = list.filter(a => !a.builtin)
    teamList.value = Array.isArray(teamsRes) ? teamsRes : []
    const map = {}
    for (const a of list) map[a.file] = a.name
    agentNames.value = map
  } catch (e) {
    agentList.value = []
    teamList.value = []
  }
  agentLoading.value = false
}

function memberName(m) {
  return agentNames.value[m] || m.split('/').pop().replace(/\.md$/i, '')
}

function memberNames(t) {
  return t.members.map(memberName).join('、') || '（无成员）'
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

// 删除专家团：本地团仅删定义；市场安装的团（带 collection）连带删除成员专家
function removeTeam(t) {
  const tip = t.collection
    ? `删除专家团「${t.name}」将同时移除团内 ${t.members.length} 位成员专家，确定删除吗？`
    : `确定删除专家团「${t.name}」吗？（团内成员专家不受影响）`
  confirm(tip, '删除专家团', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    const api = buddyApi()
    const res = await api.teams.remove(t.id)
    if (res && res.ok) {
      message.success(t.collection ? '已删除专家团及团内成员专家' : '已删除')
      // 市场团删除连带移除成员专家：整体重拉（团 + 专家）
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

/* 与技能卡片一致：名称完整呈现（允许换行）；徽标以行内元素跟随名称尾部 */
.ob-card-name {
  display: block;
  white-space: normal;
  word-break: break-word;
  overflow: visible;
  text-overflow: unset;
}

.ob-card-name .ob-name-text {
  display: inline;
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

/* 类型角标：团（紫）/ 专家（橙）/ 市场（灰描边）——区分安装的是团还是专家 */
.ob-kind-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.6;
  padding: 0 6px;
  border-radius: 4px;
  vertical-align: 1px;

  &.is-team {
    color: #7C5CDB;
    background: rgba(124, 92, 219, 0.1);
    border: 1px solid rgba(124, 92, 219, 0.3);
  }

  &.is-expert {
    color: #C86B3C;
    background: rgba(200, 107, 60, 0.08);
    border: 1px solid rgba(200, 107, 60, 0.25);
  }

  &.is-market {
    color: $text-secondary;
    background: $search-bg;
    border: 1px solid var(--border-color);
  }
}

/* 团卡片成员摘要行：计数徽标 + 专家名列表（1 行截断） */
.ob-team-members {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  margin: 2px 0 10px;
}

.ob-team-members-count {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  color: #7C5CDB;
  background: rgba(124, 92, 219, 0.08);
  border: 1px solid rgba(124, 92, 219, 0.22);
  padding: 0 7px;
  border-radius: 999px;
  line-height: 1.7;
}

.ob-team-members-names {
  flex: 1;
  min-width: 0;
  font-size: 11px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
