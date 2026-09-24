# 记忆管理 Memory

> [← Buddy 文档](README.md)

- **入口路由**：`/omnibuddy/memory`
- **源码位置**：[src/views/buddy/memory/index.vue](../../src/views/buddy/memory/index.vue)
- **主进程模块**：memory.js

## 功能定位

pi-memory 记忆文件（长期记忆 / 草稿板 / 每日日志 / 恢复记录）的查看与编辑。

## 页面结构

```
Hero（统计徽标 + 引擎/语义检索/索引三状态灯 + 导出/刷新按钮）
  ↓
左：文件列表（搜索 + 四分组）
  ↓
右：编辑器（长期记忆条目视图 ⇄ 源码全文编辑）
```

## 核心功能

- **长期记忆条目视图**：按三型 chips 筛选（偏好 / 事实 / 事件）；单条删除（`removeEntry`）
- **源码编辑**：切换为记忆文件全文编辑（`write`）；清空保存 = 删除文件
- **未保存保护**：切换文件时未保存提示与确认
- **恢复记录**：只读展示
- **导出**：`exportMemory` 导出 Markdown
- **刷新**：`list + status` 重载文件与引擎状态（引擎 / 语义检索 / 索引三状态灯）

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| 记忆文件（markdown） | 主进程 agentDir/memory 目录 |
| 操作 | IPC `omnibuddy.memory` 子桥：list / read / write / removeEntry / status / export |
