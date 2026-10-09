<template>
  <transition name="applock">
    <div v-if="locked" class="applock-overlay">
      <div class="applock-card" :class="{ shake: failedShake }">
        <!-- 创意吉祥物：瞳孔跟随鼠标 / 随机眨眼 / 输入密码时闭眼「不看」/ 失败 >< -->
        <div ref="mascot" class="applock-mascot" :class="mascotClass">
          <div class="mascot-eye">
            <div class="eye-ball">
              <div class="eye-pupil" :style="pupilStyle"><span class="eye-glint"></span></div>
            </div>
            <span class="eye-lid"></span>
            <span class="eye-x x1"></span>
            <span class="eye-x x2"></span>
          </div>
          <div class="mascot-eye">
            <div class="eye-ball">
              <div class="eye-pupil" :style="pupilStyle"><span class="eye-glint"></span></div>
            </div>
            <span class="eye-lid"></span>
            <span class="eye-x x1"></span>
            <span class="eye-x x2"></span>
          </div>
          <span class="mascot-mouth"></span>
          <span class="mascot-blush blush-l"></span>
          <span class="mascot-blush blush-r"></span>
        </div>

        <h2 class="applock-title">OmniDeck 已锁定</h2>
        <p class="applock-desc">{{ descText }}</p>

        <!-- 优先：触控 ID 解锁 -->
        <div v-if="biometricReady && !showPwdForm" class="applock-form">
          <button class="applock-btn applock-bio-main" :disabled="bioVerifying" @click="unlockBiometric">
            <svg viewBox="0 0 24 24" class="bio-main-svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M12 11V7a2 2 0 0 1 4 0v4" />
              <path d="M16 12v1a2 2 0 0 0 4 0v-3a8 8 0 1 0-16 0v3" />
              <path d="M8 21v-4" />
              <path d="M12 21v-5a2 2 0 0 1 4 0v3" />
            </svg>
            <span>{{ bioVerifying ? '等待触控 ID…' : '触控 ID 解锁' }}</span>
          </button>
          <button class="applock-pwd-toggle" @click="expandPwdForm">改用密码解锁</button>
        </div>

        <!-- 密码解锁 -->
        <div v-if="showPwdForm" class="applock-form">
          <div class="applock-input-wrap">
            <svg-icon icon-class="key" class-name="applock-input-icon" />
            <input
              ref="pwdInput"
              v-model="password"
              :type="showPwd ? 'text' : 'password'"
              class="applock-input"
              placeholder="应用密码"
              @focus="pwdFocused = true"
              @blur="pwdFocused = false"
              @keydown.enter="unlock"
            />
            <i
              class="applock-eye"
              :class="showPwd ? 'view' : 'hide'"
              @click="showPwd = !showPwd"
            ></i>
          </div>
          <button class="applock-btn" :disabled="verifying || !password" @click="unlock">
            {{ verifying ? '验证中…' : '解锁' }}
          </button>
          <button v-if="biometricReady" class="applock-bio-btn" @click="unlockBiometric">
            <svg viewBox="0 0 24 24" class="applock-bio-svg" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
              <path d="M12 11V7a2 2 0 0 1 4 0v4" />
              <path d="M16 12v1a2 2 0 0 0 4 0v-3a8 8 0 1 0-16 0v3" />
              <path d="M8 21v-4" />
              <path d="M12 21v-5a2 2 0 0 1 4 0v3" />
            </svg>
            <span>触控 ID 解锁</span>
          </button>
        </div>

        <p v-if="failCount > 0" class="applock-fail">密码不正确，请重试（{{ failCount }}）</p>
      </div>
    </div>
  </transition>
</template>

