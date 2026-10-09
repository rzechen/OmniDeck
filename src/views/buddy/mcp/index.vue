<template>
  <div class="ob-manage-page">
    <!-- 顶部 Hero（市场页同款） -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">连接器</h2>
          <span class="ob-hero-badge" v-if="mcpServers.length">{{ mcpServers.length }} 个已接入</span>
        </div>
        <p class="ob-section-desc">接入官方连接器或自定义 MCP Server，为 Agent 扩展外部工具；配置全量本地保存</p>
      </div>
      <el-button
        size="small"
        round
        type="primary"
        class="ob-hero-btn"
        @click="openMcpAdd"
      ><svg-icon icon-class="plus" class="ob-btn-svg" />新增连接器</el-button>
    </header>

    <!-- 内容区（hero 固定，仅此区域滚动） -->
    <div class="ob-page-body">
      <!-- ===== 内置浏览器（系统级能力，随包内置、不可移除） ===== -->
      <section class="ob-connector-section">
        <div class="ob-builtin-card">
          <div class="ob-builtin-main">
            <div class="ob-builtin-icon"><svg-icon icon-class="browser" /></div>
            <div class="ob-builtin-info">
              <div class="ob-builtin-title">
                内置浏览器（Playwright）
                <span class="ob-builtin-tag">系统内置</span>
              </div>
              <div class="ob-builtin-desc">
                无头浏览器自动化（登录态保存已启用）：访问站点遇登录墙自动通知，一键打开登录向导小窗完成登录，成功后自动保存登录态并关闭，各站点首登一次后免登录
              </div>
              <div class="ob-builtin-tip" v-if="wizardHost">
                登录向导已打开（{{ wizardHost }}）：在弹出的窗口中完成登录即可，成功后自动保存并关闭；关闭窗口视为取消
              </div>
            </div>
          </div>
          <div class="ob-builtin-ctrl">
            <el-tag size="small" :type="wizardHost ? 'warning' : 'info'">
              {{ wizardHost ? '登录中 · ' + wizardHost : '无头 · 自动' }}
            </el-tag>
          </div>
        </div>
      </section>

      <!-- ===== 连接器（MCP Server） ===== -->
      <!-- 空状态直接挂在 .ob-page-body 下，flex:1 占满剩余空间实现垂直居中 -->
      <div v-if="!mcpServers.length && !mcpLoading" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="mcp" />
        </div>
        <div class="ob-empty-title">暂无连接器</div>
        <div class="ob-empty-desc">接入一个 MCP Server，让 Agent 获得外部工具能力</div>
        <el-button
          size="small"
          round
          type="primary"
          @click="openMcpAdd"
        ><svg-icon icon-class="plus" class="ob-btn-svg" />新增连接器</el-button>
      </div>

      <!-- 服务卡片网格 -->
      <section v-else class="ob-connector-section">
        <div class="ob-cards-grid">
          <!-- 加载中：卡片骨架占位 -->
          <div v-if="mcpLoading" class="ob-sk-wrap">
            <buddy-skeleton type="cards" :count="8" />
          </div>
          <mcp-card
            v-for="s in mcpServers"
            v-else
            :key="s.name"
            :item="s"
            @toggle="toggleMcpEnabled"
            @edit="openMcpEdit"
            @remove="removeMcpItem"
          />
        </div>
      </section>
    </div>

    <!-- 连接器凭证引导弹窗 -->
    <el-dialog
      :title="'连接 ' + (connectDialog.name || '')"
      v-model="connectDialog.visible"
      width="480px"
      append-to-body
      class="ob-el-dialog"
      :close-on-click-modal="false"
    >
      <div class="ob-dialog-form">
        <div class="ob-connector-hint">
          <svg-icon icon-class="warning-outline" />
          {{ connectDialog.hint }}
        </div>
        <div class="ob-field">
          <label class="ob-field-label">{{ connectDialog.label }} <span class="ob-field-required">*</span></label>
          <el-input
            v-model="connectDialog.token"
            size="small"
            show-password
            placeholder="粘贴 Token（经系统钥匙串加密存储，不会明文落盘）"
          />
        </div>
      </div>
      <template #footer>
        <el-button size="small" round @click="connectDialog.visible = false">取消</el-button>
        <el-button size="small" round type="primary" :loading="connectDialog.busy" @click="confirmConnect">连接并接入</el-button>
      </template>
    </el-dialog>

    <!-- 新增/编辑连接器（MCP Server）弹窗 -->
    <mcp-form-dialog
      v-model:visible="mcpModalVisible"
      :editing="mcpEditing"
      :servers="mcpServers"
      @saved="loadMcp"
    />
  </div>
