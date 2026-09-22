<template>
  <!-- 编辑 / 导入 Skill 弹窗（新建仅 ZIP 导入；编辑为 SKILL.md 表单） -->
  <transition name="ob-modal">
    <div v-if="dialogVisible" class="ob-overlay" @click.self="dialogVisible = false">
      <div class="ob-dialog ob-dialog-skill">
        <header class="ob-dialog-header">
          <h3 class="ob-dialog-title">{{ isEdit ? '编辑 Skill' : '导入 Skill' }}</h3>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="dialogVisible = false" />
        </header>

        <div class="ob-dialog-body">
          <!-- 手动编辑（已有 Skill） -->
          <template v-if="isEdit">
            <div class="ob-field">
              <label class="ob-field-label">名称 <span class="ob-field-required">*</span></label>
              <el-input
                v-model="skillForm.name"
                size="small"
                clearable
                :disabled="isEdit"
                placeholder="字母、数字、连字符，如 pdf-report"
                maxlength="64"
              />
            </div>
            <div class="ob-field">
              <label class="ob-field-label">描述 <span class="ob-field-required">*</span></label>
              <el-input
                v-model="skillForm.description"
                size="small"
                clearable
                placeholder="一句话说明何时使用该技能（Agent 依据它判断是否加载）"
                maxlength="200"
              />
            </div>
            <div class="ob-field">
              <label class="ob-field-label">内容（Markdown 指令手册）</label>
              <el-input
                v-model="skillForm.content"
                type="textarea"
                :rows="8"
                placeholder="# 操作指南&#10;&#10;告诉 Agent 执行该类任务时的步骤、规范与注意事项…"
              />
            </div>
          </template>

          <!-- ZIP 导入 -->
          <template v-else>
            <div class="ob-field">
              <label class="ob-field-label">上传 Skill ZIP 包 <span class="ob-field-required">*</span></label>
              <div
                class="ob-zip-drop"
                :class="{ over: zipDragOver }"
                @click="pickZip"
                @dragover.prevent="zipDragOver = true"
                @dragleave="zipDragOver = false"
                @drop.prevent="onZipDrop"
              >
                <template v-if="!zipFile">
                  <svg-icon icon-class="skill" class="ob-zip-ico" />
                  <div class="ob-zip-title">点击或拖拽 ZIP 文件到此处</div>
                  <div class="ob-zip-hint">仅支持 .zip 格式，大小不超过 10MB（需包含 SKILL.md）</div>
                </template>
                <template v-else>
                  <div class="ob-zip-name">{{ zipFile.name }}</div>
                  <div class="ob-zip-hint">{{ formatSize(zipFile.size) }} · 点击重新选择</div>
                </template>
                <input
                  ref="zipInput"
                  type="file"
                  accept=".zip"
                  style="display: none"
                  @change="onZipPicked"
                />
              </div>
              <!-- 验证结果：选择文件后自动验证（通过显示名称/描述/文件数，失败显示原因） -->
              <div v-if="zipFile" class="ob-zip-validate-row">
                <span v-if="zipValidating" class="ob-zip-msg">
                  <svg-icon icon-class="loading" class="ob-spin" /> 正在验证…
                </span>
                <span
                  v-else-if="zipValidation"
                  class="ob-zip-msg"
                  :class="zipValidation.ok ? 'ok' : 'err'"
                >{{ zipValidationText }}</span>
              </div>
            </div>
            <div class="ob-field">
              <label class="ob-field-label">技能凭据（可选）</label>
              <el-input
                v-model="zipCred"
                type="textarea"
                :rows="10"
                class="ob-code-area"
                placeholder='JSON 格式，如 {"API_KEY": "xxx"}；导入成功后自动绑定到该技能'
                @blur="formatZipCred"
              />
              <div class="ob-field-hint">凭据将加密存储（仅本机可解密），技能启用时以环境变量注入</div>
            </div>
          </template>
        </div>

        <footer class="ob-dialog-footer">
          <el-button size="small" round @click="dialogVisible = false">取消</el-button>
          <!-- 编辑：保存表单；新建（ZIP 导入）：确认导入 -->
          <el-button
            v-if="isEdit"
            size="small"
            round
            type="primary"
            @click="saveSkill"
          >保存修改</el-button>
          <el-button
            v-else
            size="small"
            round
            type="primary"
            :loading="zipImporting"
            :disabled="!zipValidation || !zipValidation.ok"
            @click="importZipFile(false)"
          >确认导入</el-button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script>
