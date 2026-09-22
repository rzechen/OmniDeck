<template>
  <!-- 技能凭据弹窗：为单个 Skill 绑定凭据（env 以环境变量方式注入，加密存储） -->
  <el-dialog
    :title="isEdit ? '编辑技能凭据' : '配置技能凭据'"
    :visible.sync="dialogVisible"
    width="560px"
    append-to-body
    custom-class="ob-el-dialog"
    :close-on-click-modal="false"
  >
    <div class="ob-dialog-form">
      <p class="ob-field-tip">
        凭据自动绑定到技能「{{ skill ? skill.name : '' }}」，技能启用时以环境变量方式提供（加密存储，仅本机可解密）
      </p>
      <div class="ob-field">
        <label class="ob-field-label">凭据名称 <span class="ob-field-required">*</span></label>
        <el-input
          v-model="credForm.name"
          size="small"
          clearable
          placeholder="如 pdf-report-creds"
          maxlength="40"
        />
      </div>
      <div class="ob-field">
        <div class="ob-cred-toolbar">
          <label class="ob-field-label">环境变量</label>
          <el-button size="mini" round @click="formatEnv">格式化</el-button>
        </div>
        <el-input
          v-model="credForm.envStr"
          type="textarea"
          :rows="7"
          class="ob-textarea-mono"
          :placeholder="isEdit ? '已加密保存，不回显；留空保存 = 保持现有值' : '{&quot;API_KEY&quot;: &quot;xxx&quot;}'"
          @blur="formatEnv"
        />
      </div>
    </div>
    <template slot="footer">
      <div class="ob-cred-footer">
        <el-button
          v-if="isEdit"
          size="small"
          round
          type="danger"
          plain
          @click="removeCred"
        >删除凭据</el-button>
        <span v-else></span>
        <div class="ob-cred-footer-btns">
          <el-button size="small" round @click="dialogVisible = false">取消</el-button>
          <el-button size="small" round type="primary" @click="saveCred">保存</el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<script>
// 技能凭据弹窗：已有凭据 → update（env 留空传 null 保持原值）；首次 → create（type 固定 'skill'）
// 明文 env 不回显，删除带二次确认
import { parseJsonField } from '@/utils/json-field'
import { buddyApi } from '@/utils/buddy-api'

export default {
  name: 'SkillCredDialog',
  props: {
    // 弹窗显隐（父级 .sync 控制）
    visible: {
      type: Boolean,
      default: false
    },
    // 弹窗对应的目标技能
    skill: {
      type: Object,
      default: null
    },
    // 该技能已有凭据（null 表示首次配置）
    existing: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      credForm: { name: '', envStr: '' }
    }
  },
  computed: {
    isEdit() {
      return !!this.existing
    },
    // 弹窗显隐代理（el-dialog 的 .sync 透传给父级）
    dialogVisible: {
      get() {
        return this.visible
      },
      set(v) {
        this.$emit('update:visible', v)
      }
    }
  },
  watch: {
    // 打开时初始化：已有凭据回填名称（明文 env 不回显），否则预置默认名
    visible(val) {
      if (val) this.initForm()
    }
  },
  methods: {
    initForm() {
      const e = this.existing
      const s = this.skill
      this.credForm = {
        name: e ? e.name : (s ? s.name + '-creds' : ''),
        envStr: ''
      }
    },
    // 格式化环境变量 JSON（非法 JSON 提示）
    formatEnv() {
      const text = this.credForm.envStr.trim()
      if (!text) return
      let obj = null
      try {
        obj = JSON.parse(text)
      } catch (e) {
        obj = null
      }
      if (obj === null) {
        this.$message.error('环境变量不是合法 JSON')
        return
      }
      this.credForm.envStr = JSON.stringify(obj, null, 2)
    },
    // 保存：已有 → update（env 留空传 null 保持原值）；首次 → create（type 固定 'skill'，绑定该技能名）
    async saveCred() {
      const name = this.credForm.name.trim()
      if (!name) {
        this.$message.error('请输入凭据名称')
        return
      }
      // 环境变量：非空时必须为合法 JSON 对象；留空表示保持现有值
      let env = null
      if (this.credForm.envStr.trim()) {
        env = parseJsonField(this, this.credForm.envStr, '环境变量', 'object')
        if (env === false) return
      }
      const api = buddyApi()
      const cred = api && api.credentials
      if (!cred) {
        this.$message.error('技能凭据仅桌面端可用')
        return
      }
      const skill = this.skill
      if (!skill) return
      const isEdit = this.isEdit
      const res = isEdit
        ? await cred.update({
          id: this.existing.id,
          name,
          type: 'skill',
          skillNames: [skill.name],
          env,
          headers: null
        })
        : await cred.create({
          name,
          type: 'skill',
          description: '技能「' + skill.name + '」凭据',
          skillNames: [skill.name],
          env: env || {}
        })
      if (res && res.ok) {
        this.dialogVisible = false
        this.$message.success(isEdit ? '技能凭据已更新' : '技能凭据已配置')
        this.$emit('saved')
      } else {
        this.$message.error((res && res.error) || (isEdit ? '更新失败' : '保存失败'))
      }
    },
    // 删除该技能绑定的凭据（带确认）
    removeCred() {
      const existing = this.existing
      if (!existing) return
      this.$confirm('确定删除凭据「' + existing.name + '」吗？删除后技能将失去对应环境变量。', '删除凭据', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const api = buddyApi()
        const cred = api && api.credentials
        if (!cred) {
          this.$message.error('技能凭据仅桌面端可用')
          return
        }
        const res = await cred.remove(existing.id)
        if (res && res.ok) {
          this.$message.success('已删除')
          this.dialogVisible = false
          this.$emit('saved')
        } else {
          this.$message.error((res && res.error) || '删除失败')
        }
      }).catch(() => {})
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';
</style>
