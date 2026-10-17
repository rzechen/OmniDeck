<template>
  <div class="ob-manage-page">
    <!-- ===== 页内导航（固定区，不随内容滚动） =====
         一级：类型 tags（技能 / 子代理 / 连接器）
         二级：当前类型视图切换（xxx广场 / 我的xxx，文字样式） -->
    <div class="ob-market-nav">
      <div class="ob-type-row">
        <button
          v-for="c in categories"
          :key="'type-' + c.value"
          type="button"
          class="ob-type-tag"
          :class="{ active: typeFilter === c.value }"
          @click="selectType(c.value)"
        >
          <svg-icon :icon-class="TYPES[c.value].icon" />
          {{ c.label }}
          <span class="ob-type-count">{{ c.count }}</span>
        </button>
      </div>

      <div class="ob-view-row">
        <button
          type="button"
          class="ob-view-item"
          :class="{ active: viewMode === 'market' }"
          @click="selectView('market')"
        >{{ typeMeta.square }}</button>
        <button
          type="button"
          class="ob-view-item"
          :class="{ active: viewMode === 'mine' }"
          @click="selectView('mine')"
        >
          {{ typeMeta.mine }}
          <span v-if="typeMeta.todo" class="ob-view-todo">TODO</span>
        </button>

        <!-- 右侧公共操作区：添加下拉 + 搜索框（过滤当前广场资源） -->
        <div class="ob-view-actions">
          <!-- 添加：标准级联下拉组件（hover 一级右展二级，popper 宽度自适应无遮挡） -->
          <el-cascader
            v-model="addValue"
            :options="addOptions"
            :props="{ expandTrigger: 'hover' }"
            placeholder="添加"
            popper-class="ob-add-cascader-popper"
            class="ob-add-cascader"
            @change="onAddSelect"
          >
            <template #prefix>
              <svg-icon icon-class="plus" class="ob-add-icon" />
            </template>
          </el-cascader>

          <div class="ob-market-search">
            <svg-icon icon-class="search" class="search-icon" />
            <input
              v-model="keyword"
              placeholder="搜索资源..."
              @keydown.esc="keyword = ''"
            />
            <svg-icon
              v-if="keyword"
              icon-class="circle-close"
              class="search-clear"
              @click="keyword = ''"
            />
          </div>
        </div>
      </div>
    </div>

    <!-- ===== 我的视图：本地已装资源管理（技能 / 连接器 复用原管理页；子代理 TODO 占位） ===== -->
    <div v-if="viewMode === 'mine'" class="ob-mine-view">
      <skills-view v-if="typeFilter === 'skill'" />
      <mcp-view v-else-if="typeFilter === 'connector'" />
      <div v-else class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="subagent" />
        </div>
        <div class="ob-empty-title">
          我的子代理
          <span class="ob-view-todo">TODO</span>
        </div>
        <div class="ob-empty-desc">子代理的本地管理（新增 / 编辑 / 删除）开发中，敬请期待</div>
      </div>
    </div>

    <!-- ===== 广场视图：分类 chips + 市场卡片（仅此区域滚动） ===== -->
    <div class="ob-page-body" v-else>
      <div class="ob-market-main" v-if="!loading && !error && items.length">
        <!-- 分类 chips（当前广场类型内的主题分类，sticky 吸顶常驻） -->
        <div v-if="categoryChips.length > 1" class="ob-filter-bar">
          <div class="ob-chip-row">
            <button
              v-for="c in categoryChips"
              :key="'cat-' + (c.value || 'all')"
              type="button"
              class="ob-chip"
              :class="{ active: categoryFilter === c.value }"
              @click="selectCategory(c.value)"
            >
              {{ c.label }}<span class="ob-chip-count">{{ c.count }}</span>
            </button>
          </div>
        </div>

        <!-- 分类/搜索无结果 -->
        <div v-if="!filteredItems.length" class="ob-empty">
          <div class="ob-empty-title">没有匹配到符合条件的项目</div>
          <div class="ob-empty-desc" v-if="keyword">未找到与「{{ keyword }}」相关的资源</div>
          <el-button size="small" round @click="resetFilter">重置筛选条件</el-button>
        </div>

        <!-- 市场卡片网格 -->
        <div v-else class="ob-market-grid">
          <market-card
            v-for="it in filteredItems"
            :key="it.id"
            :item="it"
            :busy-id="busyId"
            @click="openDetail"
            @install="installItem"
            @update="updateItem"
          />
        </div>
      </div>

      <!-- ===== 全页状态（加载中 / 加载失败 / 空索引） ===== -->
      <!-- 加载中：卡片骨架占位 -->
      <div v-if="loading" class="ob-sk-wrap">
        <buddy-skeleton type="cards" :count="9" />
      </div>

      <div v-else-if="error" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="market" />
        </div>
        <div class="ob-empty-title">市场索引加载失败</div>
        <div class="ob-empty-desc">{{ error }}</div>
        <el-button size="small" round type="primary" plain @click="loadIndex">重试</el-button>
      </div>

      <div v-else-if="!items.length" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="market" />
        </div>
        <div class="ob-empty-title">市场暂无可用资源</div>
        <div class="ob-empty-desc">官方资源仓库筹备中，敬请期待</div>
      </div>
    </div>

    <!-- ===== 卡片详情弹窗（共享组件）：完整描述 / 版本 / 更新时间 / 版本历史 ===== -->
    <item-detail-dialog v-model:visible="detailVisible" :item="detailItem">
      <template #head-extra="{ item }">
        <span v-if="item.hasUpdate" class="ob-market-badge update">可更新</span>
      </template>
      <template #cells="{ item }">
        <div class="ob-detail-cell">
          <div class="ob-cell-label">安装状态</div>
          <div class="ob-cell-value ob-install-state" :class="item.hasUpdate ? 'updatable' : item.installed ? 'installed' : 'none'">
            <span class="ob-state-dot"></span>
            <span class="ob-state-text">
              {{ item.hasUpdate ? '可更新' : item.installed ? '已安装' + (item.installedVersion ? ' v' + item.installedVersion : '') : '未安装' }}
            </span>
          </div>
        </div>
      </template>
      <template #actions="{ item }">
        <el-button
          v-if="item.hasUpdate"
          size="small"
          round
          type="warning"
          :loading="busyId === item.id"
          :disabled="!!busyId && busyId !== item.id"
          @click="updateItem(item)"
        >更新到 v{{ item.version }}</el-button>
        <el-button
          v-else
          size="small"
          round
          :type="item.installed ? 'default' : 'primary'"
          :plain="!item.installed"
          :loading="busyId === item.id"
          :disabled="!!busyId && busyId !== item.id"
          @click="installItem(item)"
        >{{ item.installed ? '重新安装' : '安装' }}</el-button>
        <el-button
          v-if="item.installed"
          size="small"
          round
          type="danger"
          plain
          :loading="busyId === item.id"
          :disabled="!!busyId && busyId !== item.id"
          @click="uninstallFromDetail"
        >卸载</el-button>
        <!-- v4 homepage：系统浏览器打开主页 -->
        <el-button
          v-if="item.homepage"
          size="small"
          round
          plain
          @click="openHome(item)"
        >主页</el-button>
      </template>
    </item-detail-dialog>

    <!-- ===== 添加入口弹窗（与原管理页同款组件复用） ===== -->
    <!-- 创建技能 → 导入 Skill（ZIP） -->
    <skill-import-dialog
      v-model:visible="skillDialogVisible"
      :editing="null"
      @saved="onSkillSaved"
    />

    <!-- 新增连接器（MCP Server） -->
    <mcp-form-dialog
      v-model:visible="mcpModalVisible"
      :editing="null"
      :servers="mcpServers"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onActivated } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useStore } from 'vuex'
