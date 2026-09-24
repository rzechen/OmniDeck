# OmniDeck

全能桌面，智驭未来 · Your All-in-One AI-Powered Desktop Toolkit.

基于 **Electron + Vue 2** 的跨平台（macOS / Windows）桌面应用，将 **AI 编程助手（OmniBuddy）** 与 **开发者工具箱（OmniDeck）** 融合于一体：既能与 Agent 对话执行任务、管理工作空间与 MCP 连接器，也内置 100+ 离线开发/生活小工具。

## 功能总览

### OmniBuddy · AI 编程助手

- **对话**：基于 pi Coding Agent 的多会话 Agent 对话，支持流式输出、思考过程、任务卡片、检查点回滚与消息级用量统计
- **工作空间**：本地目录作为 Agent 工作区，文件浏览 / 预览 / 上传下载
- **连接器（MCP）**：接入自定义 MCP Server（stdio / Streamable HTTP），配置全量本地保存
- **模型服务商**：多 Provider 管理与凭证保管（系统钥匙串加密存储）
- **Skill 市场**：Skill 导入 / 导出 / 凭证配置，以及扩展市场浏览
- **项目规则**：全局 / 工作空间两级 `AGENTS.md` 规则编辑，对话时自动注入系统提示词
- **用量统计**：按天 / 会话 / 模型维度的 token 与成本聚合，支持 CSV 导出

### OmniDeck · 开发者工具箱

- **工具中心**：转换（JSON ↔ YAML/XML/SQL/Java/Go/TS/Excel…）、加解密（AES/RSA/Hash/Base64）、格式化（JSON/YAML/SQL/CSS/Markdown）、图片（压缩 / 格式转换 / 水印 / GIF / 二维码）、文本、单位换算、生活查询等 100+ 工具，分类页由 `category-page.js` 工厂统一生成
- **财务看板**：基金持仓自选、行情明细、贵金属价格
- **效率面板**：首页仪表盘、收藏夹、待办（Todo）、版本更新
- **全局能力**：应用锁（FaceID / 密码）、本地壁纸（图 / GIF / 视频）、截图捕获（含贴图快面板）、快速命令面板、系统托盘

## 技术栈

| 层 | 技术 |
| --- | --- |
| 渲染进程 | Vue 2.7 + Vue Router 3（hash）+ Vuex 3 + Element UI 2.15 |
| 构建 | Vite 4 + @vitejs/plugin-vue2 + vite-plugin-electron |
| 主进程 | Electron 39，Agent 能力基于 `@earendil-works/pi-coding-agent` / `pi-mcp-adapter` / `pi-subagents` |
| 存储 | IndexedDB（前端，经 `src/utils/db.js`）+ 系统钥匙串（凭证）+ 本地文件（MCP / 规则配置） |
| 图表 / 富文本 | ECharts 6、markdown-it、KaTeX、highlight.js、CodeMirror 5 |

## 快速开始

```bash
# 环境要求：Node.js ≥ 16、npm；首次装配与 Electron 构建需可访问网络
npm install

# ① 装配内置运行时（首次 / 切换目标平台时执行一次，详见下节）
bash scripts/provision-runtime.sh install

# ② 开发调试（Vite dev server + Electron 主进程热更新）
npm run dev

# ③ 打包（前置：① 已完成，否则产物不含内置运行时）
npm run build:mac   # macOS DMG
npm run build:win   # Windows NSIS 安装包（x64）

# ④ 发版（打包 + 上传 GitCode Release 附件）
npm run release -- v0.3.0 mac   # 第二参数为 mac | win | all
npm run release -- local mac    # 仅本地打包，不上传
```

| 命令 | 作用 | 出安装包 |
| --- | --- | --- |
| `npm run dev` | Vite dev server + Electron 热更新 | — |
| `npm run build` | 仅 vite build（渲染包 + 主进程） | ❌ |
| `npm run build:mac` | 构建 + electron-builder 出 macOS DMG | ✅ |
| `npm run build:win` | 构建 + electron-builder 出 Windows NSIS（x64） | ✅ |
| `npm run release -- <local\|tag> [mac\|win\|all]` | native 兜底编译 → 构建 → 打包 → 上传 | ✅ |

