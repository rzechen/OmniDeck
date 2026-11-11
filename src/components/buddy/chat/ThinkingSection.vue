<template>
  <!-- 深度思考区（思考组折叠单元模型）：
       流式输出中：顶部「已执行 N 秒/N 分 N 秒」+ 一行执行摘要，各组默认收起；
       完成后：顶部「✓ 已完成 · 人性化时长 ⌄」，默认全部收起，点击顶部统一展开；
       每个思考组头部：小图标 + 摘要（收起时）/「思考过程」（展开时，位置不动）+ 箭头，控制
       本组全部内容（思考正文 + 工具 / 技能卡片），各组互不影响 -->
  <div class="thinking-section">
    <!-- 区块总状态行（流式中：已执行时长 + 摘要；完成后：已完成 + 耗时，点击统一折叠 / 展开） -->
    <div
      v-if="isStreaming || groups.length"
      class="section-head"
      :class="{
        'is-streaming': isStreaming,
        'has-summary': isStreaming && !!sectionExcerpt,
        'is-collapsed': !isStreaming && sectionCollapsed
      }"
      @click="onSectionHeadClick"
    >
      <template v-if="isStreaming">
        <span class="sh-done">已执行 {{ fmtDuration(seconds) }}<svg-icon
          icon-class="arrow-down"
          class="sh-arrow"
          :class="{ 'is-collapsed': !streamExpanded }"
        /></span>
        <span v-if="sectionExcerpt" class="sh-summary">
          <svg-icon icon-class="memory" class="sh-summary-ico" />
          <span class="sh-summary-text">{{ sectionExcerpt }}</span>
        </span>
      </template>
      <template v-else>
        <svg-icon icon-class="circle-check" class="sh-ico" />
        <span class="sh-status">已完成</span>
        <span v-if="seconds" class="sh-sec">· {{ fmtDuration(seconds) }}</span>
        <svg-icon icon-class="arrow-down" class="sh-arrow" :class="{ 'is-collapsed': sectionCollapsed }" />
      </template>
    </div>

    <!-- 思考组明细：流式中默认整体收起（仅顶部「已执行 时长」+ 摘要），
         点击顶部状态行可临时展开；完成后默认全部收起，点击顶部统一展开 -->
    <div
      v-for="(group, gi) in groups"
      v-show="groupsVisible"
      :key="groupKey(group, gi)"
      class="think-unit"
      :class="'group-type-' + group.groupType"
    >
      <div v-if="group.thinkingNo" class="unit-header" @click="toggleGroup(gi)">
        <svg-icon icon-class="memory" class="uh-icon" :class="{ pulsing: isGroupActive(group) }" />
        <span
          class="uh-excerpt"
          :class="{ pulsing: isGroupActive(group) }"
        >{{ isGroupCollapsed(group, gi) ? groupExcerpt(group) : '思考过程' }}</span>
        <svg-icon icon-class="arrow-down" class="uh-chevron" :class="{ 'is-collapsed': isGroupCollapsed(group, gi) }" />
      </div>
      <!-- 组内容（思考正文 + 工具 / 技能 / 代码 / 问答卡片）：跟随本组折叠 -->
      <div class="unit-body" v-show="!isGroupCollapsed(group, gi)">
        <template v-for="(item, ii) in group.items">
          <!-- A. 思考正文：完整渲染（markdown），随本组折叠 -->
          <div
            v-if="isTextItem(item) && String(item.content || '').trim()"
            :key="'t' + ii"
            class="think-text think-md"
            v-html="renderedCached(item, item.content)"
            @click="onMdClick"
          ></div>

          <!-- B. Skill 激活（全宽浅灰卡片：✓ 加载技能 + 技能名） -->
          <div v-else-if="item.type === 'skill'" :key="'s' + ii" class="tool-item">
            <div class="tool-summary-line is-static">
              <svg-icon icon-class="circle-check" class="tool-status-icon success" />
              <span class="tool-name">加载技能</span>
              <span class="tool-name-tag">{{ item.skillName }}</span>
            </div>
          </div>

          <!-- C. 正文代码块（OmniDeck 特有：MessageBubble 从助手正文拆出收入）：
               随所属思考组折叠，markdown 渲染（代码复制 / 放大按钮可用） -->
          <div v-else-if="item.type === 'code'" :key="'c' + ii" class="code-item">
            <div class="think-md" v-html="renderedCached(item, codeFence(item))" @click="onMdClick"></div>
          </div>

          <!-- D. 已答 ask_user 问答记录：随所属思考组折叠
               （待答的在区块末尾恒可见，不随组折叠） -->
          <ask-user-card
            v-else-if="item.type === 'ask' && item.answered"
            :key="'a' + ii"
            class="ob-think-ask"
            :message="item"
            @answer="(msg, value) => emit('ask-answer', msg, value)"
          />

          <!-- E. 工具调用（单行摘要，点击展开详情） -->
          <div v-else-if="item.type === 'tool'" :key="'k' + toolKey(item)" class="tool-item">
            <div class="tool-summary" @click="toggleTool(item)">
              <div class="tool-summary-line">
                <!-- 专家徽标（与 SKILL / MCP 对称的类别标识） -->
                <span v-if="isDelegateTool(item)" class="tool-badge agent">
                  <span class="badge-label">AGENT</span>
                </span>
                <svg-icon
                  v-if="isToolStreaming(item)"
                  icon-class="loading"
                  class="tool-status-icon executing spin"
                />
                <svg-icon
                  v-else
                  :icon-class="item.isError ? 'circle-close' : 'circle-check'"
                  :class="['tool-status-icon', item.isError ? 'failed' : 'success']"
                />

                <!-- MCP 徽标（与 SKILL 行标识对称：图标 + MCP + 服务名） -->
                <span v-if="isMcp(item)" class="tool-badge mcp">
                  <svg-icon icon-class="mcp" class="badge-ico" />
                  <span class="badge-label">MCP</span>
                  <span class="badge-name">{{ mcpServerLabel(item) }}</span>
                </span>
                <span class="tool-name" :class="{ executing: isToolStreaming(item) }">{{ friendlyToolName(item) }}</span>
                <!-- subagent 委派目标专员名：并行多卡片时一眼区分各 agent -->
                <span v-if="subagentAgent(item)" class="tool-name-tag tool-agent-tag">{{ subagentAgent(item) }}</span>
                <span v-if="rawToolTag(item)" class="tool-name-tag">{{ rawToolTag(item) }}</span>

                <!-- 等待授权徽标（OmniDeck 专属）：该工具正在等权限确认（确认条在输入框上方） -->
                <span
                  v-if="isToolStreaming(item) && matchesPerm(item)"
                  class="ob-tool-perm-wait"
                  title="等待权限确认：请在输入框上方的确认条中处理"
                >等待授权</span>
                <!-- 文件变更摘要（OmniDeck 专属）：目标文件 + 类型徽章 + 增删行数 -->
                <template v-if="item.fileChange">
                  <span class="ob-fc-file" :title="item.fileChange.file">{{ fcFileShort(item.fileChange) }}</span>
                  <span class="ob-fc-type" :class="item.fileChange.type">{{ fcTypeLabel(item.fileChange.type) }}</span>
                  <span v-if="fcAdded(item.fileChange) !== null" class="ob-fc-add">+{{ fcAdded(item.fileChange) }}</span>
                  <span v-if="fcRemoved(item.fileChange) !== null" class="ob-fc-del">-{{ fcRemoved(item.fileChange) }}</span>
                </template>

                <svg-icon
                  v-if="hasToolDetails(item)"
                  icon-class="arrow-right"
                  class="tool-chevron"
                  :class="{ 'is-open': isToolOpen(item) }"
                />
              </div>
            </div>

            <!-- 站点登录引导（OmniDeck 专属）：撞登录墙上报后内嵌一键入口 -->
            <div v-if="item.siteLogin" class="ob-tool-login" :class="{ 'is-logged': item.siteLogin.loggedIn }">
              <svg-icon icon-class="browser" class="ob-tool-login-ico" />
              <span class="ob-tool-login-text">
                {{ item.siteLogin.loggedIn ? '「' + item.siteLogin.host + '」已登录' : '「' + item.siteLogin.host + '」需要登录' }}
              </span>
              <el-button
                v-if="!item.siteLogin.loggedIn"
                size="small"
                round
                type="primary"
                :plain="!isWizardOpen(item.siteLogin.host)"
                class="ob-tool-login-btn"
                @click="openLoginWizard(item)"
              >{{ isWizardOpen(item.siteLogin.host) ? '登录中…' : '打开登录向导' }}</el-button>
            </div>

            <!-- 已答 ask_user 问答记录（挂接在「询问用户」工具条目上；待答的在区块末尾） -->
            <ask-user-card
              v-if="item.ask && item.ask.answered"
              class="ob-think-ask"
              :message="item.ask"
              @answer="(msg, value) => emit('ask-answer', msg, value)"
            />

            <!-- workflow 后台运行进度（OmniDeck 专属）：紧凑卡片内嵌，随思考组折叠 -->
            <workflow-panel
              v-if="item.workflow"
              class="ob-think-wf"
              :workflows="[item.workflow]"
              compact
            />

            <!-- 工具详情（在摘要行基础上进一步缩进，体现层级） -->
            <div v-if="isToolOpen(item)" class="tool-details">
              <!-- 参数 -->
              <div v-if="hasArgs(item)" class="tool-block args-block">
                <div class="block-label">参数</div>
                <template v-if="hasContentArg(item)">
                  <div v-if="Object.keys(nonContentArgs(item.args)).length" class="arg-chips">
                    <span v-for="(v, k) in nonContentArgs(item.args)" :key="k" class="arg-chip">
                      <span class="chip-key">{{ k }}</span>: <span class="chip-val">{{ truncate(v, 80) }}</span>
                    </span>
                  </div>
                  <div class="content-preview">
                    <pre class="content-pre">{{ item.args.content }}</pre>
                  </div>
                </template>
                <template v-else>
                  <div v-for="(v, k) in item.args" :key="k" class="arg-row">
                    <span class="arg-key">{{ k }}</span>
                    <span class="arg-val">{{ truncate(v, 200) }}</span>
                  </div>
                </template>
              </div>

              <!-- 结果 -->
              <div v-if="hasResult(item)" class="tool-block result-block" :class="{ error: item.isError }">
                <div class="block-label">结果</div>
                <!-- 含 Markdown 表格的结果按富文本渲染（卡片工具条 + 表头样式）；
                     错误态保持纯文本红字 -->
                <div
                  v-if="!item.isError && hasMdTable(resultText(item))"
                  class="result-text think-md"
                  v-html="renderedCached(item, resultText(item))"
                  @click="onMdClick"
                ></div>
                <div v-else class="result-text">
                  {{ truncatedResult(item) }}<span v-if="isResultStreaming(item)" class="cursor-blink"></span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- 待答 ask_user 提问卡片：恒可见（系统在等用户输入，不随组折叠） -->
    <ask-user-card
      v-for="(pa, pi) in pendingAsks"
      :key="'pa-' + pi"
      class="ob-think-ask ob-think-ask-pending"
      :message="pa"
      @answer="(msg, value) => emit('ask-answer', msg, value)"
    />
  </div>
