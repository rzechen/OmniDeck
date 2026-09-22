<template>
  <div class="ob-grid-card ob-skill-card" @click="$emit('detail', skill)">
    <div class="ob-card-head">
      <div class="ob-card-logo logo-skill">
        <svg-icon icon-class="skill" />
      </div>
      <div class="ob-card-title">
        <div class="ob-card-name" :title="skill.name">
          <span class="ob-name-text">{{ skill.name }}</span>
        </div>
        <div class="ob-card-meta">{{ skill.description || '（无描述）' }}</div>
      </div>
      <!-- 凭据徽标：已配置（绿）-->
      <span v-if="cred" class="ob-card-badge ok">
        <svg-icon icon-class="key" />
        已配置凭据
      </span>
    </div>

    <!-- 环境变量键名（脱敏，仅键名） -->
    <div class="ob-card-tags" v-if="cred && envKeys.length">
      <span v-for="k in envKeys.slice(0, 3)" :key="k" class="ob-card-tag">{{ k }}</span>
      <span v-if="envKeys.length > 3" class="ob-card-tag more">
        +{{ envKeys.length - 3 }}
      </span>
    </div>
    <p v-else class="ob-card-desc">技能启用时凭据以环境变量方式注入</p>

    <div class="ob-card-foot">
      <div class="ob-foot-info"></div>
      <div class="ob-card-actions" @click.stop>
        <span class="ob-item-action" title="导出 ZIP" @click="$emit('export', skill)">
          <svg-icon icon-class="download" />
        </span>
        <span
          class="ob-item-action"
          :title="cred ? '编辑凭据' : '配置凭据'"
          @click="$emit('cred', skill)"
        >
          <svg-icon icon-class="key" />
        </span>
        <span class="ob-item-action" title="编辑" @click="$emit('edit', skill)">
          <svg-icon icon-class="edit" />
        </span>
        <span class="ob-item-action danger" title="删除" @click="$emit('remove', skill)">
          <svg-icon icon-class="delete" />
        </span>
      </div>
    </div>
  </div>
</template>

<script>
// 技能卡片：展示名称/描述 + 凭据状态徽标 + 环境变量键名（脱敏，仅键名）
// 所有操作事件上抛父级，卡片自身不持有业务状态
export default {
  name: 'SkillCard',
  props: {
    skill: { type: Object, required: true },
    // 该技能绑定的凭据（null 表示未配置）
    cred: { type: Object, default: null },
    // 凭据的环境变量键名列表（脱敏视图）
    envKeys: { type: Array, default: () => [] }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 卡片徽标（凭据状态） */
.ob-card-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.6;
  padding: 0 7px;
  border-radius: 5px;

  .svg-icon {
    font-size: 11px;
  }

  &.ok {
    color: #52C41A;
    background: rgba(82, 196, 26, 0.1);
    border: 1px solid rgba(82, 196, 26, 0.3);
  }
}

/* 环境变量键名标签（市场页 tag 风格） */
.ob-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
}

.ob-card-tag {
  font-size: 10.5px;
  padding: 1px 6px;
  border-radius: 4px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: $text-secondary;
  background: $search-bg;

  &.more {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.06);
  }
}

/* 卡片可点击查看详情（市场页同款交互） */
.ob-skill-card {
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.08);
  }
}

/* 无凭据时的占位描述对齐标签区高度 */
.ob-card-desc {
  margin-bottom: 12px;
  min-height: auto;
}
</style>
