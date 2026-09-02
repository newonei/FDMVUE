import type { PageParam, PageResult } from '@vben/request';

import type { WmsShipmentOrderDetailApi } from './detail';

import { requestClient } from '#/api/request';

export namespace WmsShipmentOrderApi {
  /** Java Long may be serialized as a decimal string once it exceeds JS safe range. */
  export type JavaLong = number | string;
  export type ReservationAttemptStatus = 'CONSUMED' | 'HANDED_OFF';

  /** WMS 出库单 */
  export interface ShipmentOrder {
    id?: JavaLong;
    no?: string;
    type?: number;
    orderTime?: string;
    status?: number;
    bizOrderNo?: string;
    merchantId?: number;
    merchantName?: string;
    remark?: string;
    warehouseId?: number;
    warehouseName?: string;
    totalQuantity?: number;
    totalPrice?: number;
    /** 由外贸发货库存预留交接生成；此类单据禁止浏览器修改或逐单完成。 */
    reservationBacked?: boolean;
    reservationAttemptStatus?: ReservationAttemptStatus;
    /** 交接时冻结的版本，也是整批完成命令的 CAS 版本。 */
    reservationVersionAtHandoff?: number;
    consumedAt?: null | string;
    details?: WmsShipmentOrderDetailApi.ShipmentOrderDetail[];
    createTime?: Date;
    creator?: string;
    creatorName?: string;
    updateTime?: Date;
    updater?: string;
    updaterName?: string;
  }

  /** 浏览器只提交定位/CAS/幂等身份，不能提交仓库、SKU、库存或数量事实。 */
  export interface ReservationBackedCompleteReq {
    expectedReservationVersion: number;
    idempotencyKey: string;
    /** Always normalized to a canonical decimal string before submission. */
    shipmentOrderId: string;
  }

  /** 服务端整批完成同一 reservation attempt 后返回的最小可信回执。 */
  export interface ReservationBackedCompleteResp {
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

export function getShipmentOrderPage(params: PageParam) {
  return requestClient.get<PageResult<WmsShipmentOrderApi.ShipmentOrder>>(
    '/wms/shipment-order/page',
    { params },
  );
}

export function getShipmentOrder(id: WmsShipmentOrderApi.JavaLong) {
  return requestClient.get<WmsShipmentOrderApi.ShipmentOrder>(
    `/wms/shipment-order/get?id=${id}`,
  );
}

export function getShipmentOrderDetailListByOrderId(
  orderId: WmsShipmentOrderApi.JavaLong,
) {
  return requestClient.get<WmsShipmentOrderDetailApi.ShipmentOrderDetail[]>(
    `/wms/shipment-order-detail/list-by-order-id?orderId=${orderId}`,
  );
}

export function createShipmentOrder(data: WmsShipmentOrderApi.ShipmentOrder) {
  return requestClient.post('/wms/shipment-order/create', data);
}

export function updateShipmentOrder(data: WmsShipmentOrderApi.ShipmentOrder) {
  return requestClient.put('/wms/shipment-order/update', data);
}

export function completeShipmentOrder(id: WmsShipmentOrderApi.JavaLong) {
  return requestClient.put(`/wms/shipment-order/complete?id=${id}`);
}

/** 原子完成一个预留 attempt 的全部仓库出库单。 */
export function completeReservationBackedShipmentOrders(
  data: WmsShipmentOrderApi.ReservationBackedCompleteReq,
) {
  return requestClient.put<WmsShipmentOrderApi.ReservationBackedCompleteResp>(
    '/wms/shipment-order/complete-reservation-backed',
    data,
  );
}

export function cancelShipmentOrder(id: WmsShipmentOrderApi.JavaLong) {
  return requestClient.put(`/wms/shipment-order/cancel?id=${id}`);
}

export function deleteShipmentOrder(id: WmsShipmentOrderApi.JavaLong) {
  return requestClient.delete(`/wms/shipment-order/delete?id=${id}`);
}

export function exportShipmentOrder(params: any) {
  return requestClient.download('/wms/shipment-order/export-excel', { params });
}
