<template>
  <tool-shell
    title="速率换算"
    desc="bps 到 Gbps、马赫、节等速率单位互转"
    icon="gauge"
    color="#2F54EB"
    back-path="/tools/unit"
  >
    <unit-converter :units="units" default-from="ms" :default-value="1" />
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import UnitConverter from '@/components/tool/UnitConverter.vue'

// factor：1 该单位 = factor 米/秒
defineOptions({ name: 'UnitRate' })

const units = [
  { key: 'ms', label: '米/秒 (m/s)', factor: 1 },
  { key: 'kms', label: '千米/秒 (km/s)', factor: 1000 },
  { key: 'kmh', label: '千米/小时 (km/h)', factor: 1 / 3.6 },
  { key: 'mh', label: '米/小时 (m/h)', factor: 1 / 3600 },
  { key: 'mach', label: '马赫 (Mach)', factor: 340.29 },
  { key: 'ins', label: '英寸/秒 (in/s)', factor: 0.0254 },
  { key: 'fts', label: '英尺/秒 (ft/s)', factor: 0.3048 },
  { key: 'ftm', label: '英尺/分 (ft/min)', factor: 0.00508 },
  { key: 'mih', label: '英里/小时 (mi/h)', factor: 0.44704 },
  { key: 'knot', label: '节 (knot)', factor: 0.51444 },
  { key: 'c', label: '光速 (c)', factor: 299792458 }
]
</script>
