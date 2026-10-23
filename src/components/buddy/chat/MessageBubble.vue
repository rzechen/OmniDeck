<template>
  <!-- 用户 / 助手消息（豆包风格：无头像，用户右侧气泡，助手左侧纯内容） -->
  <div class="ob-msg" :class="message.role">
    <div class="ob-msg-bubble" :class="{ editing: message.role === 'user' && editing }">
      <!-- 助手：上下文压缩摘要分界（独立摘要消息）：默认收起为一行分割线，点击展开/收起摘要正文 -->
      <div
        v-if="message.compaction"
        class="ob-compaction"
        :class="{ open: compactionOpen }"
        :title="compactionOpen ? '收起摘要' : '展开查看摘要'"
        @click="compactionOpen = !compactionOpen"
      >
        <div class="ob-compaction-line">
          <svg-icon icon-class="clock" class="ob-compaction-ico" />
          <span class="ob-compaction-label">已自动整理早期对话（上下文压缩）</span>
          <span v-if="compactionText" class="ob-compaction-meta">{{ compactionText }}</span>
          <svg-icon icon-class="arrow-down" class="ob-compaction-arrow" :class="{ open: compactionOpen }" />
        </div>
      </div>

      <!-- 助手：深度思考区（思考过程 + Skill + 工具/MCP + ask_user 提问 + 正文代码块） -->
      <thinking-section
        v-if="hasSection"
        :items="sectionItems"
        :is-thinking="!!message.isThinking"
        :is-streaming="!!message.streaming"
        :perm-pending="permPending"
        @ask-answer="(msg, value) => emit('ask-answer', msg, value)"
      />

      <!-- 助手：模型/供应商调用错误（原封不动展示，便于排查） -->
      <div v-if="message.role === 'assistant' && message.error" class="ob-msg-error">
        <svg-icon icon-class="warning-outline" class="ob-msg-error-ico" />
        <div class="ob-msg-error-text">{{ message.error }}</div>
      </div>

      <!-- 助手：等待首个内容块的思考占位（转圈 + 秒计时；ask_user 待回答期间持续显示） -->
      <div v-if="showThinkingPlaceholder" class="ob-thinking">
        <svg-icon icon-class="loading" class="ob-think-spin" />
        <span>思考中</span><span class="ob-thinking-sec">{{ message.seconds }}s</span>
      </div>
      <!-- 助手：正文 Markdown（click 委托承接代码块复制按钮；压缩摘要收起时不渲染，展开时以缩进+背景突出）；
           代码块已拆出收入思考区，此处仅渲染文字部分（displayContent 为拆分后文本） -->
      <div
        v-else-if="message.role === 'assistant' && displayContent && (!message.compaction || compactionOpen)"
        class="ob-md"
        :class="{ 'ob-md-compaction': message.compaction }"
        v-html="rendered"
        @click="onMdClick"
      ></div>
      <!-- 用户：图片附件缩略图（截图提问；编辑态隐藏 —— 编辑重问仅发送文本） -->
      <div v-if="message.role === 'user' && !editing && message.images && message.images.length" class="ob-msg-images">
        <img
          v-for="img in message.images"
          :key="img.id"
          class="ob-msg-img"
          :src="img.thumb"
          :title="img.width + '×' + img.height"
          alt="截图"
          draggable="false"
        />
      </div>
      <!-- 用户：文件附件卡片（文本/PDF 与文件导入图片；编辑态隐藏；
           图标按后缀映射，与工作空间文件列表一致） -->
      <div v-if="!editing && fileAttachmentList.length" class="ob-msg-files">
        <div v-for="f in fileAttachmentList" :key="f.id" class="ob-msg-file">
          <img v-if="f.kind === 'image' && f.thumb" class="ob-msg-file-thumb" :src="f.thumb" alt="" draggable="false" />
          <img v-else class="ob-msg-file-thumb" :src="fileIcon(f.name)" alt="" draggable="false" />
          <div class="ob-msg-file-info">
            <div class="ob-msg-file-name" :title="f.name">{{ f.name }}</div>
            <div class="ob-msg-file-meta">{{ fileKindLabel(f.kind) + ' · ' + formatSize(f.size) }}</div>
          </div>
        </div>
      </div>
      <!-- 用户：编辑重问（会话内分支）—— 替换正文为编辑框（按钮嵌在框内底栏），回车或按钮提交；
           焦点移出编辑框（点击其它区域）自动退出编辑恢复原样式 -->
      <div v-if="message.role === 'user' && editing" class="ob-edit-area" @focusout="onEditFocusout">
        <textarea
          ref="editBox"
          v-model="editText"
          class="ob-edit-input"
          rows="3"
          placeholder="修改后重新提问，将创建新分支"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"
          @keydown.enter.exact.prevent="onEnterEdit"
          @keydown.esc="editing = false"
        ></textarea>
        <div class="ob-edit-btns">
          <!-- mousedown.prevent：阻止点击按钮时 textarea 先失焦导致编辑区被移除、click 落空 -->
          <span class="ob-edit-btn cancel" @mousedown.prevent @click="editing = false">取消</span>
          <span class="ob-edit-btn go" @mousedown.prevent @click="submitEdit">重新提问</span>
        </div>
      </div>
      <!-- 用户：正文分段渲染 —— # / @ 引用 token（#Folder:相对路径 / #File:相对路径 /
           @Skill:目录名 / @Expert:文件路径 / @Connector:连接器 id）
           以内联 chip 呈现（与输入框内联 tag 同构、可穿插文字）；file 类 chip 点击
           唤起右栏产物预览（同代码块放大）；无 token 时整段纯文本直出 -->
      <template v-else-if="message.role === 'user' && userSegments.length">
        <template v-for="(seg, i) in userSegments">
          <span v-if="seg.type === 'text'" :key="'t' + i">{{ seg.text }}</span>
          <span
            v-else
            :key="'c' + i"
            class="ob-chip"
            :class="{ dir: seg.kind === 'dir', at: AT_SPRITE_ICON[seg.kind] }"
            :title="seg.title"
            @click="onChipClick(seg)"
          ><img v-if="seg.kind === 'dir' || seg.kind === 'file'" class="ob-chip-ico" :src="seg.kind === 'dir' ? folderIcon : fileIcon(seg.name)" alt="" draggable="false" /><svg-icon v-else class="ob-chip-ico ob-chip-svg" :icon-class="AT_SPRITE_ICON[seg.kind]" /><span class="ob-chip-name">{{ seg.name }}</span></span>
        </template>
      </template>
      <template v-else-if="message.role === 'user'">{{ message.content }}</template>

      <!-- 用户：分支切换器（该问题存在多个分支变体时常驻显示，点击切换线路）
           居中胶囊分页器 ‹ 1/2 ›，仅多分支时出现 -->
      <div v-if="message.role === 'user' && !editing && branchInfo" class="ob-branch-switch">
        <span
          class="ob-branch-arrow"
          title="上一条分支"
          @click="emit('switch-branch', { headId: branchInfo.headId, dir: -1 })"
        >
          <svg-icon icon-class="arrow-right" class="ob-flip" />
        </span>
        <span class="ob-branch-count" :title="'共 ' + branchInfo.total + ' 条分支，点击箭头切换'">{{ branchInfo.index }} / {{ branchInfo.total }}</span>
        <span
          class="ob-branch-arrow"
          title="下一条分支"
          @click="emit('switch-branch', { headId: branchInfo.headId, dir: 1 })"
        >
          <svg-icon icon-class="arrow-right" />
        </span>
      </div>
      <span v-if="showCursor" class="ob-cursor"></span>

      <!-- 助手：深度研究任务进度卡片：workflow 工具启动的多代理运行实时状态；
           后台运行跨回合，进度由 store 直接写入 item.workflow.progress，卡片天然响应 -->
      <workflow-panel
        v-if="message.role === 'assistant' && workflows.length"
        :workflows="workflows"
        :session-id="sessionId"
      />

      <!-- 助手：导出产物卡片（正文末尾、文件变更面板上方；doc_export / preview_export
           生成的交付文件，数据随消息 items 持久化恢复） -->
      <artifact-panel
        v-if="message.role === 'assistant' && !message.streaming && artifacts.length"
        :artifacts="artifacts"
      />

      <!-- 助手：文件变更汇总面板（正文末尾、meta 操作行上方；数据随消息 items 持久化恢复） -->
      <file-changes-panel
        v-if="message.role === 'assistant' && !message.streaming && fileChanges.length"
        :changes="fileChanges"
      />

      <!-- 助手 meta 行（回答完成后呈现：复制 / 点赞 / 点踩 / 分支 / 导出 / token 用量 / 时间，定高不抖动；
           压缩摘要消息不显示；错误消息仅展示错误本身，meta 操作无意义同样不显示） -->
      <div v-if="message.role === 'assistant' && !message.streaming && !message.compaction && !message.error" class="ob-msg-meta">
        <span class="ob-meta-copy" title="复制全文" @click="copyContent">
          <svg-icon icon-class="copy" />
        </span>
        <span
          class="ob-meta-act"
          :class="{ on: message.feedback === 'like' }"
          :title="message.feedback === 'like' ? '取消点赞' : '点赞'"
          @click="setFeedback('like')"
        >
          <svg-icon :icon-class="message.feedback === 'like' ? 'like-fill' : 'like'" />
        </span>
        <span
          class="ob-meta-act"
          :class="{ on: message.feedback === 'dislike' }"
          :title="message.feedback === 'dislike' ? '取消点踩' : '点踩'"
          @click="setFeedback('dislike')"
        >
          <svg-icon :icon-class="message.feedback === 'dislike' ? 'notlike-fill' : 'notlike'" />
        </span>
        <span v-if="message.id" class="ob-meta-act" title="以此为分叉点复制完整上下文，创建新会话（当前会话保留）" @click="emit('branch')">
          <svg-icon icon-class="fork" />
        </span>
        <!-- 导出本条回答：点击弹格式菜单（Markdown 前端直下 / Word·PDF·HTML 走 pandoc 管线） -->
        <span class="ob-meta-export">
          <span class="ob-meta-act" title="导出本条回答" @click.stop="exportMenu = !exportMenu">
            <svg-icon icon-class="export" />
          </span>
          <transition name="ob-em">
            <div v-if="exportMenu" class="ob-export-menu" @click.stop>
              <div class="ob-em-item" @click="exportAs('markdown')">
                <span class="ob-em-dot md"></span>
                <span class="ob-em-name">Markdown</span>
                <span class="ob-em-ext">.md</span>
              </div>
              <div class="ob-em-item" @click="exportAs('docx')">
                <span class="ob-em-dot docx"></span>
                <span class="ob-em-name">Word 文档</span>
                <span class="ob-em-ext">.docx</span>
              </div>
              <div class="ob-em-item" @click="exportAs('pdf')">
                <span class="ob-em-dot pdf"></span>
                <span class="ob-em-name">PDF 文档</span>
                <span class="ob-em-ext">.pdf</span>
              </div>
              <div class="ob-em-item" @click="exportAs('html')">
                <span class="ob-em-dot html"></span>
                <span class="ob-em-name">网页</span>
                <span class="ob-em-ext">.html</span>
              </div>
            </div>
          </transition>
        </span>
        <span v-if="tokensText" class="ob-meta-text">{{ tokensText }}</span>
        <span v-if="contextText" class="ob-meta-ctx" :title="'上下文占用 ' + contextPercent + '%（接近上限将自动整理早期对话）'">
          <span class="ob-ctx-bar"><span class="ob-ctx-fill" :class="ctxLevel" :style="{ width: contextPercent + '%' }"></span></span>
          <span class="ob-meta-text">{{ contextText }}</span>
        </span>
        <span v-if="timeText" class="ob-meta-text">{{ timeText }}</span>
      </div>

      <!-- 用户消息 hover：时间 / 复制 / 编辑重问（分支）（绝对定位，不占文档流）
           复制与时间无需消息 id（实时消息即有）；编辑重问依赖落盘 id -->
      <div v-if="message.role === 'user' && !streaming" class="ob-msg-actions">
        <span class="ob-msg-time">{{ timeText }}</span>
        <span class="ob-user-copy" title="复制" @click="copyContent">
          <svg-icon icon-class="copy" />
        </span>
        <span v-if="message.id && !editing" class="ob-user-copy" title="编辑并重新提问（创建分支）" @click="startEdit">
          <svg-icon icon-class="edit" />
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
// OmniBuddy 对话消息气泡（用户纯文本 / 助手 Markdown + 深度思考区 + 流式光标 + meta 行）
import { ref, computed, watch, onBeforeUnmount, nextTick } from 'vue'
import { renderMarkdown, handleCodeCopy, handleTableCsv } from '@/utils/ui/markdown'
import { fileIcon, FOLDER_ICON } from '@/utils/ui/file-meta'
import ThinkingSection from './ThinkingSection.vue'
import FileChangesPanel from './FileChangesPanel.vue'
import ArtifactPanel from './ArtifactPanel.vue'
import WorkflowPanel from './WorkflowPanel.vue'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { bus } from '@/utils/ui/bus'
import { useFeedback } from '@/composables/useFeedback'

