<template>
  <div class="ob-manage-page">
    <!-- 顶部 Banner（简约大气风格：极简标题 + 关键数据计数） -->
    <header class="ob-market-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">资源市场</h2>
          <span class="ob-hero-badge" v-if="items.length">{{ items.length }} 个可用资源</span>
        </div>
        <p class="ob-section-desc">
          探索并一键扩展 Agent 能力，安装后无须重启即刻生效
        </p>
      </div>
      <el-button
        size="small"
        round
        class="ob-refresh-btn"
        :loading="loading"
        @click="loadIndex"
      >
        <svg-icon icon-class="refresh-left" class="ob-btn-svg" />刷新市场
      </el-button>
    </header>

    <!-- ===== 主体：左侧分类边栏 + 右侧内容区 ===== -->
    <div class="ob-market-layout" v-if="!loading && !error && items.length">
      <!-- 左侧垂直边栏：一级类型 + 二级主题分类（Chrome Web Store 式） -->
      <market-sidebar
        :categories="categories"
        :category-chips="categoryChips"
        :type-filter="typeFilter"
        :category-filter="categoryFilter"
        @select-type="selectType"
        @select-category="selectCategory"
      />

      <!-- 右侧：搜索工具栏 + 内容网格 -->
      <div class="ob-market-main">
        <market-toolbar
          v-model="keyword"
          :current-label="currentLabel"
          :result-count="filteredItems.length"
        />

        <!-- ===== 市场主体 ===== -->
        <!-- 搜索无结果 -->
        <div v-if="!filteredItems.length" class="ob-empty">
          <div class="ob-empty-title">没有匹配到符合条件的项目</div>
          <div class="ob-empty-desc" v-if="keyword">未找到与「{{ keyword }}」相关的资源</div>
          <el-button size="small" round @click="resetFilter">重置筛选条件</el-button>
        </div>

        <!-- 按类型分组展示内容（选中“全部”且无搜索关键词时分组展示；有搜索或指定类型时显示单网格） -->
        <div v-else class="ob-market-content">
          <template v-if="!typeFilter && !keyword">
            <section
              v-for="group in groupedItems"
              :key="group.type"
              class="ob-market-section"
            >
              <div class="ob-section-label">
                <svg-icon :icon-class="typeIcon(group.type)" class="section-icon" />
                <span class="section-title">{{ group.label }}</span>
                <span class="section-count">({{ group.items.length }})</span>
              </div>

              <div class="ob-market-grid">
                <market-card
                  v-for="it in group.items"
                  :key="it.id"
                  :item="it"
                  :busy-id="busyId"
                  @click="openDetail"
                  @install="installItem"
                  @update="updateItem"
                />
              </div>
            </section>
          </template>

          <!-- 单类网格显示（选中具体分类或正在搜索时） -->
          <div v-else class="ob-market-grid">
            <market-card
              v-for="it in filteredItems"
              :key="it.id"
              :item="it"
              :busy-id="busyId"
              @click="openDetail"
              @install="installItem"
              @update="updateItem"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 全页状态（加载中 / 加载失败 / 空索引） ===== -->
    <div v-if="loading" class="ob-empty">
      <svg-icon icon-class="loading" class="ob-spin" />
      <div class="ob-empty-title">正在获取资源市场索引…</div>
    </div>

    <div v-else-if="error" class="ob-empty">
      <div class="ob-empty-icon">
        <svg-icon icon-class="market" />
      </div>
      <div class="ob-empty-title">市场索引加载失败</div>
      <div class="ob-empty-desc">{{ error }}</div>
      <el-button size="small" round type="primary" plain @click="loadIndex">重试</el-button>
    </div>

    <div v-else-if="!items.length" class="ob-empty">
      <div class="ob-empty-icon">
        <svg-icon icon-class="market" />
      </div>
      <div class="ob-empty-title">市场暂无可用资源</div>
      <div class="ob-empty-desc">官方资源仓库筹备中，敬请期待</div>
    </div>

    <!-- ===== 卡片详情弹窗（共享组件）：完整描述 / 版本 / 更新时间 / 版本历史 ===== -->
    <item-detail-dialog :visible.sync="detailVisible" :item="detailItem">
      <template slot="head-extra" slot-scope="{ item }">
        <span v-if="item.hasUpdate" class="ob-market-badge update">可更新</span>
      </template>
      <template slot="cells" slot-scope="{ item }">
        <div class="ob-detail-cell">
          <div class="ob-cell-label">安装状态</div>
          <div class="ob-cell-value ob-install-state" :class="item.hasUpdate ? 'updatable' : item.installed ? 'installed' : 'none'">
            <span class="ob-state-dot"></span>
            <span class="ob-state-text">
              {{ item.hasUpdate ? '可更新' : item.installed ? '已安装' + (item.installedVersion ? ' v' + item.installedVersion : '') : '未安装' }}
            </span>
          </div>
        </div>
      </template>
      <template slot="actions" slot-scope="{ item }">
        <el-button
          v-if="item.hasUpdate"
          size="small"
          round
          type="warning"
          :loading="busyId === item.id"
          :disabled="!!busyId && busyId !== item.id"
          @click="updateItem(item)"
        >更新到 v{{ item.version }}</el-button>
        <el-button
          v-else
          size="small"
          round
          :type="item.installed ? 'default' : 'primary'"
          :plain="!item.installed"
          :loading="busyId === item.id"
          :disabled="!!busyId && busyId !== item.id"
          @click="installItem(item)"
        >{{ item.installed ? '重新安装' : '安装' }}</el-button>
        <el-button
          v-if="item.installed"
          size="small"
          round
          type="danger"
          plain
          :loading="busyId === item.id"
          :disabled="!!busyId && busyId !== item.id"
          @click="uninstallFromDetail"
        >卸载</el-button>
      </template>
    </item-detail-dialog>
  </div>
