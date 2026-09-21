<template>
  <div class="ob-manage-page">
    <header class="ob-section-header">
      <div class="ob-header-row">
        <div>
          <h2 class="ob-section-title">模型供应商</h2>
          <p class="ob-section-desc">配置 OmniBuddy 的模型接入，全部本地保存不上云</p>
        </div>
        <el-button
          size="small"
          round
          type="primary"
          @click="openCreate"
        ><svg-icon icon-class="plus" class="ob-btn-svg" />新建供应商</el-button>
      </div>
    </header>

    <!-- 空状态 -->
    <div v-if="!list.length" class="ob-empty">
      <div class="ob-empty-icon">
        <svg-icon icon-class="cpu" />
      </div>
      <div class="ob-empty-title">暂无模型供应商</div>
      <div class="ob-empty-desc">新建一个供应商后，即可在对话中选择对应模型</div>
      <el-button
        size="small"
        round
        type="primary"
        @click="openCreate"
      ><svg-icon icon-class="plus" class="ob-btn-svg" />新建供应商</el-button>
    </div>

    <!-- 供应商列表 -->
    <div v-else class="ob-list">
      <div
        v-for="p in list"
        :key="p.id"
        class="ob-list-item"
        :class="{ default: p.isDefault }"
        @click="setDefault(p.id)"
      >
        <span class="ob-item-logo" :class="'logo-' + p.type">{{ p.name.slice(0, 1).toUpperCase() }}</span>
        <div class="ob-item-info">
          <div class="ob-item-name">
            <span class="ob-item-title">{{ p.name }}</span>
            <span v-if="p.isDefault" class="ob-item-default-badge">默认</span>
            <span class="ob-item-format" :class="'fmt-' + (p.apiFormat || 'openai')">
              {{ p.apiFormat === 'anthropic' ? 'Anthropic' : 'OpenAI' }}
            </span>
          </div>
          <div class="ob-item-meta">
            <svg-icon icon-class="cpu" class="ob-item-model-svg" />
            <span class="ob-item-model">{{ p.displayName || p.model }}</span>
            <span class="ob-item-dot"></span>
            <span class="ob-item-url" :title="p.baseUrl">{{ p.baseUrl }}</span>
          </div>
        </div>
        <div class="ob-item-actions" @click.stop>
          <span v-if="!p.isDefault" class="ob-item-action" title="设为默认" @click="setDefault(p.id)">
            <svg-icon icon-class="check" />
          </span>
          <span class="ob-item-action" title="编辑" @click="openEdit(p)">
            <svg-icon icon-class="edit" />
          </span>
          <span class="ob-item-action danger" title="删除" @click="removeProvider(p)">
            <svg-icon icon-class="delete" />
          </span>
        </div>
      </div>
    </div>

    <!-- 新建/编辑供应商弹窗 -->
    <transition name="ob-modal">
      <div v-if="dialogVisible" class="ob-overlay" @click.self="closeDialog">
        <div class="ob-dialog">
          <header class="ob-dialog-header">
            <h3 class="ob-dialog-title">{{ editingId ? '编辑模型供应商' : '新建模型供应商' }}</h3>
            <svg-icon icon-class="close" class="ob-dialog-close" @click="closeDialog" />
          </header>

          <div class="ob-dialog-body">
            <!-- 名称 -->
            <div class="ob-field" :class="{ error: !!errors.name }">
              <label class="ob-field-label">名称 <span class="ob-field-required">*</span></label>
              <el-input
                v-model="form.name"
                size="small"
                clearable
                placeholder="输入供应商显示名称，如 OpenAI"
                maxlength="20"
                @blur="validateField('name')"
                @input="clearFieldError('name')"
              />
              <p class="ob-field-error" :class="{ visible: !!errors.name }">{{ errors.name }}</p>
            </div>

            <!-- API 格式 -->
            <div class="ob-field" :class="{ error: !!errors.apiFormat }">
              <label class="ob-field-label">API 格式 <span class="ob-field-required">*</span></label>
              <el-select
                v-model="form.apiFormat"
                size="small"
                class="ob-field-select"
                placeholder="选择接口协议格式"
                @change="validateField('apiFormat')"
              >
                <el-option label="OpenAI Chat Completions 格式" value="openai" />
                <el-option label="Anthropic Messages 格式" value="anthropic" />
              </el-select>
              <p class="ob-field-error" :class="{ visible: !!errors.apiFormat }">{{ errors.apiFormat }}</p>
            </div>

            <!-- 接口地址 -->
            <div class="ob-field" :class="{ error: !!errors.baseUrl }">
              <label class="ob-field-label">接口地址 <span class="ob-field-required">*</span></label>
              <el-input
                v-model="form.baseUrl"
                size="small"
                clearable
                :placeholder="form.apiFormat === 'anthropic' ? '输入接口地址，如 https://api.anthropic.com' : '输入接口地址，如 https://api.openai.com/v1'"
                @blur="validateField('baseUrl')"
                @input="clearFieldError('baseUrl')"
              />
              <p class="ob-field-error" :class="{ visible: !!errors.baseUrl }">{{ errors.baseUrl }}</p>
            </div>

            <!-- 模型 ID -->
            <div class="ob-field" :class="{ error: !!errors.model }">
              <label class="ob-field-label">模型 ID <span class="ob-field-required">*</span></label>
              <el-input
                v-model="form.model"
                size="small"
                clearable
                placeholder="输入模型 ID，如 gpt-4o-mini"
                @blur="validateField('model')"
                @input="clearFieldError('model')"
              />
              <p class="ob-field-error" :class="{ visible: !!errors.model }">{{ errors.model }}</p>
            </div>

            <!-- 模型展示名称 -->
            <div class="ob-field">
              <label class="ob-field-label">模型展示名称</label>
              <el-input
                v-model="form.displayName"
                size="small"
                clearable
                placeholder="未填写时默认显示为模型 ID"
                maxlength="30"
              />
            </div>

            <!-- API 秘钥（必填） -->
            <div class="ob-field" :class="{ error: !!errors.apiKey }">
              <label class="ob-field-label">API 秘钥 <span class="ob-field-required">*</span></label>
              <el-input
                v-model="form.apiKey"
                size="small"
                show-password
                clearable
                placeholder="输入供应商密钥，如 sk-…"
                @blur="validateField('apiKey')"
                @input="clearFieldError('apiKey')"
              />
              <p class="ob-field-error" :class="{ visible: !!errors.apiKey }">{{ errors.apiKey }}</p>
            </div>
          </div>

          <footer class="ob-dialog-footer">
            <p class="ob-dialog-tip">
              <svg-icon icon-class="warning-outline" class="ob-tip-svg" />连通性测试会发起一次真实请求，会消耗少量模型 Token
            </p>
            <div class="ob-dialog-btns">
              <el-button size="small" round :disabled="testing" @click="closeDialog">取消</el-button>
              <el-button
                size="small"
                round
                type="primary"
                :loading="testing"
                @click="saveProvider"
              >{{ testing ? '测试连接中…' : (editingId ? '保存修改' : '添加模型') }}</el-button>
            </div>
          </footer>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import { getItem, setItem } from '@/utils/db'

