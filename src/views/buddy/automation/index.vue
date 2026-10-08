<template>
  <div class="ob-manage-page">
    <!-- 顶部 Hero -->
    <header class="ob-hero">
      <div class="ob-hero-content">
        <div class="ob-hero-title-group">
          <h2 class="ob-section-title">定时任务</h2>
          <span class="ob-hero-badge" v-if="loaded">{{ tasks.length }} 个任务</span>
        </div>
        <p class="ob-section-desc">
          定时让助手自动执行任务：到点自动运行，结果保存为会话记录并推送通知；每个任务使用指定的执行模型（模型被删除后列表会标红提示），执行过程可在任务列表「定时任务」分组的会话中查看
        </p>
      </div>
      <div class="ob-hero-actions">
        <el-button size="small" round type="primary" @click="openCreate"><svg-icon icon-class="plus" /> 新建任务</el-button>
      </div>
    </header>

    <!-- 内容区 -->
    <div class="ob-page-body">
      <div v-if="loading" class="ob-sk-wrap">
        <buddy-skeleton type="rows" :count="4" />
      </div>

      <template v-else>
        <!-- 任务行式清单（macOS 设置风格） -->
        <div v-if="tasks.length" class="ob-auto-list">
          <div v-for="t in tasks" :key="t.id" class="ob-auto-row" :class="{ off: !t.enabled }">
            <span class="ob-auto-ico"><svg-icon :icon-class="scenarioOf(t).icon" /></span>
            <div class="ob-auto-main">
              <div class="ob-auto-name-row">
                <span class="ob-auto-name" :title="t.name">{{ t.name }}</span>
                <span v-if="t.running" class="ob-auto-running"><svg-icon icon-class="loading" class="ob-spin" />运行中</span>
                <span v-else-if="!t.enabled" class="ob-auto-state off">已停用</span>
              </div>
              <div class="ob-auto-meta">
                <span class="ob-auto-schedule"><svg-icon icon-class="clock" />{{ scheduleText(t.schedule) }}</span>
                <span
                  class="ob-auto-model"
                  :class="{ missing: !t.providerId || !providers.some(x => x.id === t.providerId) }"
                  :title="modelTitle(t)"
                >{{ modelText(t) }}</span>
                <span class="ob-auto-next" v-if="t.enabled && !t.running">下次 {{ nextText(t.nextRunAt) }}</span>
                <span
                  v-if="t.lastRun"
                  class="ob-auto-last"
                  :class="{ ok: t.lastRun.ok, fail: !t.lastRun.ok }"
                  :title="t.lastRun.error || ''"
                  @click="openSession(t.lastRun.sessionId)"
                >
                  上次 {{ t.lastRun.ok ? '成功' : '失败' }} · {{ timeShort(t.lastRun.at) }}
                </span>
              </div>
              <!-- 失败原因直接可见（单行截断，hover 看全文） -->
              <div
                v-if="t.lastRun && !t.lastRun.ok && t.lastRun.error"
                class="ob-auto-fail"
                :title="t.lastRun.error"
              >
                <svg-icon icon-class="warning-outline" />
                {{ t.lastRun.error }}
              </div>
            </div>
            <div class="ob-auto-actions">
              <el-switch
                :model-value="t.enabled"
                size="small"
                @change="v => toggleTask(t, v)"
              />
              <el-button size="small" round plain :disabled="t.running" @click="runNow(t)">立即运行</el-button>
              <el-button size="small" round plain @click="openEdit(t)">编辑</el-button>
              <el-button size="small" round plain type="danger" @click="removeTask(t)">删除</el-button>
            </div>
          </div>
        </div>

        <!-- 空状态 -->
        <div v-else class="ob-empty">
          <div class="ob-empty-icon"><svg-icon icon-class="clock" /></div>
          <div class="ob-empty-title">还没有定时任务</div>
          <div class="ob-empty-desc">新建任务后，助手会在设定时间自动执行并推送通知</div>
          <el-button size="small" round type="primary" @click="openCreate">新建任务</el-button>
        </div>
      </template>
    </div>

    <!-- 新建 / 编辑向导（场景 → 内容 → 时间）：三步内容偏长 → 右侧全高抽屉 -->
    <transition name="ob-drawer">
      <div
        v-if="wizard.visible"
        class="ob-drawer"
        @click.self="wizard.visible = false"
      >
        <div class="ob-drawer-panel auto-wizard-panel">
          <header class="ob-drawer-header">
            <h3 class="ob-dialog-title">{{ wizard.editing ? '编辑任务' : '新建定时任务' }}</h3>
            <svg-icon icon-class="close" class="ob-dialog-close" @click="wizard.visible = false" />
          </header>

          <div class="ob-drawer-body">
            <!-- 步骤指示 -->
            <div class="ob-auto-steps">
              <div
                v-for="(s, i) in ['场景', '内容', '时间']"
                :key="s"
                class="ob-auto-step"
                :class="{ active: wizard.step === i, done: wizard.step > i }"
                @click="wizard.step > i && (wizard.step = i)"
              >
                <span class="ob-auto-step-dot">{{ wizard.step > i ? '✓' : i + 1 }}</span>
                <span>{{ s }}</span>
              </div>
            </div>

            <!-- 步骤 1：场景 -->
            <div v-if="wizard.step === 0" class="ob-auto-pane">
              <div
                v-for="s in scenarios"
                :key="s.key"
                class="ob-auto-scene"
                :class="{ active: wizard.scenario === s.key }"
                @click="chooseScenario(s)"
              >
                <span class="ob-auto-scene-ico"><svg-icon :icon-class="s.icon" /></span>
                <div class="ob-auto-scene-body">
                  <div class="ob-auto-scene-name">{{ s.label }}</div>
                  <div class="ob-auto-scene-desc">{{ s.desc }}</div>
                </div>
                <svg-icon v-if="wizard.scenario === s.key" icon-class="check" class="ob-auto-scene-check" />
              </div>
            </div>

            <!-- 步骤 2：内容 -->
            <div v-else-if="wizard.step === 1" class="ob-auto-pane">
              <div class="ob-auto-field">
                <label class="ob-auto-label">任务名称 <i class="ob-req">*</i></label>
                <el-input v-model="wizard.name" placeholder="如：AI 行业每日简报" maxlength="40" show-word-limit />
                <div class="ob-auto-err" :class="{ show: wizard.errName }">{{ wizard.errName || '　' }}</div>
              </div>
              <div v-if="scenarioOf({ scenario: wizard.scenario }).topic" class="ob-auto-field">
                <label class="ob-auto-label">关注主题 <i class="ob-req">*</i></label>
                <el-input v-model="wizard.topic" placeholder="如：人工智能、新能源、跨境电商" @input="syncPrompt" />
                <div class="ob-auto-err" :class="{ show: wizard.errTopic }">{{ wizard.errTopic || '　' }}</div>
              </div>
              <div class="ob-auto-field">
                <label class="ob-auto-label">任务指令 <i class="ob-req">*</i></label>
                <el-input
                  v-model="wizard.prompt"
                  type="textarea"
                  :rows="32"
                  placeholder="描述希望助手自动完成什么，可按场景模板修改"
                  @input="onPromptInput"
                />
                <div class="ob-auto-err" :class="{ show: wizard.errPrompt }">{{ wizard.errPrompt || '　' }}</div>
              </div>
              <div class="ob-auto-field">
                <label class="ob-auto-label">工作空间 <i class="ob-req">*</i></label>
                <el-select v-model="wizard.workspaceId" placeholder="选择任务运行的工作空间" style="width: 100%">
                  <el-option
                    v-for="w in workspaces"
                    :key="w.id"
                    :label="w.name + '（' + w.path + '）'"
                    :value="w.id"
                    :disabled="!w.available"
                  />
                </el-select>
                <div class="ob-auto-err" :class="{ show: wizard.errWorkspace }">{{ wizard.errWorkspace || '　' }}</div>
              </div>
              <div class="ob-auto-field">
                <label class="ob-auto-label">执行模型 <i class="ob-req">*</i></label>
                <el-select v-model="wizard.providerId" placeholder="选择任务使用的模型" style="width: 100%">
                  <el-option
                    v-for="p in providers"
                    :key="p.id"
                    :label="p.name + '（' + p.model + '）'"
                    :value="p.id"
                  />
                </el-select>
                <div class="ob-auto-err" :class="{ show: wizard.errProvider }">{{ wizard.errProvider || '　' }}</div>
                <div v-if="!providers.length" class="ob-auto-tip">
                  尚未配置任何模型，请先<a class="ob-auto-link" @click="goProviders">在「模型管理」中添加模型</a>，添加后即可选择
                </div>
              </div>
              <div class="ob-auto-field row">
                <label class="ob-auto-label">完成后通知</label>
                <el-switch v-model="wizard.notify" />
                <span class="ob-auto-tip-inline">开启后按「设置 → 通知」的渠道投递（系统通知 / Webhook）；关闭则仅应用内提示</span>
              </div>
            </div>

            <!-- 步骤 3：时间 -->
            <div v-else class="ob-auto-pane">
              <div class="ob-auto-field row-inline">
                <label class="ob-auto-label">重复周期</label>
                <el-radio-group v-model="wizard.scheduleType" @change="onScheduleTypeChange">
                  <el-radio-button label="daily">每天</el-radio-button>
                  <el-radio-button label="weekly">每周</el-radio-button>
                </el-radio-group>
              </div>
              <div v-if="wizard.scheduleType === 'weekly'" class="ob-auto-field">
                <label class="ob-auto-label">执行日</label>
                <el-radio-group v-model="wizard.weekday">
                  <el-radio-button v-for="(d, i) in ['日', '一', '二', '三', '四', '五', '六']" :key="d" :label="i">周{{ d }}</el-radio-button>
                </el-radio-group>
              </div>
              <div class="ob-auto-field">
                <label class="ob-auto-label">执行时间</label>
                <div class="ob-auto-time-mode">
                  <el-radio-group v-model="wizard.timeMode">
                    <el-radio-button label="fixed">固定时间</el-radio-button>
                    <el-radio-button label="random">范围随机</el-radio-button>
                  </el-radio-group>
                  <!-- Element TimePicker：分钟步长 1 -->
                  <el-time-picker
                    v-if="wizard.timeMode === 'fixed'"
                    v-model="wizard.time"
                    format="HH:mm"
                    value-format="HH:mm"
                    placeholder="选择时间"
                    :clearable="false"
                  />
                  <el-time-picker
                    v-else
                    v-model="wizard.timeRange"
                    is-range
                    format="HH:mm"
                    value-format="HH:mm"
                    range-separator="至"
                    start-placeholder="最早时间"
                    end-placeholder="最晚时间"
                    :clearable="false"
                    class="ob-auto-time-range"
                  />
                </div>
                <div v-if="wizard.timeMode === 'random'" class="ob-auto-tip">
                  每个周期将在该范围内随机取一个时间执行，避免固定时间点被识别
                </div>
              </div>
              <div class="ob-auto-summary">
                <svg-icon icon-class="clock" />
                将于 <b>{{ previewSchedule() }}</b> 首次自动执行（此后{{ scheduleText({ type: wizard.scheduleType, weekday: wizard.weekday, mode: wizard.timeMode, time: wizard.time, timeStart: wizard.timeRange[0], timeEnd: wizard.timeRange[1] }) }}循环）
              </div>
            </div>
          </div>

          <footer class="ob-drawer-footer">
            <el-button v-if="wizard.step > 0" size="small" round @click="wizard.step--">上一步</el-button>
            <div class="ob-dialog-btns">
              <el-button size="small" round @click="wizard.visible = false">取消</el-button>
              <el-button v-if="wizard.step < 2" size="small" round type="primary" @click="nextStep">下一步</el-button>
              <el-button v-else size="small" round type="primary" :loading="wizard.saving" @click="saveTask">
                {{ wizard.editing ? '保存' : '创建' }}
              </el-button>
            </div>
          </footer>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
