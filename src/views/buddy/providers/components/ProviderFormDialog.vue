<template>
  <!-- 新建/编辑模型抽屉（自绘：右侧全高滑入，覆盖整个窗口含侧边栏） -->
  <transition name="ob-drawer">
    <div v-if="dialogVisible" class="ob-drawer" @click.self="closeDialog">
      <div class="ob-drawer-panel pf-panel">
        <header class="ob-drawer-header">
          <h3 class="ob-dialog-title">{{ editingId ? '编辑模型' : '新建模型' }}</h3>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="closeDialog" />
        </header>

        <div class="ob-drawer-body">
          <!-- ===== 基础必填项 ===== -->
          <!-- API 格式 -->
          <div class="ob-field" :class="{ error: !!errors.apiFormat }">
            <label class="ob-field-label">API 格式 <span class="ob-field-required">*</span></label>
            <el-select
              v-model="form.apiFormat"
              size="small"
              class="ob-field-select"
              placeholder="选择接口协议格式"
              @change="onFormatChange"
            >
              <el-option label="OpenAI Chat Completions 格式" value="openai" />
              <el-option label="OpenAI Responses API 格式" value="openai-responses" />
              <el-option label="Anthropic Messages 格式" value="anthropic" />
            </el-select>
            <p class="ob-field-error" :class="{ visible: !!errors.apiFormat }">{{ errors.apiFormat }}</p>
          </div>

          <!-- 自定义请求地址 / 接口地址 -->
          <div class="ob-field" :class="{ error: !!errors.baseUrl }">
            <label class="ob-field-label">{{ form.apiFormat === 'openai' ? '自定义请求地址' : '请求地址' }} <span class="ob-field-required">*</span></label>
            <el-input
              v-model="form.baseUrl"
              size="small"
              clearable
              :placeholder="baseUrlPlaceholder"
              @blur="validateField('baseUrl')"
              @input="clearFieldError('baseUrl')"
            />
            <!-- OpenAI 格式：说明路径自动追加规则 -->
            <p v-if="form.apiFormat === 'openai'" class="ob-field-tip pf-url-tip">
              填写兼容 OpenAI API 的服务端点地址，不要以斜杠结尾，<code>/chat/completions</code> 会自动追加到填写地址末尾；示例：<code>https://api.openai.com/v1</code>
            </p>
            <p class="ob-field-error" :class="{ visible: !!errors.baseUrl }">{{ errors.baseUrl }}</p>
          </div>

          <!-- 模型 ID -->
          <div class="ob-field" :class="{ error: !!errors.model }">
            <label class="ob-field-label">模型 ID <span class="ob-field-required">*</span></label>
            <el-input
              v-model="form.model"
              size="small"
              clearable
              placeholder="填写模型标识 ID，如 gpt-4o-mini"
              @blur="validateField('model')"
              @input="clearFieldError('model')"
            />
            <p class="ob-field-error" :class="{ visible: !!errors.model }">{{ errors.model }}</p>
          </div>

          <!-- 模型展示名称（选填） -->
          <div class="ob-field">
            <label class="ob-field-label">模型展示名称</label>
            <el-input
              v-model="form.displayName"
              size="small"
              clearable
              placeholder="在模型列表展示的名字，不填则默认显示模型 ID"
              maxlength="64"
            />
          </div>

          <!-- API 密钥（必填，带隐藏/显示） -->
          <div class="ob-field" :class="{ error: !!errors.apiKey }">
            <label class="ob-field-label">API 密钥 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="form.apiKey"
              size="small"
              show-password
              clearable
              placeholder="填写 API Key，如 sk-…"
              @blur="validateField('apiKey')"
              @input="clearFieldError('apiKey')"
            />
            <p class="ob-field-error" :class="{ visible: !!errors.apiKey }">{{ errors.apiKey }}</p>
          </div>

          <!-- ===== 高级配置（折叠面板：macOS 设置组风格） ===== -->
          <div class="pf-advanced">
            <!-- 折叠触发器 -->
            <button type="button" class="pf-adv-toggle" @click="advancedOpen = !advancedOpen">
              <svg-icon icon-class="arrow-right" class="pf-adv-arrow" :class="{ open: advancedOpen }" />
              <span class="pf-adv-toggle-title">高级配置</span>
              <span class="pf-adv-toggle-desc">模型系列 · 上下文 · 工具调用 · 图片与思考</span>
            </button>

            <!-- 设置组卡片：左标签右控件，行间细分隔 -->
            <transition name="pf-adv">
              <div v-show="advancedOpen" class="pf-adv-body">
                <!-- 模型系列 -->
                <div class="pf-adv-row">
                  <div class="pf-adv-info">
                    <span class="pf-adv-name">
                      模型系列
                      <el-tooltip placement="top" :open-delay="200">
                        <div slot="content">针对特定模型系列优化 Prompt 和超参，<br />未选择时使用默认配置</div>
                        <svg-icon icon-class="warning-outline" class="ob-tier-help" />
                      </el-tooltip>
                    </span>
                    <span class="pf-adv-desc">针对特定系列优化 Prompt 与超参</span>
                  </div>
                  <div class="pf-adv-ctrl">
                    <el-select v-model="form.modelSeries" size="small" class="pf-adv-select">
                      <el-option label="默认" value="default" />
                      <el-option label="OpenAI · GPT" value="gpt" />
                      <el-option label="Anthropic · Claude" value="claude" />
                      <el-option label="Google · Gemini" value="gemini" />
                      <el-option label="DeepSeek" value="deepseek" />
                      <el-option label="Qwen · 通义千问" value="qwen" />
                      <el-option label="GLM · 智谱" value="glm" />
                    </el-select>
                  </div>
                </div>

                <!-- 上下文窗口（Token）：标签行 + 输入/输出双列 -->
                <div class="pf-adv-row pf-adv-row-block">
                  <div class="pf-adv-info">
                    <span class="pf-adv-name">上下文窗口（Token）</span>
                    <span class="pf-adv-desc">可手动填写上限，留空自动使用推荐值</span>
                  </div>
                  <div class="pf-window-grid">
                    <div class="pf-win-col">
                      <div class="pf-win-field">
                        <span class="pf-win-tag">输入</span>
                        <el-input
                          v-model="form.contextWindowInput"
                          size="small"
                          placeholder="推荐值"
                          class="pf-win-input"
                        />
                      </div>
                      <div class="pf-chips">
                        <span
                          v-for="c in inputChips"
                          :key="'in-' + c.label"
                          class="pf-chip"
                          :class="{ active: Number(form.contextWindowInput) === c.value }"
                          @click="form.contextWindowInput = c.value"
                        >{{ c.label }}</span>
                      </div>
                    </div>
                    <div class="pf-win-col">
                      <div class="pf-win-field">
                        <span class="pf-win-tag">输出</span>
                        <el-input
                          v-model="form.contextWindowOutput"
                          size="small"
                          placeholder="推荐值"
                          class="pf-win-input"
                        />
                      </div>
                      <div class="pf-chips">
                        <span
                          v-for="c in outputChips"
                          :key="'out-' + c.label"
                          class="pf-chip"
                          :class="{ active: Number(form.contextWindowOutput) === c.value }"
                          @click="form.contextWindowOutput = c.value"
                        >{{ c.label }}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <!-- 工具调用轮数 -->
                <div class="pf-adv-row">
                  <div class="pf-adv-info">
                    <span class="pf-adv-name">
                      工具调用轮数
                      <el-tooltip placement="top" :open-delay="200">
                        <div slot="content">限制模型连续调用工具的最大轮次，<br />超出后模型须给出最终答复</div>
                        <svg-icon icon-class="warning-outline" class="ob-tier-help" />
                      </el-tooltip>
                    </span>
                    <span class="pf-adv-desc">连续调用工具的最大轮次</span>
                  </div>
                  <div class="pf-adv-ctrl">
                    <el-input
                      v-model="form.toolTurns"
                      size="small"
                      placeholder="默认 500"
                      class="pf-turns-input"
                    >
                      <template slot="append">轮</template>
                    </el-input>
                  </div>
                </div>

                <!-- 支持图片输入 -->
                <div class="pf-adv-row">
                  <div class="pf-adv-info">
                    <span class="pf-adv-name">图片输入</span>
                    <span class="pf-adv-desc">是否支持在对话中发送图片</span>
                  </div>
                  <div class="pf-adv-ctrl">
                    <el-radio-group v-model="form.imageInput" size="small">
                      <el-radio-button :label="true">支持</el-radio-button>
                      <el-radio-button :label="false">不支持</el-radio-button>
                    </el-radio-group>
                  </div>
                </div>

                <!-- 思考模式 -->
                <div class="pf-adv-row">
                  <div class="pf-adv-info">
                    <span class="pf-adv-name">思考模式</span>
                    <span class="pf-adv-desc">推理链的使用策略</span>
                  </div>
                  <div class="pf-adv-ctrl">
                    <el-radio-group v-model="form.thinkingMode" size="small">
                      <el-radio-button label="follow">跟随默认</el-radio-button>
                      <el-radio-button label="on">开启</el-radio-button>
                      <el-radio-button label="off">关闭</el-radio-button>
                    </el-radio-group>
                  </div>
                </div>

                <!-- 深度研究档位（P3）：将该模型映射为深度研究子代理的轻量/标准/强力档；同档位全局唯一 -->
                <div class="pf-adv-row">
                  <div class="pf-adv-info">
                    <span class="pf-adv-name">
                      深度研究档位
                      <el-tooltip placement="top" :open-delay="200">
                        <div slot="content">
                          深度研究是多代理并行编排（资料搜集、交叉验证、报告撰写）。<br />
                          在此为子代理的三个档位指派模型：轻量跑检索摘要、标准做日常分析、强力做复杂推理。<br />
                          同一档位全局仅一个模型（选新顶旧）；不指定则该档回落主对话模型。
                        </div>
                        <svg-icon icon-class="warning-outline" class="ob-tier-help" />
                      </el-tooltip>
                    </span>
                    <span class="pf-adv-desc">为深度研究子代理指派档位</span>
                    <!-- 同档位已被其它模型占用时提示（保存时自动顶替旧配置） -->
                    <span v-if="tierOccupiedBy" class="pf-adv-desc pf-tier-warn">
                      「{{ tierOccupiedBy.name }}」当前占用该档位，保存后自动替换
                    </span>
                  </div>
                  <div class="pf-adv-ctrl">
                    <el-select
                      v-model="form.tier"
                      size="small"
                      class="pf-adv-select"
                      placeholder="不指定"
                      clearable
                    >
                      <el-option label="轻量档 · 简单检索与摘要" value="small" />
                      <el-option label="标准档 · 日常分析与写作" value="medium" />
                      <el-option label="强力档 · 复杂推理与长文撰写" value="big" />
                    </el-select>
                  </div>
                </div>
              </div>
            </transition>
          </div>
        </div>

        <footer class="ob-drawer-footer pf-foot">
          <p class="ob-dialog-tip">
            <svg-icon icon-class="warning-outline" class="ob-tip-svg" />连通性测试会发起一次真实请求，会消耗少量模型 Token
          </p>
          <div class="ob-dialog-btns">
            <el-button size="small" round :disabled="testing" @click="resetForm">重置</el-button>
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
// 新建/编辑模型抽屉：基础必填项 + 高级配置折叠面板，
// 失焦校验、保存前真实请求测试连接、组装数据交父级持久化
let uid = Date.now()

