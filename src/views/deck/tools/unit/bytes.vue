<template>
  <tool-shell
    title="字节单位换算"
    desc="bit 到 EB 全系列存储单位实时互转"
    icon="storage"
    color="#2F54EB"
    back-path="/tools/unit"
  >
    <unit-converter :units="units" default-from="mb" :default-value="1" />
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import UnitConverter from '@/components/tool/UnitConverter.vue'

// factor：1 该单位 = factor bit（标准单位 bit）
const K = 1024

defineOptions({ name: 'UnitBytes' })

const units = [
  { key: 'bit', label: '位 (bit)', factor: 1 },
  { key: 'byte', label: '字节 (B)', factor: 8 },
  { key: 'kb', label: '千字节 (KB)', factor: 8 * K },
  { key: 'mb', label: '兆字节 (MB)', factor: 8 * K ** 2 },
  { key: 'gb', label: '吉字节 (GB)', factor: 8 * K ** 3 },
  { key: 'tb', label: '太字节 (TB)', factor: 8 * K ** 4 },
  { key: 'pb', label: '拍字节 (PB)', factor: 8 * K ** 5 },
  { key: 'eb', label: '艾字节 (EB)', factor: 8 * K ** 6 }
]
</script>
