<template>
  <!-- 任务列表页（/tasks）：与 PC 侧栏同构的分组任务清单（通栏列表，无卡片） -->
  <div class="page">
    <AppHeader view="list" :conn-on="store.connOn" @create="openCompose()" />
    <div class="list-scroll">
      <!-- 加载骨架（el-skeleton：分组头 + 任务行形态） -->
      <el-skeleton v-if="store.loading && !store.overview.groups.length" animated class="sk-page">
        <template #template>
          <div v-for="n in 3" :key="n" class="sk-group">
            <div class="sk-ghead">
              <el-skeleton-item variant="circle" style="width: 20px; height: 20px" />
              <el-skeleton-item variant="text" style="width: 38%; height: 16px" />
              <el-skeleton-item variant="text" style="width: 34px; height: 18px; border-radius: 999px" />
            </div>
            <el-skeleton-item variant="text" style="height: 46px; margin: 8px 0; border-radius: 10px" />
            <el-skeleton-item variant="text" style="height: 46px; margin: 8px 0; border-radius: 10px" />
          </div>
        </template>
      </el-skeleton>
      <el-empty
        v-else-if="!store.overview.groups.length"
        :image-size="64"
        description="暂无任务 · 在 PC 端 OmniBuddy 发起对话或定时任务后会出现在这里"
      >
        <template #image>
          <span class="ico empty-ico" v-html="folderOpenedIcon"></span>
        </template>
      </el-empty>
      <template v-else>
        <WorkspaceGroup
          v-for="g in store.overview.groups" :key="g.id"
          :group="g" :expanded="!!expandedGroups[g.id]"
          @toggle="toggleGroup(g.id)" @open="openTask" @more="loadMore(g)" @del="onDelTask"
        />
      </template>
    </div>
  </div>
</template>

<script setup>
import { reactive, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import AppHeader from '../components/AppHeader.vue'
import WorkspaceGroup from '../components/WorkspaceGroup.vue'
import { store } from '../store'
import api from '../api'
import folderOpenedIcon from '@/assets/icons/svg/buddy/folder-opened.svg?raw'

const router = useRouter()

// 分组展开表（未登记 = 收起；与 PC 侧栏一致默认全部收起）
const expandedGroups = reactive({})
const moreLoading = reactive({})

function toggleGroup(id) {
  expandedGroups[id] = !expandedGroups[id]
}

function openTask(t) {
  router.push({ name: 'task-detail', params: { id: t.id }, query: { title: t.title || '' } })
}

// 长按删除：二次确认（文案对齐 PC 端删除任务弹窗）后走服务端快速通道
// （运行中的任务会被中止后删除），成功后本地立即移除
function onDelTask(t) {
  ElMessageBox.confirm('删除后该任务的记录将一并移除，确定删除吗？', '删除任务', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(() => {
    api('POST', '/api/task/delete', { sessionId: t.id }).then(r => {
      if (!r || !r.ok) {
        ElMessage({ message: (r && r.error) || '删除失败', type: 'error', duration: 2200 })
        return
      }
      removeLocal(t.id)
      ElMessage({ message: '已删除', type: 'success', duration: 1500 })
    }).catch(() => {
      ElMessage({ message: '网络错误', type: 'error', duration: 2200 })
    })
  }).catch(() => {})
}

// 本地移除：分组内任务行 + total 计数同步修正；删除的是运行中任务则清运行态
// （服务端 remote_state 广播也会触发 App.vue 刷新总览，此处即时反馈不等回环）
function removeLocal(id) {
  for (const g of store.overview.groups) {
    const i = (g.tasks || []).findIndex(x => x.id === id)
    if (i >= 0) {
      g.tasks.splice(i, 1)
      g.total = Math.max(0, (g.total || 0) - 1)
      break
    }
  }
  if (store.runningId === id) store.runningId = ''
}

// 新建任务：顶栏 + 全局进入（不带空间）；分组头 + 进入则预选该空间
function openCompose(g) {
  router.push({ name: 'compose', query: g ? { group: g.name || '', ws: g.wsId || '' } : {} })
}

// 组内任务分页加载（每组独立 offset，追加到组尾；分组键 = PC 同源 displayName）
function loadMore(g) {
  const key = g.id
  if (moreLoading[key]) return
  moreLoading[key] = true
  api('GET', '/api/tasks?group=' + encodeURIComponent(key) + '&offset=' + g.tasks.length + '&limit=10').then(r => {
    if (r && r.ok) {
      g.tasks = (g.tasks || []).concat(r.tasks || [])
      g.total = r.total || g.total
      g.hasMore = !!r.hasMore
    }
  }).catch(() => {}).finally(() => { moreLoading[key] = false })
}

// 总览在 App 顶层维护（token watch 已拉取）；进入页面兜底刷新一次
onMounted(refresh)

function refresh() {
  if (!store.token) return
  api('GET', '/api/state').then(r => {
    if (r && r.ok) {
      store.overview = { groups: r.groups || [], current: r.current || null }
      store.runningId = (r.current && r.current.sessionId) || ''
    }
  }).catch(() => {})
}
</script>

<style>
.list-scroll { flex: 1; overflow-y: auto; padding: 16px 16px 24px; -webkit-overflow-scrolling: touch; }
.empty-ico { color: var(--muted); opacity: .5; }
.empty-ico svg { width: 52px; height: 52px; }

/* 列表骨架布局（内容为 el-skeleton-item） */
.sk-page { padding-top: 4px; }
.sk-group { margin-bottom: 20px; }
.sk-ghead { display: flex; align-items: center; gap: 10px; height: 46px; margin-bottom: 6px; }
</style>
