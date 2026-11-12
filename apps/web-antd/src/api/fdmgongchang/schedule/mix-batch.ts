import type { FdmgongchangStageStockApi } from '#/api/fdmgongchang/stage-stock';

import { factoryHeaders } from '#/api/fdmgongchang/factory';
import { requestClient } from '#/api/request';

export interface MixBatchRequest {
  productionOrderIds: number[];
  workDate: string;
  workerIds: number[];
  note?: string;
}
export interface MixBatchRow {
  rowKey: string;
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
