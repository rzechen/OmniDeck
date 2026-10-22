<template>
  <!-- 深度思考区（分段时间线）：每个思考段独立折叠（折叠头 = 序号 + 摘要），
       段内正文与其后续的工具 / Skill / 问答记录随段折叠；过程说明（narration）
       渲染于所属思考段上方（阅读顺序：说明 → 思考 → 动作，先预告后过程）；
       待回答 ask 恒可见 -->
  <div class="ob-think">
    <div class="ob-think-body">
      <template v-for="(item, i) in displayItems">
        <!-- 思考段：流式期间与完成后均默认收起，仅折叠头带动态标识
             （星形脉动 + 呼吸文案）；用户可随时展开收起任意段 -->
        <div
          v-if="item.type === 'thinking'"
          :key="'thinking-' + i"
          class="ob-think-seg"
        >
          <div
            class="ob-seg-head"
            :class="{ thinking: item === activeThinking }"
            @click="toggleSeg(item)"
          >
            <svg-icon icon-class="sparkle" class="ob-seg-ico" />
            <span class="ob-seg-idx">思考 {{ segIndexOf(i) }}</span>
            <span class="ob-seg-title">{{ segTitle(item) }}</span>
            <!-- 段内工具运行中标识：段默认收起，运行中的工具行（子代理委派等
                 长任务）被折叠隐藏，折叠头补转圈 + 执行中文案，保证折叠期间
                 仍可感知执行状态 -->
            <svg-icon v-if="segRunning(i)" icon-class="loading" class="ob-seg-run" />
            <span v-if="segRunning(i)" class="ob-seg-run-label">执行中</span>
            <svg-icon
              icon-class="arrow-down"
              class="ob-seg-arrow"
              :class="{ collapsed: !isSegOpen(item) }"
            />
          </div>
          <div v-if="isSegOpen(item)" class="ob-think-text ob-seg-text">
            <div class="ob-think-md" v-html="renderedCached(item, item.content)" @click="onMdClick"></div>
            <span v-if="item === activeThinking" class="ob-cursor"></span>
          </div>
        </div>

        <!-- 过程说明（中途正文归位）：渲染于所属思考段上方（阅读顺序：
             说明 → 思考 → 动作，动作发起前对用户的预告先行呈现）；
             正文主色与思考文本（灰色）区分，明确"对用户的发言"而非推理内容 -->
        <div
          v-else-if="item.type === 'narration'"
          :key="'narration-' + i"
          class="ob-think-text ob-narration"
        >
          <div class="ob-think-md" v-html="renderedCached(item, item.content)" @click="onMdClick"></div>
        </div>

        <!-- Skill 激活（随所属思考段折叠） -->
        <div v-else-if="item.type === 'skill' && itemVisible(item, i)" :key="'skill-' + i" class="ob-skill">
          <svg-icon icon-class="magic-stick" class="ob-skill-ico" />
          <span class="ob-skill-label">SKILL</span>
          <span class="ob-skill-name">{{ item.skillName }}</span>
        </div>

        <!-- 正文代码块（MessageBubble 从助手正文拆出收入）：
             有归属思考段 → 随段折叠（段展开时直接显示代码）；
             无归属段（纯正文直答等游离条目）→ 自带折叠头，默认收起，
             点击切换（否则无段可折叠，代码块恒平铺在外）。
             markdown 渲染（代码复制 / 放大按钮可用） -->
        <div
          v-else-if="item.type === 'code' && itemVisible(item, i)"
          :key="'code-' + i"
          class="ob-code-item"
        >
          <!-- 游离代码块的自带折叠头（默认收起） -->
          <div
            v-if="!hasOwnerSeg(i)"
            class="ob-seg-head ob-code-free-head"
            @click="toggleSeg(item)"
          >
            <svg-icon icon-class="code" class="ob-seg-ico" />
            <span class="ob-seg-idx">正文代码</span>
            <span class="ob-seg-title">{{ (item.lang || '代码块') + ' · ' + item.lines + ' 行' }}</span>
            <svg-icon
              icon-class="arrow-down"
              class="ob-seg-arrow"
              :class="{ collapsed: !isSegOpen(item) }"
            />
          </div>
          <!-- 代码内容：有归属段随段显隐；游离条目按自带折叠头显隐 -->
          <div v-if="hasOwnerSeg(i) || isSegOpen(item)">
            <div class="ob-code-item-head">
              <svg-icon icon-class="code" class="ob-code-item-ico" />
              <span class="ob-code-item-label">代码块</span>
              <span v-if="item.lang" class="ob-tool-tag">{{ item.lang }}</span>
              <span class="ob-code-item-lines">{{ item.lines }} 行</span>
            </div>
            <div class="ob-think-md" v-html="renderedCached(item, codeFence(item))" @click="onMdClick"></div>
          </div>
        </div>

        <!-- ask_user 提问卡片（归位于思考区内，与工具条目同级）：挂起待答恒可见，
             已答问答记录随所属思考段折叠 -->
        <ask-user-card
          v-else-if="item.type === 'ask' && itemVisible(item, i)"
          :key="'ask-' + i"
          class="ob-think-ask"
          :message="item"
          @answer="(msg, value) => emit('ask-answer', msg, value)"
        />

        <!-- 工具调用（含 MCP 工具）：随所属思考段折叠；
             挂有待答 ask 的工具条目恒可见（系统在等用户输入） -->
        <div
          v-else-if="item.type === 'tool' && itemVisible(item, i)"
          :key="toolKey(item)"
          class="ob-tool"
        >
          <!-- 摘要行：状态图标三态（运行中 / 错误 / 完成）+ MCP 服务名 + 中文名 + 原始名 tag -->
          <div class="ob-tool-head" :class="{ error: item.isError }" @click="toggleTool(item)">
            <svg-icon
              :icon-class="toolIcon(item)"
              class="ob-tool-ico"
              :class="{ spin: item.status === 'running' }"
            />
            <span v-if="isMcp(item)" class="ob-tool-server">{{ mcpServerLabel(item) }}</span>
            <span class="ob-tool-name">{{ friendlyToolName(item) }}</span>
            <!-- subagent 委派目标专员名：并行多卡片时一眼区分各 agent -->
            <span v-if="subagentAgent(item)" class="ob-tool-tag ob-tool-agent">{{ subagentAgent(item) }}</span>
            <span v-if="rawToolTag(item)" class="ob-tool-tag">{{ rawToolTag(item) }}</span>
            <!-- 等待授权徽标：该工具正在等权限确认（确认条在输入框上方），醒目提示防隐形挂起 -->
            <span
              v-if="item.status === 'running' && matchesPerm(item)"
              class="ob-tool-perm-wait"
              title="等待权限确认：请在输入框上方的确认条中处理"
            >等待授权</span>
            <!-- 后台子代理徽标已移除：宿主强制前台同步委派，子代理过程实时流式可见 -->
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

          <!-- 站点登录引导：撞登录墙上报后内嵌一键入口（应用内直达登录向导小窗，
               不依赖系统通知；向导开/关由 login_wizard 广播实时翻转；
               logged_in 广播翻转已登录终态：文案更新 + 按钮收起 + 整行弱化 -->
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

          <!-- ask_user 提问卡片：挂接在「询问用户」工具条目上（挂起中可交互，已答显示答案） -->
          <ask-user-card
            v-if="item.ask"
            class="ob-think-ask"
            :message="item.ask"
            @answer="(msg, value) => emit('ask-answer', msg, value)"
          />

          <!-- workflow / subagent 后台运行进度：紧凑卡片内嵌（与消息级面板同源
               item.workflow 对象，进度写入双处响应；后台跨回合时消息级卡片
               承接常驻展示，此处随思考区折叠） -->
          <workflow-panel
            v-if="item.workflow"
            class="ob-think-wf"
            :workflows="[item.workflow]"
            compact
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
                v-html="renderedCached(item, truncatedResult(item))"
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

