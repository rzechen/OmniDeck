<template>
  <div
    class="image-drop"
    :class="{ 'is-over': isOver, 'is-compact': compact }"
    @click="pick"
    @drop.prevent="onDrop"
    @dragover.prevent="isOver = true"
    @dragleave.prevent="isOver = false"
  >
    <input ref="file" type="file" class="hidden-input" :accept="accept" :multiple="multiple" @change="onChange" />
    <template v-if="compact">
      <svg-icon icon-class="plus" class-name="plus-dot" />
      <p v-if="compactLabel" class="drop-compact-title">{{ compactLabel }}</p>
    </template>
    <template v-else>
      <svg-icon icon-class="upload" />
      <p class="drop-title">拖拽图片到这里，或点击选择</p>
      <p class="drop-hint">{{ hint }}</p>
    </template>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useFeedback } from '@/composables/useFeedback'

// 图像工具共享：拖拽/点击上传组件
defineOptions({ name: 'ImageDrop' })

// 声明自定义事件，阻止 @change 监听器 fallthrough 到根元素成为原生 change 监听
// （否则 input 的原生 change 事件冒泡后会用 Event 对象再次触发父级处理器，覆盖 File）
const emit = defineEmits(['change'])

const props = defineProps({
  accept: { type: String, default: 'image/*' },
  multiple: { type: Boolean, default: false },
  compact: { type: Boolean, default: false },
  // 紧凑模式下显示的文字（为空则仅显示 + 号）
  compactLabel: { type: String, default: '' },
  hint: { type: String, default: '支持 PNG / JPEG / WEBP / GIF / BMP' }
})

const { message } = useFeedback()

const isOver = ref(false)
const file = ref(null)

function pick() {
  file.value.click()
}
function emitFiles(fileList) {
  const files = [...fileList].filter(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp)$/i.test(f.name))
  if (!files.length) {
    message.warning('请选择图片文件')
    return
  }
  emit('change', props.multiple ? files : files[0])
}
function onDrop(e) {
  isOver.value = false
  emitFiles(e.dataTransfer.files)
}
function onChange(e) {
  emitFiles(e.target.files)
  e.target.value = ''
}
</script>

<style lang="scss" scoped>
.image-drop {
  border: 1.5px dashed var(--border-color);
  border-radius: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  transition: all 0.18s ease;
  -webkit-app-region: no-drag;

  &:not(.is-compact) {
    padding: 40px 20px;
    width: 100%;
    flex: 1;
  }

  &.is-compact {
    width: 92px;
    height: 92px;

    i {
      font-size: 22px;
    }
  }

  &:hover,
  &.is-over {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    background: rgba(var(--primary-color-rgb), 0.04);
    color: var(--primary-color);
  }

  .drop-compact-title {
    font-size: 12px;
    font-weight: 500;
  }

  .drop-title {
    font-size: 13px;
    font-weight: 500;
  }

  .drop-hint {
    font-size: 11px;
  }

  svg:not(.plus-dot) {
    font-size: 32px;
    opacity: 0.5;
  }
}

.hidden-input {
  display: none;
}
</style>
