# 权限策略 Permissions

> [← Buddy 文档](README.md)

- **入口路由**：`/omnibuddy/permissions`
- **源码位置**：[src/views/buddy/permissions/index.vue](../../src/views/buddy/permissions/index.vue)
- **主进程模块**：permissions.js

## 功能定位

pi-permission-system `config.json` 的表单化编辑：控制 Agent 工具调用 / 文件写入等敏感操作的授权规则。

## 页面结构

```
Hero（保存按钮，isDirty 控制可用态）
  ↓
4 张预设卡（只读 / 严格 / 平衡推荐 / 宽松）
  ↓
规则明细表（行式编辑：对象下拉 / 匹配模式输入 / 动作下拉 / 删除）
```

## 核心功能

- **预设一键填充**：4 套内置规则集（DEFAULT_ROWS 等）点击即填；手动修改后预设高亮自动清除
- **规则行编辑**：添加 / 删除规则行
- **对象下拉**：选项来自能力清单分组 + 特殊面，支持 allow-create 手动输入
- **序列化约定**：同一 surface 下单条 `*` 规则 → 标量；多条 → 对象结构
- **保存约束**：`savePermissionConfig` 固定写入 `yoloMode: false`、`authorizerChain: ['omnibuddy-ui']`

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| 权限配置 | 主进程 `agentDir/extensions/pi-permission-system/config.json`（另有 permission-mode.json） |
| 读写 | IPC `permissionConfig / savePermissionConfig / capabilityList` |

> 对话中的权限确认浮动条（仅本次 / 本会话 / 始终 / 拒绝）与权限模式切换见 [chat.md](chat.md#核心功能)。
