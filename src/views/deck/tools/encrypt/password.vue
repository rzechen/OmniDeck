<template>
  <tool-shell
    title="随机密码生成"
    desc="可配置字符集、长度与批量生成，附强度评估"
    icon="key"
    color="#FA8C16"
    back-path="/tools/encrypt"
  >
    <template #toolbar>
      <button class="tool-btn is-primary" @click="generate">
        <i class="el-icon-refresh"></i>
        生成
      </button>
      <button class="tool-btn" @click="copyAll">
        <i class="el-icon-document-copy"></i>
        复制全部
      </button>
      <button class="tool-btn is-danger" @click="clearResults">
        <i class="el-icon-delete"></i>
        清空
      </button>
    </template>

    <div class="pwd-layout">
      <!-- 配置区 -->
      <div class="pwd-config">
        <div class="cfg-row">
          <span class="cfg-label">长度</span>
          <el-slider
            v-model="form.length"
            :min="4"
            :max="64"
            :show-tooltip="false"
            class="cfg-slider"
          />
          <span class="cfg-value mono">{{ form.length }}</span>
        </div>
        <div class="cfg-row">
          <span class="cfg-label">数量</span>
          <el-slider
            v-model="form.count"
            :min="1"
            :max="20"
            :show-tooltip="false"
            class="cfg-slider"
          />
          <span class="cfg-value mono">{{ form.count }}</span>
        </div>
        <div class="cfg-checks">
          <label class="cfg-check">
            <input v-model="form.lower" type="checkbox" />
            <span>小写字母 a-z</span>
          </label>
          <label class="cfg-check">
            <input v-model="form.upper" type="checkbox" />
            <span>大写字母 A-Z</span>
          </label>
          <label class="cfg-check">
            <input v-model="form.digits" type="checkbox" />
            <span>数字 0-9</span>
          </label>
          <label class="cfg-check">
            <input v-model="form.noRepeat" type="checkbox" />
            <span>字符不重复</span>
          </label>
        </div>
        <div class="cfg-row">
          <span class="cfg-label">特殊字符</span>
          <input v-model="form.special" class="cfg-input mono" placeholder="留空则不含" spellcheck="false" />
        </div>
        <div class="cfg-row">
          <span class="cfg-label">排除字符</span>
          <input v-model="form.exclude" class="cfg-input mono" placeholder="如 0OIl1" spellcheck="false" />
        </div>
      </div>

      <!-- 结果列表 -->
      <div class="pwd-results">
        <div
          v-for="(p, i) in passwords"
          :key="i"
          class="pwd-item"
          @click="copyOne(p.text)"
        >
          <code class="pwd-text mono">{{ p.text }}</code>
          <div class="pwd-strength">
            <div class="strength-bars">
              <span
                v-for="n in 4"
                :key="n"
                class="bar"
                :class="[strengthClass(p.score), { on: n <= p.score }]"
              ></span>
            </div>
            <span class="strength-label">{{ strengthText(p.score) }}</span>
          </div>
          <i class="el-icon-document-copy pwd-copy"></i>
        </div>
        <div v-if="!passwords.length" class="pwd-empty">
          <i class="el-icon-key"></i>
          <p>点击「生成」创建随机密码</p>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot"></span>
      <span>点击密码行即可复制</span>
      <span class="status-right">字符池 {{ poolSize }} 字符</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'

