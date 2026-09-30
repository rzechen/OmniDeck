<template>
  <!-- 凭据编辑抽屉（统一凭据管理）：一条凭据两种用途——
       ① 绑定技能：注入对应技能执行环境（环境变量）
       ② 允许 AI 取用：对话中经 credential_get 按名取用（权限策略默认允许，条目级开关放行）
       键值动态行 + 技能多选绑定，条目多时滚动 → 右侧全高抽屉 -->
  <transition name="ob-drawer">
    <!-- 点击遮罩不关闭（避免误触丢失正在编辑的内容），仅右上角/取消按钮关闭 -->
    <div v-if="visible" class="ob-drawer">
      <div class="ob-drawer-panel ac-panel">
        <header class="ob-drawer-header">
          <div class="ac-head-left">
            <h3 class="ob-dialog-title">{{ isEdit ? '编辑凭据' : '新增凭据' }}</h3>
            <span v-if="isEdit && item" class="ac-badge ok">已加密存储</span>
          </div>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="$emit('close')" />
        </header>

        <div class="ob-drawer-body ac-body">
          <div class="ac-field">
            <label class="ac-label">名称 <span class="ac-req">*</span></label>
            <el-input v-model="form.name" placeholder="如：飞书机器人 / 公司邮箱" maxlength="30" />
          </div>
          <div class="ac-field">
            <label class="ac-label">说明</label>
            <el-input v-model="form.description" placeholder="这条凭据是干什么的（可选）" maxlength="100" />
          </div>
          <div class="ac-field">
            <label class="ac-label">内容（键值对）</label>
            <div class="ac-rows">
              <div v-for="(row, i) in rows" :key="row.id" class="ac-row">
                <el-input v-model="row.key" size="small" class="ac-row-key" placeholder="键（如 API_TOKEN）" maxlength="50" />
                <!-- 密码框呈现，点眼睛查看明文；编辑态回显已存值，改动后覆盖 -->
                <el-input v-model="row.value" size="small" class="ac-row-val" show-password :placeholder="isEdit ? '留空保持原值' : '值'" maxlength="500" />
                <el-button size="small" round class="ac-row-del" @click="rows.splice(i, 1)"><svg-icon icon-class="delete" /></el-button>
              </div>
            </div>
            <!-- addRow() 显式无参调用：原生 @click="addRow" 会把 PointerEvent 当作 presetKey 传入 -->
            <el-button size="small" round plain class="ac-add" @click="addRow()"><svg-icon icon-class="plus" /> 添加字段</el-button>
            <p v-if="suggestedKeys.length" class="ac-tip">
              技能声明需要：{{ suggestedKeys.join('、') }}（点击可快速补齐）
              <el-button v-for="k in suggestedKeys" :key="k" link size="small" class="ac-suggest" @click="addRow(k)">{{ k }}</el-button>
            </p>
          </div>

          <div class="ac-field">
            <label class="ac-label">用途</label>
            <div class="ac-uses">
              <div class="ac-use">
                <el-checkbox v-model="form.bindSkill">绑定技能</el-checkbox>
                <p class="ac-use-desc">勾选后注入所选技能的执行环境（环境变量方式提供）</p>
                <el-select
                  v-if="form.bindSkill"
                  v-model="form.skillNames"
                  multiple
                  size="small"
                  class="ac-skills"
                  placeholder="选择要注入的技能（可多选）"
                >
                  <el-option v-for="s in skills" :key="s.name" :label="s.name" :value="s.name" />
                </el-select>
              </div>
            </div>
          </div>

          <div class="ac-secure">
            <svg-icon icon-class="lock" />
            <span>加密存储于本机钥匙串（safeStorage）；对话中可按名取用，受权限策略管控</span>
          </div>
        </div>

        <footer class="ob-drawer-footer ac-foot">
          <div class="ac-foot-left">
            <el-button v-if="isEdit" size="small" round type="danger" plain @click="removeItem">删除</el-button>
          </div>
          <div class="ac-foot-right">
            <el-button size="small" round @click="$emit('close')">取消</el-button>
            <el-button size="small" round type="primary" :loading="saving" @click="save">保存</el-button>
          </div>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script>
