# 工具中心 · 换算 Unit

> [← Deck 文档](README.md) · [工具中心设计](../overview.md#四工具中心配置驱动的工厂模式)

- **入口路由**：`/tools/unit`（分类页），各工具见下表
- **源码位置**：[src/views/deck/tools/unit/](../../src/views/deck/tools/unit/)
- **注册表**：[tools.js](../../src/config/tools.js) `Unit` 分类（主色 #2F54EB）

## 分类定位

覆盖字节、时间、速率、长度、重量、面积、体积、温度、压力等多维度单位换算，双向精准换算。

## 工具清单（9）

| 工具 | 说明 | 路由 | 源文件 |
| --- | --- | --- | --- |
| 字节单位换算 | bit 到 PB 全系列存储单位双向换算 | `/tools/unit/bytes` | `bytes.vue` |
| 时间单位换算 | 秒到年多种时间单位换算 | `/tools/unit/time` | `time.vue` |
| 速率换算 | bps 到 Gbps 及 B/s 等速率单位换算 | `/tools/unit/rate` | `rate.vue` |
| 长度换算 | 米到光年等长度单位换算 | `/tools/unit/length` | `length.vue` |
| 重量换算 | 克到吨等重量单位换算 | `/tools/unit/weight` | `weight.vue` |
| 面积换算 | 平方米到英亩等面积单位换算 | `/tools/unit/area` | `area.vue` |
| 体积换算 | 立方米到加仑等体积单位换算 | `/tools/unit/volume` | `volume.vue` |
| 温度换算 | 摄氏度、华氏度、开尔文互转 | `/tools/unit/temperature` | `temperature.vue` |
| 压力换算 | 帕到 psi 等压力单位换算 | `/tools/unit/pressure` | `pressure.vue` |

## 实现

- **统一骨架**：各工具复用 `components/tool/UnitConverter.vue`（单位选择 + 数值输入 + 双向实时换算的通用件），页面只声明单位表与换算系数
- **分类页**：`index.vue` 经 category-page 工厂渲染
