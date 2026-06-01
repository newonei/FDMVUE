import type { Dayjs } from 'dayjs';

import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmdataEcShopDailyApi {
  /** 店铺后台日汇总信息 */
  export interface EcShopDaily {
    id: number; // 主键ID
    statDate?: Dayjs | string; // 统计日期
    platformCode?: string; // 平台编码（如 TMALL/PDD/DOUYIN/JD/XHS，或与字典一致）
    shopId?: string; // 店铺ID（平台或内部；无则空串）
    shopName: string; // 店铺名称
    currency?: string; // 币种
    orderCount?: number; // 订单笔数
    paidOrderCount?: number; // 已支付订单笔数
    realPaidOrderCount?: number; // 真实支付订单数
    brushOrderCount?: number; // 刷单单量
    brushPrincipal?: number; // 刷单本金
    refundOrderCount?: number; // 退款完成订单笔数
    gmvAmount?: number; // 成交额（口径与上游一致）
    paidAmount?: number; // 已支付金额
    realPaidAmount?: number; // 真实支付金额
    refundAmount?: number; // 退款金额
    netSalesAmount?: number; // 净销售额（服务端：金额计算基数 − 退款金额 − 刷单本金；淘宝/抖音基数为 GMV，创建/更新勿传）
    realNetSalesAmount?: number; // 真实净销售额（同净销售额）
    visitorCount?: number; // 访客数
    pageViewCount?: number; // 浏览量
    buyerCount?: number; // 成交买家数
    realBuyerCount?: number; // 真实成交买家数
    marketingCost?: number; // 营销花费
    remark?: string; // 备注
    detailPayload?: Record<string, any>; // 平台明细字段
    rawPayload?: any; // 平台原始数据
    createTime?: string;
  }

  /** 店铺后台日汇总平台扩展详情 */
  export interface EcShopDailyPlatformDetail {
    platformCode?: string;
    tableName?: string;
    detail?: Record<string, any>;
  }

  export interface EcShopDailyShopOption {
    label?: string;
    shopId: string;
    shopName: string;
  }

  export interface EcShopDailySummaryMetric {
    avgOrderValue?: number;
    brushAmount?: number;
    brushOrderCount?: number;
    brushRatio?: number;
    buyerCount?: number;
    costRatio?: number;
    gmvAmount?: number;
    marketingCost?: number;
    paidAmount?: number;
    paidOrderCount?: number;
    realOrderCount?: number;
    refundBaseAmount?: number;
    refundAmount?: number;
    refundOrderCount?: number;
    refundRatio?: number;
    roi?: number;
    salesAmount?: number;
  }

  export interface EcShopDailySummaryPeriod {
    endDate?: string;
    periodKey: string;
    periodLabel: string;
    startDate?: string;
  }

  export interface EcShopDailySummaryShop {
    channelType?: string;
    costRatio?: number;
    marketingCost?: number;
    platformCode?: string;
    platformLabel?: string;
    salesAmount?: number;
    shopId?: string;
    shopKey: string;
    shopName: string;
  }

  export interface EcShopDailySummaryRow extends EcShopDailySummaryMetric {
    channelType?: string;
    endDate?: string;
    growthRate?: number;
    periodKey: string;
    periodLabel: string;
    platformCode?: string;
    platformLabel?: string;
    salesShare?: number;
    shopId?: string;
    shopKey: string;
    shopName: string;
    startDate?: string;
  }

  export interface EcShopDailySummaryRanking {
    highCostRatio?: EcShopDailySummaryRow[];
    highRefundRatio?: EcShopDailySummaryRow[];
    salesTop?: EcShopDailySummaryRow[];
    zeroSalesWithCost?: EcShopDailySummaryRow[];
  }

  export interface EcShopDailySummary {
    channelTotals?: Record<string, EcShopDailySummaryMetric>;
    dataMaxDate?: string;
    endDate?: string;
    periodType?: string;
    periods: EcShopDailySummaryPeriod[];
    rankings?: EcShopDailySummaryRanking;
    rows: EcShopDailySummaryRow[];
    shops: EcShopDailySummaryShop[];
    startDate?: string;
    totals?: EcShopDailySummaryMetric;
  }
}

/** 查询店铺后台日汇总分页 */
export function getEcShopDailyPage(params: PageParam) {
  return requestClient.get<PageResult<FdmdataEcShopDailyApi.EcShopDaily>>(
    '/fdmdata/ec-shop-daily/page',
    { params },
  );
}

/** 鏌ヨ搴楅摵鍚庡彴鏃ユ眹鎬诲垪琛ㄦ眹鎬?*/
export function getEcShopDailyPageSummary(params: PageParam) {
  return requestClient.get<FdmdataEcShopDailyApi.EcShopDaily>(
    '/fdmdata/ec-shop-daily/page-summary',
    { params },
  );
}

export interface EcShopDailyShopNameOptionsParams {
  keyword?: string;
  limit?: number;
  platformCode?: string;
}

/** 查询店铺名称下拉候选 */
export function getEcShopDailyShopNameOptions(
  params: EcShopDailyShopNameOptionsParams = {},
) {
  return requestClient.get<string[]>(
    '/fdmdata/ec-shop-daily/shop-name-options',
    { params },
  );
}

export type EcShopDailyShopOptionsParams = EcShopDailyShopNameOptionsParams;

