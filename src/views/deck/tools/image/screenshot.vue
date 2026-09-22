<template>
  <tool-shell
    title="截图"
    desc="选区 / 全屏 / 滚动长截图 + 剪贴板历史"
    icon="screenshot"
    color="#EB2F96"
    back-path="/tools/image"
  >
    <template #toolbar>
      <button class="tool-btn is-primary" :disabled="!granted" @click="doArea">
        <i class="el-icon-crop"></i>
        选区截图
      </button>
      <button class="tool-btn" :disabled="!granted" @click="doScreen">
        <i class="el-icon-full-screen"></i>
        全屏截图
      </button>
      <button class="tool-btn" :disabled="!granted" @click="doScroll">
        <i class="el-icon-scissors"></i>
        长截图
      </button>
      <button class="tool-btn" @click="doClipboard">
        <i class="el-icon-document-copy"></i>
        导入剪贴板
      </button>
      <div class="ss-keep">
        <span>保留</span>
        <el-input-number
          v-model="keep"
          :min="1"
          :max="500"
          size="mini"
          controls-position="right"
          @change="onKeepChange"
        />
        <span>条</span>
      </div>
    </template>

    <template #status>
      <!-- 快捷键展示 + 修改（点击录入新组合键） -->
      <div class="ss-shortcuts">
        <span
          v-for="k in shortcutList"
          :key="k.key"
          class="ss-sc"
          :class="{ recording: recordingKey === k.key }"
          :title="recordingKey === k.key ? '按下新组合键，Esc 取消' : '点击修改快捷键'"
          @click="startRecord(k.key)"
        >{{ k.label }} {{ prettyAcc(k.acc) }}</span>
      </div>
      <span class="status-dot" :class="{ 'is-bad': !granted }"></span>
      <span>{{ statusText }}</span>
      <span class="status-right">{{ tab === 'shots' ? records.length + ' 条截图' : clips.length + ' 条记录' }}</span>
    </template>

    <!-- macOS 屏幕录制权限引导 -->
    <div v-if="!granted" class="ss-perm">
      <i class="el-icon-warning-outline"></i>
      <span>需要「屏幕录制」权限才能截图</span>
      <button class="tool-btn" @click="openPerm">去系统设置授权</button>
      <button class="tool-btn" @click="refreshStatus">已授权，刷新</button>
    </div>

    <div v-else class="ss-body">
      <!-- Tab 切换 + 开关 -->
      <div class="ss-tabs">
        <div class="ss-tabs-left">
          <button
            class="ss-tab"
            :class="{ active: tab === 'shots' }"
            @click="tab = 'shots'"
          >截图记录</button>
          <button
            class="ss-tab"
            :class="{ active: tab === 'clips' }"
            @click="switchClips"
          >剪贴板历史</button>
        </div>
        <div class="ss-tabs-right">
          <label class="ss-switch" title="关闭后仅保存在内存，重启即清空">
            <input
              type="checkbox"
              :checked="persist"
              @change="onPersistChange($event.target.checked)"
            />
            本地持久化
          </label>
          <label class="ss-switch" title="记录系统全局复制的文本与图片（1 秒轮询）">
            <input
              type="checkbox"
              :checked="clipWatch"
              @change="onClipWatchChange($event.target.checked)"
            />
            记录复制内容
          </label>
          <button v-if="tab === 'shots' && records.length" class="ss-clear" @click="clearShots">
            清空截图
          </button>
          <button v-if="tab === 'clips' && clips.length" class="ss-clear" @click="clearClips">
            清空记录
          </button>
        </div>
      </div>

      <!-- 截图记录 -->
      <div v-show="tab === 'shots'" class="ss-pane">
        <div v-if="records.length" class="ss-grid">
          <div
            v-for="rec in records"
            :key="rec.id"
            class="ss-card"
            @click="preview(rec)"
          >
            <img :src="rec.thumb" alt="缩略图" loading="lazy" />
            <div class="ss-card-bar">
              <span class="ss-size">{{ rec.width }} × {{ rec.height }}</span>
              <span class="ss-time">{{ fmtTime(rec.createdAt) }}</span>
              <span v-if="rec.kind === 'scroll'" class="ss-kind">长图</span>
            </div>
            <div class="ss-card-ops">
              <button title="复制" @click.stop="copyRec(rec)">
                <i class="el-icon-document-copy"></i>
              </button>
              <button title="另存为 PNG" @click.stop="saveRec(rec)">
                <i class="el-icon-download"></i>
              </button>
              <button title="删除" @click.stop="removeRec(rec)">
                <i class="el-icon-delete"></i>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="ss-empty">
          <svg-icon icon-class="screenshot" class="ss-empty-ico" />
          <p>暂无截图记录</p>
          <p class="ss-empty-sub">截图自动复制到剪贴板{{ persist ? '，记录持久保存在本机' : '' }}</p>
        </div>
      </div>

      <!-- 剪贴板历史 -->
      <div v-show="tab === 'clips'" class="ss-pane">
        <div v-if="clips.length" class="ss-clips">
          <div v-for="c in clips" :key="c.id" class="ss-clip" @click="copyClip(c)">
            <!-- 文本记录 -->
            <template v-if="c.kind === 'text'">
              <pre class="ss-clip-text">{{ c.text }}</pre>
              <span class="ss-clip-len">{{ c.length }} 字</span>
            </template>
            <!-- 图片记录 -->
            <template v-else>
              <img class="ss-clip-thumb" :src="c.thumb" alt="剪贴板图片" loading="lazy" />
            </template>
            <span class="ss-time">{{ fmtTime(c.createdAt) }}</span>
            <div class="ss-clip-ops">
              <button title="复制" @click.stop="copyClip(c)">
                <i class="el-icon-document-copy"></i>
              </button>
              <button title="删除" @click.stop="removeClip(c)">
                <i class="el-icon-delete"></i>
              </button>
            </div>
          </div>
        </div>
        <div v-else class="ss-empty">
          <svg-icon icon-class="screenshot" class="ss-empty-ico" />
          <p>暂无复制记录</p>
          <p class="ss-empty-sub">
            {{ clipWatch ? '在其他应用复制的内容会自动出现在这里' : '开启「记录复制内容」后，全局复制的文本与图片会出现在这里' }}
          </p>
        </div>
      </div>
    </div>

    <!-- 大图预览 -->
    <el-dialog
      :visible.sync="previewVisible"
      :title="previewTitle"
      width="80%"
      top="4vh"
      append-to-body
      custom-class="ss-preview-dialog"
      @closed="previewData = ''"
    >
      <div class="ss-preview">
        <img v-if="previewData" :src="previewData" alt="预览" />
        <div v-else class="ss-preview-loading"><i class="el-icon-loading"></i></div>
      </div>
      <template #footer>
        <button class="tool-btn" @click="copyRec(previewRec)">
          <i class="el-icon-document-copy"></i> 复制
        </button>
        <button class="tool-btn" @click="saveRec(previewRec)">
          <i class="el-icon-download"></i> 另存为
        </button>
      </template>
    </el-dialog>
  </tool-shell>
