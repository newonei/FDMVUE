import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmStatisticsPerformanceApi {
  /** 员工业绩统计请求 */
  export interface PerformanceReqVO {
    times: string[];
    deptId: number;
    userId?: number;
  }

  /** 员工业绩统计响应 */
  export interface PerformanceRespVO {
    time: string;
    currentMonthCount: number;
    lastMonthCount: number;
    lastYearCount: number;
  }

  /** 员工业绩合同汇总响应 */
  export interface PerformanceSummaryRespVO {
    time: string;
    contractCount: number;
    contractPrice: number;
    receivablePrice: number;
    unreceivedPrice: number;
  }
}

/** 员工获得合同金额统计 */
export function getContractPricePerformance(
  params: FdmWaimaoCrmStatisticsPerformanceApi.PerformanceReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsPerformanceApi.PerformanceRespVO[]
  >('/fdmwaimaocrm/statistics-performance/get-contract-price-performance', {
    params,
  });
}

/** 员工获得回款统计 */
export function getReceivablePricePerformance(
  params: FdmWaimaoCrmStatisticsPerformanceApi.PerformanceReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsPerformanceApi.PerformanceRespVO[]
  >('/fdmwaimaocrm/statistics-performance/get-receivable-price-performance', {
    params,
  });
}

/** 员工获得签约合同数量统计 */
export function getContractCountPerformance(
  params: FdmWaimaoCrmStatisticsPerformanceApi.PerformanceReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsPerformanceApi.PerformanceRespVO[]
  >('/fdmwaimaocrm/statistics-performance/get-contract-count-performance', {
    params,
  });
}

/** 获得合同汇总表 */
export function getContractSummary(
  params: FdmWaimaoCrmStatisticsPerformanceApi.PerformanceReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsPerformanceApi.PerformanceSummaryRespVO[]
  >('/fdmwaimaocrm/statistics-performance/get-contract-summary', { params });
}
