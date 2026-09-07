<template>
  <div class="ob-settings-page">
    <div class="ob-settings-layout">
      <!-- 左侧：设置分类导航 -->
      <aside class="ob-settings-nav">
        <div
          class="ob-nav-item"
          :class="{ active: true }"
        >
          <i class="el-icon-cpu"></i>
          <span>模型供应商</span>
        </div>
      </aside>

      <!-- 右侧：供应商列表 -->
      <section class="ob-settings-body">
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
              icon="el-icon-plus"
              @click="openCreate"
            >新建供应商</el-button>
          </div>
        </header>

        <!-- 空状态 -->
        <div v-if="!list.length" class="ob-empty">
          <div class="ob-empty-icon">
            <i class="el-icon-cpu"></i>
          </div>
          <div class="ob-empty-title">暂无模型供应商</div>
          <div class="ob-empty-desc">新建一个供应商后，即可在对话中选择对应模型</div>
          <el-button
            size="small"
            round
            type="primary"
            icon="el-icon-plus"
            @click="openCreate"
          >新建供应商</el-button>
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
                {{ p.name }}
                <span v-if="p.isDefault" class="ob-item-default-badge">默认</span>
              </div>
              <div class="ob-item-meta">{{ p.model }} · {{ p.baseUrl }}</div>
            </div>
            <div class="ob-item-actions" @click.stop>
              <span v-if="!p.isDefault" class="ob-item-action" title="设为默认" @click="setDefault(p.id)">
                <i class="el-icon-check"></i>
              </span>
              <span class="ob-item-action" title="编辑" @click="openEdit(p)">
                <i class="el-icon-edit"></i>
              </span>
              <span class="ob-item-action danger" title="删除" @click="removeProvider(p)">
                <i class="el-icon-delete"></i>
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 新建/编辑供应商弹窗 -->
    <transition name="ob-modal">
      <div v-if="dialogVisible" class="ob-overlay" @click.self="closeDialog">
        <div class="ob-dialog">
          <header class="ob-dialog-header">
            <h3 class="ob-dialog-title">{{ editingId ? '编辑供应商' : '新建供应商' }}</h3>
            <i class="el-icon-close ob-dialog-close" @click="closeDialog"></i>
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

            <!-- 接口地址 -->
            <div class="ob-field" :class="{ error: !!errors.baseUrl }">
              <label class="ob-field-label">接口地址 <span class="ob-field-required">*</span></label>
              <el-input
                v-model="form.baseUrl"
                size="small"
                clearable
                placeholder="输入接口地址，如 https://api.openai.com/v1"
                @blur="validateField('baseUrl')"
                @input="clearFieldError('baseUrl')"
              />
              <p class="ob-field-error" :class="{ visible: !!errors.baseUrl }">{{ errors.baseUrl }}</p>
            </div>

            <!-- 模型 -->
            <div class="ob-field" :class="{ error: !!errors.model }">
              <label class="ob-field-label">模型 <span class="ob-field-required">*</span></label>
              <el-input
                v-model="form.model"
                size="small"
                clearable
                placeholder="输入模型名称，如 gpt-4o-mini"
                @blur="validateField('model')"
                @input="clearFieldError('model')"
              />
              <p class="ob-field-error" :class="{ visible: !!errors.model }">{{ errors.model }}</p>
            </div>

            <!-- API Key（非必填） -->
            <div class="ob-field">
              <label class="ob-field-label">API Key</label>
              <el-input
                v-model="form.apiKey"
                size="small"
                :show-password="!!form.apiKey"
                clearable
                placeholder="非必填，如 sk-…"
              />
            </div>
          </div>

          <footer class="ob-dialog-footer">
            <el-button size="small" round :disabled="testing" @click="closeDialog">取消</el-button>
            <el-button
              size="small"
              round
              type="primary"
              :loading="testing"
              @click="saveProvider"
            >{{ testing ? '测试连接中…' : '保存' }}</el-button>
          </footer>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
