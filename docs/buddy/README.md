# Buddy · AI 编程助手文档

> [← 返回文档中心](../README.md) · [全局总览](../overview.md)

Buddy 视图承载 AI 编程助手能力：基于 pi Coding Agent 的对话执行、本地工作空间读写与完整生态管理。侧边栏为任务列表（按会话展示名分组），主区顶部多页签（TagsBar）。

**IPC 统一入口**：渲染层经 [src/utils/buddy-api.js](../../src/utils/buddy-api.js) 取 `window.electronAPI.omnibuddy` 桥（`buddyApi()` / `buddyApiSection(name)`），通道在 [electron/agent/index.js](../../electron/agent/index.js) 统一注册（`omnibuddy:*`）。

| 功能 | 路由 | 文档 | 主进程模块 |
| --- | --- | --- | --- |
| 对话 | `/omnibuddy` | [chat.md](chat.md) | sessions / pi / llm / attachments / permissions / checkpoints / file-changes / sandbox |
| 工作空间 | `/omnibuddy/workspace` | [workspace.md](workspace.md) | files / workspaces |
| 模型供应商 | `/omnibuddy/providers` | [providers.md](providers.md) | llm（消费侧） |
| 连接器 | `/omnibuddy/mcp` | [mcp.md](mcp.md) | mcp / connectors / credentials |
| 技能 | `/omnibuddy/skills` | [skills.md](skills.md) | skills / credentials |
| 项目规则 | `/omnibuddy/rules` | [rules.md](rules.md) | rules |
| 记忆管理 | `/omnibuddy/memory` | [memory.md](memory.md) | memory |
| 能力清单 | `/omnibuddy/capabilities` | [capabilities.md](capabilities.md) | capabilities / runtime |
| 权限策略 | `/omnibuddy/permissions` | [permissions.md](permissions.md) | permissions |
| 资源市场 | `/omnibuddy/market` | [market.md](market.md) | market |
| 用量统计 | `/omnibuddy/usage` | [usage.md](usage.md) | usage |
| 设置 | `/omnibuddy/settings` | 与 Deck 视图复用 `views/shared/settings` | — |

## 数据存储汇总

| 数据 | 位置 |
| --- | --- |
| Provider 列表及若干 UI 偏好（providerId / workspace-link / 活跃空间） | IndexedDB |
| 会话 / 消息 / 检查点 | 主进程 pi 目录（agentDir） |
| MCP / 技能 / 规则 / 记忆 / 权限 / 市场安装态 / 用量明细 | 主进程文件（agentDir 下） |
| 凭证（API Key / MCP / Skill 凭据） | 系统钥匙串（safeStorage 加密，明文不回显） |

## 相关全局能力

- **快捷面板**（`/quick` 独立壳窗）：常驻 AI 会话小窗，复用对话组件，见 [chat.md](chat.md#四快捷面板-quick)
- **会话侧栏**（重命名 / 删除 / 导出）在 `src/layout/BuddyLayout.vue`，非对话页内