<script setup>
// 应用锁定：全屏遮罩（触控 ID 优先 / 密码解锁）
// 创意吉祥物：瞳孔跟随鼠标、随机眨眼、输入密码时闭眼「不看」、失败 ><
// 自动锁定策略：闲置计时 + 窗口失活计时 + 系统锁屏联动
import { ref, reactive, computed, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { bus } from '@/utils/ui/bus'
import { useFeedback } from '@/composables/useFeedback'
import { getItem } from '@/utils/storage/db'
import { getShortcut, matchesShortcut } from '@/utils/ui/shortcuts'

defineOptions({ name: 'AppLock' })

const { message } = useFeedback()

const locked = ref(false)
const password = ref('')
const showPwd = ref(false)
const verifying = ref(false)
const failedShake = ref(false)
const failCount = ref(0)
const hasPassword = ref(false)
const biometricAvailable = ref(false)
const biometricEnabled = ref(false)
const autoLock = ref(0) // 分钟，0 = 关闭
// 触控 ID 优先
const showPwdForm = ref(false) // 触控 ID 可用时密码表单默认收起
const bioVerifying = ref(false)
let autoBioTimer = null
// 吉祥物眼睛
const mascot = ref(null)
const pwdInput = ref(null)
const pupil = reactive({ x: 0, y: 0 })
const blinking = ref(false)
const pwdFocused = ref(false)
let blinkTimer = null
let blinkTimer2 = null
const noMotion = ref(false)
let motionObserver = null
// 自动锁定计时
let lastActive = 0
let blurredAt = 0
let timer = null
let offSystemLocked = null

const biometricReady = computed(() => biometricAvailable.value && biometricEnabled.value)

// 输入密码时闭眼——「我不看」
const eyeCovered = computed(() => pwdFocused.value || password.value.length > 0)

const mascotClass = computed(() => ({
  'is-blink': blinking.value,
  'is-cover': eyeCovered.value,
  'is-fail': failedShake.value,
  'is-wait': bioVerifying.value,
  'no-motion': noMotion.value
}))

const pupilStyle = computed(() => {
  // 等待触控 ID：瞳孔期待地向上看
  if (bioVerifying.value) return { transform: 'translate(0px, -2.5px) scale(1.06)' }
  return { transform: `translate(${pupil.x}px, ${pupil.y}px)` }
})

const descText = computed(() => {
  if (biometricReady.value && !showPwdForm.value) {
    return bioVerifying.value ? '正在等待触控 ID 验证…' : '使用触控 ID 解锁，或改用密码'
  }
  return '输入应用密码以解锁'
})

// 应用最新锁定偏好（设置页改动即时生效）
async function applySettings() {
  const settings = getItem('appLockSettings', null) || {}
  const al = Number(settings.autoLock) || 0
  biometricEnabled.value = !!settings.biometric
  // 密码可能已被设置页设置/清除，同步最新状态（快捷键锁定依赖）
  const api = window.electronAPI && window.electronAPI.appLock
  if (api) hasPassword.value = await api.hasPassword()
  if (al !== autoLock.value) {
    autoLock.value = al
    stopIdleWatch()
    if (al > 0) startIdleWatch()
  }
}

function stopIdleWatch() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  ;['mousemove', 'keydown', 'mousedown', 'wheel'].forEach(ev => {
    window.removeEventListener(ev, markActive)
  })
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('focus', onFocus)
}

// ===== 锁定/解锁 =====
function lock() {
  if (locked.value) return
  // 未设置密码时不可锁定（否则无法解锁）
  if (!hasPassword.value) return
  locked.value = true
  password.value = ''
  failCount.value = 0
  pwdFocused.value = false
  pupil.x = 0
  pupil.y = 0
  // 触控 ID 可用 → 密码表单收起，优先触控 ID
  showPwdForm.value = !biometricReady.value
  nextTick(() => {
    if (biometricReady.value) {
      // 优先触控 ID：稍候自动唤起系统 Touch ID（避开入场动画）
      clearTimeout(autoBioTimer)
      autoBioTimer = setTimeout(() => {
        unlockBiometric()
      }, 500)
    } else if (pwdInput.value) {
      pwdInput.value.focus()
    }
  })
}

function expandPwdForm() {
  clearTimeout(autoBioTimer)
  autoBioTimer = null
  showPwdForm.value = true
  nextTick(() => {
    if (pwdInput.value) pwdInput.value.focus()
  })
}

async function unlock() {
  const api = window.electronAPI && window.electronAPI.appLock
  if (!api || !password.value || verifying.value) return
  verifying.value = true
  try {
    const res = await api.verify(password.value)
    if (res && res.ok) {
      locked.value = false
      failCount.value = 0
      markActive()
    } else {
      failCount.value++
      failedShake.value = true
      setTimeout(() => {
        failedShake.value = false
      }, 500)
      password.value = ''
    }
  } finally {
    verifying.value = false
  }
}

