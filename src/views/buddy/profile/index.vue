<template>
  <div class="ob-manage-page">
    <!-- 顶部 Hero（与其他管理页同款：标题 + 徽标 + 描述；保存/刷新在右侧，工作空间页口径） -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">我的资料</h2>
          <span v-if="filledCount" class="ob-hero-badge">已录 {{ filledCount }} 项</span>
        </div>
        <p class="ob-section-desc">
          提前录入个人信息与工作背景，AI 对话时自动携带、无需重复自我介绍——填工时、写周报一句话搞定
        </p>
      </div>
      <div class="pf-hero-actions">
        <el-button size="mini" round @click="refresh"><svg-icon icon-class="refresh-left" /> 刷新</el-button>
        <el-button size="mini" round type="primary" :loading="saving" @click="save">
          <svg-icon icon-class="check" /> {{ activeTab === 'rule' ? '保存规则' : '保存资料' }}
        </el-button>
      </div>
    </header>

    <!-- 内容区 -->
    <div class="ob-page-body">
      <div v-if="loading" class="pf-sk-wrap"><buddy-skeleton type="rows" :count="5" /></div>

      <template v-else>
        <!-- 两个页签：基本信息 / 全局规则 -->
        <div class="pf-tabs">
          <button
            v-for="t in tabs"
            :key="t.key"
            class="pf-tab"
            :class="{ active: activeTab === t.key }"
            @click="activeTab = t.key"
          >
            <svg-icon :icon-class="t.icon" />
            <span>{{ t.label }}</span>
            <span v-if="t.key === 'rule' && globalRule.hasRule" class="pf-tab-dot ok" title="已配置"></span>
            <span v-else-if="t.key === 'cred' && creds.length" class="pf-tab-dot ok" title="已录入"></span>
          </button>
        </div>

        <!-- Tab：基本信息（分组：基础资料 + 自定义条目；居中单列，一行一个字段，两侧留白） -->
        <section v-show="activeTab === 'basic'" class="pf-form">
          <div class="pf-group">
            <div class="pf-group-head">
              <span class="pf-group-title">基础资料</span>
              <span class="pf-group-hint">姓名、公司、部门等，AI 每次对话自动知晓</span>
            </div>
            <div v-for="f in presets" :key="f.key" class="pf-field">
              <label class="pf-label">{{ f.label }}</label>
              <el-input
                v-if="f.type === 'textarea'"
                v-model="fields[f.key]"
                type="textarea"
                :rows="2"
                :placeholder="f.placeholder"
                maxlength="500"
              />
              <el-input v-else v-model="fields[f.key]" :placeholder="f.placeholder" maxlength="100" />
            </div>
          </div>

          <div class="pf-group">
            <div class="pf-group-head">
              <span class="pf-group-title">自定义条目</span>
              <span class="pf-group-hint">任意补充：邮箱、座机、报销习惯、常用收件地址等</span>
              <el-button size="mini" round type="primary" class="pf-group-add" @click="addCustom"><svg-icon icon-class="plus" /> 添加</el-button>
            </div>
            <div v-if="customs.length" class="pf-customs">
              <div v-for="(c, i) in customs" :key="c.id" class="pf-custom">
                <el-input v-model="c.key" size="small" class="pf-custom-key" placeholder="名称（如：邮箱）" maxlength="30" />
                <el-input v-model="c.value" size="small" class="pf-custom-val" placeholder="内容" maxlength="500" />
                <el-button size="mini" round icon="el-icon-delete" class="pf-custom-del" @click="customs.splice(i, 1)" />
              </div>
            </div>
            <div v-else class="pf-empty">暂无自定义条目，点上方「添加」补充</div>
          </div>
        </section>

        <!-- Tab：全局规则（编辑/预览各占一半，高度撑满剩余空间） -->
        <section v-show="activeTab === 'rule'" class="pf-rule-wrap">
          <div class="pf-toolbar">
            <span class="pf-hint">对 AI 行为的全局指令，所有对话生效；如固定回复风格、输出约定</span>
            <div class="pf-toolbar-ops">
              <el-button v-if="globalRule.hasRule" size="mini" round @click="exportGlobalRule">导出</el-button>
              <el-button v-if="globalRule.hasRule && !ruleOpen" size="mini" round @click="openRule">编辑规则</el-button>
            </div>
          </div>
          <div v-if="ruleOpen" class="pf-rule">
            <rule-editor
              ref="ruleEditor"
              target-key="global"
              :initial-content="globalRuleContent"
              :placeholder="rulePlaceholder"
              :show-foot="false"
              @saved="onRuleSaved"
            />
          </div>
          <div v-else class="pf-rule-empty">
            <span v-if="globalRule.hasRule" class="pf-rule-state ok">已配置，点击「编辑规则」修改</span>
            <span v-else class="pf-rule-state">
              还没有配置规则，
              <el-button type="text" size="mini" @click="openRule">立即新建</el-button>
            </span>
          </div>
        </section>
        <!-- Tab：我的凭据（技能卡片同款视觉的长卡片，满宽排布两侧无留白） -->
        <section v-show="activeTab === 'cred'">
          <div class="pf-group-head">
            <span class="pf-group-title">凭据列表</span>
            <span class="pf-group-hint">API Key、账号等鉴权信息，加密存储于本机</span>
            <el-button size="mini" round type="primary" class="pf-group-add" @click="openCred(null)"><svg-icon icon-class="plus" /> 添加</el-button>
          </div>
          <div v-if="creds.length" class="pf-creds">
            <div v-for="c in creds" :key="c.id" class="pf-cred" @click="openCred(c)">
              <!-- 卡片头：Logo + 名称 + 说明（技能卡 ob-card-head 同款） -->
              <div class="ob-card-head">
                <div class="ob-card-logo pf-cred-logo">
                  <svg-icon icon-class="key" />
                </div>
                <div class="ob-card-title">
                  <div class="ob-card-name" :title="c.name">
                    <span class="ob-name-text">{{ c.name }}</span>
                  </div>
                  <div class="ob-card-meta">{{ c.description || '（无说明）' }}</div>
                </div>
              </div>

              <!-- 变量键名标签（技能卡 ob-card-tag 同款等宽小标签） -->
              <div v-if="c.envKeys && c.envKeys.length" class="pf-cred-keys">
                <span v-for="k in c.envKeys" :key="k" class="pf-cred-key">{{ k }}</span>
              </div>

              <!-- 卡片底部：用途徽标 + 编辑动作（技能卡 ob-card-foot 同款）；
                   AI 取用不做开关（配置即生效，权限策略管控），故只展示技能绑定数 -->
              <div class="pf-cred-foot">
                <div class="pf-cred-uses">
                  <span v-if="c.skillNames && c.skillNames.length" class="pf-cred-use" :title="'已绑定技能：' + c.skillNames.join('、')">技能 × {{ c.skillNames.length }}</span>
                </div>
                <svg-icon icon-class="edit" class="pf-cred-edit" />
              </div>
            </div>
          </div>
          <div v-else class="pf-empty">暂无凭据，点上方「添加」录入</div>
        </section>
      </template>
    </div>

    <!-- 凭据编辑弹窗（AI 取用类） -->
    <ai-credential-dialog
      :visible="credDialog.visible"
      :item="credDialog.item"
      @close="credDialog.visible = false"
      @saved="loadCreds"
    />
  </div>
