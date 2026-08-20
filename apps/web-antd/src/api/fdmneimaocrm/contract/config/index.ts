import { requestClient } from '#/api/request';

export namespace FdmNeimaoCrmContractConfigApi {
  /** 合同配置信息 */
  export interface Config {
    notifyEnabled?: boolean;
    notifyDays?: number;
  }
}

/** 获取合同配置 */
export function getContractConfig() {
  return requestClient.get<FdmNeimaoCrmContractConfigApi.Config>(
    '/fdmneimaocrm/contract-config/get',
  );
}

/** 更新合同配置 */
export function saveContractConfig(data: FdmNeimaoCrmContractConfigApi.Config) {
  return requestClient.put('/fdmneimaocrm/contract-config/save', data);
}