import ItemDetailDialog from '@/components/buddy/ItemDetailDialog.vue'
import MarketCard from './components/MarketCard.vue'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
// 「我的技能 / 我的连接器」视图复用原管理页组件（原独立路由已并入资源市场）
import SkillsView from '@/views/buddy/skills/index.vue'
import McpView from '@/views/buddy/mcp/index.vue'
// 添加入口弹窗（创建技能 / 新增连接器，与原管理页同款组件复用）
import SkillImportDialog from '@/views/buddy/skills/components/SkillImportDialog.vue'
import McpFormDialog from '@/views/buddy/mcp/components/McpFormDialog.vue'
import { buddyApi, buddyApiSection } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'OmniBuddyMarket' })

const route = useRoute()
const router = useRouter()
const store = useStore()
const { message } = useFeedback()

// 类型定义：tag 展示名 / 图标 / 广场视图名 / 我的视图名（todo = 我的视图暂未提供）
const TYPES = {
  skill: { label: '技能', icon: 'skill', square: '技能广场', mine: '我的技能' },
  agent: { label: '子代理', icon: 'subagent', square: '子代理广场', mine: '我的子代理', todo: true },
  connector: { label: '连接器', icon: 'mcp', square: '连接器广场', mine: '我的连接器' }
}

const loading = ref(false)
const error = ref('')
const items = ref([])           // 市场索引（含已装状态）
const categoryDefs = ref([])    // 二级主题分类清单（v2 索引下发；v1 旧索引为空 → 隐藏二级筛选）
const keyword = ref('')         // 公共搜索框（过滤当前广场资源）
// 类型 / 视图由 query 驱动（?type=xx[&view=mine]，默认技能广场），切页签可恢复
const typeFilter = ref(TYPES[route.query.type] ? route.query.type : 'skill')
const viewMode = ref(route.query.view === 'mine' ? 'mine' : 'market')
const categoryFilter = ref('')  // 二级主题分类筛选（空 = 全部主题）
const busyId = ref('')          // 安装/更新中的项 id（按钮 loading 态）
const detailVisible = ref(false) // 卡片详情抽屉
const detailItem = ref(null)

