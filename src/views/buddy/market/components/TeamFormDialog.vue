<template>
  <!-- 新增 / 编辑专家团：团名称必填 + 团描述必填 + 团组成必填（专家卡片宫格多选）。
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

          <!-- 团组成：专家卡片宫格多选（必选至少 1 位） -->
          <div class="ob-field ob-members-field">
            <label class="ob-field-label">
              团组成 <span class="ob-field-required">*</span>
              <span class="ob-members-count" :class="{ ok: selectedMembers.length }">
                已选 {{ selectedMembers.length }} 位专家
              </span>
            </label>

            <!-- 专家搜索（专家多时快速定位） -->
            <div class="ob-members-search">
              <svg-icon icon-class="search" />
              <input v-model="memberKeyword" placeholder="搜索专家名称 / 描述..." />
              <svg-icon
                v-if="memberKeyword"
                icon-class="circle-close"
                class="ob-members-clear"
                @click="memberKeyword = ''"
              />
            </div>

            <div v-if="memberLoading" class="ob-members-tip">正在加载专家列表…</div>
            <div v-else-if="!agentsAll.length" class="ob-members-tip">
              暂无可选专家，请先在「专家 · 技能 · 连接器」页创建或从专家广场安装
            </div>
            <div v-else-if="!filteredAgents.length" class="ob-members-tip">没有匹配的专家</div>

            <!-- 专家卡片宫格（点击切换选中态：主色描边 + 右上角对勾） -->
            <div v-else class="ob-members-grid">
              <div
                v-for="a in filteredAgents"
                :key="a.file"
                class="ob-member-card"
                :class="{ selected: selectedMembers.includes(a.file) }"
                @click="toggleMember(a.file)"
              >
                <div class="ob-member-check">
                  <svg viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </div>
                <div class="ob-member-head">
                  <div class="ob-member-logo">
                    <svg-icon icon-class="subagent" />
                  </div>
                  <div class="ob-member-title">
                    <div class="ob-member-name" :title="a.name">{{ a.name }}</div>
                    <div class="ob-member-desc" :title="a.description">{{ a.description || '（无描述）' }}</div>
                  </div>
                </div>
                <span v-if="a.builtin" class="ob-member-builtin">系统</span>
              </div>
            </div>
          </div>
        </div>

        <footer class="ob-drawer-footer">
          <div class="ob-dialog-btns">
            <el-button size="small" round @click="dialogVisible = false">取消</el-button>
            <el-button size="small" round type="primary" :loading="saving" @click="saveTeam">保存</el-button>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup>
// 新增 / 编辑专家团（teams/<id>.json）三要素表单——团名称 / 团描述 / 团组成。
// 团组成为专家卡片宫格多选（含系统内置专家，builtin 标识）；编辑按 id 读取回填；
// id 由主进程从名称生成（编辑不可见不可改）
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

const teamForm = reactive({ name: '', description: '', members: [] })
const memberKeyword = ref('')
const memberLoading = ref(false)
const saving = ref(false)
const agentsAll = ref([])

const isEdit = computed(() => !!props.editing)

const dialogVisible = computed({
  get() {
    return props.visible
  },
  set(v) {
    emit('update:visible', v)
  }
})

// 已选成员（团组成至少 1 位）
const selectedMembers = computed(() => teamForm.members)

// 宫格过滤：名称命中优先 / 描述命中次之（简单包含匹配）
const filteredAgents = computed(() => {
  const kw = memberKeyword.value.trim().toLowerCase()
  if (!kw) return agentsAll.value
  const nameHits = []
  const descHits = []
  for (const a of agentsAll.value) {
    if (String(a.name || '').toLowerCase().includes(kw)) nameHits.push(a)
    else if (String(a.description || '').toLowerCase().includes(kw)) descHits.push(a)
  }
  return nameHits.concat(descHits)
})

function toggleMember(file) {
  const i = teamForm.members.indexOf(file)
  if (i >= 0) teamForm.members.splice(i, 1)
  else teamForm.members.push(file)
}

// 拉取全部专家（含 builtin，宫格选择数据源）
async function loadAgents() {
  memberLoading.value = true
  try {
    const api = buddyApi()
    const res = api && api.agents ? await api.agents.list() : []
    agentsAll.value = Array.isArray(res) ? res : []
  } catch (e) {
    agentsAll.value = []
  }
  memberLoading.value = false
}

function initForm() {
  memberKeyword.value = ''
  if (props.editing) {
    loadTeam()
  } else {
    Object.assign(teamForm, { name: '', description: '', members: [] })
  }
  loadAgents()
}

// 编辑专家团：读取 json 回填（名称/描述/成员）
function loadTeam() {
  const api = buddyApi()
  if (!api || !api.teams) {
    message.error('专家团管理仅桌面端可用')
    dialogVisible.value = false
    return
  }
  api.teams.get(props.editing.id).then(res => {
    if (res && res.ok && res.team) {
      Object.assign(teamForm, {
        name: res.team.name || '',
        description: res.team.description || '',
        members: Array.isArray(res.team.members) ? [...res.team.members] : []
      })
    } else {
      message.error((res && res.error) || '读取专家团失败')
      dialogVisible.value = false
    }
  })
}

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
  if (!teamForm.members.length) {
    message.warning('团组成不能为空，请至少选择 1 位专家')
    return
  }
  const api = buddyApi()
  if (!api || !api.teams) {
    message.error('专家团管理仅桌面端可用')
    return
  }
  saving.value = true
  try {
    const payload = { name, description, members: [...teamForm.members] }
    const res = isEdit.value
      ? await api.teams.update({ id: props.editing.id, ...payload })
      : await api.teams.create(payload)
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

/* 团组成字段：占据抽屉剩余高度（宫格内滚动） */
.ob-members-field {
  flex: 1;
  min-height: 220px;
  display: flex;
  flex-direction: column;

  .ob-field-label {
    display: flex;
    align-items: center;
    gap: 8px;
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
}

/* ===== 专家卡片宫格（多选） ===== */
.ob-members-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(178px, 1fr));
  gap: 8px;
  padding: 2px 2px 4px;
  align-content: start;

  &::-webkit-scrollbar {
    width: 5px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(0, 0, 0, 0.15));
    border-radius: 3px;
  }
}

.ob-member-card {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 10px 10px 10px 12px;
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

  .ob-member-builtin {
    position: absolute;
    top: 8px;
    right: 8px;
    font-size: 9.5px;
    font-weight: 600;
    line-height: 1.5;
    padding: 0 5px;
    border-radius: 4px;
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.1);
    border: 1px solid rgba(var(--primary-color-rgb), 0.25);
  }
}

/* 选中对勾（默认空心圆，选中主色实底） */
.ob-member-check {
  flex-shrink: 0;
  width: 15px;
  height: 15px;
  margin-top: 2px;
  border: 1.5px solid var(--border-color);
  border-radius: 50%;
  background: transparent;
  color: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  svg {
    width: 9px;
    height: 9px;
  }
}

.ob-member-head {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: flex-start;
  gap: 7px;
}

.ob-member-logo {
  flex-shrink: 0;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(232, 168, 124, 0.15), rgba(217, 138, 95, 0.25));
  color: #C86B3C;

  .svg-icon {
    font-size: 14px;
  }
}

.ob-member-title {
  flex: 1;
  min-width: 0;
}

.ob-member-name {
  font-size: 12.5px;
  font-weight: 600;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-member-desc {
  margin-top: 1px;
  font-size: 10.5px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
</style>
