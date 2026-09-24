<template>
  <div class="ob-manage-page">
    <!-- 顶部 Hero -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">能力清单</h2>
          <span class="ob-hero-badge" v-if="loaded">{{ total }} 项能力</span>
        </div>
        <p class="ob-section-desc">
          当前 Agent 可用的全部工具目录，按类别呈现；各项的放行 / 确认 / 禁用可在「权限策略」中配置
        </p>
      </div>
    </header>

    <!-- 内容区（hero 固定，仅此区域滚动） -->
    <div class="ob-page-body">
      <!-- 加载中：骨架屏占位（能力分组卡片网格形态） -->
      <div v-if="loading" class="ob-sk-wrap">
        <buddy-skeleton type="cards" :count="8" />
      </div>

      <template v-else>
        <section v-for="cat in sections" :key="cat.key" class="ob-cap-section">
          <div class="ob-cap-head">
            <span class="ob-cap-ico"><svg-icon :icon-class="cat.icon" /></span>
            <span class="ob-cap-title">{{ cat.label }}</span>
            <span class="ob-cap-count">{{ cat.items.length }}</span>
            <span class="ob-cap-desc">{{ cat.desc }}</span>
          </div>
          <div class="ob-cards-grid">
            <div
              v-for="t in cat.items"
              :key="t.name"
              class="ob-grid-card"
              :class="{ disabled: t.disabled }"
            >
              <div class="ob-card-head">
                <div class="ob-card-logo" :class="cat.logo">
                  <svg-icon :icon-class="cat.icon" />
                </div>
                <div class="ob-card-title">
                  <div class="ob-card-name">
                    <span class="ob-name-text">{{ t.label }}</span>
                    <span class="ob-cap-status" :class="{ off: t.disabled }">
                      {{ t.disabled ? '已禁用' : '可用' }}
                    </span>
                  </div>
                  <div class="ob-card-meta">
                    <span class="ob-meta-name">{{ t.name }}</span>
                    <!-- 解释器 / 内置服务（python / node / playwright）：点击查看预装依赖落位 -->
                    <el-button
                      v-if="t.runtime"
                      size="mini"
                      round
                      plain
                      class="ob-deps-btn"
                      @click="openDeps(t)"
                    >预装依赖 {{ installedCount(t.runtime) }}/{{ t.runtime.modules.length }}</el-button>
                  </div>
                </div>
              </div>
              <p class="ob-card-desc">{{ t.description }}</p>
            </div>
          </div>
        </section>

        <div v-if="!sections.length" class="ob-cap-empty">暂无可用能力（应用数据尚未初始化或加载失败）</div>
      </template>
    </div>

    <!-- 预装依赖弹窗：运行时来源 + 依赖模块落位清单（按用途分组） -->
    <el-dialog
      :title="deps.software + ' 预装依赖'"
      :visible.sync="deps.visible"
      width="560px"
      append-to-body
      custom-class="ob-el-dialog"
    >
      <div class="ob-dialog-deps">
        <div class="ob-deps-meta">
          <span class="ob-meta-item">
            运行时来源：<b>{{ deps.sourceLabel }}</b>
          </span>
          <span class="ob-meta-item">
            已落位 <b>{{ deps.installed }}</b> / {{ deps.modules.length }}
          </span>
        </div>
        <div v-if="deps.source !== 'builtin'" class="ob-deps-tip">
          内置运行时未装配，以下依赖尚未落位（可执行 scripts/provision-runtime.sh install 装配）
        </div>

        <div v-for="g in deps.groups" :key="g.title" class="ob-deps-group">
          <div class="ob-deps-group-title">{{ g.title }}</div>
          <div class="ob-deps-rows">
            <div
              v-for="m in g.items"
              :key="m.name"
              class="ob-deps-row"
              :class="{ off: !m.installed }"
            >
              <span class="ob-row-name">{{ m.name }}</span>
              <span class="ob-row-ver">{{ m.installed ? m.version : '未落位' }}</span>
            </div>
          </div>
        </div>

        <!-- 服务暴露的工具集（如 playwright 的浏览器工具；随服务包落位，不参与依赖计数） -->
        <div v-if="deps.tools.length" class="ob-deps-group">
          <div class="ob-deps-group-title">浏览器工具（{{ deps.tools.length }} 项）</div>
          <div class="ob-deps-tools">
            <span v-for="name in deps.tools" :key="name" class="ob-tool-chip">{{ name }}</span>
          </div>
        </div>
      </div>
      <template slot="footer">
        <el-button size="small" round @click="deps.visible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
// OmniBuddy 能力清单：呈现当前 Agent 可用工具的分类目录
// 数据源：主进程 omnibuddy:capability:list（核心 / 扩展 / 交互任务 / 语义记忆 / 连接器，静态目录与工具注册处同步维护）
// 分组元数据与权限策略下拉共用 categories.js（一处定义，两处消费）
import { CAPABILITY_CATEGORIES } from './categories'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'

