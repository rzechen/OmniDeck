<template>
  <div class="ob-manage-page">
    <!-- 顶部 Hero（市场页同款：极简标题 + 数量徽标 + 描述 + 右侧操作） -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">技能</h2>
          <span class="ob-hero-badge" v-if="skillList.length">{{ skillList.length }} 个已安装</span>
        </div>
        <p class="ob-section-desc">
          为 Agent 定义可复用的技能手册（SKILL.md），Agent 按需渐进加载
        </p>
      </div>
      <el-button
        size="small"
        round
        type="primary"
        class="ob-hero-btn"
        @click="openSkillCreate"
      ><svg-icon icon-class="plus" class="ob-btn-svg" />导入 Skill</el-button>
    </header>

    <!-- 内容区（hero 固定，仅此区域滚动） -->
    <div class="ob-page-body">
      <!-- 空状态 -->
      <div v-if="!skillList.length && !skillLoading" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="skill" />
        </div>
        <div class="ob-empty-title">暂无 Skill</div>
        <div class="ob-empty-desc">导入一个 Skill（ZIP），让 Agent 掌握特定任务的操作手册</div>
        <el-button
          size="small"
          round
          type="primary"
          @click="openSkillCreate"
        ><svg-icon icon-class="plus" class="ob-btn-svg" />导入 Skill</el-button>
      </div>

      <!-- Skill 卡片网格 -->
      <div v-else class="ob-cards-grid">
        <!-- 加载中：卡片骨架占位（列宽 340 与实际网格一致） -->
        <div v-if="skillLoading" class="ob-sk-wrap">
          <buddy-skeleton type="cards" :count="8" :min="340" />
        </div>
        <skill-card
          v-for="s in skillList"
          v-else
          :key="s.dir"
          :skill="s"
          :env-keys="envKeysOf(s)"
          @detail="openSkillDetail"
          @export="exportSkill"
          @edit="openSkillEdit"
          @remove="removeSkill"
        />
      </div>
    </div>

    <!-- 编辑/导入 Skill 弹窗（新建仅 ZIP 导入；编辑为表单） -->
    <skill-import-dialog
      v-model:visible="skillDialogVisible"
      :editing="skillEditing"
      @saved="onSkillSaved"
    />

    <!-- 技能详情弹窗（复用市场页共享组件）：描述 / 所需变量 / 内容预览 -->
    <item-detail-dialog v-model:visible="skillDetailVisible" :item="skillDetailItem">
      <template #cells="{ item }">
        <div class="ob-detail-cell">
          <div class="ob-cell-label">所需变量</div>
          <div class="ob-cell-value">
            <template v-if="item.declaredKeys && item.declaredKeys.length">
              <span
                v-for="k in item.declaredKeys"
                :key="k"
                class="ob-detail-key"
                :class="{ miss: !item.providedKeys.includes(k) }"
              >{{ item.providedKeys.includes(k) ? '✓' : '!' }} {{ k }}</span>
            </template>
            <template v-else>（未声明）</template>
          </div>
        </div>
      </template>
      <template #actions="{ item }">
        <el-button
          size="small"
          round
          type="primary"
          plain
          @click="openSkillEdit(item.raw)"
        >编辑内容</el-button>
        <el-button
          size="small"
          round
          @click="exportSkill(item.raw)"
        >导出 ZIP</el-button>
        <el-button
          size="small"
          round
          type="danger"
          plain
          @click="removeSkill(item.raw)"
        >删除</el-button>
      </template>
    </item-detail-dialog>
  </div>
</template>

<script>
// 技能管理独立页：ZIP 导入 + 编辑（SKILL.md 表单）+ 删除 + 详情弹窗（复用市场组件）
// 凭据统一在「我的资料 → 我的凭据」录入（绑定技能注入环境变量）；本页仅展示
// 技能声明的所需变量名（env-keys frontmatter）与录入状态
// 卡片与弹窗已拆分至 ./components/（SkillCard / SkillImportDialog）
import ItemDetailDialog from '@/components/buddy/ItemDetailDialog.vue'
import SkillCard from './components/SkillCard.vue'
import SkillImportDialog from './components/SkillImportDialog.vue'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
import { buddyApi } from '@/utils/buddy-api'