</template>

<script setup>
// OmniBuddy 深度思考区：思考过程 / Skill 激活 / 工具(含 MCP) / ask_user 提问 / 正文代码块
// 的聚合渲染。分组折叠单元模型与样式交互复刻自 autonomous-agent 项目 ThinkingSection。
import { ref, computed, onBeforeUnmount, watch } from 'vue'
import { renderMarkdown, handleCodeCopy, handleTableCsv } from '@/utils/ui/markdown'
import { buddyApi } from '@/utils/buddy/buddy-api'
import { bus } from '@/utils/ui/bus'
import { useFeedback } from '@/composables/useFeedback'
import AskUserCard from './AskUserCard.vue'
import WorkflowPanel from './WorkflowPanel.vue'

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
  // pi 1.0.0 内置编排 / 检索工具
  codemode: '脚本编排',
  tool_search: '检索工具',
  todo_write: '更新任务清单',
  todo_read: '查看任务清单',
  ask_user: '询问用户',
  // pi-web-access（联网搜索扩展）
  web_search: '联网搜索',
  fetch_content: '抓取网页',
  source_check: '核实来源',
  // 文档交付（doc_export 自研 + pi-markdown-preview）
  doc_export: '导出文档',
  preview_export: '生成预览',
  // 站点登录态上报（builtin-tools.js 注册）
  report_site_auth: '上报站点登录态',
  // pi-subagents 委派与运行时配套
  subagent: '子任务委派',
  bg_wait: '等待后台任务',
  contact_supervisor: '联系父会话',
  structured_output: '提交结构化输出',
  subagent_supervisor: '监督专家',
  // 语义记忆（pi-memory 扩展注册）
  memory_write: '写入记忆',
  memory_read: '读取记忆',
  memory_search: '检索记忆',
  memory_forget: '遗忘记忆',
  memory_restore: '恢复记忆',
  scratchpad: '草稿清单',
  memory_status: '记忆体检',
  // 凭据取用（pi.js 内联注册）
  credential_get: '取用凭据',
  // 图像生成（pi 1.0.0）
  generate_image: '生成图片',
  // 深度研究（pi-dynamic-workflows 扩展注册）
  workflow: '编排工作流',
  workflow_control: '控制工作流',
  // 联网伴随读取（pi-web-access）
  get_search_content: '调取搜索结果',
  // 电脑控制（builtin-tools.js 注册）
  computer_screenshot: '截取屏幕',
  computer_look: '观察屏幕',
  computer_click: '点击屏幕',
  computer_double_click: '双击屏幕',
  computer_type: '键入文字',
  computer_key: '按快捷键',
  computer_scroll: '滚动屏幕',
  computer_open: '打开应用/链接',
  computer_wait: '等待画面',
  computer_activate: '切换前台应用',
  computer_hover: '悬停屏幕',
  computer_drag: '拖拽屏幕'
}

