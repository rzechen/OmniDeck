<template>
  <div class="bc-composer">
    <!-- 输入容器：豆包风格大圆角气泡（拖入文件时高亮提示） -->
    <div
      class="bc-box"
      :class="{ focus: isFocus, drag: isDrag }"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <!-- 划选追问引用条（消息区划选后点「追问」：引用原文置顶展示，可关闭） -->
      <div v-if="quote" class="bc-quote">
        <div class="bc-quote-body">
          <div class="bc-quote-label">引用</div>
          <div class="bc-quote-text" :title="quote">{{ quote }}</div>
        </div>
        <button class="bc-quote-close" title="移除引用" @click="emit('remove-quote')">
          <svg-icon icon-class="close" />
        </button>
      </div>

      <!-- 待发送文件附件条（"+"选择/拖拽/粘贴导入：图片与文件统一卡片样式，
           图标按后缀映射，与工作空间文件列表一致；文件名下显示大小与解析态） -->
      <div v-if="files && files.length" class="bc-attachments">
        <div v-for="(f, i) in files" :key="f.id || i" class="bc-attachment" :class="{ failed: f.parseStatus === 'failed' }">
          <img v-if="f.kind === 'image' && f.thumb" class="bc-attachment-thumb" :src="f.thumb" alt="" draggable="false" />
          <img v-else class="bc-attachment-thumb" :src="fileIcon(f.name)" alt="" draggable="false" />
          <span class="bc-file-info">
            <span class="bc-file-name" :title="f.name">{{ f.name }}</span>
            <span class="bc-file-meta">
              <template v-if="f.parseStatus === 'parsing'"><i class="bc-spin"></i>解析中…</template>
              <template v-else-if="f.parseStatus === 'failed'">解析失败，发送时重试</template>
              <template v-else-if="f.parseStatus === 'ready'">
                <svg class="bc-ok" viewBox="0 0 16 16" fill="none"><path d="M3.5 8.5l3 3 6-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
                {{ formatSize(f.size) }} · 已解析<template v-if="f.chars">约{{ formatChars(f.chars) }}字</template>
              </template>
              <template v-else>{{ formatSize(f.size) }}</template>
            </span>
          </span>
          <button class="bc-attachment-remove" title="移除" @click="emit('remove-file', i)">
            <svg-icon icon-class="close" />
          </button>
        </div>
      </div>

      <!-- 多行输入：自动增高（粘贴文件转附件）；流式生成中禁用输入；
           composition 事件跟踪中文输入法组合态（组合中回车 = 确认候选词，不发送） -->
      <textarea
        ref="ta"
        class="bc-textarea"
        :value="modelValue"
        :placeholder="actualPlaceholder"
        :disabled="streaming"
        rows="1"
        @input="onInput"
        @focus="isFocus = true"
        @blur="isFocus = false"
        @compositionstart="isComposing = true"
        @compositionend="isComposing = false"
        @keydown.enter.exact.prevent="onEnter"
        @paste="onPaste"
      ></textarea>

      <!-- 底部工具栏：左扩展（工作空间/模型选择等经插槽注入） + 右发送 -->
      <div class="bc-toolbar">
        <div class="bc-tools">
          <slot name="tools"></slot>
          <button
            v-if="attachEnabled"
            class="bc-tool-btn"
            title="添加附件（图片 / 文本 / PDF，支持拖入）"
            @click="emit('pick')"
          >
            <svg-icon icon-class="circle-plus-outline" />
          </button>
        </div>

        <!-- 发送 / 停止：同一位置，流式生成时切换为停止 -->
        <button
          v-if="!streaming"
          class="bc-send"
          :class="{ ready: canSend }"
          :title="canSend ? '发送（Enter）' : '输入内容后发送'"
          @click="onSend"
        >
          <svg-icon icon-class="top" />
        </button>
        <button
          v-else
          class="bc-send bc-stop"
          title="停止生成"
          @click="emit('stop')"
        >
          <svg-icon icon-class="stop" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// OmniBuddy 对话输入框：豆包风格（大圆角气泡 + 左工具 + 右下圆形发送）
import { ref, computed, watch, nextTick, onMounted } from 'vue'
import { fileIcon, formatSize } from '@/utils/ui/file-meta'

defineOptions({ name: 'BuddyComposer' })