// 当前类型定义（视图切换行 / 类型图标）
const typeMeta = computed(() => TYPES[typeFilter.value] || TYPES.skill)

// 类型 tag + 数量角标统计
const categories = computed(() => {
  const counts = {
    skill: 0,
    agent: 0,
    connector: 0
  }
  items.value.forEach(it => {
    const t = marketType(it)
    if (counts[t] !== undefined) counts[t]++
  })

  return [
    { label: '技能', value: 'skill', count: counts.skill },
    { label: '子代理', value: 'agent', count: counts.agent },
    { label: '连接器', value: 'connector', count: counts.connector }
  ]
})

// 二级主题分类（数据驱动 + 数量统计；仅统计当前广场类型的资源；
// 索引未下发分类时仅含「全部」一项 → 主题分组隐藏）
const categoryChips = computed(() => {
  const counts = {}
  const typed = items.value.filter(it => marketType(it) === typeFilter.value)
  typed.forEach(it => {
    if (it.category) counts[it.category] = (counts[it.category] || 0) + 1
  })
  return [
    { label: '全部', value: '', count: typed.length },
    ...categoryDefs.value
      .filter(c => counts[c.value])
      .map(c => ({ label: c.label, value: c.value, count: counts[c.value] }))
  ]
})

const filteredItems = computed(() => {
  const kw = keyword.value.trim().toLowerCase()
  const list = items.value.filter(it => {
    if (typeFilter.value && marketType(it) !== typeFilter.value) return false
    if (categoryFilter.value && (it.category || '') !== categoryFilter.value) return false
    if (!kw) return true
    const hay = [it.name, it.description, it.details, (it.tags || []).join(' ')].join(' ').toLowerCase()
    return hay.includes(kw)
  })
  // v4：按趋势分降序展示
  return list.sort((a, b) => (b.trendingScore || 0) - (a.trendingScore || 0))
})

function api() {
  return buddyApiSection('market')
}

function marketType(it) {
  const t = it.type || 'skill'
  if (t === 'workflow' || t === 'skill') return 'skill'
  if (t === 'connector' || t === 'mcp') return 'connector'
  return t
}

