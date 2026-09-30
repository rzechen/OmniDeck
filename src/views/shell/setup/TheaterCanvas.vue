<template>
  <canvas ref="cv" class="theater-cv" />
</template>

<script>
// 装配等待小剧场（canvas，单侧一块）：等待期不枯燥，两侧梯形舞台各演示一个产品——
// 左 OmniBuddy：用户提问逐字打出 → 思考点 → 流式输出回答（打字机 + 光标 + 底部输入框）
// 右 OmniDeck ：输入一串原始 JSON → 点「格式化」→ 逐行揭示彩色格式化结果（+ 底部状态条）
// 12→15s 一轮循环淡入淡出（内容加量：产品问答 + 追问建议 / 格式化 + 导出两幕）；
// 组件仅在装配步挂载，卸载即停 raf。
const CYCLE = 15000

// 画布调色板（canvas 取不到 CSS 变量，用与主题一致的硬编码）
const C = {
  deck: '#2f62e8',
  buddy: '#7452e8',
  text: '#303133',
  sub: '#9aa0ac',
  border: 'rgba(0,0,0,0.07)',
  userBubble: '#eef2fd',
  aiBubble: '#f5f2fd',
  green: '#3f9b6d',
  orange: '#c07a2a'
}

const Q = '介绍一下 OmniDeck'
// 答案分四段（\n 分隔）：总览（首句控制单行不折）→ 加密 → 格式化 → Buddy 连接器/长记忆/智能体
const A = 'OmniDeck 是一体化双区 AI 工作台：\n· 内容安全 — 本地 AES 加密、隐私脱敏，敏感数据不出设备\n· 效率工具 — JSON/XML 一键格式化、Markdown 排版、多格式导出\nOmniBuddy 更内置业界流行的连接器、跨会话长记忆与可编排智能体，问答直达执行。'
const TYPE_MS = 45 // 流式输出速度（答案加长后提速，保证 15s 周期内完成 + 留出 chips 时间）
// 追问建议 chips（回答流式完成后逐个弹出）
const SUGGESTS = ['怎么格式化 JSON？', '能导出 Word 吗？', '支持哪些快捷键？']
const RAW = '{"title":"OmniDeck","tags":["效率","工具台"],"ok":true}'
// 格式化输出：逐行 token 染色（key 紫 / 字符串绿 / 布尔橙 / 结构灰）
const OUT = [
  [{ text: '{', c: C.sub }],
  [{ text: '  "title": ', c: C.buddy }, { text: '"OmniDeck"', c: C.green }, { text: ',', c: C.sub }],
  [{ text: '  "tags": [', c: C.buddy }, { text: '"效率"', c: C.green }, { text: ', ', c: C.sub }, { text: '"工具台"', c: C.green }, { text: '],', c: C.sub }],
  [{ text: '  "ok": ', c: C.buddy }, { text: 'true', c: C.orange }],
  [{ text: '}', c: C.sub }]
]

// 圆角矩形（自绘，兼容无 roundRect 的环境）
function rrect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v))
}

