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

            <!-- 背景壁纸：本地图/GIF/视频作为全局背景 -->
            <div class="settings-row wp-row">
              <div class="row-label">
                <span class="label-text">背景壁纸</span>
                <span class="label-desc">选择图片、GIF 或视频作为应用背景，界面自动转为半透明毛玻璃</span>
              </div>
              <div class="wp-controls">
                <el-button size="small" round icon="el-icon-picture-outline" @click="pickWallpaper">选择文件</el-button>
                <div class="segmented">
                  <div
                    v-for="opt in motionOptions"
                    :key="'wp' + opt.value"
                    class="segmented-item"
                    :class="{ active: wpEnabled === opt.value }"
                    @click="toggleWallpaper(opt.value)"
                  >
                    <span>{{ opt.value ? '开启' : '关闭' }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- 壁纸列表（有壁纸时显示） -->
            <div v-if="wallpaperList.length" class="wp-gallery-row">
              <div class="wp-gallery">
                <div
                  v-for="wp in wpThumbs"
                  :key="wp.id"
                  class="wp-thumb"
                  :class="{ selected: wpConfig.selectedId === wp.id, video: isVideoWp(wp) }"
                  @click="selectWallpaper(wp)"
                >
                  <img v-if="wp._thumb" :src="wp._thumb" alt="" />
                  <i v-else class="el-icon-video-play wp-video-badge"></i>
                  <span class="wp-thumb-name" :title="wp.name">{{ wp.name }}</span>
                  <span class="wp-thumb-del" title="删除" @click.stop="deleteWallpaper(wp)">
                    <i class="el-icon-close"></i>
                  </span>
                </div>
              </div>
            </div>

            <!-- 壁纸效果选项（开启后显示） -->
            <template v-if="wpEnabled">
              <div class="settings-row">
                <div class="row-label">
                  <span class="label-text">壁纸柔化</span>
                  <span class="label-desc">模糊壁纸本身，突出前景内容</span>
                </div>
                <div class="segmented">
                  <div
                    v-for="opt in motionOptions"
                    :key="'soft' + opt.value"
                    class="segmented-item"
                    :class="{ active: wpConfig.soft === opt.value }"
                    @click="setWpOption('soft', opt.value)"
                  >
                    <span>{{ opt.value ? '开启' : '关闭' }}</span>
                  </div>
                </div>
              </div>

              <div class="settings-row">
                <div class="row-label">
                  <span class="label-text">背景压暗</span>
                  <span class="label-desc">加深遮罩浓度，保证浅色壁纸下文字可读</span>
                </div>
                <div class="segmented">
                  <div
                    v-for="opt in wpDimOptions"
                    :key="opt.value"
                    class="segmented-item"
                    :class="{ active: wpConfig.dim === opt.value }"
                    @click="setWpOption('dim', opt.value)"
                  >
                    <span>{{ opt.label }}</span>
                  </div>
                </div>
              </div>

              <div class="settings-row">
                <div class="row-label">
                  <span class="label-text">自动轮播</span>
                  <span class="label-desc">多张壁纸时按间隔自动切换（交叉淡入）</span>
                </div>
                <div class="segmented">
                  <div
                    v-for="opt in wpCarouselOptions"
                    :key="opt.value"
                    class="segmented-item"
                    :class="{ active: wpConfig.carousel === opt.value }"
                    @click="setWpOption('carousel', opt.value)"
                  >
                    <span>{{ opt.label }}</span>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>

        <!-- 快捷入口（P0-M4）：快捷面板快捷键改键 -->
        <template v-else-if="activeTab === 'quick'">
          <header class="settings-section-header">
            <h2 class="section-title">快捷入口</h2>
            <p class="section-desc">系统级快捷键唤起快捷面板（应用未聚焦也生效）</p>
          </header>

          <div class="settings-group">
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">唤起快捷面板</span>
                <span class="label-desc">点击右侧按钮后按下组合键完成录制；Esc 取消录制</span>
              </div>
              <div class="shortcut-recorder" :class="{ recording: recording }">
                <span class="shortcut-display">{{ recording ? '请按下组合键…' : prettyShortcut }}</span>
                <el-button size="small" round :type="recording ? 'warning' : 'primary'" @click="toggleRecord">
                  {{ recording ? '取消' : '录制' }}
                </el-button>
                <el-button v-if="!recording && shortcutModified" size="small" round @click="resetShortcut">恢复默认</el-button>
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

            <!-- 清除本地记录（危险操作） -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">清除本地记录</span>
                <span class="label-desc">删除 OmniDeck 与 OmniBuddy 的全部本地数据（含偏好设置、工具收藏、对话记录、空间与模型配置），清除后自动重启应用</span>
              </div>
              <el-button
                size="small"
                round
                type="danger"
                plain
                icon="el-icon-delete"
                :loading="clearing"
                @click="clearLocalData"
              >清除数据</el-button>
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
import { setItem, getItem, clearAll } from '@/utils/db'
import {
  addWallpaperFile,
  removeWallpaper,
  saveWallpaperConfig,
  applyWallpaperDom,
  isVideoItem
} from '@/utils/wallpaper'

export default {
  name: 'Settings',
  data() {
    return {
      activeTab: 'general',
      tabs: [
        { key: 'general', label: '通用', icon: 'el-icon-setting' },
        { key: 'quick', label: '快捷入口', icon: 'el-icon-magic-stick' },
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
      pwdForm: { oldPwd: '', newPwd: '', confirmPwd: '' },
      // 清除本地记录执行中
      clearing: false,
      // ===== 快捷入口：快捷键录制（M4） =====
      panelShortcut: '',
      DEFAULT_PANEL_SHORTCUT: 'CommandOrControl+Shift+Space',
      recording: false,
      // ===== 背景壁纸 =====
      wpDimOptions: [
        { label: '无', value: 'none' },
        { label: '轻', value: 'light' },
        { label: '中', value: 'medium' },
        { label: '重', value: 'heavy' }
      ],
      wpCarouselOptions: [
        { label: '关闭', value: 'off' },
        { label: '30 秒', value: '30s' },
        { label: '1 分钟', value: '1m' },
        { label: '5 分钟', value: '5m' }
      ],
      wpFileInput: null
    }
  },
  computed: {
    themeMode() {
      return this.$store.state.themeMode
    },
    // 展示用快捷键文案：⌃⌥⇧⌘ 形式（mac）
    prettyShortcut() {
      return this.formatAccelerator(this.panelShortcut || this.DEFAULT_PANEL_SHORTCUT)
    },
    // 是否已偏离默认键（控制「恢复默认」按钮显隐）
    shortcutModified() {
      return this.panelShortcut !== this.DEFAULT_PANEL_SHORTCUT
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
    },
    // ===== 背景壁纸 =====
    wpEnabled() {
      return this.$store.state.wallpaperConfig.enabled
    },
    wpConfig() {
      return this.$store.state.wallpaperConfig
    },
    wallpaperList() {
      return this.$store.state.wallpaperList
    },
    // 缩略图列表：图片附 blob URL（缓存复用，不反复 createObjectURL）
    wpThumbs() {
      return this.wallpaperList.map(wp => {
        if (isVideoItem(wp)) return wp
        if (!wp._thumb && wp.blob) {
          try {
            this.$set(wp, '_thumb', URL.createObjectURL(wp.blob))
          } catch (e) { /* 忽略 */ }
        }
        return wp
      })
    }
  },
  mounted() {
    this.loadLockState()
    this.loadPanelShortcut()
  },
  beforeDestroy() {
    window.removeEventListener('keydown', this.onRecordKeydown, true)
  },
  methods: {
    // ===== 快捷入口：快捷键录制（M4） =====
    async loadPanelShortcut() {
      const quick = window.electronAPI && window.electronAPI.quick
      if (quick && quick.getShortcut) {
        const res = await quick.getShortcut()
        this.panelShortcut = res && res.accelerator ? res.accelerator : this.DEFAULT_PANEL_SHORTCUT
      } else {
        this.panelShortcut = this.DEFAULT_PANEL_SHORTCUT
      }
    },
    // accelerator → 展示文案（CommandOrControl+Shift+Space → ⌘⇧Space / Ctrl+Shift+Space）
    formatAccelerator(a) {
      const isMac = !!(window.electronAPI && window.electronAPI.platform === 'darwin')
      return String(a)
        .split('+')
        .map(k => {
          if (k === 'CommandOrControl' || k === 'CmdOrCtrl') return isMac ? '⌘' : 'Ctrl'
          if (k === 'Command' || k === 'Cmd') return '⌘'
          if (k === 'Control' || k === 'Ctrl') return isMac ? '⌃' : 'Ctrl'
          if (k === 'Alt' || k === 'AltGr') return isMac ? '⌥' : 'Alt'
          if (k === 'Shift') return isMac ? '⇧' : 'Shift'
          if (k === 'Meta' || k === 'Super') return isMac ? '⌘' : 'Win'
          if (isMac) {
            if (k === 'Space') return '空格'
          }
          return k
        })
        .join(isMac ? '' : '+')
    },
    toggleRecord() {
      if (this.recording) {
        this.stopRecord()
      } else {
        this.recording = true
        window.addEventListener('keydown', this.onRecordKeydown, true)
      }
    },
    stopRecord() {
      this.recording = false
      window.removeEventListener('keydown', this.onRecordKeydown, true)
    },
    // 录制：捕获首个合法组合（需含修饰键 + 一个普通键）
    onRecordKeydown(e) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        this.stopRecord()
        return
      }
      const isMac = !!(window.electronAPI && window.electronAPI.platform === 'darwin')
      const parts = []
      if (isMac ? e.metaKey : (e.ctrlKey || e.metaKey)) parts.push('CommandOrControl')
      if (e.ctrlKey && isMac) parts.push('Control')
      if (e.altKey) parts.push('Alt')
      if (e.shiftKey) parts.push('Shift')
      // 仅修饰键：等待继续输入
      if (!parts.length) return
      let key = e.key.length === 1 ? e.key.toUpperCase() : e.key
      // 命名归一（Electron accelerator 语法）
      const alias = {
        Space: 'Space', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down',
        ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return'
      }
      key = alias[key] || key
      if (['Up', 'Down', 'Left', 'Right', 'Space', 'Esc', 'Return', 'Tab', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'].indexOf(key) < 0 &&
        !/^[A-Z0-9]$/.test(key) && !/^F\d{1,2}$/.test(key)) return
      const accelerator = parts.concat([key]).join('+')
      this.applyShortcut(accelerator)
    },
    async applyShortcut(accelerator) {
      const quick = window.electronAPI && window.electronAPI.quick
      if (!quick || !quick.setShortcut) {
        this.$message.info('快捷键设置需要 OmniDeck 桌面端')
        this.stopRecord()
        return
      }
      const res = await quick.setShortcut(accelerator)
      this.stopRecord()
      if (res && res.ok) {
        this.panelShortcut = res.accelerator
        this.$message.success('快捷键已更新：' + this.formatAccelerator(res.accelerator))
      } else {
        this.$message.error((res && res.error) || '注册失败，请换一组按键')
      }
    },
    resetShortcut() {
      this.applyShortcut(this.DEFAULT_PANEL_SHORTCUT)
    },
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
    // ===== 背景壁纸 =====
    isVideoWp(wp) {
      return isVideoItem(wp)
    },
    // 生成缩略图地址：图片直接出 blob URL，视频暂无缩略图（显示播放角标）
    wpThumbUrl(wp) {
      if (this.isVideoWp(wp) || !wp.blob) return ''
      try {
        return URL.createObjectURL(wp.blob)
      } catch (e) {
        return ''
      }
    },
    // 选择文件（隐藏 input[type=file]，多选）
    pickWallpaper() {
      if (!this.wpFileInput) {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/gif,image/jpeg,image/png,image/webp,image/bmp,video/mp4,video/webm,video/quicktime,.gif,.jpg,.jpeg,.png,.webp,.bmp,.mp4,.webm,.mov,.m4v'
        input.multiple = true
        input.style.display = 'none'
        input.addEventListener('change', () => {
          const files = Array.from(input.files || [])
          this.addWallpapers(files)
          input.value = ''
        })
        document.body.appendChild(input)
        this.wpFileInput = input
      }
      this.wpFileInput.click()
    },
    async addWallpapers(files) {
      if (!files.length) return
      let last = null
      for (const f of files) {
        const res = await addWallpaperFile(f)
        if (res) {
          last = res
          this.$store.commit('SET_WALLPAPER_LIST', res.list)
          this.$store.commit('SET_WALLPAPER_CONFIG', res.config)
        }
      }
      if (last) {
        // 首次添加自动开启壁纸
        if (!last.config.enabled) {
          this.commitWpConfig({ enabled: true })
        }
        applyWallpaperDom(this.$store.state.wallpaperConfig)
        this.$message({ message: '已添加 ' + files.length + ' 张壁纸', type: 'success' })
      } else {
        this.$message({ message: '不支持的文件类型', type: 'warning' })
      }
    },
    // 总开关
    toggleWallpaper(on) {
      if (on && !this.wallpaperList.length) {
        this.$message({ message: '请先选择壁纸文件', type: 'info' })
        return
      }
      this.commitWpConfig({ enabled: !!on })
    },
    // 选中某张壁纸
    selectWallpaper(wp) {
      this.commitWpConfig({ selectedId: wp.id })
    },
    // 属性级修改（柔化/压暗/轮播）
    setWpOption(key, value) {
      this.commitWpConfig({ [key]: value })
    },
    commitWpConfig(patch) {
      const config = Object.assign({}, this.$store.state.wallpaperConfig, patch)
      this.$store.commit('SET_WALLPAPER_CONFIG', config)
      saveWallpaperConfig(config)
      applyWallpaperDom(config)
    },
    async deleteWallpaper(wp) {
      const res = await removeWallpaper(wp.id)
      this.$store.commit('SET_WALLPAPER_LIST', res.list)
      this.$store.commit('SET_WALLPAPER_CONFIG', res.config)
      applyWallpaperDom(res.config)
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
    },
    // ===== 清除本地记录 =====
    // 身份校验：设置了应用密码（或开启指纹）才需要，否则直接通过
    async verifyIdentityForReset() {
      const api = window.electronAPI && window.electronAPI.appLock
      if (!api || !this.hasPassword) return true
      // 已开启触控 ID：优先指纹校验，取消/失败回退密码输入
      if (this.biometricAvailable && this.lockSettings.biometric) {
        try {
          const bio = await api.biometricVerify()
          if (bio && bio.ok) return true
        } catch (e) { /* 回退密码输入 */ }
      }
      const { value } = await this.$prompt('请输入应用密码以确认清除操作', '身份校验', {
        confirmButtonText: '确认',
        cancelButtonText: '取消',
        inputType: 'password',
        inputPattern: /^.+$/,
        inputErrorMessage: '请输入应用密码'
      }).catch(() => ({ value: null }))
      if (value === null) return false
      const res = await api.verify(value)
      if (!res || !res.ok) {
        this.$message.error('密码不正确')
        return false
      }
      return true
    },
    // 清除本地记录：二次确认 + 身份校验后清空 deck/buddy 全部本地数据并重启应用
    async clearLocalData() {
      const yes = await this.$confirm(
        '将清除 OmniDeck 与 OmniBuddy 的全部本地数据（偏好设置、工具收藏、对话记录、空间与模型配置等），清除后应用将自动重启。此操作不可恢复，确定继续吗？',
        '清除本地记录',
        { confirmButtonText: '清除', cancelButtonText: '取消', type: 'warning' }
      ).then(() => true).catch(() => false)
      if (!yes) return
      if (!(await this.verifyIdentityForReset())) return
      this.clearing = true
      // 渲染侧：清空 IndexedDB（deck + buddy 全部键）与 localStorage
      await clearAll()
      try { localStorage.clear() } catch (e) { /* 忽略 */ }
      // 主进程：删除 buddy 会话/Agent 数据并重启应用（非桌面端刷新页面兜底）
      if (window.electronAPI && window.electronAPI.resetAllData) {
        await window.electronAPI.resetAllData()
      } else {
        location.reload()
      }
      this.clearing = false
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

/* 快捷键录制器 */
.shortcut-recorder {
  display: inline-flex;
  align-items: center;
  gap: 10px;

  &.recording .shortcut-display {
    border-color: $primary-color;
    color: $primary-color;
    animation: shortcut-pulse 1.2s ease-in-out infinite;
  }
}

.shortcut-display {
  display: inline-flex;
  align-items: center;
  min-width: 130px;
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: $search-bg;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 13px;
  color: $text-primary;
  letter-spacing: 0.5px;
}

@keyframes shortcut-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.35); }
  50% { box-shadow: 0 0 0 5px rgba(64, 158, 255, 0); }
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

/* ===== 背景壁纸 ===== */
.wp-controls {
  display: inline-flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.wp-gallery-row {
  padding: 4px 16px 12px 16px;
}

.wp-gallery {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.wp-thumb {
  position: relative;
  width: 108px;
  height: 68px;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  border: 2px solid transparent;
  background: $search-bg;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.06);
  transition: border-color 0.15s ease, transform 0.15s ease;
  -webkit-app-region: no-drag;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }

  &:hover {
    transform: translateY(-2px);
  }

  &.selected {
    border-color: $primary-color;
  }
}

/* 视频壁纸：无静态缩略图时的占位底 */
.wp-thumb.video {
  display: flex;
  align-items: center;
  justify-content: center;
}

.wp-video-badge {
  font-size: 22px;
  color: $text-secondary;
}

.wp-thumb-name {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  padding: 2px 6px;
  font-size: 10px;
  line-height: 14px;
  color: #ffffff;
  background: linear-gradient(transparent, rgba(0, 0, 0, 0.65));
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.wp-thumb-del {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.5);
  color: #ffffff;
  font-size: 11px;
  opacity: 0;
  transition: opacity 0.15s ease;

  i {
    color: #ffffff;
  }

  .wp-thumb:hover & {
    opacity: 1;
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
