<template>
  <tool-shell
    title="特殊符号"
    desc="数学、箭头、希腊字母等符号一键复制"
    icon="symbol"
    color="#FAAD14"
    back-path="/tools/other"
  >
    <div class="sym-body">
      <div class="doc-search">
        <i class="el-icon-search"></i>
        <input v-model="keyword" placeholder="搜索符号…" />
        <span v-if="keyword" class="sym-count">{{ matchCount }} / {{ total }}</span>
        <i
          v-if="keyword"
          class="el-icon-circle-close sym-clear"
          title="清空"
          @click="keyword = ''"
        ></i>
      </div>
      <div class="sym-groups">
        <div v-for="g in visibleGroups" :key="g.name" class="sym-group">
          <div class="sym-group-title">{{ g.name }}</div>
          <div class="sym-grid">
            <button
              v-for="(s, i) in g.symbols"
              :key="g.name + i"
              class="sym-item"
              :title="'点击复制 ' + s"
              @click="copy(s)"
            >{{ s }}</button>
          </div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ total }} 个符号 · 点击复制</span>
      <span class="status-right">{{ groups.length }} 个分类</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'OtherSpecialSymbol',
  components: { ToolShell },
  data() {
    return {
      keyword: '',
      groups: [
        {
          name: '数学符号',
          symbols: ['±', '×', '÷', '≠', '≤', '≥', '≈', '≡', '∞', '∝', '√', '∑', '∏', '∮', '∫', '∵', '∴', '∈', '∉', '⊂', '⊃', '⊆', '⊇', '∩', '∪', '∠', '⊥', '∥', '⊕', '⊗', '⊿']
        },
        {
          name: '箭头符号',
          symbols: ['←', '→', '↑', '↓', '↔', '↕', '↖', '↗', '↘', '↙', '⇐', '⇒', '⇑', '⇓', '⇔', '⇕', '➜', '➤', '⤴', '⤵']
        },
        {
          name: '希腊字母',
          symbols: ['α', 'β', 'γ', 'δ', 'ε', 'ζ', 'η', 'θ', 'ι', 'κ', 'λ', 'μ', 'ν', 'ξ', 'ο', 'π', 'ρ', 'σ', 'τ', 'υ', 'φ', 'χ', 'ψ', 'ω', 'Γ', 'Δ', 'Θ', 'Λ', 'Ξ', 'Π', 'Σ', 'Φ', 'Ψ', 'Ω']
        },
        {
          name: '单位符号',
          symbols: ['°', '℃', '℉', '′', '″', '＃', '＆', '＠', '‰', '㎡', '㎥', '℃', '¤', '€', '£', '¥', '¢', '№']
        },
        {
          name: '序号符号',
          symbols: ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩', '⑪', '⑫', '⑬', '⑭', '⑮', '⑯', '⑰', '⑱', '⑲', '⑳', '⑴', '⑵', '⑶', '⒈', '⒉', '⒊', '⒋', '⒌', '❶', '❷', '❸', '❹', '❺', '❻', '❼', '❽', '❾', '❿']
        },
        {
          name: '标点符号',
          symbols: ['，', '。', '、', '；', '：', '？', '！', '…', '—', '～', '·', '『', '』', '「', '」', '【', '】', '（', '）', '《', '》', '〈', '〉', '〖', '〗', '［', '］', '｛', '｝']
        },
        {
          name: '心形 & 星形',
          symbols: ['♥', '❤', '♡', '❥', '❣', '❦', '❧', '★', '☆', '✦', '✧', '✩', '✪', '✫', '✬', '✭', '✮', '✯', '⭐', '🌟', '💫', '⭐️']
        },
        {
          name: '勾叉符号',
          symbols: ['√', '×', '✓', '✔', '✗', '✘', '☑', '☒', 'POSITI', '☰', '☱', '☲', '☳', '☴', '☵', '☶', '☷']
        },
        {
          name: '音乐符号',
          symbols: ['♩', '♪', '♫', '♬', '♭', '♮', '♯', ' 𝄞', ' 𝄢']
        },
        {
          name: '法律符号',
          symbols: ['©', '®', '™', '§', '¶', '※', '〒']
        }
      ]
    }
  },
  computed: {
    visibleGroups() {
      const k = this.keyword.trim()
      if (!k) return this.groups
      return this.groups
        .map(g => ({
          name: g.name,
          symbols: g.symbols.filter(s => s.includes(k))
        }))
        .filter(g => g.symbols.length)
    },
    matchCount() {
      return this.visibleGroups.reduce((s, g) => s + g.symbols.length, 0)
    },
    total() {
      return this.groups.reduce((s, g) => s + g.symbols.length, 0)
    }
  },
  methods: {
    copy(s) {
      navigator.clipboard.writeText(s).then(() => {
        this.$message({ message: `已复制 ${s}`, type: 'success', duration: 1000 })
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.sym-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.doc-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 28px;
  padding: 0 10px;
  background: var(--search-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  flex-shrink: 0;
  transition: all 0.16s ease;

  &:focus-within {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
    background: var(--card-bg);
  }

  i {
    color: var(--text-secondary);
  }

  input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: var(--text-primary);

    &::placeholder {
      color: var(--text-secondary);
    }
  }

  .sym-count {
    font-size: 11px;
    color: var(--text-secondary);
  }

  .sym-clear {
    font-size: 13px;
    color: var(--text-secondary);
    cursor: pointer;
    flex-shrink: 0;
    border-radius: 50%;
    transition: all 0.15s ease;

    &:hover {
      color: var(--text-primary);
      transform: scale(1.1);
    }
  }
}

.sym-groups {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
  -webkit-app-region: no-drag;
  padding-right: 2px;
}

.sym-group-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-secondary);
  margin-bottom: 6px;
}

.sym-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.sym-item {
  min-width: 36px;
  height: 36px;
  padding: 0 8px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  background: var(--card-bg);
  font-size: 16px;
  color: var(--text-primary);
  cursor: pointer;
  transition: all 0.13s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    color: var(--primary-color);
    transform: translateY(-2px);
    box-shadow: var(--shadow-sm);
  }

  &:active {
    transform: scale(0.92);
  }
}
</style>
