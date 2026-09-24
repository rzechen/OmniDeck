# 剪贴板与截图 Clipboard

> [← Deck 文档](README.md)

![剪贴板管理](../img/deck-clipboard.png)
![截图与贴图快面板](../img/global-capture.png)

- **入口路由**：`/clipboard`（后台常驻能力的管理页，与工具集"打开即用"定位不同，作为一级入口）
- **源码位置**：[src/views/deck/clipboard/index.vue](../../src/views/deck/clipboard/index.vue)、[electron/windows/capture.js](../../electron/windows/capture.js)、[src/views/shell/capture-*](../../src/views/shell/)、[native/windows.cpp](../../native/windows.cpp)（Windows 窗口枚举 NAPI）
- **依赖**：ToolShell 外壳

## 功能定位

全局剪贴板记录 + 截图记录的统一时间线，承载整套截图链路（选区 / 标注 / 贴屏 / 长截图）。

## 一、统一历史时间线

单一 history 列表混合三种条目，按日期分组（今天 / 昨天 / M月D日，sticky 组头），每页 40 条滚动加载：

| 条目 | 标记 |
| --- | --- |
| 文本（`kind:'text'`） | — |
| 图片（`kind:'image'` + `source:'capture'`） | 「截图」 |
| 长图（`kind:'scroll'`） | 「长图」 |
| 其他图片 | 「图片」 |

核心交互：

- 关键字搜索（文本按内容、图片按标签）
- 行点击：文本弹详情（等宽 pre 保留换行）、图片直接复制
- 图片缩略图点击弹大图（懒加载原图 dataURL），footer 复制 / 另存
- 每条操作：复制 / 收藏星标切换 / 另存 PNG / 删除；收藏满 500 提示
- 清空全部；2 秒轮询 + 窗口聚焦即时刷新

## 二、截图链路（多窗协作）

### 快捷键（globalShortcut，可改键，存 `userData/capture-settings.json`）

| 操作 | 默认快捷键 |
| --- | --- |
| 选区截图 | ⌘⇧S（CommandOrControl+Shift+S） |
| 全屏截图 | ⌥⇧3 |
| 长截图 | ⌥⇧S |

### 选区 → 标注 → 出图

```
captureArea → 每屏铺一个透明置顶 overlay 窗（#/capture-overlay?d=<displayId>）
  ├─ picking：400ms 轮询 capture-overlay:context 获取本屏窗口列表
  │    （mac 经 NAPI CGWindowList 取 z 序）→ hover 窗口拾取 + 光标下窗口默认选中
  │    拖拽框选 / 空格锁定窗口 / Enter 或单击截取 / Esc 右键取消
  ├─ freeze：capture-overlay:freeze 抓整屏定格帧
  │    （优先 ScreenCaptureKit 排除自身进程；回退 desktopCapturer 临时隐藏 overlay）
  └─ editing：定格帧背景 + 选区 Canvas 标注
       矩形/椭圆/直线/箭头/画笔/高亮/序号/马赛克/文字，7 色 × 3 粗细 × 3 字号
       ⌘Z / ⌘⇧Z / ⌘Y 撤销重做，8 手柄缩放 + 边界环移动，R 键重选
  → capture-overlay:done 回传：confirm（复制+入库）/ pin（贴屏）/ cancel
```

### 贴屏 capture-pin

- 置顶透明小窗（`#/capture-pin?id=`），初始贴原选区位置（≤60% 屏）
- 整窗拖动（app-region:drag）、滚轮 / 按钮缩放（主进程 `setContentSize`，120×80 下限）、双击 / 叉关闭
- 同屏可贴多张

### 长截图 capture-scroll-ctrl

```
⌥⇧S → overlay 以 m=scroll 打开，选完直接回传 rect（无编辑态）
  → 主进程拍首帧 → 选区下方弹 208×44 控制条（空间不足贴上方）
  → 用户滚动内容后点「拍一帧」（计数含首帧）
  → 「完成」：相邻帧按重叠行像素签名匹配拼接（stitchFrames）→ 入库 + 自动复制
  → 「取消」/ Esc 丢弃全部帧
```

## 三、数据与存储

```
主进程内存池（截图 50 条上限 / 剪贴板默认 1000 可设 50-2000，超量淘汰）
  ├─ 剪贴板轮询：1s 采样，记录文本（≤100KB）/ 图片 / Finder 文件路径
  ├─ 历史接口：capture.historyList / historyCopy / historyRemove / historyClear / historyData / historySaveAs
  ├─ 收藏接口：captureFav.add / remove / ids（独立池，上限 500，整份 PNG）
  └─ 持久化：经主窗渲染端桥（main:capture-sync 推送 + capture:restore 启动恢复）
        → 写 IndexedDB captures / clips store
```

原则：所有截图自动复制进系统剪贴板并进入统一历史；原图按 refId 存截图池，不双份占盘。
