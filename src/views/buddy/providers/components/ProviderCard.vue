<template>
  <!-- 点击卡片整体设为默认（操作区 @click.stop 阻断） -->
  <div
    class="ob-grid-card clickable"
    :class="{ default: provider.isDefault }"
    @click="$emit('set-default', provider.id)"
  >
    <div class="ob-card-head">
      <span class="ob-item-logo" :class="'logo-' + provider.type">{{ provider.name.slice(0, 1).toUpperCase() }}</span>
      <div class="ob-card-title">
        <div class="ob-card-name" :title="provider.name">
          <span class="ob-name-text">{{ provider.name }}</span>
          <span v-if="provider.isDefault" class="ob-item-default-badge">默认</span>
          <span class="ob-item-format" :class="'fmt-' + (provider.apiFormat || 'openai')">
            {{ provider.apiFormat === 'anthropic' ? 'Anthropic' : 'OpenAI' }}
          </span>
        </div>
        <div class="ob-card-meta">
          <svg-icon icon-class="llm" class="ob-item-model-svg" />
          <span class="ob-item-model">{{ provider.displayName || provider.model }}</span>
        </div>
      </div>
    </div>

    <div class="ob-card-url" :title="provider.baseUrl">{{ provider.baseUrl }}</div>

    <div class="ob-card-foot">
      <div class="ob-foot-info">
        <span v-if="!provider.isDefault" class="ob-foot-hint">点击卡片设为默认</span>
      </div>
      <div class="ob-card-actions" @click.stop>
        <span v-if="!provider.isDefault" class="ob-item-action" title="设为默认" @click="$emit('set-default', provider.id)">
          <svg-icon icon-class="check" />
        </span>
        <span class="ob-item-action" title="编辑" @click="$emit('edit', provider)">
          <svg-icon icon-class="edit" />
        </span>
        <span class="ob-item-action danger" title="删除" @click="$emit('remove', provider)">
          <svg-icon icon-class="delete" />
        </span>
      </div>
    </div>
  </div>
</template>

<script>
// 供应商卡片：点击设默认（set-default 上抛 id）/ 编辑 / 删除，均交父级处理
export default {
  name: 'ProviderCard',
  props: {
    // 单个供应商配置（含 isDefault 标记）
    provider: {
      type: Object,
      required: true
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 卡片 URL 行（灰底等宽，替代原次行拼接） */
.ob-card-url {
  margin-bottom: 12px;
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

/* 非默认卡片底部提示 */
.ob-foot-hint {
  color: $text-secondary;
  background: $search-bg;
  padding: 1px 6px;
  border-radius: 4px;
}
</style>
