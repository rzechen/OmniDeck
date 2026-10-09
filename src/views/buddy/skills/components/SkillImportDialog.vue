<template>
  <!-- 编辑 Skill：内容密集（长文手册），弹窗放不下 → 右侧全高抽屉 -->
  <transition v-if="isEdit" name="ob-drawer">
    <div v-if="dialogVisible" class="ob-drawer" @click.self="dialogVisible = false">
      <div class="ob-drawer-panel" style="--ob-drawer-w: 720px">
        <header class="ob-drawer-header">
          <h3 class="ob-dialog-title">编辑 Skill</h3>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="dialogVisible = false" />
        </header>

        <div class="ob-drawer-body">
          <!-- 手动编辑（已有 Skill） -->
          <div class="ob-field">
            <label class="ob-field-label">名称 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="skillForm.name"
              size="small"
              clearable
              disabled
              placeholder="字母、数字、连字符，如 pdf-report"
              maxlength="64"
            />
          </div>
          <div class="ob-field">
            <label class="ob-field-label">描述 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="skillForm.description"
              size="small"
              clearable
              placeholder="一句话说明何时使用该技能（Agent 依据它判断是否加载）"
              maxlength="200"
            />
          </div>
          <div class="ob-field">
            <label class="ob-field-label">所需变量</label>
            <el-input
              v-model="skillForm.envKeys"
              size="small"
              clearable
              placeholder="逗号分隔的环境变量名，如 GITHUB_TOKEN, NOTION_KEY"
            />
            <div class="ob-field-hint">技能声明运行所需的变量名；值统一在「我的资料 → 我的凭据」录入并绑定本技能</div>
          </div>
          <div class="ob-field ob-skill-content-field">
            <label class="ob-field-label">内容（Markdown 指令手册）</label>
            <el-input
              v-model="skillForm.content"
              type="textarea"
              class="ob-skill-content"
              placeholder="# 操作指南&#10;&#10;告诉 Agent 执行该类任务时的步骤、规范与注意事项…"
            />
          </div>
        </div>

        <footer class="ob-drawer-footer">
          <div class="ob-dialog-btns">
            <el-button size="small" round @click="dialogVisible = false">取消</el-button>
            <el-button size="small" round type="primary" @click="saveSkill">保存修改</el-button>
          </div>
        </footer>
      </div>
    </div>
  </transition>

  <!-- 导入 Skill：仅 ZIP 上传，内容简单 → 居中小弹窗（自绘 overlay：覆盖整个窗口含侧边栏） -->
  <transition v-else name="ob-modal">
    <div v-if="dialogVisible" class="ob-overlay" @click.self="dialogVisible = false">
      <div class="ob-dialog ob-dialog-skill">
        <header class="ob-dialog-header">
          <h3 class="ob-dialog-title">导入 Skill</h3>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="dialogVisible = false" />
        </header>

        <div class="ob-dialog-body">
          <!-- ZIP 导入 -->
          <div class="ob-field">
            <label class="ob-field-label">上传 Skill ZIP 包 <span class="ob-field-required">*</span></label>
            <div
              class="ob-zip-drop"
              :class="{ over: zipDragOver }"
              @click="pickZip"
              @dragover.prevent="zipDragOver = true"
              @dragleave="zipDragOver = false"
              @drop.prevent="onZipDrop"
            >
              <template v-if="!zipFile">
                <svg-icon icon-class="skill" class="ob-zip-ico" />
                <div class="ob-zip-title">点击或拖拽 ZIP 文件到此处</div>
                <div class="ob-zip-hint">仅支持 .zip 格式，大小不超过 10MB（需包含 SKILL.md）</div>
              </template>
              <template v-else>
                <div class="ob-zip-name">{{ zipFile.name }}</div>
                <div class="ob-zip-hint">{{ formatSize(zipFile.size) }} · 点击重新选择</div>
              </template>
              <input
                ref="zipInput"
                type="file"
                accept=".zip"
                style="display: none"
                @change="onZipPicked"
              />
            </div>
            <!-- 验证结果：选择文件后自动验证（通过显示名称/描述/文件数，失败显示原因） -->
            <div v-if="zipFile" class="ob-zip-validate-row">
              <span v-if="zipValidating" class="ob-zip-msg">
                <svg-icon icon-class="loading" class="ob-spin" /> 正在验证…
              </span>
              <span
                v-else-if="zipValidation"
                class="ob-zip-msg"
                :class="zipValidation.ok ? 'ok' : 'err'"
              >{{ zipValidationText }}</span>
            </div>
          </div>
          <div class="ob-field-hint ob-import-cred-tip">
            如技能需要密钥等凭据，导入后请在「我的资料 → 我的凭据」录入并绑定本技能
          </div>
        </div>

        <footer class="ob-dialog-footer">
          <div class="ob-dialog-btns">
            <el-button size="small" round @click="dialogVisible = false">取消</el-button>
            <el-button
              size="small"
              round
              type="primary"
              :loading="zipImporting"
              :disabled="!zipValidation || !zipValidation.ok"
              @click="importZipFile(false)"
            >确认导入</el-button>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup>
