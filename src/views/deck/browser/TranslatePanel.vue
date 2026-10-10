<template>
  <!-- 工作台·划词翻译功能面板：语言对/引擎配置（下拉弹层，不切换整面板）+
       翻译历史（置顶/分组/搜索/复制，成功翻译后实时记录；面板收起后翻译仍
       在后台静默完成并写入历史） -->
  <div class="tp-panel" @click.stop>
    <!-- 顶部提示（完整展示，不截断） -->
    <div class="tp-tip">
      <svg-icon icon-class="info" />
      <span>划选网页文本即可 搜索 / 复制 / 翻译；收起面板后台继续翻译并记入下方历史</span>
    </div>
    <!-- 分组新建 内联表单视图（重命名走分组行内编辑） -->
    <div v-if="folderForm.type" class="tp-form">
      <div class="tp-form-title">新建分组</div>
      <input
        ref="folderInput"
        v-model="folderForm.name"
        type="text"
        spellcheck="false"
        placeholder="分组名称"
        @keydown.enter="submitFolderForm"
        @keydown.esc="closeFolderForm"
      />
      <div class="tp-form-actions">
        <button class="tp-mini-btn" @click="closeFolderForm">取消</button>
        <button class="tp-mini-btn tp-mini-btn-primary" @click="submitFolderForm">确定</button>
      </div>
    </div>

    <template v-else>
      <!-- ===== 配置区：语言对（下拉弹层选择）+ 引擎 ===== -->
      <div class="tp-cfg">
        <div class="tp-row">
          <!-- 原语言下拉 -->
          <div class="tp-menu">
            <button class="tp-menu-btn tp-lang" :title="'原语言：' + sourceLabel" @click="toggleMenu('source')">
              <svg-icon icon-class="auto" />
              <span class="tp-menu-label">{{ sourceLabel }}</span>
              <svg-icon icon-class="arrow-down" class-name="tp-menu-caret" :class="{ open: menu === 'source' }" />
            </button>
            <transition name="tp-drop">
              <div v-if="menu === 'source'" class="tp-lang-panel">
                <div class="tp-lang-search">
                  <svg-icon icon-class="search" class-name="tp-ls-ico" />
                  <input v-model="langSearch" type="text" spellcheck="false" placeholder="搜索语言…" />
                </div>
                <div class="tp-lang-list">
                  <template v-if="!langKeyword">
                    <div class="tp-lv-letter">常用</div>
                    <div class="tp-lv-grid">
                      <button
                        v-for="[code, label] in commonEntries('source')"
                        :key="'c-' + code"
                        class="tp-lv-item"
                        :class="{ active: code === sourceLang }"
                        @click="pickLang('source', code)"
                      >{{ label }}<svg-icon v-if="code === sourceLang" icon-class="check" class-name="tp-lv-check" /></button>
                    </div>
                  </template>
                  <div v-for="g in langGroups('source')" :key="'s' + g.letter" class="tp-lv-group">
                    <div class="tp-lv-letter">{{ g.letter }}</div>
                    <div class="tp-lv-grid">
                      <button
                        v-for="[code, label] in g.items"
                        :key="code"
                        class="tp-lv-item"
                        :class="{ active: code === sourceLang }"
                        @click="pickLang('source', code)"
                      >{{ label }}<svg-icon v-if="code === sourceLang" icon-class="check" class-name="tp-lv-check" /></button>
                    </div>
                  </div>
                  <div v-if="!langGroups('source').length" class="tp-lv-none">未找到匹配的语言</div>
                </div>
              </div>
            </transition>
          </div>
          <svg-icon icon-class="right" class-name="tp-arrow" />
          <!-- 目标语言下拉 -->
          <div class="tp-menu">
            <button class="tp-menu-btn tp-lang" :title="'目标语言：' + (LANGS[targetLang] || targetLang)" @click="toggleMenu('target')">
              <svg-icon icon-class="postcard" />
              <span class="tp-menu-label">{{ LANGS[targetLang] || targetLang }}</span>
              <svg-icon icon-class="arrow-down" class-name="tp-menu-caret" :class="{ open: menu === 'target' }" />
            </button>
            <transition name="tp-drop">
              <div v-if="menu === 'target'" class="tp-lang-panel">
                <div class="tp-lang-search">
                  <svg-icon icon-class="search" class-name="tp-ls-ico" />
                  <input v-model="langSearch" type="text" spellcheck="false" placeholder="搜索语言…" />
                </div>
                <div class="tp-lang-list">
                  <template v-if="!langKeyword">
                    <div class="tp-lv-letter">常用</div>
                    <div class="tp-lv-grid">
                      <button
                        v-for="[code, label] in commonEntries('target')"
                        :key="'c-' + code"
                        class="tp-lv-item"
                        :class="{ active: code === targetLang }"
                        @click="pickLang('target', code)"
                      >{{ label }}<svg-icon v-if="code === targetLang" icon-class="check" class-name="tp-lv-check" /></button>
                    </div>
                  </template>
                  <div v-for="g in langGroups('target')" :key="'t' + g.letter" class="tp-lv-group">
                    <div class="tp-lv-letter">{{ g.letter }}</div>
                    <div class="tp-lv-grid">
                      <button
                        v-for="[code, label] in g.items"
                        :key="code"
                        class="tp-lv-item"
                        :class="{ active: code === targetLang }"
                        @click="pickLang('target', code)"
                      >{{ label }}<svg-icon v-if="code === targetLang" icon-class="check" class-name="tp-lv-check" /></button>
                    </div>
                  </div>
                  <div v-if="!langGroups('target').length" class="tp-lv-none">未找到匹配的语言</div>
                </div>
              </div>
            </transition>
          </div>
        </div>
        <!-- 引擎下拉 -->
        <div class="tp-menu tp-engine-menu">
          <button class="tp-menu-btn tp-engine" :title="'翻译引擎：' + engineLabel" @click="toggleMenu('engine')">
            <span class="tp-menu-label">{{ engineLabel }}</span>
            <svg-icon icon-class="arrow-down" class-name="tp-menu-caret" :class="{ open: menu === 'engine' }" />
          </button>
          <transition name="tp-drop">
            <div v-if="menu === 'engine'" class="tp-drop-panel tp-engine-panel">
              <button class="tp-drop-item" :class="{ active: engine === 'google' }" @click="pickEngine('google')">
                Google 翻译<svg-icon v-if="engine === 'google'" icon-class="check" class-name="tp-drop-check" />
              </button>
              <button class="tp-drop-item" :class="{ active: engine === 'bing' }" @click="pickEngine('bing')">
                必应翻译<svg-icon v-if="engine === 'bing'" icon-class="check" class-name="tp-drop-check" />
              </button>
              <button
                v-for="p in providers"
                :key="p.id"
                class="tp-drop-item"
                :class="{ active: engine === 'llm' && providerId === p.id }"
                @click="pickEngine('llm:' + p.id)"
              >
                {{ (p.displayName || p.name) + ' · 模型' }}<svg-icon v-if="engine === 'llm' && providerId === p.id" icon-class="check" class-name="tp-drop-check" />
              </button>
            </div>
          </transition>
        </div>
      </div>

      <!-- ===== 手动翻译（输入即译，结果记入下方翻译历史） ===== -->
      <div class="tp-his-divider"><span>手动翻译</span></div>
      <div class="tp-manual">
        <textarea
          ref="manualInput"
          v-model="manualText"
          class="tp-manual-input"
          spellcheck="false"
          rows="2"
          placeholder="输入要翻译的文本，Ctrl/⌘ + Enter 快速翻译…"
          @input="autoGrowManual"
          @keydown.ctrl.enter.prevent="doManualTranslate"
          @keydown.meta.enter.prevent="doManualTranslate"
        ></textarea>
        <div class="tp-manual-bar">
          <!-- 翻译：上下转换箭头 icon 按钮（居中、浅底主题色，busy 旋转） -->
          <button
            class="tp-manual-btn"
            :class="{ busy: manualBusy }"
            :disabled="manualBusy || !manualText.trim()"
            :title="manualBusy ? '翻译中…' : '翻译（Ctrl/⌘ + Enter）'"
            @click="doManualTranslate"
          >
            <svg-icon icon-class="arrows-v" />
          </button>
        </div>
        <div v-if="manualBusy || manualTrans" class="tp-manual-result">
          <template v-if="manualBusy">翻译中…</template>
          <template v-else>{{ manualTrans }}</template>
        </div>
        <!-- 译文底部操作：复制 / 插入到网页输入框 -->
        <div v-if="manualTrans && !manualBusy" class="tp-manual-foot">
          <span class="tp-manual-copy" title="复制译文" @click="onCopy(manualTrans)">
            <svg-icon icon-class="copy" />复制
          </span>
          <span class="tp-manual-copy" title="插入到网页当前输入框" @click="onInsert">
            <svg-icon icon-class="doc" />插入
          </span>
        </div>
      </div>

      <!-- ===== 翻译历史区 ===== -->
      <div class="tp-history">
        <!-- 分界线中间嵌标题（divider 样式） -->
        <div class="tp-his-divider"><span>翻译历史</span></div>
        <div class="tp-his-tools">
          <div class="tp-his-search">
            <input v-model="hisKeyword" type="text" spellcheck="false" placeholder="搜索原文 / 译文…" />
            <i v-if="hisKeyword" class="tp-his-clear" @click="hisKeyword = ''"><svg-icon icon-class="close" /></i>
          </div>
          <button class="tp-icon-btn" title="新建分组" @click="openFolderForm('create')">
            <svg-icon icon-class="folder-add" />
          </button>
          <button class="tp-icon-btn tp-danger" title="清空全部记录" @click="confirmClear = true">
            <svg-icon icon-class="eraser" />
          </button>
        </div>

        <div v-if="confirmClear" class="tp-confirm">
          <span>清空全部翻译记录？</span>
          <button class="tp-mini-btn" @click="confirmClear = false">取消</button>
          <button class="tp-mini-btn tp-mini-btn-danger" @click="doClear">清空</button>
        </div>

        <div class="tp-his-list">
          <template v-if="!hasAny">
            <div class="tp-empty">
              <svg-icon icon-class="history" class-name="tp-empty-ico" />
              <p>暂无翻译记录</p>
              <p class="tp-empty-tip">在网页中划选文本翻译后将自动记录在这里</p>
            </div>
          </template>
          <template v-else>
            <!-- 搜索：扁平展示 -->
            <template v-if="hisKeyword">
              <div v-for="it in filteredItems" :key="'k' + it.id" class="tp-his-item">
                <TransCard :item="it" :expanded="expanded === it.id" :folders="transState.folders"
                  @toggle="toggleExpand(it.id)" @pin="toggleTransPin(it.id)" @remove="onRemove(it.id)"
                  @move="fid => moveTransToFolder(it.id, fid)" @copy="onCopy" @navigate="onNavUrl" />
              </div>
              <div v-if="!filteredItems.length" class="tp-empty-mini">未找到匹配的翻译记录</div>
            </template>
            <template v-else>
              <!-- 置顶 -->
              <template v-if="pinnedItems.length">
                <div class="tp-group-title tp-pin-title"><svg-icon icon-class="top" />置顶</div>
                <div v-for="it in pinnedItems" :key="'p' + it.id" class="tp-his-item pinned">
                  <TransCard :item="it" :expanded="expanded === it.id" :folders="transState.folders"
                    @toggle="toggleExpand(it.id)" @pin="toggleTransPin(it.id)" @remove="onRemove(it.id)"
                    @move="fid => moveTransToFolder(it.id, fid)" @copy="onCopy" @navigate="onNavUrl" />
                </div>
              </template>
              <!-- 分组 -->
              <template v-for="f in transState.folders" :key="f.id">
                <div class="tp-folder" :class="{ open: openedFolders.includes(f.id) }" @click="toggleFolder(f.id)">
                  <svg-icon icon-class="arrow-down" class-name="tp-folder-caret" />
                  <svg-icon icon-class="folder" class-name="tp-folder-ico" />
                  <!-- 重命名：行内编辑（名称位替换为 input，回车/失焦提交，Esc 取消） -->
                  <input
                    v-if="renamingId === f.id"
                    v-model="renamingName"
                    v-rename-focus
                    class="tp-folder-rename"
                    type="text"
                    spellcheck="false"
                    placeholder="分组名称"
                    @click.stop
                    @keydown.enter="submitRename"
                    @keydown.esc="cancelRename"
                    @blur="submitRename"
                  />
                  <span v-else class="tp-folder-name">{{ f.name }}</span>
                  <span class="tp-folder-count">{{ folderItems(f.id).length }}</span>
                  <span class="tp-folder-ops" @click.stop>
                    <button class="tp-icon-btn" title="重命名" @click="startRename(f)"><svg-icon icon-class="edit" /></button>
                    <button class="tp-icon-btn tp-danger" title="删除分组（记录移回未分组）" @click="onRemoveFolder(f.id)"><svg-icon icon-class="close" /></button>
                  </span>
                </div>
                <div v-show="openedFolders.includes(f.id)" class="tp-folder-body">
                  <div v-for="it in folderItems(f.id)" :key="f.id + it.id" class="tp-his-item">
                    <TransCard :item="it" :expanded="expanded === it.id" :folders="transState.folders"
                      @toggle="toggleExpand(it.id)" @pin="toggleTransPin(it.id)" @remove="onRemove(it.id)"
                      @move="fid => moveTransToFolder(it.id, fid)" @copy="onCopy" @navigate="onNavUrl" />
                  </div>
                  <div v-if="!folderItems(f.id).length" class="tp-empty-mini">分组内暂无记录</div>
                </div>
              </template>
              <!-- 未分组 -->
              <template v-if="ungroupedItems.length">
                <div v-if="transState.folders.length || pinnedItems.length" class="tp-group-title">未分组</div>
                <div v-for="it in ungroupedItems" :key="'u' + it.id" class="tp-his-item">
                  <TransCard :item="it" :expanded="expanded === it.id" :folders="transState.folders"
                    @toggle="toggleExpand(it.id)" @pin="toggleTransPin(it.id)" @remove="onRemove(it.id)"
                    @move="fid => moveTransToFolder(it.id, fid)" @copy="onCopy" @navigate="onNavUrl" />
                </div>
              </template>
            </template>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup>
