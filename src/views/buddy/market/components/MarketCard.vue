<template>
  <!-- 市场项卡片：分组展示模式与单类网格模式共用（合并原页面两段重复标记） -->
  <div class="ob-market-card" @click="$emit('click', item)">
    <div class="ob-market-card-head">
      <div class="ob-market-logo" :class="logoClass(item)">
        <svg-icon :icon-class="typeIcon(marketType(item))" />
      </div>
      <div class="ob-market-card-title">
        <div class="ob-market-name" :title="item.name">
          {{ item.name }}
        </div>
        <div class="ob-market-meta">
          v{{ item.version }}<template v-if="item.author"> · {{ item.author }}</template>
        </div>
      </div>
      <span v-if="item.hasUpdate" class="ob-market-badge update">可更新</span>
    </div>

    <p class="ob-market-desc">{{ item.description || '暂无详细描述' }}</p>

    <div class="ob-market-tags" v-if="item.tags && item.tags.length">
      <span v-for="t in item.tags.slice(0, 3)" :key="t" class="ob-market-tag">{{ t }}</span>
    </div>

    <div class="ob-market-foot">
      <div class="ob-foot-info">
        <span v-if="item.updatedAt" class="ob-local-version">
          {{ formatDate(item.updatedAt) }}
        </span>
        <span
          v-if="item.installed && item.installedVersion && item.installedVersion !== item.version"
          class="ob-local-version"
        >
          已装 v{{ item.installedVersion }}
        </span>
      </div>
      <div class="ob-foot-action">
        <el-button
          v-if="item.hasUpdate"
          size="mini"
          round
          type="warning"
          class="ob-action-btn"
          :loading="busyId === item.id"
          :disabled="!!busyId && busyId !== item.id"
          @click.stop="$emit('update', item)"
        >更新</el-button>
        <el-button
          v-else
          size="mini"
          round
          :type="item.installed ? 'default' : 'primary'"
          :plain="!item.installed"
          class="ob-action-btn"
          :loading="busyId === item.id"
          :disabled="!!busyId && busyId !== item.id"
          @click.stop="$emit('install', item)"
        >{{ item.installed ? '重新安装' : '安装' }}</el-button>
      </div>
    </div>
  </div>
</template>

<script>
// 市场项卡片（纯展示组件）：
// 点击整卡 / 安装 / 更新动作均通过事件上抛，业务逻辑（IPC、状态回写）保留在页面
export default {
  name: 'MarketCard',
  props: {
    // 市场项（含 installed / installedVersion / hasUpdate 等本地状态字段）
    item: { type: Object, required: true },
    // 安装/更新中的项 id（控制按钮 loading 态与互斥禁用）
    busyId: { type: String, default: '' }
  },
  methods: {
    // ---------- 展示辅助（与页面原实现保持一致） ----------
    marketType(it) {
      const t = it.type || 'skill'
      if (t === 'workflow' || t === 'skill') return 'skill'
      if (t === 'connector' || t === 'mcp') return 'connector'
      return t
    },
    typeIcon(type) {
      if (type === 'connector' || type === 'mcp') return 'mcp'
      if (type === 'agent') return 'subagent'
      return 'skill'
    },
    logoClass(it) {
      const t = this.marketType(it)
      return 'logo-' + (t === 'connector' ? 'connector' : t === 'agent' ? 'agent' : 'skill')
    },
    formatDate(v) {
      if (!v) return ''
      const d = new Date(v)
      if (isNaN(d.getTime())) return String(v)
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

.ob-market-card {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.08));
  border-radius: $radius-lg;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  cursor: pointer;

  &:hover {
    border-color: rgba(var(--primary-color-rgb, 91, 124, 240), 0.35);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
    transform: translateY(-2px);
  }
}

.ob-market-card-head {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  margin-bottom: 10px;
}

.ob-market-logo {
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  &.logo-skill {
    background: linear-gradient(135deg, rgba(124, 156, 255, 0.15), rgba(91, 124, 240, 0.25));
    color: #4365DF;
  }

  &.logo-agent {
    background: linear-gradient(135deg, rgba(232, 168, 124, 0.15), rgba(217, 138, 95, 0.25));
    color: #C86B3C;
  }

  &.logo-connector {
    background: linear-gradient(135deg, rgba(107, 197, 160, 0.15), rgba(70, 168, 127, 0.25));
    color: #2E8B63;
  }

  .svg-icon {
    font-size: 20px;
  }
}

.ob-market-card-title {
  flex: 1;
  min-width: 0;
}

.ob-market-name {
  font-size: 14px;
  font-weight: 700;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.3;
}

.ob-market-meta {
  margin-top: 3px;
  font-size: 11px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 可更新徽标 */
.ob-market-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;

  &.update {
    color: #d97706;
    background: rgba(245, 158, 11, 0.12);
  }
}

.ob-market-desc {
  margin: 0 0 12px 0;
  font-size: 12px;
  color: $text-secondary;
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  height: 36px; /* 锁定两行高度保持卡片规整 */
}

.ob-market-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 14px;
}

.ob-market-tag {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 4px;
  color: $text-secondary;
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
}

/* 卡片底部操作栏（极简、无无用超链接） */
.ob-market-foot {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--border-color, rgba(0, 0, 0, 0.04));
  display: flex;
  align-items: center;
  justify-content: space-between;

  .ob-foot-info {
    font-size: 11px;

    .ob-local-version {
      color: $text-secondary;
      background: var(--bg-hover, rgba(0, 0, 0, 0.04));
      padding: 1px 5px;
      border-radius: 4px;
    }
  }

  .ob-foot-action {
    margin-left: auto;

    .ob-action-btn {
      font-weight: 600;
      padding: 6px 14px;
    }
  }
}
</style>