import { getItem, setItem } from '@/utils/db'

let uid = Date.now()

// OmniBuddy 专属设置页：模型供应商列表管理（新建/编辑/删除/设默认）
// 所有供应商统一走 OpenAI 兼容接口规范，保存前经主进程代理测试连接
export default {
  name: 'OmniBuddySettings',
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
        apiKey: '',
        baseUrl: '',
        model: ''
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
        apiKey: p.apiKey || '',
        baseUrl: p.baseUrl,
        model: p.model
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
    // 测试连接：请求 OpenAI 兼容的 /models 端点验证地址可达与密钥有效
    async testConnection(baseUrl, apiKey) {
      const url = baseUrl.replace(/\/+$/, '') + '/models'
      const headers = {}
      if (apiKey) headers.Authorization = 'Bearer ' + apiKey
      let res = null
      if (window.electronAPI && window.electronAPI.httpRequest) {
        // 经主进程 net 代理，无 CORS 限制
        res = await window.electronAPI.httpRequest({ method: 'GET', url, headers, timeout: 10000 })
      } else {
        // 浏览器兜底（受 CORS 限制）
        try {
          const r = await fetch(url, { headers })
          res = { ok: true, status: r.status }
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
      if (res.status === 401 || res.status === 403) {
        return { pass: false, msg: '连接失败：认证被拒绝（' + res.status + '），请检查 API Key' }
      }
      if (res.status === 404) {
        return { pass: false, msg: '连接失败：地址不存在（404），请检查接口地址' }
      }
      return { pass: false, msg: '连接失败：服务返回 ' + res.status }
    },
    // 保存（新建或更新；先校验必填，再测试连接）
    async saveProvider() {
      const validName = this.validateField('name')
      const validBaseUrl = this.validateField('baseUrl')
      const validModel = this.validateField('model')
      if (!validName || !validBaseUrl || !validModel) return
      if (this.testing) return

      const name = this.form.name.trim()
      const baseUrl = this.form.baseUrl.trim()
      const model = this.form.model.trim()
      const apiKey = (this.form.apiKey || '').trim()

      // 保存前测试连接
      this.testing = true
      const test = await this.testConnection(baseUrl, apiKey)
      this.testing = false
      if (!test.pass) {
        this.$message.error(test.msg)
        return
      }

      if (this.editingId) {
        const item = this.list.find(x => x.id === this.editingId)
        if (item) {
          item.name = name
          item.baseUrl = baseUrl
          item.model = model
          item.apiKey = apiKey
        }
      } else {
        const isFirst = this.list.length === 0
        this.list.push({
          id: 'p' + (uid++),
          type: this.form.type,
          name,
          baseUrl,
          model,
          apiKey,
          isDefault: isFirst
        })
      }
      this.persist()
      this.closeDialog()
      this.$message.success(this.editingId ? '已更新' : '已创建')
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
$ob-accent: #722ED1;

.ob-settings-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  -webkit-app-region: no-drag;
  overflow: hidden;
  position: relative;
}

.ob-settings-layout {
  display: flex;
  gap: 18px;
  padding: 20px 24px;
  overflow-y: auto;
  height: 100%;
}

// 左侧分类导航
.ob-settings-nav {
  width: 136px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ob-nav-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border-radius: $radius-base;
  font-size: 13px;
  font-weight: 500;
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.15s ease;

  i {
    font-size: 15px;
  }

  &.active {
    background: rgba(114, 46, 209, 0.09);
    color: $ob-accent;
    font-weight: 600;
  }
}

// 右侧内容
.ob-settings-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.ob-section-header {
  margin-bottom: 14px;
}

.ob-header-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;

  .ob-section-title {
    font-size: 18px;
    font-weight: 700;
    color: $text-primary;
  }

  .ob-section-desc {
    margin-top: 3px;
    font-size: 12px;
    color: $text-secondary;
  }
}

/* 空状态（占满剩余区域垂直居中） */
.ob-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.ob-empty-icon {
  width: 56px;
  height: 56px;
  border-radius: 18px;
  background: rgba(114, 46, 209, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;

  i {
    font-size: 26px;
    color: $ob-accent;
  }
}

.ob-empty-title {
  font-size: 14.5px;
  font-weight: 700;
  color: $text-primary;
}

.ob-empty-desc {
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 8px;
}

/* 供应商列表 */
.ob-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ob-list-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(114, 46, 209, 0.4);
    box-shadow: $shadow-sm;

    .ob-item-actions {
      opacity: 1;
    }
  }

  &.default {
    border-color: rgba(114, 46, 209, 0.45);
    background: linear-gradient(135deg, rgba(114, 46, 209, 0.04), transparent 60%);
  }
}

/* 供应商 logo 首字母 */
.ob-item-logo {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;

  &.logo-openai {
    background: linear-gradient(135deg, #10A37F, #0B7A61);
  }

  &.logo-deepseek {
    background: linear-gradient(135deg, #4D6BFE, #2A4BD7);
  }

  &.logo-qwen {
    background: linear-gradient(135deg, #615CED, #722ED1);
  }

  &.logo-claude {
    background: linear-gradient(135deg, #D97757, #B85C3E);
  }

  &.logo-custom {
    background: linear-gradient(135deg, #686A6F, #3E4045);
  }
}

.ob-item-info {
  flex: 1;
  min-width: 0;
}

.ob-item-name {
  font-size: 13.5px;
  font-weight: 600;
  color: $text-primary;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ob-item-default-badge {
  font-size: 10px;
  font-weight: 700;
  color: $ob-accent;
  background: rgba(114, 46, 209, 0.1);
  border: 1px solid rgba(114, 46, 209, 0.25);
  padding: 0 7px;
  border-radius: 999px;
  line-height: 1.6;
}

.ob-item-meta {
  margin-top: 3px;
  font-size: 11.5px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 行操作（hover 浮现） */
.ob-item-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.ob-item-action {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.15s ease;

  i {
    font-size: 13px;
  }

  &:hover {
    background: rgba(114, 46, 209, 0.1);
    color: $ob-accent;
  }

  &.danger:hover {
    background: rgba(245, 34, 45, 0.1);
    color: #F5222D;
  }
}

/* ===== 新建/编辑弹窗（应用级遮罩：覆盖整个窗口含侧边栏） ===== */
.ob-overlay {
  position: fixed;
  inset: 0;
  z-index: 3100;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
}

.ob-dialog {
  width: 420px;
  max-width: calc(100% - 48px);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.ob-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 0;

  .ob-dialog-title {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  .ob-dialog-close {
    font-size: 15px;
    color: $text-secondary;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    transition: all 0.15s ease;

    &:hover {
      background: $search-bg;
      color: $text-primary;
    }
  }
}

.ob-dialog-body {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.ob-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .ob-field-label {
    font-size: 12px;
    font-weight: 600;
    color: $text-primary;
  }

  .ob-field-required {
    color: #F5222D;
  }

  // 校验失败：输入框红框
  &.error ::v-deep .el-input__inner {
    border-color: #F5222D;

    &:focus {
      border-color: #F5222D;
    }
  }

  // 错误提示固定占位，避免出现/消失时挤压布局导致抖动
  .ob-field-error {
    height: 15px;
    font-size: 11px;
    line-height: 15px;
    color: #F5222D;
    visibility: hidden;

    &.visible {
      visibility: visible;
    }
  }
}

.ob-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 18px 16px;
}

/* 弹窗过渡 */
.ob-modal-enter-active {
  transition: opacity 0.18s ease;
  .ob-dialog {
    transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.ob-modal-leave-active {
  transition: opacity 0.14s ease;
  .ob-dialog {
    transition: transform 0.14s ease;
  }
}

.ob-modal-enter,
.ob-modal-leave-to {
  opacity: 0;
  .ob-dialog {
    transform: scale(0.95) translateY(8px);
  }
}
</style>
