<template>
  <!-- 划选工具条：消息区划选文字后浮现（复制 / 追问），fixed 定位跟随选区 -->
  <transition name="ob-selbar">
    <div
      v-if="visible"
      class="ob-selbar"
      :style="{ top: top + 'px', left: left + 'px' }"
      @mousedown.prevent
    >
      <div class="ob-selbar-item" title="复制选中内容" @click="copySel">
        <svg-icon icon-class="copy" class="ob-selbar-ico" />
        <span>复制</span>
      </div>
      <div class="ob-selbar-item" title="引用选中内容继续追问" @click="quoteSel">
        <svg-icon icon-class="followup" class="ob-selbar-ico" />
        <span>追问</span>
      </div>
    </div>
  </transition>
</template>

<script setup>
// 划选工具条（豆包风格深色浮条）：监听 document mouseup / selectionchange，
// 选区落在指定容器（消息区）内时按选区矩形定位显示「复制 / 追问」。
// 生命周期由父组件显式管理（setup / teardown）：keep-alive 切走时须移除监听。
import { ref, onBeforeUnmount } from 'vue'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'SelectionToolbar' })

const props = defineProps({
  // 划选作用域容器 getter（返回消息滚动区 HTMLElement；函数实时取值，规避 prop 时序）
  getArea: {
    type: Function,
    default: null
  }
})

const emit = defineEmits(['quote'])

const { message } = useFeedback()

const visible = ref(false)
const text = ref('')
const top = ref(0)
const left = ref(0)

// 已绑定 scroll 隐藏的容器（teardown 时解绑）
let areaEl = null

onBeforeUnmount(() => {
  teardown()
})

// ===== 监听挂载 / 移除（父级 activated / deactivated 调用） =====
function setup() {
  document.addEventListener('mouseup', onMouseUp)
  document.addEventListener('selectionchange', onSelChange)
  window.addEventListener('resize', hide)
  bindAreaScroll(true)
}

function teardown() {
  document.removeEventListener('mouseup', onMouseUp)
  document.removeEventListener('selectionchange', onSelChange)
  window.removeEventListener('resize', hide)
  bindAreaScroll(false)
  hide()
}

// 消息区滚动即隐藏（选区矩形随滚动失效）
function bindAreaScroll(on) {
  if (areaEl) {
    areaEl.removeEventListener('scroll', hide)
    areaEl = null
  }
  if (on) {
    const el = props.getArea && props.getArea()
    if (el) {
      areaEl = el
      areaEl.addEventListener('scroll', hide, { passive: true })
    }
  }
}

function onMouseUp() {
  // mouseup 后选区才最终确定，延后一帧取稳定状态
  setTimeout(() => evaluate(), 0)
}

// 选区被折叠（点击空白 / 开始新选择）时立即隐藏
function onSelChange() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) hide()
}

function evaluate() {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || !sel.rangeCount) return hide()
  const range = sel.getRangeAt(0)
  const node = range.commonAncestorContainer
  const el = node.nodeType === 1 ? node : node.parentElement
  // 选区必须落在消息区内（排除输入框 / 工具条自身 / 其他区域）
  const area = props.getArea && props.getArea()
  if (!area || !el || !area.contains(el)) return hide()
  const selText = String(sel.toString() || '').trim()
  if (!selText) return hide()
  const rect = range.getBoundingClientRect()
  if (!rect || (!rect.width && !rect.height)) return hide()

  text.value = selText
  // 浮条预估尺寸（宽 ~140 / 高 ~40）：选区上方居中，贴顶时翻到下方，左右越界钳制
  const W = 140
  const H = 44
  const vw = window.innerWidth
  let posLeft = rect.left + rect.width / 2 - W / 2
  posLeft = Math.max(8, Math.min(posLeft, vw - W - 8))
  let posTop
  if (rect.top - H - 6 >= 8) {
    posTop = rect.top - H - 6
  } else {
    posTop = rect.bottom + 6
  }
  left.value = Math.round(posLeft)
  top.value = Math.round(posTop)
  visible.value = true
}

function hide() {
  visible.value = false
}

function copySel() {
  const selText = text.value
  hide()
  if (!selText) return
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(selText).then(
      () => message.success('已复制'),
      () => message.error('复制失败')
    )
  } else {
    message.error('当前环境不支持复制')
  }
}

function quoteSel() {
  const selText = text.value
  hide()
  if (selText) emit('quote', selText)
}

// 父组件经模板 ref 显式管理监听生命周期（setup / teardown）
defineExpose({ setup, teardown })
</script>

<style lang="scss" scoped>
/* 深色浮条（豆包划选工具条风格） */
.ob-selbar {
  position: fixed;
  z-index: 3000;
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 5px 6px;
  border-radius: 12px;
  background: #1f2023;
  color: rgba(255, 255, 255, 0.92);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  user-select: none;
  cursor: default;
}

.ob-selbar-item {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: 8px;
  font-size: 13px;
  line-height: 1;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.14);
  }

  &:active {
    transform: scale(0.96);
  }
}

.ob-selbar-ico {
  font-size: 16px;
}

/* 浮条浮现过渡（旧版过渡类名） */
.ob-selbar-enter-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.ob-selbar-leave-active {
  transition: opacity 0.1s ease;
}

.ob-selbar-enter,
.ob-selbar-leave-to {
  opacity: 0;
  transform: translateY(3px);
}
</style>