</template>

<script>
// 我的资料（B 方案）：tabs（基本信息 / 我的凭据 / 全局规则）
// - 基本信息与自定义条目 → profile.json，systemPrompt 确定性注入
// - 我的凭据 → safeStorage 加密存储，对话中 credential_get 按名取用（默认 ask）
// - 全局规则 → AGENTS.md（pi 原生装载），保存即销毁 pi 会话（主进程内置）
// - 工作空间规则入口在工作空间页工具栏（SpaceToolbar「空间规则」按钮）
import { downloadText } from '@/utils/download'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'
import RuleEditor from '@/components/buddy/RuleEditor.vue'
import AiCredentialDialog from '@/components/buddy/AiCredentialDialog.vue'

export default {
  name: 'OmniBuddyProfile',
  components: { BuddySkeleton, RuleEditor, AiCredentialDialog },
  data() {
    return {
      loading: false,
      saving: false,
      activeTab: 'basic',
      presets: [],
      fields: {},
      customs: [],
      // 全局规则折叠区
      ruleOpen: false,
      globalRuleContent: '',
      globalRule: { hasRule: false },
      // 我的凭据（统一管理：技能绑定 + AI 取用）
      creds: [],
      credDialog: { visible: false, item: null }
    }
  },
  computed: {
    tabs() {
      return [
        { key: 'basic', label: '基本信息', icon: 'user' },
        { key: 'cred', label: '我的凭据', icon: 'key' },
        { key: 'rule', label: '全局规则', icon: 'rules' }
      ]
    },
    filledCount() {
      const n = Object.keys(this.fields).filter(k => (this.fields[k] || '').trim()).length
      return n + this.customs.filter(c => (c.value || '').trim()).length
    },
    rulePlaceholder() {
      return [
        '# 输出风格',
        '回答使用中文，先给结论再给解释',
        '',
        '# 输出约定',
        '- 表格一律用 Markdown 输出',
        '- 交付文档前先列出大纲供确认'
      ].join('\n')
    }
  },
  created() {
    this.load()
  },
  methods: {
    api() {
      return (window.electronAPI && window.electronAPI.omnibuddy) || null
    },
    async load() {
      const api = this.api()
      if (!api || !api.profileGet) return
      this.loading = true
      try {
        const res = await api.profileGet()
        this.presets = (res && res.presets) || []
        this.fields = Object.assign({}, (res && res.fields) || {})
        this.customs = ((res && res.customs) || []).map(c => Object.assign({}, c))
        // 全局规则状态（与资料同页展示）
        const targets = await api.rulesTargets()
        const g = (targets || []).find(t => t.kind === 'global')
        this.globalRule = g || { hasRule: false }
        // 凭据（统一管理：技能绑定 + AI 取用）
        await this.loadCreds()
      } catch (e) {
        /* 静默：保持空表单 */
      }
      this.loading = false
    },
    // 凭据列表（全量，含连接器类以外的所有条目；用途徽标由字段区分）
    async loadCreds() {
      const api = this.api()
      if (!api || !api.credentials) return
      try {
        const list = await api.credentials.list()
        // 连接器凭据（baseUrl/command 绑定 MCP）仍归连接器页管理，此处不重复展示
        this.creds = (list || []).filter(c => c.type !== 'connector')
      } catch (e) {
        /* 静默 */
      }
    },
    openCred(item) {
      this.credDialog.item = item
      this.credDialog.visible = true
    },
    refresh() {
      this.load()
    },
    addCustom() {
      this.customs.push({ id: 'c' + Date.now(), key: '', value: '' })
    },
    async save() {
      // hero 统一保存入口：规则 tab 转发给 RuleEditor，其余 tab 保存 profile
      if (this.activeTab === 'rule') {
        if (this.ruleOpen && this.$refs.ruleEditor) {
          await this.$refs.ruleEditor.save()
        }
        return
      }
      const api = this.api()
      if (!api || !api.profileSave) return
      this.saving = true
      try {
        const res = await api.profileSave({ fields: this.fields, customs: this.customs })
        if (res && res.ok) {
          this.customs = (res.data.customs || []).map(c => Object.assign({}, c))
          this.$message.success('已保存，新对话生效')
        } else {
          this.$message.error((res && res.error) || '保存失败')
        }
      } finally {
        this.saving = false
      }
    },
    async openRule() {
      // 打开编辑器前先读取已存内容（否则空内容打开、误存即删）
      const api = this.api()
      if (!api || !api.getRule) return
      const res = await api.getRule('global')
      this.globalRuleContent = (res && res.ok && res.content) || ''
      this.ruleOpen = true
    },
    async onRuleSaved() {
      // 规则保存成功：刷新全局规则徽标（保存动作由 RuleEditor 自主完成）
      const api = this.api()
      if (!api || !api.rulesTargets) return
      const targets = await api.rulesTargets()
      this.globalRule = (targets || []).find(t => t.kind === 'global') || { hasRule: false }
    },
    async exportGlobalRule() {
      const api = this.api()
      if (!api || !api.getRule) return
      const res = await api.getRule('global')
      if (!res || !res.ok) {
        this.$message.error((res && res.error) || '读取规则失败')
        return
      }
      if (!res.exists || !(res.content || '').trim()) {
        this.$message.warning('该规则暂无内容可导出')
        return
      }
      downloadText('全局规则.md', res.content, 'text/markdown;charset=utf-8')
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

.pf-sk-wrap {
  padding: 20px 4px;
}

/* Hero 右侧操作（工作空间页口径：保存/刷新并排） */
.pf-hero-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ============ 页签条（ob-seg 同款胶囊分段风格） ============ */
.pf-tabs {
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 18px;
  background: $search-bg;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  width: fit-content;
}

.pf-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 18px;
  font-size: 12.5px;
  border-radius: 9px;
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  background: transparent;

  .svg-icon {
    font-size: 14px;
  }

  &:hover {
    color: var(--primary-color);
  }

  &.active {
    background: var(--card-bg);
    color: var(--primary-color);
    font-weight: 600;
    box-shadow: $shadow-sm;
  }
}

/* 规则 tab 绿点（已配置标识） */
.pf-tab-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;

  &.ok {
    background: #52C41A;
  }
}

/* ============ 居中表单（基本信息 tab）：窄列居中、两侧留白 ============ */
.pf-form {
  width: min(560px, 100%);
  margin: 0 auto;
}

/* 分组：标题行 + 内容（基础资料 / 自定义条目） */
.pf-group {
  &:not(:first-child) {
    margin-top: 34px;
  }
}

.pf-group-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 16px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-color);
}