// 编辑 / 导入 Skill 弹窗：编辑模式读取 SKILL.md 回填表单；
// 导入模式为 ZIP 上传 → 自动验证 → 导入（同名二次确认覆盖）+ 随包凭据加密绑定
import { buddyApi } from '@/utils/buddy-api'

export default {
  name: 'SkillImportDialog',
  props: {
    // 弹窗显隐（父级 .sync 控制）
    visible: {
      type: Boolean,
      default: false
    },
    // 编辑中的 Skill（null 表示新建 / ZIP 导入）
    editing: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      skillForm: { name: '', description: '', content: '' },
      // ZIP 导入：文件持有 / 拖拽高亮 / 验证状态 / 导入中 / 随包凭据
      zipFile: null,
      zipDragOver: false,
      zipValidating: false,
      zipValidation: null,
      zipImporting: false,
      zipCred: ''
    }
  },
  computed: {
    // 是否编辑模式（编辑时名称不可改，且不展示 ZIP 导入区）
    isEdit() {
      return !!this.editing
    },
    // 弹窗显隐代理（transition 无 .sync，手动透传给父级）
    dialogVisible: {
      get() {
        return this.visible
      },
      set(v) {
        this.$emit('update:visible', v)
      }
    },
    // ZIP 验证结果文案（通过：名称 + 描述 + 文件数 + 覆盖提示；失败：原因）
    zipValidationText() {
      const v = this.zipValidation
      if (!v) return ''
      if (!v.ok) return v.error || '校验失败'
      let text = '通过：' + v.skillName
      if (v.description) text += ' · ' + v.description
      text += ' · ' + (v.fileCount || 0) + ' 个文件'
      if (v.exists) text += '（同名已存在，导入时将询问覆盖）'
      return text
    }
  },
  watch: {
    // 弹窗打开时按 editing 初始化（编辑读取远端内容 / 导入重置 ZIP 状态）
    visible(val) {
      if (val) this.initForm()
    }
  },
  methods: {
    initForm() {
      if (this.editing) {
        this.loadSkill()
      } else {
        this.skillForm = { name: '', description: '', content: '' }
        this.zipFile = null
        this.zipValidation = null
        this.zipCred = ''
        this.zipDragOver = false
      }
    },
    // 编辑 Skill：读取 SKILL.md 内容回填弹窗（名称作为目录标识不可改）
    loadSkill() {
      const api = buddyApi()
      if (!api) {
        this.$message.error('技能管理仅桌面端可用')
        this.dialogVisible = false
        return
      }
      const target = this.editing
      api.getSkill(target.dir).then(res => {
        if (res && res.ok && res.skill) {
          this.skillForm = {
            name: res.skill.name || target.name,
            description: res.skill.description || '',
            content: res.skill.content || ''
          }
        } else {
          this.$message.error((res && res.error) || '读取 Skill 失败')
          this.dialogVisible = false
        }
      })
    },
    // 随包凭据失焦自动格式化 JSON（非法时保持原样，导入时校验兜底）
    formatZipCred() {
      const raw = this.zipCred.trim()
      if (!raw) return
      try {
        const obj = JSON.parse(raw)
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          this.zipCred = JSON.stringify(obj, null, 2)
        }
      } catch (e) { /* 非法 JSON 不动 */ }
    },
    pickZip() {
      if (this.$refs.zipInput) this.$refs.zipInput.click()
    },
    onZipDrop(e) {
      this.zipDragOver = false
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
      if (f) this.holdZip(f)
    },
    onZipPicked(e) {
      const f = e.target && e.target.files && e.target.files[0]
      if (f) this.holdZip(f)
      e.target.value = ''
    },
    // 持有 ZIP 文件：格式与大小校验，选择后立即自动验证
    holdZip(file) {
      if (!/\.zip$/i.test(file.name)) {
        this.$message.error('仅支持 .zip 文件')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        this.$message.error('文件大小不能超过 10MB')
        return
      }
      this.zipFile = file
      this.zipValidation = null
      // 自动验证（上传即校验，无需手动点按钮）
      this.validateZipFile()
    },
    formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    },
    // File → Uint8Array（IPC 结构化克隆传输）
    async zipBytes() {
      return new Uint8Array(await this.zipFile.arrayBuffer())
    },
    async validateZipFile() {
      if (!this.zipFile) return
      const api = buddyApi()
      if (!api || !api.validateSkillZip) {
        this.$message.error('技能管理仅桌面端可用')
        return
      }
      this.zipValidating = true
      try {
        this.zipValidation = await api.validateSkillZip(await this.zipBytes())
      } catch (e) {
        this.zipValidation = { ok: false, error: (e && e.message) || '校验失败' }
      } finally {
        this.zipValidating = false
      }
    },
    // 导入：同名已存在时二次确认覆盖；随包凭据在导入成功后加密绑定到该技能
    async importZipFile(overwrite) {
      const v = this.zipValidation
      if (!v || !v.ok) return
      if (v.exists && !overwrite) {
        this.$confirm('同名 Skill「' + v.skillName + '」已存在，导入将覆盖其内容。继续吗？', '覆盖导入', {
          confirmButtonText: '覆盖导入',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => this.importZipFile(true)).catch(() => {})
        return
      }
      // 凭据（可选）：填写时必须是合法 JSON 对象
      let credEnv = null
      if (this.zipCred.trim()) {
        try {
          credEnv = JSON.parse(this.zipCred)
          if (!credEnv || typeof credEnv !== 'object' || Array.isArray(credEnv)) throw new Error('bad')
        } catch (e) {
          this.$message.error('技能凭据不是合法的 JSON 对象')
          return
        }
      }
      const api = buddyApi()
      this.zipImporting = true
      try {
        const res = await api.importSkillZip({ data: await this.zipBytes(), overwrite: !!overwrite })
        if (!res || !res.ok) {
          this.$message.error((res && res.error) || '导入失败')
          return
        }
        if (credEnv) {
          try {
            await api.credentials.create({
              name: res.skill.name + '-creds',
              type: 'skill',
              description: '技能「' + res.skill.name + '」凭据',
              skillNames: [res.skill.name],
              env: credEnv
            })
          } catch (e) {
            // 凭据绑定失败不阻断导入结果，用户可在卡片上重新配置
            this.$message.warning('Skill 已导入，但凭据绑定失败，请在卡片上重新配置凭据')
          }
        }
        this.$message.success('Skill「' + res.skill.name + '」导入成功（' + res.skill.files + ' 个文件）')
        this.dialogVisible = false
        this.$emit('saved')
      } catch (e) {
        this.$message.error((e && e.message) || '导入失败')
      } finally {
        this.zipImporting = false
      }
    },
    // 保存编辑（新建走 ZIP 导入，表单保存仅用于已有 Skill 的编辑）
    async saveSkill() {
      const name = this.skillForm.name.trim()
      const description = this.skillForm.description.trim()
      if (!name || !description) {
        this.$message.warning('请填写名称与描述')
        return
      }
      const api = buddyApi()
      if (!api) {
        this.$message.error('技能管理仅桌面端可用')
        return
      }
      const res = await api.updateSkill({ name, description, content: this.skillForm.content })
      if (res && res.ok) {
        this.dialogVisible = false
        this.$message.success('Skill 已更新，新会话生效')
        this.$emit('saved')
      } else {
        this.$message.error((res && res.error) || '更新失败')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';
</style>
