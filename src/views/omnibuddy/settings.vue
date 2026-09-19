<template>
  <div class="ob-settings-page">
    <div class="ob-settings-layout">
      <!-- 左侧：设置分类导航 -->
      <aside class="ob-settings-nav">
        <div
          class="ob-nav-item"
          :class="{ active: activeTab === 'provider' }"
          @click="activeTab = 'provider'"
        >
          <svg-icon icon-class="cpu" />
          <span>模型供应商</span>
        </div>
        <div
          class="ob-nav-item"
          :class="{ active: activeTab === 'mcp' }"
          @click="switchTab('mcp')"
        >
          <svg-icon icon-class="connection" />
          <span>MCP 服务</span>
        </div>
        <div
          class="ob-nav-item"
          :class="{ active: activeTab === 'skills' }"
          @click="switchTab('skills')"
        >
          <svg-icon icon-class="collection-tag" />
          <span>Skill 管理</span>
        </div>
      </aside>

      <!-- 右侧：供应商列表 -->
      <section v-if="activeTab === 'provider'" class="ob-settings-body">
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
      </section>

      <!-- 右侧：Skills 管理 -->
      <section v-if="activeTab === 'skills'" class="ob-settings-body">
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
            <svg-icon icon-class="collection-tag" />
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
      </section>

      <!-- 右侧：MCP 服务管理 -->
      <section v-if="activeTab === 'mcp'" class="ob-settings-body">
        <header class="ob-section-header">
          <div class="ob-header-row">
            <div>
              <h2 class="ob-section-title">MCP 管理</h2>
              <p class="ob-section-desc">接入标准 MCP Server，为 Agent 扩展外部工具；配置全量本地保存</p>
            </div>
            <el-button
              size="small"
              round
              type="primary"
              @click="openMcpAdd"
            ><svg-icon icon-class="plus" class="ob-btn-svg" />新增服务</el-button>
          </div>
        </header>

        <!-- 空状态 -->
        <div v-if="!mcpServers.length && !mcpLoading" class="ob-empty">
          <div class="ob-empty-icon">
            <svg-icon icon-class="connection" />
          </div>
          <div class="ob-empty-title">暂无 MCP 服务</div>
          <div class="ob-empty-desc">新增一个 MCP 服务，让 Agent 获得外部工具能力</div>
          <el-button
            size="small"
            round
            type="primary"
            @click="openMcpAdd"
          ><svg-icon icon-class="plus" class="ob-btn-svg" />新增服务</el-button>
        </div>

        <!-- 服务卡片列表 -->
        <div v-else class="ob-mcp-list">
          <div v-if="mcpLoading" class="ob-ext-loading">
            <svg-icon icon-class="loading" class="ob-spin" /> 加载中…
          </div>
          <div
            v-for="s in mcpServers"
            v-else
            :key="s.name"
            class="ob-mcp-card"
            :class="{ disabled: !s.enabled }"
          >
            <div class="ob-mcp-card-head">
              <div class="ob-mcp-card-title">
                <svg-icon icon-class="connection" class="ob-mcp-card-svg" />
                <span class="ob-mcp-card-name">{{ s.name }}</span>
                <span class="ob-mcp-badge" :class="s.transport === 'http' ? 'is-http' : 'is-stdio'">
                  {{ s.transport === 'http' ? 'HTTP' : 'stdio' }}
                </span>
              </div>
              <div class="ob-mcp-card-ops">
                <el-switch
                  v-model="s.enabled"
                  @change="toggleMcpEnabled(s)"
                />
                <span class="ob-item-action" title="编辑" @click="openMcpEdit(s)">
                  <svg-icon icon-class="edit" />
                </span>
                <span class="ob-item-action danger" title="删除" @click="removeMcpItem(s)">
                  <svg-icon icon-class="delete" />
                </span>
              </div>
            </div>
            <p class="ob-mcp-card-desc">{{ s.description || '（无描述）' }}</p>
            <div class="ob-mcp-cmdline">
              <template v-if="s.transport === 'http'">{{ s.url }}</template>
              <template v-else>{{ s.command }} {{ (s.args || []).join(' ') }}</template>
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
                    <svg-icon icon-class="collection-tag" class="ob-zip-ico" />
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
                <!-- 验证行：验证按钮 + 结果（通过显示名称/描述/文件数，失败显示原因） -->
                <div v-if="skillZipFile" class="ob-zip-validate-row">
                  <el-button
                    size="mini"
                    round
                    :loading="skillZipValidating"
                    @click="validateSkillZipFile"
                  >验证 Skill</el-button>
                  <span
                    v-if="skillZipValidation"
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
                  :rows="3"
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

    <!-- 新增/编辑 MCP 服务弹窗 -->
    <el-dialog
      :title="mcpEditing ? '编辑 MCP 服务' : '新增 MCP 服务'"
      :visible.sync="mcpModalVisible"
      width="560px"
      append-to-body
      custom-class="ob-el-dialog"
      :close-on-click-modal="false"
    >
      <div class="ob-dialog-form">
        <!-- 名称（编辑时不可改，作为服务唯一标识） -->
        <div class="ob-field">
          <label class="ob-field-label">名称 <span class="ob-field-required">*</span></label>
          <el-input
            v-model="mcpForm.name"
            size="small"
            clearable
            :disabled="!!mcpEditing"
            placeholder="服务唯一标识，如 filesystem"
            maxlength="40"
          />
        </div>
        <!-- 描述 -->
        <div class="ob-field">
          <label class="ob-field-label">描述</label>
          <el-input
            v-model="mcpForm.description"
            size="small"
            clearable
            placeholder="一句话说明该服务提供的工具（可留空）"
            maxlength="120"
          />
        </div>
        <!-- 传输协议：自绘分段按钮 -->
        <div class="ob-field">
          <label class="ob-field-label">传输协议 <span class="ob-field-required">*</span></label>
          <div class="ob-seg ob-seg-full">
            <div
              class="ob-seg-item"
              :class="{ active: mcpForm.transport === 'http' }"
              @click="mcpForm.transport = 'http'"
            >
              <svg-icon icon-class="link" />
              Streamable HTTP
            </div>
            <div
              class="ob-seg-item"
              :class="{ active: mcpForm.transport === 'stdio' }"
              @click="mcpForm.transport = 'stdio'"
            >
              <svg-icon icon-class="monitor" />
              stdio 本地
            </div>
          </div>
        </div>
        <!-- stdio 型：启动命令 / 参数 / 环境变量 -->
        <template v-if="mcpForm.transport === 'stdio'">
          <div class="ob-field">
            <label class="ob-field-label">启动命令 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="mcpForm.command"
              size="small"
              clearable
              placeholder="如 npx 或 uvx"
            />
          </div>
          <div class="ob-field">
            <label class="ob-field-label">命令参数（JSON 数组）</label>
            <el-input
              v-model="mcpForm.argsStr"
              type="textarea"
              :rows="2"
              placeholder='如 ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]'
              @blur="formatMcpJsonField('argsStr', 'array')"
            />
          </div>
          <div class="ob-field">
            <label class="ob-field-label">环境变量（JSON 对象）</label>
            <el-input
              v-model="mcpForm.envStr"
              type="textarea"
              :rows="2"
              placeholder='如 {"API_KEY": "sk-…"}'
              @blur="formatMcpJsonField('envStr', 'object')"
            />
          </div>
        </template>
        <!-- http 型：服务 URL / 请求头 -->
        <template v-else>
          <div class="ob-field">
            <label class="ob-field-label">服务 URL <span class="ob-field-required">*</span></label>
            <el-input
              v-model="mcpForm.url"
              size="small"
              clearable
              placeholder="如 https://mcp.example.com/sse"
            />
          </div>
          <div class="ob-field">
            <label class="ob-field-label">请求头（JSON 对象）</label>
            <el-input
              v-model="mcpForm.headersStr"
              type="textarea"
              :rows="2"
              placeholder='如 {"Authorization": "Bearer …"}'
              @blur="formatMcpJsonField('headersStr', 'object')"
            />
          </div>
        </template>
      </div>
      <template slot="footer">
        <el-button size="small" round @click="mcpModalVisible = false">取消</el-button>
        <el-button size="small" round type="primary" @click="saveMcpItem">{{ mcpEditing ? '保存修改' : '添加服务' }}</el-button>
      </template>
    </el-dialog>

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
import { getItem, setItem } from '@/utils/db'

