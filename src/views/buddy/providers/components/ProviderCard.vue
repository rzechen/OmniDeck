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
          <span class="ob-item-model">{{ provider.displayName || provider.model }}</span>
        </div>
      </div>
    </div>

    <div class="ob-card-url" :title="provider.baseUrl">{{ provider.baseUrl }}</div>

    <!-- 深度研究档位（P3）：将该模型映射为深度研究子代理的轻量/标准/强力档；
         同档位仅一个模型，选新顶旧 -->
    <div class="ob-card-tier" @click.stop>
      <span class="ob-tier-label">深度研究</span>
      <el-dropdown trigger="click" @command="c => $emit('set-tier', { id: provider.id, tier: c })">
        <span class="ob-tier-value" :class="{ set: !!provider.tier }">
          {{ tierLabel }}
          <svg-icon icon-class="arrow-down" class="ob-tier-arrow" />
        </span>
        <el-dropdown-menu slot="dropdown">
          <el-dropdown-item command="">
            <span class="ob-tier-opt">不参与</span>
          </el-dropdown-item>
          <el-dropdown-item command="small">
            <span class="ob-tier-opt"><i class="ob-tier-dot small"></i>轻量 · 适合简单检索与摘要</span>
          </el-dropdown-item>
          <el-dropdown-item command="medium">
            <span class="ob-tier-opt"><i class="ob-tier-dot medium"></i>标准 · 日常分析与写作</span>
          </el-dropdown-item>
          <el-dropdown-item command="big">
            <span class="ob-tier-opt"><i class="ob-tier-dot big"></i>强力 · 复杂推理与长文撰写</span>
          </el-dropdown-item>
        </el-dropdown-menu>
      </el-dropdown>
    </div>

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
// 供应商卡片：点击设默认（set-default 上抛 id）/ 档位（set-tier）/ 编辑 / 删除，均交父级处理
export default {
  name: 'ProviderCard',
  props: {
    // 单个供应商配置（含 isDefault 标记与深度研究档位 tier）
    provider: {
      type: Object,
      required: true
    }
  },
  computed: {
    tierLabel() {
      return { small: '轻量档', medium: '标准档', big: '强力档' }[this.provider.tier] || '未指定'
    }
  }
}
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

/* 深度研究档位行：标签 + 胶囊下拉（macOS 风） */
.ob-card-tier {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.ob-tier-label {
  flex-shrink: 0;
  font-size: 11px;
  color: $text-secondary;
}

.ob-tier-value {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 10px;
  border-radius: 999px;
  border: 1px solid $border-color;
  background: $search-bg;
  font-size: 11.5px;
  color: $text-secondary;
  cursor: pointer;
  user-select: none;
  transition: all 0.12s ease;
  outline: none;

  &:hover {
    color: $text-primary;
    border-color: rgba(var(--primary-color-rgb), 0.45);
  }

  /* 已配置档位：主题色胶囊 */
  &.set {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.08);
    border-color: rgba(var(--primary-color-rgb), 0.35);
  }

  .ob-tier-arrow {
    font-size: 9px;
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

<style lang="scss">
/* 档位下拉菜单（popper 挂 body，需全局样式） */
.el-dropdown-menu .ob-tier-opt {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 12.5px;
}

.ob-tier-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;

  &.small { background: #0EA5E9; }
  &.medium { background: #8B5CF6; }
  &.big { background: #F59E0B; }
}
</style>