</template>

<script>
// 截图工具（iShot 风格）：选区 / 全屏 / 滚动长截图 + 剪贴板导入；
// 记录仅保存在主进程内存（可设保留条数），缩略图直显、点开按需拉取原图
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'ImageScreenshot',
  components: { ToolShell },
  data() {
    return {
      granted: true,
      keep: 50,
      records: [],
      previewVisible: false,
      previewData: '',
      previewRec: null,
      shortcuts: { area: '', screen: '', scroll: '' },
      recordingKey: '',
      // 双 tab：shots 截图记录 / clips 剪贴板历史
      tab: 'shots',
      clips: [],
      persist: true,
      clipWatch: false
    }
  },
  computed: {
    api() {
      return (window.electronAPI && window.electronAPI.capture) || null
    },
    previewTitle() {
      const r = this.previewRec
      return r ? `截图预览 · ${r.width} × ${r.height}` : '截图预览'
    },
    shortcutList() {
      return [
        { key: 'area', label: '选区截图', acc: this.shortcuts.area },
        { key: 'screen', label: '全屏截图', acc: this.shortcuts.screen },
        { key: 'scroll', label: '长截图', acc: this.shortcuts.scroll }
      ]
    },
    statusText() {
      if (!this.granted) return '未授权屏幕录制'
      if (!this.persist) return '记录仅存内存，应用退出后清空'
      return '记录持久保存在本机（IndexedDB）'
    }
  },
  mounted() {
    this.refresh()
    if (this.api && this.api.getShortcuts) {
      this.api.getShortcuts().then(s => { this.shortcuts = s })
    }
    if (this.api && this.api.getPersist) {
      this.api.getPersist().then(res => {
        if (res) this.persist = !!res.persist
      })
    }
    if (this.api && this.api.clipWatchStatus) {
      this.api.clipWatchStatus().then(res => {
        if (res) this.clipWatch = !!res.enabled
      })
    }
    // 长截图结束时主进程才恢复本窗显示（focus）：届时刷新记录列表
    this.onWinFocus = () => {
      if (!this.api) return
      this.api.list().then(list => { this.records = list })
      if (this.tab === 'clips') this.loadClips()
    }
    window.addEventListener('focus', this.onWinFocus)
  },
  beforeDestroy() {
    window.removeEventListener('focus', this.onWinFocus)
    this.stopRecord()
  },
  methods: {
    async refresh() {
      if (!this.api) return
      const st = await this.api.status()
      this.granted = st.granted
      this.records = await this.api.list()
      const k = await this.api.getKeep()
      this.keep = k.keepCount
    },
    refreshStatus() {
      this.refresh()
    },
    async onKeepChange(v) {
      if (!this.api) return
      const res = await this.api.setKeep(v)
      this.keep = res.keepCount
      this.records = await this.api.list()
    },
    checkPerm() {
      if (!this.granted) {
        this.$message.warning('请先授权「屏幕录制」权限')
        return false
      }
      return true
    },
    async doArea() {
      if (!this.checkPerm() || !this.api) return
      const res = await this.api.area()
      if (res && res.ok) {
        this.records = await this.api.list()
        this.$message.success('截图完成，已复制到剪贴板')
      } else if (res && res.reason === 'cancelled') {
        // 用户取消：静默
      }
    },
    async doScreen() {
      if (!this.checkPerm() || !this.api) return
      const res = await this.api.screen()
      if (res && res.ok) {
        this.records = await this.api.list()
        this.$message.success('截图完成，已复制到剪贴板')
      }
    },
    async doScroll() {
      if (!this.checkPerm() || !this.api) return
      const res = await this.api.scroll()
      if (res && res.ok) {
        // 选区完成即进入连拍模式，结束由控制条小窗完成/取消
      }
    },
    async doClipboard() {
      if (!this.api) return
      const res = await this.api.clipboardImage()
      if (res && res.ok) {
        this.records = await this.api.list()
        this.$message.success('已导入剪贴板图片')
      } else {
        this.$message.info('剪贴板中没有图片')
      }
    },
    async openPerm() {
      if (!this.api) return
      // 先触发系统登记（真实调一次捕获 API，未授权时 TCC 才会把应用列入屏幕录制列表），
      // 再打开系统设置——否则设置里找不到本应用条目
      if (this.api.requestPermission) {
        try { await this.api.requestPermission() } catch (e) { /* 忽略 */ }
      }
      this.api.openPermissionSettings()
      this.$message({
        type: 'info',
        duration: 6000,
        message: '请在「屏幕录制」列表中找到本应用并开启，开启后需重启应用生效'
      })
    },
    // ---------- 剪贴板历史 ----------
    async switchClips() {
      this.tab = 'clips'
      this.loadClips()
    },
    async loadClips() {
      if (!this.api || !this.api.clipsList) return
      const res = await this.api.clipsList()
      if (res && res.ok) this.clips = res.clips || []
    },
    async copyClip(c) {
      if (!c || !this.api) return
      const res = await this.api.clipsCopy(c.id)
      if (res && res.ok) this.$message.success('已复制到剪贴板')
    },
    async removeClip(c) {
      if (!c || !this.api) return
      await this.api.clipsRemove(c.id)
      this.loadClips()
    },
    async clearClips() {
      if (!this.api) return
      await this.api.clipsClear()
      this.loadClips()
    },
    async clearShots() {
      if (!this.api) return
      await this.api.clear()
      this.records = await this.api.list()
    },
    // ---------- 开关 ----------
    async onPersistChange(v) {
      if (!this.api || !this.api.setPersist) return
      const res = await this.api.setPersist(v)
      if (res && typeof res.persist === 'boolean') {
        this.persist = res.persist
        this.$message.success(this.persist ? '已开启本地持久化' : '已关闭持久化，重启后记录清空')
      }
    },
    async onClipWatchChange(v) {
      if (!this.api || !this.api.clipWatch) return
      const res = await this.api.clipWatch(v)
      if (res && typeof res.enabled === 'boolean') {
        this.clipWatch = res.enabled
        this.$message.success(this.clipWatch ? '已开启复制记录（全局监听）' : '已停止复制记录')
      }
    },
    async copyRec(rec) {
      if (!rec || !this.api) return
      const res = await this.api.copy(rec.id)
      if (res && res.ok) this.$message.success('已复制到剪贴板')
    },
    async saveRec(rec) {
      if (!rec || !this.api) return
      const res = await this.api.saveAs(rec.id)
      if (res && res.ok) this.$message.success('已保存：' + res.filePath)
    },
    async removeRec(rec) {
      if (!rec || !this.api) return
      await this.api.remove(rec.id)
      this.records = await this.api.list()
    },
    async preview(rec) {
      this.previewRec = rec
      this.previewVisible = true
      this.previewData = ''
      const res = await this.api.recordData(rec.id)
      if (res && res.ok) this.previewData = res.data
    },
    fmtTime(ts) {
      const d = new Date(ts)
      const pad = n => String(n).padStart(2, '0')
      return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    },
    // ---------- 快捷键 ----------
    prettyAcc(acc) {
      if (!acc) return '未设置'
      return acc
        .replace(/CommandOrControl/g, '⌘')
        .replace(/\+/g, ' ')
        .replace(/Shift/g, '⇧')
        .replace(/Alt/g, '⌥')
        .replace(/Ctrl/g, '⌃')
    },
    startRecord(key) {
      if (this.recordingKey === key) { this.stopRecord(); return }
      this.stopRecord()
      this.recordingKey = key
      this.onRecKey = e => {
        e.preventDefault()
        e.stopPropagation()
        if (e.key === 'Escape') { this.stopRecord(); return }
        // 必须含修饰键（避免单键占用）；字母/数字/符号均可
        if (!e.metaKey && !e.ctrlKey && !e.altKey) return
        const main = e.key.length === 1 ? e.key.toUpperCase() : e.key
        if (['Shift', 'Meta', 'Control', 'Alt', 'CapsLock'].includes(e.key)) return
        const acc = [
          e.metaKey ? 'CommandOrControl' : '',
          e.ctrlKey && !e.metaKey ? 'CommandOrControl' : '',
          e.altKey ? 'Alt' : '',
          e.shiftKey ? 'Shift' : '',
          main
        ].filter(Boolean).join('+')
        this.applyShortcut(key, acc)
      }
      window.addEventListener('keydown', this.onRecKey, true)
    },
    stopRecord() {
      if (this.onRecKey) {
        window.removeEventListener('keydown', this.onRecKey, true)
        this.onRecKey = null
      }
      this.recordingKey = ''
    },
    async applyShortcut(key, acc) {
      this.stopRecord()
      if (!this.api) return
      const res = await this.api.setShortcut(key, acc)
      if (res && res.ok) {
        this.shortcuts = res.shortcuts
        this.$message.success('快捷键已更新')
      } else {
        this.$message.error((res && res.error) || '设置失败')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.ss-keep {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: var(--text-secondary);

  ::v-deep .el-input-number {
    width: 90px;
  }
}

.ss-shortcuts {
  display: inline-flex;
  gap: 8px;
  margin-right: 12px;
}

.ss-sc {
  padding: 2px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  font-size: 11px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--primary-color);
    color: var(--primary-color);
  }

  &.recording {
    border-color: #ff7b72;
    color: #ff7b72;
    animation: ss-blink 0.8s ease infinite;
  }
}

@keyframes ss-blink {
  50% { opacity: 0.5; }
}

.ss-perm {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 13px;

  i {
    font-size: 34px;
    color: #FAAD14;
  }
}

.ss-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: var(--shadow-sm);
}

