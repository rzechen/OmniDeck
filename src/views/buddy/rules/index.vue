<template>
  <div class="ob-manage-page">
    <!-- 顶部 Hero（市场页同款） -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">项目规则</h2>
          <span class="ob-hero-badge" v-if="targetList.length">{{ configuredCount }}/{{ targetList.length }} 已配置</span>
        </div>
        <p class="ob-section-desc">
          编辑 AGENTS.md 规则文件，Agent 对话时自动注入系统提示词（全局规则 + 工作空间规则）
        </p>
      </div>
    </header>

    <!-- 加载中 -->
    <div v-if="loading" class="ob-ext-loading">
      <svg-icon icon-class="loading" class="ob-spin" /> 加载中…
    </div>

    <!-- 规则目标卡片网格：全局 + 各工作空间 -->
    <div v-else class="ob-cards-grid">
      <div
        v-for="t in targetList"
        :key="t.key"
        class="ob-grid-card"
        :class="{ unavailable: t.kind === 'workspace' && !t.available }"
      >
        <div class="ob-card-head">
          <div class="ob-card-logo" :class="t.kind === 'global' ? 'logo-agent' : 'logo-connector'">
            <svg-icon :icon-class="t.kind === 'global' ? 'buddy' : 'folder'" />
          </div>
          <div class="ob-card-title">
            <div class="ob-card-name" :title="t.name">
              <span class="ob-name-text">{{ t.name }}</span>
              <span v-if="t.kind === 'global'" class="ob-rule-scope">全局</span>
              <span v-else class="ob-rule-scope">工作空间</span>
            </div>
            <div class="ob-card-meta" :title="t.file || ''">
              {{ t.kind === 'global' ? 'AGENTS.md' : (t.file || 'AGENTS.md') }}
            </div>
          </div>
          <span v-if="t.hasRule" class="ob-card-badge ok">已配置</span>
          <span v-else-if="t.kind === 'workspace' && !t.available" class="ob-card-badge err">目录失效</span>
          <span v-else class="ob-card-badge none">未配置</span>
        </div>

        <p class="ob-card-desc">
          <template v-if="t.kind === 'workspace' && !t.available">
            <span class="ob-rule-off">目录不存在或已移除</span>
          </template>
          <template v-else-if="t.hasRule">{{ t.summary || '（内容为空）' }}</template>
          <template v-else><span class="ob-rule-none">尚未编写规则内容</span></template>
        </p>

        <div class="ob-card-foot">
          <div class="ob-foot-info"></div>
          <div class="ob-card-actions">
            <el-button
              size="mini"
              round
              :type="t.hasRule ? 'default' : 'primary'"
              :plain="!t.hasRule"
              class="ob-action-btn"
              @click="openEdit(t)"
            >{{ t.hasRule ? '编辑规则' : '新建规则' }}</el-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 编辑弹窗 -->
    <transition name="ob-modal">
      <div v-if="dialogVisible" class="ob-overlay" @click.self="dialogVisible = false">
        <div class="ob-dialog ob-dialog-rule">
          <header class="ob-dialog-header">
            <h3 class="ob-dialog-title">{{ editing && editing.hasRule ? '编辑规则' : '新建规则' }} · {{ editing && editing.name }}</h3>
            <svg-icon icon-class="close" class="ob-dialog-close" @click="dialogVisible = false" />
          </header>

          <div class="ob-dialog-body">
            <div v-if="editing" class="ob-rule-fileline" :title="editing.file">{{ editing.file }}</div>
            <el-input
              v-model="form.content"
              type="textarea"
              :rows="16"
              class="ob-textarea-mono"
              placeholder="# 项目规则&#10;&#10;告诉 Agent 在此范围内的行为规范、技术栈约定、输出格式偏好等…"
            />
            <div class="ob-rule-tip">
              保存后新对话生效；内容清空并保存 = 删除该规则文件
            </div>
          </div>

          <footer class="ob-dialog-footer">
            <div class="ob-dialog-btns">
              <el-button size="small" round @click="dialogVisible = false">取消</el-button>
              <el-button size="small" round type="primary" :loading="saving" @click="save">保存</el-button>
            </div>
          </footer>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
