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

<script>
import { dimLevels, carouselIntervals, isVideoItem } from '@/utils/wallpaper'

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

export default {
  name: 'AppWallpaper',
  data() {
    return {
      // 双层状态：over 为当前显示层
      overId: '',
      underId: '',
      fadeTimer: null,
      carouselTimer: null
    }
  },
  computed: {
    config() {
      return this.$store.state.wallpaperConfig
    },
    list() {
      return this.$store.state.wallpaperList
    },
    visible() {
      return this.config.enabled && this.list.length > 0 && !!this.overId
    },
    overItem() {
      return this.list.find(w => w && w.id === this.overId) || null
    },
    underItem() {
      return this.list.find(w => w && w.id === this.underId) || null
    },
    overUrl() {
      return getUrl(this.overItem)
    },
    underUrl() {
      return getUrl(this.underItem)
    },
    overIsVideo() {
      return isVideoItem(this.overItem)
    },
    underIsVideo() {
      return isVideoItem(this.underItem)
    },
    // 柔化：壁纸自身模糊 + 轻微放大遮住模糊边缘；常规模式微增饱和/对比，画面更清晰鲜明
    layerFilter() {
      return this.config.soft ? 'blur(18px) saturate(1.1)' : 'saturate(1.06) contrast(1.04)'
    },
    layerScale() {
      return this.config.soft ? 'scale(1.06)' : 'none'
    },
    overStyle() {
      return { filter: this.layerFilter, transform: this.layerScale }
    },
    underStyle() {
      return { filter: this.layerFilter, transform: this.layerScale }
    },
    dimStyle() {
      const v = dimLevels[this.config.dim] || 0
      return { background: 'rgba(0, 0, 0, ' + v + ')' }
    }
  },
  watch: {
    // 选中项变化：旧壁纸放到底层，新壁纸在上层淡入（约 0.7s 交叉过渡）
    'config.selectedId': {
      immediate: true,
      handler(id) {
        if (!id || !this.list.some(w => w && w.id === id)) {
          this.underId = this.overId
          this.overId = ''
          return
        }
        if (id === this.overId) return
        this.underId = this.overId
        this.overId = id
      }
    },
    // 轮播间隔变化：重建定时器
    'config.carousel': {
      immediate: true,
      handler() {
        this.setupCarousel()
      }
    },
    // 总开关/列表变化：关闭时释放资源
    'config.enabled': {
      handler(on) {
        if (!on) this.teardown()
        else this.setupCarousel()
      }
    },
    list: {
      handler() {
        if (!this.config.enabled) return
        // 列表变动后校验当前选中是否仍存在
        const cur = this.config.selectedId
        if (cur && !this.list.some(w => w && w.id === cur)) {
          this.overId = this.list.length ? this.list[0].id : ''
          this.underId = ''
        }
        this.setupCarousel()
      }
    }
  },
  beforeDestroy() {
    this.teardown()
  },
  methods: {
    setupCarousel() {
      clearTimeout(this.carouselTimer)
      const ms = carouselIntervals[this.config.carousel] || 0
      if (!this.config.enabled || !ms || this.list.length < 2) return
      const tick = () => {
        this.nextWallpaper()
        this.carouselTimer = setTimeout(tick, ms)
      }
      this.carouselTimer = setTimeout(tick, ms)
    },
    nextWallpaper() {
      const list = this.list
      if (!list.length) return
      const i = list.findIndex(w => w && w.id === this.overId)
      const next = list[(i + 1 + list.length) % list.length]
      if (next && next.id !== this.overId) {
        this.$store.commit('SET_WALLPAPER_CONFIG', { selectedId: next.id })
      }
    },
    teardown() {
      clearTimeout(this.carouselTimer)
      clearTimeout(this.fadeTimer)
    }
  }
}
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