// 工作台·划词翻译面板：配置（语言对/引擎，下拉弹层）+ 翻译历史（合并自原
// TransHistoryPanel：置顶/分组/搜索/复制）；历史由浏览器页 onProgress 写入单例
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick, getCurrentInstance } from 'vue'
import { useStore } from 'vuex'
import { getItem, setItem } from '@/utils/storage/db'
import TransCard from './TransCard.vue'
import {
  TRANS_LANGS,
  transState,
  loadTransHistory,
  addTransHistory,
  removeTrans,
  toggleTransPin,
  moveTransToFolder,
  addTransFolder,
  renameTransFolder,
  removeTransFolder,
  clearTransHistory
} from './transHistory'

const ENGINE_KEY = 'browser:engineConfig'

// 语言表共享自 transHistory.js（与主进程 engines.js 一致）
const LANGS = TRANS_LANGS
const SOURCE_LANGS = Object.assign({ auto: '自动检测' }, LANGS)
const COMMON_CODES = ['zh-CN', 'zh-TW', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt']

defineOptions({ name: 'TranslatePanel' })
// navigate：历史卡片来源链接跳转 → 浏览器页 webview 导航（index.vue 绑定）
const emit = defineEmits(['navigate'])

// ===== 翻译配置 =====
const engine = ref('google')
const providerId = ref('')
const sourceLang = ref('auto')
const targetLang = ref('zh-CN')
const providers = ref([])
// 当前展开的下拉：'' | 'source' | 'target' | 'engine'
const menu = ref('')
// 语言下拉内搜索词（打开/切换时清空）
const langSearch = ref('')
const store = useStore()
const { proxy } = getCurrentInstance()

let browser = null

const sourceLabel = computed(() => SOURCE_LANGS[sourceLang.value] || sourceLang.value)
const engineLabel = computed(() => {
  if (engine.value === 'google') return 'Google 翻译'
  if (engine.value === 'bing') return '必应翻译'
  const p = findProvider()
  return p ? (p.displayName || p.name) + ' · 模型' : '模型翻译'
})

// ===== 语言下拉数据（搜索 + 常用置顶 + 拼音字母分组两列网格） =====
const langKeyword = computed(() => langSearch.value.trim().toLowerCase())
const PINYIN_LETTER = {
  '简': 'J', '繁': 'F', '英': 'Y', '日': 'R', '韩': 'H', '法': 'F', '德': 'D',
  '西': 'X', '葡': 'P', '意': 'Y', '俄': 'E', '阿': 'A', '泰': 'T', '越': 'Y',
  '印': 'Y', '马': 'M', '土': 'T', '荷': 'H', '波': 'B', '瑞': 'R', '挪': 'N',
  '丹': 'D', '芬': 'F', '捷': 'J', '罗': 'L', '匈': 'X', '希': 'X', '乌': 'W',
  '保': 'B', '塞': 'S', '克': 'K', '斯': 'S', '立': 'L', '拉': 'L', '爱': 'A',
  '孟': 'M', '缅': 'M', '高': 'G', '老': 'L', '蒙': 'M', '尼': 'N', '僧': 'S',
  '格': 'G', '亚': 'Y', '哈': 'H', '南': 'N', '威': 'W', '冰': 'B', '世': 'S',
  '海': 'H', '加': 'J', '菲': 'F', '夏': 'X', '白': 'B', '自': '#'
}
function langLetter(label) {
  return PINYIN_LETTER[String(label).charAt(0)] || '#'
}
function commonEntries(kind) {
  const base = COMMON_CODES.map(c => [c, LANGS[c]])
  return kind === 'source' ? [['auto', '自动检测']].concat(base) : base
}
function langGroups(kind) {
  const entries = kind === 'source' ? Object.entries(SOURCE_LANGS) : Object.entries(LANGS)
  const kw = langKeyword.value
  const list = kw
    ? entries.filter(([code, name]) =>
        String(name).toLowerCase().includes(kw) || code.toLowerCase().includes(kw))
    : entries.filter(([code]) => code !== 'auto')
  const map = new Map()
  for (const e of list) {
    const letter = langLetter(e[1])
    if (!map.has(letter)) map.set(letter, [])
    map.get(letter).push(e)
  }
  return Array.from(map.entries())
    .sort((a, b) => (a[0] === '#' ? 1 : b[0] === '#' ? -1 : a[0].localeCompare(b[0])))
    .map(([letter, items]) => ({ letter, items }))
}

function toggleMenu(m) {
  if (menu.value === m) menu.value = ''
  else {
    menu.value = m
    langSearch.value = ''
  }
}
function pickLang(kind, code) {
  if (kind === 'source') sourceLang.value = code
  else targetLang.value = code
  menu.value = ''
}
function pickEngine(val) {
  if (val === 'google' || val === 'bing') {
    engine.value = val
    providerId.value = ''
  } else {
    engine.value = 'llm'
    providerId.value = val.slice(4)
  }
  applyEngine()
  menu.value = ''
}
function findProvider() {
  return providers.value.find(p => p.id === providerId.value) || null
}
// 引擎/语言切换：回灌主进程（划词按需翻译，无需重译）+ 持久化
function applyEngine() {
  const provider = findProvider()
  if (browser) {
    browser.setEngine({
      engine: engine.value,
      source: sourceLang.value,
      target: targetLang.value,
      provider: provider
        ? { baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model, apiFormat: provider.apiFormat }
        : null,
      theme: store.state.primaryColor || '#3366FF'
    }).catch(err => console.warn('[tp] setEngine 失败：', err && err.message))
  }
  setItem(ENGINE_KEY, {
    engine: engine.value,
    providerId: providerId.value,
    source: sourceLang.value,
    target: targetLang.value
  })
}

watch(sourceLang, applyEngine)
watch(targetLang, applyEngine)

// ===== 翻译历史 =====
const hisKeyword = ref('')
const expanded = ref('')
const openedFolders = ref([])
const confirmClear = ref(false)

// ===== 手动翻译（输入即译，结果记入下方翻译历史） =====
const manualText = ref('')
const manualTrans = ref('')
const manualBusy = ref(false)
const manualInput = ref(null)

// 弹性高度：按内容自动撑高/回落（min 2 行、max 10 行），宽度变化后下次输入再校准
function autoGrowManual() {
  const el = manualInput.value
  if (!el) return
  el.style.height = 'auto'
  const lh = 18 // 12px * 1.5 行高，与样式一致
  const pad = 14 // 上下 padding 7px * 2
  const min = lh * 2 + pad
  const max = lh * 10 + pad
  el.style.height = Math.min(Math.max(el.scrollHeight, min), max) + 'px'
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
}

async function doManualTranslate() {
  const text = manualText.value.trim()
  if (!text || manualBusy.value) return
  if (!browser || !browser.translateText) {
    proxy.$message.warning('翻译通道不可用')
    return
  }
  manualBusy.value = true
  manualTrans.value = ''
  try {
    const res = await browser.translateText(text)
    const t = String((res && res.translations && res.translations[0]) || '').trim()
    if (t) {
      manualTrans.value = t
      // 记入翻译历史（手动输入无来源网页，url/host 留空）
      addTransHistory({
        text,
        trans: t,
        source: (res && res.source) || sourceLang.value,
        target: (res && res.target) || targetLang.value,
        engine: (res && res.engine) || engine.value,
        url: '',
        host: '',
        time: Date.now()
      })
    } else {
      proxy.$message.warning((res && res.error) || '翻译失败，请稍后重试或切换引擎')
    }
  } catch (err) {
    proxy.$message.warning('翻译失败：' + ((err && err.message) || '未知错误'))
  } finally {
    manualBusy.value = false
  }
}

// 插入译文到网页最近聚焦的输入框：成功/失败 toast 由页面端经主进程回报（$message）
function onInsert() {
  if (!manualTrans.value) return
  if (!browser || !browser.insertText) {
    proxy.$message.warning('插入通道不可用')
    return
  }
  browser.insertText(manualTrans.value).catch(() => proxy.$message.warning('插入失败'))
}

const folderForm = ref({ type: '', name: '', id: '' })
const folderInput = ref(null)
// 分组重命名（行内编辑）：正在编辑的分组 id + 编辑值
const renamingId = ref('')
const renamingName = ref('')

const hisKw = computed(() => hisKeyword.value.trim().toLowerCase())
const filteredItems = computed(() => {
  if (!hisKw.value) return []
  return transState.items.filter(it =>
    it.text.toLowerCase().includes(hisKw.value) || it.trans.toLowerCase().includes(hisKw.value))
})
const pinnedItems = computed(() => transState.items.filter(it => it.pinned))
const ungroupedItems = computed(() => transState.items.filter(it => !it.pinned && !it.folderId))
const hasAny = computed(() => transState.items.length > 0)

function folderItems(fid) {
  return transState.items.filter(it => !it.pinned && it.folderId === fid)
}
function toggleExpand(id) {
  expanded.value = expanded.value === id ? '' : id
}
function toggleFolder(id) {
  // 行内重命名中：点击行不折叠/展开，避免误触
  if (renamingId.value === id) return
  const i = openedFolders.value.indexOf(id)
  if (i > -1) openedFolders.value.splice(i, 1)
  else openedFolders.value.push(id)
}
function onRemove(id) {
  if (expanded.value === id) expanded.value = ''
  removeTrans(id)
}
function onCopy(text) {
  navigator.clipboard.writeText(text).then(() => {
    proxy.$message.success('已复制')
  }).catch(() => {
    proxy.$message.warning('复制失败，请手动选择复制')
  })
}

// 来源链接跳转：转发至浏览器页 webview 导航
function onNavUrl(url) {
  emit('navigate', url)
}
function onRemoveFolder(id) {
  removeTransFolder(id)
  proxy.$message.info('分组已删除，记录已移回未分组')
}
function doClear() {
  confirmClear.value = false
  clearTransHistory()
  proxy.$message.info('已清空全部翻译记录')
}
function openFolderForm(type) {
  folderForm.value = { type, name: '', id: '' }
  nextTick(() => folderInput.value && folderInput.value.focus())
}
function closeFolderForm() {
  folderForm.value = { type: '', name: '', id: '' }
}
function submitFolderForm() {
  const f = folderForm.value
  if (f.type === 'create') {
    const created = addTransFolder(f.name)
    if (created) {
      openedFolders.value.push(created.id)
      proxy.$message.success('已创建分组「' + created.name + '」')
    }
  }
  closeFolderForm()
}

// ===== 分组重命名（行内编辑） =====
// 挂载即聚焦并全选，便于直接输入覆盖
const vRenameFocus = { mounted: el => { el.focus(); el.select() } }
function startRename(folder) {
  renamingId.value = folder.id
  renamingName.value = folder.name
}
function cancelRename() {
  renamingId.value = ''
}
function submitRename() {
  const id = renamingId.value
  if (!id) return
  renamingId.value = ''
  renameTransFolder(id, renamingName.value.trim())
}

// ===== 生命周期 =====
onMounted(() => {
  browser = window.electronAPI && window.electronAPI.browser
  loadTransHistory()
  // 恢复引擎配置 + 供应商列表；仅文本生成模型
  providers.value = (getItem('aiProviderList', []) || []).filter(p => p && p.type !== 'image')
  const saved = getItem(ENGINE_KEY, null)
  if (saved && saved.engine) {
    engine.value = saved.engine
    providerId.value = saved.providerId || ''
  }
  if (saved && saved.source && SOURCE_LANGS[saved.source]) sourceLang.value = saved.source
  if (saved && saved.target && LANGS[saved.target]) targetLang.value = saved.target
  if (engine.value === 'llm' && !findProvider()) {
    const def = providers.value.find(p => p.isDefault) || providers.value[0]
    if (def) providerId.value = def.id
    else {
      engine.value = 'google'
      providerId.value = ''
    }
  }
  document.addEventListener('click', onDocClick)
  applyEngine()
  // 挂载后按初始内容校准一次高度
  nextTick(autoGrowManual)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
})

function onDocClick(e) {
  if (!menu.value) return
  // 任意面板内点击均由 @click.stop 阻断；走到 document 的一律关闭下拉
  menu.value = ''
}
</script>

<style lang="scss" scoped>
.tp-panel {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ===== 配置区（固定高度） ===== */
.tp-cfg {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.tp-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;

  > .tp-menu {
    flex: 1;
    min-width: 0;
  }
}

.tp-menu {
  position: relative;
  flex-shrink: 0;
}

.tp-menu-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  width: 100%;
  padding: 0 10px;
  border: none;
  border-radius: $radius-sm;
  background: $search-bg;
  color: $text-primary;
  font-size: 12px;
  cursor: pointer;
  transition: background 0.12s ease;

  &:hover {
    background: $divider;
  }

  .tp-menu-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    text-align: left;
  }

  .tp-menu-caret {
    font-size: 10px;
    color: $text-secondary;
    transition: transform 0.15s ease;

    &.open {
      transform: rotate(180deg);
    }
  }
}