let uid = Date.now()

// OmniBuddy 专属设置页：模型供应商列表管理（新建/编辑/删除/设默认）
// 所有供应商统一走 OpenAI 兼容接口规范，保存前经主进程代理测试连接
export default {
  name: 'OmniBuddySettings',
  data() {
    return {
      // 当前设置分类：provider 模型供应商 / mcp MCP 服务 / skills 技能
      activeTab: 'provider',
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
      testing: false,
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
      skillCredForm: { name: '', envStr: '' },
      // ===== MCP 服务管理 =====
      mcpServers: [],
      mcpLoading: false,
      mcpModalVisible: false,
      // 编辑中的 MCP 服务（null 表示新增）
      mcpEditing: null,
      mcpForm: {
        name: '',
        description: '',
        // 默认选中 Streamable HTTP
        transport: 'http',
        command: '',
        argsStr: '',
        envStr: '',
        url: '',
        headersStr: ''
      }
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
    this.load()
  },
  methods: {
    // 切换分类：mcp / skills 懒加载对应数据
    switchTab(tab) {
      this.activeTab = tab
      if (tab === 'mcp') this.loadMcp()
      if (tab === 'skills') this.loadSkills()
    },
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
    // ===== ZIP 导入（对齐参考项目：上传 → 验证 → 导入 + 随包凭据绑定） =====
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
    // 持有 ZIP 文件：格式与大小校验，切换文件后需重新验证
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
    // 保存技能凭据：已有 → update（env 留空传 null 保持原值，headers 传 null 保持原值）；
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
    },
    // ===== MCP 服务管理 =====
    async loadMcp() {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      const mcp = api && api.mcp
      this.mcpLoading = true
      try {
        if (mcp) {
          const servers = await mcp.list()
          this.mcpServers = Array.isArray(servers) ? servers : []
        } else {
          this.mcpServers = []
        }
      } catch (e) {
        this.mcpServers = []
      }
      this.mcpLoading = false
    },
    openMcpAdd() {
      this.mcpEditing = null
      this.mcpForm = {
        name: '',
        description: '',
        // 默认选中 Streamable HTTP
        transport: 'http',
        command: '',
        argsStr: '',
        envStr: '',
        url: '',
        headersStr: ''
      }
      this.mcpModalVisible = true
    },
    openMcpEdit(s) {
      this.mcpEditing = s
      this.mcpForm = {
        name: s.name,
        description: s.description || '',
        transport: s.transport || 'stdio',
        command: s.command || '',
        argsStr: JSON.stringify(s.args || []),
        envStr: JSON.stringify(s.env || {}),
        url: s.url || '',
        headersStr: JSON.stringify(s.headers || {})
      }
      this.mcpModalVisible = true
    },
    // JSON 字符串校验：空串返回空数组/对象；解析失败或类型不符返回 false 并提示
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
    // MCP 弹窗 JSON 字段失焦自动格式化（命令参数/环境变量/请求头）：
    // 合法且类型匹配时格式化回填；非法时提示（保存前 parseJsonField 兜底拦截）
    formatMcpJsonField(field, kind) {
      const text = String(this.mcpForm[field] || '').trim()
      if (!text) return
      try {
        const parsed = JSON.parse(text)
        const valid = kind === 'array'
          ? Array.isArray(parsed)
          : (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed))
        if (!valid) throw new Error('bad')
        this.mcpForm[field] = JSON.stringify(parsed, null, 2)
      } catch (e) {
        const labels = { argsStr: '命令参数', envStr: '环境变量', headersStr: '请求头' }
        this.$message.error((labels[field] || '该字段') + '不是合法的 JSON ' + (kind === 'array' ? '数组' : '对象'))
      }
    },
    async saveMcpItem() {
      const form = this.mcpForm
      const name = form.name.trim()
      if (!name) {
        this.$message.error('请输入服务名称')
        return
      }
      const isEdit = !!this.mcpEditing
      if (!isEdit && this.mcpServers.some(s => s.name === name)) {
        this.$message.error('已存在同名服务：' + name)
        return
      }
      // 组装服务配置（JSON 字段先校验再转换）
      const item = { name, description: form.description.trim(), transport: form.transport }
      if (form.transport === 'stdio') {
        if (!form.command.trim()) {
          this.$message.error('请输入启动命令')
          return
        }
        const args = this.parseJsonField(form.argsStr, '命令参数', 'array')
        const env = this.parseJsonField(form.envStr, '环境变量', 'object')
        if (args === false || env === false) return
        item.command = form.command.trim()
        item.args = args
        item.env = env
      } else {
        if (!form.url.trim()) {
          this.$message.error('请输入服务 URL')
          return
        }
        const headers = this.parseJsonField(form.headersStr, '请求头', 'object')
        if (headers === false) return
        item.url = form.url.trim()
        item.headers = headers
      }
      // 编辑：保留原字段（enabled 等）整体替换；新增：默认启用
      const next = isEdit
        ? this.mcpServers.map(s => (s.name === this.mcpEditing.name ? Object.assign({}, s, item) : s))
        : this.mcpServers.concat([Object.assign({ enabled: true }, item)])
      const ok = await this.saveMcpServers(next)
      if (ok) {
        this.mcpModalVisible = false
        this.mcpEditing = null
        this.$message.success(isEdit ? 'MCP 服务已更新，新会话生效' : 'MCP 服务已添加，新会话生效')
      }
    },
    // 全量保存 MCP 服务列表（开关切换 / 删除 / 编辑共用）
    async saveMcpServers(servers) {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      const mcp = api && api.mcp
      if (!mcp) {
        this.$message.error('MCP 管理仅桌面端可用')
        return false
      }
      try {
        const res = await mcp.save(servers)
        if (res && res.ok === false) {
          this.$message.error(res.error || '保存失败')
          return false
        }
        this.loadMcp()
        return true
      } catch (e) {
        this.$message.error('保存失败：' + (e && e.message ? e.message : '未知错误'))
        return false
      }
    },
    // 启用开关：v-model 已更新状态，此处全量保存；失败回滚
    async toggleMcpEnabled(s) {
      const ok = await this.saveMcpServers(this.mcpServers)
      if (!ok) {
        this.$nextTick(() => { s.enabled = !s.enabled })
      }
    },
    removeMcpItem(s) {
      this.$confirm('确定删除 MCP 服务「' + s.name + '」吗？', '删除 MCP 服务', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(async () => {
        const ok = await this.saveMcpServers(this.mcpServers.filter(x => x.name !== s.name))
        if (ok) this.$message.success('已删除')
      }).catch(() => {})
    },
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

/* svg 图标：按钮内联图标对齐 + 旋转加载 */
.ob-btn-svg {
  margin-right: 4px;
  vertical-align: -0.125em;
}

.ob-spin {
  animation: ob-spin 0.9s linear infinite;
}

@keyframes ob-spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
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

  .svg-icon {
    font-size: 15px;
  }

  &.active {
    background: rgba(var(--primary-color-rgb), 0.09);
    color: var(--primary-color);
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
  background: rgba(var(--primary-color-rgb), 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 4px;

  .svg-icon {
    font-size: 26px;
    color: var(--primary-color);
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
  gap: 10px;
}

.ob-list-item {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 13px 16px;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  cursor: pointer;
  transition: all 0.18s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.07);
    transform: translateY(-1px);

    .ob-item-actions {
      opacity: 1;
    }
  }

  /* 默认项：主色渐变底 + 左侧强调条 */
  &.default {
    border-color: rgba(var(--primary-color-rgb), 0.45);
    background: linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.05), transparent 62%);
    box-shadow: inset 3px 0 0 var(--primary-color);
  }
}

