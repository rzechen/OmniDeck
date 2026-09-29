<template>
  <tool-shell
    title="IP 查询"
    desc="查询公网 IP 或任意 IP 的地理位置与运营商信息"
    icon="location"
    color="#FAAD14"
    back-path="/tools/other"
  >
    <template #toolbar>
      <el-input
        v-model="ipInput"
        class="ip-input"
        size="small"
        clearable
        placeholder="IP 地址（留空查本机公网 IP）"
        @keyup.enter="query"
      />
      <button class="tool-btn is-primary" :disabled="loading" @click="manualQuery">
        <i :class="loading ? 'el-icon-loading' : 'el-icon-search'"></i>
        {{ loading ? '查询中…' : '查询' }}
      </button>
      <button class="tool-btn" :class="{ 'is-primary': historyVisible }" @click="historyVisible = !historyVisible">
        <i class="el-icon-time"></i>
        历史
      </button>
    </template>

    <div class="ip-body">
      <!-- 结果卡片 -->
      <div v-if="ipInfo" class="ip-result">
        <div class="ip-result-head">
          <div class="ip-big mono">{{ ipInfo.query }}</div>
          <div class="ip-flag">{{ ipInfo.country }}</div>
        </div>
        <div class="ip-grid">
          <div v-for="f in fields" :key="f.label" class="ip-item">
            <div class="ip-item-label">{{ f.label }}</div>
            <div class="ip-item-value">{{ f.value || '—' }}</div>
          </div>
        </div>
        <div class="ip-copy-row">
          <button class="tool-btn" @click="copyResult">
            <i class="el-icon-document-copy"></i>复制全部信息
          </button>
        </div>
      </div>

      <!-- 骨架屏：查询中 -->
      <div v-else-if="loading" class="ip-result ip-sk">
        <div class="ip-result-head">
          <div class="ip-sk-line" style="width: 150px; height: 22px"></div>
          <div class="ip-sk-line" style="width: 60px; height: 16px"></div>
        </div>
        <div class="ip-grid">
          <div v-for="n in 8" :key="n" class="ip-item">
            <div class="ip-sk-line" style="width: 44px; height: 10px"></div>
            <div class="ip-sk-line" style="width: 70%; height: 13px; margin-top: 6px"></div>
          </div>
        </div>
      </div>

      <!-- 空态 -->
      <div v-else class="ip-empty">
        <i class="el-icon-location-information"></i>
        <p>输入 IP 地址查询归属地，留空则查询本机公网 IP</p>
      </div>
    </div>

    <!-- 执行历史面板（与主体并排，右侧抽屉） -->
    <tool-history-panel
      :visible="historyVisible"
      :tool="TOOL_PATH"
      @close="historyVisible = false"
      @restore="restoreFromHistory"
    />

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!lastError }"></span>
      <span v-if="lastError" class="status-err">{{ lastError }}</span>
      <span v-else>数据来源：ip-api.com（中文）</span>
      <span class="status-right">{{ ipcReady ? '主进程代理请求' : '浏览器模式（可能受 CORS 限制）' }}</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import ToolHistoryPanel from '@/components/tool/ToolHistoryPanel.vue'
import { record, get as getHistory } from '@/utils/tool-history'

// ip-api.com 免费接口：中文返回，无需 Key
const API = ip =>
  'http://ip-api.com/json/' + (ip || '') + '?lang=zh-CN&fields=status,message,country,countryCode,regionName,city,district,zip,lat,lon,timezone,isp,org,as,query'

const TOOL_PATH = '/tools/other/ip-query'