.tp-engine-menu {
  width: 100%;
}

.tp-arrow {
  font-size: 12px;
  color: $text-secondary;
  flex-shrink: 0;
}

/* 顶部提示条（完整换行展示） */
.tp-tip {
  display: flex;
  align-items: flex-start;
  gap: 5px;
  padding: 6px 8px;
  border-radius: $radius-sm;
  background: rgba(51, 102, 255, 0.06);
  color: $text-secondary;
  font-size: 11px;
  line-height: 1.5;
  flex-shrink: 0;

  .svg-icon {
    flex-shrink: 0;
    font-size: 12px;
    margin-top: 1px;
    color: $primary-color;
  }
}

/* ===== 语言下拉弹层（含搜索 + 常用 + 字母分组，面板内滚动） ===== */
.tp-lang-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  width: 230px;
  max-width: calc(100vw - 24px);
  display: flex;
  flex-direction: column;
  padding: 6px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(20px) saturate(1.5);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
}

:global(html[data-theme='dark']) .tp-lang-panel {
  background: rgba(46, 46, 52, 0.94);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24);
}

.tp-lang-search {
  display: flex;
  align-items: center;
  height: 26px;
  padding: 0 6px;
  margin-bottom: 4px;
  background: $search-bg;
  border-radius: $radius-sm;
  flex-shrink: 0;

  .tp-ls-ico {
    flex-shrink: 0;
    font-size: 11px;
    color: $text-secondary;
    margin-right: 5px;
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 11px;
    color: $text-primary;

    &::placeholder {
      color: $text-secondary;
    }
  }
}