.ss-tabs {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid var(--border-color);
  flex-shrink: 0;
}

.ss-tabs-left {
  display: inline-flex;
  gap: 4px;
  background: var(--search-bg);
  border-radius: 8px;
  padding: 3px;
}

.ss-tab {
  border: none;
  background: transparent;
  padding: 4px 14px;
  border-radius: 6px;
  font-size: 12.5px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;

  &.active {
    background: var(--card-bg);
    color: var(--primary-color);
    box-shadow: var(--shadow-sm);
    font-weight: 600;
  }
}

.ss-tabs-right {
  display: inline-flex;
  align-items: center;
  gap: 14px;
}

.ss-switch {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;

  input {
    accent-color: var(--primary-color);
    cursor: pointer;
  }
}

.ss-clear {
  border: 1px solid var(--border-color);
  background: transparent;
  border-radius: 6px;
  padding: 3px 10px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: #ff7b72;
    border-color: #ff7b72;
  }
}

.ss-pane {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.ss-clips {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px;
}

.ss-clip {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  background: var(--search-bg);
  transition: border-color 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);

    .ss-clip-ops {
      opacity: 1;
    }
  }
}

.ss-clip-text {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-family: inherit;
  font-size: 12.5px;
  line-height: 1.5;
  color: var(--text-primary, inherit);
  white-space: pre-wrap;
  word-break: break-all;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ss-clip-len {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-secondary);
}

