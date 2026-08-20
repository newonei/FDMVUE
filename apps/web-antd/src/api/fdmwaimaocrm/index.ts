import type {
  FdmProductSelectionSnapshotRef,
  FdmProductSelectionDataSource as SharedProductSelectionDataSource,
} from '#/api/fdmproduct';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoCrmApi {
  export type FixedMarketType = 'EXPORT';
  export type ModuleKey = 'fdmwaimaocrm';

  export interface ModuleStatus {
    available: boolean;
    blockedCapabilities: string[];
    displayName: string;
    enabledCapabilities: string[];
    fixedMarketType: FixedMarketType;
    moduleKey: ModuleKey;
    stage: string;
  }

  /** 外贸页面只能接收固定 EXPORT 的产品数据源。 */
  export type ProductSelectionDataSource<
    TSnapshot extends FdmProductSelectionSnapshotRef<FixedMarketType> =
      FdmProductSelectionSnapshotRef<FixedMarketType>,
  > = SharedProductSelectionDataSource<FixedMarketType, TSnapshot>;
}

const MODULE_STATUS_URL = '/fdmwaimaocrm/module-status';

/** 获取外贸 CRM 当前可用阶段。 */
export function getFdmWaimaoCrmModuleStatus() {
  return requestClient.get<FdmWaimaoCrmApi.ModuleStatus>(MODULE_STATUS_URL);
}
