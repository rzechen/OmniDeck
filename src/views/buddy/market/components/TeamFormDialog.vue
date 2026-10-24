<template>
  <!-- 新增 / 编辑专家团：团名称必填 + 团描述必填 + 团组成必填（专家广场专家宫格多选）。
       团组成数据源为专家广场（市场索引专家），保存时未安装的专家自动安装并入团；
       内容以宫格选择为主 → 右侧抽屉（与 AgentFormDialog 同款壳） -->
  <transition name="ob-drawer">
    <div v-if="dialogVisible" class="ob-drawer" @click.self="dialogVisible = false">
      <div class="ob-drawer-panel" style="--ob-drawer-w: 640px">
        <header class="ob-drawer-header">
          <h3 class="ob-dialog-title">{{ isEdit ? '编辑专家团' : '新建专家团' }}</h3>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="dialogVisible = false" />
        </header>

        <div class="ob-drawer-body">
          <div class="ob-field">
            <label class="ob-field-label">团名称 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="teamForm.name"
              size="small"
              clearable
              placeholder="如：前端攻坚团"
              maxlength="50"
            />
            <div class="ob-field-hint">团名称可中文；对话中 @Team 引用、成员清单注入均使用该名称展示</div>
          </div>
          <div class="ob-field">
            <label class="ob-field-label">团描述 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="teamForm.description"
              size="small"
              type="textarea"
              :rows="3"
              resize="none"
              placeholder="一句话说明该团的职责与适用场景（何时委派给这个团队）"
              maxlength="200"
            />
          </div>

          <!-- 团组成：专家广场专家卡片宫格多选（必选至少 1 位） -->
          <div class="ob-field ob-members-field">
            <label class="ob-field-label">
              团组成 <span class="ob-field-required">*</span>
              <span class="ob-members-count" :class="{ ok: selectedIds.length }">
                已选 {{ selectedIds.length }} 位专家
              </span>
            </label>

            <!-- 专家搜索（专家多时快速定位） -->
            <div class="ob-members-search">
              <svg-icon icon-class="search" />
              <input v-model="memberKeyword" placeholder="搜索专家广场的专家名称 / 描述..." />
              <svg-icon
                v-if="memberKeyword"
                icon-class="circle-close"
                class="ob-members-clear"
                @click="memberKeyword = ''"
              />
            </div>

            <div v-if="memberLoading" class="ob-members-tip">正在加载专家广场…</div>
            <div v-else-if="loadError" class="ob-members-tip ob-members-err">{{ loadError }}</div>
            <div v-else-if="!experts.length" class="ob-members-tip">
              专家广场暂无可用专家（需网络拉取市场索引）
            </div>
            <div v-else-if="!filteredExperts.length" class="ob-members-tip">没有匹配的专家</div>

            <!-- 专家卡片宫格（点击切换选中态：主色描边 + 右上角对勾）；
                 外层独立滚动容器包裹纯网格，避免 grid 兼任滚动容器时行高异常 -->
            <div v-else class="ob-members-scroll">
              <div class="ob-members-grid">
                <div
                  v-for="it in filteredExperts"
                  :key="it.id"
                  class="ob-member-card"
                  :class="{ selected: selectedIds.includes(it.id) }"
                  @click="toggleMember(it.id)"
                >
                  <div class="ob-member-check">
                    <svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                  </div>
                  <div class="ob-member-head">
                    <div class="ob-member-logo">
                      <img v-if="it.iconSrc" :src="it.iconSrc" alt="" draggable="false" />
                      <svg-icon v-else icon-class="subagent" />
                    </div>
                    <div class="ob-member-title">
                      <div class="ob-member-name" :title="it.name">{{ it.name }}</div>
                      <div class="ob-member-desc" :title="it.description">{{ it.description || '（无描述）' }}</div>
                    </div>
                  </div>
                  <span v-if="it.installed" class="ob-member-installed" title="已安装到本地">已装</span>
                </div>
              </div>
            </div>
            <div class="ob-field-hint">专家来自专家广场；保存时未安装的专家将自动安装并入团（含团内本地成员一并保留）</div>
          </div>
        </div>

        <footer class="ob-drawer-footer">
          <div class="ob-dialog-btns">
            <el-button size="small" round @click="dialogVisible = false">取消</el-button>
            <el-button size="small" round type="primary" :loading="saving" @click="saveTeam">
              {{ saving ? '保存中…' : '保存' }}
            </el-button>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup>
