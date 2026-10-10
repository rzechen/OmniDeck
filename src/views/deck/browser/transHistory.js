// 翻译历史数据层：模块级响应式单例（浏览器页功能宫格「翻译历史」面板与
// 浏览器页 onProgress 接收共用），IndexedDB 持久化
// 条目 { id, text, trans, source, target, engine, url, host, time, pinned, folderId }
// 分组 { id, name }（删除分组时内部条目移回未分组，不级联删除）
import { reactive } from 'vue'
import { getItem, setItem } from '@/utils/storage/db'

// 语言表（与主进程 engines.js TARGET_LANGS 一致）：TranslatePanel 下拉与
// TransCard 历史卡片（语言对中文展示）共用
export const TRANS_LANGS = {
  'zh-CN': '简体中文',
  'zh-TW': '繁體中文',
  en: '英语',
  ja: '日语',
  ko: '韩语',
  fr: '法语',
  de: '德语',
  es: '西班牙语',
  pt: '葡萄牙语',
  it: '意大利语',
  ru: '俄语',
  ar: '阿拉伯语',
  th: '泰语',
  vi: '越南语',
  id: '印尼语',
  ms: '马来语',
  hi: '印地语',
  tr: '土耳其语',
  nl: '荷兰语',
  pl: '波兰语',
  sv: '瑞典语',
  no: '挪威语',
  da: '丹麦语',
  fi: '芬兰语',
  cs: '捷克语',
  ro: '罗马尼亚语',
  hu: '匈牙利语',
  el: '希腊语',
  he: '希伯来语',
  uk: '乌克兰语',
  bg: '保加利亚语',
  sr: '塞尔维亚语',
  hr: '克罗地亚语',
  sk: '斯洛伐克语',
  sl: '斯洛文尼亚语',
  lt: '立陶宛语',
  lv: '拉脱维亚语',
  et: '爱沙尼亚语',
  fa: '波斯语',
  bn: '孟加拉语',
  ur: '乌尔都语',
  ta: '泰米尔语',
  te: '泰卢固语',
  mr: '马拉地语',
  my: '缅甸语',
  km: '高棉语',
  lo: '老挝语',
  mn: '蒙古语',
  ne: '尼泊尔语',
  si: '僧伽罗语',
  ka: '格鲁吉亚语',
  hy: '亚美尼亚语',
  az: '阿塞拜疆语',
  kk: '哈萨克语',
  uz: '乌兹别克语',
  af: '南非荷兰语',
  sw: '斯瓦希里语',
  ca: '加泰罗尼亚语',
  ga: '爱尔兰语',
  cy: '威尔士语',
  is: '冰岛语',
  mk: '马其顿语',
  sq: '阿尔巴尼亚语',
  bs: '波斯尼亚语',
  be: '白俄罗斯语',
  fil: '菲律宾语',
  haw: '夏威夷语',
  la: '拉丁语',
  eo: '世界语',
  yi: '意第绪语',
  ht: '海地克里奥尔语'
}

const ITEMS_KEY = 'browser:transHistory'
const FOLDERS_KEY = 'browser:transFolders'
const HISTORY_LIMIT = 500

export const transState = reactive({
  loaded: false,
  items: [],
  folders: []
})

function uid() {
  return 'th' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

function persist() {
  setItem(ITEMS_KEY, transState.items)
  setItem(FOLDERS_KEY, transState.folders)
}

export function loadTransHistory() {
  if (transState.loaded) return
  transState.items = (getItem(ITEMS_KEY, []) || []).slice(0, HISTORY_LIMIT)
  transState.folders = getItem(FOLDERS_KEY, []) || []
  transState.loaded = true
}

// 记录一条翻译（成功后由注入脚本上报、主进程补全语言对/来源后经 onProgress 到达）：
// 同文本同目标语言已存在则更新译文与时间并前移（避免重复刷屏）；
// 新记录默认归档到当天日期分组（组名可改，避免未分组无限堆积）
export function addTransHistory(rec) {
  loadTransHistory()
  if (!rec || !rec.text || !rec.trans) return
  const hit = transState.items.find(it =>
    it.text === rec.text && (it.target || '') === (rec.target || ''))
  if (hit) {
    hit.trans = rec.trans
    hit.time = rec.time || Date.now()
    hit.url = rec.url || hit.url
    hit.host = rec.host || hit.host
    hit.source = rec.source || hit.source
    hit.engine = rec.engine || hit.engine
    const i = transState.items.indexOf(hit)
    transState.items.splice(i, 1)
    transState.items.unshift(hit)
  } else {
    transState.items.unshift({
      id: uid(),
      text: rec.text,
      trans: rec.trans,
      source: rec.source || 'auto',
      target: rec.target || 'zh-CN',
      engine: rec.engine || 'google',
      url: rec.url || '',
      host: rec.host || '',
      time: rec.time || Date.now(),
      pinned: false,
      folderId: ensureDayFolder(rec.time).id
    })
    if (transState.items.length > HISTORY_LIMIT) transState.items.length = HISTORY_LIMIT
  }
  persist()
}

// 日期分组（yyyy年m月d日）：不存在则创建；组名可被用户重命名（重命名后
// 该组视为用户接管，后续新记录按名字找不到会另建当天日期组）
function dayFolderName(time) {
  const d = new Date(time || Date.now())
  return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日'
}

function ensureDayFolder(time) {
  const name = dayFolderName(time)
  let f = transState.folders.find(x => x.name === name)
  if (!f) {
    f = { id: uid() + 'f', name }
    transState.folders.push(f)
  }
  return f
}

export function removeTrans(id) {
  const i = transState.items.findIndex(it => it.id === id)
  if (i > -1) {
    transState.items.splice(i, 1)
    persist()
  }
}

export function toggleTransPin(id) {
  const it = transState.items.find(x => x.id === id)
  if (it) {
    it.pinned = !it.pinned
    persist()
  }
}

export function moveTransToFolder(id, folderId) {
  const it = transState.items.find(x => x.id === id)
  if (it) {
    it.folderId = folderId
    persist()
  }
}

// ===== 分组 =====
export function addTransFolder(name) {
  loadTransHistory()
  const n = String(name || '').trim()
  if (!n) return null
  // 重名自动加序号
  let final = n
  let seq = 2
  while (transState.folders.some(f => f.name === final)) final = n + ' ' + seq++
  const folder = { id: uid() + 'f', name: final }
  transState.folders.push(folder)
  persist()
  return folder
}

export function renameTransFolder(id, name) {
  const f = transState.folders.find(x => x.id === id)
  const n = String(name || '').trim()
  if (f && n) {
    f.name = n
    persist()
  }
}

// 删除分组：内部条目移回未分组（不级联删除记录）
export function removeTransFolder(id) {
  const i = transState.folders.findIndex(f => f.id === id)
  if (i === -1) return
  transState.folders.splice(i, 1)
  transState.items.forEach(it => {
    if (it.folderId === id) it.folderId = ''
  })
  persist()
}

// 清空全部翻译记录（分组结构保留，置顶不豁免）
export function clearTransHistory() {
  transState.items = []
  persist()
}
