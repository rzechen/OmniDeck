<template>
  <tool-shell
    title="体积换算"
    desc="毫升、升、加仑等体积单位互转"
    icon="cube"
    color="#2F54EB"
    back-path="/tools/unit"
  >
    <unit-converter :units="units" default-from="l" :default-value="1" />
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import UnitConverter from '@/components/tool/UnitConverter.vue'

// factor：1 该单位 = factor 立方米
defineOptions({ name: 'UnitVolume' })

const units = [
  { key: 'ml', label: '毫升 (mL)', factor: 1e-6 },
  { key: 'cl', label: '厘升 (cL)', factor: 1e-5 },
  { key: 'l', label: '升 (L)', factor: 0.001 },
  { key: 'm3', label: '立方米 (m³)', factor: 1 },
  { key: 'cm3', label: '立方厘米 (cm³)', factor: 1e-6 },
  { key: 'in3', label: '立方英寸 (in³)', factor: 1.6387064e-5 },
  { key: 'ft3', label: '立方英尺 (ft³)', factor: 0.028316846592 },
  { key: 'yd3', label: '立方码 (yd³)', factor: 0.764554857984 },
  { key: 'gal', label: '美制加仑 (gal)', factor: 0.003785411784 },
  { key: 'qt', label: '美制夸脱 (qt)', factor: 0.000946352946 },
  { key: 'pt', label: '美制品脱 (pt)', factor: 0.000473176473 }
]
</script>
