<template>
  <el-dialog
    :visible.sync="localVisible"
    width="760px"
    append-to-body
    custom-class="ob-item-detail-dialog"
  >
    <!-- 标题栏：图标 + 名称 + 徽标 -->
    <template slot="title">
      <div v-if="item" class="ob-detail-head">
        <div class="ob-item-logo" :class="'logo-' + typeOf">
          <svg-icon :icon-class="iconOf" />
        </div>
        <div class="ob-detail-head-info">
          <div class="ob-detail-name">{{ item.name }}</div>
          <div class="ob-detail-meta">
            <span class="ob-detail-badge">{{ typeLabel }}</span>
            <span v-if="item.categoryLabel" class="ob-detail-badge cat">
              {{ item.categoryLabel }}
            </span>
            <span v-if="item.author">{{ item.author }}</span>
          </div>
        </div>
        <slot name="head-extra" :item="item"></slot>
      </div>
    </template>

    <div v-if="item" class="ob-detail-body">
      <!-- 信息网格：版本 / 更新时间 / 自定义第三格 -->
      <div class="ob-detail-grid" v-if="item.version || item.updatedAt || $slots.cells">
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
      </div>

      <!-- 描述（Markdown 渲染，SKILL.md 正文可直接呈现标题/代码块/表格） -->
      <div class="ob-detail-section" v-if="item.details || item.description">
        <div class="ob-detail-section-title">描述</div>
        <div class="ob-detail-text ob-md" v-html="renderedDetails"></div>
      </div>

      <!-- 标签 -->
      <div class="ob-detail-section" v-if="item.tags && item.tags.length">
        <div class="ob-detail-section-title">标签</div>
   <div class="ob-item-tags">
          <span v-for="t in item.tags" :key="t" class="ob-item-tag">{{ t }}</span>
        </div>
      </div>

      <!-- 版本历史 -->
      <div class="ob-detail-section" v-if="item.changelog && item.changelog.length">
        <div class="ob-detail-section-title">版本历史</div>
        <div class="ob-detail-changelog">
          <div v-for="(log, i) in item.changelog" :key="i" class="ob-changelog-item">
            <span class="ob-changelog-version">v{{ log.version }}</span>
            <span class="ob-changelog-date" v-if="log.date">{{ formatDate(log.date) }}</span>
            <p class="ob-changelog-note">{{ log.note }}</p>
          </div>
        </div>
      </div>

      <!-- 底部操作（页面自定义） -->
      <div class="ob-detail-actions" v-if="$slots.actions">
        <slot name="actions" :item="item"></slot>
      </div>
    </div>
  </el-dialog>
</template>

<script>
// 市场页与技能页共享的资源详情弹窗：
// 徽标头 + 信息网格 + 描述（Markdown 渲染）+ 标签 + 版本历史；操作按钮经 actions slot 注入
import { renderMarkdown } from '@/utils/markdown'

export default {
  name: 'ItemDetailDialog',
  props: {
    visible: { type: Boolean, default: false },
    // { name, type, version, updatedAt, details, description, tags, changelog, author, categoryLabel }
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

/* ===== 弹窗外观（append-to-body，样式需全局） ===== */
::v-deep .ob-item-detail-dialog {
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.2);

  .el-dialog__header {
    margin-bottom: 0;
    padding: 18px 24px;
    border-bottom: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
  }

  .el-dialog__body {
    padding: 20px 24px;
    max-height: 62vh;
    overflow-y: auto;
  }
}

.ob-detail-head {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-right: 32px; /* 避开右上角关闭按钮 */
}

.ob-item-logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .svg-icon {
    font-size: 26px;
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
  background: rgba(var(--primary-color-rgb, 91, 124, 240), 0.1);

  &.cat {
    color: #2E8B63;
    background: rgba(70, 168, 127, 0.1);
  }
}

.ob-detail-body {
  padding: 0;
}

.ob-detail-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  margin-bottom: 18px;
}

/* 信息格：加 ::v-deep 使 cells slot 传入的页面侧格子（如安装状态）同样命中
   —— slot 内容只带父组件 scope 属性，普通 scoped 选择器匹配不到 */
::v-deep .ob-detail-cell {
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
  ::v-deep {
    p { margin: 0 0 8px; }
    p:last-child { margin-bottom: 0; }

    pre {
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

    code {
      background: rgba(var(--primary-color-rgb), 0.09);
      color: var(--primary-color);
      padding: 1px 5px;
      border-radius: 5px;
      font-size: 12.5px;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
    }

    ul, ol {
      padding-left: 20px;
      margin: 6px 0;
    }

    blockquote {
      margin: 8px 0;
      padding: 4px 12px;
      border-left: 3px solid rgba(var(--primary-color-rgb), 0.45);
      color: $text-secondary;
    }

    table {
      border-collapse: collapse;
      margin: 8px 0;

      th, td {
        border: 1px solid var(--border-color);
        padding: 5px 10px;
        font-size: 12.5px;
      }
    }

    a {
      color: var(--primary-color);
    }

    h1, h2, h3, h4 {
      margin: 12px 0 6px;
      font-weight: 700;
      color: $text-primary;
    }

    h1 { font-size: 16px; }
    h2 { font-size: 15px; }
    h3 { font-size: 14px; }
    h4 { font-size: 13px; }
  }
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

.ob-detail-changelog {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.ob-changelog-item {
  padding: 10px 12px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  border-radius: 8px;

  .ob-changelog-version {
    display: inline-block;
    font-size: 12px;
    font-weight: 700;
    color: var(--primary-color);
    margin-right: 8px;
  }

  .ob-changelog-date {
    font-size: 11px;
    color: $text-secondary;
  }

  .ob-changelog-note {
    margin: 5px 0 0 0;
    font-size: 12px;
    color: $text-secondary;
    line-height: 1.6;
  }
}

.ob-detail-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  padding-top: 14px;
  border-top: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
  margin-top: 4px;
}
</style>