// 项目规则（P1-10）：全局 / 工作空间 AGENTS.md 编辑页
// pi SDK DefaultResourceLoader 自动装载规则注入系统提示词，本页仅做读写
export default {
  name: 'OmniBuddyRules',
  data() {
    return {
      loading: false,
      targetList: [],
      dialogVisible: false,
      editing: null,
      form: { content: '' },
      saving: false
    }
  },
  computed: {
    // 已配置规则的目标数（Hero 徽标展示）
    configuredCount() {
      return this.targetList.filter(t => t.hasRule).length
    }
  },
  created() {
    this.loadTargets()
  },
  methods: {
    api() {
      return (window.electronAPI && window.electronAPI.omnibuddy) || null
    },
    async loadTargets() {
      const api = this.api()
      if (!api || !api.rulesTargets) {
        this.targetList = []
        return
      }
      this.loading = true
      try {
        const res = await api.rulesTargets()
        this.targetList = Array.isArray(res) ? res : []
      } catch (e) {
        this.targetList = []
      }
      this.loading = false
    },
    async openEdit(t) {
      if (t.kind === 'workspace' && !t.available) {
        this.$message.warning('工作空间目录不存在，请先在工作空间页修复')
        return
      }
      const api = this.api()
      if (!api || !api.getRule) return
      const res = await api.getRule(t.key)
      if (!res || !res.ok) {
        this.$message.error((res && res.error) || '读取规则失败')
        return
      }
      this.editing = Object.assign({}, t, { hasRule: res.exists, file: res.file })
      this.form.content = res.content || ''
      this.dialogVisible = true
    },
    async save() {
      if (!this.editing) return
      const api = this.api()
      if (!api || !api.saveRule) return
      this.saving = true
      try {
        const res = await api.saveRule({ key: this.editing.key, content: this.form.content })
        if (res && res.ok) {
          this.dialogVisible = false
          this.$message.success('已保存，新对话生效')
          this.loadTargets()
        } else {
          this.$message.error((res && res.error) || '保存失败')
        }
      } finally {
        this.saving = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 规则范围徽标（全局 / 工作空间） */
.ob-rule-scope {
  flex-shrink: 0;
  padding: 1px 8px;
  border-radius: 99px;
  font-size: 10px;
  font-weight: 500;
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
}

/* 卡片状态徽标（已配置 / 未配置 / 目录失效） */
.ob-card-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 5px;
  line-height: 1.6;

  &.ok {
    color: #52C41A;
    background: rgba(82, 196, 26, 0.1);
    border: 1px solid rgba(82, 196, 26, 0.3);
  }

  &.none {
    color: $text-secondary;
    background: $search-bg;
    border: 1px solid var(--border-color);
  }

  &.err {
    color: #d93025;
    background: rgba(245, 34, 45, 0.08);
    border: 1px solid rgba(245, 34, 45, 0.25);
  }
}

.ob-rule-off {
  color: #d93025;
  font-size: 12px;
}

/* 未配置规则的弱化提示 */
.ob-rule-none {
  color: $text-secondary;
  opacity: 0.75;
}

/* 弹窗内文件路径行 */
.ob-rule-fileline {
  font-family: Menlo, Consolas, monospace;
  font-size: 12px;
  color: $text-secondary;
  margin-bottom: 10px;
  word-break: break-all;
}

.ob-rule-tip {
  margin-top: 10px;
  font-size: 12px;
  color: $text-secondary;
}

.ob-dialog-rule {
  width: 640px;
  max-width: 92vw;
}

/* 工作空间目录失效的卡片置灰 */
.ob-grid-card.unavailable {
  opacity: 0.55;
}
</style>