export default {
  name: 'OmniBuddySkills',
  components: { ItemDetailDialog, SkillCard, SkillImportDialog, BuddySkeleton },
  data() {
    return {
      // ===== 技能管理 =====
      skillList: [],
      skillLoading: false,
      skillDialogVisible: false,
      // 编辑中的 Skill（null 表示新建 / ZIP 导入）
      skillEditing: null,
      // ===== 技能详情弹窗 =====
      skillDetailVisible: false,
      skillDetailItem: null,
      // ===== 技能凭据（统一在「我的凭据」管理，此处仅读状态用于展示） =====
      skillCredList: []
    }
  },
  created() {
    this.loadSkills()
  },
  methods: {
    // ===== 技能管理 =====
    async loadSkills() {
      this.skillLoading = true
      try {
        const api = buddyApi()
        const res = api ? await api.listSkills() : []
        this.skillList = Array.isArray(res) ? res : []
      } catch (e) {
        this.skillList = []
      }
      this.skillLoading = false
      // 与技能列表一起加载技能凭据（卡片状态行展示用）
      this.loadSkillCreds()
    },
    // 新建（ZIP 导入）：仅打开弹窗，ZIP 状态由弹窗自行重置
    openSkillCreate() {
      this.skillEditing = null
      this.skillDialogVisible = true
    },
    // 编辑：仅打开弹窗并传入目标，SKILL.md 内容由弹窗自行读取回填
    openSkillEdit(s) {
      this.skillEditing = s
      this.skillDialogVisible = true
    },
    // 导入或编辑成功：刷新列表与凭据
    onSkillSaved() {
      this.skillEditing = null
      this.loadSkills()
    },
    // ===== 技能详情弹窗（复用市场页共享组件） =====
    // listSkills 返回的 content 为完整 SKILL.md 文本；描述部分（frontmatter 之后）作为 details 长文
    openSkillDetail(s) {
      const content = s.content || ''
      const bodyStart = content.indexOf('---', 3) // 跳过开头 frontmatter
      const details = bodyStart > 0 ? content.slice(bodyStart + 3).trim() : ''
      this.skillDetailItem = {
        name: s.name,
        type: 'skill',
        details: details || s.description || '',
        description: s.description,
        declaredKeys: s.envKeys || [],
        providedKeys: this.envKeysOf(s),
        raw: s
      }
      this.skillDetailVisible = true
    },
    // 导出 Skill 为 ZIP：IPC 取回 Buffer → Blob 触发浏览器下载
    async exportSkill(s) {
      const api = buddyApi()
      if (!api || !api.exportSkillZip) {
        this.$message.error('技能管理仅桌面端可用')
        return
      }
      try {
        const res = await api.exportSkillZip(s.dir)
        if (!res || !res.ok) {
          this.$message.error((res && res.error) || '导出失败')
          return
        }
        const blob = new Blob([res.data], { type: 'application/zip' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = s.name + '.zip'
        a.click()
        URL.revokeObjectURL(url)
        this.$message.success('已导出 ' + s.name + '.zip')
      } catch (e) {
        this.$message.error((e && e.message) || '导出失败')
      }
    },
    removeSkill(s) {
      this.$confirm('确定删除 Skill「' + s.name + '」吗？', '删除 Skill', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const api = buddyApi()
        const res = await api.deleteSkill(s.dir)
        if (res && res.ok) {
          this.$message.success('已删除')
          this.loadSkills()
        } else {
          this.$message.error((res && res.error) || '删除失败')
        }
      }).catch(() => {})
    },
    // ===== 技能凭据（统一在「我的凭据」管理，此处仅读状态） =====
    // 筛出绑定了技能的凭据（按 skillNames 匹配，兼容 'credential'/'skill' 类型），供卡片/详情展示录入状态
    async loadSkillCreds() {
      const api = buddyApi()
      const cred = api && api.credentials
      try {
        const res = cred ? await cred.list() : []
        const list = Array.isArray(res) ? res : []
        this.skillCredList = list.filter(c => Array.isArray(c.skillNames) && c.skillNames.length)
      } catch (e) {
        this.skillCredList = []
      }
    },
    // 绑定该技能的全部凭据（按 skillNames 匹配）
    credsOf(skill) {
      if (!skill) return []
      return this.skillCredList.filter(c => (c.skillNames || []).includes(skill.name))
    },
    // 该技能已录入的环境变量键名聚合（脱敏视图，仅键名；多条凭据合并去重）
    envKeysOf(skill) {
      const keys = []
      this.credsOf(skill).forEach(c => (c.envKeys || []).forEach(k => {
        if (!keys.includes(k)) keys.push(k)
      }))
      return keys
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 技能卡片更宽：承载完整名称与更多行描述 */
.ob-cards-grid {
  grid-template-columns: repeat(auto-fill, minmax(340px, 1fr));
}

/* 加载骨架容器内边距 */
.ob-sk-wrap {
  padding: 18px 4px;
}

/* 详情弹窗：所需变量标签（✓ 已录入 / ! 缺失）——cells slot 内容带父 scope，需 ::v-deep
   配色与 SkillCard 的 .ob-card-tag 保持一致 */
:deep(.ob-detail-key){
  display: inline-block;
  padding: 2px 8px;
  margin: 2px 6px 2px 0;
  font-size: 12px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-weight: 500;
  border-radius: 4px;
  color: var(--success-color);
  background: rgba(var(--success-color-rgb),  0.08);

  &.miss {
    color: var(--danger-color);
    background: rgba(245, 108, 108, 0.08);
  }
}
</style>
