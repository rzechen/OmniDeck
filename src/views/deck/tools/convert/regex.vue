<template>
  <tool-shell
    title="正则表达式测试"
    desc="实时匹配高亮，支持分组提取与常用示例"
    icon="regex"
    color="#52C41A"
    back-path="/tools/convert"
  >
    <template #toolbar>
      <button class="tool-btn is-primary" @click="clearAll">
        <svg-icon icon-class="delete" />
        清空
      </button>
    </template>

    <div class="split-pane is-vertical">
      <div class="pane" style="flex: 0 0 auto">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">正则表达式</span>
        </div>
        <div class="regex-bar">
          <div class="regex-input" :class="{ 'is-error': regexError }">
            <span class="regex-slash">/</span>
            <input
              v-model="pattern"
              placeholder="输入正则表达式"
              spellcheck="false"
              @input="runTest"
            />
            <span class="regex-slash">/</span>
            <span class="regex-flags">
              <span
                v-for="f in flagList"
                :key="f.key"
                class="flag-item"
                :class="{ active: flags.includes(f.key) }"
                :title="f.desc"
                @click="toggleFlag(f.key)"
              >{{ f.key }}</span>
            </span>
          </div>
          <span v-if="regexError" class="regex-error">{{ regexError }}</span>
          <span v-else-if="matchCount > 0" class="regex-ok">
            {{ matchCount }} 处匹配
          </span>
        </div>
      </div>

      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-input"></span>
          <span class="pane-title">测试文本</span>
        </div>
        <div class="pane-body">
          <textarea
            v-model="testText"
            class="regex-textarea"
            placeholder="输入测试文本…"
            spellcheck="false"
            @input="runTest"
          ></textarea>
        </div>
      </div>

      <div class="pane">
        <div class="pane-header">
          <span class="pane-dot is-output"></span>
          <span class="pane-title">匹配结果</span>
          <span>高亮显示，悬停查看分组</span>
        </div>
        <div class="pane-body regex-result-scroll">
          <div v-if="pattern && !regexError && testText" class="regex-result" v-html="highlighted"></div>
          <div v-else-if="!testText" class="regex-empty">输入测试文本后实时查看匹配</div>
          <div v-else-if="!pattern" class="regex-empty">输入正则表达式</div>
          <div v-else class="regex-empty">无匹配</div>
        </div>
      </div>
    </div>

    <template #status>
      <span class="status-dot" :class="{ 'is-bad': !!regexError }"></span>
      <span v-if="regexError">表达式错误</span>
      <span v-else>{{ flags || '无修饰符' }} · {{ matchCount }} 处匹配 · {{ groups.length }} 个分组</span>
      <span class="status-right">{{ testText.length }} 字符</span>
    </template>
  </tool-shell>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import ToolShell from '@/components/tool/ToolShell.vue'

defineOptions({ name: 'ConvertRegex' })

const EXAMPLE_TEXT = `联系方式：
邮箱：support@omnideck.app
邮箱：dev.team@example.com.cn
手机：13800138000
座机：010-88886666

日期：2026-09-06、2026/10/01
网址：https://github.com 与 http://example.com`

const HTML_ESCAPE = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;'
}

function escapeHtml(s) {
  return s.replace(/[&<>]/g, c => HTML_ESCAPE[c])
}

const pattern = ref('[\\w.+-]+@[\\w-]+\\.[\\w.]+')
const flags = ref('g')
const testText = ref(EXAMPLE_TEXT)
const regexError = ref('')
const matches = ref([])
const flagList = [
  { key: 'g', desc: '全局匹配' },
  { key: 'i', desc: '忽略大小写' },
  { key: 'm', desc: '多行模式 ^ $ 匹配行首尾' },
  { key: 's', desc: '点号匹配换行' },
  { key: 'u', desc: 'Unicode 模式' }
]

