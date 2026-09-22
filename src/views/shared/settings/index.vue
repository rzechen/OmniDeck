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
        <!-- 通用（应用级设置，OmniDeck 与 OmniBuddy 两视图共用） -->
        <template v-if="activeTab === 'general'">
          <header class="settings-section-header">
            <h2 class="section-title">通用</h2>
            <p class="section-desc">应用级偏好设置，OmniDeck 与 OmniBuddy 视图均生效，自动保存</p>
          </header>

          <!-- 全局：应用级设置，OmniDeck 与 OmniBuddy 两视图共用 -->
          <div class="settings-sub-header">全局</div>
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

          <!-- Deck 视图专属：仅影响 OmniDeck 主界面布局 -->
          <div class="settings-sub-header">Deck 视图</div>
          <div class="settings-group">
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

            <!-- 还原菜单排序：低频动作收纳入设置（原侧边栏底部图标） -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">菜单排序</span>
                <span class="label-desc">将左侧菜单的分组与工具排序还原到初始状态</span>
              </div>
              <el-button size="small" round @click="resetMenuOrder">还原排序</el-button>
            </div>

            <!-- 工具执行历史：条数上限（IndexedDB 容量治理） -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">历史记录上限</span>
                <span class="label-desc">每个工具保留的执行历史条数（{{ historyTotalCount }} 条记录），超出自动淘汰最旧；过期 30 天的记录启动时自动清理</span>
              </div>
              <div class="segmented">
                <div
                  v-for="opt in historyLimitOptions"
                  :key="opt.value"
                  class="segmented-item"
                  :class="{ active: historyLimit === opt.value }"
                  @click="selectHistoryLimit(opt.value)"
                >
                  <span>{{ opt.label }}</span>
                </div>
              </div>
            </div>

            <!-- 剪贴板历史：条数上限（主进程轮询记录，可调 50-500） -->
            <div class="settings-row" v-if="hasCaptureApi">
              <div class="row-label">
                <span class="label-text">剪贴板历史上限</span>
                <span class="label-desc">系统剪贴板历史最多保留条数，超出自动淘汰最旧（单条文本 ≤100KB）</span>
              </div>
              <div class="segmented">
                <div
                  v-for="opt in clipKeepOptions"
                  :key="opt.value"
                  class="segmented-item"
                  :class="{ active: clipKeep === opt.value }"
                  @click="selectClipKeep(opt.value)"
                >
                  <span>{{ opt.label }}</span>
                </div>
              </div>
            </div>

            <!-- 工具执行历史管理：按工具清空 / 全局清空 -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">历史记录管理</span>
                <span class="label-desc">{{ storageUsageDesc }}</span>
              </div>
              <div class="lock-actions">
                <el-dropdown v-if="historyTools.length" trigger="click" @command="clearToolHistory">
                  <el-button size="small" round icon="el-icon-eraser" class="hist-tool-dropdown">
                    按工具清空<i class="el-icon-arrow-down el-icon--right"></i>
                  </el-button>
                  <el-dropdown-menu slot="dropdown">
                    <el-dropdown-item
                      v-for="t in historyTools"
                      :key="t.path"
                      :command="t.path"
                      class="hist-tool-item"
                    >
                      <span class="hist-tool-name">{{ t.name }}</span>
                      <span class="hist-tool-count">{{ t.count }} 条</span>
                    </el-dropdown-item>
                  </el-dropdown-menu>
                </el-dropdown>
                <el-button
                  size="small"
                  round
                  type="danger"
                  plain
                  icon="el-icon-delete"
                  :loading="historyClearing"
                  :disabled="!historyTotalCount"
                  @click="clearAllHistory"
                >清空全部历史</el-button>
              </div>
            </div>
          </div>
        </template>

        <!-- 快捷键（P0-M4）：全部快捷键可改键 + 恢复默认（全局 / Deck / Buddy 分组） -->
        <template v-else-if="activeTab === 'quick'">
          <header class="settings-section-header">
            <h2 class="section-title">快捷键</h2>
            <p class="section-desc">点击键帽后按下新组合键（支持 ⌘O+K 式双键组合），松开自动保存并生效</p>
          </header>

          <!-- 快捷键分组：全局 / Deck 视图 / Buddy 视图 -->
          <div v-for="group in shortcutGroups" :key="group.title" class="shortcut-group-block">
            <div class="settings-sub-header">{{ group.title }}</div>
            <div class="settings-group">
              <!-- 恢复默认：归属全局分组的特殊行，任一项偏离默认时可用 -->
              <div v-if="group.resetAll" class="settings-row">
                <div class="row-label">
                  <span class="label-text">恢复默认</span>
                  <span class="label-desc">将全部快捷键还原到默认键位（均含字母 O，取自 OmniDeck / OmniBuddy 首字母）</span>
                </div>
                <el-button size="small" round :disabled="!anyShortcutModified" @click="resetAllShortcuts">恢复全部默认</el-button>
              </div>
              <div v-for="item in group.items" :key="item.id" class="settings-row">
                <div class="row-label">
                  <span class="label-text">{{ item.label }}</span>
                  <span class="label-desc">{{ item.desc }}</span>
                </div>
                <div class="shortcut-recorder" :class="{ recording: recordingId === item.id }">
                  <!-- 键帽式快捷键展示：点击进入录制，Esc 或点击外部取消，松开组合键自动保存 -->
                  <button
                    type="button"
                    class="shortcut-keys"
                    :title="recordingId === item.id ? '' : '点击修改快捷键'"
                    @click="toggleRecord(item.id)"
                  >
                    <template v-if="recordingId === item.id">
                      <template v-if="recordPreview.length">
                        <span v-for="(k, i) in recordPreview" :key="i" class="kbd kbd-live">{{ k }}</span>
                      </template>
                      <span v-else class="kbd kbd-ghost">请按下组合键…</span>
                    </template>
                    <template v-else>
                      <span v-for="(k, i) in acceleratorToKeys(shortcuts[item.id])" :key="i" class="kbd">{{ k }}</span>
                    </template>
                  </button>
                  <span
                    v-if="recordingId !== item.id && shortcutModified(item.id)"
                    class="shortcut-reset"
                    title="恢复默认快捷键"
                    @click="resetShortcutItem(item.id)"
                  >
                    <i class="el-icon-refresh-right"></i>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- 托盘快捷菜单：自定义顶部菜单栏托盘的 Deck / Buddy 菜单项与快捷键 -->
        <template v-else-if="activeTab === 'tray'">
          <header class="settings-section-header">
            <h2 class="section-title">托盘菜单</h2>
            <p class="section-desc">顶部菜单栏托盘图标的 Deck / Buddy 分组菜单；可为每项设置系统级快捷键（应用未聚焦也生效，仅支持「修饰键 + 单键」）</p>
          </header>

          <div class="settings-group tray-menu-block">
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">菜单项管理</span>
                <span class="label-desc">修改即时保存并生效；点击菜单项或按下快捷键将聚焦主窗口并跳转对应页面</span>
              </div>
              <div class="tray-menu-actions">
                <el-button size="small" round @click="addTrayItem('deck')">+ Deck 项</el-button>
                <el-button size="small" round @click="addTrayItem('buddy')">+ Buddy 项</el-button>
                <el-button size="small" round @click="resetTrayMenu">恢复默认</el-button>
              </div>
            </div>
            <div v-for="(g, gi) in trayMenuGroups" :key="g.key" class="tray-menu-group">
              <div class="tray-menu-group-title">{{ g.title }}</div>
              <div v-for="it in g.items" :key="it.id" class="tray-item-row">
                <span class="tray-item-badge" :class="'badge-' + g.key">{{ g.key === 'deck' ? 'D' : 'B' }}</span>
                <input
                  v-model.trim="it.label"
                  class="tray-item-input"
                  maxlength="20"
                  placeholder="菜单名称"
                  @change="saveTrayMenu"
                />
                <input
                  v-model.trim="it.route"
                  class="tray-item-input tray-item-route"
                  maxlength="60"
                  placeholder="页面路由，如 /home"
                  @change="saveTrayMenu"
                />
                <div class="shortcut-recorder" :class="{ recording: recordingId === 'tray:' + it.id }">
                  <button
                    type="button"
                    class="shortcut-keys"
                    :title="recordingId === 'tray:' + it.id ? '' : '点击修改快捷键'"
                    @click="toggleRecord('tray:' + it.id)"
                  >
                    <template v-if="recordingId === 'tray:' + it.id">
                      <template v-if="recordPreview.length">
                        <span v-for="(k, i) in recordPreview" :key="i" class="kbd kbd-live">{{ k }}</span>
                      </template>
                      <span v-else class="kbd kbd-ghost">按下组合键…</span>
                    </template>
                    <template v-else-if="it.accelerator">
                      <span v-for="(k, i) in acceleratorToKeys(it.accelerator)" :key="i" class="kbd">{{ k }}</span>
                    </template>
                    <span v-else class="kbd kbd-ghost">未设置</span>
                  </button>
                </div>
                <span class="tray-item-del" title="删除菜单项" @click="removeTrayItem(gi, it.id)">
                  <i class="el-icon-delete"></i>
                </span>
              </div>
              <div v-if="!g.items.length" class="tray-item-empty">暂无菜单项，点击上方「+ {{ g.key === 'deck' ? 'Deck' : 'Buddy' }} 项」添加</div>
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
                <span class="label-desc">手动锁定应用（需先设置应用密码），锁定后凭密码或触控 ID 解锁；快捷键 {{ formatAccelerator(shortcuts.lock) }}</span>
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

        <!-- 关于（应用级：版本信息 + 问题反馈） -->
        <template v-else-if="activeTab === 'about'">
          <header class="settings-section-header">
            <h2 class="section-title">关于</h2>
            <p class="section-desc">应用版本信息与帮助反馈</p>
          </header>

          <div class="settings-group">
            <!-- 当前版本：跳转版本详情页 -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">当前版本</span>
                <span class="label-desc">查看版本信息与更新日志</span>
              </div>
              <el-button size="small" round icon="el-icon-info" @click="goVersion">查看版本</el-button>
            </div>

            <!-- 问题反馈 -->
            <div class="settings-row">
              <div class="row-label">
                <span class="label-text">问题反馈</span>
                <span class="label-desc">使用中遇到问题或有功能建议，欢迎反馈</span>
              </div>
              <el-button size="small" round icon="el-icon-chat-dot-round" @click="goFeedback">去反馈</el-button>
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
import { clearMenuOrder } from '@/utils/menu-order'
import {
  DEFAULT_SHORTCUTS,
  getShortcuts,
  saveShortcut,
  acceleratorToKeys,
  formatAccelerator,
  parseAccelerator,
  resetAllShortcuts as resetAllAppShortcuts
} from '@/utils/shortcuts'
import {
  addWallpaperFile,
  removeWallpaper,
  saveWallpaperConfig,
  applyWallpaperDom,
  isVideoItem
} from '@/utils/wallpaper'
import * as toolHistory from '@/utils/tool-history'
import { toolCategories } from '@/config/tools'

