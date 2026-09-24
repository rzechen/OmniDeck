# 快捷搜索 Search

> [← Deck 文档](README.md)

- **入口路由**：`/search`（快捷键唤起的搜索面板宿主页签）
- **源码位置**：[src/views/deck/search/index.vue](../../src/views/deck/search/index.vue)、[src/components/common/SearchPalette.vue](../../src/components/common/SearchPalette.vue)

## 功能定位

Spotlight 风格命令面板（SearchPalette）的宿主页签：面板本体是全局组件，本页提供页签落点与唤起逻辑。

## 核心功能

- **自动唤起**：进入 / keep-alive 切回时自动弹出面板（守卫仅 `/search` 激活时触发）
- **触发框**：居中触发框点击重新唤起
- **快捷键实时提示**：显示当前 `getShortcut('search')` 绑定，改键后经 `onShortcutsChanged` 即时刷新
- **二次唤起**：监听 `$root 'deck:search-open'` 事件重新打开
- **选中跳转**：选中结果跳转目标页，本页签保留不关闭

## SearchPalette 面板（全局组件）

- el-dialog 680px，Spotlight 布局
- 数据来自 [tools.js](../../src/config/tools.js) 的 `searchItems`（分组页）+ 全部展平工具，分组命中优先
- ↑↓ 循环选择 + scrollIntoView、Enter 打开、Esc 关闭；打开自动聚焦；底部快捷键提示栏

## 数据与存储

无独立持久化；搜索源为工具注册表静态数据。
