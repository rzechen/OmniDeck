<template>
  <tool-shell
    title="压力换算"
    desc="帕斯卡到 psi 等压力单位互转"
    icon="wind"
    color="#2F54EB"
    back-path="/tools/unit"
  >
    <unit-converter :units="units" default-from="mpa" :default-value="1" />
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import UnitConverter from '@/components/tool/UnitConverter.vue'

// factor：1 该单位 = factor 帕斯卡
export default {
  name: 'UnitPressure',
  components: { ToolShell, UnitConverter },
  data() {
    return {
      units: [
        { key: 'pa', label: '帕 (Pa)', factor: 1 },
        { key: 'hpa', label: '百帕 (hPa)', factor: 100 },
        { key: 'kpa', label: '千帕 (kPa)', factor: 1000 },
        { key: 'mpa', label: '兆帕 (MPa)', factor: 1e6 },
        { key: 'bar', label: '巴 (bar)', factor: 1e5 },
        { key: 'mbar', label: '毫巴 (mbar)', factor: 100 },
        { key: 'atm', label: '标准大气压 (atm)', factor: 101325 },
        { key: 'torr', label: '毫米汞柱 (torr)', factor: 133.322368421 },
        { key: 'psi', label: '磅力/平方英寸 (psi)', factor: 6894.757293168 },
        { key: 'kgfcm2', label: '千克力/平方厘米 (kgf/cm²)', factor: 98066.5 }
      ]
    }
  }
}
</script>
