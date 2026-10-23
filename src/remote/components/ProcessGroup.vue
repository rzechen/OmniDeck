<template>
  <!-- 执行过程：主体区仅一个居中入口，点击底部滑出查看完整过程（思考/工具/待办/过程输出） -->
  <div class="proc-entry" :class="{ running }" @click="sheet = true">
    <span class="pe-dot" :class="{ on: running }"></span>
    <span class="pe-text">
      <template v-if="running && group.current">{{ group.current }}</template>
      <template v-else>执行过程<template v-if="group.thinkCount"> · 思考 {{ group.thinkCount }} 段</template></template>
    </span>
    <span class="pe-count">{{ group.items.length }}</span>
  </div>

  <el-drawer
    v-model="sheet"
    direction="btt"
    size="72%"
    :with-header="false"
    class="proc-drawer"
  >
    <div class="sheet-head">
      <b>执行过程</b>
      <span class="sheet-sub">{{ group.items.length }} 个步骤<template v-if="group.thinkCount"> · 思考 {{ group.thinkCount }} 段</template></span>
      <button class="sheet-close" title="关闭" @click="sheet = false">
        <span class="ico" v-html="closeIcon"></span>
      </button>
    </div>
    <div class="sheet-body">
      <div class="proc-list">
        <template v-for="(it, i) in group.items" :key="i">
          <!-- 思考过程（多段直接渲染，虚线分隔） -->
          <div v-if="it.type === 'think'" class="pitem">
            <div class="prow">
              <span class="pi-dot think"></span>
              <span class="pname">思考过程</span>
              <span class="scount" v-if="it.parts.length > 1">{{ it.parts.length }} 段</span>
            </div>
            <div class="pcontent">
              <div v-for="(pt, j) in it.parts" :key="j" class="think-part" v-html="md(pt.text)"></div>
            </div>
          </div>

          <!-- 工具行：点击展开结果 -->
          <div v-else-if="it.type === 'tool'" class="pitem ptool" :class="{ err: it.isError }" @click="it.open = !it.open">
            <div class="prow">
              <span class="pi-dot" :class="{ spin: it.state === 'running' }"></span>
              <span class="pname">{{ toolLabel(it.toolName) }}</span>
              <span class="pbrief">{{ it.brief }}</span>
              <span class="pst" v-if="it.isError">失败</span>
            </div>
            <div v-if="it.open && it.result" class="pcontent presult" v-html="md(String(it.result).slice(0, 400))"></div>
          </div>

          <!-- 待办清单（直接展开） -->
          <div v-else-if="it.type === 'todos'" class="pitem">
            <div class="prow">
              <span class="pi-dot"></span>
              <span class="pname">待办清单</span>
              <span class="scount">{{ doneCount(it) }}/{{ it.items.length }}</span>
            </div>
            <ul class="pcontent ptodos">
              <li v-for="(td, j) in it.items" :key="j" :class="{ done: td.status === 'completed' }">
                {{ td.status === 'completed' ? '☑' : '☐' }} {{ td.content }}
              </li>
            </ul>
          </div>

          <!-- 中途正文（工具打断的输出） -->
          <div v-else-if="it.type === 'note'" class="pitem">
            <div class="prow"><span class="pi-dot"></span><span class="pname">过程输出</span></div>
            <div class="pcontent pnote" v-html="md(it.text)"></div>
          </div>
        </template>
      </div>
    </div>
  </el-drawer>
</template>

<script setup>
// 执行过程收纳：居中入口 + Element Plus 底部抽屉（el-drawer btt）
import { ref, watch, onUnmounted } from 'vue'
import closeIcon from '@/assets/icons/svg/buddy/close.svg?raw'
import { md, toolLabel } from '../format'

defineProps({
  group: { type: Object, required: true },
  running: { type: Boolean, default: false }
})

const sheet = ref(false)

// 抽屉开合：冻结/解冻主页面滚动容器（配合 overscroll-behavior 防滚动穿透）
watch(sheet, v => {
  const el = document.getElementById('app')
  if (el) el.classList.toggle('sheet-open', v)
})
onUnmounted(() => {
  const el = document.getElementById('app')
  if (el) el.classList.remove('sheet-open')
})

function doneCount(it) {
  return it.items.filter(t => t.status === 'completed').length
}
</script>

