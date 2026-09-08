# OmniBuddy Agent 能力移植设计方案

> 目标：将 `risen-autonomous-agent`（多用户服务端 Agent 平台）的核心能力移植到 OmniDeck 桌面端的 OmniBuddy 模块（单用户、本地运行），并优先复用 pi 社区生态（https://pi.dev/packages）替代自研组件。

---

## 一、现状分析

### 1.1 两端架构差异

| 维度 | risen-autonomous-agent（源） | OmniDeck / OmniBuddy（目标） |
|---|---|---|
| 形态 | 独立 Express 微服务（多用户） | Electron 桌面应用（单用户本地） |
| Agent 内核 | `@earendil-works/pi-coding-agent` SDK | 无 |
| 通信 | HTTP REST + SSE 远程推送 | Electron IPC（渲染进程 ↔ 主进程） |
| 存储 | 服务端文件系统（JSONL 会话日志 + JSON 元数据） | localStorage（`src/utils/db.js`） |
| 前端 | Vue 2.7 独立聊天前端（axios + SSE） | OmniBuddy UI 骨架已就绪（BuddyLayout 空间/会话列表、BuddyComposer 输入框），对话为占位页 |
| 沙箱 | `@anthropic-ai/sandbox-runtime` | 无 |

### 1.2 源项目自研模块清单（移植评估）

| 自研模块 | 功能 | 移植结论 |
|---|---|---|
| session-manager / session-events / branch-view | 会话生命周期、JSONL 事件日志、分支/回退 | **大幅简化**：单用户无需多用户隔离；分支/回退列为二期特性 |
| agent-factory / AgentProfile / capability | Agent 档案与工具权限 | **简化**：桌面端先做单一默认 Agent + 模型切换 |
| tool-registry / tool-guard / tool-validation | 16 工具注册与安全校验 | **用 pi 社区方案替代**（见第三节） |
| extensions/mcp（连接池/工具缓存/MCP Apps） | MCP 支持 | **用 pi-mcp-adapter 替代**；MCP Apps 渲染协议可保留前端部分 |
| extensions/python、node、curl、sandbox | 沙箱执行 | sandbox-runtime **保留**（pi 官方配套）；curl 用 pi-web-access 替代 |
| extensions/ask-user、use-skill、user-agents | 交互反问 / 技能加载 | **用社区包替代** |
| services/sse | SSE 推送 | **废弃**，改 IPC 事件流 |
| services/audit、workspace、skills、agents、llm-config | 审计 / 工作空间 / 技能 / 配置 | 精简后保留于本地 |

---

## 二、目标架构

```
┌────────────────────────── OmniDeck (Electron) ──────────────────────────┐
│  渲染进程 (Vue 2.7)                                                      │
│  OmniBuddy UI（已有 BuddyLayout / chat.vue / settings.vue）              │
│    ├─ 会话/空间管理（localStorage → 迁移到本地文件）                       │
│    ├─ 消息流渲染（Markdown / 工具调用卡片 / ask-user 表单）                │
│    └─ preload 暴露 window.omnibuddy API（IPC 封装，替换 axios/SSE）       │
│                            │ IPC（invoke + 事件流）                       │
│  主进程 (electron/main.js 扩展，或独立 agent 子进程)                      │
│    ├─ AgentService：基于 pi-coding-agent SDK 构建 Agent                   │
│    ├─ SessionService：本地 JSONL 会话持久化（userData 目录）              │
│    ├─ SkillsService：本地 skills 目录扫描（SKILL.md，渐进式加载）          │
│    └─ 沙箱执行（sandbox-runtime，可选开启）                                │
└──────────────────────────────────────────────────────────────────────────┘
```

关键决策：
1. **不引入独立后端服务**。Agent 运行时放进 Electron 主进程（重型执行放 utilityProcess/子进程，避免阻塞主进程）。
2. **通信协议从 HTTP+SSE 改为 IPC**：请求用 `ipcRenderer.invoke`，流式事件（消息增量、工具调用、状态）用主进程 `webContents.send` 推送，语义与原 SSE 事件一一映射，前端处理逻辑可平移。
3. **存储迁移**：会话数据（JSONL + 元数据）写入 `app.getPath('userData')/omnibuddy/`；localStorage 仅保留 UI 偏好。
4. **保留"不可变追加日志 + 事件溯源"理念**：这是会话回放、分支回退的基础，且 pi SDK 本身有 session 持久化能力，优先基于 SDK 的 session API 实现。

---

## 三、自研 vs pi 社区包替代方案

优先级原则：**pi 社区有成熟包的，不自研**。