defineOptions({ name: 'ThinkingSection' })

const props = defineProps({
  // 有序内容块：{ type: 'thinking' | 'narration' | 'skill' | 'tool' | 'ask' | 'code', ... }
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
  },
  // 本轮耗时（秒）：区块总状态行「已完成 · 时长」/「已执行 时长」展示（fmtDuration 人性化换算）
  seconds: {
    type: Number,
    default: 0
  }
})

const emit = defineEmits(['ask-answer'])

const { message } = useFeedback()

// 耗时人性化换算（与 WorkflowPanel.fmtDuration 同风格）：
// <1 分钟 → N 秒；<1 小时 → N 分 N 秒；≥1 小时 → N 小时 N 分（尾部零单位省略）
function fmtDuration(sec) {
  const v = Math.max(0, Math.round(sec || 0))
  if (v < 60) return v + ' 秒'
  const m = Math.floor(v / 60)
  const s = v % 60
  if (m < 60) return s ? m + ' 分 ' + s + ' 秒' : m + ' 分钟'
  const h = Math.floor(m / 60)
  const mm = m % 60
  return mm ? h + ' 小时 ' + mm + ' 分' : h + ' 小时'
}

// ===== 折叠状态 =====
// 各思考组的用户手动折叠态（组稳定键 → bool）；未手动切换的组跟随自动态
const groupToggled = ref({})
// 工具详情的用户开合覆盖表（默认全部收起，运行中与完成后一致）
const toolOpenOverrides = ref({})
// 登录向导当前打开的站点集合（host → true）：login_wizard 广播驱动
const wizardHosts = ref({})

// 订阅登录向导开关广播（主进程 loginWizard 直发）：翻转向导打开态
let unsubWizard = null
const wizardApi = buddyApi()
if (wizardApi && wizardApi.onEvent) {
  unsubWizard = wizardApi.onEvent(e => {
    if (!e || e.type !== 'login_wizard') return
    const next = Object.assign({}, wizardHosts.value)
    if (e.phase === 'open') next[e.host] = true
    else delete next[e.host]
    wizardHosts.value = next
  })
}

// Markdown 渲染缓存（非响应式，WeakMap 不阻止条目回收）：
// v-html 绑定的是方法，组件每次重渲染都会对全部条目重新执行 markdown 解析；
// 按「条目对象 + 文本内容」缓存后，内容未变化的条目直接复用渲染结果
const mdCache = new WeakMap()
// 无 toolCallId 条目的 key 缓存：args 可能极大（如 write 的 content），
// JSON.stringify 全量序列化每次渲染重复执行同样有开销
const toolKeyCache = new WeakMap()

// ===== 条目分类 =====
// 思考文本类条目：thinking（推理段）与 narration（中途正文，源项目同样归档进
// 思考文本由摘要承载），二者均计入分组编号与头部摘要
function isTextItem(item) {
  return item.type === 'thinking' || item.type === 'narration'
}

// 活动思考段：isThinking 期间 items 中最后一个 thinking 块（该段正在流式累积）
const activeThinking = computed(() => {
  if (!props.isThinking) return null
  for (let i = props.items.length - 1; i >= 0; i--) {
    if (props.items[i].type === 'thinking') return props.items[i]
  }
  return null
})

// 条目是否流式中（组活动判定依据）：工具运行中 / 思考段正在累积
function isItemStreaming(item) {
  if (item.type === 'tool') return item.status === 'running'
  if (item.type === 'thinking') return item === activeThinking.value
  return false
}

