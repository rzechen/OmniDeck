# 首页仪表盘 Home

> [← Deck 文档](README.md)

- **入口路由**：`/home`
- **源码位置**：[src/views/deck/home/index.vue](../../src/views/deck/home/index.vue)
- **依赖**：SvgIcon、`@/utils/db`

## 功能定位

Deck 视图的默认落地页：问候与时间、核心功能入口、本地存储监控与工具集导航的仪表盘。

## 页面结构

```
Hero 问候（时段问候语 + 秒级时钟）
  ↓
OmniBuddy 推广横幅（点击跳 /omnibuddy，标注 ⌘J）
  ↓
quick-grid 四入口卡（待办 / 收藏 / 快捷搜索 / 设置）
  ↓
每日存储增长折线图（近 30 天）
  ↓
工具分类胶囊网格（点击直达分类路由）
```

## 核心功能

- **时段问候 + 秒级时钟**：按一天时段切换问候语
- **OmniBuddy 横幅**：一键进入 AI 对话视图
- **入口卡动态徽标**：待办卡显示今日待办数量徽标；收藏卡显示工具 / 网站收藏数量
- **本地数据卡**：`navigator.storage.estimate()` 读取配额，展示占用百分比与进度条，≥80% 告警提示
- **存储增长折线图**：手写 SVG 实现（非 ECharts），近 30 天 IndexedDB 每日净增长，悬停十字线 + tooltip，无采样日断线处理，并统计累计 / 日均 / 峰值
- **工具分类直达**：分类胶囊网格按 [tools.js](../../src/config/tools.js) 注册表渲染，点击进入分类页

## 数据与存储

| 数据 | 存储 |
| --- | --- |
| 今日待办数 | IndexedDB `todoItems` |
| 收藏数量 | IndexedDB `toolFavorites` / `siteFavorites` |
| 每日存储增长 | `getDailyGrowth(30)`（`@/utils/db`） |