/* 供应商 logo 首字母 */
.ob-item-logo {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.22), 0 2px 6px rgba(0, 0, 0, 0.12);

  &.logo-openai {
    background: linear-gradient(135deg, #10A37F, #0B7A61);
  }

  &.logo-deepseek {
    background: linear-gradient(135deg, #4D6BFE, #2A4BD7);
  }

  &.logo-qwen {
    background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
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
  display: flex;
  align-items: center;
  gap: 7px;
}

.ob-item-title {
  font-size: 13.5px;
  font-weight: 600;
  color: $text-primary;
}

.ob-item-default-badge {
  font-size: 10px;
  font-weight: 700;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  border: 1px solid rgba(var(--primary-color-rgb), 0.25);
  padding: 0 7px;
  border-radius: 999px;
  line-height: 1.6;
  flex-shrink: 0;
}

/* API 格式标签 */
.ob-item-format {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.6;
  padding: 0 7px;
  border-radius: 5px;
  flex-shrink: 0;
  letter-spacing: 0.2px;

  &.fmt-openai {
    color: #0B7A61;
    background: rgba(16, 163, 127, 0.1);
    border: 1px solid rgba(16, 163, 127, 0.3);
  }

  &.fmt-anthropic {
    color: #B85C3E;
    background: rgba(217, 119, 87, 0.1);
    border: 1px solid rgba(217, 119, 87, 0.35);
  }
}

/* 次行：模型（cpu 图标 + 展示名）· 分隔点 · 接口地址（等宽） */
.ob-item-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;

  .ob-item-model-svg {
    font-size: 12px;
    color: var(--primary-color);
    flex-shrink: 0;
  }
}

.ob-item-model {
  font-size: 11.5px;
  font-weight: 600;
  color: $text-primary;
  flex-shrink: 0;
  max-width: 45%;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-item-dot {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--border-color);
  flex-shrink: 0;
}

.ob-item-url {
  flex: 1;
  min-width: 0;
  font-size: 10.5px;
  color: $text-secondary;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
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

  .svg-icon {
    font-size: 13px;
  }

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.1);
    color: var(--primary-color);
  }

  &.danger:hover {
    background: rgba(245, 34, 45, 0.1);
    color: #F5222D;
  }
}