// ===== 分组模型（折叠单元的来源） =====
// 1. skill 项开启 skill 组；工具/代码/问答归属当前组或新建组；
// 2. 纯执行组（无思考文本）倒序级联并入前一个思考组（明细不游离在思考过程之外），
//    首组即纯执行时保留独立（无编号"执行过程"头部）；
// 3. 组类型升级：含委派工具 → subagent，MCP 工具 → mcp；
// 4. 思考段编号：含思考文本的组按出现顺序编号（思考过程1/2/…）
const groups = computed(() => {
  const items = props.items
  if (!items || items.length === 0) return []

  const groups = []
  let currentGroup = null

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type === 'skill') {
      const lastGroup = groups.length > 0 ? groups[groups.length - 1] : null
      if (lastGroup && !lastGroup.hasSkill && lastGroup.items.every(j => isTextItem(j))) {
        lastGroup.items.push(item)
        lastGroup.hasSkill = true
        lastGroup.groupType = 'skill'
        currentGroup = lastGroup
        continue
      }
      currentGroup = { items: [item], hasSkill: true, groupType: 'skill' }
      groups.push(currentGroup)
    } else if (currentGroup && currentGroup.hasSkill) {
      currentGroup.items.push(item)
    } else {
      if (item.type === 'tool' || item.type === 'code' || item.type === 'ask') {
        const lastGroup = groups.length > 0 ? groups[groups.length - 1] : null
        if (lastGroup && !lastGroup.hasSkill && lastGroup.items.every(j => isTextItem(j))) {
          lastGroup.items.push(item)
          currentGroup = lastGroup
          continue
        }
      }
      currentGroup = { items: [item], hasSkill: false, groupType: 'tool' }
      groups.push(currentGroup)
    }
  }

  // 纯工具组（无思考文本）并入前一个思考组；倒序遍历保证连续纯工具组级联合并
  for (let g = groups.length - 1; g > 0; g--) {
    if (!groups[g].items.some(i => isTextItem(i))) {
      groups[g - 1].items.push(...groups[g].items)
      groups.splice(g, 1)
    }
  }

  for (let g = 0; g < groups.length; g++) {
    const group = groups[g]
    if (group.hasSkill) continue
    const toolItem = group.items.find(t => t.type === 'tool')
    if (toolItem) {
      if (isDelegateTool(toolItem)) group.groupType = 'subagent'
      else if (isMcp(toolItem)) group.groupType = 'mcp'
    }
  }
  // 思考段编号：含思考文本的组按出现顺序编号（深度思考1/2/…）；无思考文本的
  // 组不显示组头部，只保留其工具 / 技能卡片
  let thinkingSeq = 0
  for (const group of groups) {
    if (group.items.some(i => isTextItem(i))) {
      thinkingSeq += 1
      group.thinkingNo = thinkingSeq
    }
  }
  return groups
})

// 待答 ask 提问卡片（独立条目 + 挂接在工具条目上的）：恒可见，渲染在区块末尾
const pendingAsks = computed(() => {
  const out = []
  for (const it of props.items) {
    if (it.type === 'ask' && !it.answered) out.push(it)
    else if (it.type === 'tool' && it.ask && !it.ask.answered) out.push(it.ask)
  }
  return out
})

// ===== 折叠状态（区块级 / 组级解耦） =====
// 流式中手动展开思考组明细（默认收起，仅顶部「已执行 时长」+ 摘要）
const streamExpanded = ref(false)

// 区块级折叠：控制全部思考明细（思考正文 + 工具 / 技能卡片）的显隐；
// 与组级折叠完全解耦。完成后默认收起，新回答完成即自动收起全部
const sectionCollapsed = ref(!props.isStreaming)

// 思考组是否渲染：流式中仅手动展开时展示；完成后由区块级折叠控制（默认收起）
const groupsVisible = computed(() => props.isStreaming ? streamExpanded.value : !sectionCollapsed.value)

// 组是否活动中（组内仍有流式项）：呼吸动效 + 默认展开依据
function isGroupActive(group) {
  return group.items.some(i => isItemStreaming(i))
}

// 组稳定键：首个工具/技能的 toolCallId；纯思考组用首段内容前缀兜底。
// 数组下标随流式期间组增删/合并不稳定，用下标会导致手动展开态错位到别的组
function groupKey(group, gi) {
  const first = group.items.find(i => i.type === 'tool' || i.type === 'skill')
  if (first && first.toolCallId) return 'k:' + first.toolCallId
  const text = group.items.find(i => isTextItem(i))
  if (text) return 't:' + String(text.content || '').slice(0, 40)
  return 'g:' + gi
}

// 组折叠态：仅由本组手动切换决定。
// 默认态：完成后收起（展开区块只显示「图标 + 摘要」，点本组才展开内容）；
// 流式中默认展开（实时内容可见）。
// 无组头部（thinkingNo 未编号）的纯执行组无法点击展开，保持可见。
// 注意：必须用 !== undefined 读取（get trap 会收集依赖）；hasOwnProperty
// 走 [[GetOwnProperty]]，Vue 3 未实现该 trap，新增 key 不会触发重渲染
function isGroupCollapsed(group, gi) {
  if (!group.thinkingNo) return false
  const key = groupKey(group, gi)
  const manual = groupToggled.value[key]
  return manual !== undefined ? manual : !props.isStreaming
}

function toggleGroup(gi) {
  const group = groups.value[gi]
  const key = groupKey(group, gi)
  groupToggled.value[key] = !isGroupCollapsed(group, gi)
}

