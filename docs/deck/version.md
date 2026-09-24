# 版本更新 Version

> [← Deck 文档](README.md)

- **入口路由**：`/version`
- **源码位置**：[src/views/deck/version/index.vue](../../src/views/deck/version/index.vue)、[electron/core/updater.js](../../electron/core/updater.js)
- **更新源**：GitCode Releases（generic provider，`package.json → build.publish`）

## 功能定位

版本信息展示、软件更新检测与安装、更新记录时间线。

## 页面结构

```
Hero（logo / 版本号 / slogan）
  ↓
软件更新卡（检测结果 + 操作）
  ↓
更新记录时间线（@/config/app 内置 changelog）
```

## 核心功能

- **静默检查**：进页先展示上次缓存结果，再静默检查最新版本
- **更新说明清洗**：Release body 逐行清洗（≤30 行）
- **双通道更新**：
  - 全自动（Windows）：下载进度条 + MB/s 速度，下载完成重启安装
  - 引导下载（mac 等）：跳转 GitCode Releases 页面
- **断点续传进度**：订阅 `updater.onDownloadState` 恢复下载进度展示
- **手动检查**：按钮触发并消息反馈结果
- **跳过版本**：「下次再说」跳过当前版本，不再重复提示
- **新版本通知**：App.vue 监听 `updater.onAvailable` 弹系统通知，点击跳转 `/version`

## 数据与存储

| 数据 | 通道 |
| --- | --- |
| 上次检查结果 / 跳过的版本 | IPC `updater.lastResult / check / download / install / openDownload / skip / onDownloadState`（主进程管理） |
| 更新记录 | `@/config/app` 内置 changelog（随包分发） |
