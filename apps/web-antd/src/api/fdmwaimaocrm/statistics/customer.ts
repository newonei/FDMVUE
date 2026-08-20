import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmStatisticsCustomerApi {
  /** 客户统计请求 */
  export interface CustomerSummaryReqVO {
    times: string[];
    interval: number;
    deptId: number;
    userId: number;
    userIds: number[];
  }

  /** 客户总量分析(按日期)响应 */
  export interface CustomerSummaryByDateRespVO {
    time: string;
    customerCreateCount: number;
    customerDealCount: number;
  }

  /** 客户总量分析(按用户)响应 */
  export interface CustomerSummaryByUserRespVO {
    ownerUserName: string;
    customerCreateCount: number;
    customerDealCount: number;
    contractPrice: number;
    receivablePrice: number;
  }

  /** 客户跟进次数分析(按日期)响应 */
  export interface FollowUpSummaryByDateRespVO {
    time: string;
    followUpRecordCount: number;
    followUpCustomerCount: number;
  }

  /** 客户跟进次数分析(按用户)响应 */
  export interface FollowUpSummaryByUserRespVO {
    ownerUserName: string;
    followupRecordCount: number;
    followupCustomerCount: number;
  }

  /** 客户跟进方式统计响应 */
  export interface FollowUpSummaryByTypeRespVO {
    followUpType: string;
    followUpRecordCount: number;
  }

  /** 合同摘要信息响应 */
  export interface CustomerContractSummaryRespVO {
    customerName: string;
    contractName: string;
    totalPrice: number;
    receivablePrice: number;
    customerType: string;
    customerSource: string;
    ownerUserName: string;
    creatorUserName: string;
    createTime: Date;
    orderDate: Date;
  }

  /** 客户公海分析(按日期)响应 */
  export interface PoolSummaryByDateRespVO {
    time: string;
    customerPutCount: number;
    customerTakeCount: number;
  }

  /** 客户公海分析(按用户)响应 */
  export interface PoolSummaryByUserRespVO {
    ownerUserName: string;
    customerPutCount: number;
    customerTakeCount: number;
  }

  /** 客户成交周期(按日期)响应 */
  export interface CustomerDealCycleByDateRespVO {
    time: string;
    customerDealCycle: number;
  }

  /** 客户成交周期(按用户)响应 */
  export interface CustomerDealCycleByUserRespVO {
    ownerUserName: string;
    customerDealCycle: number;
    customerDealCount: number;
  }

  /** 客户成交周期(按地区)响应 */
  export interface CustomerDealCycleByAreaRespVO {
    areaName: string;
    customerDealCycle: number;
    customerDealCount: number;
  }

  /** 客户成交周期(按产品)响应 */
  export interface CustomerDealCycleByProductRespVO {
    productName: string;
    customerDealCycle: number;
    customerDealCount: number;
  }
}

export function getDatas(activeTabName: any, params: any) {
  switch (activeTabName) {
    case 'conversionStat': {
      return getContractSummary(params);
    }
    case 'customerSummary': {
      return getCustomerSummaryByUser(params);
    }
    case 'dealCycleByArea': {
      return getCustomerDealCycleByArea(params);
    }
    case 'dealCycleByProduct': {
      return getCustomerDealCycleByProduct(params);
    }
    case 'dealCycleByUser': {
      return getCustomerDealCycleByUser(params);
    }
    case 'followUpSummary': {
      return getFollowUpSummaryByUser(params);
    }
    case 'followUpType': {
      return getFollowUpSummaryByType(params);
    }
    case 'poolSummary': {
      return getPoolSummaryByUser(params);
    }
    default: {
      return [];
    }
  }
}

export function getChartDatas(activeTabName: any, params: any) {
  switch (activeTabName) {
    case 'conversionStat': {
      return getCustomerSummaryByDate(params);
    }
    case 'customerSummary': {
      return getCustomerSummaryByDate(params);
    }
    case 'dealCycleByArea': {
      return getCustomerDealCycleByArea(params);
    }
    case 'dealCycleByProduct': {
      return getCustomerDealCycleByProduct(params);
    }
    case 'dealCycleByUser': {
      return getCustomerDealCycleByUser(params);
    }
    case 'followUpSummary': {
      return getFollowUpSummaryByDate(params);
    }
    case 'followUpType': {
      return getFollowUpSummaryByType(params);
    }
    case 'poolSummary': {
      return getPoolSummaryByDate(params);
    }
    default: {
      return [];
    }
  }
}

/** 客户总量分析(按日期) */
export function getCustomerSummaryByDate(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryByDateRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-customer-summary-by-date', {
    params,
  });
}

/** 客户总量分析(按用户) */
export function getCustomerSummaryByUser(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryByUserRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-customer-summary-by-user', {
    params,
  });
}

/** 客户跟进次数分析(按日期) */
export function getFollowUpSummaryByDate(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.FollowUpSummaryByDateRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-follow-up-summary-by-date', {
    params,
  });
}

/** 客户跟进次数分析(按用户) */
export function getFollowUpSummaryByUser(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.FollowUpSummaryByUserRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-follow-up-summary-by-user', {
    params,
  });
}

/** 获取客户跟进方式统计数 */
export function getFollowUpSummaryByType(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.FollowUpSummaryByTypeRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-follow-up-summary-by-type', {
    params,
  });
}

/** 合同摘要信息(客户转化率页面) */
export function getContractSummary(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.CustomerContractSummaryRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-contract-summary', { params });
}

/** 获取客户公海分析(按日期) */
export function getPoolSummaryByDate(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.PoolSummaryByDateRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-pool-summary-by-date', { params });
}

/** 获取客户公海分析(按用户) */
export function getPoolSummaryByUser(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.PoolSummaryByUserRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-pool-summary-by-user', { params });
}

/** 获取客户成交周期(按日期) */
export function getCustomerDealCycleByDate(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.CustomerDealCycleByDateRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-customer-deal-cycle-by-date', {
    params,
  });
}

/** 获取客户成交周期(按用户) */
export function getCustomerDealCycleByUser(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.CustomerDealCycleByUserRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-customer-deal-cycle-by-user', {
    params,
  });
}

/** 获取客户成交周期(按地区) */
export function getCustomerDealCycleByArea(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.CustomerDealCycleByAreaRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-customer-deal-cycle-by-area', {
    params,
  });
}

/** 获取客户成交周期(按产品) */
export function getCustomerDealCycleByProduct(
  params: FdmWaimaoCrmStatisticsCustomerApi.CustomerSummaryReqVO,
) {
  return requestClient.get<
    FdmWaimaoCrmStatisticsCustomerApi.CustomerDealCycleByProductRespVO[]
  >('/fdmwaimaocrm/statistics-customer/get-customer-deal-cycle-by-product', {
    params,
  });
}
