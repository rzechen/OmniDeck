<template>
  <!-- 我的专家团视图（专家 tab 中间视图：专家广场 → 我的专家团 → 我的专家）：hero + 卡片网格 -->
  <div class="ob-manage-page">
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">我的专家团</h2>
          <span class="ob-hero-badge" v-if="teamCount">{{ teamCount }} 个</span>
        </div>
        <p class="ob-section-desc">
          将多位专家组合成团（teams/*.json）：对话中 @Team 一键引用，按团描述整体路由子任务
        </p>
      </div>
    </header>

    <div class="ob-page-body">
      <teams-section ref="sectionRef" @edit="t => emit('edit', t)" @add="emit('add')" />
    </div>
  </div>
</template>

<script setup>
// 我的专家团视图（专家 tab 中间视图）：hero 壳 + TeamsSection 卡片网格；
// 新增与编辑弹窗由市场页统一持有（TeamFormDialog），本组件只上抛事件
import { ref, computed } from 'vue'
import TeamsSection from './TeamsSection.vue'

defineOptions({ name: 'TeamsView' })

const emit = defineEmits(['edit', 'add'])

// 团数量（hero 徽标）：由 TeamsSection 暴露列表驱动
const sectionRef = ref(null)
const teamCount = computed(() => (sectionRef.value ? sectionRef.value.teamList.length : 0))

// 供父级（市场页）在弹窗保存后触发刷新
function reload() {
  if (sectionRef.value) sectionRef.value.reload()
}
defineExpose({ reload })
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';
</style>
