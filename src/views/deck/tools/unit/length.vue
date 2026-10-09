<template>
  <tool-shell
    title="长度换算"
    desc="纳米到光年等长度单位实时互转"
    icon="ruler"
    color="#2F54EB"
    back-path="/tools/unit"
  >
    <unit-converter :units="units" default-from="m" :default-value="1" />
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import UnitConverter from '@/components/tool/UnitConverter.vue'

// factor：1 该单位 = factor 米
defineOptions({ name: 'UnitLength' })

const units = [
  { key: 'nm', label: '纳米 (nm)', factor: 1e-9 },
  { key: 'um', label: '微米 (μm)', factor: 1e-6 },
  { key: 'mm', label: '毫米 (mm)', factor: 0.001 },
  { key: 'cm', label: '厘米 (cm)', factor: 0.01 },
  { key: 'dm', label: '分米 (dm)', factor: 0.1 },
  { key: 'm', label: '米 (m)', factor: 1 },
  { key: 'km', label: '千米 (km)', factor: 1000 },
  { key: 'inch', label: '英寸 (in)', factor: 0.0254 },
  { key: 'ft', label: '英尺 (ft)', factor: 0.3048 },
  { key: 'yd', label: '码 (yd)', factor: 0.9144 },
  { key: 'mi', label: '英里 (mi)', factor: 1609.344 },
  { key: 'au', label: '天文单位 (AU)', factor: 1.495978707e11 },
  { key: 'ly', label: '光年 (ly)', factor: 9.4607304725808e15 }
]
</script>