</template>

<script setup>
// OmniBuddy 连接器页：官方连接器（一键接入）+ 自定义 MCP Server（stdio / Streamable HTTP）
// 卡片与新增/编辑弹窗已拆分至 ./components/（McpCard / McpFormDialog）
import { ref, reactive, nextTick, onMounted, onBeforeUnmount } from 'vue'
import McpCard from './components/McpCard.vue'
import McpFormDialog from './components/McpFormDialog.vue'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
import { buddyApi, buddyApiSection } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'OmniBuddyMcp' })

const { message, confirm } = useFeedback()

const mcpServers = ref([])
const mcpLoading = ref(false)
// 登录向导当前打开的站点（空 = 未开）：login_wizard 事件实时驱动
const wizardHost = ref('')
// 新增/编辑弹窗显隐与编辑对象（null 表示新增）
const mcpModalVisible = ref(false)
const mcpEditing = ref(null)
// 官方连接器（分区已移除，保留空实现避免残留引用报错）
const connectors = ref([])
const connectorLoading = ref(false)
const connectDialog = reactive({
  visible: false,
  id: '',
  name: '',
  label: '',
  hint: '',
  // 鉴权结构（主进程 credentialSpec 返回）
  envKey: '',
  headerKey: '',
  headerPrefix: '',
  token: '',
  busy: false
})
let unsubPw = null

// 连接器 IPC 桥（官方分区已移除，凭证弹窗仍走该桥）
function api() {
  return buddyApiSection('connectors')
}

function loadConnectors() {
  /* 官方连接器分区已移除，保留空实现避免 preload 兼容问题 */
}

function openDoc(c) {
  const a = api()
  if (c.docUrl && a) a.openDoc(c.docUrl)
}

// 需鉴权连接器：拉取凭证引导信息并弹窗；免鉴权连接器直接接入
async function openConnectDialog(c) {
  if (!c.needsCredential) {
    doConnect(c.id, null)
    return
  }
  const a = api()
  const spec = await a.credentialSpec(c.id)
  if (!spec) {
    doConnect(c.id, null)
    return
  }
  Object.assign(connectDialog, {
    visible: true,
    id: c.id,
    name: c.name,
    label: spec.label,
    hint: spec.hint,
    envKey: spec.envKey,
    headerKey: spec.headerKey,
    headerPrefix: spec.headerPrefix,
    token: '',
    busy: false
  })
}

// 组装凭证并接入：env 型（Lark/Notion）或 header 型（GitHub）；
// Notion 需将 token 包成 JSON 头（OPENAPI_MCP_HEADERS 约定）
async function confirmConnect() {
  const d = connectDialog
  const token = d.token.trim()
  if (!token) {
    message.error('请输入 ' + d.label)
    return
  }
  d.busy = true
  const omnibuddy = buddyApi()
  // 凭证 secret 结构
  let headers = {}
  let env = {}
  if (d.id === 'notion') {
    // Notion 官方约定：headers JSON 字符串注入环境变量
    env = {
      OPENAPI_MCP_HEADERS: JSON.stringify({
        Authorization: 'Bearer ' + token,
        'Notion-Version': '2022-06-28'
      })
    }
  } else if (d.headerKey) {
    headers = { [d.headerKey]: d.headerPrefix + token }
  } else if (d.envKey) {
    env = { [d.envKey]: token }
  }
  try {
    const credRes = await omnibuddy.credentials.create({
      name: '连接器 · ' + d.name,
      type: 'connector',
      description: d.label,
      headers,
      env
    })
    if (!credRes || !credRes.ok) {
      d.busy = false
      message.error((credRes && credRes.error) || '凭证保存失败')
      return
    }
    doConnect(d.id, credRes.credential.id)
  } catch (e) {
    d.busy = false
    message.error('凭证保存异常')
  }
}

async function doConnect(id, credentialId) {
  const a = api()
  try {
    const res = await a.connect(id, credentialId ? { credentialId } : {})
    if (!res || !res.ok) {
      connectDialog.busy = false
      message.error((res && res.error) || '接入失败')
      return
    }
    connectDialog.visible = false
    connectDialog.busy = false
    message.success('连接器已接入，新会话生效')
    loadConnectors()
  } catch (e) {
    connectDialog.busy = false
    message.error('接入请求异常')
  }
}

function disconnectConnector(c) {
  const a = api()
  confirm(`断开「${c.name}」连接器？对应 MCP Server 配置将被移除。`, '断开确认', {
    confirmButtonText: '断开',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    try {
      const res = await a.disconnect(c.id)
      if (!res || !res.ok) {
        message.error((res && res.error) || '断开失败')
        return
      }
      message.success('已断开')
      loadConnectors()
    } catch (e) {
      message.error('断开请求异常')
    }
  }).catch(() => { /* 取消 */ })
}

