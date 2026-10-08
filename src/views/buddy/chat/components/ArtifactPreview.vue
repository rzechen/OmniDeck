<template>
  <!-- 右栏产物/代码放大预览：由消息流内产物卡片点击或代码块「放大」按钮唤起，
       在聊天主列右侧滑出（宽屏利用，消息流保持 768px 不动）；
       文本/Markdown/HTML/图片内嵌渲染，其余格式提示转系统应用打开 -->
  <div class="ob-preview">
    <!-- 头部：类型图标 + 文件名 + 元信息 + 操作 -->
    <div class="ob-preview-head">
      <img class="ob-preview-ico" :src="fileIcon(name)" alt="" draggable="false" />
      <div class="ob-preview-title">
        <div class="ob-preview-name" :title="name">{{ name }}</div>
        <div class="ob-preview-meta">{{ metaText }}</div>
      </div>
      <span v-if="type === 'code'" class="ob-preview-act" title="复制全部内容" @click="copyAll">
        <svg-icon icon-class="copy" />
        <em>复制</em>
      </span>
      <span v-if="item.path" class="ob-preview-act" title="用系统默认应用打开" @click="openFile">
        <svg-icon icon-class="view" />
        <em>打开</em>
      </span>
      <span v-if="item.path" class="ob-preview-act" title="在访达 / 资源管理器中显示" @click="revealFile">
        <svg-icon icon-class="folder" />
        <em>所在文件夹</em>
      </span>
      <span class="ob-preview-close" title="关闭预览" @click="$emit('close')">
        <svg-icon icon-class="close" />
      </span>
    </div>

    <!-- 主体：按类型渲染（is-* 决定铺满策略：代码/网页/图片顶到边，Markdown 留白排版） -->
    <div class="ob-preview-body" :class="'is-' + type">
      <div v-if="loading" class="ob-preview-state">
        <svg-icon icon-class="loading" class="ob-preview-loading" />
        <span>正在加载…</span>
      </div>

      <div v-else-if="error" class="ob-preview-state">
        <span>{{ error }}</span>
        <span v-if="item.path" class="ob-preview-state-link" @click="openFile">用系统应用打开 ›</span>
      </div>

      <template v-else>
        <!-- HTML：沙箱 iframe（禁脚本，静态预览，铺满面板） -->
        <iframe
          v-if="type === 'html'"
          class="ob-preview-frame"
          :srcdoc="content"
          sandbox=""
          title="HTML 预览"
        ></iframe>

        <!-- 图片：等比缩放居中（格底铺满面板） -->
        <div v-else-if="type === 'image'" class="ob-preview-img-wrap">
          <img class="ob-preview-img" :src="imageSrc" :alt="name" draggable="false" />
        </div>

        <!-- Markdown：与聊天气泡同款渲染器（代码块/表格工具条全局样式命中） -->
        <div v-else-if="type === 'markdown'" class="ob-preview-md ob-md" v-html="htmlText"></div>

        <!-- 代码 / 纯文本：CodeMirror 只读呈现（行号 + 语法高亮 + 折叠，铺满面板高度） -->
        <code-editor
          v-else
          class="ob-preview-editor"
          :model-value="content"
          :mode="cmMode"
          read-only
          :line-wrapping="false"
        />
      </template>
    </div>
  </div>
</template>

<script>
// 右栏预览面板：item 数据源两种——
//   { kind:'code', lang, code }        代码块放大（内存内容，无磁盘路径）
//   { path, name, format }             产物文件（经 files IPC 读取）
import { buddyApiSection } from '@/utils/buddy/buddy-api'
import { fileIcon, modeOf } from '@/utils/ui/file-meta'
import { renderMarkdown } from '@/utils/ui/markdown'
import CodeEditor from '@/components/tool/CodeEditor.vue'
// 补充预览高频语言 mode（CodeEditor 自带 js/css/xml/yaml/sql/markdown）
import 'codemirror/mode/python/python'
import 'codemirror/mode/shell/shell'
import 'codemirror/mode/go/go'
import 'codemirror/mode/clike/clike'
import 'codemirror/mode/rust/rust'
import 'codemirror/mode/diff/diff'

const HTML_EXTS = ['html', 'htm']
const MD_EXTS = ['md', 'markdown']
const IMG_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg']

