<template>
  <!-- 时间线分发：user 气泡 / process 过程组 / answer 全宽回答 / warn 警示 / end 终态 -->
  <div v-if="item.kind === 'user'" class="msg user-msg">
    <div class="bubble" v-html="md(item.text)"></div>
  </div>

  <ProcessGroup v-else-if="item.kind === 'process'" :group="item" :running="running" />

  <!-- 最终回答：全宽扁平（无气泡），markdown 完整渲染 + 左下复制图标 -->
  <div v-else-if="item.kind === 'answer'" class="msg answer-msg">
    <div class="answer" :class="{ typing: item.streaming }">
      <div class="answer-body" v-html="md(item.text)"></div>
    </div>
    <div v-if="!item.streaming && item.text" class="answer-meta">
      <span v-if="item.usage && (item.usage.input || item.usage.output)" class="meta-tokens">
        输入 {{ fmtTokens(item.usage.input) }} tokens · 输出 {{ fmtTokens(item.usage.output) }} tokens
      </span>
      <button class="meta-btn" :class="{ ok: copied }" :title="copied ? '已复制' : '复制'" @click="copy(item.text)">
        <span class="ico" v-html="copied ? checkIcon : copyIcon"></span>
      </button>
    </div>
  </div>

  <!-- 主线警示：等待授权 / 提问（图标 + 正文，唯一默认展开的过程类信息） -->
  <div v-else-if="item.kind === 'warn'" class="msg notice">
    <span class="ico nt-ico" v-html="warnIcons[item.ic] || warnIcons.warning"></span>
    <div class="nt-body">
      <div class="nt-line">{{ item.text }}</div>
      <div v-if="item.sub" class="nt-sub">{{ item.sub }}</div>
    </div>
  </div>

  <!-- 终态：图标 + 文字（左对齐） -->
  <div v-else-if="item.kind === 'end'" class="msg endline" :class="item.level">
    <span class="ico" v-html="endIcons[item.level] || endIcons.stop"></span>
    <span>{{ item.text }}</span>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { ElMessage } from 'element-plus'
import ProcessGroup from './ProcessGroup.vue'
import { md, fmtTokens } from '../format'
import copyIcon from '@/assets/icons/svg/buddy/copy.svg?raw'
import checkIcon from '@/assets/icons/svg/buddy/check.svg?raw'
import successIcon from '@/assets/icons/svg/buddy/success.svg?raw'
import errorIcon from '@/assets/icons/svg/buddy/error.svg?raw'
import stopIcon from '@/assets/icons/svg/buddy/stop.svg?raw'
import lockIcon from '@/assets/icons/svg/buddy/lock.svg?raw'
import chatIcon from '@/assets/icons/svg/buddy/chat-dot-round.svg?raw'
import warningIcon from '@/assets/icons/svg/buddy/warning-outline.svg?raw'

const warnIcons = { lock: lockIcon, chat: chatIcon, warning: warningIcon }
const endIcons = { ok: successIcon, err: errorIcon, stop: stopIcon }

defineProps({
  item: { type: Object, required: true },
  running: { type: Boolean, default: false }
})

const copied = ref(false)
// 复制：clipboard API 仅安全上下文（HTTPS）可用，隧道 http 访问时降级
// execCommand（readOnly + 16px 字号：防 iOS 唤起键盘 / 视口抖动 / 自动放大）
function copy(text) {
  const t = String(text || '')
  const mark = () => {
    copied.value = true
    setTimeout(() => { copied.value = false }, 1600)
    ElMessage({ message: '已复制', type: 'success', duration: 1500, grouping: true })
  }
  const fallback = () => {
    try {
      const ta = document.createElement('textarea')
      ta.value = t
      ta.readOnly = true
      ta.style.cssText = 'position:fixed;left:-999px;top:0;opacity:0;font-size:16px'
      document.body.appendChild(ta)
      const range = document.createRange()
      range.selectNodeContents(ta)
      const sel = window.getSelection()
      sel.removeAllRanges()
      sel.addRange(range)
      ta.setSelectionRange(0, t.length)
      document.execCommand('copy')
      sel.removeAllRanges()
      document.body.removeChild(ta)
      mark()
    } catch (e) { /* 忽略 */ }
  }
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(t).then(mark, fallback)
  } else {
    fallback()
  }
}
</script>

<style>
/* ===== 消息节奏：组间大间距分区，区内紧凑（业界移动端问答规范） ===== */
.msg { margin: 22px 0; }
.msg:first-child { margin-top: 6px; }
.msg:last-child { margin-bottom: 8px; }

