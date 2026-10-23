<template>
  <!-- ask_user 问答抽屉（交互对齐 PC AskUserCard）：问题 + 选项 chips +
       「其它」自由输入。单选点选即提交；多选勾选后统一提交（「；」连接）。
       抽屉 fixed 相对布局视口，键盘弹出会盖住下半部 → kbGap 底部补偿 -->
  <el-drawer
    v-model="sheet"
    direction="btt"
    size="auto"
    :with-header="false"
    class="ask-drawer"
  >
    <div class="ask-pad" :style="kbGap ? { paddingBottom: kbGap + 'px' } : null">
      <div class="ask-head">
        <span class="ico ask-ico" v-html="chatIcon"></span>
        <div class="ask-q">{{ question }}</div>
        <span v-if="queue > 1" class="ask-queue">还有 {{ queue - 1 }} 项待回答</span>
        <button class="ask-close" title="关闭" @click="sheet = false">
          <span class="ico" v-html="closeIcon"></span>
        </button>
      </div>

      <div class="ask-form">
        <!-- 选项 chips + 固定「其它」项 -->
        <div v-if="options.length" class="ask-opts">
          <span
            v-for="opt in options" :key="opt"
            class="ask-chip" :class="{ on: isPicked(opt) }"
            @click="toggleOpt(opt)"
          >{{ opt }}</span>
          <span class="ask-chip other" :class="{ on: otherOpen }" @click="toggleOther">其它</span>
        </div>

        <!-- 「其它」输入行：与选项选择互斥；无候选选项时默认展开 -->
        <div v-if="otherOpen" class="ask-other">
          <input
            ref="otherInput" v-model="draft"
            class="ask-input" type="text"
            placeholder="输入你的回答…"
            @keydown.enter.prevent="submitOther"
          />
          <button class="ask-send" title="发送回答" @click="submitOther">
            <span class="ico" v-html="topIcon"></span>
          </button>
        </div>

        <!-- 多选：勾选（+ 其它文本）后统一提交 -->
        <div v-if="multiSelect" class="ask-submit-row">
          <span class="ask-hint">可多选</span>
          <button class="ask-submit" :disabled="!canSubmitMulti" @click="submitMulti">
            提交{{ pickedCount ? '（' + pickedCount + '）' : '' }}
          </button>
        </div>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
// Agent 中途提问的底部抽屉：回答值经 answer 事件上抛，
// 提交与队列管理由详情页承接（与 PermissionSheet 同构）
import { ref, computed, watch, nextTick, onUnmounted } from 'vue'
import { useKeyboard } from '../composables/useKeyboard'
import chatIcon from '@/assets/icons/svg/buddy/chat-dot-round.svg?raw'
import closeIcon from '@/assets/icons/svg/buddy/close.svg?raw'
import topIcon from '@/assets/icons/svg/buddy/top.svg?raw'

const props = defineProps({
  ask: { type: Object, default: null },  // 当前待回答项 {callId, question, options, multiSelect}
  queue: { type: Number, default: 1 }    // 待回答队列长度（>1 显示剩余数）
})
const emit = defineEmits(['answer'])

const sheet = ref(false)
defineExpose({ sheet })

// 键盘高度补偿：抽屉 fixed 相对布局视口，iOS 键盘悬浮其上会遮住下半部
const { kbGap } = useKeyboard()

const multiSelect = computed(() => !!(props.ask && props.ask.multiSelect))
const options = computed(() => (props.ask && props.ask.options) || [])
const question = computed(() => (props.ask && props.ask.question) || '')

// 交互临时态：切换问题（队列前进）时重置；无候选选项时「其它」默认展开
const picked = ref([])
const otherOpen = ref(false)
const draft = ref('')
const otherInput = ref(null)
watch(() => props.ask && props.ask.callId, () => {
  picked.value = []
  draft.value = ''
  otherOpen.value = !options.value.length
})

const pickedCount = computed(() => {
  let n = picked.value.length
  if (otherOpen.value && draft.value.trim()) n++
  return n
})
const canSubmitMulti = computed(() => pickedCount.value > 0)

function isPicked(opt) { return picked.value.indexOf(opt) >= 0 }

// 点普通选项：单选直接提交（与「其它」互斥）；多选 toggle 勾选
function toggleOpt(opt) {
  if (multiSelect.value) {
    const i = picked.value.indexOf(opt)
    if (i >= 0) picked.value.splice(i, 1)
    else picked.value.push(opt)
    return
  }
  sheet.value = false
  emit('answer', opt)
}

