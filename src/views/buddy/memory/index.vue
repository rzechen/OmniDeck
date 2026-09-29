<template>
  <div class="ob-manage-page ob-mem-page">
    <!-- 顶部 Hero -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">记忆管理</h2>
          <span class="ob-hero-badge" v-if="loaded">
            长期记忆 {{ stats.longTermEntries }} 条（偏好 {{ byType.preference }} · 事实 {{ byType.semantic }} · 事件 {{ byType.episodic }}）· 日志 {{ stats.dailyCount }} 天
          </span>
        </div>
        <p class="ob-section-desc">
          Agent 跨会话记住你的偏好、约定与事件，可随时查看、筛选与编辑
        </p>
        <div class="ob-mem-status">
          <span class="ob-mem-state" :class="statusClass.extension">
            <i class="ob-mem-dot"></i>记忆引擎{{ st.extension }}
          </span>
          <span class="ob-mem-state" :class="statusClass.qmd">
            <i class="ob-mem-dot"></i>语义检索{{ st.qmd }}
          </span>
          <span class="ob-mem-state" :class="statusClass.collection">
            <i class="ob-mem-dot"></i>记忆索引{{ st.collection }}
          </span>
          <span class="ob-mem-actions">
            <el-button size="small" round class="ob-mem-op" @click="exportMemory">
              <svg-icon icon-class="download" /> 导出记忆
            </el-button>
            <el-button size="small" round class="ob-mem-op" @click="refresh">
              <svg-icon icon-class="refresh-left" /> 刷新
            </el-button>
          </span>
        </div>
      </div>
    </header>

    <!-- 内容区（hero 固定；split 内部各自滚动） -->
    <div class="ob-page-body">
      <!-- 加载中：骨架屏占位（记忆条目行列表形态） -->
      <div v-if="loading" class="ob-sk-wrap">
        <buddy-skeleton type="rows" :count="5" />
      </div>

      <!-- 主体：左文件列表 + 右内容编辑 -->
      <div v-else class="ob-mem-split">
      <!-- 左：记忆文件列表（搜索过滤 + 分组） -->
      <aside class="ob-mem-side">
        <div class="ob-mem-search">
          <svg-icon icon-class="search" />
          <input v-model.trim="keyword" type="text" placeholder="搜索记忆" spellcheck="false" />
        </div>
        <div class="ob-mem-groups">
          <section v-for="g in groups" :key="g.key" class="ob-mem-group">
            <div class="ob-mem-group-head">
              <span>{{ g.label }}</span>
              <span class="ob-mem-group-count">{{ g.items.length }}</span>
            </div>
            <div
              v-for="f in g.items"
              :key="f.path"
              class="ob-mem-item"
              :class="{ active: current && current.path === f.path, empty: !f.exists }"
              @click="openFile(f)"
            >
              <svg-icon :icon-class="iconOf(f)" class="ob-mem-item-ico" />
              <div class="ob-mem-item-main">
                <div class="ob-mem-item-name">{{ titleOf(f) }}</div>
                <div class="ob-mem-item-meta">{{ metaOf(f) }}</div>
              </div>
              <span v-if="current && current.path === f.path && isDirty" class="ob-mem-dirty" title="有未保存的修改"></span>
            </div>
            <div v-if="!g.items.length" class="ob-mem-group-empty">{{ g.emptyText }}</div>
          </section>
        </div>
      </aside>

      <!-- 右：内容查看 / 编辑 -->
      <section class="ob-mem-editor">
        <template v-if="current">
          <header class="ob-mem-editor-head">
            <div class="ob-mem-editor-title">
              <svg-icon :icon-class="iconOf(current)" />
              <span class="ob-mem-editor-name">{{ titleOf(current) }}</span>
              <span v-if="current.kind === 'daily'" class="ob-mem-editor-sub">{{ metaOf(current) }}</span>
              <span v-if="isDirty" class="ob-mem-dirty" title="有未保存的修改"></span>
              <span v-if="readonly" class="ob-mem-readonly">只读</span>
            </div>
            <div class="ob-mem-editor-actions">
              <!-- 长期记忆：条目视图 ⇄ 源码编辑切换（源码视图切走时未保存则提示） -->
              <el-button
                v-if="current.kind === 'long_term' && current.exists"
                size="small"
                round
                class="ob-mem-op"
                @click="toggleView"
              >{{ isEntryView ? '编辑全文' : '条目视图' }}</el-button>
              <el-button
                v-if="!readonly && !isEntryView"
                size="small"
                round
                type="primary"
                :loading="saving"
                :disabled="current && !current.exists && !form.content.trim()"
                @click="save"
              >保存</el-button>
            </div>
          </header>

          <!-- 条目视图（长期记忆专属）：分型徽章 + 单条删除 + 类型筛选 -->
          <div v-if="isEntryView" class="ob-mem-entries">
            <div class="ob-mem-filter">
              <span
                v-for="c in typeChips"
                :key="c.key"
                class="ob-mem-chip"
                :class="[{ active: typeFilter === c.key }, c.key]"
                @click="typeFilter = c.key"
              >{{ c.label }} {{ c.count }}</span>
              <span class="ob-mem-filter-tip">三型标签：#preference 偏好 · #semantic 事实 · #episodic 事件</span>
            </div>
            <div class="ob-mem-entry-list">
              <div v-for="e in filteredEntries" :key="e.id" class="ob-mem-entry" :class="e.type">
                <span class="ob-mem-entry-tag" :class="e.type">{{ typeLabel(e.type) }}</span>
                <div class="ob-mem-entry-main">
                  <div class="ob-mem-entry-content">{{ e.content }}</div>
                  <div v-if="e.ts" class="ob-mem-entry-ts">{{ e.ts }}</div>
                </div>
                <el-button
                  size="small"
                  round
                  class="ob-mem-entry-del"
                  @click="removeOne(e)"
                ><i class="el-icon-delete" /> 删除</el-button>
              </div>
              <div v-if="!filteredEntries.length" class="ob-mem-entry-empty">
                {{ longTermEntries.length ? '该类型暂无条目' : '暂无长期记忆 — 对 OmniBuddy 说「记住 …」或在源码视图中编写' }}
              </div>
            </div>
          </div>

          <!-- 源码视图：textarea 全文编辑 -->
          <div v-else class="ob-mem-editor-body">
            <textarea
              v-model="form.content"
              class="ob-mem-textarea"
              spellcheck="false"
              :readonly="readonly"
              :placeholder="placeholder"
            ></textarea>
          </div>
          <div class="ob-mem-editor-tip">
            <template v-if="readonly">恢复记录在 Agent 执行「恢复记忆」时使用，仅可查看</template>
            <template v-else-if="isEntryView">按类型浏览与管理记忆；单条删除立即生效，下一次对话起不再想起它</template>
            <template v-else>保存后下一次对话生效；长期记忆请按「- #标签 内容」逐条书写，清空全部内容并保存 = 清空该记忆</template>
          </div>
        </template>
        <div v-else class="ob-mem-editor-empty">
          <svg-icon icon-class="memory" class="ob-mem-empty-ico" />
          <p>从左侧选择要查看的记忆</p>
          <p class="ob-mem-empty-sub">对 OmniBuddy 说「记住 …」即可自动沉淀长期记忆</p>
        </div>
      </section>
      </div>
    </div>
  </div>
