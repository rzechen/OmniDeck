<template>
  <div class="ob-manage-page">
    <header class="ob-section-header">
      <div class="ob-header-row">
        <div>
          <h2 class="ob-section-title">资源市场</h2>
          <p class="ob-section-desc">
            浏览并一键安装 Skill 与模板，安装后 Agent 立即可用（无需重启）
          </p>
        </div>
        <el-button
          size="small"
          round
          :loading="loading"
          @click="loadIndex"
        ><svg-icon icon-class="refresh-left" class="ob-btn-svg" />刷新</el-button>
      </div>
    </header>

    <div class="ob-market-tabs">
      <div class="ob-market-tab" :class="{ active: tab === 'market' }" @click="tab = 'market'">
        市场
      </div>
      <div class="ob-market-tab" :class="{ active: tab === 'installed' }" @click="switchInstalled">
        已安装<span v-if="installed.length" class="ob-market-tab-count">{{ installed.length }}</span>
      </div>
      <div class="ob-market-toolbar">
        <el-input
          v-model="keyword"
          size="small"
          clearable
          prefix-icon="el-icon-search"
          placeholder="搜索名称 / 描述 / 标签"
          class="ob-market-search"
        />
        <el-select v-model="typeFilter" size="small" class="ob-market-type">
          <el-option label="全部类型" value="" />
          <el-option label="Skill" value="skill" />
          <el-option label="工作流" value="workflow" />
          <el-option label="智能体" value="agent" />
        </el-select>
      </div>
    </div>

    <!-- ===== 市场页签 ===== -->
    <template v-if="tab === 'market'">
      <!-- 加载中 -->
      <div v-if="loading" class="ob-empty">
        <svg-icon icon-class="loading" class="ob-spin" />
        <div class="ob-empty-title">正在获取市场索引…</div>
      </div>

      <!-- 加载失败（降级提示，可切已安装本地浏览） -->
      <div v-else-if="error" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="market" />
        </div>
        <div class="ob-empty-title">市场索引加载失败</div>
        <div class="ob-empty-desc">{{ error }}</div>
        <el-button size="small" round @click="switchInstalled">浏览已安装资源</el-button>
      </div>

      <!-- 空索引 -->
      <div v-else-if="!filteredItems.length && !keyword && !typeFilter" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="market" />
        </div>
        <div class="ob-empty-title">市场暂无资源</div>
        <div class="ob-empty-desc">索引仓库筹备中，敬请期待</div>
      </div>

      <!-- 搜索无结果 -->
      <div v-else-if="!filteredItems.length" class="ob-empty">
        <div class="ob-empty-title">没有匹配「{{ keyword }}」的资源</div>
        <el-button size="small" round @click="keyword = ''; typeFilter = ''">清除筛选</el-button>
      </div>

      <!-- 网格卡片 -->
      <div v-else class="ob-market-grid">
        <div v-for="it in filteredItems" :key="it.id" class="ob-market-card">
          <div class="ob-market-card-head">
            <span class="ob-item-logo logo-custom ob-market-logo">
              <svg-icon :icon-class="typeIcon(it.type)" />
            </span>
            <div class="ob-market-card-title">
              <div class="ob-market-name">
                {{ it.name }}
                <span v-if="it.hasUpdate" class="ob-market-badge update">可更新</span>
                <span v-else-if="it.installed" class="ob-market-badge ok">已安装</span>
              </div>
              <div class="ob-market-meta">
                v{{ it.version }}<template v-if="it.author"> · {{ it.author }}</template>
                <template v-if="it.installed && it.installedVersion && it.installedVersion !== it.version">
                  （本地 v{{ it.installedVersion }}）
                </template>
              </div>
            </div>
          </div>
          <p class="ob-market-desc">{{ it.description || '（无描述）' }}</p>
          <div v-if="it.tags.length" class="ob-market-tags">
            <span v-for="t in it.tags" :key="t" class="ob-market-tag">{{ t }}</span>
          </div>
          <div class="ob-market-foot">
            <span
              v-if="it.homepage"
              class="ob-market-link"
              @click="openHome(it)"
            >查看主页</span>
            <span v-else></span>
            <el-button
              v-if="it.hasUpdate"
              size="mini"
              round
              type="primary"
              :loading="busyId === it.id"
              :disabled="busyId && busyId !== it.id"
              @click="updateItem(it)"
            >更新</el-button>
            <el-button
              v-else-if="!it.installed"
              size="mini"
              round
              type="primary"
              plain
              :loading="busyId === it.id"
              :disabled="busyId && busyId !== it.id"
              @click="installItem(it)"
            >安装</el-button>
            <el-button
              v-else
              size="mini"
              round
              :disabled="true"
            >已安装</el-button>
          </div>
        </div>
      </div>
    </template>

    <!-- ===== 已安装页签 ===== -->
    <template v-else>
      <div v-if="installedLoading" class="ob-empty">
        <svg-icon icon-class="loading" class="ob-spin" />
        <div class="ob-empty-title">加载中…</div>
      </div>
      <div v-else-if="!installed.length" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="skill" />
        </div>
        <div class="ob-empty-title">暂无已安装资源</div>
        <div class="ob-empty-desc">到「市场」页签浏览并安装</div>
      </div>
      <div v-else class="ob-list">
        <div v-for="rec in installed" :key="rec.id" class="ob-list-item ob-ext-item">
          <span class="ob-item-logo logo-custom">
            <svg-icon :icon-class="typeIcon(rec.type)" />
          </span>
          <div class="ob-item-info">
            <div class="ob-item-name">
              <span class="ob-item-title">{{ rec.name }}</span>
              <span v-if="rec.missing" class="ob-market-badge warn">目录缺失</span>
              <span v-else class="ob-market-badge ok">v{{ rec.version }}</span>
            </div>
            <div class="ob-item-meta">
              <span class="ob-item-url">{{ rec.skillDir ? 'skills/' + rec.skillDir : rec.id }}</span>
              <span v-if="rec.updatedAt" class="ob-market-time">{{ formatTime(rec.updatedAt) }}</span>
            </div>
          </div>
          <div class="ob-item-actions ob-item-actions-always">
            <span class="ob-item-action danger" title="卸载" @click="uninstallItem(rec)">
              <svg-icon icon-class="delete" />
            </span>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<script>