// 凭据弹窗（统一凭据管理）：技能绑定（skillNames）注入执行环境；
// AI 取用不做开关——配置即生效，统一由权限策略（credential_get）管控。
// 编辑态明文回显（resolve 按需单条拉取），值留空 = 保持原值（credentials.update 语义）
export default {
  name: 'AiCredentialDialog',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    // 编辑目标（null = 新增）：脱敏视图 { id, name, description, envKeys, skillNames, ... }
    item: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      form: { name: '', description: '', bindSkill: false, skillNames: [] },
      rows: [],
      skills: [],
      saving: false
    }
  },
  computed: {
    isEdit() {
      return !!(this.item && this.item.id)
    },
    // 所选技能声明的变量名（env-keys + 正文扫描）中尚未录入的：提示补齐
    // 行数据键做字符串容错（el-input 中文输入法组合期间可能触发非字符串中间态）
    suggestedKeys() {
      const have = new Set(this.rows.map(r => String((r && r.key) || '').trim()).filter(Boolean))
      const keys = []
      ;(this.form.skillNames || []).forEach(n => {
        const s = this.skills.find(x => x.name === n)
        ;((s && s.envKeys) || []).forEach(k => {
          if (!have.has(k) && !keys.includes(k)) keys.push(k)
        })
      })
      return keys
    }
  },
  watch: {
    visible(v) {
      if (!v) return
      this.form = {
        name: (this.item && this.item.name) || '',
        description: (this.item && this.item.description) || '',
        bindSkill: !!((this.item && this.item.skillNames) || []).length,
        skillNames: (((this.item && this.item.skillNames) || []).slice())
      }
      // 行骨架先按脱敏视图键名搭好，值等明文拉回后填充（resolve 明文仅弹窗内使用）
      const keys = (this.item && this.item.envKeys) || []
      this.rows = keys.map((k, i) => ({ id: 'r' + i, key: k, value: '' }))
      this.loadSkills()
      if (this.isEdit) this.loadValues()
    }
  },
  methods: {
    api() {
      return (window.electronAPI && window.electronAPI.omnibuddy && window.electronAPI.omnibuddy.credentials) || null
    },
    buddyApi() {
      return window.electronAPI && window.electronAPI.omnibuddy
    },
    // 编辑回显：单条拉取明文 env，按行填充（键在两边的以回显为准）
    async loadValues() {
      const api = this.api() // credentials 命名空间（resolve 挂在这里）
      if (!api || !api.resolve) return
      try {
        const res = await api.resolve(this.item.id)
        const env = (res && res.secret && res.secret.env) || {}
        // 后到的明文只填充值，不覆盖用户已开始输入的内容
        this.rows.forEach(r => {
          if (!r.value && env[r.key] !== undefined) r.value = env[r.key]
        })
      } catch (e) { /* 拉取失败保持空值：留空仍为「保持原值」语义 */ }
    },
    // 技能清单（供绑定多选）：主进程 skills:list 直接返回数组
    async loadSkills() {
      const api = this.buddyApi()
      if (!api || !api.listSkills) return
      try {
        const res = await api.listSkills()
        this.skills = Array.isArray(res) ? res : []
      } catch (e) {
        this.skills = []
      }
    },
    addRow(presetKey) {
      // 仅接受字符串预置键（事件对象等一律视为空）
      const key = typeof presetKey === 'string' ? presetKey : ''
      this.rows.push({ id: 'r' + Date.now(), key, value: '' })
    },
    envOf() {
      // 组装 env：有值的行才参与（编辑时空值 = 保持原值，交由 update 语义处理）
      const env = {}
      this.rows.forEach(r => {
        const k = String((r && r.key) || '').trim()
        if (k && String((r && r.value) || '').trim()) env[k] = String(r.value).trim()
      })
      return env
    },
    async save() {
      if (!(this.form.name || '').trim()) {
        this.$message.error('请输入凭据名称')
        return
      }
      const api = this.api()
      if (!api) {
        this.$message.error('凭据管理仅桌面端可用')
        return
      }
      const payload = {
        name: this.form.name.trim(),
        description: (this.form.description || '').trim(),
        skillNames: this.form.bindSkill ? this.form.skillNames.slice() : []
      }
      const env = this.envOf()
      if (!this.isEdit) {
        if (!Object.keys(env).length) {
          this.$message.error('请至少填写一个字段（键与值都不能为空）')
          return
        }
        payload.type = 'credential'
        payload.env = env
      } else if (Object.keys(env).length) {
        payload.env = env
      }
      this.saving = true
      try {
        const cred = this.api()
        const res = this.isEdit ? await cred.update(Object.assign({ id: this.item.id }, payload)) : await cred.create(payload)
        if (res && res.ok) {
          // 清单注入发生在会话创建时：保存后销毁 pi 会话，新对话生效
          if (cred.disposeSessions) {
            try { await cred.disposeSessions() } catch (e) { /* 忽略 */ }
          }
          this.$message.success(this.isEdit ? '凭据已更新，新对话生效' : '凭据已保存，新对话生效')
          this.$emit('saved')
          this.$emit('close')
        } else {
          this.$message.error((res && res.error) || '保存失败')
        }
      } catch (e) {
        this.$message.error('保存异常')
      }
      this.saving = false
    },
    // 删除（带确认）
    async removeItem() {
      const api = this.api()
      if (!api) return
      try {
        await this.$confirm('确定删除凭据「' + this.form.name + '」吗？绑定的技能与 AI 取用将同时失效。', '删除凭据', {
          type: 'warning',
          confirmButtonText: '删除',
          cancelButtonText: '取消'
        })
      } catch (e) {
        return
      }
      const res = await api.remove(this.item.id)
      if (res && res.ok) {
        // 同 save：销毁 pi 会话，让删除立即在新对话生效
        if (api.disposeSessions) {
          try { await api.disposeSessions() } catch (e) { /* 忽略 */ }
        }
        this.$message.success('凭据已删除')
        this.$emit('saved')
        this.$emit('close')
      } else {
        this.$message.error((res && res.error) || '删除失败')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 抽屉面板宽度（键值行需容纳 键180px + 值 + 删钮） */
.ac-panel {
  --ob-drawer-w: 620px;
}

.ac-head-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
  flex: 1;
}

.ac-badge {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 5px;
  line-height: 1.6;
  color: var(--success-color);
  background: rgba(var(--success-color-rgb),  0.1);
  border: 1px solid rgba(var(--success-color-rgb),  0.3);
}

/* 抽屉 body：滚动与内边距已由 ob-drawer-body 承载，此处仅保留列间距 */
.ac-body {
  gap: 16px;
}

.ac-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.ac-label {
  font-size: 12px;
  font-weight: 600;
  color: $text-primary;
}

.ac-req {
  color: var(--danger-color);
}

.ac-tip {
  margin: 0;
  font-size: 11px;
  color: $text-secondary;
}

.ac-suggest {
  margin-left: 6px;
  padding: 0;
  font-size: 11px;
  font-weight: 600;
}

.ac-rows {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ac-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 9px;
  background: $search-bg;
  border: 1px solid var(--border-color);
  border-radius: 10px;

  &:focus-within {
    border-color: rgba(var(--primary-color-rgb), 0.55);
  }
}

.ac-row-key {
  width: 180px;
  flex-shrink: 0;
}

.ac-row-val {
  flex: 1;
}

.ac-add {
  align-self: flex-start;
}

/* 用途区：技能绑定 + AI 取用 */
.ac-uses {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ac-use {
  padding: 10px 12px;
  background: $search-bg;
  border: 1px solid var(--border-color);
  border-radius: 10px;
}

.ac-use-desc {
  margin: 2px 0 8px;
  font-size: 11px;
  color: $text-secondary;
  line-height: 1.5;
}

.ac-skills {
  width: 100%;
}

.ac-secure {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-radius: 10px;
  background: rgba(var(--primary-color-rgb), 0.06);
  font-size: 11.5px;
  color: $text-secondary;

  .svg-icon {
    color: var(--primary-color);
    flex-shrink: 0;
  }
}

/* footer 布局：左侧删除（危险操作远离确认组），右侧取消/保存 */
.ac-foot-left {
  display: flex;
  flex: 1;
  min-width: 0;
}

.ac-foot-right {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}
</style>
