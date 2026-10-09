<template>
  <tool-shell
    title="重量换算"
    desc="毫克到吨、磅盎司等重量单位互转"
    icon="scale"
    color="#2F54EB"
    back-path="/tools/unit"
  >
    <unit-converter :units="units" default-from="kg" :default-value="1" />
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import UnitConverter from '@/components/tool/UnitConverter.vue'

// factor：1 该单位 = factor 千克
defineOptions({ name: 'UnitWeight' })

const units = [
  { key: 'mg', label: '毫克 (mg)', factor: 1e-6 },
  { key: 'g', label: '克 (g)', factor: 0.001 },
  { key: 'kg', label: '千克 (kg)', factor: 1 },
  { key: 't', label: '吨 (t)', factor: 1000 },
  { key: 'ct', label: '克拉 (ct)', factor: 0.0002 },
  { key: 'lb', label: '磅 (lb)', factor: 0.45359237 },
  { key: 'oz', label: '盎司 (oz)', factor: 0.028349523125 },
  { key: 'st', label: '英石 (st)', factor: 6.35029318 },
  { key: 'gr', label: '格令 (gr)', factor: 0.00006479891 },
  { key: 'amu', label: '原子质量单位 (u)', factor: 1.66053906660e-27 }
]
</script>
