import { requestClient } from '#/api/request';

export namespace FdmNeimaoCrmCustomerPoolConfigApi {
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
  return requestClient.get<FdmNeimaoCrmCustomerPoolConfigApi.CustomerPoolConfig>(
    '/fdmneimaocrm/customer-pool-config/get',
  );
}

/** 更新客户公海规则设置 */
export function saveCustomerPoolConfig(
  data: FdmNeimaoCrmCustomerPoolConfigApi.CustomerPoolConfig,
) {
  return requestClient.put('/fdmneimaocrm/customer-pool-config/save', data);
}
