// 工具分类页工厂：按路由 name 从统一配置（@/config/tools）渲染分类页
// 各分类页只需：import categoryPage from '../category-page'; export default categoryPage('Format')
import { h } from 'vue'
import ToolCategory from '@/components/deck/ToolCategory.vue'
import { toolCategories } from '@/config/tools'

export default function categoryPage(name) {
  return {
    // 组件名加 Category 后缀：Image / Text 等为 HTML/SVG 保留标签，
    // 直接用作组件名会触发 Vue 保留元素警告
    name: name + 'Category',
    components: { ToolCategory },
    computed: {
      cat() {
        return (
          toolCategories.find(c => c.name === name) || {
            title: '',
            desc: '',
            color: '#3366FF',
            children: []
          }
        )
      }
    },
    render() {
      return h(ToolCategory, { category: this.cat })
    }
  }
}
