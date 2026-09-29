<template>
  <!-- 顶栏搜索：跨会话搜索任务名称与内容（主进程执行，防抖 + 简易缓存） -->
  <div class="buddy-search-wrap">
    <div class="buddy-search" :class="{ focused: focus }">
      <svg-icon icon-class="search" class="buddy-search-icon" />
      <input
        v-model="query"
        class="buddy-search-input"
        placeholder="搜索任务名称或内容..."
        @focus="focus = true"
        @blur="onBlur"
        @keydown.esc="query = ''"
      />
      <svg-icon
        v-if="query"
        icon-class="circle_close"
        class="buddy-search-clear"
        @mousedown.prevent="query = ''"
      />
      <span v-if="!query" class="buddy-search-kbd">esc</span>
    </div>

    <!-- 搜索结果下拉（对话名称/内容匹配） -->
    <transition name="buddy-drop">
      <div v-if="focus && query" class="buddy-search-drop">
        <template v-if="results.length">
          <div
            v-for="r in results"
            :key="r.id"
            class="buddy-search-item"
            @mousedown.prevent="$emit('select', r.id)"
          >
            <svg-icon icon-class="chat-dot-round" />
            <span class="buddy-search-item-name">{{ r.name }}</span>
            <span class="buddy-search-item-snippet">{{ r.snippet }}</span>
          </div>
        </template>
        <div v-else class="buddy-search-empty">
          <svg-icon icon-class="search" />
          <span>未找到「{{ query }}」相关的任务</span>
        </div>
      </div>
    </transition>
  </div>
</template>

<script>
// OmniBuddy 顶栏搜索框（跨会话搜索：标题 + 内容）
// 搜索由主进程执行；结果缓存随会话列表变化由父层清空（sessions-changed 时调 clearCache）
export default {
  name: 'BuddySearch',
  data() {
    return {
      query: '',
      focus: false,
      // query -> 结果缓存
      cache: {},
      timer: null
    }
  },
  computed: {
    results() {
      const q = this.query.trim()
      if (!q) return []
      return this.cache[q] || []
    }
  },
  watch: {
    query(q) {
      this.runSearch(q)
    }
  },
  beforeUnmount() {
    clearTimeout(this.timer)
  },
  methods: {
    buddyApi() {
      return (window.electronAPI && window.electronAPI.omnibuddy) || null
    },
    // 防抖 + 简易缓存（同 query 不重复请求）
    runSearch(q) {
      const api = this.buddyApi()
      if (!api) return
      const query = q.trim()
      if (!query) return
      if (this.cache[query] !== undefined) return
      clearTimeout(this.timer)
      this.timer = setTimeout(async () => {
        const results = await api.searchSessions(query)
        this.cache[query] = results.map(r => ({ id: r.id, name: r.name, snippet: r.snippet }))
      }, 200)
    },
    // 会话列表变化后由父层调用：清空结果缓存
    clearCache() {
      this.cache = {}
    },
    onBlur() {
      this.focus = false
    }
  }
}
</script>

<style lang="scss" scoped>
.buddy-search-wrap {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  min-width: 0;
  height: 100%;
  -webkit-app-region: no-drag;
}

/* 搜索框：限定最大宽度，在顶栏内居中 */
.buddy-search {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  max-width: 520px;
  height: 28px;
  padding: 0 11px;
  background: $search-bg;
  border-radius: $radius-base;
  // 常态透明边框占位（避免聚焦出现边框时几何跳动）
  border: 1px solid transparent;
  transition: all 0.15s ease;

  &.focused {
    background: var(--card-bg);
    // 聚焦边框与 BuddySpotlight 一致：主题色描边 + 光晕
    border-color: var(--primary-color);
    box-shadow: 0 0 0 3px rgba(var(--primary-color-rgb), 0.12);
  }

  .buddy-search-icon {
    font-size: 13px;
    color: $text-secondary;
  }

  .buddy-search-input {
    flex: 1;
    min-width: 0;
    border: none;
    outline: none;
    background: transparent;
    font-size: 12px;
    color: $text-primary;

    &::placeholder {
      color: $text-secondary;
    }
  }

  .buddy-search-clear {
    font-size: 13px;
    color: $text-secondary;
    cursor: pointer;
    flex-shrink: 0;

    &:hover {
      color: $text-primary;
    }
  }

  .buddy-search-kbd {
    font-size: 11px;
    color: $text-secondary;
    background: $search-bg;
    padding: 1px 5px;
    border-radius: 4px;
    font-family: 'SF Mono', monospace;
  }
}

/* 搜索结果下拉 */
.buddy-search-drop {
  position: absolute;
  top: 32px;
  left: 0;
  right: 0;
  margin: 0 auto;
  width: min(520px, 90%);
  max-height: 320px;
  overflow-y: auto;
  border-radius: $radius-lg;
  border: 1px solid var(--border-color);
  background: var(--card-bg);
  backdrop-filter: blur(24px) saturate(1.6);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16);
  z-index: 20;
  padding: 6px;

  &::-webkit-scrollbar {
    width: 4px;
  }
}

.buddy-search-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: $radius-base;
  cursor: pointer;
  transition: background 0.12s ease;

  > .svg-icon {
    font-size: 13px;
    color: var(--primary-color);
    flex-shrink: 0;
  }

  .buddy-search-item-name {
    font-size: 12.5px;
    font-weight: 600;
    color: $text-primary;
    white-space: nowrap;
    flex-shrink: 0;
    max-width: 45%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .buddy-search-item-snippet {
    flex: 1;
    min-width: 0;
    font-size: 11.5px;
    color: $text-secondary;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  &:hover {
    background: rgba(var(--primary-color-rgb), 0.08);
  }
}

.buddy-search-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 22px 0;
  font-size: 12px;
  color: $text-secondary;

  .svg-icon {
    font-size: 14px;
  }
}

/* 下拉过渡 */
.buddy-drop-enter-active,
.buddy-drop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.buddy-drop-enter,
.buddy-drop-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>
