<template>
  <!-- 深度思考区（可折叠）：思考文本 + Skill 激活 + 工具/MCP 调用，聚合于助手回复上方 -->
  <div class="ob-think">
    <!-- 折叠头部：思考中 / 正文生成中均保持动态（星形脉动 + 文案呼吸，标识轮次未结束），
         全部结束后恢复静态并显示步骤数 -->
    <div
      class="ob-think-header"
      :class="{ thinking: isThinking, streaming: isStreaming && !isThinking }"
      @click="toggleCollapse"
    >
      <svg-icon icon-class="sparkle" class="ob-think-hico" />
      <span class="ob-think-title">{{ headerTitle }}</span>
      <span v-if="!isThinking && !isStreaming && stepCount > 0" class="ob-think-count">{{ stepCount }} 个步骤</span>
      <span v-if="!isThinking && !isStreaming && fileChangeCount > 0" class="ob-think-count ob-think-files">
        <svg-icon icon-class="edit" class="ob-think-file-ico" />{{ fileChangeCount }} 个文件变更
      </span>
      <svg-icon
        icon-class="arrow-down"
        class="ob-think-arrow"
        :class="{ collapsed }"
      />
    </div>

    <!-- 内容主体（生成中默认展开、箭头朝下；用户可随时展开收起，待回答 ask 时不允许收起） -->
    <div v-show="!collapsed" class="ob-think-body">
      <template v-for="(item, i) in items">
        <!-- 思考文本（click 委托承接代码块复制按钮） -->
        <div
          v-if="item.type === 'thinking'"
          :key="'thinking-' + i"
          class="ob-think-text"
        >
          <div class="ob-think-md" v-html="rendered(item.content)" @click="onMdClick"></div>
          <span v-if="isThinking && i === items.length - 1" class="ob-cursor"></span>
        </div>

        <!-- 过程说明（中途正文归位：本段正文之后仍有工具调用，收尾正文才进气泡） -->
        <div
          v-else-if="item.type === 'narration'"
          :key="'narration-' + i"
          class="ob-think-text ob-narration"
        >
          <div class="ob-narration-tag">过程说明</div>
          <div class="ob-think-md" v-html="rendered(item.content)" @click="onMdClick"></div>
        </div>

        <!-- Skill 激活 -->
        <div v-else-if="item.type === 'skill'" :key="'skill-' + i" class="ob-skill">
          <svg-icon icon-class="magic-stick" class="ob-skill-ico" />
          <span class="ob-skill-label">SKILL</span>
          <span class="ob-skill-name">{{ item.skillName }}</span>
        </div>

        <!-- ask_user 提问卡片（归位于思考区内，与工具条目同级；问答记录随思考区折叠） -->
        <ask-user-card
          v-else-if="item.type === 'ask'"
          :key="'ask-' + i"
          class="ob-think-ask"
          :message="item"
          @answer="(msg, value) => $emit('ask-answer', msg, value)"
        />

        <!-- 工具调用（含 MCP 工具） -->
        <div v-else-if="item.type === 'tool'" :key="'tool-' + i" class="ob-tool">
          <!-- 摘要行：状态图标三态（运行中 / 错误 / 完成）+ MCP 服务名 + 中文名 + 原始名 tag -->
          <div class="ob-tool-head" :class="{ error: item.isError }" @click="toggleTool(item)">
            <svg-icon
              :icon-class="toolIcon(item)"
              class="ob-tool-ico"
              :class="{ spin: item.status === 'running' }"
            />
            <span v-if="isMcp(item)" class="ob-tool-server">{{ mcpServerLabel(item) }}</span>
            <span class="ob-tool-name">{{ friendlyToolName(item) }}</span>
            <span v-if="rawToolTag(item)" class="ob-tool-tag">{{ rawToolTag(item) }}</span>
            <!-- 等待授权徽标：该工具正在等权限确认（确认条在输入框上方），醒目提示防隐形挂起 -->
            <span
              v-if="item.status === 'running' && matchesPerm(item)"
              class="ob-tool-perm-wait"
              title="等待权限确认：请在输入框上方的确认条中处理"
            >等待授权</span>
            <!-- 文件变更摘要：目标文件 + 类型徽章 + 增删行数 -->
            <template v-if="item.fileChange">
              <span class="ob-fc-file" :title="item.fileChange.file">{{ fcFileShort(item.fileChange) }}</span>
              <span class="ob-fc-type" :class="item.fileChange.type">{{ fcTypeLabel(item.fileChange.type) }}</span>
              <span v-if="fcAdded(item.fileChange) !== null" class="ob-fc-add">+{{ fcAdded(item.fileChange) }}</span>
              <span v-if="fcRemoved(item.fileChange) !== null" class="ob-fc-del">-{{ fcRemoved(item.fileChange) }}</span>
            </template>
            <svg-icon
              v-if="hasDetails(item)"
              icon-class="arrow-down"
              class="ob-tool-arrow"
              :class="{ open: isToolOpen(item) }"
            />
          </div>

          <!-- ask_user 提问卡片：挂接在「询问用户」工具条目上（挂起中可交互，已答显示答案） -->
          <ask-user-card
            v-if="item.ask"
            class="ob-think-ask"
            :message="item.ask"
            @answer="(msg, value) => $emit('ask-answer', msg, value)"
          />

          <!-- 详情：参数区 + 结果区（左侧竖线缩进）；文件变更的双列对比移至消息末尾的
               文件变更汇总面板（点击文件列表弹窗查看，不在思考过程中展开） -->
          <div v-if="isToolOpen(item)" class="ob-tool-detail">
            <!-- 参数区 -->
            <div v-if="hasArgs(item)" class="ob-tool-args">
              <div class="ob-tool-label">参数</div>
              <!-- content 参数单独成块，其余参数渲染为 chips -->
              <template v-if="hasContentArg(item)">
                <div v-if="chipEntries(item).length" class="ob-arg-chips">
                  <span v-for="(e, ci) in chipEntries(item)" :key="ci" class="ob-arg-chip">
                    <span class="ob-arg-key">{{ e.key }}</span>: <span class="ob-arg-val">{{ truncateVal(e.val, 80) }}</span>
                  </span>
                </div>
                <pre class="ob-arg-content">{{ item.args.content }}</pre>
              </template>
              <!-- 无 content 参数：逐参数行展示 -->
              <template v-else>
                <div v-for="(e, ci) in argEntries(item)" :key="ci" class="ob-arg-row">
                  <span class="ob-arg-key">{{ e.key }}</span>
                  <span class="ob-arg-val">{{ truncateVal(e.val, 200) }}</span>
                </div>
              </template>
            </div>

            <!-- 结果区：优先展示流式 partial，运行中尾部带光标；错误态红底红字 -->
            <div v-if="hasResult(item)" class="ob-tool-result-block">
              <div class="ob-tool-label" :class="{ error: item.isError }">{{ item.isError ? '错误' : '结果' }}</div>
              <!-- web 工具结果按 Markdown 渲染（搜索结果为链接列表，链接交系统浏览器） -->
              <div
                v-if="isWebTool(item)"
                class="ob-tool-result ob-tool-result-md"
                :class="{ error: item.isError }"
                v-html="rendered(truncatedResult(item))"
                @click="onMdClick"
              ></div>
              <div v-else class="ob-tool-result" :class="{ error: item.isError }">
                {{ truncatedResult(item) }}<span v-if="isResultStreaming(item)" class="ob-cursor"></span>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>
  </div>
