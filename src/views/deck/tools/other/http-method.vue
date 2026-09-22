<template>
  <tool-shell title="HTTP 方法" desc="标准及扩展 HTTP 请求方法中文说明" icon="http" color="#FAAD14" back-path="/tools/other">
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

// HTTP 方法速查：数据迁移自旧项目 httpMethod 模块
export default {
  name: 'OtherHttpMethod',
  components: { ToolShell, DocList },
  data() {
    return {
      columns: [
        { key: 'method', title: '方法', mono: true, tag: true },
        { key: 'description', title: '说明' }
      ],
      rows: [
        { method: 'GET', description: '请求指定的页面信息，并返回实体主体。' },
        { method: 'HEAD', description: '类似于get请求，只不过返回的响应中没有具体的内容，用于获取报头' },
        { method: 'POST', description: '向指定资源提交数据进行处理请求（例如提交表单或者上传文件）。数据被包含在请求体中。POST请求可能会导致新的资源的建立和/或已有资源的修改。' },
        { method: 'PUT', description: '从客户端向服务器传送的数据取代指定的文档的内容。' },
        { method: 'DELETE', description: '请求服务器删除指定的页面。' },
        { method: 'CONNECT', description: 'HTTP/1.1协议中预留给能够将连接改为管道方式的代理服务器。' },
        { method: 'OPTIONS', description: '允许客户端查看服务器的性能。' },
        { method: 'TRACE', description: '回显服务器收到的请求，主要用于测试或诊断。' },
        { method: 'PATCH', description: '实体中包含一个表，表中说明与该URI所表示的原内容的区别。' },
        { method: 'MOVE', description: '请求服务器将指定的页面移至另一个网络地址。' },
        { method: 'COPY', description: '请求服务器将指定的页面拷贝至另一个网络地址。' },
        { method: 'LINK', description: '请求服务器建立链接关系。' },
        { method: 'UNLINK', description: '断开链接关系。' },
        { method: 'WRAPPED', description: '允许客户端发送经过封装的请求。' },
        { method: 'Extension-mothed', description: '在不改动协议的前提下，可增加另外的方法。' },
      ]
    }
  }
}
</script>