</template>

<script>
// 记忆管理（P1-8 增强）：pi-memory 记忆文件的查看 / 编辑页
// 数据源：主进程 omnibuddy:memory:*（memory.js 读写 agentDir/memory 下的 markdown；
// recovery 恢复记录只读展示；status 提供 pi-memory / qmd / collection 就绪状态）
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'

export default {
  name: 'OmniBuddyMemory',
  components: { BuddySkeleton },
  data() {
    return {
      loading: false,
      loaded: false,
      // 就绪状态（memory.status()）
      st: { extension: '检测中…', qmd: '检测中…', collection: '检测中…' },
      statusRaw: { installed: false, qmd: { available: false, collection: false } },
      files: [],
      stats: { longTermEntries: 0, dailyCount: 0, recoveryCount: 0 },
      // 长期记忆分型条目（主进程解析 MEMORY.md）
      longTermEntries: [],
      byTypeObj: { preference: 0, semantic: 0, episodic: 0 },
      // 编辑器视图：entries = 条目视图（长期记忆默认），source = 源码编辑
      viewMode: 'source',
      // 类型筛选（'' = 全部）
      typeFilter: '',
      // 文件名过滤
      keyword: '',
      // 当前打开的文件（null = 未选）
      current: null,
      form: { content: '' },
      // 打开时已保存的原文（未保存修改判断）
      savedContent: '',
      saving: false
    }
  },
  computed: {
    api() {
      return (window.electronAPI && window.electronAPI.omnibuddy && window.electronAPI.omnibuddy.memory) || null
    },
    // 分组文件列表（按标题/内容关键字过滤，用户视角）
    groups() {
      const kw = this.keyword.toLowerCase()
      const pick = kind => this.files.filter(f => f.kind === kind &&
        (!kw || this.titleOf(f).toLowerCase().indexOf(kw) >= 0 || (f.name || '').toLowerCase().indexOf(kw) >= 0))
      return [
        { key: 'long_term', label: '长期记忆', items: pick('long_term'), emptyText: '暂无长期记忆' },
        { key: 'scratchpad', label: '草稿板', items: pick('scratchpad'), emptyText: '暂无草稿清单' },
        { key: 'daily', label: '每日日志', items: pick('daily'), emptyText: '暂无工作日志' },
        { key: 'recovery', label: '恢复记录', items: pick('recovery'), emptyText: '暂无恢复记录' }
      ]
    },
    // 恢复记录只读；其余记忆文件可编辑
    readonly() {
      return !!this.current && this.current.kind === 'recovery'
    },
    // 三型统计（Hero 徽章）
    byType() {
      return this.byTypeObj || { preference: 0, semantic: 0, episodic: 0 }
    },
    // 长期记忆打开且文件存在时默认条目视图
    isEntryView() {
      return !!this.current && this.current.kind === 'long_term' && this.viewMode === 'entries'
    },
    // 类型筛选 chips（全部 + 三型）
    typeChips() {
      return [
        { key: '', label: '全部', count: this.longTermEntries.length },
        { key: 'preference', label: '偏好', count: this.byType.preference },
        { key: 'semantic', label: '事实', count: this.byType.semantic },
        { key: 'episodic', label: '事件', count: this.byType.episodic }
      ]
    },
    // 按类型过滤的条目列表
    filteredEntries() {
      if (!this.typeFilter) return this.longTermEntries
      return this.longTermEntries.filter(e => e.type === this.typeFilter)
    },
    // 是否存在未保存修改
    isDirty() {
      return !!this.current && this.form.content !== this.savedContent
    },
    placeholder() {
      if (!this.current) return ''
      if (this.current.kind === 'long_term') {
        return [
          '「- #标签 内容」逐条书写，三型标签对齐 CoALA 记忆分层：',
          '- #preference 本仓库一律使用 pnpm（用户偏好，长期有效）',
          '- #semantic 后端选用 PostgreSQL（已确认事实与约定）',
          '- #episodic 2026-09-23 完成记忆架构升级（情景事件）'
        ].join('\n')
      }
      if (this.current.kind === 'scratchpad') return '- [ ] 修复登录超时问题'
      return ''
    },
    // 状态条配色（正常 / 降级）
    statusClass() {
      const s = this.statusRaw
      return {
        extension: s.installed ? 'ok' : 'warn',
        qmd: s.qmd.available ? 'ok' : 'warn',
        collection: s.qmd.collection ? 'ok' : 'warn'
      }
    }
  },
  created() {
    this.load()
  },
  methods: {
    // 分组条目图标
    iconOf(f) {
      return { long_term: 'memory', scratchpad: 'todo', daily: 'document', recovery: 'refresh-left' }[f.kind] || 'document'
    },
    // 条目标题：用户视角命名（不暴露文件名 / 路径）
    // 日志按日期、恢复记录按保存时间区分
    titleOf(f) {
      if (f.kind === 'long_term') return '长期记忆'
      if (f.kind === 'scratchpad') return '草稿板'
      if (f.kind === 'daily') return f.name.replace(/\.md$/, '') + ' 的日志'
      if (f.kind === 'recovery') {
        const t = (f.mtime || '').slice(5, 16).replace('T', ' ')
        return '恢复记录' + (t ? ' · ' + t : '')
      }
      return f.name
    },
    // 条目元信息：大小 + 修改时间；不存在显示「暂无内容」
    metaOf(f) {
      if (!f.exists) return '暂无内容'
      const kb = f.size > 1024 ? (f.size / 1024).toFixed(1) + ' KB' : f.size + ' B'
      const day = (f.mtime || '').slice(0, 16).replace('T', ' ')
      return kb + (day ? ' · ' + day : '')
    },
    // 打开文件：读取内容进入编辑器
    async openFile(f) {
      if (!this.api) return
      if (this.isDirty) {
        try {
          await this.$confirm('当前内容尚未保存，切换后将丢失修改，确定继续？', '提示', {
            confirmButtonText: '继续',
            cancelButtonText: '留下',
            type: 'warning'
          })
        } catch (e) {
          return
        }
      }
      const res = await this.api.read(f.path)
      if (!res || !res.ok) {
        this.$message.error((res && res.error) || '读取失败')
        return
      }
      this.current = Object.assign({}, f, { exists: res.exists })
      this.form.content = res.content || ''
      this.savedContent = this.form.content
      // 长期记忆且已有内容 → 默认条目视图；其余（含新建）→ 源码视图
      this.viewMode = (f.kind === 'long_term' && res.exists) ? 'entries' : 'source'
      this.typeFilter = ''
    },
    // 条目视图 ⇄ 源码编辑切换（源码有未保存修改时提示）
    toggleView() {
      if (this.isEntryView) {
        this.viewMode = 'source'
        return
      }
      if (this.isDirty) {
        this.$message.warning('请先保存或放弃修改，再切回条目视图')
        return
      }
      this.viewMode = 'entries'
    },
    // 单条删除长期记忆（主进程按 id 定位行组重写）
    async removeOne(e) {
      if (!this.api || !this.api.removeEntry) return
      try {
        await this.$confirm('删除这条记忆？下一次对话起 Agent 将不再想起它。', '提示', {
          confirmButtonText: '删除',
          cancelButtonText: '取消',
          type: 'warning'
        })
      } catch (err) {
        return
      }
      const res = await this.api.removeEntry(e.id)
      if (res && res.ok) {
        this.$message.success('已删除')
        await this.loadList()
        // 同步刷新当前打开的源码内容（条目视图数据随 loadList 更新）
        if (this.current) {
          const fresh = await this.api.read(this.current.path)
          if (fresh && fresh.ok) {
            this.current.exists = fresh.exists
            this.form.content = fresh.content || ''
            this.savedContent = this.form.content
            if (!fresh.exists) this.viewMode = 'source'
          }
        }
      } else {
        this.$message.error((res && res.error) || '删除失败')
      }
    },
    // 分型中文名
    typeLabel(t) {
      return { preference: '偏好', semantic: '事实', episodic: '事件' }[t] || t
    },
    // 保存（清空保存 = 删除文件；保存后刷新清单，主进程会重建会话注入最新记忆）
    async save() {
      if (!this.current || !this.api) return
      this.saving = true
      try {
        const res = await this.api.write({ path: this.current.path, content: this.form.content })
        if (res && res.ok) {
          this.savedContent = this.form.content
          this.$message.success(res.removed ? '已清空该记忆' : '已保存，下一次对话生效')
          await this.loadList()
        } else {
          this.$message.error((res && res.error) || '保存失败')
        }
      } finally {
        this.saving = false
      }
    },
    // 导出记忆：主进程汇总长期记忆/草稿板/每日日志为 Markdown，保存对话框选择位置
    // 取消保存静默返回，仅失败时提示
    async exportMemory() {
      if (!this.api || !this.api.export) return
      const res = await this.api.export()
      if (!res) return
      if (res.ok) {
        this.$message.success('已导出：' + res.filePath)
      } else if (!res.canceled) {
        this.$message.error(res.error || '导出失败')
      }
    },
    // 刷新：清单 + 就绪状态
    refresh() {
      this.load()
    },
    async load() {
      if (!this.api) return
      this.loading = true
      try {
        await Promise.all([this.loadList(), this.loadStatus()])
        this.loaded = true
      } finally {
        this.loading = false
      }
    },
    async loadList() {
      if (!this.api) return
      const res = await this.api.list()
      if (res && res.ok) {
        this.files = Array.isArray(res.files) ? res.files : []
        this.stats = res.stats || this.stats
        this.longTermEntries = (res.longTerm && res.longTerm.entries) || []
        this.byTypeObj = (res.longTerm && res.longTerm.byType) || { preference: 0, semantic: 0, episodic: 0 }
        // 当前打开的文件被删除时退出编辑器
        if (this.current && !this.files.some(f => f.path === this.current.path)) {
          this.current = null
          this.form.content = ''
          this.savedContent = ''
        }
      }
    },
    async loadStatus() {
      if (!this.api) return
      const res = await this.api.status()
      if (!res || !res.ok) return
      this.statusRaw = { installed: !!res.installed, qmd: res.qmd || {} }
      this.st = {
        extension: res.installed ? '已就绪' : '未就绪',
        qmd: res.qmd.available ? '已就绪' : '不可用',
        collection: res.qmd.available
          ? (res.qmd.collection ? '已就绪' : '准备中')
          : '不可用'
      }
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

/* ============ 状态条（Hero 内）：就绪状态 + 操作 ============ */
.ob-mem-status {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 10px;
  margin-top: 12px;
}

.ob-mem-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 10px;
  border-radius: 99px;
  font-size: 11.5px;
  color: $text-secondary;
  background: $search-bg;
  border: 1px solid var(--border-color);

  &.ok {
    color: #2e8b63;
    background: rgba(70, 168, 127, 0.1);
    border-color: rgba(70, 168, 127, 0.3);
  }

  &.warn {
    color: #a06a1b;
    background: rgba(230, 162, 60, 0.1);
    border-color: rgba(230, 162, 60, 0.3);
  }

  &.dir {
    max-width: 260px;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
}

.ob-mem-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.ob-mem-actions {
  display: inline-flex;
  gap: 6px;
  margin-left: auto;
}

.ob-mem-op {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 5px 10px;
}

.ob-mem-editor-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* ============ 条目视图（长期记忆专属） ============ */
.ob-mem-entries {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ob-mem-filter {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border-color);
  background: $search-bg;
}

.ob-mem-chip {
  padding: 2px 11px;
  border-radius: 99px;
  font-size: 11.5px;
  font-weight: 600;
  color: $text-secondary;
  background: $card-bg;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s;

  &:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  &.active {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.09);
    border-color: rgba(var(--primary-color-rgb), 0.45);
  }
}

.ob-mem-filter-tip {
  margin-left: auto;
  font-size: 10.5px;
  color: $text-secondary;
  opacity: 0.75;
}

.ob-mem-entry-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 10px 14px;
}

.ob-mem-entry {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: $radius-sm;
  margin-bottom: 8px;
  background: $card-bg;

  &:hover .ob-mem-entry-del {
    opacity: 1;
  }
}

/* 分型徽章：偏好（绿）/ 事实（蓝紫）/ 事件（橙）——语义状态编码 */
.ob-mem-entry-tag {
  flex-shrink: 0;
  margin-top: 2px;
  padding: 1px 9px;
  border-radius: 99px;
  font-size: 10.5px;
  font-weight: 600;

  &.preference {
    color: #2e8b63;
    background: rgba(70, 168, 127, 0.12);
  }

  &.semantic {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.1);
  }

  &.episodic {
    color: #a06a1b;
    background: rgba(230, 162, 60, 0.14);
  }
}