/* ===== MCP 服务管理 ===== */
/* 服务卡片列表 */
.ob-mcp-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.ob-mcp-card {
  padding: 13px 15px;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);
    box-shadow: $shadow-sm;
  }

  /* 已停用：整体弱化 */
  &.disabled {
    opacity: 0.62;
  }
}

.ob-mcp-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.ob-mcp-card-title {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;

  .ob-mcp-card-svg {
    font-size: 15px;
    color: var(--primary-color);
    flex-shrink: 0;
  }

  .ob-mcp-card-name {
    font-size: 13.5px;
    font-weight: 600;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.ob-mcp-card-ops {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}

.ob-mcp-card-desc {
  margin-top: 6px;
  font-size: 11.5px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 灰底等宽配置行：stdio 命令行 / http url */
.ob-mcp-cmdline {
  margin-top: 8px;
  padding: 7px 10px;
  border-radius: $radius-base;
  background: $search-bg;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 徽标：stdio 紫 / http 蓝 */
.ob-mcp-badge {
  font-size: 10px;
  font-weight: 600;
  line-height: 1.6;
  padding: 0 7px;
  border-radius: 5px;
  flex-shrink: 0;
  letter-spacing: 0.2px;

  &.is-stdio {
    color: #9254DE;
    background: rgba(114, 46, 209, 0.1);
    border: 1px solid rgba(114, 46, 209, 0.3);
  }

  &.is-http {
    color: #409EFF;
    background: rgba(64, 158, 255, 0.1);
    border: 1px solid rgba(64, 158, 255, 0.3);
  }
}

/* ===== 技能凭据：Skills 卡片状态行 + 凭据弹窗 ===== */
/* 状态行：已配置（绿 chip + 环境变量键名 tags）/ 无凭据（灰 chip） */
.ob-cred-row {
  margin-top: 7px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px;
}

.ob-cred-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.6;
  padding: 0 7px;
  border-radius: 5px;
  flex-shrink: 0;

  .svg-icon {
    font-size: 11px;
  }

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
}

/* 环境变量键名小标签（envKeys） */
.ob-cred-key {
  font-size: 10.5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: $text-secondary;
  background: $search-bg;
  border: 1px solid var(--border-color);
  border-radius: 5px;
  padding: 1px 7px;
  line-height: 1.5;

  &.more {
    color: var(--primary-color);
    border-color: rgba(var(--primary-color-rgb), 0.3);
    background: rgba(var(--primary-color-rgb), 0.06);
  }
}

/* 弹窗内「环境变量」标签行：左侧标题 + 右侧格式化按钮 */
.ob-cred-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 弹窗底部：左侧删除凭据 + 右侧取消/保存 */
.ob-cred-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ob-cred-footer-btns {
  display: flex;
  gap: 8px;
}

/* 环境变量 textarea 等宽字体 */
.ob-textarea-mono {
  ::v-deep textarea {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 12px;
  }
}

/* 传输协议自绘分段按钮 */
.ob-seg {
  display: inline-flex;
  gap: 4px;
  padding: 3px;
  background: $search-bg;
  border: 1px solid var(--border-color);
  border-radius: 10px;

  /* 通栏版本：按钮各占 50% */
  &.ob-seg-full {
    display: flex;
    width: 100%;

    .ob-seg-item {
      flex: 1;
    }
  }
}

.ob-seg-item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 6px 18px;
  font-size: 12.5px;
  border-radius: 8px;
  color: $text-secondary;
  cursor: pointer;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 14px;
  }

  &.active {
    background: var(--card-bg);
    color: var(--primary-color);
    font-weight: 600;
    box-shadow: $shadow-sm;
  }
}

/* el-dialog 内表单布局（ob-field 复用自供应商弹窗） */
.ob-dialog-form {
  display: flex;
  flex-direction: column;
  gap: 13px;
}

/* 字段下方辅助说明 */
.ob-field-tip {
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: $text-secondary;
}

.ob-ext-loading {
  padding: 24px 0;
  text-align: center;
  font-size: 12.5px;
  color: $text-secondary;
}

.ob-ext-item {
  cursor: default;
}

/* 删除按钮常显（Skills 列表行无点击语义） */
.ob-item-actions-always {
  opacity: 1;
}

/* ===== Skill 新建弹窗（略宽，容纳 textarea）：不套用供应商弹窗的 4:3 比例 ===== */
.ob-dialog.ob-dialog-skill {
  width: 520px;
  aspect-ratio: auto;
  height: auto;
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
  /* 供应商弹窗：4:3 宽高比（880×660，常规窗口内容完整展示无滚动；极小屏收缩时内部滚动兜底） */
  width: min(880px, calc(100vw - 48px));
  aspect-ratio: 4 / 3;
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
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
    font-size: 20px;
    color: $text-secondary;
    cursor: pointer;
    padding: 2px;
    border-radius: 6px;
    transition: all 0.15s ease;

    &:hover {
      background: $search-bg;
      color: $text-primary;
    }
  }
}