/* ===== 任务描述气泡（唯一的气泡元素，右对齐） ===== */
.user-msg { display: flex; justify-content: flex-end; }
.bubble {
  max-width: 80%; padding: 10px 14px; border-radius: 18px 18px 5px 18px;
  background: var(--brand); color: #fff; font-size: 16px; line-height: 1.6;
  word-break: break-word; overflow-wrap: anywhere;
}
.bubble p { margin: 4px 0; }
.bubble p:first-child { margin-top: 0; }
.bubble p:last-child { margin-bottom: 0; }
.bubble pre { background: rgba(0,0,0,.2); border-radius: 10px; padding: 9px 11px; overflow-x: auto; font: 12.5px/1.55 ui-monospace, Menlo, Consolas, monospace; margin: 6px 0; }
.bubble code { font: 13px/1.5 ui-monospace, Menlo, Consolas, monospace; background: rgba(0,0,0,.2); border-radius: 5px; padding: 1px 5px; }
.bubble ul, .bubble ol { padding-left: 20px; margin: 4px 0; }

/* ===== 最终回答：全宽扁平排版（主体，字号层级最高） ===== */
.answer { font-size: 16px; line-height: 1.78; color: var(--text); }
.answer-body { word-break: break-word; overflow-wrap: anywhere; }
.answer-body > *:first-child { margin-top: 0; }
.answer-body > *:last-child { margin-bottom: 0; }
.answer p { margin: 8px 0; }
.answer h1, .answer h2, .answer h3, .answer h4 { font-size: 17px; font-weight: 700; margin: 18px 0 8px; line-height: 1.4; }
.answer h1:first-child, .answer h2:first-child, .answer h3:first-child { margin-top: 0; }
.answer ul, .answer ol { padding-left: 22px; margin: 8px 0; }
.answer li { margin: 4px 0; }
.answer li::marker { color: var(--brand); }
.answer blockquote { border-left: 3px solid var(--brand); padding: 2px 0 2px 12px; color: var(--muted); margin: 12px 0; background: var(--card); border-radius: 0 8px 8px 0; }
.answer hr { border: none; border-top: 1px solid var(--line); margin: 16px 0; }
.answer a { color: var(--brand); text-decoration: none; border-bottom: 1px solid color-mix(in srgb, var(--brand) 40%, transparent); }
.answer strong { font-weight: 680; }
.answer pre {
  background: var(--card); border-radius: 12px;
  padding: 12px 14px; overflow-x: auto; font: 12.5px/1.65 ui-monospace, Menlo, Consolas, monospace;
  margin: 10px 0; white-space: pre;
}
.answer code { font: 13px/1.55 ui-monospace, Menlo, Consolas, monospace; background: var(--card); border-radius: 5px; padding: 2px 6px; }
.answer pre code { background: none; padding: 0; border-radius: 0; }
.answer table { display: block; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; border-collapse: collapse; margin: 10px 0; font-size: 13.5px; }
.answer th, .answer td { border: 1px solid var(--line); padding: 7px 10px; text-align: left; }
.answer th { background: var(--card); font-weight: 600; white-space: nowrap; }
/* 流式光标：CSS 竖线闪烁（非文字符号） */
.answer.typing .answer-body::after {
  content: ''; display: inline-block; width: 2px; height: 1em; margin-left: 3px;
  background: var(--brand); vertical-align: -2px; border-radius: 1px;
  animation: caret 1s steps(2, start) infinite;
}
@keyframes caret { 50% { opacity: 0; } }

/* 回答操作行：token 用量（与 PC 同格式）+ 左下角复制 */
.answer-meta { display: flex; align-items: center; margin-top: 4px; }
.meta-tokens { font-size: 12px; color: var(--muted); margin-left: -7px; }
/* 有 token 文字时复制按钮不再负边距对齐（避免压住文字） */
.meta-tokens + .meta-btn { margin-left: 2px; }
.meta-btn {
  width: auto; height: auto; padding: 6px; margin: 0 0 0 -7px;
  background: transparent; color: var(--muted);
  display: flex; align-items: center; justify-content: center;
}
.meta-btn:active { opacity: .5; }
.meta-btn.ok { color: var(--success); }
.meta-btn svg { width: 1em; height: 1em; font-size: 16px; }

/* ===== 主线警示：浅琥珀底 + 图标 + 正文 ===== */
.notice {
  padding: 11px 14px; border-radius: 12px; font-size: 13.5px;
  background: var(--warn-bg); color: var(--amber);
  display: flex; align-items: flex-start; gap: 9px;
}
.nt-ico { margin-top: 2px; flex: none; }
.nt-ico svg { width: 16px; height: 16px; fill: currentColor; }
.nt-body { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
.notice .nt-sub { font-size: 12px; opacity: .75; }

/* ===== 终态：图标 + 文字（左对齐，长错误文案自动换行） ===== */
.endline { display: flex; align-items: flex-start; gap: 7px; font-size: 13px; color: var(--muted); margin: 14px 0 2px; }
.endline .ico { flex: none; margin-top: 2px; }
.endline .ico svg { width: 15px; height: 15px; fill: currentColor; }
.endline span { flex: 1; min-width: 0; word-break: break-word; overflow-wrap: anywhere; }
.endline.ok { color: var(--success); }
.endline.err { color: var(--red); }
</style>
