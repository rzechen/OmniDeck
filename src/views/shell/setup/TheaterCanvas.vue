<template>
  <canvas ref="cv" class="theater-cv" />
</template>

<script>
// 装配等待小剧场（canvas）：等待期不枯燥，循环演示两大产品的招牌能力——
// 左 OmniBuddy：用户提问逐字打出 → 思考点 → 流式输出回答（打字机 + 光标）
// 右 OmniDeck ：输入一串原始 JSON → 点「格式化」→ 逐行揭示彩色格式化结果
// 12s 一轮，两窗同拍淡入淡出；组件仅在装配步挂载，卸载即停 raf。
const CYCLE = 12000

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

const Q = '帮我把调研整理成要点'
const A = '已完成，共 3 部分：① 市场概况 ② 竞品对比 ③ 风险与建议。'
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

// 简易中文换行（按宽度逐字累加）
function wrapText(ctx, text, maxWidth) {
  const lines = []
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line)
      line = ch
    } else {
      line += ch
    }
  }
  if (line) lines.push(line)
  return lines
}

export default {
  name: 'SetupTheaterCanvas',
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
      const gap = 14
      const cw = (this.cssW - gap) / 2
      this.drawBuddy(ctx, 0, 0, cw, this.cssH, t)
      this.drawDeck(ctx, cw + gap, 0, cw, this.cssH, t)
    },
    // 卡片底座：白卡 + 标题栏（dot + 名字）
    card(ctx, x, y, w, h, dot, name, alpha) {
      ctx.globalAlpha = alpha
      rrect(ctx, x, y, w, h, 12)
      ctx.fillStyle = '#fff'
      ctx.fill()
      ctx.strokeStyle = C.border
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.fillStyle = dot
      rrect(ctx, x + 12, y + 10, 7, 7, 2)
      ctx.fill()
      ctx.fillStyle = C.sub
      ctx.font = '600 10px system-ui, sans-serif'
      ctx.textBaseline = 'middle'
      ctx.textAlign = 'left'
      ctx.fillText(name, x + 25, y + 14)
    },
    // 左：Buddy 问答（打字提问 → 思考点 → 流式回答）
    drawBuddy(ctx, x, y, w, h, t) {
      const a = this.curtain(t)
      if (a <= 0) return
      this.card(ctx, x, y, w, h, C.buddy, 'OmniBuddy · 问答', a)

      const pad = 12
      const innerW = w - pad * 2
      let cy = y + 36

      // ① 用户提问：0.5s 起逐字打出（右对齐气泡）
      const qShown = Math.floor(Math.max(0, t - 500) / 85)
      const qText = Q.slice(0, Math.min(Q.length, qShown))
      if (qText || t > 500) {
        ctx.font = '11px system-ui, sans-serif'
        const fullW = ctx.measureText(Q).width + 18
        const bw = Math.min(fullW, innerW)
        rrect(ctx, x + w - pad - bw, cy, bw, 24, 8)
        ctx.fillStyle = C.userBubble
        ctx.fill()
        ctx.fillStyle = C.text
        ctx.textAlign = 'left'
        ctx.fillText(qText, x + w - pad - bw + 9, cy + 12)
        if (qShown < Q.length && this.caretOn(t)) {
          const tw = ctx.measureText(qText).width
          ctx.fillRect(x + w - pad - bw + 9 + tw + 1, cy + 7, 1.5, 10)
        }
        cy += 32
      }

      // ② 思考点：1.8s ~ 2.4s（三个点呼吸）
      if (t > 1800 && t < 2400) {
        for (let i = 0; i < 3; i++) {
          const ph = (t / 380 + i * 0.33) % 1
          ctx.globalAlpha = a * (0.35 + 0.65 * Math.abs(Math.sin(ph * Math.PI)))
          ctx.fillStyle = C.buddy
          ctx.beginPath()
          ctx.arc(x + pad + 10 + i * 9, cy + 6, 2.4, 0, Math.PI * 2)
          ctx.fill()
        }
        ctx.globalAlpha = a
        cy += 18
      }

      // ③ 流式回答：2.4s 起逐字输出（左气泡 + Buddy 头像）
      if (t >= 2400) {
        const aShown = Math.floor((t - 2400) / 90)
        const aText = A.slice(0, Math.min(A.length, aShown))
        ctx.font = '11px system-ui, sans-serif'
        const maxTextW = innerW - 40
        const lines = wrapText(ctx, aText, maxTextW)
        const bh = Math.max(24, lines.length * 16 + 12)
        // 头像
        ctx.fillStyle = C.buddy
        ctx.beginPath()
        ctx.arc(x + pad + 9, cy + 12, 9, 0, Math.PI * 2)
        ctx.fill()
        ctx.fillStyle = '#fff'
        ctx.font = '700 9px system-ui, sans-serif'
        ctx.fillText('B', x + pad + 9 - 3, cy + 13)
        // 气泡
        ctx.font = '11px system-ui, sans-serif'
        rrect(ctx, x + pad + 24, cy, maxTextW + 16, bh, 8)
        ctx.fillStyle = C.aiBubble
        ctx.fill()
        ctx.fillStyle = C.text
        lines.forEach((ln, i) => {
          ctx.fillText(ln, x + pad + 32, cy + 14 + i * 16)
        })
        // 流式光标（输出未完时）
        if (aShown < A.length && this.caretOn(t)) {
          const last = lines[lines.length - 1] || ''
          const lw = ctx.measureText(last).width
          ctx.fillStyle = C.buddy
          ctx.fillRect(x + pad + 32 + lw + 1, cy + 14 + (lines.length - 1) * 16 - 5, 1.5, 10)
        }
      }
      ctx.globalAlpha = 1
    },
    // 右：Deck 格式化（输入原始 JSON → 点「格式化」→ 逐行染色揭示）
    drawDeck(ctx, x, y, w, h, t) {
      const a = this.curtain(t)
      if (a <= 0) return
      this.card(ctx, x, y, w, h, C.deck, 'OmniDeck · 格式化', a)

      const pad = 12
      let cy = y + 32

      // ① 输入区：0.6s 起逐字打出压缩 JSON（单行，超宽省略）
      const rShown = Math.floor(Math.max(0, t - 600) / 40)
      const rText = RAW.slice(0, Math.min(RAW.length, rShown))
      ctx.font = '10.5px "SF Mono", Menlo, Consolas, monospace'
      rrect(ctx, x + pad, cy, w - pad * 2, 22, 6)
      ctx.fillStyle = 'rgba(0,0,0,0.035)'
      ctx.fill()
      ctx.save()
      ctx.beginPath()
      ctx.rect(x + pad + 2, cy, w - pad * 2 - 4, 22)
      ctx.clip()
      ctx.fillStyle = C.sub
      ctx.textAlign = 'left'
      ctx.fillText(rText, x + pad + 8, cy + 11)
      if (rShown < RAW.length && this.caretOn(t)) {
        const rw = ctx.measureText(rText).width
        ctx.fillStyle = C.deck
        ctx.fillRect(x + pad + 8 + rw + 1, cy + 6, 1.5, 10)
      }
      ctx.restore()
      cy += 32

      // ② 「格式化」按钮：2.8s 起呼吸脉冲，3.1s 被"按下"（实心）
      if (t > 2800) {
        const pressed = t > 3100
        const pulse = pressed ? 0 : 0.5 + 0.5 * Math.sin(t / 180)
        ctx.fillStyle = pressed ? C.deck : `rgba(47, 98, 232, ${0.12 + 0.2 * pulse})`
        rrect(ctx, x + pad, cy, 64, 20, 10)
        ctx.fill()
        if (!pressed) {
          ctx.strokeStyle = `rgba(47, 98, 232, ${0.4 + 0.5 * pulse})`
          ctx.lineWidth = 1
          ctx.stroke()
        }
        ctx.fillStyle = pressed ? '#fff' : C.deck
        ctx.font = '600 10px system-ui, sans-serif'
        ctx.fillText('格式化', x + pad + 18, cy + 10)
        cy += 30
      }

      // ③ 输出区：3.4s 起逐行揭示（每行 320ms，200ms 淡入 + 上移）
      if (t > 3400) {
        ctx.save()
        ctx.beginPath()
        ctx.rect(x + pad, cy, w - pad * 2, h - (cy - y) - pad)
        ctx.clip()
        OUT.forEach((segs, i) => {
          const lt = t - 3400 - i * 320
          if (lt < 0) return
          const la = clamp01(lt / 200)
          const dy = (1 - la) * 6
          ctx.globalAlpha = a * la
          ctx.font = '10.5px "SF Mono", Menlo, Consolas, monospace'
          ctx.textAlign = 'left'
          let tx = x + pad + 8
          segs.forEach(s => {
            ctx.fillStyle = s.c
            ctx.fillText(s.text, tx, cy + 12 + i * 16 + dy)
            tx += ctx.measureText(s.text).width
          })
        })
        ctx.restore()
        ctx.globalAlpha = 1
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
  height: 180px;
}
</style>