defineOptions({ name: 'MessageBubble' })

const props = defineProps({
  message: {
    type: Object,
    required: true
  },
  // 会话是否正在流式生成（控制光标与 hover 操作）
  streaming: {
    type: Boolean,
    default: false
  },
  // 队首待确认权限（透传给思考区工具卡片显示"等待授权"状态）
  permPending: {
    type: Object,
    default: null
  },
  // 所属会话 id（透传给深度研究进度卡片：历史回放拉取运行状态）
  sessionId: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['ask-answer', 'switch-branch', 'branch', 'feedback', 'edit-resend'])

const { message: feedback } = useFeedback()

// 编辑重问（会话内分支）：编辑态与草稿
const editing = ref(false)
const editText = ref('')
// 中文输入法组合中（组合态回车 = 确认候选词，不触发提交）
const isComposing = ref(false)
// 导出格式菜单（meta 行导出按钮；开启期间挂 document 点击监听关闭）
const exportMenu = ref(false)
// 压缩摘要展开态（默认收起为一行分割线，点击展开）
const compactionOpen = ref(false)

// 编辑框（进入编辑态聚焦并把光标置于末尾）
const editBox = ref(null)

// 切换分支变体 / 消息变化时退出编辑态
watch(() => props.message.id, () => {
  editing.value = false
})

// 菜单开启期间监听全局点击（任意处点击即关闭；按钮自身 .stop 防误关）
watch(exportMenu, (open) => {
  if (open) document.addEventListener('click', closeExportMenu)
  else document.removeEventListener('click', closeExportMenu)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeExportMenu)
})

