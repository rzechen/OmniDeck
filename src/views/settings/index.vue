<template>
  <div class="settings-page page-container">
    <div class="settings-layout">
      <!-- 左侧：设置分类导航（后续可扩展：AI / 技能 / 插件 / 快捷键等） -->
      <aside class="settings-nav">
        <div
          v-for="tab in tabs"
          :key="tab.key"
          class="settings-nav-item"
          :class="{ active: activeTab === tab.key }"
          @click="activeTab = tab.key"
        >
          <i :class="tab.icon"></i>
          <span>{{ tab.label }}</span>
        </div>
      </aside>

      <!-- 右侧：设置内容 -->
      <section class="settings-body">
        <!-- 通用 -->
        <template v-if="activeTab === 'general'">
          <header class="settings-section-header">
            <h2 class="section-title">通用</h2>
            <p class="section-desc">个性化 OmniDeck 的视觉风格，立即生效并自动保存</p>
          </header>

          <!-- Mac 式设置分组：行布局（左标签 + 右控件） -->
          <div class="settings-group">
            <!-- 外观模式：分段选择器 -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">外观</span>
                <span class="label-desc">浅色、深色或跟随系统外观</span>
              </div>
              <div class="segmented">
                <div
                  v-for="mode in themeModes"
                  :key="mode.value"
                  class="segmented-item"
                  :class="{ active: themeMode === mode.value }"
                  @click="selectMode(mode.value)"
                >
                  <i :class="mode.icon"></i>
                  <span>{{ mode.label }}</span>
                </div>
              </div>
            </div>

            <!-- 强调色：与外观独立，任何模式下均可选 -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">强调色</span>
                <span class="label-desc">按钮、选中态等界面强调色，深色模式下自动提亮</span>
              </div>
              <div class="color-swatches">
                <div
                  v-for="color in presetColors"
                  :key="color.value"
                  class="color-swatch"
                  :class="{ selected: primaryColor === color.value }"
                  :style="{ background: color.value }"
                  :title="color.name"
                  @click="selectColor(color.value)"
                >
                  <i v-if="primaryColor === color.value" class="el-icon-check"></i>
                </div>
              </div>
            </div>

            <!-- 工具卡片布局：每行个数（分类页网格） -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">工具卡片密度</span>
                <span class="label-desc">工具分类页每行展示的卡片数量，「自动」随窗口宽度自适应</span>
              </div>
              <div class="segmented">
                <div
                  v-for="opt in gridOptions"
                  :key="opt.value"
                  class="segmented-item"
                  :class="{ active: toolGridCols === opt.value }"
                  @click="selectGridCols(opt.value)"
                >
                  <span>{{ opt.label }}</span>
                </div>
              </div>
            </div>

            <!-- 侧边栏默认状态：启动时展开或收起 -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">侧边栏默认状态</span>
                <span class="label-desc">应用启动时侧边栏的初始状态，运行中仍可随时折叠</span>
              </div>
              <div class="segmented">
                <div
                  v-for="opt in sidebarOptions"
                  :key="opt.value"
                  class="segmented-item"
                  :class="{ active: sidebarDefault === opt.value }"
                  @click="selectSidebarDefault(opt.value)"
                >
                  <i :class="opt.icon"></i>
                  <span>{{ opt.label }}</span>
                </div>
              </div>
            </div>

            <!-- 分组默认状态：启动时菜单分组展开或收起 -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">分组默认状态</span>
                <span class="label-desc">应用启动时左侧菜单分组的初始展开状态，运行中可随时点按调整</span>
              </div>
              <div class="segmented">
                <div
                  v-for="opt in sidebarGroupsOptions"
                  :key="opt.value"
                  class="segmented-item"
                  :class="{ active: sidebarGroupsDefault === opt.value }"
                  @click="selectSidebarGroupsDefault(opt.value)"
                >
                  <i :class="opt.icon"></i>
                  <span>{{ opt.label }}</span>
                </div>
              </div>
            </div>

            <!-- 减弱动态效果：装饰性动效总开关 -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">减弱动态效果</span>
                <span class="label-desc">关闭卡片入场编排、按钮按压等装饰性动画，保留必要的过渡</span>
              </div>
              <div class="segmented">
                <div
                  v-for="opt in motionOptions"
                  :key="opt.value"
                  class="segmented-item"
                  :class="{ active: reduceMotion === opt.value }"
                  @click="selectReduceMotion(opt.value)"
                >
                  <span>{{ opt.label }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 安全 -->
        <template v-else-if="activeTab === 'security'">
          <header class="settings-section-header">
            <h2 class="section-title">安全</h2>
            <p class="section-desc">应用锁定：离开时自动上锁，密码与生物识别解锁</p>
          </header>

          <div class="settings-group">
            <!-- 自动锁定时机 -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">自动锁定</span>
                <span class="label-desc">应用闲置、窗口失活或系统锁屏超过所选时长后自动锁定</span>
              </div>
              <div class="segmented">
                <div
                  v-for="opt in autoLockOptions"
                  :key="opt.value"
                  class="segmented-item"
                  :class="{ active: lockSettings.autoLock === opt.value }"
                  @click="selectAutoLock(opt.value)"
                >
                  <span>{{ opt.label }}</span>
                </div>
              </div>
            </div>

            <!-- 应用密码 -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">应用密码</span>
                <span class="label-desc">{{ hasPassword ? '已设置，解锁时需输入此密码' : '未设置，设置后启动与解锁均需密码' }}</span>
              </div>
              <div class="lock-actions">
                <el-tag v-if="hasPassword" size="small" type="success" class="lock-tag">已启用</el-tag>
                <el-button v-if="!hasPassword" size="small" round type="primary" @click="openPwdDialog">设置密码</el-button>
                <template v-else>
                  <el-button size="small" round @click="openPwdDialog">修改密码</el-button>
                  <el-button size="small" round type="danger" plain @click="clearPassword">清除密码</el-button>
                </template>
              </div>
            </div>

            <!-- Touch ID（仅支持时显示） -->
            <div v-if="biometricAvailable" class="settings-row">
              <div class="row-label">
                <span class="label-text">触控 ID 解锁</span>
                <span class="label-desc">使用系统指纹（Touch ID）解锁，失败时可回退密码</span>
              </div>
              <div class="segmented">
                <div
                  v-for="opt in motionOptions"
                  :key="'bio' + opt.value"
                  class="segmented-item"
                  :class="{ active: lockSettings.biometric === opt.value }"
                  @click="selectBiometric(opt.value)"
                >
                  <span>{{ opt.value ? '开启' : '关闭' }}</span>
                </div>
              </div>
            </div>
            <div v-else class="settings-row">
              <div class="row-label">
                <span class="label-text">生物识别</span>
                <span class="label-desc">当前系统不支持触控 ID（仅 macOS 支持指纹解锁），可使用密码解锁</span>
              </div>
              <el-tag size="small" type="info">不可用</el-tag>
            </div>

            <!-- 立即锁定（体验） -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">立即锁定</span>
                <span class="label-desc">手动锁定应用（需先设置应用密码），锁定后凭密码或触控 ID 解锁；快捷键 {{ isMac ? '⌘L' : 'Ctrl+L' }}</span>
              </div>
              <el-button size="small" round icon="el-icon-lock" @click="lockNow">锁定应用</el-button>
            </div>
          </div>
        </template>
      </section>
    </div>

    <!-- 设置/修改应用密码弹窗 -->
    <transition name="sec-modal">
      <div v-if="pwdDialogVisible" class="sec-overlay" @click.self="pwdDialogVisible = false">
        <div class="sec-dialog">
          <header class="sec-dialog-header">
            <h3 class="sec-dialog-title">{{ hasPassword ? '修改应用密码' : '设置应用密码' }}</h3>
            <i class="el-icon-close sec-dialog-close" @click="pwdDialogVisible = false"></i>
          </header>
          <div class="sec-dialog-body">
            <div class="sec-field">
              <label class="sec-field-label">{{ hasPassword ? '当前密码' : '新密码' }}</label>
              <el-input v-model="pwdForm.oldPwd" type="password" size="small" show-password :placeholder="hasPassword ? '输入当前密码' : '设置新密码（至少 4 位）'" />
            </div>
            <div v-if="hasPassword" class="sec-field">
              <label class="sec-field-label">新密码</label>
              <el-input v-model="pwdForm.newPwd" type="password" size="small" show-password placeholder="设置新密码（至少 4 位）" />
            </div>
            <div class="sec-field">
              <label class="sec-field-label">确认新密码</label>
              <el-input v-model="pwdForm.confirmPwd" type="password" size="small" show-password placeholder="再次输入新密码" @keydown.enter.native="savePassword" />
            </div>
          </div>
          <footer class="sec-dialog-footer">
            <el-button size="small" round @click="pwdDialogVisible = false">取消</el-button>
            <el-button size="small" round type="primary" @click="savePassword">保存</el-button>
          </footer>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import { presetColors, themeModes, applyTheme } from '@/utils/theme'
import { setItem, getItem } from '@/utils/db'

export default {
  name: 'Settings',
  data() {
    return {
      activeTab: 'general',
      tabs: [
        { key: 'general', label: '通用', icon: 'el-icon-setting' },
        { key: 'security', label: '安全', icon: 'el-icon-lock' }
      ],
      themeModes,
      presetColors,
      // 工具卡片每行个数枚举（'auto' 自适应）
      gridOptions: [
        { label: '自动', value: 'auto' },
        { label: '2 列', value: 2 },
        { label: '3 列', value: 3 },
        { label: '4 列', value: 4 },
        { label: '5 列', value: 5 },
        { label: '6 列', value: 6 }
      ],
      // 侧边栏启动默认状态
      sidebarOptions: [
        { label: '展开', value: 'expand', icon: 'el-icon-s-unfold' },
        { label: '收起', value: 'collapse', icon: 'el-icon-s-fold' }
      ],
      // 分组启动默认展开状态
      sidebarGroupsOptions: [
        { label: '展开', value: 'expand', icon: 'el-icon-arrow-down' },
        { label: '收起', value: 'collapse', icon: 'el-icon-arrow-right' }
      ],
      // 减弱动态效果
      motionOptions: [
        { label: '关闭', value: false },
        { label: '开启', value: true }
      ],
      // ===== 安全：应用锁定 =====
      autoLockOptions: [
        { label: '无', value: 0 },
        { label: '1 分钟', value: 1 },
        { label: '5 分钟', value: 5 },
        { label: '15 分钟', value: 15 },
        { label: '30 分钟', value: 30 }
      ],
      lockSettings: { autoLock: 0, biometric: false },
      hasPassword: false,
      biometricAvailable: false,
      isMac: !!(window.electronAPI && window.electronAPI.platform === 'darwin'),
      // 密码弹窗
      pwdDialogVisible: false,
      pwdForm: { oldPwd: '', newPwd: '', confirmPwd: '' }
    }
  },
  computed: {
    themeMode() {
      return this.$store.state.themeMode
    },
    primaryColor() {
      return this.$store.state.primaryColor
    },
    toolGridCols() {
      return this.$store.state.toolGridCols
    },
    sidebarDefault() {
      return this.$store.state.sidebarDefault
    },
    sidebarGroupsDefault() {
      return this.$store.state.sidebarGroupsDefault
    },
    reduceMotion() {
      return this.$store.state.reduceMotion
    }
  },
  mounted() {
    this.loadLockState()
  },
  methods: {
    selectMode(mode) {
      this.$store.commit('SET_THEME', { mode })
      applyTheme(this.themeMode, this.primaryColor)
    },
    selectColor(color) {
      this.$store.commit('SET_THEME', { color })
      applyTheme(this.themeMode, this.primaryColor)
    },
    // 切换工具卡片每行个数：更新全局状态并持久化
    selectGridCols(cols) {
      this.$store.commit('SET_TOOL_GRID_COLS', cols)
      setItem('toolGridCols', cols)
    },
    // 切换侧边栏默认状态：立即生效并持久化
    selectSidebarDefault(val) {
      this.$store.commit('SET_SIDEBAR_DEFAULT', val)
      setItem('sidebarDefault', val)
    },
    // 切换分组默认展开状态（下次启动生效）
    selectSidebarGroupsDefault(val) {
      this.$store.commit('SET_SIDEBAR_GROUPS_DEFAULT', val)
      setItem('sidebarGroupsDefault', val)
    },
    // 切换减弱动态效果：写入 html 根类，全局 CSS 感知
    selectReduceMotion(val) {
      this.$store.commit('SET_REDUCE_MOTION', val)
      setItem('reduceMotion', val)
      document.documentElement.classList.toggle('reduce-motion', val)
    },
    // ===== 安全：应用锁定 =====
    async loadLockState() {
      const api = window.electronAPI && window.electronAPI.appLock
      // 恢复偏好设置
      const saved = getItem('appLockSettings', null) || {}
      this.lockSettings = {
        autoLock: Number(saved.autoLock) || 0,
        biometric: !!saved.biometric
      }
      if (api) {
        this.hasPassword = await api.hasPassword()
        this.biometricAvailable = await api.biometricSupported()
      }
    },
    persistLockSettings() {
      setItem('appLockSettings', this.lockSettings)
      // 通知 AppLock 组件即时应用新偏好
      this.$root.$emit('app-lock:settings-changed')
    },
    // 自动锁定时机
    selectAutoLock(val) {
      this.lockSettings.autoLock = val
      this.persistLockSettings()
    },
    // 触控 ID 开关
    selectBiometric(val) {
      this.lockSettings.biometric = val
      this.persistLockSettings()
    },
    openPwdDialog() {
      this.pwdForm = { oldPwd: '', newPwd: '', confirmPwd: '' }
      this.pwdDialogVisible = true
    },
    async savePassword() {
      const api = window.electronAPI && window.electronAPI.appLock
      if (!api) {
        this.$message.error('当前环境不支持应用锁定')
        return
      }
      const { oldPwd, newPwd, confirmPwd } = this.pwdForm
      const target = this.hasPassword ? newPwd : oldPwd
      if (!target || target.length < 4) {
        this.$message.warning('密码至少 4 位')
        return
      }
      if (target !== confirmPwd) {
        this.$message.warning('两次输入的密码不一致')
        return
      }
      // 修改时先校验旧密码
      if (this.hasPassword) {
        const check = await api.verify(oldPwd)
        if (!check || !check.ok) {
          this.$message.error('当前密码不正确')
          return
        }
      }
      const res = await api.setPassword(target)
      if (res && res.ok) {
        this.hasPassword = true
        this.pwdDialogVisible = false
        this.$message.success('应用密码已保存')
        // 通知 AppLock 同步密码状态（快捷键 ⌘L/Ctrl+L 立即可用）
        this.$root.$emit('app-lock:settings-changed')
      } else {
        this.$message.error('保存失败：系统加密存储不可用')
      }
    },
    async clearPassword() {
      const api = window.electronAPI && window.electronAPI.appLock
      if (!api) return
      this.$confirm('清除后应用将不再需要密码解锁，确定清除吗？', '清除密码', {
        confirmButtonText: '清除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        await api.clearPassword()
        this.hasPassword = false
        this.$message.success('应用密码已清除')
        // 通知 AppLock 同步密码状态
        this.$root.$emit('app-lock:settings-changed')
      }).catch(() => {})
    },
    // 立即锁定：未设密码引导设置；preload 未加载提示重启
    lockNow() {
      const api = window.electronAPI && window.electronAPI.appLock
      if (!api) {
        this.$message.warning('应用锁定能力未加载，请重启应用后重试（开发模式需重启 dev 进程使 preload 生效）')
        return
      }
      if (!this.hasPassword) {
        this.$message.warning('请先设置应用密码，锁定后需凭密码解锁')
        return
      }
      // 事件总线通知全局 AppLock 遮罩锁定
      this.$root.$emit('app-lock:lock-now')
    }
  }
}
</script>

<style lang="scss" scoped>
// 与首页一致：撑满内容区，左右间距由 page-container 统一控制
.settings-page {
  height: 100%;
}

.settings-layout {
  display: flex;
  gap: 18px;
  align-items: flex-start;
}

// 左侧分类导航
.settings-nav {
  width: 136px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.settings-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: $radius-base;
  font-size: 13px;
  font-weight: 500;
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;

  i {
    font-size: 15px;
  }

  &:hover {
    background: var(--sidebar-item-hover);
    color: $text-primary;
  }

  &.active {
    background: rgba(var(--primary-color-rgb), 0.09);
    color: $primary-color;
    font-weight: 600;
  }
}

// 右侧内容
.settings-body {
  flex: 1;
  min-width: 0;
}

.settings-section-header {
  margin-bottom: 12px;

  .section-title {
    font-size: 18px;
    font-weight: 700;
    color: $text-primary;
  }

  .section-desc {
    margin-top: 3px;
    font-size: 12px;
    color: $text-secondary;
  }
}

/* ============ Mac 式设置分组（圆角卡片 + 行布局） ============ */
.settings-group {
  background: $card-bg;
  border-radius: $radius-lg;
  overflow: hidden;

  // 行间细分隔线（Mac 系统设置风格）
  .settings-row + .settings-row {
    border-top: 1px solid var(--border-color);
  }
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 12px 16px;
  min-height: 52px;
}

.row-label {
  display: flex;
  flex-direction: column;
  gap: 2px;

  .label-text {
    font-size: 13px;
    font-weight: 600;
    color: $text-primary;
  }

  .label-desc {
    font-size: 11px;
    color: $text-secondary;
  }
}

/* 分段选择器（macOS segmented control 风格） */
.segmented {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  max-width: 100%;
  background: $search-bg;
  border-radius: $radius-base;
  padding: 2px;
  gap: 2px;
}

.segmented-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  color: $text-secondary;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;

  i {
    font-size: 13px;
  }

  &:hover {
    color: $text-primary;
  }

  &.active {
    background: var(--card-bg);
    color: $primary-color;
    font-weight: 600;
    box-shadow: $shadow-sm;
  }
}

