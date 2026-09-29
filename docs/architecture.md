# 技术架构

> [← 返回文档中心](README.md) · [组件与依赖](tech-stack.md)

## 一、进程模型与 IPC

```
┌────────────────────────── Electron ──────────────────────────┐
│ 主进程（electron/）                                            │
│  main.js        窗口 / 托盘 / 快捷键 / 生命周期                  │
│  preload.js     contextBridge → window.electronAPI            │
│  agent-bridge   Agent IPC 桥（fork utility 子进程承载 Agent）    │
│  agent/         Agent 能力模块（20+，经 shim 运行于子进程）       │
│  windows/       截图 / 快捷面板等独立壳窗管理                     │
│  core/          依赖装配 / 自动更新                             │
│  services/      壁纸抓取等                                     │
├───────────────────────────────────────────────────────────────┤
│ utility 子进程（agent-host.js + agent-shim.js）                  │
│  OmniBuddy Agent 全量重活（pi 运行时 / 会话 / 技能 / MCP…）       │
│  经 agent-bridge 与主进程互通；OMNIDECK_AGENT_IN_PROCESS=1       │
│  可回退主进程内运行                                             │
├───────────────────────────────────────────────────────────────┤
│ 渲染进程（src/，Vue 3）                                         │
│  Layout（Deck 视图） / BuddyLayout（Buddy 视图） + 独立壳页      │
└───────────────────────────────────────────────────────────────┘
```

- **IPC 单向规范**：渲染进程统一经 [src/utils/buddy-api.js](../src/utils/buddy-api.js) 访问 `window.electronAPI.omnibuddy`，禁止直接触达 preload 细节
- **构建产物双包**：Vite 同时产出渲染包（`dist/`）与主进程包（`dist-electron/`），由 `electron-vite` 编排

## 二、目录结构

```
OmniDeck/
├── build/                  # 应用图标（icon.icns / icon.ico）与托盘资源（随 extraResources 打包）
├── native/                 # NAPI 插件（windows.cpp：窗口枚举，截图 hover 拾取用）
├── lib/                    # 运行时离线备料包（fetch 下载，按平台分目录；Git LFS 管理）
├── runtime/                # 运行时装配产物（install 生成，按平台分目录；打包时拷进安装包）
├── docs/                   # 文档（本文档所在）与截图（img/）
├── electron/               # Electron 主进程
│   ├── main.js             # 主入口
│   ├── preload.js          # contextBridge：window.electronAPI
│   ├── agent/              # OmniBuddy Agent 能力（会话 / 工作空间 / MCP / Skill / 用量…）
│   ├── core/               # deps.js（依赖装配）/ updater.js（自动更新）
│   ├── services/           # 壁纸抓取等服务
│   └── windows/            # capture.js（截图）/ quick-panel.js（快面板）
├── scripts/                # 构建脚本：运行时装配 / 发版上传 / afterPack 钩子 / 依赖清单
├── public/                 # 静态资源直拷
└── src/                    # 渲染进程（Vue 3）
    ├── main.js             # 渲染入口：Element Plus / SvgIcon / 主题初始化
    ├── App.vue             # 根组件：壁纸层 / 应用锁 / Spotlight
    ├── layout/             # 双视图布局（index.vue=Deck，BuddyLayout.vue=Buddy）
    ├── router/             # 路由表（含工具分包预取 prefetchToolChunks）
    ├── store/              # Vuex（含 tagsView 多页签模块）
    ├── config/             # 工具注册表（tools.js）、应用与基金 API 配置
    ├── components/         # 跨页面共享组件，按域划分
    │   ├── common/         # 全局通用：SvgIcon / AppLock / AppWallpaper / SearchPalette
    │   ├── buddy/          # Buddy 域：chat/ layout/ space/ 子目录 + 弹窗类组件
    │   ├── deck/           # Deck 域：AnimatedNumber / ToolCategory（分类页渲染）
    │   └── tool/           # 工具页通用骨架：ToolShell / CodeEditor / ImageDrop / UnitConverter
    ├── views/              # 页面，与路由同构分域
    │   ├── buddy/          # chat / workspace / mcp / providers / skills / market / rules / usage…
    │   ├── deck/           # home / favorites / todo / finance / clipboard / tools/*（按分类分子目录）
    │   ├── shared/         # 双视图共用页面（设置）
    │   └── shell/          # 独立窗口壳页：capture-overlay / quick 等
    ├── styles/             # 全局样式：变量 / 主题 / 动效 / Buddy 管理页样式
    ├── utils/              # 工具函数：buddy-api（IPC 桥）/ db / markdown / theme…
    └── assets/             # 图标资源（svg 按 buddy/deck 域划分）
```

> 构建产物（`dist/` `dist-electron/`）、装配产物（`runtime/` `release/`）与 `node_modules/` 已 gitignore；`lib/` 离线备料包经 **Git LFS** 入库（见 `.gitattributes`）。

