<script setup>
// 工具分类页：按分类名从统一配置（@/config/tools）渲染分类页
import { computed } from 'vue'
import ToolCategory from '@/components/deck/ToolCategory.vue'
import { toolCategories } from '@/config/tools'

// 组件名加 Category 后缀：Image / Text 等为 HTML/SVG 保留标签，
// 直接用作组件名会触发 Vue 保留元素警告
defineOptions({ name: 'TextCategory' })

const cat = computed(
  () =>
    toolCategories.find(c => c.name === 'Text') || {
      title: '',
      desc: '',
      color: '#3366FF',
      children: []
    }
)
</script>

<template>
  <tool-category :category="cat" />
</template>