// 新增 / 编辑专家团（teams/<id>.json）三要素表单——团名称 / 团描述 / 团组成。
// 团组成为专家广场（市场索引 type=agent 项）卡片宫格多选：
// - 保存统一走 teams.save 后端编排：已装市场项复用本地文件、未装项安装到
//   团专属目录 agents/teams/<团id>/（「我的专家」不单独展示，随团管理）
// - 编辑回填：优先按团 json 的 sources（保存时记录的市场项）勾选；
//   旧数据无 sources 时回退文件交集反推
import { ref, reactive, computed, watch } from 'vue'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'TeamFormDialog' })

const props = defineProps({
  // 弹窗显隐（父级 v-model:visible 控制）
  visible: {
    type: Boolean,
    default: false
  },
  // 编辑中的专家团（null 表示新增）
  editing: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'saved'])

const { message } = useFeedback()

const teamForm = reactive({ name: '', description: '' })
const memberKeyword = ref('')
const memberLoading = ref(false)
const loadError = ref('')
const saving = ref(false)
// 专家广场专家（市场索引 type=agent 项，附 iconSrc）
const experts = ref([])
// 选中的市场项 id 集
const selectedIds = ref([])
// 编辑时的原成员文件清单（保留非市场成员用）
const oldMembers = ref([])

const isEdit = computed(() => !!props.editing)

const dialogVisible = computed({
  get() {
    return props.visible
  },
  set(v) {
    emit('update:visible', v)
  }
})

// 宫格过滤：名称命中优先 / 描述命中次之（简单包含匹配）
const filteredExperts = computed(() => {
  const kw = memberKeyword.value.trim().toLowerCase()
  if (!kw) return experts.value
  const nameHits = []
  const descHits = []
  for (const it of experts.value) {
    if (String(it.name || '').toLowerCase().includes(kw)) nameHits.push(it)
    else if (String(it.description || '').toLowerCase().includes(kw)) descHits.push(it)
  }
  return nameHits.concat(descHits)
})

function toggleMember(id) {
  const i = selectedIds.value.indexOf(id)
  if (i >= 0) selectedIds.value.splice(i, 1)
  else selectedIds.value.push(id)
}

// 市场类型归一（与市场页 marketType 同规则）
function isAgentItem(it) {
  const t = it.type || 'skill'
  if (t === 'workflow' || t === 'skill') return false
  if (t === 'connector' || t === 'mcp') return false
  return t === 'agent'
}

// 拉取专家广场专家（市场索引；图标 base64 内联 data URL）
async function loadExperts() {
  memberLoading.value = true
  loadError.value = ''
  const api = buddyApi()
  try {
    const res = api && api.market ? await api.market.index() : null
    if (!res || !res.ok) {
      loadError.value = (res && res.error) || '专家广场加载失败（请检查网络）'
      experts.value = []
    } else {
      experts.value = (res.items || []).filter(isAgentItem).map(it => ({
        id: it.id,
        name: it.name,
        description: it.description || '',
        installed: !!it.installed,
        iconSrc: it.iconBase64
          ? `data:${it.iconMime || 'image/png'};base64,${it.iconBase64}`
          : ''
      }))
    }
  } catch (e) {
    loadError.value = '专家广场加载失败（请检查网络）'
    experts.value = []
  }
  memberLoading.value = false
}

