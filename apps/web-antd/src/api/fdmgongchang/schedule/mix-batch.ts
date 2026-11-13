import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi } from '#/api/fdmgongchang/stage-stock';

import { factoryHeaders } from '#/api/fdmgongchang/factory';
import { requestClient } from '#/api/request';

export interface MixBatchRequest {
  productionOrderIds: number[];
  workDate: string;
  workerIds: number[];
  note?: string;
}
/** 同配方、同颜色、同板材规格合并成的发泡批次，下发时一个批次一条任务。 */
export interface MixBatchGroup {
  groupKey: string;
  recipeCode?: null | string;
  color?: null | string;
  boardName?: null | string;
  boardAttrs?: FdmgongchangStageStockApi.ItemAttrs | null;
  rowKeys: string[];
  orderCount: number;
  boards: number;
  recipeBatches?: null | number;
  mixPlan?: FdmgongchangScheduleApi.MixPlan | null;
  basis?: null | string;
}
export interface MixBatchRow {
  rowKey: string;
  groupKey?: null | string;
  orderId: number;
  orderNo: string;
  itemId: number;
  productCode?: null | string;
  productName: string;
  side?: null | string;
  color?: null | string;
  layerThickness?: null | number;
  recipeCode?: null | string;
  boardAttrs?: FdmgongchangStageStockApi.ItemAttrs | null;
  requiredBoards: number;
  existingMixBoards: number;
  quantity: number;
  status: 'BLOCKED' | 'READY' | 'SKIPPED';
  reason?: null | string;
  warnings: string[];
}
export interface MixBatchPreview {
  previewKey: string;
  rows: MixBatchRow[];
  groups?: MixBatchGroup[];
  totalBoards: number;
  readyCount: number;
  warnings: string[];
}
export interface MixBatchRelease {
  scheduleId: number;
  scheduleNo: string;
  taskIds: number[];
  taskCount: number;
  totalBoards: number;
  reused: boolean;
  warnings: string[];
}
const base = '/fdmgongchang/schedule/mix-batch';
export function previewMixBatch(data: MixBatchRequest) {
  return requestClient.post<MixBatchPreview>(`${base}/preview`, data, {
    headers: factoryHeaders(),
  });
}
export function releaseMixBatch(
  data: MixBatchRequest & {
    previewKey: string;
    requestId: string;
    rowKeys: string[];
  },
) {
  return requestClient.post<MixBatchRelease>(`${base}/release`, data, {
    headers: factoryHeaders(),
  });
}
