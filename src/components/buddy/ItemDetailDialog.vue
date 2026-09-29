<template>
  <!-- 资源详情抽屉：徽标头 + 信息卡（版本/更新时间/统计）+ 描述（Markdown 长文）+ 标签
       阅读型长内容 → 右侧全高抽屉，滚动更舒展 -->
  <transition name="ob-drawer">
    <div v-if="localVisible" class="ob-drawer" @click.self="localVisible = false">
      <div class="ob-drawer-panel ob-detail-panel">
        <!-- 标题栏：图标 + 名称 + 徽标 -->
        <header class="ob-drawer-header">
          <div v-if="item" class="ob-detail-head">
            <div class="ob-item-logo" :class="'logo-' + typeOf">
              <img v-if="iconSrc" :src="iconSrc" class="logo-img" alt="" />
              <svg-icon v-else :icon-class="iconOf" />
            </div>
            <div class="ob-detail-head-info">
              <div class="ob-detail-name">
                {{ item.name }}
                <span v-if="item.verified" class="ob-verified" title="官方认证">✓</span>
              </div>
              <div class="ob-detail-meta">
                <span class="ob-detail-badge">{{ typeLabel }}</span>
                <span v-if="item.categoryLabel" class="ob-detail-badge cat">
                  {{ item.categoryLabel }}
                </span>
                <span v-if="item.author" :title="item.authorHandle ? 'ID: ' + item.authorHandle : ''">{{ item.author }}</span>
                <span v-if="item.verified" class="ob-detail-badge verified">官方认证</span>
                <span v-if="item.requiresApiKey" class="ob-detail-badge key">需 API Key</span>
              </div>
            </div>
            <slot name="head-extra" :item="item"></slot>
          </div>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="localVisible = false" />
        </header>

        <div v-if="item" class="ob-drawer-body ob-detail-body">
          <!-- 顶部信息卡：版本 / 更新时间 / 自定义格（安装状态）/ 运营统计
               auto-fit + 1fr：任意格数都在整行内均匀分布 -->
          <div class="ob-detail-grid" v-if="item.version || item.updatedAt || $slots.cells || hasStats">
            <div class="ob-detail-cell" v-if="item.version">
              <div class="ob-cell-label">版本</div>
              <div class="ob-cell-value">v{{ item.version }}</div>
            </div>
            <div class="ob-detail-cell" v-if="item.updatedAt">
              <div class="ob-cell-label">更新时间</div>
              <div class="ob-cell-value">{{ formatDate(item.updatedAt) }}</div>
            </div>
            <!-- 作用域插槽：向页面下发 item（页面读取 item.installed 等安装状态字段） -->
            <slot name="cells" :item="item"></slot>
            <!-- v4 运营统计：下载 / 收藏 / 评论 / AI 评分 -->
            <div class="ob-detail-cell" v-if="item.downloads">
              <div class="ob-cell-label">下载</div>
              <div class="ob-cell-value">{{ formatCount(item.downloads) }}</div>
            </div>
            <div class="ob-detail-cell" v-if="item.favorites">
              <div class="ob-cell-label">收藏</div>
              <div class="ob-cell-value">{{ formatCount(item.favorites) }}</div>
            </div>
            <div class="ob-detail-cell" v-if="item.comments">
              <div class="ob-cell-label">评论</div>
              <div class="ob-cell-value">{{ formatCount(item.comments) }}</div>
            </div>
            <div class="ob-detail-cell" v-if="item.aiScore">
              <div class="ob-cell-label">AI 评分</div>
              <div class="ob-cell-value ai"> {{ item.aiScore }}</div>
            </div>
          </div>

          <!-- v4 AI 评分 TRACE 五维明细 -->
          <div class="ob-detail-section" v-if="aiDimensionList.length">
            <div class="ob-detail-section-title">AI 评估维度</div>
            <div class="ob-ai-dims">
              <div v-for="d in aiDimensionList" :key="d.key" class="ob-ai-dim">
                <span class="ob-ai-dim-label">{{ d.label }}</span>
                <div class="ob-ai-dim-bar">
                  <div class="ob-ai-dim-fill" :style="{ width: (d.value / 5 * 100) + '%' }"></div>
                </div>
                <span class="ob-ai-dim-value">{{ d.value }}</span>
              </div>
            </div>
          </div>

          <!-- 描述（Markdown 渲染，SKILL.md 正文可直接呈现标题/代码块/表格） -->
          <div class="ob-detail-section" v-if="item.details || item.description">
            <div class="ob-detail-section-title">描述</div>
            <div class="ob-detail-text ob-md" v-html="renderedDetails" @click="onMdClick"></div>
          </div>

          <!-- 标签 -->
          <div class="ob-detail-section" v-if="item.tags && item.tags.length">
            <div class="ob-detail-section-title">标签</div>
            <div class="ob-item-tags">
              <span v-for="t in item.tags" :key="t" class="ob-item-tag">{{ t }}</span>
            </div>
          </div>
        </div>

        <!-- 底部操作（页面自定义） -->
        <footer v-if="$slots.actions" class="ob-drawer-footer ob-detail-actions-footer">
          <div class="ob-detail-actions">
            <slot name="actions" :item="item"></slot>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script>