async function loadMcp() {
  const omnibuddy = buddyApi()
  const mcp = omnibuddy && omnibuddy.mcp
  mcpLoading.value = true
  try {
    if (mcp) {
      const servers = await mcp.list()
      mcpServers.value = Array.isArray(servers) ? servers : []
    } else {
      mcpServers.value = []
    }
  } catch (e) {
    mcpServers.value = []
  }
  mcpLoading.value = false
}

function openMcpAdd() {
  mcpEditing.value = null
  mcpModalVisible.value = true
}

function openMcpEdit(s) {
  mcpEditing.value = s
  mcpModalVisible.value = true
}

// 全量保存连接器列表（开关切换 / 删除共用；弹窗保存走子组件内部实现）
async function saveMcpServers(servers) {
  const omnibuddy = buddyApi()
  const mcp = omnibuddy && omnibuddy.mcp
  if (!mcp) {
    message.error('连接器管理仅桌面端可用')
    return false
  }
  try {
    const res = await mcp.save(servers)
    if (res && res.ok === false) {
      message.error(res.error || '保存失败')
      return false
    }
    loadMcp()
    return true
  } catch (e) {
    message.error('保存失败：' + (e && e.message ? e.message : '未知错误'))
    return false
  }
}

// 启用开关：v-model 已更新状态，此处全量保存；失败回滚
async function toggleMcpEnabled(s) {
  const ok = await saveMcpServers(mcpServers.value)
  if (!ok) {
    nextTick(() => { s.enabled = !s.enabled })
  }
}

function removeMcpItem(s) {
  confirm('确定删除连接器「' + s.name + '」吗？', '删除连接器', {
    confirmButtonText: '删除',
    cancelButtonText: '取消',
    type: 'warning'
  }).then(async () => {
    const ok = await saveMcpServers(mcpServers.value.filter(x => x.name !== s.name))
    if (ok) message.success('已删除')
  }).catch(() => {})
}

// created：进入页面即拉取连接器列表
loadMcp()

onMounted(() => {
  // 登录向导开/关由主进程广播实时驱动（徽标翻转 + 成功提示）；
  // 撞墙引导入口已收敛到聊天思考区工具卡片内嵌按钮，本页不再展示站点登记表
  const omnibuddy = buddyApi()
  if (omnibuddy && omnibuddy.onEvent) {
    unsubPw = omnibuddy.onEvent(e => {
      if (e && e.type === 'login_wizard') {
        wizardHost.value = e.phase === 'open' ? e.host : ''
        if (e.phase === 'success') message.success('「' + e.host + '」登录成功，登录态已保存')
      }
    })
  }
})

onBeforeUnmount(() => {
  if (unsubPw) {
    unsubPw()
    unsubPw = null
  }
})
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 分区结构 */
.ob-connector-section {
  margin-bottom: 26px;
}

/* 内置浏览器卡片（系统级固定能力：有头首登开关） */
.ob-builtin-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 18px;
  border-radius: 12px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color);
}

.ob-builtin-main {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  min-width: 0;
}

.ob-builtin-icon {
  flex-shrink: 0;
  width: 38px;
  height: 38px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);

  .svg-icon {
    width: 20px;
    height: 20px;
  }
}

.ob-builtin-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.ob-builtin-tag {
  padding: 1px 8px;
  border-radius: 999px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
}

.ob-builtin-desc {
  margin-top: 4px;
  font-size: 11.5px;
  line-height: 1.55;
  color: $text-secondary;
}

.ob-builtin-tip {
  margin-top: 6px;
  font-size: 11.5px;
  line-height: 1.55;
  color: var(--warning-color, #efaa17);
}

.ob-builtin-ctrl {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 站点登录卡片已移除（撞墙引导收敛到思考区工具卡片内嵌按钮 + 系统通知） */

/* 加载骨架容器内边距 */
.ob-sk-wrap {
  padding: 18px 4px;
}

/* 凭证引导提示条 */
.ob-connector-hint {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  font-size: 11.5px;
  color: $text-secondary;
  line-height: 1.55;
  padding: 9px 11px;
  border-radius: 8px;
  background: rgba(var(--primary-color-rgb), 0.06);
  border: 1px solid rgba(var(--primary-color-rgb), 0.15);
  margin-bottom: 12px;

  .svg-icon {
    flex-shrink: 0;
    margin-top: 1px;
    color: var(--primary-color);
  }
}
</style>
