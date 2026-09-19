// Buddy 空间数据：用户空间（IndexedDB 持久化）+ 系统默认空间（运行时派生）合并
// 系统默认空间固定首位、带 system 标记；目录仅取用户主动关联的本地路径（无默认值），
// 未关联时首次点击由侧栏弹窗引导选择；不参与持久化（保存时统一过滤）。
import { getItem, setItem } from '@/utils/db'

export const DEFAULT_SPACE_ID = 'sp-default'

// 读取全部空间：系统默认空间（桌面端）+ 用户空间
export async function getBuddySpaces() {
  let list = getItem('buddySpaces', [])
  if (!Array.isArray(list)) list = []
  // 清理历史误存进用户列表的系统空间数据
  list = list.filter(s => s && s.id !== DEFAULT_SPACE_ID && !s.system)
  const api = window.electronAPI && window.electronAPI.omnibuddy
  if (api) {
    const def = {
      id: DEFAULT_SPACE_ID,
      name: '默认空间',
      desc: '系统内置空间，首次使用时关联本地目录',
      icon: 'home',
      dir: getItem('buddyDefaultSpaceDir', ''),
      system: true
    }
    return [def].concat(list)
  }
  return list.slice()
}

// 持久化用户空间（过滤系统空间，避免运行时派生数据落盘）
export function saveBuddySpaces(list) {
  setItem('buddySpaces', (list || []).filter(s => s && !s.system && s.id !== DEFAULT_SPACE_ID))
}
