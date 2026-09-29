# OmniDeck-core（私有）

OmniDeck 的**闭源核心仓**：Electron 主进程与 Agent 引擎源码。

- 上游公开仓：https://gitcode.com/m0_59492087/OmniDeck （界面层 / 工具箱 / 文档 / Release 制品）
- 本仓**不得公开**。内容按 OmniDeck LICENSE 第一部分（PolyForm Noncommercial 1.0.0）授权，版权归项目作者。

## 结构

与公开仓保持**相同的相对路径**，发版脚本按路径覆盖合入：

```
OmniDeck-core/
├── electron/               # Electron 主进程（全部）
│   ├── main.js             # 主入口
│   ├── preload.js          # contextBridge
│   ├── agent/              # OmniBuddy Agent 引擎
│   ├── core/               # 更新 / 依赖预检
│   ├── services/           # 壁纸拉取
│   └── windows/            # 截图 / 快面板
└── src/config/remote.cjs   # 远程源配置
```

## 发版流程（open-core）

1. 本仓改核心代码 → 提交推送
2. 公开仓 `bash scripts/release-upload.sh v0.x.0 mac|win|all [gitcode|github|all]`
   - 脚本自动将本仓文件覆盖合入公开仓工作区（`OMNIDECK_CORE_DIR` 缺省 `../OmniDeck-core`）
   - 打包并将制品上传到公开仓 Release
3. 公开仓的合入文件已被 `.git/info/exclude` 排除，**不要提交到公开仓**

## 日常开发

在本仓改核心代码后，可在公开仓直接 `npm run dev`（脚本未合入时先手动跑一次
`release-upload.sh local`，或直接 `cp` 对应文件），vite 会正常构建 `electron/`。

## 同步纪律

- 核心文件**只在私有仓改**，公开仓不再维护 `electron/` 与 `src/config/remote.cjs`
- 公开仓若改了 `vite.config.js` / `package.json`（依赖变化），本仓需同步知晓
