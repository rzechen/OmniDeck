<template>
  <tool-shell
    title="抽奖"
    desc="年会抽奖系统：自定义奖项、批量导入名单、全屏抽取"
    icon="gift"
    color="#FAAD14"
    back-path="/tools/other"
  >
    <template #toolbar>
      <button class="tool-btn" @click="drawerVisible = true">
        <svg-icon icon-class="setting" />抽奖设置
      </button>
      <button class="tool-btn" @click="toggleFullscreen">
        <svg-icon :icon-class="(isFullscreen ? 'close' : 'full-screen')" />
        {{ isFullscreen ? '退出全屏' : '全屏抽奖' }}
      </button>
    </template>

    <!-- 抽奖舞台（全屏时覆盖整个窗口） -->
    <div class="lot-stage" :class="{ 'is-fullscreen': isFullscreen }">
      <!-- 全屏时舞台覆盖工具栏，需在舞台内提供退出入口 -->
      <button
        v-if="isFullscreen"
        class="lot-exit-btn"
        title="退出全屏（Esc）"
        @click="toggleFullscreen"
      >
        <svg-icon icon-class="close" />
        退出全屏
      </button>
      <div class="lot-confetti">🎉</div>
      <div class="lot-title">{{ customTitle || '🎉 年会抽奖 🎉' }}</div>

      <div v-if="currentPrize" class="lot-prize">
        🎁 正在抽取：{{ currentPrize.level }}<template v-if="currentPrize.gift"> · {{ currentPrize.gift }}</template>
      </div>

      <div class="lot-main">
        <div class="lot-name" :class="{ 'is-rolling': rolling }">
          {{ currentUser.name || '等待抽奖' }}
        </div>
        <div class="lot-phone mono">{{ currentUser.phone || '———————' }}</div>
      </div>

      <div class="lot-controls">
        <button class="lot-draw-btn" :class="{ rolling }" @click="toggleDraw">
          {{ rolling ? '停 止' : '开始抽奖' }}
        </button>
      </div>

      <!-- 中奖名单 -->
      <div class="lot-winners">
        <div class="lot-winners-header">🏆 中奖名单（{{ winners.length }}）</div>
        <div class="lot-winners-list">
          <div v-for="(w, i) in winners" :key="i" class="lot-winner">
            <span class="lot-winner-prize">{{ w.prize }}</span>
            <span class="lot-winner-name">{{ w.name }}</span>
          </div>
          <div v-if="!winners.length" class="lot-winners-empty">暂无中奖者</div>
        </div>
      </div>
    </div>

    <!-- 设置抽屉 -->
    <el-drawer
      title="抽奖设置"
      v-model="drawerVisible"
      size="480px"
      append-to-body
    >
      <div class="lot-settings">
        <el-form label-width="70px" size="small">
          <el-form-item label="活动标题">
            <el-input v-model="customTitle" placeholder="🎉 年会抽奖 🎉" maxlength="30" />
          </el-form-item>
        </el-form>

        <!-- 奖项设置 -->
        <div class="lot-section-title">奖项设置</div>
        <div v-for="(p, i) in prizeConfig" :key="i" class="lot-prize-row">
          <el-input v-model="p.level" size="small" placeholder="奖项名称" class="lot-prize-level" />
          <el-input-number v-model="p.count" size="small" :min="0" :max="999" controls-position="right" class="lot-prize-count" />
          <el-input v-model="p.gift" size="small" placeholder="奖品（选填）" class="lot-prize-gift" />
          <button class="lot-row-del" title="删除奖项" @click="removePrize(i)">
            <svg-icon icon-class="delete" />
          </button>
        </div>
        <button class="tool-btn" @click="addPrize"><svg-icon icon-class="plus" />添加奖项</button>

        <!-- 人员管理 -->
        <div class="lot-section-title">
          抽奖人员（{{ userList.length }}）
          <span class="lot-section-actions">
            <button class="tool-btn" @click="downloadTemplate"><svg-icon icon-class="download" />模板</button>
            <button class="tool-btn" @click="$refs.fileInput.click()"><svg-icon icon-class="upload2" />导入</button>
          </span>
        </div>
        <input ref="fileInput" type="file" accept=".txt,.csv" style="display: none" @change="handleFileChange" />
        <div class="lot-user-add">
          <el-input v-model="newUser.name" size="small" placeholder="姓名" style="width: 110px" />
          <el-input v-model="newUser.phone" size="small" placeholder="手机号 / 工号" style="width: 150px" />
          <button class="tool-btn is-primary" @click="addUser"><svg-icon icon-class="plus" />添加</button>
        </div>
        <el-table :data="pagedUsers" size="small" max-height="240">
          <el-table-column prop="name" label="姓名" min-width="80" />
          <el-table-column prop="phone" label="手机号 / 工号" min-width="120" />
          <el-table-column label="操作" width="60" align="center">
            <template #default="s">
              <el-button link size="small" class="lot-del-text" @click="removeUser(s.$index)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          v-if="userList.length > 50"
          small
          layout="prev, pager, next"
          :total="userList.length"
          :page-size="50"
          v-model:current-page="userPage"
          style="margin-top: 8px; text-align: center"
        />

        <!-- 危险操作 -->
        <div class="lot-section-title">数据管理</div>
        <button class="tool-btn is-danger" @click="resetAllData">
          <svg-icon icon-class="refresh-left" />重置所有数据
        </button>
      </div>
    </el-drawer>

    <template #status>
      <span class="status-dot"></span>
      <span>人员 {{ userList.length }} · 已抽 {{ winners.length }} 人 · 剩余 {{ availableUsers.length }} 人可抽</span>
      <span class="status-right">{{ currentPrizeText }}</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import { getItem, setItem } from '@/utils/db'

