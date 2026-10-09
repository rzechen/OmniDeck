<template>
  <!-- 规则编辑器（复用组件）：默认左编辑右预览分栏；单栏模式（solo）仅编辑区铺满。
       头部信息（标题/范围徽标）由父层卡片或弹窗自带，组件只负责编辑与保存；
       保存入口两种：自带底部保存栏（showFoot）或父层经 ref 调 save()（如 hero 统一保存按钮） -->
  <div class="ob-rule-editor" :class="{ solo: !showPreview }">
    <div class="ob-editor-split">
      <div class="ob-editor-pane">
        <div v-if="showPreview" class="ob-pane-head">编辑</div>
        <div class="ob-pane-body">
          <textarea
            v-model="form.content"
            class="ob-editor-textarea"
            spellcheck="false"
            :placeholder="placeholder"
          ></textarea>
        </div>
      </div>
      <div v-if="showPreview" class="ob-editor-pane">
        <div class="ob-pane-head">预览</div>
        <div class="ob-pane-body">
          <div v-if="form.content.trim()" class="md-preview ob-rule-preview" v-html="previewHtml" @click="onMdClick"></div>
          <div v-else class="ob-preview-empty">暂无内容，开始编写后此处实时预览</div>
        </div>
      </div>
    </div>

    <div v-if="showFoot" class="ob-editor-foot">
      <div class="ob-editor-tip">
        <span v-if="isDirty" class="ob-dirty-dot" title="有未保存的修改"></span>
        保存后新对话生效；内容清空并保存 = 删除该规则
      </div>
      <el-button size="small" round type="primary" :loading="saving" @click="save">保存</el-button>
    </div>
  </div>
</template>

<script setup>
// 规则编辑器复用组件：受控输入 + 自主保存（getRule/saveRule IPC），
// 父层负责标题展示与保存后的状态刷新（@saved 回调）
import { reactive, ref, computed, watch } from 'vue'
import { renderMarkdown, handleCodeCopy, handleTableCsv } from '@/utils/ui/markdown'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'RuleEditor' })

const props = defineProps({
  // 规则目标 key（'global' 或工作空间 id）
  targetKey: {
    type: String,
    required: true
  },
  // 打开时已保存内容（父层经 getRule 读好后传入）
  initialContent: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: ''
  },
  // 是否显示自带底部保存栏（父层提供统一保存入口时置 false）
  showFoot: {
    type: Boolean,
    default: true
  },
  // 是否显示右侧预览分栏（空间规则抽屉等单栏场景置 false，编辑区铺满）
  showPreview: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['saved'])
const { message } = useFeedback()

const form = reactive({ content: props.initialContent })
const savedContent = ref(props.initialContent)
const saving = ref(false)

const previewHtml = computed(() => {
  return renderMarkdown(form.content)
})
const isDirty = computed(() => {
  return form.content !== savedContent.value
})

// 父层切换目标（如切换工作空间）时重置编辑器
watch(() => props.targetKey, () => {
  form.content = props.initialContent
  savedContent.value = props.initialContent
})
watch(() => props.initialContent, v => {
  form.content = v
  savedContent.value = v
})

function onMdClick(e) {
  handleCodeCopy(e).then(ok => {
    if (ok) message.success('已复制')
  })
  handleTableCsv(e).then(ok => {
    if (ok) message.success('已下载 CSV')
  })
}
function buddyApi() {
  return (window.electronAPI && window.electronAPI.omnibuddy) || null
}
async function save() {
  const api = buddyApi()
  if (!api || !api.saveRule) return
  saving.value = true
  try {
    const res = await api.saveRule({ key: props.targetKey, content: form.content })
    if (res && res.ok) {
      savedContent.value = form.content
      message.success('已保存，新对话生效')
      emit('saved', { key: props.targetKey, content: form.content })
    } else {
      message.error((res && res.error) || '保存失败')
    }
  } finally {
    saving.value = false
  }
}

// 父层经 ref 调 save()（如 hero 统一保存按钮）
defineExpose({ save })
</script>