.ss-clip-thumb {
  flex-shrink: 0;
  max-height: 56px;
  max-width: 200px;
  border-radius: 4px;
  object-fit: contain;
}

.ss-clip .ss-time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--text-secondary);
}

.ss-clip-ops {
  flex-shrink: 0;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;

  button {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:hover {
      background: rgba(0, 0, 0, 0.75);
    }
  }
}

.ss-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
  gap: 12px;
  padding: 12px;
  align-content: start;
}

.ss-card {
  position: relative;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  overflow: hidden;
  cursor: pointer;
  background: var(--search-bg);
  transition: all 0.16s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: var(--shadow-sm);

    .ss-card-ops {
      opacity: 1;
    }
  }

  img {
    display: block;
    width: 100%;
    height: 110px;
    object-fit: cover;
    object-position: top left;
  }
}

.ss-card-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  font-size: 10.5px;
  color: var(--text-secondary);

  .ss-kind {
    margin-left: auto;
    padding: 1px 6px;
    border-radius: 6px;
    background: rgba(var(--primary-color-rgb), 0.1);
    color: var(--primary-color);
  }
}

.ss-card-ops {
  position: absolute;
  top: 6px;
  right: 6px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;

  button {
    width: 24px;
    height: 24px;
    border: none;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.55);
    color: #fff;
    font-size: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;

    &:hover {
      background: rgba(0, 0, 0, 0.75);
    }
  }
}

.ss-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-secondary);
  font-size: 13px;

  .ss-empty-ico {
    width: 44px;
    height: 44px;
    opacity: 0.4;
    margin-bottom: 6px;
  }

  .ss-empty-sub {
    font-size: 11.5px;
    opacity: 0.7;
  }
}
</style>

<style lang="scss">
/* 预览弹窗（append-to-body 需全局样式） */
.ss-preview-dialog {
  .ss-preview {
    max-height: 68vh;
    overflow: auto;
    text-align: center;
    background: var(--search-bg);
    border-radius: 8px;

    img {
      max-width: 100%;
    }
  }

  .ss-preview-loading {
    padding: 80px 0;
    font-size: 28px;
    color: var(--text-secondary);
  }
}
</style>
