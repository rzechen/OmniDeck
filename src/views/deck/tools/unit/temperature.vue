<template>
  <tool-shell
    title="温度换算"
    desc="摄氏度、华氏度、开尔文互转"
    icon="thermometer"
    color="#2F54EB"
    back-path="/tools/unit"
  >
    <unit-converter :units="units" default-from="c" :default-value="25" />
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import UnitConverter from '@/components/tool/UnitConverter.vue'

// 温度为非线性换算：以摄氏度为标准单位，使用 toStd/fromStd 公式
defineOptions({ name: 'UnitTemperature' })

const units = [
  {
    key: 'c',
    label: '摄氏度 (°C)',
    toStd: v => v,
    fromStd: v => v
  },
  {
    key: 'f',
    label: '华氏度 (°F)',
    toStd: v => (v - 32) / 1.8,
    fromStd: v => v * 1.8 + 32
  },
  {
    key: 'k',
    label: '开尔文 (K)',
    toStd: v => v - 273.15,
    fromStd: v => v + 273.15
  },
  {
    key: 'r',
    label: '兰氏度 (°R)',
    toStd: v => (v - 491.67) / 1.8,
    fromStd: v => (v + 273.15) * 1.8
  }
]
</script>