export default {
  name: 'EncryptPassword',
  components: { ToolShell },
  data() {
    return {
      form: {
        length: 16,
        count: 5,
        lower: true,
        upper: true,
        digits: true,
        special: '!@#$%^&*',
        exclude: '',
        noRepeat: false
      },
      passwords: []
    }
  },
  computed: {
    poolSize() {
      return this.buildPool().length
    }
  },
  methods: {
    buildPool() {
      let pool = ''
      if (this.form.lower) pool += 'abcdefghijklmnopqrstuvwxyz'
      if (this.form.upper) pool += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
      if (this.form.digits) pool += '0123456789'
      pool += this.form.special || ''
      if (this.form.exclude) {
        const ex = new Set(this.form.exclude.split(''))
        pool = [...pool].filter(c => !ex.has(c)).join('')
      }
      return pool
    },
    generate() {
      const pool = this.buildPool()
      if (!pool.length) {
        this.$message.error('字符池为空，请至少启用一种字符集')
        return
      }
      if (this.form.noRepeat && this.form.length > pool.length) {
        this.$message.warning(`字符不重复时长度不能超过 ${pool.length}`)
        return
      }
      // crypto.getRandomValues 生成加密级随机数（比 Math.random 更安全）
      const rand = new Uint32Array(this.form.length * this.form.count)
      crypto.getRandomValues(rand)
      const out = []
      for (let i = 0; i < this.form.count; i++) {
        let pwd = ''
        const used = new Set()
        for (let j = 0; j < this.form.length; j++) {
          let c
          let guard = 0
          do {
            c = pool[rand[i * this.form.length + j] % pool.length]
            guard++
          } while (this.form.noRepeat && used.has(c) && guard < 100)
          if (this.form.noRepeat) used.add(c)
          pwd += c
        }
        out.push({ text: pwd, score: this.score(pwd) })
      }
      this.passwords = out
    },
    // 强度评分 0-4
    score(pwd) {
      let v = 0
      if (pwd.length >= 8) v++
      if (pwd.length >= 12) v++
      if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) v++
      if (/[0-9]/.test(pwd) && /[^a-zA-Z0-9]/.test(pwd)) v++
      return Math.min(v, 4)
    },
    strengthClass(s) {
      return ['weak', 'weak', 'mid', 'mid', 'strong'][s]
    },
    strengthText(s) {
      return ['极弱', '弱', '一般', '强', '极强'][s]
    },
    copyOne(t) {
      navigator.clipboard.writeText(t).then(() => {
        this.$message({ message: '密码已复制', type: 'success', duration: 1200 })
      })
    },
    copyAll() {
      if (!this.passwords.length) {
        this.$message.warning('请先生成密码')
        return
      }
      navigator.clipboard.writeText(this.passwords.map(p => p.text).join('\n')).then(() => {
        this.$message.success('已复制全部密码')
      })
    },
    clearResults() {
      this.passwords = []
    }
  }
}
</script>

<style lang="scss" scoped>
.pwd-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}

/* ============ 配置面板 ============ */
.pwd-config {
  flex: 0 0 340px;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 16px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: var(--shadow-sm);
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.cfg-row {
  display: flex;
  align-items: center;
  gap: 10px;
}

.cfg-label {
  flex-shrink: 0;
  width: 64px;
  font-size: 12px;
  color: var(--text-secondary);
}

.cfg-value {
  width: 28px;
  text-align: right;
  font-size: 13px;
  font-weight: 700;
  color: var(--primary-color);
}

.cfg-slider {
  flex: 1;

  ::v-deep .el-slider__runway {
    margin: 9px 0;
    height: 4px;
    border-radius: 2px;
    background: var(--search-bg);
  }

  ::v-deep .el-slider__bar {
    background: var(--primary-color);
  }

  ::v-deep .el-slider__button {
    width: 14px;
    height: 14px;
    border: 2px solid var(--primary-color);
    background: var(--card-bg);
  }
}

.cfg-checks {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.cfg-check {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12.5px;
  color: var(--text-primary);
  cursor: pointer;
  user-select: none;

  input {
    accent-color: var(--primary-color);
    width: 14px;
    height: 14px;
    cursor: pointer;
  }
}

.cfg-input {
  flex: 1;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  outline: none;
  background: var(--search-bg);
  font-size: 12px;
  color: var(--text-primary);

  &:focus {
    border-color: rgba(var(--primary-color-rgb), 0.5);
  }

  &::placeholder {
    color: var(--text-secondary);
  }
}

/* ============ 结果列表 ============ */
.pwd-results {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.pwd-item {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 14px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);
    box-shadow: var(--shadow-sm);

    .pwd-copy {
      opacity: 1;
    }
  }
}

.pwd-text {
  flex: 1;
  min-width: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
  letter-spacing: 0.5px;
  word-break: break-all;
}

.pwd-strength {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.strength-bars {
  display: flex;
  gap: 3px;

  .bar {
    width: 12px;
    height: 4px;
    border-radius: 2px;
    background: var(--search-bg);
    transition: all 0.2s ease;

    &.weak.on {
      background: #F54A45;
    }

    &.mid.on {
      background: #FAAD14;
    }

    &.strong.on {
      background: #52C41A;
    }
  }
}

.strength-label {
  width: 30px;
  font-size: 11px;
  color: var(--text-secondary);
}

.pwd-copy {
  color: var(--text-secondary);
  font-size: 15px;
  opacity: 0;
  transition: opacity 0.15s ease;
  flex-shrink: 0;
}

.pwd-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  color: var(--text-secondary);
  border: 1px dashed var(--border-color);
  border-radius: 12px;

  i {
    font-size: 30px;
    opacity: 0.4;
  }

  p {
    font-size: 13px;
  }
}
</style>