</template>

<script>
// OmniBuddy 深度思考区：思考过程 / Skill 激活 / 工具(含 MCP) / ask_user 提问 的聚合渲染
import { renderMarkdown, handleCodeCopy, handleTableCsv } from '@/utils/markdown'
import AskUserCard from './AskUserCard.vue'

// 内置工具的中文短名（与 builtin-tools.js / pi.js registerTool 的 label 对齐；
// MCP 工具走 mcpServerLabel + 原始工具名）
const TOOL_LABELS = {
  read: '读取文件',
  write: '写入文件',
  edit: '编辑文件',
  multi_edit: '批量编辑',
  append: '追加内容',
  mkdir: '创建目录',
  bash: '执行命令',
  powershell: '执行命令(PowerShell)',
  python: '运行 Python',
  node: '运行 Node.js',
  curl: '发起请求',
  find: '查找文件',
  glob: '查找文件',
  grep: '搜索内容',
  ls: '列出目录',
  cd: '切换目录',
  todo_write: '更新任务清单',
  todo_read: '查看任务清单',
  ask_user: '询问用户',
  // pi-web-access（联网搜索扩展）
  web_search: '联网搜索',
  fetch_content: '抓取网页',
  source_check: '核实来源',
  // 文档交付（P1：doc_export 自研 + pi-markdown-preview）
  doc_export: '导出文档',
  preview_export: '生成预览'
}

