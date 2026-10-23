<template>
  <!-- 顶栏：列表视图 = logo + 状态；详情视图 = 返回 + 任务标题 + 状态 -->
  <header>
    <template v-if="view === 'list'">
      <img class="logo" :src="logoUrl" alt="OmniDeck">
      <div class="title">
        <b>OmniDeck</b>
        <small>远程任务 · 手机遥控 PC</small>
      </div>
    </template>
    <template v-else>
      <button class="back" title="返回" @click="backToList">
        <span class="ico" v-html="backIcon"></span>
      </button>
      <div class="title">
        <b class="task-title">{{ detailTitle || '任务详情' }}</b>
        <small>远程任务记录</small>
      </div>
    </template>
    <span v-if="running && view === 'detail'" class="pill run"><i></i>运行中</span>
    <span class="pill" :class="{ on: connOn }"><i></i>{{ connOn ? '已连接' : '重连中' }}</span>
  </header>

  <!-- 配对门：首次访问输入 token（扫码链接已带 token，通常直接跳过） -->
  <div v-if="gated" id="gate">
    <div class="brand">
      <img class="logo-lg" :src="logoUrl" alt="OmniDeck">
      <b>OmniDeck 远程任务</b>
      <small>输入 PC 端「设置 → 移动端」显示的配对 Token</small>
    </div>
    <input v-model="tokenInput" placeholder="配对 Token" autocomplete="off" @keydown.enter="tryToken(tokenInput)">
    <button class="btn-primary" @click="tryToken(tokenInput)">连 接</button>
  </div>

  <!-- ===== 列表视图：按工作空间分组的任务清单 ===== -->
  <div v-else-if="view === 'list'" class="main">
    <div class="list-scroll">
      <!-- 无工作空间：空占位 -->
      <div v-if="!overview.workspaces.length" class="empty">
        <span class="emoji">🗂</span>
        <p>PC 端尚未创建工作空间<br>请先在 PC 端 OmniBuddy「工作空间」中添加</p>
      </div>
      <template v-else>
        <section v-for="g in overview.workspaces" :key="g.id" class="group">
          <div class="group-head" @click="toggleGroup(g.id)">
            <span class="arrow" :class="{ collapsed: !expandedGroups[g.id] }"><span class="ico" v-html="arrowDownIcon"></span></span>
            <span class="folder-ico"><span class="ico" v-html="folderIcon"></span></span>
            <span class="gname">{{ g.name }}</span>
            <span class="gcount">{{ g.tasks.length }}</span>
          </div>
          <div v-show="expandedGroups[g.id]" class="group-body">
            <div v-if="!g.tasks.length" class="group-empty">暂无远程任务</div>
            <div
              v-for="t in g.tasks" :key="t.id"
              class="task" @click="openTask(t.id, t.title)"
            >
              <span class="t-run" :class="{ on: t.running }"></span>
              <div class="t-info">
                <div class="t-title">{{ t.title }}</div>
                <div class="t-time">{{ t.running ? '执行中…' : fmtTime(t.updatedAt) }}</div>
              </div>
              <span class="chev"><span class="ico" v-html="rightIcon"></span></span>
            </div>
            <div v-if="g.hasMore" class="more" @click="loadMore(g)">
              {{ moreLoading[g.id] ? '加载中…' : '加载更多 · 剩 ' + (g.total - g.tasks.length) + ' 条' }}
            </div>
          </div>
        </section>
        <!-- 空间已删除的兜底组 -->
        <section v-if="overview.other" class="group">
          <div class="group-head" @click="toggleGroup('__other')">
            <span class="arrow" :class="{ collapsed: !expandedGroups['__other'] }"><span class="ico" v-html="arrowDownIcon"></span></span>
            <span class="folder-ico"><span class="ico" v-html="folderIcon"></span></span>
            <span class="gname">{{ overview.other.name }}</span>
            <span class="gcount">{{ overview.other.tasks.length }}</span>
          </div>
          <div v-show="expandedGroups['__other']" class="group-body">
            <div
              v-for="t in overview.other.tasks" :key="t.id"
              class="task" @click="openTask(t.id, t.title)"
            >
              <span class="t-run" :class="{ on: t.running }"></span>
              <div class="t-info">
                <div class="t-title">{{ t.title }}</div>
                <div class="t-time">{{ t.running ? '执行中…' : fmtTime(t.updatedAt) }}</div>
              </div>
              <span class="chev"><span class="ico" v-html="rightIcon"></span></span>
            </div>
            <div v-if="overview.other.hasMore" class="more" @click="loadMore(overview.other)">
              {{ moreLoading['__other'] ? '加载中…' : '加载更多 · 剩 ' + (overview.other.total - overview.other.tasks.length) + ' 条' }}
            </div>
          </div>
        </section>
      </template>
    </div>
  </div>

  <!-- ===== 详情视图：任务执行时间线（运行中实时刷新） ===== -->
  <div v-else class="main">
    <div id="list" ref="listEl">
      <div v-if="!msgs.length" class="empty">
        <span class="emoji">📄</span>
        <p>加载中…</p>
      </div>
      <template v-for="(m, i) in msgs" :key="i">
        <div v-if="m.kind === 'user'" class="row user">
          <div class="bubble" v-html="md(m.text)"></div>
        </div>
        <div v-else-if="m.kind === 'assistant'" class="row assistant">
          <div class="bubble" :class="{ muted: m.muted, typing: m.streaming }">
            <details v-if="m.thinking" class="think">
              <summary>思考过程</summary>
              <div v-html="md(m.thinking)"></div>
            </details>
            <div v-html="md(m.text)"></div>
          </div>
        </div>
        <div v-else-if="m.kind === 'tool'" class="tool" :class="{ err: m.isError && m.state !== 'running' }">
          <span class="tname">⚙ {{ m.toolName }}</span>
          <span v-if="m.brief">{{ m.brief }}</span>
          <span class="st">{{ m.state === 'running' ? '…' : (m.isError ? '✗' : '✓') }}</span>
          <div v-if="m.result && m.state !== 'running'" class="tres" v-html="md(String(m.result).slice(0, 300))"></div>
        </div>
        <div v-else-if="m.kind === 'todos' && m.items.length" class="todos">
          <ul>
            <li v-for="(t, j) in m.items" :key="j" :class="{ done: t.status === 'completed' }">
              {{ t.status === 'completed' ? '☑' : '☐' }} {{ t.content }}
            </li>
          </ul>
        </div>
        <div v-else-if="m.kind === 'ask'" class="notice warn">
          ❓ {{ m.question }}<br><span class="sub">请在 PC 端回答</span>
        </div>
        <div v-else-if="m.kind === 'permission'" class="notice warn">
          🔐 等待 PC 端授权：{{ m.surface }}<template v-if="m.brief"> · {{ m.brief }}</template>
        </div>
        <div v-else-if="m.kind === 'notice'" class="notice" :class="m.level">{{ m.text }}</div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, nextTick, onMounted } from 'vue'
