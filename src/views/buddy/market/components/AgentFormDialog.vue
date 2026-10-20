<template>
  <!-- 新增 / 编辑专家：内容密集（系统提示词长文）→ 右侧全高抽屉 -->
  <transition name="ob-drawer">
    <div v-if="dialogVisible" class="ob-drawer" @click.self="dialogVisible = false">
      <div class="ob-drawer-panel" style="--ob-drawer-w: 720px">
        <header class="ob-drawer-header">
          <h3 class="ob-dialog-title">{{ isEdit ? '编辑专家' : '新增专家' }}</h3>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="dialogVisible = false" />
        </header>

        <div class="ob-drawer-body">
          <div class="ob-field">
            <label class="ob-field-label">名称 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="agentForm.name"
              size="small"
              clearable
              :disabled="isEdit"
              placeholder="字母、数字、连字符，如 code-reviewer"
              maxlength="64"
            />
            <div class="ob-field-hint">调用标识；新建后不可修改</div>
          </div>
          <div class="ob-field">
            <label class="ob-field-label">描述 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="agentForm.description"
              size="small"
              clearable
              placeholder="一句话说明何时委派给该专家（主会话依据它路由）"
              maxlength="200"
            />
          </div>
          <div class="ob-field">
            <label class="ob-field-label">可用工具</label>
            <el-input
              v-model="agentForm.tools"
              size="small"
              clearable
              placeholder="逗号分隔，如 read, grep, bash；留空则使用默认内置工具"
            />
            <div class="ob-field-hint">
              仅支持 pi 内置工具、联网工具与连接器（mcp:服务器名）；curl / python 等宿主扩展工具写入会报错
            </div>
          </div>
          <div class="ob-field ob-agent-content-field">
            <label class="ob-field-label">系统提示词 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="agentForm.content"
              type="textarea"
              class="ob-agent-content"
              placeholder="# 角色与职责&#10;&#10;定义该专家的角色、工作方式与交付要求…"
            />
          </div>
        </div>

        <footer class="ob-drawer-footer">
          <div class="ob-dialog-btns">
            <el-button size="small" round @click="dialogVisible = false">取消</el-button>
            <el-button size="small" round type="primary" @click="saveAgent">保存</el-button>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup>
// 新增 / 编辑专家（agents/<name>.md）：4 要素表单——名称 / 描述 / 可用工具 / 系统提示词。
// 编辑时按 file 定位读取回填；名称即文件名（调用标识），编辑态不可改
import { ref, reactive, computed, watch } from 'vue'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'AgentFormDialog' })

const props = defineProps({
  // 弹窗显隐（父级 v-model:visible 控制）
  visible: {
    type: Boolean,
    default: false
  },
  // 编辑中的专家（null 表示新增）
  editing: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['update:visible', 'saved'])

const { message } = useFeedback()

const agentForm = reactive({ name: '', description: '', tools: '', content: '' })
const saving = ref(false)

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

function initForm() {
  if (props.editing) {
    loadAgent()
  } else {
    Object.assign(agentForm, { name: '', description: '', tools: '', content: '' })
  }
}

// 编辑专家：读取 .md 回填抽屉（名称作为文件名不可改）
function loadAgent() {
  const api = buddyApi()
  if (!api || !api.agents) {
    message.error('专家管理仅桌面端可用')
    dialogVisible.value = false
    return
  }
  api.agents.get(props.editing.file).then(res => {
    if (res && res.ok && res.agent) {
      Object.assign(agentForm, {
        name: res.agent.name || props.editing.name,
        description: res.agent.description || '',
        tools: (res.agent.tools || []).join(', '),
        content: res.agent.content || ''
      })
    } else {
      message.error((res && res.error) || '读取专家失败')
      dialogVisible.value = false
    }
  })
}

async function saveAgent() {
  const name = agentForm.name.trim()
  const description = agentForm.description.trim()
  const content = agentForm.content.trim()
  if (!name || !description || !content) {
    message.warning('请填写名称、描述与系统提示词')
    return
  }
  const api = buddyApi()
  if (!api || !api.agents) {
    message.error('专家管理仅桌面端可用')
    return
  }
  saving.value = true
  try {
    const tools = agentForm.tools.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    const res = isEdit.value
      ? await api.agents.update({
        file: props.editing.file,
        name,
        description,
        content: agentForm.content,
        tools
      })
      : await api.agents.create({ name, description, content: agentForm.content, tools })
    if (res && res.ok) {
      dialogVisible.value = false
      message.success(isEdit.value ? '专家已更新，新会话生效' : '专家「' + name + '」创建成功')
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

// 弹窗打开时按 editing 初始化（编辑读取内容回填 / 新增重置表单）
watch(() => props.visible, val => {
  if (val) initForm()
})
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 抽屉内系统提示词长文：撑满剩余高度（抽屉 body 为 flex 列容器） */
.ob-agent-content-field {
  flex: 1;
  display: flex;
  flex-direction: column;

  .ob-agent-content {
    flex: 1;

    :deep(textarea) {
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
