<template>
  <tool-shell
    title="时间单位换算"
    desc="毫秒到年多种时间单位实时互转"
    icon="hourglass"
    color="#2F54EB"
    back-path="/tools/unit"
  >
    <unit-converter :units="units" default-from="s" :default-value="1" />
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import UnitConverter from '@/components/tool/UnitConverter.vue'

// factor：1 该单位 = factor 秒
defineOptions({ name: 'UnitTime' })

const units = [
  { key: 'ms', label: '毫秒 (ms)', factor: 0.001 },
  { key: 'us', label: '微秒 (μs)', factor: 1e-6 },
  { key: 's', label: '秒 (s)', factor: 1 },
  { key: 'min', label: '分钟 (min)', factor: 60 },
  { key: 'h', label: '小时 (h)', factor: 3600 },
  { key: 'day', label: '天 (day)', factor: 86400 },
  { key: 'week', label: '周 (week)', factor: 604800 },
  { key: 'month', label: '月 (avg)', factor: 2629800 },
  { key: 'year', label: '年 (avg)', factor: 31557600 }
]
</script>