async function unlockBiometric() {
  const api = window.electronAPI && window.electronAPI.appLock
  if (!api || !locked.value || bioVerifying.value) return
  bioVerifying.value = true
  try {
    const res = await api.biometricVerify()
    if (res && res.ok && locked.value) {
      locked.value = false
      failCount.value = 0
      markActive()
    } else if (locked.value) {
      // 用户取消 / 验证失败 → 回退到密码输入
      showPwdForm.value = true
      nextTick(() => {
        if (pwdInput.value) pwdInput.value.focus()
      })
    }
  } finally {
    bioVerifying.value = false
  }
}

// ===== 吉祥物眼睛 =====
// 瞳孔朝向鼠标位置（在眼眶内小幅移动）
function onEyeMove(e) {
  if (!locked.value) return
  const el = mascot.value
  if (!el) return
  const rect = el.getBoundingClientRect()
  if (!rect.width) return
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const dx = e.clientX - cx
  const dy = e.clientY - cy
  const dist = Math.hypot(dx, dy) || 1
  const r = 3.4
  pupil.x = (dx / dist) * r
  pupil.y = (dy / dist) * r
}

// 随机间隔眨眼（「减弱动态效果」开启时不眨）
function scheduleBlink() {
  clearTimeout(blinkTimer)
  if (noMotion.value) return
  blinkTimer = setTimeout(() => {
    blinking.value = true
    clearTimeout(blinkTimer2)
    blinkTimer2 = setTimeout(() => {
      blinking.value = false
      scheduleBlink()
    }, 150)
  }, 2800 + Math.random() * 3400)
}

// 全局快捷键：可配置（默认 ⌘⌥L / Ctrl+Alt+L），设置页可改键
function onLockHotkey(e) {
  if (locked.value) return
  if (matchesShortcut(e, getShortcut('lock'))) {
    e.preventDefault()
    if (!hasPassword.value) {
      message.warning('请先在 设置 → 安全 中设置应用密码')
      return
    }
    lock()
  }
}

// ===== 自动锁定（闲置 + 失活） =====
function startIdleWatch() {
  lastActive = Date.now()
  ;['mousemove', 'keydown', 'mousedown', 'wheel'].forEach(ev => {
    window.addEventListener(ev, markActive, { passive: true })
  })
  window.addEventListener('blur', onBlur)
  window.addEventListener('focus', onFocus)
  timer = setInterval(checkIdle, 10000)
}

function markActive() {
  lastActive = Date.now()
}

function onBlur() {
  blurredAt = Date.now()
}

function onFocus() {
  // 失活期间超过阈值：回前台立即锁定
  if (blurredAt && autoLock.value > 0 && Date.now() - blurredAt >= autoLock.value * 60000) {
    lock()
  }
  blurredAt = 0
  markActive()
}

function checkIdle() {
  if (locked.value || autoLock.value <= 0) return
  if (Date.now() - lastActive >= autoLock.value * 60000) {
    lock()
  }
}

// 供设置页「立即锁定」调用
function lockNow() {
  lock()
}

onMounted(async () => {
  const api = window.electronAPI && window.electronAPI.appLock
  if (!api) return

  // 读取设置（IndexedDB）
  applySettings()

  hasPassword.value = await api.hasPassword()
  biometricAvailable.value = await api.biometricSupported()

  // 已设置密码：启动即锁定
  if (hasPassword.value) {
    lock()
  }

  // 系统（macOS）锁屏 → 立即锁定
  offSystemLocked = api.onSystemLocked(() => {
    if (autoLock.value > 0) lock()
  })

  // 设置页改动自动锁定偏好 → 即时生效
  bus.on('app-lock:settings-changed', applySettings)
  // 设置页「立即锁定」
  bus.on('app-lock:lock-now', lockNow)

  // 眼睛：跟随鼠标 + 随机眨眼
  window.addEventListener('mousemove', onEyeMove, { passive: true })
  scheduleBlink()

  // 全局快捷键：可配置（默认 ⌘O+L / Ctrl+O+L）立即锁定应用
  window.addEventListener('keydown', onLockHotkey)

  // 「减弱动态效果」开关（html.reduce-motion）实时同步
  noMotion.value = document.documentElement.classList.contains('reduce-motion')
  motionObserver = new MutationObserver(() => {
    noMotion.value = document.documentElement.classList.contains('reduce-motion')
  })
  motionObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
})

