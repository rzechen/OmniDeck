<template>
  <tool-shell
    title="身份证查询"
    desc="身份证号格式校验与信息解析（本地计算）"
    icon="idcard"
    color="#13C2C2"
    back-path="/tools/life"
  >
    <div class="id-layout">
      <div class="id-input-zone">
        <input
          v-model="idNumber"
          class="id-input mono"
          placeholder="输入 18 位身份证号"
          maxlength="18"
          spellcheck="false"
          @input="parse"
        />
        <button class="tool-btn" @click="fillExample">填入示例</button>
      </div>

      <!-- 解析结果 -->
      <div v-if="result" class="id-result" :class="{ 'is-invalid': !result.valid }">
        <div class="id-status" :class="result.valid ? 'ok' : 'bad'">
          <i :class="result.valid ? 'el-icon-success' : 'el-icon-error'"></i>
          {{ result.valid ? '身份证号有效' : '校验失败：' + result.error }}
        </div>

        <template v-if="result.valid">
          <div class="id-grid">
            <div class="id-cell">
              <span class="id-cell-label">出生日期</span>
              <span class="id-cell-value">{{ result.birthday }}</span>
            </div>
            <div class="id-cell">
              <span class="id-cell-label">年龄</span>
              <span class="id-cell-value">{{ result.age }} 岁</span>
            </div>
            <div class="id-cell">
              <span class="id-cell-label">性别</span>
              <span class="id-cell-value">{{ result.sex }}</span>
            </div>
            <div class="id-cell">
              <span class="id-cell-label">生肖</span>
              <span class="id-cell-value">{{ result.zodiac }}</span>
            </div>
            <div class="id-cell">
              <span class="id-cell-label">星座</span>
              <span class="id-cell-value">{{ result.constellation }}</span>
            </div>
            <div class="id-cell">
              <span class="id-cell-label">归属地</span>
              <span class="id-cell-value">{{ result.region }}</span>
            </div>
          </div>
        </template>
      </div>

      <div v-else class="id-empty">
        <i class="el-icon-postcard"></i>
        <p>输入身份证号后自动解析（仅在本地计算，不上传）</p>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': result && !result.valid }"></span>
      <span v-if="result && result.valid">校验位 {{ checkDigit }} 正确</span>
      <span v-else-if="result">第 18 位应为 {{ result.expected }}</span>
      <span v-else>等待输入</span>
      <span class="status-right">GB 11643-1999 标准</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import areaCodes from '@/utils/idcard-area'

// 加权因子与校验码映射（GB 11643-1999）
const WEIGHTS = [7, 9, 10, 5, 8, 4, 2, 1, 6, 3, 7, 9, 10, 5, 8, 4, 2]
const CHECK_CODES = ['1', '0', 'X', '9', '8', '7', '6', '5', '4', '3', '2']

const ZODIAC = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪']
const CONSTELLATIONS = [
  { name: '摩羯座', start: [12, 22], end: [1, 19] },
  { name: '水瓶座', start: [1, 20], end: [2, 18] },
  { name: '双鱼座', start: [2, 19], end: [3, 20] },
  { name: '白羊座', start: [3, 21], end: [4, 19] },
  { name: '金牛座', start: [4, 20], end: [5, 20] },
  { name: '双子座', start: [5, 21], end: [6, 21] },
  { name: '巨蟹座', start: [6, 22], end: [7, 22] },
  { name: '狮子座', start: [7, 23], end: [8, 22] },
  { name: '处女座', start: [8, 23], end: [9, 22] },
  { name: '天秤座', start: [9, 23], end: [10, 23] },
  { name: '天蝎座', start: [10, 24], end: [11, 22] },
  { name: '射手座', start: [11, 23], end: [12, 21] }
]

export default {
  name: 'LifeIdcard',
  components: { ToolShell },
  data() {
    return {
      idNumber: '',
      result: null
    }
  },
  computed: {
    checkDigit() {
      return this.idNumber.slice(17, 18).toUpperCase()
    }
  },
  methods: {
    fillExample() {
      // 合成的示例号（非真实号码，校验位按 GB 11643-1999 计算正确）
      this.idNumber = '310101199003078619'
      this.parse()
    },
    parse() {
      const id = this.idNumber.trim().toUpperCase()
      this.result = null
      if (!id) return
      if (!/^\d{17}[\dX]$/.test(id)) {
        this.result = { valid: false, error: '格式不正确，应为 17 位数字 + 1 位校验码' }
        return
      }
      // 校验位计算
      const sum = id.slice(0, 17).split('').reduce((s, c, i) => s + Number(c) * WEIGHTS[i], 0)
      const expected = CHECK_CODES[sum % 11]
      if (id[17] !== expected) {
        this.result = { valid: false, error: '校验位不匹配', expected }
        return
      }
      // 出生日期
      const year = +id.slice(6, 10)
      const month = +id.slice(10, 12)
      const day = +id.slice(12, 14)
      const date = new Date(year, month - 1, day)
      if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day ||
        year < 1900 ||
        date > new Date()
      ) {
        this.result = { valid: false, error: '出生日期无效' }
        return
      }
      // 年龄
      const now = new Date()
      let age = now.getFullYear() - year
      const mDiff = now.getMonth() - (month - 1)
      if (mDiff < 0 || (mDiff === 0 && now.getDate() < day)) age--
      // 归属地：前 6 位行政区划
      const code6 = id.slice(0, 6)
      const region =
        areaCodes[code6] ||
        areaCodes[code6.slice(0, 4) + '00'] ||
        areaCodes[code6.slice(0, 2) + '0000'] ||
        '未知地区'
      this.result = {
        valid: true,
        birthday: `${year} 年 ${month} 月 ${day} 日`,
        age,
        sex: Number(id[16]) % 2 === 0 ? '女' : '男',
        zodiac: ZODIAC[(year - 4) % 12],
        constellation: this.getConstellation(month, day),
        region
      }
    },
    getConstellation(m, d) {
      for (const c of CONSTELLATIONS) {
        const [sm, sd] = c.start
        const [em, ed] = c.end
        if ((m === sm && d >= sd) || (m === em && d <= ed) || (m === sm && m === em)) {
          return c.name
        }
      }
      return '—'
    }
  }
}
</script>

<style lang="scss" scoped>
.id-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 14px;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.id-input-zone {
  display: flex;
  gap: 10px;
}

.id-input {
  flex: 1;
  height: 44px;
  padding: 0 16px;
  border: 1px solid var(--border-color);
  border-radius: 12px;
  outline: none;
  background: var(--search-bg);
  font-size: 16px;
  letter-spacing: 1px;
  color: var(--text-primary);
  transition: all 0.16s ease;

  &:focus {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
    background: var(--card-bg);
  }

  &::placeholder {
    color: var(--text-secondary);
    font-size: 13px;
    letter-spacing: 0;
  }
}

.id-result {
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
}

.id-status {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  font-weight: 700;

  &.ok {
    color: #52C41A;
  }

  &.bad {
    color: #F54A45;
  }
}

.id-grid {
  margin-top: 14px;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.id-cell {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 10px 12px;
  background: var(--search-bg);
  border-radius: 8px;
}

.id-cell-label {
  font-size: 10.5px;
  color: var(--text-secondary);
}

.id-cell-value {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-primary);
}

.id-empty {
  flex: 1;
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
</style>
