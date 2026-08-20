import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmStatisticsPerformanceTargetApi {
  /** 业绩目标完成情况请求 */
  export interface PerformanceTargetReqVO {
    deptId: number;
    userId?: number;
    year: number;
    bizType: number;
  }

  /** 业绩目标完成情况响应 */
  export interface PerformanceTargetRespVO {
    month: number;
    targetPrice: number;
    currentPrice: number;
    completionRate: number;
  }
}

/** 获得业绩目标完成情况 */
export function getPerformanceTargetSummary(
  params: FdmWaimaoCrmStatisticsPerformanceTargetApi.PerformanceTargetReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsPerformanceTargetApi.PerformanceTargetRespVO[]
  >(
    '/fdmwaimaocrm/statistics-performance-target/get-performance-target-summary',
    {
      params,
    },
  );
}
