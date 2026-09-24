# Deck · 开发者工具箱文档

> [← 返回文档中心](../README.md) · [全局总览](../overview.md)

Deck 视图面向"打开即用"的工具场景，侧边栏为工具集 + 理财分组（可拖拽排序），主区多页签。

| 功能 | 路由 | 文档 |
| --- | --- | --- |
| 首页仪表盘 | `/home` | [home.md](home.md) |
| 我的收藏 | `/favorites` | [favorites.md](favorites.md) |
| 我的代办 | `/todo` | [todo.md](todo.md) |
| 剪贴板（剪贴板记录 + 截图记录 + 截图链路） | `/clipboard` | [clipboard.md](clipboard.md) |
| 快捷搜索 | `/search` | [search.md](search.md) |
| 版本更新 | `/version` | [version.md](version.md) |
| 问题反馈 | `/feedback` | [feedback.md](feedback.md) |
| 理财看板（基金 / 详情 / 黄金） | `/finance/*` | [finance.md](finance.md) |

## 工具中心（8 分类 · 74 工具）

配置驱动的工厂模式（注册表 [tools.js](../../src/config/tools.js) + 分类页工厂 [category-page.js](../../src/views/deck/tools/category-page.js)），详见[全局总览 · 工具中心](../overview.md#四工具中心配置驱动的工厂模式)。

| 分类 | 工具数 | 文档 |
| --- | --- | --- |
| 格式化 Format | 6 | [tools-format.md](tools-format.md) |
| 转换 Convert | 12 | [tools-convert.md](tools-convert.md) |
| 换算 Unit | 9 | [tools-unit.md](tools-unit.md) |
| 加密 Encrypt | 6 | [tools-encrypt.md](tools-encrypt.md) |
| 图像 Image | 8 | [tools-image.md](tools-image.md) |
| 文本 Text | 4 | [tools-text.md](tools-text.md) |
| 生活 Life | 12 | [tools-life.md](tools-life.md) |
| 其它 Other | 17 | [tools-other.md](tools-other.md) |

## 共性设计

- **工具页骨架**：工具页统一复用 `components/tool/` 下骨架组件——`ToolShell`（标题/工具栏/状态栏外壳）、`CodeEditor`（CodeMirror 编辑器）、`ImageDrop`（拖拽传图）、`DocList`、`UnitConverter`、`ToolHistoryPanel`（工具历史记录）
- **数据本地化**：全部工具离线运行，过程数据不落盘或仅存 IndexedDB 工具历史
- **收藏联动**：工具可收藏进「我的收藏」（IndexedDB `toolFavorites`），与首页收藏卡数量联动