function loadIndex() {
  const a = api()
  if (!a) {
    error.value = '当前环境不支持市场功能'
    return
  }
  loading.value = true
  error.value = ''
  a.index().then(res => {
    loading.value = false
    if (!res || !res.ok) {
      error.value = (res && res.error) || '未知错误'
      items.value = []
      categoryDefs.value = []
      return
    }
    items.value = res.items || []
    categoryDefs.value = (res.categories || []).map(c => ({ label: c.label, value: c.value }))
    // 二级筛选失效时（分类被下架）回退到全部
    if (categoryFilter.value && !categoryDefs.value.some(c => c.value === categoryFilter.value)) {
      categoryFilter.value = ''
    }
  }).catch(() => {
    loading.value = false
    error.value = '请求异常（请检查网络）'
  })
}

function installItem(it) {
  const a = api()
  if (!a) return
  busyId.value = it.id
  a.install(it.id).then(res => {
    busyId.value = ''
    if (!res || !res.ok) {
      message.error((res && res.error) || '安装失败')
      return
    }
    message.success(`「${it.name}」安装成功`)
    applyLocalState(it.id, { installed: true, installedVersion: it.version, hasUpdate: false })
  }).catch(() => {
    busyId.value = ''
    message.error('安装请求异常')
  })
}

function updateItem(it) {
  const a = api()
  if (!a) return
  busyId.value = it.id
  a.update(it.id).then(res => {
    busyId.value = ''
    if (!res || !res.ok) {
      message.error((res && res.error) || '更新失败')
      return
    }
    message.success(`「${it.name}」已更新到 v${it.version}`)
    applyLocalState(it.id, { installed: true, installedVersion: it.version, hasUpdate: false })
  }).catch(() => {
    busyId.value = ''
    message.error('更新请求异常')
  })
}

function applyLocalState(id, patch) {
  const item = items.value.find(x => x.id === id)
  if (item) Object.assign(item, patch)
  // 详情抽屉展示的是 openDetail 时的浅拷贝（附加 categoryLabel），同步补丁保持弹窗与列表一致
  if (detailItem.value && detailItem.value.id === id) Object.assign(detailItem.value, patch)
}

function resetFilter() {
  keyword.value = ''
  categoryFilter.value = ''
}

// ---------- 添加下拉（视图切换行右侧 + 按钮） ----------
const addValue = ref([])          // 级联选中值（选中叶子后重置，避免残留高亮）
// 级联选项：创建技能 → 导入技能；创建子代理 → 新增子代理（TODO）；新增连接器（叶子直接弹窗）
const addOptions = [
  {
    value: 'skill',
    label: '创建技能',
    children: [{ value: 'skill-import', label: '导入技能' }]
  },
  {
    value: 'agent',
    label: '创建子代理',
    children: [{ value: 'agent-add', label: '新增子代理' }]
  },
  { value: 'mcp-add', label: '新增连接器' }
]

// 选中叶子：按 value 分发到对应弹窗 / 占位提示，随后重置选中值
function onAddSelect(path) {
  const key = Array.isArray(path) ? path[path.length - 1] : path
  if (key === 'skill-import') {
    skillDialogVisible.value = true
  } else if (key === 'agent-add') {
    message.info('「新增子代理」功能开发中，敬请期待')
  } else if (key === 'mcp-add') {
    openMcpAdd()
  }
  addValue.value = []
}

// 创建技能 → 导入 Skill（ZIP）弹窗
const skillDialogVisible = ref(false)
// 新增连接器弹窗（servers 供重名校验，打开前拉取）
const mcpModalVisible = ref(false)
const mcpServers = ref([])

// 导入成功：重拉市场索引同步「已安装」徽标
function onSkillSaved() {
  loadIndex()
}

// 新增连接器：先拉既有列表（弹窗重名校验用，内嵌 McpView 的列表对本页不可见）
async function openMcpAdd() {
  try {
    const omnibuddy = buddyApi()
    const mcp = omnibuddy && omnibuddy.mcp
    const servers = mcp ? await mcp.list() : []
    mcpServers.value = Array.isArray(servers) ? servers : []
  } catch (e) {
    mcpServers.value = []
  }
  mcpModalVisible.value = true
}

