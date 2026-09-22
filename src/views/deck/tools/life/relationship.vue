<template>
  <tool-shell
    title="亲戚称谓"
    desc="输入关系链，计算标准亲戚称谓"
    icon="family"
    color="#13C2C2"
    back-path="/tools/life"
  >
    <template #toolbar>
      <div class="tool-seg">
        <div class="tool-seg-item" :class="{ active: reverse }" @click="reverse = false">我称呼对方</div>
        <div class="tool-seg-item" :class="{ active: !reverse }" @click="reverse = true">对方称呼我</div>
      </div>
      <div class="tool-seg">
        <div class="tool-seg-item" :class="{ active: type === 'default' }" @click="type = 'default'">默认</div>
        <div class="tool-seg-item" :class="{ active: type === 'chain' }" @click="type = 'chain'">关系链</div>
        <div class="tool-seg-item" :class="{ active: type === 'pair' }" @click="type = 'pair'">合称</div>
      </div>
    </template>

    <div class="rel-layout">
      <div class="rel-input-zone">
        <div class="tool-seg">
          <div class="tool-seg-item" :class="{ active: sex === 1 }" @click="sex = 1">我是男性</div>
          <div class="tool-seg-item" :class="{ active: sex === 0 }" @click="sex = 0">我是女性</div>
        </div>
        <input
          v-model="text"
          class="rel-input"
          placeholder="如：爸爸的哥哥的女儿"
          @keyup.enter="calculate"
          @input="calculate"
        />
      </div>

      <!-- 快捷示例 -->
      <div class="rel-examples">
        <span
          v-for="ex in examples"
          :key="ex"
          class="rel-chip"
          @click="text = ex; calculate()"
        >{{ ex }}</span>
      </div>

      <!-- 结果 -->
      <div class="rel-result-zone">
        <div v-if="results.length" class="rel-results">
          <div
            v-for="(r, i) in results"
            :key="i"
            class="rel-result-card"
            @click="copy(r)"
          >
            {{ r }}
            <i class="el-icon-document-copy rel-copy"></i>
          </div>
        </div>
        <div v-else-if="text && calculated" class="rel-none">
          无法识别该关系链，试试其他表达
        </div>
        <div v-else class="rel-empty">
          <i class="el-icon-s-custom"></i>
          <p>输入关系链自动计算，如「妈妈的哥哥」「外婆的姐姐的儿子」</p>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ text ? '「' + text + '」' : '等待输入' }}</span>
      <span class="status-right">点击结果复制称谓</span>
    </template>
  </tool-shell>
</template>

<script>
import relationship from 'relationship.js'
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'LifeRelationship',
  components: { ToolShell },
  data() {
    return {
      text: '',
      sex: 1,
      reverse: false,
      type: 'default',
      results: [],
      calculated: false,
      examples: ['爸爸的哥哥', '妈妈的弟弟', '外婆的姐姐', '儿子的老婆', '女儿的儿子', '哥哥的儿子', '姐姐的女儿', '老婆的爸爸']
    }
  },
  methods: {
    calculate() {
      this.calculated = true
      if (!this.text.trim()) {
        this.results = []
        return
      }
      try {
        const res = relationship({
          text: this.text,
          sex: this.sex,
          type: this.type,
          reverse: this.reverse
        })
        this.results = Array.isArray(res) ? res : [res]
      } catch (e) {
        this.results = []
      }
    },
    copy(t) {
      navigator.clipboard.writeText(String(t)).then(() => {
        this.$message({ message: `已复制：${t}`, type: 'success', duration: 1200 })
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.rel-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.rel-input-zone {
  display: flex;
  gap: 12px;
  align-items: center;
}

.rel-input {
  flex: 1;
  height: 44px;
  padding: 0 18px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  outline: none;
  background: var(--search-bg);
  font-size: 15px;
  color: var(--text-primary);
  transition: all 0.16s ease;

  &:focus {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
    background: var(--card-bg);
  }

  &::placeholder {
    color: var(--text-secondary);
    font-size: 13px;
  }
}

.rel-examples {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.rel-chip {
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--search-bg);
  border: 1px solid var(--border-color);
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: var(--primary-color);
    border-color: rgba(var(--primary-color-rgb), 0.4);
    background: rgba(var(--primary-color-rgb), 0.05);
  }
}

.rel-result-zone {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
}

.rel-results {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  justify-content: center;
}

.rel-result-card {
  padding: 14px 26px;
  border-radius: 12px;
  background: var(--card-bg);
  border: 1.5px solid rgba(var(--primary-color-rgb), 0.4);
  font-size: 20px;
  font-weight: 700;
  color: var(--primary-color);
  cursor: pointer;
  transition: all 0.16s ease;
  display: flex;
  align-items: center;
  gap: 8px;

  &:hover {
    transform: translateY(-3px);
    box-shadow: var(--shadow-base);

    .rel-copy {
      opacity: 1;
    }
  }
}

.rel-copy {
  font-size: 14px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.rel-none {
  font-size: 13px;
  color: #F54A45;
}

.rel-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);

  i {
    font-size: 36px;
    opacity: 0.35;
  }

  p {
    font-size: 12.5px;
  }
}
</style>