// OmniBuddy 自动化（定时任务）：任务列表 + 三步新建向导（场景 → 内容 → 时间）
// 数据源：主进程 scheduler（tasks.json 持久化）；执行结果落系统会话（「自动化」分组），
// 运行/结束经 omnibuddy:event（automation:run / automation:done）实时刷新
import { buddyApi, buddyApiSection } from '@/utils/buddy/buddy-api'
import { getItem } from '@/utils/storage/db'
import BuddySkeleton from '@/components/buddy/BuddySkeleton.vue'

// 场景定义：图标 / 描述 / 默认周期 / 指令模板（topic 注入）
const SCENARIOS = [
  {
    key: 'daily',
    label: '每日简报',
    icon: 'document',
    desc: '每天定点汇总一个领域的最新动态',
    topic: true,
    schedule: { type: 'daily', time: '09:00' },
    name: '每日简报',
    prompt: topic => '请联网搜索今日「' + topic + '」领域的重要动态与新闻，输出一份简明日报：\n' +
      '1. 按重要性列出 5-8 条要闻，每条包含标题、一句话摘要与来源\n' +
      '2. 结尾用一段话总结今日整体趋势'
  },
  {
    key: 'weekly',
    label: '每周回顾',
    icon: 'tickets',
    desc: '每周固定时间复盘一周要闻',
    topic: true,
    schedule: { type: 'weekly', weekday: 1, time: '09:00' },
    name: '每周回顾',
    prompt: topic => '请联网搜索本周「' + topic + '」领域的重要动态，输出一份周报：\n' +
      '1. 分主题归纳本周要闻（每条含标题、摘要与来源）\n' +
      '2. 结尾总结本周趋势，并指出值得持续关注的方向'
  },
  {
    key: 'digest',
    label: '资讯追踪',
    icon: 'monitor',
    desc: '高频追踪某主题的最新资讯',
    topic: true,
    schedule: { type: 'daily', time: '12:00' },
    name: '资讯速览',
    prompt: topic => '请联网搜索最近 24 小时内关于「' + topic + '」的新资讯，整理成速览清单：\n' +
      '每条包含标题、一句话摘要与来源链接，按相关度排序，最多 10 条；若无新内容请直接说明。'
  },
  {
    key: 'custom',
    label: '自定义任务',
    icon: 'magic-stick',
    desc: '自由描述任意定时执行的指令',
    topic: false,
    schedule: { type: 'daily', time: '09:00' },
    name: '定时任务',
    prompt: () => ''
  }
]

