import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmCustomerPoolConfigApi {
  /** 客户公海规则设置 */
  export interface CustomerPoolConfig {
    enabled?: boolean;
    contactExpireDays?: number;
    dealExpireDays?: number;
    notifyEnabled?: boolean;
    notifyDays?: number;
  }
}

/** 获取客户公海规则设置 */
export function getCustomerPoolConfig() {
  return requestClient.get<FdmWaimaoCrmCustomerPoolConfigApi.CustomerPoolConfig>(
    '/fdmwaimaocrm/customer-pool-config/get',
  );
}

/** 更新客户公海规则设置 */
export function saveCustomerPoolConfig(
  data: FdmWaimaoCrmCustomerPoolConfigApi.CustomerPoolConfig,
) {
  return requestClient.put('/fdmwaimaocrm/customer-pool-config/save', data);
}
