# 连接器 MCP

> [← Buddy 文档](README.md)

- **入口路由**：`/omnibuddy/mcp`
- **源码位置**：[src/views/buddy/mcp/index.vue](../../src/views/buddy/mcp/index.vue)
- **子组件**：McpCard、McpFormDialog
- **主进程模块**：mcp.js / connectors.js / credentials.js

## 功能定位

MCP Server 接入管理：自定义 stdio / Streamable HTTP 两种传输的连接器增删改查与凭证配置。

## 页面结构

```
Hero 说明区
  ↓
McpCard 网格
+ McpFormDialog（新增 / 编辑）
+ Token 凭证引导弹窗
```

## 核心功能

- **新增 / 编辑**：
  - stdio 类型：命令 / 参数 / 环境变量
  - http 类型：URL / 请求头
- **启用开关**：卡片级开关，全量保存、失败自动回滚
- **连接管理**：connect / disconnect；编辑、删除（确认）
- **凭证引导**：按 `credentialSpec` 拉取规格；Notion 类走 `OPENAPI_MCP_HEADERS` JSON 配置；凭证经 `credentials.create` 写入系统钥匙串加密存储

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| 连接器配置 | IPC `mcp.list / mcp.save`（主进程本地文件，全量保存） |
| 凭证 | IPC `credentials.create` → 系统钥匙串（加密） |
| 连接状态 | IPC `connectors.*` |

## 依赖

主进程基于 pi-mcp-adapter 适配 MCP 协议。
