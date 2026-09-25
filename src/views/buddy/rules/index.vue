<template>
  <div class="ob-manage-page" :class="{ 'is-editing': !!editing }">
    <!-- 编辑态：内嵌 Markdown 编辑器（左编辑 / 右实时预览），不使用弹窗 -->
    <div v-if="editing" class="ob-rule-editor">
      <header class="ob-editor-head">
        <div class="ob-editor-head-left">
          <el-button size="small" round icon="el-icon-arrow-left" class="ob-back-btn" @click="closeEdit">返回</el-button>
          <div class="ob-editor-title">
            <span class="ob-rule-scope">{{ editing.kind === 'global' ? '全局' : '工作空间' }}</span>
            <span class="ob-editor-name">{{ editing.name }}</span>
            <span v-if="isDirty" class="ob-dirty-dot" title="有未保存的修改"></span>
          </div>
        </div>
        <div class="ob-editor-actions">
          <el-button size="small" round type="primary" :loading="saving" @click="save">保存</el-button>
        </div>
      </header>

      <div class="ob-editor-split">
        <!-- 左侧：Markdown 源码编辑 -->
        <div class="ob-editor-pane">
          <div class="ob-pane-head">编辑</div>
          <div class="ob-pane-body">
            <textarea
              v-model="form.content"
              class="ob-editor-textarea"
              spellcheck="false"
              :placeholder="editorPlaceholder"
            ></textarea>
          </div>
        </div>
        <!-- 右侧：实时预览 -->
        <div class="ob-editor-pane">
          <div class="ob-pane-head">预览</div>
          <div class="ob-pane-body">
            <div v-if="form.content.trim()" class="md-preview ob-rule-preview" v-html="previewHtml" @click="onMdClick"></div>
            <div v-else class="ob-preview-empty">暂无内容，开始编写后此处实时预览</div>
          </div>
        </div>
      </div>

      <div class="ob-editor-tip">保存后新对话生效；内容清空并保存 = 删除该规则</div>
    </div>

    <template v-else>
      <!-- 顶部 Hero（市场页同款） -->
      <header class="ob-hero">
        <div class="ob-hero-content">
          <div class="ob-hero-title-group">
            <h2 class="ob-section-title">项目规则</h2>
            <span class="ob-hero-badge" v-if="targetList.length">{{ configuredCount }}/{{ targetList.length }} 已配置</span>
          </div>
          <p class="ob-section-desc">
            编写全局与工作空间规则，Agent 对话时自动注入系统提示词
          </p>
        </div>
      </header>

      <!-- 内容区（hero 固定，仅此区域滚动） -->
      <div class="ob-page-body">
        <!-- 加载中：骨架屏占位（项目规则行列表形态） -->
        <div v-if="loading" class="ob-sk-wrap">
          <buddy-skeleton type="rows" :count="4" />
        </div>

        <!-- 规则目标卡片网格：全局 + 各工作空间 -->
        <div v-else class="ob-cards-grid">
        <div
          v-for="t in targetList"
          :key="t.key"
          class="ob-grid-card"
          :class="{ unavailable: t.kind === 'workspace' && !t.available }"
        >
          <div class="ob-card-head">
            <div class="ob-card-logo" :class="t.kind === 'global' ? 'logo-agent' : 'logo-connector'">
            <svg-icon :icon-class="t.kind === 'global' ? 'buddy' : 'folder'" />
          </div>
            <div class="ob-card-title">
              <div class="ob-card-name" :title="t.name">
                <span class="ob-name-text">{{ t.name }}</span>
                <span v-if="t.kind === 'global'" class="ob-rule-scope">全局</span>
                <span v-else class="ob-rule-scope">工作空间</span>
              </div>
              <div class="ob-card-meta">{{ t.kind === 'global' ? '对所有对话生效' : '仅该工作空间对话生效' }}</div>
            </div>
            <span v-if="t.hasRule" class="ob-card-badge ok">已配置</span>
            <span v-else-if="t.kind === 'workspace' && !t.available" class="ob-card-badge err">目录失效</span>
            <span v-else class="ob-card-badge none">未配置</span>
          </div>

          <p class="ob-card-desc">
            <template v-if="t.kind === 'workspace' && !t.available">
              <span class="ob-rule-off">目录不存在或已移除</span>
            </template>
            <template v-else-if="t.hasRule">{{ t.summary || '（内容为空）' }}</template>
            <template v-else><span class="ob-rule-none">尚未编写规则内容</span></template>
          </p>

          <div class="ob-card-foot">
            <div class="ob-foot-info"></div>
            <div class="ob-card-actions">
              <el-button
                v-if="t.hasRule"
                size="mini"
                round
                class="ob-action-btn"
                @click="exportRule(t)"
              >导出</el-button>
              <el-button
                size="mini"
                round
                :type="t.hasRule ? 'default' : 'primary'"
                :plain="!t.hasRule"
                class="ob-action-btn"
                @click="openEdit(t)"
              >{{ t.hasRule ? '编辑规则' : '新建规则' }}</el-button>
            </div>
          </div>
        </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