const props = defineProps({
  modelValue: {
    type: String,
    default: ''
  },
  placeholder: {
    type: String,
    default: '有什么可以帮您？（Enter 发送，Shift+Enter 换行）'
  },
  // 流式生成中：发送按钮切换为停止按钮
  streaming: {
    type: Boolean,
    default: false
  },
  // 附加可发送条件（如已有附件时无文本也允许发送）
  extraSendable: {
    type: Boolean,
    default: false
  },
  // 待发送文件附件（[{id,name,size,kind,thumb}]）：图片缩略图 + 文本/PDF 文件胶囊
  files: {
    type: Array,
    default: null
  },
  // 是否展示"+"附件按钮（快捷面板等场景可关闭）
  attachEnabled: {
    type: Boolean,
    default: true
  },
  // 划选追问引用的原文（非空时在输入框顶部展示引用条，随消息一并发送）
  quote: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['update:modelValue', 'send', 'stop', 'pick', 'import-file', 'remove-quote', 'remove-file'])

const isFocus = ref(false)
const isDrag = ref(false)
// 中文输入法组合中（组合态回车 = 确认候选词，不触发发送）
const isComposing = ref(false)
const ta = ref(null)

const canSend = computed(() => !!(props.modelValue && props.modelValue.trim()) || props.extraSendable)
// 流式生成中锁定输入（placeholder 同步提示，避免误以为可继续提问）
const actualPlaceholder = computed(() => props.streaming ? '回答生成中，可点击右下角停止…' : props.placeholder)

// 内容变化后自适应高度
watch(() => props.modelValue, () => {
  nextTick(autoResize)
})

onMounted(() => {
  autoResize()
})

function onInput(e) {
  emit('update:modelValue', e.target.value)
}
// 回车发送：输入法组合中（确认候选词的回车）不发送。
// Chrome 下确认候选词时 keydown 先于 compositionend 触发且 isComposing 仍为 true，
// 自维护标志与事件原生 isComposing 双重判定兜底（Safari 时序差异）
function onEnter(e) {
  if (isComposing.value || e.isComposing) return
  onSend()
}
// 粘贴含文件时转为附件：拦截默认行为（截图/图片/文本/PDF 全支持，
// 与拖拽同管道）；纯文本粘贴走默认行为
function onPaste(e) {
  const items = e.clipboardData && e.clipboardData.items
  if (!items) return
  const files = []
  for (const it of items) {
    if (it.kind !== 'file') continue
    const f = it.getAsFile()
    if (f) files.push(f)
  }
  if (!files.length) return
  e.preventDefault()
  for (const f of files) emit('import-file', f)
}
// ===== 拖拽导入：File 对象直接上抛（父层统一导入：有磁盘路径按路径、
// 无路径读内容走 Buffer 管道），stopPropagation 避免与页面级拖放区重复处理 =====
function onDragOver(e) {
  if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return
  isDrag.value = true
}
function onDragLeave() {
  isDrag.value = false
}
function onDrop(e) {
  e.stopPropagation()
  isDrag.value = false
  const files = e.dataTransfer && e.dataTransfer.files
  if (!files || !files.length) return
  for (const f of files) emit('import-file', f)
}
function onSend() {
  if (!canSend.value) return
  emit('send', props.modelValue)
}
// 解析字符数（中文场景直接按字符计）：过万缩为「x.x万」
function formatChars(n) {
  if (!n) return '0'
  if (n >= 10000) return (n / 10000).toFixed(1) + '万'
  return String(n)
}
// 聚焦输入框（划选追问引用后调用，直接续问）
function focus() {
  const el = ta.value
  if (!el) return
  el.focus()
  const len = el.value.length
  try { el.setSelectionRange(len, len) } catch (e) { /* 忽略 */ }
}
// 高度自适应：清零后按 scrollHeight 恢复，封顶 220px
function autoResize() {
  const el = ta.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.max(68, Math.min(el.scrollHeight, 220)) + 'px'
}

// 父层经 ref 调用 focus 聚焦输入框
defineExpose({ focus })
</script>

<style lang="scss" scoped>
.bc-composer {
  width: 100%;
  max-width: 768px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

/* 输入容器：悬浮卡片式大圆角气泡（1px 细边框 + 轻阴影；hover 边框清晰浮现） */
.bc-box {
  border: 1px solid var(--border-color);
  border-radius: 22px;
  background: var(--card-bg, #fff);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  padding: 12px 12px 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.35);
  }

  &.focus {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.12), 0 4px 18px rgba(var(--primary-color-rgb), 0.1);
  }
}

/* ===== 划选追问引用条（气泡顶部：竖线标 + 引用原文摘要 + 关闭） ===== */
.bc-quote {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 7px 4px 7px 12px;
  border-left: 3px solid rgba(var(--primary-color-rgb), 0.5);
  border-radius: 4px 10px 10px 4px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
}

.bc-quote-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bc-quote-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-secondary);
  user-select: none;
}