// 市场页与技能页共享的资源详情弹窗：
// 徽标头 + 信息卡 + 描述（Markdown 渲染）+ 标签；操作按钮经 actions slot 注入
// v4 索引新增：内联图标 / 官方认证 / 运营统计 / AI 五维评分
import { renderMarkdown, handleCodeCopy, handleTableCsv } from '@/utils/markdown'

export default {
  name: 'ItemDetailDialog',
  props: {
    visible: { type: Boolean, default: false },
    // { name, type, version, updatedAt, details, description, tags, changelog, author, categoryLabel,
    //   verified, authorHandle, downloads, favorites, comments, aiScore, aiDimensions, iconBase64, iconMime, requiresApiKey }
    item: { type: Object, default: null }
  },
  computed: {
    localVisible: {
      get() {
        return this.visible
      },
      set(val) {
        this.$emit('update:visible', val)
      }
    },
    // 描述区 Markdown 渲染结果（纯文本亦兼容：换行保留）
    renderedDetails() {
      return renderMarkdown(this.item.details || this.item.description || '暂无详细描述')
    },
    // v4 图标：iconBase64 内联 data URL；旧数据回落类型图标
    iconSrc() {
      if (!this.item || !this.item.iconBase64) return ''
      const mime = this.item.iconMime || 'image/png'
      return `data:${mime};base64,${this.item.iconBase64}`
    },
    // v4 运营统计是否至少一项可展示
    hasStats() {
      const it = this.item || {}
      return !!(it.downloads || it.favorites || it.comments || it.aiScore)
    },
    // TRACE 五维 → 展示列表（维度缺失时自动跳过）
    aiDimensionList() {
      const dims = this.item && this.item.aiDimensions
      if (!dims) return []
      const labels = {
        trust: '可信度',
        reliability: '可靠性',
        adaptability: '适应性',
        convention: '规范性',
        effectiveness: '有效性'
      }
      return Object.keys(labels)
        .filter(k => Number(dims[k]) > 0)
        .map(k => ({ key: k, label: labels[k], value: Number(dims[k]) }))
    },
    typeOf() {
      const t = this.item && this.item.type
      if (t === 'connector' || t === 'mcp') return 'connector'
      if (t === 'agent') return 'agent'
      return 'skill'
    },
    iconOf() {
      return this.typeOf === 'connector' ? 'mcp' : this.typeOf === 'agent' ? 'subagent' : 'skill'
    },
    typeLabel() {
      const map = { skill: '技能', agent: '子代理', connector: '连接器', mcp: '连接器' }
      return map[(this.item && this.item.type) || 'skill'] || '技能'
    }
  },
  methods: {
    // Markdown 区点击委托：代码块复制按钮（v-html 内容不归 Vue 管，走事件委托）
    onMdClick(e) {
      handleCodeCopy(e).then(ok => {
        if (ok) this.$message.success('已复制')
      })
      handleTableCsv(e).then(ok => {
        if (ok) this.$message.success('已下载 CSV')
      })
    },
    formatDate(v) {
      if (!v) return ''
      const d = new Date(v)
      if (isNaN(d.getTime())) return String(v)
      const pad = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
    },
    // 数量缩写：1.8 万式中文展示
    formatCount(n) {
      const num = Number(n) || 0
      if (num >= 100000000) return (num / 100000000).toFixed(1).replace(/\.0$/, '') + ' 亿'
      if (num >= 10000) return (num / 10000).toFixed(1).replace(/\.0$/, '') + ' 万'
      return String(num)
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* ===== 抽屉外观（自绘 ob-drawer，样式位于全局 buddy-settings.scss） ===== */
/* 面板宽度：阅读型内容适中偏宽 */
.ob-detail-panel {
  --ob-drawer-w: 640px;
}

.ob-detail-head {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  min-width: 0;
}

.ob-item-logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  overflow: hidden;

  .svg-icon {
    font-size: 26px;
  }

  /* v4 内联图标：占满 logo 位 */
  .logo-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

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
}

/* 官方认证对勾（名称尾部） */
.ob-verified {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin-left: 5px;
  border-radius: 50%;
  font-size: 10px;
  font-weight: 700;
  color: #fff;
  background: var(--primary-color);
  vertical-align: 1px;
}

.ob-detail-head-info {
  flex: 1;
  min-width: 0;
}

.ob-detail-name {
  font-size: 17px;
  font-weight: 700;
  color: $text-primary;
  line-height: 1.3;
}

.ob-detail-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 5px;
  font-size: 11.5px;
  color: $text-secondary;
}

.ob-detail-badge {
  padding: 1px 7px;
  border-radius: 4px;
  font-weight: 600;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);

  &.cat {
    color: #2E8B63;
    background: rgba(70, 168, 127, 0.1);
  }

  &.verified {
    color: #d97706;
    background: rgba(245, 158, 11, 0.12);
  }

  &.key {
    color: $text-secondary;
    background: rgba(0, 0, 0, 0.05);
  }
}

