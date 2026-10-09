<template>
  <!-- 新增/编辑连接器（MCP Server）抽屉：协议切换 + 多个 JSON 字段，表单偏长 → 右侧全高抽屉 -->
  <transition name="ob-drawer">
    <div v-if="dialogVisible" class="ob-drawer" @click.self="dialogVisible = false">
      <div class="ob-drawer-panel mcp-form-panel">
        <header class="ob-drawer-header">
          <h3 class="ob-dialog-title">{{ isEdit ? '编辑连接器' : '新增连接器' }}</h3>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="dialogVisible = false" />
        </header>

        <div class="ob-drawer-body">
          <div class="ob-dialog-form">
            <!-- 名称（编辑时不可改，作为服务唯一标识） -->
            <div class="ob-field">
              <label class="ob-field-label">名称 <span class="ob-field-required">*</span></label>
              <el-input
                v-model="mcpForm.name"
                size="small"
                clearable
                :disabled="isEdit"
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
                  :rows="4"
                  class="ob-code-area"
                  placeholder='如 ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]'
                  @blur="formatMcpJsonField('argsStr', 'array')"
                />
              </div>
              <div class="ob-field">
                <label class="ob-field-label">环境变量（JSON 对象）</label>
                <el-input
                  v-model="mcpForm.envStr"
                  type="textarea"
                  :rows="6"
                  class="ob-code-area"
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
                  :rows="6"
                  class="ob-code-area"
                  placeholder='如 {"Authorization": "Bearer …"}'
                  @blur="formatMcpJsonField('headersStr', 'object')"
                />
              </div>
            </template>
          </div>
        </div>

        <footer class="ob-drawer-footer">
          <div class="ob-dialog-btns">
            <el-button size="small" round @click="dialogVisible = false">取消</el-button>
            <el-button size="small" round type="primary" @click="saveMcpItem">{{ isEdit ? '保存修改' : '添加服务' }}</el-button>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script setup>
// 新增/编辑连接器（MCP Server）弹窗：表单初始化、JSON 字段校验/失焦格式化、组装与全量保存
import { ref, computed, watch } from 'vue'
import { parseJsonField, formatJsonField } from '@/utils/data/json-field'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'McpFormDialog' })

const props = defineProps({
  // 弹窗显隐（父级 .sync 控制）
  visible: {
    type: Boolean,
    default: false
  },
  // 编辑中的连接器（null 表示新增）
  editing: {
    type: Object,
    default: null
  },
  // 当前连接器列表（重名校验与全量组装用，只读不改）
  servers: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['update:visible', 'saved'])

const { message } = useFeedback()

const mcpForm = ref({
  name: '',
  description: '',
  // 默认选中 Streamable HTTP
  transport: 'http',
  command: '',
  argsStr: '',
  envStr: '',
  url: '',
  headersStr: ''
})

// 是否编辑模式（编辑时名称不可改）
const isEdit = computed(() => {
  return !!props.editing
})

// 弹窗显隐代理（el-dialog 的 .sync 透传给父级）
const dialogVisible = computed({
  get() {
    return props.visible
  },
  set(v) {
    emit('update:visible', v)
  }
})

// 表单初始化：新增清空（默认 http）；编辑回填（JSON 字段序列化为字符串）
function initForm() {
  const e = props.editing
  if (!e) {
    mcpForm.value = {
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
  } else {
    mcpForm.value = {
      name: e.name,
      description: e.description || '',
      transport: e.transport || 'stdio',
      command: e.command || '',
      argsStr: JSON.stringify(e.args || []),
      envStr: JSON.stringify(e.env || {}),
      url: e.url || '',
      headersStr: JSON.stringify(e.headers || {})
    }
  }
}

// JSON 字段失焦自动格式化（命令参数/环境变量/请求头）：
// 合法且类型匹配时格式化回填；非法时提示（保存前 parseJsonField 兜底拦截）
// 注：json-field 工具按 vm.$message 提示，此处传 { $message: message } 适配
function formatMcpJsonField(field, kind) {
  const labels = { argsStr: '命令参数', envStr: '环境变量', headersStr: '请求头' }
  formatJsonField(mcpForm.value, field, kind, labels[field], { $message: message })
}

async function saveMcpItem() {
  const form = mcpForm.value
  const name = form.name.trim()
  if (!name) {
    message.error('请输入服务名称')
    return
  }
  const editing = isEdit.value
  if (!editing && props.servers.some(s => s.name === name)) {
    message.error('已存在同名服务：' + name)
    return
  }
  // 组装服务配置（JSON 字段先校验再转换）
  const item = { name, description: form.description.trim(), transport: form.transport }
  if (form.transport === 'stdio') {
    if (!form.command.trim()) {
      message.error('请输入启动命令')
      return
    }
    const args = parseJsonField({ $message: message }, form.argsStr, '命令参数', 'array')
    const env = parseJsonField({ $message: message }, form.envStr, '环境变量', 'object')
    if (args === false || env === false) return
    item.command = form.command.trim()
    item.args = args
    item.env = env
  } else {
    if (!form.url.trim()) {
      message.error('请输入服务 URL')
      return
    }
    const headers = parseJsonField({ $message: message }, form.headersStr, '请求头', 'object')
    if (headers === false) return
    item.url = form.url.trim()
    item.headers = headers
  }
  // 编辑：保留原字段（enabled 等）整体替换；新增：默认启用
  const next = editing
    ? props.servers.map(s => (s.name === props.editing.name ? Object.assign({}, s, item) : s))
    : props.servers.concat([Object.assign({ enabled: true }, item)])
  const ok = await saveMcpServers(next)
  if (ok) {
    dialogVisible.value = false
    // 保存成功：通知父级刷新列表
    emit('saved')
    message.success(editing ? '连接器已更新，新会话生效' : '连接器已添加，新会话生效')
  }
}

// 全量保存连接器列表（弹窗保存路径；页面开关/删除共用页面侧实现）
async function saveMcpServers(servers) {
  const api = buddyApi()
  const mcp = api && api.mcp
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
    return true
  } catch (e) {
    message.error('保存失败：' + (e && e.message ? e.message : '未知错误'))
    return false
  }
}

// 弹窗打开时按 editing 初始化表单（新增重置 / 编辑回填）
watch(() => props.visible, val => {
  if (val) initForm()
})
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 抽屉面板宽度（表单型适中） */
.mcp-form-panel {
  --ob-drawer-w: 560px;
}
</style>
