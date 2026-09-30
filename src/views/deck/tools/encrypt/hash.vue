<template>
  <tool-shell
    title="Hash 计算"
    desc="MD5 / SHA / SHA3 / Keccak 等多种散列算法"
    icon="hash"
    color="#FA8C16"
    back-path="/tools/encrypt"
  >
    <template #toolbar>
      <el-select v-model="algorithm" class="tool-select" size="small" style="width: 150px" @change="compute">
        <el-option v-for="a in algorithms" :key="a.value" :label="a.label" :value="a.value" />
      </el-select>
      <button class="tool-btn is-primary" @click="copyResult">
        <svg-icon icon-class="document-copy" />
        复制
      </button>
      <button class="tool-btn is-danger" @click="clearAll">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="hash-layout">
      <div class="pane" style="flex: 1">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">输入文本</span>
        </div>
        <div class="pane-body hash-input-body">
          <code-editor
            ref="inputEditor"
            v-model="inputText"
            mode="text/plain"
            :fold="false"
            placeholder="输入任意文本，实时计算散列值…"
          />
        </div>
      </div>

      <div class="hash-results">
        <div
          v-for="r in results"
          :key="r.label"
          class="hash-item"
          :class="{ active: r.label === currentLabel }"
          :title="r.value"
          @click="copyHash(r)"
        >
          <div class="hash-head">
            <span class="hash-label">{{ r.label }}</span>
            <svg-icon v-if="r.label === currentLabel" icon-class="check" class-name="hash-current" />
          </div>
          <div class="hash-value mono">{{ r.value || '—' }}</div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!errorMsg }"></span>
      <span v-if="errorMsg" class="status-err">{{ errorMsg }}</span>
      <span v-else>当前算法：{{ currentLabel }}</span>
      <span class="status-right">{{ inputText.length }} 字符</span>
    </template>
  </tool-shell>
</template>

<script>
import CryptoJS from 'crypto-js'
import { keccak256, sha3_256, sha3_512, shake128, shake256 } from 'js-sha3'
import ToolShell from '@/components/tool/ToolShell.vue'
import CodeEditor from '@/components/tool/CodeEditor.vue'

export default {
  name: 'EncryptHash',
  components: { ToolShell, CodeEditor },
  data() {
    return {
      inputText: 'Hello OmniDeck',
      algorithm: 'md5',
      algorithms: [
        { label: 'MD5', value: 'md5' },
        { label: 'SHA-1', value: 'sha1' },
        { label: 'SHA-256', value: 'sha256' },
        { label: 'SHA-512', value: 'sha512' },
        { label: 'Keccak-256', value: 'keccak256' },
        { label: 'SHA3-256', value: 'sha3_256' },
        { label: 'SHA3-512', value: 'sha3_512' },
        { label: 'SHAKE-128', value: 'shake128' },
        { label: 'SHAKE-256', value: 'shake256' }
      ],
      hashResult: '',
      errorMsg: ''
    }
  },
  computed: {
    // 全部算法并行展示，当前算法高亮
    results() {
      const t = this.inputText
      if (!t) return this.algorithms.map(a => ({ label: a.label, value: '' }))
      const map = {
        md5: () => CryptoJS.MD5(t).toString(),
        sha1: () => CryptoJS.SHA1(t).toString(),
        sha256: () => CryptoJS.SHA256(t).toString(),
        sha512: () => CryptoJS.SHA512(t).toString(),
        keccak256: () => keccak256(t),
        sha3_256: () => sha3_256(t),
        sha3_512: () => sha3_512(t),
        shake128: () => shake128(t, 256),
        shake256: () => shake256(t, 512)
      }
      return this.algorithms.map(a => {
        let v = ''
        try {
          v = map[a.value]()
        } catch (e) {
          v = ''
        }
        return { label: a.label, value: v }
      })
    },
    currentLabel() {
      const a = this.algorithms.find(x => x.value === this.algorithm)
      return a ? a.label : ''
    }
  },
  methods: {
    compute() {
      // 下拉切换时仅更新选中态，结果面板已全量实时计算
    },
    copyResult() {
      const r = this.results.find(x => x.label === this.currentLabel)
      if (!r || !r.value) {
        this.$message.warning('没有可复制的内容')
        return
      }
      navigator.clipboard.writeText(r.value).then(() => {
        this.$message.success(`${this.currentLabel} 已复制`)
      })
    },
    copyHash(r) {
      if (!r.value) return
      navigator.clipboard.writeText(r.value).then(() => {
        this.$message({ message: `${r.label} 已复制`, type: 'success', duration: 1200 })
      })
    },
    clearAll() {
      this.inputText = ''
      this.$refs.inputEditor.focus()
    }
  }
}
</script>

<style lang="scss" scoped>
.hash-layout {
  flex: 1;
  min-height: 0;
  display: flex;
  gap: 10px;
}

/* 输入区域内衬：浅色底 + 圆角，编辑区域清晰可见 */
.hash-input-body {
  padding: 8px;

  .code-editor {
    background: var(--search-bg);
    border-radius: 8px;
  }
}

.hash-results {
  flex: 0 0 300px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.hash-item {
  padding: 8px 12px;
  background: var(--card-bg);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: rgba(var(--primary-color-rgb), 0.4);

    .hash-value {
      color: var(--primary-color);
    }
  }

  &.active {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    background: rgba(var(--primary-color-rgb), 0.04);
  }
}

.hash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 3px;
}

.hash-label {
  font-size: 10.5px;
  font-weight: 600;
  color: var(--text-secondary);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.hash-current {
  font-size: 11px;
  color: var(--primary-color);
  font-weight: 700;
}

.hash-value {
  font-size: 11px;
  color: var(--text-primary);
  word-break: break-all;
  line-height: 1.5;
  transition: color 0.15s ease;
}
</style>
