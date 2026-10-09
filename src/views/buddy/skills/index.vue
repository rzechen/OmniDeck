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
      <!-- 编写 Skill 工具可用性说明（按执行场景；可折叠） -->
      <div class="ob-skill-tools-tip">
        <div class="ob-tip-row" @click="toolTipOpen = !toolTipOpen">
          <svg-icon icon-class="tips" class="ob-tip-icon" />
          <div class="ob-tip-text">
            <b>编写 Skill 前先看工具边界：</b>
            SKILL.md 主体在主会话执行（全部工具可用），agents/*.md 子代理只认 pi 内置工具、联网工具与 MCP——curl / python 等写入子代理白名单会报错，展开看完整清单。
          </div>
          <svg-icon :icon-class="toolTipOpen ? 'arrow-up' : 'arrow-down'" class="ob-tip-arrow" />
        </div>
        <div v-if="toolTipOpen" class="ob-tip-detail">
          <div class="ob-tip-case">
            <div class="ob-tip-case-title">SKILL.md 主体（主会话执行）可用工具</div>
            <div class="ob-tip-case-body">
              <p><span class="ok">文件与命令</span>：read、bash、edit、write、find、grep、ls、codemode、tool_search</p>
              <p><span class="ok">代码与请求</span>：python、node、curl、multi_edit、append、mkdir、cd</p>
              <p><span class="ok">联网</span>：web_search、fetch_content、source_check、get_search_content</p>
              <p><span class="ok">文档与图像</span>：doc_export、preview_export、generate_image</p>
              <p><span class="ok">交互与任务</span>：ask_user、todo_write、todo_read、report_site_auth、subagent、bg_wait、contact_supervisor、structured_output、subagent_supervisor</p>
              <p><span class="ok">深度研究</span>：workflow、workflow_control</p>
              <p><span class="ok">记忆</span>：memory_write、memory_read、memory_search、memory_forget、memory_restore、scratchpad、memory_status</p>
              <p><span class="ok">连接器</span>：mcp__服务器__工具（如内置浏览器 mcp__playwright__*，完整清单见「能力」页）</p>
            </div>
          </div>
          <div class="ob-tip-case">
            <div class="ob-tip-case-title">子代理 agents/*.md 可用工具</div>
            <div class="ob-tip-case-body">
              <p><span class="ok">文件与命令</span>：read、bash、edit、write、find、grep、ls、codemode、tool_search</p>
              <p><span class="ok">联网</span>：web_search、fetch_content、source_check、get_search_content</p>
              <p><span class="ok">图像</span>：generate_image</p>
              <p><span class="ok">交付面</span>：contact_supervisor、structured_output</p>
              <p><span class="ok">连接器</span>：mcp:服务器名（如 mcp:playwright）</p>
              <p><span class="no">不可用</span>：curl、python、node、multi_edit、append、mkdir、cd、doc_export、preview_export、workflow、memory 系列等宿主扩展工具——写入 tools 白名单会直接报错</p>
              <p><span class="alt">替代</span>：需要这些能力时经 bash 执行命令行等价物（如 bash 里跑 <code>curl -sL "&lt;url&gt;"</code> 抓网页、写好脚本后 <code>python3 xxx.py</code> 执行）</p>
            </div>
          </div>
        </div>
      </div>

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
          @open-member="openPackageMember"
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

<script setup>
// 技能管理独立页：ZIP 导入 + 编辑（SKILL.md 表单）+ 删除 + 详情弹窗（复用市场组件）
// 凭据统一在「我的资料 → 我的凭据」录入（绑定技能注入环境变量）；本页仅展示
// 技能声明的所需变量名（env-keys frontmatter）与录入状态
// 卡片与弹窗已拆分至 ./components/（SkillCard / SkillImportDialog）
import { ref, onActivated } from 'vue'
import ItemDetailDialog from '@/components/buddy/ItemDetailDialog.vue'
import SkillCard from './components/SkillCard.vue'
import SkillImportDialog from './components/SkillImportDialog.vue'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'OmniBuddySkills' })

const { message, confirm } = useFeedback()

// ===== 工具边界说明（可折叠） =====
const toolTipOpen = ref(false)

// ===== 技能管理 =====
const skillList = ref([])
// 全量技能（含包成员：packageOf 非空，折叠在主卡片下，点 chip 查详情用）
const allSkills = ref([])
const skillLoading = ref(false)
const skillDialogVisible = ref(false)
// 编辑中的 Skill（null 表示新建 / ZIP 导入）
const skillEditing = ref(null)
// ===== 技能详情弹窗 =====
const skillDetailVisible = ref(false)
const skillDetailItem = ref(null)
// ===== 技能凭据（统一在「我的凭据」管理，此处仅读状态用于展示） =====
const skillCredList = ref([])

// ===== 技能管理 =====
async function loadSkills() {
  skillLoading.value = true
  try {
    const api = buddyApi()
    const res = api ? await api.listSkills() : []
    const all = Array.isArray(res) ? res : []
    // 多 skill 包折叠：包成员（packageOf 非空）不单独成卡，
    // 由主卡片（packageMembers）下方子行展示
    skillList.value = all.filter(s => !s.packageOf)
    allSkills.value = all
  } catch (e) {
    skillList.value = []
    allSkills.value = []
  }
  skillLoading.value = false
  // 与技能列表一起加载技能凭据（卡片状态行展示用）
  loadSkillCreds()
}

// 新建（ZIP 导入）：仅打开弹窗，ZIP 状态由弹窗自行重置
function openSkillCreate() {
  skillEditing.value = null
  skillDialogVisible.value = true
}

// 编辑：仅打开弹窗并传入目标，SKILL.md 内容由弹窗自行读取回填
function openSkillEdit(s) {
  skillEditing.value = s
  skillDialogVisible.value = true
}

// 导入或编辑成功：刷新列表与凭据
function onSkillSaved() {
  skillEditing.value = null
  loadSkills()
}

// ===== 技能详情弹窗（复用市场页共享组件） =====
// 点包成员 chip 打开其详情（成员折叠在主卡片下，不单独成卡）
function openPackageMember(dir) {
  const member = allSkills.value.find(s => s.dir === dir)
  if (member) openSkillDetail(member)
}

// listSkills 返回的 content 为完整 SKILL.md 文本；描述部分（frontmatter 之后）作为 details 长文
function openSkillDetail(s) {
  const content = s.content || ''
  const bodyStart = content.indexOf('---', 3) // 跳过开头 frontmatter
  const details = bodyStart > 0 ? content.slice(bodyStart + 3).trim() : ''
  skillDetailItem.value = {
    name: s.name,
    type: 'skill',
    details: details || s.description || '',
    description: s.description,
    declaredKeys: s.envKeys || [],
    providedKeys: envKeysOf(s),
    raw: s
  }
  skillDetailVisible.value = true
}

// 导出 Skill 为 ZIP：IPC 取回 Buffer → Blob 触发浏览器下载
async function exportSkill(s) {
  const api = buddyApi()
  if (!api || !api.exportSkillZip) {
    message.error('技能管理仅桌面端可用')
    return
  }
  try {
    const res = await api.exportSkillZip(s.dir)
    if (!res || !res.ok) {
      message.error((res && res.error) || '导出失败')
      return
    }
    const blob = new Blob([res.data], { type: 'application/zip' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = s.name + '.zip'
    a.click()
    URL.revokeObjectURL(url)
    message.success('已导出 ' + s.name + '.zip')
  } catch (e) {
    message.error((e && e.message) || '导出失败')
  }
}

function removeSkill(s) {
  // 包主技能：级联提示（删除将连带移除包内平铺安装的子技能）
  const members = (s.packageMembers && s.packageMembers.length) ? s.packageMembers : null
  const tip = members
    ? '确定删除技能包「' + s.name + '」吗？随包安装的子技能（' + members.join('、') + '）将一并删除。'
    : '确定删除 Skill「' + s.name + '」吗？'
  confirm(tip, '删除 Skill', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    const api = buddyApi()
    const res = await api.deleteSkill(s.dir)
    if (res && res.ok) {
      const removed = (res.removedMembers && res.removedMembers.length)
        ? '（连带删除子技能：' + res.removedMembers.join('、') + '）'
        : ''
      message.success('已删除' + removed)
      loadSkills()
    } else {
      message.error((res && res.error) || '删除失败')
    }
  }).catch(() => {})
}

// ===== 技能凭据（统一在「我的凭据」管理，此处仅读状态） =====
// 筛出绑定了技能的凭据（按 skillNames 匹配，兼容 'credential'/'skill' 类型），供卡片/详情展示录入状态
async function loadSkillCreds() {
  const api = buddyApi()
  const cred = api && api.credentials
  try {
    const res = cred ? await cred.list() : []
    const list = Array.isArray(res) ? res : []
    skillCredList.value = list.filter(c => Array.isArray(c.skillNames) && c.skillNames.length)
  } catch (e) {
    skillCredList.value = []
  }
}

// 绑定该技能的全部凭据（按 skillNames 匹配）
function credsOf(skill) {
  if (!skill) return []
  return skillCredList.value.filter(c => (c.skillNames || []).includes(skill.name))
}

// 该技能已录入的环境变量键名聚合（脱敏视图，仅键名；多条凭据合并去重）
function envKeysOf(skill) {
  const keys = []
  credsOf(skill).forEach(c => (c.envKeys || []).forEach(k => {
    if (!keys.includes(k)) keys.push(k)
  }))
  return keys
}

// created：进入页面即拉取技能列表
loadSkills()

// keep-alive 页签重入：凭据可能在「我的资料 → 我的凭据」已补录/变更，
// 重新拉取凭据刷新卡片「待录入」状态（首次进入由 loadSkills 已加载，
// 此时 skillLoading 仍为 true，天然跳过，避免重复请求）
onActivated(() => {
  if (!skillLoading.value && skillList.value.length) loadSkillCreds()
})
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

/* ===== 编写 Skill 工具边界说明（顶部可折叠提示条） ===== */
.ob-skill-tools-tip {
  margin: 0 4px 14px;
  border: 1px solid rgba(var(--primary-color-rgb, 64, 158, 255), 0.25);
  border-radius: 8px;
  background: rgba(var(--primary-color-rgb, 64, 158, 255), 0.05);
  overflow: hidden;

  code {
    padding: 0 4px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 12px;
    border-radius: 4px;
    background: rgba(var(--primary-color-rgb, 64, 158, 255), 0.1);
  }
}

