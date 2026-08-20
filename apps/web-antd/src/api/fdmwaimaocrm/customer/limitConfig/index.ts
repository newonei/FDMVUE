import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmCustomerLimitConfigApi {
  /** 客户限制配置 */
  export interface CustomerLimitConfig {
    id?: number;
    type?: number;
    userIds?: string;
    deptIds?: string;
    maxCount?: number;
    dealCountEnabled?: boolean;
  }
}

/** 客户限制配置类型 */
export enum LimitConfType {
  /** 拥有客户数限制 */
  CUSTOMER_QUANTITY_LIMIT = 1,
  /** 锁定客户数限制 */
  CUSTOMER_LOCK_LIMIT = 2,
}

/** 查询客户限制配置列表 */
export function getCustomerLimitConfigPage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmWaimaoCrmCustomerLimitConfigApi.CustomerLimitConfig>
  >('/fdmwaimaocrm/customer-limit-config/page', { params });
}

/** 查询客户限制配置详情 */
export function getCustomerLimitConfig(id: number) {
  return requestClient.get<FdmWaimaoCrmCustomerLimitConfigApi.CustomerLimitConfig>(
    `/fdmwaimaocrm/customer-limit-config/get?id=${id}`,
  );
}

/** 新增客户限制配置 */
export function createCustomerLimitConfig(
  data: FdmWaimaoCrmCustomerLimitConfigApi.CustomerLimitConfig,
) {
  return requestClient.post('/fdmwaimaocrm/customer-limit-config/create', data);
}

/** 修改客户限制配置 */
export function updateCustomerLimitConfig(
  data: FdmWaimaoCrmCustomerLimitConfigApi.CustomerLimitConfig,
) {
  return requestClient.put('/fdmwaimaocrm/customer-limit-config/update', data);
}

/** 删除客户限制配置 */
export function deleteCustomerLimitConfig(id: number) {
  return requestClient.delete(
    `/fdmwaimaocrm/customer-limit-config/delete?id=${id}`,
  );
}