.bc-quote-text {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--text-secondary);
  white-space: pre-wrap;
  word-break: break-word;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  overflow: hidden;
  user-select: text;
}

.bc-quote-close {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  transition: all 0.12s ease;

  .svg-icon {
    font-size: 11px;
  }

  &:hover {
    background: rgba(0, 0, 0, 0.06);
    color: var(--text-primary);
  }
}

/* 待发送附件条（内置于气泡顶部） */
.bc-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 4px 4px;
}

.bc-attachment {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 44px;
  min-width: 110px;
  max-width: 220px;
  padding: 0 24px 0 5px;
  border-radius: 10px;
  border: 1px solid var(--border-color);
  background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
  overflow: hidden;

  /* 解析失败态：红色描边提示 */
  &.failed {
    border-color: rgba(226, 82, 82, 0.5);
  }
}

/* 左侧 30px 预览位：图片缩略图 / 按后缀映射的类型图标（与工作空间一致） */
.bc-attachment-thumb {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  object-fit: contain;
  display: block;
}

/* 文件名 + meta（大小/解析态）纵排 */
.bc-file-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.bc-file-name {
  font-size: 12px;
  line-height: 1.3;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bc-file-meta {
  font-size: 10.5px;
  line-height: 1.3;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  display: flex;
  align-items: center;
  gap: 3px;
}

/* 解析中转圈 */
.bc-spin {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1.5px solid rgba(var(--primary-color-rgb), 0.25);
  border-top-color: var(--primary-color);
  animation: bc-rotate 0.7s linear infinite;
  flex-shrink: 0;
}

/* 解析成功对勾（绿色，与 meta 行内联） */
.bc-ok {
  width: 11px;
  height: 11px;
  color: #22a55e;
  flex-shrink: 0;
}

@keyframes bc-rotate {
  to {
    transform: rotate(360deg);
  }
}

/* 拖拽悬停高亮 */
.bc-box.drag {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.18), 0 4px 18px rgba(var(--primary-color-rgb), 0.12);
}

.bc-attachment-remove {
  position: absolute;
  top: 50%;
  right: 4px;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.08);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transition: opacity 0.15s ease;

  .svg-icon {
    font-size: 10px;
  }
}

.bc-attachment:hover .bc-attachment-remove {
  opacity: 1;
}

.bc-textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-primary);
  font-family: inherit;
  min-height: 22px;
  max-height: 160px;
  overflow-y: auto;

  &::placeholder {
    color: var(--text-secondary);
  }

  &::-webkit-scrollbar {
    width: 4px;
  }

  /* 流式生成中禁用：不可键入/粘贴，文字弱化提示锁定态 */
  &:disabled {
    cursor: not-allowed;
    -webkit-text-fill-color: var(--text-secondary);
  }
}

/* 底部工具栏 */
.bc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bc-tools {
  display: flex;
  align-items: center;
  gap: 2px;
}

.bc-tool-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 16px;
  }

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.08);
    color: var(--primary-color);
  }

  &:active {
    transform: scale(0.9);
  }
}

/* 发送按钮：圆形，激活渐变 */
.bc-send {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: var(--border-color, #e5e5e5);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);

  .svg-icon {
    font-size: 15px;
  }

  &.ready {
    background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
    color: #fff;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(var(--primary-color-rgb), 0.35);

    &:hover {
      filter: brightness(1.08);
      transform: translateY(-1px);
    }

    &:active {
      transform: scale(0.88);
    }
  }
}

/* 停止按钮：与发送按钮同位切换，激活渐变外观 */
.bc-stop {
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  color: #fff;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(var(--primary-color-rgb), 0.35);

  .svg-icon {
    font-size: 14px;
  }

  &:hover {
    filter: brightness(1.08);
  }

  &:active {
    transform: scale(0.88);
  }
}
</style>