// ---------- 页内导航（类型 tag / 广场-我的 视图切换） ----------
// 切换类型：重置主题分类（跨类型残留筛选易空结果）
function selectType(value) {
  if (typeFilter.value === value) return
  typeFilter.value = value
  categoryFilter.value = ''
  syncRoute()
}

function selectView(v) {
  if (viewMode.value === v) return
  viewMode.value = v
  syncRoute()
}

// 切换二级主题分类
function selectCategory(value) {
  categoryFilter.value = value
}

// 当前视图页签名（技能广场 / 我的技能 / …）
function tabTitle() {
  const t = TYPES[typeFilter.value]
  return viewMode.value === 'mine' ? t.mine : t.square
}

// 导航同步 URL query 与页签（原位重绑不新增页签，页签名跟随视图；
// 目标视图已有页签时并入既有页签，避免出现两个同 fullPath 页签）
function syncRoute() {
  const to = viewMode.value === 'mine'
    ? `/omnibuddy/market?type=${typeFilter.value}&view=mine`
    : `/omnibuddy/market?type=${typeFilter.value}`
  if (route.fullPath === to) return
  const tabs = store.state.tagsView.buddy || []
  if (tabs.some(t => t.fullPath === to)) {
    store.commit('tagsView/DEL_TAB', { side: 'buddy', fullPath: route.fullPath })
  } else {
    store.commit('tagsView/REBIND_TAB', {
      side: 'buddy',
      from: route.fullPath,
      to,
      title: tabTitle()
    })
  }
  router.replace(to).catch(() => {})
}

// ---------- 详情抽屉 ----------
function openDetail(it) {
  // categoryLabel 由页面计算后传入（共享组件不感知页面级 categoryDefs）
  detailItem.value = { ...it, categoryLabel: it.category ? categoryLabel(it.category) : '' }
  detailVisible.value = true
}

// v4 homepage：主进程 shell.openExternal 打开主页（系统浏览器）
function openHome(it) {
  const a = api()
  if (!a || !it.homepage) return
  a.openHome(it.homepage)
}

function uninstallFromDetail() {
  const a = api()
  const it = detailItem.value
  if (!a || !it) return
  busyId.value = it.id
  a.uninstall(it.id).then(res => {
    busyId.value = ''
    if (!res || !res.ok) {
      message.error((res && res.error) || '卸载失败')
      return
    }
    message.success(`「${it.name}」已卸载`)
    applyLocalState(it.id, { installed: false, installedVersion: '', hasUpdate: false })
  }).catch(() => {
    busyId.value = ''
    message.error('卸载请求异常')
  })
}

// ---------- 展示辅助 ----------
function categoryLabel(value) {
  const def = categoryDefs.value.find(c => c.value === value)
  return def ? def.label : value
}

onMounted(() => {
  loadIndex()
})

// 首次激活标记（onMounted 已拉，首次 onActivated 跳过）
let _mktActivatedOnce = false

onActivated(() => {
  // keep-alive 页面重入：切入即重拉索引（installed 状态可能在别处已变更）；
  // 首次激活跳过（onMounted 已拉，避免重复请求）
  if (!_mktActivatedOnce) {
    _mktActivatedOnce = true
    return
  }
  if (!loading.value) loadIndex()
})
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 加载骨架容器内边距 */
.ob-sk-wrap {
  padding: 18px 4px;
}

/* ===== 页内导航（固定区）：类型 tags + 视图切换两行 ===== */
.ob-market-nav {
  flex-shrink: 0;
  margin-bottom: 4px;
}

/* 一级类型 tag：带图标与计数的描边小方块（醒目于下方文字视图项） */
.ob-type-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
}

