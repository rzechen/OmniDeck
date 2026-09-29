<template>
  <div class="ob-manage-page perm-page">
    <!-- 顶部 Hero（共享管理页头） -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">权限策略</h2>
          <span class="ob-hero-badge" v-if="loaded">规则 {{ rows.length }} 条</span>
        </div>
        <p class="ob-section-desc">
          Agent 执行敏感操作（执行命令 / 写文件 / 访问外部路径）前需经确认条批准；此处配置免批与禁用范围。快捷模式在对话输入框下方切换
        </p>
      </div>
      <div class="ob-hero-actions">
        <el-button size="small" round type="primary" :loading="saving" :disabled="!isDirty" @click="save">保存</el-button>
      </div>
    </header>

    <!-- 主体左右分栏：左侧预设与说明（固定窄栏）+ 右侧规则表（占满剩余，行区独立滚动） -->
    <div class="ob-page-body perm-body">
      <!-- 加载中：骨架屏占位（权限规则行列表形态） -->
      <div v-if="loading" class="ob-sk-wrap">
        <buddy-skeleton type="rows" :count="5" />
      </div>

      <template v-else>
        <aside class="perm-side">
          <div class="perm-side-label">预设策略</div>
          <div
            v-for="p in presets"
            :key="p.key"
            class="perm-preset"
            :class="{ active: activePreset === p.key }"
            @click="applyPreset(p)"
          >
            <span class="perm-preset-name">{{ p.name }}</span>
            <span class="perm-preset-desc">{{ p.desc }}</span>
          </div>
          <div class="perm-note">
            <i class="el-icon-info" />
            <p><b>允许 / 拒绝</b>的规则直接执行；<b>每次确认</b>的由对话输入框下方的权限模式裁决（弹卡询问 / 自动放行 / 只读拒绝）。</p>
          </div>
        </aside>

        <!-- 规则表 -->
        <div class="ob-rules-panel">
          <div class="ob-rules-head">
            <span>规则明细</span>
            <span class="ob-rules-tip">同一工具多条通配规则按「精确 &gt; 通配」匹配；保存后新对话生效</span>
            <el-button size="small" round icon="el-icon-plus" @click="addRow">添加规则</el-button>
          </div>

          <div class="ob-rules-table">
            <div class="ob-rules-row ob-rules-row-head">
              <span>对象（工具 / 路径面）</span>
              <span>匹配模式</span>
              <span>动作</span>
              <span></span>
            </div>
            <div v-for="(r, i) in rows" :key="i" class="ob-rules-row">
              <el-select
                v-model="r.surface"
                size="small"
                filterable
                allow-create
                default-first-option
                placeholder="选择工具或面"
                @change="markDirty"
              >
                <el-option-group v-for="g in surfaceOptions" :key="g.label" :label="g.label">
                  <el-option v-for="o in g.items" :key="o.value" :label="o.label" :value="o.value" />
                </el-option-group>
              </el-select>
              <el-input v-model.trim="r.pattern" size="small" placeholder="如 git status / *.env" @input="markDirty" />
              <el-select v-model="r.action" size="small" @change="markDirty">
                <el-option label="允许" value="allow" />
                <el-option label="每次确认" value="ask" />
                <el-option label="禁用" value="deny" />
              </el-select>
              <el-button size="small" type="text" class="ob-row-del" icon="el-icon-delete" @click="removeRow(i)" />
            </div>
            <div v-if="!rows.length" class="ob-rules-empty">暂无规则：所有操作均需确认（兜底规则）</div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