/* v4 AI 评分 TRACE 五维进度条 */
.ob-ai-dims {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ob-ai-dim {
  display: flex;
  align-items: center;
  gap: 10px;

  .ob-ai-dim-label {
    width: 52px;
    flex-shrink: 0;
    font-size: 12px;
    color: $text-secondary;
    text-align: right;
  }

  .ob-ai-dim-bar {
    flex: 1;
    height: 6px;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.06);
    overflow: hidden;
  }

  .ob-ai-dim-fill {
    height: 100%;
    border-radius: 3px;
    background: linear-gradient(90deg, rgba(var(--primary-color-rgb), 0.55), var(--primary-color));
  }

  .ob-ai-dim-value {
    width: 24px;
    flex-shrink: 0;
    font-size: 12px;
    font-weight: 600;
    color: $text-primary;
  }
}

/* 抽屉 body 内的 detail 区块间距复位（ob-drawer-body 自带 14px 列间距，去掉区块多余 margin） */
.ob-detail-body {
  .ob-detail-section {
    margin-bottom: 0;
  }
}

/* 顶部信息卡网格：固定一行三列，多余格子整行换行排布 */
.ob-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 18px;
}

/* 信息格：加 ::v-deep 使 cells slot 传入的页面侧格子（如安装状态）同样命中
   —— slot 内容只带父组件 scope 属性，普通 scoped 选择器匹配不到 */
:deep(.ob-detail-cell){
  padding: 10px 12px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  border-radius: 8px;

  .ob-cell-label {
    font-size: 11px;
    color: $text-secondary;
    margin-bottom: 3px;
  }

  .ob-cell-value {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
    word-break: break-all;

    /* AI 评分：琥珀色强调 */
    &.ai {
      color: #d97706;
    }
  }
}

.ob-detail-section {
  margin-bottom: 18px;
}

.ob-detail-section-title {
  font-size: 13px;
  font-weight: 700;
  color: $text-primary;
  margin-bottom: 8px;
  display: flex;
  align-items: center;
  gap: 6px;

  &::before {
    content: '';
    width:  3px;
    height: 12px;
    border-radius: 2px;
    background: var(--primary-color);
  }
}

.ob-detail-text {
  margin: 0;
  font-size: 12.5px;
  color: $text-secondary;
  line-height: 1.7;
  word-break: break-word;
}

/* ===== Markdown 渲染（与聊天气泡 .ob-md 同款，标题字号适配弹窗） ===== */
.ob-md {
  :deep(p) { margin: 0 0 8px; }
  :deep(p:last-child) { margin-bottom: 0; }

  /* 代码块容器内 pre 复位（工具条/边框/圆角由全局 .ob-code 承载） */
  :deep(.ob-code pre) {
    margin: 0;
    border: none;
    border-radius: 0;
    background: transparent;
  }

  :deep(pre) {
    background: rgba(0, 0, 0, 0.06);
    border-radius: 10px;
    padding: 10px 12px;
    overflow-x: auto;
    margin: 8px 0;
    font-size: 12.5px;
    line-height: 1.6;

    code {
      background: transparent;
      padding: 0;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
    }
  }

  :deep(code) {
    background: rgba(var(--primary-color-rgb), 0.09);
    color: var(--primary-color);
    padding: 1px 5px;
    border-radius: 5px;
    font-size: 12.5px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
  }

  :deep(ul), :deep(ol) {
    padding-left: 20px;
    margin: 6px 0;
  }

  :deep(blockquote) {
    margin: 8px 0;
    padding: 4px 12px;
    border-left: 3px solid rgba(var(--primary-color-rgb), 0.45);
    color: $text-secondary;
  }

  /* 表格：markdown 渲染已包装为 .ob-table 容器（工具条 / 边框 / 表头背景全局承载） */
  :deep(.ob-table table) {
    margin: 0;
  }

  :deep(a) {
    color: var(--primary-color);
  }

  :deep(h1), :deep(h2), :deep(h3), :deep(h4) {
    margin: 12px 0 6px;
    font-weight: 700;
    color: $text-primary;
  }

  :deep(h1) { font-size: 16px; }
  :deep(h2) { font-size: 15px; }
  :deep(h3) { font-size: 14px; }
  :deep(h4) { font-size: 13px; }
}

.ob-item-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.ob-item-tag {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 4px;
  color: $text-secondary;
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
}

/* 底部操作区：贴抽屉 footer，去内层边框（footer 自身已与 body 分隔） */
.ob-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