.ob-type-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 14px;
  font-size: 13px;
  font-weight: 500;
  font-family: inherit;
  color: $text-secondary;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 14px;
  }

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    color: var(--primary-color);
  }

  &.active {
    background: rgba(var(--primary-color-rgb), 0.1);
    border-color: rgba(var(--primary-color-rgb), 0.45);
    color: var(--primary-color);
    font-weight: 600;
  }

  .ob-type-count {
    font-size: 10.5px;
    opacity: 0.72;
    font-weight: 500;
  }
}

/* 二级视图切换（xxx广场 / 我的xxx）：纯文字链接（无边框/下划线），激活主题色 */
.ob-view-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 12px;
}

/* 右侧公共操作区：搜索框 + 添加下拉（推到行尾） */
.ob-view-actions {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

/* 极简搜索框：无边框（聚焦才浮现主题色描边） */
.ob-market-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 200px;
  height: 30px;
  padding: 0 12px;
  background: var(--bg-hover, rgba(0, 0, 0, 0.03));
  border: 1px solid transparent;
  border-radius: 15px;
  flex-shrink: 0;
  transition: all 0.2s ease;

  &:hover {
    background: var(--bg-hover-dark, rgba(0, 0, 0, 0.06));
  }

  &:focus-within {
    background: var(--card-bg, #fff);
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);

    .search-icon {
      color: var(--primary-color);
    }
  }

  .search-icon {
    font-size: 13px;
    color: $text-secondary;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: $text-primary;

    &::placeholder {
      color: $text-secondary;
    }
  }

  .search-clear {
    font-size: 13px;
    color: $text-secondary;
    cursor: pointer;

    &:hover {
      color: $text-primary;
    }
  }
}

/* 添加下拉（el-cascader）：紧凑胶囊输入框 + plus 前缀图标 */
.ob-add-cascader {
  flex-shrink: 0;
  width: 92px;

  :deep(.el-input__wrapper) {
    height: 30px;
    padding: 0 10px 0 28px;
    border-radius: 15px;
    background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
    box-shadow: 0 1px 3px rgba(var(--primary-color-rgb), 0.35);
    border: none;
    cursor: pointer;
    transition: filter 0.15s ease;

    &:hover {
      filter: brightness(1.1);
    }
  }

  :deep(.el-input__inner) {
    font-size: 12px;
    font-weight: 500;
    color: #fff;
    cursor: pointer;

    &::placeholder {
      color: rgba(255, 255, 255, 0.9);
    }
  }

  :deep(.el-input__suffix) {
    display: none; /* 隐藏默认下拉箭头（前缀 plus 已示意添加） */
  }

  .ob-add-icon {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    z-index: 1;
    font-size: 14px;
    color: #fff;
    pointer-events: none;
  }
}

.ob-view-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  font-size: 17px;
  font-family: inherit;
  color: $text-secondary;
  background: none;
  border: none;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: $text-primary;
  }

  &.active {
    color: var(--primary-color);
    font-weight: 600;
  }
}

/* TODO 占位徽标（「我的子代理」视图） */
.ob-view-todo {
  flex-shrink: 0;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.4px;
  padding: 1px 5px;
  border-radius: 4px;
  color: #b45309;
  background: rgba(245, 158, 11, 0.16);
}

/* ===== 我的视图：内嵌原管理页（自带 hero/滚动结构） =====
   负 margin 抵消外层 .ob-manage-page 的 padding，让内嵌页与导航区左右对齐 */
.ob-mine-view {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  margin: -20px -24px;
}

/* ===== 广场主体：单列滚动区（工具栏 + 分类 chips + 卡片网格） ===== */
.ob-market-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  padding-right: 4px;

  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--scrollbar-thumb, rgba(0, 0, 0, 0.15));
    border-radius: 3px;
  }
}

/* ===== 分类 chips：当前广场类型的主题分类（无框轻量；吸顶常驻） ===== */
.ob-filter-bar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  // 吸顶：滚动浏览卡片时分类始终可见可点
  position: sticky;
  top: 0;
  z-index: 5;
  // 上下留白均为背景延伸：滚动内容从 chips 背后穿过时上下不露缝
  padding: 8px 0 14px;
  margin-bottom: 6px;
  background: var(--content-bg, #FBFCFD);
}

