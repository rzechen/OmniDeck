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
        component: () => import('@/views/buddy/chat/index.vue'),
        meta: { title: 'OmniBuddy' }
      },
      {
        path: 'workspace',
        name: 'OmniBuddyWorkspace',
        component: () => import('@/views/buddy/workspace/index.vue'),
        meta: { title: '工作空间' }
      },
      {
        path: 'providers',
        name: 'OmniBuddyProviders',
        component: () => import('@/views/buddy/providers/index.vue'),
        meta: { title: '模型供应商' }
      },
      {
        path: 'mcp',
        name: 'OmniBuddyMcp',
        component: () => import('@/views/buddy/mcp/index.vue'),
        meta: { title: '连接器' }
      },
      {
        path: 'skills',
        name: 'OmniBuddySkills',
        component: () => import('@/views/buddy/skills/index.vue'),
        meta: { title: '技能' }
      },
      {
        path: 'rules',
        name: 'OmniBuddyRules',
        component: () => import('@/views/buddy/rules/index.vue'),
        meta: { title: '项目规则' }
      },
      {
        path: 'market',
        name: 'OmniBuddyMarket',
        component: () => import('@/views/buddy/market/index.vue'),
        meta: { title: '资源市场' }
      },
      {
        path: 'usage',
        name: 'OmniBuddyUsage',
        component: () => import('@/views/buddy/usage/index.vue'),
        meta: { title: '用量统计' }
      },
      // 全局设置：与 Deck 视图 /settings 复用同一组件（应用级配置，双视图均可达）
      {
        path: 'settings',
        name: 'OmniBuddySettings',
        component: () => import('@/views/shared/settings/index.vue'),
        meta: { title: '设置' }
      }
    ]
  },
  // 快捷面板（P0-M1）：Spotlight 式独立壳页（不挂任何 Layout；
  // 锁定遮罩由 App.vue 全局 AppLock 组件覆盖，无需本页处理）
  {
    path: '/quick',
    name: 'QuickPanel',
    component: () => import('@/views/shell/quick/index.vue'),
    meta: { title: '快捷面板' }
  },
  // 选区截屏覆盖窗（P0-M4）：铺满单屏的透明框选层（主进程 capture.js
  // 按每显示器开窗加载本页），独立壳页不挂 Layout
  {
    path: '/capture-overlay',
    name: 'CaptureOverlay',
    component: () => import('@/views/shell/capture-overlay/index.vue'),
    meta: { title: '区域截屏' }
  },
  // 长截图控制条小窗（P2）：选区完成后由主进程 capture.js openScrollCtrl
  // 加载本页（208×44 无边框置顶小窗），提供拍一帧/完成/取消操作
  {
    path: '/capture-scroll-ctrl',
    name: 'CaptureScrollCtrl',
    component: () => import('@/views/shell/capture-scroll-ctrl/index.vue'),
    meta: { title: '长截图' }
  },
  // 截图标注编辑窗：选区定格后由主进程 openEditorAndWait 加载本页，
  // 底层显示定格帧，Canvas 标注（矩形/椭圆/直线/箭头/马赛克/文字），
  // 确认/贴屏/取消经 capture-editor:done 回传
  {
    path: '/capture-editor',
    name: 'CaptureEditor',
    component: () => import('@/views/shell/capture-editor/index.vue'),
    meta: { title: '截图标注' }
  },
  // 贴屏小窗：标注结果贴到屏幕（置顶可拖动/缩放，双击关闭）
  {
    path: '/capture-pin',
    name: 'CapturePin',
    component: () => import('@/views/shell/capture-pin/index.vue'),
    meta: { title: '贴图' }
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
        component: () => import('@/views/deck/home/index.vue'),
        meta: { title: '首页' }
      },
      // 我的收藏
      {
        path: 'favorites',
        name: 'Favorites',
        component: () => import('@/views/deck/favorites/index.vue'),
        meta: { title: '我的收藏' }
      },
      // 工具分类
      {
        path: 'tools/format',
        name: 'Format',
        component: () => import('@/views/deck/tools/format/index.vue'),
        meta: { title: '格式化', group: 'tools' }
      },
      // 格式化分类下的具体工具
      {
        path: 'tools/format/json',
        name: 'FormatJson',
        component: () => import('@/views/deck/tools/format/json.vue'),
        meta: { title: 'JSON 格式化', group: 'tools' }
      },
      {
        path: 'tools/format/markdown',
        name: 'FormatMarkdown',
        component: () => import('@/views/deck/tools/format/markdown.vue'),
        meta: { title: 'Markdown 格式化', group: 'tools' }
      },
      {
        path: 'tools/format/yaml',
        name: 'FormatYaml',
        component: () => import('@/views/deck/tools/format/yaml.vue'),
        meta: { title: 'YAML 格式化', group: 'tools' }
      },
      {
        path: 'tools/format/css',
        name: 'FormatCss',
        component: () => import('@/views/deck/tools/format/css.vue'),
        meta: { title: 'CSS 格式化', group: 'tools' }
      },
      {
        path: 'tools/format/sql',
        name: 'FormatSql',
        component: () => import('@/views/deck/tools/format/sql.vue'),
        meta: { title: 'SQL 格式化', group: 'tools' }
      },
      {
        path: 'tools/format/var-name',
        name: 'FormatVarName',
        component: () => import('@/views/deck/tools/format/var-name.vue'),
        meta: { title: '变量名格式化', group: 'tools' }
      },
      {
        path: 'tools/convert',
        name: 'Convert',
        component: () => import('@/views/deck/tools/convert/index.vue'),
        meta: { title: '转换', group: 'tools' }
      },
      // 转换分类下的具体工具
      {
        path: 'tools/convert/regex',
        name: 'ConvertRegex',
        component: () => import('@/views/deck/tools/convert/regex.vue'),
        meta: { title: '正则表达式测试器', group: 'tools' }
      },
      {
        path: 'tools/convert/timestamp',
        name: 'ConvertTimestamp',
        component: () => import('@/views/deck/tools/convert/timestamp.vue'),
        meta: { title: '时间戳转换', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-sql',
        name: 'ConvertJsonToSql',
        component: () => import('@/views/deck/tools/convert/json-to-sql.vue'),
        meta: { title: 'JSON 转 SQL', group: 'tools' }
      },
      {
        path: 'tools/convert/sql-to-json',
        name: 'ConvertSqlToJson',
        component: () => import('@/views/deck/tools/convert/sql-to-json.vue'),
        meta: { title: 'SQL 转 JSON', group: 'tools' }
      },
      {
        path: 'tools/convert/csv-to-json',
        name: 'ConvertCsvToJson',
        component: () => import('@/views/deck/tools/convert/csv-to-json.vue'),
        meta: { title: 'CSV 转 JSON', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-yaml',
        name: 'ConvertJsonYaml',
        component: () => import('@/views/deck/tools/convert/json-to-yaml.vue'),
        meta: { title: 'JSON 转 YAML', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-xml',
        name: 'ConvertJsonXml',
        component: () => import('@/views/deck/tools/convert/json-to-xml.vue'),
        meta: { title: 'JSON 转 XML', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-excel',
        name: 'ConvertJsonToExcel',
        component: () => import('@/views/deck/tools/convert/json-to-excel.vue'),
        meta: { title: 'JSON 转 Excel', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-java',
        name: 'ConvertJsonToJava',
        component: () => import('@/views/deck/tools/convert/json-to-java.vue'),
        meta: { title: 'JSON 转 Java', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-go',
        name: 'ConvertJsonToGo',
        component: () => import('@/views/deck/tools/convert/json-to-go.vue'),
        meta: { title: 'JSON 转 Go', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-js',
        name: 'ConvertJsonToJs',
        component: () => import('@/views/deck/tools/convert/json-to-js.vue'),
        meta: { title: 'JSON 转 JavaScript', group: 'tools' }
      },
      {
        path: 'tools/convert/json-to-ts',
        name: 'ConvertJsonToTs',
        component: () => import('@/views/deck/tools/convert/json-to-ts.vue'),
        meta: { title: 'JSON 转 TypeScript', group: 'tools' }
      },
      {
        path: 'tools/unit',
        name: 'Unit',
        component: () => import('@/views/deck/tools/unit/index.vue'),
        meta: { title: '换算', group: 'tools' }
      },
      // 换算分类下的具体工具
      {
        path: 'tools/unit/bytes',
        name: 'UnitBytes',
        component: () => import('@/views/deck/tools/unit/bytes.vue'),
        meta: { title: '字节单位换算', group: 'tools' }
      },
      {
        path: 'tools/unit/time',
        name: 'UnitTime',
        component: () => import('@/views/deck/tools/unit/time.vue'),
        meta: { title: '时间单位换算', group: 'tools' }
      },
      {
        path: 'tools/unit/rate',
        name: 'UnitRate',
        component: () => import('@/views/deck/tools/unit/rate.vue'),
        meta: { title: '速率换算', group: 'tools' }
      },
      {
        path: 'tools/unit/length',
        name: 'UnitLength',
        component: () => import('@/views/deck/tools/unit/length.vue'),
        meta: { title: '长度换算', group: 'tools' }
      },
      {
        path: 'tools/unit/weight',
        name: 'UnitWeight',
        component: () => import('@/views/deck/tools/unit/weight.vue'),
        meta: { title: '重量换算', group: 'tools' }
      },
      {
        path: 'tools/unit/area',
        name: 'UnitArea',
        component: () => import('@/views/deck/tools/unit/area.vue'),
        meta: { title: '面积换算', group: 'tools' }
      },
      {
        path: 'tools/unit/volume',
        name: 'UnitVolume',
        component: () => import('@/views/deck/tools/unit/volume.vue'),
        meta: { title: '体积换算', group: 'tools' }
      },
      {
        path: 'tools/unit/temperature',
        name: 'UnitTemperature',
        component: () => import('@/views/deck/tools/unit/temperature.vue'),
        meta: { title: '温度换算', group: 'tools' }
      },
      {
        path: 'tools/unit/pressure',
        name: 'UnitPressure',
        component: () => import('@/views/deck/tools/unit/pressure.vue'),
        meta: { title: '压力换算', group: 'tools' }
      },
      {
        path: 'tools/encrypt',
        name: 'Encrypt',
        component: () => import('@/views/deck/tools/encrypt/index.vue'),
        meta: { title: '加密', group: 'tools' }
      },
      // 加密分类下的具体工具
      {
        path: 'tools/encrypt/password',
        name: 'EncryptPassword',
        component: () => import('@/views/deck/tools/encrypt/password.vue'),
        meta: { title: '随机密码生成', group: 'tools' }
      },
      {
        path: 'tools/encrypt/encode-decode',
        name: 'EncryptUrlCodec',
        component: () => import('@/views/deck/tools/encrypt/encode-decode.vue'),
        meta: { title: 'URL 编解码', group: 'tools' }
      },
      {
        path: 'tools/encrypt/hash',
        name: 'EncryptHash',
        component: () => import('@/views/deck/tools/encrypt/hash.vue'),
        meta: { title: 'Hash 计算', group: 'tools' }
      },
      {
        path: 'tools/encrypt/base',
        name: 'EncryptBase',
        component: () => import('@/views/deck/tools/encrypt/base.vue'),
        meta: { title: 'Base 编解码', group: 'tools' }
      },
      {
        path: 'tools/encrypt/aes-des',
        name: 'EncryptAesDes',
        component: () => import('@/views/deck/tools/encrypt/aes-des.vue'),
        meta: { title: 'AES/DES 加解密', group: 'tools' }
      },
      {
        path: 'tools/encrypt/rsa',
        name: 'EncryptRsa',
        component: () => import('@/views/deck/tools/encrypt/rsa.vue'),
        meta: { title: 'RSA 加解密', group: 'tools' }
      },
      {
        path: 'tools/image',
        name: 'Image',
        component: () => import('@/views/deck/tools/image/index.vue'),
        meta: { title: '图像', group: 'tools' }
      },
      // 图像分类下的具体工具
      {
        path: 'tools/image/to-base64',
        name: 'ImageToBase64',
        component: () => import('@/views/deck/tools/image/to-base64.vue'),
        meta: { title: '图片转 Base64', group: 'tools' }
      },
      {
        path: 'tools/image/format-convert',
        name: 'ImageFormatConvert',
        component: () => import('@/views/deck/tools/image/format-convert.vue'),
        meta: { title: '图片格式转换', group: 'tools' }
      },
      {
        path: 'tools/image/flip',
        name: 'ImageFlip',
        component: () => import('@/views/deck/tools/image/flip.vue'),
        meta: { title: '图片翻转', group: 'tools' }
      },
      {
        path: 'tools/image/compress',
        name: 'ImageCompress',
        component: () => import('@/views/deck/tools/image/compress.vue'),
        meta: { title: '图片压缩', group: 'tools' }
      },
      {
        path: 'tools/image/make-gif',
        name: 'ImageMakeGif',
        component: () => import('@/views/deck/tools/image/make-gif.vue'),
        meta: { title: 'GIF 制作', group: 'tools' }
      },
      {
        path: 'tools/image/watermark',
        name: 'ImageWatermark',
        component: () => import('@/views/deck/tools/image/watermark.vue'),
        meta: { title: '图片水印', group: 'tools' }
      },
      {
        path: 'tools/image/text-to-img',
        name: 'ImageTextToImg',
        component: () => import('@/views/deck/tools/image/text-to-img.vue'),
        meta: { title: '文字转图片', group: 'tools' }
      },
      {
        path: 'tools/image/qrcode',
        name: 'ImageQrcode',
        component: () => import('@/views/deck/tools/image/qrcode.vue'),
        meta: { title: '二维码生成', group: 'tools' }
      },
      {
        path: 'tools/image/screenshot',
        redirect: '/clipboard'
      },
      {
        path: 'tools/text',
        name: 'Text',
        component: () => import('@/views/deck/tools/text/index.vue'),
        meta: { title: '文本', group: 'tools' }
      },
      // 文本分类下的具体工具
      {
        path: 'tools/text/vlookup',
        name: 'TextVlookup',
        component: () => import('@/views/deck/tools/text/vlookup.vue'),
        meta: { title: 'VLookup', group: 'tools' }
      },
      {
        path: 'tools/text/uplowercase',
        name: 'TextUplowercase',
        component: () => import('@/views/deck/tools/text/uplowercase.vue'),
        meta: { title: '大小写转换', group: 'tools' }
      },
      {
        path: 'tools/text/to-mars',
        name: 'TextToMars',
        component: () => import('@/views/deck/tools/text/to-mars.vue'),
        meta: { title: '火星文转换', group: 'tools' }
      },
      {
        path: 'tools/text/whiteboard',
        name: 'TextWhiteboard',
        component: () => import('@/views/deck/tools/text/whiteboard.vue'),
        meta: { title: '白板', group: 'tools' }
      },
      {
        path: 'tools/life',
        name: 'Life',
        component: () => import('@/views/deck/tools/life/index.vue'),
        meta: { title: '生活', group: 'tools' }
      },
      // 生活分类下的具体工具
      {
        path: 'tools/life/bmi',
        name: 'LifeBmi',
        component: () => import('@/views/deck/tools/life/bmi.vue'),
        meta: { title: 'BMI 计算', group: 'tools' }
      },
      {
        path: 'tools/life/blood-pressure',
        name: 'LifeBloodPressure',
        component: () => import('@/views/deck/tools/life/blood-pressure.vue'),
        meta: { title: '血压范围', group: 'tools' }
      },
      {
        path: 'tools/life/calendar',
        name: 'LifeCalendar',
        component: () => import('@/views/deck/tools/life/calendar.vue'),
        meta: { title: '日历', group: 'tools' }
      },
      {
        path: 'tools/life/loan',
        name: 'LifeLoan',
        component: () => import('@/views/deck/tools/life/loan.vue'),
        meta: { title: '贷款计算', group: 'tools' }
      },
      {
        path: 'tools/life/car-number',
        name: 'LifeCarNumber',
        component: () => import('@/views/deck/tools/life/car-number.vue'),
        meta: { title: '车牌归属', group: 'tools' }
      },
      {
        path: 'tools/life/idcard',
        name: 'LifeIdcard',
        component: () => import('@/views/deck/tools/life/idcard.vue'),
        meta: { title: '身份证查询', group: 'tools' }
      },
      {
        path: 'tools/life/history',
        name: 'LifeHistory',
        component: () => import('@/views/deck/tools/life/history.vue'),
        meta: { title: '历史朝代', group: 'tools' }
      },
      {
        path: 'tools/life/emperor',
        name: 'LifeEmperor',
        component: () => import('@/views/deck/tools/life/emperor.vue'),
        meta: { title: '历代帝王', group: 'tools' }
      },
      {
        path: 'tools/life/area-code',
        name: 'LifeAreaCode',
        component: () => import('@/views/deck/tools/life/area-code.vue'),
        meta: { title: '区号查询', group: 'tools' }
      },
      {
        path: 'tools/life/area-domain',
        name: 'LifeAreaDomain',
        component: () => import('@/views/deck/tools/life/area-domain.vue'),
        meta: { title: '域名后缀', group: 'tools' }
      },
      {
        path: 'tools/life/flag',
        name: 'LifeFlag',
        component: () => import('@/views/deck/tools/life/flag.vue'),
        meta: { title: '国旗', group: 'tools' }
      },
      {
        path: 'tools/life/relationship',
        name: 'LifeRelationship',
        component: () => import('@/views/deck/tools/life/relationship.vue'),
        meta: { title: '亲戚称谓', group: 'tools' }
      },
      // 理财分组：基金
      {
        path: 'finance/fund',
        name: 'Fund',
        component: () => import('@/views/deck/finance/fund.vue'),
        meta: { title: '基金', group: 'finance' }
      },
      {
        path: 'finance/fund/:code',
        name: 'FundDetail',
        component: () => import('@/views/deck/finance/detail.vue'),
        meta: { title: '基金详情', group: 'finance' }
      },
      // 理财分组：黄金（TODO 占位）
      {
        path: 'finance/gold',
        name: 'Gold',
        component: () => import('@/views/deck/finance/gold.vue'),
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
        component: () => import('@/views/deck/tools/other/index.vue'),
        meta: { title: '其它', group: 'tools' }
      },
      // 其它分类下的具体工具
      {
        path: 'tools/other/api',
        name: 'OtherApi',
        component: () => import('@/views/deck/tools/other/api.vue'),
        meta: { title: 'API 调试', group: 'tools' }
      },
      {
        path: 'tools/other/cron',
        name: 'OtherCron',
        component: () => import('@/views/deck/tools/other/cron.vue'),
        meta: { title: 'Cron 表达式', group: 'tools' }
      },
      {
        path: 'tools/other/coin-flip',
        name: 'OtherCoinFlip',
        component: () => import('@/views/deck/tools/other/coin-flip.vue'),
        meta: { title: '抛硬币', group: 'tools' }
      },
      {
        path: 'tools/other/lottery',
        name: 'OtherLottery',
        component: () => import('@/views/deck/tools/other/lottery.vue'),
        meta: { title: '抽奖', group: 'tools' }
      },
      {
        path: 'tools/other/world-clock',
        name: 'OtherWorldClock',
        component: () => import('@/views/deck/tools/other/world-clock.vue'),
        meta: { title: '世界时钟', group: 'tools' }
      },
      {
        path: 'tools/other/http-status',
        name: 'OtherHttpStatus',
        component: () => import('@/views/deck/tools/other/http-status.vue'),
        meta: { title: 'HTTP 状态码', group: 'tools' }
      },
      {
        path: 'tools/other/http-method',
        name: 'OtherHttpMethod',
        component: () => import('@/views/deck/tools/other/http-method.vue'),
        meta: { title: 'HTTP 方法', group: 'tools' }
      },
      {
        path: 'tools/other/eascii',
        name: 'OtherEascii',
        component: () => import('@/views/deck/tools/other/eascii.vue'),
        meta: { title: '扩展 ASCII', group: 'tools' }
      },
      {
        path: 'tools/other/keyboard-symbol',
        name: 'OtherKeyboardSymbol',
        component: () => import('@/views/deck/tools/other/keyboard-symbol.vue'),
        meta: { title: '键盘符号', group: 'tools' }
      },
      {
        path: 'tools/other/tcp-udp',
        name: 'OtherTcpUdp',
        component: () => import('@/views/deck/tools/other/tcp-udp.vue'),
        meta: { title: 'TCP/UDP 端口', group: 'tools' }
      },
      {
        path: 'tools/other/js-events',
        name: 'OtherJsEvents',
        component: () => import('@/views/deck/tools/other/js-events.vue'),
        meta: { title: 'JS 事件', group: 'tools' }
      },
      {
        path: 'tools/other/user-agent',
        name: 'OtherUserAgent',
        component: () => import('@/views/deck/tools/other/user-agent.vue'),
        meta: { title: 'User-Agent', group: 'tools' }
      },
      {
        path: 'tools/other/special-symbol',
        name: 'OtherSpecialSymbol',
        component: () => import('@/views/deck/tools/other/special-symbol.vue'),
        meta: { title: '特殊符号', group: 'tools' }
      },
      {
        path: 'tools/other/word-shortcut',
        name: 'OtherWordShortcut',
        component: () => import('@/views/deck/tools/other/word-shortcut.vue'),
        meta: { title: 'Word 快捷键', group: 'tools' }
      },
      {
        path: 'tools/other/excel-shortcut',
        name: 'OtherExcelShortcut',
        component: () => import('@/views/deck/tools/other/excel-shortcut.vue'),
        meta: { title: 'Excel 快捷键', group: 'tools' }
      },
      {
        path: 'tools/other/ip-query',
        name: 'OtherIpQuery',
        component: () => import('@/views/deck/tools/other/ip-query.vue'),
        meta: { title: 'IP 查询', group: 'tools' }
      },
      {
        path: 'tools/other/dns',
        name: 'OtherDns',
        component: () => import('@/views/deck/tools/other/dns.vue'),
        meta: { title: 'DNS 查询', group: 'tools' }
      },
      // 设置
      {
        path: 'settings',
        name: 'Settings',
        component: () => import('@/views/shared/settings/index.vue'),
        meta: { title: '设置' }
      },
      // 版本
      {
        path: 'version',
        name: 'Version',
        component: () => import('@/views/deck/version/index.vue'),
        meta: { title: '版本' }
      },
      // 我的代办（日历视图）
      {
        path: 'todo',
        name: 'Todo',
        component: () => import('@/views/deck/todo/index.vue'),
        meta: { title: '我的代办' }
      },
      // 剪贴板（一级入口：剪贴板记录 + 截图记录）
      {
        path: 'clipboard',
        name: 'Clipboard',
        component: () => import('@/views/deck/clipboard/index.vue'),
        meta: { title: '剪贴板' }
      },
      // 问题反馈
      {
        path: 'feedback',
        name: 'Feedback',
        component: () => import('@/views/deck/feedback/index.vue'),
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
