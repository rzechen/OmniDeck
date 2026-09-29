// 菜单多页签状态：Deck（Layout）与 Buddy（BuddyLayout）两侧各自维护独立页签列表
// 页签以 fullPath 唯一（带参路由如 /omnibuddy?s=会话id、/finance/fund/:code 各自成签）
// uid 用作 router-view 的 :key —— keep-alive 以 vnode.key 为缓存键，
// 让每个页签各缓存一份组件实例，切换页签时状态互不丢失
export default {
  namespaced: true,
  state: () => ({
    deck: [],  // Layout（Deck）侧页签
    buddy: [], // BuddyLayout（OmniBuddy）侧页签
    seq: 0     // 页签 uid 自增序号
  }),
  getters: {
    // 当前路由对应的页签缓存 key（页签未登记时退化为 fullPath，保证路由仍可渲染）
    keyOf: state => (side, fullPath) => {
      const tabs = state[side] || []
      const tab = tabs.find(t => t.fullPath === fullPath)
      return tab ? tab.uid : fullPath
    }
  },
  mutations: {
    ADD_TAB(state, { side, path, fullPath, title }) {
      const tabs = state[side]
      if (!tabs || !fullPath) return
      // 同一 fullPath 只登记一次（重复导航仅激活既有页签，保留其缓存实例）
      if (tabs.some(t => t.fullPath === fullPath)) return
      state.seq += 1
      tabs.push({ uid: 't' + state.seq, path, fullPath, title: title || '未命名' })
    },
    DEL_TAB(state, { side, fullPath }) {
      const tabs = state[side]
      if (!tabs) return
      const i = tabs.findIndex(t => t.fullPath === fullPath)
      if (i > -1) tabs.splice(i, 1)
    },
    // 页签原位换 fullPath 但保留 uid：keep-alive 缓存 key 不变，组件实例不重建
    // （新对话发送首条消息后 replace 为 ?s= 会话页，避免正在流式的组件被销毁重建）
    REBIND_TAB(state, { side, from, to, path, title }) {
      const tabs = state[side]
      if (!tabs) return
      const tab = tabs.find(t => t.fullPath === from)
      if (!tab) return
      tab.fullPath = to
      if (path) tab.path = path
      if (title) tab.title = title
    },
    // 关闭除 keepFullPath（当前页签）外的全部页签
    CLOSE_OTHERS(state, { side, keepFullPath }) {
      const tabs = state[side]
      if (!tabs) return
      state[side] = tabs.filter(t => t.fullPath === keepFullPath)
    },
    // 关闭全部页签
    CLOSE_ALL(state, { side }) {
      state[side] = []
    },
    // 关闭某页签左侧 / 右侧（dir: 'left' | 'right'）的全部页签
    CLOSE_SIDE(state, { side, fullPath, dir }) {
      const tabs = state[side]
      if (!tabs) return
      const i = tabs.findIndex(t => t.fullPath === fullPath)
      if (i < 0) return
      state[side] = dir === 'left' ? tabs.slice(i) : tabs.slice(0, i + 1)
    },
    // 更新页签标题（会话页签补任务名、基金详情页签补基金名等）
    UPDATE_TAB_TITLE(state, { side, fullPath, title }) {
      if (!title) return
      const tabs = state[side]
      if (!tabs) return
      const tab = tabs.find(t => t.fullPath === fullPath)
      if (tab) tab.title = title
    }
  }
}
