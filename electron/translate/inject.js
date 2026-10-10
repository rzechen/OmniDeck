// 注入到浏览器容器（webview）页面主世界的划词动作条脚本（常开）
// 交互（PopClip 式）：选中网页文本 → 选区旁直接浮现「搜索 | 复制 | 翻译」动作条
//   ├─ 搜索：以默认搜索引擎（百度）在当前页检索选中词
//   ├─ 复制：复制选中文本（按钮短暂反馈「已复制」）
//   └─ 翻译：动作条原位展开为翻译面板（原文/译文/语言对/复制译文）
// 译文展示在面板内，不触碰页面 DOM，排版零破坏、复制天然友好
// 经 browser/view-preload 通用桥 window.odBridge（od-tr:* 命名空间）与主进程通信
// 注意：以字符串形式经 executeJavaScript 注入，String.raw 保留正则反斜杠

// OmniDeck 应用 logo（64px PNG 内联，源自 build/logo.png；第三方页面无法引用
// 应用资源文件，内嵌 data URI 是唯一可移植方案）
const LOGO_DATA = 'data:image/png;base64,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'

const INJECT_SCRIPT = String.raw`(function () {
  if (window.__odTr) return

  // odBridge 由 view-preload 注入，可能晚于本脚本（导航竞态）：等待就绪再启动，
  // 最多约 5s；期间重复注入由 __odTr 幂等挡住。直接访问未就绪的 odBridge 会抛
  // "Script failed to execute"（executeJavaScript 级错误），故不可裸调。
  if (!window.odBridge) {
    var waited = 0
    var timer = setInterval(function () {
      if (window.__odTr || window.odBridge) {
        clearInterval(timer)
        if (!window.__odTr) safeBoot()
        return
      }
      if (++waited > 16) clearInterval(timer)
    }, 300)
    return
  }
  safeBoot()

  // boot 异常兜底：打到 renderer console，并避免异常外抛导致 executeJavaScript 级报错
  function safeBoot() {
    try {
      boot()
    } catch (e) {
      try { console.error('[od-tr] init error:', e && (e.stack || e.message || e)) } catch (_) { }
    }
  }

  function boot() {
    if (window.__odTr) return
    window.__odTr = true

  var S = {
    source: 'auto',      // enable 命令下发（面板语言对展示用）
    target: 'zh-CN',
    theme: '#3366FF',    // 应用主题色（enable 下发；--od-brand 驱动划词 UI 品牌化）
    bar: null,           // 动作条（搜索/复制/翻译）
    panel: null,         // 翻译面板
    selText: '',         // 当前选中待译文本
    token: 0,            // 翻译请求代际：新一轮自增，旧在途请求结果/增量按 token 丢弃
    outsideDown: false,  // 最近一次 mousedown 是否发生在 bar/panel 之外（区分用户点空白与页面脚本清选区）
    lastFocus: null      // 最近聚焦的可编辑控件（插入译文的目标；blur 不清空，保留最后记忆）
  }

  // OD logo（应用图标 data URI 内嵌，第三方页面可显示真 logo）
  function mkLogo() {
    var w = document.createElement('span')
    w.className = 'od-logo'
    var img = document.createElement('img')
    img.src = '${LOGO_DATA}'
    img.alt = 'OmniDeck'
    w.appendChild(img)
    return w
  }

  // ===== 样式注入（动作条 + 面板；主题色经 --od-brand 变量，enable 热更新） =====
  function applyTheme() {
    // 变量挂在自建 style 上而非 documentElement，避免污染站点全局样式
    var st = document.getElementById('od-tr-style')
    if (st) st.textContent = cssText()
  }
  function cssText() {
    return ':root{--od-brand:' + S.theme + ';}' +
      // OD logo 圆标（应用图标；UI 中性色，无托底直出）
      '.od-logo{display:inline-flex;align-items:center;justify-content:center;' +
      'width:16px;height:16px;border-radius:50%;overflow:hidden;flex-shrink:0;}' +
      '.od-logo img{width:100%;height:100%;display:block;}' +
      // 动作条：中性白卡（与翻译面板同风格；不用主题色）
      '.od-bar{position:fixed;z-index:2147483647;display:flex;align-items:center;' +
      'border-radius:8px;background:rgba(250,250,252,.97);backdrop-filter:blur(14px);' +
      'box-shadow:0 4px 14px rgba(0,0,0,.16);border:1px solid rgba(0,0,0,.08);' +
      'padding:3px 3px 3px 8px;gap:2px;opacity:0;transform:translateY(2px);' +
      'transition:opacity .14s ease,transform .14s ease;pointer-events:none;}' +
      '.od-bar.od-show{opacity:1;transform:translateY(0);pointer-events:auto;}' +
      '.od-bar-btn{font:12px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;' +
      'color:#1d1d1f;background:none;border:0;border-radius:6px;padding:7px 11px;' +
      'cursor:pointer;user-select:none;-webkit-user-select:none;white-space:nowrap;}' +
      '.od-bar-btn:hover{background:rgba(0,0,0,.06);}' +
      '.od-bar-btn.od-done{color:#30b46a;}' +
      '.od-bar-sep{width:1px;height:14px;background:rgba(0,0,0,.1);margin:0 1px;}' +
      '.od-panel{position:fixed;z-index:2147483647;width:360px;max-width:calc(100vw - 24px);' +
      'border-radius:8px;background:rgba(250,250,252,.97);' +
      'backdrop-filter:blur(14px);box-shadow:0 8px 32px rgba(0,0,0,.18);' +
      'font:14px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;color:#1d1d1f;' +
      'padding:0 14px 10px;box-sizing:border-box;border:1px solid rgba(0,0,0,.08);}' +
      // 品牌行：logo + OmniDeck 翻译（中性色，面板不用主题色）
      '.od-brand-row{display:flex;align-items:center;gap:6px;margin:0 -14px 10px;' +
      'padding:9px 14px 8px;border-bottom:1px solid rgba(0,0,0,.06);}' +
      '.od-brand-name{font-size:11px;font-weight:600;color:#3a3a3c;letter-spacing:.02em;}' +
      // 内容区固定高度：面板尺寸稳定（内容长短不变形）；原文/译文独立滚动
      '.od-body{height:180px;display:flex;flex-direction:column;}' +
      '.od-sel-src{font-size:12px;color:#86868b;line-height:1.6;white-space:pre-wrap;' +
      'word-break:break-word;margin-bottom:8px;padding-bottom:8px;max-height:64px;' +
      'overflow-y:auto;overscroll-behavior:contain;flex-shrink:0;' +
      'border-bottom:1px solid rgba(0,0,0,.06);}' +
      '.od-sel-dst{font-size:13px;color:#2c2c2e;line-height:1.65;' +
      'white-space:pre-wrap;word-break:break-word;flex:1;min-height:0;' +
      'overflow-y:auto;overscroll-behavior:contain;}' +
      // 骨架屏：译文区占位（结果/首个流式增量到达后移除）
      '.od-skel{height:13px;border-radius:4px;margin:7px 0;' +
      'background:linear-gradient(90deg,#ececf0 25%,#f6f6f8 45%,#ececf0 65%);' +
      'background-size:200% 100%;animation:od-skel 1.1s ease-in-out infinite;}' +
      '.od-skel-mid{width:78%;}' +
      '.od-skel-short{width:46%;}' +
      '@keyframes od-skel{0%{background-position:120% 0;}100%{background-position:-80% 0;}}' +
      // 细滚动条（4px，半透明圆头）：原文/译文区与面板级滚动统一
      '.od-panel::-webkit-scrollbar,.od-body::-webkit-scrollbar,' +
      '.od-sel-src::-webkit-scrollbar,.od-sel-dst::-webkit-scrollbar{width:4px;}' +
      '.od-panel::-webkit-scrollbar-thumb,.od-body::-webkit-scrollbar-thumb,' +
      '.od-sel-src::-webkit-scrollbar-thumb,.od-sel-dst::-webkit-scrollbar-thumb' +
      '{background:rgba(0,0,0,.18);border-radius:2px;}' +
      '.od-panel::-webkit-scrollbar-track,.od-body::-webkit-scrollbar-track,' +
      '.od-sel-src::-webkit-scrollbar-track,.od-sel-dst::-webkit-scrollbar-track{background:transparent;}' +
      '.od-err{font-size:13px;color:#d64545;white-space:pre-wrap;word-break:break-word;}' +
      '.od-foot{display:flex;align-items:center;justify-content:space-between;' +
      'margin-top:10px;padding-top:8px;border-top:1px solid rgba(0,0,0,.06);}' +
      '.od-lang{font-size:11px;color:#a1a1a6;letter-spacing:.02em;}' +
      '.od-copy{font-size:12px;color:#4e6ef2;cursor:pointer;user-select:none;' +
      '-webkit-user-select:none;padding:2px 8px;border-radius:6px;}' +
      '.od-copy:hover{background:rgba(78,110,242,.12);}' +
      '.od-copy.od-done{color:#30b46a;}' +
      // 复制反馈 toast（降级路径）：底部居中主题色胶囊
      '#od-toast{position:fixed;left:50%;bottom:36px;transform:translateX(-50%) translateY(8px);' +
      'z-index:2147483647;background:var(--od-brand);color:#fff;font:12px/1 ' +
      '-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;padding:8px 14px;border-radius:8px;' +
      'box-shadow:0 4px 14px rgba(0,0,0,.22);opacity:0;pointer-events:none;' +
      'transition:opacity .18s ease,transform .18s ease;}' +
      '#od-toast.od-toast-show{opacity:1;transform:translateX(-50%) translateY(0);}' +
      // 细滚动条：统一 webview 内网页滚动条为 6px（覆盖站点默认粗滚动条，
      // !important 防站点自定义样式反超；随动作条样式一并注入）
      '*::-webkit-scrollbar{width:6px!important;height:6px!important;}' +
      '*::-webkit-scrollbar-track{background:transparent!important;}' +
      '*::-webkit-scrollbar-thumb{background:rgba(0,0,0,.22)!important;border-radius:3px!important;}' +
      '*::-webkit-scrollbar-thumb:hover{background:rgba(0,0,0,.38)!important;}'
  }
  function styleOnce() {
    if (document.getElementById('od-tr-style')) return
    var st = document.createElement('style')
    st.id = 'od-tr-style'
    st.textContent = cssText()
    ;(document.head || document.documentElement).appendChild(st)
  }

  // ===== 选区监听：动作条出现/收起 =====
  function onMouseUp(e) {
    // 点击发生在动作条/翻译面板内：内部交互（按钮自行处理），
    // 不重新定位、不收起（否则 mouseup 的延迟回调会在 click 之后误删刚创建的面板）
    var tgt = e.target
    if ((S.bar && S.bar.contains(tgt)) || (S.panel && S.panel.contains(tgt))) return
    // 输入控件内的选中不触发（那是编辑场景）
    if (tgt && /^(INPUT|TEXTAREA|SELECT)$/.test(tgt.tagName || '')) { hideAll(); return }
    // 延迟一拍让选区状态稳定（双击/拖选后浏览器还会更新选区）
    setTimeout(function () {
      var sel = window.getSelection && window.getSelection()
      // 无选区时：仅当用户主动点击了 bar/panel 之外（点空白取消）才收起；
      // 页面脚本自行清选区（如站点交互清除高亮）不收——避免面板"闪一下就没"
      if (!sel || sel.isCollapsed || !sel.rangeCount) {
        if (S.outsideDown) hideAll()
        return
      }
      var txt = String(sel).replace(/\s+/g, ' ').trim()
      if (!txt || txt.length < 2 || txt.length > 3000) {
        if (S.outsideDown) hideAll()
        return
      }
      var rect = sel.getRangeAt(0).getBoundingClientRect()
      if (!rect || (!rect.width && !rect.height)) return
      showBar(rect, txt)
    }, 10)
  }

  function showBar(rect, txt) {
    styleOnce()
    ensureBar()
    // 仅当选区文本变化时清掉旧翻译面板（点了「翻译」后 mouseup 回调重入时
    // 文本未变，保留面板；划选新词则收起旧面板重新来）
    if (txt !== S.selText) hidePanel()
    S.selText = txt
    locateBar(rect)
    S.bar.classList.add('od-show')
  }

  // 动作条元素构建（一次性）
  function ensureBar() {
    if (S.bar) return
    S.bar = document.createElement('div')
    S.bar.className = 'od-bar'
    // OD logo 品牌标识（区分网站自身的划词菜单）
    S.bar.appendChild(mkLogo())
    var mkBtn = function (label, fn) {
      var b = document.createElement('button')
      b.className = 'od-bar-btn'
      b.textContent = label
      b.addEventListener('mousedown', function (e) { e.preventDefault(); e.stopPropagation() })
      b.addEventListener('click', function (e) { e.preventDefault(); e.stopPropagation(); fn(b) })
      return b
    }
    S.bar.appendChild(mkBtn('搜索', onSearch))
    var sep1 = document.createElement('span')
    sep1.className = 'od-bar-sep'
    S.bar.appendChild(sep1)
    S.bar.appendChild(mkBtn('复制', onCopy))
    var sep2 = document.createElement('span')
    sep2.className = 'od-bar-sep'
    S.bar.appendChild(sep2)
    S.bar.appendChild(mkBtn('翻译', onTranslate))
    ;(document.body || document.documentElement).appendChild(S.bar)
  }

  // 动作条定位：选区下方（fixed 相对视口，clamp）；不改动显示状态（滚动跟随复用）
  function locateBar(rect) {
    var bw = S.bar.offsetWidth || 150
    var x = Math.max(4, Math.min(rect.left, window.innerWidth - bw - 8))
    var y = Math.min(rect.bottom + 6, window.innerHeight - 34)
    S.bar.style.left = x + 'px'
    S.bar.style.top = Math.max(4, y) + 'px'
  }

  // 滚动跟随：永不主动收起——选区在视口内则跟随重定位，滚出视口则
  // clamp 吸附在视口边缘（locateBar 内置上下 clamp），滚回来继续跟随
  function onScroll() {
    if (!S.selText) return
    var sel = window.getSelection && window.getSelection()
    if (!sel || sel.isCollapsed || !sel.rangeCount) return
    var rect = sel.getRangeAt(0).getBoundingClientRect()
    if (!rect || (!rect.width && !rect.height)) return
    if (S.bar && S.bar.classList.contains('od-show')) locateBar(rect)
    if (S.panel) positionPanel()
  }

  function hideBar() {
    if (S.bar) S.bar.classList.remove('od-show')
  }

  function hidePanel() {
    if (S.panel) { S.panel.remove(); S.panel = null }
  }

  function hideAll() {
    hideBar()
    hidePanel()
  }

  // 复制反馈：优先走主窗口全局 $message（与其他页面组件一致）；桥异常时
  // 降级为页面内小 toast（第三方页面无法访问应用组件体系）
  function showToast(text) {
    var fallback = function () { toastInPage(text) }
    try {
      window.odBridge.invoke('od-tr:toast', text).catch(fallback)
    } catch (e) { fallback() }
  }
  function toastInPage(text) {
    styleOnce()
    var t = document.getElementById('od-toast')
    if (!t) {
      t = document.createElement('div')
      t.id = 'od-toast'
      ;(document.body || document.documentElement).appendChild(t)
    }
    t.textContent = text
    t.classList.add('od-toast-show')
    clearTimeout(showToast._timer)
    showToast._timer = setTimeout(function () {
      t.classList.remove('od-toast-show')
    }, 1400)
  }

  // ===== 动作：搜索（百度检索选中词，当前页导航，可后退返回） =====
  function onSearch() {
    if (!S.selText) return
    hideAll()
    window.location.href = 'https://www.baidu.com/s?wd=' + encodeURIComponent(S.selText)
  }

  // ===== 动作：复制选中文本（toast 反馈） =====
  function onCopy(btn) {
    if (!S.selText) return
    if (copyTo(S.selText)) {
      showToast('已复制')
      btn.textContent = '已复制'
      btn.classList.add('od-done')
      setTimeout(function () {
        btn.textContent = '复制'
        btn.classList.remove('od-done')
        hideAll()
      }, 900)
    }
  }

  // ===== 动作：翻译（动作条保持显示，面板紧贴其正下方展开、与动作条同宽对齐） =====
  function onTranslate() {
    if (!S.selText) return
    styleOnce()
    // 请求代际：新一轮立即开始，旧在途请求（面板已被收起/重新点击）的
    // 结果与流式增量按 token 丢弃——busy 锁会挡住新翻译（LLM 慢时最长锁 120s）
    var token = ++S.token
    if (!S.panel) {
      S.panel = document.createElement('div')
      S.panel.className = 'od-panel'
      ;(document.body || document.documentElement).appendChild(S.panel)
    }
    S.panel.innerHTML = ''
    // 品牌行：OD logo + 名称，明确面板来自 OmniDeck
    var brandRow = document.createElement('div')
    brandRow.className = 'od-brand-row'
    var brandLogo = mkLogo()
    var brandName = document.createElement('span')
    brandName.className = 'od-brand-name'
    brandName.textContent = 'OmniDeck 翻译'
    brandRow.appendChild(brandLogo)
    brandRow.appendChild(brandName)
    // 内容滚动区：原文完整展示 + 译文，超高内部滚动查看
    var body = document.createElement('div')
    body.className = 'od-body'
    var src = document.createElement('div')
    src.className = 'od-sel-src'
    src.textContent = S.selText
    var dst = document.createElement('div')
    dst.className = 'od-sel-dst'
    // 骨架屏占位：点击翻译立即呈现译文区结构，流式/结果到达后替换
    dst.innerHTML = '<div class="od-skel"></div><div class="od-skel od-skel-mid"></div><div class="od-skel od-skel-short"></div>'
    body.appendChild(src)
    body.appendChild(dst)
    var foot = document.createElement('div')
    foot.className = 'od-foot'
    var lang = document.createElement('span')
    lang.className = 'od-lang'
    lang.textContent = langLabel()
    foot.appendChild(lang)
    S.panel.appendChild(brandRow)
    S.panel.appendChild(body)
    S.panel.appendChild(foot)
    positionPanel()
    var reqText = S.selText
    window.odBridge.invoke('od-tr:translate', { texts: [reqText], token: token }).then(function (res) {
      if (token !== S.token) return
      var t = String((res && res.translations && res.translations[0]) || '').trim()
      // 后台静默翻译：面板已被收起（S.panel 为空）也照常上报历史，
      // 用户可在工作台「翻译历史」中查看结果——翻译不因收起面板而作废
      if (t) {
        try {
          window.odBridge.invoke('od-tr:log', { text: reqText, trans: t }).catch(function () { })
        } catch (e) { /* 历史记录失败不影响翻译 */ }
      }
      if (!S.panel) return
      var detected = res && res.detected
      if (detected) lang.textContent = detected + ' → ' + S.target
      if (!t) {
        dst.className = 'od-err'
        dst.textContent = '未获取到译文，可尝试切换引擎'
        return
      }
      dst.textContent = t
      // 复制按钮（译文可复制，toast 反馈）
      var copy = document.createElement('span')
      copy.className = 'od-copy'
      copy.textContent = '复制'
      copy.addEventListener('click', function () {
        if (!copyTo(t)) return
        showToast('译文已复制')
        copy.textContent = '已复制'
        copy.classList.add('od-done')
        setTimeout(function () {
          copy.textContent = '复制'
          copy.classList.remove('od-done')
        }, 1500)
      })
      foot.appendChild(copy)
    }).catch(function (e) {
      if (token !== S.token || !S.panel) return
      dst.className = 'od-err'
      dst.textContent = '翻译失败：' + String((e && e.message) || e)
    })
  }

  function langLabel() {
    var src = S.source === 'auto' ? '自动' : S.source
    return src + ' → ' + S.target
  }

  // 面板定位：锚定动作条正下方、左对齐；固定 360px 宽（视口小则收窄），
  // 底部越界翻转到动作条上方；滚动时由 onScroll 驱动跟随
  function positionPanel() {
    if (!S.panel) return
    var b = S.bar && S.bar.getBoundingClientRect ? S.bar.getBoundingClientRect() : null
    if (!b) { S.panel.style.left = '8px'; S.panel.style.top = '40px'; return }
    var w = Math.min(360, window.innerWidth - 16)
    S.panel.style.width = w + 'px'
    var ph = S.panel.offsetHeight || 160
    var below = b.bottom + 6
    var y = below + ph > window.innerHeight - 8
      ? Math.max(8, b.top - ph - 6)   // 底部放不下：翻转到动作条上方
      : below
    S.panel.style.left = Math.max(4, Math.min(Math.round(b.left), window.innerWidth - w - 8)) + 'px'
    S.panel.style.top = y + 'px'
  }

  // execCommand 复制（webview 环境不依赖 clipboard 权限，兼容性最好）
  function copyTo(text) {
    try {
      var ta = document.createElement('textarea')
      ta.value = text
      ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;'
      document.body.appendChild(ta)
      ta.select()
      var ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch (e) { return false }
  }

  // ===== 全局事件与命令（划词常开，无需 enable 开关） =====
  document.addEventListener('mouseup', onMouseUp, true)
  // mousedown 只记录「是否点击在 bar/panel 之外」（供 mouseup 后判定收起），
  // 不直接收起——收起与否由选区状态 + 用户意图共同决定
  document.addEventListener('mousedown', function (e) {
    S.outsideDown = !(S.bar && S.bar.contains(e.target)) &&
      !(S.panel && S.panel.contains(e.target))
  }, true)
  window.addEventListener('scroll', onScroll, true)
  window.addEventListener('resize', hideAll)
  // 不监听 window blur：切换到其他软件时动作条/翻译面板保持，
  // 切回仍在（内容不丢；收起由「点击空白清除选区」决定）

  // 记录页面内最近聚焦的可编辑控件（「插入译文」目标）：
  // - shadow DOM 内元素经 composedPath 取真实目标
  // - 非文本型 INPUT（checkbox/radio/button…）不算；非可编辑聚焦不清空（保留最后记忆）
  document.addEventListener('focusin', function (e) {
    var t = (e.composedPath && e.composedPath()[0]) || e.target
    if (!t || !t.tagName) return
    var tag = t.tagName
    var ok = tag === 'TEXTAREA' ||
      (tag === 'INPUT' && !/^(checkbox|radio|button|submit|reset|file|image|range|color)$/i.test(t.type || '')) ||
      t.isContentEditable === true
    if (ok) S.lastFocus = t
  }, true)

  // 插入译文到页面输入框：目标为最近聚焦的可编辑控件
  // execCommand insertText 首选（保留撤销栈、自动触发 input，兼容框架受控组件）；
  // 失败降级 setRangeText + 手动派发 input（contenteditable 罕见兜底 append）
  function insertIntoPage(text) {
    var t = String(text || '')
    if (!t) return
    var el = S.lastFocus
    if (!el || !el.isConnected) {
      showToast('未找到网页输入框，请先在网页中点击要输入的位置')
      return
    }
    try {
      el.focus()
      var ok = false
      try { ok = document.execCommand('insertText', false, t) } catch (e) { ok = false }
      if (!ok) {
        if (el.setRangeText) {
          el.setRangeText(t, el.selectionStart != null ? el.selectionStart : el.value.length,
            el.selectionEnd != null ? el.selectionEnd : el.value.length, 'end')
          el.dispatchEvent(new Event('input', { bubbles: true }))
        } else {
          el.textContent += t
        }
      }
      showToast('已插入网页输入框')
    } catch (e) {
      showToast('插入失败')
    }
  }

  try {
    window.odBridge.on('od-tr:command', function (msg) {
      if (!msg || !msg.type) return
      if (msg.type === 'enable') {
        // 语言对/主题色热切换（enable 重发即更新面板展示与品牌色）
        if (msg.source) S.source = msg.source
        if (msg.target) S.target = msg.target
        if (msg.theme && /^#[0-9a-fA-F]{6}$/.test(msg.theme) && msg.theme !== S.theme) {
          S.theme = msg.theme
          applyTheme()
        }
      } else if (msg.type === 'tr-delta') {
        // LLM 流式增量：打字机实时更新面板译文；token 代际过滤（旧请求增量丢弃）；
        // 首个增量到达时清掉骨架屏
        if (S.panel && typeof msg.text === 'string' && msg.token === S.token) {
          var dstEl = S.panel.querySelector('.od-sel-dst')
          if (dstEl) {
            if (dstEl.querySelector('.od-skel')) dstEl.innerHTML = ''
            dstEl.textContent = msg.text
          }
        }
      } else if (msg.type === 'tr-insert') {
        // 插入译文到网页最近聚焦的输入框（翻译面板手动翻译区触发）
        insertIntoPage(msg.text)
      }
    })
  } catch (e) { /* odBridge 缺失：boot 前已等待，防御性兜底 */ }

  try {
    window.odBridge.invoke('od-tr:report', { ready: true })
  } catch (e) { /* 同上 */ }

  }

})()`

module.exports = { INJECT_SCRIPT }