<style lang="scss" scoped>
/* ============ 内嵌分栏编辑器（自原项目规则页抽离，样式随组件走） ============ */
.ob-rule-editor {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  padding: 14px 20px 12px;
  gap: 10px;
}

.ob-dirty-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--warning-color);
}

.ob-editor-split {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 14px;
}

/* 单栏模式：编辑区铺满（无分栏间距，textarea 行高更舒展） */
.ob-rule-editor.solo .ob-editor-split {
  gap: 0;
}

.ob-editor-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  overflow: hidden;
}

.ob-pane-head {
  flex-shrink: 0;
  padding: 8px 14px;
  font-size: 11px;
  font-weight: 600;
  color: $text-secondary;
  border-bottom: 1px solid var(--border-color);
  background: $search-bg;
}

.ob-pane-body {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: auto;
}

.ob-editor-textarea {
  flex: 1;
  width: 100%;
  padding: 14px 16px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  color: $text-primary;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.7;

  &::placeholder {
    color: $text-secondary;
    opacity: 0.6;
  }
}

.ob-preview-empty {
  margin: auto;
  font-size: 12px;
  color: $text-secondary;
  opacity: 0.7;
}

/* 底部操作栏：左侧提示（含未保存圆点），右下角保存 */
.ob-editor-foot {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.ob-editor-tip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 11.5px;
  color: $text-secondary;
  min-width: 0;
}

/* Markdown 预览（GitHub 风格 + 主题变量适配） */
.md-preview {
  padding: 16px 20px 26px;
  font-size: 13.5px;
  line-height: 1.75;
  color: var(--text-primary);
  word-break: break-word;

  :deep(h1), :deep(h2), :deep(h3), :deep(h4), :deep(h5), :deep(h6) {
    margin: 1.15em 0 0.55em;
    font-weight: 700;
    line-height: 1.35;

    &:first-child {
      margin-top: 0.2em;
    }
  }

  :deep(h1) { font-size: 1.6em; padding-bottom: 0.35em; border-bottom: 1px solid var(--border-color); }
  :deep(h2) { font-size: 1.3em; padding-bottom: 0.3em; border-bottom: 1px solid var(--border-color); }
  :deep(h3) { font-size: 1.15em; }
  :deep(h4) { font-size: 1.02em; }

  :deep(p) { margin: 0.6em 0; }

  :deep(a) {
    color: var(--primary-color);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }

  :deep(strong) { font-weight: 700; }

  :deep(ul), :deep(ol) {
    padding-left: 1.6em;
    margin: 0.5em 0;

    li { margin: 0.25em 0; }
    li::marker { color: var(--text-secondary); }
  }

  :deep(blockquote) {
    margin: 0.9em 0;
    padding: 0.35em 1em;
    border-left: 3px solid var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.05);
    border-radius: 0 6px 6px 0;
    color: var(--text-secondary);

    p { margin: 0.35em 0; }
  }

  :deep(hr) {
    border: none;
    border-top: 1px solid var(--border-color);
    margin: 1.6em 0;
  }

  :deep(code) {
    background: var(--search-bg);
    padding: 2px 6px;
    border-radius: 5px;
    font-size: 0.88em;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    color: #C41A16;
  }

  :deep(.ob-code pre) {
    margin: 0;
    padding: 13px 15px;
    border: none;
    border-radius: 0;
    background: transparent;
  }

  :deep(pre) {
    margin: 0.9em 0;
    padding: 13px 15px;
    background: var(--search-bg);
    border: 1px solid var(--border-color);
    border-radius: 10px;
    overflow: auto;

    code {
      display: block;
      background: none;
      padding: 0;
      border-radius: 0;
      color: var(--text-primary);
      font-size: 12.5px;
      line-height: 1.65;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
    }
  }

  :deep(table) {
    border-collapse: collapse;
    margin: 0;

    th, td {
      border: 1px solid var(--border-color);
      padding: 7px 12px;
      text-align: left;
    }

    th {
      background: var(--search-bg);
      font-weight: 600;
    }
  }

  :deep(img) { max-width: 100%; border-radius: 8px; }
}
</style>
