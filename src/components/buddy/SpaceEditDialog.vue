<template>
  <!-- 新建 / 编辑空间弹窗：名称 + 关联本地目录 + 描述 + 图标 -->
  <transition name="ob-modal">
    <div v-if="visible" class="ob-overlay" @click.self="$emit('close')">
      <div class="ob-dialog">
        <header class="ob-dialog-header">
          <h3 class="ob-dialog-title">{{ space ? (dirOnly ? '关联本地目录' : '编辑空间') : '新建空间' }}</h3>
          <svg-icon icon-class="close" class="ob-dialog-close" @click="$emit('close')" />
        </header>
        <div class="ob-dialog-body">
          <!-- 空间名称 -->
          <div class="ob-field" :class="{ error: !!errors.name }">
            <label class="ob-field-label">空间名称 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="form.name"
              size="small"
              clearable
              :disabled="dirOnly"
              placeholder="输入空间名称"
              maxlength="20"
              @keydown.enter.native="submit"
              @blur="validateField('name')"
              @input="clearFieldError('name')"
            />
            <p class="ob-field-error" :class="{ visible: !!errors.name }">{{ errors.name }}</p>
          </div>
          <!-- 关联本地目录（必填，发送对话时的工作空间） -->
          <div class="ob-field" :class="{ error: !!errors.dir }">
            <label class="ob-field-label">关联本地目录 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="form.dir"
              size="small"
              readonly
              placeholder="选择一个本地目录作为工作空间"
              @click.native="pickDir"
            >
              <el-button slot="append" @click="pickDir">
                <svg-icon icon-class="folder" class="ob-btn-svg" />选择目录
              </el-button>
            </el-input>
            <p class="ob-field-error" :class="{ visible: !!errors.dir }">{{ errors.dir }}</p>
          </div>
          <!-- 描述 -->
          <div class="ob-field" :class="{ error: !!errors.desc }">
            <label class="ob-field-label">描述 <span class="ob-field-required">*</span></label>
            <el-input
              v-model="form.desc"
              type="textarea"
              :rows="3"
              :disabled="dirOnly"
              placeholder="这个空间用来做什么？"
              maxlength="100"
              @blur="validateField('desc')"
              @input="clearFieldError('desc')"
            />
            <p class="ob-field-error" :class="{ visible: !!errors.desc }">{{ errors.desc }}</p>
          </div>
          <!-- 图标 -->
          <div class="ob-field">
            <label class="ob-field-label">图标</label>
            <div class="ob-icon-grid" :class="{ disabled: dirOnly }">
              <div
                v-for="ic in icons"
                :key="ic"
                class="ob-icon-item"
                :class="{ active: form.icon === ic }"
                @click="!dirOnly && (form.icon = ic)"
              >
                <svg-icon :icon-class="ic" class="ob-icon-svg" />
              </div>
            </div>
          </div>
        </div>
        <footer class="ob-dialog-footer">
          <el-button size="small" round @click="$emit('close')">取消</el-button>
          <el-button size="small" round type="primary" @click="submit">保存</el-button>
        </footer>
      </div>
    </div>
  </transition>
</template>

