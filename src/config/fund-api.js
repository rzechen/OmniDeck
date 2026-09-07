// 基金数据源三方接口统一配置
// 接口均来自公开 web 页面所用的数据地址，存在失效可能；
// 地址变更或替换数据源时只需修改本文件，业务代码不感知。

export const FUND_API = {
  /* ============ 新浪财经：实时估值 ============ */
  // 盘中每分钟估值走势 + 最新净值与涨跌幅
  // 参数：symbol=基金代码；返回 result.data：worth/worth_rate/worth_date/networth[]
  sinaEstimate: 'https://stock.finance.sina.com.cn/fundInfo/api/openapi.php/FdFundService.getEstimateNetworthPic',
  sinaReferer: 'https://finance.sina.com.cn',

  /* ============ 东方财富：基金基本信息（移动端 API，轻量） ============ */
  // 参数 FCODE=基金代码；返回 Datas.SHORTNAME（名称）/FTYPE（类型）等
  fundInfo: 'https://fundmobapi.eastmoney.com/FundMApi/FundDetailInformation.ashx?FCODE={code}&deviceid=Wap&plat=Wap&product=EFund&version=6.2.8',

  /* ============ 东方财富：基金档案数据 ============ */
  // 含 fS_name（名称）与 Data_netWorthTrend（全量历史净值走势）
  pingzhong: 'https://fund.eastmoney.com/pingzhongdata/{code}.js',
  emReferer: 'https://fund.eastmoney.com',

  /* ============ 东方财富：基金详情网页（外链兜底） ============ */
  fundDetailPage: 'https://fund.eastmoney.com/{code}.html',

  /* ============ 刷新与缓存策略 ============ */
  // 盘中刷新间隔（毫秒）
  tradingRefresh: 60000,
  // 非交易时段刷新间隔（毫秒）
  idleRefresh: 5 * 60000,
  // 同一基金估值接口缓存有效期（毫秒），避免高频刷新触发风控
  quoteTTL: 45000
}