export default {
  name: 'OtherIpQuery',
  components: { ToolShell, ToolHistoryPanel },
  data() {
    return {
      ipInput: '',
      ipInfo: null,
      loading: false,
      lastError: '',
      historyVisible: false,
      TOOL_PATH: TOOL_PATH
    }
  },
  computed: {
    ipcReady() {
      return !!(window.electronAPI && window.electronAPI.httpRequest)
    },
    fields() {
      const d = this.ipInfo || {}
      return [
        { label: '国家 / 地区', value: d.country ? d.country + '（' + d.countryCode + '）' : '' },
        { label: '省份', value: d.regionName },
        { label: '城市', value: d.city },
        { label: '区县', value: d.district },
        { label: '邮编', value: d.zip },
        { label: '时区', value: d.timezone },
        { label: '运营商', value: d.isp },
        { label: '组织', value: d.org },
        { label: 'AS 编号', value: d.as },
        { label: '经纬度', value: d.lat && d.lon ? d.lat + ', ' + d.lon : '' }
      ]
    }
  },
  mounted() {
    this.query()
  },
  methods: {
    isValidIP(ip) {
      if (!ip) return true // 留空查本机
      return /^(\d{1,3}\.){3}\d{1,3}$/.test(ip) &&
        ip.split('.').every(n => Number(n) >= 0 && Number(n) <= 255)
    },
    async query() {
      const ip = this.ipInput.trim()
      if (!this.isValidIP(ip)) {
        this.$message.warning('IP 地址格式不正确')
        return
      }
      this.loading = true
      this.lastError = ''
      try {
        let res
        if (this.ipcReady) {
          res = await window.electronAPI.httpRequest({ method: 'GET', url: API(ip), timeout: 10000 })
        } else {
          const r = await fetch(API(ip))
          res = { ok: r.ok, body: await r.text() }
        }
        if (!res.ok) {
          throw new Error(res.error || 'HTTP ' + res.status)
        }
        const data = JSON.parse(res.body)
        if (data.status !== 'success') {
          throw new Error(data.message || '查询失败')
        }
        this.ipInfo = data
      } catch (e) {
        this.lastError = '查询失败：' + e.message
        this.$message.error(this.lastError)
      } finally {
        this.loading = false
      }
    },
    // 手动查询（按钮触发）：成功后记录历史
    async manualQuery() {
      await this.query()
      if (this.ipInfo && !this.lastError) {
        record(TOOL_PATH, {
          input: this.ipInput.trim(),
          output: this.fields.filter(f => f.value).map(f => f.label + '：' + f.value).join('\n'),
          options: { action: 'query', ip: this.ipInfo.query || this.ipInput.trim() }
        })
      }
    },
    async restoreFromHistory(item) {
      const full = await getHistory(item.id)
      if (!full) {
        this.$message.warning('该记录已被删除')
        return
      }
      this.ipInput = full.input || (full.options && full.options.ip) || ''
      this.$message.success('已从历史恢复，点击查询重新获取')
    },
    async copyResult() {
      const text = this.fields
        .filter(f => f.value)
        .map(f => f.label + '：' + f.value)
        .join('\n')
      try {
        await navigator.clipboard.writeText('IP：' + this.ipInfo.query + '\n' + text)
        this.$message.success('已复制')
      } catch (e) {
        this.$message.error('复制失败')
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.ip-input {
  width: 220px;
}

.ip-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  -webkit-app-region: no-drag;
}

.ip-result {
  width: min(560px, 100%);
  margin-top: 10px;
  border: 1px solid var(--border-color);
  border-radius: 14px;
  background: var(--card-bg);
  box-shadow: var(--shadow-sm);
  overflow: hidden;
}

.ip-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(47, 84, 235, 0.08), transparent 80%);
  border-bottom: 1px solid var(--border-color);
}

.ip-big {
  font-size: 22px;
  font-weight: 800;
  color: var(--text-primary);
  letter-spacing: 0.5px;
}

.ip-flag {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary-color);
}

.ip-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  background: var(--border-color);
}

.ip-item {
  background: var(--card-bg);
  padding: 11px 20px;
}

.ip-item-label {
  font-size: 11px;
  color: var(--text-secondary);
  margin-bottom: 3px;
}

.ip-item-value {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text-primary);
  word-break: break-all;
}

.ip-copy-row {
  display: flex;
  justify-content: flex-end;
  padding: 10px 14px;
}

.ip-empty {
  width: min(460px, 90%);
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-secondary);
  border: 1.5px dashed var(--border-color);
  border-radius: 12px;

  i {
    font-size: 34px;
    opacity: 0.4;
  }

  p {
    font-size: 12.5px;
  }
}

/* ============ 骨架屏 ============ */
.ip-sk {
  pointer-events: none;
}

.ip-sk-line {
  background: linear-gradient(90deg, var(--search-bg) 25%, var(--border-color) 37%, var(--search-bg) 63%);
  background-size: 400% 100%;
  animation: ip-sk-wave 1.3s ease infinite;
  border-radius: 6px;
}

@keyframes ip-sk-wave {
  0% {
    background-position: 100% 50%;
  }
  100% {
    background-position: 0 50%;
  }
}
</style>
