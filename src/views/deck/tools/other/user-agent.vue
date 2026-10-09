<template>
  <tool-shell title="User-Agent" desc="主流浏览器典型 UA 字符串速查" icon="browser" color="#FAAD14" back-path="/tools/other">
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

// User-Agent 速查：数据迁移自旧项目 userAgent 模块（PC / 移动端合并）
defineOptions({ name: 'OtherUserAgent' })

const columns = [
        { key: 'platform', title: '平台', tag: true },
        { key: 'browser', title: '浏览器' },
        { key: 'userAgent', title: 'User-Agent（点击复制）', mono: true, copy: true }
]

const rows = [
        { platform: 'PC', browser: 'Safari 5.1 – MAC', userAgent: 'Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; en-us) AppleWebKit/534.50 (KHTML, like Gecko) Version/5.1 Safari/534.50' },
        { platform: 'PC', browser: 'Safari 5.1 – Windows', userAgent: 'Mozilla/5.0 (Windows; U; Windows NT 6.1; en-us) AppleWebKit/534.50 (KHTML, like Gecko) Version/5.1 Safari/534.50' },
        { platform: 'PC', browser: 'IE 9.0', userAgent: 'Mozilla/5.0 (compatible; MSIE 9.0; Windows NT 6.1; Trident/5.0;)' },
        { platform: 'PC', browser: 'IE 8.0', userAgent: 'Mozilla/4.0 (compatible; MSIE 8.0; Windows NT 6.0; Trident/4.0)' },
        { platform: 'PC', browser: 'IE 7.0', userAgent: 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 6.0)' },
        { platform: 'PC', browser: 'IE 6.0', userAgent: 'Mozilla/4.0 (compatible; MSIE 6.0; Windows NT 5.1)' },
        { platform: 'PC', browser: 'Firefox 4.0.1 – MAC', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.6; rv,2.0.1) Gecko/20100101 Firefox/4.0.1' },
        { platform: 'PC', browser: 'Firefox 4.0.1 – Windows', userAgent: 'Mozilla/5.0 (Windows NT 6.1; rv,2.0.1) Gecko/20100101 Firefox/4.0.1' },
        { platform: 'PC', browser: 'Opera 11.11 – MAC', userAgent: 'Opera/9.80 (Macintosh; Intel Mac OS X 10.6.8; U; en) Presto/2.8.131 Version/11.11' },
        { platform: 'PC', browser: 'Opera 11.11 – Windows', userAgent: 'Opera/9.80 (Windows NT 6.1; U; en) Presto/2.8.131 Version/11.11' },
        { platform: 'PC', browser: 'Chrome 17.0 – MAC', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_7_0) AppleWebKit/535.11 (KHTML, like Gecko) Chrome/17.0.963.56 Safari/535.11' },
        { platform: 'PC', browser: '傲游（Maxthon）', userAgent: 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; Maxthon 2.0)' },
        { platform: 'PC', browser: '腾讯TT', userAgent: 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; TencentTraveler 4.0)' },
        { platform: 'PC', browser: '世界之窗 2.x', userAgent: 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1)' },
        { platform: 'PC', browser: '世界之窗 3.x', userAgent: 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; The World)' },
        { platform: 'PC', browser: '搜狗浏览器 1.x', userAgent: 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; Trident/4.0; SE 2.X MetaSr 1.0)' },
        { platform: 'PC', browser: '360浏览器', userAgent: 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; 360SE)' },
        { platform: 'PC', browser: 'Avant', userAgent: 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1; Avant Browser)' },
        { platform: 'PC', browser: 'Green Browser', userAgent: 'Mozilla/4.0 (compatible; MSIE 7.0; Windows NT 5.1)' },
        { platform: 'PC', browser: 'UC浏览器', userAgent: 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 Chrome/55.0.2883.87 UBrowser/6.2.4094.1 Safari/537.36' },
        { platform: 'Mobile', browser: 'Safari iOS 4.33 – iPhone', userAgent: 'Mozilla/5.0 (iPhone; U; CPU iPhone OS 4_3_3 like Mac OS X; en-us)...' },
        { platform: 'Mobile', browser: 'Safari iOS 4.33 – iPod Touch', userAgent: 'Mozilla/5.0 (iPod; U; CPU iPhone OS 4_3_3 like Mac OS X; en-us)...' },
        { platform: 'Mobile', browser: 'Safari iOS 4.33 – iPad', userAgent: 'Mozilla/5.0 (iPad; U; CPU OS 4_3_3 like Mac OS X; en-us)...' },
        { platform: 'Mobile', browser: 'Android N1', userAgent: 'Mozilla/5.0 (Linux; U; Android 2.3.7; en-us; Nexus One Build/FRF91)...' },
        { platform: 'Mobile', browser: 'Android QQ浏览器', userAgent: 'MQQBrowser/26 Mozilla/5.0 (Linux; U; Android 2.3.7; zh-cn; MB200)...' },
        { platform: 'Mobile', browser: 'Android Opera Mobile', userAgent: 'Opera/9.80 (Android 2.3.4; Linux; Opera Mobi/build-1107180945)...' },
        { platform: 'Mobile', browser: 'Android Pad Moto Xoom', userAgent: 'Mozilla/5.0 (Linux; U; Android 3.0; en-us; Xoom Build/HRI39)...' },
        { platform: 'Mobile', browser: 'BlackBerry', userAgent: 'Mozilla/5.0 (BlackBerry; U; BlackBerry 9800; en)...' },
        { platform: 'Mobile', browser: 'WebOS HP Touchpad', userAgent: 'Mozilla/5.0 (hp-tablet; Linux; hpwOS/3.0.0; U; en-US)...' },
        { platform: 'Mobile', browser: 'Nokia N97', userAgent: 'Mozilla/5.0 (SymbianOS/9.4; Series60/5.0 NokiaN97-1)...' },
        { platform: 'Mobile', browser: 'Windows Phone Mango', userAgent: 'Mozilla/5.0 (compatible; MSIE 9.0; Windows Phone OS 7.5; Trident/5.0; IEMobile/9.0; HTC; Titan)' },
        { platform: 'Mobile', browser: 'UC无', userAgent: 'UCWEB7.0.2.37/28/999' },
        { platform: 'Mobile', browser: 'UC标准', userAgent: 'NOKIA5700/ UCWEB7.0.2.37/28/999' },
        { platform: 'Mobile', browser: 'UCOpenwave', userAgent: 'Openwave/ UCWEB7.0.2.37/28/999' },
        { platform: 'Mobile', browser: 'UC Opera', userAgent: 'Mozilla/4.0 (compatible; MSIE 6.0; ) Opera/UCWEB7.0.2.37/28/999' }
]
</script>