.pf-group-title {
  font-size: 13px;
  font-weight: 700;
  color: $text-primary;
  flex-shrink: 0;
}

.pf-group-hint {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.pf-group-add {
  flex-shrink: 0;
}

/* 一行一个字段：标签独占一行，输入控件满宽 */
.pf-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 16px;
}

.pf-label {
  font-size: 12px;
  font-weight: 600;
  color: $text-primary;
}

/* ============ 工具行（自定义 / 规则 tab 顶部：提示 + 操作） ============ */
.pf-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.pf-hint {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: $text-secondary;
}

.pf-toolbar-ops {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* ============ 自定义条目 ============ */
.pf-customs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.pf-custom {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  transition: border-color 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);
  }

  &:focus-within {
    border-color: rgba(var(--primary-color-rgb), 0.55);
  }
}

.pf-custom-key {
  width: 160px;
  flex-shrink: 0;
}

.pf-custom-val {
  flex: 1;
}

.pf-custom-del {
  flex-shrink: 0;
}

.pf-empty {
  font-size: 12px;
  color: $text-secondary;
  opacity: 0.75;
  padding: 8px 0 4px;
}

/* ============ 我的凭据（技能卡同款视觉：三列网格） ============ */
.pf-creds {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}

/* 卡片：复用技能卡 ob-grid-card 的视觉基因（边框/hover/圆角），网格单元排布 */
.pf-cred {
  display: flex;
  flex-direction: column;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);

  &:hover {
    border-color: rgba(var(--primary-color-rgb, 91, 124, 240), 0.35);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
    transform: translateY(-2px);

    .pf-cred-edit {
      opacity: 1;
    }
  }
}

