# 技能 Skills

> [← Buddy 文档](README.md)

- **入口路由**：`/omnibuddy/skills`
- **源码位置**：[src/views/buddy/skills/index.vue](../../src/views/buddy/skills/index.vue)
- **子组件**：SkillCard、SkillImportDialog、SkillCredDialog、ItemDetailDialog（与市场共享）
- **主进程模块**：skills.js / credentials.js

## 功能定位

SKILL.md 技能手册的导入与管理：随包凭据绑定、编辑、导出。

## 页面结构

```
Hero 说明区
  ↓
SkillCard 网格
+ 导入弹窗（SkillImportDialog）
+ 详情弹窗（ItemDetailDialog）
+ 凭据弹窗（SkillCredDialog）
```

## 核心功能

- **ZIP 导入**：`validateZip` 校验 → `importZip` 导入，支持随包绑定凭据
- **编辑 SKILL.md**：`getSkill` 回填、`updateSkill` 保存
- **详情弹窗**：凭据状态 / 内容预览 / 编辑 / 配置凭据 / 导出 / 删除
- **导出**：`exportSkillZip` 返回 Buffer → Blob 下载
- **删除**：二次确认
- **凭据安全**：加密存储、明文不回显（envKeys 脱敏展示）

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| 技能文件（SKILL.md 及资源） | 主进程 skills 目录 |
| 技能凭据 | IPC `credentials.create / list` → 系统钥匙串 |
| 列表操作 | IPC `listSkills / deleteSkill / exportSkillZip`（弹窗内另有 validateZip / importZip / getSkill / updateSkill） |
