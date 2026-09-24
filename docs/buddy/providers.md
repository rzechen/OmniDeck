# 模型供应商 Providers

> [← Buddy 文档](README.md)

- **入口路由**：`/omnibuddy/providers`
- **源码位置**：[src/views/buddy/providers/index.vue](../../src/views/buddy/providers/index.vue)
- **子组件**：ProviderCard、ProviderFormDialog
- **主进程模块**：无独立模块（发送时由 agent/llm.js 消费）

## 功能定位

模型接入配置的增删改查：多 Provider 管理，OpenAI / Anthropic 两种 API 格式。

## 页面结构

```
Hero 说明区
  ↓
ProviderCard 卡片网格
+ 新建 / 编辑弹窗（ProviderFormDialog）
```

## 核心功能

- **新建 / 编辑**：名称、API 格式（OpenAI / Anthropic）、baseUrl、模型列表、显示名、apiKey
- **连接测试**：保存前发起真实请求测试连通性（ProviderFormDialog.testConnection），失败阻止保存
- **默认供应商**：一键设为默认
- **删除**：二次确认；删除默认项时自动转移默认
- **兼容迁移**：旧 ollama 类型自动迁移为 custom

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| Provider 列表（含 apiKey） | IndexedDB `aiProviderList`（getItem / setItem），**无 IPC**，纯前端存储 |

> 与其他 Buddy 模块不同，本页数据完全在渲染进程 IndexedDB；apiKey 明文存于本地 IndexedDB（后续可演进为钥匙串，见 [mcp.md](mcp.md) / [skills.md](skills.md) 的凭证方案）。