import logoUrl from '@/assets/logo-sm.png'
// 图标一律取自 PC 图标库（src/assets/icons/svg/buddy），经 ?raw 内联、CSS 控色
import backIcon from '@/assets/icons/svg/buddy/back.svg?raw'
import arrowDownIcon from '@/assets/icons/svg/buddy/arrow-down.svg?raw'
import folderIcon from '@/assets/icons/svg/buddy/folder.svg?raw'
import rightIcon from '@/assets/icons/svg/buddy/right.svg?raw'

// ===== 状态 =====
const gated = ref(true)
const tokenInput = ref('')
const connOn = ref(false)
const view = ref('list')          // list | detail
const viewId = ref('')            // 详情查看中的会话 id
const detailTitle = ref('')
const running = ref(false)        // 详情任务是否运行中
const msgs = ref([])
const overview = ref({ workspaces: [], other: null, current: null })
// 分组展开表（未登记 = 收起；与 PC 侧栏一致默认全部收起）
const expandedGroups = reactive({})
const listEl = ref(null)
let token = ''
let es = null

// ===== 工具：转义 + 简易 markdown（fence / 行内 code / 加粗）+ 时间 =====
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ))
}
function md(src) {
  const parts = String(src || '').split('```')
  const out = []
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 1) {
      out.push('<pre>' + esc(parts[i].replace(/^\n|^\w+\n/, '')) + '</pre>')
      continue
    }
    let t = esc(parts[i]).replace(/\n/g, '<br>')
    t = t.replace(/`([^`\n]+)`/g, '<code>$1</code>')
    t = t.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    out.push(t)
  }
  return out.join('')
}
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = n => String(n).padStart(2, '0')
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
}

// ===== API =====
function api(method, path, body) {
  const opt = { method, headers: { 'Content-Type': 'application/json' } }
  const url = path + (path.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token)
  if (body) opt.body = JSON.stringify(body)
  return fetch(url, opt).then(r => r.json())
}

// ===== SSE：实时进度流（断线自动重连；详情页查看运行中任务时实时刷新） =====
function ensureStreaming() {
  const last = msgs.value[msgs.value.length - 1]
  if (last && last.kind === 'assistant' && last.streaming) return last
  const item = { kind: 'assistant', text: '', thinking: '', streaming: true }
  msgs.value.push(item)
  return item
}

function handleEvent(ev) {
  if (ev.type === 'remote_state') {
    // 运行态变化：列表页刷新总览，详情页同步 running 徽标
    if (view.value === 'list') loadOverview()
    else if (viewId.value && ev.current && ev.current.sessionId === viewId.value) running.value = true
    else running.value = false
    return
  }
  if (!ev.sessionId || ev.sessionId !== viewId.value) return
  const t = ev.type
  if (t === 'user_message') {
    msgs.value.push({ kind: 'user', text: (ev.message && ev.message.content) || '' })
  } else if (t === 'assistant_start') {
    ensureStreaming()
  } else if (t === 'delta') {
    ensureStreaming().text = ev.text || ''
  } else if (t === 'thinking') {
    ensureStreaming().thinking = ev.text || ''
  } else if (t === 'assistant_end') {
    const c = ensureStreaming()
    c.streaming = false
    if (ev.content) c.text = ev.content
    if (ev.thinking) c.thinking = ev.thinking
    if (ev.mid) c.muted = true // 中途正文（工具调用收尾）：降为过程文本
  } else if (t === 'tool_start') {
    const s = ensureStreaming()
    if (!s.text && !s.thinking) msgs.value.pop() // 空占位回收
    msgs.value.push({ kind: 'tool', id: ev.toolCallId, toolName: ev.toolName || '', brief: ev.brief || '', state: 'running' })
  } else if (t === 'tool_end') {
    for (let i = msgs.value.length - 1; i >= 0; i--) {
      const m = msgs.value[i]
      if (m.kind === 'tool' && m.id === ev.toolCallId) {
        m.state = 'done'
        m.isError = !!ev.isError
        m.result = ev.result || ''
        if (ev.artifacts && ev.artifacts.length) {
          const names = ev.artifacts.map(a => a.name)
          m.result = (m.result ? m.result + '\n' : '') + '产出：' + names.join('、')
        }
        break
      }
    }
  } else if (t === 'todo_update') {
    const items = (ev.todos || []).filter(td => td && typeof td.content === 'string')
    let lastT = null
    for (let i = msgs.value.length - 1; i >= 0; i--) {
      if (msgs.value[i].kind === 'todos') { lastT = msgs.value[i]; break }
    }
    if (lastT) lastT.items = items
    else msgs.value.push({ kind: 'todos', items })
  } else if (t === 'permission_ask') {
    msgs.value.push({ kind: 'permission', surface: ev.surface || '操作', brief: ev.brief || '' })
  } else if (t === 'ask_user') {
    msgs.value.push({ kind: 'ask', question: ev.question || '' })
  } else if (t === 'done') {
    msgs.value.push({ kind: 'notice', level: 'ok', text: '✓ 任务完成' })
    running.value = false
  } else if (t === 'error') {
    msgs.value.push({ kind: 'notice', level: 'err', text: '✗ ' + (ev.error || '执行失败') })
    running.value = false
  } else if (t === 'interrupted') {
    msgs.value.push({ kind: 'notice', text: '■ 已停止' })
    running.value = false
  } else if (t === 'pi_unavailable') {
    msgs.value.push({ kind: 'notice', level: 'warn', text: 'Agent 运行时不可用：' + (ev.error || '') })
  }
  scrollBottom(false)
}

function connect() {
  if (es) { try { es.close() } catch (e) { /* 忽略 */ } }
  es = new EventSource('/api/events?token=' + encodeURIComponent(token))
  es.onopen = () => { connOn.value = true }
  es.onmessage = e => {
    try { handleEvent(JSON.parse(e.data)) } catch (err) { /* 忽略坏帧 */ }
  }
  es.onerror = () => { connOn.value = false }
}

// ===== 列表视图 =====
function loadOverview() {
  api('GET', '/api/state').then(r => {
    if (!r || !r.ok) return
    overview.value = { workspaces: r.workspaces || [], other: r.other || null, current: r.current || null }
  }).catch(() => {})
}

function toggleGroup(id) {
  expandedGroups[id] = !expandedGroups[id]
}

// 组内任务分页加载（每组独立 offset，追加到组尾）
const moreLoading = reactive({})
function loadMore(g) {
  const key = g.id || '__other'
  if (moreLoading[key]) return
  moreLoading[key] = true
  api('GET', '/api/tasks?workspaceId=' + encodeURIComponent(key) + '&offset=' + g.tasks.length + '&limit=10').then(r => {
    if (r && r.ok) {
      g.tasks = (g.tasks || []).concat(r.tasks || [])
      g.total = r.total || g.total
      g.hasMore = !!r.hasMore
    }
  }).catch(() => {}).finally(() => { moreLoading[key] = false })
}

// ===== 详情视图 =====
function scrollBottom(force) {
  nextTick(() => {
    const el = listEl.value
    if (!el) return
    if (force || el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight
  })
}

function openTask(id, title) {
  view.value = 'detail'
  viewId.value = id
  detailTitle.value = title || ''
  msgs.value = []
  running.value = !!(overview.value.current && overview.value.current.sessionId === id)
  api('GET', '/api/session?id=' + encodeURIComponent(id)).then(r => {
    if (!r || !r.ok) return
    msgs.value = r.items || []
    scrollBottom(true)
  }).catch(() => {})
}

function backToList() {
  view.value = 'list'
  viewId.value = ''
  detailTitle.value = ''
  msgs.value = []
  running.value = false
  loadOverview()
}

// ===== 配对 =====
function tryToken(t) {
  token = String(t || '').trim()
  if (!token) return
  localStorage.setItem('odRemoteToken', token)
  gated.value = false
  connect()
  loadOverview()
}

onMounted(() => {
  const qsToken = new URLSearchParams(location.search).get('token')
  if (qsToken) {
    tryToken(qsToken)
    try { history.replaceState(null, '', '/') } catch (e) { /* 忽略 */ }
  } else if (localStorage.getItem('odRemoteToken')) {
    tryToken(localStorage.getItem('odRemoteToken'))
  }
})
</script>

<style>
/* 独立入口页面：样式全局（无主应用干扰），v-html 内容同样生效 */
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
:root {
  --bg: #0E1013; --card: #191C20; --card2: #1F2328; --line: rgba(255,255,255,.08);
  --text: #E8EAED; --muted: #9AA0A6;
  /* 与 PC 端一致的主题色（styles/theme.scss --primary-color） */
  --brand: #3366FF; --brand-hover: #5C85FF;
  --success: #52C41A; --red: #E8463A; --amber: #EFAA17;
  --shadow: 0 1px 3px rgba(0,0,0,.25);
}
@media (prefers-color-scheme: light) {
  :root { --bg: #EEF0F3; --card: #FFFFFF; --card2: #F5F6F8; --line: rgba(0,0,0,.09);
    --text: #1F2328; --muted: #6B7280; --shadow: 0 1px 3px rgba(20,24,28,.08); }
}
html, body, #app { height: 100%; }
body {
  background: var(--bg); color: var(--text);
  font: 15px/1.6 -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", Roboto, sans-serif;
}
#app { display: flex; flex-direction: column; padding: env(safe-area-inset-top) 0 env(safe-area-inset-bottom); }
.main { flex: 1; display: flex; flex-direction: column; min-height: 0; }

/* ===== 图标（统一取自 PC 图标库 svg，?raw 内联 + CSS 控色/尺寸） ===== */
.ico { display: inline-flex; align-items: center; justify-content: center; flex: none; }
.ico svg { width: 1em; height: 1em; fill: currentColor; }
.back .ico svg { width: 20px; height: 20px; }
.arrow .ico svg { width: 12px; height: 12px; }
.folder-ico .ico svg { width: 16px; height: 16px; }
.chev .ico svg { width: 14px; height: 14px; }

/* ===== 顶栏 ===== */
header {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 14px; border-bottom: 1px solid var(--line);
  background: color-mix(in srgb, var(--card) 88%, transparent);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
  position: sticky; top: 0; z-index: 5;
}
header .title { flex: 1; min-width: 0; }
header .title b { font-size: 16px; font-weight: 700; letter-spacing: .2px; display: block; line-height: 1.25; }
header .title small { font-size: 11px; color: var(--muted); display: block; }
header .task-title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.logo { flex: none; width: 32px; height: 32px; border-radius: 8px; }
.logo-lg { display: block; margin: 0 auto; width: 64px; height: 64px; border-radius: 16px; box-shadow: var(--shadow); }
.back {
  flex: none; width: 34px; height: 34px; border-radius: 10px; padding: 0;
  background: var(--card2); color: var(--text); border: 1px solid var(--line);
  display: flex; align-items: center; justify-content: center;
}
.pill {
  flex: none; font-size: 11px; padding: 3px 9px; border-radius: 999px;
  border: 1px solid var(--line); color: var(--muted); display: inline-flex; align-items: center; gap: 5px;
}
.pill i { width: 6px; height: 6px; border-radius: 50%; background: var(--muted); }
.pill.on { color: var(--brand); border-color: color-mix(in srgb, var(--brand) 45%, transparent); }
.pill.on i { background: var(--brand); }
.pill.run { color: var(--amber); border-color: color-mix(in srgb, var(--amber) 50%, transparent); }
.pill.run i { background: var(--amber); animation: pulse 1.2s infinite; }
@keyframes pulse { 50% { opacity: .3; } }

/* ===== 配对门 ===== */
#gate { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; padding: 32px; }
#gate .brand { text-align: center; }
#gate .brand b { display: block; font-size: 18px; margin-top: 10px; }
#gate .brand small { color: var(--muted); font-size: 12px; }
#gate input {
  width: 100%; max-width: 300px; padding: 11px 14px; border-radius: 12px;
  border: 1px solid var(--line); background: var(--card); color: var(--text); font-size: 15px; outline: none;
}
#gate input:focus { border-color: var(--brand); }
button { border: none; cursor: pointer; font-family: inherit; }
.btn-primary {
  border-radius: 999px; padding: 10px 26px; font-size: 15px; font-weight: 600;
  background: var(--brand); color: #fff; box-shadow: var(--shadow);
}
button:active { opacity: .8; }

/* ===== 列表视图：工作空间分组 ===== */
.list-scroll { flex: 1; overflow-y: auto; padding: 14px 12px 20px; -webkit-overflow-scrolling: touch; }
.empty { text-align: center; margin-top: 34vh; transform: translateY(-50%); }
.empty .emoji { font-size: 42px; display: block; margin-bottom: 10px; }
.empty p { color: var(--muted); font-size: 13px; }
.group { margin-bottom: 12px; background: var(--card); border: 1px solid var(--line); border-radius: 14px; overflow: hidden; box-shadow: var(--shadow); }
.group-head {
  display: flex; align-items: center; gap: 8px; padding: 11px 14px; cursor: pointer; user-select: none;
}
.group-head:active { background: var(--card2); }
.arrow { flex: none; color: var(--muted); transition: transform .18s ease; display: inline-flex; }
.arrow.collapsed { transform: rotate(-90deg); }
.folder-ico { flex: none; color: var(--muted); display: inline-flex; }
.gname { flex: 1; min-width: 0; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.gcount {
  flex: none; min-width: 22px; text-align: center; font-size: 11px; padding: 1px 7px;
  border-radius: 999px; background: var(--card2); color: var(--muted);
}
.group-body { border-top: 1px solid var(--line); }
.group-empty { padding: 14px; text-align: center; color: var(--muted); font-size: 12px; }
.task {
  display: flex; align-items: center; gap: 10px; padding: 11px 14px; cursor: pointer;
  border-top: 1px solid var(--line);
}
.task:first-child { border-top: none; }
.task:active { background: var(--card2); }
.t-run { flex: none; width: 8px; height: 8px; border-radius: 50%; background: var(--line); }
.t-run.on { background: var(--amber); animation: pulse 1.2s infinite; }
.t-info { flex: 1; min-width: 0; }
.t-title { font-size: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.t-time { font-size: 11px; color: var(--muted); margin-top: 1px; }
.chev { flex: none; color: var(--muted); display: inline-flex; }
.more { padding: 10px; text-align: center; font-size: 12px; color: var(--brand); cursor: pointer; border-top: 1px solid var(--line); }
.more:active { background: var(--card2); }

/* ===== 详情视图：时间线 ===== */
#list { flex: 1; overflow-y: auto; padding: 14px 12px 20px; -webkit-overflow-scrolling: touch; }
.row { margin: 10px 0; display: flex; }
.row.user { justify-content: flex-end; }
.bubble {
  max-width: 88%; padding: 9px 13px; border-radius: 16px;
  background: var(--card); border: 1px solid var(--line); box-shadow: var(--shadow);
  word-break: break-word; overflow-wrap: anywhere; font-size: 15px;
}
.row.user .bubble { background: var(--brand); color: #fff; border: none; border-bottom-right-radius: 5px; }
.row.assistant .bubble { border-bottom-left-radius: 5px; }
.bubble.muted { color: var(--muted); font-size: 13px; }
.bubble .think { margin: 6px 0; font-size: 12px; color: var(--muted); }
.bubble .think summary { cursor: pointer; user-select: none; }
.bubble pre {
  background: rgba(127,127,127,.14); border-radius: 8px; padding: 8px 10px;
  overflow-x: auto; font: 12px/1.5 ui-monospace, Menlo, Consolas, monospace; margin: 6px 0;
}
.bubble code { font: 13px/1.5 ui-monospace, Menlo, Consolas, monospace; background: rgba(127,127,127,.16); border-radius: 4px; padding: 0 4px; }
.typing::after { content: '▋'; color: var(--brand); animation: pulse 1s infinite; }
.tool {
  max-width: 100%; margin: 6px 0; padding: 7px 11px; border-radius: 10px;
  border: 1px dashed var(--line); color: var(--muted); font-size: 13px;
  display: flex; align-items: baseline; gap: 6px; overflow-wrap: anywhere; background: var(--card);
}
.tool .tname { color: var(--text); font-weight: 600; font-size: 12px; flex: none; }
.tool .st { flex: none; }
.tool .tres { width: 100%; margin-top: 4px; }
.tool.err { color: var(--red); border-color: var(--red); }
.notice {
  margin: 8px 0; padding: 8px 12px; border-radius: 12px; font-size: 13px;
  border: 1px solid var(--line); background: var(--card); color: var(--muted); box-shadow: var(--shadow);
}
.notice .sub { font-size: 12px; }
.notice.warn { color: var(--amber); border-color: color-mix(in srgb, var(--amber) 50%, transparent); }
.notice.err { color: var(--red); border-color: color-mix(in srgb, var(--red) 50%, transparent); }
.notice.ok { color: var(--success); border-color: color-mix(in srgb, var(--success) 50%, transparent); }
.todos { margin: 6px 0; padding: 9px 13px; border-radius: 12px; background: var(--card); border: 1px solid var(--line); font-size: 13px; box-shadow: var(--shadow); }
.todos li { list-style: none; margin: 3px 0; color: var(--muted); }
.todos li.done { text-decoration: line-through; opacity: .6; }
</style>