<script setup>
// OmniBuddy 深度思考区：思考过程 / Skill 激活 / 工具(含 MCP) / ask_user 提问 的聚合渲染
import { ref, computed, onBeforeUnmount } from 'vue'
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
  get_search_content: '调取搜索结果'
}

defineOptions({ name: 'ThinkingSection' })

const props = defineProps({
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
})

const emit = defineEmits(['ask-answer'])

const { message } = useFeedback()

// ===== 分段折叠状态 =====
// 用户手动开合覆盖表（条目对象 → true/false，WeakMap 键即条目本身，
// 跨消息切换天然隔离、条目回收不泄漏）。所有段默认收起（含流式期间），
// 仅手动操作过的段以 override 为准。Vue2 下 WeakMap 变更不触发重渲染，
// 由 segOpenTick 计数器驱动
const segOpenOverrides = new WeakMap()
const segOpenTick = ref(0)
// 登录向导当前打开的站点集合（host → true）：login_wizard 广播驱动，
// 工具卡片「打开登录向导」按钮据此翻转「登录中…」态
const wizardHosts = ref({})
// 工具二级折叠的用户开合覆盖表（条目对象 → true/false）
const toolOpenOverrides = ref({})

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
// 流式期间 items 每个 tick 都变更，点击展开/收起也会触发整组件重渲染，
// 全量重解析导致明显卡顿。按「条目对象 + 文本内容」缓存后，
// 内容未变化的条目直接复用渲染结果，仅当前增长的条目重新渲染
const mdCache = new WeakMap()
// 无 toolCallId 条目的 key 缓存：args 可能极大（如 write 的 content），
// JSON.stringify 全量序列化每次渲染重复执行同样有开销
const toolKeyCache = new WeakMap()