const WEEKDAY_NAMES = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export default {
  name: 'OmniBuddyAutomation',
  components: { BuddySkeleton },
  data() {
    return {
      loading: false,
      loaded: false,
      tasks: [],
      workspaces: [],
      providers: [],
      scenarios: SCENARIOS,
      // 新建 / 编辑向导
      wizard: {
        visible: false,
        editing: false,
        editId: '',
        step: 0,
        scenario: 'daily',
        name: '',
        topic: '',
        prompt: '',
        promptDirty: false,
        workspaceId: '',
        // 执行模型：providerId（必选；providers 为空时无法保存，引导先去模型管理）
        providerId: '',
        notify: true,
        scheduleType: 'daily',
        weekday: 1,
        // 执行时间：fixed 固定点 / random 范围内随机（防固定时间被识别）
        timeMode: 'fixed',
        time: '09:00',
        timeRange: ['09:00', '10:00'],
        saving: false,
        errName: '',
        errTopic: '',
        errPrompt: '',
        errWorkspace: '',
        errProvider: ''
      }
    }
  },
  mounted() {
    this.load()
    this.loadWorkspaces()
    this.loadProviders()
    // 任务运行/结束实时刷新（调度器触发在主进程，页面可能不在前台）
    const api = buddyApi()
    if (api && api.onEvent) {
      this._unsub = api.onEvent(e => {
        if (e && (e.type === 'automation:run' || e.type === 'automation:done')) this.load()
      })
    }
  },
  beforeUnmount() {
    if (this._unsub) {
      this._unsub()
      this._unsub = null
    }
  },
  methods: {
    autoApi() {
      return buddyApiSection('automation')
    },
    async load() {
      const a = this.autoApi()
      if (!a) {
        this.$message.warning('自动化需要 OmniDeck 桌面端')
        return
      }
      this.loading = !this.loaded
      try {
        const res = await a.list()
        if (res && res.ok) this.tasks = res.tasks || []
        this.loaded = true
      } finally {
        this.loading = false
      }
    },
    async loadWorkspaces() {
      const api = buddyApi()
      if (!api || !api.listWorkspaces) return
      const list = await api.listWorkspaces()
      this.workspaces = Array.isArray(list) ? list : []
    },
    // 模型列表（IndexedDB）+ 同步镜像到主进程：
    // 定时任务无头执行时读不到渲染进程，按 providerId 绑定模型须依赖主进程镜像。
    // JSON 拷贝穿透响应式 Proxy（IPC 结构化克隆无法序列化 Proxy）
    loadProviders() {
      const list = getItem('aiProviderList', [])
      const all = Array.isArray(list) ? list : []
      // 执行模型仅列文本生成模型（图像模型专用生图，不能作为任务执行模型）
      this.providers = all.filter(p => p && p.type !== 'image')
      const a = this.autoApi()
      if (a && a.syncProviders) {
        // 镜像同步全量（含 type:'image' 图像条目，pi 侧 generate_image 注册依赖镜像）
        Promise.resolve(a.syncProviders(JSON.parse(JSON.stringify(all)))).catch(() => {})
      }
    },
    goProviders() {
      this.$router.push('/omnibuddy/providers').catch(() => {})
    },
    // ===== 展示辅助 =====
    scenarioOf(t) {
      return this.scenarios.find(s => s.key === t.scenario) || this.scenarios[this.scenarios.length - 1]
    },
    // 周期人话化：每天 09:00 / 每周一 09:00 / 每天 09:00 ~ 10:00 随机
    scheduleText(s) {
      if (!s) return ''
      const base = s.type === 'weekly'
        ? '每' + (WEEKDAY_NAMES[s.weekday || 0] || '周一') + ' '
        : '每天 '
      if (s.mode === 'random') {
        return base + (s.timeStart || '09:00') + ' ~ ' + (s.timeEnd || '10:00') + ' 随机'
      }
      return base + (s.time || '09:00')
    },
    // 任务所用模型：具体模型名（未绑定 / 绑定模型被删时标红提示）
    modelText(t) {
      // 未绑定（旧版本创建的任务）：表单已移除「跟随对话模型」选项，标红引导编辑绑定
      if (!t.providerId) return '未设置模型'
      const p = this.providers.find(x => x.id === t.providerId)
      return p ? p.name : '模型已删除'
    },
    modelTitle(t) {
      if (!t.providerId) return '任务未绑定执行模型（旧版本创建），请编辑任务选择执行模型'
      const p = this.providers.find(x => x.id === t.providerId)
      return p ? (p.name + ' · ' + p.model) : '任务绑定的模型已被删除，运行将失败，请编辑任务重新选择'
    },
    // 下次执行：今天/明天 HH:mm，更远给日期
    nextText(ts) {
      if (!ts) return '—'
      const d = new Date(ts)
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      const hm = pad(d.getHours()) + ':' + pad(d.getMinutes())
      const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
      if (sameDay(d, now)) return '今天 ' + hm
      const tomorrow = new Date(now.getTime() + 24 * 3600 * 1000)
      if (sameDay(d, tomorrow)) return '明天 ' + hm
      return (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + hm
    },
    timeShort(ts) {
      const d = new Date(ts)
      const pad = n => String(n).padStart(2, '0')
      return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    },
    // 查看上次执行的会话
    async openSession(sid) {
      if (!sid) return
      // 会话可能已被删除（如手动清理运行记录）：提示而非落到空白占位页
      const api = buddyApi()
      if (api && api.sessionMeta) {
        let meta = null
        try { meta = await api.sessionMeta(sid) } catch (e) { /* 桌面端异常时放行跳转 */ }
        if (!meta) {
          this.$message.info('上次运行的会话已被删除')
          return
        }
      }
      this.$router.push('/omnibuddy?s=' + sid).catch(() => {})
    },
    // ===== 任务操作 =====
    async toggleTask(t, v) {
      const a = this.autoApi()
      if (!a) return
      const res = await a.update({ id: t.id, patch: { enabled: v } })
      if (!res || !res.ok) {
        this.$message.error((res && res.error) || '操作失败')
        return
      }
      t.enabled = v
      t.nextRunAt = res.task ? res.task.nextRunAt : t.nextRunAt
    },
    async runNow(t) {
      const a = this.autoApi()
      if (!a) return
      const res = await a.runNow(t.id)
      if (!res || !res.ok) {
        this.$message.error((res && res.error) || '启动失败')
        return
      }
      this.$message.success('任务已启动，结果将推送通知')
      this.load()
    },
    async removeTask(t) {
      const yes = await this.$confirm(
        '删除后「' + t.name + '」将不再自动执行（历史会话记录保留），确定删除吗？',
        '删除任务',
        { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
      ).then(() => true).catch(() => false)
      if (!yes) return
      const a = this.autoApi()
      if (!a) return
      const res = await a.remove(t.id)
      if (!res || !res.ok) {
        this.$message.error((res && res.error) || '删除失败')
        return
      }
      this.$message.success('已删除')
      this.load()
    },
    // ===== 新建 / 编辑向导 =====
    openCreate() {
      this.resetWizard()
      this.wizard.visible = true
    },
    openEdit(t) {
      this.resetWizard()
      const s = this.scenarioOf(t)
      const sch = t.schedule || {}
      Object.assign(this.wizard, {
        editing: true,
        editId: t.id,
        scenario: t.scenario,
        name: t.name,
        prompt: t.prompt,
        promptDirty: true,
        workspaceId: t.workspaceId,
        providerId: t.providerId || '',
        notify: t.notify !== false,
        scheduleType: sch.type === 'weekly' ? 'weekly' : 'daily',
        weekday: Number.isInteger(sch.weekday) ? sch.weekday : 1,
        timeMode: sch.mode === 'random' ? 'random' : 'fixed',
        time: sch.time || '09:00',
        timeRange: sch.timeStart && sch.timeEnd ? [sch.timeStart, sch.timeEnd] : ['09:00', '10:00'],
        step: 1
      })
      // 场景默认名不回填主题（自定义指令已就位，主题仅为模板生成辅助）
      if (s.topic && t.scenario !== 'custom') {
        // 从任务名反推主题展示（仅展示用，不参与保存）
        this.wizard.topic = t.name.replace(/(每日简报|每周回顾|资讯速览)$/, '').trim()
      }
      this.wizard.visible = true
    },
    resetWizard() {
      // 执行模型默认选中默认模型（无模型时留空，校验引导去模型管理）
      const defProvider = this.providers.find(p => p.isDefault) || this.providers[0]
      Object.assign(this.wizard, {
        editing: false,
        editId: '',
        step: 0,
        scenario: 'daily',
        name: '',
        topic: '',
        prompt: '',
        promptDirty: false,
        workspaceId: '',
        providerId: defProvider ? defProvider.id : '',
        notify: true,
        scheduleType: 'daily',
        weekday: 1,
        timeMode: 'fixed',
        time: '09:00',
        timeRange: ['09:00', '10:00'],
        saving: false,
        errName: '',
        errTopic: '',
        errPrompt: '',
        errWorkspace: '',
        errProvider: ''
      })
    },
    chooseScenario(s) {
      this.wizard.scenario = s.key
      // 指令未手动编辑时跟随场景模板刷新；名称同样给默认值
      if (!this.wizard.promptDirty) {
        this.wizard.prompt = s.prompt(this.wizard.topic || '')
      }
      if (!this.wizard.name) this.wizard.name = s.name
      // 周期联动场景默认（weekly 场景默认每周一）
      this.wizard.scheduleType = s.schedule.type
      this.wizard.weekday = s.schedule.type === 'weekly' ? s.schedule.weekday : this.wizard.weekday
      if (!this.wizard.time || this.wizard.time === '09:00') this.wizard.time = s.schedule.time
      // 直接进入下一步（场景选定即内容填写）
      this.wizard.step = 1
    },
    // 主题输入 → 未手动编辑指令时重新生成模板；任务名默认跟随「主题 + 场景名」
    syncPrompt() {
      const s = this.scenarios.find(x => x.key === this.wizard.scenario)
      if (!s) return
      if (!this.wizard.promptDirty) {
        this.wizard.prompt = s.prompt(this.wizard.topic || '')
      }
      if (!this.wizard.name || this.wizard.name === s.name || this.wizard.name === (this._lastTopic || '') + s.name) {
        this._lastTopic = this.wizard.topic || ''
        this.wizard.name = (this.wizard.topic ? this.wizard.topic : '') + s.name
      }
    },
    onPromptInput() {
      this.wizard.promptDirty = true
    },
    onScheduleTypeChange() {
      if (this.wizard.scheduleType === 'weekly' && !Number.isInteger(this.wizard.weekday)) {
        this.wizard.weekday = 1
      }
    },
    // 步骤 2 校验（固定高度错误行防抖动，遵循表单惯例）
    validateContent() {
      const w = this.wizard
      const s = this.scenarios.find(x => x.key === w.scenario)
      w.errName = w.name.trim() ? '' : '请填写任务名称'
      w.errTopic = s && s.topic && !w.topic.trim() ? '请填写关注主题' : ''
      w.errPrompt = w.prompt.trim() ? '' : '请填写任务指令'
      w.errWorkspace = w.workspaceId ? '' : '请选择工作空间'
      // 执行模型必选：未配置任何模型引导去添加；选中项已被删除要求重选
      if (!this.providers.length) {
        w.errProvider = '请先在「模型管理」中添加模型'
      } else if (!w.providerId) {
        w.errProvider = '请选择执行模型'
      } else {
        w.errProvider = this.providers.some(p => p.id === w.providerId)
          ? ''
          : '所选模型已被删除，请重新选择'
      }
      return !w.errName && !w.errTopic && !w.errPrompt && !w.errWorkspace && !w.errProvider
    },
    nextStep() {
      if (this.wizard.step === 1 && !this.validateContent()) return
      this.wizard.step++
    },
    previewSchedule() {
      const w = this.wizard
      const rand = w.timeMode === 'random'
      // 首次执行：随机模式以范围「最晚时间」判定日期（当天已过最晚时间才顺延）
      const anchor = rand ? (w.timeRange && w.timeRange[1]) : w.time
      const [h, m] = String(anchor || '09:00').split(':').map(Number)
      const d = new Date()
      d.setHours(h || 0, m || 0, 0, 0)
      if (w.scheduleType === 'weekly') {
        let delta = ((w.weekday || 0) - d.getDay() + 7) % 7
        if (delta === 0 && d.getTime() <= Date.now()) delta = 7
        d.setDate(d.getDate() + delta)
      } else if (d.getTime() <= Date.now()) {
        d.setDate(d.getDate() + 1)
      }
      const datePart = (d.getMonth() + 1) + '月' + d.getDate() + '日'
      return rand
        ? datePart + ' ' + w.timeRange[0] + ' ~ ' + w.timeRange[1] + ' 间随机'
        : datePart + ' ' + (w.time || '09:00')
    },
    async saveTask() {
      if (!this.validateContent()) {
        this.wizard.step = 1
        return
      }
      // 时间校验：固定模式拒绝空串；随机模式要求两端有效且开始早于结束
      const w = this.wizard
      const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/
      if (w.timeMode === 'random') {
        const rs = (w.timeRange && w.timeRange[0]) || ''
        const re = (w.timeRange && w.timeRange[1]) || ''
        if (!TIME_RE.test(rs) || !TIME_RE.test(re) || rs >= re) {
          this.$message.warning('请设置有效的随机时间范围（最早时间需早于最晚时间）')
          return
        }
      } else if (!TIME_RE.test(w.time || '')) {
        this.$message.warning('请设置有效的执行时间')
        return
      }
      const a = this.autoApi()
      if (!a) return
      const payload = {
        name: w.name.trim(),
        scenario: w.scenario,
        prompt: w.prompt.trim(),
        workspaceId: w.workspaceId,
        providerId: w.providerId,
        notify: w.notify,
        schedule: w.timeMode === 'random'
          ? { type: w.scheduleType, weekday: w.weekday, mode: 'random', timeStart: w.timeRange[0], timeEnd: w.timeRange[1] }
          : { type: w.scheduleType, weekday: w.weekday, time: w.time }
      }
      w.saving = true
      try {
        const res = w.editing
          ? await a.update({ id: w.editId, patch: payload })
          : await a.create(payload)
        if (!res || !res.ok) {
          this.$message.error((res && res.error) || '保存失败')
          return
        }
        this.$message.success(w.editing ? '已保存' : '任务已创建')
        w.visible = false
        this.load()
      } finally {
        w.saving = false
      }
    }
  }
}
</script>

<style lang="scss" scoped>
@import '@/styles/buddy-settings.scss';

/* 向导抽屉面板宽度 */
.auto-wizard-panel {
  --ob-drawer-w: 620px;
}

/* 加载骨架容器 */
.ob-sk-wrap {
  padding: 20px 4px;
}

/* hero 右侧操作区（垂直居中对齐标题行） */
.ob-hero-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.ob-auto-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-right: 8px;
}

// 任务行（行式清单：图标 + 主信息 + 操作区）
.ob-auto-row {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 13px 16px;
  border-radius: 12px;
  background: $card-bg;
  border: 1px solid $border-color;
  transition: border-color 0.2s, box-shadow 0.2s;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.35);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  }

  &.off {
    opacity: 0.62;
  }
}

