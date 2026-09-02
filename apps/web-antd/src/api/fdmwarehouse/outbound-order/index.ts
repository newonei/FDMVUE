import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWarehouseOutboundOrderApi {
  export type ReservationAttemptStatus = 'CONSUMED' | 'HANDED_OFF';

  export interface OutboundOrderLine {
    id?: string;
    outboundOrderId?: string;
    productId?: string;
    quantity: number;
    skuId?: string;
    unit?: string;
  }

  export interface OutboundOrder {
    bizOrderNo?: string;
    consumedAt?: null | string;
    createTime?: string;
    details?: OutboundOrderLine[];
    outboundOrderId?: string;
    outboundOrderNo?: string;
    orderTime?: string;
    remark?: string;
    reservationAttemptStatus?: ReservationAttemptStatus;
    reservationBacked?: boolean;
    reservationVersionAtHandoff?: number;
    status?: number;
    totalPrice?: number;
    totalQuantity?: number;
    warehouseId?: string;
    warehouseName?: string;
  }

  export interface CompleteRequest {
    expectedReservationVersion: number;
    idempotencyKey: string;
    outboundOrderId: string;
  }

  export interface CompleteResponse {
    attemptNo: number;
    consumedAt: string;
    inventoryCount: number;
    lineCount: number;
    newlyCreated: boolean;
    orderCount: number;
    reservationId: string;
    resultVersion: number;
  }
}

const BASE_URL = '/fdmwarehouse/outbound-order';

export function getOutboundOrderPage(params: PageParam) {
  return requestClient.get<
    PageResult<FdmWarehouseOutboundOrderApi.OutboundOrder>
  >(`${BASE_URL}/page`, { params });
}

export function getOutboundOrder(outboundOrderId: string) {
  return requestClient.get<FdmWarehouseOutboundOrderApi.OutboundOrder>(
    `${BASE_URL}/get`,
    { params: { outboundOrderId } },
  );
}

export function createOutboundOrder(
  data: FdmWarehouseOutboundOrderApi.OutboundOrder,
) {
  return requestClient.post<string>(`${BASE_URL}/create`, data);
}

export function updateOutboundOrder(
  data: FdmWarehouseOutboundOrderApi.OutboundOrder,
) {
  return requestClient.put<boolean>(`${BASE_URL}/update`, data);
}

export function deleteOutboundOrder(outboundOrderId: string) {
  return requestClient.delete<boolean>(`${BASE_URL}/delete`, {
    params: { outboundOrderId },
  });
}

export function exportOutboundOrder(params: PageParam) {
  return requestClient.download(`${BASE_URL}/export`, { params });
}

/** Atomically consumes the reservation attempt backing the outbound batch. */
export function completeOutboundOrder(
  data: FdmWarehouseOutboundOrderApi.CompleteRequest,
) {
  return requestClient.put<FdmWarehouseOutboundOrderApi.CompleteResponse>(
    `${BASE_URL}/complete`,
    data,
  );
}
