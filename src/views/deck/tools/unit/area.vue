<template>
  <tool-shell
    title="面积换算"
    desc="平方毫米到英亩等面积单位互转"
    icon="crop"
    color="#2F54EB"
    back-path="/tools/unit"
  >
    <unit-converter :units="units" default-from="m2" :default-value="1" />
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import UnitConverter from '@/components/tool/UnitConverter.vue'

// factor：1 该单位 = factor 平方米
export default {
  name: 'UnitArea',
  components: { ToolShell, UnitConverter },
  data() {
    return {
      units: [
        { key: 'mm2', label: '平方毫米 (mm²)', factor: 1e-6 },
        { key: 'cm2', label: '平方厘米 (cm²)', factor: 1e-4 },
        { key: 'm2', label: '平方米 (m²)', factor: 1 },
        { key: 'ha', label: '公顷 (ha)', factor: 1e4 },
        { key: 'km2', label: '平方千米 (km²)', factor: 1e6 },
        { key: 'in2', label: '平方英寸 (in²)', factor: 0.00064516 },
        { key: 'ft2', label: '平方英尺 (ft²)', factor: 0.09290304 },
        { key: 'yd2', label: '平方码 (yd²)', factor: 0.83612736 },
        { key: 'mu', label: '亩', factor: 666.6666667 },
        { key: 'acre', label: '英亩 (acre)', factor: 4046.8564224 },
        { key: 'mi2', label: '平方英里 (mi²)', factor: 2589988.110336 }
      ]
    }
  }
}
</script>