.tp-lang-list {
  max-height: 280px;
  overflow-y: auto;
  padding: 1px;
}

.tp-lv-letter {
  padding: 6px 4px 3px;
  font-size: 10px;
  font-weight: 600;
  color: $text-secondary;
  letter-spacing: 1px;
}

.tp-lv-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 2px;
}

.tp-lv-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  height: 26px;
  padding: 0 7px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: $text-primary;
  font-size: 11px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.12s ease, color 0.12s ease;

  &:hover {
    background: $search-bg;
  }

  &.active {
    color: $primary-color;
    font-weight: 500;
    background: rgba(51, 102, 255, 0.08);
  }

  .tp-lv-check {
    flex-shrink: 0;
    font-size: 11px;
    color: $primary-color;
  }
}

.tp-lv-none {
  padding: 10px;
  font-size: 11px;
  color: $text-secondary;
  text-align: center;
}

/* ===== 引擎下拉 ===== */
.tp-drop-panel {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 30;
  min-width: 152px;
  max-height: 320px;
  overflow-y: auto;
  padding: 5px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(20px) saturate(1.5);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14), 0 2px 8px rgba(0, 0, 0, 0.06);
}

:global(html[data-theme='dark']) .tp-drop-panel {
  background: rgba(46, 46, 52, 0.92);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.24);
}

