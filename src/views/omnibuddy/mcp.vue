<template>
  <div class="ob-manage-page">
    <header class="ob-section-header">
      <div class="ob-header-row">
        <div>
          <h2 class="ob-section-title">MCP 管理</h2>
          <p class="ob-section-desc">接入官方连接器或标准 MCP Server，为 Agent 扩展外部工具；配置全量本地保存</p>
        </div>
        <el-button
          size="small"
          round
          type="primary"
          @click="openMcpAdd"
        ><svg-icon icon-class="plus" class="ob-btn-svg" />新增服务</el-button>
      </div>
    </header>

    <!-- ===== 官方连接器分区 ===== -->
    <section class="ob-connector-section">
      <div class="ob-connector-header">
        <span class="ob-connector-title">官方连接器</span>
        <span class="ob-connector-sub">一键接入官方 MCP Server，新会话即生效</span>
      </div>
      <div v-if="connectorLoading" class="ob-ext-loading">
        <svg-icon icon-class="loading" class="ob-spin" /> 加载中…
      </div>
      <div v-else class="ob-connector-grid">
        <div v-for="c in connectors" :key="c.id" class="ob-connector-card">
          <div class="ob-connector-card-head">
            <span class="ob-item-logo logo-custom">
              <svg-icon :icon-class="c.icon" />
            </span>
            <div class="ob-connector-card-title">
              <div class="ob-connector-name">
                {{ c.name }}
                <span v-if="c.connected" class="ob-market-badge ok">已连接</span>
                <span v-else-if="c.transport === 'builtin'" class="ob-market-badge ok">内置</span>
              </div>
              <div class="ob-connector-meta">{{ c.category }}</div>
            </div>
          </div>
          <p class="ob-connector-desc">{{ c.description }}</p>
          <div class="ob-connector-foot">
            <span class="ob-connector-doc" @click="openDoc(c)">接入说明</span>
            <template v-if="c.transport === 'builtin'">
              <el-button size="mini" round :disabled="true">开箱即用</el-button>
            </template>
            <el-button
              v-else-if="c.connected"
              size="mini"
              round
              @click="disconnectConnector(c)"
            >断开</el-button>
            <el-button
              v-else
              size="mini"
              round
              type="primary"
              plain
              @click="openConnectDialog(c)"
            >{{ c.needsCredential ? '连接' : '一键接入' }}</el-button>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== 自定义 MCP 服务 ===== -->
    <section class="ob-connector-section">
      <div class="ob-connector-header">
        <span class="ob-connector-title">自定义 MCP 服务</span>
        <span class="ob-connector-sub">标准 stdio / Streamable HTTP 接入，社区 Server 均适用</span>
      </div>

      <!-- 空状态 -->
      <div v-if="!mcpServers.length && !mcpLoading" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="mcp" />
        </div>
        <div class="ob-empty-title">暂无 MCP 服务</div>
        <div class="ob-empty-desc">新增一个 MCP 服务，让 Agent 获得外部工具能力</div>
        <el-button
          size="small"
          round
          type="primary"
          @click="openMcpAdd"
        ><svg-icon icon-class="plus" class="ob-btn-svg" />新增服务</el-button>
      </div>

      <!-- 服务卡片列表 -->
      <div v-else class="ob-mcp-list">
        <div v-if="mcpLoading" class="ob-ext-loading">
          <svg-icon icon-class="loading" class="ob-spin" /> 加载中…
        </div>
        <div
          v-for="s in mcpServers"
          v-else
          :key="s.name"
          class="ob-mcp-card"
          :class="{ disabled: !s.enabled }"
        >
          <div class="ob-mcp-card-head">
            <div class="ob-mcp-card-title">
              <svg-icon icon-class="mcp" class="ob-mcp-card-svg" />
              <span class="ob-mcp-card-name">{{ s.name }}</span>
              <span class="ob-mcp-badge" :class="s.transport === 'http' ? 'is-http' : 'is-stdio'">
                {{ s.transport === 'http' ? 'HTTP' : 'stdio' }}
              </span>
            </div>
            <div class="ob-mcp-card-ops">
              <el-switch
                v-model="s.enabled"
                @change="toggleMcpEnabled(s)"
              />
              <span class="ob-item-action" title="编辑" @click="openMcpEdit(s)">
                <svg-icon icon-class="edit" />
              </span>
              <span class="ob-item-action danger" title="删除" @click="removeMcpItem(s)">
                <svg-icon icon-class="delete" />
              </span>
            </div>
          </div>
          <p class="ob-mcp-card-desc">{{ s.description || '（无描述）' }}</p>
          <div class="ob-mcp-cmdline">
            <template v-if="s.transport === 'http'">{{ s.url }}</template>
            <template v-else>{{ s.command }} {{ (s.args || []).join(' ') }}</template>
          </div>
        </div>
      </div>
    </section>

    <!-- 连接器凭证引导弹窗 -->
    <el-dialog
      :title="'连接 ' + (connectDialog.name || '')"
      :visible.sync="connectDialog.visible"
      width="480px"
      append-to-body
      custom-class="ob-el-dialog"
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
      <template slot="footer">
        <el-button size="small" round @click="connectDialog.visible = false">取消</el-button>
        <el-button size="small" round type="primary" :loading="connectDialog.busy" @click="confirmConnect">连接并接入</el-button>
      </template>
    </el-dialog>

    <!-- 新增/编辑 MCP 服务弹窗 -->
    <el-dialog
      :title="mcpEditing ? '编辑 MCP 服务' : '新增 MCP 服务'"
      :visible.sync="mcpModalVisible"
      width="560px"
      append-to-body
      custom-class="ob-el-dialog"
      :close-on-click-modal="false"
    >
      <div class="ob-dialog-form">
        <!-- 名称（编辑时不可改，作为服务唯一标识） -->
        <div class="ob-field">
          <label class="ob-field-label">名称 <span class="ob-field-required">*</span></label>
          <el-input
            v-model="mcpForm.name"
            size="small"
            clearable
            :disabled="!!mcpEditing"
            placeholder="服务唯一标识，如 filesystem"
            maxlength="40"
          />
        </div>
        <!-- 描述 -->
        <div class="ob-field">
          <label class="ob-field-label">描述</label>
          <el-input
            v-model="mcpForm.description"
            size="small"
            clearable
            placeholder="一句话说明该服务提供的工具（可留空）"
            maxlength="120"
          />
        </div>
        <!-- 传输协议：自绘分段按钮 -->
        <div class="ob-field">
          <label class="ob-field-label">传输协议 <span class="ob-field-required">*</span></label>
          <div class="ob-seg ob-seg-full">
            <div
              class="ob-seg-item"
              :class="{ active: mcpForm.transport === 'http' }"
              @click="mcpForm.transport = 'http'"
            >
              <svg-icon icon-class="link" />
              Streamable HTTP
            </div>
            <div
              class="ob-seg-item"
              :class="{ active: mcpForm.transport === 'stdio' }"
              @click="mcpForm.transport = 'stdio'"
            >
              <svg-icon icon-class="monitor" />
              stdio 本地
            </div>
          </div>
        </div>
        <!-- stdio 型：启动命令 / 参数 / 环境变量 -->
        <template v-if="mcpForm.transport === 'stdio'">
          <div class="ob-field">
            <label class="ob-field-label">启动命令 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="mcpForm.command"
              size="small"
              clearable
              placeholder="如 npx 或 uvx"
            />
          </div>
          <div class="ob-field">
            <label class="ob-field-label">命令参数（JSON 数组）</label>
            <el-input
              v-model="mcpForm.argsStr"
              type="textarea"
              :rows="2"
              placeholder='如 ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]'
              @blur="formatMcpJsonField('argsStr', 'array')"
            />
          </div>
          <div class="ob-field">
            <label class="ob-field-label">环境变量（JSON 对象）</label>
            <el-input
              v-model="mcpForm.envStr"
              type="textarea"
              :rows="2"
              placeholder='如 {"API_KEY": "sk-…"}'
              @blur="formatMcpJsonField('envStr', 'object')"
            />
          </div>
        </template>
        <!-- http 型：服务 URL / 请求头 -->
        <template v-else>
          <div class="ob-field">
            <label class="ob-field-label">服务 URL <span class="ob-field-required">*</span></label>
            <el-input
              v-model="mcpForm.url"
              size="small"
              clearable
              placeholder="如 https://mcp.example.com/sse"
            />
          </div>
          <div class="ob-field">
            <label class="ob-field-label">请求头（JSON 对象）</label>
            <el-input
              v-model="mcpForm.headersStr"
              type="textarea"
              :rows="2"
              placeholder='如 {"Authorization": "Bearer …"}'
              @blur="formatMcpJsonField('headersStr', 'object')"
            />
          </div>
        </template>
      </div>
      <template slot="footer">
        <el-button size="small" round @click="mcpModalVisible = false">取消</el-button>
        <el-button size="small" round type="primary" @click="saveMcpItem">{{ mcpEditing ? '保存修改' : '添加服务' }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
// OmniBuddy MCP 服务页：官方连接器（一键接入）+ 标准 MCP Server（stdio / Streamable HTTP）
export default {
  name: 'OmniBuddyMcp',
  data() {
    return {
      mcpServers: [],
      mcpLoading: false,
      mcpModalVisible: false,
      // 编辑中的 MCP 服务（null 表示新增）
      mcpEditing: null,
      mcpForm: {
        name: '',
        description: '',
        // 默认选中 Streamable HTTP
        transport: 'http',
        command: '',
        argsStr: '',
        envStr: '',
        url: '',
        headersStr: ''
      },
      // 官方连接器
      connectors: [],
      connectorLoading: false,
      connectDialog: {
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
      }
    }
  },
  created() {
    this.loadMcp()
    this.loadConnectors()
  },
  methods: {
    api() {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      return api && api.connectors
    },
    loadConnectors() {
      const c = this.api()
      this.connectorLoading = true
      if (!c) {
        this.connectors = []
        this.connectorLoading = false
        return
      }
      c.list().then(list => {
        this.connectors = Array.isArray(list) ? list : []
        this.connectorLoading = false
      }).catch(() => {
        this.connectors = []
        this.connectorLoading = false
      })
    },
    openDoc(c) {
      const api = this.api()
      if (c.docUrl && api) api.openDoc(c.docUrl)
    },
    // 需鉴权连接器：拉取凭证引导信息并弹窗；免鉴权连接器直接接入
    async openConnectDialog(c) {
      if (!c.needsCredential) {
        this.doConnect(c.id, null)
        return
      }
      const api = this.api()
      const spec = await api.credentialSpec(c.id)
      if (!spec) {
        this.doConnect(c.id, null)
        return
      }
      this.connectDialog = {
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
      }
    },
    // 组装凭证并接入：env 型（Lark/Notion）或 header 型（GitHub）；
    // Notion 需将 token 包成 JSON 头（OPENAPI_MCP_HEADERS 约定）
    async confirmConnect() {
      const d = this.connectDialog
      const token = d.token.trim()
      if (!token) {
        this.$message.error('请输入 ' + d.label)
        return
      }
      d.busy = true
      const omnibuddy = window.electronAPI && window.electronAPI.omnibuddy
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
          this.$message.error((credRes && credRes.error) || '凭证保存失败')
          return
        }
        this.doConnect(d.id, credRes.credential.id)
      } catch (e) {
        d.busy = false
        this.$message.error('凭证保存异常')
      }
    },
    async doConnect(id, credentialId) {
      const api = this.api()
      try {
        const res = await api.connect(id, credentialId ? { credentialId } : {})
        if (!res || !res.ok) {
          this.connectDialog.busy = false
          this.$message.error((res && res.error) || '接入失败')
          return
        }
        this.connectDialog.visible = false
        this.connectDialog.busy = false
        this.$message.success('连接器已接入，新会话生效')
        this.loadConnectors()
      } catch (e) {
        this.connectDialog.busy = false
        this.$message.error('接入请求异常')
      }
    },
    disconnectConnector(c) {
      const api = this.api()
      this.$confirm(`断开「${c.name}」连接器？对应 MCP 服务将被移除。`, '断开确认', {
        confirmButtonText: '断开',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        try {
          const res = await api.disconnect(c.id)
          if (!res || !res.ok) {
            this.$message.error((res && res.error) || '断开失败')
            return
          }
          this.$message.success('已断开')
          this.loadConnectors()
        } catch (e) {
          this.$message.error('断开请求异常')
        }
      }).catch(() => { /* 取消 */ })
    },
    async loadMcp() {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      const mcp = api && api.mcp
      this.mcpLoading = true
      try {
        if (mcp) {
          const servers = await mcp.list()
          this.mcpServers = Array.isArray(servers) ? servers : []
        } else {
          this.mcpServers = []
        }
      } catch (e) {
        this.mcpServers = []
      }
      this.mcpLoading = false
    },
    openMcpAdd() {
      this.mcpEditing = null
      this.mcpForm = {
        name: '',
        description: '',
        // 默认选中 Streamable HTTP
        transport: 'http',
        command: '',
        argsStr: '',
        envStr: '',
        url: '',
        headersStr: ''
      }
      this.mcpModalVisible = true
    },
    openMcpEdit(s) {
      this.mcpEditing = s
      this.mcpForm = {
        name: s.name,
        description: s.description || '',
        transport: s.transport || 'stdio',
        command: s.command || '',
        argsStr: JSON.stringify(s.args || []),
        envStr: JSON.stringify(s.env || {}),
        url: s.url || '',
        headersStr: JSON.stringify(s.headers || {})
      }
      this.mcpModalVisible = true
    },
    // JSON 字符串校验：空串返回空数组/对象；解析失败或类型不符返回 false 并提示
    parseJsonField(str, label, kind) {
      const text = (str || '').trim()
      if (!text) return kind === 'array' ? [] : {}
      let parsed = null
      try {
        parsed = JSON.parse(text)
      } catch (e) {
        parsed = null
      }
      const valid = parsed !== null && (kind === 'array'
        ? Array.isArray(parsed)
        : (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)))
      if (!valid) {
        this.$message.error(label + '不是合法的 JSON ' + (kind === 'array' ? '数组' : '对象'))
        return false
      }
      return parsed
    },
    // MCP 弹窗 JSON 字段失焦自动格式化（命令参数/环境变量/请求头）：
    // 合法且类型匹配时格式化回填；非法时提示（保存前 parseJsonField 兜底拦截）
    formatMcpJsonField(field, kind) {
      const text = String(this.mcpForm[field] || '').trim()
      if (!text) return
      try {
        const parsed = JSON.parse(text)
        const valid = kind === 'array'
          ? Array.isArray(parsed)
          : (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
        if (!valid) throw new Error('bad')
        this.mcpForm[field] = JSON.stringify(parsed, null, 2)
      } catch (e) {
        const labels = { argsStr: '命令参数', envStr: '环境变量', headersStr: '请求头' }
        this.$message.error((labels[field] || '该字段') + '不是合法的 JSON ' + (kind === 'array' ? '数组' : '对象'))
      }
    },
    async saveMcpItem() {
      const form = this.mcpForm
      const name = form.name.trim()
      if (!name) {
        this.$message.error('请输入服务名称')
        return
      }
      const isEdit = !!this.mcpEditing
      if (!isEdit && this.mcpServers.some(s => s.name === name)) {
        this.$message.error('已存在同名服务：' + name)
        return
      }
      // 组装服务配置（JSON 字段先校验再转换）
      const item = { name, description: form.description.trim(), transport: form.transport }
      if (form.transport === 'stdio') {
        if (!form.command.trim()) {
          this.$message.error('请输入启动命令')
          return
        }
        const args = this.parseJsonField(form.argsStr, '命令参数', 'array')
        const env = this.parseJsonField(form.envStr, '环境变量', 'object')
        if (args === false || env === false) return
        item.command = form.command.trim()
        item.args = args
        item.env = env
      } else {
        if (!form.url.trim()) {
          this.$message.error('请输入服务 URL')
          return
        }
        const headers = this.parseJsonField(form.headersStr, '请求头', 'object')
        if (headers === false) return
        item.url = form.url.trim()
        item.headers = headers
      }
      // 编辑：保留原字段（enabled 等）整体替换；新增：默认启用
      const next = isEdit
        ? this.mcpServers.map(s => (s.name === this.mcpEditing.name ? Object.assign({}, s, item) : s))
        : this.mcpServers.concat([Object.assign({ enabled: true }, item)])
      const ok = await this.saveMcpServers(next)
      if (ok) {
        this.mcpModalVisible = false
        this.mcpEditing = null
        this.$message.success(isEdit ? 'MCP 服务已更新，新会话生效' : 'MCP 服务已添加，新会话生效')
      }
    },
    // 全量保存 MCP 服务列表（开关切换 / 删除 / 编辑共用）
    async saveMcpServers(servers) {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      const mcp = api && api.mcp
      if (!mcp) {
        this.$message.error('MCP 管理仅桌面端可用')
        return false
      }
      try {
        const res = await mcp.save(servers)
        if (res && res.ok === false) {
          this.$message.error(res.error || '保存失败')
          return false
        }
        this.loadMcp()
        return true
      } catch (e) {
        this.$message.error('保存失败：' + (e && e.message ? e.message : '未知错误'))
        return false
      }
    },
    // 启用开关：v-model 已更新状态，此处全量保存；失败回滚
    async toggleMcpEnabled(s) {
      const ok = await this.saveMcpServers(this.mcpServers)
      if (!ok) {
        this.$nextTick(() => { s.enabled = !s.enabled })
      }
    },
    removeMcpItem(s) {
      this.$confirm('确定删除 MCP 服务「' + s.name + '」吗？', '删除 MCP 服务', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const ok = await this.saveMcpServers(this.mcpServers.filter(x => x.name !== s.name))
        if (ok) this.$message.success('已删除')
      }).catch(() => {})
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 分区结构 */
.ob-connector-section {
  margin-bottom: 26px;
}

.ob-connector-header {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 12px;
}

.ob-connector-title {
  font-size: 13.5px;
  font-weight: 700;
  color: $text-primary;
}

.ob-connector-sub {
  font-size: 11px;
  color: $text-secondary;
}

/* 连接器网格（与市场卡片同构） */
.ob-connector-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 12px;
}

.ob-connector-card {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  transition: all 0.18s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.07);
    transform: translateY(-1px);
  }
}

.ob-connector-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ob-connector-card-title {
  flex: 1;
  min-width: 0;
}

.ob-connector-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13.5px;
  font-weight: 700;
  color: $text-primary;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ob-connector-meta {
  margin-top: 2px;
  font-size: 11px;
  color: $text-secondary;
}

.ob-item-logo {
  .svg-icon {
    font-size: 17px;
    color: #fff;
  }
}

.ob-connector-desc {
  font-size: 11.5px;
  color: $text-secondary;
  line-height: 1.55;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  min-height: 2.4em;
}

.ob-connector-foot {
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.ob-connector-doc {
  font-size: 11px;
  color: var(--primary-color);
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &:hover {
    text-decoration: underline;
  }
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
