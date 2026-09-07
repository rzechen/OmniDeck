<template>
  <tool-shell title="Word 快捷键" desc="Word 常用快捷键，支持 Windows 与 Mac" icon="word" color="#FAAD14" back-path="/tools/other">
    <doc-list :rows="rows" :columns="columns" />
    <template #status>
      <span class="status-dot"></span>
      <span>{{ rows.length }} 条记录</span>
      <span class="status-right">支持搜索</span>
    </template>
  </tool-shell>
</template>

<script>
import ToolShell from '@/components/tool/ToolShell.vue'
import DocList from '@/components/tool/DocList.vue'

// Word 快捷键速查：数据迁移自旧项目 word 模块
export default {
  name: 'OtherWordShortcut',
  components: { ToolShell, DocList },
  data() {
    return {
      columns: [
        { key: 'keys', title: 'Windows', mono: true, copy: true },
        { key: 'mac', title: 'Mac', mono: true, copy: true },
        { key: 'desc', title: '功能说明' }
      ],
      rows: [
        { keys: 'Ctrl+O', mac: '⌘+O', desc: '打开文档' },
        { keys: 'Ctrl+P', mac: '⌘+P', desc: '打印文档' },
        { keys: 'Ctrl+A', mac: '⌘+A', desc: '全选内容' },
        { keys: 'Ctrl+[', mac: '⌘+[', desc: '缩小选中文字大小' },
        { keys: 'Ctrl+]', mac: '⌘+]', desc: '放大选中文字大小' },
        { keys: 'Ctrl+D', mac: '⌘+D', desc: '打开字体设置对话框' },
        { keys: 'Ctrl+F', mac: '⌘+F', desc: '打开查找功能' },
        { keys: 'Ctrl+H', mac: '⌘+H', desc: '打开替换功能' },
        { keys: 'Ctrl+G', mac: '⌘+G', desc: '打开定位功能' },
        { keys: 'Ctrl+N', mac: '⌘+N', desc: '新建文档' },
        { keys: 'Ctrl+M', mac: '⌘+M', desc: '增加首行和悬挂缩进' },
        { keys: 'Ctrl+Shift+M', mac: '⇧+⌘+M', desc: '减少首行和悬挂缩进' },
        { keys: 'Ctrl+U', mac: '⌘+U', desc: '为选中文字添加下划线' },
        { keys: 'Ctrl+B', mac: '⌘+B', desc: '将选中文字加粗' },
        { keys: 'Ctrl+I', mac: '⌘+I', desc: '将选中文字倾斜' },
        { keys: 'Ctrl+Q', mac: '⌘+Q', desc: '两边对齐（无首行缩进）' },
        { keys: 'Ctrl+J', mac: '⌘+J', desc: '两端对齐' },
        { keys: 'Ctrl+E', mac: '⌘+E', desc: '文本居中对齐' },
        { keys: 'Ctrl+R', mac: '⌘+R', desc: '文本右对齐' },
        { keys: 'Ctrl+K', mac: '⌘+K', desc: '插入超链接' },
        { keys: 'Ctrl+T', mac: '⌘+T', desc: '增加首行缩进' },
        { keys: 'Ctrl+Shift+T', mac: '⇧+⌘+T', desc: '减少首行缩进' },
        { keys: 'Ctrl+C', mac: '⌘+C', desc: '复制选中内容到剪贴板' },
        { keys: 'Ctrl+V', mac: '⌘+V', desc: '粘贴剪贴板内容' },
        { keys: 'Ctrl+X', mac: '⌘+X', desc: '剪切选中内容到剪贴板' },
        { keys: 'Ctrl+S', mac: '⌘+S', desc: '保存当前文档' },
        { keys: 'Ctrl+L', mac: '⌘+L', desc: '文本左对齐' },
        { keys: 'Ctrl+Shift+L', mac: '⇧+⌘+L', desc: '为光标行添加项目符号' },
        { keys: 'Ctrl+Z', mac: '⌘+Z', desc: '撤销上一步操作' },
        { keys: 'Ctrl+Y', mac: '⌘+Y', desc: '重复上一步操作' },
        { keys: 'Ctrl+F2', mac: '⌘+F2', desc: '打开打印预览' },
        { keys: 'Ctrl+F4', mac: '⌘+W', desc: '关闭当前文档' },
        { keys: 'Ctrl+F12', mac: '⌘+F12', desc: '打开文档' },
        { keys: 'Ctrl+Shift+F12', mac: '⇧+⌘+F12', desc: '打开打印对话框' },
        { keys: 'Ctrl+Delete', mac: '⌘+Delete', desc: '删除光标后的英文单词或中文词语' },
        { keys: 'Ctrl + 退格键', mac: '⌘+ 退格键', desc: '删除光标前的英文单词或中文词语' },
        { keys: 'Ctrl+Enter', mac: '⌘+Enter', desc: '将光标后内容移到下一页' },
        { keys: 'Ctrl+End', mac: '⌘+End', desc: '将光标快速移到文末' },
        { keys: 'Ctrl+Home', mac: '⌘+Home', desc: '将光标快速移到文首' },
        { keys: 'Ctrl+Insert+Insert', mac: '⌘+Insert+Insert', desc: '打开或切换到剪贴板任务窗格' },
        { keys: 'Ctrl+~', mac: '⌘+~', desc: '打开中文输入法在线造词功能' },
        { keys: 'Ctrl++', mac: '⌘++', desc: '切换到下标输入状态' },
        { keys: 'Ctrl+Shift++', mac: '⇧+⌘++', desc: '切换到上标输入状态' },
        { keys: 'Ctrl+→', mac: '⌘+→', desc: '按单词 / 词语间隔向后移动光标' },
        { keys: 'Ctrl+←', mac: '⌘+←', desc: '按单词 / 词语间隔向前移动光标' },
      ]
    }
  }
}
</script>
