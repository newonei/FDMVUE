import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmContractConfigApi {
  /** 合同配置信息 */
  export interface Config {
    notifyEnabled?: boolean;
    notifyDays?: number;
  }
}

/** 获取合同配置 */
export function getContractConfig() {
  return requestClient.get<FdmWaimaoCrmContractConfigApi.Config>(
    '/fdmwaimaocrm/contract-config/get',
  );
}

/** 更新合同配置 */
export function saveContractConfig(data: FdmWaimaoCrmContractConfigApi.Config) {
  return requestClient.put('/fdmwaimaocrm/contract-config/save', data);
}
