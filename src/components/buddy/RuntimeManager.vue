<template>
  <div class="ob-rt-manager">
    <!-- 加载中：骨架屏占位 -->
    <div v-if="loading" class="ob-sk-wrap">
      <buddy-skeleton type="list" :count="6" />
    </div>

    <template v-else>
      <!-- 清单拉取失败：本地状态仍可展示（离线降级），下载需联网 -->
      <div v-if="manifestError" class="ob-rt-offline">
        组件清单拉取失败（{{ manifestError }}）——已展示本地装配状态，下载装配需要网络连接
      </div>

      <section v-for="cat in sections" :key="cat.label" class="ob-cap-section">
        <div class="ob-cap-head">
          <span class="ob-cap-ico"><svg-icon :icon-class="cat.icon" /></span>
          <span class="ob-cap-title">{{ cat.label }}</span>
          <span class="ob-cap-count">{{ cat.items.length }}</span>
          <span class="ob-cap-desc">{{ cat.desc }}</span>
        </div>
        <!-- 行式清单（macOS 设置风格）：一行一组件，图标 + 名称 + 说明 + 尺寸 + 状态 + 操作 -->
        <div class="ob-cap-list">
          <div
            v-for="c in cat.items"
            :key="c.name"
            class="ob-cap-row ob-rt-row"
            :class="{ disabled: !c.installable }"
          >
            <span class="ob-row-ico"><svg-icon :icon-class="cat.icon" /></span>
            <span class="ob-row-label" :title="c.label">{{ c.label }}</span>
            <span class="ob-row-name" :title="c.name">{{ c.name }}</span>
            <span class="ob-row-desc" :title="c.description">{{ c.description }}</span>
            <span v-if="c.installable && !c.builtin && !c.installed" class="ob-rt-size">{{ formatSize(c.size) }}</span>

            <!-- 状态徽章：内置 / 已装配 / 未装配 / 暂不支持 -->
            <span class="ob-cap-status" :class="statusClass(c)">{{ statusText(c) }}</span>

            <!-- 操作：内置无操作；可下载 → 下载装配 / 卸载；进行中 → 禁用 -->
            <el-button
              v-if="c.installable && !c.builtin && !c.installed && !isBusy(c.name)"
              size="small"
              round
              type="primary"
              class="ob-rt-btn"
              @click="install(c)"
            >下载装配</el-button>
            <el-button
              v-if="c.installable && c.installed && !isBusy(c.name)"
              size="small"
              round
              plain
              class="ob-rt-btn"
              @click="uninstall(c)"
            >卸载</el-button>

            <!-- 装配进度：下载百分比 / 校验与装配阶段文案 -->
            <div v-if="isBusy(c.name)" class="ob-rt-progress">
              <template v-if="progressOf(c.name).phase === 'download'">
                <div class="ob-rt-bar">
                  <div class="ob-rt-bar-fill" :style="{ width: (progressOf(c.name).percent || 0) + '%' }" />
                </div>
                <span class="ob-rt-bar-text">
                  {{ progressOf(c.name).percent || 0 }}% · {{ formatSize(progressOf(c.name).received) }}<template v-if="progressOf(c.name).total"> / {{ formatSize(progressOf(c.name).total) }}</template>
                </span>
              </template>
              <template v-else>
                <span class="ob-rt-bar-text">{{ phaseText(progressOf(c.name).phase) }}</span>
              </template>
            </div>
          </div>
        </div>
      </section>

      <div v-if="!sections.length" class="ob-cap-empty">暂无组件信息（应用数据尚未初始化）</div>

      <!-- 装配位置说明（供排查与手动清理） -->
      <div v-if="meta.downloadedRoot" class="ob-rt-footer">
        在线装配目录：{{ meta.downloadedRoot }}（卸载即清理；重装应用不影响）
      </div>
    </template>
  </div>
</template>

<script>
// 运行时组件管理（设置-运行时嵌入）：瘦身版安装包的大体积运行时（python-env / node 等）按需在线装配
// 数据源：主进程 omnibuddy:runtime:status（合并组件规则表与 OmniBuddy-Plugins 发布清单）
// 进度：omnibuddy:runtime:progress 事件推送（download 百分比 / verify 校验 / extract 装配 / done / error）
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'