.tp-engine-panel {
  left: 0;
  right: 0;
  width: 100%;
  box-sizing: border-box;
}

.tp-drop-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: $text-primary;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
  white-space: nowrap;
  transition: background 0.12s ease, color 0.12s ease;

  &:hover {
    background: $search-bg;
  }

  &.active {
    color: $primary-color;
    font-weight: 500;
  }

  .tp-drop-check {
    flex-shrink: 0;
    color: $primary-color;
  }
}

.tp-drop-enter-active,
.tp-drop-leave-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}

.tp-drop-enter,
.tp-drop-enter-from,
.tp-drop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ===== 手动翻译区 ===== */
.tp-manual {
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex-shrink: 0;
}

.tp-manual-input {
  min-height: 64px;
  max-height: 194px;
  padding: 7px 9px;
  overflow-y: hidden;
  box-sizing: border-box;
  border: 1px solid transparent;
  border-radius: $radius-sm;
  background: $search-bg;
  font-size: 12px;
  line-height: 1.5;
  font-family: inherit;
  color: $text-primary;
  resize: none;
  outline: none;
  transition: border-color 0.12s ease;

  &:focus {
    border-color: $primary-color;
  }

  &::placeholder {
    color: $text-secondary;
  }
}

.tp-manual-bar {
  display: flex;
  justify-content: center;
}

