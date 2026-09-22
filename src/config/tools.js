// 工具菜单统一配置（Sidebar / Topbar / Home / 工具分类页共用）
//
// 结构说明：
// - 每个工具组（分类）：name 路由名 / path 路由地址 / title 名称 / desc 描述
//   iconSvg SVG 图标名，约定路径：src/assets/icons/svg/deck/{iconSvg}.svg（后续补充）
//   color   图标建议主色（用于首页卡片背景色）
// - children：组内的具体工具（name 名称 / desc 描述 / path 路由地址 / icon 图标名）
//   icon 约定路径：src/assets/icons/svg/deck/{icon}.svg（未配置时渲染字母头像兜底）

const toolCategories = [
  {
    name: 'Format',
    path: '/tools/format',
    title: '格式化',
    desc: '提供 JSON、Markdown、YAML、CSS、SQL 等多种代码与数据格式的美化、压缩、校验与可视化能力，帮助开发者快速规范代码风格',
    iconSvg: 'format',
    color: '#3366FF',
    children: [
      { name: 'JSON 格式化', desc: 'JSON 编辑校验与树形可视化，支持错误定位与转义处理', path: '/tools/format/json', icon: 'json' },
      { name: 'Markdown 格式化', desc: '所见即所得编辑，支持公式与代码高亮，可导出 HTML', path: '/tools/format/markdown', icon: 'markdown' },
      { name: 'YAML 格式化', desc: 'YAML 与 XML 格式的美化、压缩与语法校验', path: '/tools/format/yaml', icon: 'doc' },
      { name: 'CSS 格式化', desc: 'CSS 代码自动格式化与压缩，支持高亮与折叠', path: '/tools/format/css', icon: 'palette' },
      { name: 'SQL 格式化', desc: '多种 SQL 方言的格式化与压缩，支持高亮显示', path: '/tools/format/sql', icon: 'database' },
      { name: '变量名格式化', desc: '变量名转驼峰、帕斯卡、下划线、中横线等命名规范', path: '/tools/format/var-name', icon: 'code' }
    ]
  },
  {
    name: 'Convert',
    path: '/tools/convert',
    title: '转换',
    desc: '涵盖正则测试、时间戳转换、JSON 与 Excel/SQL/YAML/XML 等格式互转，以及 JSON 转 Java/Go/TS 等各类语言代码生成，满足日常开发中的数据转换需求',
    iconSvg: 'convert',
    color: '#52C41A',
    children: [
      { name: '正则表达式测试器', desc: '输入正则与测试文本，实时高亮匹配结果，内置常用示例', path: '/tools/convert/regex', icon: 'regex' },
      { name: 'JSON 转 Excel', desc: 'JSON 数据解析为表格格式并导出 Excel 文件', path: '/tools/convert/json-to-excel', icon: 'excel' },
      { name: '时间戳转换', desc: '时间戳与时间格式互转，实时显示当前时间', path: '/tools/convert/timestamp', icon: 'clock' },
      { name: 'JSON 转 SQL', desc: 'JSON 转 CREATE TABLE 与 INSERT 语句', path: '/tools/convert/json-to-sql', icon: 'database' },
      { name: 'SQL 转 JSON', desc: 'INSERT 语句解析为结构化 JSON 数据', path: '/tools/convert/sql-to-json', icon: 'json' },
      { name: 'CSV 转 JSON', desc: 'CSV 数据转 JSON，支持自动识别分隔符与文件导入', path: '/tools/convert/csv-to-json', icon: 'csv' },
      { name: 'JSON 转 YAML', desc: 'JSON 与 YAML 格式无缝互转', path: '/tools/convert/json-to-yaml', icon: 'doc' },
      { name: 'JSON 转 XML', desc: 'JSON 与 XML 格式双向转换', path: '/tools/convert/json-to-xml', icon: 'xml' },
      { name: 'JSON 转 Java', desc: 'JSON 转 Java 类，支持嵌套对象与 getter/setter', path: '/tools/convert/json-to-java', icon: 'java' },
      { name: 'JSON 转 Go', desc: 'JSON 转 Go 结构体，自动生成 JSON 标签和注释', path: '/tools/convert/json-to-go', icon: 'go' },
      { name: 'JSON 转 JavaScript', desc: 'JSON 转 JS 类，自动生成 getter/setter', path: '/tools/convert/json-to-js', icon: 'javascript' },
      { name: 'JSON 转 TypeScript', desc: 'JSON 转 TS 接口，支持类型推断与可选字段', path: '/tools/convert/json-to-ts', icon: 'typescript' }
    ]
  },
  {
    name: 'Unit',
    path: '/tools/unit',
    title: '换算',
    desc: '覆盖字节、时间、速率、长度、重量、面积、体积、温度、压力等多维度单位换算，双向精准换算，满足日常开发与生活的计量转换需求',
    iconSvg: 'unit',
    color: '#2F54EB',
    children: [
      { name: '字节单位换算', desc: 'bit 到 PB 全系列存储单位双向换算', path: '/tools/unit/bytes', icon: 'storage' },
      { name: '时间单位换算', desc: '秒到年多种时间单位换算', path: '/tools/unit/time', icon: 'hourglass' },
      { name: '速率换算', desc: 'bps 到 Gbps 及 B/s 等速率单位换算', path: '/tools/unit/rate', icon: 'gauge' },
      { name: '长度换算', desc: '米到光年等长度单位换算', path: '/tools/unit/length', icon: 'ruler' },
      { name: '重量换算', desc: '克到吨等重量单位换算', path: '/tools/unit/weight', icon: 'scale' },
      { name: '面积换算', desc: '平方米到英亩等面积单位换算', path: '/tools/unit/area', icon: 'crop' },
      { name: '体积换算', desc: '立方米到加仑等体积单位换算', path: '/tools/unit/volume', icon: 'cube' },
      { name: '温度换算', desc: '摄氏度、华氏度、开尔文三种温度单位换算', path: '/tools/unit/temperature', icon: 'thermometer' },
      { name: '压力换算', desc: '帕到 psi 等压力单位换算', path: '/tools/unit/pressure', icon: 'wind' }
    ]
  },
  {
    name: 'Encrypt',
    path: '/tools/encrypt',
    title: '加密',
    desc: '提供随机密码生成、URL 编解码、多种哈希算法计算、Base 系列编码，以及 AES、DES、RSA 等对称与非对称加解密能力，保障数据安全',
    iconSvg: 'encrypt',
    color: '#FA8C16',
    children: [
      { name: '随机密码生成', desc: '自定义字符集与批量生成的强密码工具', path: '/tools/encrypt/password', icon: 'key' },
      { name: '编解码工具', desc: 'URL 编码与解码', path: '/tools/encrypt/encode-decode', icon: 'link' },
      { name: 'Hash 计算', desc: '支持 MD5、SHA1、SHA256、SHA3 等多种哈希算法', path: '/tools/encrypt/hash', icon: 'hash' },
      { name: 'Base 编码', desc: 'Base64 和 Base32 编码与解码，兼容中文 Unicode', path: '/tools/encrypt/base', icon: 'arrows' },
      { name: 'AES/DES 加解密', desc: '对称加密算法加解密，支持 ECB/CBC 模式', path: '/tools/encrypt/aes-des', icon: 'lock' },
      { name: 'RSA 加解密', desc: 'RSA 签名与加密，支持多位密钥对生成', path: '/tools/encrypt/rsa', icon: 'shield' }
    ]
  },
  {
    name: 'Image',
    path: '/tools/image',
    title: '图像',
    desc: '支持图片转 Base64、批量格式转换、角度旋转、质量压缩、GIF 合成、文字水印添加、文字渲染出图及二维码生成等常用图像处理操作',
    iconSvg: 'image',
    color: '#EB2F96',
    children: [
      { name: '图片转 Base64', desc: '图片转 Base64 Data URL 编码', path: '/tools/image/to-base64', icon: 'image' },
      { name: '图片格式转换', desc: '批量图片格式转换，支持 JPEG/WEBP/PNG', path: '/tools/image/format-convert', icon: 'arrows' },
      { name: '图片翻转', desc: '图片精确角度旋转，支持批量与打包导出', path: '/tools/image/flip', icon: 'rotate' },
      { name: '图片压缩', desc: '多图片高质量压缩，可调压缩率与输出格式', path: '/tools/image/compress', icon: 'compress' },
      { name: 'GIF 制作', desc: '多张静态图片合成 GIF 动图', path: '/tools/image/make-gif', icon: 'gif' },
      { name: '图片水印', desc: '批量添加文字水印，支持位置与透明度', path: '/tools/image/watermark', icon: 'watermark' },
      { name: '文字转图片', desc: '文字渲染为图片，自定义画布与字体', path: '/tools/image/text-to-img', icon: 'text-image' },
      { name: '二维码生成', desc: '高度可定制二维码生成，支持 Logo 嵌入', path: '/tools/image/qrcode', icon: 'qrcode' },
      { name: '截图', desc: '选区 / 全屏 / 滚动长截图，内存记录历史', path: '/tools/image/screenshot', icon: 'screenshot' }
    ]
  },
  {
    name: 'Text',
    path: '/tools/text',
    title: '文本',
    desc: '提供多表 VLookup 匹配、英文大小写转换、简繁火星文互转及在线白板绘画等文本编辑与处理功能',
    iconSvg: 'text',
    color: '#722ED1',
    children: [
      { name: 'VLookup', desc: '多 Sheet 批量关联匹配，支持十万级数据', path: '/tools/text/vlookup', icon: 'table-search' },
      { name: '大小写转换', desc: '文本转全大写或全小写，支持实时转换', path: '/tools/text/uplowercase', icon: 'case' },
      { name: '火星文转换', desc: '简体转繁体与火星文变体生成', path: '/tools/text/to-mars', icon: 'sparkle' },
      { name: '白板', desc: '基于 Canvas 的轻量白板，自由书写绘图', path: '/tools/text/whiteboard', icon: 'board' }
    ]
  },
  {
    name: 'Life',
    path: '/tools/life',
    title: '生活',
    desc: '涵盖 BMI 计算、血压分析、农历日历、房贷计算、车牌与身份证归属查询、历代帝王朝代查询、区号域名国旗、亲戚称谓计算等生活实用工具',
    iconSvg: 'life',
    color: '#13C2C2',
    children: [
      { name: 'BMI 计算', desc: '根据身高体重计算身体质量指数', path: '/tools/life/bmi', icon: 'bmi' },
      { name: '血压范围', desc: '输入血压值分析分类与健康建议', path: '/tools/life/blood-pressure', icon: 'heart' },
      { name: '日历', desc: '公历农历同步，节假日与二十四节气标注', path: '/tools/life/calendar', icon: 'calendar' },
      { name: '贷款计算', desc: '房贷计算器，支持等额本息与等额本金', path: '/tools/life/loan', icon: 'money' },
      { name: '车牌归属', desc: '全国车牌前缀归属地查询', path: '/tools/life/car-number', icon: 'car' },
      { name: '身份证查询', desc: '校验身份证并提取性别年龄生日等信息', path: '/tools/life/idcard', icon: 'idcard' },
      { name: '历史朝代', desc: '中国历代王朝时间轴查询', path: '/tools/life/history', icon: 'history' },
      { name: '历代帝王', desc: '朝代与帝王树形结构查询', path: '/tools/life/emperor', icon: 'crown' },
      { name: '区号查询', desc: '全球国家电话区号与时间差查询', path: '/tools/life/area-code', icon: 'phone' },
      { name: '域名后缀', desc: '国家域名缩写与国际电话区号查询', path: '/tools/life/area-domain', icon: 'globe' },
      { name: '国旗', desc: '各国 Unicode 国旗 Emoji 一键复制', path: '/tools/life/flag', icon: 'flag' },
      { name: '亲戚称谓', desc: '自然语言输入亲属关系链输出标准称谓', path: '/tools/life/relationship', icon: 'family' }
    ]
  },
  {
    name: 'Other',
    path: '/tools/other',
    title: '其它',
    desc: '提供可视化 API 调试、Cron 表达式生成、抛硬币抽奖等趣味工具，以及 HTTP 状态码与方法、ASCII 字符、端口事件、UA 解析等开发文档速查功能',
    iconSvg: 'other',
    color: '#FAAD14',
    children: [
      { name: 'API 调试', desc: '批量数据驱动的接口链式执行，支持变量传递', path: '/tools/other/api', icon: 'api' },
      { name: 'Cron 表达式', desc: '可视化配置定时任务字段，实时预览执行时间', path: '/tools/other/cron', icon: 'timer' },
      { name: '抛硬币', desc: '随机抛硬币模拟器，统计正反面概率', path: '/tools/other/coin-flip', icon: 'coin' },
      { name: '抽奖', desc: '自定义奖项的年会抽奖系统', path: '/tools/other/lottery', icon: 'gift' },
      { name: '世界时钟', desc: '多城市实时时间，支持拖拽排序与搜索添加', path: '/tools/other/world-clock', icon: 'globe' },
      { name: 'HTTP 状态码', desc: '1xx 到 5xx 全部状态码及中文说明', path: '/tools/other/http-status', icon: 'http' },
      { name: 'HTTP 方法', desc: '标准及 WebDAV 扩展 HTTP 方法说明', path: '/tools/other/http-method', icon: 'code' },
      { name: '扩展 ASCII', desc: 'Latin-1 特殊字符的 Unicode 与 HTML 实体', path: '/tools/other/eascii', icon: 'character' },
      { name: '键盘符号', desc: '编程符号中英文名称对照表', path: '/tools/other/keyboard-symbol', icon: 'keyboard' },
      { name: 'TCP/UDP 端口', desc: '常用端口与服务说明速查', path: '/tools/other/tcp-udp', icon: 'server' },
      { name: 'JS 事件', desc: '常见 DOM 与浏览器事件分类整理', path: '/tools/other/js-events', icon: 'event' },
      { name: 'User-Agent', desc: '主流浏览器典型 UA 字符串速查', path: '/tools/other/user-agent', icon: 'browser' },
      { name: '特殊符号', desc: '符号中英文俗称与标准名称对照', path: '/tools/other/special-symbol', icon: 'symbol' },
      { name: 'Word 快捷键', desc: 'Word 常用快捷键查询，支持双平台', path: '/tools/other/word-shortcut', icon: 'word' },
      { name: 'Excel 快捷键', desc: 'Excel 常用快捷键查询', path: '/tools/other/excel-shortcut', icon: 'excel' },
      { name: 'IP 查询', desc: '查询公网 IP 地理位置与运营商信息', path: '/tools/other/ip-query', icon: 'location' },
      { name: 'DNS 查询', desc: '国内外主流公共 DNS 服务器清单', path: '/tools/other/dns', icon: 'network' }
    ]
  }
]

