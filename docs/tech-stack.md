# 组件与依赖

> [← 返回文档中心](README.md) · [技术架构](architecture.md)

## 一、技术栈总览

| 层 | 技术 |
| --- | --- |
| 渲染进程 | Vue 2.7 + Vue Router 3（hash）+ Vuex 3 + Element UI 2.15 |
| 构建 | Vite 4 + @vitejs/plugin-vue2 + vite-plugin-electron |
| 主进程 | Electron 39，Agent 能力基于 pi 系框架 |
| 打包发版 | electron-builder 26 + 自研 afterPack / 运行时装配 / Release 上传脚本 |
| 存储 | IndexedDB（前端）+ 系统钥匙串（凭证）+ 本地文件（配置 / 会话） |

## 二、渲染进程依赖

### UI 与交互

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| Element UI | 2.15 | 组件库基础（表单 / 弹窗 / 消息等） |
| vuedraggable | 2.24 | 拖拽排序（侧边栏分组、世界时钟等） |
| SvgIcon（自研） | — | svg-sprite 图标体系，图标按 buddy / deck 域分目录 |

### 编辑器与代码

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| CodeMirror | 5.65 | 代码编辑器（JSON / SQL / CSS 格式化工具等） |
| highlight.js | 11.12 | 代码高亮（Markdown 渲染、速查表） |
| js-beautify | 1.15 | CSS / JS 格式化 |

### 图表

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| ECharts | 6.1 | 用量统计（柱图 / 饼图）、基金净值走势 |

### 富文本渲染

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| markdown-it | 14.3 | Markdown 渲染（对话消息、格式化工具） |
| KaTeX | 0.16 | 数学公式渲染 |
| sql-formatter | 15.8 | SQL 格式化 |
| js-yaml | 4.3 | YAML 解析 |

### 加解密

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| crypto-js | 4.2 | AES / DES、Hash（加密工具） |
| jsencrypt | 3.5 | RSA 加解密 |
| node-forge | 1.4 | RSA 密钥对 / 签名 |
| js-sha3 | 0.9 | SHA3 系列哈希 |
| hi-base32 | 0.5 | Base32 编解码 |

### 文档与数据

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| xlsx | 0.18 | Excel 导入导出（JSON 转 Excel、VLookup） |
| pdf-parse | 1.1 | PDF 解析 |
| @tobilu/qmd | 2.8 | Markdown / 文档处理（随包 asarUnpack） |

### 图像

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| gif.js | 0.2 | GIF 合成（worker 位于 public/） |
| qrcode | 1.5 | 二维码生成 |

### 生活工具数据

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| solarlunar | 2.0 | 农历 / 节气 / 生肖 |
| relationship.js | 1.2 | 亲戚称谓计算 |

## 三、主进程依赖（Agent 能力）

| 组件 | 版本 | 用途 |
| --- | --- | --- |
| @earendil-works/pi-coding-agent | 0.84 | pi Coding Agent 核心（对话 / 工具调用 / 检查点） |
| pi-mcp-adapter | 2.34 | MCP 协议适配（stdio / Streamable HTTP） |
| pi-subagents | 0.70 | 子代理编排 |
| @anthropic-ai/sandbox-runtime | 0.0.x | Agent 沙箱执行环境 |
| adm-zip | 0.6 | 运行时备料包解压 |
| electron-updater | 6.8 | 自动更新 |

## 四、构建工具链

| 工具 | 版本 | 用途 |
| --- | --- | --- |
| Vite + @vitejs/plugin-vue2 | 4.5 / 2.3 | 渲染进程与主进程构建 |
| vite-plugin-electron | 0.15 | Vite ↔ Electron 编排 |
| vite-plugin-svg-icons | 2.2 | svg-sprite 图标注入 |
| electron-builder | 26.15 | DMG / NSIS 打包 |
| node-addon-api / node-gyp | 8.9 | NAPI 原生插件（native/windows.cpp） |
| sass | 1.69 | SCSS 编译 |
| fast-glob | 3.3 | 构建脚本文件检索 |

## 五、自研核心组件

| 组件 | 位置 | 说明 |
| --- | --- | --- |
| ToolShell | `src/components/tool/` | 工具页通用骨架（标题 / 布局 / 历史） |
| CodeEditor / ImageDrop / DocList / UnitConverter | `src/components/tool/` | 编辑器、拖拽传图、文档列表、单位换算等工具通用件 |
| ToolCategory + category-page 工厂 | `src/components/deck/` + `src/views/deck/tools/` | 配置驱动的分类页渲染 |
| MessageBubble / ThinkingSection / TodoCard / AskUserCard | `src/components/buddy/chat/` | 对话消息多态组件 |
| Space* 系列 | `src/components/buddy/space/` | 工作空间文件管理（网格 / 列表 / 面包屑 / 预览） |
| AppLock / AppWallpaper / SearchPalette | `src/components/common/` | 应用锁 / 壁纸层 / 全局搜索面板 |
| SvgIcon | `src/components/common/SvgIcon/` | svg-sprite 图标组件 |
| buddy-api | `src/utils/buddy-api.js` | IPC 统一桥（渲染层唯一入口） |
| NAPI 窗口枚举 | `native/windows.cpp` | Windows 截图 hover 拾取窗口 |