/** Query shop ID options from fdm_just_shop */
export function getEcShopDailyShopOptions(
  params: EcShopDailyShopOptionsParams = {},
) {
  return requestClient.get<FdmdataEcShopDailyApi.EcShopDailyShopOption[]>(
    '/fdmdata/ec-shop-daily/shop-options',
    { params },
  );
}

/** 查询店铺后台日汇总详情 */
export function getEcShopDaily(id: number) {
  return requestClient.get<FdmdataEcShopDailyApi.EcShopDaily>(
    `/fdmdata/ec-shop-daily/get?id=${id}`,
  );
}

/** 查询平台扩展详情 */
export function getEcShopDailyPlatformDetail(id: number) {
  return requestClient.get<FdmdataEcShopDailyApi.EcShopDailyPlatformDetail>(
    `/fdmdata/ec-shop-daily/platform-detail?id=${id}`,
  );
}

export interface EcShopDailyPlatformDetailPageParams extends PageParam {
  platformCode: string;
  shopName?: string;
  statDate?: string[];
}

/** 查询平台扩展明细分页 */
export function getEcShopDailyPlatformDetailPage(
  params: EcShopDailyPlatformDetailPageParams,
) {
  return requestClient.get<PageResult<Record<string, any>>>(
    '/fdmdata/ec-shop-daily/platform-detail-page',
    { params },
  );
}

/** 新增店铺后台日汇总（单条，页面表单） */
export interface EcShopDailySummaryParams {
  channelType?: 'ALL' | 'EC' | 'MEDIA' | string;
  hideEmptyPeriod?: boolean;
  periodType?: 'DAY' | 'MONTH' | 'WEEK' | string;
  platformCode?: string;
  shopNames?: string;
  statDate?: string[];
}

/** 店铺经营汇总分析 */
export function getEcShopDailySummary(params: EcShopDailySummaryParams) {
  return requestClient.get<FdmdataEcShopDailyApi.EcShopDailySummary>(
    '/fdmdata/ec-shop-daily/summary',
    { params },
  );
}

/** 导出店铺经营汇总分析 */
export function exportEcShopDailySummary(params: EcShopDailySummaryParams) {
  return requestClient.download('/fdmdata/ec-shop-daily/summary-export-excel', {
    params,
  });
}

export function createEcShopDaily(data: FdmdataEcShopDailyApi.EcShopDaily) {
  return requestClient.post('/fdmdata/ec-shop-daily/create', data);
}

/** 批量创建/覆盖结果（外部系统 JSON 数组） */
export interface EcShopDailyBatchCreateResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
}

/** 批量创建店铺后台日汇总（外部调用，body 为数组） */
export function createEcShopDailyBatch(
  items: FdmdataEcShopDailyApi.EcShopDaily[],
) {
  return requestClient.post<EcShopDailyBatchCreateResult>(
    '/fdmdata/ec-shop-daily/create-batch',
    items,
  );
}

/** 修改店铺后台日汇总 */
export function updateEcShopDaily(data: FdmdataEcShopDailyApi.EcShopDaily) {
  return requestClient.put('/fdmdata/ec-shop-daily/update', data);
}

/** 删除店铺后台日汇总 */
export function deleteEcShopDaily(id: number) {
  return requestClient.delete(`/fdmdata/ec-shop-daily/delete?id=${id}`);
}

/** 批量删除店铺后台日汇总 */
export function deleteEcShopDailyList(ids: number[]) {
  return requestClient.delete(
    `/fdmdata/ec-shop-daily/delete-list?ids=${ids.join(',')}`,
  );
}

/** 导出店铺后台日汇总 */
export function exportEcShopDaily(params: any) {
  return requestClient.download('/fdmdata/ec-shop-daily/export-excel', {
    params,
  });
}

/** 淘宝生意参谋 Excel 导入结果 */
export interface EcShopDailyTaobaoImportResult {
  total: number;
  created: number;
  updated: number;
  skipped: number;
  shopName: string;
}

/** 导入淘宝生意参谋 Excel（第 8 行标题、其后全部有效数据行） */
export function importTaobaoEcShopDailyExcel(
  file: File,
  shopName: string,
  shopId?: string,
) {
  return requestClient.upload<EcShopDailyTaobaoImportResult>(
    '/fdmdata/ec-shop-daily/import-taobao-excel',
    {
      file,
      shopName,
      shopId: shopId ?? '',
    },
  );
}

/** 导入京东商智 Excel（第 1 行标题、其后全部有效数据行） */
export function importJdEcShopDailyExcel(
  file: File,
  shopName: string,
  shopId?: string,
) {
  return requestClient.upload<EcShopDailyTaobaoImportResult>(
    '/fdmdata/ec-shop-daily/import-jd-excel',
    {
      file,
      shopName,
      shopId: shopId ?? '',
    },
  );
}

/** 导入抖音电商经营数据 Excel（成交概览表第 2 行汇总数据） */
export function importDouyinEcShopDailyExcel(
  file: File,
  shopName: string,
  shopId?: string,
) {
  return requestClient.upload<EcShopDailyTaobaoImportResult>(
    '/fdmdata/ec-shop-daily/import-douyin-excel',
    {
      file,
      shopName,
      shopId: shopId ?? '',
    },
  );
}