.ob-mem-entry-main {
  flex: 1;
  min-width: 0;
}

.ob-mem-entry-content {
  font-size: 12.5px;
  line-height: 1.6;
  color: $text-primary;
  word-break: break-word;
}

.ob-mem-entry-ts {
  margin-top: 3px;
  font-size: 10.5px;
  color: $text-secondary;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

.ob-mem-entry-del {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s;
  padding: 4px 9px;
  color: $text-secondary;

  &:hover {
    color: #d93025;
    border-color: rgba(245, 34, 45, 0.35);
  }
}

.ob-mem-entry-empty {
  padding: 36px 0;
  text-align: center;
  font-size: 12.5px;
  color: $text-secondary;
  opacity: 0.8;
}

/* ============ 主体分栏：左列表 + 右编辑器 ============ */
.ob-mem-split {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}

/* ---- 左：文件列表 ---- */
.ob-mem-side {
  flex-shrink: 0;
  width: 262px;
  display: flex;
  flex-direction: column;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  overflow: hidden;
}

.ob-mem-search {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-color);
  color: $text-secondary;

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    color: $text-primary;
    font-size: 12.5px;

    &::placeholder {
      color: $text-secondary;
      opacity: 0.6;
    }
  }
}

.ob-mem-groups {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 8px;
}