export default {
  name: 'ThinkingSection',
  components: { AskUserCard },
  props: {
    // 有序内容块：{ type: 'thinking' | 'skill' | 'tool' | 'ask', ... }
    items: {
      type: Array,
      default: () => []
    },
    // 正在思考（实时接收 thinking 内容）
    isThinking: {
      type: Boolean,
      default: false
    },
    // 助手回复正在流式生成
    isStreaming: {
      type: Boolean,
      default: false
    },
    // 队首待确认权限（工具卡片据此显示"等待授权"：tool_execution_start 先于权限检查
    // 发射，等待授权的工具卡片与执行中外观一致，用户无从得知回合卡在确认上）
    permPending: {
      type: Object,
      default: null
    }
  },
  data() {
    return {
      // 默认收起（含生成中；头部仍有动态标识轮次进度）；此后由用户自由展开收起
      collapsed: true,
      toolOpenOverrides: {}
    }
  },
  watch: {
    // 系统等待用户回答时思考区不允许保持收起（提问卡片必须可见：
    // 历史加载时初始即有待回答 ask 的场景）
    hasPendingAsk: {
      immediate: true,
      handler(v) {
        if (v) this.collapsed = false
      }
    }
  },
  computed: {
    // 步骤数：工具与 Skill 计数（思考文本不计）
    stepCount() {
      return this.items.filter(i => i.type === 'tool' || i.type === 'skill').length
    },
    // 是否存在待回答的 ask_user 卡片（独立暂存条目或挂接在工具条目上）：
    // 系统正等待用户输入，思考区不允许被折叠隐藏
    hasPendingAsk() {
      return this.items.some(i =>
        (i.type === 'ask' && !i.answered) || (i.type === 'tool' && i.ask && !i.ask.answered)
      )
    },
    // 本轮文件变更数（写工具产生的有效变更）
    fileChangeCount() {
      return this.items.filter(i => i.type === 'tool' && i.fileChange).length
    },
    // 头部文案：思考中 / 执行操作中（有运行中工具，含等待授权）/ 正文生成中 / 已完成
    // （与动态类同步区分轮次阶段；interleaved 输出下正文已出现但工具仍在跑时，
    //   "回答生成中"会误导用户以为卡在正文生成，实际在等工具/权限）
    headerTitle() {
      if (this.isThinking) return '深度思考中…'
      if (this.isStreaming && this.hasRunningTool) return '正在执行操作…'
      if (this.isStreaming) return '回答生成中…'
      return '已深度思考'
    },
    // 是否有运行中的工具（含等待授权：status 均为 running）
    hasRunningTool() {
      return this.items.some(i => i.type === 'tool' && i.status === 'running')
    }
  },
  methods: {
    toggleCollapse() {
      // 存在待回答的 ask 卡片时不允许收起（提问卡片不能被折叠隐藏）
      if (!this.collapsed && this.hasPendingAsk) return
      this.collapsed = !this.collapsed
    },
    // Markdown 区点击委托：链接拦截 + 代码块复制按钮（v-html 内容不归 Vue 管，走事件委托）
    onMdClick(e) {
      // 链接不导航应用窗口（伪链接如 http://entries.md 会白屏）：合法外链交系统浏览器
      const anchor = e.target.closest && e.target.closest('a')
      if (anchor) {
        e.preventDefault()
        const href = anchor.getAttribute('href') || ''
        if (/^https?:\/\//i.test(href)) window.open(href, '_blank')
        return
      }
      handleCodeCopy(e).then(ok => {
        if (ok) this.$message.success('已复制')
      })
      handleTableCsv(e).then(ok => {
        if (ok) this.$message.success('已下载 CSV')
      })
    },
    rendered(text) {
      return renderMarkdown(text || '')
    },
    isMcp(item) {
      const name = item.toolName
      if (!name) return false
      // 单代理工具名即为 'mcp'（server 在 args.server）；其余为 mcp__ 前缀变体
      return name === 'mcp' || name.indexOf('mcp_') === 0
    },
    // server 名提取（展示连接器 label，如 playwright，而非 'mcp' 字样）：
    // 单代理 'mcp' → args.server；命名空间代理 'mcp__playwright' → playwright；
    // 三段式 'mcp__server__tool' → server
    mcpServerLabel(item) {
      const name = item.toolName
      if (!name) return ''
      if (name === 'mcp') return (item.args && item.args.server) || 'MCP'
      if (name.indexOf('mcp_') === 0) {
        const rest = name.slice(4).replace(/^_+/, '')
        const sep = rest.indexOf('__')
        return sep >= 0 ? rest.slice(0, sep) : rest
      }
      return ''
    },
    // 底层工具名提取：代理/命名空间代理调用优先 args.tool，三段式从名称尾部提取
    mcpToolName(item) {
      const at = item.args && item.args.tool
      if (typeof at === 'string' && at) return at
      const name = item.toolName
      if (name && name.indexOf('mcp_') === 0) {
        const rest = name.slice(4).replace(/^_+/, '')
        const sep = rest.indexOf('__')
        if (sep >= 0) return rest.slice(sep + 2)
      }
      return ''
    },
    // 原始工具名 tag（与主标题相同时不显示）
    rawToolTag(item) {
      const name = item.toolName
      if (!name) return ''
      let raw = name
      if (name === 'mcp' || name.indexOf('mcp_') === 0) {
        raw = this.mcpToolName(item)
      }
      return raw && raw !== this.friendlyToolName(item) ? raw : ''
    },
    friendlyToolName(item) {
      const name = item.toolName
      if (!name) return '工具调用'
      if (name === 'mcp' || name.indexOf('mcp_') === 0) {
        const server = this.mcpServerLabel(item)
        let tool = this.mcpToolName(item)
        // 底层工具名可能带 server 前缀（如 playwright_browser_navigate），剥离保持简洁
        if (tool && server && server !== 'MCP' && tool.indexOf(server + '_') === 0) {
          tool = tool.slice(server.length + 1)
        }
        if (tool) return TOOL_LABELS[tool] || tool
        // 无底层工具名（search / status 等网关操作）
        return '连接器操作'
      }
      return TOOL_LABELS[name] || name
    },
    // 摘要行状态图标：运行中 loading / 错误 warning-outline / 完成 check
    toolIcon(item) {
      if (item.status === 'running') return 'loading'
      if (item.isError) return 'warning-outline'
      return 'check'
    },
    // 运行中的工具是否即当前待确认权限的目标：bash 类按 command、文件类按 path 匹配，
    // 其余按工具名兜底（并发工具时区分"在执行"与"在等授权"）
    matchesPerm(item) {
      const p = this.permPending
      if (!p) return false
      const args = item.args || {}
      if (p.command && args.command === p.command) return true
      if (p.path && (args.file_path === p.path || args.path === p.path)) return true
      if (p.toolName && item.name === p.toolName) return true
      return false
    },
    hasArgs(item) {
      return !!(item.args && typeof item.args === 'object' && Object.keys(item.args).length)
    },
    // args.content 为非空字符串：content 单独成块，其余参数走 chips
    hasContentArg(item) {
      return !!(item.args && typeof item.args.content === 'string' && item.args.content.length)
    },
    // 参数键值对列表（skipContent：跳过 content 键）
    argEntries(item, skipContent) {
      const args = item.args
      if (!args || typeof args !== 'object') return []
      return Object.keys(args)
        .filter(k => !(skipContent && k === 'content'))
        .map(k => ({ key: k, val: args[k] }))
    },
    // chips 参数（hasContentArg 时排除 content）
    chipEntries(item) {
      return this.argEntries(item, true)
    },
    // 参数值截断：对象先序列化，超长截断加省略号
    truncateVal(v, max) {
      let s = v
      if (s !== null && typeof s === 'object') {
        try {
          s = JSON.stringify(s)
        } catch (e) {
          s = String(s)
        }
      }
      s = String(s)
      return s.length > max ? s.slice(0, max) + '…' : s
    },
    // 是否有可展示的结果（流式 partial 优先）
    hasResult(item) {
      return !!(item.partial || item.result)
    },
    // 联网工具（pi-web-access）：结果为 Markdown（链接列表/网页摘要），按富文本渲染
    isWebTool(item) {
      return ['web_search', 'fetch_content', 'source_check'].indexOf(item.toolName) >= 0
    },
    // 结果文本：超 500 字截断加省略号
    truncatedResult(item) {
      const raw = item.partial || item.result || ''
      // 兜底：结构化结果序列化展示（正常已由主进程规整为字符串）
      const s = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
      return s.length > 500 ? s.slice(0, 500) + '…' : s
    },
    // 结果仍在流式输出（运行中且有 partial）：尾部显示光标
    isResultStreaming(item) {
      return item.status === 'running' && !!item.partial
    },
    hasDetails(item) {
      return this.hasArgs(item) || this.hasResult(item) || !!item.fileChange
    },
    toolKey(item) {
      return item.toolCallId || (item.toolName + '::' + (item.args ? JSON.stringify(item.args).slice(0, 40) : ''))
    },
    isToolOpen(item) {
      // 默认收起（错误时默认展开）；用户手动操作后以 override 为准
      const key = this.toolKey(item)
      if (Object.prototype.hasOwnProperty.call(this.toolOpenOverrides, key)) {
        return this.toolOpenOverrides[key]
      }
      return !!item.isError
    },
    toggleTool(item) {
      this.$set(this.toolOpenOverrides, this.toolKey(item), !this.isToolOpen(item))
    },
    // ===== 文件变更记录（P2）=====
    // 变更类型中文标签
    fcTypeLabel(t) {
      return { created: '新建', modified: '修改', deleted: '删除', mkdir: '新建目录' }[t] || '变更'
    },
    // 摘要行文件名（取末段路径，完整路径见 title 提示）
    fcFileShort(fc) {
      const f = fc.file || ''
      const parts = f.split('/')
      return parts.length > 1 ? parts[parts.length - 1] : f
    },
    // 新增行数（-1 = 超限未知 → 不显示数字）
    fcAdded(fc) {
      return typeof fc.added === 'number' && fc.added >= 0 ? fc.added : null
    },
    fcRemoved(fc) {
      return typeof fc.removed === 'number' && fc.removed >= 0 ? fc.removed : null
    }
  }
}
</script>

<style lang="scss" scoped>
.ob-think {
  margin-bottom: 8px;
}

/* ===== 折叠头部 ===== */
.ob-think-header {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 8px;
  margin-left: -8px;
  border-radius: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease;

  &:hover {
    background: var(--search-bg-hover, rgba(0, 0, 0, 0.04));
  }

  .ob-think-hico {
    font-size: 12px;
    color: var(--text-secondary);
  }

  /* 思考中 / 正文流式生成中：星形主色 + 呼吸脉动（标识本轮问答尚未结束） */
  &.thinking,
  &.streaming {
    .ob-think-hico {
      color: var(--primary-color);
      animation: ob-think-pulse 1.2s ease-in-out infinite;
    }

    .ob-think-title {
      animation: ob-think-breath 1.2s ease-in-out infinite;
    }
  }

  .ob-think-title {
    font-weight: 500;
  }

  .ob-think-count {
    font-size: 12px;
    color: var(--text-secondary);
    opacity: 0.75;
  }

  .ob-think-arrow {
    font-size: 10px;
    color: var(--text-secondary);
    transition: transform 0.2s ease;

    &.collapsed {
      transform: rotate(-90deg);
    }
  }
}

/* ===== 内容主体（缩进体现层级） ===== */
.ob-think-body {
  margin-top: 4px;
  padding-left: 12px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

/* 工具运行中图标旋转 */
@keyframes ob-tool-rotate {
  to { transform: rotate(360deg); }
}

/* 思考中呼吸动画：星形脉动 / 标题明暗（标识生成未结束） */
@keyframes ob-think-pulse {
  0%,
  100% {
    transform: scale(1);
    opacity: 1;
  }

  50% {
    transform: scale(1.22);
    opacity: 0.55;
  }
}

@keyframes ob-think-breath {
  0%,
  100% {
    opacity: 1;
  }

  50% {
    opacity: 0.55;
  }
}

/* 思考区内的 ask_user 卡片：清除独立消息态的左移避让（思考区已有缩进）；
   挂接态（工具条目内）与头部摘要行拉开间距 */
.ob-think-ask {
  margin-top: 5px;

  :deep(.ob-ask-card){
    margin-left: 0;
  }
}

/* 思考文本 */
.ob-think-text {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);

  .ob-think-md {
    ::v-deep {
      p { margin: 0 0 4px; }
      p:last-child { margin-bottom: 0; }

      /* 有序/无序列表：与正文 .ob-md 同款缩进（浏览器默认 40px 过大，
         编号会凸出思考文本对齐线，视觉上脱离思考区） */
      ul, ol {
        padding-left: 18px;
        margin: 4px 0;

        li { margin: 2px 0; }
      }

      /* 代码块（与正文 .ob-code 同构，思考区整体小一号、底色更淡） */
      .ob-code {
        margin: 6px 0;
        border: 1px solid var(--border-color);
        border-radius: 8px;
        overflow: hidden;
        background: rgba(0, 0, 0, 0.025);
      }

      .ob-code-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 2px 4px 2px 10px;
        background: rgba(0, 0, 0, 0.04);
        border-bottom: 1px solid var(--border-color);
        user-select: none;
      }

      .ob-code-lang {
        font-size: 10.5px;
        color: var(--text-secondary);
        font-family: 'SF Mono', Menlo, Consolas, monospace;
      }

      .ob-code-copy {
        font-size: 11px;
        color: var(--text-secondary);
        cursor: pointer;
        padding: 1px 7px;
        border-radius: 5px;
        transition: all 0.12s ease;

        &:hover {
          color: var(--primary-color);
          background: rgba(var(--primary-color-rgb), 0.09);
        }
      }

      .ob-code pre {
        margin: 0;
        padding: 7px 10px;
        border-radius: 0;
        background: transparent;
        font-size: 11.5px;
        line-height: 1.55;

        code {
          background: transparent;
          padding: 0;
          font-family: 'SF Mono', Menlo, Consolas, monospace;
        }
      }
    }
  }
}

