<template>
  <!-- 顶栏：无背景无边线（简约）；列表形态 = logo + 标题，详情形态 = 返回 + 标题 -->
  <header>
    <template v-if="view === 'list'">
      <img class="logo" :src="logoUrl" alt="OmniDeck">
      <div class="title">
        <b>OmniDeck</b>
        <small>任务不停 · 思考不断</small>
      </div>
    </template>
    <template v-else>
      <button class="back" title="返回" @click="$emit('back')">
        <span class="ico" v-html="backIcon"></span>
      </button>
      <div class="title">
        <b class="task-title">{{ title || '任务详情' }}</b>
        <small>任务执行记录</small>
      </div>
    </template>
    <span v-if="running && view === 'detail'" class="pill run"><i></i>运行中</span>
    <span class="pill" :class="{ on: connOn }"><i></i>{{ connOn ? '已连接' : '重连中' }}</span>
    <button v-if="view === 'list'" class="h-add" title="新建任务" @click="$emit('create')">
      <span class="ico" v-html="plusIcon"></span>
    </button>
  </header>
</template>

<script setup>
import logoUrl from '@/assets/logo-sm.png'
import backIcon from '@/assets/icons/svg/buddy/back.svg?raw'
import plusIcon from '@/assets/icons/svg/buddy/plus.svg?raw'

defineProps({
  view: { type: String, default: 'list' }, // list | detail
  title: { type: String, default: '' },
  connOn: { type: Boolean, default: false },
  running: { type: Boolean, default: false }
})
defineEmits(['back', 'create'])
</script>

<style>
/* 极简顶栏：透明背景、无分割线、随页面滚动 */
header {
  display: flex; align-items: center; gap: 10px;
  padding: 16px 16px 8px;
}
header .title { flex: 1; min-width: 0; }
header .title b { font-size: 17px; font-weight: 700; letter-spacing: .3px; display: block; line-height: 1.3; }
header .title small { font-size: 11.5px; color: var(--muted); display: block; letter-spacing: .5px; }
header .task-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.back {
  flex: none; width: 36px; height: 36px; margin-left: -9px; padding: 0; border-radius: 10px;
  background: transparent; color: var(--text);
  display: flex; align-items: center; justify-content: center;
}
.back:active { opacity: .55; }
.back .ico svg { width: 22px; height: 22px; }
/* 新建任务入口（已连接徽标右侧） */
.h-add {
  flex: none; width: 34px; height: 34px; padding: 0; border-radius: 10px;
  background: var(--brand); color: #fff;
  display: flex; align-items: center; justify-content: center;
}
.h-add:active { opacity: .8; }
.h-add svg { width: 19px; height: 19px; }
/* 状态徽标：无边框轻量形态（色字 + 状态点） */
.pill {
  flex: none; font-size: 11.5px; padding: 3px 2px; border: none;
  color: var(--muted); display: inline-flex; align-items: center; gap: 5px;
}
.pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.pill.on { color: var(--brand); }
.pill.on i { background: var(--brand); }
.pill.run { color: var(--amber); }
.pill.run i { background: var(--amber); animation: pulse 1.2s infinite; }
</style>
