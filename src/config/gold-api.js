// 贵金属数据源三方接口统一配置
// 数据来自黄金价格网（www.huangjinjiage.cn）页面所用行情脚本（新浪 hq_str 风格，GBK 编码），
// 无官方文档，字段布局经多品种交叉验证；地址变更或替换数据源时只需修改本文件，业务代码不感知。

export const GOLD_API = {
  /* ============ 黄金价格网：全量行情脚本 ============ */
  // 返回 var hq_str_品种="逗号分隔字段" 的 JS 脚本（GBK 编码，中文字段不可用，
  // 解析仅取数字/ASCII 字段，品种中文名以本地 GOLD_VARIETIES 为准）
  quote: 'http://res.huangjinjiage.com.cn/jin.js',
  referer: 'http://www.huangjinjiage.cn/',

  /* ============ 刷新与缓存策略 ============ */
  // 自动刷新间隔（毫秒）
  refresh: 30000,
  // 同一行情接口缓存有效期（毫秒），避免高频刷新触发风控
  quoteTTL: 20000
}

/*
 * 品种字段布局（索引从 0 计，已交叉验证）：
 *  hf_*  外盘现货/期货：[0]最新 [2]买 [3]卖 [4]最高 [5]最低 [6]时间 [7]昨收 [8]今开 [12]日期
 *  gds_* 上金所递延：    [0]最新 [2]买 [3]卖 [4]最高 [5]最低 [6]时间 [7]昨收 [8]今开 [12]日期
 *  nf_*  国内期货主力：  [0]名称 [1]时间 [2]今开 [3]最高 [4]最低 [5]昨收 [8]最新 [10]昨结 [17]日期
 *  SGE_* 上金所现货：    [3]最新 [5]最高 [8]最低 [16]时间 [17]涨跌幅（接口直给，昨收由涨跌幅反推）
 *  USDCNY 美元人民币：   [1]现汇买价（用于盎司→克人民币换算）
 */
export const GOLD_VARIETIES = [
  { key: 'hf_XAU', name: '伦敦金', sub: '现货黄金', unit: '美元/盎司', digits: 2, layout: 'hf', group: '国际现货' },
  { key: 'hf_XAG', name: '伦敦银', sub: '现货白银', unit: '美元/盎司', digits: 3, layout: 'hf', group: '国际现货' },
  { key: 'hf_GC', name: '纽约黄金', sub: 'COMEX 期货', unit: '美元/盎司', digits: 2, layout: 'hf', group: '外盘期货' },
  { key: 'hf_SI', name: '纽约白银', sub: 'COMEX 期货', unit: '美元/盎司', digits: 3, layout: 'hf', group: '外盘期货' },
  { key: 'hf_XPT', name: '铂金', sub: '现货铂金', unit: '美元/盎司', digits: 2, layout: 'hf', group: '外盘期货' },
  { key: 'hf_XPD', name: '钯金', sub: '现货钯金', unit: '美元/盎司', digits: 2, layout: 'hf', group: '外盘期货' },
  { key: 'gds_AUTD', name: '黄金 T+D', sub: 'Au(T+D) 递延', unit: '元/克', digits: 2, layout: 'gds', group: '上海黄金交易所' },
  { key: 'gds_AGTD', name: '白银 T+D', sub: 'Ag(T+D) 递延', unit: '元/千克', digits: 0, layout: 'gds', group: '上海黄金交易所' },
  { key: 'SGE_AU9999', name: '黄金 99.99', sub: 'Au99.99', unit: '元/克', digits: 2, layout: 'sge', group: '上海黄金交易所' },
  { key: 'SGE_AU9995', name: '黄金 99.95', sub: 'Au99.95', unit: '元/克', digits: 2, layout: 'sge', group: '上海黄金交易所' },
  { key: 'nf_AU0', name: '沪金主力', sub: 'AU240x 连续', unit: '元/克', digits: 2, layout: 'nf', group: '国内期货' },
  { key: 'nf_AG0', name: '沪银主力', sub: 'AG240x 连续', unit: '元/千克', digits: 0, layout: 'nf', group: '国内期货' }
]

export const GOLD_GROUPS = ['国际现货', '外盘期货', '上海黄金交易所', '国内期货']

// 盎司 → 克换算系数（金衡盎司）
export const OZ_TO_GRAM = 31.1034768
