# 全局总览

> [← 返回文档中心](README.md) · [技术架构](architecture.md)

本文从全局视角说明 OmniDeck 的整体设计：一个应用、两套视图、一层全局能力，以及贯穿其中的工厂模式与存储分层。

## 一、应用全景

```
┌──────────────────────────────────────────────────────────────┐
│                       App.vue（根组件）                        │
│      壁纸层（AppWallpaper）/ 应用锁（AppLock）/ 焦点搜索        │
│      代办提醒轮询 · 截图/剪贴板持久化桥 · 托盘导航 · 更新通知     │
├──────────────────────────┬───────────────────────────────────┤
│   Deck 视图（Layout）     │    Buddy 视图（BuddyLayout）        │
│   /  → /home 等          │    /omnibuddy/*                    │
│   · 首页仪表盘            │    · 对话（pi Agent 流式执行）        │
│   · 工具中心（8 分类 74 工具）│    · 工作空间（本地目录读写）        │
│   · 理财看板（基金/黄金）    │    · 生态：供应商/MCP/技能/市场      │
│   · 收藏 / 待办 / 剪贴板   │    · 治理：规则/记忆/能力/权限/用量    │
│   侧边栏：工具集 + 理财分组  │    侧边栏：任务列表（按会话分组）      │
├──────────────────────────┴───────────────────────────────────┤
│              独立壳窗（不挂任何 Layout）                        │
│   /quick 快捷 AI 面板 · /capture-* 截图三件套（选区/控制条/贴图）│
├──────────────────────────────────────────────────────────────┤
│              主进程（electron/）                               │
│   agent/（20+ 模块）· windows/（截图/快面板）· core/ · services/ │
└──────────────────────────────────────────────────────────────┘
```

## 二、双视图体系：一个应用，两种形态

- **Deck 视图**（`src/layout/index.vue`）：面向"打开即用"的工具场景，侧边栏为工具集 + 理财分组（可拖拽排序），主区多页签
- **Buddy 视图**（`src/layout/BuddyLayout.vue`）：面向 AI 编程场景，侧边栏为任务列表（按会话展示名分组），主区顶部多页签（TagsBar）
- 当前 `/` 重定向 `/omnibuddy`（Buddy 为主入口），切换主入口只需改 [router/index.js](../src/router/index.js) 的 redirect

### 关键机制

| 机制 | 说明 |
| --- | --- |
| 多页签按布局登记 | 路由全局 `afterEach` 按根组件身份（`Layout` / `BuddyLayout`）判定所属侧写入 Vuex `tagsView`——不能按 path 判断（vue-router 将根路径 `/` 归一化为 `''` 会漏登记）；`/quick`、截图壳页不挂布局、不登记 |
| 跨视图回位记忆 | `router.lastDeckPath` 记录 Deck 侧最后访问页，从 Buddy「返回 OmniDeck」时回到原页面而非固定首页 |
| 路由三层校验兜底 | 托盘/外链手填路径可能不存在：① 下拉引导 ② 保存时红字拦截 ③ `beforeEach` 守卫将未匹配路径回退 `/home` 并提示，避免顶层 `<router-view>` 空白（只剩壁纸、侧边栏消失） |
| 工具分包预取 | 工具页全部路由级懒加载，首屏空闲时 `prefetchToolChunks()` 逐个错峰预取，消除点击卡片时的分包下载阻塞；失败静默 |

## 三、全局能力层

挂在 App.vue 或独立壳窗，双视图共享：

| 能力 | 实现 | 要点 |
| --- | --- | --- |
| 应用锁 | `components/common/AppLock.vue` | 密码 + Touch ID；闲置/失焦/系统锁屏联动锁定；快捷键 ⌘⌥L |
| 壁纸 | `components/common/AppWallpaper.vue` | 图片 / GIF / 视频，双层交叉淡入、柔化模式、轮播 |
| 搜索面板 | `components/common/SearchPalette.vue` | Spotlight 式命令面板，搜分组页与全部工具 |
| 截图链路 | `views/shell/capture-*` + `electron/windows/capture.js` | 选区（窗口拾取 + 标注）→ 贴屏 / 长截图拼接，详见 [clipboard](deck/clipboard.md) |
| 快捷面板 | `views/shell/quick/` + `electron/windows/quick-panel.js` | 760×520 置顶小窗内的常驻 AI 会话，托盘直达，详见 [chat](buddy/chat.md) |
| 系统托盘 | `electron/windows/quick-panel.js` | 菜单分组自定义项、系统级快捷键、检查更新 |
| 自动更新 | `electron/core/updater.js` | electron-updater + GitCode generic 源，详见 [version](deck/version.md) |

## 四、工具中心：配置驱动的工厂模式

[src/config/tools.js](../src/config/tools.js) 是工具中心唯一注册表：分类（`toolCategories`）、理财（`financeCategories`）、固定菜单与侧边栏分组全部由此派生，Sidebar / Topbar / 首页 / 分类页 / 搜索共用同一份数据。

分类页由 [category-page.js](../src/views/deck/tools/category-page.js) 工厂生成，8 个分类页各只有两行：

```js
import categoryPage from '../category-page'
export default categoryPage('Format')
```

组件名统一加 `Category` 后缀——`Image` / `Text` 是 HTML/SVG 保留标签，直接用作组件名会触发 Vue 保留元素警告。

**新增一个工具的步骤**（详见各分类文档）：

1. `tools.js` 对应分类 `children` 加一条 `{ name, desc, path, icon }`
2. `router/index.js` 注册懒加载路由
3. `src/views/deck/tools/<分类>/` 新建 `.vue` 工具页（复用 `ToolShell` / `CodeEditor` / `ImageDrop` 等骨架）
4. 图标放 `src/assets/icons/svg/deck/`（缺省渲染字母头像）

## 五、OmniBuddy：Agent 能力分层

渲染层 11 个管理页与主进程 `electron/agent/` 模块一一对应；对话能力由 pi Coding Agent 驱动，全部经 `window.electronAPI.omnibuddy`（渲染层统一入口 [buddy-api.js](../src/utils/buddy-api.js)）：

```
渲染层（views/buddy/*） ──IPC──▶ preload（contextBridge） ──▶ 主进程（agent/*）
     BuddyComposer / MessageBubble…            sessions / pi / llm / mcp / skills…
```

各模块职责与交互详见 [buddy/](buddy/README.md) 各文档。

## 六、存储分层

| 层 | 技术 | 内容 |
| --- | --- | --- |
| 渲染进程 | IndexedDB（`src/utils/db.js`，库 omnideck） | 工具/网站收藏、待办、剪贴板与截图持久化、Provider 列表、UI 偏好 |
| 凭证 | 系统钥匙串（safeStorage） | API Key、MCP/Skill 凭证（加密，明文不回显） |
| 主进程文件 | agentDir / userData | 会话与消息、MCP / 技能 / 规则 / 记忆 / 权限配置、用量明细、截图与快捷键设置 |

原则：**前端可恢复数据走 IndexedDB，安全敏感数据走钥匙串，跨进程共享与 Agent 产生的数据走主进程文件。**
