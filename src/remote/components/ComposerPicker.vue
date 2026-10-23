<template>
  <!-- 输入框工具栏切换控件（对齐 PC composer-picker）：图标 + 当前名称按钮，
       点击底部抽屉选择；disabled 时仅作展示（如详情页已锁定的空间） -->
  <button class="cpick" :class="{ disabled }" :disabled="disabled" :title="tip" @click="open">
    <span class="ico" v-html="icons[icon] || icons.folder"></span>
    <span class="cp-label">{{ label || '选择' + title }}</span>
  </button>

  <el-drawer
    v-model="sheet"
    direction="btt"
    size="46%"
    :with-header="false"
    class="cpick-drawer"
  >
    <div class="sheet-head">
      <b>{{ title }}</b>
      <button class="sheet-close" title="关闭" @click="sheet = false">
        <span class="ico" v-html="closeIcon"></span>
      </button>
    </div>
    <div class="sheet-body">
      <div
        v-for="it in items" :key="it.id"
        class="cp-item" :class="{ on: it.id === modelValue }"
        @click="pick(it)"
      >
        <span class="cp-main">
          <b>{{ it.label }}</b>
          <small v-if="it.sub">{{ it.sub }}</small>
        </span>
        <span class="cp-check" v-if="it.id === modelValue" v-html="checkIcon"></span>
      </div>
      <div v-if="!items.length" class="cp-empty">{{ emptyText || '暂无可选项' }}</div>
    </div>
  </el-drawer>
</template>

<script setup>
// 通用切换控件：icon（folder | llm）+ label（当前选中名）→ el-drawer btt 选择
import { ref, watch, onUnmounted } from 'vue'
import closeIcon from '@/assets/icons/svg/buddy/close.svg?raw'
import checkIcon from '@/assets/icons/svg/buddy/check.svg?raw'
import folderIcon from '@/assets/icons/svg/buddy/folder.svg?raw'
import llmIcon from '@/assets/icons/svg/buddy/llm.svg?raw'

const icons = { folder: folderIcon, llm: llmIcon }

defineProps({
  icon: { type: String, default: 'folder' },
  label: { type: String, default: '' },
  tip: { type: String, default: '' },
  title: { type: String, default: '选择' },
  modelValue: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  disabled: { type: Boolean, default: false },
  emptyText: { type: String, default: '' }
})
const emit = defineEmits(['select'])

const sheet = ref(false)

function open() {
  // disabled 仅展示态不弹层（详情页空间锁定等场景）
  const el = document.activeElement
  if (el && el.blur) el.blur() // 先收软键盘，避免抽屉高度跳变
  sheet.value = true
}

function pick(it) {
  emit('select', it.id)
  sheet.value = false
}

// 抽屉开合：冻结/解冻主页面滚动容器（与 ProcessGroup 同机制防滚动穿透）
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
/* 工具栏按钮：图标 + 名称（灰字），点击弹层切换 */
.cpick {
  display: inline-flex; align-items: center; gap: 5px;
  max-width: 44vw; padding: 5px 9px; border: none; border-radius: 9px;
  background: transparent; color: var(--muted);
  font-size: 12.5px; user-select: none; -webkit-tap-highlight-color: transparent;
}
.cpick:active { background: var(--card2); }
.cpick .ico svg { width: 15px; height: 15px; fill: currentColor; }
.cpick .cp-label {
  min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.cpick.disabled { opacity: .75; }
.cpick.disabled:active { background: transparent; }

/* 选择抽屉（形态与 ProcessGroup 抽屉一致） */
.cpick-drawer { border-radius: 18px 18px 0 0 !important; overflow: hidden; max-width: 100vw; }
.cpick-drawer .el-drawer__body {
  padding: 0 16px calc(14px + env(safe-area-inset-bottom)) !important;
  display: flex; flex-direction: column; overflow: hidden; min-width: 0;
}
.sheet-head {
  flex: none; display: flex; align-items: center; gap: 8px;
  padding: 12px 0 10px; border-bottom: 1px solid var(--line);
}
.sheet-head b { font-size: 15px; font-weight: 650; color: var(--text); flex: 1; min-width: 0; }
.cpick-drawer .sheet-close {
  flex: none; width: 30px; height: 30px; padding: 0; border-radius: 8px;
  background: transparent; color: var(--muted);
  display: flex; align-items: center; justify-content: center;
}
.cpick-drawer .sheet-close:active { opacity: .55; }
.cpick-drawer .sheet-close svg { width: 16px; height: 16px; }
.cpick-drawer .sheet-body {
  flex: 1; min-height: 0; min-width: 0; overflow-y: auto; overflow-x: hidden;
  overscroll-behavior-y: contain; -webkit-overflow-scrolling: touch;
  padding-top: 6px;
}
/* 选项行：主名称 + 副说明，选中态品牌色 + 对勾 */
.cp-item {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 6px; border-bottom: 1px solid var(--line);
}
.cp-item:last-child { border-bottom: none; }
.cp-item:active { background: var(--card); }
.cp-main { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.cp-main b { font-size: 14px; font-weight: 570; color: var(--text); word-break: break-word; }
.cp-main small { font-size: 12px; color: var(--muted); word-break: break-word; }
.cp-item.on .cp-main b { color: var(--brand); }
.cp-check { flex: none; color: var(--brand); }
.cp-check svg { width: 16px; height: 16px; fill: currentColor; }
.cp-empty { padding: 28px 0; text-align: center; font-size: 13px; color: var(--muted); }
/* 抽屉打开时冻结主页面滚动容器（防滚动穿透：新建/列表/详情均覆盖） */
.sheet-open .compose-body, .sheet-open .list-scroll, .sheet-open .detail-scroll { overflow: hidden !important; }
</style>
