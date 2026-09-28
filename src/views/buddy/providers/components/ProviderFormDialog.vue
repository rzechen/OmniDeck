<template>
  <!-- 新建/编辑供应商弹窗（自绘 overlay：覆盖整个窗口含侧边栏） -->
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

          <!-- 深度研究档位（P3）：将该模型映射为深度研究子代理的轻量/标准/强力档；同档位全局唯一 -->
          <div class="ob-field">
            <label class="ob-field-label">
              深度研究档位
              <el-tooltip placement="top" :open-delay="200">
                <div slot="content">
                  深度研究是多代理并行编排（资料搜集、交叉验证、报告撰写）。<br />
                  在此为子代理的三个档位指派模型：轻量跑检索摘要、标准做日常分析、强力做复杂推理。<br />
                  同一档位全局仅一个模型（选新顶旧）；不指定则该档回落主对话模型。
                </div>
                <svg-icon icon-class="warning-outline" class="ob-tier-help" />
              </el-tooltip>
            </label>
            <el-select
              v-model="form.tier"
              size="small"
              class="ob-field-select"
              placeholder="不指定（该档回落主对话模型）"
              clearable
            >
              <el-option label="轻量档 · 简单检索与摘要" value="small" />
              <el-option label="标准档 · 日常分析与写作" value="medium" />
              <el-option label="强力档 · 复杂推理与长文撰写" value="big" />
            </el-select>
            <!-- 同档位已被其它模型占用时提示（保存时自动顶替旧配置） -->
            <p v-if="tierOccupiedBy" class="ob-field-tip ob-tier-conflict">
              该档位当前为「{{ tierOccupiedBy.name }}」，保存后将自动替换
            </p>
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
</template>

<script>
// 新建/编辑供应商弹窗：失焦校验、保存前真实请求测试连接、组装数据交父级持久化
let uid = Date.now()

export default {
  name: 'ProviderFormDialog',
  props: {
    // 弹窗显隐（父级 .sync 控制）
    visible: {
      type: Boolean,
      default: false
    },
    // 编辑中的供应商 id（null 表示新建）
    editingId: {
      type: [String, Number],
      default: null
    },
    // 编辑回填的供应商对象（null 表示新建）
    editingProvider: {
      type: Object,
      default: null
    },
    // 当前供应商列表（判断"首个自动设默认"用，只读不改）
    list: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      form: {
        type: 'custom',
        name: '',
        apiKey: '',
        baseUrl: '',
        model: '',
        tier: ''
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
  computed: {
    // 弹窗显隐代理（.sync 透传给父级）
    dialogVisible: {
      get() {
        return this.visible
      },
      set(v) {
        this.$emit('update:visible', v)
      }
    },
    // 同档位占用者（编辑自己时排除自身；用于档位冲突提示）
    tierOccupiedBy() {
      const tier = this.form.tier
      if (!tier) return null
      const owner = this.list.find(p => p.tier === tier && p.id !== this.editingId)
      return owner || null
    }
  },
  watch: {
    // 弹窗打开时按 editingProvider 初始化表单（新建重置 / 编辑回填）
    visible(val) {
      if (val) this.initForm()
    }
  },
  methods: {
    // 表单初始化：新建全部为空（失焦校验）；编辑回填
    initForm() {
      const p = this.editingProvider
      this.form = p
        ? {
          type: p.type || 'custom',
          name: p.name,
          apiFormat: p.apiFormat || 'openai',
          apiKey: p.apiKey || '',
          baseUrl: p.baseUrl,
          model: p.model,
          displayName: p.displayName || '',
          tier: p.tier || ''
        }
        : {
          type: 'custom',
          name: '',
          apiFormat: 'openai',
          apiKey: '',
          baseUrl: '',
          model: '',
          displayName: '',
          tier: ''
        }
      this.resetErrors()
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
    // 保存（新建或更新；先校验必填，再测试连接，组装数据交父级持久化）
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
      const tier = this.form.tier || ''

      // 保存前测试连接（真实请求验证模型可用性）
      this.testing = true
      const test = await this.testConnection()
      this.testing = false
      if (!test.pass) {
        this.$message.error(test.msg)
        return
      }

      if (this.editingId) {
        // 编辑：组装更新数据交父级写入
        this.$emit('saved', {
          editingId: this.editingId,
          values: { name, apiFormat, baseUrl, model, displayName, apiKey, tier }
        })
      } else {
        // 新建：组装完整记录（首个自动设默认）交父级写入
        const isFirst = this.list.length === 0
        this.$emit('saved', {
          editingId: null,
          item: {
            id: 'p' + (uid++),
            type: this.form.type,
            name,
            apiFormat,
            baseUrl,
            model,
            displayName,
            apiKey,
            tier,
            isDefault: isFirst
          }
        })
      }
      this.closeDialog()
      this.$message.success(this.editingId ? '已更新' : '模型已添加')
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 档位帮助图标：随标签行内展示 */
.ob-tier-help {
  margin-left: 4px;
  font-size: 12px;
  color: $text-secondary;
  cursor: help;
  vertical-align: -1px;

  &:hover {
    color: var(--primary-color);
  }
}

/* 同档位冲突提示 */
.ob-tier-conflict {
  margin-top: 4px;
  color: #d97706;
}
</style>
