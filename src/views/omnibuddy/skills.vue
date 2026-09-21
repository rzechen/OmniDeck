<template>
  <div class="ob-manage-page">
    <header class="ob-section-header">
      <div class="ob-header-row">
        <div>
          <h2 class="ob-section-title">Skill 管理</h2>
          <p class="ob-section-desc">
            为 Agent 定义可复用的技能手册（SKILL.md），Agent 按需渐进加载
          </p>
        </div>
        <el-button
          size="small"
          round
          type="primary"
          @click="openSkillCreate"
        ><svg-icon icon-class="plus" class="ob-btn-svg" />导入 Skill</el-button>
      </div>
    </header>

    <!-- 空状态 -->
    <div v-if="!skillList.length && !skillLoading" class="ob-empty">
      <div class="ob-empty-icon">
        <svg-icon icon-class="skill" />
      </div>
      <div class="ob-empty-title">暂无 Skill</div>
      <div class="ob-empty-desc">导入一个 Skill（ZIP），让 Agent 掌握特定任务的操作手册</div>
      <el-button
        size="small"
        round
        type="primary"
        @click="openSkillCreate"
      ><svg-icon icon-class="plus" class="ob-btn-svg" />导入 Skill</el-button>
    </div>

    <!-- Skill 列表 -->
    <div v-else class="ob-list">
      <div v-if="skillLoading" class="ob-ext-loading">
        <svg-icon icon-class="loading" class="ob-spin" /> 加载中…
      </div>
      <div
        v-for="s in skillList"
        v-else
        :key="s.dir"
        class="ob-list-item ob-ext-item"
      >
        <span class="ob-item-logo logo-custom">
          <svg-icon icon-class="document" />
        </span>
        <div class="ob-item-info">
          <div class="ob-item-name">{{ s.name }}</div>
          <div class="ob-item-meta">{{ s.description || '（无描述）' }}</div>
          <!-- 凭据状态行：已配置（绿 chip + 环境变量键名 tags）/ 无凭据（灰 chip） -->
          <div v-if="credOf(s)" class="ob-cred-row">
            <span class="ob-cred-chip ok">
              <svg-icon icon-class="key" />
              已配置凭据
            </span>
            <span
              v-for="k in envKeysOf(s).slice(0, 5)"
              :key="k"
              class="ob-cred-key"
            >{{ k }}</span>
            <span v-if="envKeysOf(s).length > 5" class="ob-cred-key more">
              +{{ envKeysOf(s).length - 5 }}
            </span>
          </div>
          <div v-else class="ob-cred-row">
            <span class="ob-cred-chip none">无凭据</span>
          </div>
        </div>
        <div class="ob-item-actions ob-item-actions-always">
          <span
            class="ob-item-action"
            :title="credOf(s) ? '编辑凭据' : '配置凭据'"
            @click="openSkillCred(s)"
          >
            <svg-icon icon-class="key" />
          </span>
          <span class="ob-item-action" title="编辑" @click="openSkillEdit(s)">
            <svg-icon icon-class="edit" />
          </span>
          <span class="ob-item-action danger" title="删除" @click="removeSkill(s)">
            <svg-icon icon-class="delete" />
          </span>
        </div>
      </div>
    </div>

    <!-- 编辑/导入 Skill 弹窗（新建仅 ZIP 导入；编辑为表单） -->
    <transition name="ob-modal">
      <div v-if="skillDialogVisible" class="ob-overlay" @click.self="skillDialogVisible = false">
        <div class="ob-dialog ob-dialog-skill">
          <header class="ob-dialog-header">
            <h3 class="ob-dialog-title">{{ skillEditing ? '编辑 Skill' : '导入 Skill' }}</h3>
            <svg-icon icon-class="close" class="ob-dialog-close" @click="skillDialogVisible = false" />
          </header>

          <div class="ob-dialog-body">
            <!-- 手动编辑（已有 Skill） -->
            <template v-if="skillEditing">
              <div class="ob-field">
                <label class="ob-field-label">名称 <span class="ob-field-required">*</span></label>
                <el-input
                  v-model="skillForm.name"
                  size="small"
                  clearable
                  :disabled="!!skillEditing"
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
                  @click="pickSkillZip"
                  @dragover.prevent="zipDragOver = true"
                  @dragleave="zipDragOver = false"
                  @drop.prevent="onSkillZipDrop"
                >
                  <template v-if="!skillZipFile">
                    <svg-icon icon-class="skill" class="ob-zip-ico" />
                    <div class="ob-zip-title">点击或拖拽 ZIP 文件到此处</div>
                    <div class="ob-zip-hint">仅支持 .zip 格式，大小不超过 10MB（需包含 SKILL.md）</div>
                  </template>
                  <template v-else>
                    <div class="ob-zip-name">{{ skillZipFile.name }}</div>
                    <div class="ob-zip-hint">{{ formatSize(skillZipFile.size) }} · 点击重新选择</div>
                  </template>
                  <input
                    ref="zipInput"
                    type="file"
                    accept=".zip"
                    style="display: none"
                    @change="onSkillZipPicked"
                  />
                </div>
                <!-- 验证结果：选择文件后自动验证（通过显示名称/描述/文件数，失败显示原因） -->
                <div v-if="skillZipFile" class="ob-zip-validate-row">
                  <span v-if="skillZipValidating" class="ob-zip-msg">
                    <svg-icon icon-class="loading" class="ob-spin" /> 正在验证…
                  </span>
                  <span
                    v-else-if="skillZipValidation"
                    class="ob-zip-msg"
                    :class="skillZipValidation.ok ? 'ok' : 'err'"
                  >{{ zipValidationText }}</span>
                </div>
              </div>
              <div class="ob-field">
                <label class="ob-field-label">技能凭据（可选）</label>
                <el-input
                  v-model="skillZipCred"
                  type="textarea"
                  :rows="10"
                  class="ob-code-area"
                  placeholder='JSON 格式，如 {"API_KEY": "xxx"}；导入成功后自动绑定到该技能'
                  @blur="formatSkillZipCred"
                />
                <div class="ob-field-hint">凭据将加密存储（仅本机可解密），技能启用时以环境变量注入</div>
              </div>
            </template>
          </div>

          <footer class="ob-dialog-footer">
            <el-button size="small" round @click="skillDialogVisible = false">取消</el-button>
            <!-- 编辑：保存表单；新建（ZIP 导入）：确认导入 -->
            <el-button
              v-if="skillEditing"
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
              :loading="skillZipImporting"
              :disabled="!skillZipValidation || !skillZipValidation.ok"
              @click="importSkillZipFile(false)"
            >确认导入</el-button>
          </footer>
        </div>
      </div>
    </transition>

    <!-- 技能凭据弹窗：为单个 Skill 绑定凭据（env 以环境变量方式注入，加密存储） -->
    <el-dialog
      :title="skillCredExisting ? '编辑技能凭据' : '配置技能凭据'"
      :visible.sync="skillCredModalVisible"
      width="560px"
      append-to-body
      custom-class="ob-el-dialog"
      :close-on-click-modal="false"
    >
      <div class="ob-dialog-form">
        <p class="ob-field-tip">
          凭据自动绑定到技能「{{ skillCredTarget ? skillCredTarget.name : '' }}」，技能启用时以环境变量方式提供（加密存储，仅本机可解密）
        </p>
        <div class="ob-field">
          <label class="ob-field-label">凭据名称 <span class="ob-field-required">*</span></label>
          <el-input
            v-model="skillCredForm.name"
            size="small"
            clearable
            placeholder="如 pdf-report-creds"
            maxlength="40"
          />
        </div>
        <div class="ob-field">
          <div class="ob-cred-toolbar">
            <label class="ob-field-label">环境变量</label>
            <el-button size="mini" round @click="formatSkillCredEnv">格式化</el-button>
          </div>
          <el-input
            v-model="skillCredForm.envStr"
            type="textarea"
            :rows="7"
            class="ob-textarea-mono"
            :placeholder="skillCredExisting ? '已加密保存，不回显；留空保存 = 保持现有值' : '{&quot;API_KEY&quot;: &quot;xxx&quot;}'"
            @blur="formatSkillCredEnv"
          />
        </div>
      </div>
      <template slot="footer">
        <div class="ob-cred-footer">
          <el-button
            v-if="skillCredExisting"
            size="small"
            round
            type="danger"
            plain
            @click="removeSkillCred"
          >删除凭据</el-button>
          <span v-else></span>
          <div class="ob-cred-footer-btns">
            <el-button size="small" round @click="skillCredModalVisible = false">取消</el-button>
            <el-button size="small" round type="primary" @click="saveSkillCred">保存</el-button>
          </div>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script>