.tp-manual-copy {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: $radius-sm;
  color: $text-secondary;
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s ease;

  .svg-icon {
    font-size: 11px;
  }

  &:hover {
    background: rgba(51, 102, 255, 0.08);
    color: $primary-color;
  }
}

.tp-manual-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 24px;
  border: none;
  border-radius: $radius-sm;
  /* 浅底主题色（非实色蓝） */
  background: rgba(51, 102, 255, 0.1);
  color: $primary-color;
  cursor: pointer;
  transition: background 0.12s ease;

  .svg-icon {
    display: block;
    font-size: 13px;
  }

  &:hover:not(:disabled) {
    background: rgba(51, 102, 255, 0.18);
  }

  /* 翻译中：图标旋转反馈 */
  &.busy .svg-icon {
    animation: tp-rotate 0.8s linear infinite;
  }

  &:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }
}

@keyframes tp-rotate {
  to {
    transform: rotate(360deg);
  }
}

/* 译文区：与输入框完全一致的外观（等高、同底同圆角），纯展示不可编辑 */
.tp-manual-result {
  min-height: 64px;
  max-height: 120px;
  overflow-y: auto;
  padding: 7px 9px;
  border: 1px solid transparent;
  border-radius: $radius-sm;
  background: $search-bg;
  font-size: 12px;
  line-height: 1.5;
  font-family: inherit;
  color: $text-primary;
  white-space: pre-wrap;
  word-break: break-word;
  cursor: default;
}

