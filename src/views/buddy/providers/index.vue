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
      <div class="ob-hero-actions">
        <el-button
          size="small"
          round
          type="primary"
          class="ob-hero-btn"
          title="新建文本生成模型（对话 / 定时任务执行用）"
          @click="openCreate('chat')"
        ><svg-icon icon-class="llm" class="ob-btn-svg" /><span class="ob-btn-text">新建文本生成模型</span></el-button>
        <el-button
          size="small"
          round
          class="ob-hero-btn"
          title="新建图像生成模型（generate_image 生图用，OpenAI 图像接口兼容端点）"
          @click="openCreate('image')"
        ><svg-icon icon-class="picture-outline" class="ob-btn-svg" /><span class="ob-btn-text">新建图像生成模型</span></el-button>
      </div>
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
          @click="openCreate('chat')"
        ><svg-icon icon-class="plus" class="ob-btn-svg" />新建文本生成模型</el-button>
      </div>

      <template v-else>
        <!-- 文本生成模型 -->
        <div v-if="chatProviders.length" class="ob-cards-group">
          <div class="ob-cards-group-title"><svg-icon icon-class="llm" />文本生成模型<span>对话与定时任务的执行模型</span></div>
          <div class="ob-cards-grid">
            <provider-card
              v-for="p in chatProviders"
              :key="p.id"
              :provider="p"
              @set-default="setDefault"
              @edit="openEdit"
              @remove="removeProvider"
            />
          </div>
        </div>

        <!-- 图像生成模型 -->
        <div v-if="imageProviders.length" class="ob-cards-group">
          <div class="ob-cards-group-title"><svg-icon icon-class="picture-outline" />图像生成模型<span>generate_image 生成图片（封面等），不参与对话</span></div>
          <div class="ob-cards-grid">
            <provider-card
              v-for="p in imageProviders"
              :key="p.id"
              :provider="p"
              @edit="openEdit"
              @remove="removeProvider"
            />
          </div>
        </div>
      </template>
    </div>

    <!-- 新建/编辑供应商弹窗 -->
    <provider-form-dialog
      v-model:visible="dialogVisible"
      :editing-id="editingId"
      :editing-provider="editingProvider"
      :list="list"
      :mode="createMode"
      @saved="applySaved"
    />
  </div>
</template>

<script>
// OmniBuddy 模型管理页：列表管理（新建/编辑/删除/设默认）
// 所有模型统一走 OpenAI / Anthropic 接口规范，保存前经真实请求测试连接
// 卡片与新建/编辑弹窗已拆分至 ./components/（ProviderCard / ProviderFormDialog）
import { getItem, setItem } from '@/utils/storage/db'
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
      editingProvider: null,
      // 新建模式（'chat' 文本 / 'image' 图像），传给表单弹窗
      createMode: 'chat'
    }
  },
  computed: {
    // 文本生成模型（对话 / 任务执行模型）
    chatProviders() {
      return this.list.filter(p => p.type !== 'image')
    },
    // 图像生成模型（generate_image 专用，不参与对话）
    imageProviders() {
      return this.list.filter(p => p.type === 'image')
    }
  },
  created() {
    this.load()
  },
  methods: {
    load() {
      const saved = getItem('aiProviderList', [])
      let list = Array.isArray(saved) ? saved : []
      // 兼容旧数据：Ollama 类型映射为自定义
      if (list.some(p => p.type === 'ollama')) {
        list = list.map(p => (p.type === 'ollama' ? { ...p, type: 'custom' } : p))
        setItem('aiProviderList', list)
      }
      this.list = list
    },
    persist() {
      setItem('aiProviderList', this.list)
      // 同步模型列表镜像到主进程：定时任务按 providerId 绑定执行模型（IndexedDB 主进程不可读）。
      // JSON 拷贝穿透响应式 Proxy（IPC 结构化克隆无法序列化 Proxy）
      const auto = (window.electronAPI && window.electronAPI.omnibuddy && window.electronAPI.omnibuddy.automation) || null
      if (auto && auto.syncProviders) {
        Promise.resolve(auto.syncProviders(JSON.parse(JSON.stringify(this.list)))).catch(() => {})
      }
    },
    // 新建：记录模式（文本 / 图像）后清空编辑状态打开弹窗
    openCreate(mode) {
      this.createMode = mode === 'image' ? 'image' : 'chat'
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
          target.tier = values.tier || ''
          target.modelSeries = values.modelSeries || 'default'
          target.contextWindowInput = values.contextWindowInput != null ? values.contextWindowInput : null
          target.contextWindowOutput = values.contextWindowOutput != null ? values.contextWindowOutput : null
          target.toolTurns = values.toolTurns || 500
          target.imageInput = values.imageInput !== false
          target.thinkingMode = values.thinkingMode || 'follow'
          // 采样参数（pi 1.0.2+ samplingParamsByThinkingLevel）：null 表示未配置（清除既有值）
          target.sampling = values.sampling || null
          target.type = values.type || 'custom'
        }
      } else if (item) {
        this.list.push(item)
      }
      // 同档位互斥：新配置顶掉其它供应商的同档位
      const source = editingId ? this.list.find(x => x.id === editingId) : item
      if (source && source.tier) {
        this.list.forEach(p => {
          if (p.id !== source.id && p.tier === source.tier) p.tier = ''
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

/* hero 双按钮区（文本 / 图像新建入口） */
.ob-hero-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

/* 分组容器 + 分组标题（文本生成模型 / 图像生成模型） */
.ob-cards-group {
  & + & {
    margin-top: 18px;
  }
}

.ob-cards-group-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 2px 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: $text-primary;

  .svg-icon {
    font-size: 14px;
    color: var(--primary-color);
  }

  span {
    margin-left: 4px;
    font-size: 11.5px;
    font-weight: 400;
    color: $text-secondary;
  }
}
</style>