.ob-chip-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  min-width: 0;
}

.ob-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  font-size: 12.5px;
  font-family: inherit;
  color: $text-secondary;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: $search-bg;
    color: $text-primary;
  }

  &.active {
    background: rgba(var(--primary-color-rgb), 0.1);
    color: var(--primary-color);
    font-weight: 600;
  }

  .ob-chip-count {
    font-size: 10.5px;
    opacity: 0.72;
    font-weight: 500;
  }
}

/* ===== 统一网格卡片区域 ===== */
.ob-market-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 14px;
}

/* 可更新徽标（详情弹窗 head-extra 使用） */
.ob-market-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;

  &.update {
    color: #d97706;
    background: rgba(245, 158, 11, 0.12);
  }
}

/* 详情弹窗安装状态：圆点 + 文字三态徽章（已装绿 / 可更新橙 / 未装灰） */
.ob-install-state {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 600;

  .ob-state-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  &.installed {
    color: #2E8B63;
    background: rgba(70, 168, 127, 0.1);

    .ob-state-dot {
      background: #34a877;
    }
  }

  &.updatable {
    color: #d97706;
    background: rgba(245, 158, 11, 0.12);

    .ob-state-dot {
      background: #f59e0b;
    }
  }

  &.none {
    color: $text-secondary;
    background: rgba(0, 0, 0, 0.05);

    .ob-state-dot {
      background: rgba(0, 0, 0, 0.25);
    }
  }
}
</style>

<style lang="scss">
/* ===== 添加下拉面板（el-cascader popper 挂 body 需全局样式）
   对齐项目 el-dropdown 的 macOS 菜单配方：毛玻璃 + 大圆角 + 30px 胶囊项 ===== */
.ob-add-cascader-popper {
  padding: 0 !important;
  border-radius: 12px !important;
  border: 1px solid var(--border-color) !important;
  background: rgba(255, 255, 255, 0.92) !important;
  backdrop-filter: blur(20px) saturate(1.5);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06) !important;
  overflow: hidden;

  .el-popper__arrow {
    display: none;
  }

  .el-cascader-panel {
    /* 去列间 EP 默认边框（分隔线改由下方规则控制） */
    --el-cascader-menu-border: none;
    --el-cascader-menu-fill: transparent;
    --el-cascader-node-background-hover: rgba(var(--primary-color-rgb), 0.08);
    --el-cascader-menu-selected-text-color: var(--primary-color);
    border: none;
    background: transparent;
    /* 各列独立高度（默认 stretch 等高拉伸，二级仅 1 项时列被拉出大片留白） */
    align-items: flex-start;
  }

  .el-cascader-menu {
    min-width: 128px;
    padding: 5px;
    background: transparent;
    border-right: none;

    /* 右列（二级）与左列之间的细分隔线 */
    & + .el-cascader-menu {
      border-left: 1px solid var(--border-color);
    }
  }

  .el-cascader-node {
    height: 30px;
    line-height: 30px;
    padding: 0 12px;
    border-radius: 7px;
    font-size: 12.5px;
    color: var(--text-primary);
    transition: background 0.12s ease, color 0.12s ease;

    /* 默认 label 自带 8px 内边距抵消紧凑观感 */
    .el-cascader-node__label {
      padding: 0;
    }

    /* 带右箭头（postfix 绝对定位 right:10px）的一级项：右侧留位避免文字压箭头 */
    &:has(.el-cascader-node__postfix) {
      padding-right: 28px;
    }

    &:hover {
      background: rgba(var(--primary-color-rgb), 0.08);
      color: var(--primary-color);
    }

    /* 激活路径（当前展开的一级）：主题色 */
    &.in-active-path,
    &.is-active {
      color: var(--primary-color);
      font-weight: 600;
    }
  }
}

/* 暗色：macOS 菜单暗色版（与 el-dropdown 暗色同配方） */
html[data-theme='dark'] .ob-add-cascader-popper {
  background: rgba(46, 46, 52, 0.92) !important;
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24) !important;
}
</style>