const matchCount = computed(() => matches.value.length)
const groups = computed(() => matches.value.filter(m => m.groups && m.groups.length > 1))
// 按匹配区间拼接高亮 HTML（单次遍历，无误伤）
const highlighted = computed(() => {
  if (!matches.value.length) return escapeHtml(testText.value)
  let html = ''
  let last = 0
  matches.value.forEach(m => {
    html += escapeHtml(testText.value.slice(last, m.index))
    const g = m.raw.length > 1
      ? ` title="分组：${m.raw.map((s, i) => i === 0 ? s : `$${i}=${s || ''}`).join('  ')}"`
      : ''
    html += `<mark class="rx-hit"${g}>${escapeHtml(m.raw[0])}</mark>`
    last = m.index + m.raw[0].length
  })
  html += escapeHtml(testText.value.slice(last))
  return html
})

function toggleFlag(f) {
  // g 标志必须有（matchAll 需要），只能切换其余
  if (f === 'g') return
  flags.value = flags.value.includes(f)
    ? flags.value.replace(f, '')
    : flags.value + f
}

function runTest() {
  regexError.value = ''
  matches.value = []
  if (!pattern.value) return
  let reg
  try {
    // matchAll 要求 g 标志
    reg = new RegExp(pattern.value, flags.value.includes('g') ? flags.value : flags.value + 'g')
  } catch (e) {
    regexError.value = e.message
    return
  }
  if (!testText.value) return
  try {
    matches.value = [...testText.value.matchAll(reg)].map(m => ({
      index: m.index,
      raw: [...m]
    }))
    // 匹配数上限保护（防止灾难性回溯卡 UI）
    if (matches.value.length > 5000) {
      matches.value = matches.value.slice(0, 5000)
    }
  } catch (e) {
    regexError.value = e.message
  }
}

function clearAll() {
  pattern.value = ''
  testText.value = ''
  regexError.value = ''
  matches.value = []
}

watch(flags, () => {
  runTest()
})

onMounted(() => {
  runTest()
})
</script>

<style lang="scss" scoped>
.regex-bar {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 14px;
}

.regex-input {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 34px;
  padding: 0 6px 0 12px;
  background: var(--search-bg);
  border: 1px solid var(--border-color);
  border-radius: 10px;
  font-family: 'SF Mono', Menlo, monospace;
  transition: all 0.16s ease;

  &:focus-within {
    border-color: rgba(var(--primary-color-rgb), 0.5);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.1);
  }

  &.is-error {
    border-color: rgba(var(--danger-color-rgb),  0.6);
  }

  .regex-slash {
    color: var(--text-secondary);
    font-size: 14px;
    flex-shrink: 0;
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 13px;
    font-family: inherit;
    color: var(--text-primary);
    padding: 0 4px;

    &::placeholder {
      color: var(--text-secondary);
    }
  }

  .regex-flags {
    display: flex;
    gap: 2px;
    flex-shrink: 0;

    .flag-item {
      width: 22px;
      height: 22px;
      line-height: 22px;
      text-align: center;
      border-radius: 6px;
      font-size: 12px;
      color: var(--text-secondary);
      cursor: pointer;
      user-select: none;
      transition: all 0.14s ease;

      &:hover {
        color: var(--text-primary);
        background: var(--search-bg-hover);
      }

      &.active {
        color: var(--primary-color);
        background: rgba(var(--primary-color-rgb), 0.12);
        font-weight: 700;
      }

      &.active:first-child {
        cursor: default;
      }
    }
  }
}

.regex-error {
  font-size: 12px;
  color: var(--danger-color);
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}

.regex-ok {
  font-size: 12px;
  color: var(--success-color);
  font-weight: 600;
  flex-shrink: 0;
}

.regex-textarea {
  width: 100%;
  height: 100%;
  padding: 12px 14px;
  border: none;
  outline: none;
  resize: none;
  background: transparent;
  font-size: 13px;
  font-family: 'SF Mono', Menlo, monospace;
  line-height: 1.7;
  color: var(--text-primary);

  &::placeholder {
    color: var(--text-secondary);
  }
}

.regex-result-scroll {
  overflow-y: auto;
  -webkit-app-region: no-drag;
}

.regex-result {
  padding: 12px 14px;
  font-size: 13px;
  font-family: 'SF Mono', Menlo, monospace;
  line-height: 1.9;
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--text-primary);

  :deep(.rx-hit){
    background: rgba(var(--primary-color-rgb), 0.85);
    color: #fff;
    border-radius: 4px;
    padding: 1px 3px;
    cursor: help;
  }
}

.regex-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12.5px;
  color: var(--text-secondary);
}
</style>
