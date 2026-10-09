<template>
  <tool-shell
    title="血压范围"
    desc="输入收缩压/舒张压，分析血压分级与建议"
    icon="heart"
    color="#13C2C2"
    back-path="/tools/life"
  >
    <div class="bp-layout">
      <div class="bp-config">
        <div class="bp-field">
          <span class="bp-label">高压（收缩压）</span>
          <div class="bp-input-group">
            <input v-model.number="systolic" type="number" min="60" max="260" placeholder="120" />
            <span class="bp-unit">mmHg</span>
          </div>
        </div>
        <div class="bp-field">
          <span class="bp-label">低压（舒张压）</span>
          <div class="bp-input-group">
            <input v-model.number="diastolic" type="number" min="40" max="160" placeholder="80" />
            <span class="bp-unit">mmHg</span>
          </div>
        </div>

        <div v-if="result" class="bp-result" :style="{ borderColor: result.color }">
          <div class="bp-level" :style="{ color: result.color }">{{ result.label }}</div>
          <div class="bp-desc">{{ result.desc }}</div>
          <div class="bp-advice">{{ result.advice }}</div>
        </div>

        <div v-if="pulsePressure" class="bp-pp">
          脉压差：<b>{{ pulsePressure }}</b> mmHg
          <span class="bp-pp-hint">{{ ppHint }}</span>
        </div>
      </div>

      <!-- 分级对照表 -->
      <div class="bp-table-wrap">
        <table class="bp-table">
          <thead>
            <tr>
              <th>分级</th>
              <th>收缩压</th>
              <th></th>
              <th>舒张压</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in tableRows"
              :key="row.label"
              :class="{ active: result && result.label === row.label }"
            >
              <td :style="{ color: row.color }" class="bp-tag">{{ row.label }}</td>
              <td class="mono">{{ row.sys }}</td>
              <td class="bp-and">{{ row.and }}</td>
              <td class="mono">{{ row.dia }}</td>
            </tr>
          </tbody>
        </table>
        <p class="bp-note">数据仅供参考，不构成医疗建议；异常请及时就医。</p>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span v-if="result">{{ result.label }} · {{ systolic }}/{{ diastolic }} mmHg</span>
      <span v-else>输入血压值后自动分析</span>
      <span class="status-right">中国高血压防治指南标准</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'

// 成人血压分级（中国标准）
const LEVELS = [
  { label: '偏低', color: '#722ED1', desc: '血压低于正常范围', advice: '如无症状无需担心；若伴头晕乏力请就医' },
  { label: '正常', color: 'var(--success-color)', desc: '血压处于理想范围', advice: '保持良好作息与饮食习惯' },
  { label: '正常高值', color: 'var(--warning-color)', desc: '血压偏高但未达高血压标准', advice: '建议低盐饮食、规律运动、定期监测' },
  { label: '1级高血压（轻度）', color: '#FA8C16', desc: '轻度高血压', advice: '建议改善生活方式并咨询医生' },
  { label: '2级高血压（中度）', color: 'var(--danger-color)', desc: '中度高血压', advice: '请尽快就医评估，规范治疗' },
  { label: '3级高血压（重度）', color: '#CF1322', desc: '重度高血压', advice: '请立即就医！' }
]

defineOptions({ name: 'LifeBloodPressure' })

const systolic = ref(120)
const diastolic = ref(80)
const tableRows = ref([
  { label: '偏低', color: '#722ED1', sys: '< 90', and: '和/或', dia: '< 60' },
  { label: '正常', color: 'var(--success-color)', sys: '90 ~ 119', and: '和', dia: '60 ~ 79' },
  { label: '正常高值', color: 'var(--warning-color)', sys: '120 ~ 139', and: '和/或', dia: '80 ~ 89' },
  { label: '1级高血压（轻度）', color: '#FA8C16', sys: '140 ~ 159', and: '和/或', dia: '90 ~ 99' },
  { label: '2级高血压（中度）', color: 'var(--danger-color)', sys: '160 ~ 179', and: '和/或', dia: '100 ~ 109' },
  { label: '3级高血压（重度）', color: '#CF1322', sys: '≥ 180', and: '和/或', dia: '≥ 110' }
])

const result = computed(() => {
  const s = systolic.value
  const d = diastolic.value
  if (!s || !d || s <= 0 || d <= 0) return null
  // 取收缩压与舒张压中较高的分级
  let idxS
  let idxD
  if (s < 90 || d < 60) return LEVELS[0]
  if (s >= 180 || d >= 110) idxS = idxD = 5
  else if (s >= 160 || d >= 100) idxS = idxD = 4
  else if (s >= 140 || d >= 90) idxS = idxD = 3
  else if (s >= 120 || d >= 80) idxS = idxD = 2
  else idxS = idxD = 1
  void idxS
  void idxD
  return LEVELS[Math.max(idxS, idxD)]
})

const pulsePressure = computed(() => {
  if (!systolic.value || !diastolic.value) return null
  return systolic.value - diastolic.value
})

const ppHint = computed(() => {
  const pp = pulsePressure.value
  if (pp === null) return ''
  if (pp > 60) return '（偏大，关注血管弹性）'
  if (pp < 30) return '（偏小，建议咨询医生）'
  return '（正常 30~60）'
})
</script>

<style lang="scss" scoped>
.bp-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.bp-config {
  flex: 0 0 320px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 20px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
}

.bp-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bp-label {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.bp-input-group {
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--search-bg);
  transition: all 0.16s ease;

  &:focus-within {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
  }

  input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 17px;
    font-weight: 600;
    color: var(--text-primary);
    min-width: 0;

    &::-webkit-inner-spin-button {
      display: none;
    }
  }

  .bp-unit {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.bp-result {
  padding: 14px;
  border: 1.5px solid;
  border-radius: 10px;
  background: var(--card-bg);
}

.bp-level {
  font-size: 18px;
  font-weight: 800;
}

.bp-desc {
  font-size: 12px;
  color: var(--text-primary);
  margin-top: 4px;
}

.bp-advice {
  font-size: 11.5px;
  color: var(--text-secondary);
  margin-top: 6px;
}

.bp-pp {
  font-size: 12.5px;
  color: var(--text-primary);
  background: var(--search-bg);
  border-radius: 8px;
  padding: 8px 12px;

  b {
    color: var(--primary-color);
    font-size: 14px;
  }
}

.bp-pp-hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 4px;
}

.bp-table-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  justify-content: center;
}

.bp-table {
  width: 100%;
  border-collapse: collapse;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  font-size: 12.5px;

  th {
    padding: 9px 14px;
    text-align: left;
    font-size: 11px;
    color: var(--text-secondary);
    background: var(--search-bg);
    border-bottom: 1px solid var(--border-color);
  }

  td {
    padding: 8px 14px;
    border-bottom: 1px solid var(--border-color);
    color: var(--text-primary);
  }

  tr:last-child td {
    border-bottom: none;
  }

  tr.active td {
    background: rgba(var(--primary-color-rgb), 0.05);
  }

  .mono {
    font-family: 'SF Mono', Menlo, monospace;
    font-variant-numeric: tabular-nums;
  }

  .bp-tag {
    font-weight: 700;
  }

  .bp-and {
    color: var(--text-secondary);
    font-size: 11px;
  }
}

.bp-note {
  font-size: 10.5px;
  color: var(--text-secondary);
  text-align: center;
  margin: 0;
}
</style>
