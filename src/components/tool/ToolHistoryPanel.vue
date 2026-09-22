<template>
  <transition name="history-slide">
    <div v-if="visible" class="history-panel">
      <div class="history-header">
        <div class="history-title">
          <i class="el-icon-time"></i>
          <span>执行历史</span>
          <span v-if="items.length" class="history-count">{{ items.length }}</span>
        </div>
        <div class="history-actions">
          <button class="history-act" title="刷新" @click="load">
            <i class="el-icon-refresh"></i>
          </button>
          <button class="history-act" title="清空本工具历史" @click="clearAll">
            <i class="el-icon-delete"></i>
          </button>
          <button class="history-act" title="关闭" @click="$emit('close')">
            <i class="el-icon-close"></i>
          </button>
        </div>
      </div>

      <div class="history-body">
        <div v-if="loading" class="history-empty">加载中…</div>
        <div v-else-if="!items.length" class="history-empty">
          <i class="el-icon-folder-opened empty-ico"></i>
          <p>暂无执行历史</p>
          <p class="empty-tip">执行「复制 / 转义 / 去转义」等操作后自动记录</p>
        </div>
        <div
          v-for="item in items"
          :key="item.id"
          class="history-item"
          @click="$emit('restore', item)"
        >
          <div class="item-preview">{{ item.preview || '（空）' }}</div>
          <div class="item-meta">
            <span>{{ fmtTime(item.ts) }}</span>
            <span>{{ fmtSize(item.size) }}</span>
            <span v-if="item.truncated" class="item-trunc" title="内容超 512KB 已截断">已截断</span>
            <span
              class="item-del"
              title="删除"
              @click.stop="removeOne(item)"
            >
              <i class="el-icon-close"></i>
            </span>
          </div>
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
// 工具执行历史面板：嵌入工具页右侧的抽屉列表
// 交互：点击记录 → restore 事件（父组件恢复输入）；单删 / 清空本工具
import * as history from '@/utils/tool-history'

export default {
  name: 'ToolHistoryPanel',
  props: {
    visible: { type: Boolean, default: false },
    // 工具 path（如 /tools/format/json）
    tool: { type: String, required: true }
  },
  data() {
    return {
      items: [],
      loading: false
    }
  },
  watch: {
    visible(v) {
      if (v) this.load()
    }
  },
  methods: {
    async load() {
      this.loading = true
      try {
        this.items = await history.list(this.tool)
      } finally {
        this.loading = false
      }
    },
    async removeOne(item) {
      await history.remove(item.id)
      this.items = this.items.filter(i => i.id !== item.id)
    },
    async clearAll() {
      try {
        await this.$confirm('将清空本工具的全部执行历史，是否继续？', '清空历史', {
          confirmButtonText: '清空',
          cancelButtonText: '取消',
          type: 'warning'
        })
      } catch (e) {
        return
      }
      await history.clear(this.tool)
      this.items = []
      this.$message.success('已清空本工具历史')
    },
    fmtTime(ts) {
      const d = new Date(ts)
      const pad = n => String(n).padStart(2, '0')
      const today = new Date()
      const isToday = d.toDateString() === today.toDateString()
      if (isToday) return `今天 ${pad(d.getHours())}:${pad(d.getMinutes())}`
      return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
    },
    fmtSize(n) {
      if (n < 1024) return `${n} 字符`
      return `${(n / 1024).toFixed(1)}K 字符`
    }
  }
}
</script>

<style lang="scss" scoped>
.history-panel {
  width: 240px;
  // 与左侧分栏的间距（tool-body 无 gap，与 split-pane 内部 gap 保持一致）
  margin-left: 10px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.history-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.history-title {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-primary);

  i {
    color: var(--primary-color);
    font-size: 13px;
  }
}

.history-count {
  font-size: 10px;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  border-radius: 8px;
  padding: 1px 6px;
  font-weight: 600;
}

.history-actions {
  display: flex;
  gap: 2px;
}

.history-act {
  width: 22px;
  height: 22px;
  border: none;
  background: transparent;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;

  i { font-size: 13px; }

  &:hover {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.08);
  }
}

.history-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.history-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 12px;

  .empty-ico {
    font-size: 26px;
    opacity: 0.45;
    margin-bottom: 4px;
  }

  .empty-tip {
    font-size: 11px;
    opacity: 0.7;
  }
}

.history-item {
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 9px;
  cursor: pointer;
  margin-bottom: 6px;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    background: rgba(var(--primary-color-rgb), 0.04);
  }
}

.item-preview {
  font-size: 11.5px;
  color: var(--text-primary);
  line-height: 1.45;
  // 纯文本摘要，两行截断
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  word-break: break-all;
  white-space: normal;
}

.item-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 5px;
  font-size: 10.5px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}

.item-trunc {
  color: #E6A23C;
}

.item-del {
  margin-left: auto;
  width: 16px;
  height: 16px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;

  i { font-size: 11px; }

  &:hover {
    color: #F54A45;
    background: rgba(245, 74, 69, 0.08);
  }
}

.history-item:hover .item-del {
  opacity: 1;
}

/* 侧滑入场 */
.history-slide-enter-active,
.history-slide-leave-active {
  transition: all 0.2s ease;
}

.history-slide-enter,
.history-slide-leave-to {
  opacity: 0;
  transform: translateX(12px);
}
</style>