// 代码块 fence 语言 → CodeMirror mode（未命中回退纯文本）
const LANG_MODE = {
  js: 'text/javascript', javascript: 'text/javascript', jsx: 'text/jsx',
  ts: 'application/typescript', typescript: 'application/typescript', tsx: 'text/jsx',
  json: 'application/json',
  html: 'text/html', xml: 'application/xml', svg: 'image/svg+xml', vue: 'text/html',
  css: 'text/css', scss: 'text/css', less: 'text/css',
  yaml: 'text/x-yaml', yml: 'text/x-yaml',
  md: 'text/x-markdown', markdown: 'text/x-markdown',
  sql: 'text/x-sql',
  py: 'text/x-python', python: 'text/x-python',
  sh: 'text/x-sh', bash: 'text/x-sh', shell: 'text/x-sh', zsh: 'text/x-sh',
  go: 'text/x-go',
  java: 'text/x-java', c: 'text/x-csrc', cpp: 'text/x-c++src', 'c++': 'text/x-c++src',
  cs: 'text/x-csharp', kotlin: 'text/x-kotlin', objc: 'text/x-objectivec',
  rust: 'text/x-rustsrc', rs: 'text/x-rustsrc',
  diff: 'text/x-diff', patch: 'text/x-diff'
}

export default {
  name: 'ArtifactPreview',
  components: { CodeEditor },
  props: {
    // 预览目标（结构见组件头注释）
    item: {
      type: Object,
      required: true
    }
  },
  data() {
    return {
      loading: false,
      error: '',
      content: '',
      imageSrc: '',
      size: 0
    }
  },
  computed: {
    // 预览类型：code（内存代码）> 按扩展名 html / markdown / image / 纯文本
    type() {
      if (this.item.kind === 'code') return 'code'
      const f = String(this.item.format || '').toLowerCase() ||
        (String(this.item.name || '').match(/\.([a-z0-9]+)$/i) || [])[1] || ''
      if (HTML_EXTS.indexOf(f) >= 0) return 'html'
      if (MD_EXTS.indexOf(f) >= 0) return 'markdown'
      if (IMG_EXTS.indexOf(f) >= 0) return 'image'
      return 'text'
    },
    // 展示名：产物名 > 代码块语言标识
    name() {
      if (this.item.name) return this.item.name
      if (this.item.kind === 'code') return (this.item.lang || 'text') + ' 代码块'
      return '预览'
    },
    // 元信息行：代码块显示语言 + 行数，文件显示类型 + 大小
    metaText() {
      if (this.item.kind === 'code') {
        const lines = this.content ? this.content.split('\n').length : 0
        return (this.item.lang || 'text') + ' · ' + lines + ' 行'
      }
      const parts = []
      if (this.type !== 'text') parts.push({ html: '网页', markdown: 'Markdown', image: '图片' }[this.type])
      if (this.size) parts.push(this.fmtSize(this.size))
      return parts.join(' · ') || '文本'
    },
    htmlText() {
      return renderMarkdown(this.content)
    },
    // CodeMirror mode：代码块按 fence 语言映射，文件按扩展名（file-meta 内置映射）
    cmMode() {
      if (this.item.kind === 'code') {
        return LANG_MODE[String(this.item.lang || '').toLowerCase()] || 'text/plain'
      }
      return modeOf(this.item.name || '')
    }
  },
  watch: {
    // 目标变化（切换预览对象）即重新加载
    item: {
      immediate: true,
      handler() {
        this.load()
      }
    }
  },
  methods: {
    fileIcon,
    async load() {
      this.error = ''
      this.imageSrc = ''
      this.size = 0
      // 代码块：内容随 item 直接携带，无需读盘
      if (this.item.kind === 'code') {
        this.content = this.item.code || ''
        return
      }
      if (!this.item.path) {
        this.error = '缺少文件路径，无法预览'
        return
      }
      const files = buddyApiSection('files')
      if (!files) {
        this.error = '当前环境不支持预览'
        return
      }
      this.loading = true
      if (this.type === 'image') {
        const res = await files.readImage(this.item.path)
        this.loading = false
        if (res && res.ok) {
          this.imageSrc = res.src
          this.size = res.size || 0
        } else {
          this.error = (res && res.error) || '图片读取失败'
        }
        return
      }
      const res = await files.read(this.item.path)
      this.loading = false
      if (res && res.ok) {
        this.content = res.content || ''
        this.size = res.size || 0
      } else if (res && (res.binary || res.tooLarge)) {
        this.error = res.tooLarge ? '文件较大，建议用系统应用打开' : '该格式不支持内嵌预览'
      } else {
        this.error = (res && res.error) || '读取失败'
      }
    },
    fmtSize(n) {
      const v = Number(n) || 0
      if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB'
      if (v >= 1024) return (v / 1024).toFixed(1) + ' KB'
      return v + ' B'
    },
    // 复制全部内容（代码块放大 / 文件预览通用）
    async copyAll() {
      const text = this.type === 'image' ? '' : this.content
      if (!text || !navigator.clipboard || !navigator.clipboard.writeText) return
      try {
        await navigator.clipboard.writeText(text)
        this.$message.success('已复制')
      } catch (e) {
        this.$message.error('复制失败')
      }
    },
    // 用系统默认应用打开源文件
    async openFile() {
      const files = buddyApiSection('files')
      if (!files) return this.$message.warning('当前环境不支持该操作')
      const res = await files.open(this.item.path)
      if (res && res.ok === false) this.$message.error('打开失败：' + (res.error || '文件可能已被移动'))
    },
    // 在系统文件管理器中显示
    async revealFile() {
      const files = buddyApiSection('files')
      if (!files) return this.$message.warning('当前环境不支持该操作')
      const res = await files.reveal(this.item.path)
      if (res && res.ok === false) this.$message.error('打开所在文件夹失败：' + (res.error || ''))
    }
  }
}
</script>

