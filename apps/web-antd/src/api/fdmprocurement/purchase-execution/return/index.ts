import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmProcurementPurchaseExecutionReturnApi {
  export type PostingStatus = 'DRAFT' | 'POSTED';

  export interface PageReq extends PageParam {
    companyId?: string;
    status?: PostingStatus;
  }

  export interface LineSaveReq {
    purchaseOrderLineId: string;
    quantity: number | string;
    warehouseId: string;
  }

  export interface SaveReq {
    documentTime: string;
    expectedVersion?: number;
    id?: string;
    lines: LineSaveReq[];
    purchaseOrderId: string;
    remark?: string;
  }

  export interface TransitionReq {
    expectedPostingVersion: number;
    expectedVersion: number;
    id: string;
    reason?: string;
  }

  export interface Line {
    id: string;
    lineRef: string;
    productId: string;
    productPrice: number | string;
    purchaseOrderLineId: string;
    quantity: number | string;
    requisitionItemId: string;
    sourcingAllocationId: string;
    taxPercent?: number | string;
    taxPrice?: number | string;
    totalPrice: number | string;
    warehouseId: string;
  }

  export interface PurchaseReturn {
    companyId: string;
    documentTime: string;
    id: string;
    lastActorUserId?: string;
    lastEventId?: string;
    lastOccurredAt?: string;
    lastReason?: string;
    lines: Line[];
    no: string;
    postingVersion: number;
    purchaseOrderId: string;
    remark?: string;
    status: PostingStatus;
    supplierId: string;
    version: number;
  }
}

const BASE_URL = '/fdmprocurement/purchase-execution/return';

export function getPurchaseReturnPage(
  params: FdmProcurementPurchaseExecutionReturnApi.PageReq,
) {
  return requestClient.get<
    PageResult<FdmProcurementPurchaseExecutionReturnApi.PurchaseReturn>
  >(`${BASE_URL}/page`, { params });
}

export function getPurchaseReturn(id: string) {
  return requestClient.get<FdmProcurementPurchaseExecutionReturnApi.PurchaseReturn>(
    `${BASE_URL}/get`,
    { params: { id } },
  );
}

export function createPurchaseReturn(
  data: FdmProcurementPurchaseExecutionReturnApi.SaveReq,
) {
  return requestClient.post<string>(`${BASE_URL}/create`, data);
}

export function updatePurchaseReturn(
  data: FdmProcurementPurchaseExecutionReturnApi.SaveReq,
) {
  return requestClient.put<boolean>(`${BASE_URL}/update`, data);
}

export function postPurchaseReturn(
  data: FdmProcurementPurchaseExecutionReturnApi.TransitionReq,
) {
  return requestClient.put<FdmProcurementPurchaseExecutionReturnApi.PurchaseReturn>(
    `${BASE_URL}/post`,
    data,
  );
}

export function reversePurchaseReturn(
  data: FdmProcurementPurchaseExecutionReturnApi.TransitionReq,
) {
  return requestClient.put<FdmProcurementPurchaseExecutionReturnApi.PurchaseReturn>(
    `${BASE_URL}/reverse`,
    data,
  );
}

export function deletePurchaseReturn(id: string) {
  return requestClient.delete<boolean>(`${BASE_URL}/delete`, {
    params: { id },
  });
}

export function exportPurchaseReturn(
  params: FdmProcurementPurchaseExecutionReturnApi.PageReq,
) {
  return requestClient.download(`${BASE_URL}/export-excel`, { params });
}