// OmniBuddy 权限策略编辑页：表单化编辑 pi-permission-system 的 config.json
// 序列化约定：同一 surface 单条 * 规则 → 标量；多条（或非 * pattern）→ 对象
// authorizerChain 固定指向 OmniBuddy 确认卡片桥接，不在本页暴露
// 「平衡」预设 = 主进程 defaultConfig（经 permission:config 下发快照，一处定义两处消费）
// 对象下拉的分组定义与能力中心共用 categories.js（一处定义，两处消费）
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
      rows: [],
      savedRowsJson: '',
      // 默认策略快照（主进程 defaultConfig().permission，「平衡」预设取用）
      defaultPermission: null,
      // 对象下拉选项（来自能力清单：工具名 + 特殊面），支持 allow-create 手动输入
      surfaceOptions: [],
      activePreset: 'balanced',
      presets: [
        {
          key: 'readonly',
          name: '只读',
          desc: '仅允许读取与问答，执行与写入全部禁用'
        },
        {
          key: 'strict',
          name: '严格',
          desc: '执行类逐次确认，写入与外部路径禁用'
        },
        {
          key: 'balanced',
          name: '平衡（推荐）',
          desc: '读取与 curl 请求放行，bash 执行与写入逐次确认，敏感文件禁用'
        },
        {
          key: 'relaxed',
          name: '宽松',
          desc: '常规操作放行，仅写入文件需确认'
        }
      ]
    }
  },
  computed: {
    isDirty() {
      return JSON.stringify(this.rows) !== this.savedRowsJson
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
        const res = await api.permissionConfig()
        const config = (res && res.config) || {}
        this.defaultPermission = (res && res.defaultPermission) || null
        this.applyConfig(config)
        this.loaded = true
      } finally {
        this.loading = false
      }
      await this.loadSurfaceOptions()
    },
    // 能力清单 → 对象下拉分组选项（工具名 + 特殊面；清单不可用时下拉仍可手输）
    // 分组动态全量遍历（与能力中心共用 categories.js 的分组定义）：
    // 主进程 capabilities.js 新增分组自动出现在两处，不再出现"能力清单有、下拉没有"的偏差
    async loadSurfaceOptions() {
      const api = this.api()
      if (!api || !api.capabilityList) return
      try {
        const res = await api.capabilityList()
        if (!res || !res.ok) return
        const groups = res.groups || {}
        const special = res.specialSurfaces || []
        const map = t => ({ value: t.name, label: t.name + ' · ' + t.label + (t.disabled ? '（已禁用）' : '') })
        // 分组标签取共享定义；未登记的新分组按 key 兜底
        // asSurface === false 的分组不直接作为操作面（如连接器走特殊面 mcp 的 pattern 匹配）
        const metaOf = key => CAPABILITY_CATEGORIES.find(c => c.key === key) || null
        const out = Object.keys(groups)
          .filter(k => Array.isArray(groups[k]) && groups[k].length)
          .filter(k => {
            const meta = metaOf(k)
            return !meta || meta.asSurface !== false
          })
          .map(k => {
            const meta = metaOf(k)
            return { label: (meta && meta.label) || k, items: groups[k].map(map) }
          })
        if (special.length) out.push({ label: '特殊面', items: special.map(map) })
        this.surfaceOptions = out
      } catch (e) { /* 忽略：保留手动输入能力 */ }
    },
    // permission 对象（标量/嵌套混合）展平为规则行（读取配置与默认快照共用）
    flattenPermission(perm) {
      const rows = []
      Object.keys(perm || {}).forEach(surface => {
        const v = perm[surface]
        if (typeof v === 'string') {
          rows.push({ surface, pattern: '*', action: v })
        } else if (v && typeof v === 'object') {
          Object.keys(v).forEach(pattern => {
            rows.push({ surface, pattern, action: v[pattern] })
          })
        }
      })
      return rows
    },
    // config.permission（标量/嵌套对象混合）展平为规则行
    applyConfig(config) {
      this.savedRowsJson = ''
      this.rows = this.flattenPermission(config.permission)
      this.savedRowsJson = JSON.stringify(this.rows)
      this.activePreset = ''
    },
    // 规则行 → config.permission（同 surface 单 * 规则为标量，多行为对象）
    buildPermission() {
      const perm = {}
      const bySurface = {}
      this.rows.forEach(r => {
        const surface = r.surface
        const pattern = r.pattern || '*'
        if (!bySurface[surface]) bySurface[surface] = []
        bySurface[surface].push({ pattern, action: r.action })
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
    async save() {
      const api = this.api()
      if (!api || !api.savePermissionConfig) return
      this.saving = true
      try {
        const res = await api.savePermissionConfig({
          yoloMode: false,
          authorizerChain: ['omnibuddy-ui'],
          permission: this.buildPermission()
        })
        if (res && res.ok) {
          this.savedRowsJson = JSON.stringify(this.rows)
          this.$message.success('已保存，新对话生效')
        } else {
          this.$message.error((res && res.error) || '保存失败')
        }
      } finally {
        this.saving = false
      }
    },
    applyPreset(p) {
      this.activePreset = p.key
      if (p.key === 'balanced') {
        // 与主进程 defaultConfig 共用同一份默认规则（permission:config 下发快照）；
        // 快照缺失（异常环境）时兜底为最小规则
        this.rows = this.flattenPermission(this.defaultPermission || { '*': 'ask' })
      } else if (p.key === 'readonly') {
        this.rows = [
          { surface: 'read', pattern: '*', action: 'allow' },
          { surface: 'ask_user', pattern: '*', action: 'allow' },
          { surface: 'todo_read', pattern: '*', action: 'allow' },
          { surface: '*', pattern: '*', action: 'deny' }
        ]
      } else if (p.key === 'strict') {
        this.rows = [
          { surface: 'read', pattern: '*', action: 'allow' },
          { surface: 'ask_user', pattern: '*', action: 'allow' },
          { surface: 'todo_write', pattern: '*', action: 'allow' },
          { surface: 'todo_read', pattern: '*', action: 'allow' },
          { surface: 'cd', pattern: '*', action: 'allow' },
          { surface: 'write', pattern: '*', action: 'deny' },
          { surface: 'edit', pattern: '*', action: 'deny' },
          { surface: 'mkdir', pattern: '*', action: 'deny' },
          { surface: 'external_directory', pattern: '*', action: 'deny' },
          { surface: 'external_directory_write', pattern: '*', action: 'deny' },
          { surface: 'external_directory_read', pattern: '*', action: 'deny' },
          { surface: 'path', pattern: '*.env', action: 'deny' },
          { surface: 'path', pattern: '*.env.*', action: 'deny' },
          { surface: '*', pattern: '*', action: 'ask' }
        ]
      } else if (p.key === 'relaxed') {
        this.rows = [
          { surface: 'read', pattern: '*', action: 'allow' },
          { surface: 'ask_user', pattern: '*', action: 'allow' },
          { surface: 'todo_write', pattern: '*', action: 'allow' },
          { surface: 'todo_read', pattern: '*', action: 'allow' },
          { surface: 'cd', pattern: '*', action: 'allow' },
          { surface: 'bash', pattern: 'git status', action: 'allow' },
          { surface: 'bash', pattern: 'git diff*', action: 'allow' },
          { surface: 'bash', pattern: 'ls*', action: 'allow' },
          { surface: 'write', pattern: '*', action: 'ask' },
          { surface: 'edit', pattern: '*', action: 'ask' },
          { surface: 'multi_edit', pattern: '*', action: 'ask' },
          { surface: 'append', pattern: '*', action: 'ask' },
          { surface: 'mkdir', pattern: '*', action: 'ask' },
          { surface: 'path', pattern: '*.env', action: 'deny' },
          { surface: 'path', pattern: '*.env.*', action: 'deny' },
          { surface: '*', pattern: '*', action: 'allow' }
        ]
      }
      // 不走 markDirty()：它会清空 activePreset 导致选中态丢失；
      // 此处 rows 整组替换，isDirty 依赖 this.rows 引用变化自然重算
    },
    addRow() {
      this.rows.push({ surface: '', pattern: '*', action: 'ask' })
      this.markDirty()
    },
    removeRow(i) {
      this.rows.splice(i, 1)
      this.markDirty()
    },
    markDirty() {
      this.activePreset = ''
      // 触发 computed 依赖收集（rows 为深层数组，浅改动不会触发 isDirty 重算）
      this.rows = this.rows.slice()
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* ===== 本页专属布局：hero 保留，主体左右分栏（覆盖管理页共享纵向堆叠） ===== */
.perm-page {
  padding: 14px 18px 16px;

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

/* 主体分栏：覆盖共享 .ob-page-body 的纵向 flex */
.perm-body {
  flex-direction: row;
  gap: 12px;
}

/* 加载骨架占满主体区 */
.ob-sk-wrap {
  flex: 1;
  padding: 8px 4px;
}

/* ===== 左侧窄栏：预设垂直列表 + 底部说明 ===== */
.perm-side {
  flex-shrink: 0;
  width: 212px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  padding: 2px 2px 2px 0;
}

.perm-side-label {
  font-size: 11px;
  font-weight: 600;
  color: $text-secondary;
  padding: 0 10px 2px;
}

.perm-preset {
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  padding: 8px 10px;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);
  }

  &.active {
    border-color: var(--primary-color);
    box-shadow: 0 0 0 1px var(--primary-color);
  }
}

.perm-preset-name {
  display: block;
  font-size: 12.5px;
  font-weight: 700;
  color: $text-primary;
}

.perm-preset-desc {
  display: block;
  margin-top: 2px;
  font-size: 11px;
  line-height: 1.5;
  color: $text-secondary;
}

/* 关系说明（精简）推到侧栏底部 */
.perm-note {
  margin-top: auto;
  display: flex;
  align-items: flex-start;
  gap: 6px;
  padding: 10px;
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

/* ============ 规则表（右侧占满剩余宽度，行区域独立滚动） ============ */
.ob-rules-panel {
  flex: 1;
  // flex 子元素默认 min-height:auto 拒绝收缩，须显式归零才能让内部行区滚动生效
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: $card-bg;
  border: 1px solid var(--border-color);
  border-radius: $radius-lg;
  overflow: hidden;
}

.ob-rules-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  font-size: 12.5px;
  font-weight: 600;
  color: $text-primary;
  border-bottom: 1px solid var(--border-color);
  background: $search-bg;

  .ob-rules-tip {
    flex: 1;
    font-size: 11px;
    font-weight: 400;
    color: $text-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.ob-rules-table {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 4px 14px 10px;
}

.ob-rules-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(150px, 1.5fr) 120px 32px;
  gap: 8px;
  align-items: center;
  padding: 4px 0;

  &.ob-rules-row-head {
    padding: 6px 0 3px;
    font-size: 11px;
    font-weight: 600;
    color: $text-secondary;
  }
}

.ob-row-del {
  color: $text-secondary;
  padding: 4px 0;

  &:hover {
    color: #d93025;
  }
}

.ob-rules-empty {
  padding: 14px 0 8px;
  text-align: center;
  font-size: 12px;
  color: $text-secondary;
  opacity: 0.75;
}
</style>