// 上下文窗口快捷选项（输入 / 输出各档）
const INPUT_CHIPS = [
  { label: '128k', value: 128000 },
  { label: '256k', value: 256000 },
  { label: '512k', value: 512000 },
  { label: '1M', value: 1000000 }
]
const OUTPUT_CHIPS = [
  { label: '4k', value: 4096 },
  { label: '16k', value: 16384 },
  { label: '32k', value: 32768 },
  { label: '128k', value: 131072 }
]

export default {
  name: 'ProviderFormDialog',
  props: {
    // 弹窗显隐（父级 .sync 控制）
    visible: {
      type: Boolean,
      default: false
    },
    // 编辑中的模型 id（null 表示新建）
    editingId: {
      type: [String, Number],
      default: null
    },
    // 编辑回填的模型对象（null 表示新建）
    editingProvider: {
      type: Object,
      default: null
    },
    // 当前模型列表（判断"首个自动设默认"用，只读不改）
    list: {
      type: Array,
      default: () => []
    }
  },
  data() {
    return {
      form: this.emptyForm(),
      // 高级配置折叠展开状态（默认收起）
      advancedOpen: false,
      inputChips: INPUT_CHIPS,
      outputChips: OUTPUT_CHIPS,
      // 必填字段失焦校验的错误提示
      errors: {
        baseUrl: '',
        model: '',
        apiKey: ''
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
    // 请求地址占位文案（按 API 格式）
    baseUrlPlaceholder() {
      if (this.form.apiFormat === 'anthropic') return '输入接口地址，如 https://api.anthropic.com'
      return '输入接口地址，如 https://api.openai.com/v1'
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
    // 新建空白表单（含各字段默认值）
    emptyForm() {
      return {
        type: 'custom',
        apiFormat: 'openai',
        baseUrl: '',
        model: '',
        displayName: '',
        apiKey: '',
        tier: '',
        modelSeries: 'default',
        contextWindowInput: '',
        contextWindowOutput: '',
        toolTurns: 500,
        imageInput: true,
        thinkingMode: 'follow'
      }
    },
    // 表单初始化：新建全部为空（失焦校验）；编辑回填
    initForm() {
      const p = this.editingProvider
      this.form = p
        ? {
          type: p.type || 'custom',
          apiFormat: p.apiFormat || 'openai',
          apiKey: p.apiKey || '',
          baseUrl: p.baseUrl || '',
          model: p.model || '',
          displayName: p.displayName || '',
          tier: p.tier || '',
          modelSeries: p.modelSeries || 'default',
          contextWindowInput: p.contextWindowInput != null ? String(p.contextWindowInput) : '',
          contextWindowOutput: p.contextWindowOutput != null ? String(p.contextWindowOutput) : '',
          toolTurns: p.toolTurns != null ? p.toolTurns : 500,
          imageInput: p.imageInput !== false,
          thinkingMode: p.thinkingMode || 'follow'
        }
        : this.emptyForm()
      this.advancedOpen = false
      this.resetErrors()
    },
    // 重置：恢复打开时的初始值（新建→空白默认；编辑→回填数据）
    resetForm() {
      this.initForm()
      this.$message.info('已重置')
    },
    // 切换 API 格式：清掉地址错误提示（校验文案按格式变化）
    onFormatChange() {
      this.clearFieldError('baseUrl')
    },
    closeDialog() {
      // 连接测试进行中不允许关闭，避免测试结果落空
      if (this.testing) return
      this.dialogVisible = false
    },
    // ===== 必填字段失焦校验 =====
    resetErrors() {
      this.errors.baseUrl = ''
      this.errors.model = ''
      this.errors.apiKey = ''
    },
    validateField(field) {
      const val = (this.form[field] || '').trim()
      if (!val) {
        const msgs = {
          apiFormat: '请选择 API 格式',
          baseUrl: '请输入接口地址',
          model: '请输入模型 ID',
          apiKey: '请输入 API 密钥'
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
    // 测试连接：按 API 格式发起一次最小请求，验证地址可达、密钥有效、模型可用
    // 会消耗少量 Token（max_tokens=1 + 单条 ping 消息）
    async testConnection() {
      const baseUrl = this.form.baseUrl.trim().replace(/\/+$/, '')
      const apiKey = (this.form.apiKey || '').trim()
      const model = this.form.model.trim()
      const format = this.form.apiFormat

      // 三种格式的端点路径 / 请求头 / 请求体
      let url, headers, body
      if (format === 'anthropic') {
        // Anthropic：base 含 /v1 则直接拼 /messages，否则补 /v1/messages
        url = baseUrl + (baseUrl.endsWith('/v1') ? '/messages' : '/v1/messages')
        headers = {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        }
        body = JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false
        })
      } else if (format === 'openai-responses') {
        // OpenAI Responses API：/responses 自动追加，max_output_tokens 最小 16
        url = baseUrl + '/responses'
        headers = {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey
        }
        body = JSON.stringify({
          model,
          input: 'ping',
          max_output_tokens: 16,
          stream: false
        })
      } else {
        // OpenAI Chat Completions：/chat/completions 自动追加
        url = baseUrl + '/chat/completions'
        headers = {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey
        }
        body = JSON.stringify({
          model,
          messages: [{ role: 'user', content: 'ping' }],
          max_tokens: 1,
          stream: false
        })
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
        return { pass: false, msg: '连接失败：认证被拒绝（' + res.status + '），请检查 API 密钥' + detail }
      }
      if (res.status === 404) {
        return { pass: false, msg: '连接失败：地址或模型不存在（404），请检查接口地址与模型 ID' + detail }
      }
      return { pass: false, msg: '连接失败：服务返回 ' + res.status + detail }
    },
    // 数字字段规整：空串→null（留空使用推荐值），非法→null，其余取整
    toNumOrNull(v) {
      if (v === '' || v == null) return null
      const n = parseInt(v, 10)
      return Number.isFinite(n) && n > 0 ? n : null
    },
    // 保存（新建或更新；先校验必填，再测试连接，组装数据交父级持久化）
    async saveProvider() {
      const fields = ['apiFormat', 'baseUrl', 'model', 'apiKey']
      for (const f of fields) {
        if (!this.validateField(f)) return
      }
      if (this.testing) return

      const apiFormat = this.form.apiFormat
      const baseUrl = this.form.baseUrl.trim().replace(/\/+$/, '')
      const model = this.form.model.trim()
      const displayName = this.form.displayName.trim()
      const apiKey = this.form.apiKey.trim()
      const tier = this.form.tier || ''
      const modelSeries = this.form.modelSeries || 'default'
      const contextWindowInput = this.toNumOrNull(this.form.contextWindowInput)
      const contextWindowOutput = this.toNumOrNull(this.form.contextWindowOutput)
      const toolTurns = this.toNumOrNull(this.form.toolTurns) || 500
      const imageInput = !!this.form.imageInput
      const thinkingMode = this.form.thinkingMode || 'follow'
      // 列表名：展示名优先，未填默认显示模型 ID
      const name = displayName || model

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
          values: {
            name, apiFormat, baseUrl, model, displayName, apiKey, tier,
            modelSeries, contextWindowInput, contextWindowOutput, toolTurns, imageInput, thinkingMode
          }
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
            modelSeries,
            contextWindowInput,
            contextWindowOutput,
            toolTurns,
            imageInput,
            thinkingMode,
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

/* 模型表单抽屉：字段较多，取编辑型宽度 */
.pf-panel {
  --ob-drawer-w: 620px;
}

/* footer：左提示 + 右按钮（覆盖全局右对齐，保留信息提示位） */
.pf-foot {
  justify-content: space-between;
}

/* OpenAI 格式的地址追加规则说明 */
.pf-url-tip {
  margin-top: 4px;

  code {
    padding: 0 4px;
    border-radius: 4px;
    background: $search-bg;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 11px;
    color: $text-secondary;
  }
}

/* ===== 高级配置：macOS 设置组 ===== */
.pf-advanced {
  margin-top: 4px;
}

/* 折叠触发器：整行按钮（图标旋转 + 标题 + 弱化说明） */
.pf-adv-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 10px 12px;
  background: $search-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-base;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;

  &:hover {
    background: $search-bg-hover;
  }

  .pf-adv-arrow {
    font-size: 12px;
    color: $text-secondary;
    transition: transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);

    &.open {
      transform: rotate(90deg);
    }
  }
}

.pf-adv-toggle-title {
  font-size: 12.5px;
  font-weight: 600;
  color: $text-primary;
}

.pf-adv-toggle-desc {
  margin-left: auto;
  font-size: 11px;
  color: $text-secondary;
}

/* 设置组卡片：行式布局（左信息右控件），行间细分隔 */
.pf-adv-body {
  margin-top: 8px;
  background: $search-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-base;
  overflow: hidden;
}

.pf-adv-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;

  & + .pf-adv-row {
    border-top: 1px solid var(--border-color);
  }

  /* 整块布局行（上下文窗口）：标签在上、控件区通栏 */
  &.pf-adv-row-block {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
}

.pf-adv-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
  flex-shrink: 0;
}

.pf-adv-name {
  display: inline-flex;
  align-items: center;
  font-size: 12.5px;
  font-weight: 600;
  color: $text-primary;
}

.pf-adv-desc {
  font-size: 11px;
  line-height: 1.4;
  color: $text-secondary;
}

/* 档位占用提示：琥珀色弱提示 */
.pf-tier-warn {
  color: #d97706;
}

.pf-adv-ctrl {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  min-width: 0;
}

.pf-adv-select {
  width: 220px;
}

/* ===== 上下文窗口：输入 / 输出双列 ===== */
.pf-window-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
  width: 100%;
}

.pf-win-col {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.pf-win-field {
  display: flex;
  align-items: center;
  gap: 8px;
}

.pf-win-tag {
  flex-shrink: 0;
  font-size: 11px;
  color: $text-secondary;
}

.pf-win-input {
  flex: 1;
  min-width: 0;
}

/* 快捷选项 chips（128k / 256k …）：右对齐贴住输入框宽度 */
.pf-chips {
  display: flex;
  justify-content: flex-end;
  gap: 5px;
}

.pf-chip {
  padding: 2px 9px;
  border-radius: 999px;
  border: 1px solid var(--border-color);
  background: var(--card-bg, #fff);
  font-size: 11px;
  color: $text-secondary;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s;

  &:hover {
    color: var(--primary-color);
    border-color: var(--primary-color);
  }

  &.active {
    color: var(--primary-color);
    border-color: var(--primary-color);
    background: rgba(var(--primary-color-rgb, 64, 128, 255), 0.08);
  }
}

/* 工具调用轮数：窄输入 */
.pf-turns-input {
  width: 200px;
}

/* 展开过渡：高度收放 + 淡入 */
.pf-adv-enter-active,
.pf-adv-leave-active {
  transition: opacity 0.18s ease, transform 0.22s cubic-bezier(0.22, 1, 0.36, 1);
}

.pf-adv-enter,
.pf-adv-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* 帮助图标：随标签行内展示 */
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
</style>