// 字节数人性化
function fmtBytes(n) {
  if (!n || n < 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let i = 0
  let v = n
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(v >= 100 || i === 0 ? 0 : 1)} ${units[i]}`
}

// 工具 path → 名称（历史管理列表展示用）
const TOOL_NAME_MAP = {}
toolCategories.forEach(c => {
  c.children.forEach(t => {
    TOOL_NAME_MAP[t.path] = t.name
  })
})

export default {
  name: 'Settings',
  data() {
    return {
      activeTab: 'general',
      // 左侧二级菜单：label 统一为 3 字，避免长短参差
      tabs: [
        { key: 'general', label: '通用项', icon: 'el-icon-setting' },
        { key: 'quick', label: '快捷键', icon: 'el-icon-magic-stick' },
        { key: 'tray', label: '托盘项', icon: 'el-icon-menu' },
        { key: 'security', label: '安全项', icon: 'el-icon-lock' },
        { key: 'about', label: '关于项', icon: 'el-icon-info' }
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
      // ===== 工具执行历史管理 =====
      // 条数上限选项（每工具保留条数）
      historyLimitOptions: [
        { label: '20 条', value: 20 },
        { label: '50 条', value: 50 },
        { label: '100 条', value: 100 },
        { label: '200 条', value: 200 }
      ],
      // 当前条数上限
      historyLimit: 200,
      // 有历史记录的工具列表 [{ path, name, count }]
      historyTools: [],
      // 本地数据用量（storage.estimate）
      storageEstimate: null,
      // 清空执行中
      historyClearing: false,
      // ===== 剪贴板历史上限（主进程 capture-settings.json） =====
      clipKeepOptions: [
        { label: '200 条', value: 200 },
        { label: '500 条', value: 500 },
        { label: '1000 条', value: 1000 },
        { label: '2000 条', value: 2000 }
      ],
      clipKeep: 1000,
      // 是否在 Electron 环境（非 Electron 隐藏该行）
      hasCaptureApi: !!(window.electronAPI && window.electronAPI.capture && window.electronAPI.capture.getClipKeep),
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
      // ===== 快捷键：全部可改键（M4 升级） =====
      // 当前快捷键（accelerator 格式；panel / 截图三项为系统级，其余为应用内）
      shortcuts: { panel: '', search: '', lock: '', buddy: '', area: '', screen: '', scroll: '' },
      // 全部默认键（含 O = OmniDeck / OmniBuddy 首字母，防与其他产品冲突）
      DEFAULT_PANEL_SHORTCUT: 'CommandOrControl+Shift+O',
      // 截图三项默认键（与主进程 capture.js DEFAULT_SHORTCUTS 一致）
      CAPTURE_DEFAULTS: {
        area: 'CommandOrControl+Shift+S',
        screen: 'Alt+Shift+3',
        scroll: 'Alt+Shift+S'
      },
      // 正在录制的快捷键 id（空串为未录制）
      recordingId: '',
      // 录制中：已按下的修饰键 / 普通键（松开组合键时组装 accelerator 保存）
      recordMods: [],
      recordKeys: [],
      // ===== 托盘快捷菜单（Deck / Buddy 分组自定义项） =====
      trayMenu: [],
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
    // ===== 快捷键：分组结构（全部可改键） =====
    shortcutGroups() {
      return [
        {
          title: '全局',
          resetAll: true,
          items: [
            { id: 'panel', label: '唤起快捷面板', desc: '系统级快捷键，应用未聚焦也生效；仅支持「修饰键 + 单键」组合' },
            { id: 'lock', label: '锁定应用', desc: '立即锁定应用（需已设置应用密码），锁定后凭密码或触控 ID 解锁' }
          ]
        },
        {
          title: '截图',
          items: [
            { id: 'area', label: '选区截图', desc: '框选区域进入标注编辑，确认后自动复制并入复制历史' },
            { id: 'screen', label: '全屏截图', desc: '截取光标所在显示器整屏，自动复制并入复制历史' },
            { id: 'scroll', label: '滚动长截图', desc: '框选区域后滚动内容逐帧拼接成长图；系统级快捷键，仅支持「修饰键 + 单键」' }
          ]
        },
        {
          title: 'Deck 视图',
          items: [
            { id: 'search', label: '全局搜索', desc: '唤起或收起顶部搜索，可搜索工具与页面' }
          ]
        },
        {
          title: 'Buddy 视图',
          items: [
            { id: 'buddy', label: '唤起助手', desc: '呼出或收起 OmniBuddy 快速对话浮窗' }
          ]
        }
      ]
    },
    // 录制中：实时预览键帽（修饰键 + 已按普通键）
    recordPreview() {
      const mods = this.recordMods.map(m => this.acceleratorToKeys(m)[0])
      const keys = this.recordKeys.map(k => this.acceleratorToKeys(k)[0])
      return mods.concat(keys)
    },
    // 任一快捷键偏离默认（控制「恢复全部默认」可用性）
    anyShortcutModified() {
      return Object.keys(this.shortcuts).some(id => this.shortcutModified(id))
    },
    // 托盘菜单分组视图（Deck / Buddy）
    trayMenuGroups() {
      return [
        { key: 'deck', title: 'Deck 视图', items: this.trayMenu.filter(i => i.group === 'deck') },
        { key: 'buddy', title: 'Buddy 视图', items: this.trayMenu.filter(i => i.group === 'buddy') }
      ]
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
    },
    // ===== 工具执行历史 =====
    // 历史总条数（「清空全部」按钮可用性 + 描述）
    historyTotalCount() {
      return this.historyTools.reduce((s, t) => s + t.count, 0)
    },
    // 本地数据用量描述（IndexedDB 配额）
    storageUsageDesc() {
      if (!this.storageEstimate) return '按工具管理执行历史记录；超过 30 天的记录启动时自动清理'
      const { usage, quota } = this.storageEstimate
      const pct = quota ? Math.min(100, Math.round((usage / quota) * 100)) : 0
      return `本地数据已用 ${fmtBytes(usage)} / 配额 ${fmtBytes(quota)}（${pct}%）`
    }
  },
  mounted() {
    this.loadLockState()
    this.loadShortcuts()
    this.loadTrayMenu()
    this.loadHistoryState()
    this.loadClipKeep()
  },
  beforeDestroy() {
    window.removeEventListener('keydown', this.onRecordKeydown, true)
    window.removeEventListener('keyup', this.onRecordKeyup, true)
    document.removeEventListener('mousedown', this.onRecordBlur, true)
  },
  methods: {
    // ===== 工具执行历史管理 =====
    // 加载历史状态：条数上限 + 各工具记录数 + 本地数据用量
    async loadHistoryState() {
      try {
        this.historyLimit = toolHistory.getLimit()
        const counts = await toolHistory.countByTool()
        this.historyTools = Object.keys(counts).map(path => ({
          path,
          name: TOOL_NAME_MAP[path] || path,
          count: counts[path]
        }))
      } catch (e) { /* 忽略加载失败 */ }
      try {
        if (navigator.storage && navigator.storage.estimate) {
          const { usage, quota } = await navigator.storage.estimate()
          this.storageEstimate = { usage: usage || 0, quota: quota || 0 }
        }
      } catch (e) { /* 不支持时忽略 */ }
    },
    // 切换每工具历史条数上限（保存后立即按新上限淘汰）
    async selectHistoryLimit(v) {
      if (v === this.historyLimit) return
      this.historyLimit = v
      await toolHistory.setLimit(v)
      await this.loadHistoryState()
      this.$message.success(`已调整为每工具保留 ${v} 条历史`)
    },
    // ===== 剪贴板历史上限 =====
    // 读取主进程当前值（capture-settings.json）
    async loadClipKeep() {
      if (!this.hasCaptureApi) return
      try {
        const v = await window.electronAPI.capture.getClipKeep()
        if (Number.isInteger(v)) this.clipKeep = v
      } catch (e) { /* 忽略 */ }
    },
    // 切换剪贴板历史上限（主进程持久化 + 立即淘汰）
    async selectClipKeep(v) {
      if (v === this.clipKeep || !this.hasCaptureApi) return
      const res = await window.electronAPI.capture.setClipKeep(v)
      if (res && res.ok) {
        this.clipKeep = res.clipKeep
        this.$message.success(`剪贴板历史上限已调整为 ${v} 条`)
      } else {
        this.$message.error((res && res.error) || '设置失败')
      }
    },
    // 按工具清空历史（下拉选择）
    async clearToolHistory(path) {
      const tool = this.historyTools.find(t => t.path === path)
      const name = tool ? tool.name : path
      try {
        await this.$confirm(`将清空「${name}」的全部执行历史，是否继续？`, '按工具清空', {
          confirmButtonText: '清空',
          cancelButtonText: '取消',
          type: 'warning'
        })
      } catch (e) {
        return
      }
      await toolHistory.clear(path)
      await this.loadHistoryState()
      this.$message.success(`已清空「${name}」的历史`)
    },
    // 清空全部工具执行历史
    async clearAllHistory() {
      try {
        await this.$confirm(
          `将清空全部 ${this.historyTotalCount} 条工具执行历史记录，是否继续？`,
          '清空全部历史',
          {
            confirmButtonText: '全部清空',
            cancelButtonText: '取消',
            type: 'warning'
          }
        )
      } catch (e) {
        return
      }
      this.historyClearing = true
      try {
        await toolHistory.clear()
        await this.loadHistoryState()
        this.$message.success('已清空全部执行历史')
      } finally {
        this.historyClearing = false
      }
    },

    // ===== 快捷键：全部可改键（M4 升级） =====
    // 加载全部快捷键：panel 走主进程 IPC，截图三项走 capture IPC，应用内走 shortcuts.js
    async loadShortcuts() {
      const quick = window.electronAPI && window.electronAPI.quick
      if (quick && quick.getShortcut) {
        const res = await quick.getShortcut()
        this.shortcuts.panel = res && res.accelerator ? res.accelerator : this.DEFAULT_PANEL_SHORTCUT
      } else {
        this.shortcuts.panel = this.DEFAULT_PANEL_SHORTCUT
      }
      const cap = window.electronAPI && window.electronAPI.capture
      if (cap && cap.getShortcuts) {
        try {
          const res = await cap.getShortcuts()
          if (res) {
            this.shortcuts.area = res.area || this.CAPTURE_DEFAULTS.area
            this.shortcuts.screen = res.screen || this.CAPTURE_DEFAULTS.screen
            this.shortcuts.scroll = res.scroll || this.CAPTURE_DEFAULTS.scroll
          }
        } catch (e) { /* 主进程不可达：走默认 */ }
      }
      if (!this.shortcuts.area) this.shortcuts.area = this.CAPTURE_DEFAULTS.area
      if (!this.shortcuts.screen) this.shortcuts.screen = this.CAPTURE_DEFAULTS.screen
      if (!this.shortcuts.scroll) this.shortcuts.scroll = this.CAPTURE_DEFAULTS.scroll
      const app = getShortcuts()
      this.shortcuts.search = app.search
      this.shortcuts.lock = app.lock
      this.shortcuts.buddy = app.buddy
    },
    // 某项是否偏离默认（控制单项「恢复默认」按钮显隐）
    shortcutModified(id) {
      return this.shortcuts[id] !== this.defaultOf(id)
    },
    // 某项默认键
    defaultOf(id) {
      if (id === 'panel') return this.DEFAULT_PANEL_SHORTCUT
      if (this.CAPTURE_DEFAULTS[id]) return this.CAPTURE_DEFAULTS[id]
      return DEFAULT_SHORTCUTS[id]
    },
    // accelerator → 键帽数组 / 展示文案（平台自感知，shortcuts.js 统一实现）
    acceleratorToKeys,
    formatAccelerator,
    // id → 中文名（冲突提示用）
    labelOf(id) {
      const found = this.shortcutGroups.reduce((acc, g) => acc.concat(g.items), []).find(i => i.id === id)
      return found ? found.label : id
    },
    toggleRecord(id) {
      if (this.recordingId === id) {
        this.stopRecord()
      } else {
        this.recordingId = id
        this.recordMods = []
        this.recordKeys = []
        window.addEventListener('keydown', this.onRecordKeydown, true)
        window.addEventListener('keyup', this.onRecordKeyup, true)
        // 点击录制器外部：自动取消录制（主流改键交互）
        this.$nextTick(() => document.addEventListener('mousedown', this.onRecordBlur, true))
      }
    },
    stopRecord() {
      this.recordingId = ''
      window.removeEventListener('keydown', this.onRecordKeydown, true)
      window.removeEventListener('keyup', this.onRecordKeyup, true)
      document.removeEventListener('mousedown', this.onRecordBlur, true)
    },
    // 录制中点击外部取消
    onRecordBlur(e) {
      const el = this.$el && this.$el.querySelector('.shortcut-recorder.recording')
      if (el && !el.contains(e.target)) this.stopRecord()
    },
    // 录制-按下：累积修饰键与普通键（实时预览），不立即保存
    onRecordKeydown(e) {
      e.preventDefault()
      e.stopPropagation()
      if (e.key === 'Escape') {
        this.stopRecord()
        return
      }
      const isMac = this.isMac
      if (e.key === 'Meta' || e.key === 'Control' || e.key === 'Alt' || e.key === 'Shift') {
        // 修饰键：更新实时修饰键集合
        this.recordMods = []
        if (isMac ? e.metaKey : (e.ctrlKey || e.metaKey)) this.recordMods.push('CommandOrControl')
        if (e.ctrlKey && isMac) this.recordMods.push('Control')
        if (e.altKey) this.recordMods.push('Alt')
        if (e.shiftKey) this.recordMods.push('Shift')
        return
      }
      // 普通键：归一命名（Electron accelerator 风格）
      let key = e.key.length === 1 ? e.key.toUpperCase() : e.key
      if (key === ' ') key = 'Space'
      const alias = {
        Space: 'Space', Escape: 'Esc', ArrowUp: 'Up', ArrowDown: 'Down',
        ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return'
      }
      key = alias[key] || key
      const ok = ['Up', 'Down', 'Left', 'Right', 'Space', 'Esc', 'Return', 'Tab', 'Backspace', 'Delete', 'Home', 'End', 'PageUp', 'PageDown'].indexOf(key) >= 0 ||
        /^[A-Z0-9]$/.test(key) || /^F\d{1,2}$/.test(key)
      if (!ok) return
      // 最多 2 个普通键（⌘O+K 式双键组合）
      if (this.recordKeys.indexOf(key) < 0 && this.recordKeys.length < 2) this.recordKeys.push(key)
    },
    // 录制-松开：任一键松开后，若修饰键已全部松开且已有普通键 → 组装保存
    // （先松修饰键或先松普通键均可触发；双键组合的中间键松开不打断录制）
    onRecordKeyup(e) {
      e.preventDefault()
      const isMac = this.isMac
      this.recordMods = []
      if (isMac ? e.metaKey : (e.ctrlKey || e.metaKey)) this.recordMods.push('CommandOrControl')
      if (e.ctrlKey && isMac) this.recordMods.push('Control')
      if (e.altKey) this.recordMods.push('Alt')
      if (e.shiftKey) this.recordMods.push('Shift')
      if (!this.recordMods.length && this.recordKeys.length) {
        this.commitRecording()
      }
    },
    // 提交录制结果：校验修饰键后组装保存
    commitRecording() {
      if (!this.recordingId) return
      // 必须含修饰键：提示后清空普通键继续录制
      if (!this.recordMods.length) {
        this.recordKeys = []
        this.$message.warning('快捷键需包含修饰键（⌘ / Ctrl / Alt / Shift）')
        return
      }
      if (!this.recordKeys.length) return
      const full = this.recordMods.concat(this.recordKeys).join('+')
      // 托盘菜单项快捷键（tray: 前缀）：系统级，仅支持「修饰键 + 单键」
      if (this.recordingId.indexOf('tray:') === 0) {
        const parsed = parseAccelerator(full)
        if (!parsed || parsed.keys.size > 1) {
          this.$message.error('系统级快捷键仅支持「修饰键 + 单键」组合，请重新录制')
          this.stopRecord()
          return
        }
        this.saveTrayItemShortcut(this.recordingId.slice(5), full)
        return
      }
      this.saveShortcutFor(this.recordingId, full)
    },
    // 保存托盘菜单项快捷键：写入该项并整单保存（冲突/占用由主进程清洗回写）
    async saveTrayItemShortcut(id, accelerator) {
      this.stopRecord()
      const it = this.trayMenu.find(i => i.id === id)
      if (!it) return
      // 与固定快捷键冲突提示（panel 等）
      if (Object.keys(this.shortcuts).some(k => this.shortcuts[k] && this.shortcuts[k].toLowerCase() === accelerator.toLowerCase())) {
        this.$message.error('与既有快捷键冲突，请换一组按键')
        return
      }
      it.accelerator = accelerator
      await this.saveTrayMenu()
      // 回写后确认键位是否注册成功（失败被主进程置空）
      const saved = this.trayMenu.find(i => i.id === id)
      if (saved && saved.accelerator) {
        this.$message.success('快捷键已更新：' + this.formatAccelerator(saved.accelerator))
      } else {
        this.$message.error('注册失败（可能已被其它应用占用），请换一组按键')
      }
    },
    // 保存快捷键：panel 走主进程（仅支持单普通键），应用内走 shortcuts.js
    async saveShortcutFor(id, accelerator) {
      if (!id) return
      this.stopRecord()
      // 本地冲突检测（四项互查，大小写不敏感）
      const conflict = Object.keys(this.shortcuts).find(
        k => k !== id && this.shortcuts[k] && this.shortcuts[k].toLowerCase() === accelerator.toLowerCase()
      )
      if (conflict) {
        this.$message.error('与「' + this.labelOf(conflict) + '」快捷键冲突')
        return
      }
      if (id === 'panel') {
        // 系统级快捷键：Electron globalShortcut 不支持多普通键
        const parsed = parseAccelerator(accelerator)
        if (!parsed || parsed.keys.size > 1) {
          this.$message.error('系统级快捷键仅支持「修饰键 + 单键」组合，请重新录制')
          return
        }
        const quick = window.electronAPI && window.electronAPI.quick
        if (!quick || !quick.setShortcut) {
          this.$message.info('快捷键设置需要 OmniDeck 桌面端')
          return
        }
        const res = await quick.setShortcut(accelerator)
        if (res && res.ok) {
          this.shortcuts.panel = res.accelerator
          this.$message.success('快捷键已更新：' + this.formatAccelerator(res.accelerator))
        } else {
          this.$message.error((res && res.error) || '注册失败，请换一组按键')
        }
        return
      }
      // 截图快捷键（area / screen / scroll）：走主进程 globalShortcut，仅支持「修饰键 + 单键」
      if (this.CAPTURE_DEFAULTS[id]) {
        const parsed = parseAccelerator(accelerator)
        if (!parsed || parsed.keys.size > 1) {
          this.$message.error('系统级快捷键仅支持「修饰键 + 单键」组合，请重新录制')
          return
        }
        const cap = window.electronAPI && window.electronAPI.capture
        if (!cap || !cap.setShortcut) {
          this.$message.info('快捷键设置需要 OmniDeck 桌面端')
          return
        }
        const res = await cap.setShortcut(id, accelerator)
        if (res && res.ok) {
          this.shortcuts[id] = res.shortcuts[id]
          this.$message.success('快捷键已更新：' + this.formatAccelerator(res.shortcuts[id]))
        } else {
          this.$message.error((res && res.error) || '注册失败，请换一组按键')
        }
        return
      }
      // 应用内快捷键
      const res = await saveShortcut(id, accelerator)
      if (res && res.ok) {
        this.shortcuts[id] = accelerator
        this.$message.success('快捷键已更新：' + this.formatAccelerator(accelerator))
      } else {
        this.$message.error((res && res.error) || '保存失败，请换一组按键')
      }
    },
    // 恢复单项默认键
    resetShortcutItem(id) {
      this.recordMods = []
      this.recordKeys = []
      this.saveShortcutFor(id, this.defaultOf(id))
    },
    // 恢复全部默认键（panel + 应用内三项 + 截图三项）
    async resetAllShortcuts() {
      // 应用内：一次性恢复并广播
      const res = await resetAllAppShortcuts()
      if (!(res && res.ok)) {
        this.$message.error('恢复默认失败')
        return
      }
      // panel：走主进程恢复默认键
      this.recordMods = []
      this.recordKeys = []
      await this.saveShortcutFor('panel', this.DEFAULT_PANEL_SHORTCUT)
      // 截图三项：依次恢复默认键（主进程注册）
      for (const key of Object.keys(this.CAPTURE_DEFAULTS)) {
        await this.saveShortcutFor(key, this.CAPTURE_DEFAULTS[key])
      }
      await this.loadShortcuts()
      this.$message.success('已恢复全部默认快捷键')
    },
    // ===== 托盘快捷菜单（Deck / Buddy 分组自定义项） =====
    // 加载托盘菜单配置（主进程 quick-settings.json）
    async loadTrayMenu() {
      const quick = window.electronAPI && window.electronAPI.quick
      if (!quick || !quick.getTrayMenu) return
      const res = await quick.getTrayMenu()
      this.trayMenu = (res && res.items) || []
    },
    // 保存托盘菜单：主进程清洗/注册快捷键并重建托盘菜单，回写清洗后的数据
    async saveTrayMenu() {
      const quick = window.electronAPI && window.electronAPI.quick
      if (!quick || !quick.setTrayMenu) return
      const res = await quick.setTrayMenu(this.trayMenu)
      if (res && res.ok) {
        // 回写：注册失败的快捷键被主进程置空、冲突项被清洗
        this.trayMenu = res.items || this.trayMenu
      }
    },
    // 新增菜单项（分组指定 deck / buddy）
    async addTrayItem(group) {
      const route = group === 'deck' ? '/home' : '/omnibuddy'
      this.trayMenu.push({
        id: 'custom-' + Date.now(),
        group,
        label: group === 'deck' ? '新 Deck 页面' : '新 Buddy 页面',
        route,
        accelerator: ''
      })
      await this.saveTrayMenu()
    },
    // 删除菜单项
    async removeTrayItem(groupKey, id) {
      const g = this.trayMenuGroups[groupKey]
      if (!g) return
      this.$confirm('确定删除菜单项「' + (g.items.find(i => i.id === id) || {}).label + '」吗？', '删除菜单项', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(async () => {
          this.trayMenu = this.trayMenu.filter(i => i.id !== id)
          await this.saveTrayMenu()
          this.$message.success('已删除')
        })
        .catch(() => {})
    },
    // 恢复托盘菜单默认配置
    async resetTrayMenu() {
      const quick = window.electronAPI && window.electronAPI.quick
      if (!quick || !quick.resetTrayMenu) return
      const res = await quick.resetTrayMenu()
      if (res && res.ok) {
        this.trayMenu = res.items || []
        this.$message.success('托盘菜单已恢复默认')
      }
    },
    selectMode(mode) {
      this.$store.commit('SET_THEME', { mode })
      applyTheme(this.themeMode, this.primaryColor)
    },
    // ===== Deck 视图 =====
    // 还原菜单排序：清除持久化排序，广播事件由 Sidebar 重建菜单
    resetMenuOrder() {
      this.$confirm('确定要将菜单排序还原到初始状态吗？', '还原排序', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      })
        .then(() => {
          clearMenuOrder()
          this.$root.$emit('menu-order-reset')
          this.$message.success('排序已还原')
        })
        .catch(() => {})
    },
    // ===== 关于 =====
    goVersion() {
      if (this.$route.name !== 'Version') {
        this.$router.push('/version').catch(() => {})
      }
    },
    goFeedback() {
      if (this.$route.name !== 'Feedback') {
        this.$router.push('/feedback').catch(() => {})
      }
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
        // 通知 AppLock 同步密码状态（锁定快捷键立即可用）
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

// 组内小标题（作用域分组：应用级 / Deck 视图专属）
.settings-sub-header {
  margin: 16px 0 8px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.4px;
  color: $text-secondary;
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

/* ===== 快捷键：键帽与录制器 ===== */
.shortcut-recorder {
  display: inline-flex;
  align-items: center;
  gap: 10px;
}

/* ===== 托盘快捷菜单管理 ===== */
.tray-menu-block {
  .tray-menu-actions {
    display: inline-flex;
    gap: 8px;
    flex-shrink: 0;
  }

  .tray-menu-group {
    padding: 10px 14px 12px;
    border: 1px solid var(--border-color);
    border-radius: 10px;
    background: var(--bg-secondary, rgba(0, 0, 0, 0.02));

    // 分组之间留出间距
    & + .tray-menu-group {
      margin-top: 10px;
    }
  }

  .tray-menu-group-title {
    font-size: 12px;
    font-weight: 700;
    color: $text-secondary;
    letter-spacing: 0.4px;
    margin-bottom: 8px;
  }

  .tray-item-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;

    & + .tray-item-row {
      margin-top: 4px;
    }
  }

  .tray-item-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 700;
    color: #fff;
    flex-shrink: 0;

    &.badge-deck {
      background: var(--primary-color, #5b7cf0);
    }

    &.badge-buddy {
      background: #f59e0b;
    }
  }

  .tray-item-input {
    height: 28px;
    padding: 0 8px;
    border: 1px solid var(--border-color);
    border-radius: 7px;
    background: var(--card-bg, #fff);
    font-size: 12px;
    color: $text-primary;
    outline: none;
    transition: border-color 0.15s ease;

    &:focus {
      border-color: rgba(var(--primary-color-rgb), 0.55);
    }

    // 名称输入框固定宽；路由输入框弹性伸展
    &.tray-item-route {
      flex: 1;
      min-width: 120px;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
      font-size: 11px;
      color: $text-secondary;
    }

    &:not(.tray-item-route) {
      width: 150px;
    }
  }

  .tray-item-del {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 6px;
    color: $text-secondary;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.15s ease, color 0.15s ease;

    &:hover {
      background: rgba(245, 108, 108, 0.12);
      color: #f56c6c;
    }
  }

  .tray-item-empty {
    font-size: 12px;
    color: $text-secondary;
    padding: 6px 0;
  }
}

// 键帽容器（可点击进入录制）
.shortcut-keys {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  -webkit-app-region: no-drag;
  font: inherit;
  transition: opacity 0.15s ease;

  &:hover .kbd {
    border-color: rgba(var(--primary-color-rgb), 0.55);
  }

  // 只读展示（速查行）：不可交互
  &.readonly {
    cursor: default;
    pointer-events: none;
  }
}

// 单个键帽（macOS 键盘样式：浅底 + 内阴影 + 底部厚度）
.kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 26px;
  height: 26px;
  padding: 0 7px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  border-bottom-width: 2px;
  background: var(--card-bg, #fff);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
  font-weight: 600;
  color: $text-primary;
  letter-spacing: 0.3px;
  box-shadow: inset 0 -1px 0 rgba(0, 0, 0, 0.05);
  transition: border-color 0.15s ease, transform 0.1s ease, box-shadow 0.15s ease;
}

// 录制中：提示键帽（虚线幽灵样式 + 呼吸光晕）
.kbd-ghost {
  min-width: 150px;
  border-style: dashed;
  border-color: rgba(var(--primary-color-rgb), 0.6);
  color: $primary-color;
  font-family: inherit;
  background: rgba(var(--primary-color-rgb), 0.06);
  animation: shortcut-pulse 1.2s ease-in-out infinite;
}

// 录制中：实时按下的键帽（主题色高亮）
.kbd-live {
  border-color: rgba(var(--primary-color-rgb), 0.6);
  color: $primary-color;
  background: rgba(var(--primary-color-rgb), 0.08);
}

// 录制中：真实键帽整体轻微下压提示
.shortcut-recorder.recording .shortcut-keys {
  cursor: default;

  .kbd:active {
    transform: translateY(1px);
    box-shadow: none;
  }
}

// 恢复默认小按钮（图标）
.shortcut-reset {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border-radius: 6px;
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.15s ease;
  -webkit-app-region: no-drag;

  i {
    font-size: 14px;
  }

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.09);
    color: $primary-color;
  }
}

@keyframes shortcut-pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(64, 158, 255, 0.35); }
  50% { box-shadow: 0 0 0 5px rgba(64, 158, 255, 0); }
}

// 减弱动态效果：关闭录制呼吸光晕
html.reduce-motion .kbd-ghost {
  animation: none;
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

/* ===== 通用：历史记录管理下拉（mac 风格） ===== */
/* 下拉项：工具名 + 条数徽标，两端对齐 */
::v-deep .hist-tool-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: 180px;
  padding: 0 12px !important;

  .hist-tool-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .hist-tool-count {
    flex-shrink: 0;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
    background: var(--search-bg);
    padding: 1px 7px;
    border-radius: 8px;
  }

  &:hover .hist-tool-count {
    background: rgba(var(--primary-color-rgb), 0.1);
    color: var(--primary-color);
  }
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
