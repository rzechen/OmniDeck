# 工具中心 · 文本 Text

> [← Deck 文档](README.md) · [工具中心设计](../overview.md#四工具中心配置驱动的工厂模式)

- **入口路由**：`/tools/text`（分类页），各工具见下表
- **源码位置**：[src/views/deck/tools/text/](../../src/views/deck/tools/text/)
- **注册表**：[tools.js](../../src/config/tools.js) `Text` 分类（主色 #722ED1）

## 分类定位

提供多表 VLookup 匹配、英文大小写转换、简繁火星文互转及在线白板绘画等文本编辑与处理功能。

## 工具清单（4）

| 工具 | 说明 | 路由 | 源文件 |
| --- | --- | --- | --- |
| VLookup | 多 Sheet 批量关联匹配，支持十万级数据 | `/tools/text/vlookup` | `vlookup.vue` |
| 大小写转换 | 文本转全大写或全小写，实时转换 | `/tools/text/uplowercase` | `uplowercase.vue` |
| 火星文转换 | 简体转繁体与火星文变体生成 | `/tools/text/to-mars` | `to-mars.vue` |
| 白板 | 基于 Canvas 的轻量白板，自由书写绘图 | `/tools/text/whiteboard` | `whiteboard.vue` |

## 实现

- **VLookup**：依赖 xlsx 解析多 Sheet，前端完成十万级数据关联匹配
- **火星文**：内置简繁 / 火星文字符映射表（`@/utils` 相关工具）
- **分类页**：`index.vue` 经 category-page 工厂渲染