// 分支信息（仅用户消息的组头位置携带：{ headId, total, index }，多分支才显示切换器）
const branchInfo = computed(() => {
  const b = props.message._branch
  return (b && b.total > 1) ? b : null
})

// 正文代码块拆分：成对 fence（``` / ~~~，语言标记取首 token）整块提取为
// code 条目收入深度思考区（随所属思考段折叠），正文仅保留文字部分；
// 未闭合 fence（流式生成中）留在正文原位，闭合瞬间移入思考区。
// 按行扫描（非正则跨行匹配）：fence 处留占位空行维持前后段落间距
function splitCodeBlocks(content) {
  const lines = String(content || '').split('\n')
  const codes = []
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const open = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(lines[i])
    if (open) {
      const fenceCh = open[1][0]
      const fenceLen = open[1].length
      let closed = -1
      for (let j = i + 1; j < lines.length; j++) {
        const cm = new RegExp('^ {0,3}\\' + fenceCh + '{' + fenceLen + ',}[ \t]*$').exec(lines[j])
        if (cm) { closed = j; break }
      }
      if (closed > 0) {
        codes.push({
          type: 'code',
          lang: String(open[2] || '').trim().split(/\s+/)[0] || '',
          code: lines.slice(i + 1, closed).join('\n'),
          lines: closed - i - 1
        })
        out.push('')
        i = closed
        continue
      }
    }
    out.push(lines[i])
  }
  return { text: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(), codes }
}