let uid = Date.now()

// OmniBuddy 模型供应商页：列表管理（新建/编辑/删除/设默认）
// 所有供应商统一走 OpenAI / Anthropic 接口规范，保存前经真实请求测试连接
export default {
  name: 'OmniBuddyProviders',
  data() {
    return {
      list: [],
      dialogVisible: false,
      editingId: null,
      form: {
        type: 'custom',
        name: '',
        apiKey: '',
        baseUrl: '',
        model: ''
      },
      // 必填字段失焦校验的错误提示
      errors: {
        name: '',
        baseUrl: '',
        model: ''
      },
      // 保存前的连接测试状态
      testing: false
    }
  },
  created() {
    this.load()
  },
  methods: {
    load() {
      const saved = getItem('aiProviderList', [])
      let list = Array.isArray(saved) ? saved : []
      // 兼容旧数据：Ollama 类型已改为自定义
      if (list.some(p => p.type === 'ollama')) {
        list = list.map(p => (p.type === 'ollama' ? { ...p, type: 'custom' } : p))
        setItem('aiProviderList', list)
      }
      this.list = list
    },
    persist() {
      setItem('aiProviderList', this.list)
    },
    // 新建：重置表单（全部为空，失焦校验）
    openCreate() {
      this.editingId = null
      this.form = {
        type: 'custom',
        name: '',
        apiFormat: 'openai',
        apiKey: '',
        baseUrl: '',
        model: '',
        displayName: ''
      }
      this.resetErrors()
      this.dialogVisible = true
    },
    // 编辑：回填表单
    openEdit(p) {
      this.editingId = p.id
      this.form = {
        type: p.type || 'custom',
        name: p.name,
        apiFormat: p.apiFormat || 'openai',
        apiKey: p.apiKey || '',
        baseUrl: p.baseUrl,
        model: p.model,
        displayName: p.displayName || ''
      }
      this.resetErrors()
      this.dialogVisible = true
    },
    closeDialog() {
      // 连接测试进行中不允许关闭，避免测试结果落空
      if (this.testing) return
      this.dialogVisible = false
    },
    // ===== 必填字段失焦校验 =====
    resetErrors() {
      this.errors.name = ''
      this.errors.baseUrl = ''
      this.errors.model = ''
    },
    validateField(field) {
      const val = (this.form[field] || '').trim()
      if (!val) {
        const msgs = {
          name: '请输入名称',
          baseUrl: '请输入接口地址',
          model: '请输入模型名称'
        }
        this.errors[field] = msgs[field]
        return false
      }
      this.errors[field] = ''
      return true
    },
    // 重新输入时清除错误提示（失焦时再校验）
    clearFieldError(field) {
      if (this.errors[field]) this.errors[field] = ''
    },
    // 测试连接：按 API 格式发起一次最小对话请求，验证地址可达、秘钥有效、模型可用
    // 会消耗少量 Token（max_tokens=1 + 单条 ping 消息）
    async testConnection() {
      const baseUrl = this.form.baseUrl.trim().replace(/\/+$/, '')
      const apiKey = (this.form.apiKey || '').trim()
      const model = this.form.model.trim()
      const isAnthropic = this.form.apiFormat === 'anthropic'

      // Anthropic：base 含 /v1 则直接拼 /messages，否则补 /v1/messages
      const url = isAnthropic
        ? baseUrl + (baseUrl.endsWith('/v1') ? '/messages' : '/v1/messages')
        : baseUrl + '/chat/completions'
      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        stream: false
      })
      const headers = { 'Content-Type': 'application/json' }
      if (isAnthropic) {
        headers['x-api-key'] = apiKey
        headers['anthropic-version'] = '2023-06-01'
      } else {
        headers.Authorization = 'Bearer ' + apiKey
      }

      let res = null
      if (window.electronAPI && window.electronAPI.httpRequest) {
        // 经主进程 net 代理，无 CORS 限制
        res = await window.electronAPI.httpRequest({ method: 'POST', url, headers, body, timeout: 15000 })
      } else {
        // 浏览器兜底（受 CORS 限制）
        try {
          const r = await fetch(url, { method: 'POST', headers, body })
          res = { ok: true, status: r.status, body: await r.text().catch(() => '') }
        } catch (e) {
          res = { ok: false, error: e.message }
        }
      }
      if (!res || !res.ok) {
        return { pass: false, msg: '连接失败：' + ((res && res.error) || '网络错误') }
      }
      if (res.status >= 200 && res.status < 300) {
        return { pass: true }
      }
      // 透传服务端错误信息（如 model not found / invalid api key）
      let detail = ''
      try {
        const parsed = JSON.parse(res.body)
        detail = (parsed.error && (parsed.error.message || parsed.error.type)) || parsed.message || ''
      } catch (e) { /* 非 JSON 响应忽略 */ }
      if (detail) detail = '（' + detail + '）'
      if (res.status === 401 || res.status === 403) {
        return { pass: false, msg: '连接失败：认证被拒绝（' + res.status + '），请检查 API 秘钥' + detail }
      }
      if (res.status === 404) {
        return { pass: false, msg: '连接失败：地址或模型不存在（404），请检查接口地址与模型 ID' + detail }
      }
      return { pass: false, msg: '连接失败：服务返回 ' + res.status + detail }
    },
    // 保存（新建或更新；先校验必填，再测试连接）
    async saveProvider() {
      const fields = ['name', 'apiFormat', 'baseUrl', 'model', 'apiKey']
      for (const f of fields) {
        if (!this.validateField(f)) return
      }
      if (this.testing) return

      const name = this.form.name.trim()
      const apiFormat = this.form.apiFormat
      const baseUrl = this.form.baseUrl.trim()
      const model = this.form.model.trim()
      const displayName = this.form.displayName.trim()
      const apiKey = this.form.apiKey.trim()

      // 保存前测试连接（真实请求验证模型可用性）
      this.testing = true
      const test = await this.testConnection()
      this.testing = false
      if (!test.pass) {
        this.$message.error(test.msg)
        return
      }

      if (this.editingId) {
        const item = this.list.find(x => x.id === this.editingId)
        if (item) {
          item.name = name
          item.apiFormat = apiFormat
          item.baseUrl = baseUrl
          item.model = model
          item.displayName = displayName
          item.apiKey = apiKey
        }
      } else {
        const isFirst = this.list.length === 0
        this.list.push({
          id: 'p' + (uid++),
          type: this.form.type,
          name,
          apiFormat,
          baseUrl,
          model,
          displayName,
          apiKey,
          isDefault: isFirst
        })
      }
      this.persist()
      this.closeDialog()
      this.$message.success(this.editingId ? '已更新' : '模型已添加')
    },
    // 设为默认供应商
    setDefault(id) {
      this.list.forEach(p => {
        p.isDefault = p.id === id
      })
      this.persist()
    },
    // 删除（带确认；删除默认项后自动指定新的默认）
    removeProvider(p) {
      this.$confirm('确定删除供应商「' + p.name + '」吗？', '删除供应商', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.list = this.list.filter(x => x.id !== p.id)
        if (p.isDefault && this.list.length) {
          this.list[0].isDefault = true
        }
        this.persist()
        this.$message.success('已删除')
      }).catch(() => {})
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';
</style>
