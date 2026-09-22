<template>
  <div class="version-page page-container">
    <!-- Hero：主题色渐变横幅 -->
    <div class="version-hero">
      <div class="hero-logo-wrap">
        <img src="@/assets/logo.png" alt="OmniDeck" class="hero-logo" />
      </div>
      <div class="hero-info">
        <div class="hero-name">
          OmniDeck
          <span class="hero-badge">v{{ appVersion }}</span>
        </div>
        <p class="hero-slogan">全能桌面，智驭未来 · Your All-in-One AI-Powered Desktop Toolkit</p>
      </div>
    </div>

    <!-- 软件更新（N1）：GitCode Releases 检测 + 引导下载 -->
    <div class="update-section">
      <div class="section-header">
        <span class="section-title">软件更新</span>
        <span class="section-sub">发布源：GitCode Releases</span>
      </div>

      <div class="update-card">
        <!-- 检查中 -->
        <div v-if="updateState.checking" class="update-status">
          <i class="el-icon-loading"></i>
          <span>正在检查更新…</span>
        </div>

        <!-- 无更新 / 已是最新 -->
        <template v-else-if="updateState.checked && !updateState.hasUpdate">
          <div class="update-status is-ok">
            <i class="el-icon-circle-check"></i>
            <span>{{ updateState.noRelease ? '暂无发布版本（首个 Release 发布后可检测更新）' : '已是最新版本 v' + appVersion }}</span>
          </div>
        </template>

        <!-- 发现新版本 -->
        <template v-else-if="updateState.checked && updateState.hasUpdate">
          <div class="update-status is-new">
            <i class="el-icon-upload"></i>
            <span>
              发现新版本
              <b class="new-version">v{{ updateState.release.tag }}</b>
              <span class="from-version">（当前 v{{ appVersion }}）</span>
            </span>
          </div>
          <!-- 更新说明：Release body 逐行展示 -->
          <ul v-if="updateNotes.length" class="update-notes">
            <li v-for="(note, i) in updateNotes" :key="i">{{ note }}</li>
          </ul>
          <!-- N5 阶段二：全自动通道（win）——下载 → 进度 → 重启安装 -->
          <template v-if="updateState.fullAuto">
            <div v-if="dlState.status === 'downloading'" class="dl-progress">
              <el-progress
                :percentage="dlState.percent"
                :stroke-width="8"
                :show-text="true"
                class="dl-bar"
              />
              <span class="dl-speed">{{ dlSpeedText }}</span>
            </div>
            <div v-else-if="dlState.status === 'ready'" class="update-status is-ok">
              <i class="el-icon-circle-check"></i>
              <span>v{{ dlState.version || updateState.release.tag }} 已下载完成，重启后自动安装</span>
            </div>
            <div v-else-if="dlState.status === 'error'" class="update-status is-err">
              <i class="el-icon-warning-outline"></i>
              <span>下载失败：{{ dlState.error || '网络异常' }}（可改用手动下载）</span>
            </div>
            <div class="update-actions">
              <el-button
                v-if="dlState.status === 'ready'"
                type="primary"
                size="small"
                round
                @click="installUpdate"
              >重启并安装</el-button>
              <el-button
                v-else-if="dlState.status !== 'downloading'"
                type="primary"
                size="small"
                round
                :loading="dlStarting"
                @click="startDownload"
              >自动下载更新</el-button>
              <el-button size="small" round @click="goDownload">手动下载</el-button>
              <el-button v-if="!updateState.skipped" size="small" round @click="skipUpdate">
                下次再说
              </el-button>
            </div>
          </template>
          <!-- 阶段一：引导下载（mac 未签名等场景） -->
          <template v-else>
            <div class="update-actions">
              <el-button type="primary" size="small" round @click="goDownload">
                前往 GitCode 下载
              </el-button>
              <el-button v-if="!updateState.skipped" size="small" round @click="skipUpdate">
                下次再说
              </el-button>
            </div>
          </template>
        </template>

        <!-- 检查失败 -->
        <div v-else-if="updateState.error" class="update-status" :class="updateState.noRelease ? 'is-ok' : 'is-err'">
          <i :class="updateState.noRelease ? 'el-icon-info' : 'el-icon-warning-outline'"></i>
          <span>{{ updateState.noRelease ? '暂无发布版本（首个 Release 发布后可检测更新）' : '检查失败：' + updateState.error }}</span>
        </div>

        <!-- 初始态 -->
        <div v-else class="update-status">
          <i class="el-icon-refresh"></i>
          <span>当前版本 v{{ appVersion }}</span>
        </div>

        <el-button
          class="check-btn"
          size="small"
          round
          :disabled="updateState.checking"
          @click="checkUpdate"
        >检查更新</el-button>
      </div>
    </div>

    <!-- 更新记录：时间线 -->
    <div class="changelog-section">
      <div class="section-header">
        <span class="section-title">更新记录</span>
        <span class="section-count">{{ changelog.length }} 个版本</span>
      </div>

      <div class="timeline">
        <div
          v-for="(log, i) in changelog"
          :key="log.version"
          class="timeline-item"
          :class="{ 'is-latest': i === 0 }"
        >
          <!-- 左侧轨道：竖线 + 节点 -->
          <div class="tl-rail">
            <span class="tl-dot"></span>
          </div>

          <!-- 右侧内容 -->
          <div class="tl-card">
            <div class="tl-head">
              <span class="tl-version">v{{ log.version }}</span>
              <span v-if="i === 0" class="tl-badge">当前版本</span>
              <span class="tl-date">{{ log.date }}</span>
            </div>
            <ul class="tl-notes">
              <li v-for="(note, j) in log.notes" :key="j">{{ note }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { appVersion, changelog } from '@/config/app'

const INIT_UPDATE_STATE = {
  checking: false,
  checked: false,
  hasUpdate: false,
  noRelease: false,
  skipped: false,
  error: '',
  release: null,
  fullAuto: false
}

const INIT_DL_STATE = {
  status: 'idle', // idle / downloading / ready / error
  percent: 0,
  version: '',
  error: '',
  transferred: 0,
  total: 0,
  bytesPerSecond: 0
}

export default {
  name: 'Version',
  data() {
    return {
      appVersion,
      changelog,
      updateState: { ...INIT_UPDATE_STATE },
      dlState: { ...INIT_DL_STATE },
      dlStarting: false,
      offDownloadState: null
    }
  },
  computed: {
    // Release body → 更新说明行数组（空行/标题符清理）
    updateNotes() {
      const r = this.updateState.release
      if (!r || !r.notes) return []
      return String(r.notes)
        .split(/\r?\n/)
        .map(l => l.replace(/^#{1,6}\s*/, '').replace(/^[-*+]\s+/, '').trim())
        .filter(Boolean)
        .slice(0, 30)
    },
    // 下载速度文案（MB/s）
    dlSpeedText() {
      const bps = this.dlState.bytesPerSecond || 0
      if (!bps) return ''
      return (bps / 1024 / 1024).toFixed(1) + ' MB/s'
    }
  },
  mounted() {
    // 进入页面先展示最近一次结果缓存，再自动刷新一次
    this.restoreLastResult()
    this.checkUpdate(true)
    // N5：恢复下载状态 + 订阅进度推送
    this.restoreDownloadState()
    this.offDownloadState = window.electronAPI && window.electronAPI.updater
      ? window.electronAPI.updater.onDownloadState(st => { this.dlState = { ...st } })
      : null
  },
  beforeDestroy() {
    if (this.offDownloadState) this.offDownloadState()
  },
  methods: {
    restoreLastResult() {
      if (!window.electronAPI || !window.electronAPI.updater) return
      window.electronAPI.updater.lastResult().then(res => {
        if (res && res.ok && !this.updateState.checking) this.applyResult(res)
      }).catch(() => {})
    },
    checkUpdate(silent) {
      if (!window.electronAPI || !window.electronAPI.updater) {
        this.updateState.error = '当前环境不支持更新检查'
        return
      }
      this.updateState.checking = true
      this.updateState.error = ''
      window.electronAPI.updater.check().then(res => {
        this.updateState.checking = false
        if (!res || !res.ok) {
          this.updateState.error = (res && res.error) || '未知错误'
          this.updateState.noRelease = !!(res && res.noRelease)
          return
        }
        this.applyResult(res)
        // 静默进入且无更新时不提示；手动检查给出结果反馈
        if (!silent) {
          this.$message({
            type: res.hasUpdate ? 'success' : 'info',
            message: res.hasUpdate ? `发现新版本 v${res.release.tag}` : '已是最新版本',
            duration: 2000
          })
        }
      }).catch(() => {
        this.updateState.checking = false
        this.updateState.error = '检查请求异常'
      })
    },
    applyResult(res) {
      this.updateState.checked = true
      this.updateState.hasUpdate = res.hasUpdate
      this.updateState.noRelease = !!res.noRelease
      this.updateState.skipped = !!res.skipped
      this.updateState.release = res.release || null
      this.updateState.fullAuto = !!res.fullAuto
    },
    // N5：进入页面恢复下载状态（切页回来进度条不断档）
    restoreDownloadState() {
      if (!window.electronAPI || !window.electronAPI.updater || !window.electronAPI.updater.downloadState) return
      window.electronAPI.updater.downloadState().then(st => {
        if (st) this.dlState = { ...st }
      }).catch(() => {})
    },
    // N5：开始自动下载（fullAuto 通道）
    startDownload() {
      const u = window.electronAPI && window.electronAPI.updater
      if (!u || !u.download) return
      this.dlStarting = true
      u.download().then(res => {
        if (!res || !res.ok) {
          this.$message.error((res && res.error) || '下载启动失败')
        }
      }).catch(() => {
        this.$message.error('下载请求异常')
      }).finally(() => {
        this.dlStarting = false
      })
    },
    // N5：重启并安装（下载完成后）
    installUpdate() {
      const u = window.electronAPI && window.electronAPI.updater
      if (!u || !u.install) return
      u.install()
    },
    goDownload() {
      const r = this.updateState.release
      window.electronAPI.updater.openDownload(r && r.url)
    },
    skipUpdate() {
      const r = this.updateState.release
      if (!r) return
      window.electronAPI.updater.skip(r.tag)
      this.updateState.skipped = true
    }
  }
}
</script>

<style lang="scss" scoped>
.version-page {
  height: 100%;
}

/* ============ Hero ============ */
.version-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px 24px;
  border-radius: $radius-lg;
  border: 1px solid rgba(var(--primary-color-rgb), 0.2);
  background: linear-gradient(
    115deg,
    rgba(var(--primary-color-rgb), 0.14) 0%,
    rgba(var(--primary-color-rgb), 0.05) 60%,
    transparent 100%
  );
  margin-bottom: 18px;
  flex-shrink: 0;
}

.hero-logo-wrap {
  width: 56px;
  height: 56px;
  border-radius: $radius-base;
  background: var(--card-bg);
  box-shadow: $shadow-base;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;

  .hero-logo {
    width: 36px;
    height: 36px;
    object-fit: contain;
  }
}

.hero-info {
  flex: 1;
  min-width: 0;

  .hero-name {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 21px;
    font-weight: 700;
    color: $text-primary;
    letter-spacing: 0.3px;
  }

  .hero-badge {
    font-size: 12px;
    font-weight: 600;
    font-family: 'SF Mono', Menlo, monospace;
    color: $primary-color;
    background: rgba(var(--primary-color-rgb), 0.12);
    border: 1px solid rgba(var(--primary-color-rgb), 0.25);
    padding: 1px 9px;
    border-radius: 999px;
    line-height: 1.6;
  }

  .hero-slogan {
    margin-top: 5px;
    font-size: 12px;
    color: $text-secondary;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* ============ 软件更新 ============ */
.update-section {
  margin-bottom: 18px;
  flex-shrink: 0;
}

.section-sub {
  font-size: 12px;
  color: $text-secondary;
}

.update-card {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-base;
  padding: 14px 18px;
  box-shadow: $shadow-base;

  .check-btn {
    margin-left: auto;
    flex-shrink: 0;
  }
}

.update-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: $text-primary;

  i {
    font-size: 16px;
    color: $text-secondary;
  }

  &.is-ok i {
    color: var(--success-color, #67c23a);
  }

  &.is-new i {
    color: $primary-color;
  }

  &.is-err i {
    color: var(--danger-color, #f56c6c);
  }

  .new-version {
    color: $primary-color;
    font-family: 'SF Mono', Menlo, monospace;
    margin: 0 2px;
  }

  .from-version {
    color: $text-secondary;
    font-size: 12px;
  }
}

.update-notes {
  list-style: none;
  flex-basis: 100%;
  margin: 2px 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 4px;

  li {
    position: relative;
    padding-left: 14px;
    font-size: 12.5px;
    color: $text-secondary;
    line-height: 1.5;

    &::before {
      content: '';
      position: absolute;
      left: 2px;
      top: 8px;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: rgba(var(--primary-color-rgb), 0.5);
    }
  }
}

.update-actions {
  display: flex;
  gap: 8px;
  flex-basis: 100%;
  margin-left: 24px;
}

/* N5：下载进度条 */
.dl-progress {
  flex-basis: 100%;
  margin-left: 24px;
  display: flex;
  align-items: center;
  gap: 12px;

  .dl-bar {
    flex: 1;
    min-width: 0;
  }

  .dl-speed {
    font-size: 12px;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
    min-width: 70px;
    text-align: right;
  }
}

/* ============ 更新记录 ============ */
.section-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  .section-count {
    font-size: 12px;
    color: $text-secondary;
    font-variant-numeric: tabular-nums;
  }
}

/* 时间线 */
.timeline {
  display: flex;
  flex-direction: column;
}

.timeline-item {
  display: flex;
  gap: 14px;

  /* 左侧轨道 */
  .tl-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 14px;
    flex-shrink: 0;

    .tl-dot {
      width: 10px;
      height: 10px;
      border-radius: 50%;
      margin-top: 5px;
      background: var(--border-color);
      box-shadow: 0 0 0 3px var(--card-bg);
      flex-shrink: 0;
    }

    /* 节点下方的连接线 */
    &::after {
      content: '';
      flex: 1;
      width: 2px;
      margin-top: 4px;
      background: var(--border-color);
    }
  }

  &:last-child .tl-rail::after {
    display: none;
  }

  /* 最新版本节点高亮 */
  &.is-latest .tl-dot {
    background: $primary-color;
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.18);
  }
}

/* 右侧版本卡片 */
.tl-card {
  flex: 1;
  min-width: 0;
  background: $card-bg;
  border: 1px solid transparent;
  border-radius: $radius-base;
  padding: 12px 16px;
  margin-bottom: 12px;
  transition: box-shadow 0.18s ease, border-color 0.18s ease;

  &:hover {
    box-shadow: $shadow-base;
    border-color: rgba(var(--primary-color-rgb), 0.2);
  }

  .tl-head {
    display: flex;
    align-items: center;
    gap: 10px;

    .tl-version {
      font-size: 14px;
      font-weight: 700;
      color: $text-primary;
      font-family: 'SF Mono', Menlo, monospace;
    }

    .tl-badge {
      font-size: 11px;
      font-weight: 600;
      color: $primary-color;
      background: rgba(var(--primary-color-rgb), 0.1);
      padding: 1px 8px;
      border-radius: 999px;
    }

    .tl-date {
      margin-left: auto;
      font-size: 12px;
      color: $text-secondary;
      font-variant-numeric: tabular-nums;
    }
  }

  .tl-notes {
    list-style: none;
    margin-top: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;

    li {
      position: relative;
      padding-left: 14px;
      font-size: 13px;
      color: $text-secondary;
      line-height: 1.5;

      &::before {
        content: '';
        position: absolute;
        left: 2px;
        top: 8px;
        width: 4px;
        height: 4px;
        border-radius: 50%;
        background: rgba(var(--primary-color-rgb), 0.5);
      }
    }
  }
}
</style>
