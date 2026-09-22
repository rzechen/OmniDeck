<template>
  <div class="bc-composer">
    <!-- 输入容器：豆包风格大圆角气泡（拖入文件时高亮提示） -->
    <div
      class="bc-box"
      :class="{ focus: isFocus, drag: isDrag }"
      @dragover.prevent="onDragOver"
      @dragleave="onDragLeave"
      @drop.prevent="onDrop"
    >
      <!-- 待发送文件附件条（"+"选择/拖拽/粘贴导入：图片缩略图胶囊 + 文本/PDF 文件胶囊） -->
      <div v-if="files && files.length" class="bc-attachments">
        <div v-for="(f, i) in files" :key="f.id || i" class="bc-attachment" :class="{ file: f.kind !== 'image' }">
          <img v-if="f.kind === 'image' && f.thumb" class="bc-attachment-img" :src="f.thumb" alt="" draggable="false" />
          <template v-else>
            <svg-icon :icon-class="f.kind === 'pdf' ? 'doc' : 'document'" class="bc-file-ico" />
            <span class="bc-file-name" :title="f.name">{{ f.name }}</span>
          </template>
          <button class="bc-attachment-remove" title="移除" @click="$emit('remove-file', i)">
            <svg-icon icon-class="close" />
          </button>
        </div>
      </div>

      <!-- 多行输入：自动增高（粘贴文件转附件） -->
      <textarea
        ref="ta"
        class="bc-textarea"
        :value="value"
        :placeholder="placeholder"
        rows="1"
        @input="onInput"
        @focus="isFocus = true"
        @blur="isFocus = false"
        @keydown.enter.exact.prevent="onSend"
        @paste="onPaste"
      ></textarea>

      <!-- 底部工具栏：左扩展（工作空间/模型选择等经插槽注入） + 右发送 -->
      <div class="bc-toolbar">
        <div class="bc-tools">
          <slot name="tools"></slot>
          <button
            v-if="attachEnabled"
            class="bc-tool-btn"
            title="添加附件（图片 / 文本 / PDF，支持拖入）"
            @click="$emit('pick')"
          >
            <svg-icon icon-class="circle-plus-outline" />
          </button>
        </div>

        <!-- 发送 / 停止：同一位置，流式生成时切换为停止 -->
        <button
          v-if="!streaming"
          class="bc-send"
          :class="{ ready: canSend }"
          :title="canSend ? '发送（Enter）' : '输入内容后发送'"
          @click="onSend"
        >
          <svg-icon icon-class="top" />
        </button>
        <button
          v-else
          class="bc-send bc-stop"
          title="停止生成"
          @click="$emit('stop')"
        >
          <svg-icon icon-class="video-pause" />
        </button>
      </div>
    </div>
  </div>
</template>

<script>
// OmniBuddy 对话输入框：豆包风格（大圆角气泡 + 左工具 + 右下圆形发送）
export default {
  name: 'BuddyComposer',
  props: {
    value: {
      type: String,
      default: ''
    },
    placeholder: {
      type: String,
      default: '有什么可以帮您？（Enter 发送，Shift+Enter 换行）'
    },
    // 流式生成中：发送按钮切换为停止按钮
    streaming: {
      type: Boolean,
      default: false
    },
    // 附加可发送条件（如已有附件时无文本也允许发送）
    extraSendable: {
      type: Boolean,
      default: false
    },
    // 待发送文件附件（[{id,name,size,kind,thumb}]，P1-7）：图片缩略图 + 文本/PDF 文件胶囊
    files: {
      type: Array,
      default: null
    },
    // 是否展示"+"附件按钮（快捷面板等场景可关闭）
    attachEnabled: {
      type: Boolean,
      default: true
    }
  },
  data() {
    return {
      isFocus: false,
      isDrag: false
    }
  },
  computed: {
    canSend() {
      return !!this.value.trim() || this.extraSendable
    }
  },
  watch: {
    // 内容变化后自适应高度
    value() {
      this.$nextTick(this.autoResize)
    }
  },
  mounted() {
    this.autoResize()
  },
  methods: {
    onInput(e) {
      this.$emit('input', e.target.value)
    },
    // 粘贴含文件时转为附件（P1-7）：拦截默认行为，交主进程落盘
    onPaste(e) {
      const items = e.clipboardData && e.clipboardData.items
      if (!items) return
      let hasFile = false
      for (const it of items) {
        if (it.kind === 'file') hasFile = true
      }
      if (!hasFile) return // 纯文本粘贴走默认行为
      e.preventDefault()
      const buddy = window.electronAPI && window.electronAPI.omnibuddy
      // 非图片文件（文本/PDF）走附件管道
      if (buddy && buddy.importAttachment) {
        for (const it of items) {
          if (it.kind !== 'file' || it.type.startsWith('image/')) continue
          const f = it.getAsFile()
          if (!f) continue
          this.emitImportFile(f)
        }
      }
    },
    // ===== 拖拽导入（P1-7）：Electron 32+ File.path 已移除，须经 webUtils 取真实路径 =====
    onDragOver(e) {
      if (!e.dataTransfer || !Array.from(e.dataTransfer.types).includes('Files')) return
      this.isDrag = true
    },
    onDragLeave() {
      this.isDrag = false
    },
    onDrop(e) {
      this.isDrag = false
      const files = e.dataTransfer && e.dataTransfer.files
      if (!files || !files.length) return
      for (const f of files) this.emitImportFile(f)
    },
    // 取拖拽/粘贴文件的真实路径，交主进程导入（emit import-file）
    emitImportFile(f) {
      const api = window.electronAPI
      if (!api || !api.getPathForFile) {
        this.$message.info('附件导入需要 OmniDeck 桌面端')
        return
      }
      let p = ''
      try { p = api.getPathForFile(f) } catch (err) { p = '' }
      if (p) this.$emit('import-file', p)
    },
    onSend() {
      if (!this.canSend) return
      this.$emit('send', this.value)
    },
    // 高度自适应：清零后按 scrollHeight 恢复，封顶 220px
    autoResize() {
      const ta = this.$refs.ta
      if (!ta) return
      ta.style.height = 'auto'
      ta.style.height = Math.max(68, Math.min(ta.scrollHeight, 220)) + 'px'
    }
  }
}
</script>

