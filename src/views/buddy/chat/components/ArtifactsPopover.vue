<template>
  <!-- 会话级产出聚合面板（阶段三交付物闭环）：
       遍历会话全部消息的 tool items 汇总 artifacts（数据已落盘，
       纯前端聚合），弹层列表：图标 + 文件名 + 类型·大小 + 打开/所在文件夹；
       点击条目送右栏预览（pdf/docx/html/md/图片站内看） -->
  <transition name="ob-out-slide">
    <div v-if="visible" class="ob-out-pop" @click.stop>
      <div class="ob-out-head">
        <span class="ob-out-title">本会话产出</span>
        <span class="ob-out-count">{{ artifacts.length }} 个文件</span>
        <span class="ob-out-close" title="收起" @click="emit('close')">
          <svg-icon icon-class="close" />
        </span>
      </div>
      <div class="ob-out-list">
        <div
          v-for="(a, i) in artifacts"
          :key="(a.path || '') + i"
          class="ob-out-item"
          title="点击在右侧面板预览"
          @click="previewArtifact(a)"
        >
          <img class="ob-out-ico" :src="fileIcon(a.name || a.path || '')" alt="" draggable="false" />
          <div class="ob-out-info">
            <div class="ob-out-name" :title="a.path">{{ a.name || a.path }}</div>
            <div class="ob-out-meta">{{ fmtLabel(a) + (a.sizeText || a.size ? ' · ' + (a.sizeText || fmtSize(a.size)) : '') }}</div>
          </div>
          <span class="ob-out-btn" title="用系统默认应用打开" @click.stop="openArtifact(a)">
            <svg-icon icon-class="view" />
          </span>
          <span class="ob-out-btn" title="在访达 / 资源管理器中显示" @click.stop="revealArtifact(a)">
            <svg-icon icon-class="folder" />
          </span>
        </div>
      </div>
    </div>
  </transition>
</template>

<script setup>
// 产出聚合弹层：与 ArtifactPanel 同构的条目操作，但数据源是会话全量消息
import { buddyApiSection } from '@/utils/buddy/buddy-api'
import { fileIcon } from '@/utils/ui/file-meta'
import { bus } from '@/utils/ui/bus'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'ArtifactsPopover' })

const props = defineProps({
  // 会话全量产物（父层 computed 聚合：messages → items.artifacts 扁平化）
  artifacts: {
    type: Array,
    default: () => []
  },
  visible: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['close'])

const { message } = useFeedback()

// 点击条目：经全局总线送右侧预览面板（与产物卡片同通道）
function previewArtifact(a) {
  emit('close')
  bus.emit('chat:artifact-preview', {
    path: a.path || '',
    name: a.name || a.path || '',
    format: fmtOf(a)
  })
}

// 格式归一：显式 format > 扩展名兜底（与 ArtifactPanel 同规则）
function fmtOf(a) {
  const f = String(a.format || '').toLowerCase()
  if (f) return f
  const m = /\.([a-z0-9]+)$/i.exec(a.name || a.path || '')
  return m ? m[1].toLowerCase() : 'file'
}

function fmtLabel(a) {
  const f = fmtOf(a)
  return {
    docx: 'Word 文档', doc: 'Word 文档', pdf: 'PDF 文档',
    pptx: 'PPT 演示文稿', ppt: 'PPT 演示文稿',
    xlsx: 'Excel 表格', xls: 'Excel 表格',
    html: '网页', htm: '网页', md: 'Markdown',
    png: '图片', jpg: '图片', jpeg: '图片'
  }[f] || f.toUpperCase()
}

function fmtSize(n) {
  const v = Number(n) || 0
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB'
  if (v >= 1024) return (v / 1024).toFixed(1) + ' KB'
  return v + ' B'
}

async function openArtifact(a) {
  const files = buddyApiSection('files')
  if (!files) return message.warning('当前环境不支持该操作')
  const res = await files.open(a.path)
  if (res && res.ok === false) message.error('打开失败：' + (res.error || '文件可能已被移动'))
}

async function revealArtifact(a) {
  const files = buddyApiSection('files')
  if (!files) return message.warning('当前环境不支持该操作')
  const res = await files.reveal(a.path)
  if (res && res.ok === false) message.error('打开所在文件夹失败：' + (res.error || ''))
}
</script>

<style lang="scss" scoped>
/* 弹入 / 弹出：自下方轻微上移 + 淡入（与权限条同节奏方向） */
.ob-out-slide-enter-active,
.ob-out-slide-leave-active {
  transition: transform 0.2s cubic-bezier(0.2, 0.8, 0.3, 1), opacity 0.16s ease;
}

.ob-out-slide-enter,
.ob-out-slide-enter-from,
.ob-out-slide-leave-to {
  transform: translateY(8px);
  opacity: 0;
}

/* 产出聚合弹层：浮于输入框上方（底边贴 .ob-composer-inner 顶边），
     不占布局、盖住消息流尾部，最大高度受限滚动 */
.ob-out-pop {
  position: absolute;
  bottom: 100%;
  margin-bottom: 8px;
  left: 0;
  right: 0;
  z-index: 6;
  max-height: 340px;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  background: var(--card-bg, #fff);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.12);
  overflow: hidden;
}

.ob-out-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 12px;
  border-bottom: 1px solid $divider;
}

.ob-out-title {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
}

.ob-out-count {
  font-size: 11px;
  color: var(--text-secondary);
  background: rgba(var(--primary-color-rgb), 0.1);
  color: var(--primary-color);
  padding: 1px 8px;
  border-radius: 999px;
}

.ob-out-close {
  margin-left: auto;
  width: 22px;
  height: 22px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;

  .svg-icon {
    font-size: 12px;
  }

  &:hover {
    color: var(--text-primary);
    background: rgba(125, 125, 135, 0.12);
  }
}

.ob-out-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px;
}

.ob-out-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 8px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.06);
  }
}

.ob-out-ico {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: block;
}

.ob-out-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ob-out-name {
  font-size: 12.5px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-out-meta {
  font-size: 11px;
  color: var(--text-secondary);
  user-select: none;
}

.ob-out-btn {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: var(--text-secondary);
  opacity: 0.72;
  cursor: pointer;
  transition: all 0.12s ease;

  .svg-icon {
    font-size: 13px;
  }

  .ob-out-item:hover & {
    opacity: 1;
  }

  &:hover {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.1);
  }
}
</style>
