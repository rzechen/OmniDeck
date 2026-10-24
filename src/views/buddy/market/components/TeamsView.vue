<template>
  <!-- 我的专家团视图（市场页 type=team 的「我的」视图）：hero + 卡片网格（TeamsSection） -->
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
      <el-button class="ob-hero-btn" size="small" round type="primary" plain @click="emit('add')">
        <svg-icon icon-class="plus" class="ob-btn-svg" />新建专家团
      </el-button>
    </header>

    <div class="ob-page-body">
      <teams-section ref="sectionRef" @edit="t => emit('edit', t)" @add="emit('add')" />
    </div>
  </div>
</template>

<script setup>
// 我的专家团视图（市场页内嵌）：hero 壳 + TeamsSection 卡片网格；
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