</template>

<script>
import ItemDetailDialog from '@/components/buddy/ItemDetailDialog.vue'
import MarketCard from './components/MarketCard.vue'
import MarketSidebar from './components/MarketSidebar.vue'
import MarketToolbar from './components/MarketToolbar.vue'
import { buddyApiSection } from '@/utils/buddy-api'

export default {
  name: 'OmniBuddyMarket',
  components: { ItemDetailDialog, MarketCard, MarketSidebar, MarketToolbar },
  data() {
    return {
      loading: false,
      error: '',
      items: [],           // 市场索引（含已装状态）
      categoryDefs: [],    // 二级主题分类清单（v2 索引下发；v1 旧索引为空 → 隐藏二级筛选）
      keyword: '',
      typeFilter: '',
      categoryFilter: '',  // 二级主题分类筛选（空 = 全部主题）
      busyId: '',          // 安装/更新中的项 id（按钮 loading 态）
      detailVisible: false, // 卡片详情抽屉
      detailItem: null
    }
  },
  computed: {
    // 胶囊分类 + 数量角标统计
    categories() {
      const counts = {
        skill: 0,
        agent: 0,
        connector: 0
      }
      this.items.forEach(it => {
        const t = this.marketType(it)
        if (counts[t] !== undefined) counts[t]++
      })

      return [
        { label: '全部', value: '' },
        { label: '技能', value: 'skill', count: counts.skill },
        { label: '子代理', value: 'agent', count: counts.agent },
        { label: '连接器', value: 'connector', count: counts.connector }
      ]
    },
    // 二级主题分类（数据驱动 + 数量统计；索引未下发分类时仅含“全部主题”一项 → 主题分组隐藏）
    categoryChips() {
      const counts = {}
      this.items.forEach(it => {
        if (it.category) counts[it.category] = (counts[it.category] || 0) + 1
      })
      return [
        { label: '全部主题', value: '', count: this.items.length },
        ...this.categoryDefs
          .filter(c => counts[c.value])
          .map(c => ({ label: c.label, value: c.value, count: counts[c.value] }))
      ]
    },
    // 右侧工具栏当前筛选标题
    currentLabel() {
      if (this.keyword) return `“${this.keyword}” 的搜索结果`
      if (this.typeFilter && this.categoryFilter) {
        return `${this.categoryLabel(this.categoryFilter)} · ${this.typeLabel(this.typeFilter)}`
      }
      if (this.typeFilter) {
        const c = this.categories.find(x => x.value === this.typeFilter)
        return c ? c.label : '全部'
      }
      if (this.categoryFilter) return this.categoryLabel(this.categoryFilter)
      return '全部资源'
    },
    filteredItems() {
      const kw = this.keyword.trim().toLowerCase()
      return this.items.filter(it => {
        if (this.typeFilter && this.marketType(it) !== this.typeFilter) return false
        if (this.categoryFilter && (it.category || '') !== this.categoryFilter) return false
        if (!kw) return true
        const hay = [it.name, it.description, it.details, (it.tags || []).join(' ')].join(' ').toLowerCase()
        return hay.includes(kw)
      })
    },
    // 将 items 按技能、子代理、连接器进行三段式分组（用于全部模式展示，尊重二级分类筛选）
    groupedItems() {
      const groups = [
        { type: 'skill', label: '技能 (Skills)', items: [] },
        { type: 'agent', label: '子代理 (Agents)', items: [] },
        { type: 'connector', label: '连接器 (Connectors)', items: [] }
      ]

      this.items.forEach(it => {
        if (this.categoryFilter && (it.category || '') !== this.categoryFilter) return
        const type = this.marketType(it)
        const targetGroup = groups.find(g => g.type === type)
        if (targetGroup) {
          targetGroup.items.push(it)
        }
      })

      return groups.filter(g => g.items.length > 0)
    }
  },
  mounted() {
    this.loadIndex()
  },
  methods: {
    api() {
      return buddyApiSection('market')
    },
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
    loadIndex() {
      const api = this.api()
      if (!api) {
        this.error = '当前环境不支持市场功能'
        return
      }
      this.loading = true
      this.error = ''
      api.index().then(res => {
        this.loading = false
        if (!res || !res.ok) {
          this.error = (res && res.error) || '未知错误'
          this.items = []
          this.categoryDefs = []
          return
        }
        this.items = res.items || []
        this.categoryDefs = (res.categories || []).map(c => ({ label: c.label, value: c.value }))
        // 二级筛选失效时（分类被下架）回退到全部
        if (this.categoryFilter && !this.categoryDefs.some(c => c.value === this.categoryFilter)) {
          this.categoryFilter = ''
        }
      }).catch(() => {
        this.loading = false
        this.error = '请求异常（请检查网络）'
      })
    },
    installItem(it) {
      const api = this.api()
      if (!api) return
      this.busyId = it.id
      api.install(it.id).then(res => {
        this.busyId = ''
        if (!res || !res.ok) {
          this.$message.error((res && res.error) || '安装失败')
          return
        }
        this.$message.success(`「${it.name}」安装成功`)
        this.applyLocalState(it.id, { installed: true, installedVersion: it.version, hasUpdate: false })
      }).catch(() => {
        this.busyId = ''
        this.$message.error('安装请求异常')
      })
    },
    updateItem(it) {
      const api = this.api()
      if (!api) return
      this.busyId = it.id
      api.update(it.id).then(res => {
        this.busyId = ''
        if (!res || !res.ok) {
          this.$message.error((res && res.error) || '更新失败')
          return
        }
        this.$message.success(`「${it.name}」已更新到 v${it.version}`)
        this.applyLocalState(it.id, { installed: true, installedVersion: it.version, hasUpdate: false })
      }).catch(() => {
        this.busyId = ''
        this.$message.error('更新请求异常')
      })
    },
    applyLocalState(id, patch) {
      const item = this.items.find(x => x.id === id)
      if (item) Object.assign(item, patch)
      // 详情抽屉展示同一引用，自动同步
    },
    resetFilter() {
      this.keyword = ''
      this.typeFilter = ''
      this.categoryFilter = ''
    },
    // ---------- 边栏导航 ----------
    // 一级类型与二级主题互斥选择（点击类型清除主题，点击主题清除类型），避免双重筛选叠加造成压抑感
    selectType(value) {
      this.typeFilter = value
      this.categoryFilter = ''
    },
    selectCategory(value) {
      this.categoryFilter = value
      this.typeFilter = ''
    },
    // ---------- 详情抽屉 ----------
    openDetail(it) {
      // categoryLabel 由页面计算后传入（共享组件不感知页面级 categoryDefs）
      this.detailItem = { ...it, categoryLabel: it.category ? this.categoryLabel(it.category) : '' }
      this.detailVisible = true
    },
    uninstallFromDetail() {
      const api = this.api()
      const it = this.detailItem
      if (!api || !it) return
      this.busyId = it.id
      api.uninstall(it.id).then(res => {
        this.busyId = ''
        if (!res || !res.ok) {
          this.$message.error((res && res.error) || '卸载失败')
          return
        }
        this.$message.success(`「${it.name}」已卸载`)
        this.applyLocalState(it.id, { installed: false, installedVersion: '', hasUpdate: false })
      }).catch(() => {
        this.busyId = ''
        this.$message.error('卸载请求异常')
      })
    },
    // ---------- 展示辅助 ----------
    typeLabel(type) {
      if (type === 'connector') return '连接器'
      if (type === 'agent') return '子代理'
      return '技能'
    },
    categoryLabel(value) {
      const def = this.categoryDefs.find(c => c.value === value)
      return def ? def.label : value
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* ===== 顶部精细 Header ===== */
.ob-market-hero {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 20px;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(var(--primary-color-rgb, 91, 124, 240), 0.04) 0%, rgba(0, 0, 0, 0.01) 100%);
  border: 1px solid var(--border-color, rgba(0, 0, 0, 0.06));
  border-radius: $radius-lg;

  .ob-hero-title-group {
    display: flex;
    align-items: center;
    gap: 10px;

    .ob-section-title {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      color: $text-primary;
    }

    .ob-hero-badge {
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 12px;
      background: rgba(var(--primary-color-rgb, 91, 124, 240), 0.1);
      color: var(--primary-color);
      font-weight: 600;
    }
  }

  .ob-section-desc {
    margin: 6px 0 0 0;
    font-size: 12px;
    color: $text-secondary;
  }

  .ob-refresh-btn {
    border-color: var(--border-color);
    background: var(--card-bg, #fff);
    &:hover {
      border-color: var(--primary-color);
      color: var(--primary-color);
    }
  }
}

/* ===== 主体布局：左侧边栏 + 右侧内容 ===== */
.ob-market-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 20px;
  align-items: stretch;
}

/* 右侧内容区 */
.ob-market-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

/* ===== 分组板块 (Sections) ===== */
.ob-market-section {
  margin-bottom: 24px;

  .ob-section-label {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 6px;
    border-bottom: 1px dashed var(--border-color, rgba(0, 0, 0, 0.08));

    .section-icon {
      font-size: 15px;
      color: var(--primary-color);
    }

    .section-title {
      font-size: 14px;
      font-weight: 700;
      color: $text-primary;
    }

    .section-count {
      font-size: 12px;
      color: $text-secondary;
    }
  }
}

/* ===== 统一网格卡片区域 ===== */
.ob-market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 14px;
}

/* 可更新徽标（详情弹窗 head-extra 使用） */
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

/* 详情弹窗安装状态：圆点 + 文字三态徽章（已装绿 / 可更新橙 / 未装灰） */
.ob-install-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;

  .ob-state-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  &.installed {
    color: #2E8B63;
    background: rgba(70, 168, 127, 0.1);

    .ob-state-dot {
      background: #34a877;
    }
  }

  &.updatable {
    color: #d97706;
    background: rgba(245, 158, 11, 0.12);

    .ob-state-dot {
      background: #f59e0b;
    }
  }

  &.none {
    color: $text-secondary;
    background: rgba(0, 0, 0, 0.05);

    .ob-state-dot {
      background: rgba(0, 0, 0, 0.25);
    }
  }
}
</style>
