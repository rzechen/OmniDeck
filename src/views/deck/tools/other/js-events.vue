<template>
  <tool-shell title="JS 事件参考" desc="常见 DOM 与浏览器事件分类整理" icon="event" color="#FAAD14" back-path="/tools/other">
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

// JS 事件速查：数据迁移自旧项目 jsEvents 模块（分类展平为列表）
export default {
  name: 'OtherJsEvents',
  components: { ToolShell, DocList },
  data() {
    return {
      columns: [
        { key: 'event', title: '事件', mono: true, tag: true },
        { key: 'category', title: '分类' },
        { key: 'support', title: '浏览器支持' },
        { key: 'description', title: '说明' }
      ],
      rows: [
        { category: '一般事件', event: 'onclick', support: 'IE3、N2', description: '鼠标点击时触发此事件' },
        { category: '一般事件', event: 'ondblclick', support: 'IE4、N4', description: '鼠标双击时触发此事件' },
        { category: '一般事件', event: 'onmousedown', support: 'IE4、N4', description: '按下鼠标时触发此事件' },
        { category: '一般事件', event: 'onmouseup', support: 'IE4、N4', description: '鼠标按下后松开时触发' },
        { category: '一般事件', event: 'onmouseover', support: 'IE3、N2', description: '鼠标移入对象上方时触发' },
        { category: '一般事件', event: 'onmousemove', support: 'IE4、N4', description: '鼠标移动时触发此事件' },
        { category: '一般事件', event: 'onmouseout', support: 'IE4、N3', description: '鼠标离开对象范围时触发' },
        { category: '一般事件', event: 'onkeypress', support: 'IE4、N4', description: '按键按下并释放时触发' },
        { category: '一般事件', event: 'onkeydown', support: 'IE4、N4', description: '键盘按下时触发' },
        { category: '一般事件', event: 'onkeyup', support: 'IE4、N4', description: '键盘松开时触发' },
        { category: '页面相关事件', event: 'onabort', support: 'IE4、N3', description: '图片下载被用户中断时触发' },
        { category: '页面相关事件', event: 'onbeforeunload', support: 'IE4、N', description: '页面即将卸载时触发' },
        { category: '页面相关事件', event: 'onerror', support: 'IE4、N3', description: '页面出现错误时触发' },
        { category: '页面相关事件', event: 'onload', support: 'IE3、N2', description: '页面加载完成时触发' },
        { category: '页面相关事件', event: 'onresize', support: 'IE4、N4', description: '浏览器窗口大小改变时触发' },
        { category: '页面相关事件', event: 'onunload', support: 'IE3、N2', description: '页面卸载时触发' },
        { category: '表单相关事件', event: 'onblur', support: 'IE3、N2', description: '元素失去焦点时触发' },
        { category: '表单相关事件', event: 'onchange', support: 'IE3、N2', description: '失去焦点且内容变更触发' },
        { category: '表单相关事件', event: 'onfocus', support: 'IE3、N2', description: '元素获得焦点时触发' },
        { category: '表单相关事件', event: 'onreset', support: 'IE4、N3', description: '点击 reset 按钮时触发' },
        { category: '表单相关事件', event: 'onsubmit', support: 'IE3、N2', description: '表单提交时触发' },
        { category: '滚动字幕事件', event: 'onbounce', support: 'IE4、N', description: 'Marquee 内容滚动出范围时触发' },
        { category: '滚动字幕事件', event: 'onfinish', support: 'IE4、N', description: 'Marquee 内容显示完毕时触发' },
        { category: '滚动字幕事件', event: 'onstart', support: 'IE4、N', description: 'Marquee 开始显示时触发' },
        { category: '编辑事件', event: 'onbeforecopy', support: 'IE5、N', description: '当页面当前的被选择内容将要复制到浏览者系统的剪贴板前触发此事件' },
        { category: '编辑事件', event: 'onbeforecut', support: 'IE5、N', description: '当页面中的一部分或者全部的内容将被移离当前页面 [剪贴] 并移动到浏览者的系统剪贴板时触发此事件' },
        { category: '编辑事件', event: 'onbeforeeditfocus', support: 'IE5、N', description: '当前元素将要进入编辑状态' },
        { category: '编辑事件', event: 'onbeforepaste', support: 'IE5、N', description: '内容将要从浏览者的系统剪贴板传送 [粘贴] 到页面中时触发此事件' },
        { category: '编辑事件', event: 'onbeforeupdate', support: 'IE5、N', description: '当浏览者粘贴系统剪贴板中的内容时通知目标对象' },
        { category: '编辑事件', event: 'oncontextmenu', support: 'IE5、N', description: '当浏览者按下鼠标右键出现菜单时或者通过键盘的按键触发页面菜单时触发的事件' },
        { category: '编辑事件', event: 'oncopy', support: 'IE5、N', description: '当页面当前的被选择内容被复制后触发此事件' },
        { category: '编辑事件', event: 'oncut', support: 'IE5、N', description: '当页面当前的被选择内容被剪切时触发此事件' },
        { category: '编辑事件', event: 'ondrag', support: 'IE5、N', description: '当某个对象被拖动时触发此事件 [活动事件]' },
        { category: '编辑事件', event: 'ondragdrop', support: 'IE、N4', description: '一个外部对象被鼠标拖进当前窗口或者帧' },
        { category: '编辑事件', event: 'ondragend', support: 'IE5、N', description: '当鼠标拖动结束时触发此事件，即鼠标的按钮被释放了' },
        { category: '编辑事件', event: 'ondragenter', support: 'IE5、N', description: '当对象被鼠标拖动的对象进入其容器范围内时触发此事件' },
        { category: '编辑事件', event: 'ondragleave', support: 'IE5、N', description: '当对象被鼠标拖动的对象离开其容器范围内时触发此事件' },
        { category: '编辑事件', event: 'ondragover', support: 'IE5、N', description: '当某被拖动的对象在另一对象容器范围内拖动时触发此事件' },
        { category: '编辑事件', event: 'ondragstart', support: 'IE4、N', description: '当某对象将被拖动时触发此事件' },
        { category: '编辑事件', event: 'ondrop', support: 'IE5、N', description: '在一个拖动过程中，释放鼠标键时触发此事件' },
        { category: '编辑事件', event: 'onlosecapture', support: 'IE5、N', description: '当元素失去鼠标移动所形成的选择焦点时触发此事件' },
        { category: '编辑事件', event: 'onpaste', support: 'IE5、N', description: '当内容被粘贴时触发此事件' },
        { category: '编辑事件', event: 'onselect', support: 'IE4、N', description: '当文本内容被选择时的事件' },
        { category: '编辑事件', event: 'onselectstart', support: 'IE4、N', description: '当文本内容选择将开始发生时触发的事件' },
        { category: '数据绑定', event: 'onafterupdate', support: 'IE4、N', description: '当数据完成由数据源到对象的传送时触发此事件' },
        { category: '数据绑定', event: 'oncellchange', support: 'IE5、N', description: '当数据来源发生变化时' },
        { category: '数据绑定', event: 'ondataavailable', support: 'IE4、N', description: '当数据接收完成时触发事件' },
        { category: '数据绑定', event: 'ondatasetchanged', support: 'IE4、N', description: '数据在数据源发生变化时触发的事件' },
        { category: '数据绑定', event: 'ondatasetcomplete', support: 'IE4、N', description: '当来子数据源的全部有效数据读取完毕时触发此事件' },
        { category: '数据绑定', event: 'onerrorupdate', support: 'IE4、N', description: '当使用 onBeforeUpdate 事件触发取消了数据传送时，代替 onAfterUpdate 事件' },
        { category: '数据绑定', event: 'onrowenter', support: 'IE5、N', description: '当前数据源的数据发生变化并且有新的有效数据时触发的事件' },
        { category: '数据绑定', event: 'onrowexit', support: 'IE5、N', description: '当前数据源的数据将要发生变化时触发的事件' },
        { category: '数据绑定', event: 'onrowsdelete', support: 'IE5、N', description: '当前数据记录将被删除时触发此事件' },
        { category: '数据绑定', event: 'onrowsinserted', support: 'IE5、N', description: '当前数据源将要插入新数据记录时触发此事件' },
        { category: '外部事件', event: 'onafterprint', support: 'IE5、N', description: '当文档被打印后触发此事件' },
        { category: '外部事件', event: 'onbeforeprint', support: 'IE5、N', description: '当文档即将打印时触发此事件' },
        { category: '外部事件', event: 'onfilterchange', support: 'IE4、N', description: '当某个对象的滤镜效果发生变化时触发的事件' },
        { category: '外部事件', event: 'onhelp', support: 'IE4、N', description: '当浏览者按下 F1 或者浏览器的帮助选择时触发此事件' },
        { category: '外部事件', event: 'onpropertychange', support: 'IE5、N', description: '当对象的属性之一发生变化时触发此事件' },
        { category: '外部事件', event: 'onreadystatechange', support: 'IE4、N', description: '当对象的初始化属性值发生变化时触发此事件' },
      ]
    }
  }
}
</script>