产物统一输出至 `release/`，命名 `OmniDeck-${version}-${os}-${arch}.${ext}`。

## 内置运行时装配

应用自带 python / node / playwright 运行时，装配到 `runtime/<plat>/`，打包时由 afterPack 拷入安装包 —— **用户装完即用，无需宿主预装任何环境**。装配由 `scripts/provision-runtime.sh` 负责，三命令模型：

```bash
bash scripts/provision-runtime.sh fetch   [plat]   # 备料：按清单下载装配包至 lib/<plat>/
bash scripts/provision-runtime.sh install [plat]   # 装配：python/node/node-tools/playwright/npx-cache 落位
bash scripts/provision-runtime.sh verify  [plat]   # 核对：布局 / 可执行 / 版本 / 预装依赖冒烟
```

`plat` 省略时取当前平台，可选 `darwin-arm64` `darwin-x86_64` `linux-x86_64` `linux-aarch64` `windows-x86_64`。

- **离线优先**：`lib/<plat>/` 存装配包（python-env / node / node-tools / playwright 浏览器等）。命中本地档即解压，不再联网；缺档才在线下载或 `pip` / `npm -g` 安装，并回存 `lib/` 供后续零网络复用
- **跨平台备料**：解压型组件（python-env / node / node-tools / playwright / npx-cache 均为 zip）支持在 mac / Linux 宿主上直接为 `windows-x86_64` 落位，执行类冒烟在非 Windows 宿主自动跳过：

  ```bash
  bash scripts/provision-runtime.sh install windows-x86_64
  ```

- **平台映射**：`darwin-arm64` ↔ mac(arm64)、`windows-x86_64` ↔ win(x64)，由 `scripts/afterPack.js` 的 `runtimePlat()` 与打包平台自动匹配

预装依赖清单见 `scripts/requirements-sandbox.txt`（python：numpy / pandas / matplotlib / openpyxl / python-docx / pdfplumber / pillow / requests 等）与 `scripts/node-sandbox-tools.txt`（node：sharp / docx / pptxgenjs / pdf-lib / pdfjs-dist / marked）。

## 打包与发版

### 打包链路

```
vite build（渲染包 → dist/，主进程 → dist-electron/）
      ↓
electron-builder（files 白名单 + asarUnpack，输出 release/）
      ↓
scripts/afterPack.js 钩子
  ├─ 拷 runtime/<plat>/ → 应用 Resources/runtime/<plat>/（未装配则跳过，不阻塞打包）
  └─ macOS：ad-hoc 签名（codesign --force --deep --sign -）
```

- **afterPack** 在 `package.json → build.afterPack` 配置，把装配好的运行时拷进 `Contents/Resources`（mac）或 `resources`（win / linux），与 `process.resourcesPath` 对应；须在 ad-hoc 签名之前执行，`--deep` 才能覆盖内嵌二进制
- **mac 签名**：`mac.identity: null` 跳过正式签名（正式签名需连 Apple 时间戳服务器，国内常不可达导致打包失败），改由 afterPack 做 ad-hoc 签名 —— 足以让 Touch ID / safeStorage（keychain）正常工作，仅影响 Gatekeeper 分发提示
- **native 插件**：`native/build/Release/windows.node`（窗口枚举 NAPI，截图 hover 拾取用）在 `files` 白名单内并列入 `asarUnpack`（NAPI 须真实文件路径，不能从 asar 内加载）；缺失时 `npm run release` 会先自动 `node-gyp rebuild`

### 上传 Release

`npm run release -- v0.3.0 mac` 走 `scripts/release-upload.sh`：

1. GET `/repos/:owner/:repo/releases/:tag/upload_url?file_name=xx` 取预签名 PUT 地址 + 请求头
2. PUT 文件至预签名地址
3. 资产落到 `https://gitcode.com/:owner/:repo/releases/download/:tag/:file_name`（匿名 GET 可达）

依赖 git 凭证存储中的 GitCode token（脚本经 `git credential fill` 读取）。上传对象为 `release/` 下的 `OmniDeck-*.zip` / `*.exe` / `*.blockmap` 与 `latest*.yml`。

