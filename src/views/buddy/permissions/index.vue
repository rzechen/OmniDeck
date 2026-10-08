<template>
  <div class="ob-manage-page perm-page">
    <!-- 顶部 Hero（共享管理页头） -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">权限策略</h2>
          <span class="ob-hero-badge" v-if="loaded">规则 {{ ruleCount }} 条</span>
        </div>
        <p class="ob-section-desc">
          Agent 可用工具目录与权限管控合并呈现：按分组管理各工具的放行 / 确认 / 禁用（含运行时状态与预装依赖）。快捷模式在对话输入框下方切换；特殊面（路径 / 外部目录 / 兜底）与自定义规则为本页独有的管理面
        </p>
      </div>
      <div class="ob-hero-actions">
        <el-button size="small" round plain type="danger" :disabled="!loaded || resetting" :loading="resetting" @click="resetDefault">重置默认</el-button>
        <el-button size="small" round type="primary" :loading="saving" :disabled="!isDirty" @click="save">保存</el-button>
      </div>
    </header>

    <!-- 主体：全宽分组规则视图（hero 固定，行区独立滚动） -->
    <div class="ob-page-body">
      <!-- 加载中：骨架屏占位 -->
      <div v-if="loading" class="ob-sk-wrap">
        <buddy-skeleton type="list" :count="8" />
      </div>

      <template v-else>
        <!-- 动作裁决说明（内容区顶部，随页面滚动） -->
        <div class="ob-mode-note">
          <svg-icon icon-class="info" />
          <p><b>允许 / 拒绝</b>的规则直接执行；<b>每次确认</b>的由对话输入框下方的权限模式裁决（弹卡询问 / 自动放行 / 只读拒绝）。同一工具的多条匹配细则按「精确 &gt; 通配」生效；特殊面（路径 / 外部目录 / 兜底）与自定义规则为额外管理面，保存后新对话生效。</p>
        </div>

        <!-- 分组规则视图：工具组 + 特殊面组 + 自定义组（各组自带圆角列表） -->
        <section v-for="g in viewGroups" :key="g.key" class="ob-perm-section">
              <div class="ob-perm-head">
                <span class="ob-perm-ico"><svg-icon :icon-class="g.icon" /></span>
                <span class="ob-perm-title">{{ g.label }}</span>
                <span class="ob-perm-count">{{ g.items.length }}</span>
                <span class="ob-perm-desc">{{ g.desc }}</span>
              </div>
              <div class="ob-perm-list">
                <div v-for="row in g.items" :key="row.name" class="ob-perm-item">
                  <div class="ob-perm-row" :class="{ off: row.disabled, inherited: row.inherited }">
                    <span class="ob-row-ico"><svg-icon :icon-class="g.icon" /></span>
                    <span class="ob-row-label" :title="row.label">{{ row.label }}</span>
                    <span class="ob-row-name" :title="row.name">{{ row.name }}</span>
                    <span class="ob-row-desc" :title="row.description">{{ row.description }}</span>
                    <el-tag v-if="row.disabled" size="small" type="info" effect="plain" class="ob-disabled-tag">已禁用</el-tag>
                    <el-tag v-if="row.appended" size="small" type="warning" effect="plain" class="ob-appended-tag">追加</el-tag>
                    <el-tag
                      v-if="row.inherited"
                      size="small"
                      type="info"
                      effect="plain"
                      class="ob-inherited-tag"
                      :title="'该连接器未单独配置规则，按全局兜底策略执行（当前：' + fallbackLabel + '）；调整动作后成为专属规则'"
                    >继承兜底</el-tag>
                    <el-button
                      v-if="row.runtime && row.runtime.modules"
                      size="small"
                      round
                      plain
                      class="ob-deps-btn"
                      @click="openDeps(row)"
                    >预装依赖 {{ installedCount(row.runtime) }}/{{ row.runtime.modules.length }}</el-button>
                    <el-button
                      v-if="row.patterns.length"
                      size="small"
                      link
                      class="ob-detail-toggle"
                      @click="toggleDetail(row)"
                    >细则 {{ row.patterns.length }}<svg-icon :icon-class="row.expanded ? 'arrow-up' : 'arrow-down'" /></el-button>
                    <el-radio-group v-model="row.action" size="small" class="ob-action-group" @change="onRowActionChange(row)">
                      <el-radio-button label="allow">允许</el-radio-button>
                      <el-radio-button label="ask">每次确认</el-radio-button>
                      <el-radio-button label="deny">禁用</el-radio-button>
                    </el-radio-group>
                  </div>
                  <!-- 匹配细则展开区：pattern 级规则（如 bash 的 git status 放行） -->
                  <div v-if="row.expanded && row.patterns.length" class="ob-detail">
                    <div v-for="(pt, pi) in row.patterns" :key="pi" class="ob-detail-row">
                      <el-input v-model.trim="pt.pattern" size="small" placeholder="匹配模式，如 git status / *.log" @input="onPatternInput(row)" />
                      <el-select v-model="pt.action" size="small" @change="markDirty">
                        <el-option label="允许" value="allow" />
                        <el-option label="每次确认" value="ask" />
                        <el-option label="禁用" value="deny" />
                      </el-select>
                      <el-button size="small" link class="ob-row-del" @click="removePattern(row, pi)"><svg-icon icon-class="delete" /></el-button>
                    </div>
                    <el-button size="small" link class="ob-detail-add" @click="addPattern(row)"><svg-icon icon-class="plus" /> 添加细则</el-button>
                  </div>
                </div>
              </div>
            </section>

            <!-- 特殊面组：跨工具管控面（本页独有，能力清单不呈现） -->
            <section class="ob-perm-section">
              <div class="ob-perm-head">
                <span class="ob-perm-ico"><svg-icon icon-class="lock" /></span>
                <span class="ob-perm-title">特殊面</span>
                <span class="ob-perm-count">{{ specialRows.length }}</span>
                <span class="ob-perm-desc">跨工具管控面：路径规则 / 工作空间外目录 / 技能 / 全局兜底（连接器工具见上方「MCP 通配规则」分组）</span>
              </div>
              <div class="ob-perm-list">
                <div v-for="row in specialRows" :key="row.name" class="ob-perm-item">
                  <div class="ob-perm-row">
                    <span class="ob-row-ico"><svg-icon icon-class="lock" /></span>
                    <span class="ob-row-label" :title="row.label">{{ row.label }}</span>
                    <span class="ob-row-name" :title="row.name">{{ row.name }}</span>
                    <span class="ob-row-desc" :title="row.description">{{ row.description }}</span>
                    <el-button
                      v-if="row.patterns.length"
                      size="small"
                      link
                      class="ob-detail-toggle"
                      @click="toggleDetail(row)"
                    >细则 {{ row.patterns.length }}<svg-icon :icon-class="row.expanded ? 'arrow-up' : 'arrow-down'" /></el-button>
                    <el-radio-group v-model="row.action" size="small" class="ob-action-group" @change="onSpecialActionChange(row)">
                      <el-radio-button label="allow">允许</el-radio-button>
                      <el-radio-button label="ask">每次确认</el-radio-button>
                      <el-radio-button label="deny">禁用</el-radio-button>
                    </el-radio-group>
                  </div>
                  <div v-if="row.expanded && row.patterns.length" class="ob-detail">
                    <div v-for="(pt, pi) in row.patterns" :key="pi" class="ob-detail-row">
                      <el-input v-model.trim="pt.pattern" size="small" placeholder="匹配模式，如 *.env" @input="markDirty" />
                      <el-select v-model="pt.action" size="small" @change="markDirty">
                        <el-option label="允许" value="allow" />
                        <el-option label="每次确认" value="ask" />
                        <el-option label="禁用" value="deny" />
                      </el-select>
                      <el-button size="small" link class="ob-row-del" @click="removePattern(row, pi)"><svg-icon icon-class="delete" /></el-button>
                    </div>
                    <el-button size="small" link class="ob-detail-add" @click="addPattern(row)"><svg-icon icon-class="plus" /> 添加细则</el-button>
                  </div>
                </div>
              </div>
            </section>

            <!-- 自定义与追加规则组：目录外键（本页独有） -->
            <section class="ob-perm-section">
              <div class="ob-perm-head">
                <span class="ob-perm-ico"><svg-icon icon-class="edit-outline" /></span>
                <span class="ob-perm-title">自定义规则</span>
                <span class="ob-perm-count">{{ customRows.length }}</span>
                <span class="ob-perm-desc">未登记在能力目录的规则键（使用中经「始终允许」追加、历史残留或手工创建），按「对象 + 匹配模式 + 动作」逐条维护</span>
              </div>
              <div class="ob-perm-list custom-list">
                <div class="ob-custom-row ob-custom-row-head">
                  <span>对象（工具 / 路径面）</span>
                  <span>说明（必填）</span>
                  <span>匹配模式</span>
                  <span>动作</span>
                  <span></span>
                </div>
                <div v-for="(r, i) in customRows" :key="i" class="ob-custom-row">
                  <el-select
                    v-model="r.surface"
                    size="small"
                    filterable
                    allow-create
                    default-first-option
                    placeholder="选择或输入，如 mcp__服务名__*"
                    @change="onSurfaceChange(i)"
                  >
                    <el-option-group v-for="g in surfaceOptions" :key="g.label" :label="g.label">
                      <el-option v-for="o in g.items" :key="o.value" :label="o.label" :value="o.value" />
                    </el-option-group>
                  </el-select>
                  <el-input v-model.trim="r.desc" size="small" placeholder="一句话说明该规则用途" @input="markDirty" />
                  <el-input v-model.trim="r.pattern" size="small" placeholder="如 git status / *.env" @input="markDirty" />
                  <el-select v-model="r.action" size="small" @change="markDirty">
                    <el-option label="允许" value="allow" />
                    <el-option label="每次确认" value="ask" />
                    <el-option label="禁用" value="deny" />
                  </el-select>
                  <el-button size="small" link class="ob-row-del" @click="removeCustomRow(i)"><svg-icon icon-class="delete" /></el-button>
                </div>
                <el-button size="small" round class="ob-custom-add" @click="addCustomRow"><svg-icon icon-class="plus" /> 添加规则</el-button>
              </div>
            </section>
      </template>
    </div>

    <!-- 预装依赖弹窗（原能力清单承接）：运行时来源 + 依赖模块落位清单 -->
    <el-dialog
      :title="deps.software + ' 预装依赖'"
      v-model="deps.visible"
      width="560px"
      append-to-body
      class="ob-el-dialog"
    >
      <div class="ob-dialog-deps">
        <div class="ob-deps-meta">
          <span class="ob-meta-item">
            运行时来源：<b>{{ deps.sourceLabel }}</b>
          </span>
          <span class="ob-meta-item">
            已落位 <b>{{ deps.installed }}</b> / {{ deps.modules.length }}
          </span>
        </div>
        <div v-if="deps.source !== 'builtin'" class="ob-deps-tip">
          内置运行时未装配，以下依赖尚未落位（可执行 scripts/provision-runtime.sh install 装配）
        </div>

        <div v-for="g in deps.groups" :key="g.title" class="ob-deps-group">
          <div class="ob-deps-group-title">{{ g.title }}</div>
          <div class="ob-deps-rows">
            <div
              v-for="m in g.items"
              :key="m.name"
              class="ob-deps-row"
              :class="{ off: !m.installed }"
            >
              <span class="ob-row-name">{{ m.name }}</span>
              <span class="ob-row-ver">{{ m.installed ? m.version : '未落位' }}</span>
            </div>
          </div>
        </div>

        <!-- 服务暴露的工具集（如 playwright 的浏览器工具；随服务包落位，不参与依赖计数） -->
        <div v-if="deps.tools.length" class="ob-deps-group">
          <div class="ob-deps-group-title">浏览器工具（{{ deps.tools.length }} 项）</div>
          <div class="ob-deps-tools">
            <span v-for="name in deps.tools" :key="name" class="ob-tool-chip">{{ name }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <el-button size="small" round @click="deps.visible = false">关闭</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script>
// OmniBuddy 权限策略编辑页（分组视图，全宽单栏）：工具目录与权限管控合并
// 呈现——工具组 / 特殊面组（path / external_directory* / mcp / skill / 兜底）/
// 自定义规则组三段式；运行时状态（禁用态 / 预装依赖）随工具行呈现。
// 序列化约定：同一 surface 单条 * 规则 → 标量；多条（或非 * pattern）→ 对象
// authorizerChain 固定指向 OmniBuddy 确认卡片桥接，不在本页暴露；
// 恢复系统默认走「重置默认」（服务端 permissionReset 整份重写 defaultConfig）
// 分组元数据来自 categories.js（一处定义，主进程新增分组自动出现）
import { CAPABILITY_CATEGORIES } from '../capabilities/categories'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'

export default {
  name: 'OmniBuddyPermissions',
  components: { BuddySkeleton },
  data() {
    return {
      loading: false,
      loaded: false,
      saving: false,
      resetting: false,
      // 分组视图模型：工具组（同构）+ 特殊面组 + 自定义组
      viewGroups: [],
      specialRows: [],
      customRows: [],
      savedJson: '',
      // 目录索引（能力清单下发）：name → { key, label, description, perm }
      catalogIndex: {},
      // 特殊面索引：name → 元数据
      specialIndex: {},
      // 自定义行对象下拉选项（工具名 + 特殊面），支持 allow-create 手动输入
      surfaceOptions: [],
      // 预装依赖弹窗（原能力清单承接）：当前查看的运行时工具及其依赖分组
      deps: {
        visible: false,
        software: '',
        source: '',
        sourceLabel: '',
        installed: 0,
        modules: [],
        groups: [],
        tools: []
      }
    }
  },
  computed: {
    // 深层模型（action/patterns/customRows）为 reactive，computed 直接建立
    // 深层依赖，任何编辑自动重算；loaded 前恒非脏（loading 期禁点保存）
    isDirty() {
      return !!this.loaded && this.snapshotJson() !== this.savedJson
    },
    // 规则总数（展平口径：每工具默认动作 1 条 + 细则 + 自定义行）
    ruleCount() {
      const perm = this.serializePermission()
      let n = 0
      Object.keys(perm).forEach(surface => {
        const v = perm[surface]
        n += (v && typeof v === 'object') ? Object.keys(v).length : 1
      })
      return n
    },
    // 当前全局兜底动作的中文标签（继承兜底角标提示用）
    fallbackLabel() {
      const a = (this.specialRows.find(r => r.name === '*') || {}).action || 'ask'
      return { allow: '允许', ask: '每次确认', deny: '禁用' }[a] || '每次确认'
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
      if (!api || !api.permissionConfig) return
      this.loading = true
      try {
        // 先载能力清单（目录索引 + 自定义行下拉），再载配置展平归类
        await this.loadCatalog()
        const res = await api.permissionConfig()
        const config = (res && res.config) || {}
        this.applyFlat(this.flattenPermission(config.permission, (res && res.notes) || {}))
        this.loaded = true
      } finally {
        this.loading = false
      }
    },
    // 能力清单 → 目录索引 + 自定义行下拉选项 + 特殊面索引
    async loadCatalog() {
      const api = this.api()
      if (!api || !api.capabilityList) return
      try {
        const res = await api.capabilityList()
        if (!res || !res.ok) return
        const groups = res.groups || {}
        const special = res.specialSurfaces || []
        this.specialIndex = {}
        special.forEach(s => { this.specialIndex[s.name] = s })
        // 目录索引 + 分组骨架（asSurface === false 的组不进权限视图，如连接器）
        const metaOf = key => CAPABILITY_CATEGORIES.find(c => c.key === key) || null
        this.catalogIndex = {}
        this.viewGroups = []
        Object.keys(groups).forEach(k => {
          const meta = metaOf(k)
          if (meta && meta.asSurface === false) return
          const items = Array.isArray(groups[k]) ? groups[k] : []
          if (!items.length) return
          const group = {
            key: k,
            label: (meta && meta.label) || k,
            icon: (meta && meta.icon) || 'tool',
            desc: (meta && meta.desc) || '',
            items: []
          }
          items.forEach(t => {
            this.catalogIndex[t.name] = {
              key: k, label: t.label, description: t.description, perm: t.perm,
              // 运行时状态（原能力清单承接）：禁用态标识 + 预装依赖弹窗数据
              disabled: !!t.disabled,
              runtime: t.runtime || null,
              // 系统默认项（静态工具 / 内置连接器）= true；自建连接器动态条目 = false
              systemDefault: t.systemDefault !== false
            }
          })
          this.viewGroups.push(group)
        })
        // 特殊面组骨架
        this.specialRows = special.map(s => ({
          name: s.name, label: s.label, description: s.description,
          action: 'ask', patterns: [], expanded: false
        }))
        // 自定义行下拉：全部工具 + 特殊面（手输兜底保留）
        const map = t => ({ value: t.name, desc: t.label || t.description || '', label: t.name })
        const out = this.viewGroups.map(g => ({ label: g.label, items: (groups[g.key] || []).map(map) }))
        if (special.length) out.push({ label: '特殊面', items: special.map(map) })
        this.surfaceOptions = out
      } catch (e) { /* 目录不可用时保留手输能力 */ }
    },
    // permission 对象（标量/嵌套混合）展平为规则行（读取配置与预设共用）
    flattenPermission(perm, notes) {
      const rows = []
      const n = notes || {}
      Object.keys(perm || {}).forEach(surface => {
        const v = perm[surface]
        const desc = pattern => n[surface + '|' + pattern] || ''
        if (typeof v === 'string') {
          rows.push({ surface, pattern: '*', action: v, desc: desc('*') })
        } else if (v && typeof v === 'object') {
          Object.keys(v).forEach(pattern => {
            rows.push({ surface, pattern, action: v[pattern], desc: desc(pattern) })
          })
        }
      })
      return rows
    },
    // 展平规则行 → 分组视图模型（归类：目录命中 → 工具组；特殊面命中 → 特殊面组；
    // mcp__ 前缀目录外键 → MCP 组附加行；其余 → 自定义组）
    applyFlat(flatRows) {
      // 组行初始化：目录全部条目（无配置键的行回落目录 perm / 兜底，保持与
      // 能力清单条目一一对应——目录有 45 项工具，本页工具组即 45 行）
      const fallback = this.flatActionOf(flatRows, '*') || 'ask'
      this.viewGroups.forEach(g => {
        const items = []
        const names = Object.keys(this.catalogIndex).filter(n => this.catalogIndex[n].key === g.key)
        names.forEach(name => {
          const meta = this.catalogIndex[name]
          items.push({
            name,
            label: meta.label,
            description: meta.description,
            disabled: meta.disabled,
            runtime: meta.runtime,
            systemDefault: meta.systemDefault !== false,
            // 自建连接器初始无专属规则：动作与兜底等价时标记「继承兜底」，
            // 被显式配置命中或用户手动调整后取消（与序列化「等价兜底不落键」
            // 口径一致）
            inherited: meta.systemDefault === false && this.permDefault(meta.perm, fallback) === fallback,
            action: this.permDefault(meta.perm, fallback),
            patterns: [],
            expanded: false
          })
        })
        g.items = items
      })
      this.specialRows.forEach(r => { r.action = fallback; r.patterns = []; r.expanded = false })
      this.customRows = []
      const rowOf = name => {
        for (const g of this.viewGroups) {
          const hit = g.items.find(r => r.name === name)
          if (hit) return hit
        }
        return null
      }
      flatRows.forEach(f => {
        const special = this.specialIndex[f.surface]
        if (special) {
          const hit = this.specialRows.find(r => r.name === f.surface)
          if (!hit) return
          if (f.pattern === '*') hit.action = f.action
          else hit.patterns.push({ pattern: f.pattern, action: f.action, desc: f.desc })
          return
        }
        if (this.catalogIndex[f.surface]) {
          const hit = rowOf(f.surface)
          if (!hit) return
          // 配置中存在该面的显式规则 → 不再是继承兜底态
          hit.inherited = false
          if (f.pattern === '*') hit.action = f.action
          else hit.patterns.push({ pattern: f.pattern, action: f.action, desc: f.desc })
          return
        }
        // MCP 具体工具键（mcp__服务器__工具，目录只登记通配条目）→ MCP 组附加行
        if (f.surface.indexOf('mcp__') === 0) {
          const g = this.viewGroups.find(x => x.key === 'mcpBuiltin')
          if (g) {
            let row = g.items.find(r => r.name === f.surface)
            if (!row) {
              row = {
                name: f.surface,
                label: f.surface,
                description: '使用中追加的 MCP 工具规则（目录未逐工具登记）',
                action: 'ask',
                patterns: [],
                expanded: false,
                appended: true
              }
              g.items.push(row)
            }
            if (f.pattern === '*') row.action = f.action
            else row.patterns.push({ pattern: f.pattern, action: f.action, desc: f.desc })
            return
          }
        }
        // 其余目录外键 → 自定义组
        this.customRows.push({ surface: f.surface, desc: f.desc, pattern: f.pattern, action: f.action })
      })
      this.savedJson = this.snapshotJson()
    },
    // 展平行中 '*' 兜底面的动作（预设/配置缺项时的回落值）
    flatActionOf(flatRows, surface) {
      const hit = flatRows.find(r => r.surface === surface && r.pattern === '*')
      return hit ? hit.action : ''
    },
    // 目录 perm 字段（标量或 pattern 对象）→ 行默认动作
    permDefault(perm, fallback) {
      if (perm === undefined) return fallback
      if (typeof perm === 'string') return perm
      if (perm && typeof perm === 'object' && typeof perm['*'] === 'string') return perm['*']
      return fallback
    },
    // 分组视图模型 → permission 对象（同 surface 单 * 规则为标量，多行为对象）
    serializePermission() {
      const perm = {}
      const write = (name, action, patterns) => {
        const a = ['allow', 'ask', 'deny'].indexOf(action) >= 0 ? action : 'ask'
        const valid = (patterns || []).filter(p => p.pattern)
        if (!valid.length) {
          perm[name] = a
        } else {
          const obj = { '*': a }
          valid.forEach(p => { obj[p.pattern] = ['allow', 'ask', 'deny'].indexOf(p.action) >= 0 ? p.action : 'ask' })
          perm[name] = obj
        }
      }
      // 当前编辑态兜底动作（特殊面 '*' 行）：非系统默认条目动作与其等价时
      // 不落显式键（回落兜底即可），避免保存 / 重置后自建连接器 ask 键成为
      // 既看不见差异、又清不掉的冗余配置
      const fallbackAction = (this.specialRows.find(r => r.name === '*') || {}).action || 'ask'
      this.viewGroups.forEach(g => g.items.forEach(r => {
        const hasPatterns = (r.patterns || []).some(p => p.pattern)
        if (r.systemDefault === false && !hasPatterns && r.action === fallbackAction) return
        write(r.name, r.action, r.patterns)
      }))
      this.specialRows.forEach(r => write(r.name, r.action, r.patterns))
      // 自定义行：按 surface 聚合（单 '*' 标量 / 多条对象）
      const bySurface = {}
      this.customRows.forEach(r => {
        if (!r.surface) return
        if (!bySurface[r.surface]) bySurface[r.surface] = []
        bySurface[r.surface].push({ pattern: r.pattern || '*', action: r.action })
      })
      Object.keys(bySurface).forEach(surface => {
        const list = bySurface[surface]
        if (list.length === 1 && list[0].pattern === '*') {
          perm[surface] = list[0].action
        } else {
          const obj = {}
          list.forEach(it => { obj[it.pattern] = it.action })
          perm[surface] = obj
        }
      })
      return perm
    },
    // 规则说明 sidecar：细则行 + 自定义行（目录行说明由目录维护，不落盘）
    collectNotes() {
      const notes = {}
      const walk = r => (r.patterns || []).forEach(p => {
        if (p.pattern && p.desc) notes[r.name + '|' + p.pattern] = p.desc
      })
      this.viewGroups.forEach(g => g.items.forEach(walk))
      this.specialRows.forEach(walk)
      this.customRows.forEach(r => {
        if (r.surface && r.desc) notes[r.surface + '|' + (r.pattern || '*')] = r.desc
      })
      return notes
    },
    snapshotJson() {
      return JSON.stringify({ permission: this.serializePermission(), notes: this.collectNotes() })
    },
    async save() {
      const api = this.api()
      if (!api || !api.savePermissionConfig) return
      // 校验：自定义行空对象 / 空说明阻断；细则空 pattern 阻断（"" 键是无效规则）
      const emptySurface = this.customRows.findIndex(r => !r.surface)
      if (emptySurface >= 0) {
        this.$message.error('自定义规则第 ' + (emptySurface + 1) + ' 行未选择/输入对象，请补全或删除该行')
        return
      }
      const emptyDesc = this.customRows.findIndex(r => !r.desc)
      if (emptyDesc >= 0) {
        this.$message.error('自定义规则第 ' + (emptyDesc + 1) + ' 行缺少说明，请填写一句话用途描述')
        return
      }
      let badPattern = ''
      this.viewGroups.concat([{ items: this.specialRows }]).forEach(g =>
        g.items.forEach(r => (r.patterns || []).forEach(p => { if (!p.pattern && !badPattern) badPattern = r.name }))
      )
      if (badPattern) {
        this.$message.error('「' + badPattern + '」存在空匹配模式的细则，请补全或删除')
        return
      }
      this.saving = true
      try {
        const res = await api.savePermissionConfig({
          config: {
            yoloMode: false,
            authorizerChain: ['omnibuddy-ui'],
            permission: this.serializePermission()
          },
          notes: this.collectNotes()
        })
        if (res && res.ok) {
          this.savedJson = this.snapshotJson()
          this.$message.success('已保存，新对话生效')
        } else {
          this.$message.error((res && res.error) || '保存失败')
        }
      } finally {
        this.saving = false
      }
    },
    // 重置为系统默认策略：清空全部自建规则与说明，二次确认防误触
    async resetDefault() {
      const api = this.api()
      if (!api || !api.permissionReset) return
      let confirmed = false
      try {
        await this.$confirm(
          '将清空全部自定义规则与说明，恢复为系统默认策略。此操作不可撤销，确定继续？',
          '重置权限策略',
          { confirmButtonText: '重置', cancelButtonText: '取消', type: 'warning' }
        )
        confirmed = true
      } catch (e) { /* 取消 */ }
      if (!confirmed) return
      this.resetting = true
      try {
        const res = await api.permissionReset()
        if (res && res.ok) {
          await this.load()
          this.$message.success('已恢复默认策略')
        } else {
          this.$message.error((res && res.error) || '重置失败')
        }
      } finally {
        this.resetting = false
      }
    },
    // ===== 行内编辑动作 =====
    toggleDetail(row) {
      row.expanded = !row.expanded
    },
    // 已落位依赖数（依赖按钮「n / m」，原能力清单承接）
    installedCount(rt) {
      return (rt.modules || []).filter(m => m.installed).length
    },
    // 打开预装依赖弹窗：按 group 归并模块清单（原能力清单承接）
    openDeps(row) {
      const rt = row.runtime
      const groups = []
      ;(rt.modules || []).forEach(m => {
        let g = groups.find(x => x.title === m.group)
        if (!g) {
          g = { title: m.group, items: [] }
          groups.push(g)
        }
        g.items.push(m)
      })
      this.deps = {
        visible: true,
        software: rt.software,
        source: rt.source,
        sourceLabel: rt.sourceLabel,
        installed: this.installedCount(rt),
        modules: rt.modules || [],
        groups,
        tools: rt.tools || []
      }
    },
    addPattern(row) {
      row.patterns.push({ pattern: '', action: 'ask', desc: '' })
      row.expanded = true
      // 添加细则即显式意图：立即脱离继承兜底态
      if (row.systemDefault === false) row.inherited = false
      this.markDirty()
    },
    removePattern(row, i) {
      row.patterns.splice(i, 1)
      this.refreshInherited(row)
      this.markDirty()
    },
    // 细则 pattern 输入：填入有效 pattern → 脱离继承态；全部清空 → 重算
    onPatternInput(row) {
      this.refreshInherited(row)
      this.markDirty()
    },
    // 工具行三态切换：自建连接器切回与全局兜底等价且无细则时恢复继承态
    onRowActionChange(row) {
      this.refreshInherited(row)
      this.markDirty()
    },
    // 特殊面动作变更：兜底 '*' 变化会改变所有自建连接器行的「等价」判定，
    // 需统一重算继承态（如兜底改 allow 后，ask 的连接器行即成为显式规则）
    onSpecialActionChange(row) {
      if (row.name === '*') {
        this.viewGroups.forEach(g => g.items.forEach(r => this.refreshInherited(r)))
      }
      this.markDirty()
    },
    // 重算自建连接器行的继承态：无有效细则且动作 == 兜底动作 → 继承
    refreshInherited(row) {
      if (!row || row.systemDefault !== false) return
      const fb = (this.specialRows.find(r => r.name === '*') || {}).action || 'ask'
      const hasPatterns = (row.patterns || []).some(p => p.pattern)
      row.inherited = !hasPatterns && row.action === fb
    },
    addCustomRow() {
      this.customRows.push({ surface: '', desc: '', pattern: '*', action: 'ask' })
      this.markDirty()
    },
    removeCustomRow(i) {
      this.customRows.splice(i, 1)
      this.markDirty()
    },
    // 自定义行对象选中：能力清单命中的自动带出说明（用户已写的不覆盖）
    onSurfaceChange(i) {
      const r = this.customRows[i]
      if (r && r.surface && !r.desc) {
        const hit = this.surfaceOptions.reduce((acc, g) => acc || g.items.find(o => o.value === r.surface), null)
        if (hit && hit.desc) r.desc = hit.desc
      }
      this.markDirty()
    },
    // dirty 检测依赖 Vue3 深层响应（serializePermission 访问全部 action /
    // patterns / customRows，任何编辑自动重算 isDirty / ruleCount），此处保留
    // 空钩子维持模板事件绑定，不做额外状态维护
    markDirty() {}
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* ===== 本页专属布局：hero 保留，主体全宽分组视图
   最外层边距沿用共享 .ob-manage-page（20px 24px） ===== */
.perm-page {
  // hero 与主体间距略收紧（共享 20px）
  .ob-hero {
    margin-bottom: 14px;
  }
}

.ob-hero-actions {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-shrink: 0;
}

/* 加载骨架占满主体区 */
.ob-sk-wrap {
  flex: 1;
  padding: 8px 4px;
}

/* 动作裁决说明：内容区顶部（随页面滚动），与首个分组保持间距 */
.ob-mode-note {
  flex-shrink: 0;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 14px;
  padding: 8px 10px;
  border-radius: 10px;
  background: $search-bg;
  font-size: 11px;
  line-height: 1.6;
  color: $text-secondary;

  i {
    font-size: 13px;
    color: var(--primary-color);
    flex-shrink: 0;
    margin-top: 2px;
  }

  p {
    margin: 0;

    b {
      color: $text-primary;
      font-weight: 600;
    }
  }
}

/* ============ 分组规则视图（无外层卡片，各组自带圆角列表；滚动由共享 .ob-page-body 承担） ============ */

/* ===== 分组（与能力清单 ob-cap-* 同构形态） ===== */
.ob-perm-section {
  margin-bottom: 18px;
}

.ob-perm-head {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 8px;

  .ob-perm-ico {
    align-self: center;
    display: flex;
    color: var(--primary-color);
    font-size: 14px;
  }

  .ob-perm-title {
    font-size: 14px;
    font-weight: 700;
    color: $text-primary;
  }

  .ob-perm-count {
    align-self: center;
    font-size: 10.5px;
    font-weight: 600;
    padding: 1px 7px;
    border-radius: 10px;
    background: rgba(var(--primary-color-rgb), 0.1);
    color: var(--primary-color);
  }

  .ob-perm-desc {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    color: $text-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.ob-perm-list {
  border: 1px solid $border-color;
  border-radius: 12px;
  background: $card-bg;
  overflow: hidden;
}

.ob-perm-item {
  & + & {
    border-top: 1px solid var(--border-light, rgba(0, 0, 0, 0.05));
  }
}

/* 工具行：图标 + 名称 + 标识 + 描述 + 细则开关 + 三态动作 */
.ob-perm-row {
  display: flex;
  align-items: center;
  gap: 10px;
  min-height: 42px;
  padding: 6px 14px;
  transition: background 0.12s ease;

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.035);
  }

  &.off .ob-row-ico,
  &.off .ob-row-label,
  &.off .ob-row-name,
  &.off .ob-row-desc {
    opacity: 0.55;
  }

  /* 继承兜底态（自建连接器无专属规则）：仅文字轻弱化，控件照常可操作；
     比 disabled 态（0.55）更轻，避免被误判为不可用 */
  &.inherited .ob-row-label,
  &.inherited .ob-row-name,
  &.inherited .ob-row-desc {
    opacity: 0.72;
  }
}

.ob-row-ico {
  flex-shrink: 0;
  display: flex;
  font-size: 14px;
  color: var(--primary-color);
}

.ob-row-label {
  flex-shrink: 0;
  max-width: 130px;
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-row-name {
  flex-shrink: 0;
  max-width: 150px;
  font-size: 11px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-row-desc {
  flex: 1;
  min-width: 0;
  font-size: 11.5px;
  color: $text-secondary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-appended-tag {
  flex-shrink: 0;
}

.ob-disabled-tag {
  flex-shrink: 0;
}

/* 继承兜底角标：虚边灰调，区别于「追加」的警示橙 */
.ob-inherited-tag {
  flex-shrink: 0;
  --el-tag-border-color: var(--border-color);
  opacity: 0.85;
}

/* 「预装依赖」按钮（原能力清单承接）：行尾、细则开关左侧，不被压缩 */
.ob-deps-btn {
  flex-shrink: 0;
  padding: 3px 9px;
  font-size: 10.5px;
  line-height: 1.5;
  color: var(--primary-color);
  border-color: rgba(var(--primary-color-rgb), 0.35);
  background: rgba(var(--primary-color-rgb), 0.06);
}

.ob-detail-toggle {
  flex-shrink: 0;
  color: var(--primary-color);
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 0;
}

/* 三态动作组：行尾固定，不被压缩 */
.ob-action-group {
  flex-shrink: 0;

  ::v-deep(.el-radio-button__inner) {
    padding: 5px 10px;
    font-size: 11px;
  }
}

/* ===== 细则展开区：pattern 级子规则 ===== */
.ob-detail {
  padding: 6px 14px 10px 38px;
  background: rgba(0, 0, 0, 0.02);
  border-top: 1px dashed var(--border-light, rgba(0, 0, 0, 0.06));
}

.ob-detail-row {
  display: grid;
  grid-template-columns: minmax(160px, 1.4fr) 112px 32px;
  gap: 8px;
  align-items: center;
  padding: 3px 0;
}

.ob-detail-add {
  margin-top: 4px;
  color: var(--primary-color);
}

/* ===== 自定义规则组：平铺行（对象 + 说明 + 模式 + 动作） ===== */
.custom-list {
  padding: 4px 14px 10px;
}

.ob-custom-row {
  display: grid;
  grid-template-columns: minmax(150px, 1.1fr) minmax(150px, 1.1fr) minmax(110px, 1fr) 112px 32px;
  gap: 8px;
  align-items: center;
  padding: 4px 0;

  &.ob-custom-row-head {
    padding: 6px 0 3px;
    font-size: 11px;
    font-weight: 600;
    color: $text-secondary;
  }
}

.ob-custom-add {
  margin-top: 6px;
  color: var(--primary-color);
}

.ob-row-del {
  color: $text-secondary;
  padding: 4px 0;

  &:hover {
    color: #d93025;
  }
}

/* ===== 预装依赖弹窗（原能力清单承接） ===== */
.ob-dialog-deps {
  max-height: 58vh;
  overflow-y: auto;
}

.ob-deps-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 18px;
  font-size: 12px;
  color: $text-secondary;

  .ob-meta-item b {
    color: $text-primary;
    font-weight: 700;
  }
}

.ob-deps-tip {
  margin-top: 10px;
  padding: 8px 10px;
  border-radius: $radius-sm;
  background: rgba(230, 162, 60, 0.1);
  font-size: 11.5px;
  line-height: 1.6;
  color: #a06a1b;
}

.ob-deps-group {
  margin-top: 14px;

  .ob-deps-group-title {
    margin-bottom: 7px;
    font-size: 11.5px;
    font-weight: 700;
    color: $text-primary;
  }
}

/* 依赖行：两列网格，名称左 / 版本右 */
.ob-deps-rows {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px 12px;
}

.ob-deps-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 5px 9px;
  border-radius: $radius-sm;
  background: rgba(0, 0, 0, 0.025);

  .ob-row-name {
    min-width: 0;
    max-width: none;
    font-size: 12px;
    color: $text-primary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ob-row-ver {
    flex-shrink: 0;
    font-size: 11px;
    color: #2e8b63;
  }

  &.off {
    .ob-row-name {
      color: $text-secondary;
    }

    .ob-row-ver {
      color: $text-secondary;
      opacity: 0.7;
    }
  }
}

/* 工具集（playwright 浏览器工具）：紧凑标签流 */
.ob-deps-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;

  .ob-tool-chip {
    padding: 3px 8px;
    border-radius: 10px;
    font-size: 11px;
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.07);
  }
}
</style>