.ob-tip-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  user-select: none;
}

.ob-tip-icon {
  flex: none;
  width: 16px;
  height: 16px;
  color: var(--primary-color, #409eff);
}

.ob-tip-text {
  flex: 1;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--text-primary, #303133);

  b { font-weight: 600; }
}

.ob-tip-arrow {
  flex: none;
  width: 14px;
  height: 14px;
  color: var(--text-secondary, #909399);
}

.ob-tip-detail {
  padding: 2px 14px 12px 40px;
}

.ob-tip-case {
  & + & { margin-top: 10px; }
}

.ob-tip-case-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary, #303133);
  margin-bottom: 4px;
}

.ob-tip-case-body {
  font-size: 12px;
  line-height: 1.7;
  color: var(--text-secondary, #606266);

  p { margin: 0; }
}

.ob-tip-case-body .ok,
.ob-tip-case-body .no,
.ob-tip-case-body .alt {
  display: inline-block;
  padding: 0 6px;
  margin-right: 4px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
}

.ob-tip-case-body .ok {
  color: var(--success-color, #67c23a);
  background: rgba(103, 194, 58, 0.1);
}

.ob-tip-case-body .no {
  color: var(--danger-color, #f56c6c);
  background: rgba(245, 108, 108, 0.1);
}

.ob-tip-case-body .alt {
  color: var(--warning-color, #e6a23c);
  background: rgba(230, 162, 60, 0.12);
}

/* 详情弹窗：所需变量标签（✓ 已录入 / ! 缺失）——cells slot 内容带父 scope，需深度选择器
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