// 编辑 / 导入 Skill：编辑模式（抽屉）读取 SKILL.md 回填表单；
// 导入模式（小弹窗）为 ZIP 上传 → 自动验证 → 导入（同名二次确认覆盖）；凭据统一在「我的凭据」管理
import { ref, reactive, computed, watch } from 'vue'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'SkillImportDialog' })

const props = defineProps({
  // 弹窗显隐（父级 .sync 控制）
  visible: {
    type: Boolean,
    default: false
  },
  // 编辑中的 Skill（null 表示新建 / ZIP 导入）
  editing: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'saved'])

const { message, confirm } = useFeedback()

const skillForm = reactive({ name: '', description: '', content: '', envKeys: '' })
// ZIP 导入：文件持有 / 拖拽高亮 / 验证状态 / 导入中
const zipFile = ref(null)
const zipDragOver = ref(false)
const zipValidating = ref(false)
const zipValidation = ref(null)
const zipImporting = ref(false)
const zipInput = ref(null)

// 是否编辑模式（编辑时名称不可改，且不展示 ZIP 导入区）
const isEdit = computed(() => {
  return !!props.editing
})

// 弹窗显隐代理（transition 无 .sync，手动透传给父级）
const dialogVisible = computed({
  get() {
    return props.visible
  },
  set(v) {
    emit('update:visible', v)
  }
})

// ZIP 验证结果文案（通过：名称 + 描述 + 文件数 + 覆盖提示；失败：原因）
const zipValidationText = computed(() => {
  const v = zipValidation.value
  if (!v) return ''
  if (!v.ok) return v.error || '校验失败'
  let text = '通过：' + v.skillName
  if (v.description) text += ' · ' + v.description
  text += ' · ' + (v.fileCount || 0) + ' 个文件'
  if (v.exists) text += '（同名已存在，导入时将询问覆盖）'
  return text
})

function initForm() {
  if (props.editing) {
    loadSkill()
  } else {
    Object.assign(skillForm, { name: '', description: '', content: '', envKeys: '' })
    zipFile.value = null
    zipValidation.value = null
    zipDragOver.value = false
  }
}

// 编辑 Skill：读取 SKILL.md 内容回填抽屉（名称作为目录标识不可改）
function loadSkill() {
  const api = buddyApi()
  if (!api) {
    message.error('技能管理仅桌面端可用')
    dialogVisible.value = false
    return
  }
  const target = props.editing
  api.getSkill(target.dir).then(res => {
    if (res && res.ok && res.skill) {
      Object.assign(skillForm, {
        name: res.skill.name || target.name,
        description: res.skill.description || '',
        content: res.skill.content || '',
        envKeys: (res.skill.envKeys || []).join(', ')
      })
    } else {
      message.error((res && res.error) || '读取 Skill 失败')
      dialogVisible.value = false
    }
  })
}

function pickZip() {
  if (zipInput.value) zipInput.value.click()
}

function onZipDrop(e) {
  zipDragOver.value = false
  const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
  if (f) holdZip(f)
}

function onZipPicked(e) {
  const f = e.target && e.target.files && e.target.files[0]
  if (f) holdZip(f)
  e.target.value = ''
}

