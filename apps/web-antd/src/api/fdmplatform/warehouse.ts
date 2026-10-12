import type { Decimal, PageResult } from './index';

import { requestClient } from '#/api/request';

const base = '/fdmplatform/v1/warehouse';

export interface StockProduct {
  skuId?: string;
  specVersion?: string;
  productName?: string;
  productCode?: string;
  specification?: string;
  unit?: string;
}

export interface StockInLine extends StockProduct {
  orderLineId: string;
  contractItemId?: string;
  quantity: Decimal;
  acceptedQuantity: Decimal;
  exceptionQuantity: Decimal;
  exceptionReason?: string;
  batchNo?: string;
  unitPrice?: Decimal;
  amount?: Decimal;
}

export interface StockIn {
  id: string;
  code: string;
  status: string;
  warehouseId: string;
  warehouseName: string;
  contractId: string;
  contractCode: string;
  customerName?: string;
  orderId: string;
  orderCode: string;
  supplierName?: string;
  currency?: string;
  receivedDate: string;
  deliveryNo?: string;
  remark?: string;
  directShip: boolean;
  stockOutId?: string;
  stockOutCode?: string;
  amount?: Decimal;
  lines: StockInLine[];
  createdBy: number;
  createdAt: string;
}

export interface StockOutLine extends StockProduct {
  contractItemId: string;
  quantity: Decimal;
  salesUnitPrice?: Decimal;
  unitCost?: Decimal;
  costAmount?: Decimal;
}

export interface StockOut {
  id: string;
  code: string;
  kind: 'DIRECT' | 'SALES';
  warehouseId: string;
  warehouseName: string;
  contractId: string;
  contractCode: string;
  customerName?: string;
  shippedDate: string;
  remark?: string;
  stockInId?: string;
  stockInCode?: string;
  costAmount?: Decimal;
  lines: StockOutLine[];
  createdBy: number;
  createdAt: string;
}

export interface StockBalance extends StockProduct {
  id: string;
  warehouseId: string;
  warehouseName: string;
  onHand: Decimal;
  costAmount: Decimal;
  costKnown: boolean;
  lastInDate?: string;
  lastOutDate?: string;
}

export interface StockTxn extends StockProduct {
  id: string;
  type: 'IN' | 'OUT';
  docKind: string;
  docId: string;
  docCode: string;
  warehouseId: string;
  warehouseName: string;
  stockId: string;
  quantity: Decimal;
  onHandAfter: Decimal;
  unitCost?: Decimal;
  amount?: Decimal;
  contractId?: string;
  contractCode?: string;
  partner?: string;
  occurredOn: string;
  createdAt: string;
  actorId: number;
}

export interface InboundLine {
  contractId: string;
  contractCode: string;
  orderId: string;
  orderCode?: string;
  supplierName?: string;
  orderLineId: string;
  contractItemId: string;
  productName?: string;
  productCode?: string;
  specification?: string;
  unit?: string;
  quantity: Decimal;
  arrivedQuantity: Decimal;
  remainingQuantity: Decimal;
}

export interface OutboundItem {
  contractItemId: string;
  productName?: string;
  productCode?: string;
  specification?: string;
  unit?: string;
  itemQuantity: Decimal;
  shippedQuantity: Decimal;
  remainingQuantity: Decimal;
  onHand?: Decimal;
  method?: string;
}

export interface StockInCreate {
  idempotencyKey: string;
  contractId: string;
  orderId: string;
  warehouseId: string;
  receivedDate?: string;
  deliveryNo?: string;
  remark?: string;
  directShip: boolean;
  lines: {
    acceptedQuantity: Decimal;
    batchNo?: string;
    exceptionReason?: string;
    orderLineId: string;
    quantity: Decimal;
  }[];
}

export interface StockOutCreate {
  idempotencyKey: string;
  contractId: string;
  warehouseId: string;
  shippedDate?: string;
  remark?: string;
  lines: { contractItemId: string; quantity: Decimal }[];
}

interface PageParams {
  keyword?: string;
  pageNo: number;
  pageSize: number;
  warehouseId?: string;
}

export function getStockIns(
  params: PageParams & { contractId?: string; orderId?: string },
) {
  return requestClient.get<PageResult<StockIn>>(`${base}/stock-ins/page`, {
    params,
  });
}
export function createStockIn(data: StockInCreate) {
  return requestClient.post<StockIn>(`${base}/stock-ins`, data);
}
export function getStockOuts(params: PageParams & { contractId?: string }) {
  return requestClient.get<PageResult<StockOut>>(`${base}/stock-outs/page`, {
    params,
  });
}
export function createStockOut(data: StockOutCreate) {
  return requestClient.post<StockOut>(`${base}/stock-outs`, data);
}
export function getStocks(params: {
  inStockOnly?: boolean;
  keyword?: string;
  warehouseId?: string;
}) {
  return requestClient.get<StockBalance[]>(`${base}/stocks`, { params });
}
export function getStockTxns(params: PageParams & { stockId?: string }) {
  return requestClient.get<PageResult<StockTxn>>(`${base}/txns/page`, {
    params,
  });
}
export function getInboundLines(contractId: string, orderId?: string) {
  return requestClient.get<InboundLine[]>(`${base}/inbound-lines`, {
    params: { contractId, orderId },
  });
}
export function getOutboundItems(contractId: string, warehouseId?: string) {
  return requestClient.get<OutboundItem[]>(`${base}/outbound-items`, {
    params: { contractId, warehouseId },
  });
}
