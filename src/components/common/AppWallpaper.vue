<template>
  <!-- 全局背景壁纸层：fixed 垫底，双层交叉淡入切换（视频走 video，图/GIF 走 img） -->
  <div v-if="visible" class="app-wallpaper" aria-hidden="true">
    <!-- 底层：旧壁纸（淡出侧） -->
    <div class="wp-layer wp-under" :style="underStyle">
      <video v-if="underIsVideo" :key="'uv-' + underId" :src="underUrl" muted autoplay loop playsinline></video>
      <img v-else-if="underUrl" :key="'ui-' + underId" :src="underUrl" alt="" />
    </div>
    <!-- 上层：当前壁纸（淡入侧） -->
    <div class="wp-layer wp-over" :style="overStyle">
      <video v-if="overIsVideo" :key="'ov-' + overId" :src="overUrl" muted autoplay loop playsinline></video>
      <img v-else-if="overUrl" :key="'oi-' + overId" :src="overUrl" alt="" />
    </div>
    <!-- 遮罩：压暗背景，保证前景可读性 -->
    <div class="wp-dim" :style="dimStyle"></div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onBeforeUnmount } from 'vue'
import { useStore } from 'vuex'
import { dimLevels, carouselIntervals, isVideoItem } from '@/utils/wallpaper/wallpaper'

defineOptions({ name: 'AppWallpaper' })

const store = useStore()

// Blob → ObjectURL 缓存（按壁纸 id，切换时释放旧 URL）
const urlCache = {}

function getUrl(item) {
  if (!item || !item.blob) return ''
  if (!urlCache[item.id]) {
    try {
      urlCache[item.id] = URL.createObjectURL(item.blob)
    } catch (e) {
      return ''
    }
  }
  return urlCache[item.id]
}

// 双层状态：over 为当前显示层
const overId = ref('')
const underId = ref('')
let fadeTimer = null
let carouselTimer = null

const config = computed(() => store.state.wallpaperConfig)
const list = computed(() => store.state.wallpaperList)
const visible = computed(() => config.value.enabled && list.value.length > 0 && !!overId.value)
const overItem = computed(() => list.value.find(w => w && w.id === overId.value) || null)
const underItem = computed(() => list.value.find(w => w && w.id === underId.value) || null)
const overUrl = computed(() => getUrl(overItem.value))
const underUrl = computed(() => getUrl(underItem.value))
const overIsVideo = computed(() => isVideoItem(overItem.value))
const underIsVideo = computed(() => isVideoItem(underItem.value))

// 柔化：壁纸自身模糊 + 轻微放大遮住模糊边缘；常规模式微增饱和/对比，画面更清晰鲜明
const layerFilter = computed(() => (config.value.soft ? 'blur(18px) saturate(1.1)' : 'saturate(1.06) contrast(1.04)'))
const layerScale = computed(() => (config.value.soft ? 'scale(1.06)' : 'none'))
const overStyle = computed(() => ({ filter: layerFilter.value, transform: layerScale.value }))
const underStyle = computed(() => ({ filter: layerFilter.value, transform: layerScale.value }))
const dimStyle = computed(() => {
  const v = dimLevels[config.value.dim] || 0
  return { background: 'rgba(0, 0, 0, ' + v + ')' }
})

// 选中项变化：旧壁纸放到底层，新壁纸在上层淡入（约 0.7s 交叉过渡）
watch(() => config.value.selectedId, id => {
  if (!id || !list.value.some(w => w && w.id === id)) {
    underId.value = overId.value
    overId.value = ''
    return
  }
  if (id === overId.value) return
  underId.value = overId.value
  overId.value = id
}, { immediate: true })

// 轮播间隔变化：重建定时器
watch(() => config.value.carousel, () => {
  setupCarousel()
}, { immediate: true })

// 总开关/列表变化：关闭时释放资源
watch(() => config.value.enabled, on => {
  if (!on) teardown()
  else setupCarousel()
})

watch(list, () => {
  if (!config.value.enabled) return
  // 列表变动后校验当前选中是否仍存在
  const cur = config.value.selectedId
  if (cur && !list.value.some(w => w && w.id === cur)) {
    overId.value = list.value.length ? list.value[0].id : ''
    underId.value = ''
  }
  setupCarousel()
})

function setupCarousel() {
  clearTimeout(carouselTimer)
  const ms = carouselIntervals[config.value.carousel] || 0
  if (!config.value.enabled || !ms || list.value.length < 2) return
  const tick = () => {
    nextWallpaper()
    carouselTimer = setTimeout(tick, ms)
  }
  carouselTimer = setTimeout(tick, ms)
}

function nextWallpaper() {
  const l = list.value
  if (!l.length) return
  const i = l.findIndex(w => w && w.id === overId.value)
  const next = l[(i + 1 + l.length) % l.length]
  if (next && next.id !== overId.value) {
    store.commit('SET_WALLPAPER_CONFIG', { selectedId: next.id })
  }
}

function teardown() {
  clearTimeout(carouselTimer)
  clearTimeout(fadeTimer)
}

onBeforeUnmount(() => {
  teardown()
})
</script>

<style lang="scss" scoped>
.app-wallpaper {
  position: fixed;
  inset: 0;
  /* 负层级垫底：画在所有界面内容之下、html 背景之上（html/body/#app 均无背景色） */
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background: transparent;
}

.wp-layer {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;

  img,
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

/* 上层默认淡入完成态；切换由 selectedId 变更触发重建（key 变化 → 新元素 0→1 过渡） */
.wp-over {
  animation: wp-fade-in 0.7s ease both;
}

.wp-under {
  opacity: 1;
}

.wp-dim {
  position: absolute;
  inset: 0;
  transition: background 0.4s ease;
}

@keyframes wp-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
</style>

<style lang="scss">
/* 减弱动态效果：壁纸切换不过渡（html.reduce-motion 在组件外，需非 scoped 规则） */
.reduce-motion .wp-over {
  animation: none;
}
</style>