// 首页菜单项
export const homeItem = {
  name: 'Home',
  path: '/home',
  title: '首页',
  iconSvg: 'home'
}

// 我的收藏菜单项
export const favoriteItem = {
  name: 'Favorites',
  path: '/favorites',
  title: '我的收藏',
  iconSvg: 'star'
}

// 理财分组下的模块（与工具集平级的独立分组）
// todo: true 表示规划中的占位模块，侧边栏显示 TODO 徽标，页面显示敬请期待
const financeCategories = [
  {
    name: 'Fund',
    path: '/finance/fund',
    title: '基金',
    desc: '录入当前持仓份额与成本，盘中实时估值与收益计算，支持历史净值走势分析',
    iconSvg: 'fund',
    color: '#F5222D'
  },
  {
    name: 'Gold',
    path: '/finance/gold',
    title: '黄金',
    desc: '实时金价行情与走势',
    iconSvg: 'gold',
    color: '#FAAD14',
    todo: true
  }
]

// 我的代办菜单项
export const todoItem = {
  name: 'Todo',
  path: '/todo',
  title: '我的代办',
  iconSvg: 'todo'
}

// 设置菜单项
export const settingsItem = {
  name: 'Settings',
  path: '/settings',
  title: '设置',
  iconSvg: 'settings'
}

// 版本菜单项
export const versionItem = {
  name: 'Version',
  path: '/version',
  title: '版本',
  iconSvg: 'version'
}

// 问题反馈菜单项
export const feedbackItem = {
  name: 'Feedback',
  path: '/feedback',
  title: '问题反馈',
  iconSvg: 'feedback'
}

// 搜索列表
export const searchItems = [
  { ...homeItem },
  { ...favoriteItem },
  ...financeCategories.map(t => ({ path: t.path, title: t.title, iconSvg: t.iconSvg })),
  ...toolCategories.map(t => ({
    path: t.path,
    title: t.title + '工具',
    iconSvg: t.iconSvg
  })),
  { ...settingsItem }
]

// 侧边栏组列表（组间可拖拽排序；固定项不在其中）
export const menuGroups = [
  {
    key: 'tools',
    title: '工具集',
    iconSvg: 'tools',
    children: toolCategories
  },
  {
    key: 'finance',
    title: '理财',
    iconSvg: 'finance',
    children: financeCategories
  }
]

// 侧边栏工具分类（不含首页，用于二级菜单）
export const sidebarItems = toolCategories

export { toolCategories }
