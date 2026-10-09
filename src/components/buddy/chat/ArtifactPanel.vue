<template>
  <!-- 本轮回答的导出产物面板（文档交付）：位于正文末尾、文件变更面板上方
       Agent 经 doc_export / preview_export 生成的交付文件（Word / PDF / HTML 等）
       平铺为产物卡片：类型图标（工作空间同款）+ 文件名 + 类型·大小 +「打开 / 所在文件夹」操作；
       数据随消息 items 的 artifacts 字段落盘，重开会话仍可见 -->
  <div v-if="artifacts.length" class="ob-arts">
    <div
      v-for="(a, i) in artifacts"
      :key="(a.path || '') + i"
      class="ob-art-card"
      title="点击在右侧面板预览"
      @click="previewArtifact(a)"
    >
      <img class="ob-art-ico" :src="fileIcon(a.name || a.path || '')" alt="" draggable="false" />
      <div class="ob-art-info">
        <div class="ob-art-name" :title="a.path">{{ a.name || a.path }}</div>
        <div v-if="a.sizeText || a.size" class="ob-art-meta">{{ fmtLabel(a) + ' · ' + (a.sizeText || fmtSize(a.size)) }}</div>
      </div>
      <span class="ob-art-btn" title="用系统默认应用打开" @click.stop="openArtifact(a)">
        <svg-icon icon-class="view" />
        <em>打开</em>
      </span>
      <span class="ob-art-btn" title="在访达 / 资源管理器中显示" @click.stop="revealArtifact(a)">
        <svg-icon icon-class="folder" />
        <em>所在文件夹</em>
      </span>
    </div>
  </div>
</template>

<script setup>
// 导出产物卡片面板：消费 tool item 的 artifacts 清单
// （doc_export / preview_export 等交付工具在 details.artifacts 返回：
//   { path, name, format, size, sizeText }）
import { buddyApiSection } from '@/utils/buddy/buddy-api'
import { fileIcon } from '@/utils/ui/file-meta'
import { bus } from '@/utils/ui/bus'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'ArtifactPanel' })

defineProps({
  // 产物清单（多条则平铺多卡）
  artifacts: {
    type: Array,
    default: () => []
  }
})

const { message } = useFeedback()

// 点击卡片：经全局总线送右侧预览面板（chat 页面层监听渲染）
function previewArtifact(a) {
  bus.emit('chat:artifact-preview', {
    path: a.path || '',
    name: a.name || a.path || '',
    format: fmtOf(a)
  })
}

// 格式归一：显式 format > 扩展名兜底
function fmtOf(a) {
  const f = String(a.format || '').toLowerCase()
  if (f) return f
  const m = /\.([a-z0-9]+)$/i.exec(a.name || a.path || '')
  return m ? m[1].toLowerCase() : 'file'
}

// 格式中文名（meta 行展示：Word 文档 / PDF 文档 / 网页 …；未知类型大写扩展名）
function fmtLabel(a) {
  const f = fmtOf(a)
  return {
    docx: 'Word 文档',
    doc: 'Word 文档',
    pdf: 'PDF 文档',
    html: '网页',
    htm: '网页',
    md: 'Markdown',
    png: '图片',
    jpg: '图片',
    jpeg: '图片'
  }[f] || f.toUpperCase()
}

function fmtSize(n) {
  const v = Number(n) || 0
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB'
  if (v >= 1024) return (v / 1024).toFixed(1) + ' KB'
  return v + ' B'
}

// 用系统默认应用打开产物文件
async function openArtifact(a) {
  const files = buddyApiSection('files')
  if (!files) return message.warning('当前环境不支持该操作')
  const res = await files.open(a.path)
  if (res && res.ok === false) message.error('打开失败：' + (res.error || '文件可能已被移动'))
}

// 在系统文件管理器中显示
async function revealArtifact(a) {
  const files = buddyApiSection('files')
  if (!files) return message.warning('当前环境不支持该操作')
  const res = await files.reveal(a.path)
  if (res && res.ok === false) message.error('打开所在文件夹失败：' + (res.error || ''))
}
</script>

<style lang="scss" scoped>
/* 产物面板：卡片纵向平铺（正文末尾，与文件变更面板同区域）
   width:100% + stretch 撑满气泡宽度（与问答窗口一致，同 .ob-fcp 模式） */
.ob-arts {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  width: 100%;
  margin: 4px 0 8px;
}

/* 产物卡片：格式徽章 + 文件信息 + 操作按钮 */
.ob-art-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--card-bg, #fff);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.45);
    box-shadow: 0 1px 8px rgba(var(--primary-color-rgb), 0.08);
  }
}

/* 类型图标（工作空间同款 PNG 素材：word / pdf / txt 等） */
.ob-art-ico {
  flex-shrink: 0;
  width: 32px;
  height: 32px;
  object-fit: contain;
  display: block;
}

.ob-art-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ob-art-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-art-meta {
  font-size: 11px;
  color: var(--text-secondary);
  user-select: none;
}

/* 操作按钮（打开 / 所在文件夹）：胶囊图标 + 文字 */
.ob-art-btn {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--text-secondary);
  background: rgba(125, 125, 135, 0.08);
  cursor: pointer;
  user-select: none;
  transition: all 0.12s ease;

  em {
    font-style: normal;
  }

  .svg-icon {
    font-size: 13px;
  }

  &:hover {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.09);
  }

  &:active {
    transform: scale(0.96);
  }
}
</style>
