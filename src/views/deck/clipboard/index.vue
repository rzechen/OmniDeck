<template>
  <tool-shell
    title="剪贴板"
    desc="全局复制记录 + 截图，按时间线呈现，自动本地保存"
    icon="clipboard"
    color="#EB2F96"
  >
    <template #toolbar>
      <div class="ss-search">
        <svg-icon icon-class="search" class-name="search-ic" />
        <input
          v-model="keyword"
          type="text"
          placeholder="搜索记录"
          spellcheck="false"
        />
        <svg-icon v-if="keyword" icon-class="circle-close" class-name="ss-search-clear" @click="keyword = ''" />
      </div>
      <button v-if="history.length" class="tool-btn is-danger" @click="clearHistory">
        <svg-icon icon-class="delete" /> 清空
      </button>
    </template>

    <template #status>
      <span class="status-dot"></span>
      <span>{{ statusText }}</span>
      <span class="status-right">{{ history.length + ' 条记录' }}</span>
    </template>

    <div class="ss-body">
      <!-- 时间线：按日期分组，滚动加载 -->
      <div ref="pane" class="ss-pane" @scroll="onScroll">
        <template v-if="groups.length">
          <div v-for="g in visibleGroups" :key="g.key" class="ss-group">
            <div class="ss-group-date">
              <svg-icon icon-class="date" class-name="mr-1" />
              {{ g.label }}
            </div>
            <div class="ss-items">
              <div
                v-for="c in g.items"
                :key="c.id"
                class="ss-item"
                @click="onItemClick(c)"
              >
                <!-- 文本记录 -->
                <pre v-if="c.kind === 'text'" class="ss-item-text">{{ c.text }}</pre>

                <!-- 图片记录（截图 / 剪贴板图片）：缩略图点击看大图，行点击复制 -->
                <template v-else>
                  <div class="ss-thumb-wrapper" @click.stop="preview(c)">
                    <img class="ss-item-thumb" :src="c.thumb" alt="图片记录" loading="lazy" />
                    <span class="ss-thumb-mask"><svg-icon icon-class="view" /></span>
                  </div>
                  <div class="ss-image-meta">
                    <span class="ss-item-size">{{ c.width }} × {{ c.height }}</span>
                    <span v-if="c.source === 'capture'" class="ss-kind is-capture">截图</span>
                    <span v-else-if="c.kind === 'scroll'" class="ss-kind is-scroll">长图</span>
                    <span v-else class="ss-kind">图片</span>
                  </div>
                </template>

                <span class="ss-time">{{ fmtTime(c.createdAt) }}</span>

                <!-- 操作栏 -->
                <div class="ss-item-ops">
                  <button title="复制" @click.stop="copyItem(c)">
                    <svg-icon icon-class="document-copy" />
                  </button>
                  <button
                    :title="isFaved(c) ? '取消收藏' : '加入收藏'"
                    @click.stop="toggleFav(c)"
                  >
                    <svg-icon :icon-class="(isFaved(c) ? 'star-on is-faved' : 'star-off')" />
                  </button>
                  <button v-if="c.kind === 'image'" title="另存为 PNG" @click.stop="saveItem(c)">
                    <svg-icon icon-class="download" />
                  </button>
                  <button title="删除" @click.stop="removeItem(c)">
                    <svg-icon icon-class="delete" />
                  </button>
                </div>
              </div>
            </div>
          </div>
          <!-- 滚动加载提示 -->
          <div v-if="hasMore" class="ss-more"><svg-icon icon-class="loading" /></div>
          <div v-else-if="history.length > PAGE_SIZE" class="ss-more-end">已全部加载</div>
        </template>
        <div v-else class="ss-empty">
          <svg-icon icon-class="clipboard" class="ss-empty-ico" />
          <p v-if="keyword">没有匹配「{{ keyword }}」的记录</p>
          <p v-else>暂无复制记录</p>
          <p v-if="!keyword" class="ss-empty-sub">在其他应用复制的内容、快捷键截图都会自动出现在这里</p>
        </div>
      </div>
    </div>

    <!-- 大图预览弹窗 -->
    <el-dialog
      v-model="previewVisible"
      :title="previewTitle"
      width="65%"
      top="7vh"
      :close-on-click-modal="false"
      append-to-body
      class="ss-preview-dialog"
      @closed="previewData = ''"
    >
      <div class="ss-preview">
        <img v-if="previewData" :src="previewData" alt="预览" />
        <div v-else class="ss-preview-loading"><svg-icon icon-class="loading" /></div>
      </div>
      <template #footer>
        <button class="tool-btn" @click="copyItem(previewRec)">
          <svg-icon icon-class="document-copy" /> 复制
        </button>
        <button class="tool-btn" @click="saveItem(previewRec)">
          <svg-icon icon-class="download" /> 另存为
        </button>
      </template>
    </el-dialog>

    <!-- 文本详情弹窗 -->
    <el-dialog
      v-model="textPreviewVisible"
      title="文本详情"
      width="55%"
      top="12vh"
      :close-on-click-modal="false"
      append-to-body
      class="ss-preview-dialog ss-text-dialog"
    >
      <div class="ss-text-preview">
        <pre>{{ textPreviewRec ? textPreviewRec.text : '' }}</pre>
      </div>
      <template #footer>
        <button class="tool-btn" @click="copyItem(textPreviewRec)">
          <svg-icon icon-class="document-copy" /> 复制文本
        </button>
      </template>
    </el-dialog>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'ClipboardHistory',
  components: { ToolShell },
  data() {
    return {
      history: [],
      keyword: '',
      visibleCount: 40,
      PAGE_SIZE: 40,
      favMap: {}, // 已收藏映射：histId -> favId（空表示未收藏）
      favMapKey: '', // 上次映射的序列化值，避免轮询时无谓重渲染
      // 图片预览
      previewVisible: false,
      previewData: '',
      previewRec: null,
      // 文本预览
      textPreviewVisible: false,
      textPreviewRec: null
    }
  },
  computed: {
    api() {
      return (window.electronAPI && window.electronAPI.capture) || null
    },
    // 剪贴板收藏 IPC（仅桌面端提供）
    favApi() {
      return (window.electronAPI && window.electronAPI.captureFav) || null
    },
    previewTitle() {
      const r = this.previewRec
      return r ? `图片预览 · ${r.width} × ${r.height}` : '图片预览'
    },
    statusText() {
      return '自动记录并本地保存'
    },
    filteredHistory() {
      const kw = this.keyword.trim().toLowerCase()
      if (!kw) return this.history
      return this.history.filter(c => {
        if (c.kind === 'text') return (c.text || '').toLowerCase().indexOf(kw) >= 0
        const tag = c.source === 'capture' ? '截图' : (c.kind === 'scroll' ? '长图' : '图片')
        return tag.indexOf(this.keyword.trim()) >= 0
      })
    },
    groups() {
      const out = []
      const today = new Date()
      const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
      const map = {}
      for (const c of this.filteredHistory) {
        const key = this.dayKey(c.createdAt)
        if (!map[key]) {
          map[key] = {
            key,
            label: this.dayLabel(c.createdAt, t0),
            items: []
          }
          out.push(map[key])
        }
        map[key].items.push(c)
      }
      return out
    },
    visibleGroups() {
      let rest = this.visibleCount
      const out = []
      for (const g of this.groups) {
        if (rest <= 0) break
        if (g.items.length <= rest) {
          out.push(g)
          rest -= g.items.length
        } else {
          out.push({ ...g, items: g.items.slice(0, rest) })
          rest = 0
        }
      }
      return out
    },
    hasMore() {
      return this.visibleCount < this.filteredHistory.length
    }
  },
  watch: {
    keyword() {
      this.visibleCount = this.PAGE_SIZE
    }
  },
  mounted() {
    this.loadHistory()
    this.loadFavIds()
    this.onWinFocus = () => {
      this.loadHistory()
      this.loadFavIds()
    }
    window.addEventListener('focus', this.onWinFocus)
    this.timer = setInterval(() => {
      if (document.hasFocus && document.hasFocus()) {
        this.loadHistory()
        this.loadFavIds()
      }
    }, 2000)
  },
  // keep-alive 缓存：从收藏页切回时立即同步收藏状态
  activated() {
    this.loadFavIds()
  },
  beforeUnmount() {
    window.removeEventListener('focus', this.onWinFocus)
    if (this.timer) { clearInterval(this.timer); this.timer = null }
  },
  methods: {
    async loadHistory() {
      if (!this.api || !this.api.historyList) return
      const res = await this.api.historyList()
      if (res && res.ok) this.history = res.items || []
    },
    onScroll() {
      const el = this.$refs.pane
      if (!el || !this.hasMore) return
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 60) {
        this.visibleCount += this.PAGE_SIZE
      }
    },
    // 条目点击触发逻辑：文本弹出文本详情；图片复制
    onItemClick(c) {
      if (c.kind === 'text') {
        this.previewText(c)
      } else {
        this.copyItem(c)
      }
    },
    previewText(c) {
      this.textPreviewRec = c
      this.textPreviewVisible = true
    },
    async copyItem(c) {
      if (!c || !this.api) return
      const res = await this.api.historyCopy(c.id)
      if (res && res.ok) this.$message.success('已复制到剪贴板')
    },
    async removeItem(c) {
      if (!c || !this.api) return
      await this.api.historyRemove(c.id)
      this.loadHistory()
    },
    // 拉取已收藏映射（轻量，轮询/fl聚焦时同步；收藏页删除后此处会自动恢复空心）
    async loadFavIds() {
      if (!this.favApi || !this.favApi.ids) return
      const res = await this.favApi.ids()
      if (!res || !res.ok) return
      const map = res.map || {}
      const key = JSON.stringify(map)
      if (key === this.favMapKey) return
      this.favMapKey = key
      this.favMap = map
    },
    // 该历史记录是否已收藏
    isFaved(c) {
      return !!(c && this.favMap[c.id])
    },
    // 收藏切换：未收藏 → 加入收藏；已收藏 → 取消收藏
    async toggleFav(c) {
      if (!c) return
      const favApi = this.favApi
      if (!favApi || !favApi.add) { this.$message.info('收藏功能需要 OmniDeck 桌面端'); return }
      const favId = this.favMap[c.id]
      if (favId) {
        const res = await favApi.remove(favId)
        if (res && res.ok) {
          this.favMapKey = ''
          this.loadFavIds()
          this.$message({ message: '已取消收藏', type: 'success', duration: 1500 })
        } else {
          this.$message.error('取消收藏失败')
        }
        return
      }
      const res = await favApi.add(c.id)
      if (res && res.ok) {
        this.favMapKey = ''
        this.loadFavIds()
        this.$message.success('已加入收藏')
      } else if (res && res.reason === 'full') {
        this.$message.warning(`收藏已满（${res.limit} 条）`)
      } else {
        this.$message.error('加入收藏失败')
      }
    },
    async clearHistory() {
      if (!this.api) return
      await this.api.historyClear()
      this.loadHistory()
    },
    async saveItem(c) {
      if (!c || c.kind !== 'image' || !this.api) return
      const res = await this.api.historySaveAs(c.id)
      if (res && res.ok) this.$message.success('已保存：' + res.filePath)
    },
    async preview(c) {
      if (!c || c.kind !== 'image' || !this.api) return
      this.previewRec = c
      this.previewVisible = true
      this.previewData = ''
      const res = await this.api.historyData(c.id)
      if (res && res.ok) this.previewData = res.data
    },
    fmtTime(ts) {
      const d = new Date(ts)
      const pad = n => String(n).padStart(2, '0')
      return `${pad(d.getHours())}:${pad(d.getMinutes())}`
    },
    dayKey(ts) {
      const d = new Date(ts)
      return d.getFullYear() + '-' + d.getMonth() + '-' + d.getDate()
    },
    dayLabel(ts, todayStart) {
      const d = new Date(ts)
      const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
      const diff = Math.round((todayStart - dayStart) / 86400000)
      if (diff === 0) return '今天'
      if (diff === 1) return '昨天'
      const week = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
      const base = `${d.getMonth() + 1} 月 ${d.getDate()} 日 · 周${week}`
      return d.getFullYear() === new Date(todayStart).getFullYear() ? base : `${d.getFullYear()} 年 ` + base
    }
  }
}
</script>
<style lang="scss" scoped>
.ss-body {
  flex: 1;
  /* 横向 flex 父容器中的宽度约束：缺 min-width:0 会被内容最小宽撑开，右侧溢出被裁 */
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.ss-pane {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden; /* 禁止横向滚动，超宽由行内收缩裁剪 */
  padding: 8px 10px 14px;
}

.ss-group + .ss-group {
  margin-top: 10px;
}

.ss-group-date {
  position: sticky;
  top: -8px; /* 抵消 pane 顶部 padding */
  z-index: 2;
  margin: 0 -10px 4px -10px;
  padding: 3px 10px;
  background: var(--content-bg, #FBFCFD);
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  gap: 4px;

  .mr-1 {
    font-size: 12px;
  }
}

/* 记录列表容器：紧凑排列 */
.ss-items {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 单条记录：紧凑等高行，文本区 flex 收缩兜底防溢出 */
.ss-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  min-height: 40px; /* 文本行基准高度，与图片缩略图 36px + padding 对齐 */
  box-sizing: border-box;
  padding: 4px 8px;
  border-radius: 8px;
  cursor: pointer;
  background: var(--card-bg, #ffffff);
  border: 1px solid var(--border-color, #e8e8e8);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.02);
  transition: all 0.18s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    border-color: var(--primary-color);
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.06);
  }
}

.ss-item-content {
  flex: 1;
  min-width: 0;
}

/* 单行排版：超长省略号截断，完整内容点开弹窗看（保留格式） */
.ss-item-text {
  flex: 1;
  min-width: 0; /* flex 子项收缩，右侧时间/按钮不会被挤没 */
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  font-size: 12.5px;
  line-height: 1.4;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 搜索框 */
.ss-search {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 8px;
  border-radius: 14px;
  border: 1px solid var(--border-color, #d9d9d9);
  background: var(--search-bg, #f5f5f5);
  transition: all 0.2s ease;

  .search-ic {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-secondary);
  }

  input {
    width: 130px;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: var(--text-primary);
    -webkit-app-region: no-drag;

    &::placeholder {
      color: var(--text-secondary);
      opacity: 0.7;
    }
  }

  .ss-search-clear {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--text-secondary);
    cursor: pointer;
    opacity: 0.7;

    &:hover {
      opacity: 1;
    }
  }

  &:focus-within {
    border-color: var(--primary-color);
    background: var(--card-bg, #fff);
    box-shadow: 0 0 0 2px rgba(235, 47, 150, 0.1);
  }
}

/* 紧凑型图片缩略图 */
.ss-thumb-wrapper {
  position: relative;
  flex-shrink: 0;
  width: 72px;
  height: 36px;
  border-radius: 5px;
  overflow: hidden;
  border: 1px solid var(--border-color, #eee);
  background: var(--search-bg, #fafafa);

  .ss-item-thumb {
    width: 100%;
    height: 100%;
    object-fit: contain;
    transition: transform 0.2s ease;
  }

  .ss-thumb-mask {
    position: absolute;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    font-size: 13px;
    opacity: 0;
    transition: opacity 0.15s ease;
  }

  &:hover {
    .ss-item-thumb {
      transform: scale(1.05);
    }
    .ss-thumb-mask {
      opacity: 1;
    }
  }
}

.ss-image-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  min-width: 0;
  /* 中间信息区允许收缩：面板窄时优先压缩此区域，时间和按钮不被挤出边界 */
  overflow: hidden;
}

.ss-item-size {
  flex-shrink: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}

.ss-kind {
  flex-shrink: 0;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(0, 0, 0, 0.04);
  color: var(--text-secondary);
  font-size: 10px;
  font-weight: 500;

  &.is-capture {
    background: rgba(235, 47, 150, 0.08);
    color: var(--primary-color);
  }

  &.is-scroll {
    background: rgba(24, 144, 255, 0.08);
    color: #1890ff;
  }
}

.ss-item .ss-time {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
  opacity: 0.75;
}

/* 右侧操作栏：常驻显示 */
.ss-item-ops {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
  background: var(--card-bg, #fff);
  padding-left: 4px;

  button {
    width: 22px;
    height: 22px;
    border: 1px solid transparent;
    border-radius: 5px;
    background: transparent;
    color: var(--text-secondary);
    font-size: 12px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: all 0.12s ease;

    &:hover {
      background: var(--search-bg, #f5f5f5);
      border-color: var(--border-color, #e8e8e8);
      color: var(--primary-color);
    }

    &:active {
      transform: scale(0.92);
    }

    /* 已收藏：实心星标用剪贴板主题色标出 */
    i.is-faved {
      color: var(--primary-color);
    }
  }
}

/* 空状态与底部提示 */
.ss-more, .ss-more-end {
  padding: 10px 0;
  text-align: center;
  color: var(--text-secondary);
  font-size: 11px;
  opacity: 0.7;
}

.ss-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;

  .ss-empty-ico {
    width: 40px;
    height: 40px;
    opacity: 0.35;
    margin-bottom: 2px;
  }

  .ss-empty-sub {
    font-size: 11px;
    opacity: 0.6;
  }
}

</style>

<style lang="scss">
/* 弹窗全局样式（append-to-body 不受 scoped 限制） */
.ss-preview-dialog {
  border-radius: 14px;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.18);

  .el-dialog__header {
    padding: 12px 18px 10px;
    border-bottom: 1px solid var(--border-color, #e8e8e8);
  }

  .el-dialog__title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-primary, #1a1a1f);
  }

  .el-dialog__body {
    padding: 14px 18px;
  }

  .el-dialog__footer {
    padding: 10px 18px 14px;
    border-top: 1px solid var(--border-color, #e8e8e8);
  }

  .ss-preview {
    max-height: 60vh;
    overflow: auto;
    text-align: center;
    background: var(--search-bg, #f5f5f5);
    border-radius: 10px;

    img {
      max-width: 100%;
      border-radius: 6px;
    }
  }

  .ss-preview-loading {
    padding: 70px 0;
    font-size: 26px;
    color: var(--text-secondary);
  }
}

/* 文本详情弹窗：等宽字体 + 保留原始换行与缩进 */
.ss-text-dialog {
  .ss-text-preview {
    max-height: 62vh;
    overflow: auto;
    background: var(--search-bg, #f5f5f5);
    border-radius: 10px;
    padding: 14px 16px;

    pre {
      margin: 0;
      font-family: 'SF Mono', Menlo, Consolas, 'Courier New', monospace;
      font-size: 12.5px;
      line-height: 1.6;
      color: var(--text-primary, #1a1a1f);
      white-space: pre-wrap;      /* 保留换行 */
      word-break: break-all;      /* 长串不撑破容器 */
      tab-size: 4;
    }
  }
}
</style>