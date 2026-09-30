<template>
  <tool-shell
    title="BMI 计算"
    desc="身体质量指数计算与健康分级评估"
    icon="bmi"
    color="#13C2C2"
    back-path="/tools/life"
  >
    <div class="bmi-layout">
      <!-- 输入区 -->
      <div class="bmi-config">
        <div class="bmi-field">
          <span class="bmi-label">身高</span>
          <div class="bmi-input-group">
            <input v-model.number="height" type="number" min="80" max="250" placeholder="170" />
            <span class="bmi-unit">cm</span>
          </div>
        </div>
        <div class="bmi-field">
          <span class="bmi-label">体重</span>
          <div class="bmi-input-group">
            <input v-model.number="weight" type="number" min="20" max="300" placeholder="65" />
            <span class="bmi-unit">kg</span>
          </div>
        </div>
        <div class="bmi-field">
          <span class="bmi-label">性别</span>
          <div class="tool-seg">
            <div class="tool-seg-item" :class="{ active: sex === 'm' }" @click="sex = 'm'">男</div>
            <div class="tool-seg-item" :class="{ active: sex === 'f' }" @click="sex = 'f'">女</div>
          </div>
        </div>

        <!-- BMI 大数值展示 -->
        <div v-if="bmi" class="bmi-result">
          <div class="bmi-value" :style="{ color: level.color }">{{ bmi.toFixed(1) }}</div>
          <div class="bmi-level" :style="{ color: level.color }">{{ level.label }}</div>
          <div class="bmi-range">正常范围 {{ level.range }}</div>
        </div>

        <!-- 健康体重建议 -->
        <div v-if="bmi" class="bmi-advice">
          <p>理想体重：{{ idealWeight[0] }} ~ {{ idealWeight[1] }} kg</p>
          <p class="bmi-hint">{{ level.advice }}</p>
        </div>
      </div>

      <!-- 分级标尺 -->
      <div class="bmi-scale-wrap">
        <div class="bmi-scale">
          <div
            v-for="lv in levels"
            :key="lv.label"
            class="bmi-scale-seg"
            :class="{ active: lv.label === level.label }"
            :style="{ background: lv.color, flexGrow: lv.flex }"
            :title="lv.label + ' ' + lv.range"
          >
            <span class="bmi-scale-label">{{ lv.label }}</span>
          </div>
          <!-- 指针 -->
          <div v-if="bmi" class="bmi-pointer" :style="{ left: pointerPos + '%' }">
            <svg-icon icon-class="caret-top" />
          </div>
        </div>
        <div class="bmi-scale-nums">
          <span v-for="n in [15, 18.5, 24, 28, 32, 40]" :key="n">{{ n }}</span>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span v-if="bmi">BMI {{ bmi.toFixed(1) }} · {{ level.label }}</span>
      <span v-else>输入身高体重后自动计算</span>
      <span class="status-right">BMI = 体重 ÷ 身高²</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'LifeBmi',
  components: { ToolShell },
  data() {
    return {
      height: 170,
      weight: 65,
      sex: 'm',
      levels: [
        { label: '偏瘦', min: 0, max: 18.5, color: 'var(--warning-color)', range: '< 18.5', flex: 3.5, advice: '体重偏低，注意均衡饮食补充营养' },
        { label: '正常', min: 18.5, max: 24, color: 'var(--success-color)', range: '18.5 ~ 24', flex: 5.5, advice: '体重正常，请继续保持良好习惯' },
        { label: '偏胖', min: 24, max: 28, color: '#FA8C16', range: '24 ~ 28', flex: 4, advice: '体重偏高，建议适量运动控制饮食' },
        { label: '肥胖', min: 28, max: 100, color: 'var(--danger-color)', range: '≥ 28', flex: 8, advice: '已达肥胖标准，建议咨询专业医师' }
      ]
    }
  },
  computed: {
    bmi() {
      if (!this.height || !this.weight || this.height <= 0) return null
      const h = this.height / 100
      const v = this.weight / (h * h)
      return v > 0 && isFinite(v) ? v : null
    },
    level() {
      if (!this.bmi) return { label: '—', color: '#999', range: '', advice: '' }
      return this.levels.find(l => this.bmi < l.max) || this.levels[3]
    },
    // 理想体重区间（BMI 18.5~24）
    idealWeight() {
      const h = this.height / 100
      return [(18.5 * h * h).toFixed(1), (24 * h * h).toFixed(1)]
    },
    // 标尺指针位置：15~40 映射 0~100%
    pointerPos() {
      if (!this.bmi) return 0
      return Math.min(100, Math.max(0, ((this.bmi - 15) / 25) * 100))
    }
  }
}
</script>

<style lang="scss" scoped>
.bmi-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 16px;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.bmi-config {
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

.bmi-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.bmi-label {
  font-size: 11.5px;
  color: var(--text-secondary);
}

.bmi-input-group {
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

  .bmi-unit {
    font-size: 12px;
    color: var(--text-secondary);
  }
}

.bmi-result {
  text-align: center;
  padding: 14px 0 8px;
  border-top: 1px solid var(--border-color);
}

.bmi-value {
  font-size: 48px;
  font-weight: 800;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  transition: color 0.2s ease;
}

.bmi-level {
  font-size: 16px;
  font-weight: 700;
  margin-top: 2px;
}

.bmi-range {
  font-size: 11.5px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.bmi-advice {
  font-size: 12px;
  color: var(--text-primary);
  background: var(--search-bg);
  border-radius: 8px;
  padding: 10px 12px;

  p {
    margin: 0;
  }

  .bmi-hint {
    margin-top: 4px;
    color: var(--text-secondary);
    font-size: 11.5px;
  }
}

/* 标尺区 */
.bmi-scale-wrap {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  padding: 0 8px;
}

.bmi-scale {
  position: relative;
  display: flex;
  height: 34px;
  border-radius: 8px;
  overflow: visible;
}

.bmi-scale-seg {
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.95);
  font-size: 11px;
  font-weight: 700;
  transition: all 0.2s ease;

  &:first-child {
    border-radius: 8px 0 0 8px;
  }

  &:last-child {
    border-radius: 0 8px 8px 0;
  }

  &.active {
    transform: scaleY(1.22);
    box-shadow: var(--shadow-base);
  }
}

.bmi-pointer {
  position: absolute;
  top: -18px;
  transform: translateX(-50%);
  color: var(--text-primary);
  font-size: 18px;
  transition: left 0.25s ease;
}

.bmi-scale-nums {
  display: flex;
  justify-content: space-between;
  font-size: 10.5px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  padding: 0 2px;
}
</style>