// 资源市场（N2 / §16）：GitCode 索引仓库远程化
// 市场：拉 index.json → 网格卡片浏览/搜索 → 一键安装/更新（主进程下载 zip 复用 skills 管线）
// 已安装：market-installed.json 记录列表 + 卸载
export default {
  name: 'OmniBuddyMarket',
  data() {
    return {
      tab: 'market',
      loading: false,
      error: '',
      items: [],           // 市场索引（含已装状态）
      keyword: '',
      typeFilter: '',
      busyId: '',          // 安装/更新中的项 id（按钮 loading 态）
      installedLoading: false,
      installed: []
    }
  },
  computed: {
    filteredItems() {
      const kw = this.keyword.trim().toLowerCase()
      return this.items.filter(it => {
        if (this.typeFilter && it.type !== this.typeFilter) return false
        if (!kw) return true
        const hay = [it.name, it.description, (it.tags || []).join(' ')].join(' ').toLowerCase()
        return hay.includes(kw)
      })
    }
  },
  mounted() {
    this.loadIndex()
  },
  methods: {
    api() {
      return (window.electronAPI && window.electronAPI.omnibuddy && window.electronAPI.omnibuddy.market) || null
    },
    typeIcon(type) {
      if (type === 'workflow') return 'promotion'
      if (type === 'agent') return 'buddy'
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
          return
        }
        this.items = res.items || []
      }).catch(() => {
        this.loading = false
        this.error = '请求异常（检查网络）'
      })
    },
    switchInstalled() {
      this.tab = 'installed'
      this.loadInstalled()
    },
    loadInstalled() {
      const api = this.api()
      if (!api) return
      this.installedLoading = true
      api.installed().then(res => {
        this.installedLoading = false
        this.installed = (res && res.items) || []
      }).catch(() => {
        this.installedLoading = false
        this.installed = []
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
    // 安装/更新成功后本地同步索引项状态（不重新拉网络）
    applyLocalState(id, patch) {
      const item = this.items.find(x => x.id === id)
      if (item) Object.assign(item, patch)
    },
    uninstallItem(rec) {
      const api = this.api()
      if (!api) return
      this.$confirm(`卸载「${rec.name}」？其 skill 目录将被删除。`, '卸载确认', {
        confirmButtonText: '卸载',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        api.uninstall(rec.id).then(res => {
          if (!res || !res.ok) {
            this.$message.error((res && res.error) || '卸载失败')
            return
          }
          this.$message.success(`「${rec.name}」已卸载`)
          this.loadInstalled()
          this.applyLocalState(rec.id, { installed: false, installedVersion: '', hasUpdate: false })
        }).catch(() => {
          this.$message.error('卸载请求异常')
        })
      }).catch(() => { /* 取消 */ })
    },
    openHome(it) {
      const api = this.api()
      if (api && it.homepage) api.openHome(it.homepage)
    },
    formatTime(iso) {
      const d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      const p = n => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 页签行 */
.ob-market-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-bottom: 14px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 0;
}

.ob-market-tab {
  padding: 6px 14px 9px;
  font-size: 13px;
  font-weight: 600;
  color: $text-secondary;
  cursor: pointer;
  position: relative;
  transition: color 0.15s ease;
  display: flex;
  align-items: center;
  gap: 5px;

  &:hover {
    color: $text-primary;
  }

  &.active {
    color: var(--primary-color);

    &::after {
      content: '';
      position: absolute;
      left: 12px;
      right: 12px;
      bottom: -1px;
      height: 2px;
      border-radius: 2px;
      background: var(--primary-color);
    }
  }
}

.ob-market-tab-count {
  font-size: 10px;
  font-weight: 700;
  line-height: 1.5;
  padding: 0 6px;
  border-radius: 999px;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
}

.ob-market-toolbar {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}

.ob-market-search {
  width: 210px;
}

.ob-market-type {
  width: 110px;
}

/* 市场网格 */
.ob-market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 12px;
}

.ob-market-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  transition: all 0.18s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.07);
    transform: translateY(-1px);
  }
}