// ===== 展示序列重排 =====
// 过程说明（narration）与文字上下互换：items 时序为 思考 → 说明 → 工具
// （说明紧跟所属思考段之后），渲染重排为 说明 → 思考 → 工具（先预告后过程）。
// 每条 narration 上移至其紧邻的前置思考段折叠头上方；前面无思考段的
// 游离 narration（开场即旁白等）保持原位。思考块相对顺序与工具条目
// 归属段均不变（narration 非工具，折叠归属逻辑不受影响）
const displayItems = computed(() => {
  const src = props.items
  const out = []
  const narrRun = []
  let narrAfterSeg = false // 本轮 narration 是否紧随思考段（决定是否上移）
  const flushNarr = () => {
    if (!narrRun.length) return
    if (narrAfterSeg && out.length && out[out.length - 1].type === 'thinking') {
      // 上移：插到末位思考段之前（narration 紧随其后，末位即其所属段）
      for (let n = 0; n < narrRun.length; n++) out.splice(out.length - 1, 0, narrRun[n])
    } else {
      for (let n = 0; n < narrRun.length; n++) out.push(narrRun[n])
    }
    narrRun.length = 0
    narrAfterSeg = false
  }
  for (let k = 0; k < src.length; k++) {
    const it = src[k]
    if (it.type === 'narration') {
      if (!narrRun.length && out.length && out[out.length - 1].type === 'thinking') {
        narrAfterSeg = true
      }
      narrRun.push(it)
    } else {
      flushNarr()
      out.push(it)
    }
  }
  flushNarr()
  return out
})

// ===== 思考段折叠 =====
// 活动思考段：isThinking 期间 items 中最后一个 thinking 块（该段正在流式累积）。
// 仅用于折叠头动态标识（脉动 + 进行中文案 + 流式光标位），不改变默认收起：
// 流式期间与完成后各段一律默认收起，用户点开才展开
const activeThinking = computed(() => {
  if (!props.isThinking) return null
  for (let i = props.items.length - 1; i >= 0; i--) {
    if (props.items[i].type === 'thinking') return props.items[i]
  }
  return null
})

// 段序号（1-based）：该块是时间线中的第几个思考段
function segIndexOf(i) {
  let n = 0
  for (let k = 0; k <= i; k++) {
    if (displayItems.value[k] && displayItems.value[k].type === 'thinking') n++
  }
  return n
}

