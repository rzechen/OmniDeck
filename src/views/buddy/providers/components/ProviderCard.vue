<template>
  <!-- 点击卡片整体设为默认（操作区 @click.stop 阻断） -->
  <div
    class="ob-grid-card clickable"
    :class="{ default: provider.isDefault }"
    @click="emit('set-default', provider.id)"
  >
    <div class="ob-card-head">
      <span class="ob-item-logo" :class="'logo-' + provider.type">{{ provider.name.slice(0, 1).toUpperCase() }}</span>
      <div class="ob-card-title">
        <div class="ob-card-name" :title="provider.name">
          <span class="ob-name-text">{{ provider.name }}</span>
          <span v-if="provider.isDefault" class="ob-item-default-badge">默认</span>
          <span class="ob-item-format" :class="'fmt-' + (provider.apiFormat || 'openai')">
            {{ formatLabel }}
          </span>
        </div>
        <div class="ob-card-meta">
          <span class="ob-item-model">{{ provider.displayName || provider.model }}</span>
        </div>
      </div>
    </div>

    <div class="ob-card-url" :title="provider.baseUrl">{{ provider.baseUrl }}</div>

    <!-- 深度研究档位：仅标签展示结果，配置入口在新建/编辑表单 -->
    <div class="ob-card-tier" v-if="provider.tier">
      <span class="ob-tier-tag" :class="provider.tier">
        <i class="ob-tier-dot"></i>深度研究 · {{ tierLabel }}
      </span>
    </div>

    <div class="ob-card-foot">
      <div class="ob-foot-info">
        <span v-if="!provider.isDefault" class="ob-foot-hint">点击卡片设为默认</span>
      </div>
      <div class="ob-card-actions" @click.stop>
        <span v-if="!provider.isDefault" class="ob-item-action" title="设为默认" @click="emit('set-default', provider.id)">
          <svg-icon icon-class="check" />
        </span>
        <span class="ob-item-action" title="编辑" @click="emit('edit', provider)">
          <svg-icon icon-class="edit" />
        </span>
        <span class="ob-item-action danger" title="删除" @click="emit('remove', provider)">
          <svg-icon icon-class="delete" />
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 供应商卡片：点击设默认（set-default 上抛 id）/ 编辑 / 删除，均交父级处理
import { computed } from 'vue'

defineOptions({ name: 'ProviderCard' })

const props = defineProps({
  // 单个供应商配置（含 isDefault 标记与深度研究档位 tier）
  provider: {
    type: Object,
    required: true
  }
})

const emit = defineEmits(['set-default', 'edit', 'remove'])

// API 格式标签（三格式：OpenAI / Responses / Anthropic）
const formatLabel = computed(() => {
  return {
    openai: 'OpenAI',
    'openai-responses': 'Responses',
    anthropic: 'Anthropic'
  }[props.provider.apiFormat] || 'OpenAI'
})

const tierLabel = computed(() => {
  return { small: '轻量档', medium: '标准档', big: '强力档' }[props.provider.tier] || ''
})
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 卡片 URL 行（灰底等宽，替代原次行拼接） */
.ob-card-url {
  margin-bottom: 10px;
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

/* 深度研究档位：纯标签结果（配置在表单中） */
.ob-card-tier {
  margin-bottom: 12px;
}

.ob-tier-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;

  .ob-tier-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.85;
  }

  /* 三档各自的主题色调（与表单下拉选项一致） */
  &.small {
    color: #0369A1;
    background: rgba(14, 165, 233, 0.12);
  }

  &.medium {
    color: #6D28D9;
    background: rgba(139, 92, 246, 0.12);
  }

  &.big {
    color: #B45309;
    background: rgba(245, 158, 11, 0.14);
  }
}

/* 非默认卡片底部提示 */
.ob-foot-hint {
  color: $text-secondary;
  background: $search-bg;
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
