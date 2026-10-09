import type { PageParam, PageResult } from '@vben/request';

import type { FdmgongchangStageStockApi } from '#/api/fdmgongchang/stage-stock';

import { requestClient } from '#/api/request';

const BASE = '/fdmgongchang/raw-purchase';

export namespace FdmgongchangRawPurchaseApi {
  export type Decimal = number | string;
  export type DateValue = FdmgongchangStageStockApi.DateValue;
  export type Status =
    | 'CANCELLED'
    | 'CLOSED'
    | 'ORDERED'
    | 'PARTIAL'
    | 'RECEIVED';

  export interface Line {
    amount: Decimal;
    id: number;
    quantity: Decimal;
    rawCategory?: null | string;
    rawMaterialCode: string;
    rawMaterialName: string;
    receivedQuantity: Decimal;
    remainingQuantity: Decimal;
    remark?: null | string;
    unitPrice: Decimal;
  }

  export interface Purchase {
    closeReason?: null | string;
    createTime?: number | string;
    currency: string;
    expectedDate?: DateValue | null;
    id: number;
    lastReceivedAt?: null | number | string;
    lines: Line[];
    operatorName?: null | string;
    orderDate: DateValue;
    purchaseNo: string;
    remark?: null | string;
    status: Status;
    supplierId: string;
    supplierName: string;
    totalAmount: Decimal;
  }

  export interface SaveReq {
    expectedDate?: string;
    id?: number;
    lines: Array<{
      quantity: Decimal;
      rawMaterialCode: string;
      remark?: string;
      unitPrice: Decimal;
    }>;
    orderDate?: string;
    remark?: string;
    supplierId: string;
    supplierName?: string;
  }

  export interface PageReq extends PageParam {
    keyword?: string;
    status?: Status;
  }

  export interface CloseReq {
    id: number;
    reason: string;
  }
}

export function getRawPurchaseMaterials() {
  return requestClient.get<FdmgongchangStageStockApi.RawMaterialOption[]>(
    `${BASE}/raw-materials`,
  );
}

export function getRawPurchasePage(params: FdmgongchangRawPurchaseApi.PageReq) {
  return requestClient.get<PageResult<FdmgongchangRawPurchaseApi.Purchase>>(
    `${BASE}/page`,
    { params },
  );
}

export function getRawPurchase(id: number) {
  return requestClient.get<FdmgongchangRawPurchaseApi.Purchase>(`${BASE}/get`, {
    params: { id },
  });
}

export function createRawPurchase(data: FdmgongchangRawPurchaseApi.SaveReq) {
  return requestClient.post<number>(`${BASE}/create`, data);
}

export function updateRawPurchase(data: FdmgongchangRawPurchaseApi.SaveReq) {
  return requestClient.put<boolean>(`${BASE}/update`, data);
}

export function cancelRawPurchase(data: FdmgongchangRawPurchaseApi.CloseReq) {
  return requestClient.put<boolean>(`${BASE}/cancel`, data);
}

export function closeRawPurchase(data: FdmgongchangRawPurchaseApi.CloseReq) {
  return requestClient.put<boolean>(`${BASE}/close`, data);
}
