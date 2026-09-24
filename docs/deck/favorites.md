# 我的收藏 Favorites

> [← Deck 文档](README.md)

- **入口路由**：`/favorites`
- **源码位置**：[src/views/deck/favorites/index.vue](../../src/views/deck/favorites/index.vue)
- **依赖**：vuedraggable、SvgIcon

## 功能定位

工具、网站、剪贴板三类收藏的统一管理页，支持分组、排序与网站元信息自动抓取。

## 页面结构

```
页头搜索框（过滤当前 Tab，徽标显示 x/y）
  ↓
三 Tab（工具 / 网站 / 剪贴板，顺序可拖拽持久化）
  ↓
各 Tab 内容区（卡片网格 / 分组列表）
+ 添加/编辑网站弹窗、剪贴板预览弹窗
```

## 核心功能

### 工具收藏

- 卡片拖拽排序（vuedraggable），顺序写 Vuex 并持久化 `toolFavorites`
- 点击卡片直达工具页

### 网站收藏

- **分组体系**：新建 / 重命名 / 删除分组（组内站点自动移入"未分类"）；跨组拖拽换分组；空分组作为投放区
- **添加网站**：URL 自动补全 https；600ms 防抖自动抓取可达性 / 标题 / favicon（优先 IPC `fetchSiteMeta`，回退 no-cors fetch）；标题自动回填（手动编辑后不覆盖）；不可达时仍可强制收藏
- **favicon 兜底**：失败回退站点根 `/favicon.ico`，再回退首字母头像

### 剪贴板收藏

- 文本条目详情弹窗；图片大图预览
- 复制、另存 PNG、取消收藏

## 数据与存储

| 数据 | 存储 |
| --- | --- |
| 工具收藏与顺序 | IndexedDB `toolFavorites` |
| 网站收藏 / 分组 | IndexedDB `siteFavorites` / `siteCategories` |
| Tab 顺序 | IndexedDB `favTabOrder` |
| 剪贴板收藏 | IPC `captureFav.list / copy / data / saveAs / remove`（主进程收藏池，上限 500，收藏时整份复制 PNG 与历史隔离） |
