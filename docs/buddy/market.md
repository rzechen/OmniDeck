# 资源市场 Market

> [← Buddy 文档](README.md)

- **入口路由**：`/omnibuddy/market`
- **源码位置**：[src/views/buddy/market/index.vue](../../src/views/buddy/market/index.vue)
- **子组件**：MarketCard、MarketSidebar、MarketToolbar、ItemDetailDialog（与技能页共享）
- **主进程模块**：market.js

## 功能定位

官方资源（技能 / 子代理 / 连接器）的浏览、检索与一键安装。

## 页面结构

```
Banner（数量徽标 + 刷新）
  ↓
左：分类边栏（一级类型胶囊 + 二级主题 chips）
  ↓
右：搜索工具栏 + 卡片网格
（「全部」且无搜索词时按类型三段分组展示，否则单网格）
```

## 核心功能

- **索引加载**：加载 / 失败重试 / 手动刷新
- **搜索**：关键字匹配名称 / 描述 / details / tags
- **筛选**：一级类型与二级主题互斥选择；一键重置
- **详情弹窗**（ItemDetailDialog）：版本 / 更新时间 / 安装状态三态 / 版本历史
- **安装管理**：安装 / 重新安装 / 更新 / 卸载；busyId 互斥 loading；本地安装态即时同步

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| 市场索引与安装 | IPC `buddyApiSection('market')`：index / install / update / uninstall（主进程 `omnibuddy:market:*` 注册） |