// 点「其它」：展开/收起输入行（收起清空草稿；展开自动聚焦）
function toggleOther() {
  otherOpen.value = !otherOpen.value
  if (otherOpen.value) {
    nextTick(() => { otherInput.value && otherInput.value.focus() })
  } else {
    draft.value = ''
  }
}

// 「其它」输入提交：单选直接提交文本；多选并入已勾选项统一提交
function submitOther() {
  const t = draft.value.trim()
  if (!t) return
  sheet.value = false
  emit('answer', multiSelect.value ? picked.value.concat([t]).join('；') : t)
}

// 多选统一提交：勾选项 + 其它文本（以「；」连接）
function submitMulti() {
  if (!canSubmitMulti.value) return
  const parts = picked.value.slice()
  const t = draft.value.trim()
  if (otherOpen.value && t) parts.push(t)
  sheet.value = false
  emit('answer', parts.join('；'))
}

// 抽屉开合：冻结/解冻主页面滚动容器（防滚动穿透）
watch(sheet, v => {
  const el = document.getElementById('app')
  if (el) el.classList.toggle('sheet-open', v)
})
onUnmounted(() => {
  const el = document.getElementById('app')
  if (el) el.classList.remove('sheet-open')
})
</script>

<style>
.ask-drawer { border-radius: 18px 18px 0 0 !important; overflow: hidden; max-width: 100vw; }
.ask-drawer .el-drawer__body {
  padding: 0 16px calc(14px + env(safe-area-inset-bottom)) !important;
  display: flex; flex-direction: column; overflow: visible;
}
/* 键盘补偿壳：抽屉本体贴布局视口底部，键盘高度用内边距顶起内容 */
.ask-pad { display: flex; flex-direction: column; min-height: 0; }

.ask-head {
  flex: none; display: flex; align-items: flex-start; gap: 9px;
  padding: 14px 0 10px; border-bottom: 1px solid var(--line);
}
.ask-ico { flex: none; color: var(--brand); }
.ask-ico svg { width: 18px; height: 18px; fill: currentColor; }
.ask-q {
  flex: 1; min-width: 0; font-size: 15px; font-weight: 650; color: var(--text);
  line-height: 1.45; word-break: break-word;
}
.ask-queue {
  flex: none; font-size: 11px; color: var(--muted);
  background: var(--card2); border-radius: 999px; padding: 1px 8px;
  margin-top: 1px;
}
.ask-close {
  flex: none; width: 30px; height: 30px; padding: 0; border-radius: 8px;
  background: transparent; color: var(--muted);
  display: flex; align-items: center; justify-content: center;
}
.ask-close:active { opacity: .55; }
.ask-close svg { width: 16px; height: 16px; }

.ask-form { flex: none; display: flex; flex-direction: column; gap: 10px; padding-top: 12px; }
/* 选项 chips + 「其它」（品牌蓝激活态） */
.ask-opts { display: flex; flex-wrap: wrap; gap: 8px; }
.ask-chip {
  display: inline-flex; align-items: center;
  padding: 7px 15px; border-radius: 999px;
  border: 1px solid var(--line); background: var(--card);
  font-size: 13px; color: var(--text);
  transition: all .13s ease; user-select: none;
}
.ask-chip.on { background: var(--brand); border-color: var(--brand); color: #fff; }
.ask-chip:active { transform: scale(.96); }
.ask-chip.other { color: var(--muted); }

/* 「其它」输入行 */
.ask-other { display: flex; align-items: center; gap: 8px; }
.ask-input {
  flex: 1; min-width: 0; height: 38px;
  border: 1px solid var(--line); border-radius: 999px;
  background: var(--card); padding: 0 15px;
  font-family: inherit; font-size: 14px; color: var(--text);
  outline: none; transition: border-color .15s ease;
}
.ask-input::placeholder { color: var(--muted); }
.ask-input:focus { border-color: color-mix(in srgb, var(--brand) 55%, transparent); }
.ask-send {
  flex: none; width: 38px; height: 38px; padding: 0; border-radius: 50%;
  background: var(--brand); color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.ask-send:active { transform: scale(.9); }
.ask-send svg { width: 16px; height: 16px; }

/* 多选提交行 */
.ask-submit-row { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }
.ask-hint { font-size: 11px; color: var(--muted); }
.ask-submit {
  border: none; border-radius: 999px; padding: 8px 18px;
  font-family: inherit; font-size: 13px; font-weight: 600; color: #fff;
  background: var(--brand); transition: opacity .15s ease, transform .13s ease;
}
.ask-submit:active:not(:disabled) { transform: scale(.97); }
.ask-submit:disabled { opacity: .4; }
</style>
