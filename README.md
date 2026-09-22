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
# 环境要求：Node.js ≥ 16、npm；Electron 构建依赖需可访问网络
npm install

# 开发（Vite + Electron 主进程热更新）
npm run dev

# 打包
npm run build:mac   # macOS DMG
npm run build:win   # Windows NSIS 安装包（x64）
npm run build:all   # 双平台
```

产物输出至 `release/`；应用更新走 `package.json → build.publish` 配置的 generic 源。

## 目录结构

```
OmniDeck/
├── build/                  # 应用图标与托盘资源（随 extraResources 打包）
├── electron/               # Electron 主进程
│   ├── main.js             # 主入口：窗口 / 托盘 / 快捷键 / 生命周期
│   ├── preload.js          # contextBridge：window.electronAPI
│   ├── quick-panel.js      # 快捷面板（贴图 / 快速命令）
│   ├── capture.js          # 屏幕截图
│   ├── updater.js          # 自动更新
│   └── agent/              # OmniBuddy Agent 能力（会话 / 工作空间 / MCP / Skill / 用量…）
├── scripts/                # afterPack 与发布上传脚本
├── public/                 # 静态资源直拷
└── src/                    # 渲染进程（Vue 2）
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

## 约定

- **组件/页面 import 必须带 `.vue` 后缀**（Vite 4 的 `resolve.extensions` 不含 `.vue`）
- **components 与 views 均按域划分**：`buddy/` `deck/` `common|shared/` `tool/`，新增组件请放入对应域目录；页面私有组件放 `views/<域>/<页面>/components/` 下 co-locate
- **样式**：全局变量在 `src/styles/variables.scss`，主题色经 CSS 变量注入；Buddy 管理类页面复用 `styles/buddy-settings.scss`
- **IPC**：渲染进程统一经 `src/utils/buddy-api.js` 访问 `window.electronAPI.omnibuddy`，禁止直接触达 preload 细节
- **空状态**：统一使用 `.ob-empty`（挂在 `.ob-manage-page` flex 容器下自动垂直居中），勿用普通块级元素包裹隔断 flex 上下文
