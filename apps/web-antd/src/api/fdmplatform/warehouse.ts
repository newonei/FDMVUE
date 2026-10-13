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
  /** 已退给供应商的合格品 / 不合格品数量 */
  returnedAcceptedQuantity?: Decimal;
  returnedExceptionQuantity?: Decimal;
}

/** 作废后保留可查，不再计入库存与合同进度。 */
export interface VoidInfo {
  voidReason?: string;
  voidedAt?: string;
  voidedBy?: number;
}

export interface StockIn extends VoidInfo {
  id: string;
  code: string;
  status: 'RECEIVED' | 'VOIDED';
  /**
   * PRODUCTION 工厂交货的生产入库 / FACTORY_PURCHASE 工厂收货的原料、辅料（不进采购仓库）；
   * 都只能在工厂那边作废，不能在这里作废或退货。
   */
  kind?: 'FACTORY_PURCHASE' | 'PRODUCTION';
  factoryName?: null | string;
  standalone?: boolean;
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

export interface StockOut extends VoidInfo {
  id: string;
  code: string;
  status: 'SHIPPED' | 'VOIDED';
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

/** 流水来源：采购入库、销售出库、作废入库（扣回）、作废出库（加回）、采购退货 */
export type StockTxnAction =
  | 'PURCHASE_RETURN'
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'VOID_STOCK_IN'
  | 'VOID_STOCK_OUT';

export interface StockTxn extends StockProduct {
  id: string;
  type: 'IN' | 'OUT';
  /** 早期流水没有 action，按 type 推断 */
  action?: StockTxnAction;
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

/** ACCEPTED 退合格品（扣库存）/ EXCEPTION 退回不合格品（未进库存，只登记） */
export type ReturnKind = 'ACCEPTED' | 'EXCEPTION';

export interface PurchaseReturnLine extends StockProduct {
  orderLineId: string;
  contractItemId?: string;
  kind: ReturnKind;
  quantity: Decimal;
  unitPrice?: Decimal;
  amount?: Decimal;
}

export interface PurchaseReturn {
  id: string;
  code: string;
  status: 'RETURNED';
  stockInId: string;
  stockInCode: string;
  warehouseId: string;
  warehouseName: string;
  contractId?: string;
  contractCode?: string;
  customerName?: string;
  standalone: boolean;
  orderId: string;
  orderCode: string;
  supplierName?: string;
  currency?: string;
  returnedDate: string;
  reason: string;
  /** 不再补货：退货数量同时取消采购余额，应付减少 */
  noReplacement: boolean;
  remark?: string;
  amount?: Decimal;
  lines: PurchaseReturnLine[];
  createdBy: number;
  createdAt: string;
}

export interface PurchaseReturnCreate {
  idempotencyKey: string;
  stockInId: string;
  returnedDate?: string;
  reason: string;
  noReplacement: boolean;
  remark?: string;
  lines: { kind: ReturnKind; orderLineId: string; quantity: Decimal }[];
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
export function voidStockIn(
  id: string,
  data: { idempotencyKey: string; reason: string },
) {
  return requestClient.post<StockIn>(`${base}/stock-ins/${id}/void`, data);
}
export function voidStockOut(
  id: string,
  data: { idempotencyKey: string; reason: string },
) {
  return requestClient.post<StockOut>(`${base}/stock-outs/${id}/void`, data);
}
export function getPurchaseReturns(
  params: PageParams & { orderId?: string; stockInId?: string },
) {
  return requestClient.get<PageResult<PurchaseReturn>>(
    `${base}/purchase-returns/page`,
    { params },
  );
}
export function createPurchaseReturn(data: PurchaseReturnCreate) {
  return requestClient.post<PurchaseReturn>(`${base}/purchase-returns`, data);
}