/* 凭据 Logo：key 图标 + 主色渐变底（技能卡 logo-skill 同款风格） */
.pf-cred-logo {
  background: linear-gradient(135deg, rgba(124, 156, 255, 0.15), rgba(91, 124, 240, 0.25));
  color: #4365DF;
}

/* 变量键名标签：等宽字体小标签（技能卡 ob-card-tag 同款） */
.pf-cred-keys {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 12px;
}

.pf-cred-key {
  font-size: 11px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  padding: 2px 8px;
  border-radius: 4px;
  color: $text-secondary;
  background: $search-bg;
  border: 1px solid var(--border-color);
}

/* 卡片底部：用途徽标居左 + 编辑动作居右（技能卡 ob-card-foot 同款，带上分隔线） */
.pf-cred-foot {
  margin-top: auto;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 用途徽标：技能绑定 */
.pf-cred-uses {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.pf-cred-use {
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 5px;
  line-height: 1.6;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  border: 1px solid rgba(var(--primary-color-rgb), 0.25);
}

.pf-cred-edit {
  font-size: 13px;
  color: $text-secondary;
  opacity: 0;
  transition: opacity 0.15s ease;
}

/* ============ 全局规则：编辑/预览各占 50%，高度撑满剩余空间 ============ */
.pf-rule-wrap {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.pf-rule {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

/* 未展开时的占位提示 */
.pf-rule-empty {
  flex: 1;
  min-height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pf-rule-state {
  font-size: 12.5px;
  color: $text-secondary;

  &.ok {
    color: #52C41A;
  }
}
</style>
