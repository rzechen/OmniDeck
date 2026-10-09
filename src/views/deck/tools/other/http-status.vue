<template>
  <tool-shell title="HTTP 状态码" desc="1xx 到 5xx 全部状态码及中文说明" icon="http" color="#FAAD14" back-path="/tools/other">
    <doc-list :rows="rows" :columns="columns" />
    <template #status>
      <span class="status-dot"></span>
      <span>{{ rows.length }} 条记录</span>
      <span class="status-right">支持搜索</span>
    </template>
  </tool-shell>
</template>

<script setup>
import ToolShell from '@/components/tool/ToolShell.vue'
import DocList from '@/components/tool/DocList.vue'

// HTTP 状态码速查：数据迁移自旧项目 httpState 模块
defineOptions({ name: 'OtherHttpStatus' })

const columns = [
        { key: 'category', title: '类别' },
        { key: 'code', title: '状态码', mono: true, tag: true },
        { key: 'description', title: '说明' }
]

const rows = [
        { category: '1xx（临时响应）', code: '100（继续）', description: '请求者应当继续提出请求。服务器已收到请求的第一部分，现等待剩余部分。' },
        { category: '1xx（临时响应）', code: '101（切换协议）', description: '请求者要求服务器切换协议，服务器已确认准备切换。' },
        { category: '2xx（成功）', code: '200（成功）', description: '服务器已成功处理请求，通常表示请求的网页已提供。' },
        { category: '2xx（成功）', code: '201（已创建）', description: '请求成功，服务器创建了新的资源。' },
        { category: '2xx（成功）', code: '202（已接受）', description: '服务器已接受请求，但尚未处理。' },
        { category: '2xx（成功）', code: '203（非授权信息）', description: '服务器成功处理请求，但返回可能来自其他来源的信息。' },
        { category: '2xx（成功）', code: '204（无内容）', description: '服务器成功处理请求，但无返回内容。' },
        { category: '2xx（成功）', code: '205（重置内容）', description: '服务器成功处理请求，要求请求者重置文档视图（如清空表单）。' },
        { category: '2xx（成功）', code: '206（部分内容）', description: '服务器成功处理部分 GET 请求。' },
        { category: '3xx（已重定向）', code: '300（多种选择）', description: '服务器根据请求提供多种操作选择，用户可选择。' },
        { category: '3xx（已重定向）', code: '301（永久移动）', description: '请求网页永久移动到新位置，服务器会自动重定向。' },
        { category: '3xx（已重定向）', code: '302（临时移动）', description: '服务器从不同位置响应请求，请求者应继续使用原位置。' },
        { category: '3xx（已重定向）', code: '303（查看其他位置）', description: '请求者应另行对不同位置执行 GET 请求。' },
        { category: '3xx（已重定向）', code: '304（未修改）', description: '请求的网页自上次请求后未修改，服务器不返回内容。' },
        { category: '3xx（已重定向）', code: '305（使用代理）', description: '请求者只能通过代理访问请求网页。' },
        { category: '3xx（已重定向）', code: '307（临时重定向）', description: '服务器临时重定向请求，客户端继续使用原 URL。' },
        { category: '4xx（请求错误）', code: '400（错误请求）', description: '服务器无法理解请求语法。' },
        { category: '4xx（请求错误）', code: '401（未授权）', description: '请求要求身份验证。' },
        { category: '4xx（请求错误）', code: '403（已禁止）', description: '服务器拒绝请求。' },
        { category: '4xx（请求错误）', code: '404（未找到）', description: '服务器找不到请求的网页。' },
        { category: '4xx（请求错误）', code: '405（方法禁用）', description: '请求中指定的方法不被允许。' },
        { category: '4xx（请求错误）', code: '406（不接受）', description: '请求的内容特性无法响应。' },
        { category: '4xx（请求错误）', code: '407（需要代理授权）', description: '客户端需通过代理进行授权。' },
        { category: '4xx（请求错误）', code: '408（请求超时）', description: '服务器等待请求超时。' },
        { category: '4xx（请求错误）', code: '409（冲突）', description: '请求发生冲突。' },
        { category: '4xx（请求错误）', code: '410（已删除）', description: '请求的资源已被永久删除。' },
        { category: '4xx（请求错误）', code: '411（需要有效长度）', description: '请求中缺少有效的内容长度。' },
        { category: '4xx（请求错误）', code: '412（未满足前提条件）', description: '服务器未满足请求中的前提条件。' },
        { category: '4xx（请求错误）', code: '413（请求实体过大）', description: '请求体过大，服务器无法处理。' },
        { category: '4xx（请求错误）', code: '414（请求的 URI 过长）', description: '请求 URI 过长，服务器无法处理。' },
        { category: '4xx（请求错误）', code: '415（不支持的媒体类型）', description: '请求格式不被支持。' },
        { category: '4xx（请求错误）', code: '416（请求范围不符合要求）', description: '请求的范围无效。' },
        { category: '4xx（请求错误）', code: '417（未满足期望值）', description: '服务器未满足请求的期望。' },
        { category: '5xx（服务器错误）', code: '500（服务器内部错误）', description: '服务器遇到错误，无法完成请求。' },
        { category: '5xx（服务器错误）', code: '501（尚未实施）', description: '服务器不具备完成请求的功能。' },
        { category: '5xx（服务器错误）', code: '502（错误网关）', description: '服务器作为网关，从上游服务器收到无效响应。' },
        { category: '5xx（服务器错误）', code: '503（服务不可用）', description: '服务器当前不可用，通常是暂时状态。' },
        { category: '5xx（服务器错误）', code: '504（网关超时）', description: '服务器作为网关，未及时从上游服务器接收响应。' },
        { category: '5xx（服务器错误）', code: '505（HTTP 版本不受支持）', description: '服务器不支持请求中使用的 HTTP 版本。' }
]
</script>