/* 强调色色板 */
.color-swatches {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.color-swatch {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
  -webkit-app-region: no-drag;

  i {
    color: #ffffff;
    font-size: 12px;
    font-weight: 700;
  }

  &:hover {
    transform: scale(1.12);
  }

  &.selected {
    box-shadow: 0 0 0 2px var(--card-bg), 0 0 0 4px $primary-color;
  }
}

/* ===== 安全：应用锁定 ===== */
.lock-actions {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 密码弹窗 */
.sec-overlay {
  position: fixed;
  inset: 0;
  z-index: 3100;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
}

.sec-dialog {
  width: 380px;
  max-width: calc(100vw - 48px);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--card-bg, #fff);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.sec-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 0;

  .sec-dialog-title {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  .sec-dialog-close {
    font-size: 15px;
    color: $text-secondary;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    transition: all 0.15s ease;

    &:hover {
      background: $search-bg;
      color: $text-primary;
    }
  }
}

.sec-dialog-body {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.sec-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .sec-field-label {
    font-size: 12px;
    font-weight: 600;
    color: $text-primary;
  }
}

.sec-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 18px 16px;
}

/* 弹窗过渡 */
.sec-modal-enter-active {
  transition: opacity 0.18s ease;

  .sec-dialog {
    transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.sec-modal-leave-active {
  transition: opacity 0.14s ease;

  .sec-dialog {
    transition: transform 0.14s ease;
  }
}

.sec-modal-enter,
.sec-modal-leave-to {
  opacity: 0;

  .sec-dialog {
    transform: scale(0.95) translateY(8px);
  }
}
</style>