// Skills 管理独立页：ZIP 导入（上传 → 验证 → 导入 + 随包凭据绑定）+
// 编辑（SKILL.md 表单）+ 删除 + 技能凭据（加密存储、明文不回显）
export default {
  name: 'OmniBuddySkills',
  data() {
    return {
      // ===== Skills 管理 =====
      skillList: [],
      skillLoading: false,
      skillDialogVisible: false,
      // 编辑中的 Skill（null 表示新建）
      skillEditing: null,
      skillForm: { name: '', description: '', content: '' },
      // ZIP 导入：文件持有 / 拖拽高亮 / 验证状态 / 导入中 / 随包凭据
      skillZipFile: null,
      zipDragOver: false,
      skillZipValidating: false,
      skillZipValidation: null,
      skillZipImporting: false,
      skillZipCred: '',
      // ===== 技能凭据（Skills 卡片内配置，type 固定 'skill'） =====
      skillCredList: [],
      skillCredModalVisible: false,
      // 弹窗对应的目标技能与已有凭据（null 表示首次配置）
      skillCredTarget: null,
      skillCredExisting: null,
      skillCredForm: { name: '', envStr: '' }
    }
  },
  computed: {
    // ZIP 验证结果文案（通过：名称 + 描述 + 文件数 + 覆盖提示；失败：原因）
    zipValidationText() {
      const v = this.skillZipValidation
      if (!v) return ''
      if (!v.ok) return v.error || '校验失败'
      let text = '通过：' + v.skillName
      if (v.description) text += ' · ' + v.description
      text += ' · ' + (v.fileCount || 0) + ' 个文件'
      if (v.exists) text += '（同名已存在，导入时将询问覆盖）'
      return text
    }
  },
  created() {
    this.loadSkills()
  },
  methods: {
    // ===== Skills 管理 =====
    async loadSkills() {
      this.skillLoading = true
      try {
        const api = window.electronAPI && window.electronAPI.omnibuddy
        const res = api ? await api.listSkills() : []
        this.skillList = Array.isArray(res) ? res : []
      } catch (e) {
        this.skillList = []
      }
      this.skillLoading = false
      // 与技能列表一起加载技能凭据（卡片状态行展示用）
      this.loadSkillCreds()
    },
    openSkillCreate() {
      this.skillForm = { name: '', description: '', content: '' }
      this.skillEditing = null
      // 重置 ZIP 导入状态
      this.skillZipFile = null
      this.skillZipValidation = null
      this.skillZipCred = ''
      this.zipDragOver = false
      this.skillDialogVisible = true
    },
    // ===== ZIP 导入（上传 → 验证 → 导入 + 随包凭据绑定） =====
    // 随包凭据失焦自动格式化 JSON（非法时保持原样，导入时校验兜底）
    formatSkillZipCred() {
      const raw = this.skillZipCred.trim()
      if (!raw) return
      try {
        const obj = JSON.parse(raw)
        if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
          this.skillZipCred = JSON.stringify(obj, null, 2)
        }
      } catch (e) { /* 非法 JSON 不动 */ }
    },
    pickSkillZip() {
      if (this.$refs.zipInput) this.$refs.zipInput.click()
    },
    onSkillZipDrop(e) {
      this.zipDragOver = false
      const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]
      if (f) this.holdSkillZip(f)
    },
    onSkillZipPicked(e) {
      const f = e.target && e.target.files && e.target.files[0]
      if (f) this.holdSkillZip(f)
      e.target.value = ''
    },
    // 持有 ZIP 文件：格式与大小校验，选择后立即自动验证
    holdSkillZip(file) {
      if (!/\.zip$/i.test(file.name)) {
        this.$message.error('仅支持 .zip 文件')
        return
      }
      if (file.size > 10 * 1024 * 1024) {
        this.$message.error('文件大小不能超过 10MB')
        return
      }
      this.skillZipFile = file
      this.skillZipValidation = null
      // 自动验证（上传即校验，无需手动点按钮）
      this.validateSkillZipFile()
    },
    formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B'
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
      return (bytes / 1024 / 1024).toFixed(1) + ' MB'
    },
    // File → Uint8Array（IPC 结构化克隆传输）
    async zipBytes() {
      return new Uint8Array(await this.skillZipFile.arrayBuffer())
    },
    async validateSkillZipFile() {
      if (!this.skillZipFile) return
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (!api || !api.validateSkillZip) {
        this.$message.error('Skills 管理仅桌面端可用')
        return
      }
      this.skillZipValidating = true
      try {
        this.skillZipValidation = await api.validateSkillZip(await this.zipBytes())
      } catch (e) {
        this.skillZipValidation = { ok: false, error: (e && e.message) || '校验失败' }
      } finally {
        this.skillZipValidating = false
      }
    },
    // 导入：同名已存在时二次确认覆盖；随包凭据在导入成功后加密绑定到该技能
    async importSkillZipFile(overwrite) {
      const v = this.skillZipValidation
      if (!v || !v.ok) return
      if (v.exists && !overwrite) {
        this.$confirm('同名 Skill「' + v.skillName + '」已存在，导入将覆盖其内容。继续吗？', '覆盖导入', {
          confirmButtonText: '覆盖导入',
          cancelButtonText: '取消',
          type: 'warning'
        }).then(() => this.importSkillZipFile(true)).catch(() => {})
        return
      }
      // 凭据（可选）：填写时必须是合法 JSON 对象
      let credEnv = null
      if (this.skillZipCred.trim()) {
        try {
          credEnv = JSON.parse(this.skillZipCred)
          if (!credEnv || typeof credEnv !== 'object' || Array.isArray(credEnv)) throw new Error('bad')
        } catch (e) {
          this.$message.error('技能凭据不是合法的 JSON 对象')
          return
        }
      }
      const api = window.electronAPI && window.electronAPI.omnibuddy
      this.skillZipImporting = true
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
        this.skillDialogVisible = false
        this.loadSkills()
      } catch (e) {
        this.$message.error((e && e.message) || '导入失败')
      } finally {
        this.skillZipImporting = false
      }
    },
    // 编辑 Skill：读取 SKILL.md 内容回填弹窗（名称作为目录标识不可改）
    openSkillEdit(s) {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (!api) {
        this.$message.error('Skills 管理仅桌面端可用')
        return
      }
      api.getSkill(s.dir).then(res => {
        if (res && res.ok && res.skill) {
          this.skillForm = {
            name: res.skill.name || s.name,
            description: res.skill.description || '',
            content: res.skill.content || ''
          }
          this.skillEditing = s
          this.skillDialogVisible = true
        } else {
          this.$message.error((res && res.error) || '读取 Skill 失败')
        }
      })
    },
    // 保存编辑（新建走 ZIP 导入，表单保存仅用于已有 Skill 的编辑）
    async saveSkill() {
      const name = this.skillForm.name.trim()
      const description = this.skillForm.description.trim()
      if (!name || !description) {
        this.$message.warning('请填写名称与描述')
        return
      }
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (!api) {
        this.$message.error('Skills 管理仅桌面端可用')
        return
      }
      const res = await api.updateSkill({ name, description, content: this.skillForm.content })
      if (res && res.ok) {
        this.skillDialogVisible = false
        this.$message.success('Skill 已更新，新会话生效')
        this.skillEditing = null
        this.loadSkills()
      } else {
        this.$message.error((res && res.error) || '更新失败')
      }
    },
    removeSkill(s) {
      this.$confirm('确定删除 Skill「' + s.name + '」吗？', '删除 Skill', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const api = window.electronAPI && window.electronAPI.omnibuddy
        const res = await api.deleteSkill(s.dir)
        if (res && res.ok) {
          this.$message.success('已删除')
          this.loadSkills()
        } else {
          this.$message.error((res && res.error) || '删除失败')
        }
      }).catch(() => {})
    },
    // ===== 技能凭据（长在 Skill 卡片上，加密存储、明文不回显） =====
    // 加载全部凭证并筛出技能型（type === 'skill'）
    async loadSkillCreds() {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      const cred = api && api.credentials
      try {
        const res = cred ? await cred.list() : []
        const list = Array.isArray(res) ? res : []
        this.skillCredList = list.filter(c => c.type === 'skill')
      } catch (e) {
        this.skillCredList = []
      }
    },
    // 技能绑定的已有凭据（按 skillNames 匹配）
    credOf(skill) {
      if (!skill) return null
      return this.skillCredList.find(c => (c.skillNames || []).includes(skill.name)) || null
    },
    // 该技能凭据的环境变量键名（脱敏视图，仅键名）
    envKeysOf(skill) {
      const c = this.credOf(skill)
      return (c && c.envKeys) || []
    },
    // 打开技能凭据弹窗：已有凭据则回填名称（明文 env 不回显），否则预置默认名
    openSkillCred(skill) {
      const existing = this.credOf(skill)
      this.skillCredTarget = skill
      this.skillCredExisting = existing
      this.skillCredForm = {
        name: existing ? existing.name : skill.name + '-creds',
        envStr: ''
      }
      this.skillCredModalVisible = true
    },
    // 格式化环境变量 JSON（非法 JSON 提示）
    formatSkillCredEnv() {
      const text = this.skillCredForm.envStr.trim()
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
      this.skillCredForm.envStr = JSON.stringify(obj, null, 2)
    },
    // JSON 字段解析（对象校验，非法时提示并返回 false）
    parseJsonField(str, label, kind) {
      const text = (str || '').trim()
      if (!text) return kind === 'array' ? [] : {}
      let parsed = null
      try {
        parsed = JSON.parse(text)
      } catch (e) {
        parsed = null
      }
      const valid = parsed !== null && (kind === 'array'
        ? Array.isArray(parsed)
        : (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)))
      if (!valid) {
        this.$message.error(label + '不是合法的 JSON ' + (kind === 'array' ? '数组' : '对象'))
        return false
      }
      return parsed
    },
    // 保存技能凭据：已有 → update（env 留空传 null 保持原值）；
    // 首次 → create（type 固定 'skill'，绑定该技能名）
    async saveSkillCred() {
      const name = this.skillCredForm.name.trim()
      if (!name) {
        this.$message.error('请输入凭据名称')
        return
      }
      // 环境变量：非空时必须为合法 JSON 对象；留空表示保持现有值
      let env = null
      if (this.skillCredForm.envStr.trim()) {
        env = this.parseJsonField(this.skillCredForm.envStr, '环境变量', 'object')
        if (env === false) return
      }
      const api = window.electronAPI && window.electronAPI.omnibuddy
      const cred = api && api.credentials
      if (!cred) {
        this.$message.error('技能凭据仅桌面端可用')
        return
      }
      const skill = this.skillCredTarget
      if (!skill) return
      const isEdit = !!this.skillCredExisting
      const res = isEdit
        ? await cred.update({
          id: this.skillCredExisting.id,
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
        this.skillCredModalVisible = false
        this.$message.success(isEdit ? '技能凭据已更新' : '技能凭据已配置')
        this.loadSkillCreds()
      } else {
        this.$message.error((res && res.error) || (isEdit ? '更新失败' : '保存失败'))
      }
    },
    // 删除该技能绑定的凭据（带确认）
    removeSkillCred() {
      const existing = this.skillCredExisting
      if (!existing) return
      this.$confirm('确定删除凭据「' + existing.name + '」吗？删除后技能将失去对应环境变量。', '删除凭据', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const api = window.electronAPI && window.electronAPI.omnibuddy
        const cred = api && api.credentials
        if (!cred) {
          this.$message.error('技能凭据仅桌面端可用')
          return
        }
        const res = await cred.remove(existing.id)
        if (res && res.ok) {
          this.$message.success('已删除')
          this.skillCredModalVisible = false
          this.loadSkillCreds()
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
