// 注入到浏览器容器（WebContentsView）页面主世界的双语对照翻译 controller
// 核心原则：不修改原 DOM 节点，仅在段落节点之后插入兄弟节点 .od-tr 展示译文，排版零破坏
// 经 browser/view-preload 通用桥 window.odBridge（od-tr:* 命名空间）与主进程通信
// 注意：以字符串形式经 executeJavaScript 注入，String.raw 保留正则反斜杠

const INJECT_SCRIPT = String.raw`(function () {
  if (window.__odTr) return

  var S = {
    enabled: false,
    // 段落级候选节点
    selector: 'p,h1,h2,h3,h4,h5,h6,li,td,th,blockquote,dd,dt,figcaption',
    // 命中任一祖先/自身即跳过（代码、表单控件等不翻译）
    skipClosest: 'script,style,noscript,code,pre,textarea,svg,canvas,iframe,select,button,.od-tr',
    io: null,
    mo: null,
    items: new Map(),   // el -> { text, state: pending|queued|done|failed }
    queue: [],
    flushTimer: null,
    rescanTimer: null,
    stats: { total: 0, done: 0, failed: 0 }
  }

  // ===== 样式注入与段落收集 =====
  function styleOnce() {
    if (document.getElementById('od-tr-style')) return
    var st = document.createElement('style')
    st.id = 'od-tr-style'
    st.textContent = '.od-tr{display:block !important;margin:4px 0 0 !important;padding:0 !important;' +
      'font-size:0.92em !important;line-height:1.6 !important;opacity:0.78 !important;color:inherit !important;' +
      'background:none !important;border:0 !important;max-width:none !important;float:none !important;' +
      'clear:both !important;text-align:start !important;list-style:none !important;}'
    ;(document.head || document.documentElement).appendChild(st)
  }

  function shouldSkip(el) {
    if (!el.isConnected) return true
    if (el.closest(S.skipClosest)) return true
    // 含子段落节点的容器跳过（交给子级段落处理，避免译文重复）
    if (el.querySelector(S.selector)) return true
    var text = (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim()
    if (text.length < 4 || text.length > 2000) return true
    // 可翻译文字（拉丁/CJK/西里尔/希腊/谚文/阿拉伯/泰文等）；纯数字符号视为不可译
    if (!/[\u0041-\u005A\u0061-\u007A\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\u0600-\u06FF\u0E00-\u0E7F]/.test(text)) return true
    // 字母类字符（含 CJK）不足 4 个视为非正文段落（零散符号/数字），跳过
    var letters = text.match(/[A-Za-z\u00C0-\u024F\u0370-\u03FF\u0400-\u04FF\u3040-\u30FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF\u0600-\u06FF\u0E00-\u0E7F]/g)
    if (!letters || letters.length < 4) return true
    if (/^(https?:\/\/|www\.)\S+$/i.test(text)) return true
    return false
  }

  function collect() {
    var root = document.body
    if (!root || !S.enabled) return
    var els = root.querySelectorAll(S.selector)
    for (var i = 0; i < els.length; i++) {
      var el = els[i]
      var it = S.items.get(el)
      if (it) {
        if (it.state === 'pending') S.io.observe(el)
        continue
      }
      if (shouldSkip(el)) continue
      it = { text: (el.innerText || el.textContent || '').replace(/\s+/g, ' ').trim(), state: 'pending' }
      S.items.set(el, it)
      S.io.observe(el)
    }
  }

  // ===== 译文执行与清理 =====
  // 清理孤儿译文：原段落被 SPA 重渲染移除后，残留的 .od-tr 一并移除
  function pruneOrphans() {
    var trs = document.querySelectorAll('.od-tr')
    for (var i = 0; i < trs.length; i++) {
      var prev = trs[i].previousElementSibling
      if (!prev || !prev.isConnected || !S.items.has(prev)) trs[i].remove()
    }
  }

  function scheduleFlush() {
    if (S.flushTimer) return
    S.flushTimer = setTimeout(flush, 250)
  }

  function flush() {
    S.flushTimer = null
    if (!S.enabled) { S.queue = []; return }
    var chunk = S.queue.splice(0, 12)
    if (!chunk.length) return
    if (S.queue.length) scheduleFlush()
    var texts = []
    for (var i = 0; i < chunk.length; i++) {
      var it = S.items.get(chunk[i])
      texts.push(it ? it.text : '')
    }
    window.odBridge.invoke('od-tr:translate', texts).then(function (res) {
      var trs = (res && res.translations) || []
      for (var i = 0; i < chunk.length; i++) {
        var el = chunk[i]
        var it2 = S.items.get(el)
        if (!it2) continue
        var t = String(trs[i] || '').trim()
        // 译文为空或与原文一致（已是目标语言）不插入，按失败计但不重试
        if (!t || t === it2.text) { it2.state = 'failed'; S.stats.failed++; continue }
        it2.state = 'done'
        S.stats.done++
        applyTranslation(el, t)
      }
      report()
    }).catch(function (e) {
      for (var i = 0; i < chunk.length; i++) {
        var it3 = S.items.get(chunk[i])
        if (it3) it3.state = 'failed'
        S.stats.failed++
      }
      report({ error: String((e && e.message) || e) })
    })
  }

  function applyTranslation(el, text) {
    var tr = document.createElement('span')
    tr.className = 'od-tr'
    tr.textContent = text
    el.insertAdjacentElement('afterend', tr)
  }

  function report(extra) {
    try {
      var payload = { total: S.stats.total, done: S.stats.done, failed: S.stats.failed }
      if (extra) Object.keys(extra).forEach(function (k) { payload[k] = extra[k] })
      window.odBridge.send('od-tr:report', payload)
    } catch (e) { /* 通道不可用时静默 */ }
  }

  function scheduleRescan() {
    if (S.rescanTimer) return
    S.rescanTimer = setTimeout(function () {
      S.rescanTimer = null
      if (!S.enabled) return
      collect()
      pruneOrphans()
    }, 400)
  }

  // ===== 开关切换（enable / disable） =====
  function enable() {
    S.enabled = true
    styleOnce()
    if (!S.io) {
      // 视口优先：进入视口前 200px 才入队翻译
      S.io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var en = entries[i]
          if (!en.isIntersecting) continue
          var el = en.target
          S.io.unobserve(el)
          var it = S.items.get(el)
          if (!it || it.state !== 'pending') continue
          it.state = 'queued'
          S.queue.push(el)
          S.stats.total++
        }
        if (S.queue.length) scheduleFlush()
      }, { root: null, rootMargin: '200px 0px' })
    }
    if (!S.mo) {
      // SPA 动态内容：新增节点增量收集（自身插入的 .od-tr 忽略，避免循环触发）
      S.mo = new MutationObserver(function (muts) {
        for (var i = 0; i < muts.length; i++) {
          var m = muts[i]
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j]
            if (n.nodeType !== 1) continue
            if (n.classList && n.classList.contains('od-tr')) continue
            scheduleRescan()
            return
          }
        }
      })
    }
    var root = document.body || document.documentElement
    collect()
    S.mo.observe(root, { childList: true, subtree: true })
    report({ phase: 'on' })
  }

  function disable() {
    S.enabled = false
    if (S.mo) { try { S.mo.disconnect() } catch (e) { /* noop */ } }
    if (S.io) { try { S.io.disconnect() } catch (e) { /* noop */ } }
    var trs = document.querySelectorAll('.od-tr')
    for (var i = 0; i < trs.length; i++) trs[i].remove()
    S.items.clear()
    S.queue = []
    S.stats = { total: 0, done: 0, failed: 0 }
    report({ phase: 'off' })
  }

  window.odBridge.on('od-tr:command', function (msg) {
    if (!msg || !msg.type) return
    if (msg.type === 'enable') enable()
    else if (msg.type === 'disable') disable()
  })

  window.__odTr = true
  // 就绪上报：主进程据此在页面加载完成后按当前开关状态下发命令
  report({ ready: true })
})()`

// 注入脚本源码字符串（经 executeJavaScript 注入页面主世界）
module.exports = { INJECT_SCRIPT }
