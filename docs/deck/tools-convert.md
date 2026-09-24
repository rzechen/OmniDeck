# 工具中心 · 转换 Convert

> [← Deck 文档](README.md) · [工具中心设计](../overview.md#四工具中心配置驱动的工厂模式)

- **入口路由**：`/tools/convert`（分类页），各工具见下表
- **源码位置**：[src/views/deck/tools/convert/](../../src/views/deck/tools/convert/)
- **注册表**：[tools.js](../../src/config/tools.js) `Convert` 分类（主色 #52C41A）

## 分类定位

涵盖正则测试、时间戳转换、JSON 与 Excel/SQL/YAML/XML 等格式互转，以及 JSON 转 Java/Go/TS 等各类语言代码生成，满足日常开发中的数据转换需求。

## 工具清单（12）

| 工具 | 说明 | 路由 | 源文件 |
| --- | --- | --- | --- |
| 正则表达式测试器 | 输入正则与测试文本，实时高亮匹配，内置常用示例 | `/tools/convert/regex` | `regex.vue` |
| JSON 转 Excel | JSON 数据解析为表格并导出 Excel 文件 | `/tools/convert/json-to-excel` | `json-to-excel.vue` |
| 时间戳转换 | 时间戳与时间格式互转，实时显示当前时间 | `/tools/convert/timestamp` | `timestamp.vue` |
| JSON 转 SQL | JSON 转 CREATE TABLE 与 INSERT 语句 | `/tools/convert/json-to-sql` | `json-to-sql.vue` |
| SQL 转 JSON | INSERT 语句解析为结构化 JSON | `/tools/convert/sql-to-json` | `sql-to-json.vue` |
| CSV 转 JSON | CSV 转 JSON，自动识别分隔符，支持文件导入 | `/tools/convert/csv-to-json` | `csv-to-json.vue` |
| JSON 转 YAML | JSON 与 YAML 无缝互转 | `/tools/convert/json-to-yaml` | `json-to-yaml.vue` |
| JSON 转 XML | JSON 与 XML 双向转换 | `/tools/convert/json-to-xml` | `json-to-xml.vue` |
| JSON 转 Java | 转 Java 类，支持嵌套对象与 getter/setter | `/tools/convert/json-to-java` | `json-to-java.vue` |
| JSON 转 Go | 转 Go 结构体，自动生成 JSON 标签和注释 | `/tools/convert/json-to-go` | `json-to-go.vue` |
| JSON 转 JavaScript | 转 JS 类，自动生成 getter/setter | `/tools/convert/json-to-js` | `json-to-js.vue` |
| JSON 转 TypeScript | 转 TS 接口，支持类型推断与可选字段 | `/tools/convert/json-to-ts` | `json-to-ts.vue` |

## 实现

- **代码生成共享逻辑**：JSON 转 Java / Go / JS / TS 四个工具复用 [code-gen-mixin.js](../../src/views/deck/tools/convert/code-gen-mixin.js)（类型推断、嵌套结构展开、命名风格转换等公共逻辑）
- **Excel 导出**：依赖 xlsx
- **分类页**：`index.vue` 经 category-page 工厂渲染