.ob-auto-ico {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.12), rgba(var(--primary-color-rgb), 0.22));
  color: var(--primary-color);

  .svg-icon {
    font-size: 18px;
  }
}

.ob-auto-main {
  flex: 1;
  min-width: 0;
}

.ob-auto-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ob-auto-name {
  font-size: 13.5px;
  font-weight: 700;
  color: $text-primary;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ob-auto-running {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11.5px;
  font-weight: 600;
  color: var(--primary-color);
}

.ob-auto-state {
  font-size: 11.5px;
  font-weight: 600;
  color: $text-secondary;

  &.off {
    color: $text-secondary;
  }
}

.ob-auto-meta {
  margin-top: 4px;
  display: flex;
  align-items: center;
  gap: 14px;
  font-size: 12px;
  color: $text-secondary;

  .svg-icon {
    font-size: 12.5px;
    margin-right: 3px;
    vertical-align: -1.5px;
  }
}

// 任务所用模型（绑定模型被删时红色警示）
.ob-auto-model {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &.missing {
    color: #C0504D;
    font-weight: 600;
  }
}

// 表单内操作链接（如「在模型管理中添加模型」）
.ob-auto-link {
  color: var(--primary-color);
  font-weight: 600;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
}

// 上次结果：状态色 + 可点直达会话
.ob-auto-last {
  cursor: pointer;

  &.ok {
    color: #2E8B63;
  }

  &.fail {
    color: #C0504D;
  }

  &:hover {
    text-decoration: underline;
  }
}

// 失败原因行：红色警示（与上次失败状态色一致），单行截断 hover 全文
.ob-auto-fail {
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  font-size: 11.5px;
  color: #C0504D;
  white-space: nowrap;
  overflow: hidden;

  .svg-icon {
    flex-shrink: 0;
    font-size: 12px;
  }
}

.ob-auto-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

// ===== 向导弹窗 =====
.ob-auto-steps {
  display: flex;
  justify-content: center;
  gap: 28px;
  margin-bottom: 18px;
}

.ob-auto-step {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: $text-secondary;
  cursor: default;

  &.active {
    color: var(--primary-color);

    .ob-auto-step-dot {
      background: var(--primary-color);
      color: #fff;
      border-color: var(--primary-color);
    }
  }

  &.done {
    cursor: pointer;
    color: var(--primary-color);
  }
}

.ob-auto-step-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1.5px solid var(--border-light, rgba(0, 0, 0, 0.15));
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 11px;
}