export default {
  name: 'RuntimeManager',
  components: { BuddySkeleton },
  data() {
    return {
      loading: false,
      loaded: false,
      components: [],
      manifestError: '',
      // 进度表：组件名 → { phase, percent, received, total, error }
      progressMap: {},
      meta: { downloadedRoot: '' },
      offProgress: null
    }
  },
  computed: {
    // 按 group 归并分组；分组元信息（图标 / 说明）随组名静态维护
    sections() {
      const META = {
        '解释器与依赖库': { icon: 'tool', desc: '代码执行工具的解释器与预装依赖库' },
        '文档转换': { icon: 'download', desc: '文档格式转换引擎' },
        '浏览器内核与辅助': { icon: 'market', desc: 'playwright 浏览器内核与媒体组件' }
      }
      const groups = []
      this.components.forEach(c => {
        let g = groups.find(x => x.label === c.group)
        if (!g) {
          const meta = META[c.group] || { icon: 'tool', desc: '' }
          g = { label: c.group, icon: meta.icon, desc: meta.desc, items: [] }
          groups.push(g)
        }
        g.items.push(c)
      })
      return groups
    }
  },
  created() {
    this.load()
    this.bindProgress()
  },
  beforeUnmount() {
    if (this.offProgress) this.offProgress()
  },
  methods: {
    api() {
      return (window.electronAPI && window.electronAPI.omnibuddy) || null
    },
    isBusy(name) {
      // 进行中：有进度且未到终态（done / error 由事件回调清表并刷新状态）
      const p = this.progressMap[name]
      return !!p && p.phase !== 'done' && p.phase !== 'error'
    },
    progressOf(name) {
      return this.progressMap[name] || { phase: '', percent: 0 }
    },
    phaseText(phase) {
      const map = { verify: 'sha256 校验中…', extract: '解压装配中…' }
      return map[phase] || '处理中…'
    },
    statusClass(c) {
      if (c.builtin) return ''
      if (c.installed) return ''
      if (!c.installable) return 'off'
      return 'idle'
    },
    statusText(c) {
      if (c.builtin) return '内置'
      if (c.installed) return '已装配'
      if (!c.installable) return '暂不支持'
      return '未装配'
    },
    formatSize(bytes) {
      if (!bytes) return ''
      if (bytes >= 1024 * 1024 * 1024) return (bytes / 1024 / 1024 / 1024).toFixed(2) + ' GB'
      if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(1) + ' MB'
      return Math.max(1, Math.round(bytes / 1024)) + ' KB'
    },
    // 装配进度事件（主进程 event.sender 推送）
    bindProgress() {
      const api = this.api()
      if (!api || !api.onRuntimeProgress) return
      this.offProgress = api.onRuntimeProgress(p => {
        if (!p || !p.component) return
        this.$set(this.progressMap, p.component, p)
        if (p.phase === 'done') {
          this.$message.success('「' + this.labelOf(p.component) + '」装配完成')
          this.refreshOne(p.component)
        }
        if (p.phase === 'error') {
          this.$message.error('「' + this.labelOf(p.component) + '」装配失败：' + (p.error || '未知错误'))
        }
      })
    },
    labelOf(name) {
      const hit = this.components.find(c => c.name === name)
      return (hit && hit.label) || name
    },
    // 单组件落地后局部刷新（不打转圈，避免打断浏览）
    refreshOne(name) {
      const api = this.api()
      if (!api || !api.runtimeStatus) return
      api.runtimeStatus().then(res => {
        if (!res || !res.ok) return
        const hit = (res.components || []).find(c => c.name === name)
        if (hit) {
          const idx = this.components.findIndex(c => c.name === name)
          if (idx >= 0) this.components.splice(idx, 1, hit)
        }
      })
    },
    async load() {
      const api = this.api()
      if (!api || !api.runtimeStatus) return
      this.loading = true
      try {
        const res = await api.runtimeStatus()
        if (res && res.ok) {
          this.components = res.components || []
          this.manifestError = res.manifestError || ''
          this.meta = { downloadedRoot: res.downloadedRoot || '' }
          this.loaded = true
        }
      } finally {
        this.loading = false
      }
    },
    async install(c) {
      const api = this.api()
      if (!api || !api.runtimeInstall) return
      this.$set(this.progressMap, c.name, { phase: 'download', percent: 0 })
      const res = await api.runtimeInstall(c.name)
      if (!res || !res.ok) {
        this.$message.error((res && res.error) || '装配失败')
      }
      // 成功路径由 progress done 事件收尾；此处兜底刷新状态
      this.refreshOne(c.name)
    },
    async uninstall(c) {
      const api = this.api()
      if (!api || !api.runtimeUninstall) return
      const yes = await this.$confirm(
        '卸载「' + c.label + '」后，相关工具将回退系统环境（可随时重新下载装配）。',
        '卸载组件',
        { confirmButtonText: '卸载', cancelButtonText: '取消', type: 'warning' }
      ).then(() => true).catch(() => false)
      if (!yes) return
      const res = await api.runtimeUninstall(c.name)
      if (res && res.ok) {
        this.$message.success('已卸载「' + c.label + '」')
        this.refreshOne(c.name)
      } else {
        this.$message.error((res && res.error) || '卸载失败')
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
  margin-bottom: 20px;
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
    background: rgba(var(--primary-color-rgb), 0.1);
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

/* ===== 行式清单（macOS 设置风格）：圆角面板 + 细分隔线，一行一组件 ===== */
.ob-cap-list {
  margin-right: 8px;
  border: 1px solid $border-color;
  border-radius: 12px;
  background: $card-bg;
  overflow: hidden;
}

.ob-cap-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 40px;
  padding: 6px 14px;
  transition: background 0.12s ease;

  & + & {
    border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.05));
  }

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.035);
  }

  &.disabled {
    .ob-row-ico,
    .ob-row-label,
    .ob-row-name,
    .ob-row-desc {
      opacity: 0.55;
    }
  }
}

