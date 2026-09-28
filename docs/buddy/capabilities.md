# 能力清单 Capabilities

> [← Buddy 文档](README.md)

- **入口路由**：`/omnibuddy/capabilities`
- **源码位置**：[src/views/buddy/capabilities/index.vue](../../src/views/buddy/capabilities/index.vue)
- **主进程模块**：capabilities.js / runtime.js

## 功能定位

Agent 可用工具的只读分类目录：看清楚 Agent "能做什么"。

## 页面结构

```
Hero（工具总数）
  ↓
九分区卡片网格（空分区自动隐藏）
+ 预装依赖详情弹窗（el-dialog 内联）
```

九分区（[categories.js](../../src/views/buddy/capabilities/categories.js)，与权限策略对象下拉共用）：核心工具 / 扩展工具 / 联网工具 / 文档交付 / 深度研究 / 交互与任务 / 语义记忆 / 凭据取用 / 连接器。

## 核心功能

- **工具目录**：`capabilityList` 加载；卡片展示工具名 / 中文名 / 描述 / 可用-已禁用徽标
- **运行时依赖详情**：python / node / playwright 卡片提供「预装依赖 n/m」按钮，弹窗展示：
  - 依赖来源（内置运行时装配）
  - 依赖按组两列落位状态
  - 未装配提示
  - playwright 浏览器工具 chips

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| 能力目录 | IPC `capabilityList()`（主进程静态目录） |
| 运行时装配状态 | runtime.js（装配产物 `runtime/<plat>/`，见 [architecture.md](../architecture.md#五内置运行时装配)） |