/* 过程说明（中途正文归位块）：思考文本样式 + 小标签区分 */
.ob-narration {
  .ob-narration-tag {
    display: inline-block;
    font-size: 10.5px;
    line-height: 1.5;
    color: var(--text-secondary);
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    padding: 0 6px;
    margin-bottom: 3px;
  }
}

/* Skill 行 */
.ob-skill {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 0;

  .ob-skill-ico {
    font-size: 12px;
    color: #8B5CF6;
  }

  .ob-skill-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    color: #8B5CF6;
  }

  .ob-skill-name {
    font-size: 13px;
    font-weight: 500;
    color: #7C3AED;
  }
}

/* 工具卡片 */
.ob-tool {
  display: flex;
  flex-direction: column;
}

/* 摘要行 */
.ob-tool-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 22px;
  padding: 2px 0;
  cursor: pointer;
  user-select: none;

  .ob-tool-ico {
    font-size: 13px;
    flex-shrink: 0;
    color: var(--success-color);

    /* 运行中：loading 图标持续旋转（与正文思考占位 ob-think-spin 同构） */
    &.spin {
      color: var(--primary-color);
      animation: ob-tool-rotate 0.9s linear infinite;
    }
  }

  &.error .ob-tool-ico { color: var(--danger-color); }

  /* MCP 服务名前缀 */
  .ob-tool-server {
    font-size: 11.5px;
    color: #0D9488;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .ob-tool-name {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .ob-tool-tag {
    font-size: 10.5px;
    color: var(--text-secondary);
    background: rgba(0, 0, 0, 0.05);
    border-radius: 4px;
    padding: 1px 6px;
    white-space: nowrap;
    flex-shrink: 0;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
  }

  /* 等待授权徽标：琥珀色 pill + 呼吸动画，提示回合卡在权限确认而非命令执行 */
  .ob-tool-perm-wait {
    font-size: 10.5px;
    color: #b45309;
    background: rgba(245, 158, 11, 0.14);
    border: 1px solid rgba(245, 158, 11, 0.35);
    border-radius: 4px;
    padding: 0 6px;
    white-space: nowrap;
    flex-shrink: 0;
    line-height: 16px;
    cursor: help;
    animation: ob-perm-wait-pulse 1.6s ease-in-out infinite;
  }

  @keyframes ob-perm-wait-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.55; }
  }

  .ob-tool-arrow {
    font-size: 10px;
    color: var(--text-secondary);
    transition: transform 0.2s ease;

    &.open { transform: rotate(180deg); }
  }
}

