<template>
  <!-- 关联本地磁盘路径弹窗：磁盘路径（必填）+ 展示名（非必填，缺省按路径呈现） -->
  <transition name="ob-modal">
    <div v-if="visible" class="ob-overlay" @click.self="$emit('close')">
      <div class="ob-dialog">
        <header class="ob-dialog-header">
          <h3 class="ob-dialog-title">关联本地磁盘路径</h3>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="$emit('close')" />
        </header>
        <div class="ob-dialog-body">
          <!-- 本地磁盘路径（必填） -->
          <div class="ob-field" :class="{ error: !!errors.dir }">
            <label class="ob-field-label">本地磁盘路径 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="form.dir"
              size="small"
              readonly
              placeholder="选择一个本地磁盘路径作为对话工作区"
              @click.native="pickDir"
            >
              <el-button slot="append" @click="pickDir">
                <svg-icon icon-class="folder" class="ob-btn-svg" />选择路径
              </el-button>
            </el-input>
            <p class="ob-field-error" :class="{ visible: !!errors.dir }">{{ errors.dir }}</p>
          </div>
          <!-- 展示名（非必填：不填则按本地磁盘路径呈现，用于任务列表分组） -->
          <div class="ob-field">
            <label class="ob-field-label">展示名 <span class="ob-field-optional">选填</span></label>
            <el-input
              v-model="form.name"
              size="small"
              clearable
              placeholder="不填则按本地磁盘路径呈现"
              maxlength="30"
              @keydown.enter.native="submit"
            />
            <p class="ob-field-hint">用于左侧任务列表分组展示</p>
          </div>
        </div>
        <footer class="ob-dialog-footer">
          <el-button size="small" round @click="$emit('close')">取消</el-button>
          <el-button size="small" round type="primary" @click="submit">确定</el-button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script>
// OmniBuddy 关联本地磁盘路径弹窗：路径必选（系统目录选择器），展示名选填
// 提交结果以事件上抛：{ dir, name, workspaceId }（workspaceId 由所选目录登记的工作空间返回）
export default {
  name: 'WorkspaceLinkDialog',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    // 初始表单（回显已关联的路径与展示名）
    initial: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      form: { dir: '', name: '' },
      // 选定路径登记的工作空间 id（发送消息时主进程按 id 解析目录）
      workspaceId: '',
      errors: { dir: '' }
    }
  },
  watch: {
    visible(v) {
      if (!v) return
      this.form = {
        dir: (this.initial && this.initial.dir) || '',
        name: (this.initial && this.initial.name) || ''
      }
      this.workspaceId = (this.initial && this.initial.workspaceId) || ''
      this.errors.dir = ''
    }
  },
  methods: {
    // 选择本地磁盘路径（系统目录选择器，同时登记为可选工作空间）
    async pickDir() {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (!api) {
        this.$message.info('选择路径需要 OmniDeck 桌面端')
        return
      }
      const res = await api.addWorkspace()
      if (res && res.ok && res.workspace) {
        this.form.dir = res.workspace.path
        this.workspaceId = res.workspace.id
        this.errors.dir = ''
      } else if (res && !res.canceled && res.error) {
        this.$message.error(res.error)
      }
    },
    // 校验通过后上抛（磁盘路径必填；展示名同步登记到工作空间，供任务分组与工作空间菜单复用）
    async submit() {
      if (!this.form.dir.trim()) {
        this.errors.dir = '请选择关联的本地磁盘路径'
        return
      }
      const name = this.form.name.trim()
      // 已有 workspaceId 或本次登记返回时同步展示名（空 = 清除，按路径呈现）
      if (this.workspaceId) {
        const api = window.electronAPI && window.electronAPI.omnibuddy
        if (api) await api.renameWorkspace({ id: this.workspaceId, name })
      }
      this.$emit('submit', {
        dir: this.form.dir.trim(),
        name,
        workspaceId: this.workspaceId
      })
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-overlay {
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

.ob-dialog {
  width: 440px;
  max-width: calc(100vw - 48px);
  border-radius: 16px;
  border: 1px solid var(--border-color);
  background: var(--card-bg, #fff);
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.28);
  overflow: hidden;
}

.ob-dialog-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px 0;

  .ob-dialog-title {
    font-size: 15px;
    font-weight: 700;
    color: $text-primary;
  }

  .ob-dialog-close {
    font-size: 15px;
    color: $text-secondary;
    cursor: pointer;
    padding: 4px;
    border-radius: 6px;
    transition: all 0.15s ease;

    &:hover {
      background: $search-bg;
      color: $text-primary;
    }
  }
}

.ob-dialog-body {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 13px;
}

.ob-field {
  display: flex;
  flex-direction: column;
  gap: 6px;

  .ob-field-label {
    font-size: 12px;
    font-weight: 600;
    color: $text-primary;
  }

  .ob-field-required {
    color: #F5222D;
  }

  .ob-field-optional {
    font-weight: 400;
    color: $text-secondary;
    font-size: 11px;
  }

  // 校验失败：输入框红框
  &.error ::v-deep .el-input__inner {
    border-color: #F5222D;

    &:focus {
      border-color: #F5222D;
    }
  }

  // 错误提示固定占位，避免出现/消失时挤压布局导致抖动
  .ob-field-error {
    height: 15px;
    font-size: 11px;
    line-height: 15px;
    color: #F5222D;
    visibility: hidden;

    &.visible {
      visibility: visible;
    }
  }

  .ob-field-hint {
    height: 15px;
    font-size: 11px;
    line-height: 15px;
    color: $text-secondary;
    margin: 0;
  }
}

/* 追加按钮内联图标对齐 */
.ob-btn-svg {
  margin-right: 4px;
  vertical-align: -0.125em;
}

.ob-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 0 18px 16px;
}

/* 弹窗过渡 */
.ob-modal-enter-active {
  transition: opacity 0.18s ease;

  .ob-dialog {
    transition: transform 0.24s cubic-bezier(0.34, 1.56, 0.64, 1);
  }
}

.ob-modal-leave-active {
  transition: opacity 0.14s ease;

  .ob-dialog {
    transition: transform 0.14s ease;
  }
}

.ob-modal-enter,
.ob-modal-leave-to {
  opacity: 0;

  .ob-dialog {
    transform: scale(0.95) translateY(8px);
  }
}
</style>