.ob-auto-pane {
  min-height: 260px;
}

// 场景卡（2×2 网格）
.ob-auto-scene {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 12px;
  border: 1.5px solid var(--border-light, rgba(0, 0, 0, 0.08));
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;

  & + & {
    margin-top: 10px;
  }

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);
  }

  &.active {
    border-color: var(--primary-color);
    background: rgba(var(--primary-color-rgb), 0.06);
  }
}

.ob-auto-scene-ico {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, rgba(var(--primary-color-rgb), 0.12), rgba(var(--primary-color-rgb), 0.22));
  color: var(--primary-color);

  .svg-icon {
    font-size: 18px;
  }
}

.ob-auto-scene-body {
  flex: 1;
  min-width: 0;
}

.ob-auto-scene-name {
  font-size: 13.5px;
  font-weight: 700;
  color: $text-primary;
}

.ob-auto-scene-desc {
  margin-top: 2px;
  font-size: 12px;
  color: $text-secondary;
}

.ob-auto-scene-check {
  font-size: 15px;
  color: var(--primary-color);
}

// 表单字段（固定高度错误行防抖动）
.ob-auto-field {
  margin-bottom: 4px;

  &.row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  &.row-inline {
    display: flex;
    align-items: center;
    gap: 18px;
  }
}

