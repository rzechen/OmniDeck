import Vue from 'vue'
import VueRouter from 'vue-router'
import Layout from '@/layout/index.vue'
import BuddyLayout from '@/layout/BuddyLayout.vue'

Vue.use(VueRouter)

const routes = [
  // OmniBuddy 独立视图：侧边栏为「任务列表（按展示名分组）」，顶栏为多 tab 页签
  {
    path: '/omnibuddy',
    component: BuddyLayout,
    children: [
      {
        path: '',
        name: 'OmniBuddy',
        component: () => import('@/views/omnibuddy/chat.vue'),
        meta: { title: 'OmniBuddy' }
      },
      {
        path: 'workspace',
        name: 'OmniBuddyWorkspace',
        component: () => import('@/views/omnibuddy/workspace.vue'),
        meta: { title: '工作空间' }
      },
      {
        path: 'providers',
        name: 'OmniBuddyProviders',
        component: () => import('@/views/omnibuddy/providers.vue'),
        meta: { title: '模型供应商' }
      },
      {
        path: 'mcp',
        name: 'OmniBuddyMcp',
        component: () => import('@/views/omnibuddy/mcp.vue'),
        meta: { title: 'MCP 服务' }
      },
      {
        path: 'skills',
        name: 'OmniBuddySkills',
        component: () => import('@/views/omnibuddy/skills.vue'),
        meta: { title: 'Skills 管理' }
      },
      {
        path: 'market',
        name: 'OmniBuddyMarket',
        component: () => import('@/views/omnibuddy/market.vue'),
        meta: { title: '资源市场' }
      }
    ]
  },
  // 快捷面板（P0-M1）：Spotlight 式独立壳页（不挂任何 Layout；
  // 锁定遮罩由 App.vue 全局 AppLock 组件覆盖，无需本页处理）
  {
    path: '/quick',
    name: 'QuickPanel',
    component: () => import('@/views/quick/index.vue'),
    meta: { title: '快捷面板' }
  },
  {
    path: '/',
    component: Layout,
    // 临时将 OmniBuddy 设为应用主入口（原默认重定向到首页 /home）
    redirect: '/omnibuddy',
    children: [
      {
        path: 'home',
        name: 'Home',
        component: () => import('@/views/home/index.vue'),
        meta: { title: '首页' }
      },
      // 我的收藏
      {
        path: 'favorites',
        name: 'Favorites',
        component: () => import('@/views/favorites/index.vue'),
        meta: { title: '我的收藏' }
      },
      // 工具分类
      {
        path: 'tools/format',
        name: 'Format',
        component: () => import('@/views/tools/format/index.vue'),
        meta: { title: '格式化', group: 'tools' }
      },
      // 格式化分类下的具体工具
      {
        path: 'tools/format/json',
        name: 'FormatJson',
        component: () => import('@/views/tools/format/json.vue'),
        meta: { title: 'JSON 格式化', group: 'tools' }
      },
      {
        path: 'tools/format/markdown',
        name: 'FormatMarkdown',
        component: () => import('@/views/tools/format/markdown.vue'),
        meta: { title: 'Markdown 格式化', group: 'tools' }
      },
      {
        path: 'tools/format/yaml',
        name: 'FormatYaml',
        component: () => import('@/views/tools/format/yaml.vue'),
        meta: { title: 'YAML 格式化', group: 'tools' }
      },
      {
        path: 'tools/format/css',
        name: 'FormatCss',
        component: () => import('@/views/tools/format/css.vue'),
        meta: { title: 'CSS 格式化', group: 'tools' }
      },
      {
        path: 'tools/format/sql',
        name: 'FormatSql',
        component: () => import('@/views/tools/format/sql.vue'),
        meta: { title: 'SQL 格式化', group: 'tools' }
      },
      {
        path: 'tools/format/var-name',
        name: 'FormatVarName',
        component: () => import('@/views/tools/format/var-name.vue'),
        meta: { title: '变量名格式化', group: 'tools' }
      },
      {
        path: 'tools/convert',
        name: 'Convert',
        component: () => import('@/views/tools/convert/index.vue'),
        meta: { title: '转换', group: 'tools' }
      },
      // 转换分类下的具体工具
      {
        path: 'tools/convert/regex',
        name: 'ConvertRegex',
        component: () => import('@/views/tools/convert/regex.vue'),
        meta: { title: '正则表达式测试器', group: 'tools' }
      },
      {
        path: 'tools/convert/timestamp',
        name: 'ConvertTimestamp',
        component: () => import('@/views/tools/convert/timestamp.vue'),
        meta: { title: '时间戳转换', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-sql',
        name: 'ConvertJsonToSql',
        component: () => import('@/views/tools/convert/json-to-sql.vue'),
        meta: { title: 'JSON 转 SQL', group: 'tools' }
      },
      {
        path: 'tools/convert/sql-to-json',
        name: 'ConvertSqlToJson',
        component: () => import('@/views/tools/convert/sql-to-json.vue'),
        meta: { title: 'SQL 转 JSON', group: 'tools' }
      },
      {
        path: 'tools/convert/csv-to-json',
        name: 'ConvertCsvToJson',
        component: () => import('@/views/tools/convert/csv-to-json.vue'),
        meta: { title: 'CSV 转 JSON', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-yaml',
        name: 'ConvertJsonYaml',
        component: () => import('@/views/tools/convert/json-to-yaml.vue'),
        meta: { title: 'JSON 转 YAML', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-xml',
        name: 'ConvertJsonXml',
        component: () => import('@/views/tools/convert/json-to-xml.vue'),
        meta: { title: 'JSON 转 XML', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-excel',
        name: 'ConvertJsonToExcel',
        component: () => import('@/views/tools/convert/json-to-excel.vue'),
        meta: { title: 'JSON 转 Excel', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-java',
        name: 'ConvertJsonToJava',
        component: () => import('@/views/tools/convert/json-to-java.vue'),
        meta: { title: 'JSON 转 Java', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-go',
        name: 'ConvertJsonToGo',
        component: () => import('@/views/tools/convert/json-to-go.vue'),
        meta: { title: 'JSON 转 Go', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-js',
        name: 'ConvertJsonToJs',
        component: () => import('@/views/tools/convert/json-to-js.vue'),
        meta: { title: 'JSON 转 JavaScript', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-ts',
        name: 'ConvertJsonToTs',
        component: () => import('@/views/tools/convert/json-to-ts.vue'),
        meta: { title: 'JSON 转 TypeScript', group: 'tools' }
      },
      {
        path: 'tools/unit',
        name: 'Unit',
        component: () => import('@/views/tools/unit/index.vue'),
        meta: { title: '换算', group: 'tools' }
      },
      // 换算分类下的具体工具
      {
        path: 'tools/unit/bytes',
        name: 'UnitBytes',
        component: () => import('@/views/tools/unit/bytes.vue'),
        meta: { title: '字节单位换算', group: 'tools' }
      },
      {
        path: 'tools/unit/time',
        name: 'UnitTime',
        component: () => import('@/views/tools/unit/time.vue'),
        meta: { title: '时间单位换算', group: 'tools' }
      },
      {
        path: 'tools/unit/rate',
        name: 'UnitRate',
        component: () => import('@/views/tools/unit/rate.vue'),
        meta: { title: '速率换算', group: 'tools' }
      },
      {
        path: 'tools/unit/length',
        name: 'UnitLength',
        component: () => import('@/views/tools/unit/length.vue'),
        meta: { title: '长度换算', group: 'tools' }
      },
      {
        path: 'tools/unit/weight',
        name: 'UnitWeight',
        component: () => import('@/views/tools/unit/weight.vue'),
        meta: { title: '重量换算', group: 'tools' }
      },
      {
        path: 'tools/unit/area',
        name: 'UnitArea',
        component: () => import('@/views/tools/unit/area.vue'),
        meta: { title: '面积换算', group: 'tools' }
      },
      {
        path: 'tools/unit/volume',
        name: 'UnitVolume',
        component: () => import('@/views/tools/unit/volume.vue'),
        meta: { title: '体积换算', group: 'tools' }
      },
      {
        path: 'tools/unit/temperature',
        name: 'UnitTemperature',
        component: () => import('@/views/tools/unit/temperature.vue'),
        meta: { title: '温度换算', group: 'tools' }
      },
      {
        path: 'tools/unit/pressure',
        name: 'UnitPressure',
        component: () => import('@/views/tools/unit/pressure.vue'),
        meta: { title: '压力换算', group: 'tools' }
      },
      {
        path: 'tools/encrypt',
        name: 'Encrypt',
        component: () => import('@/views/tools/encrypt/index.vue'),
        meta: { title: '加密', group: 'tools' }
      },
      // 加密分类下的具体工具
      {
        path: 'tools/encrypt/password',
        name: 'EncryptPassword',
        component: () => import('@/views/tools/encrypt/password.vue'),
        meta: { title: '随机密码生成', group: 'tools' }
      },
      {
        path: 'tools/encrypt/encode-decode',
        name: 'EncryptUrlCodec',
        component: () => import('@/views/tools/encrypt/encode-decode.vue'),
        meta: { title: 'URL 编解码', group: 'tools' }
      },
      {
        path: 'tools/encrypt/hash',
        name: 'EncryptHash',
        component: () => import('@/views/tools/encrypt/hash.vue'),
        meta: { title: 'Hash 计算', group: 'tools' }
      },
      {
        path: 'tools/encrypt/base',
        name: 'EncryptBase',
        component: () => import('@/views/tools/encrypt/base.vue'),
        meta: { title: 'Base 编解码', group: 'tools' }
      },
      {
        path: 'tools/encrypt/aes-des',
        name: 'EncryptAesDes',
        component: () => import('@/views/tools/encrypt/aes-des.vue'),
        meta: { title: 'AES/DES 加解密', group: 'tools' }
      },
      {
        path: 'tools/encrypt/rsa',
        name: 'EncryptRsa',
        component: () => import('@/views/tools/encrypt/rsa.vue'),
        meta: { title: 'RSA 加解密', group: 'tools' }
      },
      {
        path: 'tools/image',
        name: 'Image',
        component: () => import('@/views/tools/image/index.vue'),
        meta: { title: '图像', group: 'tools' }
      },
      // 图像分类下的具体工具
      {
        path: 'tools/image/to-base64',
        name: 'ImageToBase64',
        component: () => import('@/views/tools/image/to-base64.vue'),
        meta: { title: '图片转 Base64', group: 'tools' }
      },
      {
        path: 'tools/image/format-convert',
        name: 'ImageFormatConvert',
        component: () => import('@/views/tools/image/format-convert.vue'),
        meta: { title: '图片格式转换', group: 'tools' }
      },
      {
        path: 'tools/image/flip',
        name: 'ImageFlip',
        component: () => import('@/views/tools/image/flip.vue'),
        meta: { title: '图片翻转', group: 'tools' }
      },
      {
        path: 'tools/image/compress',
        name: 'ImageCompress',
        component: () => import('@/views/tools/image/compress.vue'),
        meta: { title: '图片压缩', group: 'tools' }
      },
      {
        path: 'tools/image/make-gif',
        name: 'ImageMakeGif',
        component: () => import('@/views/tools/image/make-gif.vue'),
        meta: { title: 'GIF 制作', group: 'tools' }
      },
      {
        path: 'tools/image/watermark',
        name: 'ImageWatermark',
        component: () => import('@/views/tools/image/watermark.vue'),
        meta: { title: '图片水印', group: 'tools' }
      },
      {
        path: 'tools/image/text-to-img',
        name: 'ImageTextToImg',
        component: () => import('@/views/tools/image/text-to-img.vue'),
        meta: { title: '文字转图片', group: 'tools' }
      },
      {
        path: 'tools/image/qrcode',
        name: 'ImageQrcode',
        component: () => import('@/views/tools/image/qrcode.vue'),
        meta: { title: '二维码生成', group: 'tools' }
      },
      {
        path: 'tools/text',
        name: 'Text',
        component: () => import('@/views/tools/text/index.vue'),
        meta: { title: '文本', group: 'tools' }
      },
      // 文本分类下的具体工具
      {
        path: 'tools/text/vlookup',
        name: 'TextVlookup',
        component: () => import('@/views/tools/text/vlookup.vue'),
        meta: { title: 'VLookup', group: 'tools' }
      },
      {
        path: 'tools/text/uplowercase',
        name: 'TextUplowercase',
        component: () => import('@/views/tools/text/uplowercase.vue'),
        meta: { title: '大小写转换', group: 'tools' }
      },
      {
        path: 'tools/text/to-mars',
        name: 'TextToMars',
        component: () => import('@/views/tools/text/to-mars.vue'),
        meta: { title: '火星文转换', group: 'tools' }
      },
      {
        path: 'tools/text/whiteboard',
        name: 'TextWhiteboard',
        component: () => import('@/views/tools/text/whiteboard.vue'),
        meta: { title: '白板', group: 'tools' }
      },
      {
        path: 'tools/life',
        name: 'Life',
        component: () => import('@/views/tools/life/index.vue'),
        meta: { title: '生活', group: 'tools' }
      },
      // 生活分类下的具体工具
      {
        path: 'tools/life/bmi',
        name: 'LifeBmi',
        component: () => import('@/views/tools/life/bmi.vue'),
        meta: { title: 'BMI 计算', group: 'tools' }
      },
      {
        path: 'tools/life/blood-pressure',
        name: 'LifeBloodPressure',
        component: () => import('@/views/tools/life/blood-pressure.vue'),
        meta: { title: '血压范围', group: 'tools' }
      },
      {
        path: 'tools/life/calendar',
        name: 'LifeCalendar',
        component: () => import('@/views/tools/life/calendar.vue'),
        meta: { title: '日历', group: 'tools' }
      },
      {
        path: 'tools/life/loan',
        name: 'LifeLoan',
        component: () => import('@/views/tools/life/loan.vue'),
        meta: { title: '贷款计算', group: 'tools' }
      },
      {
        path: 'tools/life/car-number',
        name: 'LifeCarNumber',
        component: () => import('@/views/tools/life/car-number.vue'),
        meta: { title: '车牌归属', group: 'tools' }
      },
      {
        path: 'tools/life/idcard',
        name: 'LifeIdcard',
        component: () => import('@/views/tools/life/idcard.vue'),
        meta: { title: '身份证查询', group: 'tools' }
      },
      {
        path: 'tools/life/history',
        name: 'LifeHistory',
        component: () => import('@/views/tools/life/history.vue'),
        meta: { title: '历史朝代', group: 'tools' }
      },
      {
        path: 'tools/life/emperor',
        name: 'LifeEmperor',
        component: () => import('@/views/tools/life/emperor.vue'),
        meta: { title: '历代帝王', group: 'tools' }
      },
      {
        path: 'tools/life/area-code',
        name: 'LifeAreaCode',
        component: () => import('@/views/tools/life/area-code.vue'),
        meta: { title: '区号查询', group: 'tools' }
      },
      {
        path: 'tools/life/area-domain',
        name: 'LifeAreaDomain',
        component: () => import('@/views/tools/life/area-domain.vue'),
        meta: { title: '域名后缀', group: 'tools' }
      },
      {
        path: 'tools/life/flag',
        name: 'LifeFlag',
        component: () => import('@/views/tools/life/flag.vue'),
        meta: { title: '国旗', group: 'tools' }
      },
      {
        path: 'tools/life/relationship',
        name: 'LifeRelationship',
        component: () => import('@/views/tools/life/relationship.vue'),
        meta: { title: '亲戚称谓', group: 'tools' }
      },
      // 理财分组：基金
      {
        path: 'finance/fund',
        name: 'Fund',
        component: () => import('@/views/finance/fund.vue'),
        meta: { title: '基金', group: 'finance' }
      },
      {
        path: 'finance/fund/:code',
        name: 'FundDetail',
        component: () => import('@/views/finance/detail.vue'),
        meta: { title: '基金详情', group: 'finance' }
      },
      // 理财分组：黄金（TODO 占位）
      {
        path: 'finance/gold',
        name: 'Gold',
        component: () => import('@/views/finance/gold.vue'),
        meta: { title: '黄金', group: 'finance' }
      },
      // 旧基金路径重定向（兼容收藏等历史入口）
      { path: 'fund', redirect: '/finance/fund' },
      { path: 'fund/:code', redirect: to => '/finance/fund/' + to.params.code },
      { path: 'tools/fund', redirect: '/finance/fund' },
      { path: 'tools/fund/portfolio', redirect: '/finance/fund' },
      { path: 'tools/fund/:code', redirect: to => '/finance/fund/' + to.params.code },
      {
        path: 'tools/other',
        name: 'Other',
        component: () => import('@/views/tools/other/index.vue'),
        meta: { title: '其它', group: 'tools' }
      },
      // 其它分类下的具体工具
      {
        path: 'tools/other/api',
        name: 'OtherApi',
        component: () => import('@/views/tools/other/api.vue'),
        meta: { title: 'API 调试', group: 'tools' }
      },
      {
        path: 'tools/other/cron',
        name: 'OtherCron',
        component: () => import('@/views/tools/other/cron.vue'),
        meta: { title: 'Cron 表达式', group: 'tools' }
      },
      {
        path: 'tools/other/coin-flip',
        name: 'OtherCoinFlip',
        component: () => import('@/views/tools/other/coin-flip.vue'),
        meta: { title: '抛硬币', group: 'tools' }
      },
      {
        path: 'tools/other/lottery',
        name: 'OtherLottery',
        component: () => import('@/views/tools/other/lottery.vue'),
        meta: { title: '抽奖', group: 'tools' }
      },
      {
        path: 'tools/other/world-clock',
        name: 'OtherWorldClock',
        component: () => import('@/views/tools/other/world-clock.vue'),
        meta: { title: '世界时钟', group: 'tools' }
      },
      {
        path: 'tools/other/http-status',
        name: 'OtherHttpStatus',
        component: () => import('@/views/tools/other/http-status.vue'),
        meta: { title: 'HTTP 状态码', group: 'tools' }
      },
      {
        path: 'tools/other/http-method',
        name: 'OtherHttpMethod',
        component: () => import('@/views/tools/other/http-method.vue'),
        meta: { title: 'HTTP 方法', group: 'tools' }
      },
      {
        path: 'tools/other/eascii',
        name: 'OtherEascii',
        component: () => import('@/views/tools/other/eascii.vue'),
        meta: { title: '扩展 ASCII', group: 'tools' }
      },
      {
        path: 'tools/other/keyboard-symbol',
        name: 'OtherKeyboardSymbol',
        component: () => import('@/views/tools/other/keyboard-symbol.vue'),
        meta: { title: '键盘符号', group: 'tools' }
      },
      {
        path: 'tools/other/tcp-udp',
        name: 'OtherTcpUdp',
        component: () => import('@/views/tools/other/tcp-udp.vue'),
        meta: { title: 'TCP/UDP 端口', group: 'tools' }
      },
      {
        path: 'tools/other/js-events',
        name: 'OtherJsEvents',
        component: () => import('@/views/tools/other/js-events.vue'),
        meta: { title: 'JS 事件', group: 'tools' }
      },
      {
        path: 'tools/other/user-agent',
        name: 'OtherUserAgent',
        component: () => import('@/views/tools/other/user-agent.vue'),
        meta: { title: 'User-Agent', group: 'tools' }
      },
      {
        path: 'tools/other/special-symbol',
        name: 'OtherSpecialSymbol',
        component: () => import('@/views/tools/other/special-symbol.vue'),
        meta: { title: '特殊符号', group: 'tools' }
      },
      {
        path: 'tools/other/word-shortcut',
        name: 'OtherWordShortcut',
        component: () => import('@/views/tools/other/word-shortcut.vue'),
        meta: { title: 'Word 快捷键', group: 'tools' }
      },
      {
        path: 'tools/other/excel-shortcut',
        name: 'OtherExcelShortcut',
        component: () => import('@/views/tools/other/excel-shortcut.vue'),
        meta: { title: 'Excel 快捷键', group: 'tools' }
      },
      {
        path: 'tools/other/ip-query',
        name: 'OtherIpQuery',
        component: () => import('@/views/tools/other/ip-query.vue'),
        meta: { title: 'IP 查询', group: 'tools' }
      },
      {
        path: 'tools/other/dns',
        name: 'OtherDns',
        component: () => import('@/views/tools/other/dns.vue'),
        meta: { title: 'DNS 查询', group: 'tools' }
      },
      // 设置
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/settings/index.vue'),
        meta: { title: '设置' }
      },
      // 版本
      {
        path: 'version',
        name: 'Version',
        component: () => import('@/views/version/index.vue'),
        meta: { title: '版本' }
      },
      // 我的代办（日历视图）
      {
        path: 'todo',
        name: 'Todo',
        component: () => import('@/views/todo/index.vue'),
        meta: { title: '我的代办' }
      },
      // 问题反馈
      {
        path: 'feedback',
        name: 'Feedback',
        component: () => import('@/views/feedback/index.vue'),
        meta: { title: '问题反馈' }
      }
    ]
  }
]

const router = new VueRouter({
  mode: 'hash',
  routes
})

// 记录 deck 主界面最后所在页面：从 OmniBuddy「返回 OmniDeck」时
// 回到进入前的页面（而非固定回首页）；快捷面板为独立窗口壳页，不参与记录
router.afterEach((to) => {
  if (!to.path.startsWith('/omnibuddy') && to.path !== '/quick') {
    router.lastDeckPath = to.path
  }
})

// 空闲时预取工具页分包：消除点击卡片进入工具页时的
// 分包下载/解析阻塞（表现为"卡一下再闪一下"）
// 逐个错峰预取，避免与首屏渲染争抢资源；失败静默（不影响正常导航）
export function prefetchToolChunks() {
  const idle = window.requestIdleCallback || (cb => setTimeout(cb, 1200))
  idle(async () => {
    for (const route of routes) {
      for (const child of route.children || []) {
        if (typeof child.component === 'function') {
          try {
            await child.component()
          } catch (e) {
            /* 预取失败忽略：导航时仍会正常加载 */
          }
        }
      }
    }
  })
}

export default router
