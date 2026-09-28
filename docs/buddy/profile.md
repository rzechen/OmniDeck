# 我的资料 Profile

> [← Buddy 文档](README.md)

- **入口路由**：`/omnibuddy/profile`
- **源码位置**：[src/views/buddy/profile/index.vue](../../src/views/buddy/profile/index.vue)
- **子组件**：RuleEditor、AiCredentialDialog（`components/buddy/`）
- **主进程模块**：profile.js / credentials.js / rules.js

## 功能定位

结构化个人背景 + 凭据中心 + 全局规则，三块合为一页（资料 = 用户事实 / 规则 = 行为指令 / 记忆 = 过程性记忆，三分互补）。

## 页面结构

```
Hero（已录 N 项徽标 + 保存/刷新）
  ↓
三页签：基本信息 / 我的凭据 / 全局规则（页签角标显示已配置状态）
```

## 核心功能

### 基本信息

- **左右分栏**：左列固定预设字段（姓名 / 公司 / 工号 / 部门 / 职务 / 常用项目 / 工作习惯），右列自定义条目（动态增删，值支持多行文本）
- **注入机制**：任一字段非空即生成系统提示词块（`## 用户资料（已提前录入，直接使用，无需向用户重复询问）`）每轮确定性注入；保存后新对话生效
- 窄屏（<960px）回退单列

### 我的凭据

- **凭据卡片网格**：紧凑自适应列数；卡片展示名称 / 说明 / 键名标签 / 技能绑定徽标（连接器类凭据归 [连接器](mcp.md) 页管理，此处不展示）
- **编辑弹窗（AiCredentialDialog）**：
  - 键值对行编辑（密码框；编辑态值留空 = 保持原值）
  - **绑定技能**多选：勾选后凭据以环境变量注入所选技能的执行环境；按技能声明的 envKeys 一键补齐
  - 对话中可经 `credential_get` 按名取用（见 [能力清单](capabilities.md) 凭据取用），统一由权限策略管控
  - 加密存储（safeStorage 系统钥匙串），明文不回显；保存后销毁 pi 会话、新对话生效

### 全局规则

- 对 AI 行为的全局指令（`AGENTS.md`），所有对话生效（原独立「项目规则」页收编至此）
- 空状态 → 点开内嵌 [RuleEditor](rules.md)：左源码 / 右 Markdown 实时预览，**清空保存 = 删除规则**
- 支持导出 `全局规则.md`
- 工作空间级规则入口在工作空间页工具栏（见 [workspace.md](workspace.md)）

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| 用户资料 | IPC `profileGet / profileSave` → 主进程 `<agentDir>/profile.json` |
| 凭据 | IPC `credentials.*` → safeStorage 加密落盘（`credentials.json`，权限 0600） |
| 全局规则 | IPC `rulesTargets / getRule / saveRule` → AGENTS.md |