// 持有 ZIP 文件：格式与大小校验，选择后立即自动验证
function holdZip(file) {
  if (!/\.zip$/i.test(file.name)) {
    message.error('仅支持 .zip 文件')
    return
  }
  if (file.size > 10 * 1024 * 1024) {
    message.error('文件大小不能超过 10MB')
    return
  }
  zipFile.value = file
  zipValidation.value = null
  // 自动验证（上传即校验，无需手动点按钮）
  validateZipFile()
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / 1024 / 1024).toFixed(1) + ' MB'
}

// File → Uint8Array（IPC 结构化克隆传输）
async function zipBytes() {
  return new Uint8Array(await zipFile.value.arrayBuffer())
}

async function validateZipFile() {
  if (!zipFile.value) return
  const api = buddyApi()
  if (!api || !api.validateSkillZip) {
    message.error('技能管理仅桌面端可用')
    return
  }
  zipValidating.value = true
  try {
    zipValidation.value = await api.validateSkillZip(await zipBytes())
  } catch (e) {
    zipValidation.value = { ok: false, error: (e && e.message) || '校验失败' }
  } finally {
    zipValidating.value = false
  }
}

// 导入：同名已存在时二次确认覆盖（凭据统一在「我的资料 → 我的凭据」绑定）
async function importZipFile(overwrite) {
  const v = zipValidation.value
  if (!v || !v.ok) return
  if (v.exists && !overwrite) {
    confirm('同名 Skill「' + v.skillName + '」已存在，导入将覆盖其内容。继续吗？', '覆盖导入', {
      confirmButtonText: '覆盖导入',
      cancelButtonText: '取消',
      type: 'warning'
    }).then(() => importZipFile(true)).catch(() => {})
    return
  }
  const api = buddyApi()
  zipImporting.value = true
  try {
    const res = await api.importSkillZip({ data: await zipBytes(), overwrite: !!overwrite })
    if (!res || !res.ok) {
      message.error((res && res.error) || '导入失败')
      return
    }
    // 多 skill 包：包内子技能已随包平铺安装（pi 只扫一级目录，嵌套不生效）
    const extra = (res.extraSkills && res.extraSkills.length)
      ? '，附带安装子技能：' + res.extraSkills.join('、')
      : ''
    const skipped = (res.skippedSkills && res.skippedSkills.length)
      ? '；已存在跳过：' + res.skippedSkills.join('、') + '（覆盖导入可更新）'
      : ''
    message.success('Skill「' + res.skill.name + '」导入成功（' + res.skill.files + ' 个文件）' + extra + skipped)
    dialogVisible.value = false
    emit('saved')
  } catch (e) {
    message.error((e && e.message) || '导入失败')
  } finally {
    zipImporting.value = false
  }
}

// 保存编辑（新建走 ZIP 导入，表单保存仅用于已有 Skill 的编辑）
async function saveSkill() {
  const name = skillForm.name.trim()
  const description = skillForm.description.trim()
  if (!name || !description) {
    message.warning('请填写名称与描述')
    return
  }
  const api = buddyApi()
  if (!api) {
    message.error('技能管理仅桌面端可用')
    return
  }
  const res = await api.updateSkill({
    name,
    description,
    content: skillForm.content,
    envKeys: skillForm.envKeys.split(/[,，]/).map(s => s.trim()).filter(Boolean)
  })
  if (res && res.ok) {
    dialogVisible.value = false
    message.success('Skill 已更新，新会话生效')
    emit('saved')
  } else {
    message.error((res && res.error) || '更新失败')
  }
}

// 弹窗打开时按 editing 初始化（编辑读取远端内容 / 导入重置 ZIP 状态）
watch(() => props.visible, val => {
  if (val) initForm()
})
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 导入弹窗底部：引导到统一凭据入口 */
.ob-import-cred-tip {
  text-align: center;
}

/* 抽屉内长文手册：撑满剩余高度（抽屉 body 为 flex 列容器） */
.ob-skill-content-field {
  flex: 1;
  display: flex;
  flex-direction: column;

  .ob-skill-content {
    flex: 1;

    :deep(textarea){
      height: 100%;
      min-height: 320px;
      resize: none;
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      line-height: 1.7;
    }
  }
}
</style>