onBeforeUnmount(() => {
  if (timer) clearInterval(timer)
  if (offSystemLocked) offSystemLocked()
  clearTimeout(autoBioTimer)
  clearTimeout(blinkTimer)
  clearTimeout(blinkTimer2)
  if (motionObserver) motionObserver.disconnect()
  window.removeEventListener('mousemove', onEyeMove)
  window.removeEventListener('keydown', onLockHotkey)
  bus.off('app-lock:settings-changed', applySettings)
  bus.off('app-lock:lock-now', lockNow)
  ;['mousemove', 'keydown', 'mousedown', 'wheel'].forEach(ev => {
    window.removeEventListener(ev, markActive)
  })
  window.removeEventListener('blur', onBlur)
  window.removeEventListener('focus', onFocus)
})
</script>

<style lang="scss" scoped>
.applock-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(28, 28, 34, 0.62);
  backdrop-filter: blur(28px) saturate(1.3);
  -webkit-backdrop-filter: blur(28px) saturate(1.3);
  -webkit-app-region: no-drag;
}

.applock-card {
  width: 340px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 30px 30px 28px;
  border-radius: 22px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.22);
  box-shadow: 0 30px 80px rgba(0, 0, 0, 0.4);

  &.shake {
    animation: applock-shake 0.45s ease;
  }
}

@keyframes applock-shake {
  0%, 100% { transform: translateX(0); }
  20% { transform: translateX(-9px); }
  40% { transform: translateX(8px); }
  60% { transform: translateX(-6px); }
  80% { transform: translateX(4px); }
}

/* ===== 创意吉祥物（两只眼睛 + 嘴） ===== */
.applock-mascot {
  position: relative;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: 20px;
  width: 100px;
  height: 52px;
}

.mascot-eye {
  position: relative;
  width: 40px;
  height: 30px;
}

/* 眼眶：白色椭圆 */
.eye-ball {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.96);
  box-shadow: inset 0 -2px 5px rgba(0, 0, 0, 0.05);
  overflow: hidden;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.1s ease;
}

/* 瞳孔：跟随鼠标 */
.eye-pupil {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  background: #26262E;
  position: relative;
  transition: transform 0.09s ease-out;
}

.eye-glint {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 3.5px;
  height: 3.5px;
  border-radius: 50%;
  background: #fff;
}

/* 眨眼 / 闭眼：眼球快速塌陷成线 */
.is-blink .eye-ball,
.is-cover .eye-ball {
  transform: scaleY(0.09);
  transition-duration: 0.07s;
}

/* 闭眼弧线（输入密码时「我不看」） */
.eye-lid {
  position: absolute;
  left: 5px;
  right: 5px;
  top: 9px;
  height: 12px;
  border-bottom: 2.5px solid rgba(255, 255, 255, 0.92);
  border-radius: 0 0 20px 20px;
  opacity: 0;
  transition: opacity 0.14s ease;
  pointer-events: none;
}

.is-cover .eye-lid {
  opacity: 1;
}

/* 等待触控 ID：眯眼期待 */
.is-wait .eye-ball {
  transform: scaleY(0.8);
}

/* 失败：>_< */
.eye-x {
  display: none;
  position: absolute;
  left: 50%;
  top: 50%;
  width: 16px;
  height: 2.5px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.92);
}

.eye-x.x1 { transform: translate(-50%, -50%) rotate(45deg); }
.eye-x.x2 { transform: translate(-50%, -50%) rotate(-45deg); }

.is-fail {
  .eye-ball,
  .eye-lid {
    display: none;
  }

  .eye-x {
    display: block;
  }
}

/* 嘴：默认微笑，失败时撇嘴，等待触控 ID 时变 o 形 */
.mascot-mouth {
  position: absolute;
  left: 50%;
  bottom: 2px;
  width: 16px;
  height: 8px;
  transform: translateX(-50%);
  border: 2px solid rgba(255, 255, 255, 0.78);
  border-top: none;
  border-left-color: transparent;
  border-right-color: transparent;
  border-radius: 0 0 16px 16px;
  transition: all 0.15s ease;
}