.ob-mem-group {
  margin-bottom: 6px;
}

.ob-mem-group-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px 4px;
  font-size: 11px;
  font-weight: 700;
  color: $text-secondary;
}

.ob-mem-group-count {
  font-weight: 500;
  opacity: 0.8;
}

.ob-mem-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 9px;
  border-radius: $radius-sm;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: $search-bg;
  }

  &.active {
    background: rgba(var(--primary-color-rgb), 0.09);
  }

  &.empty {
    .ob-mem-item-name {
      color: $text-secondary;
    }
  }
}

.ob-mem-item-ico {
  flex-shrink: 0;
  font-size: 15px;
  color: var(--primary-color);
}

.ob-mem-item-main {
  flex: 1;
  min-width: 0;
}

.ob-mem-item-name {
  font-size: 12.5px;
  font-weight: 600;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-mem-item-meta {
  margin-top: 2px;
  font-size: 10.5px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-mem-group-empty {
  padding: 4px 9px 8px;
  font-size: 11px;
  color: $text-secondary;
  opacity: 0.65;
}

/* 未保存修改圆点（列表项与编辑器共用） */
.ob-mem-dirty {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--warning-color);
}

/* ---- 右：内容编辑器 ---- */
.ob-mem-editor {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  overflow: hidden;
}

.ob-mem-editor-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border-bottom: 1px solid var(--border-color);
  background: $search-bg;
}