export default {
  name: 'OmniBuddyCapabilities',
  components: { BuddySkeleton },
  data() {
    return {
      loading: false,
      loaded: false,
      groups: { core: [], builtin: [], ui: [], memory: [], connectors: [] },
      // 分类元信息（共享定义，与权限策略下拉一致）
      categories: CAPABILITY_CATEGORIES,
      // 预装依赖弹窗：当前查看的运行时工具及其依赖分组
      deps: {
        visible: false,
        software: '',
        source: '',
        sourceLabel: '',
        installed: 0,
        modules: [],
        groups: [],
        tools: []
      }
    }
  },
  computed: {
    // 分类元信息 + 实际清单合并；空分类不呈现
    sections() {
      const out = []
      this.categories.forEach(c => {
        const items = this.groups[c.key] || []
        if (items.length) out.push(Object.assign({}, c, { items }))
      })
      return out
    },
    total() {
      return this.sections.reduce((n, s) => n + s.items.length, 0)
    }
  },
  created() {
    this.load()
  },
  methods: {
    api() {
      return (window.electronAPI && window.electronAPI.omnibuddy) || null
    },
    // 已落位依赖数（卡片按钮「n / m」）
    installedCount(rt) {
      return (rt.modules || []).filter(m => m.installed).length
    },
    // 打开预装依赖弹窗：按 group 归并模块清单
    openDeps(t) {
      const rt = t.runtime
      const groups = []
      ;(rt.modules || []).forEach(m => {
        let g = groups.find(x => x.title === m.group)
        if (!g) {
          g = { title: m.group, items: [] }
          groups.push(g)
        }
        g.items.push(m)
      })
      this.deps = {
        visible: true,
        software: rt.software,
        source: rt.source,
        sourceLabel: rt.sourceLabel,
        installed: this.installedCount(rt),
        modules: rt.modules || [],
        groups,
        tools: rt.tools || []
      }
    },
    async load() {
      const api = this.api()
      if (!api || !api.capabilityList) return
      this.loading = true
      try {
        const res = await api.capabilityList()
        if (res && res.ok && res.groups) {
          this.groups = Object.assign({ core: [], builtin: [], ui: [], memory: [], connectors: [] }, res.groups)
          this.loaded = true
        }
      } finally {
        this.loading = false
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

.ob-cap-section {
  margin-bottom: 22px;

  /* 卡片右缘与滚动条让位：滚动容器（ob-page-body）右缘有 6px 滚动条，
     卡片 hover 阴影/边框贴叠滚动条，右移网格留出间隙 */
  .ob-cards-grid {
    padding-right: 8px;
  }
}

.ob-cap-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 10px;

  .ob-cap-ico {
    align-self: center;
    display: flex;
    color: var(--primary-color);
    font-size: 14px;
  }

  .ob-cap-title {
    font-size: 14.5px;
    font-weight: 700;
    color: $text-primary;
  }

  .ob-cap-count {
    align-self: center;
    font-size: 10.5px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 10px;
    background: rgba(var(--primary-color-rgb, 91, 124, 240), 0.1);
    color: var(--primary-color);
  }

  .ob-cap-desc {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    color: $text-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

/* 卡片标题：名称过长截断；状态徽标紧随名称且不被压缩 */
.ob-name-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ob-cap-status {
  flex-shrink: 0;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 9px;
  border-radius: 10px;
  color: #2e8b63;
  background: rgba(70, 168, 127, 0.12);

  &.off {
    color: $text-secondary;
    background: rgba(0, 0, 0, 0.06);
  }
}

/* 卡片元信息行：工具名 + 「预装依赖」入口（python / node / playwright 卡片出现按钮） */
.ob-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;

  .ob-meta-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* 「预装依赖」按钮：紧随工具名，不被压缩 */
.ob-deps-btn {
  flex-shrink: 0;
  padding: 3px 9px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--primary-color);
  border-color: rgba(var(--primary-color-rgb, 91, 124, 240), 0.35);
  background: rgba(var(--primary-color-rgb, 91, 124, 240), 0.06);
}

/* ===== 预装依赖弹窗 ===== */
.ob-dialog-deps {
  max-height: 58vh;
  overflow-y: auto;
}

.ob-deps-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  font-size: 12px;
  color: $text-secondary;

  .ob-meta-item b {
    color: $text-primary;
    font-weight: 700;
  }
}

.ob-deps-tip {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: $radius-sm;
  background: rgba(230, 162, 60, 0.1);
  font-size: 11.5px;
  line-height: 1.6;
  color: #a06a1b;
}

.ob-deps-group {
  margin-top: 14px;

  .ob-deps-group-title {
    margin-bottom: 7px;
    font-size: 11.5px;
    font-weight: 700;
    color: $text-primary;
  }
}

/* 依赖行：两列网格，名称左 / 版本右 */
.ob-deps-rows {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
}

.ob-deps-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 9px;
  border-radius: $radius-sm;
  background: rgba(0, 0, 0, 0.025);

  .ob-row-name {
    min-width: 0;
    font-size: 12px;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ob-row-ver {
    flex-shrink: 0;
    font-size: 11px;
    color: #2e8b63;
  }

  &.off {
    .ob-row-name {
      color: $text-secondary;
    }

    .ob-row-ver {
      color: $text-secondary;
      opacity: 0.7;
    }
  }
}

/* 工具集（playwright 浏览器工具）：紧凑标签流 */
.ob-deps-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .ob-tool-chip {
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 11px;
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb, 91, 124, 240), 0.07);
  }
}

.ob-cap-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 12.5px;
  color: $text-secondary;
  opacity: 0.8;
}
</style>