// 折叠头标题：模型摘要（后台补写）优先，无则取内容首行截断兜底；
// 活动段且暂无内容时显示进行中文案。首行提取按「条目 + 内容」缓存，
// 避免流式每 tick 对全部段全量 split
const segTitleCache = new WeakMap()
function segTitle(item) {
  if (item.summary) return item.summary
  let first = ''
  const cached = segTitleCache.get(item)
  if (cached && cached.content === item.content) {
    first = cached.first
  } else {
    first = (item.content || '').split('\n').map(t => t.trim()).filter(Boolean)[0] || ''
    segTitleCache.set(item, { content: item.content, first })
  }
  const plain = first.replace(/[#*`>_~[\]]/g, '').trim()
  if (!plain) return item === activeThinking.value ? '深度思考中…' : '思考过程'
  return plain.length > 20 ? plain.slice(0, 20) + '…' : plain
}

// 段是否展开：用户手动操作过以 override 为准；否则一律默认收起
// （流式期间与完成后一致，活动段仅折叠头有动态标识）
function isSegOpen(item) {
  void segOpenTick.value // 依赖 tick：手动开合后触发重渲染（WeakMap 本身非响应式）
  if (segOpenOverrides.has(item)) return segOpenOverrides.get(item)
  return false
}

// code 条目回拼 fence 供 markdown 渲染（复用正文代码块的复制 / 放大交互）
function codeFence(item) {
  return '```' + (item.lang || '') + '\n' + (item.code || '') + '\n```'
}

// 条目归属段（向前最近的思考块）是否展开：工具 / Skill / 问答记录随所属段折叠；
// 思考块之前的游离条目（开场即工具调用等）无归属，恒平铺。
// 基于重排后的 displayItems 扫描（narration 上移不影响工具归属判断：
// 归属扫描只认 thinking 块，narration 位置变化被自然跳过）
function ownerOpen(i) {
  const arr = displayItems.value
  for (let k = i - 1; k >= 0; k--) {
    if (arr[k].type === 'thinking') return isSegOpen(arr[k])
  }
  return true
}

// code 条目是否有归属思考段（向前最近 thinking，narration 等跳过）：
// 有 → 随段折叠（段展开即显示代码）；无（纯正文直答的游离条目）→
// 自带折叠头默认收起，避免无段可折恒平铺在思考区外
function hasOwnerSeg(i) {
  const arr = displayItems.value
  for (let k = i - 1; k >= 0; k--) {
    if (arr[k].type === 'thinking') return true
  }
  return false
}

// 段内是否有运行中工具：扫描该思考段到下一段之间的条目（即归属本段的工具行）。
// 段默认收起时运行中的工具行被折叠隐藏（子代理委派等长任务可能持续数分钟），
// 折叠头据此显示转圈 + 「执行中」，避免长时间无任何视觉反馈
function segRunning(i) {
  const arr = displayItems.value
  for (let k = i + 1; k < arr.length; k++) {
    const it = arr[k]
    if (it.type === 'thinking') break
    if (it.type === 'tool' && it.status === 'running') return true
  }
  return false
}

// 条目可见性：过程说明恒平铺（收起后与各段摘要构成时间线脉络）；
// 待回答 ask（独立条目或挂接工具）恒可见——系统在等用户输入，不能折叠隐藏
function itemVisible(item, i) {
  if (item.type === 'narration') return true
  if (item.type === 'ask' && !item.answered) return true
  if (item.type === 'tool' && item.ask && !item.ask.answered) return true
  return ownerOpen(i)
}

function toggleSeg(item) {
  segOpenOverrides.set(item, !isSegOpen(item))
  segOpenTick.value++
}

onBeforeUnmount(() => {
  // 退出登录向导广播订阅（防泄漏）
  if (unsubWizard) {
    unsubWizard()
    unsubWizard = null
  }
})

// Markdown 区点击委托：链接拦截 + 代码块复制按钮（v-html 内容不归 Vue 管，走事件委托）
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

// 原始工具名 tag（与主标题相同时不显示）
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

// 摘要行状态图标：运行中 loading / 错误 warning-outline / 完成 check
function toolIcon(item) {
  if (item.status === 'running') return 'loading'
  if (item.isError) return 'warning-outline'
  return 'check'
}

// subagent 委派目标专员（args.agent）：并行委派多卡片时的区分标识
function subagentAgent(item) {
  if (item.toolName !== 'subagent' || !item.args) return ''
  const a = item.args.agent || item.args.agentId
  return typeof a === 'string' ? a.replace(/^wechat-/, '') : ''
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

function hasArgs(item) {
  return !!(item.args && typeof item.args === 'object' && Object.keys(item.args).length)
}

// args.content 为非空字符串：content 单独成块，其余参数走 chips
function hasContentArg(item) {
  return !!(item.args && typeof item.args.content === 'string' && item.args.content.length)
}

// 参数键值对列表（skipContent：跳过 content 键）
function argEntries(item, skipContent) {
  const args = item.args
  if (!args || typeof args !== 'object') return []
  return Object.keys(args)
    .filter(k => !(skipContent && k === 'content'))
    .map(k => ({ key: k, val: args[k] }))
}

// chips 参数（hasContentArg 时排除 content）
function chipEntries(item) {
  return argEntries(item, true)
}

// 参数值截断：对象先序列化，超长截断加省略号
function truncateVal(v, max) {
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
}

// 是否有可展示的结果（流式 partial 优先）
function hasResult(item) {
  return !!(item.partial || item.result)
}

// 联网工具（pi-web-access）：结果为 Markdown（链接列表/网页摘要），按富文本渲染
function isWebTool(item) {
  return ['web_search', 'fetch_content', 'source_check'].indexOf(item.toolName) >= 0
}

// 结果文本：超 500 字截断加省略号
function truncatedResult(item) {
  const raw = item.partial || item.result || ''
  // 兜底：结构化结果序列化展示（正常已由主进程规整为字符串）
  const s = typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
  return s.length > 500 ? s.slice(0, 500) + '…' : s
}

// 结果仍在流式输出（运行中且有 partial）：尾部显示光标
function isResultStreaming(item) {
  return item.status === 'running' && !!item.partial
}

function hasDetails(item) {
  return hasArgs(item) || hasResult(item) || !!item.fileChange
}

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
  // 默认收起（错误时默认展开）；用户手动操作后以 override 为准
  const key = toolKey(item)
  if (Object.prototype.hasOwnProperty.call(toolOpenOverrides.value, key)) {
    return toolOpenOverrides.value[key]
  }
  return !!item.isError
}

function toggleTool(item) {
  toolOpenOverrides.value[toolKey(item)] = !isToolOpen(item)
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

<style lang="scss" scoped>
.ob-think {
  margin-bottom: 8px;
}

/* ===== 思考段折叠头 ===== */
.ob-seg-head {
  display: flex;
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

  .ob-seg-ico {
    font-size: 12px;
    color: var(--text-secondary);
    flex-shrink: 0;
  }

  /* 活动段（生成中）：星形主色 + 脉动 + 摘要呼吸 */
  &.thinking {
    .ob-seg-ico {
      color: var(--primary-color);
      animation: ob-think-pulse 1.2s ease-in-out infinite;
    }

    .ob-seg-title {
      animation: ob-think-breath 1.2s ease-in-out infinite;
    }
  }

  .ob-seg-idx {
    flex-shrink: 0;
    font-weight: 500;
  }

  .ob-seg-title {
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
    font-weight: 500;
  }

  /* 段内工具运行中：折叠头尾部转圈 + 主色文案（与工具行运行态同构） */
  .ob-seg-run {
    flex-shrink: 0;
    font-size: 12px;
    color: var(--primary-color);
    animation: ob-tool-rotate 0.9s linear infinite;
  }

  .ob-seg-run-label {
    flex-shrink: 0;
    font-size: 11px;
    color: var(--primary-color);
    animation: ob-think-breath 1.2s ease-in-out infinite;
  }

  .ob-seg-arrow {
    font-size: 10px;
    color: var(--text-secondary);
    flex-shrink: 0;
    transition: transform 0.2s ease;

    &.collapsed {
      transform: rotate(-90deg);
    }
  }
}

/* 思考区时间线内容层：工具 / Skill / ask 卡片 / 思考段正文同层级缩进，
   左侧统一竖线构成"过程内容"一列；思考段折叠头与过程说明在外层平铺
   （说明渲染于所属思考段上方，靠正文色与段内容区分）；
   段正文与折叠头另拉开上间距 */
.ob-think-body > .ob-tool,
.ob-think-body > .ob-skill,
.ob-think-body > .ob-think-ask,
.ob-think-body > .ob-think-seg .ob-seg-text {
  margin-left: 20px;
  padding-left: 12px;
  border-left: 2px solid var(--border-color);
}

.ob-think-seg .ob-seg-text {
  margin-top: 4px;
}

/* ===== 内容主体 ===== */
.ob-think-body {
  margin-top: 4px;
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

/* 工具条目内嵌的 workflow 紧凑进度卡片：与摘要行对齐拉开间距，
   并将卡片内边距收紧适配思考区密度 */
.ob-think-wf {
  margin-top: 4px;

  :deep(.ob-wf-card) {
    padding: 6px 10px;
    gap: 5px;
  }
}

/* 思考文本 */
.ob-think-text {
  font-size: 13px;
  line-height: 1.65;
  color: var(--text-secondary);
  .ob-think-md {
    :deep(p) { margin: 0 0 4px; }
    :deep(p:last-child) { margin-bottom: 0; }

    /* 有序/无序列表：与正文 .ob-md 同款缩进（浏览器默认 40px 过大，
       编号会凸出思考文本对齐线，视觉上脱离思考区） */
    :deep(ul), :deep(ol) {
      padding-left: 18px;
      margin: 4px 0;

      li { margin: 2px 0; }
    }

    /* 代码块（与正文 .ob-code 同构，思考区整体小一号、底色更淡） */
    :deep(.ob-code) {
      margin: 6px 0;
      border: 1px solid var(--border-color);
      border-radius: 8px;
      overflow: hidden;
      background: rgba(0, 0, 0, 0.025);
    }

    :deep(.ob-code-head) {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 2px 4px 2px 10px;
      background: rgba(0, 0, 0, 0.04);
      border-bottom: 1px solid var(--border-color);
      user-select: none;
    }

    :deep(.ob-code-lang) {
      font-size: 10.5px;
      color: var(--text-secondary);
      font-family: 'SF Mono', Menlo, Consolas, monospace;
    }

    :deep(.ob-code-copy) {
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

    :deep(.ob-code pre) {
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

/* 过程说明（中途正文）：渲染于所属思考段上方（无缩进无竖线，阅读顺序
   说明 → 思考 → 动作——动作发起前对用户的预告先行呈现）；正文主色与
   思考文本（灰色）区分，明确"对用户的发言"而非推理内容 */
.ob-narration {
  color: var(--text-primary);
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

/* 正文代码块条目（助手正文拆出收入思考区）：摘要行 + markdown 代码体 */
.ob-code-item {
  display: flex;
  flex-direction: column;
}

/* 游离代码块自带折叠头（复用思考段头样式，顶部留间距与段头对齐） */
.ob-code-free-head {
  margin-top: 2px;
}

.ob-code-item-head {
  display: flex;
  align-items: center;
  gap: 7px;
  min-height: 22px;
  padding: 2px 0;
  user-select: none;

  .ob-code-item-ico {
    font-size: 13px;
    flex-shrink: 0;
    color: var(--text-secondary);
  }

  .ob-code-item-label {
    font-size: 13px;
    font-weight: 500;
    color: var(--text-primary);
    white-space: nowrap;
  }

  .ob-code-item-lines {
    font-size: 10.5px;
    color: var(--text-secondary);
    white-space: nowrap;
    font-family: 'SF Mono', Menlo, Consolas, monospace;
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
  .ob-tool-agent {
    color: var(--el-color-primary, #409eff);
    background: rgba(64, 158, 255, 0.1);
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

/* 站点登录引导行（撞墙工具卡片内嵌）：提示语 + 一键打开登录向导
   （工具卡片已在时间线内容列内，缩进减半避免双重嵌套） */
.ob-tool-login {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 3px 0 4px 8px;
  padding: 5px 10px;
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.08);

  /* 已登录终态：登录墙提示转成功态（绿色系弱化） */
  &.is-logged {
    border-color: rgba(15, 220, 120, 0.35);
    background: rgba(15, 220, 120, 0.08);

    .ob-tool-login-ico,
    .ob-tool-login-text {
      color: #0f7a4a;
    }
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
}

/* 详情容器（左侧 2px 竖线缩进；工具卡片已在时间线内容列内，
   摘要行自带 padding-left: 12px，详情再退 20px 与其拉开层级） */
.ob-tool-detail {
  margin: 2px 0 4px 8px;
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

  :deep(p) { margin: 0 0 5px; }
  :deep(p:last-child) { margin-bottom: 0; }
  :deep(ul), :deep(ol) { padding-left: 18px; margin: 4px 0; }
  :deep(li) { margin: 2px 0; }
  :deep(a) { color: var(--primary-color); }
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