// 实例级拆分缓存：同 content 复用结果；content 增长重拆时，未变化的代码块
// 复用旧条目对象（引用稳定 → 思考区 markdown 渲染缓存命中，流式不卡顿）
let splitState = { content: '', text: '', codes: [] }
function splitCached(content) {
  const src = String(content || '')
  if (splitState.content === src) return splitState
  const r = splitCodeBlocks(src)
  const prev = splitState.codes
  for (let k = 0; k < r.codes.length; k++) {
    const p = prev[k]
    if (p && p.code === r.codes[k].code && p.lang === r.codes[k].lang) r.codes[k] = p
  }
  splitState = { content: src, text: r.text, codes: r.codes }
  return splitState
}

// 实际渲染/复制的正文：压缩摘要为兼容旧落盘数据，剔除误留的系统注入块（如 <read-files>…</read-files>）；
// 普通正文先拆出代码块（收入思考区），此处为拆分后的文字部分
const displayContent = computed(() => {
  let text = String(props.message.content || '')
  if (props.message.compaction) {
    text = text
      .replace(/<read-files>[\s\S]*?<\/read-files>/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
    return text
  }
  return splitCached(text).text
})

// 正文拆出的代码块条目（追加思考区末尾，归属最近思考段折叠）
const contentCodes = computed(() => {
  if (props.message.compaction) return []
  return splitCached(String(props.message.content || '')).codes
})

const rendered = computed(() => {
  return renderMarkdown(displayContent.value)
})

// 思考区条目：原有内容块 + 正文代码块（追加末尾）
const sectionItems = computed(() => {
  const base = props.message.items || []
  return contentCodes.value.length ? base.concat(contentCodes.value) : base
})

// 是否展示深度思考区（已有内容块，含拆出的代码块条目）
const hasSection = computed(() => {
  return props.message.role === 'assistant' &&
    !!sectionItems.value.length
})

// 尚无任何内容块时，退回「思考中 Ns」占位
const showThinkingPlaceholder = computed(() => {
  return props.message.role === 'assistant' &&
    !!props.message.thinking && !props.message.content && !hasSection.value
})

// 正文流式光标（思考中由深度思考区自己渲染）
const showCursor = computed(() => {
  return props.message.role === 'assistant' &&
    !!props.message.streaming && !!props.message.content && !props.message.isThinking
})

// token 用量（直接文字展示：输入 / 输出，单位 tokens；万位以上缩写为 k）
const tokensText = computed(() => {
  const u = props.message.usage
  if (!u || (!u.input && !u.output)) return ''
  return '输入 ' + formatTokens(u.input) + ' tokens · 输出 ' + formatTokens(u.output) + ' tokens'
})

// 上下文占用文字（tokens / 窗口）
const contextText = computed(() => {
  const u = props.message.usage
  if (!u || !u.contextTokens || !u.contextWindow) return ''
  return '上下文 ' + formatTokens(u.contextTokens) + ' / ' + formatTokens(u.contextWindow)
})

// 上下文占用百分比（0-100，钳制；无数据时 0）
const contextPercent = computed(() => {
  const u = props.message.usage
  if (!u || !u.contextTokens || !u.contextWindow) return 0
  return Math.min(100, Math.max(0, Math.round((u.contextTokens / u.contextWindow) * 100)))
})

// 用量条颜色档位（<60% 正常 / <85% 警示 / 高危）
const ctxLevel = computed(() => {
  const p = contextPercent.value
  if (p >= 85) return 'danger'
  if (p >= 60) return 'warn'
  return 'ok'
})

// 压缩摘要 meta（token 前后对比）
const compactionText = computed(() => {
  const c = props.message.compaction
  if (!c || (!c.tokensBefore && !c.tokensAfter)) return ''
  return '上下文 ' + formatTokens(c.tokensBefore) + ' → ' + formatTokens(c.tokensAfter) + ' tokens'
})

// 消息时间（统一 mm-dd HH:mm:ss）
const timeText = computed(() => {
  return formatTime(props.message.createdAt)
})

// 文件附件列表（仅用户消息有）
const fileAttachmentList = computed(() => {
  if (props.message.role !== 'user' || !Array.isArray(props.message.fileAttachments)) return []
  return props.message.fileAttachments
})

// ===== 用户消息正文分段：# / @ 引用 token → 内联 chip =====
// token 契约与 composer 一致：#Folder:相对路径（根目录 /）/ #File:相对路径；
// @Skill:目录名 / @Expert:文件路径 / @Connector:连接器 id。
// # chip 的绝对路径从消息级 atRefs 按 rel（旧数据无 rel 时按 kind+name）反查；
// @ chip 非路径引用，name 由 token 值推导（expert 去扩展名）
const TOKEN_RE = /#(Folder|File):([^\s#@]+)|@(Skill|Expert|Connector):([^\s#@]+)/g

// @ 引用 chip 的 sprite 图标（# 引用用文件类型图标 img）
const AT_SPRITE_ICON = { skill: 'skill', expert: 'user', connector: 'connection' }

// 文件夹图标（目录 chip 用；文件 chip 按扩展名取类型图标）
const folderIcon = FOLDER_ICON

const userSegments = computed(() => {
  if (props.message.role !== 'user') return []
  const src = String(props.message.content || '')
  if (!src) return []
  const refs = Array.isArray(props.message.atRefs) ? props.message.atRefs : []
  const segs = []
  TOKEN_RE.lastIndex = 0
  let last = 0
  let m
  while ((m = TOKEN_RE.exec(src))) {
    if (m.index > last) segs.push({ type: 'text', text: src.slice(last, m.index) })
    if (m[1]) {
      // # 引用：#Folder: / #File:
      const kind = m[1] === 'Folder' ? 'dir' : 'file'
      const rel = m[2]
      const name = rel === '/' ? '整个工作空间' : rel.split('/').pop()
      const ref = refs.find(r => r && (r.rel === rel || (!r.rel && r.kind === kind && r.name === name)))
      const abs = ref ? ref.path : ''
      segs.push({ type: 'chip', kind, name, rel, abs, title: abs || rel })
    } else {
      // @ 引用：@Skill: / @Expert: / @Connector:（非路径，仅展示）
      const kind = m[3].toLowerCase()
      const val = m[4]
      const name = kind === 'expert' ? val.split('/').pop().replace(/\.md$/i, '') : val
      segs.push({ type: 'chip', kind, name, rel: '', abs: '', title: '@' + m[3] + ':' + val })
    }
    last = TOKEN_RE.lastIndex
  }
  if (last < src.length) segs.push({ type: 'text', text: src.slice(last) })
  return segs
})

// chip 点击：file 类唤起右栏产物预览（磁盘文件数据源，同产物文件预览）；dir 类无动作
function onChipClick(seg) {
  if (seg.kind !== 'file' || !seg.abs) return
  bus.emit('chat:artifact-preview', { path: seg.abs, name: seg.name })
}

// 本轮文件变更列表（工具条目的 fileChange，实时与历史归一化路径均写入 items）
const fileChanges = computed(() => {
  if (props.message.role !== 'assistant' || !Array.isArray(props.message.items)) return []
  return props.message.items.filter(it => it.type === 'tool' && it.fileChange).map(it => it.fileChange)
})

// 本轮深度研究运行列表（工具条目的 workflow：后台 runId + 轮询进度 / 前台快照）
const workflows = computed(() => {
  if (props.message.role !== 'assistant' || !Array.isArray(props.message.items)) return []
  return props.message.items.filter(it => it.type === 'tool' && it.workflow).map(it => it.workflow)
})

// 本轮导出产物清单（工具条目的 artifacts，doc_export / preview_export 交付文件）
const artifacts = computed(() => {
  if (props.message.role !== 'assistant' || !Array.isArray(props.message.items)) return []
  return props.message.items
    .filter(it => it.type === 'tool' && Array.isArray(it.artifacts))
    .reduce((acc, it) => acc.concat(it.artifacts), [])
})

// Markdown 区点击委托：链接拦截 + 代码块复制/放大按钮（v-html 内容不归 Vue 管，走事件委托）
function onMdClick(e) {
  // 链接不导航应用窗口（伪链接如 http://entries.md 会白屏）：合法外链交系统浏览器
  const anchor = e.target.closest && e.target.closest('a')
  if (anchor) {
    e.preventDefault()
    const href = anchor.getAttribute('href') || ''
    if (/^https?:\/\//i.test(href)) window.open(href, '_blank')
    return
  }
  // 代码块「放大」：内容与语言标记经全局总线送右栏预览面板（页面层监听）
  const zoom = e.target.closest && e.target.closest('.ob-code-zoom')
  if (zoom) {
    const box = zoom.closest('.ob-code')
    if (box) {
      const langEl = box.querySelector('.ob-code-lang')
      const codeEl = box.querySelector('pre code')
      bus.emit('chat:artifact-preview', {
        kind: 'code',
        lang: langEl ? langEl.textContent.trim() : '',
        code: codeEl ? codeEl.textContent : ''
      })
    }
    return
  }
  handleCodeCopy(e).then(ok => {
    if (ok) feedback.success('已复制')
  })
  handleTableCsv(e).then(ok => {
    if (ok) feedback.success('已下载 CSV')
  })
}

// ===== 编辑重问（会话内分支）=====
// 进入编辑态：预填当前问题文本并聚焦
function startEdit() {
  editText.value = props.message.content || ''
  editing.value = true
  nextTick(() => {
    const box = editBox.value
    if (box) {
      box.focus()
      // 光标置于末尾
      const len = box.value.length
      try { box.setSelectionRange(len, len) } catch (e) { /* 忽略 */ }
    }
  })
}

// 焦点移出编辑区：退出编辑恢复原气泡（点击输入框外任意区域即取消）。
// relatedTarget 仍在编辑区内（textarea ↔ 按钮间切换）不取消；
// 点击不可聚焦区域（空白处/图标）时 relatedTarget 为 null → 取消
function onEditFocusout(e) {
  const to = e.relatedTarget
  if (to && e.currentTarget.contains(to)) return
  editing.value = false
}

// 回车提交编辑：输入法组合中（确认候选词）不提交
function onEnterEdit(e) {
  if (isComposing.value || e.isComposing) return
  submitEdit()
}

// 提交编辑：上抛页面层（创建分支变体并重新提问）
function submitEdit() {
  const text = String(editText.value || '').trim()
  if (!text) {
    feedback.warning('内容不能为空')
    return
  }
  editing.value = false
  emit('edit-resend', { message: props.message, text })
}

function formatTokens(n) {
  const v = Number(n) || 0
  return v >= 10000 ? (v / 1000).toFixed(1) + 'k' : String(v)
}

// 文件大小人性化（B/KB/MB）
function formatSize(n) {
  const v = Number(n) || 0
  if (v >= 1024 * 1024) return (v / 1024 / 1024).toFixed(1) + ' MB'
  if (v >= 1024) return (v / 1024).toFixed(1) + ' KB'
  return v + ' B'
}

function fileKindLabel(kind) {
  if (kind === 'pdf') return 'PDF'
  if (kind === 'office') return 'Office'
  if (kind === 'image') return '图片'
  return '文本'
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const pad = x => String(x).padStart(2, '0')
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' +
    pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds())
}

// 复制助手正文
function copyContent() {
  const text = displayContent.value
  if (!text) return
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(
      () => feedback.success('已复制'),
      () => feedback.error('复制失败')
    )
  } else {
    feedback.error('当前环境不支持复制')
  }
}