const DEFAULT_PRIZES = [
  { level: '一等奖', count: 1, gift: '' },
  { level: '二等奖', count: 2, gift: '' },
  { level: '三等奖', count: 5, gift: '' }
]

const DEFAULT_USERS = [
  '张伟', '李娜', '王强', '刘敏', '陈浩', '赵丽', '孙涛', '周洁',
  '吴刚', '郑芳', '马超', '胡雪', '林峰', '何静', '高翔', '郭晶'
].map((name, i) => ({ name, phone: String(13800000000 + i + 1) }))

export default {
  name: 'OtherLottery',
  components: { ToolShell },
  data() {
    return {
      rolling: false,
      timer: null,
      rollIndex: 0,
      drawerVisible: false,
      isFullscreen: false,
      currentUser: {},
      currentPrize: null,
      customTitle: '',
      userList: [],
      newUser: { name: '', phone: '' },
      prizeConfig: JSON.parse(JSON.stringify(DEFAULT_PRIZES)),
      winners: [],
      userPage: 1
    }
  },
  computed: {
    // 未中奖人员（按手机号/工号去重判断）
    availableUsers() {
      const won = new Set(this.winners.map(w => w.phone))
      return this.userList.filter(u => !won.has(u.phone))
    },
    pagedUsers() {
      const start = (this.userPage - 1) * 50
      return this.userList.slice(start, start + 50)
    },
    currentPrizeText() {
      const next = this.prizeConfig.find(p => p.count > 0)
      return next ? `下一奖项：${next.level}（剩 ${next.count} 名）` : '所有奖项已抽完'
    }
  },
  watch: {
    // 配置变更即时持久化
    customTitle() { this.persist('lottery_title', this.customTitle) },
    prizeConfig: { deep: true, handler() { this.persist('lottery_prizes', this.prizeConfig) } },
    userList: { deep: true, handler() { this.persist('lottery_users', this.userList) } },
    winners: { deep: true, handler() { this.persist('lottery_winners', this.winners) } }
  },
  created() {
    this.loadAll()
    window.addEventListener('keydown', this.onKeydown)
  },
  beforeUnmount() {
    clearInterval(this.timer)
    window.removeEventListener('keydown', this.onKeydown)
  },
  methods: {
    // ---- 持久化（IndexedDB，经 db 工具的内存缓存） ----
    persist(key, value) {
      setItem(key, value)
    },
    loadAll() {
      const title = getItem('lottery_title')
      const prizes = getItem('lottery_prizes')
      const users = getItem('lottery_users')
      const winners = getItem('lottery_winners')
      if (typeof title === 'string') this.customTitle = title
      if (Array.isArray(prizes) && prizes.length) this.prizeConfig = prizes
      this.userList = Array.isArray(users) && users.length ? users : JSON.parse(JSON.stringify(DEFAULT_USERS))
      this.winners = Array.isArray(winners) ? winners : []
      if (!Array.isArray(users) || !users.length) this.persist('lottery_users', this.userList)
    },
    // ---- 奖项管理 ----
    addPrize() {
      this.prizeConfig.push({ level: '', count: 1, gift: '' })
    },
    removePrize(i) {
      if (this.prizeConfig.length <= 1) {
        this.$message.warning('至少保留一个奖项')
        return
      }
      this.prizeConfig.splice(i, 1)
    },
    // ---- 人员管理 ----
    addUser() {
      const { name, phone } = this.newUser
      if (!name.trim()) {
        this.$message.warning('请输入姓名')
        return
      }
      if (!phone.trim()) {
        this.$message.warning('请输入手机号或工号')
        return
      }
      if (this.userList.some(u => u.phone === phone.trim())) {
        this.$message.error('该手机号/工号已存在')
        return
      }
      this.userList.push({ name: name.trim(), phone: phone.trim() })
      this.newUser = { name: '', phone: '' }
      this.$message.success('添加成功')
    },
    removeUser(index) {
      this.userList.splice(index, 1)
    },
    downloadTemplate() {
      const content = '姓名,手机号\n张伟,13800138001\n李娜,13800138002'
      const blob = new Blob(['\uFEFF' + content], { type: 'text/plain;charset=utf-8' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = '抽奖人员模板.csv'
      link.click()
      URL.revokeObjectURL(link.href)
    },
    handleFileChange(e) {
      const file = e.target.files[0]
      if (!file) return
      const reader = new FileReader()
      reader.onload = ev => {
        const lines = String(ev.target.result)
          .split(/\r?\n/)
          .map(l => l.trim())
          .filter(Boolean)
        if (lines.length < 2) {
          this.$message.error('文件内容为空或格式不正确')
          return
        }
        // 跳过表头（含"姓名"字样的行）
        const dataLines = lines[0].includes('姓名') ? lines.slice(1) : lines
        const added = []
        const existPhones = new Set(this.userList.map(u => u.phone))
        for (const line of dataLines) {
          const parts = line.split(/[,，\t]/).map(s => s.trim())
          if (parts.length >= 2 && parts[0] && parts[1] && !existPhones.has(parts[1])) {
            added.push({ name: parts[0], phone: parts[1] })
            existPhones.add(parts[1])
          }
        }
        if (added.length) {
          this.userList = [...this.userList, ...added]
          this.$message.success(`成功导入 ${added.length} 人`)
        } else {
          this.$message.warning('没有可导入的有效数据')
        }
      }
      reader.readAsText(file, 'utf-8')
      e.target.value = ''
    },
    // ---- 抽奖流程 ----
    toggleDraw() {
      this.rolling ? this.stopDraw() : this.startDraw()
    },
    startDraw() {
      const pool = this.availableUsers
      if (!pool.length) {
        this.$message.warning('所有人都已中奖')
        return
      }
      const prize = this.prizeConfig.find(p => p.count > 0)
      if (!prize) {
        this.$message.warning('所有奖项已抽完，可在设置中重置')
        return
      }
      this.currentPrize = prize
      this.rolling = true
      this.rollIndex = 0
      this.timer = setInterval(() => {
        this.currentUser = pool[this.rollIndex % pool.length]
        this.rollIndex++
      }, 70)
    },
    stopDraw() {
      clearInterval(this.timer)
      this.timer = null
      this.rolling = false
      const pool = this.availableUsers
      if (!pool.length || !this.currentPrize) return
      // crypto 公平随机
      const idx = new Uint32Array(1)
      crypto.getRandomValues(idx)
      const winner = pool[idx[0] % pool.length]
      this.currentUser = winner
      this.winners.push({ ...winner, prize: this.currentPrize.level })
      this.currentPrize.count--
      this.$message.success(`🎉 恭喜 ${winner.name} 获得${this.currentPrize.level}`)
      if (!this.prizeConfig.find(p => p.count > 0)) {
        this.currentPrize = null
      }
    },
    // ---- 全屏（CSS 覆盖窗口） ----
    toggleFullscreen() {
      this.isFullscreen = !this.isFullscreen
    },
    onKeydown(e) {
      if (e.key === 'Escape' && this.isFullscreen) {
        this.isFullscreen = false
      }
    },
    resetAllData() {
      this.$confirm('将清空中奖记录并恢复默认奖项与人员名单，是否继续？', '重置所有数据', {
        confirmButtonText: '重置',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        clearInterval(this.timer)
        this.timer = null
        this.rolling = false
        this.currentUser = {}
        this.currentPrize = null
        this.customTitle = ''
        this.prizeConfig = JSON.parse(JSON.stringify(DEFAULT_PRIZES))
        this.userList = JSON.parse(JSON.stringify(DEFAULT_USERS))
        this.winners = []
        this.$message.success('数据已重置')
      }).catch(() => {})
    }
  }
}
</script>

<style lang="scss" scoped>
/* ============ 舞台 ============ */
.lot-stage {
  flex: 1;
  min-height: 0;
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  border-radius: 12px;
  overflow: hidden;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(245, 34, 45, 0.25), transparent 55%),
    radial-gradient(ellipse at 80% 100%, rgba(250, 140, 22, 0.18), transparent 55%),
    linear-gradient(160deg, #2a1215, #1b1120 60%, #10101c);
  -webkit-app-region: no-drag;

  &.is-fullscreen {
    position: fixed;
    inset: 0;
    z-index: 9990;
    border-radius: 0;
  }
}

/* 全屏舞台内的退出按钮（右上角悬浮） */
.lot-exit-btn {
  position: absolute;
  top: 14px;
  right: 16px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 14px;
  border: 1px solid rgba(255, 255, 255, 0.35);
  border-radius: 15px;
  background: rgba(0, 0, 0, 0.28);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  backdrop-filter: blur(8px);
  transition: all 0.16s ease;

  &:hover {
    background: rgba(0, 0, 0, 0.45);
    border-color: rgba(255, 255, 255, 0.6);
    color: #fff;
  }
}

.lot-confetti {
  position: absolute;
  top: 14px;
  right: 18px;
  font-size: 26px;
  opacity: 0.7;
  pointer-events: none;
}

.lot-title {
  margin-top: 22px;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: 2px;
  color: #ffd66e;
  text-shadow: 0 2px 14px rgba(250, 173, 20, 0.4);
}

.lot-prize {
  margin-top: 12px;
  padding: 6px 18px;
  font-size: 13px;
  font-weight: 600;
  color: #ffd66e;
  border: 1px solid rgba(250, 173, 20, 0.45);
  background: rgba(250, 173, 20, 0.12);
  border-radius: 999px;
}

.lot-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.lot-name {
  font-size: clamp(34px, 7vw, 84px);
  font-weight: 900;
  color: #fff;
  letter-spacing: 4px;
  text-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);

  &.is-rolling {
    animation: lot-shake 0.1s infinite;
  }
}

@keyframes lot-shake {
  0% { transform: translateX(-1.5px) scale(0.995); }
  50% { transform: translateX(1.5px) scale(1.005); }
  100% { transform: translateX(-1.5px) scale(0.995); }
}

.lot-phone {
  font-size: clamp(15px, 2.2vw, 24px);
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 3px;
}

.lot-controls {
  padding: 18px 0 26px;
}

.lot-draw-btn {
  min-width: 160px;
  height: 46px;
  padding: 0 34px;
  border: none;
  border-radius: 23px;
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 6px;
  color: #fff;
  cursor: pointer;
  background: linear-gradient(135deg, #ff4d4f, #cf1322);
  box-shadow: 0 6px 22px rgba(207, 19, 34, 0.45);
  transition: all 0.18s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 10px 28px rgba(207, 19, 34, 0.55);
  }

  &:active {
    transform: translateY(0) scale(0.97);
  }

  &.rolling {
    background: linear-gradient(135deg, #faad14, #d48806);
    box-shadow: 0 6px 22px rgba(212, 136, 6, 0.5);
    animation: lot-pulse 0.9s infinite;
  }
}

@keyframes lot-pulse {
  0%, 100% { box-shadow: 0 6px 22px rgba(212, 136, 6, 0.5); }
  50% { box-shadow: 0 6px 30px rgba(250, 173, 20, 0.75); }
}

/* ============ 中奖名单 ============ */
.lot-winners {
  position: absolute;
  top: 14px;
  left: 14px;
  width: 190px;
  max-height: 55%;
  display: flex;
  flex-direction: column;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 6px 22px rgba(0, 0, 0, 0.25);
  overflow: hidden;
}

.lot-winners-header {
  padding: 9px 12px;
  font-size: 12.5px;
  font-weight: 700;
  color: #cf1322;
  border-bottom: 1px solid rgba(0, 0, 0, 0.06);
}

.lot-winners-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
}

.lot-winner {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  gap: 7px;
  padding: 4px 6px;
  border-radius: 7px;

  &:hover {
    background: rgba(0, 0, 0, 0.04);
  }
}

.lot-winner-prize {
  flex-shrink: 0;
  font-size: 10.5px;
  color: #d48806;
  background: rgba(250, 173, 20, 0.15);
  border-radius: 999px;
  padding: 2px 7px;
}

.lot-winner-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #333;
}

.lot-winners-empty {
  flex: 1;
  min-height: 140px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  color: #999;
}

/* ============ 设置抽屉 ============ */
.lot-settings {
  padding: 4px 20px 30px;
}

.lot-section-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin: 18px 0 10px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}

.lot-section-actions {
  display: flex;
  gap: 6px;
}

.lot-prize-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
}

.lot-prize-level {
  width: 100px;
  flex-shrink: 0;
}

.lot-prize-count {
  width: 92px;
  flex-shrink: 0;
}

.lot-prize-gift {
  flex: 1;
  min-width: 0;
}

.lot-row-del {
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    color: var(--danger-color);
    background: rgba(var(--danger-color-rgb),  0.08);
  }
}

.lot-user-add {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.lot-del-text {
  color: var(--danger-color);
}
</style>