.is-fail .mascot-mouth {
  height: 7px;
  border: 2px solid rgba(255, 255, 255, 0.78);
  border-bottom: none;
  border-left-color: transparent;
  border-right-color: transparent;
  border-radius: 16px 16px 0 0;
}

.is-wait .mascot-mouth {
  width: 8px;
  height: 8px;
  border: 2px solid rgba(255, 255, 255, 0.78);
  border-radius: 50%;
}

/* 闭眼时的害羞红晕 */
.mascot-blush {
  position: absolute;
  top: 24px;
  width: 14px;
  height: 6px;
  border-radius: 50%;
  background: rgba(255, 132, 132, 0.38);
  filter: blur(0.5px);
  opacity: 0;
  transition: opacity 0.2s ease;
  pointer-events: none;
}

.blush-l { left: -8px; }
.blush-r { right: -8px; }

.is-cover .mascot-blush {
  opacity: 1;
}

/* 「减弱动态效果」：关闭装饰性过渡 */
.no-motion {
  .eye-pupil,
  .eye-ball,
  .eye-lid,
  .mascot-mouth {
    transition: none;
  }
}

.applock-title {
  margin-top: 12px;
  font-size: 17px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.4px;
}

.applock-desc {
  margin-top: 5px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
  min-height: 17px;
}

.applock-form {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 20px;
}

.applock-input-wrap {
  position: relative;
  display: flex;
  align-items: center;

  .applock-input-icon {
    position: absolute;
    left: 12px;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.55);
    pointer-events: none;
  }

  .applock-eye {
    position: absolute;
    right: 12px;
    font-size: 14px;
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;

    &:hover {
      color: #fff;
    }
  }
}

.applock-input {
  width: 100%;
  height: 38px;
  padding: 0 36px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.28);
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  font-size: 13.5px;
  outline: none;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;

  &::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  &:focus {
    border-color: rgba(255, 255, 255, 0.6);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.12);
  }
}

.applock-btn {
  height: 38px;
  border: none;
  border-radius: 12px;
  background: #fff;
  color: #1C1C22;
  font-size: 13.5px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, opacity 0.15s ease;

  &:hover:not(:disabled) {
    transform: translateY(-1px);
  }

  &:active:not(:disabled) {
    transform: scale(0.97);
  }

  &:disabled {
    opacity: 0.55;
    cursor: default;
  }
}

/* 触控 ID 主按钮（可用时的首选解锁方式） */
.applock-bio-main {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;

  .bio-main-svg {
    width: 17px;
    height: 17px;
  }
}

/* 「改用密码解锁」次选入口 */
.applock-pwd-toggle {
  height: 26px;
  border: none;
  background: none;
  color: rgba(255, 255, 255, 0.55);
  font-size: 11.5px;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: color 0.15s ease;

  &:hover {
    color: rgba(255, 255, 255, 0.95);
  }
}

.applock-bio-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  height: 32px;
  padding: 0 16px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.3);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.9);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;

  .applock-bio-svg {
    width: 15px;
    height: 15px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.16);
  }

  &:active {
    transform: scale(0.96);
  }
}

.applock-fail {
  margin-top: 12px;
  font-size: 11.5px;
  color: #FF9F9F;
}

/* 过渡 */
.applock-enter-active {
  transition: opacity 0.25s ease;

  .applock-card {
    transition: transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1);
  }
}

.applock-leave-active {
  transition: opacity 0.2s ease;

  .applock-card {
    transition: transform 0.2s ease;
  }
}

.applock-enter,
.applock-leave-to {
  opacity: 0;

  .applock-card {
    transform: scale(0.94) translateY(12px);
  }
}
</style>

<style lang="scss">
/* 壁纸模式：锁屏改为轻雾遮罩，壁纸清晰呈现（白字/卡片仍可读）。
   scoped 规则选不中 html 根节点，需全局样式块 */
html[data-wallpaper='on'] .applock-overlay {
  background: rgba(16, 16, 22, 0.32);
  backdrop-filter: blur(5px) saturate(1.2);
  -webkit-backdrop-filter: blur(5px) saturate(1.2);
}
</style>