| 能力 | 原自研 | 替代方案（pi 社区） | 说明 |
|---|---|---|---|
| MCP 接入 | extensions/mcp | **`pi-mcp-adapter`**（1.4K/mo，下载量第一） | 标准扩展，直接 `pi install`，覆盖连接管理与工具注入；自研连接池/缓存废弃 |
| SubAgents / 多智能体 | 自研 SubAgents 委派 | **`pi-subagents`**（nicopreme，362.5K/mo）或 `@tintinweb/pi-subagents` | 单 Agent 委派 + 多 Agent 工作流均覆盖 |
| Web 搜索 / 抓取 | extensions/curl | **`pi-web-access`**（401K/mo） | 搜索 + URL 抓取 + PDF 提取，多 provider；替代自研 curl 工具 |
| 反问用户 | extensions/ask-user | **`@juicesharp/rpiv-ask-user-question`**（117K/mo） | 结构化选项问卷，与前端表单渲染天然对接 |
| 任务清单（Todo） | 前端 TodoPanel | **`@juicesharp/rpiv-todo`**（98.9K/mo） | 模型侧 todo 工具 + 存活压缩的重绘，前端只需渲染 |
| 长期记忆 | 无（上下文压缩自研） | **`pi-memory`** 或 `pi-hermes-memory`（二期） | 语义记忆 + 日志检索 |
| 权限/安全拦截 | tool-guard / tool-validation | **`@gotgenes/pi-permission-system`** + `cc-safety-net` | 工具执行权限控制；配合 sandbox-runtime 双保险 |
| Plan/审查模式 | 无 | `@narumitw/pi-plan-mode` 等（二期按需） | — |
| Skills 系统 | services/skills + use-skill 扩展 | **pi 原生 skills 机制**（SKILL.md、`pi install npm:<skill包>`） | pi 本身支持 skill 包格式，自研部分仅保留"本地 skills 目录扫描 + 设置页管理 UI" |
| 沙箱执行 | sandbox-runtime 集成 | **保留 `@anthropic-ai/sandbox-runtime`** | 这是 pi 官方配套，非自研，继续使用 |
| 会话/分支/回退 | 自研 branch-view 等 | pi SDK session + **少量自研薄层** | 社区无完整等价物；基于 SDK 的 session 重放实现，二期交付 |

---

## 四、移植工作分解

### 阶段一：MVP —— 能对话、能执行工具（先行）
1. **Agent 运行时落地（后端→主进程）**
   - 新增 `electron/agent/` 模块：用 `@earendil-works/pi-coding-agent` SDK 创建 Agent（参考 risen 的 `agent-factory`，裁剪多用户逻辑）。
   - LLM 配置（provider、apiKey、模型）读取自本地配置文件，设置页（settings.vue）提供编辑。
2. **IPC 通道设计**
   - `omnibuddy:session.create / send / interrupt / list / delete`
   - 流式事件：`omnibuddy:event`（message_delta、tool_call、tool_result、done、error），对齐原 SSE 事件模型。
3. **会话持久化**
   - JSONL 追加日志 + 会话元数据，存 `userData/omnibuddy/sessions/`（参考 risen session-manager，去掉多用户路由）。
4. **前端接入**
   - chat.vue 从占位页改为真实对话：通过 preload 暴露的 API 收发；Markdown 渲染（可复用 marked 方案）。
   - BuddyLayout 侧边栏数据源从 localStorage 迁到本地会话列表。

### 阶段二：工具与扩展生态
1. 集成社区包：`pi-mcp-adapter`、`pi-web-access`、`pi-subagents`、`rpiv-ask-user-question`、`rpiv-todo`、`pi-permission-system`。
2. 沙箱执行开关（sandbox-runtime），设置页可选"沙箱模式/直接执行"。
3. 前端：工具调用卡片、ask-user 表单渲染、Todo 面板（对接 rpiv-todo）。
4. Skills：本地 skills 目录 + 设置页安装/管理（`pi install npm:<pkg>` 的 UI 化）。

### 阶段三：差异化特性（按需）
1. 会话分支 / 回退 / 重放（基于 JSONL 事件溯源，移植 branch-view 精简版）。
2. 工作空间面板（文件列表 / Diff 查看，移植 workspace 服务精简版）。
3. MCP Apps 交互原语渲染（如需保留此产品能力）。
4. 长期记忆（pi-memory）。

### 明确不移植的部分
- 多用户隔离、审计服务、tsoa/OpenAPI 层、Express 路由层、SSE 服务 —— 桌面单用户 + IPC 场景下无意义。
- 自研 MCP 连接池/工具缓存 —— pi-mcp-adapter 覆盖。
- 自研 curl/ask-user/subagent 扩展 —— 社区包覆盖。

---

## 五、风险与注意事项

| 风险 | 应对 |
|---|---|
| pi SDK 以 ESM/TS 为主，Electron 主进程为 CommonJS | 主进程用动态 `import()` 加载；或 Agent 放 utilityProcess 子进程（Node ESM 原生支持） |
| Vue 2.7 前端生态老旧（无现成 SSE 替代） | IPC 事件流语义与 SSE 对齐，逻辑可平移；Markdown 用 marked（risen 前端同款，经验可复用） |
| 社区包质量参差 | 只采用高下载量/活跃维护的包（上表均已核对下载量），并锁定版本；沙箱 + 权限扩展双保险 |
| 打包体积（sandbox-runtime、python 环境） | 沙箱与 Python/Node 执行做成可选下载项，不进默认安装包 |
| risen 的 pi SDK 版本与社区包版本兼容性 | 移植前核对 SDK 版本矩阵，统一升级到 pi 当前稳定线 |

---

## 六、里程碑建议

| 里程碑 | 交付物 |
|---|---|
| M1 | 主进程 Agent 运行时 + IPC 通道 + 基础对话 + 会话持久化 |
| M2 | 社区扩展集成（MCP、web、subagents、ask-user、todo、权限）+ 前端对应渲染 |
| M3 | 沙箱执行、Skills 管理 UI、工作空间面板 |
| M4 | 分支/回退、MCP Apps、长期记忆（按需裁剪） |
