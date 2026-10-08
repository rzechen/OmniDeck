<template>
  <!-- 空间页文件预览 / 编辑弹窗（CodeMirror 高亮） -->
  <transition name="sp-modal">
    <div v-if="file.visible" class="sp-overlay" @click.self="$emit('close')">
      <div class="sp-dialog">
        <header class="sp-dialog-head">
          <div class="sp-dialog-title">
            <svg-icon :icon-class="icon" class="sp-dialog-svg" />
            <span>{{ file.name }}</span>
            <span class="sp-dialog-meta">{{ formatSize(file.size) }} · {{ formatTime(file.mtime) }}</span>
          </div>
          <div class="sp-dialog-acts">
            <el-button size="small" round @click="$emit('reveal')">
              <svg-icon icon-class="monitor" class="sp-btn-svg" />访达
            </el-button>
            <el-button size="small" round type="primary" :disabled="file.saving" @click="$emit('save')">
              <svg-icon v-if="file.saving" icon-class="loading" class="sp-btn-svg sp-btn-saving" />
              <svg-icon v-else icon-class="check" class="sp-btn-svg" />保存
            </el-button>
            <svg-icon icon-class="close" class="sp-dialog-close" @click="$emit('close')" />
          </div>
        </header>
        <div class="sp-dialog-body">
          <code-editor :model-value="file.content" :mode="mode" :fold="false" @update:model-value="$emit('update:content', $event)" />
        </div>
      </div>
    </div>
  </transition>
</template>

<script>
// 空间页文件预览 / 编辑弹窗
import CodeEditor from '@/components/tool/CodeEditor.vue'
import { fileIcon, modeOf, formatSize, formatTime } from '@/utils/ui/file-meta'

export default {
  name: 'SpaceFilePreview',
  components: { CodeEditor },
  props: {
    // 预览状态对象 { visible, name, content, size, mtime, saving }
    file: {
      type: Object,
      required: true
    }
  },
  computed: {
    icon() {
      return fileIcon(this.file.name)
    },
    mode() {
      return modeOf(this.file.name)
    }
  },
  methods: { formatSize, formatTime }
}
</script>

<style lang="scss" scoped>
.sp-overlay {
  position: fixed;
  inset: 0;
  z-index: 3100;
  background: rgba(0, 0, 0, 0.32);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  -webkit-app-region: no-drag;
}

.sp-dialog {
  width: 760px;
  max-width: calc(100vw - 48px);
  height: min(70vh, 620px);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--card-bg, #fff);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.sp-dialog-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border-color);
}

.sp-dialog-title {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);

  > span {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sp-dialog-svg {
    width: 16px;
    height: 16px;
    color: var(--primary-color);
    flex-shrink: 0;
  }

  .sp-dialog-meta {
    font-size: 11px;
    font-weight: 400;
    color: var(--text-secondary);
    flex-shrink: 0;
  }
}

.sp-dialog-acts {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;

  .el-button {
    margin: 0;
  }
}

.sp-btn-svg {
  margin-right: 4px;
  vertical-align: -0.125em;
}

.sp-btn-saving {
  animation: sp-btn-rotate 0.9s linear infinite;
}

@keyframes sp-btn-rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.sp-dialog-close {
  font-size: 16px;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  transition: all 0.15s ease;

  &:hover {
    background: var(--search-bg);
    color: var(--text-primary);
  }
}

.sp-dialog-body {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;

  :deep(.code-editor){
    flex: 1;
    min-width: 0;

    .CodeMirror {
      height: 100%;
      font-size: 12.5px;
    }
  }
}

/* 弹窗过渡 */
.sp-modal-enter-active {
  transition: opacity 0.18s ease;

  .sp-dialog {
    transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.sp-modal-leave-active {
  transition: opacity 0.14s ease;

  .sp-dialog {
    transition: transform 0.14s ease;
  }
}

.sp-modal-enter,
.sp-modal-leave-to {
  opacity: 0;

  .sp-dialog {
    transform: scale(0.96) translateY(8px);
  }
}
</style>
