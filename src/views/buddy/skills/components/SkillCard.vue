<template>
  <div class="ob-grid-card ob-skill-card" @click="emit('detail', skill)">
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
      <!-- 技能包折叠开关：与凭据按钮同行；点击展开下方成员区 -->
      <span
        v-if="skill.packageMembers && skill.packageMembers.length"
        class="ob-card-keybtn pkg"
        @click.stop="pkgExpanded = !pkgExpanded"
      >
        <svg-icon icon-class="skill" />
        技能包 {{ skill.packageMembers.length }}
        <svg-icon :icon-class="pkgExpanded ? 'arrow-up' : 'arrow-down'" class="ob-pkg-toggle" />
      </span>
    </div>

    <!-- 包成员展开区（默认收起，开关在上方凭据行内） -->
    <div v-if="pkgExpanded && skill.packageMembers && skill.packageMembers.length" class="ob-card-package">
      <div class="ob-pkg-members">
        <span
          v-for="m in skill.packageMembers"
          :key="m"
          class="ob-pkg-chip"
          @click.stop="emit('open-member', m)"
        >{{ m }}</span>
      </div>
      <div class="ob-pkg-tip">随包一并安装（覆盖导入整包 zip 可全部更新）</div>
    </div>

    <div class="ob-card-foot">
      <div class="ob-foot-info" />
      <div class="ob-card-actions" @click.stop>
        <span class="ob-item-action" title="导出 ZIP" @click="emit('export', skill)">
          <svg-icon icon-class="download" />
        </span>
        <span class="ob-item-action" title="编辑" @click="emit('edit', skill)">
          <svg-icon icon-class="edit" />
        </span>
        <span class="ob-item-action danger" title="删除" @click="emit('remove', skill)">
          <svg-icon icon-class="delete" />
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
// 技能卡片：名称/描述 + 声明的所需环境变量（env-keys，键名级录入状态）
// 所有操作事件上抛父级，卡片自身不持有业务状态
import { ref, computed } from 'vue'

defineOptions({ name: 'SkillCard' })

const props = defineProps({
  skill: { type: Object, required: true },
  // 已录入的环境变量键名列表（该技能绑定的全部凭据聚合，脱敏视图）
  envKeys: { type: Array, default: () => [] }
})

const emit = defineEmits(['detail', 'open-member', 'export', 'edit', 'remove'])

// 包成员折叠区展开状态（默认收起）
const pkgExpanded = ref(false)

// 技能声明的所需变量名（SKILL.md env-keys）
const declaredKeys = computed(() => {
  return props.skill.envKeys || []
})

// 已录入的变量名（绑定本技能的凭据 envKeys）
const providedKeys = computed(() => {
  return props.envKeys || []
})

const missingCount = computed(() => {
  return declaredKeys.value.filter(k => !providedKeys.value.includes(k)).length
})

const allProvided = computed(() => {
  return declaredKeys.value.length > 0 && missingCount.value === 0
})
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

/* 技能包折叠区：展开后的成员 chips 容器（开关在上方凭据行内，默认收起） */
.ob-card-package {
  margin: -4px 0 12px;
  padding: 9px 10px;
  border-radius: 9px;
  background: rgba(var(--primary-color-rgb), 0.05);
  border: 1px dashed rgba(var(--primary-color-rgb), 0.35);
}

.ob-pkg-members {
  margin-top: 7px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.ob-pkg-chip {
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  color: var(--primary-color);
  background: rgba(var(--primary-color-rgb), 0.1);
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.2);
  }
}

.ob-pkg-tip {
  margin-top: 7px;
  font-size: 10.5px;
  color: $text-secondary;
}
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

  /* 技能包开关：主色（与凭据按钮同行，点击展开/收起成员区） */
  &.pkg {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.08);
    border: 1px solid rgba(var(--primary-color-rgb), 0.3);

    &:hover {
      background: rgba(var(--primary-color-rgb), 0.15);
    }

    .ob-pkg-toggle {
      font-size: 11px;
      opacity: 0.75;
    }
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