// ===== 区块级状态（顶部总状态行） =====
// 折叠态摘要：全部思考文本拼接后单行截断；无思考文本时回退首个工具/技能名
const sectionExcerpt = computed(() => {
  const texts = props.items
    .filter(i => isTextItem(i))
    .map(i => String(i.content || '').trim())
    .filter(Boolean)
  if (!texts.length) {
    const first = props.items.find(i => i.type === 'tool' || i.type === 'skill')
    if (!first) return ''
    return truncate(first.type === 'skill' ? first.skillName : friendlyToolName(first), 80)
  }
  const plain = texts.join('')
    .replace(/[#>*`~[\]()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > 80 ? plain.slice(0, 80) + '…' : plain
})

// 顶部总状态行点击：流式中切换明细展开；完成后只切换区块级展开 / 收起。
// 不重置组级手动态：组折叠与区块折叠各管各的，互不影响
function onSectionHeadClick() {
  if (props.isStreaming) {
    streamExpanded.value = !streamExpanded.value
    return
  }
  sectionCollapsed.value = !sectionCollapsed.value
}

// 回答完成（流式结束）：自动收起全部思考内容（区块级收起），并清空组级手动态
watch(() => props.isStreaming, (v) => {
  streamExpanded.value = false
  if (v) {
    sectionCollapsed.value = false
    return
  }
  sectionCollapsed.value = true
  groupToggled.value = {}
})

// 组头部行内摘要：组内全部思考文本拼接后剥 markdown 标记、单行截断
// （仅收起态展示；展开态正文在 unit-body 内完整渲染）；
// 无思考文本（execOnly 组）回退首个工具/技能展示名
function groupExcerpt(group) {
  const texts = group.items
    .filter(i => isTextItem(i))
    .map(i => String(i.content || '').trim())
    .filter(Boolean)
  if (!texts.length) {
    const first = group.items.find(i => i.type === 'tool' || i.type === 'skill')
    if (!first) return ''
    const name = first.type === 'skill' ? first.skillName : friendlyToolName(first)
    return truncate(name, 60)
  }
  const plain = texts.join(' ')
    .replace(/[#>*`~[\]()!]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  return plain.length > 60 ? plain.slice(0, 60) + '…' : plain
}

onBeforeUnmount(() => {
  // 退出登录向导广播订阅（防泄漏）
  if (unsubWizard) {
    unsubWizard()
    unsubWizard = null
  }
})

// ===== Markdown 渲染与点击委托 =====
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
    if (ok) message.success('已复制')
  })
  handleTableCsv(e).then(ok => {
    if (ok) message.success('已下载 CSV')
  })
}

// 带缓存的 Markdown 渲染：文本与上次相同时复用结果（streaming 高频重渲染下
// 避免对全部条目重复解析，点击展开/收起不再触发全量重解析）
function renderedCached(item, text) {
  const s = text || ''
  const cached = mdCache.get(item)
  if (cached && cached.text === s) return cached.html
  const html = renderMarkdown(s)
  mdCache.set(item, { text: s, html })
  return html
}

// code 条目回拼 fence 供 markdown 渲染（复用正文代码块的复制 / 放大交互）
function codeFence(item) {
  return '```' + (item.lang || '') + '\n' + (item.code || '') + '\n```'
}

// ===== 工具命名（数据适配层） =====
function isMcp(item) {
  const name = item.toolName
  if (!name) return false
  // 单代理工具名即为 'mcp'（server 在 args.server）；其余为 mcp__ 前缀变体
  return name === 'mcp' || name.indexOf('mcp_') === 0
}

// server 名提取（展示连接器 label，如 playwright，而非 'mcp' 字样）：
// 单代理 'mcp' → args.server；命名空间代理 'mcp__playwright' → playwright；
// 三段式 'mcp__server__tool' → server
function mcpServerLabel(item) {
  const name = item.toolName
  if (!name) return ''
  if (name === 'mcp') return (item.args && item.args.server) || 'MCP'
  if (name.indexOf('mcp_') === 0) {
    const rest = name.slice(4).replace(/^_+/, '')
    const sep = rest.indexOf('__')
    return sep >= 0 ? rest.slice(0, sep) : rest
  }
  return ''
}

// 底层工具名提取：代理/命名空间代理调用优先 args.tool，三段式从名称尾部提取
function mcpToolName(item) {
  const at = item.args && item.args.tool
  if (typeof at === 'string' && at) return at
  const name = item.toolName
  if (name && name.indexOf('mcp_') === 0) {
    const rest = name.slice(4).replace(/^_+/, '')
    const sep = rest.indexOf('__')
    if (sep >= 0) return rest.slice(sep + 2)
  }
  return ''
}

// 原始工具名 tag（小号灰字，与主标题同行；与主标题相同时不显示）
function rawToolTag(item) {
  const name = item.toolName
  if (!name) return ''
  let raw = name
  if (name === 'mcp' || name.indexOf('mcp_') === 0) {
    raw = mcpToolName(item)
  }
  return raw && raw !== friendlyToolName(item) ? raw : ''
}

function friendlyToolName(item) {
  const name = item.toolName
  if (!name) return '工具调用'
  if (name === 'mcp' || name.indexOf('mcp_') === 0) {
    const server = mcpServerLabel(item)
    let tool = mcpToolName(item)
    // 底层工具名可能带 server 前缀（如 playwright_browser_navigate），剥离保持简洁
    if (tool && server && server !== 'MCP' && tool.indexOf(server + '_') === 0) {
      tool = tool.slice(server.length + 1)
    }
    if (tool) return TOOL_LABELS[tool] || tool
    // 无底层工具名（search / status 等网关操作）
    return '连接器操作'
  }
  return TOOL_LABELS[name] || name
}

// 专家委派工具（AGENT 徽标 + 组类型升级依据）
function isDelegateTool(item) {
  const name = item && item.toolName
  return name === 'delegate_agent' || name === 'delegate_agents' || name === 'subagent'
}

// subagent 委派目标专员（args.agent）：并行委派多卡片时的区分标识
function subagentAgent(item) {
  if (item.toolName !== 'subagent' || !item.args) return ''
  const a = item.args.agent || item.args.agentId
  return typeof a === 'string' ? a.replace(/^wechat-/, '') : ''
}

// ===== 工具详情折叠 =====
function toolKey(item) {
  if (item.toolCallId) return item.toolCallId
  // 兜底 key：按条目缓存（args 引用不变即复用），避免每次渲染重复全量序列化
  const cached = toolKeyCache.get(item)
  if (cached && cached.args === item.args) return cached.key
  const key = item.toolName + '::' + (item.args ? JSON.stringify(item.args).slice(0, 40) : '')
  toolKeyCache.set(item, { args: item.args, key })
  return key
}

function isToolOpen(item) {
  // 默认收起（运行中与完成后一致）；用户手动展开/收起后以 override 为准
  // （同样用 !== undefined 读取，保证新增 key 能触发重渲染）
  const key = toolKey(item)
  const manual = toolOpenOverrides.value[key]
  return manual !== undefined ? manual : false
}

function toggleTool(item) {
  toolOpenOverrides.value[toolKey(item)] = !isToolOpen(item)
}

function hasToolDetails(item) {
  return !!(hasArgs(item) || hasResult(item))
}

// 工具执行中（运行中工具：名称主色 + 呼吸，行首 loading 同步）
function isToolStreaming(item) {
  return item.status === 'running'
}

// ===== 参数区 =====
function hasArgs(item) {
  return !!(item.args && typeof item.args === 'object' && Object.keys(item.args).length)
}

// args.content 为非空字符串：content 单独成块，其余参数走 chips
function hasContentArg(item) {
  return !!(item.args && typeof item.args.content === 'string' && item.args.content.length)
}

// 排除 content 键的参数对象
function nonContentArgs(args) {
  if (!args || typeof args !== 'object') return {}
  const result = {}
  Object.keys(args).forEach(k => { if (k !== 'content') result[k] = args[k] })
  return result
}

// 参数值截断：对象先序列化，超长截断加省略号
function truncate(value, maxLen) {
  if (value === null || value === undefined) return ''
  const s = typeof value === 'object' ? JSON.stringify(value) : String(value)
  return s.length > maxLen ? s.slice(0, maxLen) + '...' : s
}

// ===== 结果区 =====
// 是否有可展示的结果（流式 partial 优先）
function hasResult(item) {
  return !!(item.partial || item.result)
}

// 结果文本（流式 partial 优先；结构化结果序列化展示兜底）
function resultText(item) {
  const raw = item.partial || item.result || ''
  return typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
}

// 结果文本超 500 字截断加省略号
function truncatedResult(item) {
  const s = resultText(item)
  return s.length > 500 ? s.slice(0, 500) + '...' : s
}

// 结果仍在流式输出（运行中且有 partial）：尾部显示光标
function isResultStreaming(item) {
  return item.status === 'running' && !!item.partial
}

// 结果文本是否包含 Markdown 表格（行内含 | 分隔 + 表头分隔行）：
// 命中则走富文本渲染，否则维持等宽纯文本（避免普通结果被误当 Markdown）
function hasMdTable(content) {
  if (!content || typeof content !== 'string') return false
  const lines = content.split('\n')
  for (let i = 0; i < lines.length - 1; i++) {
    // 当前行为 |a|b| 形态，且下一行为 |---|---| 分隔行
    if (/\|[^|\n]+\|/.test(lines[i]) && /^\s*\|?[\s:-]*-{2,}[\s:|-]*\|?\s*$/.test(lines[i + 1])) return true
  }
  return false
}

// ===== 权限等待匹配 =====
// 运行中的工具是否即当前待确认权限的目标：bash 类按 command、文件类按 path 匹配，
// 其余按工具名兜底（并发工具时区分"在执行"与"在等授权"）
function matchesPerm(item) {
  const p = props.permPending
  if (!p) return false
  const args = item.args || {}
  if (p.command && args.command === p.command) return true
  if (p.path && (args.file_path === p.path || args.path === p.path)) return true
  if (p.toolName && item.name === p.toolName) return true
  return false
}

// ===== 站点登录向导（撞墙工具卡片内嵌入口） =====
function isWizardOpen(host) {
  return !!wizardHosts.value[host]
}

// 打开登录向导小窗（主进程专用 BrowserWindow，成功自动保存登录态并关闭）
function openLoginWizard(item) {
  const sl = item.siteLogin
  if (!sl || !sl.host) return
  const api = buddyApi()
  const siteApi = api && api.siteAuth
  if (!siteApi || !siteApi.login) return
  siteApi.login(sl.host, sl.url).then(res => {
    // 同 host 重复打开时主进程只聚焦复用（ok:true），不重复计数
    if (!res || !res.ok) {
      message.error((res && res.error) || '打开登录窗口失败')
    }
  }).catch(() => {
    message.error('打开登录窗口失败')
  })
}

// ===== 文件变更记录 =====
// 变更类型中文标签
function fcTypeLabel(t) {
  return { created: '新建', modified: '修改', deleted: '删除', mkdir: '新建目录' }[t] || '变更'
}

// 摘要行文件名（取末段路径，完整路径见 title 提示）
function fcFileShort(fc) {
  const f = fc.file || ''
  const parts = f.split('/')
  return parts.length > 1 ? parts[parts.length - 1] : f
}

// 新增行数（-1 = 超限未知 → 不显示数字）
function fcAdded(fc) {
  return typeof fc.added === 'number' && fc.added >= 0 ? fc.added : null
}

function fcRemoved(fc) {
  return typeof fc.removed === 'number' && fc.removed >= 0 ? fc.removed : null
}
</script>

<style scoped>
/* 核心容器 */
.thinking-section {
  width: 100%;
  margin: 6px 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

/* ============ 区块总状态行（✓ 已完成 · 时长 ⌄ / 已执行 时长 + 摘要） ============ */
.thinking-section > * + * {
  margin-top: 10px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 6px;
  margin: 0 -6px;
  border-radius: 6px;
  font-size: 14px;
  color: #4E5969;
  cursor: pointer;
  user-select: none;
}

/* 流式态：两行（已执行 时长 / 图标 + 摘要） */
.section-head.is-streaming {
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
  padding: 2px 6px;
}

/* 流式态无摘要：单行「已执行 时长」，不占额外高度 */
.section-head.is-streaming:not(.has-summary) {
  gap: 0;
}

.sh-done {
  font-size: 14px;
  color: #4E5969;

  /* 行内箭头（展开收起）：与文字基线对齐，随 streamExpanded 翻转 */
  .sh-arrow {
    margin-left: 3px;
    vertical-align: -1px;
  }
}

.sh-summary {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  width: 100%;
}

.sh-summary-ico {
  flex-shrink: 0;
  font-size: 13px;
  color: #A9AEB8;
}

.sh-summary-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  color: #86909C;
}

.sh-ico {
  flex-shrink: 0;
  font-size: 14px;
  color: #A9AEB8;
}

.sh-status {
  color: #4E5969;
}

.sh-sec {
  color: #A9AEB8;
  font-variant-numeric: tabular-nums;
}

.sh-arrow {
  flex-shrink: 0;
  margin-left: 2px;
  font-size: 10px;
  color: #A9AEB8;
  transition: transform 0.2s ease;
}

.sh-arrow.is-collapsed {
  transform: rotate(-90deg);
}

.think-unit {
  display: flex;
  flex-direction: column;
}

/* 头部行：小图标 + 摘要（收起时）/「思考过程」（展开时）+ 箭头，点击整行切换 */
.unit-header {
  display: flex;
  align-items: center;
  min-width: 0;
  padding: 2px 6px;
  margin: 0 -6px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  color: #86909C;
}

.unit-header > * + * {
  margin-left: 5px;
}

.uh-icon {
  font-size: 12px;
  color: #A9AEB8;
  flex-shrink: 0;
}

/* 摘要不主动撑满：箭头紧贴摘要文字尾部（长摘要收缩截断） */
.uh-excerpt {
  min-width: 0;
  font-size: 13px;
  color: #A9AEB8;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 组活动中（组内仍有流式项）：图标/摘要呼吸明暗 */
.unit-header .pulsing {
  animation: think-breath 1.2s ease-in-out infinite;
}

.uh-chevron {
  font-size: 10px;
  color: #A9AEB8;
  flex-shrink: 0;
  transition: transform 0.2s ease;
}

.uh-chevron.is-collapsed {
  transform: rotate(-90deg);
}

/* 展开内容：思考正文 + 工具 / 技能卡片 */
.unit-body {
  display: flex;
  flex-direction: column;
  margin-top: 6px;
}

.unit-body > * + * {
  margin-top: 8px;
}

/* 呼吸动画（执行中 tool-name / 组头部流式呼吸共用） */
@keyframes think-breath {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

@media (prefers-reduced-motion: reduce) {
  .unit-header .pulsing,
  .tool-details,
  .tool-name.executing {
    animation: none !important;
  }
}

/* 思考正文：完整展示，引用式排版（左侧竖线 + 缩进 + 灰色文字） */
.think-text {
  margin-left: 2px;
  padding-left: 12px;
  border-left: 2px solid #E5E6EB;
  font-size: 14px;
  line-height: 1.75;
  color: #86909C;
  word-break: break-word;
}

/* 思考区 Markdown 容器（v-html 渲染，deep 穿透） */
.think-md :deep(p) { margin: 0 0 4px; }
.think-md :deep(p:last-child) { margin-bottom: 0; }

.think-md :deep(ul), .think-md :deep(ol) {
  padding-left: 18px;
  margin: 4px 0;
}

.think-md :deep(li) { margin: 2px 0; }

/* 行内代码：浅底胶囊 */
.think-md :deep(:not(pre) > code) {
  background: rgba(0, 0, 0, 0.05);
  padding: 1px 5px;
  border-radius: 4px;
  font-size: 11.5px;
  color: #4E5969;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

/* 引用块：正文外层已有竖线，此处仅保留浅底与内边距，避免双层竖线 */
.think-md :deep(blockquote) {
  margin: 4px 0;
  padding: 2px 10px;
  background: #F7F8FA;
  border-radius: 4px;
  color: #86909C;
}

.think-md :deep(blockquote p) { margin: 2px 0; }

/* 思考文本内的表格/代码块卡片（.ob-table / .ob-code 全局样式承载基础外观，
   此处做思考区专属微调：小一号、底色更淡，与整体层级协调） */
.think-md :deep(.ob-table),
.think-md :deep(.ob-code) {
  margin: 6px 0;
  border-color: #EDEEF2;
}

.think-md :deep(.ob-table th),
.think-md :deep(.ob-table td) {
  font-size: 12px;
  padding: 5px 9px;
}

.think-md :deep(.ob-table tbody tr:nth-child(even)) {
  background: rgba(0, 0, 0, 0.022);
}

.think-md :deep(.ob-table thead th) {
  background: rgba(0, 0, 0, 0.04);
  color: #4E5969;
}

.think-md :deep(.ob-code pre) {
  padding: 7px 10px;
}

.think-md :deep(.ob-code pre code) {
  font-size: 11.5px;
  line-height: 1.55;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

/* 正文代码块条目（OmniDeck 特有：随组折叠，markdown 渲染） */
.code-item {
  padding-left: 0;
}

/* 工具 / 技能条目（全宽浅灰圆角卡片） */
.tool-item {
  display: flex;
  flex-direction: column;
}

.tool-summary {
  display: flex;
  flex-direction: column;
  cursor: pointer;
  user-select: none;
}

.tool-summary-line {
  display: flex;
  align-items: center;
  min-height: 38px;
  padding: 8px 12px;
  background: #F7F8FA;
  border-radius: 10px;
  transition: background 0.15s ease;
}

.tool-summary-line:hover {
  background: #F2F3F5;
}

/* 无详情卡片（技能加载）：不响应点击 */
.tool-summary-line.is-static {
  cursor: default;
}

.tool-summary-line.is-static:hover {
  background: #F7F8FA;
}

.tool-summary-line > * + * {
  margin-left: 8px;
}

.tool-status-icon { font-size: 13px; flex-shrink: 0; }
.tool-status-icon.success { color: #10B981; }
.tool-status-icon.failed { color: #EF4444; }
.tool-status-icon.executing { color: #3366FF; }
.tool-status-icon.spin { animation: think-spin 0.9s linear infinite; }

@keyframes think-spin {
  to { transform: rotate(360deg); }
}

/* ============ 类别徽标（MCP / AGENT，与 SKILL 行标识对称） ============ */
.tool-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
}

.tool-badge > * + * {
  margin-left: 3px;
}

.tool-badge .badge-ico {
  font-size: 11px;
}

.tool-badge .badge-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
}

.tool-badge .badge-name {
  font-size: 11.5px;
  font-weight: 500;
  white-space: nowrap;
}

/* MCP：青色系（延续原服务名色，与 SKILL 紫区分） */
.tool-badge.mcp .badge-ico,
.tool-badge.mcp .badge-label,
.tool-badge.mcp .badge-name {
  color: #0D9488;
}

/* AGENT：靛紫色系（专家委派） */
.tool-badge.agent .badge-label {
  color: #6366F1;
}

.tool-name {
  font-size: 13.5px;
  font-weight: 500;
  color: #1F2329;
  white-space: nowrap;
  flex-shrink: 0;
}

/* 执行中工具：名称主色 + 呼吸明暗（与行首 loading 图标同步，标识当前正在执行） */
.tool-name.executing {
  color: #3366FF;
  animation: think-breath 1.2s ease-in-out infinite;
}

.tool-name-tag {
  font-size: 12px;
  color: #A9AEB8;
  white-space: nowrap;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
}

/* subagent 委派目标专员名 tag：靛紫系（与 AGENT 徽标同色系） */
.tool-name-tag.tool-agent-tag {
  color: #6366F1;
  background: rgba(99, 102, 241, 0.1);
}

.tool-chevron {
  flex-shrink: 0;
  margin-left: auto;
  font-size: 10px;
  color: #A9AEB8;
  transition: transform 0.2s ease;
}

.tool-chevron.is-open {
  transform: rotate(90deg);
}

/* 等待授权徽标（OmniDeck 专属）：琥珀色 pill + 呼吸动画，提示回合卡在权限确认 */
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
  animation: perm-wait-pulse 1.6s ease-in-out infinite;
}

@keyframes perm-wait-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

/* ===== 文件变更徽章（OmniDeck 专属，摘要行内联） ===== */
.ob-fc-file {
  min-width: 0;
  max-width: 180px;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11.5px;
  color: #4E5969;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

.ob-fc-type {
  flex-shrink: 0;
  font-size: 10px;
  font-weight: 600;
  padding: 1px 7px;
  border-radius: 4px;
}

.ob-fc-type.created,
.ob-fc-type.mkdir {
  color: #10B981;
  background: rgba(16, 185, 129, 0.12);
}

.ob-fc-type.modified {
  color: #0284C7;
  background: rgba(2, 132, 199, 0.12);
}

.ob-fc-type.deleted {
  color: #EF4444;
  background: rgba(239, 68, 68, 0.12);
}

.ob-fc-add,
.ob-fc-del {
  flex-shrink: 0;
  font-size: 10.5px;
  font-weight: 600;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

.ob-fc-add { color: #10B981; }
.ob-fc-del { color: #EF4444; }

/* 站点登录引导行（OmniDeck 专属）：提示语 + 一键打开登录向导 */
.ob-tool-login {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 3px 0 4px 8px;
  padding: 5px 10px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);
}

.ob-tool-login.is-logged {
  border-color: rgba(15, 220, 120, 0.35);
  background: rgba(15, 220, 120, 0.08);
}

.ob-tool-login.is-logged .ob-tool-login-ico,
.ob-tool-login.is-logged .ob-tool-login-text {
  color: #0f7a4a;
}

.ob-tool-login-ico {
  font-size: 13px;
  color: #b45309;
  flex-shrink: 0;
}

.ob-tool-login-text {
  flex: 1;
  min-width: 0;
  font-size: 12.5px;
  color: #b45309;
  word-break: break-all;
}

.ob-tool-login-btn {
  flex-shrink: 0;
}

/* ============ 工具详情（进一步缩进，左侧竖线） ============ */
.tool-details {
  margin: 6px 0 2px;
  padding-left: 12px;
  border-left: 2px solid #E5E6EB;
  display: flex;
  flex-direction: column;
  animation: detail-fade 0.18s ease;
}

@keyframes detail-fade {
  from { opacity: 0; transform: translateY(-2px); }
  to { opacity: 1; transform: translateY(0); }
}

.tool-details > * + * {
  margin-top: 8px;
}

.tool-block {
  background: #F7F8FA;
  border: 1px solid #F0F1F4;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 12px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

/* 区块标签：小写间距标签 + 细分隔 */
.block-label {
  display: inline-flex;
  align-items: center;
  font-size: 10.5px;
  color: #86909C;
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-bottom: 5px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  text-transform: uppercase;
}

.block-label::before {
  content: '';
  display: inline-block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: #C9CDD4;
  margin-right: 5px;
}

.result-block .block-label::before { background: #10B981; }
.args-block .block-label::before { background: #3366FF; }
.result-block.error .block-label::before { background: #EF4444; }

.arg-row {
  display: flex;
  line-height: 1.5;
}

.arg-row > * + * {
  margin-left: 6px;
}

.arg-key { color: #0284C7; font-weight: 500; }
.arg-val { color: #4E5969; word-break: break-all; }

.arg-chips {
  display: flex;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.arg-chips > * + * {
  margin-left: 4px;
}

/* 参数 chips：等宽字体胶囊 */
.arg-chip {
  display: inline-flex;
  align-items: center;
  background: #FFFFFF;
  border: 1px solid #E5E6EB;
  border-radius: 5px;
  padding: 1px 6px;
  font-size: 10.5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

.chip-key { color: #0284C7; font-weight: 500; }
.chip-val { color: #86909C; word-break: break-all; }

.content-pre {
  margin: 0;
  color: #4E5969;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 300px;
  overflow-y: auto;
  line-height: 1.55;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 11.5px;
}

.result-text {
  color: #4E5969;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 160px;
  overflow-y: auto;
  line-height: 1.55;
  font-size: 11.5px;
  font-family: 'SF Mono', Menlo, Consolas, monospace;
}

/* 富文本结果（含表格）：取消等宽纯文本排版，交给 think-md 深度样式
   （不能 inherit：.tool-block 为等宽字体栈） */
.result-text.think-md {
  white-space: normal;
  word-break: break-word;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
}

/* 错误结果块：红底 + 左侧红竖线 */
.result-block.error {
  background: #FEF2F2;
  border-color: rgba(239, 68, 68, 0.25);
}

.result-block.error .block-label { color: #DC2626; }
.result-block.error .result-text { color: #B91C1C; }

/* 思考区内嵌的 ask_user 卡片（OmniDeck 专属）：清除独立消息态的左移避让，
   与摘要行拉开间距 */
.ob-think-ask {
  margin-top: 5px;
}

.ob-think-ask :deep(.ob-ask-card) {
  margin-left: 0;
}

/* 待答 ask 恒可见（渲染在区块末尾） */
.ob-think-ask-pending {
  margin-top: 6px;
}

/* 工具条目内嵌的 workflow 紧凑进度卡片（OmniDeck 专属） */
.ob-think-wf {
  margin-top: 4px;
}

.ob-think-wf :deep(.ob-wf-card) {
  padding: 6px 10px;
  gap: 5px;
}

/* 光标：圆角矩形 + steps 闪烁 */
.cursor-blink {
  display: inline-block;
  width: 5px;
  height: 13px;
  background-color: #3366FF;
  margin-left: 2px;
  vertical-align: -2px;
  border-radius: 2px;
  animation: blink 0.9s steps(2) infinite;
}

@keyframes blink {
  0%, 100% { opacity: 1; }
  50% { opacity: 0; }
}
</style>