/* 详情容器（左侧 2px 竖线缩进） */
.ob-tool-detail {
  margin: 2px 0 4px 20px;
  padding-left: 12px;
  border-left: 2px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* 区块标签（参数 / 结果 / 错误） */
.ob-tool-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 4px;

  &.error { color: var(--danger-color); }
}

/* ===== 参数区 ===== */
.ob-tool-args {
  display: flex;
  flex-direction: column;
}

/* chips 行（content 单独成块时，其余参数以 chips 展示） */
.ob-arg-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}

.ob-arg-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  max-width: 100%;
  padding: 2px 7px;
  border-radius: 4px;
  background: var(--card-bg, #fff);
  border: 1px solid var(--border-color);
  font-size: 10.5px;
  line-height: 1.5;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  color: var(--text-primary);
  word-break: break-all;
}

/* content 参数块（可滚动） */
.ob-arg-content {
  margin: 6px 0 0;
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
  font-size: 11.5px;
  line-height: 1.55;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  color: var(--text-primary);
}

/* 逐参数行（无 content 参数时） */
.ob-arg-row {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-size: 11.5px;
  line-height: 1.6;
  padding: 1px 0;

  .ob-arg-key {
    flex-shrink: 0;
    width: 72px;
    color: #0284C7;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    word-break: break-all;
  }

  .ob-arg-val {
    flex: 1;
    min-width: 0;
    color: var(--text-primary);
    word-break: break-all;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
  }
}