/* 译文底部操作行（复制/插入跟随译文底部） */
.tp-manual-foot {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

/* ===== 翻译历史区（撑满剩余，内部滚动） ===== */
.tp-history {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tp-his-tools {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 分界线 + 中间标题 */
.tp-his-divider {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  font-size: 10px;
  color: $text-secondary;

  span {
    flex-shrink: 0;
    letter-spacing: 0.5px;
  }

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: $divider;
  }
}

.tp-his-search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  height: 26px;
  padding: 0 7px;
  background: $search-bg;
  border-radius: $radius-sm;
  border: 1px solid transparent;
  transition: border-color 0.12s ease;

  &:focus-within {
    border-color: $primary-color;
  }

  input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 11px;
    color: $text-primary;

    &::placeholder {
      color: $text-secondary;
    }
  }

  .tp-his-clear {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 15px;
    height: 15px;
    border-radius: $radius-sm;
    color: $text-secondary;
    font-size: 10px;
    cursor: pointer;
    flex-shrink: 0;

    &:hover {
      background: $divider;
      color: $text-primary;
    }
  }
}

/* 小图标按钮 */
.tp-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  font-size: 12px;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.12s ease;

  &:hover {
    background: $search-bg;
    color: $text-primary;
  }

  &.tp-danger:hover {
    background: rgba(245, 63, 63, 0.1);
    color: #f53f3f;
  }
}