<style>
/* el-drawer 底部抽屉：紧凑边距（覆盖 EP body 默认 padding），单一滚动源（仅内容区纵向滚，横向锁定） */
.proc-drawer { border-radius: 18px 18px 0 0 !important; overflow: hidden; max-width: 100vw; }
.proc-drawer .el-drawer__body {
  padding: 0 16px calc(14px + env(safe-area-inset-bottom)) !important;
  display: flex; flex-direction: column; overflow: hidden; min-width: 0;
}
.sheet-head {
  flex: none; display: flex; align-items: center; gap: 8px;
  padding: 12px 0 10px; border-bottom: 1px solid var(--line);
}
.sheet-head b { font-size: 15px; font-weight: 650; color: var(--text); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sheet-sub { flex: none; font-size: 11.5px; color: var(--muted); background: var(--card); border-radius: 999px; padding: 1px 8px; }
.sheet-close {
  flex: none; width: 30px; height: 30px; padding: 0; border-radius: 8px;
  background: transparent; color: var(--muted);
  display: flex; align-items: center; justify-content: center;
}
.sheet-close:active { opacity: .55; }
.sheet-close svg { width: 16px; height: 16px; }
.sheet-body { flex: 1; min-height: 0; min-width: 0; max-width: 100%; overflow-y: auto; overflow-x: hidden; overscroll-behavior-y: contain; -webkit-overflow-scrolling: touch; }
/* 抽屉打开时冻结主页面滚动容器（防滚动穿透：列表/详情不再跟随滚动） */
.sheet-open .list-scroll, .sheet-open .detail-scroll { overflow: hidden !important; }
/* 思考内容里的宽表格：表格体自身横向滚，不撑破容器 */
.sheet-body table { display: block; max-width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }

/* 居中入口胶囊 */
.proc-entry {
  display: flex; align-items: center; gap: 8px;
  margin: 10px auto; width: fit-content; max-width: 100%;
  padding: 8px 16px; border-radius: 999px; cursor: pointer; user-select: none;
  background: var(--card); color: var(--muted); font-size: 12.5px;
}
.proc-entry:active { background: var(--card2); }
.proc-entry.running { color: var(--amber); }
.pe-dot { flex: none; width: 7px; height: 7px; border-radius: 50%; background: #C6CBD4; }
.pe-dot.on { background: var(--amber); animation: pulse 1.2s infinite; }
.pe-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.pe-count {
  flex: none; font-size: 11px; color: var(--muted);
  background: var(--card2); border-radius: 999px; padding: 1px 8px;
}

/* Sheet 内过程时间线（轨道线 + 行内状态点） */
.proc-list { padding-bottom: 4px; }
.pitem { position: relative; }
.pitem::before {
  content: ''; position: absolute; left: 5px; top: 14px; bottom: -10px;
  width: 1px; background: rgba(0,0,0,.08);
}
.pitem:last-child::before { display: none; }
.prow {
  display: flex; align-items: center; gap: 10px; min-height: 32px;
  min-width: 0; padding: 0; cursor: default;
}
.ptool { cursor: pointer; }
.ptool:active .prow { opacity: .7; }
.pi-dot {
  flex: none; width: 11px; height: 11px; border-radius: 50%;
  background: #fff; border: 2px solid #C6CBD4;
}
.pi-dot.think { border-color: var(--brand); }
.ptool .pi-dot { width: 9px; height: 9px; }
.ptool .pi-dot.spin { border-color: var(--brand); border-top-color: transparent; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.pname { flex: none; font-weight: 550; font-size: 13.5px; color: var(--text); }
.pbrief { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 13px; color: var(--muted); }
.pst { flex: none; font-size: 12px; color: var(--red); }
.ptool.err .pname { color: var(--red); }
.ptool.err .pi-dot { border-color: var(--red); }
.scount {
  flex: none; font-size: 11px; color: var(--muted);
  background: var(--card2); border-radius: 999px; padding: 1px 8px;
}

/* 过程内容（与文字对齐缩进） */
.pcontent { margin: 2px 0 12px 21px; font-size: 13px; line-height: 1.68; color: var(--muted); }
.pcontent p { margin: 5px 0; }
.pcontent > :first-child, .pcontent > :first-child p:first-child { margin-top: 0; }
.pcontent ul, .pcontent ol { padding-left: 18px; margin: 5px 0; }
.pcontent pre {
  background: var(--card2); border-radius: 8px; padding: 8px 10px;
  overflow-x: auto; font: 12px/1.55 ui-monospace, Menlo, Consolas, monospace; margin: 5px 0; max-width: 100%;
}
.pcontent code { font: 12.5px/1.5 ui-monospace, Menlo, Consolas, monospace; background: var(--card2); border-radius: 4px; padding: 0 4px; }
.presult { max-height: 240px; overflow-y: auto; }
.ptodos li { list-style: none; margin: 5px 0; font-size: 13.5px; }
.ptodos li.done { text-decoration: line-through; opacity: .55; }
.think-part + .think-part { margin-top: 10px; padding-top: 10px; border-top: 1px dashed rgba(0,0,0,.08); }
</style>
