<template>
  <!-- 市场项卡片：分组展示模式与单类网格模式共用（合并原页面两段重复标记） -->
  <div class="ob-market-card" @click="emit('click', item)">
    <div class="ob-market-card-head">
      <!-- 图标：v4 索引内联 base64 优先；缺省回落类型图标 -->
      <div class="ob-market-logo" :class="logoClass(item)">
        <img v-if="iconSrc" :src="iconSrc" class="logo-img" alt="" />
        <svg-icon v-else :icon-class="typeIcon(marketType(item))" />
      </div>
      <div class="ob-market-card-title">
        <div class="ob-market-name" :title="item.name">
          {{ item.name }}
          <span v-if="item.verified" class="ob-verified" title="官方认证">✓</span>
        </div>
        <div class="ob-market-meta">
          <!-- 本地目录包：显示文件数；远程语义版本：v 前缀 -->
          <template v-if="item.version === 'local'">本地包<template v-if="item.fileCount"> · {{ item.fileCount }} 个文件</template></template>
          <template v-else>v{{ item.version }}<template v-if="item.author"> · {{ item.author }}</template></template>
        </div>
      </div>
      <span v-if="item.hasUpdate" class="ob-market-badge update">可更新</span>
    </div>

    <p class="ob-market-desc">{{ item.description || '暂无详细描述' }}</p>

    <div class="ob-market-tags" v-if="item.tags && item.tags.length">
      <span v-for="t in item.tags.slice(0, 3)" :key="t" class="ob-market-tag">{{ t }}</span>
    </div>

    <!-- v4 运营统计：AI 评分 / 下载 / 收藏（缺省隐藏整行） -->
    <div class="ob-market-stats" v-if="item.aiScore || item.downloads || item.favorites">
      <span v-if="item.aiScore" class="ob-stat ai" :title="'AI 评分 ' + item.aiScore + ' / 5'">
        <svg-icon icon-class="star" class="stat-icon" />{{ item.aiScore }}
      </span>
      <span v-if="item.downloads" class="ob-stat">
        <svg-icon icon-class="download" class="stat-icon" />{{ formatCount(item.downloads) }}
      </span>
      <span v-if="item.favorites" class="ob-stat">
        <svg-icon icon-class="star" class="stat-icon" />{{ formatCount(item.favorites) }}
      </span>
      <span v-if="item.requiresApiKey" class="ob-stat key" title="使用前需配置 API Key">
        <svg-icon icon-class="lock" class="stat-icon" />需 Key
      </span>
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
          size="small"
          round
          type="warning"
          class="ob-action-btn"
          :loading="busyId === item.id"
          :disabled="!!busyId && busyId !== item.id"
          @click.stop="emit('update', item)"
        >更新</el-button>
        <el-button
          v-else
          size="small"
          round
          :type="item.installed ? 'default' : 'primary'"
          :plain="!item.installed"
          class="ob-action-btn"
          :loading="busyId === item.id"
          :disabled="!!busyId && busyId !== item.id"
          @click.stop="emit('install', item)"
        >{{ item.installed ? '重新安装' : '安装' }}</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

// 市场项卡片（纯展示组件）：
// 点击整卡 / 安装 / 更新动作均通过事件上抛，业务逻辑（IPC、状态回写）保留在页面
defineOptions({ name: 'MarketCard' })

// 声明自定义事件：阻止父级 @click fallthrough 到根元素，
// 避免原生 click 与 $emit('click', item) 双触发（openDetail 先收到原生 Event）
const emit = defineEmits(['click', 'install', 'update'])

const props = defineProps({
  // 市场项（含 installed / installedVersion / hasUpdate 等本地状态字段）
  item: { type: Object, required: true },
  // 安装/更新中的项 id（控制按钮 loading 态与互斥禁用）
  busyId: { type: String, default: '' }
})

// v4 图标：iconBase64 内联 data URL（避免外链依赖）；旧索引无图标回落类型图标
const iconSrc = computed(() => {
  if (!props.item.iconBase64) return ''
  const mime = props.item.iconMime || 'image/png'
  return `data:${mime};base64,${props.item.iconBase64}`
})

// ---------- 展示辅助（与页面原实现保持一致） ----------
function marketType(it) {
  const t = it.type || 'skill'
  if (t === 'workflow' || t === 'skill') return 'skill'
  if (t === 'connector' || t === 'mcp') return 'connector'
  return t
}

function typeIcon(type) {
  if (type === 'connector' || type === 'mcp') return 'mcp'
  if (type === 'agent') return 'subagent'
  return 'skill'
}

function logoClass(it) {
  const t = marketType(it)
  return 'logo-' + (t === 'connector' ? 'connector' : t === 'agent' ? 'agent' : 'skill')
}

function formatDate(v) {
  if (!v) return ''
  const d = new Date(v)
  if (isNaN(d.getTime())) return String(v)
  const pad = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

// 数量缩写：1.8 万式中文展示（≥1 万缩写，其余原样）
function formatCount(n) {
  const num = Number(n) || 0
  if (num >= 100000000) return (num / 100000000).toFixed(1).replace(/\.0$/, '') + ' 亿'
  if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + ' 万'
  return String(num)
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

.ob-market-card {
  display: flex;
  flex-direction: column;
  padding: 16px;
  // 无边框卡片：surface 底色分层，hover 才浮起变亮
  background: $surface-muted;
  border-radius: $radius-lg;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  position: relative;
  cursor: pointer;

  &:hover {
    background: var(--card-bg, #fff);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
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
  overflow: hidden;

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

  /* v4 内联图标：占满 logo 位，保留类型底色衬托 */
  .logo-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
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

/* 官方认证对勾（名称尾部） */
.ob-verified {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  margin-left: 4px;
  border-radius: 50%;
  font-size: 9px;
  font-weight: 700;
  color: #fff;
  background: var(--primary-color);
  vertical-align: 1px;
}

/* v4 运营统计行：AI 评分 / 下载 / 收藏 / 需 Key */
.ob-market-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 12px;
  font-size: 11px;
  color: $text-secondary;
}

.ob-stat {
  display: inline-flex;
  align-items: center;
  gap: 3px;

  .stat-icon {
    font-size: 12px;
  }

  &.ai {
    font-weight: 600;
    color: #d97706;
  }

  &.key {
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.05);
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
  border-top: 1px solid var(--divider, rgba(0, 0, 0, 0.05));
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