// 点赞 / 点踩（互斥切换，再次点击取消）：本地即时生效并提示，
// 有落盘 id 时上抛页面层持久化到主进程（重开会话仍保留）
function setFeedback(v) {
  const next = props.message.feedback === v ? '' : v
  props.message.feedback = next
  feedback.success(next === 'like' ? '已点赞' : next === 'dislike' ? '已点踩，感谢反馈' : '已取消')
  if (props.message.id) emit('feedback', { message: props.message, value: next })
}

// 关闭导出格式菜单（document 点击监听回调，引用须稳定供 removeEventListener）
function closeExportMenu() {
  exportMenu.value = false
}

// 导出本条回答为 Markdown 文件（渲染层 Blob 下载）
function exportContent() {
  const text = props.message.content || ''
  if (!text) return
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'OmniBuddy-' + formatTime(props.message.createdAt).replace(/[: ]/g, '-') + '.md'
  a.click()
  URL.revokeObjectURL(url)
  feedback.success('已导出')
}

// 按格式导出本条回答（文档交付）：
// Markdown 前端 Blob 直下；Word / PDF / HTML 走主进程 pandoc 管线（弹保存对话框）
async function exportAs(format) {
  exportMenu.value = false
  const text = props.message.content || ''
  if (!text) return feedback.warning('内容为空，无可导出内容')
  if (format === 'markdown') return exportContent()
  const api = buddyApi()
  if (!api || !api.messageExport) return feedback.warning('当前环境不支持该格式导出')
  const base = 'OmniBuddy-' + formatTime(props.message.createdAt).replace(/[: ]/g, '-')
  let res
  try {
    res = await api.messageExport({ content: text, format, filename: base })
  } catch (e) {
    return feedback.error('导出失败：' + (e.message || e))
  }
  if (!res) return
  if (res.ok) feedback.success('已导出：' + res.filePath)
  else if (!res.canceled) feedback.error('导出失败：' + (res.error || '未知错误'))
}
</script>

