<template>
  <div class="unit-converter">
    <!-- 输入区：数值 + 源单位 -->
    <div class="uc-input-bar">
      <div class="uc-field">
        <span class="uc-label">数值</span>
        <input
          v-model="rawValue"
          class="uc-input"
          type="text"
          inputmode="decimal"
          placeholder="输入数值，实时换算"
          @input="onInput"
        />
      </div>
      <el-select v-model="fromKey" class="uc-select" size="small" @change="onInput">
        <el-option
          v-for="u in units"
          :key="u.key"
          :label="u.label"
          :value="u.key"
        />
      </el-select>
      <button class="tool-btn" @click="clearInput">
        <i class="el-icon-delete"></i>
        清空
      </button>
    </div>

    <!-- 结果网格：点击卡片复制 -->
    <div class="uc-grid">
      <div
        v-for="u in units"
        :key="u.key"
        class="uc-cell"
        :class="{ 'is-source': u.key === fromKey }"
        :title="results[u.key] !== null ? '点击复制 ' + results[u.key] : ''"
        @click="copyResult(u)"
      >
        <div class="uc-cell-value">{{ display(results[u.key]) }}</div>
        <div class="uc-cell-label">
          {{ u.label }}
          <i v-if="u.key === fromKey" class="el-icon-edit uc-source-mark"></i>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
// 换算页共享组件：配置驱动的实时单位换算
// units: [{ key, label, factor }]（factor：1 该单位 = factor 标准单位）
//        或 [{ key, label, toStd(v), fromStd(v) }]（非线性单位如温度）
export default {
  name: 'UnitConverter',
  props: {
    units: { type: Array, required: true },
    defaultFrom: { type: String, default: '' },
    // 初始数值：进入页面即展示完整换算结果
    defaultValue: { type: [String, Number], default: '' }
  },
  data() {
    return {
      rawValue: String(this.defaultValue ?? ''),
      fromKey: this.defaultFrom || (this.units[0] && this.units[0].key),
      results: {}
    }
  },
  created() {
    // 初始化各单位结果为空
    this.units.forEach(u => { this.results[u.key] = null })
    this.onInput()
  },
  methods: {
    onInput() {
      const v = parseFloat(this.rawValue)
      if (this.rawValue.trim() === '' || isNaN(v)) {
        this.units.forEach(u => {
          this.results[u.key] = null
        })
        return
      }
      const from = this.units.find(u => u.key === this.fromKey)
      if (!from) return
      // 先转标准单位再散出到各单位
      let std
      if (typeof from.toStd === 'function') {
        std = from.toStd(v)
      } else {
        std = v * from.factor
      }
      this.units.forEach(u => {
        let out
        if (typeof u.fromStd === 'function') {
          out = u.fromStd(std)
        } else {
          out = std / u.factor
        }
        this.results[u.key] = this.format(out)
      })
    },
    // 数值美化：大数/小数自适应精度，去多余尾零
    format(val) {
      if (!isFinite(val)) return val.toString()
      const abs = Math.abs(val)
      let s
      if (abs !== 0 && (abs >= 1e12 || abs < 1e-6)) {
        s = val.toExponential(6).replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e')
      } else {
        s = parseFloat(val.toPrecision(12)).toString()
      }
      return s
    },
    display(v) {
      return v === null || v === undefined ? '—' : v
    },
    copyResult(u) {
      const v = this.results[u.key]
      if (v === null || v === undefined) return
      navigator.clipboard.writeText(String(v)).then(() => {
        this.$message({
          message: `已复制：${v} ${u.label}`,
          type: 'success',
          duration: 1200
        })
      })
    },
    clearInput() {
      this.rawValue = ''
      this.onInput()
    }
  }
}
</script>

<style lang="scss" scoped>
.unit-converter {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

/* ============ 输入区 ============ */
.uc-input-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: $shadow-sm;
  flex-shrink: 0;
}

.uc-field {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.uc-label {
  font-size: 10.5px;
  color: $text-secondary;
}

.uc-input {
  width: 100%;
  border: none;
  outline: none;
  background: transparent;
  font-size: 26px;
  font-weight: 600;
  color: $text-primary;
  font-variant-numeric: tabular-nums;

  &::placeholder {
    font-size: 14px;
    font-weight: 400;
    color: $text-secondary;
  }
}

.uc-select {
  width: 180px;
  flex-shrink: 0;
}

/* ============ 结果网格 ============ */
.uc-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 10px;
  align-content: start;
}

.uc-cell {
  padding: 12px 14px;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.16s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: $shadow-base;
    border-color: rgba(var(--primary-color-rgb), 0.35);

    .uc-cell-value {
      color: $primary-color;
    }
  }

  &.is-source {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    background: rgba(var(--primary-color-rgb), 0.04);
  }
}

.uc-cell-value {
  font-size: 16px;
  font-weight: 700;
  color: $text-primary;
  font-variant-numeric: tabular-nums;
  word-break: break-all;
  line-height: 1.3;
  transition: color 0.16s ease;
}

.uc-cell-label {
  margin-top: 4px;
  font-size: 11px;
  color: $text-secondary;
  display: flex;
  align-items: center;
  gap: 4px;
}

.uc-source-mark {
  font-size: 11px;
  color: $primary-color;
}
</style>
