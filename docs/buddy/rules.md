# 项目规则 Rules

> [← Buddy 文档](README.md)

- **入口路由**：`/omnibuddy/rules`
- **源码位置**：[src/views/buddy/rules/index.vue](../../src/views/buddy/rules/index.vue)
- **依赖**：utils/markdown（预览）、utils/download（导出）
- **主进程模块**：rules.js

## 功能定位

全局 / 工作空间两级 `AGENTS.md` 规则编辑，对话时自动注入系统提示词。

## 页面结构

```
列表态：Hero + 目标卡片网格（全局 + 各工作空间）
  ↓
编辑态：内嵌分栏编辑器（左 textarea 源码 / 右 Markdown 实时预览）
```

## 核心功能

- **目标卡片三态徽标**：已配置 / 未配置 / 目录失效（工作空间目录被删除等）
- **卡片摘要**：展示规则内容摘要
- **读取与保存**：`getRule` 读取、`saveRule` 保存；**清空保存 = 删除规则**
- **未保存保护**：dirty 圆点提示 + 离开确认
- **导出**：导出为 `.md` 文件（downloadText）
- **失效拦截**：目录失效的目标不可进入编辑

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| 规则文件（AGENTS.md） | 主进程文件（IPC `rulesTargets / getRule / saveRule`） |

规则随对话自动注入系统提示词，无需手动操作。