.ob-auto-label {
  display: block;
  margin-bottom: 7px;
  font-size: 12.5px;
  font-weight: 600;
  color: $text-primary;
}

// 执行时间：模式切换 + 时间选择器同行排布
.ob-auto-time-mode {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.ob-auto-time-range {
  width: 320px;
}

.ob-auto-tip {
  margin: 6px 0 2px;
  font-size: 11.5px;
  color: $text-secondary;
}

/* 行内提示（与开关同行，不占独立行） */
.ob-auto-tip-inline {
  margin-left: 10px;
  font-size: 11.5px;
  line-height: 1.4;
  color: $text-secondary;
}

.ob-req {
  color: #C0504D;
  font-style: normal;
  margin-left: 2px;
}

.ob-auto-err {
  height: 15px;
  line-height: 15px;
  margin: 4px 0 8px;
  font-size: 11.5px;
  color: #C0504D;
  visibility: hidden;

  &.show {
    visibility: visible;
  }
}

// 步骤 3 汇总预览
.ob-auto-summary {
  margin-top: 18px;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 12px 14px;
  border-radius: 10px;
  font-size: 12.5px;
  color: $text-secondary;
  background: rgba(var(--primary-color-rgb), 0.06);

  .svg-icon {
    font-size: 14px;
    color: var(--primary-color);
  }

  b {
    color: var(--primary-color);
  }
}
</style>
