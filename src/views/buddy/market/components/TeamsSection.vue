<template>
  <!-- 专家团卡片网格（复用组件）：「专家团」视图（专家 tab 中间视图）内容区；
       自加载 teams + 专家名映射，删除内置处理，
       编辑/新建上抛（弹窗由市场页统一持有 TeamFormDialog） -->
  <div class="ob-teams-section">
    <!-- 加载骨架 -->
    <div v-if="loading" class="ob-sk-wrap">
      <buddy-skeleton type="cards" :count="3" />
    </div>

    <!-- 卡片网格（末位固定"新建"占位卡） -->
    <div v-else class="ob-cards-grid ob-teams-grid">
      <div
        v-for="t in teamList"
        :key="t.id"
        class="ob-grid-card ob-team-card"
      >
        <div class="ob-card-head">
          <div class="ob-card-logo logo-team">
            <svg-icon icon-class="team" />
          </div>
          <div class="ob-card-title">
            <div class="ob-card-name" :title="t.name">
              <span class="ob-name-text">{{ t.name }}</span>
              <span class="ob-kind-badge is-team">团</span>
              <span v-if="t.collection" class="ob-kind-badge is-market" title="市场安装的专家团">市场</span>
            </div>
            <div class="ob-card-meta" :title="t.description">{{ t.description || '（无描述）' }}</div>
          </div>
        </div>

        <!-- 成员摘要：N 位成员 + 专家名列表（1 行截断） -->
        <div class="ob-team-members" :title="memberTitle(t)">
          <span class="ob-team-members-count">{{ t.members.length }} 位成员</span>
          <span class="ob-team-members-names">{{ memberNames(t) }}</span>
        </div>

        <div class="ob-card-foot">
          <div class="ob-foot-info">{{ formatTime(t.updatedAt) }}</div>
          <div class="ob-card-actions" @click.stop>
            <span class="ob-item-action" title="编辑专家团" @click="emit('edit', t)">
              <svg-icon icon-class="edit" />
            </span>
            <span class="ob-item-action danger" title="删除专家团" @click="removeTeam(t)">
              <svg-icon icon-class="delete" />
            </span>
          </div>
        </div>
      </div>

      <!-- 新建占位卡（虚线框） -->
      <button type="button" class="ob-team-add-card" @click="emit('add')">
        <svg-icon icon-class="plus" />
        <span>新建专家团</span>
      </button>
    </div>
  </div>
</template>

<script setup>
// 专家团卡片网格：teams.list + agents.list（成员名反查）；
// 删除走 teams.remove（市场安装的团连带删除成员集合，confirm 文案区分）
import { ref, onActivated } from 'vue'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'TeamsSection' })

const emit = defineEmits(['edit', 'add'])

const { message, confirm } = useFeedback()

const teamList = ref([])
const loading = ref(false)
// 成员路径 → 专家名 映射（摘要展示用；丢失成员退化为文件名）
const agentNames = ref({})

async function loadTeams() {
  loading.value = true
  const api = buddyApi()
  try {
    // agents.listAll：全量专家（含团成员目录 teams/），成员名反查不漏
    const [teams, agentsRes] = await Promise.all([
      api && api.teams ? api.teams.list() : Promise.resolve([]),
      api && api.agents && api.agents.listAll ? api.agents.listAll() : Promise.resolve([])
    ])
    teamList.value = Array.isArray(teams) ? teams : []
    const map = {}
    for (const a of (Array.isArray(agentsRes) ? agentsRes : [])) map[a.file] = a.name
    agentNames.value = map
  } catch (e) {
    teamList.value = []
  }
  loading.value = false
}

function memberName(m) {
  return agentNames.value[m] || m.split('/').pop().replace(/\.md$/i, '')
}

function memberNames(t) {
  return t.members.map(memberName).join('、') || '（无成员）'
}

function memberTitle(t) {
  return memberNames(t)
}

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} 更新`
}

function removeTeam(t) {
  // 市场安装的团（带 collection）删除时连带移除成员专家集合
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
      loadTeams()
    } else {
      message.error((res && res.error) || '删除失败')
    }
  }).catch(() => {})
}

// created：进入即拉取
loadTeams()

// keep-alive 页签重入：团可能在弹窗已变更，重新拉取
onActivated(() => {
  if (!loading.value) loadTeams()
})

// 供父级（市场页）在弹窗保存后触发刷新；teamList 供 hero 数量徽标读取
defineExpose({ reload: loadTeams, teamList })
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

.ob-sk-wrap {
  padding: 10px 4px;
}

/* ===== 专家团卡片 ===== */
.ob-teams-grid {
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
}

.ob-team-card {
  .ob-card-meta {
    white-space: normal;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
    min-height: 33px;
  }
}

/* 团 logo（紫系渐变）与类型徽标复用 buddy-settings 全局 logo-team 配方 */
/* 类型徽标：团（紫）/ 市场（灰描边） */
.ob-kind-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.6;
  padding: 0 6px;
  border-radius: 4px;

  &.is-team {
    color: #7C5CDB;
    background: rgba(124, 92, 219, 0.1);
    border: 1px solid rgba(124, 92, 219, 0.3);
  }

  &.is-market {
    color: $text-secondary;
    background: $search-bg;
    border: 1px solid var(--border-color);
  }
}

/* 成员摘要行：计数徽标 + 专家名列表（1 行截断） */
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
  color: #C86B3C;
  background: rgba(200, 107, 60, 0.08);
  border: 1px solid rgba(200, 107, 60, 0.22);
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

/* 新建占位卡（虚线框） */
.ob-team-add-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 140px;
  border: 1.5px dashed var(--border-color);
  border-radius: $radius-lg;
  background: transparent;
  color: $text-secondary;
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  transition: all 0.18s ease;

  .svg-icon {
    font-size: 20px;
  }

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.03);
  }
}
</style>