<style lang="scss" scoped>
.bc-composer {
  width: 100%;
  max-width: 920px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
}

/* 输入容器：悬浮卡片式大圆角气泡 */
.bc-box {
  border-radius: 22px;
  border: 1px solid var(--border-color);
  background: var(--card-bg, #fff);
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.05);
  padding: 12px 12px 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;

  &.focus {
    border-color: rgba(var(--primary-color-rgb), 0.55);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.12), 0 4px 18px rgba(var(--primary-color-rgb), 0.1);
  }
}

/* 待发送附件条（内置于气泡顶部） */
.bc-attachments {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 2px 4px 4px;
}

.bc-attachment {
  position: relative;
  width: 86px;
  height: 54px;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  background: var(--border-color, #f0f0f2);

  /* 文件胶囊（文本/PDF）：图标 + 文件名，宽随内容 */
  &.file {
    width: auto;
    min-width: 86px;
    max-width: 220px;
    height: 40px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 22px 0 9px;
    background: var(--bg-secondary, rgba(0, 0, 0, 0.04));
  }
}

.bc-file-ico {
  flex-shrink: 0;
  font-size: 16px;
  color: var(--primary-color);
}

.bc-file-name {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 拖拽悬停高亮 */
.bc-box.drag {
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.18), 0 4px 18px rgba(var(--primary-color-rgb), 0.12);
}

.bc-attachment-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.bc-attachment-remove {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 16px;
  height: 16px;
  border: none;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  padding: 0;
  opacity: 0;
  transition: opacity 0.15s ease;

  .svg-icon {
    font-size: 10px;
  }
}

.bc-attachment:hover .bc-attachment-remove {
  opacity: 1;
}

.bc-textarea {
  width: 100%;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 13.5px;
  line-height: 1.6;
  color: var(--text-primary);
  font-family: inherit;
  min-height: 22px;
  max-height: 160px;
  overflow-y: auto;

  &::placeholder {
    color: var(--text-secondary);
  }

  &::-webkit-scrollbar {
    width: 4px;
  }
}

/* 底部工具栏 */
.bc-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.bc-tools {
  display: flex;
  align-items: center;
  gap: 2px;
}

.bc-tool-btn {
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;

  .svg-icon {
    font-size: 16px;
  }

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.08);
    color: var(--primary-color);
  }

  &:active {
    transform: scale(0.9);
  }
}

/* 发送按钮：圆形，激活渐变 */
.bc-send {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  border: none;
  background: var(--border-color, #e5e5e5);
  color: var(--text-secondary);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  transition: all 0.18s cubic-bezier(0.34, 1.56, 0.64, 1);

  .svg-icon {
    font-size: 15px;
  }

  &.ready {
    background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
    color: #fff;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(var(--primary-color-rgb), 0.35);

    &:hover {
      filter: brightness(1.08);
      transform: translateY(-1px);
    }

    &:active {
      transform: scale(0.88);
    }
  }
}

/* 停止按钮：与发送按钮同位切换，激活渐变外观 */
.bc-stop {
  background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
  color: #fff;
  cursor: pointer;
  box-shadow: 0 2px 10px rgba(var(--primary-color-rgb), 0.35);

  .svg-icon {
    font-size: 14px;
  }

  &:hover {
    filter: brightness(1.08);
  }

  &:active {
    transform: scale(0.88);
  }
}
</style>
