# 工具中心 · 生活 Life

> [← Deck 文档](README.md) · [工具中心设计](../overview.md#四工具中心配置驱动的工厂模式)

- **入口路由**：`/tools/life`（分类页），各工具见下表
- **源码位置**：[src/views/deck/tools/life/](../../src/views/deck/tools/life/)
- **注册表**：[tools.js](../../src/config/tools.js) `Life` 分类（主色 #13C2C2）

## 分类定位

涵盖 BMI 计算、血压分析、农历日历、房贷计算、车牌与身份证归属查询、历代帝王朝代查询、区号域名国旗、亲戚称谓计算等生活实用工具。

## 工具清单（12）

| 工具 | 说明 | 路由 | 源文件 |
| --- | --- | --- | --- |
| BMI 计算 | 根据身高体重计算身体质量指数 | `/tools/life/bmi` | `bmi.vue` |
| 血压范围 | 输入血压值分析分类与健康建议 | `/tools/life/blood-pressure` | `blood-pressure.vue` |
| 日历 | 公历农历同步，节假日与二十四节气标注 | `/tools/life/calendar` | `calendar.vue` |
| 贷款计算 | 房贷计算器，等额本息与等额本金 | `/tools/life/loan` | `loan.vue` |
| 车牌归属 | 全国车牌前缀归属地查询 | `/tools/life/car-number` | `car-number.vue` |
| 身份证查询 | 校验身份证并提取性别年龄生日等信息 | `/tools/life/idcard` | `idcard.vue` |
| 历史朝代 | 中国历代王朝时间轴查询 | `/tools/life/history` | `history.vue` |
| 历代帝王 | 朝代与帝王树形结构查询 | `/tools/life/emperor` | `emperor.vue` |
| 区号查询 | 全球国家电话区号与时间差查询 | `/tools/life/area-code` | `area-code.vue` |
| 域名后缀 | 国家域名缩写与国际电话区号查询 | `/tools/life/area-domain` | `area-domain.vue` |
| 国旗 | 各国 Unicode 国旗 Emoji 一键复制 | `/tools/life/flag` | `flag.vue` |
| 亲戚称谓 | 自然语言输入亲属关系链输出标准称谓 | `/tools/life/relationship` | `relationship.vue` |

## 实现

- **依赖组件**：solarlunar（农历 / 节气 / 生肖）、relationship.js（亲戚称谓计算）
- **离线数据**：身份证归属（`@/utils/idcard-area.js`）、车牌 / 朝代 / 帝王 / 区号等内置数据表，全部本地查询
- **分类页**：`index.vue` 经 category-page 工厂渲染