<style lang="scss" scoped>
.ob-msg {
  display: flex;

  &.user {
    justify-content: flex-end;

    .ob-msg-bubble {
      max-width: 85%;
      background: linear-gradient(135deg, var(--primary-color-hover), var(--primary-color));
      color: #fff;
      border: none;
      border-radius: 14px;
      padding: 10px 14px;
    }
  }

  /* 助手气泡撑满问答窗口宽度：产物卡片 / 文件变更面板与窗口对齐
     （正文长文本本就接近全宽，短回答统一全宽保持视觉一致） */
  &:not(.user) .ob-msg-bubble {
    width: 100%;
  }
}

.ob-msg-bubble {
  max-width: 100%;
  padding: 0;
  border: none;
  background: transparent;
  /* 问答内容统一字号（用户消息文本与助手 Markdown 正文均继承） */
  font-size: 14px;
  line-height: 1.7;
  color: var(--text-primary);
  word-break: break-word;
  user-select: text;
  /* hover 操作条（absolute）的定位基准：缺失时会相对 .buddy-right 定位而被裁剪，完全不可见 */
  position: relative;
}

/* 用户消息图片附件缩略图（气泡内文字上方） */
.ob-msg-images {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-bottom: 6px;

  &:empty { margin-bottom: 0; }
}

/* ===== 编辑重问（会话内分支）：卡片式输入框，操作按钮嵌在框内底栏 ===== */
/* 编辑态：去除用户气泡的渐变背景，仅呈现编辑框卡片本身 */
.ob-msg.user .ob-msg-bubble.editing {
  background: transparent;
  border: none;
  color: var(--text-primary);
}

.ob-edit-area {
  width: 100%;
  min-width: 300px;
  border: 1.5px solid rgba(var(--primary-color-rgb), 0.55);
  border-radius: 14px;
  background: var(--card-bg, #fff);
  box-shadow: 0 2px 12px rgba(var(--primary-color-rgb), 0.1);
  overflow: hidden;
}

.ob-edit-input {
  display: block;
  width: 100%;
  min-height: 64px;
  max-height: 240px;
  overflow-y: auto;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text-primary);
  font: inherit;
  font-size: 14px;
  line-height: 1.6;
  padding: 10px 13px 4px;

  &::placeholder {
    color: var(--text-secondary);
  }
}

/* 框内底栏：右侧纯文字按钮（取消 / 重新提问） */
.ob-edit-btns {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 4px;
  padding: 4px 8px 8px;
  user-select: none;
}

.ob-edit-btn {
  cursor: pointer;
  font-size: 12.5px;
  padding: 3px 10px;
  border-radius: 7px;
  transition: all 0.12s ease;
  user-select: none;

  &.cancel {
    color: var(--text-secondary);

    &:hover {
      color: var(--text-primary);
    }
  }

  &.go {
    color: var(--primary-color);
    font-weight: 600;

    &:hover {
      background: rgba(var(--primary-color-rgb), 0.09);
    }
  }

  &:active {
    transform: scale(0.95);
  }
}