/* ===== 结果区 ===== */
.ob-tool-result {
  padding: 8px 10px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.04);
  font-size: 11.5px;
  line-height: 1.55;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
  color: var(--text-primary);

  /* 错误态：红底红字 */
  &.error {
    background: rgba(var(--danger-color-rgb),  0.08);
    color: var(--danger-color);
  }
}

/* 联网工具结果：正文体（Markdown 渲染），放宽高度展示链接列表 */
.ob-tool-result-md {
  font-family: inherit;
  white-space: normal;
  max-height: 260px;

  ::v-deep {
    p { margin: 0 0 5px; }
    p:last-child { margin-bottom: 0; }
    ul, ol { padding-left: 18px; margin: 4px 0; }
    li { margin: 2px 0; }
    a { color: var(--primary-color); }
  }
}

/* 流式光标 */
.ob-cursor {
  display: inline-block;
  width: 6px;
  height: 13px;
  margin-left: 2px;
  vertical-align: -2px;
  border-radius: 2px;
  background: var(--primary-color);
  animation: ob-think-blink 0.9s steps(2) infinite;
}

@keyframes ob-think-blink {
  50% { opacity: 0; }
}

/* ===== 文件变更记录 ===== */
/* 头部"N 个文件变更"计数 */
.ob-think-files {
  display: inline-flex;
  align-items: center;
  gap: 3px;

  .ob-think-file-ico {
    font-size: 11px;
  }
}

/* 摘要行：文件名 + 类型徽章 + 增删行数 */
.ob-fc-file {
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11.5px;
  color: var(--text-secondary);
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

.ob-fc-type {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;

  &.created, &.mkdir {
    color: var(--success-color);
    background: rgba(var(--success-color-rgb),  0.12);
  }

  &.modified {
    color: #0284C7;
    background: rgba(2, 132, 199, 0.12);
  }

  &.deleted {
    color: var(--danger-color);
    background: rgba(var(--danger-color-rgb),  0.12);
  }
}

.ob-fc-add,
.ob-fc-del {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

.ob-fc-add { color: var(--success-color); }
.ob-fc-del { color: var(--danger-color); }
</style>