<script>
// OmniBuddy 新建/编辑空间弹窗（表单与校验自包含，提交结果以事件上抛）
export default {
  name: 'SpaceEditDialog',
  props: {
    visible: {
      type: Boolean,
      default: false
    },
    // 编辑目标空间（null 表示新建）
    space: {
      type: Object,
      default: null
    },
    // 全部空间列表（关联目录查重用）
    spaces: {
      type: Array,
      default: () => []
    },
    // 仅编辑关联目录（默认空间引导关联：名称/描述/图标不可编辑）
    dirOnly: {
      type: Boolean,
      default: false
    }
  },
  data() {
    return {
      // 空间可选图标（16 个代表性分类，来自 assets/space）
      icons: [
        'space-life', 'space-home', 'space-heart', 'space-food',
        'space-coffee', 'space-work', 'space-study', 'space-money',
        'space-plan', 'space-sport', 'space-fitness', 'space-ball',
        'space-trophy', 'space-travel', 'space-game', 'space-music'
      ],
      form: { name: '', dir: '', desc: '', icon: 'space-life' },
      // 必填字段失焦校验的错误提示
      errors: { name: '', dir: '', desc: '' }
    }
  },
  watch: {
    // 打开时按编辑目标重置表单
    visible(v) {
      if (!v) return
      const sp = this.space
      this.form = sp
        ? { name: sp.name, dir: sp.dir || '', desc: sp.desc || '', icon: sp.icon || 'space-life' }
        : { name: '', dir: '', desc: '', icon: 'space-life' }
      this.resetErrors()
    }
  },
  methods: {
    resetErrors() {
      this.errors.name = ''
      this.errors.dir = ''
      this.errors.desc = ''
    },
    validateField(field) {
      const val = (this.form[field] || '').trim()
      if (!val) {
        this.errors[field] = field === 'name' ? '请输入空间名称' : field === 'dir' ? '请选择关联的本地目录' : '请输入描述'
        return false
      }
      // 关联目录查重：同一目录只允许关联一个空间（编辑时排除自身）
      if (field === 'dir') {
        const dup = this.spaces.find(s => s.dir === val && (!this.space || s.id !== this.space.id))
        if (dup) {
          this.errors.dir = dup.system
            ? '该目录已关联系统默认空间，请选择其他目录'
            : '该目录已被空间「' + dup.name + '」关联，请选择其他目录'
          return false
        }
      }
      this.errors[field] = ''
      return true
    },
    // 重新输入时清除错误提示（失焦时再校验）
    clearFieldError(field) {
      if (this.errors[field]) this.errors[field] = ''
    },
    // 选择关联本地目录（复用工作空间目录选择，同时登记为可选工作空间）
    async pickDir() {
      const api = window.electronAPI && window.electronAPI.omnibuddy
      if (!api) {
        this.$message.info('选择目录需要 OmniDeck 桌面端')
        return
      }
      const res = await api.addWorkspace()
      if (res && res.ok && res.workspace) {
        this.form.dir = res.workspace.path
        // 选完即校验（目录查重即时反馈）
        this.validateField('dir')
      } else if (res && !res.canceled && res.error) {
        this.$message.error(res.error)
      }
    },
    // 校验通过后上抛表单（列表增改由父组件处理）
    submit() {
      // 仅目录模式（默认空间引导关联）：只校验目录
      if (this.dirOnly) {
        if (!this.validateField('dir')) return
        this.$emit('submit', { ...this.form })
        return
      }
      if (!this.validateField('name') || !this.validateField('dir') || !this.validateField('desc')) return
      this.$emit('submit', {
        name: this.form.name.trim(),
        dir: this.form.dir.trim(),
        desc: this.form.desc.trim(),
        icon: this.form.icon
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
  width: 460px;
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

  // 校验失败：输入框/文本域红框
  &.error ::v-deep .el-input__inner,
  &.error ::v-deep .el-textarea__inner {
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
}

/* 空间图标选择网格 */
.ob-icon-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
  max-height: 132px;
  overflow-y: auto;
  padding: 2px;

  &::-webkit-scrollbar {
    width: 4px;
  }

  // 仅目录模式：图标网格整体禁用
  &.disabled {
    opacity: 0.45;
    pointer-events: none;
  }
}

.ob-icon-item {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 9px;
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.13s ease;

  .ob-icon-svg {
    width: 15px;
    height: 15px;
    color: $text-secondary;
    transition: color 0.13s ease;
  }

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.45);

    .ob-icon-svg {
      color: var(--primary-color);
    }
  }

  &.active {
    border-color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.1);

    .ob-icon-svg {
      color: var(--primary-color);
    }
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