// 已装记录 → 本地专家文件清单（裸 md 单文件 / zip 集合目录前缀匹配）
function recAgentFiles(rec, agentsList) {
  if (!rec) return []
  if (rec.agentFile) return [rec.agentFile]
  if (rec.collection) {
    const prefix = rec.collection + '/'
    return agentsList.filter(a => a.file.startsWith(prefix)).map(a => a.file)
  }
  return []
}

async function fetchContext() {
  const api = buddyApi()
  const [installedRes, agentsRes] = await Promise.all([
    api && api.market ? api.market.installed() : Promise.resolve({ items: [] }),
    api && api.agents && api.agents.listAll ? api.agents.listAll() : Promise.resolve([])
  ])
  return {
    recs: (installedRes && Array.isArray(installedRes.items)) ? installedRes.items : [],
    agentsList: Array.isArray(agentsRes) ? agentsRes : []
  }
}

// 编辑回填：优先按团 json 的 sources（保存时记录的市场项）勾选；
// 旧数据无 sources 时回退——按已装记录文件集与团成员交集反推
async function restoreSelection(sources) {
  if (Array.isArray(sources) && sources.length) {
    const ids = new Set(sources.map(s => s.id))
    selectedIds.value = experts.value.filter(it => ids.has(it.id)).map(it => it.id)
    return
  }
  const { recs, agentsList } = await fetchContext()
  const picked = []
  for (const it of experts.value) {
    const rec = recs.find(r => r.id === it.id)
    const files = recAgentFiles(rec, agentsList)
    if (files.some(f => oldMembers.value.includes(f))) picked.push(it.id)
  }
  selectedIds.value = picked
}

function initForm() {
  memberKeyword.value = ''
  selectedIds.value = []
  oldMembers.value = []
  teamForm.name = ''
  teamForm.description = ''
  loadExperts().then(() => {
    if (props.editing) loadTeam()
  })
}

// 编辑专家团：读取 json 回填（名称/描述/成员/sources）
function loadTeam() {
  const api = buddyApi()
  if (!api || !api.teams) {
    message.error('专家团管理仅桌面端可用')
    dialogVisible.value = false
    return
  }
  api.teams.get(props.editing.id).then(res => {
    if (res && res.ok && res.team) {
      teamForm.name = res.team.name || ''
      teamForm.description = res.team.description || ''
      oldMembers.value = Array.isArray(res.team.members) ? [...res.team.members] : []
      restoreSelection(res.team.sources)
    } else {
      message.error((res && res.error) || '读取专家团失败')
      dialogVisible.value = false
    }
  })
}

// 保存：交 teams.save 后端编排（已装市场项复用本地文件、未装项安装到团目录、
// 汇总成员并落 json）；本地自建成员由后端自动保留
async function saveTeam() {
  const name = teamForm.name.trim()
  const description = teamForm.description.trim()
  if (!name) {
    message.warning('请填写团名称')
    return
  }
  if (!description) {
    message.warning('请填写团描述')
    return
  }
  if (!selectedIds.value.length && !(isEdit.value && oldMembers.value.length)) {
    message.warning('团组成不能为空，请至少选择 1 位专家')
    return
  }
  const api = buddyApi()
  if (!api || !api.teams || !api.teams.save) {
    message.error('专家团管理仅桌面端可用')
    return
  }
  saving.value = true
  try {
    const sources = selectedIds.value.map(id => {
      const it = experts.value.find(x => x.id === id)
      return { id, name: it ? it.name : id }
    })
    const payload = isEdit.value
      ? { id: props.editing.id, name, description, sources }
      : { name, description, sources }
    const res = await api.teams.save(payload)
    if (res && res.ok) {
      dialogVisible.value = false
      message.success(isEdit.value ? '专家团已更新，新会话生效' : '专家团「' + name + '」创建成功，新会话生效')
      emit('saved')
    } else {
      message.error((res && res.error) || '保存失败')
    }
  } catch (e) {
    message.error((e && e.message) || '保存失败')
  } finally {
    saving.value = false
  }
}

