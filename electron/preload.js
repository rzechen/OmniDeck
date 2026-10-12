// 主窗口 preload：经 contextBridge 向渲染进程暴露安全受控的 electronAPI
const { contextBridge, ipcRenderer, webUtils } = require('electron')

// 向渲染进程暴露安全的 API
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node
  },
  // 抓取网站元信息（可达性 + title），主进程 net 请求实现
  fetchSiteMeta: url => ipcRenderer.invoke('site-meta:fetch', url),
  // 通用 HTTP 请求代理（API 调试工具），主进程 net 转发绕过 CORS
  httpRequest: opts => ipcRenderer.invoke('http:request', opts),
  // 拖拽导入取文件真实路径（Electron 32+ File.path 已移除，须经 webUtils）
  getPathForFile: file => webUtils.getPathForFile(file),
  // Windows 无边框窗口控制（渲染进程 Topbar 自绘按钮调用）
  winControl: {
    minimize: () => ipcRenderer.invoke('win-control:minimize'),
    toggleMaximize: () => ipcRenderer.invoke('win-control:toggle-maximize'),
    close: () => ipcRenderer.invoke('win-control:close'),
    isMaximized: () => ipcRenderer.invoke('win-control:is-maximized'),
    onMaximizedChanged: cb => {
      const handler = (_e, v) => cb(v)
      ipcRenderer.on('win-control:maximized-changed', handler)
      return () => ipcRenderer.removeListener('win-control:maximized-changed', handler)
    }
  },
  // 重启应用（不动数据）：入口视图等需重启生效的设置切换后调用
  relaunchApp: () => ipcRenderer.invoke('app:relaunch'),
  // 应用锁定：密码（safeStorage 加密存储于主进程）+ Touch ID（macOS）
  appLock: {
    biometricSupported: () => ipcRenderer.invoke('app-lock:biometric-supported'),
    hasPassword: () => ipcRenderer.invoke('app-lock:has-password'),
    setPassword: pwd => ipcRenderer.invoke('app-lock:set-password', pwd),
    clearPassword: () => ipcRenderer.invoke('app-lock:clear-password'),
    verify: pwd => ipcRenderer.invoke('app-lock:verify', pwd),
    biometricVerify: () => ipcRenderer.invoke('app-lock:biometric-verify'),
    onSystemLocked: cb => {
      ipcRenderer.on('app-lock:system-locked', () => cb())
      return () => ipcRenderer.removeListener('app-lock:system-locked', cb)
    }
  },
  // OmniBuddy Agent：会话管理 + 流式对话
  omnibuddy: {
    listSessions: () => ipcRenderer.invoke('omnibuddy:sessions:list'),
    searchSessions: q => ipcRenderer.invoke('omnibuddy:sessions:search', q),
    createSession: opts => ipcRenderer.invoke('omnibuddy:session:create', opts),
    getMessages: id => ipcRenderer.invoke('omnibuddy:session:messages', id),
    isRunning: id => ipcRenderer.invoke('omnibuddy:session:is-running', id),
    // 点赞/点踩持久化（'like' | 'dislike' | '' 取消）
    setFeedback: payload => ipcRenderer.invoke('omnibuddy:session:feedback', payload),
    renameSession: payload => ipcRenderer.invoke('omnibuddy:session:rename', payload),
    // 置顶/取消置顶（任务列表置顶按钮，meta.pinned 持久化）
    pinSession: payload => ipcRenderer.invoke('omnibuddy:session:pin', payload),
    deleteSession: id => ipcRenderer.invoke('omnibuddy:session:delete', id),
    sendMessage: payload => ipcRenderer.invoke('omnibuddy:session:send', payload),
    steer: payload => ipcRenderer.invoke('omnibuddy:session:steer', payload),
    interrupt: id => ipcRenderer.invoke('omnibuddy:session:interrupt', id),
    replyAskUser: payload => ipcRenderer.invoke('omnibuddy:ask-user:reply', payload),
    // 权限确认（允许 / 本会话内允许 / 拒绝）；pending 恢复渲染层重载丢失的待确认项
    replyPermission: payload => ipcRenderer.invoke('omnibuddy:permission:reply', payload),
    pendingPermissions: () => ipcRenderer.invoke('omnibuddy:permission:pending'),
    // 能力中心（工具分类清单 + 权限策略可选对象）
    capabilityList: () => ipcRenderer.invoke('omnibuddy:capability:list'),
    // 运行时组件在线装配（瘦身版按需下载 python-env / node / node-tools / pandoc）
    runtimeStatus: () => ipcRenderer.invoke('omnibuddy:runtime:status'),
    runtimeInstall: name => ipcRenderer.invoke('omnibuddy:runtime:install', name),
    runtimeUninstall: name => ipcRenderer.invoke('omnibuddy:runtime:uninstall', name),
    onRuntimeProgress: handler => {
      ipcRenderer.on('omnibuddy:runtime:progress', handler)
      return () => ipcRenderer.removeListener('omnibuddy:runtime:progress', handler)
    },
    // 首启引导装配：必需组件就绪检查 + 完成放行（安装动作复用 runtimeInstall）
    setupStatus: () => ipcRenderer.invoke('omnibuddy:setup:status'),
    setupComplete: () => ipcRenderer.invoke('omnibuddy:setup:complete'),
    // 后台批量装配（主进程串行驱动，页面切走不中断）：触发 / 快照 / 进度推送
    setupStartInstall: () => ipcRenderer.invoke('omnibuddy:setup:start-install'),
    setupSnapshot: () => ipcRenderer.invoke('omnibuddy:setup:install-snapshot'),
    onSetupProgress: handler => {
      const wrapped = (_e, s) => handler(s)
      ipcRenderer.on('omnibuddy:setup:progress', wrapped)
      return () => ipcRenderer.removeListener('omnibuddy:setup:progress', wrapped)
    },
    // 权限模式（输入框常驻选择器，即时生效）
    getPermissionMode: () => ipcRenderer.invoke('omnibuddy:permission:get-mode'),
    setPermissionMode: mode => ipcRenderer.invoke('omnibuddy:permission:set-mode', mode),
    // 权限策略（config.json 读写）
    permissionConfig: () => ipcRenderer.invoke('omnibuddy:permission:config'),
    savePermissionConfig: config => ipcRenderer.invoke('omnibuddy:permission:save-config', config),
    permissionReset: () => ipcRenderer.invoke('omnibuddy:permission:reset'),
    // 回退与分支
    truncateSession: payload => ipcRenderer.invoke('omnibuddy:session:truncate', payload),
    branchSession: payload => ipcRenderer.invoke('omnibuddy:session:branch', payload),
    // 会话内分支：编辑问题创建变体（editOf 指向组头），返回新消息记录
    createVariant: payload => ipcRenderer.invoke('omnibuddy:session:variant', payload),
    // 会话资产化（N4）：导出 / 用量看板 / 检查点回滚
    exportSession: payload => ipcRenderer.invoke('omnibuddy:session:export', payload),
    exportReveal: filePath => ipcRenderer.invoke('omnibuddy:session:export-reveal', filePath),
    // 单条消息导出（文档导出）：markdown → PDF / Word / HTML（pandoc 管线）
    messageExport: payload => ipcRenderer.invoke('omnibuddy:message:export', payload),
    listCheckpoints: id => ipcRenderer.invoke('omnibuddy:session:checkpoints', id),
    rollbackCheckpoint: payload => ipcRenderer.invoke('omnibuddy:session:rollback', payload),
    usageSummarize: () => ipcRenderer.invoke('omnibuddy:usage:summarize'),
    usageExportCsv: () => ipcRenderer.invoke('omnibuddy:usage:export-csv'),
    // 定时任务（自动化）：任务管理 + 立即运行 + 模型列表镜像同步
    automation: {
      list: () => ipcRenderer.invoke('omnibuddy:automation:list'),
      create: payload => ipcRenderer.invoke('omnibuddy:automation:create', payload),
      update: payload => ipcRenderer.invoke('omnibuddy:automation:update', payload),
      remove: id => ipcRenderer.invoke('omnibuddy:automation:delete', id),
      runNow: id => ipcRenderer.invoke('omnibuddy:automation:run-now', id),
      syncProviders: list => ipcRenderer.invoke('omnibuddy:automation:sync-providers', list)
    },
    // 深度研究：workflow 运行状态（历史卡片回放）
    workflowStatus: payload => ipcRenderer.invoke('omnibuddy:workflow:status', payload),
    // 子代理后台 run：会话活跃 run 清单（刷新后重建卡片与任务列表状态）
    subagentActiveRuns: chatId => ipcRenderer.invoke('omnibuddy:subagent:active-runs', chatId),
    // 子代理 run 单查（历史卡片回放，直读磁盘状态文件）
    subagentRunStatus: runId => ipcRenderer.invoke('omnibuddy:subagent:run-status', runId),
    // 通知中心：类型×渠道矩阵 + webhook 配置 + 测试投递
    notify: {
      config: () => ipcRenderer.invoke('omnibuddy:notify:config'),
      update: patch => ipcRenderer.invoke('omnibuddy:notify:update', patch),
      test: channel => ipcRenderer.invoke('omnibuddy:notify:test', channel)
    },
    // MCP 服务管理（pi 内置 MCP，配置落 <agentDir>/mcp.json）
    mcp: {
      list: () => ipcRenderer.invoke('omnibuddy:mcp:list'),
      save: servers => ipcRenderer.invoke('omnibuddy:mcp:save', servers)
    },
    // 站点登录（登录向导 + storageState 登记表）
    siteAuth: {
      list: () => ipcRenderer.invoke('omnibuddy:siteauth:list'),
      login: (host, url) => ipcRenderer.invoke('omnibuddy:siteauth:login', host, url)
    },
    // 联网搜索（pi-web-access：web_search / fetch_content，免配置即用）
    webSearch: {
      get: () => ipcRenderer.invoke('omnibuddy:web-search:get'),
      setEnabled: enabled => ipcRenderer.invoke('omnibuddy:web-search:set-enabled', enabled)
    },
    // 生态连接器（官方 MCP Server 目录，一键接入）
    connectors: {
      list: () => ipcRenderer.invoke('omnibuddy:connectors:list'),
      connect: (id, opts) => ipcRenderer.invoke('omnibuddy:connectors:connect', id, opts),
      disconnect: id => ipcRenderer.invoke('omnibuddy:connectors:disconnect', id),
      credentialSpec: id => ipcRenderer.invoke('omnibuddy:connectors:credential-spec', id),
      openDoc: url => ipcRenderer.invoke('omnibuddy:connectors:open-doc', url)
    },
    // 凭证管理（safeStorage 加密存储；resolve 解密明文仅用于编辑回显）
    credentials: {
      list: () => ipcRenderer.invoke('omnibuddy:credentials:list'),
      create: c => ipcRenderer.invoke('omnibuddy:credentials:create', c),
      update: c => ipcRenderer.invoke('omnibuddy:credentials:update', c),
      remove: id => ipcRenderer.invoke('omnibuddy:credentials:delete', id),
      resolve: id => ipcRenderer.invoke('omnibuddy:credentials:resolve', id),
      // 保存后销毁 pi 会话（AI 凭据清单注入发生在会话创建时）
      disposeSessions: () => ipcRenderer.invoke('omnibuddy:credentials:dispose-sessions')
    },
    // 沙箱执行：开关读取/设置，新会话生效
    getSandbox: () => ipcRenderer.invoke('omnibuddy:sandbox:get'),
    setSandboxEnabled: enabled => ipcRenderer.invoke('omnibuddy:sandbox:set-enabled', enabled),
    // Skills 管理：本地 skills 目录扫描/新建/删除/查看/编辑
    listSkills: () => ipcRenderer.invoke('omnibuddy:skills:list'),
    createSkill: skill => ipcRenderer.invoke('omnibuddy:skills:create', skill),
    deleteSkill: dir => ipcRenderer.invoke('omnibuddy:skills:delete', dir),
    getSkill: dir => ipcRenderer.invoke('omnibuddy:skills:get', dir),
    updateSkill: payload => ipcRenderer.invoke('omnibuddy:skills:update', payload),
    // ZIP 导入（校验 + 解压；data 为 Uint8Array）
    validateSkillZip: data => ipcRenderer.invoke('omnibuddy:skills:validate-zip', data),
    importSkillZip: payload => ipcRenderer.invoke('omnibuddy:skills:import-zip', payload),
    // 导出 Skill 为 ZIP
    exportSkillZip: dir => ipcRenderer.invoke('omnibuddy:skills:export-zip', dir),
    // 资源市场（N2）：索引浏览 / 一键安装 / 更新 / 卸载 / 已装列表
    market: {
      index: useCache => ipcRenderer.invoke('omnibuddy:market:index', useCache),
      install: id => ipcRenderer.invoke('omnibuddy:market:install', id),
      update: id => ipcRenderer.invoke('omnibuddy:market:update', id),
      uninstall: id => ipcRenderer.invoke('omnibuddy:market:uninstall', id),
      installed: () => ipcRenderer.invoke('omnibuddy:market:installed'),
      openHome: url => ipcRenderer.invoke('omnibuddy:market:open-home', url)
    },
    // 项目规则：全局 / 工作空间 AGENTS.md 管理（pi SDK 原生装载）
    rulesTargets: () => ipcRenderer.invoke('omnibuddy:rules:targets'),
    getRule: key => ipcRenderer.invoke('omnibuddy:rules:get', key),
    saveRule: payload => ipcRenderer.invoke('omnibuddy:rules:save', payload),
    // 我的资料：结构化个人背景，systemPrompt 确定性注入
    profileGet: () => ipcRenderer.invoke('omnibuddy:profile:get'),
    profileSave: cfg => ipcRenderer.invoke('omnibuddy:profile:save', cfg),
    // 记忆管理（增强）：pi-memory 记忆文件读写 + qmd 就绪状态
    memory: {
      list: () => ipcRenderer.invoke('omnibuddy:memory:list'),
      read: rel => ipcRenderer.invoke('omnibuddy:memory:read', rel),
      write: payload => ipcRenderer.invoke('omnibuddy:memory:write', payload),
      removeEntry: entryId => ipcRenderer.invoke('omnibuddy:memory:remove-entry', entryId),
      status: () => ipcRenderer.invoke('omnibuddy:memory:status'),
      export: () => ipcRenderer.invoke('omnibuddy:memory:export')
    },
    // 附件导入：文件选择框 + 拖拽路径导入 + 粘贴内容导入（图片/文本/PDF/Office）
    // + 导入后预解析（pdf/office 抽取文本并缓存，发送时直接复用）
    pickAttachments: () => ipcRenderer.invoke('omnibuddy:attachments:pick'),
    importAttachment: filePath => ipcRenderer.invoke('omnibuddy:attachments:import', filePath),
    statRef: refPath => ipcRenderer.invoke('omnibuddy:files:stat-ref', refPath),
    importAttachmentBuffer: payload => ipcRenderer.invoke('omnibuddy:attachments:import-buffer', payload),
    parseAttachment: meta => ipcRenderer.invoke('omnibuddy:attachments:parse', meta),
    // 工作空间管理（多工作空间，发送前必须选定）
    listWorkspaces: () => ipcRenderer.invoke('omnibuddy:workspaces:list'),
    addWorkspace: () => ipcRenderer.invoke('omnibuddy:workspaces:add'),
    removeWorkspace: id => ipcRenderer.invoke('omnibuddy:workspaces:remove', id),
    renameWorkspace: payload => ipcRenderer.invoke('omnibuddy:workspaces:rename', payload),
    // 记忆策略（global 继承全局 / isolate 独立 / clean 干净启动）
    setWorkspaceMemoryPolicy: payload => ipcRenderer.invoke('omnibuddy:workspaces:set-memory-policy', payload),
    sessionMeta: id => ipcRenderer.invoke('omnibuddy:session:meta', id),
    // 空间文件管理（网盘风格）：浏览 + 常规操作 + 导入
    files: {
      list: dir => ipcRenderer.invoke('omnibuddy:files:list', dir),
      listTree: dir => ipcRenderer.invoke('omnibuddy:files:list-tree', dir),
      mkdir: payload => ipcRenderer.invoke('omnibuddy:files:mkdir', payload),
      createFile: payload => ipcRenderer.invoke('omnibuddy:files:create', payload),
      rename: payload => ipcRenderer.invoke('omnibuddy:files:rename', payload),
      trash: p => ipcRenderer.invoke('omnibuddy:files:trash', p),
      trashBatch: paths => ipcRenderer.invoke('omnibuddy:files:trash-batch', paths),
      empty: dir => ipcRenderer.invoke('omnibuddy:files:empty', dir),
      read: p => ipcRenderer.invoke('omnibuddy:files:read', p),
      readImage: p => ipcRenderer.invoke('omnibuddy:files:read-image', p),
      readDocx: p => ipcRenderer.invoke('omnibuddy:files:read-docx', p),
      readPdf: p => ipcRenderer.invoke('omnibuddy:files:read-pdf', p),
      write: payload => ipcRenderer.invoke('omnibuddy:files:write', payload),
      reveal: p => ipcRenderer.invoke('omnibuddy:files:reveal', p),
      open: p => ipcRenderer.invoke('omnibuddy:files:open', p),
      importDialog: dir => ipcRenderer.invoke('omnibuddy:files:import-dialog', dir),
      importPaths: payload => ipcRenderer.invoke('omnibuddy:files:import-paths', payload)
    },
    // 流式事件订阅：delta / done / error / interrupted / user_message
    onEvent: cb => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('omnibuddy:event', handler)
      return () => ipcRenderer.removeListener('omnibuddy:event', handler)
    }
  },
  // 壁纸市场拉取（顶层桥）：远程清单 / 拉取到本地目录（带进度推送）/ 读拉取文件 / 原生目录选择
  wallpaperMarket: {
    pickDir: () => ipcRenderer.invoke('wallpaper-market:pick-dir'),
    scanDir: dir => ipcRenderer.invoke('wallpaper-market:scan-dir', dir),
    manifest: useCache => ipcRenderer.invoke('wallpaper-market:manifest', useCache),
    pull: payload => ipcRenderer.invoke('wallpaper-market:pull', payload),
    readFile: p => ipcRenderer.invoke('wallpaper-market:read-file', p),
    onProgress: cb => {
      const handler = (_e, v) => cb(v)
      ipcRenderer.on('wallpaper-market:progress', handler)
      return () => ipcRenderer.removeListener('wallpaper-market:progress', handler)
    }
  },
  // 快捷面板：显隐控制（Esc 隐藏等）+ 可见性事件（剪贴板感知）+ 快捷键设置
  quick: {
    show: () => ipcRenderer.invoke('quick:show'),
    hide: () => ipcRenderer.invoke('quick:hide'),
    getShortcut: () => ipcRenderer.invoke('quick:get-shortcut'),
    setShortcut: a => ipcRenderer.invoke('quick:set-shortcut', a),
    // 托盘快捷菜单（Deck / Buddy 分组自定义项 + 项级系统快捷键）
    getTrayMenu: () => ipcRenderer.invoke('quick:get-tray-menu'),
    setTrayMenu: items => ipcRenderer.invoke('quick:set-tray-menu', items),
    resetTrayMenu: () => ipcRenderer.invoke('quick:reset-tray-menu'),
    testShortcut: a => ipcRenderer.invoke('quick:test-shortcut', a),
    onVisibility: cb => {
      const handler = (_e, v) => cb(v)
      ipcRenderer.on('quick:visibility', handler)
      return () => ipcRenderer.removeListener('quick:visibility', handler)
    }
  },
  // 翻译浏览器（Deck 一级入口）：<webview> 架构——导航/缩放由页面直接驱动 webview，
  // 这里只留翻译特性通道（引擎/开关/进度）与 webview 生命周期通知
  browser: {
    // 导航命令（loadURL/reload/goBack/goForward/stop）统一走主进程：渲染层直调
    // webview 方法在导航被取代时 ERR_ABORTED reject，主进程必打 GUEST_VIEW_MANAGER_CALL
    // 噪音日志（Electron 内置），主进程内 catch 即静默
    navigate: (cmd, url) => ipcRenderer.invoke('browser:navigate', { cmd, url }),
    // webview dom-ready 时通知主进程登记 webContents（翻译注入目标）
    attachWebview: () => ipcRenderer.invoke('browser:attach-webview'),
    // 多 Tab：切换激活 tab（wcId = webview.getWebContentsId()，导航/翻译注入定向）
    setActivePage: wcId => ipcRenderer.invoke('browser:set-active-page', wcId),
    // 页面加载完成（did-finish-load）：主进程幂等注入翻译 controller
    pageLoaded: () => ipcRenderer.invoke('browser:page-loaded'),
    // 缩放：恢复 100%（target: 'ui' 主窗界面 | 'web' 内嵌网页）
    resetZoom: target => ipcRenderer.invoke('browser:reset-zoom', { target }),
    // 缩放变化回推 { ui }（网页侧缩放由页面从 webview 直接读）
    onZoom: handler => {
      const fn = (_e, payload) => handler(payload)
      ipcRenderer.on('browser:zoom', fn)
      return () => ipcRenderer.removeListener('browser:zoom', fn)
    },
    // 翻译开关：true 注入并启用双语对照，false 移除全部译文
    setTranslate: enabled => ipcRenderer.invoke('browser:translate', enabled),
    // 引擎/目标语言切换：{ engine: 'google'|'llm', target: 'zh-CN'|'en'|..., provider: { baseUrl, apiKey, model } }
    setEngine: opts => ipcRenderer.invoke('browser:set-engine', opts),
    // 手动翻译（翻译面板输入区）：返回 { translations: [译文], source, target, engine } 或 { error }
    translateText: text => ipcRenderer.invoke('browser:translate-text', text),
    // 插入译文到网页当前聚焦输入框（经页面注入脚本执行，结果 toast 回报）
    insertText: text => ipcRenderer.invoke('browser:insert-text', text),
    // 翻译配置回推（engine/target/enabled/detected* 等；导航状态由页面直读 webview）
    onState: cb => {
      const handler = (_e, v) => cb(v)
      ipcRenderer.on('browser:state', handler)
      return () => ipcRenderer.removeListener('browser:state', handler)
    },
    // 翻译进度回推：{ total, done, failed, error? }
    onProgress: cb => {
      const handler = (_e, v) => cb(v)
      ipcRenderer.on('browser:progress', handler)
      return () => ipcRenderer.removeListener('browser:progress', handler)
    }
  },
  // 屏幕截取（iShot 风格截图工具）：状态 / 全屏 / 选区 / 长截图 / 统一复制历史 / 权限设置
  capture: {
    status: () => ipcRenderer.invoke('capture:status'),
    screen: opts => ipcRenderer.invoke('capture:screen', opts),
    area: opts => ipcRenderer.invoke('capture:area', opts),
    // 长截图：scroll 选区并开始 → scrollShot 拍帧 → finish 拼接完成 / cancel 取消
    scroll: opts => ipcRenderer.invoke('capture:scroll', opts),
    scrollShot: () => ipcRenderer.invoke('capture:scroll-shot'),
    scrollFinish: () => ipcRenderer.invoke('capture:scroll-finish'),
    scrollCancel: () => ipcRenderer.invoke('capture:scroll-cancel'),
    openPermissionSettings: () => ipcRenderer.invoke('capture:open-permission-settings'),
    requestPermission: () => ipcRenderer.invoke('capture:request-permission'),
    // 全局快捷键（iShot 风格）：读取/修改/试注册
    getShortcuts: () => ipcRenderer.invoke('capture:get-shortcuts'),
    setShortcut: (key, accelerator) => ipcRenderer.invoke('capture:set-shortcut', { key, accelerator }),
    testShortcut: accelerator => ipcRenderer.invoke('capture:test-shortcut', accelerator),
    getClipKeep: () => ipcRenderer.invoke('capture:get-clip-keep'),
    setClipKeep: val => ipcRenderer.invoke('capture:set-clip-keep', val),
    // 统一复制历史（截图 + 剪贴板合并时间线，默认记录 + 持久化）
    historyList: () => ipcRenderer.invoke('capture:history-list'),
    historyCopy: id => ipcRenderer.invoke('capture:history-copy', id),
    historyRemove: id => ipcRenderer.invoke('capture:history-remove', id),
    historyClear: () => ipcRenderer.invoke('capture:history-clear'),
    historyData: id => ipcRenderer.invoke('capture:history-data', id),
    historySaveAs: id => ipcRenderer.invoke('capture:history-save-as', id)
  },
  // 截图/剪贴板持久化桥（仅主窗）：变更监听 + 恢复回传 + 就绪上报
  captureSync: {
    onSync: cb => {
      const handler = (_e, op) => cb(op)
      ipcRenderer.on('main:capture-sync', handler)
      return () => ipcRenderer.removeListener('main:capture-sync', handler)
    },
    syncReady: () => ipcRenderer.invoke('capture:sync-ready'),
    restore: payload => ipcRenderer.invoke('capture:restore', payload),
    clipsRestore: payload => ipcRenderer.invoke('capture:clips-restore', payload),
    favRestore: payload => ipcRenderer.invoke('capture:fav-restore', payload)
  },
  // 剪贴板收藏（独立池，与历史隔离）：从历史加入 / 列表 / 复制 / 删除 / 清空 / 预览 / 另存
  captureFav: {
    list: () => ipcRenderer.invoke('capture:fav-list'),
    ids: () => ipcRenderer.invoke('capture:fav-ids'),
    add: histId => ipcRenderer.invoke('capture:fav-add', histId),
    copy: id => ipcRenderer.invoke('capture:fav-copy', id),
    remove: id => ipcRenderer.invoke('capture:fav-remove', id),
    clear: () => ipcRenderer.invoke('capture:fav-clear'),
    data: id => ipcRenderer.invoke('capture:fav-data', id),
    saveAs: id => ipcRenderer.invoke('capture:fav-save-as', id)
  },
  // 贴屏小窗专用（capture-pin 页面）：拉图 / 缩放 / 关闭
  capturePin: {
    frame: id => ipcRenderer.invoke('capture-pin:frame', id),
    resize: opts => ipcRenderer.invoke('capture-pin:resize', opts),
    close: () => ipcRenderer.invoke('capture-pin:close')
  },
  // 自动更新（引导下载 / electron-updater 全自动）
  updater: {
    check: () => ipcRenderer.invoke('updater:check'),
    lastResult: () => ipcRenderer.invoke('updater:last-result'),
    skip: version => ipcRenderer.invoke('updater:skip', version),
    openDownload: assetUrl => ipcRenderer.invoke('updater:open-download', assetUrl),
    // 全自动通道：下载 / 重启安装 / 状态查询
    download: () => ipcRenderer.invoke('updater:download'),
    install: () => ipcRenderer.invoke('updater:install'),
    downloadState: () => ipcRenderer.invoke('updater:download-state'),
    // 下载进度推送（downloading/ready/error）
    onDownloadState: cb => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:download-state', handler)
      return () => ipcRenderer.removeListener('updater:download-state', handler)
    },
    // 静默检查发现新版本（启动 30s 后至多一次；downloaded=true 表示已下载完成）
    onAvailable: cb => {
      const handler = (_e, payload) => cb(payload)
      ipcRenderer.on('updater:available', handler)
      return () => ipcRenderer.removeListener('updater:available', handler)
    }
  },
  // 主进程导航指令（托盘菜单等）：跳转指定路由
  onNavGoto: cb => {
    const handler = (_e, path) => cb(path)
    ipcRenderer.on('nav:goto', handler)
    return () => ipcRenderer.removeListener('nav:goto', handler)
  },
  // 选区覆盖窗→ 主进程回传通道：
  // - done：picking 阶段回传选区 rect（CSS 坐标）/ null 取消；
  //   editing 阶段回传 { action: 'confirm'|'pin'|'cancel', data, rect }
  // - freeze：选区定稿时主进程抓定格帧（返回 dataURL + scaleFactor），
  //   overlay 原地切换编辑态（单窗口全流程）
  // - context：交互上下文（实时）：本屏窗口列表（z 序前→后）+ 光标位置（本屏相对）
  captureOverlay: {
    done: rect => ipcRenderer.invoke('capture-overlay:done', rect),
    freeze: () => ipcRenderer.invoke('capture-overlay:freeze'),
    context: () => ipcRenderer.invoke('capture-overlay:context')
  },
  // 长截图控制条小窗 → 主进程：拍一帧 / 完成 / 取消
  captureScrollCtrl: {
    shot: () => ipcRenderer.invoke('capture:scroll-shot'),
    finish: () => ipcRenderer.invoke('capture:scroll-finish'),
    cancel: () => ipcRenderer.invoke('capture:scroll-cancel')
  }
})