.ob-market-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ob-market-logo {
  .svg-icon {
    font-size: 17px;
    color: #fff;
  }
}

.ob-market-card-title {
  flex: 1;
  min-width: 0;
}

.ob-market-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 700;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ob-market-meta {
  margin-top: 2px;
  font-size: 11px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 状态徽标 */
.ob-market-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.6;
  padding: 0 7px;
  border-radius: 999px;

  &.ok {
    color: #0B7A61;
    background: rgba(16, 163, 127, 0.1);
    border: 1px solid rgba(16, 163, 127, 0.3);
  }

  &.update {
    color: #B26100;
    background: rgba(250, 173, 20, 0.12);
    border: 1px solid rgba(250, 173, 20, 0.4);
  }

  &.warn {
    color: #C23A2B;
    background: rgba(245, 34, 45, 0.08);
    border: 1px solid rgba(245, 34, 45, 0.3);
  }
}

.ob-market-desc {
  font-size: 11.5px;
  color: $text-secondary;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.4em;
}

.ob-market-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.ob-market-tag {
  font-size: 10px;
  line-height: 1.6;
  padding: 0 7px;
  border-radius: 5px;
  color: $text-secondary;
  background: var(--bg-hover, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--border-color);
}

.ob-market-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ob-market-link {
  font-size: 11px;
  color: var(--primary-color);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
}

.ob-market-time {
  font-size: 10.5px;
  color: $text-secondary;
  flex-shrink: 0;
}
</style>