## 三、存储分层

| 层 | 技术 | 内容 |
| --- | --- | --- |
| 渲染进程 | IndexedDB（`src/utils/db.js`） | 收藏 / 待办 / 剪贴板记录 / 工具历史 |
| 凭证 | 系统钥匙串（safeStorage） | API Key 等敏感凭证 |
| 本地文件 | 用户数据目录 | MCP 配置 / AGENTS.md / 会话与工作区 |

## 四、构建体系

### 命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Vite dev server + Electron 热更新 |
| `npm run build` | 仅 electron-vite build（不出安装包） |
| `npm run build:mac` / `build:win` | 构建 + electron-builder 出 DMG / NSIS |
| `npm run release -- <local\|tag> [mac\|win\|all]` | native 兜底编译 → 构建 → 打包 → 上传 Release |

### 打包链路

```
electron-vite build（渲染包 → dist/，主进程 → dist-electron/）
      ↓
electron-builder（files 白名单 + asarUnpack，输出 release/）
      ↓
scripts/afterPack.js 钩子
  ├─ 拷 runtime/<plat>/ → 应用 Resources/runtime/<plat>/（未装配则跳过，不阻塞打包）
  └─ macOS：ad-hoc 签名（codesign --force --deep --sign -）
```

- **mac 签名**：`mac.identity: null` 跳过正式签名（正式签名需连 Apple 时间戳服务器，国内常不可达），由 afterPack 做 ad-hoc 签名——足以让 Touch ID / safeStorage（keychain）正常工作，仅影响 Gatekeeper 分发提示
- **native 插件**：`native/build/Release/windows.node` 列入 `files` 白名单与 `asarUnpack`（NAPI 须真实文件路径）；缺失时 `npm run release` 先自动 `node-gyp rebuild`

## 五、内置运行时装配

应用自带 python / node / playwright 运行时，装配到 `runtime/<plat>/`，打包时由 afterPack 拷入安装包——**用户装完即用，无需宿主预装任何环境**。

```bash
bash scripts/provision-runtime.sh fetch   [plat]   # 备料：按清单下载装配包至 lib/<plat>/
bash scripts/provision-runtime.sh install [plat]   # 装配：python/node/node-tools/playwright/npx-cache 落位
bash scripts/provision-runtime.sh verify  [plat]   # 核对：布局 / 可执行 / 版本 / 预装依赖冒烟
```

- `plat` 省略取当前平台，可选 `darwin-arm64` / `windows-x86_64` 等
- **离线优先**：`lib/<plat>/` 备料包（python-env / node / node-tools / playwright 等，约 830M）已通过 Git LFS 入库，clone 即得；命中本地档即解压不再联网，缺档才在线下载并回存 `lib/`
- **跨平台备料**：解压型组件支持在 mac / Linux 宿主上直接为 `windows-x86_64` 落位，执行类冒烟在非 Windows 宿主自动跳过
- **平台映射**：`darwin-arm64` ↔ mac(arm64)、`windows-x86_64` ↔ win(x64)，由 `scripts/afterPack.js` 的 `runtimePlat()` 与打包平台自动匹配
- 预装依赖清单：`scripts/requirements-sandbox.txt`（python）与 `scripts/node-sandbox-tools.txt`（node）

## 六、发版链路

`npm run release -- v0.3.0 mac` 走 `scripts/release-upload.sh`：

1. GET `/repos/:owner/:repo/releases/:tag/upload_url?file_name=xx` 取预签名 PUT 地址 + 请求头
2. PUT 文件至预签名地址
3. 资产落到 `https://gitcode.com/:owner/:repo/releases/download/:tag/:file_name`（匿名 GET 可达）

依赖 git 凭证存储中的 GitCode token（脚本经 `git credential fill` 读取）。自动更新走 `package.json → build.publish` 的 generic 源，发版后需将 publish url 的 tag 与本次发版对齐。

## 七、开发约定

- **组件/页面 import 必须带 `.vue` 后缀**（Vite 的 `resolve.extensions` 不含 `.vue`）
- **components 与 views 均按域划分**：`buddy/` `deck/` `common|shared/` `tool/`，新增组件放入对应域目录；页面私有组件放 `views/<域>/<页面>/components/` 下 co-locate
- **样式**：全局变量在 `src/styles/variables.scss`，主题色经 CSS 变量注入；Buddy 管理类页面复用 `styles/buddy-settings.scss`
- **IPC**：渲染进程统一经 `src/utils/buddy-api.js` 访问 `window.electronAPI.omnibuddy`
- **空状态**：统一使用 `.ob-empty`（挂在 `.ob-manage-page` flex 容器下自动垂直居中），勿用普通块级元素包裹隔断 flex 上下文
- **语法规范**：全部遵循 Vue 3 语法
