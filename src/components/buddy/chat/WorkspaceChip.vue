<template>
  <!-- 关联磁盘路径触发 chip：点击弹出关联弹窗（磁盘路径必填，未关联无法发送） -->
  <span
    class="ob-ws-chip"
    :class="{ linked: !!dir }"
    :title="dir || '关联本地磁盘路径（必填）'"
    @click="$emit('open')"
  >
    <svg-icon :icon-class="dir ? 'folder' : 'folder-add'" class="ob-ws-icon" />
    <span class="ob-ws-text">{{ dir ? label : '关联磁盘路径' }}</span>
  </span>
</template>

<script>
// OmniBuddy 输入栏「关联本地磁盘路径」触发 chip
// 已关联：展示名（未填则按本地磁盘路径呈现）；未关联：警示占位（必填项）
export default {
  name: 'WorkspaceChip',
  props: {
    // 关联的本地磁盘路径（空表示未关联）
    dir: {
      type: String,
      default: ''
    },
    // 展示名（选填，空则按路径呈现）
    name: {
      type: String,
      default: ''
    }
  },
  computed: {
    label() {
      return this.name || this.dir
    }
  }
}
</script>

<style lang="scss" scoped>
/* 与 ComposerPicker 的 ob-inline-chip 同规格的幽灵 chip */
.ob-ws-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 26px;
  padding: 0 9px;
  border-radius: 8px;
  background: transparent;
  color: var(--text-primary);
  font-size: 11.5px;
  cursor: pointer;
  user-select: none;
  max-width: 240px;
  transition: background 0.15s ease;

  .ob-ws-icon {
    font-size: 13px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  .ob-ws-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  &:hover {
    background: var(--search-bg);
  }

  /* 未关联：警示占位（必填项，否则无法发送） */
  &.unlinked-placeholder {
    color: #E6A23C;
  }

  &:not(.linked) {
    .ob-ws-text,
    .ob-ws-icon {
      color: #E6A23C;
    }

    &:hover {
      background: rgba(230, 162, 60, 0.1);
    }
  }
}
</style>