.ob-dialog-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 13px;

  &::-webkit-scrollbar {
    width: 4px;
  }
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
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 0 18px 16px;
}

/* 左侧 Token 消耗提示 + 右侧按钮组 */
.ob-dialog-tip {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 11px;
  line-height: 1.5;
  color: #E6A23C;
  display: inline-flex;
  align-items: center;
  gap: 4px;

  .ob-tip-svg {
    font-size: 13px;
    flex-shrink: 0;
  }
}

.ob-dialog-btns {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

/* API 格式下拉撑满字段宽度 */
.ob-field-select {
  width: 100%;
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

<style lang="scss">
/* ============ MCP / 技能凭据 el-dialog 弹窗（append-to-body，对齐自绘弹窗风格） ============ */
.ob-el-dialog {
  border-radius: 16px !important;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28) !important;

  .el-dialog__header {
    padding: 14px 18px 0;

    .el-dialog__title {
      font-size: 15px;
      font-weight: 700;
      color: var(--text-primary);
    }

    .el-dialog__headerbtn {
      .el-dialog__close {
        color: var(--text-secondary);
        transition: color 0.15s ease;

        &:hover {
          color: var(--text-primary);
        }
      }
    }
  }

  .el-dialog__body {
    padding: 14px 18px;
  }

  .el-dialog__footer {
    padding: 0 18px 16px;
  }
}

/* ===== Skill ZIP 导入（上传区 + 验证行 + 随包凭据） ===== */
.ob-zip-drop {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 20px 14px;
  border: 1.5px dashed var(--border-color);
  border-radius: $radius-base;
  background: var(--search-bg, rgba(0, 0, 0, 0.03));
  cursor: pointer;
  user-select: none;
  transition: border-color 0.15s ease, background 0.15s ease;

  &:hover,
  &.over {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    background: rgba(var(--primary-color-rgb), 0.05);
  }

  .ob-zip-ico {
    font-size: 22px;
    color: var(--primary-color);
    opacity: 0.85;
  }

  .ob-zip-title {
    font-size: 12.5px;
    font-weight: 500;
    color: var(--text-primary);
  }

  .ob-zip-name {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--primary-color);
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ob-zip-hint {
    font-size: 11px;
    color: var(--text-secondary);
  }
}

.ob-zip-validate-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.ob-zip-msg {
  font-size: 11.5px;
  line-height: 1.5;
  flex: 1;
  min-width: 0;

  &.ok {
    color: #52C41A;
  }

  &.err {
    color: #F56C6C;
  }
}

.ob-field-hint {
  margin-top: 5px;
  font-size: 11px;
  color: var(--text-secondary);
  line-height: 1.5;
}

/* JSON 等宽编辑区（凭据等） */
.ob-code-area ::v-deep textarea {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}
</style>
