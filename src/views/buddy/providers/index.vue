<template>
  <div class="ob-manage-page">
    <!-- 顶部 Hero（市场页同款） -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">模型管理</h2>
          <span class="ob-hero-badge" v-if="list.length">{{ list.length }} 个模型</span>
        </div>
        <p class="ob-section-desc">配置 OmniBuddy 的模型接入，全部本地保存不上云</p>
      </div>
      <el-button
        size="small"
        round
        type="primary"
        class="ob-hero-btn"
        title="新建模型"
        @click="openCreate"
      ><svg-icon icon-class="plus" class="ob-btn-svg" /><span class="ob-btn-text">新建模型</span></el-button>
    </header>

    <!-- 内容区（hero 固定，仅此区域滚动） -->
    <div class="ob-page-body">
      <!-- 空状态 -->
      <div v-if="!list.length" class="ob-empty">
        <div class="ob-empty-icon">
          <svg-icon icon-class="llm" />
        </div>
        <div class="ob-empty-title">暂无模型</div>
        <div class="ob-empty-desc">添加一个模型后，即可在对话中选择使用</div>
        <el-button
          size="small"
          round
          type="primary"
          @click="openCreate"
        ><svg-icon icon-class="plus" class="ob-btn-svg" />新建模型</el-button>
      </div>

      <!-- 供应商卡片网格 -->
      <div v-else class="ob-cards-grid">
        <provider-card
          v-for="p in list"
          :key="p.id"
          :provider="p"
          @set-default="setDefault"
          @edit="openEdit"
          @remove="removeProvider"
        />
      </div>
    </div>

    <!-- 新建/编辑供应商弹窗 -->
    <provider-form-dialog
      :visible.sync="dialogVisible"
      :editing-id="editingId"
      :editing-provider="editingProvider"
      :list="list"
      @saved="applySaved"
    />
  </div>
</template>

<script>
// OmniBuddy 模型管理页：列表管理（新建/编辑/删除/设默认）
// 所有模型统一走 OpenAI / Anthropic 接口规范，保存前经真实请求测试连接
// 卡片与新建/编辑弹窗已拆分至 ./components/（ProviderCard / ProviderFormDialog）
import { getItem, setItem } from '@/utils/db'
import ProviderCard from './components/ProviderCard.vue'
import ProviderFormDialog from './components/ProviderFormDialog.vue'

export default {
  name: 'OmniBuddyProviders',
  components: { ProviderCard, ProviderFormDialog },
  data() {
    return {
      list: [],
      // 弹窗显隐与编辑对象（null 表示新建）
      dialogVisible: false,
      editingId: null,
      editingProvider: null
    }
  },
  created() {
    this.load()
  },
  methods: {
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
    // 新建：清空编辑状态后打开弹窗
    openCreate() {
      this.editingId = null
      this.editingProvider = null
      this.dialogVisible = true
    },
    // 编辑：暂存编辑对象后打开弹窗
    openEdit(p) {
      this.editingId = p.id
      this.editingProvider = p
      this.dialogVisible = true
    },
    // 弹窗保存回调：写入编辑项或追加新记录并持久化（tier 保存时同档位自动顶替旧配置）
    applySaved({ editingId, values, item }) {
      if (editingId) {
        const target = this.list.find(x => x.id === editingId)
        if (target) {
          target.name = values.name
          target.apiFormat = values.apiFormat
          target.baseUrl = values.baseUrl
          target.model = values.model
          target.displayName = values.displayName
          target.apiKey = values.apiKey
          this.$set(target, 'tier', values.tier || '')
          this.$set(target, 'modelSeries', values.modelSeries || 'default')
          this.$set(target, 'contextWindowInput', values.contextWindowInput != null ? values.contextWindowInput : null)
          this.$set(target, 'contextWindowOutput', values.contextWindowOutput != null ? values.contextWindowOutput : null)
          this.$set(target, 'toolTurns', values.toolTurns || 500)
          this.$set(target, 'imageInput', values.imageInput !== false)
          this.$set(target, 'thinkingMode', values.thinkingMode || 'follow')
        }
      } else if (item) {
        this.list.push(item)
      }
      // 同档位互斥：新配置顶掉其它供应商的同档位
      const source = editingId ? this.list.find(x => x.id === editingId) : item
      if (source && source.tier) {
        this.list.forEach(p => {
          if (p.id !== source.id && p.tier === source.tier) this.$set(p, 'tier', '')
        })
      }
      this.persist()
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
      this.$confirm('确定删除模型「' + p.name + '」吗？', '删除模型', {
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
@import '@/styles/buddy-settings.scss';
</style>
