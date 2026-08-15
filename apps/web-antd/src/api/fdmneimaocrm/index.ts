import type {
  FdmProductSelectionSnapshotRef,
  FdmProductSelectionDataSource as SharedProductSelectionDataSource,
} from '#/api/fdmproduct';

import { requestClient } from '#/api/request';

export namespace FdmNeimaoCrmApi {
  export type FixedMarketType = 'DOMESTIC';
  export type ModuleKey = 'fdmneimaocrm';

  export interface ModuleStatus {
    available: boolean;
    blockedCapabilities: string[];
    displayName: string;
    enabledCapabilities: string[];
    fixedMarketType: FixedMarketType;
    moduleKey: ModuleKey;
    stage: string;
  }

  /** 内贸页面只能接收固定 DOMESTIC 的产品数据源。 */
  export type ProductSelectionDataSource<
    TSnapshot extends FdmProductSelectionSnapshotRef<FixedMarketType> =
      FdmProductSelectionSnapshotRef<FixedMarketType>,
  > = SharedProductSelectionDataSource<FixedMarketType, TSnapshot>;
}

const MODULE_STATUS_URL = '/fdmneimaocrm/module-status';

/** 获取内贸 CRM 当前可用阶段；本批唯一内贸 HTTP 契约。 */
export function getFdmNeimaoCrmModuleStatus() {
  return requestClient.get<FdmNeimaoCrmApi.ModuleStatus>(MODULE_STATUS_URL);
}
