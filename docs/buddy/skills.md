# 技能 Skills

> [← Buddy 文档](README.md)

- **入口路由**：`/omnibuddy/skills`
- **源码位置**：[src/views/buddy/skills/index.vue](../../src/views/buddy/skills/index.vue)
- **子组件**：SkillCard、SkillImportDialog（编辑/导入弹窗）、ItemDetailDialog（与市场共享）
- **主进程模块**：skills.js / credentials.js

## 功能定位

SKILL.md 技能手册的导入与管理。凭据不在本页录入——统一在 [我的资料 → 我的凭据](profile.md) 录入并绑定技能，本页仅展示所需变量与录入状态。

## 页面结构

```
Hero 说明区
  ↓
SkillCard 网格
+ 导入 / 编辑弹窗（SkillImportDialog）
+ 详情弹窗（ItemDetailDialog）
```

## 核心功能

- **ZIP 导入**：`validateZip` 校验 → `importZip` 导入
- **编辑 SKILL.md**：`getSkill` 回填、`updateSkill` 保存（表单：name / description / env-keys）
- **详情弹窗**：所需变量（已录入 ✓ / 未录入 !）/ 内容预览 / 编辑 / 导出 / 删除
- **导出**：`exportSkillZip` 返回 Buffer → Blob 下载
- **删除**：二次确认
- **所需变量发现**（主进程 skills.js）：
  - frontmatter `env-keys` 显式声明
  - **正文扫描自动发现**：递归扫描技能目录文本文件，收集 `${VAR}` / `$VAR` / `process.env.VAR` / `os.environ` 等引用（互联网技能不在 frontmatter 声明，靠扫描发现；系统通用变量在黑名单中排除）
  - 两路合并去重（声明优先），上限 20 个
- **凭据录入**：在「我的资料 → 我的凭据」创建凭据并**绑定技能**，运行时注入对应环境变量；加密存储、明文不回显

## 数据与存储

| 数据 | 位置 |
| --- | --- |
| 技能文件（SKILL.md 及资源） | 主进程 skills 目录 |
| 技能凭据 | 我的资料 → 我的凭据（IPC `credentials.*` → 系统钥匙串） |
| 列表操作 | IPC `listSkills / deleteSkill / exportSkillZip`（弹窗内另有 validateZip / importZip / getSkill / updateSkill） |
