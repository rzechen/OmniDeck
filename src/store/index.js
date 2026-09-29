import { createStore } from 'vuex'
import buddyChat from './buddyChat'
import tagsView from './tagsView'

export default createStore({
  state: {
    sidebarCollapsed: false,
    // 侧边栏启动默认状态：'expand' 展开 / 'collapse' 收起
    sidebarDefault: 'expand',
    themeMode: 'light',
    primaryColor: '#3366FF',
    toolFavorites: [], // 收藏的工具 path 列表
    toolGridCols: 'auto', // 工具卡片每行个数：'auto' 自适应，数字为固定列数
    // 侧边栏分组默认展开状态：'expand' 启动时全部展开 / 'collapse' 启动时全部收起
    sidebarGroupsDefault: 'expand',
    // 减弱动态效果：关闭入场编排/按压/滚动等装饰性动效（保留必要过渡）
    reduceMotion: false,
    // 背景壁纸：列表 + 配置（内容见 utils/wallpaper.js）
    wallpaperList: [],
    wallpaperConfig: {
      enabled: false,
      selectedId: '',
      soft: false,
      dim: 'none',
      carousel: 'off'
    }
  },
  mutations: {
    TOGGLE_SIDEBAR(state) {
      state.sidebarCollapsed = !state.sidebarCollapsed
    },
    SET_SIDEBAR_DEFAULT(state, val) {
      state.sidebarDefault = val
      state.sidebarCollapsed = val === 'collapse'
    },
    SET_SIDEBAR_GROUPS_DEFAULT(state, val) {
      state.sidebarGroupsDefault = val
    },
    SET_REDUCE_MOTION(state, val) {
      state.reduceMotion = val
    },
    SET_THEME(state, { mode, color }) {
      if (mode) state.themeMode = mode
      if (color) state.primaryColor = color
    },
    // 启动时从 IndexedDB 加载后同步到 store
    INIT_FROM_DB(state, { mode, color, toolFavorites, toolGridCols, sidebarDefault, sidebarGroupsDefault, reduceMotion, wallpaperList, wallpaperConfig }) {
      state.themeMode = mode
      state.primaryColor = color
      state.toolFavorites = toolFavorites || []
      state.toolGridCols = toolGridCols || 'auto'
      if (sidebarDefault) {
        state.sidebarDefault = sidebarDefault
        state.sidebarCollapsed = sidebarDefault === 'collapse'
      }
      if (sidebarGroupsDefault) {
        state.sidebarGroupsDefault = sidebarGroupsDefault
      }
      if (typeof reduceMotion === 'boolean') state.reduceMotion = reduceMotion
      if (Array.isArray(wallpaperList)) state.wallpaperList = wallpaperList
      if (wallpaperConfig) state.wallpaperConfig = Object.assign({}, state.wallpaperConfig, wallpaperConfig)
    },
    // 整体替换壁纸列表（新增/删除后回写）
    SET_WALLPAPER_LIST(state, list) {
      state.wallpaperList = Array.isArray(list) ? list : []
    },
    // 整体替换壁纸配置（属性级修改时先浅拷贝再提交）
    SET_WALLPAPER_CONFIG(state, config) {
      state.wallpaperConfig = Object.assign({}, state.wallpaperConfig, config)
    },
    // 设置工具卡片每行个数
    SET_TOOL_GRID_COLS(state, cols) {
      state.toolGridCols = cols
    },
    // 整体设置工具收藏列表（拖拽排序后回写）
    SET_TOOL_FAVORITES(state, paths) {
      state.toolFavorites = paths
    },
    // 收藏/取消收藏工具（按 path 唯一标识）
    TOGGLE_TOOL_FAVORITE(state, path) {
      const i = state.toolFavorites.indexOf(path)
      if (i > -1) {
        state.toolFavorites.splice(i, 1)
      } else {
        state.toolFavorites.push(path)
      }
    }
  },
  actions: {},
  modules: {
    // 菜单多页签（deck / buddy 双侧独立页签列表）
    tagsView,
    // OmniBuddy 会话状态池（对话状态提升，组件实例只是视图层）
    buddyChat
  }
})
