<template>
  <div class="ob-manage-page">
    <header class="ob-section-header">
      <div class="ob-header-row">
        <div>
          <h2 class="ob-section-title">MCP 管理</h2>
          <p class="ob-section-desc">接入标准 MCP Server，为 Agent 扩展外部工具；配置全量本地保存</p>
        </div>
        <el-button
          size="small"
          round
          type="primary"
          @click="openMcpAdd"
        ><svg-icon icon-class="plus" class="ob-btn-svg" />新增服务</el-button>
      </div>
    </header>

    <!-- 空状态 -->
    <div v-if="!mcpServers.length && !mcpLoading" class="ob-empty">
      <div class="ob-empty-icon">
        <svg-icon icon-class="connection" />
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
            <svg-icon icon-class="connection" class="ob-mcp-card-svg" />
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
// OmniBuddy MCP 服务页：接入标准 MCP Server（stdio / Streamable HTTP）
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
      }
    }
  },
  created() {
    this.loadMcp()
  },
  methods: {
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
</style>
