<template>
  <!-- 底部问答输入框（对齐 PC BuddyComposer 形态）：大圆角气泡容器 +
       多行输入区 + 底部工具栏（slot 注入空间/模型切换）+ 右侧发送 -->
  <div class="composer">
    <div class="composer-box" :class="{ focus: isFocus, disabled }">
      <textarea
        ref="taRef"
        v-model="text"
        :placeholder="placeholder"
        :disabled="disabled"
        rows="2"
        @input="autoSize"
        @focus="isFocus = true"
        @blur="isFocus = false"
      ></textarea>
      <div class="composer-bar">
        <!-- 工具栏左侧：空间/模型切换（经 slot 注入，与 PC tools slot 同构） -->
        <div class="composer-tools"><slot name="tools"></slot></div>
        <!-- 运行中变停止键：中断当前任务执行 -->
        <button
          class="send" :class="{ ready: canSend, stop: running }"
          :disabled="btnDisabled" :title="running ? '停止' : '发送'"
          @click="onBtn"
        >
          <span class="ico" v-html="running ? stopIcon : topIcon"></span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
// 通用底部输入框（新建任务页 / 详情页追问共用）。
// 移动端惯例：Enter 换行、右下按钮发送（多行文本区，非单行输入）
import { ref, computed, nextTick } from 'vue'
import topIcon from '@/assets/icons/svg/buddy/top.svg?raw'
import stopIcon from '@/assets/icons/svg/buddy/stop.svg?raw'

const props = defineProps({
  placeholder: { type: String, default: '描述要执行的任务…' },
  disabled: { type: Boolean, default: false },
  running: { type: Boolean, default: false }
})
const emit = defineEmits(['send', 'stop'])

const text = ref('')
const taRef = ref(null)
const isFocus = ref(false)

const canSend = computed(() => !!text.value.trim() && !props.disabled)
// 运行中按钮始终可点（变停止键）；空闲时仅有内容才可发
const btnDisabled = computed(() => !props.running && !canSend.value)

function autoSize() {
  const el = taRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 160) + 'px'
}

function submit() {
  const t = text.value.trim()
  if (!t || props.disabled) return
  emit('send', t)
  text.value = ''
  taRef.value && taRef.value.blur() // 发送即收起键盘（移动端惯例：发送后专注看回答）
  nextTick(autoSize)
}

function onBtn() {
  if (props.running) { emit('stop'); return }
  submit()
}
</script>

<style>
.composer {
  flex: none; padding: 8px 14px calc(10px + env(safe-area-inset-bottom));
  background: var(--bg);
}
/* 气泡容器（对齐 PC bc-box）：细边框 + 聚焦品牌色描边 */
.composer-box {
  border: 1px solid var(--line); border-radius: 20px;
  background: var(--card); padding: 12px 6px 8px 14px;
  display: flex; flex-direction: column; gap: 6px;
  transition: border-color .18s ease;
}
.composer-box.focus { border-color: color-mix(in srgb, var(--brand) 55%, transparent); }
.composer-box.disabled { opacity: .6; }
.composer textarea {
  display: block; width: 100%; min-height: 44px; max-height: 160px;
  resize: none; border: none; outline: none; background: transparent;
  color: var(--text); -webkit-appearance: none;
  /* 不用 font 简写：`font: 16px/1.6 inherit` 是非法声明（CSS 宽关键字
     不能作简写分量），整条会被浏览器丢弃 → 回退 iOS 默认 13px 小字。
     line-height 用固定 22px：iOS caret 高度 = line-height，1.6 倍行距
     会让回车后的光标高达 25.6px 显得过大 */
  font-family: inherit; font-size: 16px; line-height: 22px;
  overflow-y: auto;
}
.composer textarea::placeholder { color: var(--muted); }
/* 底部工具栏：左切换控件 + 右发送 */
.composer-bar { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.composer-tools { display: flex; align-items: center; gap: 2px; min-width: 0; }
.composer .send {
  flex: none; width: 36px; height: 36px; padding: 0; border-radius: 50%;
  background: var(--card2); color: #C0C4CC;
  display: flex; align-items: center; justify-content: center;
  transition: background .18s ease;
}
.composer .send.ready { background: var(--brand); color: #fff; }
.composer .send:active { transform: scale(.9); }
.composer .send svg { width: 17px; height: 17px; }
/* 运行中停止键：红色警示底（与审批抽屉 deny 同色系） */
.composer .send.stop { background: var(--red); color: #fff; }
</style>
