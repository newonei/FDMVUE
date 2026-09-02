import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmProcurementPurchaseExecutionReceiptApi {
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

  export interface Receipt {
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

const BASE_URL = '/fdmprocurement/purchase-execution/receipt';

export function getPurchaseReceiptPage(
  params: FdmProcurementPurchaseExecutionReceiptApi.PageReq,
) {
  return requestClient.get<
    PageResult<FdmProcurementPurchaseExecutionReceiptApi.Receipt>
  >(`${BASE_URL}/page`, { params });
}

export function getPurchaseReceipt(id: string) {
  return requestClient.get<FdmProcurementPurchaseExecutionReceiptApi.Receipt>(
    `${BASE_URL}/get`,
    { params: { id } },
  );
}

export function createPurchaseReceipt(
  data: FdmProcurementPurchaseExecutionReceiptApi.SaveReq,
) {
  return requestClient.post<string>(`${BASE_URL}/create`, data);
}

export function updatePurchaseReceipt(
  data: FdmProcurementPurchaseExecutionReceiptApi.SaveReq,
) {
  return requestClient.put<boolean>(`${BASE_URL}/update`, data);
}

export function postPurchaseReceipt(
  data: FdmProcurementPurchaseExecutionReceiptApi.TransitionReq,
) {
  return requestClient.put<FdmProcurementPurchaseExecutionReceiptApi.Receipt>(
    `${BASE_URL}/post`,
    data,
  );
}

export function reversePurchaseReceipt(
  data: FdmProcurementPurchaseExecutionReceiptApi.TransitionReq,
) {
  return requestClient.put<FdmProcurementPurchaseExecutionReceiptApi.Receipt>(
    `${BASE_URL}/reverse`,
    data,
  );
}

export function deletePurchaseReceipt(id: string) {
  return requestClient.delete<boolean>(`${BASE_URL}/delete`, {
    params: { id },
  });
}

export function exportPurchaseReceipt(
  params: FdmProcurementPurchaseExecutionReceiptApi.PageReq,
) {
  return requestClient.download(`${BASE_URL}/export-excel`, { params });
}
