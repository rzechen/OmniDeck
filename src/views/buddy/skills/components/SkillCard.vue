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
    </div>

    <!-- 所需凭据变量：醒目标识（不平铺变量名），点击弹出面板查看清单与录入状态；
         值统一在「我的资料 → 我的凭据」录入并绑定本技能 -->
    <div class="ob-card-tags">
      <el-popover
        v-if="declaredKeys.length"
        placement="top"
        trigger="click"
        width="250"
        popper-class="ob-skill-keys-popper"
      >
        <!-- 变量清单面板：逐行展示键名 + 录入状态 -->
        <div class="ob-keys-panel">
          <div class="ob-keys-head">所需凭据变量（{{ declaredKeys.length }}）</div>
          <div
            v-for="k in declaredKeys"
            :key="k"
            class="ob-keys-row"
            :class="{ miss: !providedKeys.includes(k) }"
          >
            <span class="ob-keys-state">{{ providedKeys.includes(k) ? '✓' : '!' }}</span>
            <span class="ob-keys-name">{{ k }}</span>
            <span class="ob-keys-mark">{{ providedKeys.includes(k) ? '已录入' : '待录入' }}</span>
          </div>
          <div class="ob-keys-foot">在「我的资料 → 我的凭据」录入并绑定本技能</div>
        </div>
        <template #reference>
          <span class="ob-card-keybtn" :class="allProvided ? 'ok' : 'miss'" @click.stop>
            <svg-icon icon-class="key" />
            需 {{ declaredKeys.length }} 个凭据变量
            <em v-if="missingCount">{{ missingCount }} 项待录入</em>
            <em v-else>已录入</em>
          </span>
        </template>
      </el-popover>
      <span v-else class="ob-card-keybtn none">未声明所需变量</span>
    </div>

    <div class="ob-card-foot">
      <div class="ob-foot-info" />
      <div class="ob-card-actions" @click.stop>
        <span class="ob-item-action" title="导出 ZIP" @click="$emit('export', skill)">
          <svg-icon icon-class="download" />
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
// 技能卡片：名称/描述 + 声明的所需环境变量（env-keys，键名级录入状态）
// 所有操作事件上抛父级，卡片自身不持有业务状态
export default {
  name: 'SkillCard',
  props: {
    skill: { type: Object, required: true },
    // 已录入的环境变量键名列表（该技能绑定的全部凭据聚合，脱敏视图）
    envKeys: { type: Array, default: () => [] }
  },
  computed: {
    // 技能声明的所需变量名（SKILL.md env-keys）
    declaredKeys() {
      return this.skill.envKeys || []
    },
    // 已录入的变量名（绑定本技能的凭据 envKeys）
    providedKeys() {
      return this.envKeys || []
    },
    missingCount() {
      return this.declaredKeys.filter(k => !this.providedKeys.includes(k)).length
    },
    allProvided() {
      return this.declaredKeys.length > 0 && this.missingCount === 0
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 名称完整呈现（覆盖共享样式的单行截断，允许换行） */
.ob-card-name,
.ob-card-name .ob-name-text {
  white-space: normal;
  word-break: break-word;
  overflow: visible;
  text-overflow: unset;
  display: block;
}

/* 描述多行展示（3 行截断，锁定最小高度保持卡片规整） */
.ob-card-meta {
  white-space: normal;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  line-height: 1.5;
  min-height: 50px;
}

/* 凭据变量标识行：单个醒目按钮（key 图标 + 数量 + 状态），点击弹面板 */
.ob-card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 12px;
  min-height: 24px;
  align-items: center;
}

.ob-card-keybtn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 11px;
  font-weight: 600;
  line-height: 1.7;
  padding: 0 10px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 12px;
  }

  /* 后缀状态（N 项待录入 / 已录入） */
  em {
    font-style: normal;
    font-size: 10px;
    opacity: 0.85;
    padding-left: 5px;
    border-left: 1px solid currentColor;
  }

  /* 缺失：红色醒目（待处理信号最强） */
  &.miss {
    color: var(--danger-color);
    background: rgba(245, 108, 108, 0.1);
    border: 1px solid rgba(245, 108, 108, 0.35);

    &:hover {
      background: rgba(245, 108, 108, 0.16);
    }
  }

  /* 齐备：绿色 */
  &.ok {
    color: var(--success-color);
    background: rgba(var(--success-color-rgb),  0.1);
    border: 1px solid rgba(var(--success-color-rgb),  0.3);

    &:hover {
      background: rgba(var(--success-color-rgb),  0.16);
    }
  }

  /* 未声明：中性虚线弱化 */
  &.none {
    color: $text-secondary;
    background: transparent;
    border: 1px dashed var(--border-color, rgba(0, 0, 0, 0.15));
    cursor: default;
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
</style>

<style lang="scss">
/* 变量清单面板（el-popover 挂 body，需全局样式） */
.ob-skill-keys-popper {
  .ob-keys-panel {
    font-size: 12px;
  }

  .ob-keys-head {
    font-weight: 700;
    padding-bottom: 8px;
    margin-bottom: 6px;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
  }

  .ob-keys-row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 0;
    color: rgba(0, 0, 0, 0.75);

    /* 缺失行：红色 */
    &.miss .ob-keys-state,
    &.miss .ob-keys-mark {
      color: var(--danger-color);
    }
  }

  .ob-keys-state {
    width: 14px;
    font-weight: 700;
    color: var(--success-color);
  }

  .ob-keys-name {
    flex: 1;
    min-width: 0;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 11.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .ob-keys-mark {
    font-size: 10.5px;
    color: var(--success-color);
    flex-shrink: 0;
  }

  .ob-keys-foot {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
    font-size: 10.5px;
    color: rgba(0, 0, 0, 0.45);
  }
}
</style>
