<template>
  <tool-shell
    title="API 调试"
    desc="批量数据驱动的接口链式执行，支持 ${input} 与 ${prev.xxx} 变量传递"
    icon="api"
    color="#FAAD14"
    back-path="/tools/other"
  >
    <template #toolbar>
      <button class="tool-btn" @click="showDataSource = true">
        <i class="el-icon-data-line"></i>数据源
        <span v-if="dataRows.length" class="api-badge">{{ dataRows.length }}</span>
      </button>
      <button class="tool-btn" @click="addStep">
        <i class="el-icon-plus"></i>添加步骤
      </button>
      <button class="tool-btn is-primary" :disabled="running" @click="executePipeline">
        <i :class="running ? 'el-icon-loading' : 'el-icon-video-play'"></i>
        {{ running ? '执行中…' : '执行' }}
      </button>
    </template>

    <div class="split-pane">
      <!-- 左：步骤链 -->
      <div class="pane" style="flex: 0.9">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">请求链（{{ steps.length }} 步）</span>
        </div>
        <div class="pane-body api-steps">
          <div v-if="!steps.length" class="api-empty">
            <i class="el-icon-connection"></i>
            <p>点击右上角「添加步骤」构建请求链</p>
          </div>
          <template v-for="(step, index) in steps">
            <div :key="'c' + index" class="api-step" @click="openConfig(index)">
              <div class="api-step-index">{{ index + 1 }}</div>
              <div class="api-step-main">
                <div class="api-step-info">
                  <span class="api-method" :class="step.method.toLowerCase()">{{ step.method }}</span>
                  <span class="api-step-name">{{ step.name || '未命名步骤' }}</span>
                </div>
                <div class="api-step-url mono">{{ step.url || '未配置 URL' }}</div>
              </div>
              <div class="api-step-actions">
                <button title="编辑" @click.stop="openConfig(index)"><i class="el-icon-edit"></i></button>
                <button title="删除" class="is-danger" @click.stop="removeStep(index)"><i class="el-icon-delete"></i></button>
              </div>
            </div>
            <div v-if="index < steps.length - 1" :key="'l' + index" class="api-step-link">
              <i class="el-icon-bottom"></i>
            </div>
          </template>
        </div>
      </div>

      <!-- 右：执行日志 -->
      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">执行日志（{{ logs.length }}）</span>
          <button class="tool-btn" style="height: 20px; padding: 0 8px; font-size: 11px" @click="logs = []">清空</button>
        </div>
        <div class="pane-body api-logs">
          <el-table
            :data="logs"
            size="mini"
            height="100%"
            :empty-text="'暂无执行记录'"
          >
            <el-table-column prop="time" label="时间" width="76" align="center">
              <template slot-scope="s"><span class="mono">{{ s.row.time }}</span></template>
            </el-table-column>
            <el-table-column prop="row" label="输入" width="110" show-overflow-tooltip>
              <template slot-scope="s"><span class="mono">{{ s.row.row }}</span></template>
            </el-table-column>
            <el-table-column prop="stepName" label="步骤" width="110" show-overflow-tooltip />
            <el-table-column label="状态" width="82" align="center">
              <template slot-scope="s">
                <span class="api-status" :class="s.row.success ? 'ok' : 'bad'">{{ s.row.status }}</span>
              </template>
            </el-table-column>
            <el-table-column label="耗时" width="70" align="center">
              <template slot-scope="s"><span class="mono">{{ s.row.ms }}ms</span></template>
            </el-table-column>
            <el-table-column label="响应内容" min-width="160">
              <template slot-scope="s">
                <el-link type="primary" :underline="false" @click="viewDetail(s.row)">
                  {{ s.row.result.slice(0, 60) }}…
                </el-link>
              </template>
            </el-table-column>
          </el-table>
        </div>
      </div>
    </div>

    <!-- 数据源抽屉 -->
    <el-drawer title="批量数据源" :visible.sync="showDataSource" size="420px" append-to-body>
      <div class="api-drawer-body">
        <el-alert
          type="info"
          :closable="false"
          show-icon
          title="每行一条数据，执行时逐条依次跑完整条请求链"
          description="请求中可用 ${input} 引用当前行数据，用 ${prev.字段名} 引用上一步的 JSON 响应，如 ${prev.data.token}"
          style="margin-bottom: 12px"
        />
        <el-input
          v-model="dataSourceRaw"
          type="textarea"
          :rows="16"
          class="api-mono-textarea"
          placeholder="user_001&#10;user_002&#10;user_003"
        />
        <div class="api-drawer-footer">{{ dataRows.length }} 条数据</div>
      </div>
    </el-drawer>

    <!-- 步骤配置抽屉 -->
    <el-drawer
      :title="'步骤配置' + (currentStep && currentStep.name ? ' · ' + currentStep.name : '')"
      :visible.sync="showConfig"
      size="520px"
      append-to-body
    >
      <div v-if="currentStep" class="api-drawer-body">
        <el-form label-position="top" size="small">
          <el-form-item label="步骤名称">
            <el-input v-model="currentStep.name" placeholder="如：获取用户信息" />
          </el-form-item>
          <div class="api-method-url">
            <el-select v-model="currentStep.method" style="width: 100px">
              <el-option v-for="m in ['GET', 'POST', 'PUT', 'DELETE', 'PATCH']" :key="m" :label="m" :value="m" />
            </el-select>
            <el-input v-model="currentStep.url" placeholder="https://api.example.com/user/${input}" class="api-mono-input" />
          </div>

          <el-tabs value="headers" style="margin-top: 14px">
            <el-tab-pane label="请求头" name="headers">
              <div v-for="(h, i) in currentStep.headers" :key="i" class="api-kv-row">
                <el-input v-model="h.key" placeholder="Key（如 Authorization）" class="api-mono-input" />
                <el-input v-model="h.value" placeholder="Value（支持 ${input} / ${prev.xxx}）" class="api-mono-input" />
                <button class="api-kv-del" @click="currentStep.headers.splice(i, 1)"><i class="el-icon-delete"></i></button>
              </div>
              <button class="tool-btn" @click="currentStep.headers.push({ key: '', value: '' })">
                <i class="el-icon-plus"></i>添加请求头
              </button>
            </el-tab-pane>
            <el-tab-pane label="请求体" name="body" :disabled="currentStep.method === 'GET'">
              <div class="api-body-hint">
                支持 <b>${input}</b> 与 <b>${prev.字段名}</b> 变量，如 { "userId": "${input}", "token": "${prev.data.token}" }
              </div>
              <el-input
                v-model="currentStep.body"
                type="textarea"
                :rows="10"
                class="api-mono-textarea"
                placeholder='{ "userId": "${input}" }'
              />
            </el-tab-pane>
          </el-tabs>
        </el-form>
      </div>
      <div class="api-drawer-footer-bar">
        <button class="tool-btn is-primary" @click="showConfig = false">完成</button>
      </div>
    </el-drawer>

    <!-- 响应详情 -->
    <el-dialog title="响应详情" :visible.sync="showDetail" width="640px" :close-on-click-modal="false" append-to-body>
      <div v-if="selectedLog" class="api-detail">
        <div class="api-detail-meta">
          <span>输入：<b class="mono">{{ selectedLog.row }}</b></span>
          <span>步骤：{{ selectedLog.stepName }}</span>
          <span class="api-status" :class="selectedLog.success ? 'ok' : 'bad'">{{ selectedLog.status }}</span>
          <span class="mono">{{ selectedLog.ms }}ms</span>
        </div>
        <pre class="api-json mono">{{ formatJSON(selectedLog.result) }}</pre>
      </div>
    </el-dialog>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': failCount > 0 }"></span>
      <span>成功 {{ successCount }} · 失败 {{ failCount }}</span>
      <span class="status-right">{{ ipcReady ? '主进程代理请求（无 CORS 限制）' : '浏览器模式（受 CORS 限制）' }}</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'OtherApi',
  components: { ToolShell },
  data() {
    return {
      showDataSource: false,
      showConfig: false,
      showDetail: false,
      running: false,
      activeStepIndex: -1,
      dataSourceRaw: '',
      steps: [
        {
          name: '示例：提交任务',
          method: 'POST',
          url: 'https://httpbin.org/post',
          headers: [{ key: 'Content-Type', value: 'application/json' }],
          body: '{ "title": "Batch Task", "user": "${input}" }'
        }
      ],
      logs: [],
      selectedLog: null
    }
  },
  computed: {
    ipcReady() {
      return !!(window.electronAPI && window.electronAPI.httpRequest)
    },
    dataRows() {
      return this.dataSourceRaw
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean)
    },
    currentStep() {
      return this.steps[this.activeStepIndex] || null
    },
    successCount() {
      return this.logs.filter(l => l.success).length
    },
    failCount() {
      return this.logs.filter(l => !l.success).length
    }
  },
  methods: {
    // ---- 步骤管理 ----
    addStep() {
      this.steps.push({
        name: '步骤 ' + (this.steps.length + 1),
        method: 'GET',
        url: '',
        headers: [{ key: 'Content-Type', value: 'application/json' }],
        body: ''
      })
      this.openConfig(this.steps.length - 1)
    },
    removeStep(index) {
      this.steps.splice(index, 1)
    },
    openConfig(index) {
      this.activeStepIndex = index
      this.showConfig = true
    },
    // ---- 模板变量：${input} / ${prev.a.b} ----
    parseTemplate(tpl, context) {
      if (!tpl) return ''
      return tpl.replace(/\$\{(.*?)\}/g, (match, key) => {
        let val = context
        for (const k of key.trim().split('.')) {
          if (val && Object.prototype.hasOwnProperty.call(val, k)) {
            val = val[k]
          } else {
            val = undefined
            break
          }
        }
        if (val === undefined) return match
        return typeof val === 'object' ? JSON.stringify(val) : String(val)
      })
    },
    // ---- 发送请求：优先主进程代理，浏览器环境回退 fetch ----
    async sendRequest({ method, url, headers, body }) {
      if (this.ipcReady) {
        return window.electronAPI.httpRequest({ method, url, headers, body: body || '', timeout: 15000 })
      }
      // 浏览器兜底（受 CORS 限制）
      const started = Date.now()
      try {
        const res = await fetch(url, {
          method,
          headers,
          body: method === 'GET' ? undefined : body || undefined
        })
        const text = await res.text()
        return { ok: true, status: res.status, statusText: res.statusText, body: text, durationMs: Date.now() - started }
      } catch (e) {
        return { ok: false, error: e.message, durationMs: Date.now() - started }
      }
    },
    // ---- 执行流水线：每行数据跑完整条链 ----
    async executePipeline() {
      if (!this.dataRows.length) {
        this.$message.warning('请先在「数据源」中输入批量数据')
        this.showDataSource = true
        return
      }
      if (!this.steps.length) {
        this.$message.warning('请先添加请求步骤')
        return
      }
      this.running = true
      try {
        for (const inputData of this.dataRows) {
          let prevResponse = null
          for (const step of this.steps) {
            const context = { input: inputData, prev: prevResponse }
            const url = this.parseTemplate(step.url, context)
            const headers = {}
            step.headers.forEach(h => {
              if (h.key) headers[h.key] = this.parseTemplate(h.value, context)
            })
            const body = step.method !== 'GET' ? this.parseTemplate(step.body, context) : ''

            const res = await this.sendRequest({ method: step.method, url, headers, body })
            const success = res.ok && res.status >= 200 && res.status < 400
            this.addLog(inputData, step.name || step.url, success, success ? res.status : 'FAIL', res.durationMs || 0, res.ok ? res.body : res.error)

            if (!res.ok) break // 当前链中断，进入下一行数据
            // 记录响应供下一步 ${prev.xxx} 引用
            try {
              prevResponse = JSON.parse(res.body)
            } catch (e) {
              prevResponse = { raw: res.body }
            }
          }
        }
        this.$message.success('执行完成')
      } finally {
        this.running = false
      }
    },
    addLog(row, stepName, success, status, ms, result) {
      const now = new Date()
      const pad = n => String(n).padStart(2, '0')
      this.logs.unshift({
        time: `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`,
        row,
        stepName,
        success,
        status,
        ms,
        result: String(result || '')
      })
      if (this.logs.length > 100) this.logs.pop()
    },
    viewDetail(log) {
      this.selectedLog = log
      this.showDetail = true
    },
    formatJSON(str) {
      try {
        return JSON.stringify(JSON.parse(str), null, 2)
      } catch (e) {
        return str
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.api-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 16px;
  height: 16px;
  padding: 0 5px;
  border-radius: 8px;
  background: var(--primary-color);
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
}

/* ============ 步骤链 ============ */
.api-steps {
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  -webkit-app-region: no-drag;
}

.api-step {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 11px;
  background: var(--card-bg);
  cursor: pointer;
  transition: all 0.16s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    transform: translateY(-1px);
    box-shadow: var(--shadow-sm);

    .api-step-actions {
      opacity: 1;
    }
  }
}

.api-step-index {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--search-bg);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.api-step-main {
  flex: 1;
  min-width: 0;
}

.api-step-info {
  display: flex;
  align-items: center;
  gap: 7px;
}

.api-method {
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.5px;
  padding: 2px 6px;
  border-radius: 5px;
  color: #fff;

  &.get { background: #1677FF; }
  &.post { background: #52C41A; }
  &.put { background: #FA8C16; }
  &.delete { background: #F54A45; }
  &.patch { background: #722ED1; }
}

.api-step-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.api-step-url {
  margin-top: 3px;
  font-size: 11px;
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.api-step-actions {
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;

  button {
    width: 24px;
    height: 24px;
    border: 1px solid var(--border-color);
    border-radius: 7px;
    background: var(--card-bg);
    color: var(--text-secondary);
    cursor: pointer;
    font-size: 12px;

    &:hover {
      color: var(--primary-color);
      border-color: rgba(var(--primary-color-rgb), 0.5);
    }

    &.is-danger:hover {
      color: #F54A45;
      border-color: rgba(245, 74, 69, 0.5);
    }
  }
}

.api-step-link {
  height: 26px;
  display: flex;
  align-items: center;
  color: var(--text-secondary);
  font-size: 15px;
  opacity: 0.55;
}

.api-empty {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  border: 1.5px dashed var(--border-color);
  border-radius: 12px;
  width: 100%;

  i {
    font-size: 30px;
    opacity: 0.4;
  }

  p {
    font-size: 12.5px;
  }
}

/* ============ 日志 ============ */
.api-logs {
  -webkit-app-region: no-drag;
}

.api-status {
  font-size: 11px;
  font-weight: 700;
  padding: 1px 7px;
  border-radius: 999px;

  &.ok {
    color: #52C41A;
    background: rgba(82, 196, 26, 0.12);
  }

  &.bad {
    color: #F54A45;
    background: rgba(245, 74, 69, 0.12);
  }
}

/* ============ 抽屉 ============ */
.api-drawer-body {
  padding: 4px 20px 20px;
}

.api-drawer-footer {
  margin-top: 10px;
  text-align: right;
  font-size: 12px;
  color: var(--text-secondary);
}

.api-drawer-footer-bar {
  padding: 12px 20px;
  text-align: right;
  border-top: 1px solid var(--border-color);
}

.api-method-url {
  display: flex;
  gap: 8px;
}

.api-kv-row {
  display: flex;
  gap: 6px;
  margin-bottom: 8px;
  align-items: center;
}

.api-kv-del {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    color: #F54A45;
    background: rgba(245, 74, 69, 0.08);
  }
}

.api-body-hint {
  font-size: 12px;
  color: #FA8C16;
  margin-bottom: 8px;
  line-height: 1.6;
}

.api-mono-input {
  font-family: 'SF Mono', Menlo, Consolas, monospace;
  font-size: 12px;
}

.api-mono-textarea {
  :deep(.el-textarea__inner) {
    font-family: 'SF Mono', Menlo, Consolas, monospace;
    font-size: 12px;
    line-height: 1.6;
  }
}

/* ============ 详情 ============ */
.api-detail-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--text-secondary);
  margin-bottom: 12px;
}

.api-json {
  max-height: 56vh;
  overflow: auto;
  background: #282c34;
  color: #abb2bf;
  padding: 14px;
  border-radius: 10px;
  font-size: 12.5px;
  line-height: 1.6;
}
</style>
