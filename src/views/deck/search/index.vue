<template>
  <div class="deck-search-page">
    <!-- 页签宿主页：居中搜索触发框（点击重新唤起面板），进入页签时自动弹出搜索面板 -->
    <div class="dsp-box" @click="openPalette">
      <i class="el-icon-search dsp-icon"></i>
      <span class="dsp-placeholder">搜索工具、页面...</span>
      <span class="dsp-kbd">{{ shortcutText }}</span>
    </div>
    <p class="dsp-hint">随时按 {{ shortcutText }} 唤起 · 回车打开选中结果</p>

    <search-palette v-model:visible="showSearch" @select="goTo" />
  </div>
</template>

<script>
import SearchPalette from '@/components/common/SearchPalette.vue'
import { getShortcut, formatAccelerator, onShortcutsChanged } from '@/utils/shortcuts'

// 快捷搜索页（Deck 视图专用页签）：作为搜索面板的宿主，
// 打开/切回本页签时自动弹出 Spotlight 面板；选中结果跳转对应页面（本页签保留）
export default {
  name: 'DeckSearch',
  components: { SearchPalette },
  data() {
    return {
      showSearch: false,
      // 快捷键版本号（设置页改键后 bump，刷新提示文案）
      shortcutVersion: 0
    }
  },
  computed: {
    shortcutText() {
      // 依赖版本号：改键后重新计算
      void this.shortcutVersion
      return formatAccelerator(getShortcut('search'))
    }
  },
  mounted() {
    this.openPalette()
    // 已在本页签时再次按快捷键：Layout 广播事件重新唤起面板
    this.$bus.on('deck:search-open', this.openPalette)
    this.offShortcutsChanged = onShortcutsChanged(() => { this.shortcutVersion++ })
  },
  // keep-alive：切回页签时自动唤起
  activated() {
    this.openPalette()
  },
  beforeUnmount() {
    this.$bus.off('deck:search-open', this.openPalette)
    if (this.offShortcutsChanged) this.offShortcutsChanged()
  },
  methods: {
    openPalette() {
      // 守卫：keep-alive 缓存的实例可能不在当前页签，仅本页签激活时弹面板
      if (this.$route.path !== '/search') return
      this.showSearch = true
    },
    goTo(item) {
      if (item && item.path && this.$route.path !== item.path) {
        this.$router.push(item.path).catch(() => {})
      }
    }
  }
}
</script>

<style lang="scss" scoped>
.deck-search-page {
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 20px;
}

/* 居中搜索触发框：复用原顶栏搜索框视觉 */
.dsp-box {
  display: flex;
  align-items: center;
  gap: 10px;
  width: min(420px, 80%);
  height: 40px;
  padding: 0 14px;
  background: $search-bg;
  border-radius: $radius-base;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: $search-bg-hover;
  }

  .dsp-icon {
    font-size: 15px;
    color: $text-secondary;
  }

  .dsp-placeholder {
    flex: 1;
    font-size: 13px;
    color: $text-secondary;
  }

  .dsp-kbd {
    font-size: 11px;
    color: $text-secondary;
    background: var(--card-bg);
    padding: 2px 7px;
    border-radius: 5px;
    border: 1px solid $border-color;
    font-family: 'SF Mono', Menlo, monospace;
  }
}

.dsp-hint {
  margin: 0;
  font-size: 12px;
  color: $text-secondary;
  opacity: 0.75;
}
</style>
