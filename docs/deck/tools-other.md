# 工具中心 · 其它 Other

> [← Deck 文档](README.md) · [工具中心设计](../overview.md#四工具中心配置驱动的工厂模式)

- **入口路由**：`/tools/other`（分类页），各工具见下表
- **源码位置**：[src/views/deck/tools/other/](../../src/views/deck/tools/other/)
- **注册表**：[tools.js](../../src/config/tools.js) `Other` 分类（主色 #FAAD14）

## 分类定位

提供可视化 API 调试、Cron 表达式生成、抛硬币抽奖等趣味工具，以及 HTTP 状态码与方法、ASCII 字符、端口事件、UA 解析等开发文档速查功能。

## 工具清单（17）

| 工具 | 说明 | 路由 | 源文件 |
| --- | --- | --- | --- |
| API 调试 | 批量数据驱动的接口链式执行，支持变量传递 | `/tools/other/api` | `api.vue` |
| Cron 表达式 | 可视化配置定时任务字段，实时预览执行时间 | `/tools/other/cron` | `cron.vue` |
| 抛硬币 | 随机抛硬币模拟器，统计正反面概率 | `/tools/other/coin-flip` | `coin-flip.vue` |
| 抽奖 | 自定义奖项的年会抽奖系统 | `/tools/other/lottery` | `lottery.vue` |
| 世界时钟 | 多城市实时时间，支持拖拽排序与搜索添加 | `/tools/other/world-clock` | `world-clock.vue` |
| HTTP 状态码 | 1xx 到 5xx 全部状态码及中文说明 | `/tools/other/http-status` | `http-status.vue` |
| HTTP 方法 | 标准及 WebDAV 扩展 HTTP 方法说明 | `/tools/other/http-method` | `http-method.vue` |
| 扩展 ASCII | Latin-1 特殊字符的 Unicode 与 HTML 实体 | `/tools/other/eascii` | `eascii.vue` |
| 键盘符号 | 编程符号中英文名称对照表 | `/tools/other/keyboard-symbol` | `keyboard-symbol.vue` |
| TCP/UDP 端口 | 常用端口与服务说明速查 | `/tools/other/tcp-udp` | `tcp-udp.vue` |
| JS 事件 | 常见 DOM 与浏览器事件分类整理 | `/tools/other/js-events` | `js-events.vue` |
| User-Agent | 主流浏览器典型 UA 字符串速查 | `/tools/other/user-agent` | `user-agent.vue` |
| 特殊符号 | 符号中英文俗称与标准名称对照 | `/tools/other/special-symbol` | `special-symbol.vue` |
| Word 快捷键 | Word 常用快捷键查询，支持双平台 | `/tools/other/word-shortcut` | `word-shortcut.vue` |
| Excel 快捷键 | Excel 常用快捷键查询 | `/tools/other/excel-shortcut` | `excel-shortcut.vue` |
| IP 查询 | 查询公网 IP 地理位置与运营商信息 | `/tools/other/ip-query` | `ip-query.vue` |
| DNS 查询 | 国内外主流公共 DNS 服务器清单 | `/tools/other/dns` | `dns.vue` |

## 实现

- **API 调试**：批量数据驱动接口链式执行，前序响应变量可注入后续请求
- **世界时钟**：vuedraggable 拖拽排序，城市搜索添加
- **速查类**：状态码 / 方法 / 端口 / UA / 快捷键等内置数据表离线查询
- **在线类**：IP 查询需网络；其余均离线
- **分类页**：`index.vue` 经 category-page 工厂渲染
