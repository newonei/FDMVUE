import { requestClient } from '#/api/request';

export namespace FdmProductApi {
  export type ModuleKey = 'fdmproduct';

  export interface ModuleStatus {
    available: boolean;
    blockedCapabilities: string[];
    displayName: string;
    enabledCapabilities: string[];
    fixedMarketType?: null;
    moduleKey: ModuleKey;
    stage: string;
  }
}

const MODULE_STATUS_URL = '/fdmproduct/module-status';

/** 获取共享产品中心当前可用阶段；本批唯一产品中心 HTTP 契约。 */
export function getFdmProductModuleStatus() {
  return requestClient.get<FdmProductApi.ModuleStatus>(MODULE_STATUS_URL);
}

export type {
  FdmProductMarketType,
  FdmProductSelectionDataSource,
  FdmProductSelectionIdentity,
  FdmProductSelectionOption,
  FdmProductSelectionPageParams,
  FdmProductSelectionPresentation,
  FdmProductSelectionRef,
  FdmProductSelectionSnapshotRef,
  FdmProductSelectionValidationIssue,
  FdmProductSelectionValidationResult,
  FdmProductSelectionVersionToken,
} from './product-selection';