.ob-row-ico {
  flex-shrink: 0;
  display: flex;
  font-size: 14px;
  color: var(--primary-color);
}

.ob-row-label {
  flex-shrink: 0;
  max-width: 150px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 组件标识（规则表键名）：等宽小字，次要信息 */
.ob-row-name {
  flex-shrink: 0;
  max-width: 140px;
  font-size: 11px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-row-desc {
  flex: 1;
  min-width: 0;
  font-size: 12px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 发行包尺寸（未装配行）：次要等宽信息 */
.ob-rt-size {
  flex-shrink: 0;
  font-size: 11px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: $text-secondary;
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

  /* 未装配但可下载：主色描边态，引导操作 */
  &.idle {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.08);
  }
}

/* 行尾操作按钮 */
.ob-rt-btn {
  flex-shrink: 0;
  padding: 3px 10px;
  font-size: 10.5px;
  line-height: 1.5;
}

/* 装配进度（替换按钮位置的行内进度条） */
.ob-rt-progress {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 150px;
}

.ob-rt-bar {
  width: 90px;
  height: 4px;
  border-radius: 2px;
  background: rgba(0, 0, 0, 0.08);
  overflow: hidden;
}

.ob-rt-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--primary-color);
  transition: width 0.3s ease;
}

.ob-rt-bar-text {
  font-size: 10.5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: $text-secondary;
  white-space: nowrap;
}

/* 清单拉取失败提示（离线降级仍可查看本地状态） */
.ob-rt-offline {
  margin-bottom: 14px;
  padding: 8px 12px;
  border-radius: $radius-sm;
  background: rgba(230, 162, 60, 0.1);
  font-size: 11.5px;
  line-height: 1.6;
  color: #a06a1b;
}

/* 装配目录脚注 */
.ob-rt-footer {
  margin-top: 6px;
  padding: 10px 4px 4px;
  font-size: 11px;
  color: $text-secondary;
  opacity: 0.75;
}

.ob-cap-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 12.5px;
  color: $text-secondary;
  opacity: 0.8;
}
</style>