/* 清空确认条 */
.tp-confirm {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 10px;
  border: 1px solid rgba(245, 63, 63, 0.3);
  border-radius: $radius-sm;
  font-size: 12px;
  color: $text-primary;
  flex-shrink: 0;

  span {
    flex: 1;
    min-width: 0;
  }
}

.tp-mini-btn {
  height: 22px;
  padding: 0 9px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: transparent;
  color: $text-secondary;
  font-size: 11px;
  cursor: pointer;
  flex-shrink: 0;

  &:hover {
    color: $text-primary;
    border-color: $text-secondary;
  }

  &.tp-mini-btn-primary {
    background: $primary-color;
    border-color: $primary-color;
    color: #fff;
  }

  &.tp-mini-btn-danger {
    background: #f53f3f;
    border-color: #f53f3f;
    color: #fff;
  }
}

/* 列表 */
.tp-his-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 2px;
}

.tp-group-title {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 6px 3px;
  font-size: 10px;
  font-weight: 600;
  color: $text-secondary;
  letter-spacing: 0.5px;

  .svg-icon {
    font-size: 11px;
  }
}

.tp-pin-title {
  color: $primary-color;
}

.tp-folder {
  display: flex;
  align-items: center;
  gap: 5px;
  height: 28px;
  padding: 0 6px;
  border-radius: $radius-sm;
  cursor: pointer;
  user-select: none;
  transition: background 0.12s ease;

  &:hover {
    background: $search-bg;

    .tp-folder-ops {
      opacity: 1;
    }
  }

  .tp-folder-caret {
    font-size: 10px;
    color: $text-secondary;
    transition: transform 0.15s ease;
    transform: rotate(-90deg);
  }

  &.open .tp-folder-caret {
    transform: rotate(0deg);
  }

  .tp-folder-ico {
    font-size: 12px;
    color: $primary-color;
  }

  .tp-folder-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 12px;
    font-weight: 500;
    color: $text-primary;
  }

  /* 重命名行内编辑框（名称位替换） */
  .tp-folder-rename {
    flex: 1;
    min-width: 0;
    height: 20px;
    padding: 0 5px;
    border: 1px solid $primary-color;
    border-radius: $radius-sm;
    background: $search-bg;
    font-size: 12px;
    color: $text-primary;
    outline: none;
  }

  .tp-folder-count {
    flex-shrink: 0;
    font-size: 10px;
    color: $text-secondary;
    background: $search-bg;
    border-radius: 8px;
    padding: 1px 6px;
  }

  .tp-folder-ops {
    display: flex;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.12s ease;

    .tp-icon-btn {
      width: 20px;
      height: 20px;
      font-size: 10px;
    }
  }
}

.tp-folder-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding-left: 12px;
}

.tp-his-item {
  border-radius: $radius-sm;

  &.pinned {
    background: rgba(51, 102, 255, 0.04);
  }
}

/* 空态 */
.tp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 30px 12px;
  color: $text-secondary;

  .tp-empty-ico {
    font-size: 30px;
    opacity: 0.4;
  }

  p {
    font-size: 12px;
    margin: 0;
  }

  .tp-empty-tip {
    font-size: 11px;
    opacity: 0.7;
  }
}

.tp-empty-mini {
  padding: 8px 6px;
  font-size: 11px;
  color: $text-secondary;
  text-align: center;
}

/* 分组表单 */
.tp-form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 4px;
}

.tp-form-title {
  font-size: 13px;
  font-weight: 600;
  color: $text-primary;
}

.tp-form input {
  height: 30px;
  padding: 0 10px;
  border: 1px solid $border-color;
  border-radius: $radius-sm;
  background: $search-bg;
  font-size: 12px;
  color: $text-primary;
  outline: none;
  transition: border-color 0.12s ease;

  &:focus {
    border-color: $primary-color;
  }
}

.tp-form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