// 简易换行（按宽度逐字累加；\n 强制分段，多段自动纵向铺开）
function wrapText(ctx, text, maxWidth) {
  const out = []
  for (const seg of text.split('\n')) {
    if (!seg) { continue }
    let line = ''
    for (const ch of seg) {
      if (ctx.measureText(line + ch).width > maxWidth && line) {
        out.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    if (line) out.push(line)
  }
  return out
}

export default {
  name: 'SetupTheaterCanvas',
  props: {
    // 本舞台演示的产品侧：buddy = 流式问答 / deck = JSON 格式化
    side: { type: String, default: 'buddy' },
    // 离场/切页前置暂停：停止 rAF，避免与主视图首渲染争抢主线程造成切页卡顿
    paused: { type: Boolean, default: false }
  },
  watch: {
    paused(v) {
      if (v) {
        cancelAnimationFrame(this._raf)
        this._raf = 0
      } else if (!this._raf) {
        this._raf = requestAnimationFrame(this.tick)
      }
    }
  },
  mounted() {
    this.ctx = this.$refs.cv.getContext('2d')
    this._t0 = performance.now()
    this.resize()
    window.addEventListener('resize', this.resize)
    this._raf = requestAnimationFrame(this.tick)
  },
  beforeUnmount() {
    cancelAnimationFrame(this._raf)
    window.removeEventListener('resize', this.resize)
  },
  methods: {
    resize() {
      const cv = this.$refs.cv
      if (!cv) return
      const rect = cv.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      this.cssW = rect.width
      this.cssH = rect.height
      cv.width = Math.round(rect.width * dpr)
      cv.height = Math.round(rect.height * dpr)
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    },
    tick() {
      this.draw((performance.now() - this._t0) % CYCLE)
      this._raf = requestAnimationFrame(this.tick)
    },
    // 轮次首尾同步淡入淡出
    curtain(t) {
      return Math.min(clamp01(t / 450), clamp01((CYCLE - t) / 600))
    },
    caretOn(t) {
      return Math.floor(t / 475) % 2 === 0
    },
    draw(t) {
      const ctx = this.ctx
      ctx.clearRect(0, 0, this.cssW, this.cssH)
      if (this.side === 'deck') this.drawDeck(ctx, 0, 0, this.cssW, this.cssH, t)
      else this.drawBuddy(ctx, 0, 0, this.cssW, this.cssH, t)
    },
    // 顶部标签（dot + 名字）：无白卡底座，直接浮于梯形舞台渐变上
    headerTag(ctx, x, y, dot, name, alpha) {
      ctx.globalAlpha = alpha
      ctx.fillStyle = dot
      rrect(ctx, x, y + 5, 7, 7, 2)
      ctx.fill()
      ctx.fillStyle = C.sub
      ctx.font = '600 10px system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillText(name, x + 13, y + 9)
    },
    // 底部输入条（Buddy）：圆角框 + 占位符 + 发送圆钮 —— 撑起产品截图的真实感
    inputBar(ctx, x, y, w, alpha) {
      ctx.globalAlpha = alpha
      const h = 26
      rrect(ctx, x, y, w, h, 13)
      ctx.fillStyle = 'rgba(0,0,0,0.035)'
      ctx.fill()
      ctx.strokeStyle = 'rgba(0,0,0,0.06)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = C.sub
      ctx.font = '10px system-ui, sans-serif'
      ctx.textAlign = 'left'
      ctx.fillText('问点什么…', x + 10, y + 13)
      // 发送钮
      ctx.fillStyle = C.buddy
      ctx.beginPath()
      ctx.arc(x + w - 14, y + 13, 9, 0, Math.PI * 2)
      ctx.fill()
      ctx.fillStyle = '#fff'
      ctx.beginPath()
      ctx.moveTo(x + w - 17, y + 9)
      ctx.lineTo(x + w - 11, y + 13)
      ctx.lineTo(x + w - 17, y + 17)
      ctx.closePath()
      ctx.fill()
    },
    // Buddy：用户提问逐字打出 → 思考点 → 流式输出回答
    drawBuddy(ctx, x, y, w, h, t) {
      const a = this.curtain(t)
      if (a <= 0) return
      // 顶部留 44px 让出斜边展开区，内容直接绘制在舞台渐变上
      const ix = x
      const iy = y + 44
      const iw = w
      const ih = h - 44
      this.headerTag(ctx, ix + 6, iy - 34, C.buddy, 'OmniBuddy · 问答', a)

      const pad = 12
      const innerW = iw - pad * 2
      let cy = iy + 40

      // ① 用户提问：0.5s 起逐字打出（右对齐气泡）
      const qShown = Math.floor(Math.max(0, t - 500) / 85)
      const qText = Q.slice(0, Math.min(Q.length, qShown))
      if (qText || t > 500) {
        ctx.font = '11px system-ui, sans-serif'
        const fullW = ctx.measureText(Q).width + 18
        const bw = Math.min(fullW, innerW)
        rrect(ctx, ix + iw - pad - bw, cy, bw, 24, 8)
        ctx.fillStyle = C.userBubble
        ctx.fill()
        ctx.strokeStyle = C.border
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = C.text
        ctx.textAlign = 'left'
        ctx.fillText(qText, ix + iw - pad - bw + 9, cy + 12)
        if (qShown < Q.length && this.caretOn(t)) {
          const tw = ctx.measureText(qText).width
          ctx.fillRect(ix + iw - pad - bw + 9 + tw + 1, cy + 7, 1.5, 10)
        }
        cy += 34
      }

      // ② 思考态：1.8s ~ 2.4s（三个点呼吸 + 状态字）
      if (t > 1800 && t < 2400) {
        for (let i = 0; i < 3; i++) {
          const ph = (t / 380 + i * 0.33) % 1
          ctx.globalAlpha = a * (0.35 + 0.65 * Math.abs(Math.sin(ph * Math.PI)))
          ctx.fillStyle = C.buddy
          ctx.beginPath()
          ctx.arc(ix + pad + 10 + i * 9, cy + 6, 2.4, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = a
        ctx.fillStyle = C.sub
        ctx.font = '10px system-ui, sans-serif'
        ctx.fillText('正在组织回答…', ix + pad + 44, cy + 6)
        cy += 24
      }

      // ③ 流式回答：2.4s 起逐字输出（左气泡 + Buddy 头像，\n 分段多行）
      if (t >= 2400) {
        const aShown = Math.floor((t - 2400) / TYPE_MS)
        const aText = A.slice(0, Math.min(A.length, aShown))
        ctx.font = '11px system-ui, sans-serif'
        const maxTextW = innerW - pad - 24 - 16 // 头像 24 + 气泡左右内边距，防右溢
        const lines = wrapText(ctx, aText, maxTextW)
        const bh = Math.max(24, lines.length * 16 + 12)
        // 头像
        ctx.fillStyle = C.buddy
        ctx.beginPath()
        ctx.arc(ix + pad + 9, cy + 12, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = '700 9px system-ui, sans-serif'
        ctx.fillText('B', ix + pad + 9 - 3, cy + 13)
        // 气泡
        ctx.font = '11px system-ui, sans-serif'
        rrect(ctx, ix + pad + 24, cy, maxTextW + 16, bh, 8)
        ctx.fillStyle = C.aiBubble
        ctx.fill()
        ctx.strokeStyle = C.border
        ctx.lineWidth = 1
        ctx.stroke()
        ctx.fillStyle = C.text
        lines.forEach((ln, i) => {
          ctx.fillText(ln, ix + pad + 32, cy + 14 + i * 16)
        })
        // 流式光标（输出未完时）
        if (aShown < A.length && this.caretOn(t)) {
          const last = lines[lines.length - 1] || ''
          const lw = ctx.measureText(last).width
          ctx.fillStyle = C.buddy
          ctx.fillRect(ix + pad + 32 + lw + 1, cy + 14 + (lines.length - 1) * 16 - 5, 1.5, 10)
        }
        cy += bh + 10

        // ④ 追问建议 chips：回答流完后逐个弹出（上浮 + 淡入，超宽自动换行）
        const aDoneAt = 2400 + A.length * TYPE_MS + 300
        if (t > aDoneAt) {
          ctx.font = '10px system-ui, sans-serif'
          let sx = ix + pad + 24
          const sx0 = sx
          let sy = cy
          SUGGESTS.forEach((s, i) => {
            const st = t - aDoneAt - i * 240
            if (st < 0) return
            const sa = clamp01(st / 200)
            ctx.globalAlpha = a * sa
            const tw = ctx.measureText(s).width
            // 超出内宽换行
            if (sx + tw + 18 > ix + iw - pad) {
              sx = sx0
              sy += 26
            }
            const dy = (1 - sa) * 5
            rrect(ctx, sx, sy + dy, tw + 18, 20, 10)
            ctx.fillStyle = 'rgba(255, 255, 255, 0.75)'
            ctx.fill()
            ctx.strokeStyle = 'rgba(116, 82, 232, 0.35)'
            ctx.lineWidth = 1
            ctx.stroke()
            ctx.fillStyle = C.buddy
            ctx.fillText(s, sx + 9, sy + dy + 10)
            sx += tw + 18 + 6
          })
        }
      }

      // 底部输入条
      this.inputBar(ctx, ix + pad, iy + ih - 38, innerW, a)
      ctx.globalAlpha = 1
    },
    // Deck：输入原始 JSON → 点「格式化」→ 逐行染色揭示
    drawDeck(ctx, x, y, w, h, t) {
      const a = this.curtain(t)
      if (a <= 0) return
      const ix = x
      const iy = y + 44
      const iw = w
      const ih = h - 44
      this.headerTag(ctx, ix + 6, iy - 34, C.deck, 'OmniDeck · 格式化', a)

      const pad = 12
      let cy = iy + 38

      // ① 输入区：0.6s 起逐字打出压缩 JSON（单行，超宽省略）
      const rShown = Math.floor(Math.max(0, t - 600) / 40)
      const rText = RAW.slice(0, Math.min(RAW.length, rShown))
      ctx.font = '10.5px "SF Mono", Menlo, Consolas, monospace'
      rrect(ctx, ix + pad, cy, iw - pad * 2, 22, 6)
      ctx.fillStyle = 'rgba(0,0,0,0.035)'
      ctx.fill()
      ctx.save()
      ctx.beginPath()
      ctx.rect(ix + pad + 2, cy, iw - pad * 2 - 4, 22)
      ctx.clip()
      ctx.fillStyle = C.sub
      ctx.textAlign = 'left'
      ctx.fillText(rText, ix + pad + 8, cy + 11)
      if (rShown < RAW.length && this.caretOn(t)) {
        const rw = ctx.measureText(rText).width
        ctx.fillStyle = C.deck
        ctx.fillRect(ix + pad + 8 + rw + 1, cy + 6, 1.5, 10)
      }
      ctx.restore()
      cy += 32

      // ② 「格式化」按钮：2.8s 起呼吸脉冲，3.1s 被"按下"（实心）
      if (t > 2800) {
        const pressed = t > 3100
        const pulse = pressed ? 0 : 0.5 + 0.5 * Math.sin(t / 180)
        ctx.fillStyle = pressed ? C.deck : `rgba(47, 98, 232, ${0.12 + 0.2 * pulse})`
        rrect(ctx, ix + pad, cy, 64, 20, 10)
        ctx.fill()
        if (!pressed) {
          ctx.strokeStyle = `rgba(47, 98, 232, ${0.4 + 0.5 * pulse})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
        ctx.fillStyle = pressed ? '#fff' : C.deck
        ctx.font = '600 10px system-ui, sans-serif'
        ctx.fillText('格式化', ix + pad + 18, cy + 10)
        cy += 30
      }

      // ③ 输出区：3.4s 起逐行揭示（每行 320ms，200ms 淡入 + 上移）
      if (t > 3400) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(ix + pad, cy, iw - pad * 2, ih - (cy - iy) - 46)
        ctx.clip()
        OUT.forEach((segs, i) => {
          const lt = t - 3400 - i * 320
          if (lt < 0) return
          const la = clamp01(lt / 200)
          const dy = (1 - la) * 6
          ctx.globalAlpha = a * la
          ctx.font = '10.5px "SF Mono", Menlo, Consolas, monospace'
          ctx.textAlign = 'left'
          let tx = ix + pad + 8
          segs.forEach(s => {
            ctx.fillStyle = s.c
            ctx.fillText(s.text, tx, cy + 12 + i * 16 + dy)
            tx += ctx.measureText(s.text).width
          })
        })
        ctx.restore()
        ctx.globalAlpha = a
      }

      // 底部状态条：格式化完 → ✓ 已格式化；后续「导出 Word」第二幕（按钮 → 正在导出 → ✓ 已导出）
      const doneAt = 3400 + OUT.length * 320 + 250
      if (t > doneAt) {
        const sa = clamp01((t - doneAt) / 220)
        ctx.globalAlpha = a * sa
        const pillW = 118
        const py = iy + ih - 36
        rrect(ctx, ix + pad, py, pillW, 20, 10)
        ctx.fillStyle = 'rgba(63, 155, 109, 0.12)'
        ctx.fill()
        ctx.fillStyle = C.green
        ctx.font = '600 10px system-ui, sans-serif'
        ctx.fillText('✓ 已格式化 · ' + OUT.length + ' 行', ix + pad + 12, py + 10)

        // 第二幕：导出按钮（doneAt+900 呼吸，+1300 按下）
        const expAt = doneAt + 900
        if (t > expAt) {
          const pressed = t > expAt + 400
          const pulse = pressed ? 0 : 0.5 + 0.5 * Math.sin(t / 180)
          const bx = ix + pad + pillW + 8
          ctx.fillStyle = pressed ? C.green : `rgba(63, 155, 109, ${0.12 + 0.2 * pulse})`
          rrect(ctx, bx, py, 78, 20, 10)
          ctx.fill()
          if (!pressed) {
            ctx.strokeStyle = `rgba(63, 155, 109, ${0.4 + 0.5 * pulse})`
            ctx.lineWidth = 1
            ctx.stroke()
          }
          ctx.fillStyle = pressed ? '#fff' : C.green
          ctx.font = '600 10px system-ui, sans-serif'
          ctx.fillText('导出 Word', bx + 17, py + 10)

          // 按下后：状态条演进「正在导出…」→「✓ 已导出 overview.docx」
          if (pressed) {
            const exported = t > expAt + 1300
            const ea = clamp01((t - expAt - 400) / 200)
            ctx.globalAlpha = a * sa * ea
            ctx.fillStyle = exported ? C.green : C.deck
            ctx.font = '600 10px system-ui, sans-serif'
            ctx.fillText(exported ? '✓ 已导出 overview.docx' : '正在导出…', bx, py - 12)
          }
        }
      }
      ctx.globalAlpha = 1
    }
  }
}
</script>

<style lang="scss" scoped>
.theater-cv {
  display: block;
  width: 100%;
  height: 100%;
}
</style>