.ob-mem-editor-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--primary-color);

  svg {
    flex-shrink: 0;
  }
}

.ob-mem-editor-name {
  flex-shrink: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: $text-primary;
}

.ob-mem-editor-sub {
  min-width: 0;
  font-size: 11px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-mem-readonly {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 600;
  color: $text-secondary;
  background: rgba(0, 0, 0, 0.05);
  border: 1px solid var(--border-color);
}

.ob-mem-editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: auto;
  -webkit-app-region: no-drag;
}

.ob-mem-textarea {
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

  &[readonly] {
    opacity: 0.85;
  }
}

.ob-mem-editor-tip {
  flex-shrink: 0;
  padding: 7px 14px;
  border-top: 1px solid var(--border-color);
  font-size: 11.5px;
  color: $text-secondary;
}

/* 编辑器空态 */
.ob-mem-editor-empty {
  margin: auto;
  text-align: center;
  color: $text-secondary;

  .ob-mem-empty-ico {
    font-size: 40px;
    opacity: 0.35;
    color: var(--primary-color);
  }

  p {
    margin: 12px 0 0;
    font-size: 13px;
  }

  .ob-mem-empty-sub {
    margin-top: 6px;
    font-size: 11.5px;
    opacity: 0.7;
  }
}
</style>
