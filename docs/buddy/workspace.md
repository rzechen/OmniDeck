# 工作空间 Workspace

> [← Buddy 文档](README.md)

![工作空间](../img/buddy-workspace.png)

- **入口路由**：`/omnibuddy/workspace`
- **源码位置**：[src/views/buddy/workspace/index.vue](../../src/views/buddy/workspace/index.vue)
- **子组件**：SpaceToolbar / SpaceCrumbs / SpaceGrid / SpaceList / SpaceContextMenu / SpaceFilePreview / SpaceBlank / SpaceRuleDialog（`components/buddy/space/`）
- **主进程模块**：files.js / workspaces.js

## 功能定位

网盘风格管理对话中登记的本地磁盘目录：Agent 工作区文件的浏览、编辑与上下传。

## 页面结构

```
工具栏（空间下拉 / 视图切换 / 隐藏项 / 搜索 / 新建文件夹·文件 / 导入 / 空间规则 / 刷新 / 解绑）
  ↓
面包屑（SpaceCrumbs）
  ↓
主体（网格 SpaceGrid / 列表 SpaceList）+ 右键菜单 + 预览编辑层 + 拖拽遮罩
+ 空间规则弹窗（SpaceRuleDialog）
```

## 核心功能

- **多空间切换**：下拉切换已登记工作空间，记住选中（IndexedDB `buddyActiveWorkspaceId`）
- **浏览**：网格 / 列表视图切换；显示 / 隐藏隐藏项；关键字过滤
- **新建**：新建文件夹 / 文件（$prompt 输入名）
- **导入**：对话框选择导入与拖拽导入（`getPathForFile` 取本地路径）
- **文件操作**：重命名、移到废纸篓（二次确认）、Finder 中显示（reveal）、系统打开
- **空间规则**：工具栏「空间规则」按钮打开 SpaceRuleDialog，编辑当前空间的 `AGENTS.md`（仅该空间对话生效，复用 RuleEditor 组件，详见 [rules.md](rules.md)）
- **预览编辑**：文本文件在线预览编辑（read / write）；二进制 / 超大文件转系统打开
- **右键菜单**：Esc 关闭

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| 活跃空间 | IndexedDB `buddyActiveWorkspaceId` |
| 文件系统操作 | IPC `omnibuddy.files` 子桥：list / mkdir / createFile / rename / trash / read / write / reveal / open / importDialog / importPaths |
| 空间登记 | `listWorkspaces`（主进程） |
