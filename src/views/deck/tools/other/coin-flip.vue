<template>
  <tool-shell
    title="抛硬币"
    desc="硬币正反面决定，附历史统计"
    icon="coin"
    color="#FAAD14"
    back-path="/tools/other"
  >
    <template #toolbar>
      <button class="tool-btn is-primary" :disabled="flipping" @click="flip">
        <svg-icon :icon-class="(flipping ? 'loading' : 'coin')" />
        {{ flipping ? '翻转中…' : '抛硬币' }}
      </button>
      <button class="tool-btn" @click="flip10">连抛 10 次</button>
      <button class="tool-btn is-danger" @click="reset">
        <svg-icon icon-class="delete" />
        清空统计
      </button>
    </template>

    <div class="coin-layout">
      <!-- 硬币 -->
      <div class="coin-stage">
        <div
          class="coin"
          :class="{ flipping, 'is-heads': face === 'heads', 'is-tails': face === 'tails' }"
          @click="flip"
        >
          <div class="coin-face coin-front">正</div>
          <div class="coin-face coin-back">反</div>
        </div>
        <div v-if="lastResult" class="coin-result" :key="flipCount">{{ lastResult }}</div>
      </div>

      <!-- 统计 -->
      <div class="coin-stats">
        <div class="coin-stat-card">
          <span class="coin-stat-label">总次数</span>
          <span class="coin-stat-value mono">{{ total }}</span>
        </div>
        <div class="coin-stat-card">
          <span class="coin-stat-label">正面</span>
          <span class="coin-stat-value mono is-h">{{ heads }}</span>
          <div class="coin-bar">
            <span class="coin-bar-fill h" :style="{ width: headsPct + '%' }"></span>
          </div>
          <span class="coin-stat-pct mono">{{ headsPct }}%</span>
        </div>
        <div class="coin-stat-card">
          <span class="coin-stat-label">反面</span>
          <span class="coin-stat-value mono is-t">{{ tails }}</span>
          <div class="coin-bar">
            <span class="coin-bar-fill t" :style="{ width: tailsPct + '%' }"></span>
          </div>
          <span class="coin-stat-pct mono">{{ tailsPct }}%</span>
        </div>
        <!-- 历史序列 -->
        <div v-if="history.length" class="coin-history">
          <span
            v-for="(h, i) in history"
            :key="i"
            class="coin-dot"
            :class="h"
            :title="h === 'heads' ? '正面' : '反面'"
          >{{ h === 'heads' ? '正' : '反' }}</span>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>crypto 随机 · 点击硬币也可抛</span>
      <span class="status-right">正反面概率各 50%</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'OtherCoinFlip',
  components: { ToolShell },
  data() {
    return {
      face: 'heads',
      flipping: false,
      lastResult: '',
      flipCount: 0,
      heads: 0,
      tails: 0,
      history: []
    }
  },
  computed: {
    total() {
      return this.heads + this.tails
    },
    headsPct() {
      return this.total ? Math.round((this.heads / this.total) * 100) : 50
    },
    tailsPct() {
      return this.total ? 100 - this.headsPct : 50
    }
  },
  methods: {
    // 加密级随机：单次 0/1
    randomBit() {
      const arr = new Uint8Array(1)
      crypto.getRandomValues(arr)
      return arr[0] % 2
    },
    flip() {
      if (this.flipping) return
      this.flipping = true
      this.lastResult = ''
      setTimeout(() => {
        const bit = this.randomBit()
        this.face = bit === 0 ? 'heads' : 'tails'
        if (bit === 0) this.heads++
        else this.tails++
        this.history.push(this.face)
        if (this.history.length > 50) this.history.shift()
        this.lastResult = bit === 0 ? '正面' : '反面'
        this.flipCount++
        this.flipping = false
      }, 650)
    },
    async flip10() {
      for (let i = 0; i < 10; i++) {
        if (this.flipping) await new Promise(r => setTimeout(r, 120))
        this.flip()
        await new Promise(r => setTimeout(r, 700))
      }
    },
    reset() {
      this.heads = 0
      this.tails = 0
      this.history = []
      this.lastResult = ''
    }
  }
}
</script>

<style lang="scss" scoped>
.coin-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 20px;
}

.coin-stage {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  -webkit-app-region: no-drag;
}

.coin {
  width: 150px;
  height: 150px;
  position: relative;
  cursor: pointer;
  transform-style: preserve-3d;
  transition: transform 0.6s cubic-bezier(0.2, 0.7, 0.3, 1);

  &.is-heads {
    transform: rotateY(0deg);
  }

  &.is-tails {
    transform: rotateY(180deg);
  }

  &.flipping {
    animation: coin-spin 0.6s cubic-bezier(0.3, 0.6, 0.4, 1);
  }
}

@keyframes coin-spin {
  0% {
    transform: rotateY(0deg) translateY(0);
  }
  50% {
    transform: rotateY(900deg) translateY(-46px);
  }
  100% {
    transform: rotateY(1080deg) translateY(0);
  }
}

.coin-face {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 52px;
  font-weight: 800;
  backface-visibility: hidden;
  box-shadow: inset 0 0 0 6px rgba(184, 134, 11, 0.25), 0 8px 24px rgba(0, 0, 0, 0.18);
  background: radial-gradient(circle at 32% 30%, #ffe9a8, #e6b422 58%, #c9971a);
  color: #8a5d0a;
}

.coin-back {
  transform: rotateY(180deg);
  background: radial-gradient(circle at 32% 30%, #e8e8ed, #b9b9c2 58%, #a2a2ac);
  color: #55555e;
}

.coin-result {
  font-size: 22px;
  font-weight: 800;
  color: var(--primary-color);
  animation: pop-in 0.3s ease;
}

@keyframes pop-in {
  from {
    transform: scale(0.6);
    opacity: 0;
  }
  to {
    transform: scale(1);
    opacity: 1;
  }
}

.coin-stats {
  flex: 0 0 280px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.coin-stat-card {
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto auto;
  align-items: center;
  column-gap: 10px;
  row-gap: 5px;
  padding: 12px 14px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.coin-stat-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.coin-stat-value {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-primary);
  grid-column: 3;
  grid-row: 1;

  &.is-h {
    color: #e6b422;
  }

  &.is-t {
    color: #8c8c99;
  }
}

.coin-stat-card .coin-stat-label {
  grid-column: 1;
  grid-row: 1;
}

.coin-bar {
  grid-column: 1 / 4;
  grid-row: 2;
  height: 5px;
  border-radius: 3px;
  background: var(--search-bg);
  overflow: hidden;
}

.coin-bar-fill {
  display: block;
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;

  &.h {
    background: #e6b422;
  }

  &.t {
    background: #8c8c99;
  }
}

.coin-stat-pct {
  grid-column: 2;
  grid-row: 1;
  justify-self: start;
  font-size: 11px;
  color: var(--text-secondary);
}

.coin-history {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 10px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.coin-dot {
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 700;
  color: #fff;

  &.heads {
    background: #d9a514;
  }

  &.tails {
    background: #8c8c99;
  }
}
</style>
