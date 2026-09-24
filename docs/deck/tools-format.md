# 工具中心 · 格式化 Format

> [← Deck 文档](README.md) · [工具中心设计](../overview.md#四工具中心配置驱动的工厂模式)

- **入口路由**：`/tools/format`（分类页），各工具见下表
- **源码位置**：[src/views/deck/tools/format/](../../src/views/deck/tools/format/)
- **注册表**：[tools.js](../../src/config/tools.js) `Format` 分类（主色 #3366FF）

## 分类定位

提供 JSON、Markdown、YAML、CSS、SQL 等多种代码与数据格式的美化、压缩、校验与可视化能力，帮助开发者快速规范代码风格。

## 工具清单（6）

| 工具 | 说明 | 路由 | 源文件 |
| --- | --- | --- | --- |
| JSON 格式化 | JSON 编辑校验与树形可视化，支持错误定位与转义处理 | `/tools/format/json` | `json.vue` |
| Markdown 格式化 | 所见即所得编辑，支持公式与代码高亮，可导出 HTML | `/tools/format/markdown` | `markdown.vue` |
| YAML 格式化 | YAML 与 XML 格式的美化、压缩与语法校验 | `/tools/format/yaml` | `yaml.vue` |
| CSS 格式化 | CSS 自动格式化与压缩，支持高亮与折叠 | `/tools/format/css` | `css.vue` |
| SQL 格式化 | 多种 SQL 方言的格式化与压缩，支持高亮 | `/tools/format/sql` | `sql.vue` |
| 变量名格式化 | 驼峰、帕斯卡、下划线、中横线等命名规范互转 | `/tools/format/var-name` | `var-name.vue` |

## 实现

- **分类页**：`index.vue` 仅两行，经 [category-page.js](../../src/views/deck/tools/category-page.js) 工厂按注册表渲染
- **编辑器**：代码类工具（JSON / CSS / SQL）复用 `components/tool/CodeEditor.vue`（CodeMirror 5）
- **依赖组件**：js-yaml（YAML）、js-beautify（CSS）、sql-formatter（SQL）、markdown-it + KaTeX + highlight.js（Markdown）