客户端自动更新走 `package.json → build.publish` 的 generic 源，发版后需将 publish url 的 tag 与本次发版对齐。

## 目录结构

```
OmniDeck/
├── build/                  # 应用图标（icon.icns / icon.ico）与托盘资源（随 extraResources 打包）
├── native/                 # NAPI 插件（windows.cpp：窗口枚举，截图 hover 拾取窗口用）
├── lib/                    # 运行时离线备料包（fetch 下载，按平台分目录；供零网络复用）
├── runtime/                # 运行时装配产物（install 生成，按平台分目录；打包时拷进安装包）
├── electron/               # Electron 主进程
│   ├── main.js             # 主入口：窗口 / 托盘 / 快捷键 / 生命周期
│   ├── preload.js          # contextBridge：window.electronAPI
│   ├── quick-panel.js      # 快捷面板（贴图 / 快速命令）
│   ├── capture.js          # 屏幕截图
│   ├── updater.js          # 自动更新
│   └── agent/              # OmniBuddy Agent 能力（会话 / 工作空间 / MCP / Skill / 用量…）
├── scripts/                # 构建脚本：运行时装配（provision-runtime.sh）/ 发版上传 / 依赖清单 / afterPack 钩子
├── public/                 # 静态资源直拷
├── src/                    # 渲染进程（Vue 2）
    ├── main.js             # 渲染入口：Element UI / SvgIcon / 主题初始化
    ├── App.vue             # 根组件：壁纸层 / 应用锁 / Spotlight
    ├── layout/             # 双视图布局（index.vue=Deck 布局，BuddyLayout.vue=Buddy 布局）
    ├── router/             # 路由表（含工具分包预取 prefetchToolChunks）
    ├── store/              # Vuex
    ├── config/             # 工具注册表（tools.js）、应用与基金 API 配置
    ├── components/         # 跨页面共享组件，按域划分
    │   ├── common/         # 全局通用：SvgIcon / AppLock / AppWallpaper / GlobalTopbarActions
    │   ├── buddy/          # Buddy 域：chat/ layout/ space/ 子目录 + 弹窗类组件
    │   ├── deck/           # Deck 域：AnimatedNumber / ToolCategory（分类页渲染）
    │   └── tool/           # 工具页通用骨架：ToolShell / CodeEditor / ImageDrop / DocList / UnitConverter
    ├── views/              # 页面，与路由同构分域
    │   ├── buddy/          # chat / workspace / mcp / providers / skills / market / rules / usage
    │   ├── deck/           # home / favorites / todo / finance / version / feedback / tools/*（按分类分子目录）
    │   ├── shared/         # 双视图共用页面（设置）
    │   └── shell/          # 独立窗口：capture-overlay（截图覆盖层）/ quick（快面板）
    ├── styles/             # 全局样式：变量 / 主题 / 动效 / Buddy 管理页样式
    ├── utils/              # 工具函数：buddy-api（IPC 桥）/ db / markdown / theme…
    └── assets/             # 图标资源（svg 按 buddy/deck 域划分，space 壁纸球）
```

> 构建产物（`dist/` `dist-electron/`）、装配产物（`runtime/` `release/`）与 `node_modules/` 均已 gitignore，不入库；`lib/` 备料包体积大且可重新 fetch，同样不入库。

## 约定

- **组件/页面 import 必须带 `.vue` 后缀**（Vite 4 的 `resolve.extensions` 不含 `.vue`）
- **components 与 views 均按域划分**：`buddy/` `deck/` `common|shared/` `tool/`，新增组件请放入对应域目录；页面私有组件放 `views/<域>/<页面>/components/` 下 co-locate
- **样式**：全局变量在 `src/styles/variables.scss`，主题色经 CSS 变量注入；Buddy 管理类页面复用 `styles/buddy-settings.scss`
- **IPC**：渲染进程统一经 `src/utils/buddy-api.js` 访问 `window.electronAPI.omnibuddy`，禁止直接触达 preload 细节
- **空状态**：统一使用 `.ob-empty`（挂在 `.ob-manage-page` flex 容器下自动垂直居中），勿用普通块级元素包裹隔断 flex 上下文
