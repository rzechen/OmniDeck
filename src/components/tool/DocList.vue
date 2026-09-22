<template>
  <div class="doc-list">
    <!-- 搜索栏 -->
    <div class="doc-search">
      <i class="el-icon-search"></i>
      <input v-model="keyword" placeholder="搜索关键词…" />
      <span v-if="keyword" class="doc-count">{{ filtered.length }} / {{ rows.length }}</span>
      <i
        v-if="keyword"
        class="el-icon-circle-close doc-clear"
        title="清空"
        @click="keyword = ''"
      ></i>
    </div>
    <!-- 表格 -->
    <div class="doc-table-wrap">
      <table class="doc-table" :class="{ 'is-empty': !filtered.length }">
        <thead>
          <tr>
            <th v-for="c in columns" :key="c.key">{{ c.title }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in filtered" :key="i">
            <td
              v-for="c in columns"
              :key="c.key"
              :class="{ 'is-mono': c.mono, 'is-tag': c.tag }"
              @click="c.copy && copyCell(row[c.key])"
            >
              <template v-if="c.copy && row[c.key]">{{ row[c.key] }}<i class="el-icon-document-copy doc-copy"></i></template>
              <template v-else>{{ row[c.key] }}</template>
            </td>
          </tr>
          <tr v-if="!filtered.length">
            <td :colspan="columns.length" class="doc-empty">无匹配结果</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<script>
// 速查类工具共享组件：搜索 + 表格渲染
// rows: [{ col1: v, col2: v, ... }]
// columns: [{ key, title, mono?, copy?, tag? }]
export default {
  name: 'DocList',
  props: {
    rows: { type: Array, required: true },
    columns: { type: Array, required: true }
  },
  data() {
    return { keyword: '' }
  },
  computed: {
    filtered() {
      const k = this.keyword.trim().toLowerCase()
      if (!k) return this.rows
      return this.rows.filter(r =>
        this.columns.some(c => String(r[c.key] ?? '').toLowerCase().includes(k))
      )
    }
  },
  methods: {
    copyCell(v) {
      navigator.clipboard.writeText(String(v)).then(() => {
        this.$message({ message: `已复制：${v}`, type: 'success', duration: 1200 })
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.doc-list {
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
    font-size: 13px;
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

  .doc-count {
    font-size: 11px;
    color: var(--text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .doc-clear {
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

.doc-table-wrap {
  flex: 1;
  min-height: 0;
  overflow: auto;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg);
  -webkit-app-region: no-drag;
}

.doc-table {
  width: 100%;
  font-size: 12.5px;
  border-collapse: collapse;

  /* 空状态：表格撑满容器，空行拉伸后 td 内容默认垂直居中 */
  &.is-empty {
    height: 100%;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    padding: 8px 14px;
    text-align: left;
    font-weight: 600;
    font-size: 11px;
    color: var(--text-secondary);
    /* 半透明 search-bg 叠加在不透明底色上：sticky 滚动时内容不透出 */
    background-color: var(--card-bg);
    background-image: linear-gradient(var(--search-bg), var(--search-bg));
    border-bottom: 1px solid var(--border-color);
    white-space: nowrap;
  }

  td {
    padding: 7px 14px;
    border-bottom: 1px solid var(--border-color);
    color: var(--text-primary);
    white-space: nowrap;
  }

  tbody tr:hover td {
    background: rgba(var(--primary-color-rgb), 0.04);
  }

  .is-mono {
    font-family: 'SF Mono', Menlo, monospace;
    font-variant-numeric: tabular-nums;
  }

  .is-tag {
    font-weight: 600;
    color: var(--primary-color);
  }

  td[cursor] {
    cursor: pointer;
  }

  .doc-copy {
    margin-left: 6px;
    font-size: 11px;
    color: var(--text-secondary);
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  td:hover .doc-copy {
    opacity: 1;
  }
}

.doc-empty {
  text-align: center;
  color: var(--text-secondary);
}
</style>