/* ===== 分支切换器（用户气泡内、多分支时常驻显示）：居中胶囊分页器 ===== */
.ob-branch-switch {
  display: flex;
  align-items: center;
  gap: 1px;
  width: fit-content;
  margin: 9px auto 0;
  padding: 2px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(4px);
  user-select: none;
}

.ob-branch-count {
  min-width: 34px;
  text-align: center;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.3px;
  color: rgba(255, 255, 255, 0.92);
}

.ob-branch-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 21px;
  height: 21px;
  border-radius: 50%;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.85);
  transition: all 0.12s ease;

  .svg-icon {
    font-size: 12px;
  }

  /* 左箭头 = 右箭头水平翻转（图标库未提供 arrow-left） */
  .ob-flip {
    transform: rotate(180deg);
  }

  &:hover {
    background: rgba(255, 255, 255, 0.26);
    color: #fff;
  }

  &:active {
    transform: scale(0.88);
  }
}

.ob-msg-img {
  max-width: 220px;
  max-height: 140px;
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  display: block;
}

/* 用户消息正文内联 # / @ 引用 chip（与 composer 内联 tag 同构：6px 小圆角 + 类型图标）。
   用户气泡为主色渐变底、白字环境：chip 用白色半透明底/边框，目录稍深以示区分；
   file 类可点击预览（手型 + hover 提亮），dir / @ 类仅展示 */
.ob-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  max-width: 220px;
  height: 21px;
  padding: 0 7px;
  margin: 0 1px;
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.38);
  background: rgba(255, 255, 255, 0.18);
  font-size: 12px;
  /* 行高留足 descent 空间（中文字形实际高约 1.3em），防底部被贴边裁切 */
  line-height: 1.4;
  vertical-align: baseline; /* 与正文基线对齐即视觉居中 */
  user-select: none;
  cursor: default;

  /* 类型图标：目录 / 文件（替代 #Folder: #File: 文本前缀）；
     @ 类为 sprite svg（白色随文，替代 @Skill: 等文本前缀） */
  .ob-chip-ico {
    flex-shrink: 0;
    width: 11px;
    height: 11px;
    pointer-events: none;
  }

  .ob-chip-svg {
    fill: currentColor;
  }

  /* 名称部分省略（title 已提示完整路径） */
  span.ob-chip-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* 目录引用：底色稍深 */
  &.dir {
    border-color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.28);
  }

  /* file 类可点击预览（dir / @ 引用类仅展示） */
  &:not(.dir):not(.at) {
    cursor: pointer;
    transition: background 0.12s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.34);
    }

    &:active {
      opacity: 0.8;
    }
  }
}

/* 用户消息文件附件卡片：图标/缩略图 + 文件名 + 类型/大小 */
.ob-msg-files {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 6px;

  &:empty { margin-bottom: 0; }
}

.ob-msg-file {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  padding: 7px 12px 7px 8px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.12);
  max-width: 240px;
}

.ob-msg-file-thumb {
  width: 34px;
  height: 34px;
  border-radius: 6px;
  /* 图片缩略图裁切、类型图标完整显示 */
  object-fit: contain;
  background: rgba(255, 255, 255, 0.9);
  flex-shrink: 0;
  display: block;
}

.ob-msg-file-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.ob-msg-file-name {
  font-size: 12.5px;
  line-height: 1.35;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-msg-file-meta {
  font-size: 10.5px;
  opacity: 0.78;
  user-select: none;
}

/* 模型/供应商错误块：原始报错原样展示 */
.ob-msg-error {
  display: flex;
  align-items: flex-start;
  gap: 7px;
  margin: 2px 0 6px;
  padding: 9px 11px;
  border: 1px solid rgba(230, 62, 62, 0.32);
  border-radius: 10px;
  background: rgba(230, 62, 62, 0.06);
}

.ob-msg-error-ico {
  flex-shrink: 0;
  font-size: 14px;
  margin-top: 2px;
  color: #e63e3e;
}

.ob-msg-error-text {
  font-size: 12px;
  line-height: 1.6;
  color: #c53030;
  white-space: pre-wrap;
  word-break: break-all;
  user-select: text;
}

/* 思考中占位文案 */
.ob-thinking {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 13px;
  color: var(--text-secondary);
  user-select: none;

  /* 主色转圈：等待模型首个内容块（含 ask_user 待回答期间） */
  .ob-think-spin {
    font-size: 13px;
    margin-right: 3px;
    color: var(--primary-color);
    animation: ob-think-rotate 0.9s linear infinite;
  }
}

@keyframes ob-think-rotate {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

.ob-thinking-sec {
  font-variant-numeric: tabular-nums;
  min-width: 24px;
}

/* 流式光标 */
.ob-cursor {
  display: inline-block;
  width: 7px;
  height: 15px;
  margin-left: 3px;
  vertical-align: -2px;
  border-radius: 2px;
  background: var(--primary-color);
  animation: ob-blink 0.9s steps(2) infinite;
}

@keyframes ob-blink {
  50% { opacity: 0; }
}

/* 用户消息 hover 操作：紧贴气泡下缘（padding 内置视觉间距，鼠标划过不丢 hover），
   绝对定位不占文档流（避免气泡多余空行）；nowrap 保证时间较长时不换行 */
.ob-msg-actions {
  position: absolute;
  top: 100%;
  right: 0;
  padding-top: 3px;
  display: flex;
  align-items: center;
  gap: 10px;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
  z-index: 2;
  transition: opacity 0.15s ease;
}

/* 用户消息时间（hover 与操作一起浮现，永不换行、允许向左溢出短气泡） */
.ob-msg-time {
  font-size: 11px;
  color: var(--text-secondary);
  user-select: none;
  white-space: nowrap;
}

/* 用户消息复制 icon（hover 与操作一起浮现） */
.ob-user-copy {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  color: var(--text-secondary);

  .svg-icon {
    font-size: 14px;
  }

  &:hover {
    color: var(--primary-color);
  }
}

/* ===== 助手 meta 行：固定常驻显示（复制 / token / 时间），定高保持布局稳定 ===== */
.ob-msg-meta {
  display: flex;
  align-items: center;
  gap: 10px;
  height: 20px;
  margin-top: 2px;
  user-select: none;
}

.ob-meta-copy,
.ob-meta-act {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  color: var(--text-secondary);

  .svg-icon {
    font-size: 14px;
  }

  &:hover {
    color: var(--primary-color);
  }
}

/* 点赞/点踩选中态：高亮当前项（两者互斥，未选中项保持灰色） */
.ob-meta-act.on {
  color: var(--primary-color);
}

/* ===== 导出格式菜单（文档交付）：锚定导出按钮下方，macOS 毛玻璃小菜单 ===== */
.ob-meta-export {
  position: relative;
  display: inline-flex;
}

.ob-export-menu {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 3001; /* 高于普通内容，低于 Element 弹窗（3200 起） */
  min-width: 172px;
  padding: 5px;
  border: 1px solid var(--border-color);
  border-radius: 10px;
  background: var(--menu-bg, rgba(255, 255, 255, 0.88));
  backdrop-filter: blur(20px) saturate(1.8);
  -webkit-backdrop-filter: blur(20px) saturate(1.8);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16);
  user-select: none;
}

.ob-em-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 7px;
  font-size: 12.5px;
  color: var(--text-primary);
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.09);
  }

  &:active {
    opacity: 0.75;
  }
}