<style lang="scss" scoped>
/* ===== 右栏预览面板 ===== */
.ob-preview {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-width: 0;
  background: var(--bg-color, #fff);
}

/* 头部：图标 + 标题 + 操作（底部分隔，高度与聊天顶栏协调） */
.ob-preview-head {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  border-bottom: 1px solid $divider;
}

.ob-preview-ico {
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  object-fit: contain;
  display: block;
}

.ob-preview-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ob-preview-name {
  font-size: 12.5px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-preview-meta {
  font-size: 11px;
  color: var(--text-secondary);
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 操作按钮（复制 / 打开 / 所在文件夹）：胶囊图标 + 文字（与产物卡片同款） */
.ob-preview-act {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 9px;
  border-radius: 999px;
  font-size: 11.5px;
  color: var(--text-secondary);
  background: rgba(125, 125, 135, 0.08);
  cursor: pointer;
  user-select: none;
  transition: all 0.12s ease;

  em {
    font-style: normal;
  }

  .svg-icon {
    font-size: 12.5px;
  }

  &:hover {
    color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.09);
  }

  &:active {
    transform: scale(0.96);
  }
}

.ob-preview-close {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 7px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  transition: all 0.12s ease;

  .svg-icon {
    font-size: 13px;
  }

  &:hover {
    color: var(--text-primary);
    background: rgba(125, 125, 135, 0.12);
  }
}

/* 主体：滚动容器（Markdown 留白排版；代码/网页/图片内容顶到边铺满） */
.ob-preview-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 14px 16px;

  &.is-code,
  &.is-text,
  &.is-html,
  &.is-image {
    padding: 0;
  }
}

/* 加载 / 错误占位 */
.ob-preview-state {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--text-secondary);
}

.ob-preview-loading {
  font-size: 20px;
  color: var(--primary-color);
  animation: ob-preview-spin 1s linear infinite;
}

@keyframes ob-preview-spin {
  to { transform: rotate(360deg); }
}

.ob-preview-state-link {
  color: var(--primary-color);
  cursor: pointer;
  font-weight: 600;

  &:hover {
    opacity: 0.8;
  }
}

/* HTML：iframe 铺满面板（白底避免暗色主题下透底，无圆角顶到边） */
.ob-preview-frame {
  display: block;
  width: 100%;
  height: 100%;
  border: none;
  background: #fff;
}

/* 图片：等比缩放居中（浅格底铺满面板衬托透明 PNG） */
.ob-preview-img-wrap {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background-image: linear-gradient(45deg, rgba(125, 125, 135, 0.08) 25%, transparent 25%, transparent 75%, rgba(125, 125, 135, 0.08) 75%),
    linear-gradient(45deg, rgba(125, 125, 135, 0.08) 25%, transparent 25%, transparent 75%, rgba(125, 125, 135, 0.08) 75%);
  background-size: 16px 16px;
  background-position: 0 0, 8px 8px;
}

.ob-preview-img {
  max-width: 100%;
  max-height: 100%;
  object-fit: contain;
}

/* Markdown：与聊天气泡同款排版（代码块/表格工具条由全局样式命中） */
.ob-preview-md {
  :deep(p) { margin: 0 0 8px; }
  :deep(p:last-child) { margin-bottom: 0; }

  :deep(pre) {
    background: rgba(0, 0, 0, 0.06);
    border-radius: 10px;
    padding: 10px 12px;
    overflow-x: auto;
    margin: 8px 0;
    font-size: 12.5px;
    line-height: 1.6;

    code {
      background: transparent;
      padding: 0;
      font-family: 'SF Mono', Menlo, Consolas, monospace;
    }
  }

  :deep(code) {
    background: rgba(var(--primary-color-rgb), 0.09);
    color: var(--primary-color);
    padding: 1px 5px;
    border-radius: 5px;
    font-size: 12.5px;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
  }

  :deep(ul), :deep(ol) {
    padding-left: 20px;
    margin: 6px 0;
  }

  :deep(blockquote) {
    margin: 8px 0;
    padding: 4px 12px;
    border-left: 3px solid rgba(var(--primary-color-rgb), 0.45);
    color: var(--text-secondary);
  }

  :deep(h1), :deep(h2), :deep(h3), :deep(h4) {
    margin: 12px 0 6px;
    font-weight: 700;
  }
}

/* 代码 / 纯文本：CodeMirror 只读编辑器铺满面板（行号栏 + 高亮由 cm-s-omni 主题接管） */
.ob-preview-editor {
  display: block;
  height: 100%;
}
</style>
