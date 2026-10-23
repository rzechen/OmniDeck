<template>
  <!-- 工作空间分组（通栏列表风格：组头 + 任务行 + 分割线，无卡片容器） -->
  <section class="wgroup">
    <div class="wgroup-head" @click="$emit('toggle')">
      <span class="ico folder-ico" v-html="folderIcon"></span>
      <span class="gname">{{ group.name }}</span>
      <span class="gcount" :class="{ zero: !group.total }">{{ group.total }}</span>
      <span class="ico arrow" :class="{ collapsed: !expanded }" v-html="arrowDownIcon"></span>
    </div>

    <div v-show="expanded" class="wgroup-body">
      <div v-if="!group.tasks.length && !group.hasMore" class="group-empty">暂无任务</div>
      <div v-for="t in group.tasks" :key="t.id" class="task" @click="onTap(t)">
        <span class="t-run" :class="{ on: t.running }"></span>
        <div class="t-info">
          <div class="t-title">{{ t.title }}</div>
          <div class="t-time">{{ t.running ? '执行中…' : fmtTime(t.updatedAt) }}</div>
        </div>
        <button class="t-del" title="删除" @click.stop="emit('del', t)" v-html="deleteIcon"></button>
        <span class="ico chev" v-html="rightIcon"></span>
      </div>
      <div v-if="group.hasMore" class="more" @click="$emit('more')">
        加载更多 · 剩 {{ group.total - group.tasks.length }} 条
      </div>
    </div>
  </section>
</template>

<script setup>
import arrowDownIcon from '@/assets/icons/svg/buddy/arrow-down.svg?raw'
import deleteIcon from '@/assets/icons/svg/buddy/delete.svg?raw'
import folderIcon from '@/assets/icons/svg/buddy/folder.svg?raw'
import rightIcon from '@/assets/icons/svg/buddy/right.svg?raw'
import { fmtTime } from '../format'

defineProps({
  group: { type: Object, required: true }, // { id, name, wsId, tasks, total, hasMore }
  expanded: { type: Boolean, default: false }
})
const emit = defineEmits(['toggle', 'open', 'more', 'del'])

function onTap(t) {
  emit('open', t)
}
</script>

<style>
/* 通栏列表：分组间留白分隔，无卡片底/边框/圆角 */
.wgroup { margin-top: 10px; }
.wgroup:first-child { margin-top: 0; }
.wgroup-head {
  display: flex; align-items: center; gap: 10px; min-height: 48px;
  cursor: pointer; user-select: none;
}
.wgroup-head:active { opacity: .7; }
.folder-ico { color: var(--brand); }
.folder-ico svg { width: 19px; height: 19px; }
.gname { flex: 1; min-width: 0; font-size: 16px; font-weight: 650; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gcount {
  flex: none; min-width: 22px; text-align: center; font-size: 12px; padding: 2px 8px;
  border-radius: 999px; background: var(--card); color: var(--muted); font-weight: 550;
}
.gcount.zero { opacity: .6; }
.arrow { color: var(--muted); transition: transform .18s ease; }
.arrow.collapsed { transform: rotate(-90deg); }
.arrow svg { width: 14px; height: 14px; }

.wgroup-body { border-top: 1px solid var(--line); }
.group-empty { padding: 16px 2px; color: var(--muted); font-size: 13px; }
.task {
  display: flex; align-items: center; gap: 10px; min-height: 52px;
  padding: 8px 2px; cursor: pointer; border-bottom: 1px solid var(--line);
}
.task:active { opacity: .7; }
.task:last-of-type { border-bottom: none; }
.t-run { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--card2); border: 1px solid var(--line); }
.t-run.on { background: var(--amber); border-color: var(--amber); animation: pulse 1.2s infinite; }
.t-info { flex: 1; min-width: 0; }
.t-title { font-size: 15px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-time { font-size: 12px; color: var(--muted); margin-top: 2px; }
.t-del {
  flex: none; border: none; background: none; padding: 6px; cursor: pointer;
  color: var(--muted); opacity: .5;
}
.t-del:active { opacity: 1; color: var(--red); }
.t-del svg { width: 15px; height: 15px; display: block; }
.chev { color: var(--muted); opacity: .6; }
.chev svg { width: 15px; height: 15px; }
.more { padding: 12px 2px; text-align: center; font-size: 13px; color: var(--brand); cursor: pointer; border-top: 1px solid var(--line); }
.more:active { opacity: .7; }
</style>
