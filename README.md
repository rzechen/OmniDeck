# OmniDeck · core（私有）

OmniDeck 的**核心仓**：Electron 主进程与 Agent 引擎源码。

- 工作区布局：`OmniDeck/deck`（公开仓：界面层 / 工具箱 / 文档 / Release 制品）+ `OmniDeck/core`（本仓）
- 远端：gitcode `m0_59492087/OmniDeckCore` / github `rzechen/OmniDeckCore`
- 本仓**不得公开**。内容按 OmniDeck LICENSE 第一部分（PolyForm Noncommercial 1.0.0）授权，版权归项目作者。

## 结构

与公开仓保持**相同的相对路径**，发版脚本按路径覆盖合入：

```
core/
├── electron/               # Electron 主进程（全部）
│   ├── main.js             # 主入口
│   ├── preload.js          # contextBridge
│   ├── agent/              # OmniBuddy Agent 引擎
│   ├── core/               # 更新 / 依赖预检
│   ├── services/           # 壁纸拉取
│   └── windows/            # 截图 / 快面板
├── src/config/remote.cjs   # 远程源配置
└── sync.sh                 # 与 deck 工作区双向同步（push/pull/diff）
```

## 提交去向（一句话）

`electron/**` 与 `src/config/remote.cjs` → **core（本仓）**；其余一切 → **deck**。
deck 的 `.gitignore` 已排除核心路径，方向搞错也不会污染公开仓历史。

## 发版流程

1. 本仓改核心代码 → 提交推送
2. deck 仓 `bash scripts/release-upload.sh v0.x.0 mac|win|all [gitcode|github|all]`
   - 脚本自动将本仓文件覆盖合入 deck 工作区（`OMNIDECK_CORE_DIR` 缺省 `../core`）
   - 打包并将制品上传到公开仓 Release
3. deck 工作区的合入文件已被其 `.gitignore` 排除，不会被提交

## 日常开发

- 在 deck 工作区直接改（包括核心文件），开发体验与单仓一致
- 提交前在本仓跑 `./sync.sh pull` 收集核心文件改动 → 在本仓提交推送
- 或先在本仓改再 `./sync.sh push` 合入 deck 工作区
- deck 若改了 `vite.config.js` / `package.json`（依赖变化），本仓需同步知晓