// 弹窗打开时按 editing 初始化（编辑读取回填 / 新增重置表单）
watch(() => props.visible, val => {
  if (val) initForm()
})
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 团组成字段：占据抽屉剩余高度（宫格内部纵向滚动） */
.ob-members-field {
  flex: 1 1 0;
  min-height: 260px;
  display: flex;
  flex-direction: column;

  .ob-field-label {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .ob-members-count {
    font-size: 11px;
    font-weight: 600;
    color: $text-secondary;
    background: $search-bg;
    padding: 1px 8px;
    border-radius: 999px;

    &.ok {
      color: var(--primary-color);
      background: rgba(var(--primary-color-rgb), 0.1);
    }
  }

  .ob-field-hint {
    flex-shrink: 0;
  }
}

.ob-field-hint {
  font-size: 11px;
  color: $text-secondary;
}

/* 专家搜索框（与市场页搜索框同款轻量风） */
.ob-members-search {
  display: flex;
  align-items: center;
  gap: 8px;
  height: 30px;
  padding: 0 12px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  border: 1px solid transparent;
  border-radius: 15px;
  flex-shrink: 0;
  margin-bottom: 10px;

  &:focus-within {
    background: var(--card-bg, #fff);
    border-color: rgba(var(--primary-color-rgb), 0.5);
  }

  .svg-icon {
    font-size: 13px;
    color: $text-secondary;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: $text-primary;

    &::placeholder {
      color: $text-secondary;
    }
  }

  .ob-members-clear {
    font-size: 13px;
    color: $text-secondary;
    cursor: pointer;

    &:hover {
      color: $text-primary;
    }
  }
}

.ob-members-tip {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: $text-secondary;

  &.ob-members-err {
    color: #e25252;
  }
}

/* ===== 纵向滚动容器（独立于网格：grid 不兼任滚动容器，行高按内容自然排布） ===== */
.ob-members-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  margin-top: 2px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: rgba(0, 0, 0, 0.22);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.04);
    border-radius: 3px;
  }
}

/* ===== 专家广场专家卡片宫格（多选）：纯网格（高度自适应内容，同行不互相拉伸） ===== */
.ob-members-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  grid-auto-rows: min-content;
  gap: 10px;
  padding: 2px 6px 6px 2px;
  align-items: start;
}

.ob-member-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 12px 12px 14px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  overflow: hidden;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);

    .ob-member-check {
      border-color: rgba(var(--primary-color-rgb), 0.5);
    }
  }

  /* 选中态：主色描边 + 浅底 + 对勾点亮 */
  &.selected {
    border-color: rgba(var(--primary-color-rgb), 0.65);
    background: rgba(var(--primary-color-rgb), 0.05);
    box-shadow: inset 2px 0 0 var(--primary-color);

    .ob-member-check {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: #fff;
    }
  }

  .ob-member-installed {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 9.5px;
    font-weight: 600;
    line-height: 1.5;
    padding: 0 5px;
    border-radius: 4px;
    color: #2E8B63;
    background: rgba(70, 168, 127, 0.1);
    border: 1px solid rgba(70, 168, 127, 0.25);
  }
}

/* 选中对勾（默认空心圆，选中主色实底；与内容行垂直居中） */
.ob-member-check {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border: 1.5px solid var(--border-color);
  border-radius: 50%;
  background: transparent;
  color: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  svg {
    width: 10px;
    height: 10px;
  }
}

.ob-member-head {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}

.ob-member-logo {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(232, 168, 124, 0.15), rgba(217, 138, 95, 0.25));
  color: #C86B3C;
  overflow: hidden;

  .svg-icon {
    font-size: 17px;
  }

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.ob-member-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.ob-member-name {
  font-size: 13px;
  line-height: 1.45;
  font-weight: 600;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: 28px;
}

.ob-member-desc {
  margin-top: 2px;
  font-size: 11.5px;
  line-height: 1.45;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