// 项目规则（P1-10）：全局 / 工作空间规则编辑页（内嵌分栏编辑器，左编辑右预览）
// pi SDK DefaultResourceLoader 自动装载规则注入系统提示词，本页仅做读写，无需向用户暴露规则文件
import { renderMarkdown, handleCodeCopy, handleTableCsv } from '@/utils/markdown'
import { downloadText } from '@/utils/download'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'

export default {
  name: 'OmniBuddyRules',
  components: { BuddySkeleton },
  data() {
    return {
      loading: false,
      targetList: [],
      // 编辑态目标（null = 卡片列表态）
      editing: null,
      form: { content: '' },
      // 打开时已保存的原文（用于未保存修改提示）
      savedContent: '',
      saving: false
    }
  },
  computed: {
    // 已配置规则的目标数（Hero 徽标展示）
    configuredCount() {
      return this.targetList.filter(t => t.hasRule).length
    },
    // 编辑器多行 Markdown 占位示例（新建空内容时引导用户编写结构）
    editorPlaceholder() {
      return [
        '# 角色设定',
        '你是一名严谨的前端工程师，优先使用 Vue2 选项式 API…',
        '',
        '# 技术栈约定',
        '- 组件命名采用 PascalCase',
        '- 样式统一使用 SCSS',
        '',
        '# 输出格式约定',
        '- 回答使用中文，先给结论再给解释',
        '- 代码变更需说明修改的文件与原因'
      ].join('\n')
    },
    // 实时预览 HTML
    previewHtml() {
      return renderMarkdown(this.form.content)
    },
    // 是否存在未保存的修改
    isDirty() {
      return !!this.editing && this.form.content !== this.savedContent
    }
  },
  created() {
    this.loadTargets()
  },
  methods: {
    // Markdown 预览点击委托：代码块复制按钮（v-html 内容不归 Vue 管，走事件委托）
    onMdClick(e) {
      handleCodeCopy(e).then(ok => {
        if (ok) this.$message.success('已复制')
      })
      handleTableCsv(e).then(ok => {
        if (ok) this.$message.success('已下载 CSV')
      })
    },
    api() {
      return (window.electronAPI && window.electronAPI.omnibuddy) || null
    },
    async loadTargets() {
      const api = this.api()
      if (!api || !api.rulesTargets) {
        this.targetList = []
        return
      }
      this.loading = true
      try {
        const res = await api.rulesTargets()
        this.targetList = Array.isArray(res) ? res : []
      } catch (e) {
        this.targetList = []
      }
      this.loading = false
    },
    // 打开内嵌编辑器（工作空间目录失效时拦截）
    async openEdit(t) {
      if (t.kind === 'workspace' && !t.available) {
        this.$message.warning('工作空间目录不存在，请先在工作空间页修复')
        return
      }
      const api = this.api()
      if (!api || !api.getRule) return
      const res = await api.getRule(t.key)
      if (!res || !res.ok) {
        this.$message.error((res && res.error) || '读取规则失败')
        return
      }
      this.editing = Object.assign({}, t, { hasRule: res.exists })
      this.form.content = res.content || ''
      this.savedContent = this.form.content
    },
    // 关闭编辑器（有未保存修改时二次确认）
    closeEdit() {
      if (!this.isDirty) {
        this.editing = null
        return
      }
      this.$confirm('规则内容尚未保存，确定离开？', '提示', {
        confirmButtonText: '离开',
        cancelButtonText: '继续编辑',
        type: 'warning'
      }).then(() => {
        this.editing = null
      }).catch(() => {})
    },
    // 保存（留驻编辑器，仅清除未保存标记并刷新卡片状态）
    async save() {
      if (!this.editing) return
      const api = this.api()
      if (!api || !api.saveRule) return
      this.saving = true
      try {
        const res = await api.saveRule({ key: this.editing.key, content: this.form.content })
        if (res && res.ok) {
          this.savedContent = this.form.content
          this.editing.hasRule = !!this.form.content.trim()
          this.$message.success('已保存，新对话生效')
          this.loadTargets()
        } else {
          this.$message.error((res && res.error) || '保存失败')
        }
      } finally {
        this.saving = false
      }
    },
    // 卡片导出：读取规则内容并下载为 md 文件
    async exportRule(t) {
      const api = this.api()
      if (!api || !api.getRule) return
      const res = await api.getRule(t.key)
      if (!res || !res.ok) {
        this.$message.error((res && res.error) || '读取规则失败')
        return
      }
      if (!res.exists || !(res.content || '').trim()) {
        this.$message.warning('该规则暂无内容可导出')
        return
      }
      const base = (t.name || t.key || '规则').replace(/[\\/:*?"<>|]/g, '_')
      downloadText(base + '.md', res.content, 'text/markdown;charset=utf-8')
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 加载骨架容器 */
.ob-sk-wrap {
  padding: 20px 4px;
}

/* ============ 编辑态：内嵌分栏编辑器 ============ */
/* 编辑态页面容器：占满可用区域、内部滚动 */
.ob-manage-page.is-editing {
  overflow: hidden;
  padding: 0;
}

.ob-rule-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 20px 12px;
  gap: 10px;
}

.ob-editor-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.ob-editor-head-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.ob-back-btn {
  flex-shrink: 0;
}

.ob-editor-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ob-editor-name {
  font-size: 15px;
  font-weight: 700;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 未保存修改圆点 */
.ob-dirty-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #FAAD14;
}

.ob-editor-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.ob-editor-split {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}

.ob-editor-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  overflow: hidden;
}

.ob-pane-head {
  flex-shrink: 0;
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  color: $text-secondary;
  border-bottom: 1px solid var(--border-color);
  background: $search-bg;
}

.ob-pane-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: auto;
  -webkit-app-region: no-drag;
}

/* 源码编辑 textarea */
.ob-editor-textarea {
  flex: 1;
  width: 100%;
  padding: 14px 16px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: $text-primary;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.7;

  &::placeholder {
    color: $text-secondary;
    opacity: 0.6;
  }
}

/* 预览空态 */
.ob-preview-empty {
  margin: auto;
  font-size: 12px;
  color: $text-secondary;
  opacity: 0.7;
}

.ob-editor-tip {
  flex-shrink: 0;
  font-size: 11.5px;
  color: $text-secondary;
}

/* ============ Markdown 预览：GitHub 风格 + 主题变量适配 ============ */
.md-preview {
  padding: 16px 20px 26px;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text-primary);
  word-break: break-word;

  ::v-deep {
    h1, h2, h3, h4, h5, h6 {
      margin: 1.15em 0 0.55em;
      font-weight: 700;
      line-height: 1.35;

      &:first-child {
        margin-top: 0.2em;
      }
    }

    h1 { font-size: 1.6em; padding-bottom: 0.35em; border-bottom: 1px solid var(--border-color); }
    h2 { font-size: 1.3em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border-color); }
    h3 { font-size: 1.15em; }
    h4 { font-size: 1.02em; }

    p { margin: 0.6em 0; }

    a {
      color: var(--primary-color);
      text-decoration: none;

      &:hover {
        text-decoration: underline;
      }
    }

    strong { font-weight: 700; }

    ul, ol {
      padding-left: 1.6em;
      margin: 0.5em 0;

      li { margin: 0.25em 0; }
      li::marker { color: var(--text-secondary); }
    }

    blockquote {
      margin: 0.9em 0;
      padding: 0.35em 1em;
      border-left: 3px solid var(--primary-color);
      background: rgba(var(--primary-color-rgb), 0.05);
      border-radius: 0 6px 6px 0;
      color: var(--text-secondary);

      p { margin: 0.35em 0; }
    }

    hr {
      border: none;
      border-top: 1px solid var(--border-color);
      margin: 1.6em 0;
    }

    code {
      background: var(--search-bg);
      padding: 2px 6px;
      border-radius: 5px;
      font-size: 0.88em;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      color: #C41A16;
    }

    /* 代码块容器内 pre 复位（工具条/边框/圆角由全局 .ob-code 承载） */
    .ob-code pre {
      margin: 0;
      padding: 13px 15px;
      border: none;
      border-radius: 0;
      background: transparent;
    }

    pre {
      margin: 0.9em 0;
      padding: 13px 15px;
      background: var(--search-bg);
      border: 1px solid var(--border-color);
      border-radius: 10px;
      overflow: auto;

      code {
        display: block;
        background: none;
        padding: 0;
        border-radius: 0;
        color: var(--text-primary);
        font-size: 12.5px;
        line-height: 1.65;
        font-family: 'SF Mono', Menlo, Consolas, monospace;
      }
    }

    table {
      border-collapse: collapse;
      margin: 0; /* 已包装为 .ob-table 容器，间距由容器承载 */

      th, td {
        border: 1px solid var(--border-color);
        padding: 7px 12px;
        text-align: left;
      }

      th {
        background: var(--search-bg);
        font-weight: 600;
      }
    }

    img { max-width: 100%; border-radius: 8px; }
  }
}

/* ============ 卡片（沿用市场页卡片规范） ============ */
/* 规则范围徽标（全局 / 工作空间） */
.ob-rule-scope {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 500;
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}

/* 卡片状态徽标（已配置 / 未配置 / 目录失效） */
.ob-card-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 5px;
  line-height: 1.6;

  &.ok {
    color: #52C41A;
    background: rgba(82, 196, 26, 0.1);
    border: 1px solid rgba(82, 196, 26, 0.3);
  }

  &.none {
    color: $text-secondary;
    background: $search-bg;
    border: 1px solid var(--border-color);
  }

  &.err {
    color: #d93025;
    background: rgba(245, 34, 45, 0.08);
    border: 1px solid rgba(245, 34, 45, 0.25);
  }
}

.ob-rule-off {
  color: #d93025;
  font-size: 12px;
}

/* 未配置规则的弱化提示 */
.ob-rule-none {
  color: $text-secondary;
  opacity: 0.75;
}

/* 工作空间目录失效的卡片置灰 */
.ob-grid-card.unavailable {
  opacity: 0.55;
}
</style>