/* 格式色点：md 灰 / docx 蓝 / pdf 红 / html 橙（与产物卡片徽章同色系） */
.ob-em-dot {
  flex-shrink: 0;
  width: 7px;
  height: 7px;
  border-radius: 50%;

  &.md { background: #6b7280; }
  &.docx { background: #2563eb; }
  &.pdf { background: #dc2626; }
  &.html { background: #ea580c; }
}

.ob-em-ext {
  margin-left: auto;
  font-size: 11px;
  color: var(--text-secondary);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

/* 菜单浮现：轻微下沉 + 缩放 */
.ob-em-enter-active,
.ob-em-leave-active {
  transition: opacity 0.14s ease, transform 0.14s ease;
}

.ob-em-enter,
.ob-em-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.97);
}

.ob-meta-text {
  font-size: 11px;
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ===== 上下文压缩摘要分界（默认收起为一行提示，点击展开摘要正文）===== */
.ob-compaction {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 4px 0 10px;
  font-size: 12px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.ob-compaction:hover .ob-compaction-label {
  color: var(--primary-color);
}

/* 展开后的压缩摘要正文：缩进 + 浅背景 + 左侧竖线，突出归属压缩分界 */
.ob-md-compaction {
  padding: 10px 14px;
  margin-bottom: 10px;
  border-left: 2px solid var(--primary-color);
  border-radius: 6px;
  background: var(--bg-secondary, rgba(0, 0, 0, 0.03));
}

.ob-compaction-line {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}

.ob-compaction-ico {
  font-size: 13px;
  color: var(--primary-color);
}

.ob-compaction-meta {
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  opacity: 0.85;
}

.ob-compaction-arrow {
  font-size: 10px;
  transition: transform 0.2s ease;
}

.ob-compaction-arrow.open {
  transform: rotate(180deg);
}

/* ===== 上下文用量迷你条（meta 行内）===== */
.ob-meta-ctx {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.ob-ctx-bar {
  width: 52px;
  height: 4px;
  border-radius: 99px;
  background: rgba(125, 125, 135, 0.18);
  overflow: hidden;
  flex-shrink: 0;
}

.ob-ctx-fill {
  display: block;
  height: 100%;
  border-radius: 99px;
  transition: width 0.3s ease;

  &.ok {
    background: var(--primary-color);
  }

  &.warn {
    background: var(--warning-color);
  }

  &.danger {
    background: #d93025;
  }
}

/* 悬停显示：气泡 hover 或操作条自身 hover 均保持（鼠标从气泡移入按钮不中断） */
.ob-msg.user:hover .ob-msg-actions,
.ob-msg-actions:hover {
  opacity: 1;
  pointer-events: auto;
}

/* ===== Markdown 渲染 ===== */
.ob-md {
  :deep(p) { margin: 0 0 8px; }
  :deep(p:last-child) { margin-bottom: 0; }

  /* 代码块容器内 pre 复位（工具条/边框/圆角由全局 .ob-code 承载；
     本组件旧 pre 样式特异性更高，需在此覆盖） */
  :deep(.ob-code pre) {
    margin: 0;
    border-radius: 0;
    background: transparent;
  }

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

  /* 表格：markdown 渲染已包装为 .ob-table 容器（工具条 / 边框 / 表头背景 / 均匀列宽
     由全局 .ob-table 承载），此处仅归零组件层旧间距避免双重叠加 */
  :deep(.ob-table table) {
    margin: 0;
  }

  :deep(a) {
    color: var(--primary-color);
  }

  :deep(h1), :deep(h2), :deep(h3), :deep(h4) {
    margin: 12px 0 6px;
    font-weight: 700;
  }
}
</style>
